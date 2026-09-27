import { validateSubmission } from '../../src/validation/submission';

const VALID_INPUT = {
  placeId: 'apollo-theater',
  latitude: 40.8102,
  longitude: -73.95,
  timestamp: new Date().toISOString(),
  xrplAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
  solanaAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
};

const VALID_FILE = { mimetype: 'image/jpeg', size: 1024 };

describe('validateSubmission', () => {
  it('accepts a fully valid submission', () => {
    const result = validateSubmission(VALID_INPUT, VALID_FILE);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports every missing field at once', () => {
    const result = validateSubmission({}, undefined);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'place is required',
        'location (latitude and longitude) is required',
        'timestamp is required and must be a valid date',
        'XRPL address is required',
        'Solana address is required',
        'photo is required',
      ])
    );
  });

  it('rejects a place not on the allowlist', () => {
    const result = validateSubmission({ ...VALID_INPUT, placeId: 'not-a-real-place' }, VALID_FILE);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('place is not on the allowlist: not-a-real-place');
  });

  it('rejects a malformed XRPL address', () => {
    const result = validateSubmission({ ...VALID_INPUT, xrplAddress: 'not-an-address' }, VALID_FILE);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('XRPL address is malformed');
  });

  it('rejects a malformed Solana address', () => {
    const result = validateSubmission({ ...VALID_INPUT, solanaAddress: '!!!' }, VALID_FILE);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Solana address is malformed');
  });

  it('rejects a non-image file', () => {
    const result = validateSubmission(VALID_INPUT, { mimetype: 'application/pdf', size: 1024 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('photo must be an image, got application/pdf');
  });

  it('rejects an oversized image', () => {
    const result = validateSubmission(VALID_INPUT, { mimetype: 'image/jpeg', size: 6 * 1024 * 1024 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.startsWith('photo must be at most'))).toBe(true);
  });
});
