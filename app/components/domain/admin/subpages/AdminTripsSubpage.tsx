import React, { useState, useEffect } from 'react';
import type { Trip, TripStatus } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getEmailDispatchService } from '../../../../core/services/email';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  ClockIcon,
  SpinnerIcon,
} from '../../../ui/Icons';

export type TripsSubTab = 'dispatch' | 'history' | 'exceptions';

interface AdminTripsSubpageProps {
  initialSubTab?: TripsSubTab;
}

export function AdminTripsSubpage({ initialSubTab = 'dispatch' }: AdminTripsSubpageProps) {
  const [activeSub, setActiveSub] = useState<TripsSubTab>(initialSubTab);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Sync initialSubTab when parent tab query changes
  useEffect(() => {
    setActiveSub(initialSubTab);
  }, [initialSubTab]);

  // Subscribe to real-time trips
  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();

    if (service.subscribeToAllTrips) {
      const unsub = service.subscribeToAllTrips(
        (updatedTrips) => {
          setTrips(updatedTrips);
          setIsLoading(false);
          if (selectedTrip) {
            const fresh = updatedTrips.find((t) => t.id === selectedTrip.id);
            if (fresh) setSelectedTrip(fresh);
          }
        },
        (err) => {
          console.warn('[AdminTripsSubpage] Subscription warning:', err);
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
        .catch((err) => {
          setError(err.message || 'Failed to fetch bookings.');
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [selectedTrip]);

  const handleStatusTransition = async (
    tripId: string,
    newStatus: TripStatus,
    options?: { assignedDriverId?: string; offeredToIds?: string[]; reason?: string }
  ) => {
    try {
      setActionLoadingId(tripId);
      setActionSuccessMessage(null);
      const service = getBookingService();

      if (service.updateTripStatus) {
        const updated = await service.updateTripStatus(tripId, newStatus, {
          ...options,
          actorRole: 'admin',
          reason: options?.reason || `Admin dispatch update to ${newStatus}`,
        });
        setActionSuccessMessage(`Trip #${tripId.slice(-6)} transitioned to ${newStatus}.`);
        setTimeout(() => setActionSuccessMessage(null), 3000);
        if (selectedTrip?.id === tripId) {
          setSelectedTrip(updated);
        }

        // Trigger passenger status notification email if available
        const currentTrip = updated || trips.find((t) => t.id === tripId);
        if (currentTrip && currentTrip.passenger?.email) {
          try {
            const emailService = getEmailDispatchService();
            const formattedPickupTime =
              currentTrip.bookingType === 'scheduled' && currentTrip.scheduledPickupTime
                ? new Date(currentTrip.scheduledPickupTime).toLocaleString()
                : 'Immediate Ride (ASAP)';

            await emailService.sendBookingConfirmation({
              tripId: currentTrip.id,
              passenger: {
                firstName: currentTrip.passenger?.firstName || 'Valued',
                lastName: currentTrip.passenger?.lastName || 'Customer',
                email: currentTrip.passenger?.email || '',
                phone: currentTrip.passenger?.phone || '',
              },
              pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
              dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
              pickupTime: formattedPickupTime,
              bookingType: currentTrip.bookingType || 'scheduled',
              vehicleTier: currentTrip.vehicleTier || 'standard',
              totalFare: currentTrip.pricing?.totalFare || 0,
              currency: 'USD',
              paymentMethod: currentTrip.payment?.method || 'card',
            });
          } catch (mailErr) {
            console.warn('[AdminTripsSubpage] Email trigger warning:', mailErr);
          }
        }
      }
    } catch (err: any) {
      console.error('[AdminTripsSubpage] Transition error:', err);
      setError(err.message || 'Failed to update trip status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered lists adhering to TripStatus
  const activeDispatchTrips = trips.filter(
    (t) =>
      t.status === 'unconfirmed' ||
      t.status === 'UNCONFIRMED' ||
      t.status === 'pending' ||
      t.status === 'confirmed' ||
      t.status === 'CONFIRMED' ||
      t.status === 'assigned' ||
      t.status === 'offered'
  );

  const exceptionTrips = trips.filter(
    (t) =>
      t.status === 'cancelled' ||
      t.status === 'declined' ||
      t.status === 'DECLINED' ||
      (t.driverNotes && t.driverNotes.toLowerCase().includes('no-show'))
  );

  const filterBySearch = (list: Trip[]) => {
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (t) =>
        t.id.toLowerCase().includes(term) ||
        (t.passenger?.firstName || '').toLowerCase().includes(term) ||
        (t.passenger?.lastName || '').toLowerCase().includes(term) ||
        (t.passenger?.phone || '').toLowerCase().includes(term) ||
        (t.passenger?.email || '').toLowerCase().includes(term) ||
        (t.pickupLocation?.address || '').toLowerCase().includes(term) ||
        (t.dropoffLocation?.address || '').toLowerCase().includes(term) ||
        (t.assignedDriverId || '').toLowerCase().includes(term)
    );
  };

  const currentDisplayTrips =
    activeSub === 'dispatch'
      ? filterBySearch(activeDispatchTrips)
      : activeSub === 'history'
      ? filterBySearch(
          statusFilter === 'all'
            ? trips
            : trips.filter((t) => t.status === statusFilter)
        )
      : filterBySearch(exceptionTrips);

  // Export handlers
  const handleExportCSV = () => {
    const headers = ['Trip ID', 'Status', 'Date', 'Passenger', 'Phone', 'Pickup', 'Dropoff', 'Vehicle', 'Fare'];
    const rows = trips.map((t) => [
      t.id,
      t.status,
      t.scheduledPickupTime || '',
      `"${[t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}"`,
      `"${t.passenger?.phone || ''}"`,
      `"${(t.pickupLocation?.address || '').replace(/"/g, '""')}"`,
      `"${(t.dropoffLocation?.address || '').replace(/"/g, '""')}"`,
      t.vehicleTier || '',
      t.pricing?.totalFare || 0,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `chesterfield_trips_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(trips, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `chesterfield_trips_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* ─── Sub-Navigation Pills ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSub('dispatch')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'dispatch'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>🚨 Active Dispatch Queue</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'dispatch' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {activeDispatchTrips.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('history')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>📜 Trip History & Search</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'history' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {trips.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSub('exceptions')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
              activeSub === 'exceptions'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <span>⚠️ Exceptions & Cancellations</span>
            <span
              className={`text-[11px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeSub === 'exceptions' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {exceptionTrips.length}
            </span>
          </button>
        </div>

        {/* Global Export Tools */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs font-bold"
          >
            📥 Export CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            className="text-xs font-bold"
          >
            📋 Export JSON
          </Button>
        </div>
      </div>

      {actionSuccessMessage && (
        <Alert variant="success" className="animate-in fade-in text-xs font-semibold">
          {actionSuccessMessage}
        </Alert>
      )}

      {error && (
        <Alert variant="error" className="animate-in fade-in text-xs">
          {error}
        </Alert>
      )}

      {/* ─── Search & Filters Bar ─── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="w-full sm:w-96 relative">
          <input
            type="text"
            placeholder="Search passenger, phone, email, address, trip ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-hidden"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>

        {activeSub === 'history' && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">Filter Status:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800"
            >
              <option value="all">All Lifecycles</option>
              <option value="completed">Completed Only</option>
              <option value="cancelled">Cancelled Only</option>
              <option value="assigned">Assigned / In Progress</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        )}
      </div>

      {/* ─── Trips Table ─── */}
      <Card variant="elevated" className="border-slate-200/80 bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <SpinnerIcon className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs font-medium">Streaming dispatch operations...</p>
            </div>
          ) : currentDisplayTrips.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-3xl mb-2">🚕</p>
              <p className="text-sm font-bold text-slate-700">No trips matching this view</p>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm ? 'Try adjusting your search query' : 'Dispatch queue is currently clear.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Trip ID &amp; Time</th>
                  <th className="px-4 py-3">Passenger</th>
                  <th className="px-4 py-3">Locations</th>
                  <th className="px-4 py-3">Class &amp; Vehicle</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Fare</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentDisplayTrips.map((trip) => {
                  const isSelected = selectedTrip?.id === trip.id;
                  const isActionLoading = actionLoadingId === trip.id;
                  const passengerFullName =
                    [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
                    'Anonymous Guest';

                  return (
                    <tr
                      key={trip.id}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : ''
                      }`}
                    >
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block">
                          #{trip.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <ClockIcon className="w-3 h-3 text-slate-400" />
                          {trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                            ? new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'ASAP Now'}
                        </span>
                      </td>

                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-bold text-slate-800 block">
                          {passengerFullName}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {trip.passenger?.phone || 'No phone'}
                        </span>
                        {trip.passenger?.email && (
                          <span className="text-[10px] text-blue-600 block truncate max-w-[150px]">
                            {trip.passenger.email}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top min-w-[220px]">
                        <div className="flex items-start gap-1.5">
                          <span className="text-emerald-500 font-bold text-xs mt-0.5">🟢</span>
                          <span className="text-slate-800 font-medium line-clamp-1">
                            {trip.pickupLocation?.address || 'Pickup address'}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 mt-1">
                          <span className="text-rose-500 font-bold text-xs mt-0.5">🔴</span>
                          <span className="text-slate-800 font-medium line-clamp-1">
                            {trip.dropoffLocation?.address || 'Dropoff address'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-bold text-slate-700 capitalize block">
                          {trip.vehicleTier || 'standard'}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {trip.passenger?.passengerCount || 1} Pax • {trip.passenger?.luggageCount || 0} Bags
                        </span>
                        {trip.assignedDriverId && (
                          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-block">
                            Driver: {trip.assignedDriverId}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <Badge
                          variant={
                            trip.status === 'completed'
                              ? 'success'
                              : trip.status === 'cancelled' || trip.status === 'declined' || trip.status === 'DECLINED'
                              ? 'error'
                              : trip.status === 'assigned' || trip.status === 'offered'
                              ? 'primary'
                              : trip.status === 'confirmed' || trip.status === 'CONFIRMED'
                              ? 'info'
                              : 'warning'
                          }
                          size="sm"
                          className="font-bold uppercase tracking-wider text-[10px]"
                        >
                          {trip.status.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-black text-slate-900 text-xs block">
                          ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 capitalize block">
                          {trip.payment?.method || 'Card'}
                        </span>
                      </td>

                      <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Dispatch Actions based on state machine */}
                          {trip.status === 'unconfirmed' || trip.status === 'UNCONFIRMED' || trip.status === 'pending' ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isActionLoading}
                              onClick={() => handleStatusTransition(trip.id, 'CONFIRMED')}
                              className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              Confirm
                            </Button>
                          ) : trip.status === 'CONFIRMED' || trip.status === 'confirmed' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActionLoading}
                              onClick={() => handleStatusTransition(trip.id, 'assigned', { assignedDriverId: 'driver-101' })}
                              className="text-[11px] px-2.5 py-1 text-blue-700 border-blue-300 font-bold"
                            >
                              Assign Driver
                            </Button>
                          ) : trip.status === 'assigned' ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isActionLoading}
                              onClick={() => handleStatusTransition(trip.id, 'completed')}
                              className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              Complete
                            </Button>
                          ) : null}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedTrip(isSelected ? null : trip)}
                            className="text-[11px] px-2 py-1 text-slate-600 hover:text-slate-900 font-bold"
                          >
                            {isSelected ? 'Close' : 'Details'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* ─── Selected Trip Drawer / Modal Details ─── */}
      {selectedTrip && (
        <Card variant="elevated" className="border-2 border-blue-500/40 bg-white shadow-lg animate-in slide-in-from-bottom-2">
          <CardHeader className="p-5 border-b border-slate-200/80 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>Trip Details: #{selectedTrip.id.toUpperCase()}</span>
                <Badge
                  variant={
                    selectedTrip.status === 'completed'
                      ? 'success'
                      : selectedTrip.status === 'cancelled'
                      ? 'error'
                      : 'warning'
                  }
                  size="sm"
                >
                  {selectedTrip.status}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Full dispatch itinerary and audit overview
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedTrip(null)}
              className="text-xs font-bold"
            >
              ✕ Close
            </Button>
          </CardHeader>

          <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Passenger &amp; Booker
              </h4>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
                <p className="font-bold text-slate-900">
                  {[selectedTrip.passenger?.firstName, selectedTrip.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}
                </p>
                <p className="text-slate-600">📞 {selectedTrip.passenger?.phone || 'No phone'}</p>
                <p className="text-slate-600">✉️ {selectedTrip.passenger?.email || 'No email'}</p>
                {(selectedTrip.passenger?.specialRequests || selectedTrip.driverNotes) && (
                  <div className="pt-1.5 border-t border-slate-200">
                    <p className="text-[11px] font-semibold text-slate-500">Special Notes:</p>
                    <p className="text-[11px] text-slate-700">
                      {selectedTrip.passenger?.specialRequests || selectedTrip.driverNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Route Itinerary
              </h4>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase block">Pickup</span>
                  <p className="font-semibold text-slate-800">{selectedTrip.pickupLocation?.address}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-rose-600 uppercase block">Dropoff</span>
                  <p className="font-semibold text-slate-800">{selectedTrip.dropoffLocation?.address}</p>
                </div>
                {selectedTrip.pricing?.distanceMiles && (
                  <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                    Route: {selectedTrip.pricing.distanceMiles.toFixed(1)} miles (~{selectedTrip.pricing.durationMinutes || 0} mins)
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Financials & Status Actions
              </h4>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Total Upfront Fare:</span>
                  <span className="font-black text-slate-900 text-sm">
                    ${Number(selectedTrip.pricing?.totalFare || selectedTrip.payment?.amount || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-slate-500">
                  <span>Payment Method:</span>
                  <span className="font-semibold capitalize">{selectedTrip.payment?.method || 'Card'}</span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusTransition(selectedTrip.id, 'confirmed')}
                    className="text-[10px] font-bold flex-1"
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusTransition(selectedTrip.id, 'completed')}
                    className="text-[10px] font-bold flex-1 bg-emerald-50 text-emerald-700 border-emerald-300"
                  >
                    Complete
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatusTransition(selectedTrip.id, 'cancelled', { reason: 'Admin cancelled from console' })}
                    className="text-[10px] font-bold flex-1 bg-rose-50 text-rose-700 border-rose-300"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
