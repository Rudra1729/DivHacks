import { FakeSentinel } from '../../src/sentinel/fakeSentinel';

describe('FakeSentinel', () => {
  it('passes by default', async () => {
    const sentinel = new FakeSentinel();
    expect(await sentinel.verify()).toEqual({ ok: true });
  });

  it('reports every configured failure together', async () => {
    const sentinel = new FakeSentinel(['too far from place', 'photo too old']);
    expect(await sentinel.verify()).toEqual({
      ok: false,
      failures: ['too far from place', 'photo too old'],
    });
  });
});
