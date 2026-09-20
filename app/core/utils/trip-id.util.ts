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
 * Extracts a 4-digit customer anchor from phone number or email/name.
 */
export function extractCustomerAnchorFromContact(phone?: string, email?: string, name?: string): string {
  if (phone) {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      return digitsOnly.slice(-4);
    }
    if (digitsOnly.length > 0) {
      return digitsOnly.padStart(4, '0');
    }
  }

  if (email) {
    return hashStringTo4Digits(email);
  }

  if (name) {
    return hashStringTo4Digits(name);
  }

  // Fallback random 4 digits
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Generates a full mathematical Trip ID / Reservation Number in `CT-XXXX-XXXX` format.
 */
export function generateTripId(phone?: string, email?: string, name?: string): string {
  // 1. Customer Anchor (4 digits)
  const customerAnchor = extractCustomerAnchorFromContact(phone, email, name);

  // 2. Trip Sequence / Entropy (3 digits: 000-999)
  const entropy = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

  // 3. Payload for Luhn computation (7 digits total)
  const payload7 = `${customerAnchor}${entropy}`;

  // 4. Luhn Mod-10 Check Digit (1 digit)
  const checkDigit = calculateLuhnCheckDigit(payload7);

  // 5. Full 8-digit body formatted as CT-XXXX-XXXX
  const fullDigits = `${payload7}${checkDigit}`;
  return `CT-${fullDigits.slice(0, 4)}-${fullDigits.slice(4, 8)}`;
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
  if (clean === 'any' || clean.startsWith('any')) return 'Any Vehicle (Best Available)';
  if (clean === 'standard' || clean === 'sedan') return 'Executive Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'wheelchair' || clean === 'van' || clean === 'wav') return 'Accessible Van / WAV';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}
