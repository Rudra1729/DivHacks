/**Minimal email normalization and validation shared by the auth routes.*/

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize an email to lowercase/trimmed form, and check it looks valid.

Args:
    raw (unknown): The value submitted by the client.

Returns:
    string | null: The normalized email, or null if it isn't a valid-looking email.
*/
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}
