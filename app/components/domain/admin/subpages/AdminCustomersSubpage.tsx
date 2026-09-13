import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { SpinnerIcon, UserIcon } from '../../../ui/Icons';

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

  const allCustomers = Array.from(customerMap.values());

  const filteredCustomers = allCustomers.filter((c) => {
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
      {/* ─── Sub-Navigation Pills ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSub('directory')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'directory'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>👤 Passenger Directory</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'directory' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {allCustomers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('corporate')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'corporate'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🏢 Corporate Client Accounts</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'corporate' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {corporateClients.length}
            </span>
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search passenger name, email, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
                      </div>
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedCustomer(cust)}
                        className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
                      >
                        Details
                      </Button>
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

            <div className="flex justify-end pt-3 border-t border-slate-200">
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
