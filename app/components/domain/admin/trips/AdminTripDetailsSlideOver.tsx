import React from 'react';
import type { Trip } from '../../../../core/types/trip';
import type { DispatchAutomationConfig } from '../../../../core/types/config';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import {
  canAdminCompleteTrip,
  type ClassifiedAdminTripException,
} from '../../../../core/utils/admin-trips-exceptions.util';
import { getTripCascadeExhaustedTooltip } from '../../dispatch/DispatchCascadeSlaBadges';
import { DriverAssignDropdown } from '../../dispatch/queue/DriverAssignDropdown';
import { AdminSlideOverDrawer } from '../AdminSlideOverDrawer';
import { ArchiveBoxIcon } from '../UniversalArchiveDrawer';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { CheckIcon, HistoryIcon, MailIcon, PhoneIcon, XIcon } from '../../../ui/Icons';

export interface AdminTripDetailsSlideOverProps {
  trip: Trip | null;
  drivers: DriverRosterItem[];
  dispatchAutomation?: DispatchAutomationConfig;
  exception?: ClassifiedAdminTripException;
  assignMode: 'send_to_driver' | 'stage_hold';
  onAssignModeChange: (mode: 'send_to_driver' | 'stage_hold') => void;
  isArchived: boolean;
  isBusy: boolean;
  onClose: () => void;
  onDriverDropdownChange: (trip: Trip, driverId: string) => void;
  onSendStaged: (trip: Trip) => void;
  onClearStaged: (trip: Trip) => void;
  onResolveGuestChangeRequest: (trip: Trip, decision: 'approve' | 'decline') => void;
  onConfirmTrip: (trip: Trip) => void;
  onCompleteTrip: (trip: Trip) => void;
  onCancelTrip: (trip: Trip) => void;
  onAuditTrip: (trip: Trip) => void;
  onToggleArchive: (trip: Trip, currentlyArchived: boolean) => void;
}

export function AdminTripDetailsSlideOver({
  trip,
  drivers,
  dispatchAutomation,
  exception,
  assignMode,
  onAssignModeChange,
  isArchived,
  isBusy,
  onClose,
  onDriverDropdownChange,
  onSendStaged,
  onClearStaged,
  onResolveGuestChangeRequest,
  onConfirmTrip,
  onCompleteTrip,
  onCancelTrip,
  onAuditTrip,
  onToggleArchive,
}: AdminTripDetailsSlideOverProps) {
  const isTerminal =
    trip?.status === 'completed' ||
    trip?.status === 'cancelled' ||
    trip?.status === 'declined' ||
    trip?.status === 'DECLINED';

  const canConfirm =
    trip?.status === 'unconfirmed' ||
    trip?.status === 'UNCONFIRMED' ||
    trip?.status === 'pending';

  return (
    <AdminSlideOverDrawer
      isOpen={Boolean(trip)}
      onClose={onClose}
      title={trip ? `Trip #${trip.id.slice(-8).toUpperCase()}` : ''}
      subtitle="Full dispatch itinerary, driver assignment/staging, rider requests & lifecycle controls"
      headerBadge={
        trip ? (
          <Badge
            variant={
              trip.status === 'completed'
                ? 'success'
                : trip.status === 'cancelled' || trip.status === 'declined'
                ? 'error'
                : 'primary'
            }
            size="sm"
          >
            {trip.status.replace('_', ' ')}
          </Badge>
        ) : undefined
      }
      footer={
        trip ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAuditTrip(trip)}
              className="text-xs font-semibold inline-flex items-center gap-1.5 mr-auto"
            >
              <HistoryIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>Audit Trail</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => onToggleArchive(trip, isArchived)}
              className="text-xs font-semibold inline-flex items-center gap-1"
            >
              <ArchiveBoxIcon className="w-3.5 h-3.5 text-fg-muted" />
              <span>{isArchived ? 'Restore' : 'Archive'}</span>
            </Button>

            {canConfirm && (
              <Button
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => onConfirmTrip(trip)}
              >
                Confirm
              </Button>
            )}

            {canAdminCompleteTrip(trip) && (
              <Button
                size="sm"
                variant="primary"
                disabled={isBusy}
                onClick={() => onCompleteTrip(trip)}
              >
                Complete Trip
              </Button>
            )}

            {!isTerminal && (
              <Button
                size="sm"
                variant="danger"
                disabled={isBusy}
                onClick={() => onCancelTrip(trip)}
              >
                Cancel
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {trip && (
        <div className="space-y-4 text-xs">
          {/* Phase 56 Pending Rider /track Change Request Banner */}
          {exception?.hasPendingRiderChangeRequest && (
            <div className="p-3.5 rounded-xl bg-status-staged-bg border border-status-staged-border space-y-2.5">
              <div className="font-extrabold text-status-staged-fg">
                📝 Rider Edit Req (Pending /track Change Request)
              </div>
              <p className="text-[11px] text-status-staged-fg">{exception.riderChangeSummary}</p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={isBusy}
                  onClick={() => onResolveGuestChangeRequest(trip, 'approve')}
                  className="text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckIcon className="w-3.5 h-3.5 mr-1" />
                  Approve Change
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => onResolveGuestChangeRequest(trip, 'decline')}
                  className="text-[11px] border-status-danger-border text-status-danger-fg"
                >
                  <XIcon className="w-3.5 h-3.5 mr-1" />
                  Decline
                </Button>
              </div>
            </div>
          )}

          {/* Phase 55 Unacknowledged Driver Update Banner */}
          {exception?.hasUnacknowledgedDriverAck && (
            <div className="p-3 rounded-xl bg-status-warning-bg border border-status-warning-border text-status-warning-fg">
              <span className="font-extrabold block">⏳ Awaiting Driver Ack</span>
              <span className="text-[11px] text-status-warning-fg">
                {exception.driverAckSummary.join(' • ') ||
                  'Assigned driver has not acknowledged the latest dispatch modification yet.'}
              </span>
            </div>
          )}

          {/* Driver Assignment & Stage Hold Card */}
          {!isTerminal && (
            <div className="bg-surface-card p-4 rounded-xl border border-border-subtle/90 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
                  Driver Assignment / Stage Hold
                </h4>
                {!trip.assignedDriverId && (
                  <div className="inline-flex rounded-lg border border-border-subtle bg-surface-subtle p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => onAssignModeChange('send_to_driver')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        assignMode === 'send_to_driver'
                          ? 'bg-blue-600 text-white'
                          : 'text-fg-secondary'
                      }`}
                    >
                      Send to Driver
                    </button>
                    <button
                      type="button"
                      onClick={() => onAssignModeChange('stage_hold')}
                      className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                        assignMode === 'stage_hold'
                          ? 'bg-indigo-600 text-white'
                          : 'text-fg-secondary'
                      }`}
                    >
                      📌 Hold (Stage)
                    </button>
                  </div>
                )}
              </div>

              <DriverAssignDropdown
                value={trip.assignedDriverId || 'unassigned'}
                drivers={drivers}
                trip={trip}
                slaConfig={dispatchAutomation}
                mode={trip.assignedDriverId ? 'send_to_driver' : assignMode}
                isAssigned={Boolean(trip.assignedDriverId)}
                fallbackAssignedLabel={(trip.metadata as any)?.assignedDriverName || null}
                stagedDriverId={trip.plannedDriverId || null}
                stagedDriverLabel={trip.plannedDriverLabel || null}
                onSendStaged={() => onSendStaged(trip)}
                onClearStaged={() => onClearStaged(trip)}
                isSendBusy={isBusy}
                isCascadeExhausted={Boolean(!trip.assignedDriverId && trip.offerCascade?.state === 'exhausted')}
                cascadeExhaustedTooltip={getTripCascadeExhaustedTooltip(trip)}
                onChange={(driverId) => onDriverDropdownChange(trip, driverId)}
                size="md"
                fullWidth
                disabled={isBusy}
              />
            </div>
          )}

          {/* Passenger & Contact */}
          <div className="bg-surface-card p-4 rounded-xl border border-border-subtle/90 space-y-2">
            <h4 className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Passenger &amp; Contact
            </h4>
            <p className="text-sm font-bold text-fg-primary">
              {[trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}
            </p>
            <p className="text-fg-secondary flex items-center gap-1.5">
              <PhoneIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
              <span>{trip.passenger?.phone || 'No phone'}</span>
            </p>
            <p className="text-fg-secondary flex items-center gap-1.5">
              <MailIcon className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
              <span>{trip.passenger?.email || 'No email'}</span>
            </p>
            {(trip.passenger?.specialRequests || trip.driverNotes) && (
              <div className="pt-2 border-t border-border-faint">
                <p className="text-[11px] font-semibold text-fg-muted">Special Notes</p>
                <p className="text-fg-secondary mt-0.5">
                  {trip.passenger?.specialRequests || trip.driverNotes}
                </p>
              </div>
            )}
          </div>

          {/* Route Itinerary */}
          <div className="bg-surface-card p-4 rounded-xl border border-border-subtle/90 space-y-2.5">
            <h4 className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Route Itinerary
            </h4>
            <div>
              <span className="text-[10px] font-bold text-emerald-600 uppercase block">Pickup</span>
              <p className="font-semibold text-fg-strong mt-0.5">{trip.pickupLocation?.address}</p>
            </div>
            {trip.intermediateStops && trip.intermediateStops.length > 0 && (
              <div>
                <span className="text-[10px] font-bold text-amber-600 uppercase block">
                  Intermediate Stops ({trip.intermediateStops.length})
                </span>
                {trip.intermediateStops.map((s, idx) => (
                  <p key={idx} className="font-medium text-fg-secondary mt-0.5">
                    Stop {idx + 1}: {s.address}
                  </p>
                ))}
              </div>
            )}
            <div>
              <span className="text-[10px] font-bold text-rose-600 uppercase block">Dropoff</span>
              <p className="font-semibold text-fg-strong mt-0.5">{trip.dropoffLocation?.address}</p>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-surface-card p-4 rounded-xl border border-border-subtle/90 space-y-2">
            <h4 className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
              Financial Summary
            </h4>
            <div className="flex justify-between items-center">
              <span className="text-fg-secondary">Total Upfront Fare</span>
              <span className="font-extrabold text-fg-primary text-base font-mono">
                ${Number(trip.pricing?.totalFare || trip.payment?.amount || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-[11px] text-fg-muted">
              <span>Payment Method</span>
              <span className="font-semibold capitalize text-fg-secondary">
                {trip.payment?.method || 'Card'}
              </span>
            </div>
          </div>
        </div>
      )}
    </AdminSlideOverDrawer>
  );
}
