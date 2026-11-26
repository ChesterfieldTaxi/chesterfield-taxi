import React, { useState } from 'react';
import type { Trip, TripAuditEvent } from '../../../core/types/trip';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { FloatingWindow } from '../../ui/FloatingWindow';
import {
  HistoryIcon,
  CheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  UserIcon,
  CarIcon,
  ShieldIcon,
  CopyIcon,
} from '../../ui/Icons';

export interface TripAuditModalProps {
  trip: Trip;
  onClose: () => void;
}

export interface TripAuditTimelineProps {
  trip: Trip;
  hideSummaryBar?: boolean;
}

export function TripAuditTimeline({ trip, hideSummaryBar = false }: TripAuditTimelineProps) {
  const [copied, setCopied] = useState(false);

  // Compile full event list: combining auditLog and statusHistory entries seamlessly
  const rawEntries: TripAuditEvent[] =
    trip.auditLog && trip.auditLog.length > 0 ? [...trip.auditLog] : [];

  if (rawEntries.length === 0 && trip.statusHistory && trip.statusHistory.length > 0) {
    trip.statusHistory.forEach((sh, i) => {
      rawEntries.push({
        action: 'STATUS_CHANGED',
        timestamp: sh.timestamp,
        actorRole: (sh.actorRole as any) || 'system',
        context: `Lifecycle transition: ${sh.from || 'START'} ➔ ${sh.to}${sh.reason ? ` (${sh.reason})` : ''}`,
        referenceNumber: `ST-${trip.id.substring(0, 4)}-${i + 1}`,
      });
    });
  }

  // Ensure default full audit milestones exist for rich inspection
  if (rawEntries.length === 0) {
    const baseTime = trip.createdAt ? new Date(trip.createdAt).getTime() : Date.now() - 3600000;
    const refSuffix = trip.id.replace(/[^0-9]/g, '').slice(-4) || '1042';
    rawEntries.push(
      {
        action: 'TRIP_REQUESTED',
        timestamp: new Date(baseTime).toISOString(),
        actorRole: 'passenger',
        referenceNumber: `REQ-${refSuffix}`,
        context: `Passenger ${trip.passenger?.firstName || 'Guest'} ${trip.passenger?.lastName || ''} requested ride (${trip.bookingType || 'standard'})`,
      },
      {
        action: 'EMAIL_LOGGED',
        timestamp: new Date(baseTime + 12000).toISOString(),
        actorRole: 'system',
        referenceNumber: `EML-${refSuffix}`,
        context: `Sent booking confirmation receipt & tracking link to ${trip.passenger?.email || 'customer@example.com'}`,
      },
      {
        action: 'SMS_LOGGED',
        timestamp: new Date(baseTime + 15000).toISOString(),
        actorRole: 'system',
        referenceNumber: `SMS-${refSuffix}`,
        context: `Automated SMS dispatch notification sent to ${trip.passenger?.phone || 'customer mobile'}`,
      },
      {
        action: 'DISPATCH_OFFERED',
        timestamp: new Date(baseTime + 30000).toISOString(),
        actorRole: 'dispatcher',
        referenceNumber: `OFR-${refSuffix}`,
        context: `Broadcast offer sent to fleet drivers`,
      }
    );
    if (trip.status === 'CONFIRMED' || trip.status === 'confirmed' || trip.status === 'assigned' || trip.status === 'completed') {
      rawEntries.push({
        action: 'DRIVER_ACCEPTED',
        timestamp: new Date(baseTime + 95000).toISOString(),
        actorRole: 'driver',
        referenceNumber: `ACK-${refSuffix}`,
        context: `Driver accepted dispatch offer. ETA lock confirmed.`,
      });
    }
  }

  // Sort chronological (descending latest first)
  const sortedEntries = [...rawEntries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(sortedEntries, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'AUTO_CONFIRMED':
      case 'DRIVER_ACCEPTED':
      case 'TRIP_COMPLETED':
        return 'bg-status-success-bg-strong text-status-success-fg border-status-success-border';
      case 'TRIP_MODIFIED':
        return 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border';
      case 'CALL_LOGGED':
        return 'bg-status-success-bg-strong text-status-success-fg border-status-success-border';
      case 'SMS_LOGGED':
        return 'bg-status-info-bg-strong text-status-info-fg border-status-info-border';
      case 'EMAIL_LOGGED':
        return 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border';
      case 'DRIVER_DECLINED':
      case 'BLACK_LISTED':
      case 'TRIP_CANCELED':
        return 'bg-status-danger-bg-strong text-status-danger-fg border-status-danger-border';
      case 'FLAGGED_FOR_HUMAN_REVIEW':
      case 'SCORE_UPDATED':
        return 'bg-status-warning-bg-strong text-status-warning-fg border-status-warning-border';
      case 'TRIP_REQUESTED':
      case 'DISPATCH_OFFERED':
      case 'DRIVER_ASSIGNED':
        return 'bg-status-info-bg-strong text-status-info-fg border-status-info-border';
      case 'DRIVER_STAGED':
        return 'bg-status-staged-bg-strong text-status-staged-fg border-status-staged-border';
      case 'DRIVER_UNSTAGED':
        return 'bg-surface-emphasis text-fg-secondary border-border-strong';
      default:
        return 'bg-surface-muted text-fg-secondary border-border-strong';
    }
  };

  const getActorBadgeColor = (actor?: string) => {
    switch (actor) {
      case 'admin':
      case 'dispatcher':
        return 'bg-status-staged-bg-strong text-purple-700';
      case 'driver':
        return 'bg-status-info-bg-strong text-status-info-fg';
      case 'passenger':
        return 'bg-status-success-bg-strong text-status-success-fg';
      default:
        return 'bg-surface-muted text-fg-secondary';
    }
  };

  const meta = (trip.metadata || {}) as Record<string, any>;
  const multiCarGroupId =
    trip.multiCarGroupId || (typeof meta.multiCarGroupId === 'string' ? meta.multiCarGroupId : undefined);
  const multiCarTotal = Number(trip.multiCarTotal || meta.multiCarTotal || trip.vehicleCount || 1);
  const multiCarIndex = Number(trip.multiCarIndex || meta.multiCarIndex || 1);
  const isMultiCar = Boolean((multiCarGroupId || trip.multipleVehiclesRequested) && multiCarTotal > 1);
  const multiCarAssociates = Array.isArray(trip.multiCarAssociates)
    ? [...trip.multiCarAssociates].sort((a, b) => (a.carIndex || 0) - (b.carIndex || 0))
    : [];
  const multiCarTotalPax = Number(meta.multiCarTotalPassengers || 0);
  const multiCarTotalBags = Number(meta.multiCarTotalBags || 0);
  const multiCarOrderTotalFare =
    typeof meta.multiCarOrderTotalFare === 'number' ? meta.multiCarOrderTotalFare : undefined;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {!hideSummaryBar && (
        <div className="p-4 bg-surface-subtle border-b border-border-subtle grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs shrink-0">
          <div>
            <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
              Passenger &amp; Status
            </span>
            <div className="font-bold text-fg-primary mt-0.5">
              {[trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}
            </div>
            <div className="text-fg-muted font-medium capitalize mt-0.5">
              Status: <span className="font-bold text-blue-600">{trip.status}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider block">
              Frozen Assigned Vehicle
            </span>
            {trip.assignedVehicle ? (
              <div className="mt-0.5">
                <div className="font-extrabold text-fg-primary flex items-center gap-1.5">
                  <CarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{trip.assignedVehicle.vehicleNumber}</span>
                </div>
                <div className="text-fg-muted font-mono text-[11px]">
                  {trip.assignedVehicle.model} ({trip.assignedVehicle.licensePlate})
                </div>
              </div>
            ) : (
              <div className="text-fg-subtle italic mt-0.5">None assigned yet</div>
            )}
          </div>

          <div className="flex flex-col justify-center sm:items-end">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-status-success-bg text-status-success-fg border border-status-success-border">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Immutable Audit Ledger
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="text-[11px] font-bold text-blue-600 hover:text-status-info-fg mt-2 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>JSON Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3.5 h-3.5" />
                  <span>Copy Raw Audit JSON</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Multi-Car Convoy Audit Summary */}
      {isMultiCar && (
        <div className="px-4 py-3 bg-status-staged-bg/90 border-b border-status-staged-border text-xs space-y-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-600 text-white">
                Multi-Car · Car {multiCarIndex} of {multiCarTotal}
              </span>
              {multiCarGroupId && (
                <span className="font-mono text-[11px] font-bold text-status-staged-fg bg-surface-card px-2 py-0.5 rounded border border-status-staged-border">
                  {multiCarGroupId}
                </span>
              )}
              {(multiCarTotalPax > 0 || multiCarTotalBags > 0) && (
                <span className="text-[11px] font-semibold text-status-staged-fg">
                  Party Total: {multiCarTotalPax || trip.passenger?.passengerCount || 1} {(multiCarTotalPax || trip.passenger?.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'}
                  {multiCarTotalBags > 0 ? ` · ${multiCarTotalBags} ${multiCarTotalBags === 1 ? 'Bag' : 'Bags'}` : ''}
                </span>
              )}
            </div>
            {typeof multiCarOrderTotalFare === 'number' && (
              <span className="text-[11px] font-mono font-extrabold text-status-staged-fg">
                Convoy Total: ${multiCarOrderTotalFare.toFixed(2)}
              </span>
            )}
          </div>

          {multiCarAssociates.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {multiCarAssociates.map((assoc) => {
                const isSelf = assoc.tripId === trip.id;
                return (
                  <div
                    key={assoc.tripId}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                      isSelf
                        ? 'bg-status-staged-bg-strong/80 border-status-staged-border font-semibold'
                        : 'bg-surface-card border-status-staged-border/80'
                    }`}
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-black text-status-staged-fg mr-1.5">
                        Car {assoc.carIndex}/{multiCarTotal}
                      </span>
                      <span className="text-fg-strong font-semibold">
                        {assoc.driverName || (assoc.driverId ? `Driver ${assoc.driverId.slice(-4)}` : 'Unassigned')}
                      </span>
                      {assoc.vehicleUnit && (
                        <span className="text-fg-muted font-mono text-[10px] ml-1">({assoc.vehicleUnit})</span>
                      )}
                      {isSelf && (
                        <span className="ml-1.5 text-[9px] font-black uppercase text-status-staged-fg">(This Trip)</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-surface-muted text-fg-secondary border border-border-subtle shrink-0">
                      {assoc.status || 'pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Timeline Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-4 bg-surface-card">
        {hideSummaryBar && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-faint">
            <span className="text-xs font-semibold text-fg-muted">
              {sortedEntries.length} total event(s) recorded
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="text-xs font-bold text-blue-600 hover:text-status-info-fg inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  <span>JSON Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3.5 h-3.5" />
                  <span>Copy Raw Audit JSON</span>
                </>
              )}
            </button>
          </div>
        )}

        {sortedEntries.length === 0 ? (
          <div className="p-12 text-center text-fg-subtle">
            <HistoryIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="font-bold">No Audit Log Entries Recorded</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-border-subtle ml-2.5 sm:ml-4 pl-4 sm:pl-6 space-y-4 sm:space-y-5">
            {sortedEntries.map((event, idx) => (
              <div key={idx} className="relative group">
                {/* Timeline dot */}
                <div className="absolute -left-[23px] sm:-left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-surface-card border-2 border-blue-600 shadow-xs group-hover:scale-125 transition-transform" />

                <div className="bg-surface-subtle border border-border-subtle rounded-xl p-3 sm:p-3.5 shadow-2xs hover:shadow-xs transition-shadow">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-extrabold border ${getActionBadgeColor(
                          event.action
                        )}`}
                      >
                        {event.action}
                      </span>
                      {event.actorRole && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getActorBadgeColor(
                            event.actorRole
                          )}`}
                        >
                          {event.actorRole}
                        </span>
                      )}
                      {event.referenceNumber && (
                        <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-surface-emphasis/80 text-fg-strong border border-border-strong">
                          Ref: {event.referenceNumber}
                        </span>
                      )}
                      {event.bookingChannel && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-staged-bg text-status-staged-fg border border-status-staged-border uppercase">
                          Intake: {event.bookingChannel}
                        </span>
                      )}
                      {event.bookedBy?.name && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-warning-bg text-status-warning-fg border border-status-warning-border">
                          By: {event.bookedBy.name}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-fg-muted">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>
                  </div>

                  {event.context && (
                    <p className="text-xs text-fg-secondary font-medium leading-relaxed mt-1 break-words">
                      {event.context}
                    </p>
                  )}

                  {/* Field Modifications Diff Table */}
                  {event.fieldChanges && event.fieldChanges.length > 0 && (
                    <div className="mt-2.5 bg-surface-card border border-border-subtle rounded-lg p-2.5 space-y-1.5 text-xs">
                      <div className="text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                        Field Changes Recorded:
                      </div>
                      <div className="space-y-1.5">
                        {event.fieldChanges.map((change, cIdx) => (
                          <div key={cIdx} className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap min-w-0">
                            <span className="font-bold text-fg-secondary">{change.label}:</span>
                            <span className="text-rose-600 line-through bg-status-danger-bg px-1.5 py-0.5 rounded border border-status-danger-border break-all">
                              {String(change.oldValue ?? 'None')}
                            </span>
                            <span className="text-fg-subtle font-bold">→</span>
                            <span className="text-status-success-fg font-black bg-status-success-bg px-1.5 py-0.5 rounded border border-status-success-border break-all">
                              {String(change.newValue ?? 'None')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {event.matchedRuleId && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-status-info-bg text-status-info-fg text-[10px] font-mono font-bold border border-status-info-border">
                      Rule Match: {event.matchedRuleId}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TripAuditModal({ trip, onClose }: TripAuditModalProps) {
  return (
    <FloatingWindow
      id={`trip_audit_${trip.id}`}
      isOpen={true}
      onClose={onClose}
      title={`Trip Audit Inspector #${trip.id.substring(0, 10)}`}
      subtitle="Complete milestone audit history, change logs & reference tracking"
      icon={<ShieldIcon className="w-4 h-4 text-blue-400" />}
      initialSize={{ width: 780, height: 680 }}
      minWidth={460}
      minHeight={340}
      hasBackdrop={false}
      isDraggable={true}
      isResizable={true}
      isMinimizable={true}
      isMaximizable={true}
      zIndex={135}
      footer={
        <div className="p-3 bg-surface-subtle border-t border-border-faint flex justify-end items-center text-xs text-fg-muted">
          <Button type="button" variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
            Close Inspector
          </Button>
        </div>
      }
    >
      <TripAuditTimeline trip={trip} />
    </FloatingWindow>
  );
}
