import { checkFreshness } from '../../src/sentinel/freshness';

describe('checkFreshness', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');

  it('passes for a photo taken just now', () => {
    const result = checkFreshness(now.toISOString(), now);
    expect(result.passed).toBe(true);
  });

  it('passes for a photo taken 10 minutes ago', () => {
    const timestamp = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(checkFreshness(timestamp, now).passed).toBe(true);
  });

  it('fails for a photo taken 20 minutes ago', () => {
    const timestamp = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
    const result = checkFreshness(timestamp, now);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('20 minutes old');
  });

  it('fails for a photo timestamped in the future', () => {
    const timestamp = new Date(now.getTime() + 60 * 1000).toISOString();
    const result = checkFreshness(timestamp, now);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('future');
  });
});
