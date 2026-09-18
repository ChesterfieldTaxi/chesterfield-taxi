/**
 * Corporate Account & Anti-Fraud PO Lifecycle Service
 * 
 * Provides:
 * - High-entropy collision-resistant PO generation and rotation
 * - PO anti-fraud detection (detects and flags expired/revoked POs)
 * - Corporate account CSV parser with customizable defaults
 * - Firestore syncing for corporate accounts
 */

import type { CorporateAccountConfig, PoHistoryRecord } from '../types/config';
import { getAdminConfigService } from './config/admin-config.service';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
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
  revokedRecord?: PoHistoryRecord;
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

    const targetIndex = accounts.findIndex((a) => a.id === accountId || a.accountNumber === accountId);
    if (targetIndex === -1) {
      throw new Error(`Corporate account with ID "${accountId}" not found.`);
    }

    const currentAccount = accounts[targetIndex];
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

    accounts[targetIndex] = updatedAccount;

    // Persist to central AppSettings
    await configService.updateSettings({
      corporateAccounts: accounts,
      updatedBy: operatorEmail || 'admin@chesterfieldtaxi.com',
    });

    // Also persist individual doc to Firestore collection if configured
    await this.syncIndividualAccountToFirestore(updatedAccount);

    return {
      account: updatedAccount,
      oldPo,
      newPo,
    };
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
   * Validates a candidate PO against an account's current PO and historical rotated POs.
   * If a rotated PO is detected, flags as potential fraud / expired PO.
   */
  public validateCorporatePo(
    account: CorporateAccountConfig,
    candidatePo?: string
  ): PoValidationResult {
    if (!account.poRequired) {
      return {
        valid: true,
        status: 'not_required',
        message: 'PO number is not required for this account.',
      };
    }

    const trimmedCandidate = (candidatePo || '').trim().toUpperCase();
    if (!trimmedCandidate) {
      return {
        valid: false,
        status: 'mismatch',
        message: 'A valid corporate Purchase Order (PO) number is required for this account.',
      };
    }

    const currentPoClean = (account.currentPoNumber || '').trim().toUpperCase();

    // Check against active PO
    if (currentPoClean && trimmedCandidate === currentPoClean) {
      return {
        valid: true,
        status: 'valid',
        message: 'Corporate PO authorization verified.',
      };
    }

    // Check against rotated / revoked PO history (anti-fraud check)
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
   * Helper to write a single account document to the 'corporateAccounts' Firestore collection.
   */
  private async syncIndividualAccountToFirestore(account: CorporateAccountConfig): Promise<void> {
    if (!isFirebaseConfigured()) return;
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, 'corporateAccounts', account.id);
      await setDoc(docRef, sanitizePayload(account), { merge: true });
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
