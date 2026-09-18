/**
 * Phone Number Utilities & E.164 Validation
 * 
 * Implements strict North American Numbering Plan (NANP) and international E.164
 * parsing, sanitization, and validation across client forms and serverless API endpoints.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  e164: string;
  error?: string;
  reason?:
    | 'missing'
    | 'no_digits'
    | 'too_short'
    | 'invalid_area_code'
    | 'invalid_exchange_code'
    | 'too_long'
    | 'invalid_international';
  isNorthAmerican: boolean;
  areaCode?: string;
  exchangeCode?: string;
  stationCode?: string;
}

// Special service codes (N11) reserved by FCC and North American Numbering Plan
const NANP_N11_CODES = new Set(['211', '311', '411', '511', '611', '711', '811', '911']);

/**
 * Sanitizes an incoming raw string by stripping non-numeric artifacts (except leading '+').
 * Normalizes 10-digit North American inputs to standard E.164 format (+1XXXXXXXXXX).
 * Normalizes 11-digit inputs starting with 1 to +1XXXXXXXXXX.
 */
export function sanitizeToE164(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';

  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return '';

  if (hasLeadingPlus) {
    return `+${digitsOnly}`;
  }

  // 10 digits: Standard North American Numbering Plan (NANP)
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  // 11 digits starting with 1: North American number with leading country code
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

export const sanitizePhoneNumber = sanitizeToE164;
export const toE164 = sanitizeToE164;

/**
 * Validates a phone number against strict NANP and ITU-T E.164 standards.
 * 
 * Rejects:
 * - Empty or missing phone strings
 * - Short codes (length < 10 digits, e.g. 911, 411, 5-digit short codes)
 * - North American numbers with area codes starting with 0 or 1
 * - North American numbers with N11 service codes as area codes (e.g. 911-XXX-XXXX)
 * - North American numbers with central office / exchange codes starting with 0 or 1
 * - Malformed international numbers exceeding 15 digits or under 10 digits
 */
export function validatePhoneNumber(phone: string | null | undefined): PhoneValidationResult {
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return {
      isValid: false,
      e164: '',
      error: 'Phone number is required.',
      reason: 'missing',
      isNorthAmerican: false,
    };
  }

  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) {
    return {
      isValid: false,
      e164: '',
      error: 'Phone number contains no numeric digits.',
      reason: 'no_digits',
      isNorthAmerican: false,
    };
  }

  // Reject short codes (< 10 digits)
  if (digitsOnly.length < 10) {
    return {
      isValid: false,
      e164: sanitizeToE164(phone),
      error: `Invalid phone number "${phone}". Short codes and numbers under 10 digits are not supported for dispatch or telephony.`,
      reason: 'too_short',
      isNorthAmerican: false,
    };
  }

  // Detect if North American (10 digits or 11 digits starting with 1)
  const isNanp =
    digitsOnly.length === 10 ||
    (digitsOnly.length === 11 && digitsOnly.startsWith('1')) ||
    (trimmed.startsWith('+1') && digitsOnly.length === 11);

  if (isNanp) {
    const nanp10 = digitsOnly.length === 11 ? digitsOnly.slice(1) : digitsOnly;
    const areaCode = nanp10.slice(0, 3);
    const exchangeCode = nanp10.slice(3, 6);
    const stationCode = nanp10.slice(6, 10);

    // Rule 1: Area code cannot start with 0 or 1
    if (areaCode.startsWith('0') || areaCode.startsWith('1')) {
      return {
        isValid: false,
        e164: `+1${nanp10}`,
        error: `Invalid area code "${areaCode}". North American area codes cannot begin with 0 or 1.`,
        reason: 'invalid_area_code',
        isNorthAmerican: true,
        areaCode,
        exchangeCode,
        stationCode,
      };
    }

    // Rule 2: Area code cannot be an N11 service code (211, 311, 411, 911, etc.)
    if (NANP_N11_CODES.has(areaCode)) {
      return {
        isValid: false,
        e164: `+1${nanp10}`,
        error: `Invalid area code "${areaCode}". Special service codes (N11) cannot be used as geographic area codes.`,
        reason: 'invalid_area_code',
        isNorthAmerican: true,
        areaCode,
        exchangeCode,
        stationCode,
      };
    }

    // Rule 3: Central office / exchange code cannot start with 0 or 1
    if (exchangeCode.startsWith('0') || exchangeCode.startsWith('1')) {
      return {
        isValid: false,
        e164: `+1${nanp10}`,
        error: `Invalid exchange code "${exchangeCode}". North American central office codes cannot begin with 0 or 1.`,
        reason: 'invalid_exchange_code',
        isNorthAmerican: true,
        areaCode,
        exchangeCode,
        stationCode,
      };
    }

    // Valid NANP number
    return {
      isValid: true,
      e164: `+1${nanp10}`,
      isNorthAmerican: true,
      areaCode,
      exchangeCode,
      stationCode,
    };
  }

  // Non-NANP International Number Validation (ITU-T E.164: max 15 digits)
  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      e164: `+${digitsOnly}`,
      error: `Invalid international phone number. E.164 numbers cannot exceed 15 digits.`,
      reason: 'too_long',
      isNorthAmerican: false,
    };
  }

  // Country code cannot begin with 0
  if (digitsOnly.startsWith('0')) {
    return {
      isValid: false,
      e164: `+${digitsOnly}`,
      error: `Invalid international number. Country codes cannot start with 0.`,
      isNorthAmerican: false,
    };
  }

  // General E.164 check: +[1-9][0-9]{9,14}
  const candidateE164 = `+${digitsOnly}`;
  const e164Regex = /^\+[1-9]\d{9,14}$/;

  if (!e164Regex.test(candidateE164)) {
    return {
      isValid: false,
      e164: candidateE164,
      error: `Phone number "${phone}" does not match international E.164 format.`,
      isNorthAmerican: false,
    };
  }

  return {
    isValid: true,
    e164: candidateE164,
    isNorthAmerican: false,
  };
}

/**
 * Returns true if the phone number passes all E.164 and NANP validation rules.
 */
export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  return validatePhoneNumber(phone).isValid;
}

/**
 * Formats standard 10-digit North American numbers to human-readable (XXX) XXX-XXXX.
 * If international, formats as +X XXX XXX XXXX.
 */
export function formatDisplayPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const validation = validatePhoneNumber(phone);
  if (!validation.isValid) {
    return phone;
  }

  if (validation.isNorthAmerican && validation.areaCode && validation.exchangeCode && validation.stationCode) {
    return `(${validation.areaCode}) ${validation.exchangeCode}-${validation.stationCode}`;
  }

  return validation.e164;
}
