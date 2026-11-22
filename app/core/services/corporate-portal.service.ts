/**
 * Corporate Client Self-Service Portal Domain Service (`corporate-portal.service.ts`)
 *
 * Strictly adheres to `constitution.md`:
 * - Encapsulates ALL B2B multi-tenant queries, credit-limit utilization calculations,
 *   RFC 4180 CSV trip expense exports, scoped statement retrieval, team/location/cost-center
 *   self-service updates, anti-fraud PO rotation, and Admin portal manager provisioning.
 * - Strictly parameterized by `corporateAccountId` to guarantee zero cross-tenant leakage.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import type {
  CorporateAccountConfig,
  CorporateAuthorizedRider,
  CorporatePortalManagerRecord,
  CorporateSavedLocation,
  InvoiceRecord,
} from '../types/config';
import type { CorporateUnbilledTransaction, IInvoicingService, PrintableInvoiceData } from '../types/invoicing';
import type { Trip } from '../types/trip';
import { sanitizeTextInput } from '../utils/security-sanitizer.util';
import { LOCAL_CORPORATE_MANAGERS_KEY, type UserRole } from './auth/admin-auth.service';
import { getBookingService } from './booking';
import type { IBookingService } from './booking-service';
import { getAdminConfigService } from './config/admin-config.service';
import {
  CorporateAccountService,
  getCorporateAccountService,
} from './corporate-account.service';
import {
  getFirebaseApp,
  getFirestoreDb,
  getResolvedFirebaseConfig,
  isFirebaseConfigured,
} from './firebase';
import { sanitizePayload } from './firestore-sanitizer';
import {
  calculateCorporateTransactionAmounts,
  getInvoicingService,
} from './invoicing.service';

const LOCAL_CORP_SELF_SERVICE_CACHE_KEY = 'ct_corporate_portal_overrides_v1';

const ACTIVE_RIDE_STATUSES = new Set<string>([
  'UNCONFIRMED',
  'unconfirmed',
  'CONFIRMED',
  'confirmed',
  'pending',
  'offered',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
]);

export interface CorporateCreditMetrics {
  openInvoiceBalance: number;
  unbilledSpend: number;
  totalExposure: number;
  creditLimit: number;
  availableCredit: number;
  creditUtilizationPercent: number;
  isOverLimit: boolean;
  utilizationLevel: 'healthy' | 'warning' | 'critical';
}

export interface CorporateDashboardSummary extends CorporateCreditMetrics {
  account: CorporateAccountConfig;
  activeRides: Trip[];
  completedCycleRides: Trip[];
  allTrips: Trip[];
  invoices: InvoiceRecord[];
  openInvoiceCount: number;
  overdueInvoiceCount: number;
}

export interface CorporateTeamSettingsPatch {
  authorizedRiders?: CorporateAuthorizedRider[];
  authorizedBookers?: string[];
  costCenters?: string[];
  savedCompanyLocations?: CorporateSavedLocation[];
}

export interface CorporateTripsCsvExport {
  fileName: string;
  mimeType: string;
  csvContent: string;
  rowCount: number;
  totalSpend: number;
}

export interface ProvisionCorporateManagerInput {
  corporateAccount: CorporateAccountConfig;
  managerName: string;
  managerEmail: string;
  managerPhone?: string;
  includeCustomerRole?: boolean;
  operatorEmail?: string;
}

export interface ProvisionCorporateManagerResult {
  uid: string;
  email: string;
  name: string;
  corporateAccountId: string;
  corporateAccountNumber: string;
  roles: UserRole[];
  isExistingAccount: boolean;
  tempPassword?: string;
  portalUrl: string;
  instructionsText: string;
  updatedAccount: CorporateAccountConfig;
}

export interface CorporatePortalServiceDeps {
  accounts?: CorporateAccountConfig[];
  bookingService?: IBookingService;
  invoicingService?: IInvoicingService;
  corporateAccountService?: CorporateAccountService;
}

/**
 * Pure multi-tenant isolation predicate for Trips.
 * Never matches a trip carrying a different `corporateAccountId`.
 */
export function doesTripBelongToCorporateAccount(
  trip: Trip,
  corporateAccountId: string,
  accountNumber?: string
): boolean {
  const targetId = (corporateAccountId || '').trim();
  if (!targetId || !trip) return false;

  const meta = (trip.metadata || {}) as Record<string, any>;
  const explicitIds = [
    trip.corporateAccountId,
    trip.payment?.corporateAccountId,
    typeof meta.corporateAccountId === 'string' ? meta.corporateAccountId : undefined,
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  if (explicitIds.length > 0) {
    return explicitIds.every((id) => id === targetId);
  }

  const targetAcctNum = (accountNumber || '').trim().toUpperCase();
  if (targetAcctNum) {
    const metaAcctNum = String(
      meta.corporateAccountNumber || meta.corporateDetails?.corporateAccount || ''
    )
      .trim()
      .toUpperCase();
    if (metaAcctNum && metaAcctNum === targetAcctNum) {
      return true;
    }
  }

  return false;
}

/**
 * Pure multi-tenant isolation predicate for Corporate Invoices.
 */
export function doesInvoiceBelongToCorporateAccount(
  invoice: InvoiceRecord,
  corporateAccountId: string,
  accountNumber?: string
): boolean {
  const targetId = (corporateAccountId || '').trim();
  if (!targetId || !invoice) return false;

  if (invoice.corporateAccountId && invoice.corporateAccountId.trim()) {
    return invoice.corporateAccountId.trim() === targetId;
  }

  const targetAcctNum = (accountNumber || '').trim().toUpperCase();
  if (targetAcctNum && invoice.accountNumber && invoice.accountNumber.trim()) {
    return invoice.accountNumber.trim().toUpperCase() === targetAcctNum;
  }

  return false;
}

/**
 * Pure deterministic credit-limit utilization calculator:
 * `creditUtilizationPercent = ((openInvoiceBalance + unbilledSpend) / creditLimit) * 100`
 */
export function computeCorporateCreditMetrics(params: {
  openInvoiceBalance: number;
  unbilledSpend: number;
  creditLimit: number;
}): CorporateCreditMetrics {
  const openInvoiceBalance = Math.max(0, Number((params.openInvoiceBalance || 0).toFixed(2)));
  const unbilledSpend = Math.max(0, Number((params.unbilledSpend || 0).toFixed(2)));
  const totalExposure = Number((openInvoiceBalance + unbilledSpend).toFixed(2));
  const creditLimit = Math.max(0, Number((params.creditLimit || 0).toFixed(2)));
  const availableCredit = Number(Math.max(0, creditLimit - totalExposure).toFixed(2));
  const creditUtilizationPercent =
    creditLimit > 0 ? Number(((totalExposure / creditLimit) * 100).toFixed(1)) : 0;
  const isOverLimit = creditLimit > 0 && totalExposure > creditLimit;
  const utilizationLevel: 'healthy' | 'warning' | 'critical' =
    creditUtilizationPercent >= 85
      ? 'critical'
      : creditUtilizationPercent >= 65
      ? 'warning'
      : 'healthy';

  return {
    openInvoiceBalance,
    unbilledSpend,
    totalExposure,
    creditLimit,
    availableCredit,
    creditUtilizationPercent,
    isOverLimit,
    utilizationLevel,
  };
}

/**
 * Escapes an RFC 4180 CSV cell and neutralizes spreadsheet formula injection (`=`, `+`, `-`, `@`).
 */
export function formatSafeCsvCell(raw: unknown, neutralizeFormula = true): string {
  let str = String(raw ?? '').replace(/\r\n/g, ' ').replace(/[\r\n]+/g, ' ').trim();
  if (neutralizeFormula && /^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function getCycleWindowDays(billingCycle?: CorporateAccountConfig['billingCycle']): number {
  switch (billingCycle) {
    case 'immediate':
      return 30;
    case 'net15':
      return 15;
    case 'net60':
      return 60;
    case 'net30':
    default:
      return 30;
  }
}

export class CorporatePortalService {
  private injectedAccounts: Map<string, CorporateAccountConfig> | null = null;
  private bookingServiceOverride?: IBookingService;
  private invoicingServiceOverride?: IInvoicingService;
  private corporateAccountServiceOverride?: CorporateAccountService;

  constructor(deps?: CorporatePortalServiceDeps) {
    if (deps?.accounts) {
      this.injectedAccounts = new Map(deps.accounts.map((a) => [a.id, { ...a }]));
    }
    this.bookingServiceOverride = deps?.bookingService;
    this.invoicingServiceOverride = deps?.invoicingService;
    this.corporateAccountServiceOverride = deps?.corporateAccountService;
  }

  private getBookingSvc(): IBookingService {
    return this.bookingServiceOverride || getBookingService();
  }

  private getInvoicingSvc(): IInvoicingService {
    return this.invoicingServiceOverride || getInvoicingService();
  }

  private getCorpAcctSvc(): CorporateAccountService {
    return this.corporateAccountServiceOverride || getCorporateAccountService();
  }

  private readLocalOverrides(): Record<string, Partial<CorporateAccountConfig>> {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
      const raw = window.localStorage.getItem(LOCAL_CORP_SELF_SERVICE_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeLocalOverride(accountId: string, patch: Partial<CorporateAccountConfig>): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const current = this.readLocalOverrides();
      current[accountId] = {
        ...(current[accountId] || {}),
        ...patch,
      };
      window.localStorage.setItem(LOCAL_CORP_SELF_SERVICE_CACHE_KEY, JSON.stringify(current));
    } catch {
      // Ignore storage quota warnings
    }
  }

  /**
   * Lists corporate accounts for Admin Superuser preview selector.
   */
  public async listCorporateAccountsForAdmin(): Promise<CorporateAccountConfig[]> {
    if (this.injectedAccounts) {
      return Array.from(this.injectedAccounts.values());
    }

    const byId = new Map<string, CorporateAccountConfig>();
    const configService = getAdminConfigService();
    const settings = await configService.getSettings().catch(() => configService.getCachedSettings());
    const overrides = this.readLocalOverrides();

    for (const acc of settings.corporateAccounts || []) {
      byId.set(acc.id, { ...acc, ...(overrides[acc.id] || {}) });
    }

    if (isFirebaseConfigured() && !this.bookingServiceOverride) {
      try {
        const db = getFirestoreDb();
        const snap = await getDocs(collection(db, 'corporateAccounts'));
        snap.forEach((d) => {
          const remote = { id: d.id, ...(d.data() as any) } as CorporateAccountConfig;
          byId.set(remote.id, {
            ...(byId.get(remote.id) || {}),
            ...remote,
          });
        });
      } catch {
        // Fallback to settings accounts
      }
    }

    return Array.from(byId.values()).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }

  /**
   * Resolves a single `CorporateAccountConfig` strictly by `corporateAccountId`.
   */
  public async resolveCorporateAccount(corporateAccountId: string): Promise<CorporateAccountConfig> {
    const cleanId = (corporateAccountId || '').trim();
    if (!cleanId) {
      throw new Error('A valid corporateAccountId is required.');
    }

    if (this.injectedAccounts) {
      const hit =
        this.injectedAccounts.get(cleanId) ||
        Array.from(this.injectedAccounts.values()).find((a) => a.accountNumber === cleanId);
      if (!hit) {
        throw new Error(`Corporate account "${cleanId}" was not found.`);
      }
      return { ...hit };
    }

    const overrides = this.readLocalOverrides();
    const configService = getAdminConfigService();
    const cachedSettings = configService.getCachedSettings();
    let localMatch = (cachedSettings.corporateAccounts || []).find(
      (a) => a.id === cleanId || a.accountNumber === cleanId
    );

    if (!localMatch) {
      try {
        const freshSettings = await configService.getSettings();
        localMatch = (freshSettings.corporateAccounts || []).find(
          (a) => a.id === cleanId || a.accountNumber === cleanId
        );
      } catch {
        // Non-dispatcher users cannot read staff /config/appSettings in Firestore; direct doc read below handles them
      }
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const docSnap = await getDoc(doc(db, 'corporateAccounts', localMatch?.id || cleanId));
        if (docSnap.exists()) {
          const remote = { id: docSnap.id, ...(docSnap.data() as any) } as CorporateAccountConfig;
          return {
            ...(localMatch || {}),
            ...remote,
            ...(overrides[remote.id] || {}),
          };
        }
      } catch (err) {
        console.warn('[CorporatePortalService] Firestore corporateAccount read fallback:', err);
      }
    }

    if (!localMatch) {
      throw new Error(`Corporate account "${cleanId}" was not found.`);
    }

    return {
      ...localMatch,
      ...(overrides[localMatch.id] || {}),
    };
  }

  /**
   * Returns all trips strictly belonging to `corporateAccountId`, sorted newest-first.
   */
  public async getCorporateTrips(corporateAccountId: string): Promise<Trip[]> {
    const cleanId = (corporateAccountId || '').trim();
    if (!cleanId) return [];

    const account = await this.resolveCorporateAccount(cleanId).catch(() => null);
    const resolvedId = account?.id || cleanId;
    const accountNumber = account?.accountNumber;

    const mergedById = new Map<string, Trip>();

    // 1. Scoped Firestore query (`where('corporateAccountId', '==', resolvedId)`)
    // Satisfies `allow list: if isCorporateManagerFor(resource.data.corporateAccountId)` without composite indexes
    if (isFirebaseConfigured() && !this.bookingServiceOverride) {
      try {
        const db = getFirestoreDb();
        const q = query(collection(db, 'trips'), where('corporateAccountId', '==', resolvedId));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const trip = { ...(d.data() as Trip), id: d.id };
          if (doesTripBelongToCorporateAccount(trip, resolvedId, accountNumber)) {
            mergedById.set(trip.id, trip);
          }
        });
      } catch (err) {
        console.warn('[CorporatePortalService] Scoped Firestore trips query fallback:', err);
      }
    }

    // 2. Merge local / injected booking service trips strictly filtered by tenant predicate
    const bookingSvc = this.getBookingSvc();
    if (!isFirebaseConfigured() || this.bookingServiceOverride) {
      if (bookingSvc.getAllTrips) {
        const all = await bookingSvc.getAllTrips().catch(() => []);
        for (const trip of all) {
          if (doesTripBelongToCorporateAccount(trip, resolvedId, accountNumber)) {
            mergedById.set(trip.id, trip);
          }
        }
      }
    } else if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const rawLocal = window.localStorage.getItem('chesterfield_taxi_mock_trips');
        if (rawLocal) {
          const parsed = JSON.parse(rawLocal) as Trip[];
          for (const trip of parsed) {
            if (
              doesTripBelongToCorporateAccount(trip, resolvedId, accountNumber) &&
              !mergedById.has(trip.id)
            ) {
              mergedById.set(trip.id, trip);
            }
          }
        }
      } catch {
        // Ignore local cache parse errors
      }
    }

    return Array.from(mergedById.values()).sort((a, b) => {
      const timeA = a.scheduledPickupTime || a.createdAt || '';
      const timeB = b.scheduledPickupTime || b.createdAt || '';
      return timeB.localeCompare(timeA);
    });
  }

  /**
   * Generates a downloadable RFC 4180 CSV expense log strictly for the given corporate account's trips:
   * Columns: Date, Trip ID, Traveler, Department/Cost Center, PO #, Pickup, Dropoff, Fare, Status
   */
  public exportCorporateTripsCsv(
    trips: Trip[],
    account: CorporateAccountConfig
  ): CorporateTripsCsvExport {
    const scopedTrips = (trips || []).filter((t) =>
      doesTripBelongToCorporateAccount(t, account.id, account.accountNumber)
    );

    const headers = [
      'Date',
      'Trip ID',
      'Traveler',
      'Department/Cost Center',
      'PO #',
      'Pickup',
      'Dropoff',
      'Fare',
      'Status',
    ];

    let totalSpend = 0;

    const rows = scopedTrips.map((trip) => {
      const meta = (trip.metadata || {}) as Record<string, any>;
      const dateStr = (
        trip.actualPickupTime ||
        trip.scheduledPickupTime ||
        trip.createdAt ||
        ''
      ).slice(0, 10);

      const travelerName =
        [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ').trim() ||
        'Corporate Traveler';

      // Resolve Department / Cost Center from trip metadata or authorizedRiders directory
      const matchedRider = (account.authorizedRiders || []).find(
        (r) =>
          (r.email &&
            trip.passenger?.email &&
            r.email.toLowerCase() === trip.passenger.email.toLowerCase()) ||
          r.name.toLowerCase() === travelerName.toLowerCase()
      );
      const costCenter =
        String(
          meta.costCenter ||
            meta.department ||
            meta.corporateDetails?.costCenter ||
            matchedRider?.department ||
            ''
        ).trim() || 'General';

      const poNumber = String(
        meta.billingPo ||
          meta.corporateDetails?.billingPo ||
          (account.poRequired ? account.currentPoNumber || '' : '')
      ).trim();

      const calc = calculateCorporateTransactionAmounts(trip, account);
      const fare = Number((calc.totalAmount || trip.pricing?.totalFare || 0).toFixed(2));
      if (trip.status !== 'cancelled' && trip.status !== 'DECLINED' && trip.status !== 'declined') {
        totalSpend += fare;
      }

      return [
        formatSafeCsvCell(dateStr, false),
        formatSafeCsvCell(trip.id),
        formatSafeCsvCell(travelerName),
        formatSafeCsvCell(costCenter),
        formatSafeCsvCell(poNumber),
        formatSafeCsvCell(trip.pickupLocation?.address || ''),
        formatSafeCsvCell(trip.dropoffLocation?.address || ''),
        fare.toFixed(2),
        formatSafeCsvCell(String(trip.status || '').toUpperCase(), false),
      ].join(',');
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeAcctSlug = (account.accountNumber || account.id)
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase();

    return {
      fileName: `chesterfield-taxi-corporate-rides-${safeAcctSlug}-${dateStamp}.csv`,
      mimeType: 'text/csv;charset=utf-8;',
      csvContent: [headers.join(','), ...rows].join('\n'),
      rowCount: scopedTrips.length,
      totalSpend: Number(totalSpend.toFixed(2)),
    };
  }

  /**
   * Triggers a browser file download for the corporate trips CSV export.
   */
  public downloadCorporateTripsCsv(
    trips: Trip[],
    account: CorporateAccountConfig
  ): CorporateTripsCsvExport {
    const exported = this.exportCorporateTripsCsv(trips, account);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([exported.csvContent], { type: exported.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exported.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return exported;
  }

  /**
   * Returns all corporate invoices strictly belonging to `corporateAccountId`.
   */
  public async getCorporateInvoices(corporateAccountId: string): Promise<InvoiceRecord[]> {
    const cleanId = (corporateAccountId || '').trim();
    if (!cleanId) return [];

    const account = await this.resolveCorporateAccount(cleanId).catch(() => null);
    const resolvedId = account?.id || cleanId;
    const accountNumber = account?.accountNumber;

    const byId = new Map<string, InvoiceRecord>();

    // 1. Scoped Firestore query (`where('corporateAccountId', '==', resolvedId)`)
    if (isFirebaseConfigured() && !this.invoicingServiceOverride) {
      try {
        const db = getFirestoreDb();
        const q = query(collection(db, 'invoices'), where('corporateAccountId', '==', resolvedId));
        const snap = await getDocs(q);
        snap.forEach((d) => {
          const inv = { id: d.id, ...(d.data() as any) } as InvoiceRecord;
          if (doesInvoiceBelongToCorporateAccount(inv, resolvedId, accountNumber)) {
            byId.set(inv.id, inv);
          }
        });
      } catch (err) {
        console.warn('[CorporatePortalService] Scoped Firestore invoices query fallback:', err);
      }
    }

    // 2. Merge from InvoicingService (offline/test mode or cached settings invoices)
    const invoicingSvc = this.getInvoicingSvc();
    if (!isFirebaseConfigured() || this.invoicingServiceOverride) {
      if (invoicingSvc.getInvoices) {
        const all = await invoicingSvc.getInvoices().catch(() => []);
        for (const inv of all) {
          if (doesInvoiceBelongToCorporateAccount(inv, resolvedId, accountNumber)) {
            byId.set(inv.id, inv);
          }
        }
      }
    } else {
      // Also check cached settings invoices for seeded/demo records matching this account
      const cachedInvoices = getAdminConfigService().getCachedSettings().invoices || [];
      for (const inv of cachedInvoices) {
        if (
          doesInvoiceBelongToCorporateAccount(inv, resolvedId, accountNumber) &&
          !byId.has(inv.id)
        ) {
          byId.set(inv.id, inv);
        }
      }
    }

    return Array.from(byId.values()).sort((a, b) =>
      (b.issuedDate || '').localeCompare(a.issuedDate || '')
    );
  }

  /**
   * Builds printable PDF statement data strictly scoped to `corporateAccountId`.
   * Returns `null` if the invoice does not exist or belongs to a different company.
   */
  public async getCorporatePrintableInvoice(
    corporateAccountId: string,
    invoiceId: string
  ): Promise<PrintableInvoiceData | null> {
    const cleanCorpId = (corporateAccountId || '').trim();
    const cleanInvId = (invoiceId || '').trim();
    if (!cleanCorpId || !cleanInvId) return null;

    const [account, scopedInvoices] = await Promise.all([
      this.resolveCorporateAccount(cleanCorpId),
      this.getCorporateInvoices(cleanCorpId),
    ]);

    const targetInvoice = scopedInvoices.find((inv) => inv.id === cleanInvId);
    if (
      !targetInvoice ||
      !doesInvoiceBelongToCorporateAccount(targetInvoice, account.id, account.accountNumber)
    ) {
      return null;
    }

    const invoicingSvc = this.getInvoicingSvc();
    if (!isFirebaseConfigured() && invoicingSvc.getPrintableInvoice) {
      const fromSvc = await invoicingSvc.getPrintableInvoice(cleanInvId).catch(() => null);
      if (fromSvc) return fromSvc;
    }

    const settings = getAdminConfigService().getCachedSettings();
    const billing = settings.billingSettings;
    const company = settings.company;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://chesterfieldtaxi.com';

    const lineItems = (targetInvoice.lineItems || []).map((li, index) => ({
      tripId: li.tripId || targetInvoice.tripIds?.[index] || undefined,
      date: li.date || targetInvoice.issuedDate,
      description: li.description,
      passengerName: li.passengerName || targetInvoice.customerName,
      pickupDropoff: li.pickupDropoff,
      poNumber:
        li.poNumber || (account.poRequired ? account.currentPoNumber : undefined),
      amount: Number(li.amount || 0),
    }));

    const lineItemSum = Number(lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    const recordedDiscount = Number(targetInvoice.discountAmount || 0);
    const totalAmount = Number((targetInvoice.totalAmount ?? lineItemSum).toFixed(2));
    const subtotal = Number(
      (targetInvoice.subtotal !== undefined
        ? targetInvoice.subtotal
        : recordedDiscount > 0 && Math.abs(lineItemSum - totalAmount) < 0.02
        ? totalAmount + recordedDiscount
        : lineItemSum
      ).toFixed(2)
    );

    return {
      invoiceNumber: targetInvoice.invoiceNumber,
      issuedDate: targetInvoice.issuedDate,
      dueDate: targetInvoice.dueDate,
      corporateAccount: account,
      customerName: targetInvoice.customerName,
      customerEmail: targetInvoice.customerEmail,
      billingAddress: account.billingAddress || account.companyName,
      status: targetInvoice.status,
      paidDate: targetInvoice.paidDate,
      paidAt: targetInvoice.paidAt,
      paymentReference: targetInvoice.paymentReference,
      payToken: targetInvoice.payToken,
      payLinkUrl:
        targetInvoice.payLinkUrl ||
        (targetInvoice.payToken ? `${origin}/pay/${targetInvoice.payToken}` : undefined),
      lineItems,
      subtotal,
      discountAmount: recordedDiscount,
      totalAmount,
      notes:
        targetInvoice.notes ||
        'Thank you for your business. Payment due within agreed contractual terms.',
      remittanceInfo: {
        bankName: billing?.remittanceBankName || 'ACH / Corporate Check Remittance',
        accountName: billing?.remittanceAccountName || company?.name || COMPANY_CONFIG.legalName,
        accountNumber: billing?.remittanceAccountLast4
          ? `••••••••${billing.remittanceAccountLast4}`
          : 'Available upon request',
        routingNumber: billing?.remittanceRoutingNumber || 'Contact billing desk',
        dispatchPhone: company?.phone || COMPANY_CONFIG.phone.dispatch,
        billingEmail: company?.email || COMPANY_CONFIG.email.dispatch,
      },
    };
  }

  /**
   * Resolves the complete Corporate Dashboard Summary strictly for `corporateAccountId`.
   */
  public async getCorporateDashboardSummary(
    corporateAccountId: string,
    nowMs: number = Date.now()
  ): Promise<CorporateDashboardSummary> {
    const account = await this.resolveCorporateAccount(corporateAccountId);
    const [allTrips, invoices] = await Promise.all([
      this.getCorporateTrips(account.id),
      this.getCorporateInvoices(account.id),
    ]);

    const activeRides = allTrips.filter((t) => ACTIVE_RIDE_STATUSES.has(t.status));

    const cycleDays = getCycleWindowDays(account.billingCycle);
    const cycleCutoffIso = new Date(nowMs - cycleDays * 86_400_000).toISOString();
    const completedTrips = allTrips.filter((t) => t.status === 'completed');
    const completedCycleRides = completedTrips.filter((t) => {
      const ts = t.completedAt || t.actualPickupTime || t.scheduledPickupTime || t.createdAt || '';
      return ts >= cycleCutoffIso;
    });

    // Identify all trip IDs already consolidated into non-draft invoices
    const invoicedTripIds = new Set<string>();
    for (const inv of invoices) {
      if (inv.status !== 'draft') {
        for (const tid of inv.tripIds || []) {
          if (tid) invoicedTripIds.add(tid);
        }
        for (const li of inv.lineItems || []) {
          if (li.tripId) invoicedTripIds.add(li.tripId);
        }
      }
    }

    // Compute unbilled completed ride spend (deduplicated by tripId)
    const countedUnbilledTripIds = new Set<string>();
    let rawUnbilledSpend = 0;

    for (const trip of completedTrips) {
      const payStatus = trip.payment?.status;
      if (
        invoicedTripIds.has(trip.id) ||
        payStatus === 'invoiced' ||
        payStatus === 'settled' ||
        payStatus === 'captured' ||
        payStatus === 'refunded'
      ) {
        continue;
      }
      const calc = calculateCorporateTransactionAmounts(trip, account);
      rawUnbilledSpend += calc.totalAmount;
      countedUnbilledTripIds.add(trip.id);
    }

    // Include any standalone unbilled AR rows in local/test mode not already represented in `completedTrips`
    if (!isFirebaseConfigured() || this.invoicingServiceOverride) {
      const invoicingSvc = this.getInvoicingSvc();
      if (invoicingSvc.getUnbilledTransactions) {
        const unbilledTxs: CorporateUnbilledTransaction[] = await invoicingSvc
          .getUnbilledTransactions(account.id)
          .catch(() => []);
        for (const tx of unbilledTxs) {
          if (
            tx.corporateAccountId === account.id &&
            (tx.status === 'unbilled' || tx.status === 'pending_invoice') &&
            !invoicedTripIds.has(tx.tripId) &&
            !countedUnbilledTripIds.has(tx.tripId)
          ) {
            rawUnbilledSpend += Number(tx.totalAmount || 0);
            countedUnbilledTripIds.add(tx.tripId);
          }
        }
      }
    }

    const openInvoices = invoices.filter(
      (inv) => inv.status === 'issued' || inv.status === 'overdue'
    );
    const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue');
    const openInvoiceBalance = openInvoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount || 0),
      0
    );

    const creditMetrics = computeCorporateCreditMetrics({
      openInvoiceBalance,
      unbilledSpend: rawUnbilledSpend,
      creditLimit: account.creditLimit,
    });

    return {
      account,
      activeRides,
      completedCycleRides,
      allTrips,
      invoices,
      openInvoiceCount: openInvoices.length,
      overdueInvoiceCount: overdueInvoices.length,
      ...creditMetrics,
    };
  }

  /**
   * Updates ONLY safe self-service portal fields (`authorizedRiders`, `authorizedBookers`,
   * `costCenters`, `savedCompanyLocations`) on a corporate account.
   * Never mutates `creditLimit`, `discountPercent`, `billingCycle`, `accountNumber`, or `isActive`.
   */
  public async updateCorporateTeamAndSettings(
    corporateAccountId: string,
    patch: CorporateTeamSettingsPatch,
    actorEmail?: string
  ): Promise<CorporateAccountConfig> {
    const current = await this.resolveCorporateAccount(corporateAccountId);
    const nowIso = new Date().toISOString();

    const safeFirestoreUpdate: Record<string, any> = {
      updatedAt: nowIso,
    };

    if (patch.authorizedRiders !== undefined) {
      safeFirestoreUpdate.authorizedRiders = patch.authorizedRiders.map((r) => ({
        id: r.id || `rider-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: sanitizeTextInput(r.name, 100),
        ...(r.email ? { email: sanitizeTextInput(r.email.toLowerCase(), 120) } : {}),
        ...(r.phone ? { phone: sanitizeTextInput(r.phone, 30) } : {}),
        ...(r.department ? { department: sanitizeTextInput(r.department, 60) } : {}),
        isVip: Boolean(r.isVip),
      }));
    }

    if (patch.authorizedBookers !== undefined) {
      safeFirestoreUpdate.authorizedBookers = Array.from(
        new Set(
          patch.authorizedBookers
            .map((e) => sanitizeTextInput(e.toLowerCase(), 120))
            .filter(Boolean)
        )
      );
    }

    if (patch.costCenters !== undefined) {
      safeFirestoreUpdate.costCenters = Array.from(
        new Set(
          patch.costCenters
            .map((c) => sanitizeTextInput(c, 50))
            .filter(Boolean)
        )
      );
    }

    if (patch.savedCompanyLocations !== undefined) {
      safeFirestoreUpdate.savedCompanyLocations = patch.savedCompanyLocations.map((loc) => ({
        id: loc.id || `loc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: sanitizeTextInput(loc.label, 80),
        address: sanitizeTextInput(loc.address, 220),
        ...(loc.notes ? { notes: sanitizeTextInput(loc.notes, 180) } : {}),
      }));
    }

    // Immutable preservation of financial/contractual governance fields
    const updatedAccount: CorporateAccountConfig = {
      ...current,
      ...safeFirestoreUpdate,
      id: current.id,
      accountNumber: current.accountNumber,
      creditLimit: current.creditLimit,
      discountPercent: current.discountPercent,
      billingCycle: current.billingCycle,
      isActive: current.isActive,
      poRequired: current.poRequired,
    };

    if (this.injectedAccounts) {
      this.injectedAccounts.set(current.id, updatedAccount);
      return updatedAccount;
    }

    this.writeLocalOverride(current.id, safeFirestoreUpdate);

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        await updateDoc(
          doc(db, 'corporateAccounts', current.id),
          sanitizePayload(safeFirestoreUpdate)
        );
      } catch (err) {
        console.warn('[CorporatePortalService] Firestore self-service update warning:', err);
      }
    }

    // Best-effort sync to central AppSettings when caller is Admin/Dispatcher or in offline mode
    try {
      const configService = getAdminConfigService();
      const settings = await configService.getSettings();
      const nextAccounts = (settings.corporateAccounts || []).map((a) =>
        a.id === current.id ? updatedAccount : a
      );
      await configService.updateSettings({
        corporateAccounts: nextAccounts,
        updatedBy: actorEmail || 'corporate-portal',
      });
    } catch {
      // Expected for non-dispatcher corporate_manager under strict Firestore rules
    }

    return updatedAccount;
  }

  /**
   * Self-service anti-fraud PO rotation delegating to `CorporateAccountService.regeneratePoNumber`.
   */
  public async rotateCorporatePoSelfService(
    corporateAccountId: string,
    reason?: string,
    actorEmail?: string
  ): Promise<{ account: CorporateAccountConfig; oldPo: string | null; newPo: string }> {
    const cleanReason =
      sanitizeTextInput(reason || '', 200) ||
      'Self-service anti-fraud PO rotation via Corporate Portal';
    const cleanActor = sanitizeTextInput(actorEmail || '', 120) || 'corporate-manager';

    if (this.injectedAccounts) {
      const current = await this.resolveCorporateAccount(corporateAccountId);
      const corpSvc = this.getCorpAcctSvc();
      const oldPo = current.currentPoNumber || null;
      const nowIso = new Date().toISOString();
      const history = [...(current.poNumberHistory || [])];
      if (oldPo) {
        history.unshift({
          poNumber: oldPo,
          generatedAt: current.poGeneratedAt || current.createdAt || nowIso,
          rotatedAt: nowIso,
          rotatedBy: cleanActor,
          reason: cleanReason,
        });
      }
      const newPo = corpSvc.generateSecurePoNumber(current.companyName, current.accountNumber);
      const updated: CorporateAccountConfig = {
        ...current,
        currentPoNumber: newPo,
        poGeneratedAt: nowIso,
        poNumberHistory: history,
        updatedAt: nowIso,
      };
      this.injectedAccounts.set(current.id, updated);
      return { account: updated, oldPo, newPo };
    }

    const result = await this.getCorpAcctSvc().regeneratePoNumber(
      corporateAccountId,
      cleanReason,
      cleanActor
    );

    this.writeLocalOverride(result.account.id, {
      currentPoNumber: result.account.currentPoNumber,
      poGeneratedAt: result.account.poGeneratedAt,
      poNumberHistory: result.account.poNumberHistory,
      updatedAt: result.account.updatedAt,
    });

    return result;
  }

  /**
   * Admin-only workflow to provision or bind a Corporate Portal Manager (`/users/{uid}`)
   * with `roles: ['corporate_manager']`, `corporateAccountId`, and `corporateAccountNumber`.
   */
  public async provisionCorporatePortalManager(
    input: ProvisionCorporateManagerInput
  ): Promise<ProvisionCorporateManagerResult> {
    const account = input.corporateAccount;
    const cleanName = sanitizeTextInput(input.managerName, 100);
    const cleanEmail = sanitizeTextInput(input.managerEmail.toLowerCase(), 120);
    const cleanPhone = sanitizeTextInput(input.managerPhone || '', 30);

    if (!account?.id || !account?.accountNumber) {
      throw new Error('A valid Corporate Account is required for portal provisioning.');
    }
    if (!cleanName) {
      throw new Error('Manager full name is required.');
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      throw new Error('A valid corporate manager email address is required.');
    }

    const nowIso = new Date().toISOString();
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const randomBytes = new Uint8Array(12);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(randomBytes);
    } else {
      for (let i = 0; i < randomBytes.length; i++) {
        randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }
    const generatedTempPass = Array.from(randomBytes, (b) => alphabet[b % alphabet.length]).join('');

    const assignedRoles: UserRole[] = input.includeCustomerRole
      ? ['corporate_manager', 'customer']
      : ['corporate_manager'];

    let resolvedUid = `corp_mgr_${Date.now().toString(36)}`;
    let isExistingAccount = false;
    let tempPassword: string | undefined = generatedTempPass;

    if (isFirebaseConfigured()) {
      const db = getFirestoreDb();

      // 1. Check if an existing `/users` profile already matches this email
      try {
        const existingSnap = await getDocs(
          query(collection(db, 'users'), where('email', '==', cleanEmail))
        );
        if (!existingSnap.empty) {
          const existingDoc = existingSnap.docs[0];
          resolvedUid = existingDoc.id;
          isExistingAccount = true;
          tempPassword = undefined;

          const existingData = existingDoc.data() || {};
          const priorStaffRoles = (Array.isArray(existingData.roles) ? existingData.roles : []).filter(
            (r: string) => r === 'admin' || r === 'dispatcher' || r === 'driver'
          ) as UserRole[];
          const mergedRoles = Array.from(
            new Set<UserRole>([...assignedRoles, ...priorStaffRoles])
          );

          await setDoc(
            doc(db, 'users', resolvedUid),
            sanitizePayload({
              uid: resolvedUid,
              email: cleanEmail,
              displayName: cleanName || existingData.displayName,
              ...(cleanPhone ? { phone: cleanPhone } : {}),
              role: mergedRoles[0] || 'corporate_manager',
              roles: mergedRoles,
              corporateAccountId: account.id,
              corporateAccountNumber: account.accountNumber,
              status: 'active',
              updatedAt: nowIso,
            }),
            { merge: true }
          );
        }
      } catch (lookupErr) {
        console.warn('[CorporatePortalService] Existing user email lookup warning:', lookupErr);
      }

      // 2. If not found in `/users`, create Firebase Auth user via isolated secondary app
      if (!isExistingAccount) {
        const tempAppName = `corp-provision-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const firebaseConfig = getResolvedFirebaseConfig();
        const secondaryApp = initializeApp(firebaseConfig, tempAppName);
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const cred = await createUserWithEmailAndPassword(
            secondaryAuth,
            cleanEmail,
            generatedTempPass
          );
          resolvedUid = cred.user.uid;
        } catch (authErr: any) {
          const msg = String(authErr?.message || authErr?.code || '');
          if (msg.includes('email-already-in-use')) {
            isExistingAccount = true;
            tempPassword = undefined;
          } else {
            throw new Error(authErr?.message || 'Failed to create Firebase Auth account.');
          }
        } finally {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
        }

        if (!isExistingAccount) {
          await setDoc(
            doc(db, 'users', resolvedUid),
            sanitizePayload({
              uid: resolvedUid,
              email: cleanEmail,
              displayName: cleanName,
              phone: cleanPhone,
              role: 'corporate_manager',
              roles: assignedRoles,
              corporateAccountId: account.id,
              corporateAccountNumber: account.accountNumber,
              status: 'active',
              createdAt: nowIso,
              updatedAt: nowIso,
            }),
            { merge: true }
          );
        }
      }
    } else if (typeof window !== 'undefined' && window.localStorage) {
      // Offline / Demo mode persistence so Admin can test signing in immediately
      try {
        const raw = window.localStorage.getItem(LOCAL_CORPORATE_MANAGERS_KEY);
        const list = raw ? (JSON.parse(raw) as any[]) : [];
        const existingIdx = list.findIndex((m) => m.email?.toLowerCase() === cleanEmail);
        if (existingIdx >= 0) {
          resolvedUid = list[existingIdx].uid || resolvedUid;
          isExistingAccount = true;
          tempPassword = undefined;
          list[existingIdx] = {
            ...list[existingIdx],
            uid: resolvedUid,
            email: cleanEmail,
            displayName: cleanName,
            roles: assignedRoles,
            corporateAccountId: account.id,
            corporateAccountNumber: account.accountNumber,
            updatedAt: nowIso,
          };
        } else {
          list.push({
            uid: resolvedUid,
            email: cleanEmail,
            displayName: cleanName,
            roles: assignedRoles,
            corporateAccountId: account.id,
            corporateAccountNumber: account.accountNumber,
            createdAt: nowIso,
          });
        }
        window.localStorage.setItem(LOCAL_CORPORATE_MANAGERS_KEY, JSON.stringify(list));
      } catch {
        // Ignore storage errors
      }
    }

    const managerEntry: CorporatePortalManagerRecord = {
      uid: resolvedUid,
      email: cleanEmail,
      name: cleanName,
      provisionedAt: nowIso,
      status: 'active',
    };

    const existingManagers = (account.portalManagers || []).filter(
      (m) => m.email.toLowerCase() !== cleanEmail
    );
    const nextBookers = Array.from(
      new Set([...(account.authorizedBookers || []), cleanEmail])
    );

    const updatedAccount: CorporateAccountConfig = {
      ...account,
      portalManagers: [managerEntry, ...existingManagers],
      authorizedBookers: nextBookers,
      updatedAt: nowIso,
    };

    await this.getCorpAcctSvc().syncAccountToFirestore(updatedAccount);

    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://chesterfieldtaxi.com';
    const portalUrl = `${origin}/app/corporate`;

    const instructionsLines = [
      `${COMPANY_CONFIG.name} — Corporate Self-Service Portal Access`,
      `Company: ${account.companyName} (${account.accountNumber})`,
      `Portal URL: ${portalUrl}`,
      `Login Email: ${cleanEmail}`,
      tempPassword
        ? `Temporary Password: ${tempPassword} (use "Forgot password" on /app/login anytime to set a custom password)`
        : `Password: Use your existing ${COMPANY_CONFIG.name} account password (or click "Forgot password" at ${origin}/app/login)`,
      `24/7 Corporate Dispatch Desk: ${COMPANY_CONFIG.phone.dispatch}`,
    ];

    return {
      uid: resolvedUid,
      email: cleanEmail,
      name: cleanName,
      corporateAccountId: account.id,
      corporateAccountNumber: account.accountNumber,
      roles: assignedRoles,
      isExistingAccount,
      tempPassword,
      portalUrl,
      instructionsText: instructionsLines.join('\n'),
      updatedAccount,
    };
  }
}

let corporatePortalServiceInstance: CorporatePortalService | null = null;

export function getCorporatePortalService(): CorporatePortalService {
  if (!corporatePortalServiceInstance) {
    corporatePortalServiceInstance = new CorporatePortalService();
  }
  return corporatePortalServiceInstance;
}
