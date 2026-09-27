/**POST /auth/request-code and POST /auth/verify: email OTP login.

First-time verify provisions a brand-new Solana + XRPL wallet pair for
the email and creates the user row; a returning email just logs in to
its existing wallets. Either way the response carries a session token
and the two public wallet addresses (never a secret).
*/

import { Router } from 'express';
import { asyncHandler } from './asyncHandler';
import Database from 'better-sqlite3';
import { EmailSender, getEmailSender } from '../auth/email';
import { createUser, getUserByEmail } from '../db/users';
import { deleteOtpCode, getOtpCode, incrementOtpAttempts, upsertOtpCode } from '../db/otpCodes';
import { generateOtp, hashOtp, MAX_OTP_ATTEMPTS, OTP_TTL_MS, otpMatches } from '../auth/otp';
import { provisionWallets } from '../auth/provisionWallet';
import { createSessionToken } from '../auth/tokens';
import { normalizeEmail } from '../auth/validateEmail';

/** Build the /auth router.

Args:
    db (Database.Database): Open database handle.
    emailSender (EmailSender): Sender used to deliver codes. Defaults to
        the shared sender picked by EMAIL_MODE.

Returns:
    Router: The configured router.
*/
export function createAuthRouter(db: Database.Database, emailSender: EmailSender = getEmailSender()): Router {
  const router = Router();

  router.post('/auth/request-code', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ errors: ['a valid email is required'] });
      return;
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    upsertOtpCode(db, email, hashOtp(code), expiresAt);

    try {
      await emailSender.sendOtp(email, code);
    } catch (error) {
      res.status(502).json({ errors: [`could not send login code: ${(error as Error).message}`] });
      return;
    }

    res.status(200).json({ message: 'login code sent' });
  }));

  router.post('/auth/verify', (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const code = req.body?.code;
    if (!email || typeof code !== 'string') {
      res.status(400).json({ errors: ['a valid email and code are required'] });
      return;
    }

    const otp = getOtpCode(db, email);
    if (!otp) {
      res.status(400).json({ errors: ['no login code was requested for this email'] });
      return;
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      deleteOtpCode(db, email);
      res.status(429).json({ errors: ['too many wrong attempts, request a new code'] });
      return;
    }
    if (new Date(otp.expiresAt).getTime() < Date.now()) {
      deleteOtpCode(db, email);
      res.status(400).json({ errors: ['login code has expired, request a new one'] });
      return;
    }
    if (!otpMatches(code, otp.codeHash)) {
      incrementOtpAttempts(db, email);
      res.status(400).json({ errors: ['incorrect code'] });
      return;
    }

    deleteOtpCode(db, email);

    let user = getUserByEmail(db, email);
    if (!user) {
      user = createUser(db, email, provisionWallets());
    }

    const token = createSessionToken(user.id);
    res.status(200).json({
      token,
      user: { id: user.id, email: user.email, xrplAddress: user.xrplAddress, solanaAddress: user.solanaAddress },
    });
  });

  return router;
}
