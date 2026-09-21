import React, { useState, useEffect } from 'react';
import type { AppSettings, CorporateAccountConfig } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
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
} from '../../../ui/Icons';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from '../UniversalArchiveDrawer';
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
  };

  const handleSaveCustomer = () => {
    if (!editForm.name?.trim() || !editForm.phone?.trim()) {
      alert('Passenger Name and Phone Number are required.');
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
    setSaveSuccessMessage('Contact profile saved successfully.');
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

  // Synthesize customer profiles from trips
  const customerMap = new Map<string, CustomerProfile>();

  // Mock baseline loyal customers
  customerMap.set('john.miller@example.com', {
    id: 'cust-1',
    name: 'John Miller',
    email: 'john.miller@example.com',
    phone: '(314) 555-0199',
    tripCount: 14,
    totalSpend: 624.50,
    lastRideDate: '2026-09-12',
    isVip: true,
    preferredVehicle: 'Standard Sedan',
  });

  customerMap.set('sarah.connor@bayer.example.com', {
    id: 'cust-2',
    name: 'Sarah Connor',
    email: 'sarah.connor@bayer.example.com',
    phone: '(314) 694-8821',
    tripCount: 8,
    totalSpend: 480.00,
    lastRideDate: '2026-09-10',
    isVip: true,
    corporateAccountName: 'Bayer Crop Science',
    preferredVehicle: 'Premium Executive',
  });

  customerMap.set('emily.davis@example.com', {
    id: 'cust-3',
    name: 'Emily Davis',
    email: 'emily.davis@example.com',
    phone: '(636) 532-9011',
    tripCount: 4,
    totalSpend: 156.00,
    lastRideDate: '2026-09-08',
    isVip: false,
    preferredVehicle: 'XL Minivan / SUV',
  });

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

  return (
    <div className="space-y-6">
      {/* ─── Customers Contextual Action Bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-xs font-bold text-slate-700 px-2 flex items-center gap-2">
          {activeSub === 'directory' ? (
            <>
              <UsersIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Passenger Directory ({allCustomers.length} profiles)</span>
            </>
          ) : (
            <>
              <BuildingIcon className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Corporate Client Accounts ({corporateClients.length} accounts)</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeSub === 'directory' && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setArchiveFilter('active')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  archiveFilter === 'active'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Active ({activeCustomers.length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveFilter('archived')}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  archiveFilter === 'archived'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Archived ({archivedCustomers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setArchiveFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  archiveFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                All ({allCustomers.length})
              </button>
            </div>
          )}

          <Button
            type="button"
            variant="default"
            size="sm"
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
            className="text-xs font-bold inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
          >
            <span>+ Add Contact</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsArchiveDrawerOpen(true)}
            className="text-xs font-bold inline-flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-300"
          >
            <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span>Universal Archive Drawer</span>
          </Button>

          <div className="w-full sm:w-56">
            <input
              type="text"
              placeholder="Search passenger..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ─── Directory Table ─── */}
      {activeSub === 'directory' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar min-w-full">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Passenger</th>
                  <th className="px-4 py-3">Customer Score</th>
                  <th className="px-4 py-3">Phone & Email</th>
                  <th className="px-4 py-3">Affiliation</th>
                  <th className="px-4 py-3">Total Rides</th>
                  <th className="px-4 py-3">Lifetime Spend</th>
                  <th className="px-4 py-3">Preferred Class</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{cust.name}</span>
                        {cust.isVip && (
                          <Badge variant="warning" size="sm" className="text-[9px] px-1 py-0 font-black">
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
                      {cust.blacklistReason && (
                        <p className="text-[10px] text-rose-600 font-semibold mt-0.5">
                          Reason: {cust.blacklistReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-black text-xs px-2.5 py-0.5 rounded-full border ${
                          (cust.customerScore ?? 90) >= 80
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : (cust.customerScore ?? 90) >= 60
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                        title="Phase 29 Dual-Scoring Engine: Customer Metric"
                      >
                        ★ {cust.customerScore ?? 90} / 100
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-700 block">{cust.phone}</span>
                      <span className="text-[11px] text-slate-500 block truncate max-w-[180px]">
                        {cust.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {cust.corporateAccountName ? (
                        <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                          {cust.corporateAccountName}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">Direct Retail</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{cust.tripCount} trips</td>
                    <td className="px-4 py-3 font-black text-slate-900">
                      ${cust.totalSpend.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {cust.preferredVehicle || 'Standard'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
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
                          className={`text-[11px] px-2 py-1 font-bold flex items-center gap-1 ${
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenCustomer(cust, false)}
                          className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
                        >
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenCustomer(cust, true)}
                          className="text-[11px] px-2 py-1 text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder={`Search ${corporateClients.length} corporate accounts...`}
                  value={corpSearchTerm}
                  onChange={(e) => {
                    setCorpSearchTerm(e.target.value);
                    setCorpPage(1);
                  }}
                  className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                {corpSearchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setCorpSearchTerm('');
                      setCorpPage(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setCorpFilter('all');
                    setCorpPage(1);
                  }}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    corpFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
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
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    corpFilter === 'po_enforced'
                      ? 'bg-white text-slate-900 shadow-xs'
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
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    corpFilter === 'po_disabled'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  PO Optional ({corporateClients.filter((a) => !a.poRequired).length})
                </button>
              </div>
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
                        <Badge variant={corp.isActive ? 'success' : 'default'} size="sm" className="text-[10px]">
                          {corp.isActive ? 'Active' : 'Paused'}
                        </Badge>
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
              <div className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-slate-200/90 text-xs">
                <span className="text-slate-500 font-medium">
                  Showing {((corpPage - 1) * CORP_PAGE_SIZE) + 1}–
                  {Math.min(corpPage * CORP_PAGE_SIZE, filteredCorp.length)} of{' '}
                  {filteredCorp.length} corporate accounts
                </span>
                <div className="flex items-center gap-1.5">
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

      {/* ─── Customer Details & Edit Modal ─── */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-slate-900 text-base">
                    {isEditingCustomer
                      ? selectedCustomer.id?.startsWith('cust_new_')
                        ? 'New Passenger Contact'
                        : `Edit Contact: ${selectedCustomer.name || 'Passenger'}`
                      : selectedCustomer.name}
                  </h3>
                  {selectedCustomer.isVip && !isEditingCustomer && (
                    <Badge variant="warning" className="text-[10px] font-extrabold uppercase">
                      VIP
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {isEditingCustomer
                    ? 'Update profile details, notes, and chauffeur tier preferences'
                    : selectedCustomer.email}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!selectedCustomer.id?.startsWith('cust_new_') && (
                  <Button
                    type="button"
                    size="sm"
                    variant={isEditingCustomer ? 'outline' : 'primary'}
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
                    className="text-xs font-bold cursor-pointer"
                  >
                    {isEditingCustomer ? 'View Details' : 'Edit Profile'}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setIsEditingCustomer(false);
                  }}
                  className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {saveSuccessMessage && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckIcon className="w-4 h-4 text-emerald-600" />
                <span>{saveSuccessMessage}</span>
              </div>
            )}

            {isEditingCustomer ? (
              /* ─── EDIT MODE ─── */
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.name || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Eleanor Davis"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      Phone Number <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="e.g. (314) 555-0199"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="e.g. passenger@example.com"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Corporate Account</label>
                    <input
                      type="text"
                      value={editForm.corporateAccountName || ''}
                      onChange={(e) => setEditForm((f) => ({ ...f, corporateAccountName: e.target.value }))}
                      placeholder="e.g. Bayer Crop Science"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Preferred Chauffeur Class</label>
                    <select
                      value={editForm.preferredVehicle || 'Standard Sedan'}
                      onChange={(e) => setEditForm((f) => ({ ...f, preferredVehicle: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Standard Sedan">Standard Sedan</option>
                      <option value="Premium Executive">Premium Executive</option>
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
                      <span className="font-bold text-slate-800">VIP Priority Passenger</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Dispatcher & Driver Notes</label>
                  <textarea
                    rows={3}
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder="Special luggage requests, gate codes, terminal preferences, mobility needs..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedCustomer.id?.startsWith('cust_new_')) {
                        setSelectedCustomer(null);
                      }
                      setIsEditingCustomer(false);
                    }}
                    className="text-slate-600 hover:text-slate-800 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSaveCustomer}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                  >
                    Save Contact
                  </Button>
                </div>
              </div>
            ) : (
              /* ─── VIEW MODE ─── */
              <div className="space-y-3 text-xs">
                {/* Customer Score Banner */}
                <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200/80 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-black text-blue-700 tracking-wider block">
                      Dual-Scoring Engine
                    </span>
                    <div className="text-sm font-black text-slate-900 mt-0.5">
                      Customer Score: {selectedCustomer.customerScore ?? 90} / 100
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Evaluated from ride frequency, completion fidelity, and cancellations.
                    </div>
                  </div>
                  <div
                    className={`text-xl font-black px-3 py-1.5 rounded-xl border shrink-0 ${
                      (selectedCustomer.customerScore ?? 90) >= 80
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : (selectedCustomer.customerScore ?? 90) >= 60
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    ★ {selectedCustomer.customerScore ?? 90}
                  </div>
                </div>

                {selectedCustomer.isBlacklisted && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
                    <div className="font-black flex items-center gap-1.5">
                      <AlertTriangleIcon className="w-3.5 h-3.5 text-rose-600" />
                      <span>BLACKLISTED PASSENGER</span>
                    </div>
                    <p className="text-[11px] text-rose-700">
                      Reason: {selectedCustomer.blacklistReason || 'Administrative Block'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Bookings</span>
                    <span className="text-base font-black text-slate-900">{selectedCustomer.tripCount} Trips</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Lifetime Volume</span>
                    <span className="text-base font-black text-emerald-600">${selectedCustomer.totalSpend.toFixed(2)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">Phone Number</span>
                    <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono">{selectedCustomer.phone}</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">Email</span>
                    <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg truncate">{selectedCustomer.email || 'N/A'}</p>
                  </div>
                </div>

                {selectedCustomer.corporateAccountName && (
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">Corporate Account</span>
                    <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-semibold">
                      {selectedCustomer.corporateAccountName}
                    </p>
                  </div>
                )}

                <div>
                  <span className="font-bold text-slate-700 block mb-1">Preferred Chauffeur Class</span>
                  <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg capitalize">
                    {selectedCustomer.preferredVehicle || 'Standard Sedan'}
                  </p>
                </div>

                {selectedCustomer.notes && (
                  <div>
                    <span className="font-bold text-slate-700 block mb-1">Dispatcher Notes</span>
                    <p className="p-2 bg-amber-50/70 border border-amber-200/80 rounded-lg text-amber-900">
                      {selectedCustomer.notes}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-200 gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const gov = getUniversalGovernanceService();
                        const isCurrentlyBl = !!selectedCustomer.isBlacklisted;
                        if (!isCurrentlyBl) {
                          const reason = window.prompt(`Enter blacklist reason for ${selectedCustomer.name}:`);
                          if (reason === null) return;
                          await gov.setBlacklistStatus('passenger', selectedCustomer.phone, true, reason || 'Blacklisted by Admin');
                          if (selectedCustomer.email && selectedCustomer.email !== 'N/A') {
                            await gov.setBlacklistStatus('passenger', selectedCustomer.email, true, reason || 'Blacklisted by Admin');
                          }
                          setSelectedCustomer({
                            ...selectedCustomer,
                            isBlacklisted: true,
                            blacklistReason: reason || 'Blacklisted by Admin',
                          });
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
                        }
                        setGovernanceRefreshKey((k) => k + 1);
                      }}
                      className={`text-xs font-bold cursor-pointer ${
                        selectedCustomer.isBlacklisted
                          ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                          : 'text-rose-700 border-rose-300 hover:bg-rose-50'
                      }`}
                    >
                      {selectedCustomer.isBlacklisted ? '✅ Restore Passenger' : '🚫 Blacklist'}
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

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                      className="text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
                    >
                      Edit Contact
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setIsEditingCustomer(false);
                      }}
                      className="bg-blue-600 text-white font-bold cursor-pointer"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
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

