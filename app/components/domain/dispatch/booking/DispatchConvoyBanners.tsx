import React from 'react';
import type { Trip } from '../../../../core/types';
import type { DriverRosterItem } from '../../../../core/services/operator.service';
import type { BookingVehicleChoice as VehicleChoice } from '../../../../core/hooks/booking';
import { AlertTriangleIcon, BanIcon, LockIcon } from '../../../ui/Icons';

export interface DispatchConvoyBannersProps {
  isEditMode: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  initialTrip?: Trip | null;
  lookupTrips: Trip[];
  driverOptions: DriverRosterItem[];
  selectedVehicles: Array<VehicleChoice>;
  submitError: string | null;
  submitErrorRef: React.RefObject<HTMLDivElement | null>;
  onOpenLinkedTrip?: (linkedTripId: string) => void;
}

export function DispatchConvoyBanners({
  isEditMode,
  isCompleted,
  isCancelled,
  initialTrip,
  lookupTrips,
  driverOptions,
  selectedVehicles,
  submitError,
  submitErrorRef,
  onOpenLinkedTrip,
}: DispatchConvoyBannersProps) {
  return (
    <>
      {isCompleted && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-900">
            <LockIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>Completed Trip (Date &amp; Schedule Locked)</span>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed">
            Date, time, and recurrence are locked for shift &amp; payout integrity.
            Passenger/contact details, location labels, notes, fare, and payment remain editable.
          </p>
        </div>
      )}

      {isCancelled && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-rose-900">
            <BanIcon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Cancelled Trip (Schedule &amp; Route Locked)</span>
          </div>
          <p className="text-[11px] text-rose-800 leading-relaxed">
            You may update contact details and internal remarks, or use &quot;Copy Booking&quot;
            below to create a new active trip.
          </p>
        </div>
      )}

      {submitError && (
        <div
          ref={submitErrorRef}
          className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs font-semibold flex items-center gap-1.5"
        >
          <AlertTriangleIcon className="w-3.5 h-3.5 text-red-600 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Multi-Car Convoy Banner (Edit Mode on Linked Multi-Vehicle Orders) */}
      {isEditMode &&
        initialTrip?.multiCarGroupId &&
        (initialTrip.multiCarTotal || 1) > 1 &&
        (() => {
          const liveSiblings = lookupTrips
            .filter((t) => t.multiCarGroupId === initialTrip.multiCarGroupId)
            .sort((a, b) => (a.multiCarIndex || 0) - (b.multiCarIndex || 0));
          const associatesList =
            liveSiblings.length > 0
              ? liveSiblings.map((t) => ({
                  tripId: t.id,
                  carIndex: t.multiCarIndex || 1,
                  vehicleDisplayName: (t.metadata as any)?.vehicleDisplayName || t.vehicleTier,
                  driverName:
                    driverOptions.find((d) => d.id === t.assignedDriverId)?.formattedLabel ||
                    driverOptions.find((d) => d.id === t.assignedDriverId)?.name ||
                    (t.metadata as any)?.assignedDriverName,
                  driverId: t.assignedDriverId,
                  status: t.status,
                  fare: t.pricing?.totalFare || 0,
                }))
              : (initialTrip.multiCarAssociates || []).map((a) => ({
                  tripId: a.tripId,
                  carIndex: a.carIndex,
                  vehicleDisplayName: a.vehicleDisplayName || a.vehicleTier || 'Standard',
                  driverName: a.driverName,
                  driverId: a.driverId,
                  status: a.status || 'pending',
                  fare: 0,
                }));

          return (
            <div className="p-2.5 bg-violet-50 border border-violet-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-violet-900 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[10px] font-black">
                    CAR {initialTrip.multiCarIndex || 1}/{initialTrip.multiCarTotal}
                  </span>
                  <span>Multi-Car Convoy</span>
                </div>
                <span className="font-mono text-[10px] text-violet-600 font-semibold">
                  {initialTrip.multiCarGroupId}
                </span>
              </div>
              <div className="space-y-1">
                {associatesList.map((car) => {
                  const isCurrent = car.tripId === initialTrip.id;
                  return (
                    <div
                      key={car.tripId}
                      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[11px] ${
                        isCurrent
                          ? 'bg-white border-violet-300 font-bold text-violet-950'
                          : 'bg-violet-100/50 border-violet-200/70 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 truncate">
                        <span className="font-bold">Car #{car.carIndex}</span>
                        <span className="text-slate-500"> · {car.vehicleDisplayName}</span>
                        <span className="ml-1.5 text-[10px] font-semibold text-blue-700">
                          {car.driverName || (car.driverId ? 'Assigned' : 'Unassigned')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCurrent ? (
                          <span className="text-[10px] font-black text-violet-700">Editing</span>
                        ) : (
                          onOpenLinkedTrip && (
                            <button
                              type="button"
                              onClick={() => onOpenLinkedTrip(car.tripId)}
                              className="px-2 py-0.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Open
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

      {/* Multi-Car Split Info Notice when >1 vehicle selected on New or Unsplit Edit */}
      {selectedVehicles.length > 1 && !initialTrip?.multiCarGroupId && (
        <div className="px-2.5 py-2 bg-violet-50/90 border border-violet-200 rounded-lg text-[11px] text-violet-900 flex items-center justify-between gap-2">
          <span>
            <strong>{selectedVehicles.length} separate linked trips</strong> will be created so each
            car can be assigned individually with associate driver awareness.
          </span>
        </div>
      )}
    </>
  );
}
