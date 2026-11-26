/**
 * Unit Tests for Comma Passenger Name Normalization (Phase 103)
 *
 * Run with:
 *   npx tsx scripts/test-fix-comma-passenger-names.ts
 */

import assert from 'node:assert/strict';
import { flipCommaName } from './fix-comma-passenger-names';

function runTests(): void {
  console.log('Running flipCommaName() unit tests...\n');

  // 1. Standard "Last, First"
  assert.deepEqual(flipCommaName('Doe, John'), {
    changed: true,
    value: 'John Doe',
  });
  assert.deepEqual(flipCommaName('  Smith ,  Alice  '), {
    changed: true,
    value: 'Alice Smith',
  });

  // 2. Multi-word first/last names
  assert.deepEqual(flipCommaName('Van Der Berg, Mary Jane'), {
    changed: true,
    value: 'Mary Jane Van Der Berg',
  });
  assert.deepEqual(flipCommaName('De La Cruz, Carlos Alberto'), {
    changed: true,
    value: 'Carlos Alberto De La Cruz',
  });

  // 3. Suffixes (Jr., Sr., II, III, IV, PhD, MD) — must be skipped
  for (const raw of [
    'Smith, Jr.',
    'Smith, Jr',
    'Smith, John Jr.',
    'Jones, Sr.',
    'Williams, II',
    'Williams, III',
    'Brown, IV',
    'Taylor, PhD',
    'Wilson, MD',
  ]) {
    const res = flipCommaName(raw);
    assert.equal(res.changed, false, `Expected suffix name "${raw}" not to be flipped`);
    assert.equal(res.value, raw);
    assert.equal(res.skippedReason, 'suffix_or_corporate');
  }

  // 4. Corporate designators (LLC, Inc, Corp, Ltd) — must be skipped
  for (const raw of [
    'Acme Transport, LLC',
    'Global Mobility, Inc.',
    'Global Mobility, Inc',
    'Chesterfield Holdings, Corp',
    'Summit Partners, Ltd.',
  ]) {
    const res = flipCommaName(raw);
    assert.equal(res.changed, false, `Expected corporate name "${raw}" not to be flipped`);
    assert.equal(res.value, raw);
    assert.equal(res.skippedReason, 'suffix_or_corporate');
  }

  // 5. Multiple commas — must be skipped
  const multiComma = flipCommaName('Smith, John, Jr.');
  assert.deepEqual(multiComma, {
    changed: false,
    value: 'Smith, John, Jr.',
    skippedReason: 'multiple_commas',
  });

  // 6. Empty left/right segment — must be skipped
  assert.deepEqual(flipCommaName('Smith,'), {
    changed: false,
    value: 'Smith,',
    skippedReason: 'empty_segment',
  });
  assert.deepEqual(flipCommaName(', John'), {
    changed: false,
    value: ', John',
    skippedReason: 'empty_segment',
  });

  // 7. Unchanged names (no comma)
  assert.deepEqual(flipCommaName('Elena Vance'), {
    changed: false,
    value: 'Elena Vance',
  });
  assert.deepEqual(flipCommaName(''), {
    changed: false,
    value: '',
  });

  console.log('✅ All flipCommaName() tests passed.');
}

runTests();
