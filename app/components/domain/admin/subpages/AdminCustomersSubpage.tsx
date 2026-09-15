import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { SpinnerIcon, UserIcon, UsersIcon, BuildingIcon, ShieldIcon, AlertTriangleIcon } from '../../../ui/Icons';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import { CheckIcon } from '../../../ui/Icons';

export type CustomersSubTab = 'directory' | 'corporate';

interface AdminCustomersSubpageProps {
  settings: AppSettings;
  initialSubTab?: CustomersSubTab;
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
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isArchived?: boolean;
}

export function AdminCustomersSubpage({
  settings,
  initialSubTab = 'directory',
}: AdminCustomersSubpageProps) {
  const [activeSub, setActiveSub] = useState<CustomersSubTab>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [governanceRefreshKey, setGovernanceRefreshKey] = useState(0);
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);

  useEffect(() => {
    setActiveSub(initialSubTab);
  }, [initialSubTab]);

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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
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
                          onClick={() => setSelectedCustomer(cust)}
                          className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
                        >
                          Details
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
      {activeSub === 'corporate' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {corporateClients.map((corp) => (
            <Card key={corp.id} className="border border-slate-200/90 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black text-slate-900">
                  {corp.companyName}
                </CardTitle>
                <CardDescription className="text-xs font-mono font-bold text-blue-600">
                  {corp.accountNumber} • {corp.billingCycle.toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Credit Limit:</span>
                    <span className="font-bold text-slate-900">${corp.creditLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contract Discount:</span>
                    <span className="font-bold text-emerald-600">{corp.discountPercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PO Number:</span>
                    <span className="font-semibold">{corp.poRequired ? 'Required on Booking' : 'Not required'}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <p className="font-bold text-slate-700 text-[11px]">Authorized Bookers:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(corp.authorizedBookers || [corp.billingContactEmail]).map((b, idx) => (
                      <span key={idx} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Customer Details Modal ─── */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-base">{selectedCustomer.name}</h3>
                <p className="text-xs text-slate-500">{selectedCustomer.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

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

              <div>
                <span className="font-bold text-slate-700 block mb-1">Phone Number</span>
                <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg">{selectedCustomer.phone}</p>
              </div>

              <div>
                <span className="font-bold text-slate-700 block mb-1">Preferred Chauffeur Class</span>
                <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg capitalize">
                  {selectedCustomer.preferredVehicle || 'Standard Sedan'}
                </p>
              </div>
            </div>

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
                  className={`text-xs font-bold ${
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
                  className="text-xs font-bold text-slate-700 border-slate-300 hover:bg-slate-50"
                >
                  {selectedCustomer.isArchived ? 'Unarchive' : 'Archive'}
                </Button>
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setSelectedCustomer(null)}
                className="bg-blue-600 text-white font-bold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
