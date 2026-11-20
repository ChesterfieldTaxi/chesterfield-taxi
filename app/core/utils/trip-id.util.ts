/**
 * Trip ID & Confirmation Code Generator with Mathematical Checksum
 * 
 * Implements a structured, human-friendly 10-character reservation code:
 * Format: `CT-XXXX-XXXX` (Prefix: `CT-`, 8 numeric digits)
 * 
 * Mathematical Structure:
 * - Digits 1-4: Customer Anchor (Derived from last 4 digits of phone, or deterministic hash of email/name)
 * - Digits 5-7: Trip Sequence / Entropy (e.g. sequence counter or day-of-year + time)
 * - Digit 8:    Luhn Algorithm Mod-10 Check Digit (Calculated over digits 1-7, identical to credit cards)
 * 
 * Benefits:
 * - Deterministic customer grouping (dispatchers immediately spot returning customer trips)
 * - High client-side fault tolerance: mistyped or transposed digits immediately fail Luhn validation
 * - Clear, unambiguous, and easily readable over the phone
 */

/**
 * Calculates the standard Luhn Mod-10 check digit for a string of numeric digits.
 */
export function calculateLuhnCheckDigit(digits: string): number {
  let sum = 0;
  let shouldDouble = true; // For check digit calculation, start doubling from the rightmost digit of the payload

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isNaN(digit)) digit = 0;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Validates a string of digits against the standard Luhn Mod-10 algorithm.
 * The last digit is assumed to be the check digit.
 */
export function verifyLuhn(fullDigits: string): boolean {
  if (!/^\d+$/.test(fullDigits) || fullDigits.length < 2) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = fullDigits.length - 1; i >= 0; i--) {
    let digit = parseInt(fullDigits.charAt(i), 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

/**
 * Simple deterministic 4-digit hash (FNV-1a 32-bit mod 10000) for strings (e.g., email or name).
 */
export function hashStringTo4Digits(input: string): string {
  if (!input) return '1000';
  const clean = input.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash);
  const mod = positive % 10000;
  return mod.toString().padStart(4, '0');
}

/**
 * Generates a cryptographically random integer between min (inclusive) and max (exclusive).
 */
function secureRandomInt(min: number, max: number): number {
  const range = max - min;
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return min + (arr[0] % range);
  }
  return Math.floor(min + Math.random() * range);
}

/**
 * Generates a non-PII 4-digit reservation prefix segment (1000-9999).
 * Does NOT embed raw phone digits so public Trip IDs never leak passenger phone numbers.
 */
export function extractCustomerAnchorFromContact(_phone?: string, _email?: string, _name?: string): string {
  return secureRandomInt(1000, 10000).toString();
}

/**
 * Generates a full mathematical Trip ID / Reservation Number in `CT-XXXX-XXXX` format.
 */
export function generateTripId(phone?: string, email?: string, name?: string): string {
  // 1. Random 4-digit prefix segment (1000-9999) — never leaks phone digits
  const customerAnchor = extractCustomerAnchorFromContact(phone, email, name);

  // 2. Cryptographic Trip Entropy (3 digits: 000-999)
  const entropy = secureRandomInt(0, 1000).toString().padStart(3, '0');

  // 3. Payload for Luhn computation (7 digits total)
  const payload7 = `${customerAnchor}${entropy}`;

  // 4. Luhn Mod-10 Check Digit (1 digit)
  const checkDigit = calculateLuhnCheckDigit(payload7);

  // 5. Full 8-digit body formatted as CT-XXXX-XXXX
  const fullDigits = `${payload7}${checkDigit}`;
  return `CT-${fullDigits.slice(0, 4)}-${fullDigits.slice(4, 8)}`;
}

/**
 * Normalizes a phone string to its last 10 numeric digits (stripping country code +1).
 */
export function normalizePhoneDigits(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits.slice(-10);
}

/**
 * Verifies that a user-entered phone number matches the passenger phone on a Trip record.
 * Requires at least 7 digits and exact match of normalized phone numbers.
 */
export function verifyTripPhoneMatch(tripPassengerPhone?: string, inputPhone?: string): boolean {
  const cleanTrip = normalizePhoneDigits(tripPassengerPhone);
  const cleanInput = normalizePhoneDigits(inputPhone);
  if (!cleanTrip || cleanInput.length < 7) return false;
  return cleanTrip === cleanInput || (cleanInput.length >= 10 && cleanTrip.endsWith(cleanInput));
}

export interface TripIdValidationResult {
  isValid: boolean;
  customerAnchor?: string;
  reason?: string;
}

/**
 * Validates a Trip ID string against the CT-XXXX-XXXX format and Luhn checksum.
 */
export function validateTripId(tripId: string): TripIdValidationResult {
  if (!tripId || typeof tripId !== 'string') {
    return { isValid: false, reason: 'Empty or non-string Trip ID' };
  }

  const clean = tripId.trim().toUpperCase();
  // Support both CT-XXXX-XXXX and CT-XXXXXXXX
  const match = clean.match(/^CT-?(\d{4})-?(\d{4})$/);
  if (!match) {
    return { isValid: false, reason: 'Trip ID must match format CT-XXXX-XXXX with 8 numeric digits' };
  }

  const fullDigits = `${match[1]}${match[2]}`;
  const isChecksumValid = verifyLuhn(fullDigits);

  if (!isChecksumValid) {
    return {
      isValid: false,
      customerAnchor: match[1],
      reason: 'Luhn checksum verification failed (possible typo or transposed digit)',
    };
  }

  return {
    isValid: true,
    customerAnchor: match[1],
  };
}

/**
 * Formats raw vehicle tier identifiers into polished, human-readable labels.
 */
export function formatVehicleTier(tier?: string): string {
  if (!tier) return 'Standard Fleet';
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any' || clean.startsWith('any')) return 'Any';
  if (clean === 'standard' || clean === 'sedan') return 'Executive Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'wheelchair' || clean === 'van' || clean === 'wav') return 'Accessible Van / WAV';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}
