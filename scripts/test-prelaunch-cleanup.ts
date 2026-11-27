/**
 * Unit Tests for Pre-Launch Cleanup Classifiers (Phase 107)
 *
 * Run with:
 *   npx tsx scripts/test-prelaunch-cleanup.ts
 */

import assert from 'node:assert/strict';
import {
  isMockTripRecord,
  isMockDriverRecord,
  isMockCorporateRecord,
  isMockContactOrCommsRecord,
} from './cleanup-prelaunch-test-data';

function runTests(): void {
  console.log('Running Phase 107 pre-launch cleanup classifier tests...\n');

  // 1. isMockTripRecord — positive cases
  assert.equal(isMockTripRecord('MOCK-12345', {}), true);
  assert.equal(isMockTripRecord('stress_booking_01', {}), true);
  assert.equal(
    isMockTripRecord('trip-999', { passenger: { email: 'test@example.com' } }),
    true
  );
  assert.equal(
    isMockTripRecord('trip-998', { pickupLocation: { address: '123 Test St' } }),
    true
  );
  assert.equal(
    isMockTripRecord('trip-997', { passenger: { phone: '555-0100' } }),
    true
  );
  assert.equal(
    isMockTripRecord('trip-996', { passenger: { firstName: 'Test4', lastName: 'User' } }),
    true
  );
  assert.equal(
    isMockTripRecord('trip-995', { passenger: { name: 'Test12 User' } }),
    true
  );

  // 1b. isMockTripRecord — negative (real production) cases
  assert.equal(
    isMockTripRecord('CT-2026-00412', {
      passenger: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@gmail.com',
        phone: '(314) 555-0199',
      },
      pickupLocation: { address: '1600 Clarkson Rd, Chesterfield, MO' },
    }),
    false
  );
  assert.equal(
    isMockTripRecord('real-trip-1', {
      passenger: { firstName: 'Tessa', lastName: 'Userman', email: 'tessa@chesterfield.org' },
    }),
    false
  );

  // 2. isMockDriverRecord — positive & negative cases
  assert.equal(isMockDriverRecord('drv-101', {}), true);
  assert.equal(isMockDriverRecord('drv-999', {}), true);
  assert.equal(isMockDriverRecord('demo-driver-1', {}), true);
  assert.equal(isMockDriverRecord('Cc5jehhcxuWxUx7Z3WyXNBXZjCy1', { email: 'zakharya@chesterfieldtaxi.com' }), false);
  assert.equal(isMockDriverRecord('ClUoGzOahXcnsIuNZ3kmP1wJ4aC3', { email: 'michael@chesterfieldtaxi.com' }), false);

  // 3. isMockCorporateRecord — positive & negative cases
  assert.equal(isMockCorporateRecord('corp-001', {}), true);
  assert.equal(isMockCorporateRecord('CORP-BAY-902', {}), true);
  assert.equal(
    isMockCorporateRecord('corp-acme-lookup', { billingEmail: 'ap@acme.example.com' }),
    true
  );
  assert.equal(
    isMockCorporateRecord('corp-002', {
      accountNumber: 'CORP-MRC-441',
      billingContactEmail: 'transport.billing@mercy.example.com',
      archiveReason: 'Mock',
    }),
    true
  );
  assert.equal(
    isMockCorporateRecord('corp-003', {
      accountNumber: 'CORP-DRY-108',
      billingContactEmail: 'guestservices.valley@druryhotels.example.com',
    }),
    true
  );
  assert.equal(
    isMockCorporateRecord('corp-bayer-stl', {
      accountCode: 'BAYER-STL',
      billingEmail: 'travel@bayer.com',
    }),
    false
  );
  assert.equal(
    isMockCorporateRecord('corp-101', {
      imported: true,
      accountNumber: 'CORP-101',
      billingContactEmail: 'ap@example.com',
    }),
    false
  );

  // 4. isMockContactOrCommsRecord — positive & negative cases
  assert.equal(isMockContactOrCommsRecord('MOCK-thread-1', {}), true);
  assert.equal(isMockContactOrCommsRecord('stress_event_7', {}), true);
  assert.equal(isMockContactOrCommsRecord('drv-101', {}), true);
  assert.equal(isMockContactOrCommsRecord('corp-001', {}), true);
  assert.equal(
    isMockContactOrCommsRecord('contact-1', { email: 'test@example.com' }),
    true
  );
  assert.equal(
    isMockContactOrCommsRecord('inquiry-2', { senderEmail: 'lead@demo.example.com' }),
    true
  );
  assert.equal(
    isMockContactOrCommsRecord('thread-3', { phone: '555-0100' }),
    true
  );
  assert.equal(
    isMockContactOrCommsRecord('ledger-4', { tripId: 'MOCK-555' }),
    true
  );
  assert.equal(
    isMockContactOrCommsRecord('inv-2026-002', {
      customerEmail: 'transport.billing@mercy.example.com',
      corporateAccountId: 'corp-002',
    }),
    true
  );
  assert.equal(
    isMockContactOrCommsRecord('contact-real-1', {
      email: 'dispatch@chesterfieldtaxi.com',
      phone: '(636) 348-0166',
      tripId: 'CT-2026-00412',
    }),
    false
  );

  console.log('✅ All Phase 107 pre-launch cleanup classifier tests passed.');
}

runTests();
