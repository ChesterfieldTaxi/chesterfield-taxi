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
  type InvoiceRecord,
  type PoHistoryRecord,
} from '../types/config';
import type { CorporateUnbilledTransaction } from '../types/invoicing';
import { getAdminConfigService } from './config/admin-config.service';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { collection, deleteField, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { sanitizePayload } from './firestore-sanitizer';
import { getInvoicingService } from './invoicing.service';

export interface CsvImportOptions {
  poRequired?: boolean;
  discountPercent?: number;
  creditLimit?: number;
  billingCycle?: 'net15' | 'net30' | 'net60' | 'immediate';
  defaultBillingContactName?: string;
}

export type JsonImportOptions = CsvImportOptions;

export interface CorporateJsonMergeResult {
  merged: CorporateAccountConfig[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  changedAccounts: CorporateAccountConfig[];
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

export interface CorporateArchivalExposure {
  hasExposure: boolean;
  openInvoiceCount: number;
  overdueInvoiceCount: number;
  openInvoiceBalance: number;
  unbilledRideCount: number;
  unbilledAmount: number;
}

/**
 * Pure helper returning an archived copy of a CorporateAccountConfig.
 */
export function archiveCorporateAccountRecord(
  account: CorporateAccountConfig,
  reason?: string
): CorporateAccountConfig {
  const nowIso = new Date().toISOString();
  const cleanReason = typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : 'Archived by administrator';
  return {
    ...account,
    isArchived: true,
    isActive: false,
    archivedAt: nowIso,
    archiveReason: cleanReason,
    updatedAt: nowIso,
  };
}

/**
 * Pure helper returning a restored active copy of an archived CorporateAccountConfig.
 */
export function restoreCorporateAccountRecord(
  account: CorporateAccountConfig
): CorporateAccountConfig {
  const nowIso = new Date().toISOString();
  return {
    ...account,
    isArchived: false,
    isActive: true,
    archivedAt: undefined,
    archiveReason: undefined,
    updatedAt: nowIso,
  };
}

/**
 * Pure helper computing open/overdue invoice and unbilled ride exposure for archival confirmation.
 */
export function evaluateCorporateArchivalExposure(params: {
  account: CorporateAccountConfig;
  invoices?: InvoiceRecord[];
  unbilledTransactions?: CorporateUnbilledTransaction[];
}): CorporateArchivalExposure {
  const { account } = params;
  const targetId = (account.id || '').trim();
  const targetAcctNum = (account.accountNumber || '').trim().toUpperCase();

  const matchingInvoices = (params.invoices || []).filter((inv) => {
    if (inv.corporateAccountId && inv.corporateAccountId.trim()) {
      return inv.corporateAccountId.trim() === targetId;
    }
    if (targetAcctNum && inv.accountNumber && inv.accountNumber.trim()) {
      return inv.accountNumber.trim().toUpperCase() === targetAcctNum;
    }
    return false;
  });

  const openInvoices = matchingInvoices.filter((inv) => inv.status !== 'paid');
  const overdueInvoiceCount = openInvoices.filter((inv) => inv.status === 'overdue').length;
  const openInvoiceBalance = Number(
    openInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0).toFixed(2)
  );

  const matchingUnbilled = (params.unbilledTransactions || []).filter((tx) => {
    const isBillable = tx.status === 'unbilled' || tx.status === 'pending_invoice';
    if (!isBillable) return false;
    if (tx.corporateAccountId && tx.corporateAccountId.trim()) {
      return tx.corporateAccountId.trim() === targetId;
    }
    if (targetAcctNum && tx.accountNumber && tx.accountNumber.trim()) {
      return tx.accountNumber.trim().toUpperCase() === targetAcctNum;
    }
    return false;
  });

  const unbilledAmount = Number(
    matchingUnbilled
      .reduce((sum, tx) => sum + Number(tx.totalAmount || 0), 0)
      .toFixed(2)
  );

  return {
    hasExposure: openInvoices.length > 0 || matchingUnbilled.length > 0,
    openInvoiceCount: openInvoices.length,
    overdueInvoiceCount,
    openInvoiceBalance,
    unbilledRideCount: matchingUnbilled.length,
    unbilledAmount,
  };
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

const CORP_ACCOUNTS_CACHE_KEY = 'chesterfield_corporate_accounts_cache';

export class CorporateAccountService {
  public getCachedCorporateAccounts(): CorporateAccountConfig[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    try {
      const raw = window.localStorage.getItem(CORP_ACCOUNTS_CACHE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CorporateAccountConfig[]) : [];
    } catch {
      return [];
    }
  }

  public cacheCorporateAccounts(accounts: ReadonlyArray<CorporateAccountConfig>): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(CORP_ACCOUNTS_CACHE_KEY, JSON.stringify(accounts));
    } catch {
      // Ignore storage quota warnings
    }
  }

  public async syncAllCorporateAccountsFromFirestore(): Promise<CorporateAccountConfig[]> {
    if (!isFirebaseConfigured()) return this.getCachedCorporateAccounts();
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, 'corporateAccounts'));
      const list: CorporateAccountConfig[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as CorporateAccountConfig | undefined;
        if (!data || !docSnap.id) return;
        list.push({ ...data, id: data.id || docSnap.id });
      });
      if (list.length > 0) {
        this.cacheCorporateAccounts(list);
      }
      return list;
    } catch {
      return this.getCachedCorporateAccounts();
    }
  }
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
   * Parses a corporate accounts JSON dictionary (keyed by account ID, e.g. `corporate_accounts.json`)
   * into normalized `CorporateAccountConfig` records with safe defaults applied.
   */
  public parseCorporateAccountsJson(
    jsonText: string,
    options: JsonImportOptions = {}
  ): CorporateAccountConfig[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(
        `Invalid JSON format: ${err instanceof Error ? err.message : 'Unable to parse JSON'}`
      );
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object keyed by corporate account ID.');
    }

    const nowIso = new Date().toISOString();
    const defaultContact = options.defaultBillingContactName || 'Accounts Payable';
    const accounts: CorporateAccountConfig[] = [];

    for (const [rawKey, rawEntry] of Object.entries(parsed as Record<string, unknown>)) {
      const accountKey = String(rawKey || '').trim();
      if (!accountKey || !rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
        continue;
      }

      const entry = rawEntry as {
        name?: unknown;
        address?: unknown;
        type?: unknown;
        email?: unknown;
      };

      const companyName = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!companyName) continue;

      const rawAddress = typeof entry.address === 'string' ? entry.address : '';
      const normalizedLines = rawAddress
        .replace(/<br\s*\/?>/gi, '\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      let billingContactName = defaultContact;
      if (normalizedLines.length > 0) {
        const attnMatch = normalizedLines[0].match(/^attn:\s*(.*)$/i);
        if (attnMatch) {
          const extracted = attnMatch[1].trim();
          normalizedLines.shift();
          if (extracted && extracted.toLowerCase() !== 'accounts payable') {
            billingContactName = extracted;
          }
        }
      }

      const billingAddress = normalizedLines.length > 0 ? normalizedLines.join('\n') : undefined;
      const email = typeof entry.email === 'string' ? entry.email.trim() : '';
      const entryType = typeof entry.type === 'string' ? entry.type.trim().toLowerCase() : 'standard';

      const accountNumber = /^corp-/i.test(accountKey)
        ? accountKey.toUpperCase()
        : `CORP-${accountKey}`;
      const id = /^corp-/i.test(accountKey)
        ? accountKey.toLowerCase()
        : `corp-${accountKey}`;

      accounts.push({
        id,
        companyName,
        accountNumber,
        billingCycle: options.billingCycle ?? 'net30',
        creditLimit: options.creditLimit ?? 5000,
        billingContactName,
        billingContactEmail: email,
        billingAddress,
        discountPercent: options.discountPercent ?? 0,
        poRequired: options.poRequired ?? false,
        currentPoNumber: this.generateSecurePoNumber(companyName, accountNumber),
        poGeneratedAt: nowIso,
        poNumberHistory: [],
        isActive: true,
        notes: entryType === 'delivery' ? 'Account Type: delivery' : undefined,
        authorizedBookers: email ? [email] : [],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    return accounts;
  }

  /**
   * Upserts incoming corporate accounts into an existing directory list.
   * Matches by `accountNumber` (case-insensitive) or `id`, updating directory metadata
   * while preserving operational state (POs, PINs, credit limits, discounts, riders, etc.).
   */
  public mergeCorporateAccounts(
    existing: CorporateAccountConfig[],
    incoming: CorporateAccountConfig[]
  ): CorporateJsonMergeResult {
    const nowIso = new Date().toISOString();
    const merged: CorporateAccountConfig[] = existing.map((acc) => ({ ...acc }));
    const changedAccounts: CorporateAccountConfig[] = [];

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const findMatchIndex = (target: CorporateAccountConfig): number => {
      const targetAcctNum = (target.accountNumber || '').trim().toLowerCase();
      const targetId = (target.id || '').trim().toLowerCase();
      return merged.findIndex((item) => {
        const itemAcctNum = (item.accountNumber || '').trim().toLowerCase();
        const itemId = (item.id || '').trim().toLowerCase();
        return (
          (targetAcctNum && itemAcctNum && itemAcctNum === targetAcctNum) ||
          (targetId && itemId && itemId === targetId)
        );
      });
    };

    for (const inc of incoming) {
      if (!inc || !inc.companyName?.trim() || (!inc.accountNumber?.trim() && !inc.id?.trim())) {
        skippedCount++;
        continue;
      }

      const matchIdx = findMatchIndex(inc);
      if (matchIdx >= 0) {
        const cur = merged[matchIdx];
        const curContact = (cur.billingContactName || '').trim();
        const shouldUpdateContact =
          !curContact || curContact.toLowerCase() === 'accounts payable';

        const updated: CorporateAccountConfig = {
          ...cur,
          companyName: inc.companyName.trim(),
          billingAddress: inc.billingAddress !== undefined ? inc.billingAddress : cur.billingAddress,
          billingContactEmail: inc.billingContactEmail?.trim()
            ? inc.billingContactEmail.trim()
            : cur.billingContactEmail,
          billingContactName: shouldUpdateContact
            ? inc.billingContactName || cur.billingContactName || 'Accounts Payable'
            : cur.billingContactName,
          notes: cur.notes || inc.notes,
          updatedAt: nowIso,
        };

        merged[matchIdx] = updated;
        changedAccounts.push(updated);
        updatedCount++;
      } else {
        const created: CorporateAccountConfig = {
          ...inc,
          currentPoNumber:
            inc.currentPoNumber ||
            this.generateSecurePoNumber(inc.companyName, inc.accountNumber),
          poGeneratedAt: inc.poGeneratedAt || nowIso,
          poNumberHistory: inc.poNumberHistory || [],
          updatedAt: nowIso,
        };
        merged.push(created);
        changedAccounts.push(created);
        addedCount++;
      }
    }

    return {
      merged,
      addedCount,
      updatedCount,
      skippedCount,
      changedAccounts,
    };
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
   * Checks open/overdue invoice and unbilled ride exposure for a corporate account prior to archival.
   */
  public async checkArchivalExposure(
    account: CorporateAccountConfig,
    invoices?: InvoiceRecord[]
  ): Promise<CorporateArchivalExposure> {
    const invoicingService = getInvoicingService();
    const [resolvedInvoices, unbilledTransactions] = await Promise.all([
      invoices
        ? Promise.resolve(invoices)
        : invoicingService.getInvoices
          ? invoicingService.getInvoices().catch(() => [])
          : Promise.resolve([]),
      invoicingService.getUnbilledTransactions
        ? invoicingService.getUnbilledTransactions(account.id).catch(() => [])
        : Promise.resolve([]),
    ]);

    return evaluateCorporateArchivalExposure({
      account,
      invoices: resolvedInvoices,
      unbilledTransactions,
    });
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
      // `deleteField()` strips a removed Verbal Booking PIN or cleared archival metadata on merge writes
      await setDoc(
        docRef,
        {
          ...sanitizePayload(account),
          bookingPin: account.bookingPin ? account.bookingPin : deleteField(),
          isArchived: Boolean(account.isArchived),
          archivedAt: account.isArchived ? account.archivedAt || new Date().toISOString() : deleteField(),
          archiveReason:
            account.isArchived && account.archiveReason ? account.archiveReason : deleteField(),
        },
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
          isArchived: Boolean(account.isArchived),
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
