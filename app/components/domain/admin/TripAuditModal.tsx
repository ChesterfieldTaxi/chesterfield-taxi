import React, { useState } from 'react';
import type { Trip, TripAuditEvent } from '../../../core/types/trip';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import {
  HistoryIcon,
  CheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  UserIcon,
  CarIcon,
  ShieldIcon,
} from '../../ui/Icons';

export interface TripAuditModalProps {
  trip: Trip;
  onClose: () => void;
}

export function TripAuditModal({ trip, onClose }: TripAuditModalProps) {
  const [copied, setCopied] = useState(false);

  // Compile full event list: combining auditLog and statusHistory entries seamlessly
  const auditEntries: TripAuditEvent[] = (trip.auditLog && trip.auditLog.length > 0)
    ? [...trip.auditLog]
    : (trip.statusHistory || []).map((sh) => ({
        action: 'STATUS_CHANGED' as const,
        timestamp: sh.timestamp,
        actorRole: (sh.actorRole as any) || 'system',
        context: `Transition: ${sh.from || 'START'} ➔ ${sh.to}${sh.reason ? ' (' + sh.reason + ')' : ''}`,
      }));

  // Sort chronological (earliest first or latest first - let's do descending latest first)
  const sortedEntries = [...auditEntries].sort(
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
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'FLAGGED_FOR_HUMAN_REVIEW':
      case 'SCORE_UPDATED':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'BLACK_LISTED':
      case 'TRIP_CANCELED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'TRIP_REQUESTED':
      case 'DISPATCH_OFFERED':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const getActorBadgeColor = (actor?: string) => {
    switch (actor) {
      case 'admin':
      case 'dispatcher':
        return 'bg-purple-100 text-purple-700';
      case 'driver':
        return 'bg-blue-100 text-blue-700';
      case 'passenger':
        return 'bg-emerald-100 text-emerald-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-3xl bg-white shadow-2xl border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <ShieldIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">
                  Trip Audit Trail Inspector
                </h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  #{trip.id.substring(0, 10)}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Immutable chronological event timeline & frozen assignment snapshot
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold"
          >
            &#x2715;
          </button>
        </div>

        {/* Snapshot Summary Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Passenger & Status
            </span>
            <div className="font-bold text-slate-900 mt-0.5">
              {[trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ') || 'Guest'}
            </div>
            <div className="text-slate-500 font-medium capitalize mt-0.5">
              Status: <span className="font-bold text-blue-600">{trip.status}</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Frozen Assigned Vehicle
            </span>
            {trip.assignedVehicle ? (
              <div className="mt-0.5">
                <div className="font-extrabold text-slate-900 flex items-center gap-1">
                  <span>🚕</span> {trip.assignedVehicle.vehicleNumber}
                </div>
                <div className="text-slate-500 font-mono text-[11px]">
                  {trip.assignedVehicle.model} ({trip.assignedVehicle.licensePlate})
                </div>
              </div>
            ) : (
              <div className="text-slate-400 italic mt-0.5">None assigned yet</div>
            )}
          </div>

          <div className="flex flex-col justify-center sm:items-end">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Immutable Firestore Append Log
            </span>
            <button
              type="button"
              onClick={handleCopyJson}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 mt-2 flex items-center gap-1"
            >
              {copied ? '✓ JSON Copied' : '📋 Copy Raw Audit JSON'}
            </button>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
          {sortedEntries.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <HistoryIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p className="font-bold">No Audit Log Entries Recorded</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
              {sortedEntries.map((event, idx) => (
                <div key={idx} className="relative group">
                  {/* Timeline dot */}
                  <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-blue-600 shadow-xs group-hover:scale-125 transition-transform" />

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-shadow">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
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
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>

                    {event.context && (
                      <p className="text-xs text-slate-700 font-medium leading-relaxed mt-1">
                        {event.context}
                      </p>
                    )}

                    {event.matchedRuleId && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-mono font-bold border border-blue-200">
                        Rule Match: {event.matchedRuleId}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span>{sortedEntries.length} total timeline event(s) recorded</span>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close Inspector
          </Button>
        </div>
      </Card>
    </div>
  );
}
