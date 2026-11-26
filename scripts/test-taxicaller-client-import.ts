/**
 * Unit Tests for TaxiCaller Historical Client Import Utility
 *
 * Run with:
 *   npx tsx scripts/test-taxicaller-client-import.ts
 */

import assert from 'node:assert/strict';
import {
  extractGateCode,
  extractTaxiCallerRows,
  formatPersonName,
  isEligibleSavedPlaceAddress,
  isTaxiCallerNoiseRow,
  parseTaxiCallerPhone,
  transformTaxiCallerRows,
  type TaxiCallerClientRow,
} from '../app/core/services/customer/taxicaller-import.util';
import type { CorporateAccountConfig } from '../app/core/types/config';

function runTests() {
  console.log('Running TaxiCaller client import unit tests...\n');

  // 1. Noise filtering
  assert.equal(isTaxiCallerNoiseRow({ passenger: 'Test User', phone: '3145550101' }), true);
  assert.equal(isTaxiCallerNoiseRow({ passenger: 'Jane Doe', info: 'Smoke House pickup' }), true);
  assert.equal(isTaxiCallerNoiseRow({ passenger: 'Jane Doe', from: '123 Main St, Chesterfield, MO' }), false);

  // 2. Phone parsing & invalid/placeholder filtering
  assert.equal(parseTaxiCallerPhone('314605'), null, 'Short phone < 10 digits should be rejected');
  assert.equal(parseTaxiCallerPhone('1234567890'), null, 'Placeholder phone should be rejected');
  assert.equal(parseTaxiCallerPhone('0000000000'), null, 'Repeated digit phone should be rejected');
  assert.deepEqual(parseTaxiCallerPhone('(314) 605-7994'), {
    key: '3146057994',
    e164: '+13146057994',
  });
  assert.deepEqual(parseTaxiCallerPhone('+1-314-605-7994'), {
    key: '3146057994',
    e164: '+13146057994',
  });

  // 3. Gate-code extraction
  assert.equal(extractGateCode('SW\nGate Code 5209'), '5209');
  assert.equal(extractGateCode('aa----gate #6789 ---gate located in ladue rd--'), '6789');
  assert.equal(extractGateCode('Gate code #4848 on arrival'), '4848');
  assert.equal(extractGateCode('Southwest Airlines checked bags'), null);

  // 4. Saved place eligibility (hubs & zip-only excluded)
  assert.equal(isEligibleSavedPlaceAddress('Lambert AP (17, RENZ)'), false);
  assert.equal(isEligibleSavedPlaceAddress('Spirit of St Louis Airport, Chesterfield, MO'), false);
  assert.equal(isEligibleSavedPlaceAddress('Smoke House, Chesterfield, MO'), false);
  assert.equal(isEligibleSavedPlaceAddress('63017'), false);
  assert.equal(isEligibleSavedPlaceAddress('16330 Copperwood Lane, Wildwood, MO 63040, USA'), true);

  // 4.5 Name capitalization
  assert.equal(formatPersonName('TIFFANY C DELANEY'), 'Tiffany C Delaney');
  assert.equal(formatPersonName('lynn finnie'), 'Lynn Finnie');
  assert.equal(formatPersonName('McCartie'), 'McCartie');
  assert.equal(formatPersonName("MARY-JANE O'CONNOR"), "Mary-Jane O'Connor");

  // 5. Full transform: deduplication, inclusion criteria, savedPlaces, gate codes, corporate link
  const mockCorpAccounts: CorporateAccountConfig[] = [
    {
      id: 'corp_171',
      accountNumber: '171',
      companyName: 'The Crescent Condos',
      billingCycle: 'net30',
      creditLimit: 5000,
      billingContactName: 'Front Desk',
      billingContactEmail: 'frontdesk@example.com',
      discountPercent: 0,
      poRequired: false,
      isActive: true,
    },
  ];

  const rows: TaxiCallerClientRow[] = [
    // Repeat client: older trip has first-name only, newer trip has full name in ALL CAPS
    {
      date: '01/01/2026 04:15 AM',
      passenger: 'Amily',
      phone: '3146057994',
      from: '16 Woodbridge Manor Road, Creve Coeur, MO, USA',
      to: 'Lambert AP (17, RENZ)',
      info: 'aa----gate #6789 ---gate located in ladue rd--',
    },
    {
      date: '01/15/2026 02:00 PM',
      passenger: 'AMILY CARTER',
      phone: '(314) 605-7994',
      from: 'Lambert AP (17, RENZ)',
      to: '16 woodbridge manor road, creve coeur, mo, usa.',
      info: 'SW checked bags',
    },
    // Single-trip client WITHOUT email or account -> should be excluded
    {
      date: '01/02/2026 09:00 AM',
      passenger: 'One Time',
      phone: '3147778888',
      from: '100 Main St, Ballwin, MO, USA',
      to: 'Lambert AP (17, RENZ)',
      info: '',
    },
    // Single-trip client WITH email -> should be included
    {
      date: '01/03/2026 10:00 AM',
      passenger: 'Email Rider',
      phone: '3148889999',
      'passenger.email': 'Rider@Example.COM',
      from: '500 Oak St, Kirkwood, MO 63122, USA',
      to: 'Lambert AP (17, RENZ)',
      info: '',
    },
    // Single-trip client WITH corporate account -> should be included & linked
    {
      date: '01/04/2026 05:00 AM',
      passenger: 'Stephen Wulf',
      phone: '(314) 941-1292',
      'account.name': '171',
      from: 'The Crescent Condos, Carondelet Plaza, Clayton, MO, USA',
      to: 'Lambert AP (17, RENZ)',
      info: 'acc171',
    },
    // Noise row -> filtered
    {
      date: '01/05/2026 01:00 PM',
      passenger: 'Test Dispatch',
      phone: '3142223333',
      from: '100 Test Rd, MO',
      to: 'Lambert AP (17, RENZ)',
      info: 'test',
    },
  ];

  const payloadRows = extractTaxiCallerRows({ root: { src_id: '', rows } });
  assert.equal(payloadRows.length, 6);

  const result = transformTaxiCallerRows(payloadRows, {
    corporateAccounts: mockCorpAccounts,
    nowMs: 1700000000000,
  });

  assert.equal(result.stats.totalRows, 6);
  assert.equal(result.stats.filteredNoiseRows, 1);
  assert.equal(result.stats.excludedSingleTripCount, 1);
  assert.equal(result.stats.includedContactsCount, 3);
  assert.equal(result.stats.corporateLinkedCount, 1);
  assert.equal(result.stats.gateCodeCount, 1);

  const amily = result.contacts.find((c) => c.id === 'tc_3146057994');
  assert.ok(amily, 'Amily Carter should be included and keyed by normalized 10-digit phone');
  assert.equal(amily.name, 'Amily Carter');
  assert.equal(amily.firstName, 'Amily');
  assert.equal(amily.lastName, 'Carter');
  assert.equal(amily.tripCount, 2);
  assert.equal(amily.savedPlaces?.length, 1, 'Duplicate street address variants should merge');
  assert.equal(amily.homeAddress, '16 woodbridge manor road, creve coeur, mo, usa.');
  assert.ok(amily.notes?.includes('6789'));
  assert.ok(amily.savedPlaces?.[0]?.notes?.includes('6789'));

  const emailRider = result.contacts.find((c) => c.id === 'tc_3148889999');
  assert.ok(emailRider);
  assert.equal(emailRider.email, 'rider@example.com');

  const corpRider = result.contacts.find((c) => c.id === 'tc_3149411292');
  assert.ok(corpRider);
  assert.equal(corpRider.corporateAccountId, 'corp_171');
  assert.equal(corpRider.corporateAccountNumber, '171');
  assert.equal(corpRider.corporateAccountName, 'The Crescent Condos');

  // Verify constructed trips (1 to 10 per customer) + STL location + confirmed after 2026-11-26
  const amilyTrips = result.trips.filter((t) => t.customerId === 'tc_3146057994');
  assert.equal(amilyTrips.length, 2);
  assert.equal(amilyTrips[0].status, 'completed');
  assert.equal(amilyTrips[0].passenger.firstName, 'Amily');
  assert.equal(amilyTrips[0].pickupLocation.address, 'St. Louis Lambert International Airport (STL)');
  assert.equal(amilyTrips[0].pickupLocation.placeId, 'canonical-lambert-stl');

  // Verify trips after 2026-11-26 are set to 'confirmed' instead of 'completed'
  const futureRows: TaxiCallerClientRow[] = [
    {
      date: '11/26/2026 08:00 AM',
      passenger: 'Future Rider',
      phone: '3145550188',
      from: '100 Main St, Chesterfield, MO, USA',
      to: 'Lambert AP (17, RENZ)',
    },
    {
      date: '11/27/2026 09:00 AM',
      passenger: 'Future Rider',
      phone: '3145550188',
      from: 'Lambert AP (17, RENZ)',
      to: '100 Main St, Chesterfield, MO, USA',
    },
  ];
  const futureResult = transformTaxiCallerRows(futureRows);
  assert.equal(futureResult.trips.length, 2);
  assert.equal(futureResult.trips[0].status, 'confirmed', 'Trip on 11/27/2026 should be confirmed');
  assert.equal(futureResult.trips[0].completedAt, undefined);
  assert.equal(futureResult.trips[0].payment.status, 'pending');
  assert.equal(futureResult.trips[1].status, 'completed', 'Trip on 11/26/2026 should be completed');

  // Verify 12 trips for one customer caps at 10 most recent trips
  const manyRows: TaxiCallerClientRow[] = Array.from({ length: 12 }, (_, idx) => ({
    date: `01/${String(idx + 1).padStart(2, '0')}/2026 08:00 AM`,
    passenger: 'FREQUENT FLYER',
    phone: '3145550199',
    from: `${100 + idx} Oak St, Chesterfield, MO, USA`,
    to: 'Lambert AP (17, RENZ)',
  }));
  const manyResult = transformTaxiCallerRows(manyRows);
  assert.equal(manyResult.contacts.length, 1);
  assert.equal(manyResult.contacts[0].name, 'Frequent Flyer');
  assert.equal(manyResult.contacts[0].tripCount, 12);
  assert.equal(manyResult.trips.length, 10, 'Should cap constructed trips at 10 per customer');

  console.log('✅ All TaxiCaller client import unit tests passed!');
}

runTests();
