import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CorporateAccountService } from '../app/core/services/corporate-account.service';
import type { CorporateAccountConfig } from '../app/core/types/config';

const service = new CorporateAccountService();

function testRealCorporateAccountsJson() {
  const jsonPath = path.join(process.cwd(), 'corporate_accounts.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = service.parseCorporateAccountsJson(raw);

  assert.equal(parsed.length, 393, 'Expected all 393 accounts in corporate_accounts.json to parse');

  const acct7 = parsed.find((a) => a.accountNumber === 'CORP-7');
  assert.ok(acct7, 'Expected CORP-7 to exist');
  assert.equal(acct7.id, 'corp-7');
  assert.equal(acct7.companyName, 'Adrian Hartman');
  assert.equal(acct7.billingContactName, 'Accounts Payable');
  assert.equal(acct7.billingContactEmail, 'hartmanadrian705@gmail.com');
  assert.equal(acct7.billingAddress, '705 Cherry Tree Ln\nSt. Louis, MO 63132');
  assert.equal(acct7.poRequired, false);
  assert.equal(acct7.discountPercent, 0);
  assert.equal(acct7.creditLimit, 5000);
  assert.equal(acct7.billingCycle, 'net30');
  assert.equal(acct7.isActive, true);
  assert.ok(acct7.currentPoNumber?.startsWith('PO-'), 'Expected generated PO number');

  const acct101 = parsed.find((a) => a.accountNumber === 'CORP-101');
  assert.ok(acct101, 'Expected CORP-101 to exist');
  assert.equal(acct101.billingContactName, 'Jeff Barker');
  assert.equal(acct101.billingAddress, '355 Chesterfield CTR. E\nChesterfield, MO 63017');

  const acct104 = parsed.find((a) => a.accountNumber === 'CORP-104');
  assert.ok(acct104, 'Expected CORP-104 to exist');
  assert.equal(acct104.billingContactName, 'Accounts Payable');
  assert.equal(acct104.billingAddress, '1260 St. Paul Rd\nBallwin, MO 63021');

  const acct214 = parsed.find((a) => a.accountNumber === 'CORP-214');
  assert.ok(acct214, 'Expected CORP-214 (delivery) to exist');
  assert.equal(acct214.billingContactName, 'Vida Moel');
  assert.equal(acct214.notes, 'Account Type: delivery');

  console.log('✓ Real corporate_accounts.json parsing & normalization passed (393 accounts)');
}

function testSyntheticNormalizationAndErrors() {
  const sampleJson = JSON.stringify({
    '999': {
      name: '  Acme Logistics  ',
      address: 'Attn: Jane Doe<br/>123 Main St<br />Suite 400<BR>Chesterfield, MO 63017',
      type: 'delivery',
      email: 'billing@acme.example',
    },
    '1000': {
      name: '',
      address: 'Ignored',
    },
  });

  const parsed = service.parseCorporateAccountsJson(sampleJson);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].accountNumber, 'CORP-999');
  assert.equal(parsed[0].companyName, 'Acme Logistics');
  assert.equal(parsed[0].billingContactName, 'Jane Doe');
  assert.equal(parsed[0].billingAddress, '123 Main St\nSuite 400\nChesterfield, MO 63017');
  assert.equal(parsed[0].billingContactEmail, 'billing@acme.example');
  assert.equal(parsed[0].notes, 'Account Type: delivery');

  assert.throws(() => service.parseCorporateAccountsJson('{invalid json'), /Invalid JSON/);
  assert.throws(() => service.parseCorporateAccountsJson('[]'), /Expected a JSON object/);

  console.log('✓ Synthetic <br/>, Attn:, delivery, and error handling passed');
}

function testMergePreservesOperationalState() {
  const existing: CorporateAccountConfig[] = [
    {
      id: 'corp-101',
      companyName: 'Old Drury Name',
      accountNumber: 'corp-101', // lowercase to verify case-insensitive match
      billingCycle: 'net60',
      creditLimit: 25000,
      billingContactName: 'Custom Travel Manager',
      billingContactEmail: 'existing@drury.example',
      discountPercent: 12,
      poRequired: true,
      currentPoNumber: 'PO-DRUR-112233',
      poGeneratedAt: '2026-01-01T00:00:00.000Z',
      poExpiresAt: '2027-01-01T00:00:00.000Z',
      poNumberHistory: [
        {
          poNumber: 'PO-DRUR-000001',
          generatedAt: '2025-01-01T00:00:00.000Z',
          rotatedAt: '2026-01-01T00:00:00.000Z',
          rotatedBy: 'admin@chesterfieldtaxi.com',
          reason: 'Annual rotation',
        },
      ],
      bookingPin: 'DRUR99',
      isActive: false,
      authorizedBookers: ['booker@drury.example'],
      authorizedRiders: [{ id: 'r1', name: 'Rider One', isVip: true }],
      costCenters: ['CC-TRAVEL'],
      savedCompanyLocations: [{ id: 'loc1', label: 'HQ', address: '1 Drury Way' }],
      portalManagers: [
        {
          uid: 'u1',
          email: 'mgr@drury.example',
          name: 'Mgr',
          provisionedAt: '2026-01-01T00:00:00.000Z',
          status: 'active',
        },
      ],
    },
    {
      id: 'corp-104',
      companyName: 'Castlewood Old',
      accountNumber: 'CORP-104',
      billingCycle: 'net30',
      creditLimit: 5000,
      billingContactName: 'Accounts Payable',
      billingContactEmail: '',
      discountPercent: 0,
      poRequired: false,
      isActive: true,
    },
  ];

  const incoming = service.parseCorporateAccountsJson(
    JSON.stringify({
      '101': {
        name: 'Drury Plaza Hotel',
        address: 'Attn: Jeff Barker<br>355 Chesterfield CTR. E<br>Chesterfield, MO 63017',
        type: 'standard',
      },
      '104': {
        name: 'Castlewood Treatment Center',
        address: 'Attn: Jane Smith<br>1260 St. Paul Rd<br>Ballwin, MO 63021',
        type: 'standard',
        email: 'ap@castlewood.example',
      },
      '999': {
        name: 'Brand New Corp',
        address: '100 New Way<br>St. Louis, MO 63101',
        type: 'delivery',
      },
    })
  );

  // Add an invalid incoming item to verify skippedCount
  const invalidIncoming: CorporateAccountConfig = {
    id: '',
    companyName: '',
    accountNumber: '',
    billingCycle: 'net30',
    creditLimit: 5000,
    billingContactName: 'Accounts Payable',
    billingContactEmail: '',
    discountPercent: 0,
    poRequired: false,
    isActive: true,
  };

  const result = service.mergeCorporateAccounts(existing, [...incoming, invalidIncoming]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.updatedCount, 2);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.merged.length, 3);

  const updated101 = result.merged.find((a) => a.id === 'corp-101')!;
  assert.equal(updated101.companyName, 'Drury Plaza Hotel');
  assert.equal(updated101.billingAddress, '355 Chesterfield CTR. E\nChesterfield, MO 63017');
  assert.equal(updated101.billingContactEmail, 'existing@drury.example', 'Empty incoming email must preserve existing');
  assert.equal(updated101.billingContactName, 'Custom Travel Manager', 'Non-default contact name must be preserved');
  assert.equal(updated101.poRequired, true);
  assert.equal(updated101.currentPoNumber, 'PO-DRUR-112233');
  assert.equal(updated101.poExpiresAt, '2027-01-01T00:00:00.000Z');
  assert.equal(updated101.poNumberHistory?.length, 1);
  assert.equal(updated101.bookingPin, 'DRUR99');
  assert.equal(updated101.creditLimit, 25000);
  assert.equal(updated101.discountPercent, 12);
  assert.equal(updated101.billingCycle, 'net60');
  assert.equal(updated101.isActive, false);
  assert.deepEqual(updated101.authorizedBookers, ['booker@drury.example']);
  assert.equal(updated101.authorizedRiders?.length, 1);
  assert.deepEqual(updated101.costCenters, ['CC-TRAVEL']);
  assert.equal(updated101.savedCompanyLocations?.length, 1);
  assert.equal(updated101.portalManagers?.length, 1);

  const updated104 = result.merged.find((a) => a.id === 'corp-104')!;
  assert.equal(updated104.billingContactName, 'Jane Smith', 'Accounts Payable should be replaced by incoming contact');
  assert.equal(updated104.billingContactEmail, 'ap@castlewood.example');

  const added999 = result.merged.find((a) => a.accountNumber === 'CORP-999')!;
  assert.equal(added999.notes, 'Account Type: delivery');

  console.log('✓ Upsert merge & operational state preservation passed');
}

testRealCorporateAccountsJson();
testSyntheticNormalizationAndErrors();
testMergePreservesOperationalState();
console.log('\n✅ All corporate JSON import tests passed!');
