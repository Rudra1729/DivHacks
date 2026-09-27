/**Tests for parsing the GPS trail field of a submission.*/

import { MAX_TRAIL_SAMPLES, parseLocationTrail } from '../../src/validation/locationTrail';

const SAMPLE = { latitude: 40.81034, longitude: -73.95012, accuracy: 12.5, timestamp: 1_700_000_000_000 };

describe('parseLocationTrail', () => {
  it.each([undefined, null, ''])('treats %p as no trail sent', (value) => {
    expect(parseLocationTrail(value)).toEqual({ ok: true, trail: undefined });
  });

  it('parses a JSON string from a multipart form', () => {
    expect(parseLocationTrail(JSON.stringify([SAMPLE, SAMPLE]))).toEqual({ ok: true, trail: [SAMPLE, SAMPLE] });
  });

  it('accepts an array from a JSON body and drops extra fields', () => {
    expect(parseLocationTrail([{ ...SAMPLE, altitude: 30 }])).toEqual({ ok: true, trail: [SAMPLE] });
  });

  it.each([
    ['not JSON', '{oops'],
    ['not an array', JSON.stringify(SAMPLE)],
    ['a missing accuracy', JSON.stringify([{ ...SAMPLE, accuracy: undefined }])],
    ['a negative accuracy', JSON.stringify([{ ...SAMPLE, accuracy: -1 }])],
    ['a latitude out of range', JSON.stringify([{ ...SAMPLE, latitude: 91 }])],
    ['a text timestamp', JSON.stringify([{ ...SAMPLE, timestamp: 'now' }])],
  ])('rejects %s', (_label, value) => {
    expect(parseLocationTrail(value).ok).toBe(false);
  });

  it('rejects a trail with too many readings', () => {
    const result = parseLocationTrail(Array(MAX_TRAIL_SAMPLES + 1).fill(SAMPLE));
    expect(result).toEqual({ ok: false, error: expect.stringContaining(`max is ${MAX_TRAIL_SAMPLES}`) });
  });
});
