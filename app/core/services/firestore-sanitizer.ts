/**
 * Universal Firestore Payload Sanitizer
 *
 * Implements recursive data sanitization to convert any undefined values in
 * objects and arrays to null or omit them prior to passing to Firestore SDK methods.
 *
 * Prevents runtime errors like:
 * "FirebaseError: Function setDoc() called with invalid data. Unsupported field value: undefined"
 */

export interface SanitizeOptions {
  /**
   * Strategy for handling undefined properties:
   * - 'null': Replaces undefined with null (default for Firestore documents)
   * - 'omit': Omits/strips undefined keys entirely from objects
   * - 'empty_string': Replaces undefined with empty string ""
   */
  mode?: 'null' | 'omit' | 'empty_string';
}

/**
 * Recursively sanitizes any payload before sending it to Firestore methods (setDoc, addDoc, updateDoc).
 * Converts undefined keys and values in nested objects and arrays to null,
 * or omits them when mode is 'omit'.
 *
 * Preserves Date, Firestore Timestamp/GeoPoint-like objects (with toMillis/isEqual),
 * and primitive non-undefined values.
 *
 * @param data The payload data to sanitize
 * @param options Configuration options for sanitization strategy, or legacy fallback string/null
 * @returns The sanitized payload safe for Firestore writes
 */
export function sanitizePayload<T>(
  data: T,
  options?: SanitizeOptions | (null | '' | 'omit')
): T {
  // Normalize options if passed as legacy fallback argument
  let mode: 'null' | 'omit' | 'empty_string' = 'null';
  if (typeof options === 'string') {
    if (options === 'omit') mode = 'omit';
    else if (options === '') mode = 'empty_string';
    else mode = 'null';
  } else if (options && typeof options === 'object') {
    mode = options.mode ?? 'null';
  }

  if (data === undefined) {
    if (mode === 'empty_string') return '' as unknown as T;
    return null as unknown as T;
  }

  if (data === null || typeof data !== 'object') {
    return data;
  }

  // Preserve Date instances
  if (data instanceof Date) {
    return data;
  }

  // Preserve Firestore Timestamp or GeoPoint objects
  if (
    typeof (data as Record<string, unknown>).toMillis === 'function' ||
    typeof (data as Record<string, unknown>).isEqual === 'function'
  ) {
    return data;
  }

  // Handle Arrays recursively
  if (Array.isArray(data)) {
    return data.map((item) =>
      item === undefined
        ? (mode === 'empty_string' ? '' : null)
        : sanitizePayload(item, { mode })
    ) as unknown as T;
  }

  // Handle plain objects recursively
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === undefined) {
      if (mode === 'omit') {
        continue;
      }
      sanitized[key] = mode === 'empty_string' ? '' : null;
    } else if (value !== null && typeof value === 'object') {
      sanitized[key] = sanitizePayload(value, { mode });
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Safely sanitizes document data for setDoc / addDoc operations.
 * Defaults undefined fields to null to ensure strict schema consistency.
 */
export function sanitizeFirestoreDocument<T extends Record<string, unknown>>(data: T): T {
  return sanitizePayload(data, { mode: 'null' });
}

/**
 * Safely sanitizes partial updates for updateDoc operations.
 * By default omits undefined keys so that unspecified fields are not overwritten.
 */
export function sanitizeFirestoreUpdate<T extends Record<string, unknown>>(
  data: T,
  options?: SanitizeOptions
): T {
  return sanitizePayload(data, options ?? { mode: 'omit' });
}
