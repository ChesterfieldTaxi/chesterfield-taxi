import React, { useState, useEffect } from 'react';
import type { Trip, TripStatus } from '../../../core/types/trip';
import { getBookingService } from '../../../core/services/booking';
import { getEmailDispatchService } from '../../../core/services/email';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { Input } from '../../ui/Input';
import {
  ClockIcon,
  CheckIcon,
  ShieldCheckIcon,
  CarIcon,
  UserIcon,
  SpinnerIcon,
} from '../../ui/Icons';

export function AdminBookingsTab() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Subscribe to real-time trips
  useEffect(() => {
    setIsLoading(true);
    const service = getBookingService();

    if (service.subscribeToAllTrips) {
      const unsub = service.subscribeToAllTrips(
        (updatedTrips) => {
          setTrips(updatedTrips);
          setIsLoading(false);
          // If selected trip is open, update it
          if (selectedTrip) {
            const fresh = updatedTrips.find((t) => t.id === selectedTrip.id);
            if (fresh) setSelectedTrip(fresh);
          }
        },
        (err) => {
          console.error('[AdminBookingsTab] Subscription error:', err);
          setError('Failed to subscribe to live Firestore bookings.');
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

        // Trigger passenger status update notification email if email is present
        const currentTrip = updated || trips.find((t) => t.id === tripId);
        if (currentTrip && currentTrip.passenger?.email) {
          try {
            const emailService = getEmailDispatchService();
            const formattedPickupTime = currentTrip.bookingType === 'scheduled' && currentTrip.scheduledPickupTime
              ? new Date(currentTrip.scheduledPickupTime).toLocaleString()
              : 'Immediate Ride (ASAP)';

            emailService.sendStatusUpdateNotification({
              tripId: currentTrip.id,
              passenger: {
                firstName: currentTrip.passenger.firstName,
                lastName: currentTrip.passenger.lastName,
                email: currentTrip.passenger.email,
                phone: currentTrip.passenger.phone,
              },
              newStatus,
              previousStatus: currentTrip.status,
              pickupAddress: currentTrip.pickupLocation.address,
              dropoffAddress: currentTrip.dropoffLocation.address,
              pickupTime: formattedPickupTime,
              vehicleTier: currentTrip.vehicleTier,
              driverInfo: options?.assignedDriverId ? {
                name: `Assigned Driver (ID: ${options.assignedDriverId})`,
              } : undefined,
              statusReason: options?.reason,
            }).catch((err) => {
              console.warn('[AdminBookingsTab] Non-blocking status notification warning:', err);
            });
          } catch (emailErr) {
            console.warn('[AdminBookingsTab] Failed to trigger status email notification:', emailErr);
          }
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to update trip status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Pending Dispatch</Badge>;
      case 'offered':
        return <Badge variant="info">Offered to Drivers</Badge>;
      case 'assigned':
        return <Badge variant="primary">Driver Assigned</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="neutral">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Filtered trips
  const filteredTrips = trips.filter((trip) => {
    if (statusFilter !== 'all' && trip.status !== statusFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const passengerName = `${trip.passenger.firstName} ${trip.passenger.lastName}`.toLowerCase();
      const phone = trip.passenger.phone.toLowerCase();
      const pickup = trip.pickupLocation.address.toLowerCase();
      const dropoff = trip.dropoffLocation.address.toLowerCase();
      const id = trip.id.toLowerCase();
      return (
        passengerName.includes(term) ||
        phone.includes(term) ||
        pickup.includes(term) ||
        dropoff.includes(term) ||
        id.includes(term)
      );
    }
    return true;
  });

  const countByStatus = (status: TripStatus) => trips.filter((t) => t.status === status).length;

  return (
    <div className="space-y-6">
      {actionSuccessMessage && (
        <Alert variant="success" title="Dispatch Updated">
          {actionSuccessMessage}
        </Alert>
      )}

      {error && (
        <Alert variant="error" title="Bookings Error">
          {error}
        </Alert>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Bookings', count: trips.length, filter: 'all', color: 'text-slate-900' },
          { label: 'Pending', count: countByStatus('pending'), filter: 'pending', color: 'text-amber-600' },
          { label: 'Offered', count: countByStatus('offered'), filter: 'offered', color: 'text-blue-600' },
          { label: 'Assigned', count: countByStatus('assigned'), filter: 'assigned', color: 'text-indigo-600' },
          { label: 'Completed', count: countByStatus('completed'), filter: 'completed', color: 'text-emerald-600' },
          { label: 'Cancelled', count: countByStatus('cancelled'), filter: 'cancelled', color: 'text-slate-400' },
        ].map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => setStatusFilter(kpi.filter)}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              statusFilter === kpi.filter
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white border-slate-200/80 hover:border-slate-300'
            }`}
          >
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider block ${
                statusFilter === kpi.filter ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              {kpi.label}
            </span>
            <span
              className={`text-2xl font-extrabold mt-1 block ${
                statusFilter === kpi.filter ? 'text-white' : kpi.color
              }`}
            >
              {kpi.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search passenger, phone, or address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {['all', 'pending', 'offered', 'assigned', 'completed', 'cancelled'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                statusFilter === tab
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List / Table */}
      <Card variant="elevated" className="border-slate-200 shadow-xs overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 py-3.5 px-6 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <CardTitle className="text-sm font-bold text-slate-900">
              Live Firestore Dispatch Queue
            </CardTitle>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Showing {filteredTrips.length} of {trips.length} total
          </span>
        </CardHeader>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <SpinnerIcon className="w-6 h-6 animate-spin text-amber-500" />
            <span className="text-xs">Loading bookings from Firestore...</span>
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CarIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">No bookings found</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your search query or status filter.'
                : 'Trips booked through the public portal will appear here in real time.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Trip ID / Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Passenger</th>
                  <th className="py-3 px-4">Route</th>
                  <th className="py-3 px-4">Vehicle / Fare</th>
                  <th className="py-3 px-4 text-right">Dispatch Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrips.map((trip) => {
                  const isActioning = actionLoadingId === trip.id;
                  const dateStr = new Date(trip.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={trip.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedTrip(trip)}
                          className="font-mono font-bold text-slate-900 hover:text-amber-600 underline block text-left"
                        >
                          #{trip.id.slice(-6)}
                        </button>
                        <span className="text-[10px] text-slate-400 block">{dateStr}</span>
                      </td>

                      <td className="py-3 px-4">{getStatusBadge(trip.status)}</td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {trip.passenger.firstName} {trip.passenger.lastName}
                        </div>
                        <div className="text-[11px] text-slate-500">{trip.passenger.phone}</div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="truncate font-medium text-slate-800" title={trip.pickupLocation.address}>
                          <span className="text-amber-600 font-bold mr-1">From:</span>
                          {trip.pickupLocation.address}
                        </div>
                        <div className="truncate text-slate-500" title={trip.dropoffLocation.address}>
                          <span className="text-indigo-600 font-bold mr-1">To:</span>
                          {trip.dropoffLocation.address}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold capitalize text-slate-800 block">
                          {trip.vehicleTier}
                        </span>
                        <span className="font-bold text-slate-950 text-amber-600">
                          ${trip.pricing.totalFare.toFixed(2)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        {trip.status === 'pending' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isLoading={isActioning}
                            onClick={() =>
                              handleStatusTransition(trip.id, 'offered', {
                                offeredToIds: ['driver_101', 'driver_102'],
                                reason: 'Broadcasted to area drivers',
                              })
                            }
                            className="text-blue-600 hover:bg-blue-50 border-blue-200"
                          >
                            Broadcast Offer
                          </Button>
                        )}

                        {(trip.status === 'pending' || trip.status === 'offered') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isLoading={isActioning}
                            onClick={() =>
                              handleStatusTransition(trip.id, 'assigned', {
                                assignedDriverId: 'driver_chesterfield_01',
                                reason: 'Driver assigned by dispatch operator',
                              })
                            }
                            className="text-indigo-600 hover:bg-indigo-50 border-indigo-200"
                          >
                            Assign Driver
                          </Button>
                        )}

                        {trip.status === 'assigned' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isLoading={isActioning}
                            onClick={() =>
                              handleStatusTransition(trip.id, 'completed', {
                                reason: 'Trip completed successfully',
                              })
                            }
                            className="text-emerald-600 hover:bg-emerald-50 border-emerald-200"
                          >
                            Complete Trip
                          </Button>
                        )}

                        {trip.status !== 'completed' && trip.status !== 'cancelled' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            isLoading={isActioning}
                            onClick={() =>
                              handleStatusTransition(trip.id, 'cancelled', {
                                reason: 'Cancelled by dispatch admin',
                              })
                            }
                            className="text-red-600 hover:bg-red-50 border-red-200"
                          >
                            Cancel
                          </Button>
                        )}

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setSelectedTrip(trip)}
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Trip Details Modal / Drawer */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Booking #{selectedTrip.id.slice(-8)}
                </h3>
                <span className="text-xs text-slate-400">
                  Created {new Date(selectedTrip.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {getStatusBadge(selectedTrip.status)}
                <button
                  type="button"
                  onClick={() => setSelectedTrip(null)}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm font-bold"
                >
                  &times;
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600">
              {/* Passenger & Routing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <h4 className="font-bold text-slate-900 mb-2">Passenger Information</h4>
                  <p className="font-semibold text-slate-800">
                    {selectedTrip.passenger.firstName} {selectedTrip.passenger.lastName}
                  </p>
                  <p>{selectedTrip.passenger.email}</p>
                  <p>{selectedTrip.passenger.phone}</p>
                  <p className="mt-2 text-slate-500">
                    {selectedTrip.passenger.passengerCount} passenger(s), {selectedTrip.passenger.luggageCount} bag(s)
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <h4 className="font-bold text-slate-900 mb-2">Pricing &amp; Payment</h4>
                  <p className="text-base font-extrabold text-slate-950 text-amber-600">
                    ${selectedTrip.pricing.totalFare.toFixed(2)} {selectedTrip.pricing.currency}
                  </p>
                  <p className="capitalize text-slate-700">Vehicle: {selectedTrip.vehicleTier}</p>
                  <p className="capitalize text-slate-700">Payment: {selectedTrip.payment.method} ({selectedTrip.payment.status})</p>
                  <p className="text-slate-500 mt-2">
                    Distance: {selectedTrip.pricing.distanceMiles.toFixed(1)} mi ({selectedTrip.pricing.durationMinutes.toFixed(0)} min)
                  </p>
                </div>
              </div>

              {/* Locations */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                <h4 className="font-bold text-slate-900">Trip Locations</h4>
                <div>
                  <span className="font-semibold text-amber-600">Pickup: </span>
                  {selectedTrip.pickupLocation.address}
                  {selectedTrip.pickupLocation.notes && (
                    <span className="text-slate-400 block text-[11px]">Note: {selectedTrip.pickupLocation.notes}</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-indigo-600">Dropoff: </span>
                  {selectedTrip.dropoffLocation.address}
                  {selectedTrip.dropoffLocation.notes && (
                    <span className="text-slate-400 block text-[11px]">Note: {selectedTrip.dropoffLocation.notes}</span>
                  )}
                </div>
              </div>

              {/* State Machine Status History Audit Log */}
              <div>
                <h4 className="font-bold text-slate-900 mb-3">Firestore State Machine Audit Log</h4>
                <div className="space-y-2">
                  {selectedTrip.statusHistory.map((history, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-start justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 uppercase">
                            {history.from || 'START'} &rarr; {history.to}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            by {history.actorRole || 'system'}
                          </span>
                        </div>
                        {history.reason && (
                          <p className="text-slate-500 mt-1">{history.reason}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {new Date(history.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Targeting Arrays */}
              {selectedTrip.offeredToIds && selectedTrip.offeredToIds.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <span className="font-bold text-blue-900">Broadcast Targeting (offeredToIds): </span>
                  <span className="font-mono text-blue-700">{selectedTrip.offeredToIds.join(', ')}</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTrip(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
