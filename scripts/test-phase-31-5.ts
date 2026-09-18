/**
 * Automated Verification Script for Phase 31.5: Production Hardening & Telemetry Optimization
 */

import {
  sanitizeToE164,
  validatePhoneNumber,
  isValidPhoneNumber,
  formatDisplayPhone,
} from '../app/core/utils/phone';
import { getAdaptiveThrottleIntervalMs } from '../app/core/hooks/useDriverTelemetry';

let failures = 0;
let passed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ''}`);
    failures++;
  }
}

console.log('\n=== [PHASE 31.5] TELEPHONY INPUT SANITIZATION & E.164 TEST SUITE ===');

// 1. Strict E.164 normalization for North American numbers
const nanp1 = sanitizeToE164('(314) 739-8444');
assert(nanp1 === '+13147398444', 'Standard formatted phone (314) 739-8444 normalizes to +13147398444', `Got: ${nanp1}`);

const nanp2 = sanitizeToE164('314-739-8444');
assert(nanp2 === '+13147398444', 'Hyphenated phone 314-739-8444 normalizes to +13147398444', `Got: ${nanp2}`);

const nanp3 = sanitizeToE164('314.739.8444');
assert(nanp3 === '+13147398444', 'Dotted phone 314.739.8444 normalizes to +13147398444', `Got: ${nanp3}`);

const nanp4 = sanitizeToE164('13147398444');
assert(nanp4 === '+13147398444', '11-digit 13147398444 normalizes to +13147398444', `Got: ${nanp4}`);

const nanp5 = sanitizeToE164('+1 314 739 8444');
assert(nanp5 === '+13147398444', 'Spaced +1 314 739 8444 normalizes to +13147398444', `Got: ${nanp5}`);

// 2. Display Formatter
const disp1 = formatDisplayPhone('+13147398444');
assert(disp1 === '(314) 739-8444', 'formatDisplayPhone(+13147398444) returns (314) 739-8444', `Got: ${disp1}`);

// 3. Validation Tests: Valid numbers
const val1 = validatePhoneNumber('(314) 739-8444');
assert(val1.isValid && val1.e164 === '+13147398444', 'Valid St. Louis phone passes validation', JSON.stringify(val1));

const valIntl = validatePhoneNumber('+44 20 7946 0991');
assert(valIntl.isValid && valIntl.e164 === '+442079460991', 'Valid International phone (+44) passes validation', JSON.stringify(valIntl));

// 4. Validation Rejection Tests: Short codes
const rejShort1 = validatePhoneNumber('12345');
assert(!rejShort1.isValid && rejShort1.reason === 'too_short', '5-digit short code is rejected', JSON.stringify(rejShort1));

const rejShort2 = validatePhoneNumber('911');
assert(!rejShort2.isValid && rejShort2.reason === 'too_short', '3-digit emergency short code 911 is rejected', JSON.stringify(rejShort2));

// 5. Validation Rejection Tests: Invalid area codes
const rejArea0 = validatePhoneNumber('(014) 555-1234');
assert(!rejArea0.isValid && rejArea0.reason === 'invalid_area_code', 'Area code starting with 0 is rejected', JSON.stringify(rejArea0));

const rejArea1 = validatePhoneNumber('(114) 555-1234');
assert(!rejArea1.isValid && rejArea1.reason === 'invalid_area_code', 'Area code starting with 1 is rejected', JSON.stringify(rejArea1));

// 6. Validation Rejection Tests: N11 service codes as area code
const rejN11_211 = validatePhoneNumber('(211) 555-1234');
assert(!rejN11_211.isValid && rejN11_211.reason === 'invalid_area_code', 'Area code 211 is rejected as N11 service code', JSON.stringify(rejN11_211));

const rejN11_911 = validatePhoneNumber('(911) 555-1234');
assert(!rejN11_911.isValid && rejN11_911.reason === 'invalid_area_code', 'Area code 911 is rejected as N11 service code', JSON.stringify(rejN11_911));

// 7. Validation Rejection Tests: Invalid exchange code
const rejExchange0 = validatePhoneNumber('(314) 055-1234');
assert(!rejExchange0.isValid && rejExchange0.reason === 'invalid_exchange_code', 'Exchange code starting with 0 is rejected', JSON.stringify(rejExchange0));

const rejExchange1 = validatePhoneNumber('(314) 155-1234');
assert(!rejExchange1.isValid && rejExchange1.reason === 'invalid_exchange_code', 'Exchange code starting with 1 is rejected', JSON.stringify(rejExchange1));

console.log('\n=== [PHASE 31.5] ADAPTIVE GPS TELEMETRY THROTTLING TEST SUITE ===');

// 8. Adaptive throttle intervals
const intStationary = getAdaptiveThrottleIntervalMs(0);
assert(intStationary === 15000, 'Stationary vehicle (0 mph) sets 15-second throttle interval', `Got: ${intStationary}ms`);

const intSlow = getAdaptiveThrottleIntervalMs(12);
assert(intSlow === 15000, 'Low speed vehicle (12 mph <= 15) sets 15-second throttle interval', `Got: ${intSlow}ms`);

const intThreshold = getAdaptiveThrottleIntervalMs(15);
assert(intThreshold === 15000, 'Threshold speed vehicle (15 mph <= 15) sets 15-second throttle interval', `Got: ${intThreshold}ms`);

const intFast = getAdaptiveThrottleIntervalMs(16);
assert(intFast === 10000, 'Active transit vehicle (16 mph > 15) sets 10-second throttle interval', `Got: ${intFast}ms`);

const intHighway = getAdaptiveThrottleIntervalMs(65);
assert(intHighway === 10000, 'Highway speed vehicle (65 mph > 15) sets 10-second throttle interval', `Got: ${intHighway}ms`);

console.log('\n======================================================');
console.log(`TOTAL TESTS: ${passed + failures} | PASSED: ${passed} | FAILED: ${failures}`);
console.log('======================================================\n');

if (failures > 0) {
  process.exit(1);
}
