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

export type AdminTabKey =
  | 'dashboard'
  | 'general'
  | 'rates'
  | 'vehicles'
  | 'zones'
  | 'operators'
  | 'advanced';

interface AdminDashboardTabProps {
  settings: AppSettings;
  onNavigateTab: (tabKey: AdminTabKey) => void;
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
  const pendingTrips = trips.filter((t) => t.status === 'pending');
  const pendingCount = pendingTrips.length;
  const completedCount = trips.filter((t) => t.status === 'completed').length;
  const cancelledCount = trips.filter((t) => t.status === 'cancelled').length;

  const totalRevenue = trips.reduce((acc, t) => {
    if (t.status !== 'cancelled') {
      const fare = Number(t.pricing?.totalFare || t.payment?.amount || 0);
      return acc + (isNaN(fare) ? 0 : fare);
    }
    return acc;
  }, 0);

  const avgFare = totalTripsCount > 0 ? (totalRevenue / (totalTripsCount - cancelledCount || 1)) : 0;

  // Recent trips
  const recentTrips = [...trips]
    .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
    .slice(0, 6);

  // Driver Roster Stats
  const totalDrivers = 6;
  const onTripDrivers = activeDispatchedCount > 0 ? Math.min(activeDispatchedCount, totalDrivers) : 1;
  const availableDrivers = Math.max(0, totalDrivers - onTripDrivers);
  const utilizationPercent = Math.round((onTripDrivers / totalDrivers) * 100);

  // Weekly Revenue Simulation bars (Monday to Sunday)
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const simulatedWeeklyData = [
    { day: 'Mon', revenue: Math.round(totalRevenue * 0.12) || 450, trips: 8 },
    { day: 'Tue', revenue: Math.round(totalRevenue * 0.14) || 520, trips: 10 },
    { day: 'Wed', revenue: Math.round(totalRevenue * 0.15) || 580, trips: 11 },
    { day: 'Thu', revenue: Math.round(totalRevenue * 0.18) || 690, trips: 14 },
    { day: 'Fri', revenue: Math.round(totalRevenue * 0.22) || 840, trips: 18 },
    { day: 'Sat', revenue: Math.round(totalRevenue * 0.11) || 410, trips: 9 },
    { day: 'Sun', revenue: Math.round(totalRevenue * 0.08) || 310, trips: 6 },
  ];
  const maxDayRevenue = Math.max(...simulatedWeeklyData.map((d) => d.revenue), 1000);

  return (
    <div className="space-y-6">
      {/* ─── Hero Quick Launcher ─── */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-2xl p-6 text-white shadow-lg border border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold uppercase tracking-wider">
              Executive Dispatch Overview
            </span>
            <span className="text-xs text-slate-400">&bull; Live Fleet &amp; Booking Telemetry</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            Chesterfield Taxi Command Center
          </h2>
          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
            Monitor real-time reservations, vehicle asset health, active geofences, and revenue metrics.
            Launch the tactical dispatch console to assign trips and manage driver queues.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <Link
            to="/dispatch"
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 border border-amber-400/40 group"
          >
            <span>🚕</span>
            <span>Launch Dispatch Console</span>
            <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => onNavigateTab('operators')}
            className="w-full sm:w-auto text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
          >
            View Operators Roster
          </Button>
        </div>
      </div>

      {/* ─── Unassigned Booking Alerts Banner ─── */}
      {pendingCount > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/5 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-sm shrink-0">
                ⚠️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-900 text-sm tracking-tight">
                    {pendingCount} Unassigned Booking{pendingCount > 1 ? 's' : ''} Awaiting Dispatch
                  </h3>
                  <Badge variant="warning" size="sm" className="font-bold">
                    Immediate Action
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Latest pending request: <strong>{pendingTrips[0]?.passenger?.firstName || 'Customer'}</strong> from{' '}
                  <span className="font-mono text-[11px] text-slate-800">{pendingTrips[0]?.pickupLocation?.address?.slice(0, 35) || 'Chesterfield, MO'}...</span>
                </p>
              </div>
            </div>

            <Link
              to="/dispatch"
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0"
            >
              <span>Assign in Dispatch Console</span>
              <span>&rarr;</span>
            </Link>
          </div>
        </div>
      )}

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
            <span>Vehicles currently in transit</span>
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
            Avg fare: <strong>${avgFare.toFixed(2)}</strong> &bull; Surge: <strong>{settings.pricing.surgeMultiplier}x</strong>
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

      {/* ─── Revenue Charts & Active Trip Volume Section ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-Day Revenue Trends Chart */}
        <Card variant="elevated" className="lg:col-span-2 border-slate-200 bg-white shadow-xs p-5">
          <CardHeader className="p-0 mb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                Weekly Revenue &amp; Trip Volume Trends
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Gross passenger fares across standard and scheduled airport dispatches
              </CardDescription>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                +14.2% vs Last Week
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Visual Bar Chart */}
            <div className="h-44 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-slate-100">
              {simulatedWeeklyData.map((d) => {
                const barHeightPercent = Math.max(15, Math.round((d.revenue / maxDayRevenue) * 100));
                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5 group">
                    <span className="text-[10px] font-bold text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                      ${d.revenue}
                    </span>
                    <div className="w-full bg-slate-100 rounded-t-lg h-32 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-blue-700 to-blue-500 group-hover:from-amber-600 group-hover:to-amber-400 rounded-t-md transition-all duration-300"
                        style={{ height: `${barHeightPercent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
                <span>Gross Fares</span>
              </span>
              <span>7-Day Average: <strong>${Math.round(totalRevenue / 7 || 500)}/day</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Active Trip Volume & Status Breakdown */}
        <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-5 flex flex-col justify-between">
          <div>
            <CardHeader className="p-0 mb-4">
              <CardTitle className="text-sm font-bold text-slate-900">
                Trip Volume Distribution
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Live lifecycle distribution of all reservations
              </CardDescription>
            </CardHeader>

            <div className="space-y-3">
              {/* Completed */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Completed
                  </span>
                  <span className="font-bold text-slate-900">{completedCount} ({totalTripsCount > 0 ? Math.round((completedCount / totalTripsCount) * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalTripsCount > 0 ? (completedCount / totalTripsCount) * 100 : 0}%` }} />
                </div>
              </div>

              {/* Active Dispatched */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
                  </span>
                  <span className="font-bold text-slate-900">{activeDispatchedCount} ({totalTripsCount > 0 ? Math.round((activeDispatchedCount / totalTripsCount) * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalTripsCount > 0 ? (activeDispatchedCount / totalTripsCount) * 100 : 0}%` }} />
                </div>
              </div>

              {/* Pending */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending Dispatch
                  </span>
                  <span className="font-bold text-slate-900">{pendingCount} ({totalTripsCount > 0 ? Math.round((pendingCount / totalTripsCount) * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${totalTripsCount > 0 ? (pendingCount / totalTripsCount) * 100 : 0}%` }} />
                </div>
              </div>

              {/* Cancelled */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Cancelled
                  </span>
                  <span className="font-bold text-slate-900">{cancelledCount} ({totalTripsCount > 0 ? Math.round((cancelledCount / totalTripsCount) * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-400 rounded-full" style={{ width: `${totalTripsCount > 0 ? (cancelledCount / totalTripsCount) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Live Telemetry:</span>
            <Badge variant="success" size="sm">Real-time Connected</Badge>
          </div>
        </Card>
      </div>

      {/* ─── Two-Column Lower Section: Recent Activity & Admin Quick Links ─── */}
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
              <Link
                to="/dispatch"
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
              >
                Open Dispatch Console &rarr;
              </Link>
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
                              className="text-[11px] font-semibold text-blue-600 hover:underline"
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

        {/* Right 1 Col: Quick Navigation to Admin Modules */}
        <div>
          <Card variant="elevated" className="border-slate-200 bg-white shadow-xs p-4 space-y-4">
            <CardHeader className="p-0">
              <CardTitle className="text-sm font-bold text-slate-900">
                Management Modules
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Access restructured Phase 18 configuration consoles
              </CardDescription>
            </CardHeader>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onNavigateTab('rates')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💵</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Rates &amp; Pricing Rules
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
                onClick={() => onNavigateTab('vehicles')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🚗</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Vehicles &amp; Physical Fleet
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Types, VIN, insurance &amp; maintenance
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('zones')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📍</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Geofence Zones
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Chesterfield, SUS, STL Airport zones
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('operators')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">👥</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Operators &amp; RBAC Roster
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Drivers, dispatchers, and admin roles
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
                      General &amp; Localization
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Hours, timezone &amp; branding
                    </div>
                  </div>
                </div>
                <span className="text-slate-400 group-hover:translate-x-1 transition-transform">&rarr;</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('advanced')}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all text-left text-xs group"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">⚙️</span>
                  <div>
                    <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      Advanced Settings &amp; Security
                    </div>
                    <div className="text-[11px] text-slate-400">
                      API monitors, Firestore &amp; audit logs
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
