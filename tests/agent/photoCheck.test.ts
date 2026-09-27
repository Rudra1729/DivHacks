import { GrokPhotoChecker, detectImageType, parseVerdict } from '../../src/agent/photoCheck';
import { Place } from '../../src/orchestrator/types';

const place: Place = {
  id: 'apollo',
  name: 'Apollo Theater',
  neighborhood: 'Harlem',
  latitude: 40.81,
  longitude: -73.95,
  radiusMeters: 150,
  baseReward: 2,
  collectionAddress: 'collection1',
  imageUrl: 'https://example.com/apollo.png',
  photoHint: 'The red and white APOLLO sign on W 125th St.',
};

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function grokReplying(content: unknown): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

function checkerWith(fetchFn: jest.Mock, minConfidence?: number): GrokPhotoChecker {
  return new GrokPhotoChecker({
    apiKey: 'key',
    model: 'grok-test',
    endpoint: 'https://grok.test/v1/chat/completions',
    fetchFn: fetchFn as unknown as typeof fetch,
    minConfidence,
  });
}

describe('detectImageType', () => {
  it('recognizes JPEG and PNG from their first bytes', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
    expect(detectImageType(PNG)).toBe('image/png');
  });

  it('returns undefined for anything else', () => {
    expect(detectImageType(Buffer.from('photo-1'))).toBeUndefined();
    expect(detectImageType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('parseVerdict', () => {
  it('reads a well formed verdict, also inside a code fence', () => {
    expect(parseVerdict('{"match": true, "confidence": 0.9, "reason": "marquee visible"}')).toEqual({
      match: true,
      confidence: 0.9,
      reason: 'marquee visible',
    });
    expect(parseVerdict('```json\n{"match": false, "confidence": 0.8, "reason": "a car"}\n```')?.match).toBe(false);
  });

  it.each([
    ['not json'],
    ['[]'],
    ['{"match": "yes", "confidence": 0.9, "reason": "x"}'],
    ['{"match": true, "confidence": 1.5, "reason": "x"}'],
    ['{"match": true, "confidence": -0.1, "reason": "x"}'],
    ['{"match": true, "reason": "x"}'],
    ['{"match": true, "confidence": 0.9}'],
  ])('rejects %s', (text) => {
    expect(parseVerdict(text)).toBeUndefined();
  });

  it('shortens a very long reason', () => {
    const verdict = parseVerdict(JSON.stringify({ match: true, confidence: 0.9, reason: 'x'.repeat(1000) }));
    expect(verdict?.reason.length).toBe(200);
  });
});

describe('GrokPhotoChecker', () => {
  it('passes a confident match', async () => {
    const fetchFn = grokReplying('{"match": true, "confidence": 0.92, "reason": "APOLLO sign visible"}');
    const result = await checkerWith(fetchFn).check({ place, photo: JPEG });
    expect(result.passed).toBe(true);
    expect(result.message).toContain('Grok matched the photo to Apollo Theater (confidence 0.92)');
  });

  it('sends the photo as a data URL next to the place name and hint', async () => {
    const fetchFn = grokReplying('{"match": true, "confidence": 0.9, "reason": "ok"}');
    await checkerWith(fetchFn).check({ place, photo: PNG });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://grok.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('grok-test');
    const [text, image] = body.messages[1].content;
    expect(text.text).toContain('Apollo Theater');
    expect(text.text).toContain('APOLLO sign on W 125th St');
    expect(image.image_url.url).toBe(`data:image/png;base64,${PNG.toString('base64')}`);
  });

  it('blocks a photo Grok says does not match', async () => {
    const fetchFn = grokReplying('{"match": false, "confidence": 0.95, "reason": "this is a parking lot"}');
    const result = await checkerWith(fetchFn).check({ place, photo: JPEG });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('does not show Apollo Theater');
    expect(result.message).toContain('this is a parking lot');
  });

  it('blocks a match below the minimum confidence', async () => {
    const fetchFn = grokReplying('{"match": true, "confidence": 0.5, "reason": "maybe"}');
    const result = await checkerWith(fetchFn, 0.6).check({ place, photo: JPEG });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('not sure');
  });

  it('passes a match exactly at the minimum confidence', async () => {
    const fetchFn = grokReplying('{"match": true, "confidence": 0.7, "reason": "likely"}');
    expect((await checkerWith(fetchFn, 0.7).check({ place, photo: JPEG })).passed).toBe(true);
  });

  it('blocks a format Grok cannot read without calling it', async () => {
    const fetchFn = grokReplying('{"match": true, "confidence": 1, "reason": "ok"}');
    const result = await checkerWith(fetchFn).check({ place, photo: Buffer.from('photo-1') });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('only JPEG or PNG');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['an error status', jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }), 'status 500'],
    ['a network failure', jest.fn().mockRejectedValue(new Error('offline')), 'request failed'],
    ['an unreadable answer', grokReplying('I think so!'), 'unreadable answer'],
    ['a missing answer', grokReplying(undefined), 'unreadable answer'],
  ])('fails closed on %s', async (_label, fetchFn, why) => {
    const result = await checkerWith(fetchFn).check({ place, photo: JPEG });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('could not check the photo');
    expect(result.message).toContain(why);
  });

  it('fails closed when Grok takes too long', async () => {
    const fetchFn = jest.fn().mockImplementation((_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
    );
    const checker = new GrokPhotoChecker({
      apiKey: 'key',
      model: 'grok-test',
      endpoint: 'https://grok.test',
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 10,
    });
    const result = await checker.check({ place, photo: JPEG });
    expect(result.passed).toBe(false);
    expect(result.message).toContain('timed out');
  });
});
