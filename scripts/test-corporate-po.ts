/**
 * Automated Test Suite for Corporate Accounts & PO Anti-Fraud Regeneration
 */

import { CorporateAccountService } from '../app/core/services/corporate-account.service';
import type { CorporateAccountConfig } from '../app/core/types/config';

let passed = 0;
let total = 0;

function assert(condition: boolean, msg: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${msg}`);
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('🧪 TESTING CORPORATE PO GENERATION, ROTATION & FRAUD PREVENTION');
  console.log('===============================================================\n');

  const service = new CorporateAccountService();

  // Test 1: PO Generation Format
  console.log('--- Test 1: Secure PO Generation ---');
  const po1 = service.generateSecurePoNumber('Liberty Mutual Group', 'CORP-100');
  const po2 = service.generateSecurePoNumber('Drury Inns, Inc', 'CORP-102');
  assert(po1.startsWith('PO-LMG-'), `po1 should start with PO-LMG-, got: ${po1}`);
  assert(po2.startsWith('PO-DII-'), `po2 should start with PO-DII-, got: ${po2}`);
  assert(po1 !== po2, 'Generated PO numbers must be unique');

  // Test 2: CSV Parsing with options
  console.log('\n--- Test 2: CSV Parsing & User Directives ---');
  const sampleCsv = `Account ID,Customer,Active,Account Type,First Name,Last Name,Phone,Address,Contact Email,Info,Payment Type,Default Cost Code,Parent Account
"100","Liberty Mutual Group","Yes","Corporate","Accounts","Payable","6362366191","10733 Sunset Office Dr. Suite 410, St. Louis, MO 63127","","","Billed","",""
"102","Drury Inns, Inc","Yes","Corporate","","","","380 Mulholland Dr, St Charles, MO 63303","dph.stc.178.gm@druryhotels.com","","Billed","",""`;

  const parsed = service.parseCorporateAccountsCsv(sampleCsv, {
    poRequired: false,
    discountPercent: 0,
    creditLimit: 5000,
  });

  assert(parsed.length === 2, `Should parse 2 accounts, got ${parsed.length}`);
  assert(parsed[0].poRequired === false, 'poRequired should be false as requested by user');
  assert(parsed[0].discountPercent === 0, 'discountPercent should be 0 as requested by user');
  assert(parsed[0].creditLimit === 5000, 'creditLimit should be $5,000');
  assert(Boolean(parsed[0].currentPoNumber), 'Should have generated currentPoNumber');
  assert(parsed[0].accountNumber === 'CORP-100', `Account number should be CORP-100, got ${parsed[0].accountNumber}`);

  // Test 3: Anti-Fraud PO Validation Logic
  console.log('\n--- Test 3: PO Anti-Fraud Validation ---');
  const testAccount: CorporateAccountConfig = {
    id: 'corp-test-1',
    companyName: 'Bayer CropScience',
    accountNumber: 'CORP-BAY-001',
    billingCycle: 'net30',
    creditLimit: 10000,
    billingContactName: 'Finance Dept',
    billingContactEmail: 'finance@bayer.com',
    discountPercent: 0,
    poRequired: true, // PO required for this test
    currentPoNumber: 'PO-BAY-900100',
    poGeneratedAt: new Date().toISOString(),
    poNumberHistory: [
      {
        poNumber: 'PO-BAY-OLD-REVOKED',
        generatedAt: '2026-01-01T00:00:00.000Z',
        rotatedAt: '2026-02-01T00:00:00.000Z',
        rotatedBy: 'admin@chesterfieldtaxi.com',
        reason: 'Compromised PO - revoked to prevent fraud billing',
      },
    ],
    isActive: true,
  };

  // 3a. Valid current PO
  const validRes = service.validateCorporatePo(testAccount, 'PO-BAY-900100');
  assert(validRes.valid === true, 'Current PO should be valid');
  assert(validRes.status === 'valid', 'Status should be valid');

  // 3b. Fraud / Revoked PO detection
  const fraudRes = service.validateCorporatePo(testAccount, 'PO-BAY-OLD-REVOKED');
  assert(fraudRes.valid === false, 'Revoked PO must be rejected');
  assert(fraudRes.status === 'expired_revoked', `Revoked PO must be flagged as expired_revoked, got: ${fraudRes.status}`);
  assert(fraudRes.message.includes('FRAUD ALERT'), 'Message should contain FRAUD ALERT');

  // 3c. Random mismatch
  const mismatchRes = service.validateCorporatePo(testAccount, 'PO-RANDOM-FAKE');
  assert(mismatchRes.valid === false, 'Random PO must be rejected');
  assert(mismatchRes.status === 'mismatch', 'Status should be mismatch');

  // 3d. PO Not Required
  const noPoAccount = { ...testAccount, poRequired: false };
  const notReqRes = service.validateCorporatePo(noPoAccount, '');
  assert(notReqRes.valid === true, 'PO not required should pass');
  assert(notReqRes.status === 'not_required', 'Status should be not_required');

  console.log('\n===============================================================');
  console.log(`🎉 ALL ${passed}/${total} CORPORATE ACCOUNT & PO TESTS PASSED!`);
  console.log('===============================================================\n');
}

runTests();
