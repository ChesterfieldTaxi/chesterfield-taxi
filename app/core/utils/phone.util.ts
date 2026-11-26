/**
 * Phone Display Formatting Utilities (Phase 103)
 *
 * Pure UI-boundary formatter that renders US/NANP phone numbers as `(636) 348-0166`
 * while leaving `phoneNormalized`, `tel:`/`sms:` hrefs, and E.164 telephony/SMS
 * payloads untouched.
 */

/**
 * Formats a raw phone string for human-readable UI display.
 * - Strips leading `1` on 11-digit US/NANP numbers (e.g. `+16363480166` or `16363480166`).
 * - Formats 10-digit US/NANP numbers as `(XXX) XXX-XXXX`.
 * - Returns international, short, or malformed strings as-is (trimmed), and `''` for empty/nullish input.
 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    const nanp = digits.slice(1);
    return `(${nanp.slice(0, 3)}) ${nanp.slice(3, 6)}-${nanp.slice(6, 10)}`;
  }

  if (digits.length === 10 && (!trimmed.startsWith('+') || trimmed.startsWith('+1'))) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }

  return trimmed;
}
