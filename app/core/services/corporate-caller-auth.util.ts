import type { CorporateAccountConfig, CorporateAuthorizedRider } from '../types/config';
import type { PoValidationResult } from './corporate-account.service';

export interface CorporateRosterMatchDetail {
  matched: boolean;
  source: 'authorized_rider' | 'portal_manager' | 'authorized_booker' | 'billing_contact' | null;
  matchedBy: 'phone' | 'email' | null;
  matchedValue?: string;
  personName?: string;
  badgeLabel: string;
}

export interface EvaluateCorporateCallerVerificationInput {
  account?: CorporateAccountConfig | null;
  callerPhone?: string | null;
  passengerPhone?: string | null;
  passengerEmail?: string | null;
  bookerPhone?: string | null;
  bookerEmail?: string | null;
  enteredPin?: string | null;
  selectedRiderId?: string | null;
  selectedCostCenter?: string | null;
  allowPoOverride?: boolean;
  poValidation?: PoValidationResult | null;
}

export interface CorporateCallerVerificationResult {
  hasAccount: boolean;
  rosterMatch: CorporateRosterMatchDetail;
  rosterMatched: boolean;
  pinConfigured: boolean;
  pinVerified: boolean;
  pinStatus: 'not_configured' | 'pending' | 'verified' | 'mismatch';
  riderSelected: boolean;
  selectedRider: CorporateAuthorizedRider | null;
  costCenterSelected: boolean;
  selectedCostCenter: string | null;
  poStatus: 'verified' | 'not_required' | 'mismatch' | 'revoked' | 'overridden' | 'missing';
  poVerified: boolean;
  poSatisfied: boolean;
  verifiedSignalCount: number;
  isVerifiedCaller: boolean;
  isBlocked: boolean;
  blockReason?: string;
}

export function normalizeCorporateBookingPin(pin?: string | null): string {
  return String(pin || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
}

export function isValidCorporateBookingPin(pin?: string | null): boolean {
  return /^[A-Za-z0-9]{4,8}$/.test(String(pin || '').trim());
}

export function formatInheritedCorporateBillingTerms(
  billingCycle?: CorporateAccountConfig['billingCycle'] | null
): string {
  if (billingCycle === 'immediate') return 'Immediate Direct Bill';
  if (billingCycle === 'net15') return 'Net 15 Direct Bill';
  if (billingCycle === 'net60') return 'Net 60 Direct Bill';
  return 'Net 30 Direct Bill';
}

function normPhone(raw?: string | null): string {
  const d = String(raw || '').replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  return ten.length >= 7 ? ten : '';
}

function normEmail(raw?: string | null): string {
  const c = String(raw || '').trim().toLowerCase();
  return c.includes('@') && c.length >= 5 ? c : '';
}

export function searchCorporateAccounts(
  accounts: ReadonlyArray<CorporateAccountConfig>,
  query?: string | null
): CorporateAccountConfig[] {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];
  const rawQuery = String(query || '').trim().toLowerCase();
  const strippedHash = rawQuery.replace(/^#+/, '').trim();
  if (!rawQuery || !strippedHash) return [...accounts];

  const scored: Array<{ acc: CorporateAccountConfig; rank: number; idx: number }> = [];
  accounts.forEach((acc, idx) => {
    const acctNum = String(acc.accountNumber || '').toLowerCase();
    const company = String(acc.companyName || '').toLowerCase();
    const acctDigits = acctNum.replace(/^corp-/, '');
    let rank = 99;
    if (acctNum === strippedHash || acctDigits === strippedHash) rank = 0;
    else if (acctNum.startsWith(strippedHash) || acctDigits.startsWith(strippedHash)) rank = 1;
    else if (company.startsWith(rawQuery)) rank = 2;
    else if (acctNum.includes(strippedHash)) rank = 3;
    else if (company.includes(rawQuery)) rank = 4;
    if (rank < 99) scored.push({ acc, rank, idx });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.idx - b.idx).map((e) => e.acc);
}

function makeRosterHit(
  source: NonNullable<CorporateRosterMatchDetail['source']>,
  matchedBy: 'phone' | 'email',
  matchedValue?: string,
  personName?: string
): CorporateRosterMatchDetail {
  return { matched: true, source, matchedBy, matchedValue, personName, badgeLabel: '✓ Verified Roster Match' };
}

export function evaluateCorporateCallerVerification(
  input: EvaluateCorporateCallerVerificationInput
): CorporateCallerVerificationResult {
  const account = input.account ?? null;
  const phones = [normPhone(input.callerPhone), normPhone(input.passengerPhone), normPhone(input.bookerPhone)].filter(Boolean);
  const emails = [normEmail(input.passengerEmail), normEmail(input.bookerEmail)].filter(Boolean);
  let rosterMatch: CorporateRosterMatchDetail = { matched: false, source: null, matchedBy: null, badgeLabel: 'Unverified Caller' };

  if (account) {
    for (const r of account.authorizedRiders || []) {
      if (normPhone(r.phone) && phones.includes(normPhone(r.phone))) {
        rosterMatch = makeRosterHit('authorized_rider', 'phone', r.phone, r.name);
        break;
      }
      if (normEmail(r.email) && emails.includes(normEmail(r.email))) {
        rosterMatch = makeRosterHit('authorized_rider', 'email', r.email, r.name);
        break;
      }
    }
    if (!rosterMatch.matched) {
      for (const pm of account.portalManagers || []) {
        if (normEmail(pm.email) && emails.includes(normEmail(pm.email))) {
          rosterMatch = makeRosterHit('portal_manager', 'email', pm.email, pm.name);
          break;
        }
      }
    }
    if (!rosterMatch.matched) {
      for (const b of account.authorizedBookers || []) {
        const be = normEmail(b);
        const bp = !be ? normPhone(b) : '';
        if (be && emails.includes(be)) { rosterMatch = makeRosterHit('authorized_booker', 'email', b, b); break; }
        if (bp && phones.includes(bp)) { rosterMatch = makeRosterHit('authorized_booker', 'phone', b, b); break; }
      }
    }
    if (!rosterMatch.matched) {
      if (normPhone(account.billingContactPhone) && phones.includes(normPhone(account.billingContactPhone))) {
        rosterMatch = makeRosterHit('billing_contact', 'phone', account.billingContactPhone, account.billingContactName);
      } else if (normEmail(account.billingContactEmail) && emails.includes(normEmail(account.billingContactEmail))) {
        rosterMatch = makeRosterHit('billing_contact', 'email', account.billingContactEmail, account.billingContactName);
      }
    }
  }

  const expectedPin = normalizeCorporateBookingPin(account?.bookingPin);
  const pinConfigured = Boolean(account && expectedPin.length >= 4);
  const candidatePin = normalizeCorporateBookingPin(input.enteredPin);
  const pinStatus: CorporateCallerVerificationResult['pinStatus'] = !pinConfigured
    ? 'not_configured'
    : !candidatePin
    ? 'pending'
    : candidatePin === expectedPin
    ? 'verified'
    : 'mismatch';
  const pinVerified = pinStatus === 'verified';

  const riderKey = String(input.selectedRiderId || '').trim();
  const selectedRider = account && riderKey
    ? (account.authorizedRiders || []).find((r) => r.id === riderKey || r.email === riderKey || r.name === riderKey) || null
    : null;
  const riderSelected = Boolean(selectedRider);
  const ccVal = String(input.selectedCostCenter || '').trim();
  const costCenterSelected = Boolean(account && ccVal && (account.costCenters || []).includes(ccVal));

  const poCheck = input.poValidation;
  let poStatus: CorporateCallerVerificationResult['poStatus'] = 'not_required';
  if (poCheck?.status === 'expired_revoked') poStatus = 'revoked';
  else if (poCheck?.status === 'valid') poStatus = 'verified';
  else if (poCheck?.status === 'mismatch') poStatus = input.allowPoOverride ? 'overridden' : 'mismatch';
  else if (account?.poRequired && !poCheck) poStatus = 'missing';
  const poVerified = poStatus === 'verified';
  const poSatisfied = poStatus === 'verified' || poStatus === 'not_required' || poStatus === 'overridden';

  const verifiedSignalCount = (rosterMatch.matched ? 1 : 0) + (pinVerified ? 1 : 0) + (riderSelected ? 1 : 0) + (poVerified ? 1 : 0);
  let blockReason: string | undefined;
  if (account?.isActive === false) blockReason = 'Corporate account is currently paused/inactive.';
  else if (poStatus === 'revoked') blockReason = poCheck?.message || 'Revoked PO detected.';
  else if (pinConfigured && pinStatus === 'mismatch') blockReason = 'Entered Verbal Booking PIN does not match account PIN.';
  else if (account?.poRequired && (poStatus === 'mismatch' || poStatus === 'missing')) {
    blockReason = poCheck?.message || 'Valid PO required for this corporate account.';
  }

  const isBlocked = Boolean(!account || blockReason);
  return {
    hasAccount: Boolean(account),
    rosterMatch,
    rosterMatched: rosterMatch.matched,
    pinConfigured,
    pinVerified,
    pinStatus,
    riderSelected,
    selectedRider,
    costCenterSelected,
    selectedCostCenter: costCenterSelected ? ccVal : null,
    poStatus,
    poVerified,
    poSatisfied,
    verifiedSignalCount,
    isVerifiedCaller: Boolean(account && !isBlocked && verifiedSignalCount >= 1),
    isBlocked,
    blockReason,
  };
}
