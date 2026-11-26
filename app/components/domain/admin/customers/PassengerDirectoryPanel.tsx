import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Card, CardHeader, CardTitle, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  BanIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  SpinnerIcon,
  StarIcon,
  TrashIcon,
  UsersIcon,
} from '../../../ui/Icons';
import { ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import {
  ALPHABET_BUCKETS,
  computeAlphabetCounts,
  DIRECTORY_PAGE_SIZES,
  DIRECTORY_SORT_OPTIONS,
  DIRECTORY_VIEW_STORAGE_KEY,
  filterAndSortCustomers,
  getAlphabetBucket,
  getReliabilityScoreTone,
  paginateCustomers,
} from './customer-directory.util';
import { DirectoryToolbar } from './DirectoryToolbar';
import { PassengerDirectoryTable } from './PassengerDirectoryTable';
import type {
  AlphabetBucket,
  CustomerArchiveFilter,
  CustomerProfile,
  CustomerSortField,
  DirectoryViewMode,
} from './types';

export interface PassengerDirectoryPanelProps {
  isLoading: boolean;
  allCount: number;
  activeCount: number;
  archivedCount: number;
  blacklistCount: number;
  vipCount: number;
  displayedCustomers: CustomerProfile[];
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  archiveFilter: CustomerArchiveFilter;
  setArchiveFilter: (val: CustomerArchiveFilter) => void;
  vipOnly?: boolean;
  onVipOnlyChange?: (val: boolean) => void;
  alphabetBucket?: AlphabetBucket;
  onAlphabetBucketChange?: (val: AlphabetBucket) => void;
  sortOptionId?: string;
  onSortOptionChange?: (val: string) => void;
  serverLetterCounts?: Record<string, number>;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void | Promise<void>;
  onOpenCustomer: (cust: CustomerProfile, editMode?: boolean) => void;
  onToggleArchiveCustomer: (cust: CustomerProfile) => Promise<void>;
  onRestoreCustomer: (cust: CustomerProfile) => Promise<void>;
  onPurgeCustomer: (cust: CustomerProfile) => Promise<void>;
  onPurgeAllBlacklisted: () => Promise<void>;
}

export function PassengerDirectoryPanel({
  isLoading,
  allCount,
  activeCount,
  archivedCount,
  blacklistCount,
  vipCount,
  displayedCustomers,
  searchTerm,
  setSearchTerm,
  archiveFilter,
  setArchiveFilter,
  vipOnly: controlledVipOnly,
  onVipOnlyChange,
  alphabetBucket: controlledAlphabetBucket,
  onAlphabetBucketChange,
  sortOptionId: controlledSortOptionId,
  onSortOptionChange,
  serverLetterCounts,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onOpenCustomer,
  onToggleArchiveCustomer,
  onRestoreCustomer,
  onPurgeCustomer,
  onPurgeAllBlacklisted,
}: PassengerDirectoryPanelProps) {
  const isServerDriven = Boolean(onLoadMore);
  const [localVipOnly, setLocalVipOnly] = useState(false);
  const vipOnly = controlledVipOnly !== undefined ? controlledVipOnly : localVipOnly;
  const setVipOnly = (val: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof val === 'function' ? val(vipOnly) : val;
    if (onVipOnlyChange) onVipOnlyChange(next);
    else setLocalVipOnly(next);
  };

  const [localSearch, setLocalSearch] = useState(searchTerm);
  const deferredSearch = useDeferredValue(searchTerm);
  const [localSortOptionId, setLocalSortOptionId] = useState<string>(DIRECTORY_SORT_OPTIONS[0].id);
  const sortOptionId = controlledSortOptionId ?? localSortOptionId;
  const setSortOptionId = (nextId: string) => {
    if (onSortOptionChange) onSortOptionChange(nextId);
    else setLocalSortOptionId(nextId);
  };

  const [localAlphabetBucket, setLocalAlphabetBucket] = useState<AlphabetBucket>('All');
  const alphabetBucket = controlledAlphabetBucket ?? localAlphabetBucket;
  const setAlphabetBucket = (nextBucket: AlphabetBucket) => {
    if (onAlphabetBucketChange) onAlphabetBucketChange(nextBucket);
    else setLocalAlphabetBucket(nextBucket);
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DIRECTORY_PAGE_SIZES[0]);
  const [viewMode, setViewMode] = useState<DirectoryViewMode>('table');
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

  // Hydrate persisted view preference on client mount (SSR-safe)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(DIRECTORY_VIEW_STORAGE_KEY);
      if (saved === 'cards' || saved === 'table') {
        setViewMode(saved);
      }
    } catch {
      // Ignore storage read errors
    }
  }, []);

  const handleSetViewMode = (mode: DirectoryViewMode) => {
    setViewMode(mode);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DIRECTORY_VIEW_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write errors
    }
  };

  // Sync external searchTerm changes into local input state
  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  // Debounce search propagation so typing stays instant with 9,000+ records
  useEffect(() => {
    if (localSearch === searchTerm) return;
    const timer = window.setTimeout(() => {
      setSearchTerm(localSearch);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [localSearch, searchTerm, setSearchTerm]);

  const activeSortOption = useMemo(
    () => DIRECTORY_SORT_OPTIONS.find((opt) => opt.id === sortOptionId) ?? DIRECTORY_SORT_OPTIONS[0],
    [sortOptionId]
  );

  const handleSortColumn = (field: CustomerSortField) => {
    const nextDirection =
      activeSortOption.field === field
        ? activeSortOption.direction === 'asc'
          ? 'desc'
          : 'asc'
        : field === 'name'
        ? 'asc'
        : 'desc';
    const match = DIRECTORY_SORT_OPTIONS.find(
      (opt) => opt.field === field && opt.direction === nextDirection
    );
    if (match) {
      setSortOptionId(match.id);
    }
  };

  // Reset pagination to page 1 when any filter, sort, or bucket changes
  useEffect(() => {
    setPage(1);
  }, [activeSortOption.id, alphabetBucket, deferredSearch, archiveFilter, vipOnly]);

  const matchingCustomers = useMemo(() => {
    if (isServerDriven) return displayedCustomers;
    return filterAndSortCustomers(displayedCustomers, {
      searchTerm: deferredSearch,
      vipOnly,
      alphabetBucket: 'All',
      sortField: activeSortOption.field,
      sortDirection: activeSortOption.direction,
    });
  }, [
    isServerDriven,
    displayedCustomers,
    deferredSearch,
    vipOnly,
    activeSortOption.field,
    activeSortOption.direction,
  ]);

  const alphabetCounts = useMemo(() => {
    if (serverLetterCounts && !deferredSearch.trim()) {
      const counts = {} as Record<AlphabetBucket, number>;
      for (const bucket of ALPHABET_BUCKETS) {
        counts[bucket] = bucket === 'All' ? allCount : Number(serverLetterCounts[bucket] || 0);
      }
      return counts;
    }
    return computeAlphabetCounts(matchingCustomers);
  }, [serverLetterCounts, deferredSearch, allCount, matchingCustomers]);

  const bucketedCustomers = useMemo(() => {
    if (isServerDriven || alphabetBucket === 'All') return matchingCustomers;
    return matchingCustomers.filter((c) => getAlphabetBucket(c.name) === alphabetBucket);
  }, [isServerDriven, matchingCustomers, alphabetBucket]);

  const paginated = useMemo(() => {
    if (isServerDriven) {
      return {
        items: bucketedCustomers,
        totalItems: bucketedCustomers.length,
        totalPages: 1,
        currentPage: 1,
        startIndex: bucketedCustomers.length === 0 ? 0 : 1,
        endIndex: bucketedCustomers.length,
      };
    }
    return paginateCustomers(bucketedCustomers, page, pageSize);
  }, [isServerDriven, bucketedCustomers, page, pageSize]);

  // Keep page in bounds if items are archived/purged
  useEffect(() => {
    if (!isServerDriven && page > paginated.totalPages) {
      setPage(paginated.totalPages);
    }
  }, [isServerDriven, page, paginated.totalPages]);

  // Auto-load next 50 rows on scroll via IntersectionObserver in server-driven mode
  useEffect(() => {
    if (!isServerDriven || !hasMore || isLoadingMore || isLoading || deferredSearch.trim()) {
      return;
    }
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMore?.();
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isServerDriven, hasMore, isLoadingMore, isLoading, deferredSearch, onLoadMore]);

  return (
    <div className="space-y-4">
      {/* ─── Passenger Directory Search & Filter Toolbar ─── */}
      <DirectoryToolbar
        searchValue={localSearch}
        onSearchChange={setLocalSearch}
        onSearchClear={() => {
          setLocalSearch('');
          setSearchTerm('');
        }}
        searchPlaceholder="Search passengers by name, phone, email..."
        searchClearLabel="Clear passenger search"
        filterPills={[
          { id: 'active', label: 'Active', count: activeCount },
          {
            id: 'archived',
            label: 'Archived',
            count: archivedCount,
            icon: <ArchiveBoxIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" />,
          },
          {
            id: 'blacklist',
            label: 'Blacklist',
            count: blacklistCount,
            icon: (
              <BanIcon
                className={`w-3.5 h-3.5 shrink-0 ${
                  archiveFilter === 'blacklist' ? 'text-white' : 'text-rose-500'
                }`}
              />
            ),
            activeClassName: 'bg-rose-600 text-white shadow-xs font-bold',
            inactiveClassName: 'text-fg-muted hover:text-status-danger-fg',
          },
          { id: 'all', label: 'All', count: allCount },
        ]}
        activeFilterId={archiveFilter}
        onFilterChange={(id) => {
          setArchiveFilter(id as CustomerArchiveFilter);
          setConfirmPurgeAll(false);
        }}
        quickToggle={{
          id: 'vip',
          label: `VIP (${vipCount})`,
          active: vipOnly,
          onToggle: () => setVipOnly((prev) => !prev),
          icon: <StarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
        }}
        sortOptions={DIRECTORY_SORT_OPTIONS}
        sortValue={sortOptionId}
        onSortChange={setSortOptionId}
        sortAriaLabel="Sort passengers"
        viewMode={viewMode}
        onViewModeChange={handleSetViewMode}
        inlineExtra={
          archiveFilter === 'blacklist' && blacklistCount > 0 ? (
            confirmPurgeAll ? (
              <div className="inline-flex items-center gap-1.5 bg-status-danger-bg border border-status-danger-border px-2.5 py-1 rounded-xl">
                <span className="text-[11px] font-bold text-status-danger-fg">
                  Purge all {blacklistCount}?
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPurging}
                  onClick={async () => {
                    setIsPurging(true);
                    try {
                      await onPurgeAllBlacklisted();
                      setConfirmPurgeAll(false);
                    } finally {
                      setIsPurging(false);
                    }
                  }}
                  className="text-[11px] font-bold px-2 py-1 h-auto bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                >
                  {isPurging ? 'Purging...' : 'Confirm'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPurging}
                  onClick={() => setConfirmPurgeAll(false)}
                  className="text-[11px] font-bold px-2 py-1 h-auto text-fg-secondary border-border-subtle cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<TrashIcon className="w-3.5 h-3.5 text-rose-600" />}
                onClick={() => setConfirmPurgeAll(true)}
                className="text-xs font-bold text-status-danger-fg border-status-danger-border bg-status-danger-bg/70 hover:bg-status-danger-bg-strong cursor-pointer"
              >
                Purge All Blacklisted
              </Button>
            )
          ) : null
        }
        actions={[
          {
            id: 'add-client',
            label: 'Add Client',
            variant: 'primary',
            icon: <PlusIcon className="w-4 h-4" />,
            onClick: () =>
              onOpenCustomer(
                {
                  id: `cust_new_${Date.now()}`,
                  name: '',
                  email: '',
                  phone: '',
                  tripCount: 0,
                  totalSpend: 0,
                  lastRideDate: 'New',
                  isVip: false,
                  preferredVehicle: 'Standard Sedan',
                },
                true
              ),
          },
        ]}
      />

      {/* ─── Alphabet Page Bar ─── */}
      {!isLoading && (
        <div
          className="bg-surface-card px-2.5 py-2 rounded-2xl border border-border-subtle/90 shadow-xs flex items-center gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Filter passengers by starting letter"
        >
          {ALPHABET_BUCKETS.map((bucket) => {
            const count = alphabetCounts[bucket] ?? 0;
            const isActive = alphabetBucket === bucket;
            const isDisabled = bucket !== 'All' && count === 0;

            return (
              <button
                key={bucket}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={isDisabled}
                onClick={() => setAlphabetBucket(bucket)}
                title={
                  bucket === 'All'
                    ? `All passengers (${count})`
                    : `${bucket}: ${count} passenger${count === 1 ? '' : 's'}`
                }
                className={`px-2 py-1 rounded-lg text-[11px] font-extrabold transition-all shrink-0 tabular-nums ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs cursor-pointer'
                    : isDisabled
                    ? 'text-fg-subtle/40 cursor-not-allowed'
                    : 'text-fg-secondary hover:bg-surface-muted hover:text-fg-primary cursor-pointer'
                }`}
              >
                {bucket}
                {bucket === 'All' && (
                  <span className={`ml-1 text-[10px] ${isActive ? 'text-white/90' : 'text-fg-subtle'}`}>
                    ({count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ─── Passenger Directory Content (Cards or Table) ─── */}
      {isLoading ? (
        <div className="bg-surface-card rounded-2xl border border-border-subtle/80 p-12 flex items-center justify-center gap-2 text-fg-subtle">
          <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
          <span className="text-xs font-semibold">Loading passenger directory...</span>
        </div>
      ) : paginated.totalItems === 0 ? (
        <div className="py-12 text-center bg-surface-card rounded-2xl border border-border-subtle">
          <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <p className="text-fg-secondary font-bold text-sm">No passengers found</p>
          <p className="text-fg-subtle font-medium text-xs mt-1">
            {deferredSearch
              ? `No clients matched "${deferredSearch}".`
              : alphabetBucket !== 'All'
              ? `No clients found under "${alphabetBucket}".`
              : vipOnly
              ? 'No VIP priority clients match the active filter.'
              : 'Add a client or switch the archive filter above.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <PassengerDirectoryTable
          customers={paginated.items}
          sortField={activeSortOption.field}
          sortDirection={activeSortOption.direction}
          onSortColumn={handleSortColumn}
          onOpenCustomer={onOpenCustomer}
          onToggleArchiveCustomer={onToggleArchiveCustomer}
          onRestoreCustomer={onRestoreCustomer}
          onPurgeCustomer={onPurgeCustomer}
          confirmPurgeId={confirmPurgeId}
          setConfirmPurgeId={setConfirmPurgeId}
          isPurging={isPurging}
          setIsPurging={setIsPurging}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {paginated.items.map((cust) => {
            const score = cust.customerScore ?? 90;
            const scoreTone = getReliabilityScoreTone(score);
            const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();

            return (
              <Card
                key={cust.id}
                onClick={() => onOpenCustomer(cust, false)}
                className="border border-border-subtle/90 shadow-xs flex flex-col justify-between hover:border-status-info-border hover:shadow-sm transition-all cursor-pointer"
              >
                <div>
                  <CardHeader className="pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                            cust.isBlacklisted
                              ? 'bg-status-danger-bg-strong text-status-danger-fg'
                              : cust.isVip
                              ? 'bg-status-warning-bg-strong text-status-warning-fg'
                              : 'bg-status-info-bg text-status-info-fg'
                          }`}
                        >
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-sm font-black text-fg-primary truncate">
                            {cust.name}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            {cust.corporateAccountName ? (
                              <span className="text-[10px] font-bold text-status-info-fg bg-status-info-bg border border-status-info-border/70 px-1.5 py-0.2 rounded-md truncate max-w-[160px]">
                                {cust.corporateAccountName}
                              </span>
                            ) : (
                              <span className="text-[11px] font-medium text-fg-subtle">
                                Direct Client
                              </span>
                            )}
                            {cust.isVip && (
                              <Badge variant="warning" size="sm" className="text-[9px] px-1.5 py-0 font-black">
                                VIP
                              </Badge>
                            )}
                            {cust.isBlacklisted && (
                              <Badge variant="error" size="sm" className="text-[9px] px-1.5 py-0 font-extrabold">
                                BLACKLISTED
                              </Badge>
                            )}
                            {cust.isArchived && (
                              <Badge variant="neutral" size="sm" className="text-[9px] px-1.5 py-0 font-extrabold">
                                ARCHIVED
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 font-black text-[11px] px-2 py-0.5 rounded-full border shrink-0 tabular-nums ${scoreTone}`}
                        title="Client Reliability Score"
                      >
                        <StarIcon className="w-3 h-3 shrink-0" />
                        <span>{score}</span>
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2.5 text-xs">
                    {cust.blacklistReason && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-status-danger-bg border border-status-danger-border text-[11px] text-status-danger-fg font-semibold">
                        Block reason: {cust.blacklistReason}
                      </div>
                    )}

                    <div className="p-2.5 bg-surface-subtle rounded-xl border border-border-subtle/80 space-y-1.5">
                      <div className="flex items-center gap-2 text-fg-strong font-semibold">
                        <PhoneIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                        <span className="font-mono text-[11px] truncate">{cust.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-fg-secondary">
                        <MailIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
                        <span className="text-[11px] truncate">{cust.email || 'No email on file'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface-subtle rounded-xl text-[11px]">
                      <div>
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Rides</span>
                        <span className="font-extrabold text-fg-primary tabular-nums">{cust.tripCount}</span>
                      </div>
                      <div>
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Spend</span>
                        <span className="font-extrabold text-status-success-fg tabular-nums">
                          ${cust.totalSpend.toFixed(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-fg-subtle block text-[9px] uppercase font-bold">Class</span>
                        <span className="font-bold text-fg-secondary capitalize truncate block">
                          {cust.preferredVehicle || 'Standard'}
                        </span>
                      </div>
                    </div>

                    {(cust.hasInvoicesOrCorporate || cust.corporateAccountName) && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <Link
                          to="/app/admin?tab=invoicing&sub=ledger"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-status-info-fg"
                        >
                          <span>View Invoices &rarr;</span>
                          <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    <div
                      className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border-faint"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCustomer(cust, false)}
                        className="text-[11px] font-bold flex-1 py-1.5 h-auto text-fg-secondary border-border-subtle hover:bg-surface-subtle cursor-pointer"
                      >
                        Details
                      </Button>
                      {cust.isBlacklisted ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onRestoreCustomer(cust)}
                            className="text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 text-status-success-fg border-status-success-border bg-status-success-bg hover:bg-status-success-bg-strong cursor-pointer"
                          >
                            <CheckIcon className="w-3 h-3 text-emerald-600" />
                            <span>Restore</span>
                          </Button>
                          {confirmPurgeId === cust.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPurging}
                                onClick={async () => {
                                  setIsPurging(true);
                                  try {
                                    await onPurgeCustomer(cust);
                                    setConfirmPurgeId(null);
                                  } finally {
                                    setIsPurging(false);
                                  }
                                }}
                                className="text-[11px] px-2 py-1.5 h-auto font-bold bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                              >
                                {isPurging ? '...' : 'Confirm'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isPurging}
                                onClick={() => setConfirmPurgeId(null)}
                                className="text-[11px] px-2 py-1.5 h-auto font-bold text-fg-secondary border-border-subtle cursor-pointer"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmPurgeId(cust.id)}
                              className="text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 text-status-danger-fg border-status-danger-border bg-status-danger-bg hover:bg-status-danger-bg-strong cursor-pointer"
                            >
                              <TrashIcon className="w-3 h-3 text-rose-600" />
                              <span>Purge</span>
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenCustomer(cust, true)}
                            className="text-[11px] font-bold flex-1 py-1.5 h-auto text-status-info-fg border-status-info-border bg-status-info-bg/50 hover:bg-status-info-bg-strong/70 cursor-pointer"
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onToggleArchiveCustomer(cust)}
                            className={`text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 cursor-pointer ${
                              cust.isArchived
                                ? 'text-status-success-fg border-status-success-border bg-status-success-bg hover:bg-status-success-bg-strong'
                                : 'text-fg-secondary border-border-subtle hover:bg-surface-muted'
                            }`}
                          >
                            {cust.isArchived ? (
                              <>
                                <CheckIcon className="w-3 h-3 text-emerald-600" />
                                <span>Restore</span>
                              </>
                            ) : (
                              <>
                                <ArchiveBoxIcon className="w-3 h-3 text-fg-muted" />
                                <span>Archive</span>
                              </>
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Server-Driven Auto-Scroll Sentinel & Status Footer ─── */}
      {isServerDriven && !isLoading && paginated.totalItems > 0 && (
        <div className="bg-surface-card px-3.5 py-2.5 rounded-2xl border border-border-subtle/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <span className="text-fg-secondary font-medium tabular-nums">
            Loaded <strong className="text-fg-primary font-extrabold">{paginated.totalItems}</strong>{' '}
            {deferredSearch.trim()
              ? 'matching passenger(s)'
              : alphabetBucket === 'All' && !vipOnly && archiveFilter === 'active'
              ? `of ${activeCount} active passenger(s)`
              : 'passenger(s)'}
          </span>
          {hasMore && !deferredSearch.trim() ? (
            <div ref={loadMoreSentinelRef} className="flex items-center gap-2">
              {isLoadingMore && <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isLoadingMore}
                onClick={() => void onLoadMore?.()}
                className="text-xs font-bold px-3 py-1 h-auto border-border-subtle text-fg-secondary hover:bg-surface-subtle cursor-pointer"
              >
                {isLoadingMore ? 'Loading next 50...' : 'Load More (+50)'}
              </Button>
            </div>
          ) : (
            <span className="text-[11px] text-fg-muted font-semibold">End of results</span>
          )}
        </div>
      )}

      {/* ─── Legacy Client-Side Pagination Footer ─── */}
      {!isServerDriven && !isLoading && paginated.totalItems > 0 && (
        <div className="bg-surface-card px-3.5 py-2.5 rounded-2xl border border-border-subtle/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-3 text-fg-secondary font-medium">
            <span className="tabular-nums">
              Showing <strong className="text-fg-primary font-extrabold">{paginated.startIndex}–{paginated.endIndex}</strong> of{' '}
              <strong className="text-fg-primary font-extrabold">{paginated.totalItems}</strong>
            </span>
            <label className="inline-flex items-center gap-1.5 text-fg-muted font-semibold">
              <span>Per page:</span>
              <select
                aria-label="Passengers per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 rounded-lg bg-surface-subtle border border-border-subtle text-xs font-bold text-fg-primary focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
              >
                {DIRECTORY_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={paginated.currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-xs font-bold px-2.5 py-1 h-auto border-border-subtle text-fg-secondary disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeftIcon className="w-3.5 h-3.5 mr-1" />
              Prev
            </Button>
            <span className="text-xs font-bold text-fg-secondary tabular-nums px-1.5">
              Page {paginated.currentPage} of {paginated.totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={paginated.currentPage >= paginated.totalPages}
              onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
              className="text-xs font-bold px-2.5 py-1 h-auto border-border-subtle text-fg-secondary disabled:opacity-40 cursor-pointer"
            >
              Next
              <ChevronRightIcon className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
