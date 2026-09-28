/**
 * Security & Input Sanitizer Utility
 *
 * Implements defensive OWASP security sanitization for customer inputs:
 * - HTML and script tag neutralization (preventing Stored XSS)
 * - Dangerous URI scheme filtering (javascript:, vbscript:, data:)
 * - Invisible bot honeypot detection
 * - Bounded string length truncations
 */

/**
 * Strips HTML tags, script elements, and dangerous protocols from user inputs.
 */
export function sanitizeTextInput(input: unknown, maxLength: number = 2000): string {
  if (input === null || input === undefined) return '';
  if (typeof input !== 'string') {
    return String(input).slice(0, maxLength);
  }

  // 1. Remove dangerous protocol links
  let clean = input
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '');

  // 2. Strip HTML/XML tags
  clean = clean.replace(/<[^>]*>?/gm, '');

  // 3. Remove zero-width characters and control characters (except newline \n and carriage return \r)
  clean = clean.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

  // 4. Truncate to maximum permitted length
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
