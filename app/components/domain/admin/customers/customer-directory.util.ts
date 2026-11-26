import type { CorporateAccountConfig, InvoiceRecord } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import type {
  AlphabetBucket,
  CorporatePoFilter,
  CorporateSortField,
  CorporateSortOption,
  CorporateTableColumn,
  CustomerProfile,
  CustomerSortField,
  CustomerSortOption,
  DirectoryTableColumn,
  SortDirection,
} from './types';

export const DIRECTORY_VIEW_STORAGE_KEY = 'chesterfield_admin_passenger_directory_view';
export const CORPORATE_VIEW_STORAGE_KEY = 'chesterfield_admin_corporate_directory_view';

export const DIRECTORY_PAGE_SIZES = [24, 48, 100] as const;

export const ALPHABET_BUCKETS: readonly AlphabetBucket[] = [
  'All',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  '#',
];

export const DIRECTORY_SORT_OPTIONS: readonly CustomerSortOption[] = [
  { id: 'name-asc', field: 'name', direction: 'asc', label: 'Name (A–Z)' },
  { id: 'name-desc', field: 'name', direction: 'desc', label: 'Name (Z–A)' },
  { id: 'tripCount-desc', field: 'tripCount', direction: 'desc', label: 'Rides (High–Low)' },
  { id: 'tripCount-asc', field: 'tripCount', direction: 'asc', label: 'Rides (Low–High)' },
  { id: 'customerScore-desc', field: 'customerScore', direction: 'desc', label: 'Reliability (High–Low)' },
  { id: 'customerScore-asc', field: 'customerScore', direction: 'asc', label: 'Reliability (Low–High)' },
];

export const DIRECTORY_TABLE_COLUMNS: readonly DirectoryTableColumn[] = [
  { id: 'client', label: 'Client', sortField: 'name', align: 'left' },
  { id: 'contact', label: 'Contact', align: 'left', hideOnMobile: true },
  { id: 'rides', label: 'Rides', sortField: 'tripCount', align: 'right' },
  { id: 'spend', label: 'Spend', align: 'right', hideOnMobile: true },
  { id: 'score', label: 'Score', sortField: 'customerScore', align: 'center' },
  { id: 'actions', label: 'Actions', align: 'right' },
];

export const CORPORATE_SORT_OPTIONS: readonly CorporateSortOption[] = [
  { id: 'companyName-asc', field: 'companyName', direction: 'asc', label: 'Company (A–Z)' },
  { id: 'companyName-desc', field: 'companyName', direction: 'desc', label: 'Company (Z–A)' },
  { id: 'accountNumber-asc', field: 'accountNumber', direction: 'asc', label: 'Account # (Asc)' },
  { id: 'poRequired-desc', field: 'poRequired', direction: 'desc', label: 'PO Enforced First' },
  { id: 'ridersCount-desc', field: 'ridersCount', direction: 'desc', label: 'Riders (High–Low)' },
];

export const CORPORATE_TABLE_COLUMNS: readonly CorporateTableColumn[] = [
  { id: 'company', label: 'Company / Account', sortField: 'companyName', align: 'left' },
  { id: 'poPolicy', label: 'PO Policy & Prefix', sortField: 'poRequired', align: 'left' },
  {
    id: 'assets',
    label: 'Riders / Locations / Managers',
    sortField: 'ridersCount',
    align: 'left',
    hideOnMobile: true,
  },
  { id: 'actions', label: 'Actions', align: 'right' },
];

export interface FilterAndSortCorporateOptions {
  searchTerm: string;
  filter: CorporatePoFilter;
  sortField: CorporateSortField;
  sortDirection: SortDirection;
}

/**
 * Filters corporate accounts by PO enforcement status and search query, then sorts deterministically.
 */
export function filterAndSortCorporateAccounts(
  accounts: ReadonlyArray<CorporateAccountConfig>,
  options: FilterAndSortCorporateOptions
): CorporateAccountConfig[] {
  const q = options.searchTerm.trim().toLowerCase();
  const filtered = accounts.filter((corp) => {
    if (options.filter === 'po_enforced' && !corp.poRequired) return false;
    if (options.filter === 'po_disabled' && corp.poRequired) return false;
    if (!q) return true;
    return (
      corp.companyName.toLowerCase().includes(q) ||
      corp.accountNumber.toLowerCase().includes(q) ||
      Boolean(corp.currentPoNumber && corp.currentPoNumber.toLowerCase().includes(q)) ||
      Boolean(corp.billingContactEmail && corp.billingContactEmail.toLowerCase().includes(q)) ||
      Boolean(corp.billingAddress && corp.billingAddress.toLowerCase().includes(q))
    );
  });

  const dirMultiplier = options.sortDirection === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    if (options.sortField === 'companyName') {
      cmp = NAME_COLLATOR.compare(a.companyName || '', b.companyName || '');
    } else if (options.sortField === 'accountNumber') {
      cmp = NAME_COLLATOR.compare(a.accountNumber || '', b.accountNumber || '');
    } else if (options.sortField === 'poRequired') {
      cmp = Number(Boolean(a.poRequired)) - Number(Boolean(b.poRequired));
    } else if (options.sortField === 'ridersCount') {
      cmp = (a.authorizedRiders || []).length - (b.authorizedRiders || []).length;
    }
    if (cmp !== 0) return cmp * dirMultiplier;
    const nameCmp = NAME_COLLATOR.compare(a.companyName || '', b.companyName || '');
    return nameCmp !== 0 ? nameCmp : a.id.localeCompare(b.id);
  });

  return filtered;
}

/**
 * Returns the badge tone classes for a passenger reliability score.
 */
export function getReliabilityScoreTone(score: number): string {
  if (score >= 80) {
    return 'bg-status-success-bg text-status-success-fg border-status-success-border';
  }
  if (score >= 60) {
    return 'bg-status-warning-bg text-status-warning-fg border-status-warning-border';
  }
  return 'bg-status-danger-bg text-status-danger-fg border-status-danger-border';
}

/**
 * Maps a passenger's name to its A-Z alphabet bucket, or '#' for non-alphabetic/empty names.
 */
export function getAlphabetBucket(name: string): Exclude<AlphabetBucket, 'All'> {
  const firstChar = (name || '').trim().charAt(0).toUpperCase();
  if (/^[A-Z]$/.test(firstChar)) {
    return firstChar as Exclude<AlphabetBucket, 'All'>;
  }
  return '#';
}

/**
 * Computes single-pass counts for All, A-Z, and # buckets.
 */
export function computeAlphabetCounts(
  customers: ReadonlyArray<CustomerProfile>
): Record<AlphabetBucket, number> {
  const counts = {} as Record<AlphabetBucket, number>;
  for (const bucket of ALPHABET_BUCKETS) {
    counts[bucket] = 0;
  }
  counts.All = customers.length;
  for (const cust of customers) {
    counts[getAlphabetBucket(cust.name)] += 1;
  }
  return counts;
}

const NAME_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base' });

export interface FilterAndSortCustomersOptions {
  searchTerm: string;
  vipOnly: boolean;
  alphabetBucket: AlphabetBucket;
  sortField: CustomerSortField;
  sortDirection: SortDirection;
}

/**
 * Filters customers by VIP status, search query, and alphabet bucket, then sorts deterministically.
 */
export function filterAndSortCustomers(
  customers: ReadonlyArray<CustomerProfile>,
  options: FilterAndSortCustomersOptions
): CustomerProfile[] {
  const query = options.searchTerm.trim().toLowerCase();
  const useSearch = query.length > 0;
  const useBucket = options.alphabetBucket !== 'All';

  const filtered: CustomerProfile[] = [];
  for (const c of customers) {
    if (options.vipOnly && !c.isVip) continue;
    if (useBucket && getAlphabetBucket(c.name) !== options.alphabetBucket) continue;
    if (useSearch) {
      const matches =
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query) ||
        Boolean(c.corporateAccountName && c.corporateAccountName.toLowerCase().includes(query));
      if (!matches) continue;
    }
    filtered.push(c);
  }

  const dirMultiplier = options.sortDirection === 'asc' ? 1 : -1;
  filtered.sort((a, b) => {
    let cmp = 0;
    if (options.sortField === 'name') {
      cmp = NAME_COLLATOR.compare(a.name || '', b.name || '');
    } else if (options.sortField === 'tripCount') {
      cmp = (a.tripCount ?? 0) - (b.tripCount ?? 0);
    } else if (options.sortField === 'customerScore') {
      cmp = (a.customerScore ?? 90) - (b.customerScore ?? 90);
    }
    if (cmp !== 0) return cmp * dirMultiplier;
    // Deterministic tie-breaker
    const nameCmp = NAME_COLLATOR.compare(a.name || '', b.name || '');
    return nameCmp !== 0 ? nameCmp : a.id.localeCompare(b.id);
  });

  return filtered;
}

export interface PaginatedCustomersResult {
  items: CustomerProfile[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Returns the bounded slice and pagination metadata for the active page.
 */
export function paginateCustomers(
  customers: ReadonlyArray<CustomerProfile>,
  page: number,
  pageSize: number
): PaginatedCustomersResult {
  const safePageSize = pageSize > 0 ? pageSize : DIRECTORY_PAGE_SIZES[0];
  const totalItems = customers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safePageSize;
  const end = Math.min(start + safePageSize, totalItems);

  return {
    items: customers.slice(start, end),
    totalItems,
    totalPages,
    currentPage,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: end,
  };
}

export function buildCustomerProfilesList(
  trips: ReadonlyArray<Trip>,
  invoices: ReadonlyArray<InvoiceRecord> = []
): CustomerProfile[] {
  const invoiceEmailsSet = new Set<string>();
  for (const inv of invoices) {
    if (inv.customerEmail) invoiceEmailsSet.add(inv.customerEmail.trim().toLowerCase());
    if (inv.customerName) invoiceEmailsSet.add(inv.customerName.trim().toLowerCase());
  }

  const customerMap = new Map<string, CustomerProfile>();

  for (const t of trips) {
    const emailKey = t.passenger?.email || t.passenger?.phone || t.id;
    const passengerName =
      [t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') ||
      'Guest Passenger';
    const phone = t.passenger?.phone || 'No phone';
    const fare = Number(t.pricing?.totalFare || t.payment?.amount || 0);
    const isCorpTrip =
      Boolean(t.corporateAccountId) ||
      t.payment?.method === 'account' ||
      t.payment?.method === 'corporate';

    if (customerMap.has(emailKey)) {
      const existing = customerMap.get(emailKey)!;
      existing.tripCount += 1;
      existing.totalSpend += fare;
      if (isCorpTrip) existing.hasInvoicesOrCorporate = true;
    } else {
      customerMap.set(emailKey, {
        id: `cust-${emailKey}`,
        name: passengerName,
        email: t.passenger?.email || 'N/A',
        phone,
        tripCount: 1,
        totalSpend: fare,
        lastRideDate: t.scheduledPickupTime || 'Recent',
        isVip: false,
        preferredVehicle: t.vehicleTier,
        hasInvoicesOrCorporate: isCorpTrip,
      });
    }
  }

  try {
    const savedContacts = getContactService().getAllContacts();
    for (const sc of savedContacts) {
      const key = sc.email && sc.email !== 'N/A' ? sc.email : sc.phone || sc.id;
      const existing = customerMap.get(key);
      customerMap.set(key, {
        id: sc.id,
        name: sc.name,
        email: sc.email || 'N/A',
        phone: sc.phone,
        tripCount: existing ? existing.tripCount : sc.tripCount || 1,
        totalSpend: existing ? existing.totalSpend : sc.totalSpend || 0,
        lastRideDate: existing ? existing.lastRideDate : 'Recent',
        isVip: sc.isVip ?? false,
        corporateAccountName: sc.corporateAccountName,
        hasInvoicesOrCorporate: Boolean(
          sc.corporateAccountName || existing?.hasInvoicesOrCorporate
        ),
        preferredVehicle: sc.preferredVehicleTier,
        notes: sc.notes,
        customerScore: sc.customerScore,
        isBlacklisted: sc.isBlacklisted,
        blacklistReason: sc.blacklistReason,
        isArchived: sc.isArchived,
      });
    }
  } catch {
    // Ignore offline contact read warnings
  }

  const govService = getUniversalGovernanceService();
  const profiles: CustomerProfile[] = [];
  for (const c of customerMap.values()) {
    const gov = govService.isPassengerBlacklistedSync(c.phone, c.email);
    if (gov.isPurged) continue;

    const score = govService.calculateCustomerScore({
      completedTrips: c.tripCount,
      cancelledTrips: 0,
      noShows: 0,
      totalSpend: c.totalSpend,
    });
    const hasInv =
      Boolean(c.hasInvoicesOrCorporate || c.corporateAccountName) ||
      (c.email !== 'N/A' && invoiceEmailsSet.has(c.email.toLowerCase())) ||
      invoiceEmailsSet.has(c.name.toLowerCase());

    profiles.push({
      ...c,
      hasInvoicesOrCorporate: hasInv,
      customerScore: score,
      isBlacklisted: gov.isBlacklisted,
      blacklistReason: gov.reason,
      isArchived: gov.isArchived,
    });
  }
  return profiles;
}
