import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Trip } from '../../../core/types/trip';
import { getBookingService } from '../../../core/services/booking';
import type { AppSettings } from '../../../core/types/config';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import {
  CarIcon,
  ClockIcon,
  CheckIcon,
  ShieldCheckIcon,
  SpinnerIcon,
} from '../../ui/Icons';

interface AdminDashboardTabProps {
  settings: AppSettings;
  onNavigateTab: (tabKey: any) => void;
}

export function AdminDashboardTab({ settings, onNavigateTab }: AdminDashboardTabProps) {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to real-time trips
  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();

    if (service.subscribeToAllTrips) {
      const unsub = service.subscribeToAllTrips(
        (updatedTrips) => {
          setTrips(updatedTrips);
          setIsLoading(false);
        },
        (err) => {
          console.warn('[AdminDashboardTab] Subscription error:', err);
          setIsLoading(false);
        }
      );
      return unsub;
    } else if (service.getAllTrips) {
      service
        .getAllTrips()
        .then((data) => {
          setTrips(data);
          setIsLoading(false);
        })
        .catch(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  // Compute metrics
  const totalTripsCount = trips.length;
  const activeDispatchedCount = trips.filter(
    (t) => t.status === 'assigned' || t.status === 'offered'
  ).length;
  const pendingCount = trips.filter((t) => t.status === 'pending').length;
  const completedCount = trips.filter((t) => t.status === 'completed').length;
  const cancelledCount = trips.filter((t) => t.status === 'cancelled').length;

  const totalRevenue = trips.reduce((acc, t) => {
    if (t.status !== 'cancelled') {
      const fare = Number(t.pricing?.totalFare || t.payment?.amount || 0);
      return acc + (isNaN(fare) ? 0 : fare);
    }
    return acc;
  }, 0);

  // Recent trips
  const recentTrips = [...trips]
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
    .slice(0, 6);

  // Simulated Driver Roster Stats
  const totalDrivers = 4;
  const availableDrivers = 2;
  const onTripDrivers = activeDispatchedCount > 0 ? Math.min(activeDispatchedCount, totalDrivers) : 1;
  const utilizationPercent = Math.round((onTripDrivers / totalDrivers) * 100);

  return (
    <div className="space-y-6">
      {/* ─── Hero Quick Launcher ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-2xl p-6 text-white shadow-lg border border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold uppercase tracking-wider">
              Real-Time Control Room
            </span>
            <span className="text-xs text-slate-400">&bull; Live Fleet Sync Active</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Chesterfield Taxi Tactical Dispatch
          </h2>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Manage multi-tab draft bookings, monitor active driver locations on the live interactive map,
            conduct customer phone calls via the built-in softphone, and dispatch rides in real time.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <Link
            to="/dispatch"
            reloadDocument
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-blue-400/30 group"
          >
            <span>🚕</span>
            <span>Launch Dispatch Console</span>
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => onNavigateTab('bookings')}
            className="w-full sm:w-auto text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            Manage Bookings ({totalTripsCount})
          </Button>
        </div>
      </div>

      {/* ─── High-Level KPI Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Total Trips */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Bookings
            </span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm">📋</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {isLoading ? '...' : totalTripsCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">all-time</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            <strong className="text-emerald-600">{completedCount}</strong> completed &bull;{' '}
            <strong className="text-amber-600">{pendingCount}</strong> pending
          </div>
        </Card>

        {/* Metric 2: Live Dispatched */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Trips
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 text-sm">🚕</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600">
              {isLoading ? '...' : activeDispatchedCount}
            </span>
            <span className="text-xs text-slate-400 font-medium">in progress</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Vehicles currently on the road</span>
          </div>
        </Card>

        {/* Metric 3: Estimated Revenue */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Revenue
            </span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 text-sm">💰</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              ${totalRevenue.toFixed(2)}
            </span>
            <span className="text-xs text-slate-400 font-medium">USD</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Base rate: <strong>${settings.pricing.baseFare.toFixed(2)}</strong> &bull; Per mile: <strong>${settings.pricing.perMileRate.toFixed(2)}</strong>
          </div>
        </Card>

        {/* Metric 4: Fleet Utilization */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Fleet Capacity
            </span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600 text-sm">⚡</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900">
              {utilizationPercent}%
            </span>
            <span className="text-xs text-slate-400 font-medium">utilization</span>
          </div>
          <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            <strong>{availableDrivers}</strong> available &bull; <strong>{totalDrivers}</strong> total
          </div>
        </Card>
      </div>

      {/* ─── Two-Column Middle Section: Recent Activity & Quick Settings ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Bookings & Dispatch Activity */}
        <div className="lg:col-span-2">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs h-full flex flex-col">
            <CardHeader className="border-b border-slate-100 p-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">
                  Recent Dispatch Activity
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Latest customer bookings received and active trip status
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('bookings')}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                View all &rarr;
              </button>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-x-auto">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                  <SpinnerIcon className="w-5 h-5 animate-spin text-blue-600" />
                  <span className="text-xs">Loading live trip queue...</span>
                </div>
              ) : recentTrips.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No bookings registered yet. Open the Dispatch Console to create your first reservation.
                </div>
              ) : (
                <table className="w-full text-left text-xs divide-y divide-slate-100">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Passenger</th>
                      <th className="px-4 py-2.5">Route</th>
                      <th className="px-4 py-2.5">Fare</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTrips.map((trip) => {
                      const fare = Number(trip.pricing?.totalFare || trip.payment?.amount || 0);
                      const passengerName = trip.passenger
                        ? `${trip.passenger.firstName || ''} ${trip.passenger.lastName || ''}`.trim() || 'Anonymous Rider'
                        : 'Anonymous Rider';
                      const passengerPhone = trip.passenger?.phone || trip.id;
                      const pickup = trip.pickupLocation?.address || 'Pickup address not specified';
                      const dropoff = trip.dropoffLocation?.address || 'Dropoff address not specified';

                      return (
                        <tr key={trip.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            <div>{passengerName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {passengerPhone}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                            <div className="truncate font-medium text-slate-800">
                              📍 {pickup}
                            </div>
                            <div className="truncate text-slate-400 text-[11px]">
                              🏁 {dropoff}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900">
                            ${fare > 0 ? fare.toFixed(2) : '--'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                trip.status === 'completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : trip.status === 'assigned' || trip.status === 'offered'
                                  ? 'bg-blue-100 text-blue-800 animate-pulse'
                                  : trip.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {trip.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to="/dispatch"
                              reloadDocument
                              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Dispatch &rarr;
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Quick Admin Settings & System Navigation */}
        <div className="space-y-4">
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4">
            <CardTitle className="text-sm font-bold text-slate-900 mb-1">
              Admin Configuration Center
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mb-4">
              Quickly adjust business rules, pricing tiers, and fleet configurations.
            </CardDescription>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onNavigateTab('pricing')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🏷️</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Pricing &amp; Surge Multipliers
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Surge: {settings.pricing.surgeMultiplier}x &bull; Base: ${settings.pricing.baseFare}
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('fleet')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🚗</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Fleet &amp; Vehicle Tiers
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Sedan, SUV, Van limits &amp; car seats
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('general')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🏢</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Company &amp; Branding
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {settings.company.name} &bull; {settings.company.phone}
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('staff')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">👥</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Staff &amp; RBAC Permissions
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Admin and Dispatcher role management
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('layout')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🎨</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Public Form Layout
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Active: {settings.publicFormVersion ? settings.publicFormVersion.toUpperCase() : 'V2'} (Single-Page Flow)
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
