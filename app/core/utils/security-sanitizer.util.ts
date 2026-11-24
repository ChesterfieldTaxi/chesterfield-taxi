/**
 * Security, Anti-Spam & Localhost Maintenance Guard Utilities
 *
 * Implements defensive OWASP sanitization and multi-layer `/book` bot/spam mitigation:
 * - HTML/script neutralization & dangerous URI filtering
 * - Localhost maintenance auto-bypass detection (`localhost`, `127.0.0.1`, `[::1]`)
 * - Offscreen honeypot + `< 4000ms` dwell-time bot detection
 * - Verified autocomplete coordinate & gibberish/numeric/consonant-mash name guards
 */

export const PUBLIC_BOOKING_MIN_DWELL_MS = 4000;

export const VERIFIED_ADDRESS_AUTOCOMPLETE_ERROR =
  'Please select a verified address from the autocomplete suggestions';

/**
 * Pure check for local development hostnames (`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`, `::1`).
 */
export function isLocalhostDevHost(hostname?: string): boolean {
  const raw = String(hostname ?? '').trim().toLowerCase();
  if (!raw) return false;
  const host = raw.startsWith('[') ? raw.replace(/\]:\d+$/, ']') : raw.replace(/:\d+$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1'
  );
}

/**
 * Strips HTML tags, script elements, and dangerous protocols from user inputs.
 */
export function sanitizeTextInput(input: unknown, maxLength: number = 2000): string {
  if (input === null || input === undefined) return '';
  if (typeof input !== 'string') {
    return String(input).slice(0, maxLength);
  }

  let clean = input
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');

  clean = clean.replace(/<[^>]*>?/gm, '');
  clean = clean.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

  if (clean.length > maxLength) {
    clean = clean.slice(0, maxLength);
  }

  return clean.trim();
}

/**
 * Validates whether a honeypot field has been filled out by an automated bot.
 */
export function isBotHoneypotTriggered(honeypotValue: unknown): boolean {
  if (typeof honeypotValue === 'string') {
    return honeypotValue.trim().length > 0;
  }
  return Boolean(honeypotValue);
}

/**
 * Evaluates whether a public `/book` submission is an automated bot via either:
 * 1. Populated offscreen honeypot (`websiteUrl` / `botTrapField`), OR
 * 2. Form dwell time `< 4000ms` on the public web form.
 */
export function isPublicBookingBotSubmission(params: {
  honeypotValue?: unknown;
  websiteUrl?: unknown;
  mountedAtMs?: number | null;
  submittedAtMs?: number;
  isPublicWebForm?: boolean;
}): boolean {
  if (isBotHoneypotTriggered(params.honeypotValue) || isBotHoneypotTriggered(params.websiteUrl)) {
    return true;
  }
  if (
    params.isPublicWebForm !== false &&
    typeof params.mountedAtMs === 'number' &&
    Number.isFinite(params.mountedAtMs)
  ) {
    const submittedAt = params.submittedAtMs ?? Date.now();
    if (submittedAt - params.mountedAtMs < PUBLIC_BOOKING_MIN_DWELL_MS) {
      return true;
    }
  }
  return false;
}

/**
 * Blocks public booking submissions when `constructionMode === true` on non-localhost
 * browsers for non-staff visitors.
 */
export function shouldBlockBookingUnderMaintenance(params: {
  constructionMode?: boolean;
  hostname?: string;
  userRole?: string | null;
  userRoles?: readonly string[] | null;
}): boolean {
  if (params.constructionMode !== true) return false;
  if (isLocalhostDevHost(params.hostname)) return false;
  const roles = new Set<string>([
    ...(params.userRole ? [params.userRole] : []),
    ...(params.userRoles || []),
  ]);
  if (roles.has('admin') || roles.has('dispatcher')) return false;
  return true;
}

/**
 * Verifies that an address endpoint has finite non-zero coordinates from Places Autocomplete.
 */
export function hasValidResolvedCoordinates(
  coords?: { lat?: number; lng?: number } | null
): boolean {
  return Boolean(
    coords &&
      typeof coords.lat === 'number' &&
      typeof coords.lng === 'number' &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      (coords.lat !== 0 || coords.lng !== 0)
  );
}

/**
 * Detects keyboard-mash consonant runs (`6+` consecutive consonants or `4+` letter
 * vowel-less tokens such as `"Wqssvb"`, `"Ftwwk"`, `"RUGtjxocusfzjdcKXRoX"`), while
 * preserving legitimate Slavic/Germanic/English names (`"Krzysztof"`, `"Armstrong"`, `"Ng"`).
 */
export function hasSpamConsonantMash(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const tokens = val.trim().match(/[a-zA-Z]+/g);
  if (!tokens || tokens.length === 0) return false;

  for (const token of tokens) {
    if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(token)) {
      return true;
    }
    if (token.length >= 4 && !/[aeiouy]/i.test(token)) {
      return true;
    }
    if (
      /[bcdfghjklmnpqrstvwxz]{5,}/i.test(token) &&
      /(ww|qq|jj|vv|xx)/i.test(token)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Rejects all-digit / phone-number names (`"9137066615"`), excessive digits,
 * repeated-char floods, random mixed-case bot strings, and consonant-mash gibberish.
 */
export function isLikelyGibberishOrNumericName(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const clean = val.trim();
  if (!clean) return false;

  // Reject names with zero alphabetic letters (e.g. "9137066615", "123-456-7890")
  if (!/[a-zA-Z\u00C0-\u024F]/.test(clean)) {
    return true;
  }

  // Reject names containing 3 or more digits
  if ((clean.match(/\d/g) || []).length >= 3) {
    return true;
  }

  // Reject 4+ identical consecutive characters (e.g. "aaaaaa")
  if (/([a-zA-Z])\1{3,}/i.test(clean)) {
    return true;
  }

  // Reject keyboard-mash consonant clusters ("Wqssvb", "Ftwwk", "RUGtjxocusfzjdcKXRoX")
  if (hasSpamConsonantMash(clean)) {
    return true;
  }

  // Reject single-word random mixed-case bot tokens (>= 12 chars with >= 3 case jumps)
  const words = clean.split(/\s+/);
  for (const w of words) {
    if (w.length >= 12 && !/[-']/.test(w) && /[a-z][A-Z].*[a-z][A-Z].*[a-z][A-Z]/.test(w)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively sanitizes all string properties in a payload object.
 */
export function sanitizeObjectStrings<T>(obj: T, maxStringLength: number = 2000): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return sanitizeTextInput(obj, maxStringLength) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectStrings(item, maxStringLength)) as unknown as T;
  }
  if (typeof obj === 'object') {
    if (obj instanceof Date || obj instanceof RegExp) return obj;
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObjectStrings(value, maxStringLength);
    }
    return result as T;
  }
  return obj;
}
