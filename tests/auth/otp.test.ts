import { generateOtp, hashOtp, otpMatches, OTP_LENGTH } from '../../src/auth/otp';

describe('otp', () => {
  it('generates a zero-padded code of the expected length', () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateOtp();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });

  it('matches a code against its own hash', () => {
    const code = generateOtp();
    expect(otpMatches(code, hashOtp(code))).toBe(true);
  });

  it('rejects a wrong code', () => {
    expect(otpMatches('000000', hashOtp('999999'))).toBe(false);
  });

  it('rejects a malformed submitted code without throwing', () => {
    expect(otpMatches('not-a-code', hashOtp('123456'))).toBe(false);
  });
});
