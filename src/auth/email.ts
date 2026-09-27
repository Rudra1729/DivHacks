/**Sends login codes by email.

EMAIL_MODE picks the implementation, same pattern as XRPL_MODE and
SOLANA_MODE: 'fake' (default) logs the code instead of sending anything, so
the app runs and is testable with no email provider configured. 'real'
sends through SMTP.
*/

/** Raised when EMAIL_MODE=real is missing SMTP configuration. */
export class EmailConfigError extends Error {}

export interface EmailSender {
  sendOtp(email: string, code: string): Promise<void>;
}

/** Fake sender: logs the code instead of emailing it. Used in fake mode and tests. */
export class FakeEmailSender implements EmailSender {
  public sent: { email: string; code: string }[] = [];

  async sendOtp(email: string, code: string): Promise<void> {
    this.sent.push({ email, code });
    // eslint-disable-next-line no-console
    console.log(`[fake email] login code for ${email}: ${code}`);
  }
}

/** Real sender: delivers the code over SMTP using nodemailer. */
export class SmtpEmailSender implements EmailSender {
  async sendOtp(email: string, code: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (!host || !user || !pass || !from) {
      throw new EmailConfigError(
        'EMAIL_MODE=real needs SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM (or SMTP_USER as sender).'
      );
    }

    // Imported lazily so fake mode (the default, and every test) never
    // needs nodemailer installed or configured.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    await transport.sendMail({
      from,
      to: email,
      subject: 'Your WebPass NYC login code',
      text: `Your login code is ${code}. It expires in 10 minutes.`,
    });
  }
}

let cachedSender: EmailSender | undefined;

/** Return the shared email sender for the current EMAIL_MODE.

Returns:
    EmailSender: FakeEmailSender by default, SmtpEmailSender if EMAIL_MODE=real.
*/
export function getEmailSender(): EmailSender {
  if (!cachedSender) {
    cachedSender = (process.env.EMAIL_MODE ?? 'fake').toLowerCase() === 'real' ? new SmtpEmailSender() : new FakeEmailSender();
  }
  return cachedSender;
}

/** Reset the cached sender. Test-only, so each test gets its own FakeEmailSender. */
export function resetEmailSenderForTests(): void {
  cachedSender = undefined;
}
