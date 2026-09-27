import { normalizeEmail } from '../../src/auth/validateEmail';

describe('normalizeEmail', () => {
  it('lowercases and trims a valid email', () => {
    expect(normalizeEmail('  Person@Example.COM  ')).toBe('person@example.com');
  });

  it('rejects a non-string', () => {
    expect(normalizeEmail(12345)).toBeNull();
  });

  it('rejects a string with no @', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
  });

  it('rejects a string with no domain dot', () => {
    expect(normalizeEmail('person@localhost')).toBeNull();
  });
});
