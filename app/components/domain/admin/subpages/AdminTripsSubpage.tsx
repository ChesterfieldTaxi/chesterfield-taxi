import React, { useState, useEffect } from 'react';
import type { Trip, TripStatus } from '../../../../core/types/trip';
import { getBookingService } from '../../../../core/services/booking';
import { getEmailDispatchService } from '../../../../core/services/email';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import { formatVehicleTier } from '../../../../core/services/email/email-templates';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Alert } from '../../../ui/Alert';
import {
  ClockIcon,
  SpinnerIcon,
  ActivityIcon,
  HistoryIcon,
  AlertTriangleIcon,
  DownloadIcon,
  CarIcon,
  CheckIcon,
  ChevronDownIcon,
  PhoneIcon,
  MailIcon,
  SearchIcon,
} from '../../../ui/Icons';
import { TripAuditModal } from '../TripAuditModal';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { UniversalArchiveDrawer, ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import { LayoutToggle } from '../../../ui/LayoutToggle';
import { useDisplayLayout } from '../../../../core/hooks/useDisplayLayout';

interface TripRowActionDropdownProps {
  trip: Trip;
  isSelected: boolean;
  isActionLoading: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onAssignDriver: () => void;
  onComplete: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAudit: () => void;
  onToggleDetails: () => void;
  isArchived: boolean;
  canArchive: boolean;
}

function TripRowActionDropdown({
  trip,
  isSelected,
  isActionLoading,
  isOpen,
  onToggle,
  onClose,
  onConfirm,
  onAssignDriver,
  onComplete,
  onArchive,
  onRestore,
  onAudit,
  onToggleDetails,
  isArchived,
  canArchive,
}: TripRowActionDropdownProps) {
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const canConfirm = trip.status === 'unconfirmed' || trip.status === 'UNCONFIRMED' || trip.status === 'pending';
  const canAssign = trip.status === 'CONFIRMED' || trip.status === 'confirmed';
  const canComplete = trip.status === 'assigned';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="px-2.5 py-1 rounded-lg border border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
        title="Trip Actions"
      >
        <span>Actions</span>
        <ChevronDownIcon className="w-3 h-3 text-slate-400" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
            Trip #{trip.id.slice(-6).toUpperCase()}
          </div>

          {canConfirm && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => {
                onClose();
                onConfirm();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>✓</span>
              <span>Confirm Trip</span>
            </button>
          )}

          {canAssign && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => {
                onClose();
                onAssignDriver();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-blue-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>👤</span>
              <span>Assign Driver</span>
            </button>
          )}

          {canComplete && (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={() => {
                onClose();
                onComplete();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>✓</span>
              <span>Complete Trip</span>
            </button>
          )}

          {isArchived ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRestore();
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
              <span>Restore from Archive</span>
            </button>
          ) : (
            canArchive && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onArchive();
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <ArchiveBoxIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Move to Archive</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onAudit();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-purple-50 text-purple-700 font-bold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <HistoryIcon className="w-3.5 h-3.5 text-purple-600" />
            <span>Audit Trail Log</span>
          </button>

          <div className="border-t border-slate-100 my-1" />

          <button
            type="button"
            onClick={() => {
              onClose();
              onToggleDetails();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-2 cursor-pointer transition-colors"
          >
            <span>{isSelected ? '✕' : 'ℹ️'}</span>
            <span>{isSelected ? 'Close Details' : 'View Full Details'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export type TripsSubTab = 'dispatch' | 'history' | 'archive' | 'exceptions';

interface AdminTripsSubpageProps {
  initialSubTab?: TripsSubTab;
}

export function AdminTripsSubpage({ initialSubTab = 'dispatch' }: AdminTripsSubpageProps) {
  const [displayLayout, setDisplayLayout] = useDisplayLayout('admin-trips-layout');
  const [activeSub, setActiveSub] = useState<TripsSubTab>(initialSubTab);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [auditModalTrip, setAuditModalTrip] = useState<Trip | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isArchiveDrawerOpen, setIsArchiveDrawerOpen] = useState(false);
  const [includeArchivedInHistory, setIncludeArchivedInHistory] = useState(false);
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0);
  const [openActionTripId, setOpenActionTripId] = useState<string | null>(null);

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
        const previousTrip = trips.find((t) => t.id === tripId);
        const previousStatus = previousTrip?.status || null;
        const updated = await service.updateTripStatus(tripId, newStatus, {
          ...options,
          actorRole: 'admin',
          reason: options?.reason || `Admin dispatch update to ${newStatus}`,
        });
        let mailStatus = '';
        // Route confirmation, decline, and status/cancellation transitions to the RIGHT email template!
        const currentTrip = updated || previousTrip;
        if (currentTrip && currentTrip.passenger?.email) {
          try {
            const emailService = getEmailDispatchService();
            const cachedSettings = getAdminConfigService().getCachedSettings();
            const meta = (currentTrip.metadata || {}) as Record<string, any>;
            const resolvedVehName = formatVehicleTier(
              currentTrip.vehicleTier || 'standard',
              cachedSettings.vehicles,
              typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName : undefined
            );
            const formattedPickupTime =
              currentTrip.bookingType === 'scheduled' && currentTrip.scheduledPickupTime
                ? new Date(currentTrip.scheduledPickupTime).toLocaleString()
                : 'Immediate Ride (ASAP)';
            const companySettings = {
              name: cachedSettings.company?.name,
              phone: cachedSettings.company?.phone,
              address: cachedSettings.company?.address,
              email: cachedSettings.company?.email,
            };

            let sendResult;
            if (newStatus === 'CONFIRMED' || newStatus === 'confirmed') {
              sendResult = await emailService.sendBookingConfirmation({
                tripId: currentTrip.id,
                trackingToken: currentTrip.trackingToken,
                status: 'CONFIRMED',
                passenger: {
                  firstName: currentTrip.passenger?.firstName || 'Valued',
                  lastName: currentTrip.passenger?.lastName || 'Customer',
                  email: currentTrip.passenger?.email || '',
                  phone: currentTrip.passenger?.phone || '',
                },
                pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
                intermediateStops: currentTrip.intermediateStops?.map((s) => ({ address: s.address, notes: s.notes })),
                dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
                dropoffNotes: currentTrip.dropoffLocation?.notes,
                pickupTime: formattedPickupTime,
                bookingType: currentTrip.bookingType || 'scheduled',
                vehicleTier: currentTrip.vehicleTier || 'standard',
                vehicleDisplayName: resolvedVehName,
                passengerCount: currentTrip.passenger?.passengerCount,
                luggageCount: currentTrip.passenger?.luggageCount,
                totalFare: currentTrip.pricing?.totalFare || 0,
                breakdown: currentTrip.pricing?.breakdown,
                tariffProfileName:
                  currentTrip.pricing?.matchedCorridorName || currentTrip.pricing?.tariffProfileName,
                currency: currentTrip.pricing?.currency || 'USD',
                paymentMethod: currentTrip.payment?.method || 'cash',
                specialRequests: currentTrip.passenger?.specialRequests,
                companySettings,
              });
            } else if (newStatus === 'DECLINED' || newStatus === 'declined') {
              sendResult = await emailService.sendBookingDeclined({
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
                vehicleTier: currentTrip.vehicleTier || 'standard',
                vehicleDisplayName: resolvedVehName,
                reason: options?.reason || 'Unable to accommodate request',
                companySettings,
              });
            } else {
              sendResult = await emailService.sendStatusUpdateNotification({
                tripId: currentTrip.id,
                trackingToken: currentTrip.trackingToken,
                passenger: {
                  firstName: currentTrip.passenger?.firstName || 'Valued',
                  lastName: currentTrip.passenger?.lastName || 'Customer',
                  email: currentTrip.passenger?.email || '',
                  phone: currentTrip.passenger?.phone || '',
                },
                newStatus,
                previousStatus,
                pickupAddress: currentTrip.pickupLocation?.address || 'Pickup Address',
                dropoffAddress: currentTrip.dropoffLocation?.address || 'Dropoff Address',
                pickupTime: formattedPickupTime,
                vehicleTier: currentTrip.vehicleTier || 'standard',
                vehicleDisplayName: resolvedVehName,
                statusReason: options?.reason,
                companySettings,
              });
            }

            if (sendResult?.success) {
              mailStatus = ` Notification email sent to ${currentTrip.passenger.email}.`;
            } else if (sendResult?.error) {
              mailStatus = ` (Email error: ${sendResult.error})`;
            }
          } catch (mailErr: any) {
            console.warn('[AdminTripsSubpage] Email trigger warning:', mailErr);
            mailStatus = ` (Email delivery offline: ${mailErr?.message || 'Check RESEND_API_KEY'})`;
          }
        }

        const friendlyStatus = newStatus === 'CONFIRMED' || newStatus === 'confirmed' ? 'Confirmed & Accepted' : newStatus;
        setActionSuccessMessage(`✓ Trip #${tripId.slice(-6)} successfully ${friendlyStatus}.${mailStatus}`);
        setTimeout(() => setActionSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      console.error('[AdminTripsSubpage] Transition error:', err);
      setError(err.message || 'Failed to update trip status.');
    } finally {
      setActionLoadingId(null);
    }
  };


  const govService = getUniversalGovernanceService();
  const isArchivedTrip = (t: Trip) => !!t.isArchived || govService.isTripArchived(t.id);

  const handleToggleArchiveTrip = async (tripId: string, currentArchiveState: boolean) => {
    try {
      setActionLoadingId(tripId);
      const gov = getUniversalGovernanceService();
      await gov.setArchiveStatus('trip', tripId, !currentArchiveState);

      setTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, isArchived: !currentArchiveState } : t))
      );
      if (selectedTrip?.id === tripId) {
        setSelectedTrip((prev) => (prev ? { ...prev, isArchived: !currentArchiveState } : null));
      }
      setArchiveRefreshKey((k) => k + 1);
      setActionSuccessMessage(
        !currentArchiveState
          ? `✓ Trip #${tripId.slice(-6)} moved to archive.`
          : `✓ Trip #${tripId.slice(-6)} restored from archive.`
      );
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(`Failed to update archive status: ${err.message || String(err)}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered lists adhering to TripStatus
  const activeDispatchTrips = trips.filter(
    (t) =>
      !isArchivedTrip(t) &&
      (t.status === 'unconfirmed' ||
        t.status === 'UNCONFIRMED' ||
        t.status === 'pending' ||
        t.status === 'confirmed' ||
        t.status === 'CONFIRMED' ||
        t.status === 'assigned' ||
        t.status === 'offered')
  );

  const archivedTrips = trips.filter((t) => isArchivedTrip(t));

  const historyTrips = trips.filter((t) =>
    includeArchivedInHistory ? true : !isArchivedTrip(t)
  );

  const exceptionTrips = trips.filter(
    (t) =>
      !isArchivedTrip(t) &&
      (t.status === 'cancelled' ||
        t.status === 'declined' ||
        t.status === 'DECLINED' ||
        (t.driverNotes && t.driverNotes.toLowerCase().includes('no-show')))
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
      : activeSub === 'archive'
      ? filterBySearch(archivedTrips)
      : activeSub === 'history'
      ? filterBySearch(
          statusFilter === 'all'
            ? historyTrips
            : historyTrips.filter((t) => t.status === statusFilter)
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
    <div className="space-y-4">
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

      {/* ─── Single Unified Trips Toolbar ─── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="w-full sm:w-80 relative">
            <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search passenger, phone, address, trip ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-hidden"
            />
          </div>

          {activeSub === 'history' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-hidden"
            >
              <option value="all">All Lifecycles ({trips.length})</option>
              <option value="completed">Completed Only</option>
              <option value="cancelled">Cancelled Only</option>
              <option value="assigned">Assigned / In Progress</option>
              <option value="pending">Pending</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-2 justify-between lg:justify-end shrink-0">
          <LayoutToggle
            layout={displayLayout}
            onChange={setDisplayLayout}
            size="sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
            <span>CSV</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportJSON}
            className="text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <DownloadIcon className="w-3.5 h-3.5 shrink-0" />
            <span>JSON</span>
          </Button>
        </div>
      </div>

      {/* ─── Trips Content (Cards vs Compact vs Table) ─── */}
      <Card variant="elevated" className="border-slate-200/80 bg-white shadow-xs overflow-hidden">
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
        ) : displayLayout === 'cards' ? (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50">
            {currentDisplayTrips.map((trip) => {
              const isSelected = selectedTrip?.id === trip.id;
              const isActionLoading = actionLoadingId === trip.id;
              const passengerFullName =
                [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
                'Anonymous Guest';
              const pickupTimeStr =
                trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                  ? new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'ASAP Now';

              return (
                <div
                  key={trip.id}
                  onClick={() => setSelectedTrip(isSelected ? null : trip)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer bg-white flex flex-col justify-between shadow-2xs ${
                    isSelected ? 'border-blue-500 ring-2 ring-blue-400' : 'border-slate-200 hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-900">
                          #{trip.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {pickupTimeStr}
                        </span>
                      </div>
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
                    </div>

                    <div className="mb-3">
                      <div className="font-bold text-xs text-slate-900">{passengerFullName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{trip.passenger?.phone || 'No phone'}</div>
                      {trip.passenger?.email && (
                        <div className="text-[10px] text-blue-600 truncate">{trip.passenger.email}</div>
                      )}
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl mb-3">
                      <div className="flex items-start gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />
                        <span className="truncate font-medium" title={trip.pickupLocation?.address}>
                          {trip.pickupLocation?.address || 'Pickup address'}
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-rose-500 font-bold text-xs">🔴</span>
                        <span className="truncate font-medium" title={trip.dropoffLocation?.address}>
                          {trip.dropoffLocation?.address || 'Dropoff address'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 mb-3 px-1">
                      <span className="capitalize font-bold text-slate-700">
                        {trip.vehicleTier || 'standard'} ({trip.passenger?.passengerCount || 1} Pax)
                      </span>
                      {trip.assignedDriverId ? (
                        <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                          Driver: {trip.assignedDriverId}
                        </span>
                      ) : (
                        <span className="text-[10px] text-amber-600 font-semibold">Unassigned</span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-black text-slate-900 text-sm">
                        ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 capitalize block">
                        {trip.payment?.method || 'Card'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                      {(trip.status === 'unconfirmed' || trip.status === 'UNCONFIRMED' || trip.status === 'pending') && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={isActionLoading}
                          onClick={() => handleStatusTransition(trip.id, 'CONFIRMED')}
                          className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                        >
                          Confirm
                        </Button>
                      )}

                      <TripRowActionDropdown
                        trip={trip}
                        isSelected={isSelected}
                        isActionLoading={isActionLoading}
                        isOpen={openActionTripId === trip.id}
                        onToggle={() => setOpenActionTripId(openActionTripId === trip.id ? null : trip.id)}
                        onClose={() => setOpenActionTripId(null)}
                        onConfirm={() => handleStatusTransition(trip.id, 'CONFIRMED')}
                        onAssignDriver={() => handleStatusTransition(trip.id, 'assigned', { assignedDriverId: 'driver-101' })}
                        onComplete={() => handleStatusTransition(trip.id, 'completed')}
                        onArchive={() => handleToggleArchiveTrip(trip.id, false)}
                        onRestore={() => handleToggleArchiveTrip(trip.id, true)}
                        onAudit={() => setAuditModalTrip(trip)}
                        onToggleDetails={() => setSelectedTrip(isSelected ? null : trip)}
                        isArchived={isArchivedTrip(trip)}
                        canArchive={
                          trip.status === 'completed' ||
                          trip.status === 'cancelled' ||
                          trip.status === 'declined' ||
                          trip.status === 'DECLINED' ||
                          activeSub === 'history'
                        }
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : displayLayout === 'compact' ? (
          <div className="divide-y divide-slate-100 text-xs">
            {currentDisplayTrips.map((trip) => {
              const isSelected = selectedTrip?.id === trip.id;
              const passengerFullName =
                [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') ||
                'Anonymous Guest';
              const pickupTimeStr =
                trip.bookingType === 'scheduled' && trip.scheduledPickupTime
                  ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'ASAP';

              return (
                <div
                  key={trip.id}
                  onClick={() => setSelectedTrip(isSelected ? null : trip)}
                  className={`h-10 px-4 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 font-medium' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono font-bold text-slate-800 text-[11px] w-14 shrink-0">
                      #{trip.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-slate-500 font-semibold text-[11px] w-16 shrink-0">
                      {pickupTimeStr}
                    </span>
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">
                      {passengerFullName}
                    </span>
                    <span className="text-slate-500 truncate max-w-[220px]" title={`${trip.pickupLocation?.address} → ${trip.dropoffLocation?.address}`}>
                      {trip.pickupLocation?.address || 'Pickup'} → {trip.dropoffLocation?.address || 'Dropoff'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <span className="font-bold text-slate-900">
                      ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
                    </span>
                    <Badge
                      variant={
                        trip.status === 'completed'
                          ? 'success'
                          : trip.status === 'cancelled' || trip.status === 'declined'
                          ? 'error'
                          : 'primary'
                      }
                      size="sm"
                      className="font-bold text-[10px]"
                    >
                      {trip.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedTrip(isSelected ? null : trip)}
                      className="text-[10px] px-2 py-0.5 text-slate-600 font-bold"
                    >
                      {isSelected ? 'Close' : 'Details'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar min-w-full">
            <table className="w-full text-left border-collapse text-xs min-w-[850px]">
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
                        {isArchivedTrip(trip) && (
                          <span className="block mt-1">
                            <Badge variant="neutral" size="sm" className="text-[9px] font-bold">
                              ARCHIVED
                            </Badge>
                          </span>
                        )}
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
                          {(trip.status === 'unconfirmed' || trip.status === 'UNCONFIRMED' || trip.status === 'pending') && (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={isActionLoading}
                              onClick={() => handleStatusTransition(trip.id, 'CONFIRMED')}
                              className="text-[11px] px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              Confirm
                            </Button>
                          )}

                          <TripRowActionDropdown
                            trip={trip}
                            isSelected={isSelected}
                            isActionLoading={isActionLoading}
                            isOpen={openActionTripId === trip.id}
                            onToggle={() => setOpenActionTripId(openActionTripId === trip.id ? null : trip.id)}
                            onClose={() => setOpenActionTripId(null)}
                            onConfirm={() => handleStatusTransition(trip.id, 'CONFIRMED')}
                            onAssignDriver={() => handleStatusTransition(trip.id, 'assigned', { assignedDriverId: 'driver-101' })}
                            onComplete={() => handleStatusTransition(trip.id, 'completed')}
                            onArchive={() => handleToggleArchiveTrip(trip.id, false)}
                            onRestore={() => handleToggleArchiveTrip(trip.id, true)}
                            onAudit={() => setAuditModalTrip(trip)}
                            onToggleDetails={() => setSelectedTrip(isSelected ? null : trip)}
                            isArchived={isArchivedTrip(trip)}
                            canArchive={
                              trip.status === 'completed' ||
                              trip.status === 'cancelled' ||
                              trip.status === 'declined' ||
                              trip.status === 'DECLINED' ||
                              activeSub === 'history'
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ─── Selected Trip Slide-Over Drawer ─── */}
      <AdminSlideOverDrawer
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title={selectedTrip ? `Trip #${selectedTrip.id.toUpperCase()}` : ''}
        subtitle="Full dispatch itinerary, passenger details, and lifecycle controls"
        headerBadge={
          selectedTrip ? (
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
          ) : undefined
        }
        footer={
          selectedTrip ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAuditModalTrip(selectedTrip)}
                className="text-xs font-semibold inline-flex items-center gap-1.5 mr-auto"
              >
                <HistoryIcon className="w-3.5 h-3.5 text-purple-600" />
                <span>Audit Trail</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStatusTransition(selectedTrip.id, 'confirmed')}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleStatusTransition(selectedTrip.id, 'completed')}
              >
                Mark Completed
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() =>
                  handleStatusTransition(selectedTrip.id, 'cancelled', {
                    reason: 'Admin cancelled from console',
                  })
                }
              >
                Cancel
              </Button>
            </>
          ) : undefined
        }
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-2">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Passenger &amp; Contact
              </h4>
              <p className="text-sm font-bold text-slate-900">
                {[selectedTrip.passenger?.firstName, selectedTrip.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}
              </p>
              <p className="text-slate-600 flex items-center gap-1.5">
                <PhoneIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedTrip.passenger?.phone || 'No phone'}</span>
              </p>
              <p className="text-slate-600 flex items-center gap-1.5">
                <MailIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{selectedTrip.passenger?.email || 'No email'}</span>
              </p>
              {(selectedTrip.passenger?.specialRequests || selectedTrip.driverNotes) && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500">Special Notes</p>
                  <p className="text-slate-700 mt-0.5">
                    {selectedTrip.passenger?.specialRequests || selectedTrip.driverNotes}
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-2.5">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Route Itinerary
              </h4>
              <div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase block">Pickup</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedTrip.pickupLocation?.address}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-rose-600 uppercase block">Dropoff</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedTrip.dropoffLocation?.address}</p>
              </div>
              {selectedTrip.pricing?.distanceMiles && (
                <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                  Distance: {selectedTrip.pricing.distanceMiles.toFixed(1)} miles (~{selectedTrip.pricing.durationMinutes || 0} mins)
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/90 space-y-2">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Financial Summary
              </h4>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Total Upfront Fare</span>
                <span className="font-extrabold text-slate-950 text-base font-mono">
                  ${Number(selectedTrip.pricing?.totalFare || selectedTrip.payment?.amount || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>Payment Method</span>
                <span className="font-semibold capitalize text-slate-700">
                  {selectedTrip.payment?.method || 'Card'}
                </span>
              </div>
            </div>
          </div>
        )}
      </AdminSlideOverDrawer>

      {/* Trip Audit Trail Inspector Modal */}
      {auditModalTrip && (
        <TripAuditModal
          trip={auditModalTrip}
          onClose={() => setAuditModalTrip(null)}
        />
      )}

      {isArchiveDrawerOpen && (
        <UniversalArchiveDrawer
          isOpen={isArchiveDrawerOpen}
          onClose={() => setIsArchiveDrawerOpen(false)}
          onEntityRestored={() => setArchiveRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
