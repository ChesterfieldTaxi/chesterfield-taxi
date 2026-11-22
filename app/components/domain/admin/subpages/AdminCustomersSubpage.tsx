import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import type { AppSettings, CorporateAccountConfig } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getCorporateAccountService } from '../../../../core/services/corporate-account.service';
import {
  getCorporatePortalService,
  type ProvisionCorporateManagerResult,
} from '../../../../core/services/corporate-portal.service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  SpinnerIcon,
  UserIcon,
  UsersIcon,
  BuildingIcon,
  ShieldIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  CopyIcon,
  RefreshCwIcon,
  CheckIcon,
  StarIcon,
  BanIcon,
  PlusIcon,
  EditIcon,
  CarIcon,
  PhoneIcon,
  MailIcon,
  ExternalLinkIcon,
  UserCheckIcon,
  XIcon,
} from '../../../ui/Icons';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { getContactService } from '../../../../core/services/customer/contact.service';
import {
  RegeneratePoModal,
  PoHistoryModal,
} from '../corporate/CorporateAccountModals';

export type CustomersSubTab = 'directory' | 'corporate';

interface AdminCustomersSubpageProps {
  settings: AppSettings;
  initialSubTab?: CustomersSubTab;
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
}

interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  tripCount: number;
  totalSpend: number;
  lastRideDate: string;
  isVip: boolean;
  corporateAccountName?: string;
  preferredVehicle?: string;
  customerScore?: number;
  notes?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isArchived?: boolean;
}

export function AdminCustomersSubpage({
  settings,
  initialSubTab = 'directory',
  onSave,
}: AdminCustomersSubpageProps) {
  const [activeSub, setActiveSub] = useState<CustomersSubTab>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CustomerProfile>>({});
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [showBlacklistInput, setShowBlacklistInput] = useState(false);
  const [blacklistReasonDraft, setBlacklistReasonDraft] = useState('');
  const [governanceRefreshKey, setGovernanceRefreshKey] = useState(0);
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);

  // Corporate PO Management & Search State
  const [selectedPoAccount, setSelectedPoAccount] = useState<CorporateAccountConfig | null>(null);
  const [isRegeneratePoOpen, setIsRegeneratePoOpen] = useState(false);
  const [isPoHistoryOpen, setIsPoHistoryOpen] = useState(false);
  const [copiedPoId, setCopiedPoId] = useState<string | null>(null);
  const [corpSearchTerm, setCorpSearchTerm] = useState('');
  const [corpFilter, setCorpFilter] = useState<'all' | 'po_enforced' | 'po_disabled'>('all');
  const [corpPage, setCorpPage] = useState(1);
  const CORP_PAGE_SIZE = 30;
  const [editingCorp, setEditingCorp] = useState<CorporateAccountConfig | null>(null);
  const [isNewCorp, setIsNewCorp] = useState(false);
  const [isSavingCorp, setIsSavingCorp] = useState(false);

  // Corporate Portal Manager Provisioning State
  const [provisioningCorp, setProvisioningCorp] = useState<CorporateAccountConfig | null>(null);
  const [mgrName, setMgrName] = useState('');
  const [mgrEmail, setMgrEmail] = useState('');
  const [mgrPhone, setMgrPhone] = useState('');
  const [mgrIncludeCustomerRole, setMgrIncludeCustomerRole] = useState(false);
  const [isProvisioningMgr, setIsProvisioningMgr] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<ProvisionCorporateManagerResult | null>(
    null
  );
  const [copiedInstructions, setCopiedInstructions] = useState(false);

  useEffect(() => {
    setActiveSub(initialSubTab);
  }, [initialSubTab]);

  // Deep-link integration: Auto-open customer from URL search params (?phone=... or ?id=...)
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
              notes: match.notes,
              customerScore: match.customerScore ?? 90,
            },
            true
          );
        }
      }
    } catch {}
  }, []);

  const handleOpenCustomer = (cust: CustomerProfile, edit = false) => {
    setSelectedCustomer(cust);
    setIsEditingCustomer(edit);
    setEditForm({
      name: cust.name,
      phone: cust.phone,
      email: cust.email === 'N/A' ? '' : cust.email,
      corporateAccountName: cust.corporateAccountName || '',
      isVip: cust.isVip || false,
      preferredVehicle: cust.preferredVehicle || 'Standard Sedan',
      notes: cust.notes || '',
    });
    setSaveSuccessMessage(null);
    setShowBlacklistInput(false);
    setBlacklistReasonDraft('');
  };

  const handleSaveCustomer = () => {
    if (!editForm.name?.trim() || !editForm.phone?.trim()) {
      alert('Client Name and Phone Number are required.');
      return;
    }
    const service = getContactService();
    const saved = service.saveContact({
      id: selectedCustomer?.id?.startsWith('cust_new_') ? undefined : selectedCustomer?.id,
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      email: editForm.email?.trim() || '',
      corporateAccountName: editForm.corporateAccountName?.trim() || undefined,
      isVip: editForm.isVip ?? false,
      preferredVehicleTier: (editForm.preferredVehicle as any) || 'standard',
      notes: editForm.notes || '',
      customerScore: selectedCustomer?.customerScore ?? 90,
      tripCount: selectedCustomer?.tripCount ?? 1,
      totalSpend: selectedCustomer?.totalSpend ?? 0,
    });

    setSelectedCustomer((prev) =>
      prev
        ? {
            ...prev,
            id: saved.id,
            name: saved.name,
            phone: saved.phone,
            email: saved.email || 'N/A',
            corporateAccountName: saved.corporateAccountName,
            isVip: saved.isVip ?? false,
            preferredVehicle: saved.preferredVehicleTier,
            notes: saved.notes,
          }
        : null
    );
    setIsEditingCustomer(false);
    setSaveSuccessMessage('Client profile saved successfully.');
    setGovernanceRefreshKey((k) => k + 1);
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

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

  // Synthesize customer profiles from real trips and saved contacts
  const customerMap = new Map<string, CustomerProfile>();

  // Aggregate dynamically from real trips
  trips.forEach((t) => {
    const email = t.passenger?.email || t.passenger?.phone || t.id;
    const passengerName = [t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') || 'Guest Passenger';
    const phone = t.passenger?.phone || 'No phone';
    const fare = Number(t.pricing?.totalFare || t.payment?.amount || 0);

    if (customerMap.has(email)) {
      const existing = customerMap.get(email)!;
      existing.tripCount += 1;
      existing.totalSpend += fare;
    } else {
      customerMap.set(email, {
        id: `cust-${email}`,
        name: passengerName,
        email: t.passenger?.email || 'N/A',
        phone,
        tripCount: 1,
        totalSpend: fare,
        lastRideDate: t.scheduledPickupTime || 'Recent',
        isVip: false,
        preferredVehicle: t.vehicleTier,
      });
    }
  });

  // Merge contacts from ContactService (custom created or edited profiles)
  try {
    const contactService = getContactService();
    const savedContacts = contactService.getAllContacts();
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
        preferredVehicle: sc.preferredVehicleTier,
        notes: sc.notes,
        customerScore: sc.customerScore,
        isBlacklisted: sc.isBlacklisted,
        blacklistReason: sc.blacklistReason,
        isArchived: sc.isArchived,
      });
    }
  } catch {}

  const govService = getUniversalGovernanceService();
  const allCustomers = Array.from(customerMap.values()).map((c) => {
    const gov = govService.isPassengerBlacklistedSync(c.phone, c.email);
    const score = govService.calculateCustomerScore({
      completedTrips: c.tripCount,
      cancelledTrips: 0,
      noShows: 0,
      totalSpend: c.totalSpend,
    });
    return {
      ...c,
      customerScore: score,
      isBlacklisted: gov.isBlacklisted,
      blacklistReason: gov.reason,
      isArchived: gov.isArchived,
    };
  });

  const activeCustomers = allCustomers.filter((c) => !c.isArchived);
  const archivedCustomers = allCustomers.filter((c) => !!c.isArchived);

  const displayedList =
    archiveFilter === 'active'
      ? activeCustomers
      : archiveFilter === 'archived'
      ? archivedCustomers
      : allCustomers;

  const filteredCustomers = displayedList.filter((c) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.corporateAccountName && c.corporateAccountName.toLowerCase().includes(q))
    );
  });

  const corporateClients = settings.corporateAccounts || [];

  const handleTogglePoRequired = async (account: CorporateAccountConfig) => {
    if (!onSave) return;
    const updatedAccounts = corporateClients.map((a) =>
      a.id === account.id ? { ...a, poRequired: !a.poRequired, updatedAt: new Date().toISOString() } : a
    );
    await onSave({ corporateAccounts: updatedAccounts });
  };

  const handlePoRegenerateSuccess = async (updatedAccount: CorporateAccountConfig) => {
    if (!onSave) return;
    const updatedAccounts = corporateClients.map((a) =>
      a.id === updatedAccount.id ? updatedAccount : a
    );
    await onSave({ corporateAccounts: updatedAccounts });
  };

  const handleCopyPo = (po: string, id: string) => {
    navigator.clipboard.writeText(po);
    setCopiedPoId(id);
    setTimeout(() => setCopiedPoId(null), 2000);
  };

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
      poRequired: true,
      currentPoNumber: `PO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      createdAt: new Date().toISOString(),
    });
  };

  const handleSaveCorporateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCorp || !onSave) return;
    if (!editingCorp.companyName.trim()) return;
    setIsSavingCorp(true);
    try {
      const updatedRecord: CorporateAccountConfig = {
        ...editingCorp,
        companyName: editingCorp.companyName.trim(),
        accountNumber: editingCorp.accountNumber.trim() || `CORP-${Date.now().toString().slice(-4)}`,
        billingContactName: (editingCorp.billingContactName || '').trim(),
        billingContactEmail: editingCorp.billingContactEmail.trim(),
        updatedAt: new Date().toISOString(),
      };
      const exists = corporateClients.some((a) => a.id === updatedRecord.id);
      const nextAccounts = exists
        ? corporateClients.map((a) => (a.id === updatedRecord.id ? updatedRecord : a))
        : [updatedRecord, ...corporateClients];
      await onSave({ corporateAccounts: nextAccounts });
      await getCorporateAccountService().syncAccountToFirestore(updatedRecord);
      setEditingCorp(null);
      setIsNewCorp(false);
    } finally {
      setIsSavingCorp(false);
    }
  };

  const handleOpenProvisionModal = (corp: CorporateAccountConfig) => {
    setProvisioningCorp(corp);
    setMgrName(corp.billingContactName || '');
    setMgrEmail(corp.billingContactEmail || '');
    setMgrPhone(corp.billingContactPhone || '');
    setMgrIncludeCustomerRole(false);
    setProvisionError(null);
    setProvisionResult(null);
    setCopiedInstructions(false);
  };

  const handleProvisionPortalManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisioningCorp) return;
    setIsProvisioningMgr(true);
    setProvisionError(null);
    try {
      const result = await getCorporatePortalService().provisionCorporatePortalManager({
        corporateAccount: provisioningCorp,
        managerName: mgrName,
        managerEmail: mgrEmail,
        managerPhone: mgrPhone,
        includeCustomerRole: mgrIncludeCustomerRole,
      });

      if (onSave) {
        const nextAccounts = corporateClients.map((a) =>
          a.id === result.updatedAccount.id ? result.updatedAccount : a
        );
        await onSave({ corporateAccounts: nextAccounts });
      }
      setProvisioningCorp(result.updatedAccount);
      if (editingCorp?.id === result.updatedAccount.id) {
        setEditingCorp(result.updatedAccount);
      }
      setProvisionResult(result);
    } catch (err: any) {
      setProvisionError(err?.message || 'Unable to provision Corporate Portal Manager.');
    } finally {
      setIsProvisioningMgr(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Unified Directory Toolbar (only shown on Directory sub-tab; Corporate has its own toolbar) ─── */}
      {activeSub === 'directory' && (
        <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
            <div className="relative w-full sm:w-64 lg:w-72">
              <input
                type="text"
                placeholder="Search clients by name, phone, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear client search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 sm:inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setArchiveFilter('active')}
                className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                  archiveFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Active ({activeCustomers.length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveFilter('archived')}
                className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                  archiveFilter === 'archived'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>Archived ({archivedCustomers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveFilter('all')}
                className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                  archiveFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                All ({allCustomers.length})
              </button>
            </div>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon={<PlusIcon className="w-4 h-4" />}
            onClick={() => {
              handleOpenCustomer({
                id: `cust_new_${Date.now()}`,
                name: '',
                email: '',
                phone: '',
                tripCount: 0,
                totalSpend: 0,
                lastRideDate: 'New',
                isVip: false,
                preferredVehicle: 'Standard Sedan',
              }, true);
            }}
            className="text-xs font-bold w-full sm:w-auto justify-center shrink-0"
          >
            Add Client
          </Button>
        </div>
      )}

      {/* ─── Client Directory Cards (matching Corporate card layout) ─── */}
      {activeSub === 'directory' && (
        isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-12 flex items-center justify-center gap-2 text-slate-400">
            <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-xs font-semibold">Loading clients...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
            {filteredCustomers.map((cust) => {
              const score = cust.customerScore ?? 90;
              const scoreTone =
                score >= 80
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : score >= 60
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';
              const initial = (cust.name || 'C').trim().charAt(0).toUpperCase();

              return (
                <Card
                  key={cust.id}
                  onClick={() => handleOpenCustomer(cust, false)}
                  className="border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div>
                    <CardHeader className="pb-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                              cust.isBlacklisted
                                ? 'bg-rose-100 text-rose-700'
                                : cust.isVip
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-black text-slate-900 truncate">
                              {cust.name}
                            </CardTitle>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              {cust.corporateAccountName ? (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.2 rounded-md truncate max-w-[160px]">
                                  {cust.corporateAccountName}
                                </span>
                              ) : (
                                <span className="text-[11px] font-medium text-slate-400">Direct Client</span>
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
                          title="Client Score"
                        >
                          <StarIcon className="w-3 h-3 shrink-0" />
                          <span>{score}</span>
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-2.5 text-xs">
                      {cust.blacklistReason && (
                        <div className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700 font-semibold">
                          Block reason: {cust.blacklistReason}
                        </div>
                      )}

                      {/* Contact Box */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center gap-2 text-slate-800 font-semibold">
                          <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono text-[11px] truncate">{cust.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                          <MailIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-[11px] truncate">{cust.email || 'No email on file'}</span>
                        </div>
                      </div>

                      {/* Metrics Row */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 bg-slate-50 rounded-xl text-[11px]">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Rides</span>
                          <span className="font-extrabold text-slate-900 tabular-nums">{cust.tripCount}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Spend</span>
                          <span className="font-extrabold text-emerald-700 tabular-nums">
                            ${cust.totalSpend.toFixed(0)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Class</span>
                          <span className="font-bold text-slate-700 capitalize truncate block">
                            {cust.preferredVehicle || 'Standard'}
                          </span>
                        </div>
                      </div>

                      {/* Action Footer */}
                      <div
                        className="flex items-center gap-1.5 pt-2 border-t border-slate-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenCustomer(cust, false)}
                          className="text-[11px] font-bold flex-1 py-1.5 h-auto text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenCustomer(cust, true)}
                          className="text-[11px] font-bold flex-1 py-1.5 h-auto text-blue-700 border-blue-200 bg-blue-50/50 hover:bg-blue-100/70 cursor-pointer"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const isArchived = !cust.isArchived;
                            const gov = getUniversalGovernanceService();
                            await gov.setArchiveStatus('passenger', cust.email, isArchived);
                            if (cust.phone) {
                              await gov.setArchiveStatus('passenger', cust.phone, isArchived);
                            }
                            setGovernanceRefreshKey((k) => k + 1);
                          }}
                          className={`text-[11px] px-2.5 py-1.5 h-auto font-bold flex items-center gap-1 cursor-pointer ${
                            cust.isArchived
                              ? 'text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                              : 'text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cust.isArchived ? (
                            <>
                              <CheckIcon className="w-3 h-3 text-emerald-600" />
                              <span>Restore</span>
                            </>
                          ) : (
                            <>
                              <ArchiveBoxIcon className="w-3 h-3 text-slate-500" />
                              <span>Archive</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              );
            })}

            {filteredCustomers.length === 0 && (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
                <UsersIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-slate-600 font-bold text-sm">No clients found</p>
                <p className="text-slate-400 font-medium text-xs mt-1">
                  {searchTerm
                    ? `No clients matched "${searchTerm}".`
                    : 'Add a client or switch the filter above.'}
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* ─── Corporate Subpage ─── */}
      {activeSub === 'corporate' && (() => {
        const filteredCorp = corporateClients.filter((corp) => {
          if (corpFilter === 'po_enforced' && !corp.poRequired) return false;
          if (corpFilter === 'po_disabled' && corp.poRequired) return false;
          if (!corpSearchTerm.trim()) return true;
          const q = corpSearchTerm.toLowerCase();
          return (
            corp.companyName.toLowerCase().includes(q) ||
            corp.accountNumber.toLowerCase().includes(q) ||
            (corp.currentPoNumber && corp.currentPoNumber.toLowerCase().includes(q)) ||
            (corp.billingContactEmail && corp.billingContactEmail.toLowerCase().includes(q))
          );
        });

        const totalCorpPages = Math.max(1, Math.ceil(filteredCorp.length / CORP_PAGE_SIZE));
        const paginatedCorp = filteredCorp.slice(
          (corpPage - 1) * CORP_PAGE_SIZE,
          corpPage * CORP_PAGE_SIZE
        );

        return (
          <div className="space-y-4">
            {/* Search and Filter */}
            <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 min-w-0">
                <div className="relative w-full sm:w-64 lg:w-80">
                  <input
                    type="text"
                    placeholder={`Search ${corporateClients.length} corporate accounts...`}
                    value={corpSearchTerm}
                    onChange={(e) => {
                      setCorpSearchTerm(e.target.value);
                      setCorpPage(1);
                    }}
                    className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  {corpSearchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setCorpSearchTerm('');
                        setCorpPage(1);
                      }}
                      aria-label="Clear corporate search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 sm:inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setCorpFilter('all');
                      setCorpPage(1);
                    }}
                    className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                      corpFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({corporateClients.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCorpFilter('po_enforced');
                      setCorpPage(1);
                    }}
                    className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                      corpFilter === 'po_enforced'
                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    PO Enforced ({corporateClients.filter((a) => a.poRequired).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCorpFilter('po_disabled');
                      setCorpPage(1);
                    }}
                    className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-colors text-center whitespace-nowrap cursor-pointer ${
                      corpFilter === 'po_disabled'
                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    PO Optional ({corporateClients.filter((a) => !a.poRequired).length})
                  </button>
                </div>
              </div>

              {onSave && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon={<PlusIcon className="w-4 h-4" />}
                  onClick={handleOpenNewCorp}
                  className="text-xs font-bold w-full lg:w-auto justify-center shrink-0"
                >
                  Add Corporate Account
                </Button>
              )}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedCorp.map((corp) => (
                <Card
                  key={corp.id}
                  className="border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all"
                >
                  <div>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm font-black text-slate-900 line-clamp-1">
                            {corp.companyName}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono font-bold text-blue-600">
                            {corp.accountNumber} • {corp.billingCycle.toUpperCase()}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant={corp.isActive ? 'success' : 'default'} size="sm" className="text-[10px]">
                            {corp.isActive ? 'Active' : 'Paused'}
                          </Badge>
                          {onSave && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsNewCorp(false);
                                setEditingCorp({ ...corp });
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                              title="Edit Corporate Account"
                            >
                              <EditIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5 text-xs">
                      {/* PO Container */}
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                            Authorized PO Number
                          </span>
                          <Badge
                            variant={corp.poRequired ? 'success' : 'default'}
                            size="sm"
                            className="text-[9px]"
                          >
                            {corp.poRequired ? 'PO Enforced' : 'PO Optional'}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {corp.currentPoNumber || 'None'}
                          </span>
                          {corp.currentPoNumber && (
                            <button
                              type="button"
                              onClick={() => handleCopyPo(corp.currentPoNumber!, corp.id)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              {copiedPoId === corp.id ? (
                                <>
                                  <CheckIcon className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-600 font-bold">Copied</span>
                                </>
                              ) : (
                                <>
                                  <CopyIcon className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* PO Buttons */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedPoAccount(corp);
                              setIsRegeneratePoOpen(true);
                            }}
                            className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200 flex-1 py-1 h-auto cursor-pointer"
                          >
                            <RefreshCwIcon className="w-3 h-3 mr-1" />
                            Regenerate PO
                          </Button>

                          {onSave && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleTogglePoRequired(corp)}
                              className="text-[10px] text-slate-600 hover:text-slate-900 py-1 h-auto px-2 cursor-pointer"
                            >
                              {corp.poRequired ? 'Disable PO' : 'Enforce PO'}
                            </Button>
                          )}

                          {corp.poNumberHistory && corp.poNumberHistory.length > 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPoAccount(corp);
                                setIsPoHistoryOpen(true);
                              }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 py-1 h-auto px-2 cursor-pointer"
                            >
                              History ({corp.poNumberHistory.length})
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Account Terms */}
                      <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Credit Limit:</span>
                          <span className="font-bold text-slate-900">${corp.creditLimit.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Contract Discount:</span>
                          <span className="font-bold text-emerald-600">{corp.discountPercent}%</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <p className="font-bold text-slate-700 text-[11px]">Contact &amp; Authorized Email:</p>
                        <p className="text-slate-600 text-[11px] truncate">{corp.billingContactEmail}</p>
                        {(corp.portalManagers || []).length > 0 && (
                          <p className="text-[10px] font-bold text-indigo-700 mt-1">
                            {corp.portalManagers!.length} Portal Manager(s) Active on /app/corporate
                          </p>
                        )}
                      </div>

                      {/* Corporate Self-Service Portal Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenProvisionModal(corp)}
                          className="text-[10px] font-bold text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 border-indigo-200 flex-1 py-1.5 h-auto cursor-pointer"
                        >
                          <UserCheckIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
                          <span>Provision Portal Manager</span>
                        </Button>
                        <Link
                          to={`/app/corporate?accountId=${encodeURIComponent(corp.id)}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 text-[10px] font-bold text-slate-700 hover:text-indigo-700 transition-colors shrink-0"
                          title="Preview Corporate Self-Service Portal"
                        >
                          <span>Portal</span>
                          <ExternalLinkIcon className="w-3 h-3" />
                        </Link>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              ))}

              {filteredCorp.length === 0 && (
                <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200">
                  <p className="text-slate-400 font-medium text-xs">
                    No corporate accounts found matching &ldquo;{corpSearchTerm}&rdquo;.
                  </p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalCorpPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white px-4 py-3 rounded-2xl border border-slate-200/90 text-xs">
                <span className="text-slate-500 font-medium text-center sm:text-left">
                  Showing {((corpPage - 1) * CORP_PAGE_SIZE) + 1}–
                  {Math.min(corpPage * CORP_PAGE_SIZE, filteredCorp.length)} of{' '}
                  {filteredCorp.length} corporate accounts
                </span>
                <div className="flex items-center justify-center sm:justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCorpPage((p) => Math.max(p - 1, 1))}
                    disabled={corpPage === 1}
                    className="text-xs px-2.5 py-1 cursor-pointer"
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-bold text-slate-700 px-2">
                    {corpPage} / {totalCorpPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCorpPage((p) => Math.min(p + 1, totalCorpPages))}
                    disabled={corpPage === totalCorpPages}
                    className="text-xs px-2.5 py-1 cursor-pointer"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Customer Details & Edit Slide-Over Drawer ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(selectedCustomer)}
        onClose={() => {
          setSelectedCustomer(null);
          setIsEditingCustomer(false);
        }}
        title={
          selectedCustomer
            ? isEditingCustomer
              ? selectedCustomer.id?.startsWith('cust_new_')
                ? 'Add Client'
                : `Edit Client: ${selectedCustomer.name || 'Client'}`
              : selectedCustomer.name
            : 'Client'
        }
        subtitle={
          selectedCustomer
            ? isEditingCustomer
              ? 'Update client details, vehicle preferences, and dispatcher notes'
              : selectedCustomer.email
            : ''
        }
        size="lg"
        headerBadge={
          selectedCustomer && (
            <div className="flex items-center gap-1.5">
              {selectedCustomer.isVip && !isEditingCustomer && (
                <Badge variant="warning" className="text-[10px] font-extrabold uppercase">
                  VIP
                </Badge>
              )}
              {!selectedCustomer.id?.startsWith('cust_new_') && (
                <button
                  type="button"
                  onClick={() => {
                    if (!isEditingCustomer) {
                      setEditForm({
                        name: selectedCustomer.name,
                        phone: selectedCustomer.phone,
                        email: selectedCustomer.email === 'N/A' ? '' : selectedCustomer.email,
                        corporateAccountName: selectedCustomer.corporateAccountName || '',
                        isVip: selectedCustomer.isVip || false,
                        preferredVehicle: selectedCustomer.preferredVehicle || 'Standard Sedan',
                        notes: selectedCustomer.notes || '',
                      });
                    }
                    setIsEditingCustomer(!isEditingCustomer);
                  }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-slate-700 transition-colors cursor-pointer"
                >
                  {isEditingCustomer ? 'View Profile' : 'Edit Client'}
                </button>
              )}
            </div>
          )
        }
        footer={
          selectedCustomer &&
          (isEditingCustomer ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  if (selectedCustomer.id?.startsWith('cust_new_')) {
                    setSelectedCustomer(null);
                  }
                  setIsEditingCustomer(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleSaveCustomer}
                leftIcon={
                  selectedCustomer.id?.startsWith('cust_new_') ? (
                    <PlusIcon className="w-4 h-4" />
                  ) : (
                    <CheckIcon className="w-4 h-4" />
                  )
                }
                className="font-bold"
              >
                {selectedCustomer.id?.startsWith('cust_new_') ? 'Add Client' : 'Save Client'}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setEditForm({
                    name: selectedCustomer.name,
                    phone: selectedCustomer.phone,
                    email: selectedCustomer.email === 'N/A' ? '' : selectedCustomer.email,
                    corporateAccountName: selectedCustomer.corporateAccountName || '',
                    isVip: selectedCustomer.isVip || false,
                    preferredVehicle: selectedCustomer.preferredVehicle || 'Standard Sedan',
                    notes: selectedCustomer.notes || '',
                  });
                  setIsEditingCustomer(true);
                }}
                leftIcon={<EditIcon className="w-4 h-4" />}
              >
                Edit Client
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsEditingCustomer(false);
                }}
                className="font-bold"
              >
                Done
              </Button>
            </>
          ))
        }
      >
        {selectedCustomer && (
          <div className="space-y-5">
            {saveSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-emerald-600" />
                <span>{saveSuccessMessage}</span>
              </div>
            )}

            {isEditingCustomer ? (
              /* ─── EDIT MODE ─── */
              <div className="space-y-5 text-xs">
                <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <UserIcon className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Identity &amp; Contact
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Eleanor Davis"
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="e.g. (314) 555-0199"
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                      <input
                        type="email"
                        value={editForm.email || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="e.g. passenger@example.com"
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Corporate Account</label>
                      <input
                        type="text"
                        value={editForm.corporateAccountName || ''}
                        onChange={(e) => setEditForm((f) => ({ ...f, corporateAccountName: e.target.value }))}
                        placeholder="e.g. Bayer Crop Science"
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <CarIcon className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Ride Preferences &amp; Notes
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Preferred Vehicle</label>
                      <select
                        value={editForm.preferredVehicle || 'Standard Sedan'}
                        onChange={(e) => setEditForm((f) => ({ ...f, preferredVehicle: e.target.value }))}
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                      >
                        <option value="Standard Sedan">Standard Sedan</option>
                        <option value="Premium Executive">Premium Sedan / SUV</option>
                        <option value="XL Minivan / SUV">XL Minivan / SUV</option>
                        <option value="Wheelchair Accessible (WAV)">Wheelchair Accessible (WAV)</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!editForm.isVip}
                          onChange={(e) => setEditForm((f) => ({ ...f, isVip: e.target.checked }))}
                          className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="font-bold text-slate-800">VIP Priority Client</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Dispatcher &amp; Driver Notes</label>
                    <textarea
                      rows={3}
                      value={editForm.notes || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Special luggage requests, gate codes, terminal preferences, mobility needs..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </section>
              </div>
            ) : (
              /* ─── VIEW MODE ─── */
              <div className="space-y-4 text-xs">
                <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
                  <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-black text-blue-700 tracking-wider block">
                        Reliability Score
                      </span>
                      <div className="text-sm font-black text-slate-900 mt-0.5">
                        Client Score: {selectedCustomer.customerScore ?? 90} / 100
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Based on trip history, completed rides, and cancellations.
                      </div>
                    </div>
                    <div
                      className={`text-xl font-black px-3 py-1.5 rounded-xl border shrink-0 inline-flex items-center gap-1.5 ${
                        (selectedCustomer.customerScore ?? 90) >= 80
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : (selectedCustomer.customerScore ?? 90) >= 60
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <StarIcon className="w-4 h-4 shrink-0" />
                      <span>{selectedCustomer.customerScore ?? 90}</span>
                    </div>
                  </div>

                  {selectedCustomer.isBlacklisted && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
                      <div className="font-black flex items-center gap-1.5">
                        <AlertTriangleIcon className="w-3.5 h-3.5 text-rose-600" />
                        <span>BLOCKED CLIENT</span>
                      </div>
                      <p className="text-[11px] text-rose-700">
                        Reason: {selectedCustomer.blacklistReason || 'Blocked by Admin'}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Bookings</span>
                      <span className="text-base font-black text-slate-900">{selectedCustomer.tripCount} Trips</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Spend</span>
                      <span className="text-base font-black text-emerald-600">${selectedCustomer.totalSpend.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="font-semibold text-slate-600 block mb-1">Phone Number</span>
                      <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono">{selectedCustomer.phone}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600 block mb-1">Email</span>
                      <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl truncate">{selectedCustomer.email || 'N/A'}</p>
                    </div>
                  </div>

                  {selectedCustomer.corporateAccountName && (
                    <div>
                      <span className="font-semibold text-slate-600 block mb-1">Corporate Account</span>
                      <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold">
                        {selectedCustomer.corporateAccountName}
                      </p>
                    </div>
                  )}

                  <div>
                    <span className="font-semibold text-slate-600 block mb-1">Preferred Vehicle</span>
                    <p className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl capitalize">
                      {selectedCustomer.preferredVehicle || 'Standard Sedan'}
                    </p>
                  </div>

                  {selectedCustomer.notes && (
                    <div>
                      <span className="font-semibold text-slate-600 block mb-1">Dispatcher Notes</span>
                      <p className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-900">
                        {selectedCustomer.notes}
                      </p>
                    </div>
                  )}
                </section>

                <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <ShieldIcon className="w-4 h-4 text-slate-600" />
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      Governance Actions
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const gov = getUniversalGovernanceService();
                        const isCurrentlyBl = !!selectedCustomer.isBlacklisted;
                        if (!isCurrentlyBl) {
                          setShowBlacklistInput((v) => !v);
                          return;
                        } else {
                          await gov.setBlacklistStatus('passenger', selectedCustomer.phone, false);
                          if (selectedCustomer.email && selectedCustomer.email !== 'N/A') {
                            await gov.setBlacklistStatus('passenger', selectedCustomer.email, false);
                          }
                          setSelectedCustomer({
                            ...selectedCustomer,
                            isBlacklisted: false,
                            blacklistReason: undefined,
                          });
                          setGovernanceRefreshKey((k) => k + 1);
                        }
                      }}
                      className={`text-xs font-bold cursor-pointer ${
                        selectedCustomer.isBlacklisted
                          ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          : 'text-rose-700 border-rose-300 hover:bg-rose-50'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {selectedCustomer.isBlacklisted ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5" />
                            <span>Restore Client</span>
                          </>
                        ) : (
                          <>
                            <BanIcon className="w-3.5 h-3.5" />
                            <span>{showBlacklistInput ? 'Cancel Blacklist' : 'Blacklist'}</span>
                          </>
                        )}
                      </span>
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const gov = getUniversalGovernanceService();
                        const newArchived = !selectedCustomer.isArchived;
                        await gov.setArchiveStatus('passenger', selectedCustomer.phone, newArchived);
                        setSelectedCustomer({
                          ...selectedCustomer,
                          isArchived: newArchived,
                        });
                        setGovernanceRefreshKey((k) => k + 1);
                      }}
                      className="text-xs font-bold text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer"
                    >
                      {selectedCustomer.isArchived ? 'Unarchive' : 'Archive'}
                    </Button>
                  </div>

                  {showBlacklistInput && !selectedCustomer.isBlacklisted && (
                    <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2 animate-in fade-in duration-150">
                      <label className="block text-[11px] font-bold text-rose-900">
                        Reason for blacklisting {selectedCustomer.name}
                      </label>
                      <input
                        type="text"
                        value={blacklistReasonDraft}
                        onChange={(e) => setBlacklistReasonDraft(e.target.value)}
                        placeholder="e.g. Repeated no-shows, unpaid balance..."
                        className="w-full px-3 py-2 text-xs bg-white border border-rose-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setShowBlacklistInput(false);
                            setBlacklistReasonDraft('');
                          }}
                          className="text-xs cursor-pointer"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={async () => {
                            const gov = getUniversalGovernanceService();
                            const reason = blacklistReasonDraft.trim() || 'Blacklisted by Admin';
                            await gov.setBlacklistStatus('passenger', selectedCustomer.phone, true, reason);
                            if (selectedCustomer.email && selectedCustomer.email !== 'N/A') {
                              await gov.setBlacklistStatus('passenger', selectedCustomer.email, true, reason);
                            }
                            setSelectedCustomer({
                              ...selectedCustomer,
                              isBlacklisted: true,
                              blacklistReason: reason,
                            });
                            setShowBlacklistInput(false);
                            setBlacklistReasonDraft('');
                            setGovernanceRefreshKey((k) => k + 1);
                          }}
                          className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                        >
                          Confirm Blacklist
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </AdminSlideOverDrawer>

      {/* ─── Add / Edit Corporate Account Slide-Over Drawer ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(editingCorp)}
        onClose={() => {
          setEditingCorp(null);
          setIsNewCorp(false);
        }}
        title={isNewCorp ? 'Add Corporate Account' : `Edit Corporate Account`}
        subtitle={
          isNewCorp
            ? 'Configure corporate billing terms, credit limit, and PO authorization'
            : editingCorp?.companyName || ''
        }
        size="lg"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => {
                setEditingCorp(null);
                setIsNewCorp(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="corporate-account-form"
              variant="primary"
              size="md"
              isLoading={isSavingCorp}
              leftIcon={isNewCorp ? <PlusIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
              className="font-bold"
            >
              {isNewCorp ? 'Add Corporate Account' : 'Save Corporate Account'}
            </Button>
          </>
        }
      >
        {editingCorp && (
          <form id="corporate-account-form" onSubmit={handleSaveCorporateAccount} className="space-y-5 text-xs">
            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <BuildingIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Company &amp; Billing Contact
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Company Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCorp.companyName}
                    onChange={(e) => setEditingCorp({ ...editingCorp, companyName: e.target.value })}
                    placeholder="e.g. Bayer Crop Science"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Account Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCorp.accountNumber}
                    onChange={(e) => setEditingCorp({ ...editingCorp, accountNumber: e.target.value })}
                    placeholder="e.g. CORP-101"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Billing Contact Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editingCorp.billingContactName || ''}
                    onChange={(e) => setEditingCorp({ ...editingCorp, billingContactName: e.target.value })}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Billing Contact Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editingCorp.billingContactEmail}
                    onChange={(e) => setEditingCorp({ ...editingCorp, billingContactEmail: e.target.value })}
                    placeholder="ap@company.com"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Billing Terms &amp; PO Controls
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Billing Cycle</label>
                  <select
                    value={editingCorp.billingCycle}
                    onChange={(e) => setEditingCorp({ ...editingCorp, billingCycle: e.target.value as any })}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    <option value="immediate">Immediate</option>
                    <option value="net15">Net 15</option>
                    <option value="net30">Net 30</option>
                    <option value="net60">Net 60</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Credit Limit ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingCorp.creditLimit}
                    onChange={(e) => setEditingCorp({ ...editingCorp, creditLimit: Number(e.target.value) || 0 })}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editingCorp.discountPercent}
                    onChange={(e) => setEditingCorp({ ...editingCorp, discountPercent: Number(e.target.value) || 0 })}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Authorized PO Number</label>
                <input
                  type="text"
                  value={editingCorp.currentPoNumber || ''}
                  onChange={(e) => setEditingCorp({ ...editingCorp, currentPoNumber: e.target.value })}
                  placeholder="PO-XXXXXX"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold"
                />
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCorp.poRequired)}
                    onChange={(e) => setEditingCorp({ ...editingCorp, poRequired: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-800">Enforce PO Number on Bookings</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingCorp.isActive)}
                    onChange={(e) => setEditingCorp({ ...editingCorp, isActive: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                  />
                  <span className="font-semibold text-slate-800">Account Active</span>
                </label>
              </div>
            </section>

            {/* Corporate Portal Managers Section (for saved corporate accounts) */}
            {!isNewCorp && (
              <section className="bg-indigo-50/50 rounded-2xl border border-indigo-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-indigo-100">
                  <div className="flex items-center gap-2">
                    <UserCheckIcon className="w-4 h-4 text-indigo-600" />
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950">
                        Corporate Self-Service Portal Managers (/app/corporate)
                      </h3>
                      <p className="text-[11px] text-slate-600">
                        Provision B2B travel coordinators strictly scoped to {editingCorp.accountNumber}.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenProvisionModal(editingCorp)}
                    className="text-[11px] font-bold bg-white border-indigo-300 text-indigo-800 hover:bg-indigo-100 shrink-0 cursor-pointer"
                  >
                    + Provision Corporate Portal Manager
                  </Button>
                </div>

                {(editingCorp.portalManagers || []).length > 0 ? (
                  <div className="space-y-1.5">
                    {editingCorp.portalManagers!.map((pm, idx) => (
                      <div
                        key={`${pm.email}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-indigo-100 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">{pm.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono truncate">{pm.email}</div>
                        </div>
                        <Badge variant="success" size="sm" className="text-[10px]">
                          {pm.status.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    No Corporate Portal Managers provisioned yet for {editingCorp.companyName}.
                  </p>
                )}
              </section>
            )}
          </form>
        )}
      </AdminSlideOverDrawer>

      {/* ─── Provision Corporate Portal Manager Modal ─── */}
      {provisioningCorp && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
                  <UserCheckIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-950">
                    Provision Corporate Portal Manager
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {provisioningCorp.companyName} ({provisioningCorp.accountNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProvisioningCorp(null);
                  setProvisionResult(null);
                }}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            {provisionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold">
                {provisionError}
              </div>
            )}

            {provisionResult ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    <span>
                      Corporate Portal Manager Provisioned ({provisionResult.email})
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    Bound strictly to <strong>{provisionResult.corporateAccountNumber}</strong> (
                    <code>{provisionResult.corporateAccountId}</code>) with role{' '}
                    <code>{provisionResult.roles.join(', ')}</code>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">
                      Copyable Client Login Instructions (/app/corporate)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(provisionResult.instructionsText);
                        setCopiedInstructions(true);
                        setTimeout(() => setCopiedInstructions(false), 2500);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                    >
                      {copiedInstructions ? (
                        <>
                          <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon className="w-3.5 h-3.5" />
                          <span>Copy Instructions</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] whitespace-pre-wrap break-all leading-relaxed border border-slate-800">
                    {provisionResult.instructionsText}
                  </pre>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setProvisioningCorp(null);
                      setProvisionResult(null);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleProvisionPortalManager} className="space-y-3.5">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Manager Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={mgrName}
                    onChange={(e) => setMgrName(e.target.value)}
                    placeholder="e.g. Laura Vance"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Corporate Login Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={mgrEmail}
                      onChange={(e) => setMgrEmail(e.target.value)}
                      placeholder="traveldesk@company.com"
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Direct Phone (Optional)
                    </label>
                    <input
                      type="tel"
                      value={mgrPhone}
                      onChange={(e) => setMgrPhone(e.target.value)}
                      placeholder="(314) 555-0190"
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mgrIncludeCustomerRole}
                    onChange={(e) => setMgrIncludeCustomerRole(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600"
                  />
                  <div>
                    <span className="font-bold text-slate-800 block">
                      Also grant personal Client Portal (customer) workspace
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Leave unchecked so this manager lands directly inside /app/corporate upon login.
                    </span>
                  </div>
                </label>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProvisioningCorp(null)}
                    className="cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isProvisioningMgr}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                  >
                    Provision Portal Access
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Regenerate PO Modal ─── */}
      {selectedPoAccount && (
        <RegeneratePoModal
          account={selectedPoAccount}
          isOpen={isRegeneratePoOpen}
          onClose={() => {
            setIsRegeneratePoOpen(false);
            setSelectedPoAccount(null);
          }}
          onSuccess={handlePoRegenerateSuccess}
          operatorEmail="admin@chesterfieldtaxi.com"
        />
      )}

      {/* ─── PO History Modal ─── */}
      {selectedPoAccount && (
        <PoHistoryModal
          account={selectedPoAccount}
          isOpen={isPoHistoryOpen}
          onClose={() => {
            setIsPoHistoryOpen(false);
            setSelectedPoAccount(null);
          }}
        />
      )}
    </div>
  );
}

