/**
 * Unit Tests for formatPhoneDisplay() (Phase 103)
 *
 * Run with:
 *   npx tsx scripts/test-format-phone-display.ts
 */

import assert from 'node:assert/strict';
import { formatPhoneDisplay } from '../app/core/utils/phone.util';

function runTests(): void {
  console.log('Running formatPhoneDisplay() unit tests...\n');

  // 1. Standard US/NANP inputs -> (636) 348-0166
  assert.equal(formatPhoneDisplay('+16363480166'), '(636) 348-0166');
  assert.equal(formatPhoneDisplay('16363480166'), '(636) 348-0166');
  assert.equal(formatPhoneDisplay('6363480166'), '(636) 348-0166');
  assert.equal(formatPhoneDisplay('(636) 348-0166'), '(636) 348-0166');
  assert.equal(formatPhoneDisplay('636-348-0166'), '(636) 348-0166');
  assert.equal(formatPhoneDisplay(' +1 (636) 348-0166 '), '(636) 348-0166');

  // 2. International numbers -> returned as-is
  assert.equal(formatPhoneDisplay('+442079460958'), '+442079460958');
  assert.equal(formatPhoneDisplay('+33 1 42 68 55 00'), '+33 1 42 68 55 00');

  // 3. Empty, partial, or malformed strings -> returned safely
  assert.equal(formatPhoneDisplay(''), '');
  assert.equal(formatPhoneDisplay('   '), '');
  assert.equal(formatPhoneDisplay(null), '');
  assert.equal(formatPhoneDisplay(undefined), '');
  assert.equal(formatPhoneDisplay('636348'), '636348');
  assert.equal(formatPhoneDisplay('No phone'), 'No phone');

  console.log('✅ All formatPhoneDisplay() tests passed.');
}

runTests();
