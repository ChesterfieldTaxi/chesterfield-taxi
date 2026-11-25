import React, { useState, useEffect, useMemo } from 'react';
import {
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
} from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import {
  archiveCorporateAccountRecord,
  getCorporateAccountService,
} from '../../../../core/services/corporate-account.service';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import {
  buildCustomerProfilesList,
  PassengerDirectoryPanel,
  CustomerProfileDrawer,
  CorporateDirectoryPanel,
  CorporateAccountDirectoryDrawer,
  CorporatePortalManagersModal,
  type AdminCustomersSubpageProps,
  type CustomerArchiveFilter,
  type CustomerProfile,
  type CustomersSubTab,
} from '../customers';

export type { CustomersSubTab, AdminCustomersSubpageProps };

export function AdminCustomersSubpage({
  settings,
  initialSubTab = 'directory',
  onSave,
}: AdminCustomersSubpageProps) {
  const [activeSub, setActiveSub] = useState<CustomersSubTab>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<CustomerArchiveFilter>('active');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [governanceRefreshKey, setGovernanceRefreshKey] = useState(0);

  const [editingCorp, setEditingCorp] = useState<CorporateAccountConfig | null>(null);
  const [isNewCorp, setIsNewCorp] = useState(false);
  const [provisioningCorp, setProvisioningCorp] = useState<CorporateAccountConfig | null>(null);
  const [pendingArchiveCorp, setPendingArchiveCorp] = useState<CorporateAccountConfig | null>(null);

  useEffect(() => {
    setActiveSub(initialSubTab);
  }, [initialSubTab]);

  const handleOpenCustomer = (cust: CustomerProfile, editMode = false) => {
    setSelectedCustomer(cust);
    setIsEditingCustomer(editMode);
  };

  // Deep-link support (?phone=... or ?id=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const targetPhone = params.get('phone');
      const targetId = params.get('id');
      if (targetPhone || targetId) {
        const contactService = getContactService();
        const match = targetPhone
          ? contactService.getContactByPhone(targetPhone)
          : contactService.getContactById(targetId!);
        if (match) {
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
        }
      }
    } catch {
      // Ignore URL parse warnings
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();
    if (service.getAllTrips) {
      service
        .getAllTrips()
        .then((data) => {
          setTrips(data);
          setIsLoading(false);
        })
        .catch(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const allCustomers = useMemo<CustomerProfile[]>(() => {
    void governanceRefreshKey;
    return buildCustomerProfilesList(trips, settings.invoices || []);
  }, [trips, settings.invoices, governanceRefreshKey]);

  const activeCustomers = allCustomers.filter((c) => !c.isArchived);
  const archivedCustomers = allCustomers.filter((c) => Boolean(c.isArchived));
  const displayedCustomers =
    archiveFilter === 'active'
      ? activeCustomers
      : archiveFilter === 'archived'
      ? archivedCustomers
      : allCustomers;

  const corporateClients = settings.corporateAccounts || [];
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

  return (
    <div className="space-y-4">
      {activeSub === 'directory' && (
        <PassengerDirectoryPanel
          isLoading={isLoading}
          allCount={allCustomers.length}
          activeCount={activeCustomers.length}
          archivedCount={archivedCustomers.length}
          vipCount={displayedCustomers.filter((c) => c.isVip).length}
          displayedCustomers={displayedCustomers}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          archiveFilter={archiveFilter}
          setArchiveFilter={setArchiveFilter}
          onOpenCustomer={handleOpenCustomer}
          onToggleArchiveCustomer={async (cust) => {
            const nextArchived = !cust.isArchived;
            const gov = getUniversalGovernanceService();
            await gov.setArchiveStatus('passenger', cust.email, nextArchived);
            if (cust.phone) await gov.setArchiveStatus('passenger', cust.phone, nextArchived);
            setGovernanceRefreshKey((k) => k + 1);
          }}
        />
      )}

      {activeSub === 'corporate' && (
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

      <CustomerProfileDrawer
        selectedCustomer={selectedCustomer}
        isEditingCustomer={isEditingCustomer}
        setIsEditingCustomer={setIsEditingCustomer}
        onClose={() => {
          setSelectedCustomer(null);
          setIsEditingCustomer(false);
        }}
        onCustomerSaved={(updated) => {
          setSelectedCustomer(updated);
          setGovernanceRefreshKey((k) => k + 1);
        }}
        onGovernanceMutated={(updated) => {
          setSelectedCustomer(updated);
          setGovernanceRefreshKey((k) => k + 1);
        }}
      />

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
    </div>
  );
}
