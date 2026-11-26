import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
  type InvoiceRecord,
} from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import {
  archiveCorporateAccountRecord,
  getCorporateAccountService,
} from '../../../../core/services/corporate-account.service';
import {
  getKpiSummaryService,
  type KpiSummaryDoc,
} from '../../../../core/services/analytics/kpi-summary.service';
import {
  getContactService,
  type ContactDirectorySortField,
  type ContactRecord,
} from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { getOperatorService, type DriverRosterItem } from '../../../../core/services/operator.service';
import {
  DIRECTORY_SORT_OPTIONS,
  PassengerDirectoryPanel,
  CustomerProfileDrawer,
  CorporateDirectoryPanel,
  CorporateAccountDirectoryDrawer,
  CorporatePortalManagersModal,
  type AdminCustomersSubpageProps,
  type AlphabetBucket,
  type CustomerArchiveFilter,
  type CustomerProfile,
  type CustomersPageMode,
  type CustomersSubTab,
} from '../customers';

export type { CustomersSubTab, CustomersPageMode, AdminCustomersSubpageProps };

const CONTACTS_PAGE_SIZE = 50;

function contactRecordsToCustomerProfiles(
  contacts: ReadonlyArray<ContactRecord>,
  invoices: ReadonlyArray<InvoiceRecord> = []
): CustomerProfile[] {
  const invoiceEmailsSet = new Set<string>();
  for (const inv of invoices) {
    if (inv.customerEmail) invoiceEmailsSet.add(inv.customerEmail.trim().toLowerCase());
    if (inv.customerName) invoiceEmailsSet.add(inv.customerName.trim().toLowerCase());
  }

  const govService = getUniversalGovernanceService();
  const profiles: CustomerProfile[] = [];
  const seenIds = new Set<string>();

  for (const sc of contacts) {
    if (!sc?.id || seenIds.has(sc.id)) continue;
    seenIds.add(sc.id);

    const emailVal = sc.email || 'N/A';
    const phoneVal = sc.phone || 'No phone';
    const gov = govService.isPassengerBlacklistedSync(phoneVal, emailVal);
    if (gov.isPurged) continue;

    const tripCount = sc.tripCount ?? 1;
    const totalSpend = sc.totalSpend ?? 0;
    const score =
      sc.customerScore ??
      govService.calculateCustomerScore({
        completedTrips: tripCount,
        cancelledTrips: 0,
        noShows: 0,
        totalSpend,
      });

    const hasInv =
      Boolean(sc.corporateAccountName) ||
      (emailVal !== 'N/A' && invoiceEmailsSet.has(emailVal.toLowerCase())) ||
      invoiceEmailsSet.has((sc.name || '').toLowerCase());

    profiles.push({
      id: sc.id,
      name: sc.name || 'Customer',
      email: emailVal,
      phone: phoneVal,
      tripCount,
      totalSpend,
      lastRideDate: 'Recent',
      isVip: Boolean(sc.isVip),
      corporateAccountName: sc.corporateAccountName,
      hasInvoicesOrCorporate: hasInv,
      preferredVehicle: sc.preferredVehicleTier,
      notes: sc.notes,
      customerScore: score,
      isBlacklisted: Boolean(sc.isBlacklisted || gov.isBlacklisted),
      blacklistReason: sc.blacklistReason || gov.reason,
      isArchived: Boolean(sc.isArchived || gov.isArchived),
    });
  }

  return profiles;
}

export function AdminCustomersSubpage({
  settings,
  mode,
  initialSubTab = 'directory',
  onSave,
}: AdminCustomersSubpageProps) {
  const effectiveMode: CustomersPageMode =
    mode ?? (initialSubTab === 'corporate' ? 'corporate' : 'passengers');
  const [searchTerm, setSearchTerm] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<CustomerArchiveFilter>('active');
  const [vipOnly, setVipOnly] = useState(false);
  const [alphabetBucket, setAlphabetBucket] = useState<AlphabetBucket>('All');
  const [sortOptionId, setSortOptionId] = useState<string>(DIRECTORY_SORT_OPTIONS[0].id);

  const [pagedContacts, setPagedContacts] = useState<ContactRecord[]>([]);
  const [contactsCursor, setContactsCursor] = useState<string | null>(null);
  const [hasMoreContacts, setHasMoreContacts] = useState<boolean>(false);
  const [isLoadingMoreContacts, setIsLoadingMoreContacts] = useState<boolean>(false);
  const [remoteSearchContacts, setRemoteSearchContacts] = useState<ContactRecord[] | null>(null);
  const [kpiSummary, setKpiSummary] = useState<KpiSummaryDoc | null>(null);

  const [selectedCustomerTrips, setSelectedCustomerTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<DriverRosterItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [governanceRefreshKey, setGovernanceRefreshKey] = useState(0);

  const [extraCorpAccounts, setExtraCorpAccounts] = useState<CorporateAccountConfig[]>(() =>
    getCorporateAccountService().getCachedCorporateAccounts()
  );
  const [editingCorp, setEditingCorp] = useState<CorporateAccountConfig | null>(null);
  const [isNewCorp, setIsNewCorp] = useState(false);
  const [provisioningCorp, setProvisioningCorp] = useState<CorporateAccountConfig | null>(null);
  const [pendingArchiveCorp, setPendingArchiveCorp] = useState<CorporateAccountConfig | null>(null);

  const handleOpenCustomer = useCallback((cust: CustomerProfile, editMode = false) => {
    setSelectedCustomer(cust);
    setIsEditingCustomer(editMode);
  }, []);

  // Deep-link support (?phone=... or ?id=...) using LRU cache + indexed remote search fallback
  useEffect(() => {
    if (effectiveMode !== 'passengers') return;
    if (typeof window === 'undefined') return;
    let cancelled = false;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetPhone = params.get('phone');
      const targetId = params.get('id');
      if (!targetPhone && !targetId) return;

      const contactService = getContactService();
      const openFromContact = (match: ContactRecord) => {
        if (cancelled) return;
        handleOpenCustomer(
          {
            id: match.id,
            name: match.name,
            email: match.email || 'N/A',
            phone: match.phone,
            tripCount: match.tripCount || 1,
            totalSpend: match.totalSpend || 0,
            lastRideDate: 'Recent',
            isVip: match.isVip ?? false,
            preferredVehicle: match.preferredVehicleTier,
            corporateAccountName: match.corporateAccountName,
            hasInvoicesOrCorporate: Boolean(match.corporateAccountName),
            notes: match.notes,
            customerScore: match.customerScore ?? 90,
          },
          true
        );
      };

      const localMatch = targetPhone
        ? contactService.getContactByPhone(targetPhone)
        : contactService.getContactById(targetId!);
      if (localMatch) {
        openFromContact(localMatch);
      } else {
        void contactService
          .searchContactsRemote(targetPhone || targetId!, 5)
          .then((matches) => {
            if (matches[0]) openFromContact(matches[0]);
          })
          .catch(() => {});
      }
    } catch {
      // Ignore URL parse warnings
    }
    return () => {
      cancelled = true;
    };
  }, [handleOpenCustomer]);

  const activeSortOption = useMemo(
    () => DIRECTORY_SORT_OPTIONS.find((opt) => opt.id === sortOptionId) ?? DIRECTORY_SORT_OPTIONS[0],
    [sortOptionId]
  );

  // Subscribe to 1-read KPI summary (real directory tab & A–Z counts) + governance/contact listeners
  useEffect(() => {
    if (effectiveMode !== 'passengers') {
      setIsLoading(false);
      return;
    }
    const govService = getUniversalGovernanceService();
    const contactService = getContactService();

    const unsubKpi = getKpiSummaryService().subscribeToKpiSummary((summary) => {
      setKpiSummary(summary);
    });
    void govService.syncPassengerGovernanceFromFirestore().catch(() => 0);

    const unsubGov = govService.subscribe(() => {
      setGovernanceRefreshKey((k) => k + 1);
    });
    const unsubContacts = contactService.subscribe((evt) => {
      if (evt.action === 'saved' && evt.contact?.id) {
        setPagedContacts((prev) => {
          const exists = prev.some((c) => c.id === evt.contact.id);
          return exists
            ? prev.map((c) => (c.id === evt.contact.id ? evt.contact : c))
            : [evt.contact, ...prev];
        });
      } else if (evt.action === 'deleted' && evt.contact?.id) {
        setPagedContacts((prev) => prev.filter((c) => c.id !== evt.contact.id));
      }
      setGovernanceRefreshKey((k) => k + 1);
    });

    const opSvc = getOperatorService();
    setDrivers(opSvc.getDriverRoster());
    const unsubDrivers = opSvc.subscribeToDrivers((roster) => setDrivers(roster));

    return () => {
      unsubKpi();
      unsubGov();
      unsubContacts();
      unsubDrivers();
    };
  }, [effectiveMode]);

  // Server-driven directory query (`listContactsPage`) whenever filter, VIP, A–Z bucket, or sort changes
  useEffect(() => {
    if (effectiveMode !== 'passengers') return;
    const contactService = getContactService();
    let cancelled = false;

    setIsLoading(true);
    contactService
      .listContactsPage({
        cursor: null,
        limit: CONTACTS_PAGE_SIZE,
        archiveFilter,
        vipOnly,
        letterBucket: alphabetBucket,
        sortField: activeSortOption.field as ContactDirectorySortField,
        sortDirection: activeSortOption.direction,
      })
      .then((page) => {
        if (cancelled) return;
        setPagedContacts(page.contacts);
        setContactsCursor(page.nextCursor);
        setHasMoreContacts(page.hasMore);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    effectiveMode,
    archiveFilter,
    vipOnly,
    alphabetBucket,
    activeSortOption.field,
    activeSortOption.direction,
  ]);

  // On-demand indexed remote contact search when `searchTerm` has >= 2 characters
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setRemoteSearchContacts(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      getContactService()
        .searchContactsRemote(trimmed, CONTACTS_PAGE_SIZE)
        .then((matches) => {
          if (!cancelled) {
            setRemoteSearchContacts(matches);
          }
        })
        .catch(() => {});
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  // On-demand customer trip fetch ONLY when a customer drawer is opened
  useEffect(() => {
    if (!selectedCustomer || selectedCustomer.id.startsWith('cust_new_')) {
      setSelectedCustomerTrips([]);
      return;
    }

    const service = getBookingService();
    if (!service.getTripsByCustomer) {
      setSelectedCustomerTrips([]);
      return;
    }

    let cancelled = false;
    service
      .getTripsByCustomer({
        customerId: selectedCustomer.id,
        email: selectedCustomer.email,
        phone: selectedCustomer.phone,
        limit: 50,
      })
      .then((customerTrips) => {
        if (!cancelled) {
          setSelectedCustomerTrips(customerTrips);
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedCustomerTrips([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer?.id, selectedCustomer?.email, selectedCustomer?.phone]);

  const handleLoadMoreContacts = useCallback(async () => {
    if (isLoadingMoreContacts || !hasMoreContacts || !contactsCursor) return;
    setIsLoadingMoreContacts(true);
    try {
      const next = await getContactService().listContactsPage({
        cursor: contactsCursor,
        limit: CONTACTS_PAGE_SIZE,
        archiveFilter,
        vipOnly,
        letterBucket: alphabetBucket,
        sortField: activeSortOption.field as ContactDirectorySortField,
        sortDirection: activeSortOption.direction,
      });
      setPagedContacts((prev) => {
        const byId = new Map<string, ContactRecord>();
        for (const c of prev) byId.set(c.id, c);
        for (const c of next.contacts) byId.set(c.id, c);
        return Array.from(byId.values());
      });
      setContactsCursor(next.nextCursor);
      setHasMoreContacts(next.hasMore);
    } finally {
      setIsLoadingMoreContacts(false);
    }
  }, [
    isLoadingMoreContacts,
    hasMoreContacts,
    contactsCursor,
    archiveFilter,
    vipOnly,
    alphabetBucket,
    activeSortOption.field,
    activeSortOption.direction,
  ]);

  const allCustomers = useMemo<CustomerProfile[]>(() => {
    if (effectiveMode !== 'passengers') return [];
    void governanceRefreshKey;

    if (remoteSearchContacts !== null) {
      return contactRecordsToCustomerProfiles(remoteSearchContacts, settings.invoices || []);
    }

    // Strictly render `pagedContacts` — never merge search LRU cache (`getAllContacts()`)
    return contactRecordsToCustomerProfiles(pagedContacts, settings.invoices || []);
  }, [effectiveMode, pagedContacts, remoteSearchContacts, settings.invoices, governanceRefreshKey]);

  const blacklistedCustomers = useMemo(
    () => allCustomers.filter((c) => Boolean(c.isBlacklisted)),
    [allCustomers]
  );
  const nonBlacklistedCustomers = useMemo(
    () => allCustomers.filter((c) => !c.isBlacklisted),
    [allCustomers]
  );
  const activeCustomers = useMemo(
    () => nonBlacklistedCustomers.filter((c) => !c.isArchived),
    [nonBlacklistedCustomers]
  );
  const archivedCustomers = useMemo(
    () => nonBlacklistedCustomers.filter((c) => Boolean(c.isArchived)),
    [nonBlacklistedCustomers]
  );
  const displayedCustomers = useMemo(
    () =>
      archiveFilter === 'active'
        ? activeCustomers
        : archiveFilter === 'archived'
        ? archivedCustomers
        : archiveFilter === 'blacklist'
        ? blacklistedCustomers
        : nonBlacklistedCustomers,
    [archiveFilter, activeCustomers, archivedCustomers, blacklistedCustomers, nonBlacklistedCustomers]
  );

  const deleteContactForProfile = (cust: CustomerProfile) => {
    const contactService = getContactService();
    if (cust.id && !cust.id.startsWith('cust-')) {
      contactService.deleteContact(cust.id);
      return;
    }
    const byPhone =
      cust.phone && cust.phone !== 'No phone'
        ? contactService.getContactByPhone(cust.phone)
        : null;
    const byEmail =
      cust.email && cust.email !== 'N/A'
        ? contactService.getContactByEmail(cust.email)
        : null;
    const match = byPhone || byEmail;
    if (match) {
      contactService.deleteContact(match.id);
    }
  };

  const syncContactGovernanceFlag = (
    cust: CustomerProfile,
    patch: { isArchived?: boolean; isBlacklisted?: boolean; blacklistReason?: string }
  ) => {
    const contactService = getContactService();
    const existing =
      (cust.id && !cust.id.startsWith('cust-') ? contactService.getContactById(cust.id) : null) ||
      (cust.phone && cust.phone !== 'No phone' ? contactService.getContactByPhone(cust.phone) : null) ||
      (cust.email && cust.email !== 'N/A' ? contactService.getContactByEmail(cust.email) : null);

    if (existing) {
      contactService.saveContact({
        ...existing,
        ...patch,
      });
    }
  };

  const handleRestoreCustomer = async (cust: CustomerProfile) => {
    const gov = getUniversalGovernanceService();
    if (cust.phone && cust.phone !== 'No phone') {
      await gov.setBlacklistStatus('passenger', cust.phone, false);
    }
    if (cust.email && cust.email !== 'N/A') {
      await gov.setBlacklistStatus('passenger', cust.email, false);
    }
    syncContactGovernanceFlag(cust, { isBlacklisted: false, blacklistReason: '' });
    setGovernanceRefreshKey((k) => k + 1);
  };

  const handlePurgeCustomer = async (cust: CustomerProfile) => {
    deleteContactForProfile(cust);
    await getUniversalGovernanceService().purgePassenger({
      phone: cust.phone,
      email: cust.email,
      name: cust.name,
    });
    if (selectedCustomer?.id === cust.id) {
      setSelectedCustomer(null);
      setIsEditingCustomer(false);
    }
    setGovernanceRefreshKey((k) => k + 1);
  };

  const handlePurgeAllBlacklisted = async () => {
    for (const cust of blacklistedCustomers) {
      deleteContactForProfile(cust);
    }
    await getUniversalGovernanceService().purgeAllBlacklistedPassengers(
      blacklistedCustomers.map((c) => ({
        phone: c.phone,
        email: c.email,
        name: c.name,
      }))
    );
    if (selectedCustomer?.isBlacklisted) {
      setSelectedCustomer(null);
      setIsEditingCustomer(false);
    }
    setGovernanceRefreshKey((k) => k + 1);
  };

  useEffect(() => {
    if (effectiveMode !== 'corporate') return;
    let cancelled = false;
    getCorporateAccountService()
      .syncAllCorporateAccountsFromFirestore()
      .then((accounts) => {
        if (!cancelled && accounts.length > 0) {
          setExtraCorpAccounts(accounts);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveMode]);

  const corporateClients = useMemo(() => {
    const base = settings.corporateAccounts || [];
    if (extraCorpAccounts.length === 0) return base;
    const byId = new Map<string, CorporateAccountConfig>();
    for (const acc of extraCorpAccounts) {
      byId.set(acc.id, acc);
    }
    for (const acc of base) {
      byId.set(acc.id, acc);
    }
    return Array.from(byId.values());
  }, [settings.corporateAccounts, extraCorpAccounts]);

  useEffect(() => {
    if ((settings.corporateAccounts || []).length > 3) {
      getCorporateAccountService().cacheCorporateAccounts(settings.corporateAccounts!);
    }
  }, [settings.corporateAccounts]);

  const portalPolicy = normalizeCorporatePortalPolicy(settings.corporatePortalPolicy);

  const handleOpenNewCorp = () => {
    const nextNum = `CORP-${String(corporateClients.length + 101).padStart(3, '0')}`;
    setIsNewCorp(true);
    setEditingCorp({
      id: `corp_${Date.now()}`,
      companyName: '',
      accountNumber: nextNum,
      billingContactName: '',
      billingContactEmail: '',
      billingCycle: 'net30',
      creditLimit: 5000,
      discountPercent: 0,
      isActive: true,
      poRequired: portalPolicy.defaultRequirePoForNewAccounts,
      currentPoNumber: getCorporateAccountService().generateSecurePoNumber('', nextNum),
      createdAt: new Date().toISOString(),
    });
  };

  const handleSaveCorporateAccount = async (updatedRecord: CorporateAccountConfig) => {
    if (!onSave) return;
    const exists = corporateClients.some((a) => a.id === updatedRecord.id);
    const nextAccounts = exists
      ? corporateClients.map((a) => (a.id === updatedRecord.id ? updatedRecord : a))
      : [updatedRecord, ...corporateClients];
    await onSave({ corporateAccounts: nextAccounts });
    await getCorporateAccountService().syncAccountToFirestore(updatedRecord);
    setEditingCorp(null);
    setIsNewCorp(false);
  };

  const handleArchiveCorporateAccount = async (
    account: CorporateAccountConfig,
    reason?: string
  ) => {
    if (!onSave) return;
    const archivedAccount = archiveCorporateAccountRecord(account, reason);
    const nextAccounts = corporateClients.map((a) =>
      a.id === archivedAccount.id ? archivedAccount : a
    );
    await onSave({ corporateAccounts: nextAccounts });
    await getCorporateAccountService().syncAccountToFirestore(archivedAccount);
    await getUniversalGovernanceService().setArchiveStatus(
      'corporate_account',
      archivedAccount.id,
      true
    );
    if (editingCorp?.id === archivedAccount.id) {
      setEditingCorp(null);
      setIsNewCorp(false);
    }
    setPendingArchiveCorp(null);
  };

  const hasSeededContactCounts = kpiSummary?.contactsTotal !== undefined;
  const resolvedAllCount = hasSeededContactCounts
    ? Math.max(0, Number(kpiSummary?.contactsTotal || 0) - Number(kpiSummary?.contactsBlacklisted || 0))
    : nonBlacklistedCustomers.length;
  const resolvedActiveCount = hasSeededContactCounts
    ? Number(kpiSummary?.contactsActive || 0)
    : activeCustomers.length;
  const resolvedArchivedCount = hasSeededContactCounts
    ? Number(kpiSummary?.contactsArchived || 0)
    : archivedCustomers.length;
  const resolvedBlacklistCount = hasSeededContactCounts
    ? Number(kpiSummary?.contactsBlacklisted || 0)
    : blacklistedCustomers.length;
  const resolvedVipCount = hasSeededContactCounts
    ? Number(kpiSummary?.contactsVip || 0)
    : displayedCustomers.filter((c) => c.isVip).length;

  return (
    <div className="space-y-4">
      {effectiveMode === 'passengers' && (
        <PassengerDirectoryPanel
          isLoading={isLoading}
          allCount={resolvedAllCount}
          activeCount={resolvedActiveCount}
          archivedCount={resolvedArchivedCount}
          blacklistCount={resolvedBlacklistCount}
          vipCount={resolvedVipCount}
          displayedCustomers={displayedCustomers}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          archiveFilter={archiveFilter}
          setArchiveFilter={setArchiveFilter}
          vipOnly={vipOnly}
          onVipOnlyChange={setVipOnly}
          alphabetBucket={alphabetBucket}
          onAlphabetBucketChange={setAlphabetBucket}
          sortOptionId={sortOptionId}
          onSortOptionChange={setSortOptionId}
          serverLetterCounts={kpiSummary?.contactsByLetter}
          hasMore={hasMoreContacts}
          isLoadingMore={isLoadingMoreContacts}
          onLoadMore={handleLoadMoreContacts}
          onOpenCustomer={handleOpenCustomer}
          onToggleArchiveCustomer={async (cust) => {
            const nextArchived = !cust.isArchived;
            const gov = getUniversalGovernanceService();
            await gov.setArchiveStatus('passenger', cust.email, nextArchived);
            if (cust.phone) await gov.setArchiveStatus('passenger', cust.phone, nextArchived);
            syncContactGovernanceFlag(cust, { isArchived: nextArchived });
            setGovernanceRefreshKey((k) => k + 1);
          }}
          onRestoreCustomer={handleRestoreCustomer}
          onPurgeCustomer={handlePurgeCustomer}
          onPurgeAllBlacklisted={handlePurgeAllBlacklisted}
        />
      )}

      {effectiveMode === 'corporate' && (
        <CorporateDirectoryPanel
          settings={settings}
          corporateClients={corporateClients}
          onSave={onSave}
          onAddNewCorporate={handleOpenNewCorp}
          onEditCorporate={(corp) => {
            setIsNewCorp(false);
            setEditingCorp({ ...corp });
          }}
          onOpenProvisionModal={(corp) => setProvisioningCorp(corp)}
          onTogglePoRequired={async (account) => {
            if (!onSave) return;
            const updated: CorporateAccountConfig = {
              ...account,
              poRequired: !account.poRequired,
              updatedAt: new Date().toISOString(),
            };
            await onSave({
              corporateAccounts: corporateClients.map((a) => (a.id === account.id ? updated : a)),
            });
            await getCorporateAccountService().syncAccountToFirestore(updated);
          }}
          onPoRegenerateSuccess={async (updatedAccount) => {
            if (!onSave) return;
            await onSave({
              corporateAccounts: corporateClients.map((a) =>
                a.id === updatedAccount.id ? updatedAccount : a
              ),
            });
          }}
          onImportCorporateAccounts={async (mergeResult) => {
            getCorporateAccountService().cacheCorporateAccounts(mergeResult.merged);
            setExtraCorpAccounts(mergeResult.merged);
            if (!onSave) return;
            await onSave({ corporateAccounts: mergeResult.merged });
            await getCorporateAccountService().syncAccountsBatchToFirestore(
              mergeResult.changedAccounts
            );
          }}
          onArchiveCorporate={handleArchiveCorporateAccount}
          pendingArchiveCorp={pendingArchiveCorp}
          onClearPendingArchiveCorp={() => setPendingArchiveCorp(null)}
        />
      )}

      {effectiveMode === 'passengers' && (
        <CustomerProfileDrawer
          selectedCustomer={selectedCustomer}
          isEditingCustomer={isEditingCustomer}
          setIsEditingCustomer={setIsEditingCustomer}
          trips={selectedCustomerTrips}
          corporateAccounts={corporateClients}
          vehicles={settings.vehicles}
          drivers={drivers}
          onClose={() => {
            setSelectedCustomer(null);
            setIsEditingCustomer(false);
          }}
          onCustomerSaved={(updated) => {
            setSelectedCustomer(updated);
            setGovernanceRefreshKey((k) => k + 1);
          }}
          onGovernanceMutated={(updated) => {
            syncContactGovernanceFlag(updated, {
              isArchived: updated.isArchived,
              isBlacklisted: updated.isBlacklisted,
              blacklistReason: updated.blacklistReason,
            });
            setSelectedCustomer(updated);
            setGovernanceRefreshKey((k) => k + 1);
          }}
          onPurgeCustomer={handlePurgeCustomer}
        />
      )}

      {effectiveMode === 'corporate' && (
        <>
          <CorporateAccountDirectoryDrawer
            settings={settings}
            editingCorp={editingCorp}
            setEditingCorp={setEditingCorp}
            isNewCorp={isNewCorp}
            onClose={() => {
              setEditingCorp(null);
              setIsNewCorp(false);
            }}
            onSaveCorporateAccount={handleSaveCorporateAccount}
            onOpenProvisionModal={(corp) => setProvisioningCorp(corp)}
            onRequestArchive={
              onSave
                ? (corp) => {
                    setEditingCorp(null);
                    setIsNewCorp(false);
                    setPendingArchiveCorp(corp);
                  }
                : undefined
            }
          />

          <CorporatePortalManagersModal
            provisioningCorp={provisioningCorp}
            onClose={() => setProvisioningCorp(null)}
            onProvisioned={async (updatedAccount) => {
              if (onSave) {
                await onSave({
                  corporateAccounts: corporateClients.map((a) =>
                    a.id === updatedAccount.id ? updatedAccount : a
                  ),
                });
              }
              setProvisioningCorp(updatedAccount);
              if (editingCorp?.id === updatedAccount.id) {
                setEditingCorp(updatedAccount);
              }
            }}
          />
        </>
      )}
    </div>
  );
}
