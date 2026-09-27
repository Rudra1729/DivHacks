import { FakeEmailSender, getEmailSender, resetEmailSenderForTests, SmtpEmailSender } from '../../src/auth/email';

describe('email sender', () => {
  const originalMode = process.env.EMAIL_MODE;

  afterEach(() => {
    process.env.EMAIL_MODE = originalMode;
    resetEmailSenderForTests();
  });

  it('records sent codes instead of emailing them', async () => {
    const sender = new FakeEmailSender();
    await sender.sendOtp('person@example.com', '123456');
    expect(sender.sent).toEqual([{ email: 'person@example.com', code: '123456' }]);
  });

  it('defaults to the fake sender when EMAIL_MODE is unset', () => {
    delete process.env.EMAIL_MODE;
    resetEmailSenderForTests();
    expect(getEmailSender()).toBeInstanceOf(FakeEmailSender);
  });

  it('uses the SMTP sender when EMAIL_MODE=real', () => {
    process.env.EMAIL_MODE = 'real';
    resetEmailSenderForTests();
    expect(getEmailSender()).toBeInstanceOf(SmtpEmailSender);
  });
});
