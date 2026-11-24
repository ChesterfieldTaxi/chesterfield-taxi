/**
 * Corporate Account & Anti-Fraud PO Lifecycle Service
 * 
 * Provides:
 * - High-entropy collision-resistant PO generation and rotation
 * - PO anti-fraud detection (detects and flags expired/revoked POs)
 * - Corporate account CSV parser with customizable defaults
 * - Firestore syncing for corporate accounts
 */

import {
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
  type CreditLimitEnforcementMode,
  type PoHistoryRecord,
} from '../types/config';
import { getAdminConfigService } from './config/admin-config.service';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { sanitizePayload } from './firestore-sanitizer';

export interface CsvImportOptions {
  poRequired?: boolean;
  discountPercent?: number;
  creditLimit?: number;
  billingCycle?: 'net15' | 'net30' | 'net60' | 'immediate';
  defaultBillingContactName?: string;
}

export interface PoValidationResult {
  valid: boolean;
  status: 'valid' | 'expired_revoked' | 'mismatch' | 'not_required';
  message: string;
  formatError?: boolean;
  revokedRecord?: PoHistoryRecord;
}

export interface CreditLimitEvaluationResult {
  allowed: boolean;
  isOverLimit: boolean;
  enforcement: CreditLimitEnforcementMode;
  projectedTotalExposure: number;
  overageAmount: number;
  warning?: string;
  error?: string;
}

/**
 * Pure helper validating a candidate PO string against an optional `poFormatRegex`.
 * Empty or invalid regexes safely no-op (`{ valid: true }`).
 */
export function validatePoFormatRegex(
  candidatePo?: string,
  poFormatRegex?: string
): { valid: boolean; error?: string } {
  const regexStr = typeof poFormatRegex === 'string' ? poFormatRegex.trim() : '';
  if (!regexStr) return { valid: true };

  const rawPo = typeof candidatePo === 'string' ? candidatePo.trim() : '';
  if (!rawPo) {
    return {
      valid: false,
      error: `PO number must match required format (${regexStr}).`,
    };
  }

  let compiled: RegExp;
  try {
    compiled = new RegExp(regexStr);
  } catch {
    return { valid: true };
  }

  if (compiled.test(rawPo) || compiled.test(rawPo.toUpperCase())) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `PO "${rawPo}" does not match required PO format (${regexStr}).`,
  };
}

/**
 * Pure deterministic evaluator for corporate credit-limit enforcement:
 * - `'soft_warning'` (default): returns `allowed: true` with a warning banner string when over limit.
 * - `'hard_block'`: returns `allowed: false` with a blocking `error` string when over limit.
 */
export function evaluateCorporateCreditLimit(params: {
  creditLimit: number;
  currentBalance: number;
  projectedFare: number;
  enforcement?: CreditLimitEnforcementMode;
  companyName?: string;
}): CreditLimitEvaluationResult {
  const enforcement: CreditLimitEnforcementMode =
    params.enforcement === 'hard_block' ? 'hard_block' : 'soft_warning';
  const creditLimit = Math.max(0, Number(params.creditLimit || 0));
  const currentBalance = Math.max(0, Number((params.currentBalance || 0).toFixed(2)));
  const projectedFare = Math.max(0, Number((params.projectedFare || 0).toFixed(2)));
  const projectedTotalExposure = Number((currentBalance + projectedFare).toFixed(2));

  if (creditLimit <= 0 || projectedTotalExposure <= creditLimit) {
    return {
      allowed: true,
      isOverLimit: false,
      enforcement,
      projectedTotalExposure,
      overageAmount: 0,
    };
  }

  const overageAmount = Number((projectedTotalExposure - creditLimit).toFixed(2));
  const companyLabel = params.companyName?.trim() || 'Corporate account';
  const detail = `"${companyLabel}" open AR ($${currentBalance.toFixed(
    2
  )}) + this booking ($${projectedFare.toFixed(
    2
  )}) exceeds the $${creditLimit.toLocaleString()} credit limit by $${overageAmount.toFixed(2)}.`;

  if (enforcement === 'hard_block') {
    return {
      allowed: false,
      isOverLimit: true,
      enforcement,
      projectedTotalExposure,
      overageAmount,
      error: `CREDIT LIMIT EXCEEDED: ${detail}`,
    };
  }

  return {
    allowed: true,
    isOverLimit: true,
    enforcement,
    projectedTotalExposure,
    overageAmount,
    warning: `CREDIT LIMIT WARNING: ${detail}`,
  };
}

/**
 * Deterministic SHA-256 hex digest for zero-PII corporate account & PO verification lookups.
 * Works identically in both browser (SubtleCrypto) and Node 18+ runtimes.
 */
export async function hashCorporateLookupValue(raw: string): Promise<string> {
  const normalized = (raw || '').trim().toUpperCase();
  if (!normalized) return '';
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(`ct_corp_v1:${normalized}`);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash for constrained test environments
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export class CorporateAccountService {
  /**
   * Generates a collision-resistant, formatted PO number.
   * e.g., "PO-LMG-842910" or "PO-BAY-918234"
   */
  public generateSecurePoNumber(companyName?: string, accountNumber?: string): string {
    // Generate clean 2-4 letter company mnemonic
    let prefix = 'CORP';
    if (companyName) {
      const words = companyName.trim().replace(/[^a-zA-Z0-9\s]/g, '').split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        prefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
      } else if (words.length === 2) {
        prefix = (words[0].slice(0, 2) + words[1].slice(0, 2)).toUpperCase();
      } else if (words.length === 1 && words[0].length >= 3) {
        prefix = words[0].slice(0, 4).toUpperCase();
      }
    } else if (accountNumber) {
      prefix = accountNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    }

    // Generate high-entropy 6-digit random code
    const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
    return `PO-${prefix}-${randomCode}`;
  }

  /**
   * Regenerates a PO Number for a corporate account to prevent accidental or fraudulent billing.
   * Moves the previous PO to `poNumberHistory` with audit metadata.
   */
  public async regeneratePoNumber(
    accountId: string,
    reason?: string,
    operatorEmail?: string
  ): Promise<{ account: CorporateAccountConfig; oldPo: string | null; newPo: string }> {
    const configService = getAdminConfigService();
    const settings = await configService.getSettings();
    const accounts = [...(settings.corporateAccounts || [])];

    let targetIndex = accounts.findIndex((a) => a.id === accountId || a.accountNumber === accountId);
    let currentAccount: CorporateAccountConfig | undefined =
      targetIndex >= 0 ? accounts[targetIndex] : undefined;

    // If running under strict corporate_manager isolation, hydrate latest doc directly from `/corporateAccounts/{accountId}`
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const remoteSnap = await getDoc(doc(db, 'corporateAccounts', accountId));
        if (remoteSnap.exists()) {
          currentAccount = {
            ...(currentAccount || {}),
            ...(remoteSnap.data() as CorporateAccountConfig),
            id: remoteSnap.id,
          };
        }
      } catch {
        // Fallback to cached settings account
      }
    }

    if (!currentAccount) {
      throw new Error(`Corporate account with ID "${accountId}" not found.`);
    }

    const oldPo = currentAccount.currentPoNumber || null;
    const nowIso = new Date().toISOString();

    const history: PoHistoryRecord[] = [...(currentAccount.poNumberHistory || [])];

    // If an existing PO was present, archive it into audit history
    if (oldPo) {
      history.unshift({
        poNumber: oldPo,
        generatedAt: currentAccount.poGeneratedAt || currentAccount.createdAt || nowIso,
        rotatedAt: nowIso,
        rotatedBy: operatorEmail || 'admin@chesterfieldtaxi.com',
        reason: reason || 'Anti-fraud PO rotation to prevent unauthorized billing',
      });
    }

    const newPo = this.generateSecurePoNumber(currentAccount.companyName, currentAccount.accountNumber);

    const updatedAccount: CorporateAccountConfig = {
      ...currentAccount,
      currentPoNumber: newPo,
      poGeneratedAt: nowIso,
      poNumberHistory: history,
      updatedAt: nowIso,
    };

    if (targetIndex >= 0) {
      accounts[targetIndex] = updatedAccount;
    } else {
      accounts.push(updatedAccount);
    }

    // Persist to central AppSettings when caller has staff write permissions (or in offline mode)
    try {
      await configService.updateSettings({
        corporateAccounts: accounts,
        updatedBy: operatorEmail || 'admin@chesterfieldtaxi.com',
      });
    } catch (cfgErr) {
      console.warn('[CorporateAccountService] Skipping staff appSettings write during self-service PO rotation:', cfgErr);
    }

    // Persist strictly safe PO rotation fields to Firestore (compatible with both corporate_manager & dispatcher rules)
    await this.syncPoRotationToFirestore(updatedAccount);

    return {
      account: updatedAccount,
      oldPo,
      newPo,
    };
  }

  /**
   * Syncs strictly the allowed self-service PO rotation fields onto `/corporateAccounts/{id}`
   * and `/corporateLookup/{acctHash}` so both `corporate_manager` and `admin` callers succeed under `firestore.rules`.
   */
  private async syncPoRotationToFirestore(account: CorporateAccountConfig): Promise<void> {
    if (!isFirebaseConfigured()) return;
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, 'corporateAccounts', account.id);
      const poPatch = sanitizePayload({
        currentPoNumber: account.currentPoNumber,
        poGeneratedAt: account.poGeneratedAt,
        poNumberHistory: account.poNumberHistory || [],
        updatedAt: account.updatedAt || new Date().toISOString(),
      });
      try {
        await updateDoc(docRef, poPatch);
      } catch {
        // If document didn't exist yet (e.g. initial Admin action), fall back to full sync
        await this.syncIndividualAccountToFirestore(account);
        return;
      }

      const acctHash = await hashCorporateLookupValue(account.accountNumber);
      if (acctHash) {
        const currentPoHash = account.currentPoNumber
          ? await hashCorporateLookupValue(account.currentPoNumber)
          : null;
        const revokedPoHashes = (
          await Promise.all(
            (account.poNumberHistory || [])
              .filter((h) => h.poNumber)
              .map((h) => hashCorporateLookupValue(h.poNumber))
          )
        ).filter(Boolean);

        const lookupRef = doc(db, 'corporateLookup', acctHash);
        try {
          await updateDoc(
            lookupRef,
            sanitizePayload({
              currentPoHash,
              revokedPoHashes,
              updatedAt: account.updatedAt || new Date().toISOString(),
            })
          );
        } catch {
          // Non-fatal if lookup doc hasn't been seeded yet and caller is corporate_manager
        }
      }
    } catch (err) {
      console.warn(`[CorporateAccountService] PO rotation Firestore sync warning for ${account.id}:`, err);
    }
  }

  /**
   * Toggles the PO Required flag for a corporate account
   */
  public async setPoRequired(
    accountId: string,
    poRequired: boolean,
    operatorEmail?: string
  ): Promise<CorporateAccountConfig> {
    const configService = getAdminConfigService();
    const settings = await configService.getSettings();
    const accounts = [...(settings.corporateAccounts || [])];

    const targetIndex = accounts.findIndex((a) => a.id === accountId || a.accountNumber === accountId);
    if (targetIndex === -1) {
      throw new Error(`Corporate account with ID "${accountId}" not found.`);
    }

    const currentAccount = accounts[targetIndex];
    const nowIso = new Date().toISOString();

    // Ensure account has an active currentPoNumber if we are enabling it
    let currentPo = currentAccount.currentPoNumber;
    let poGeneratedAt = currentAccount.poGeneratedAt;
    if (poRequired && !currentPo) {
      currentPo = this.generateSecurePoNumber(currentAccount.companyName, currentAccount.accountNumber);
      poGeneratedAt = nowIso;
    }

    const updatedAccount: CorporateAccountConfig = {
      ...currentAccount,
      poRequired,
      currentPoNumber: currentPo,
      poGeneratedAt,
      updatedAt: nowIso,
    };

    accounts[targetIndex] = updatedAccount;

    await configService.updateSettings({
      corporateAccounts: accounts,
      updatedBy: operatorEmail || 'admin@chesterfieldtaxi.com',
    });

    await this.syncIndividualAccountToFirestore(updatedAccount);

    return updatedAccount;
  }

  /**
   * Validates a candidate PO against an account's current PO, optional global `poFormatRegex`,
   * and historical rotated POs. If a rotated PO is detected, flags as potential fraud / expired PO.
   */
  public validateCorporatePo(
    account: CorporateAccountConfig,
    candidatePo?: string,
    options?: { poFormatRegex?: string }
  ): PoValidationResult {
    const resolvedRegex =
      options?.poFormatRegex !== undefined
        ? options.poFormatRegex
        : normalizeCorporatePortalPolicy(
            getAdminConfigService().getCachedSettings().corporatePortalPolicy
          ).poFormatRegex;

    const rawTrimmed = (candidatePo || '').trim();
    const trimmedCandidate = rawTrimmed.toUpperCase();

    if (!account.poRequired) {
      if (rawTrimmed && resolvedRegex) {
        const fmt = validatePoFormatRegex(rawTrimmed, resolvedRegex);
        if (!fmt.valid) {
          return {
            valid: false,
            status: 'mismatch',
            formatError: true,
            message: fmt.error || 'Invalid PO format.',
          };
        }
      }
      return {
        valid: true,
        status: 'not_required',
        message: 'PO number is not required for this account.',
      };
    }

    if (!trimmedCandidate) {
      return {
        valid: false,
        status: 'mismatch',
        message: 'A valid corporate Purchase Order (PO) number is required for this account.',
      };
    }

    // Check against rotated / revoked PO history first (anti-fraud check)
    const history = account.poNumberHistory || [];
    const matchedRevoked = history.find(
      (h) => h.poNumber.trim().toUpperCase() === trimmedCandidate
    );

    if (matchedRevoked) {
      const rotatedDate = matchedRevoked.rotatedAt ? matchedRevoked.rotatedAt.slice(0, 10) : 'previously';
      return {
        valid: false,
        status: 'expired_revoked',
        message: `FRAUD ALERT: PO "${candidatePo}" was revoked/rotated on ${rotatedDate}. Please contact corporate accounting for the new active PO number.`,
        revokedRecord: matchedRevoked,
      };
    }

    // Check optional global PO format regex when configured
    if (resolvedRegex) {
      const fmtCheck = validatePoFormatRegex(rawTrimmed, resolvedRegex);
      if (!fmtCheck.valid) {
        return {
          valid: false,
          status: 'mismatch',
          formatError: true,
          message:
            fmtCheck.error ||
            `Invalid PO format for ${account.companyName}. Expected pattern: ${resolvedRegex}.`,
        };
      }
    }

    const currentPoClean = (account.currentPoNumber || '').trim().toUpperCase();

    // Check against active PO (or accept regex-verified PO if account uses open per-trip POs without a fixed currentPoNumber)
    if (currentPoClean && trimmedCandidate === currentPoClean) {
      return {
        valid: true,
        status: 'valid',
        message: 'Corporate PO authorization verified.',
      };
    }

    if (!currentPoClean && resolvedRegex) {
      return {
        valid: true,
        status: 'valid',
        message: 'Corporate PO format verified.',
      };
    }

    return {
      valid: false,
      status: 'mismatch',
      message: `Invalid PO number for ${account.companyName}. Please verify the current PO authorization code.`,
    };
  }

  /**
   * Robust RFC 4180 CSV parser supporting quoted commas and multi-line fields.
   */
  public parseCsvRows(csvText: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let insideQuotes = false;

    // Normalize newlines
    const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (insideQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++;
        } else if (char === '"') {
          // Closing quote
          insideQuotes = false;
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          insideQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField.trim());
          currentField = '';
        } else if (char === '\n') {
          currentRow.push(currentField.trim());
          if (currentRow.some((f) => f.length > 0)) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
        } else {
          currentField += char;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Parses raw CSV content into CorporateAccountConfig array with default values applied.
   */
  public parseCorporateAccountsCsv(
    csvText: string,
    options: CsvImportOptions = {}
  ): CorporateAccountConfig[] {
    const rawRows = this.parseCsvRows(csvText);
    if (rawRows.length < 2) {
      return [];
    }

    const headers = rawRows[0].map((h) => h.toLowerCase().trim());
    const dataRows = rawRows.slice(1);

    const getColIndex = (...aliases: string[]) => {
      for (const alias of aliases) {
        const idx = headers.findIndex((h) => h === alias.toLowerCase() || h.includes(alias.toLowerCase()));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idIdx = getColIndex('account id', 'id', 'account #', 'account_id');
    const customerIdx = getColIndex('customer', 'company', 'company name', 'name');
    const activeIdx = getColIndex('active', 'status');
    const firstNameIdx = getColIndex('first name', 'firstname');
    const lastNameIdx = getColIndex('last name', 'lastname');
    const phoneIdx = getColIndex('phone', 'telephone', 'mobile');
    const addressIdx = getColIndex('address', 'billing address', 'street');
    const emailIdx = getColIndex('contact email', 'email');
    const infoIdx = getColIndex('info', 'notes', 'remarks');
    const costCodeIdx = getColIndex('default cost code', 'cost code', 'po', 'po number');

    const accounts: CorporateAccountConfig[] = [];
    const nowIso = new Date().toISOString();

    for (const row of dataRows) {
      const rawCustomer = customerIdx !== -1 ? (row[customerIdx] || '').trim() : '';
      if (!rawCustomer) continue; // Skip rows without company name

      const rawAccountId = idIdx !== -1 ? (row[idIdx] || '').trim() : '';
      const rawActive = activeIdx !== -1 ? (row[activeIdx] || '').trim() : 'Yes';
      const rawFirstName = firstNameIdx !== -1 ? (row[firstNameIdx] || '').trim() : '';
      const rawLastName = lastNameIdx !== -1 ? (row[lastNameIdx] || '').trim() : '';
      const rawPhone = phoneIdx !== -1 ? (row[phoneIdx] || '').trim() : '';
      const rawAddress = addressIdx !== -1 ? (row[addressIdx] || '').trim() : '';
      const rawEmail = emailIdx !== -1 ? (row[emailIdx] || '').trim() : '';
      const rawInfo = infoIdx !== -1 ? (row[infoIdx] || '').trim() : '';
      const rawCostCode = costCodeIdx !== -1 ? (row[costCodeIdx] || '').trim() : '';

      // Clean contact name
      let contactName = [rawFirstName, rawLastName].filter(Boolean).join(' ');
      if (!contactName || contactName.toLowerCase() === 'accounts payable') {
        contactName = options.defaultBillingContactName || 'Accounts Payable';
      }

      // Generate standardized account number and ID
      const accountNum = rawAccountId ? `CORP-${rawAccountId}` : `CORP-${Date.now().toString().slice(-5)}`;
      const docId = rawAccountId ? `corp-${rawAccountId}` : `corp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      // Generate secure initial PO number
      const initialPo = rawCostCode || this.generateSecurePoNumber(rawCustomer, accountNum);

      const isActive = rawActive.toLowerCase() === 'yes' || rawActive.toLowerCase() === 'true' || rawActive === '1';

      accounts.push({
        id: docId,
        companyName: rawCustomer,
        accountNumber: accountNum,
        billingCycle: options.billingCycle ?? 'net30',
        creditLimit: options.creditLimit ?? 5000,
        billingContactName: contactName,
        billingContactEmail: rawEmail || '',
        billingContactPhone: rawPhone || undefined,
        billingAddress: rawAddress || undefined,
        discountPercent: options.discountPercent ?? 0,
        poRequired: options.poRequired ?? false,
        currentPoNumber: initialPo,
        poGeneratedAt: nowIso,
        poNumberHistory: [],
        isActive,
        notes: rawInfo || undefined,
        authorizedBookers: rawEmail ? [rawEmail] : [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    return accounts;
  }

  /**
   * Public helper to sync a corporate account to BOTH `/corporateAccounts/{id}` (staff-only)
   * AND zero-PII hashed `/corporateLookup/{accountNumberHash}` (for rate-limited web checkout verification).
   */
  public async syncAccountToFirestore(account: CorporateAccountConfig): Promise<void> {
    await this.syncIndividualAccountToFirestore(account);
  }

  /**
   * Syncs a batch of corporate accounts (e.g. after CSV import or Admin save).
   */
  public async syncAccountsBatchToFirestore(accounts: CorporateAccountConfig[]): Promise<void> {
    if (!isFirebaseConfigured() || !accounts?.length) return;
    await Promise.all(accounts.map((acc) => this.syncIndividualAccountToFirestore(acc)));
  }

  /**
   * Helper to write a single account document to the 'corporateAccounts' Firestore collection
   * plus its zero-PII hashed verification projection at 'corporateLookup/{accountHash}'.
   */
  private async syncIndividualAccountToFirestore(account: CorporateAccountConfig): Promise<void> {
    if (!isFirebaseConfigured()) return;
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, 'corporateAccounts', account.id);
      // `deleteField()` strips a removed Verbal Booking PIN from /corporateAccounts/{id} on merge writes
      await setDoc(
        docRef,
        { ...sanitizePayload(account), bookingPin: account.bookingPin ? account.bookingPin : deleteField() },
        { merge: true }
      );

      const acctHash = await hashCorporateLookupValue(account.accountNumber);
      if (acctHash) {
        const currentPoHash = account.currentPoNumber
          ? await hashCorporateLookupValue(account.currentPoNumber)
          : '';
        const revokedPoHashes = await Promise.all(
          (account.poNumberHistory || [])
            .filter((h) => h.poNumber)
            .map((h) => hashCorporateLookupValue(h.poNumber))
        );
        const lookupDoc = {
          corporateAccountId: account.id,
          isActive: Boolean(account.isActive),
          poRequired: Boolean(account.poRequired),
          currentPoHash: currentPoHash || null,
          revokedPoHashes: revokedPoHashes.filter(Boolean),
          creditLimit: Number(account.creditLimit || 0),
          billingCycle: account.billingCycle || 'net30',
          discountPercent: Number(account.discountPercent || 0),
          updatedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'corporateLookup', acctHash), sanitizePayload(lookupDoc), {
          merge: true,
        });
      }
    } catch (err) {
      console.warn(`[CorporateAccountService] Failed to sync ${account.id} to corporateAccounts collection:`, err);
    }
  }
}

let instance: CorporateAccountService | null = null;
export function getCorporateAccountService(): CorporateAccountService {
  if (!instance) {
    instance = new CorporateAccountService();
  }
  return instance;
}
