import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import { getWorkspaceBus, type WorkspaceModuleKey } from '../core/services/workspace-bus.service';
import { CommsHub } from '../components/domain/dispatch/CommsHub';
import { EmailDock } from '../components/domain/dispatch/EmailDock';
import { DispatchBookingEngine } from '../components/domain/dispatch/DispatchBookingEngine';
import { LiveFleetMap } from '../components/domain/dispatch/LiveFleetMap';
import {
  useDispatchFleet,
  FLEET_STATUS_COLORS,
  getMapStatusLabel,
} from '../core/hooks/useDispatchFleet';
import { getBookingService } from '../core/services/booking';
import type { Trip } from '../core/types/trip';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { SpinnerIcon } from '../components/ui/Icons';

export function meta() {
  return [{ title: 'Dispatch Window Pop-Out – Chesterfield Taxi' }];
}

export default function DispatchPopoutRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const moduleKey = (searchParams.get('module') || 'comms') as WorkspaceModuleKey;

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedMapTrip, setSelectedMapTrip] = useState<Trip | null>(null);

  const workspaceBus = getWorkspaceBus();
  const { fleet, setDriverDutyStatus } = useDispatchFleet(trips);

  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged((user) => {
      const roles = user?.roles || (user?.role ? [user.role] : []);
      const hasAccess = roles.includes('admin') || roles.includes('dispatcher');
      if (!user || !hasAccess) {
        setIsAuthorized(false);
        setIsCheckingAuth(false);
        navigate('/app/login?redirect=/app/dispatch', { replace: true });
      } else {
        setIsAuthorized(true);
        setIsCheckingAuth(false);
      }
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!isAuthorized) return;
    workspaceBus.publish('WINDOW_REGISTER', { moduleKey, timestamp: Date.now() });

    const handleBeforeUnload = () => {
      workspaceBus.publish('WINDOW_UNLOAD', { moduleKey });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const bookingService = getBookingService();
    const unsubTrips = bookingService.subscribeToAllTrips
      ? bookingService.subscribeToAllTrips(
          (list: Trip[]) => setTrips(list),
          (err: any) => console.error('[DispatchPopout] Trip subscription error:', err)
        )
      : () => {};

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
      if (typeof unsubTrips === 'function') unsubTrips();
    };
  }, [isAuthorized, moduleKey, workspaceBus]);

  // Listen to FOCUS_TRIP_ON_MAP in detached map window
  useEffect(() => {
    if (!isAuthorized || moduleKey !== 'map') return;
    return workspaceBus.subscribe((msg) => {
      if (msg.type === 'FOCUS_TRIP_ON_MAP' && msg.payload?.tripId) {
        const match = trips.find((t) => t.id === msg.payload.tripId);
        if (match) setSelectedMapTrip(match);
      }
    });
  }, [isAuthorized, moduleKey, trips, workspaceBus]);

  if (isCheckingAuth || !isAuthorized) {
    return (
      <div className="flex flex-col h-screen w-screen items-center justify-center bg-slate-950 text-white gap-3">
        <SpinnerIcon className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-xs font-semibold text-slate-400">Verifying dispatcher authorization...</p>
      </div>
    );
  }

  const getModuleTitle = (key: WorkspaceModuleKey) => {
    switch (key) {
      case 'comms':
        return 'Omnichannel Communications Console';
      case 'email':
        return 'Dispatch Email & Bookings Console';
      case 'booking':
        return 'Phone Order & Reservation Engine';
      case 'drivers':
        return 'Fleet & Driver Roster';
      case 'map':
        return 'Live GPS Fleet Radar';
      case 'trips':
        return 'Dispatch Queue & Trips Table';
      default:
        return 'Dispatch Module';
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* Compact Detached Window Header */}
      <div className="h-10 bg-slate-950 border-b border-slate-800 px-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black tracking-wide text-white">
            {getModuleTitle(moduleKey)}
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
            Detached Window • Live Synced
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.close()}
            className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
          >
            <span>↙ Dock Back / Close</span>
          </button>
        </div>
      </div>

      {/* Detached Content Body */}
      <div className="flex-1 min-h-0 bg-white text-slate-900 overflow-hidden">
        {moduleKey === 'comms' && (
          <CommsHub
            isPopout={true}
            drivers={fleet}
            trips={trips}
            onPopulateBooking={(data) => {
              workspaceBus.publish('POPULATE_BOOKING', data);
            }}
          />
        )}

        {moduleKey === 'email' && (
          <EmailDock
            isPopout={true}
            showWindowControls={false}
            trips={trips}
            onClose={() => window.close()}
            onOpenEditTrip={(tripId) => {
              workspaceBus.publish('OPEN_EDIT_TRIP', { tripId });
            }}
            onPopulateBooking={(data) => {
              workspaceBus.publish('POPULATE_BOOKING', data);
            }}
          />
        )}

        {moduleKey === 'booking' && (
          <div className="h-full overflow-hidden max-w-2xl mx-auto border-x border-slate-200">
            <DispatchBookingEngine
              draftId="popout-booking"
              isActive={true}
              trips={trips}
              drivers={fleet}
            />
          </div>
        )}

        {moduleKey === 'drivers' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Live Drivers Roster (Detached)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {fleet.map((drv) => {
                const palette = FLEET_STATUS_COLORS[drv.mapStatus];
                const label = getMapStatusLabel(drv.mapStatus, drv.activeTripStatus);
                return (
                  <div key={drv.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-sm text-slate-900 truncate">
                        {drv.formattedLabel || (drv.cabNumber ? `#${drv.cabNumber}, ${drv.firstName || drv.name}` : drv.name)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${palette.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${palette.dotClass}`} />
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>{drv.vehicle}</span>
                      {drv.queuedTripsCount > 0 && (
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          {drv.queuedTripsCount} Queued
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-mono text-slate-500">{drv.phone}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {moduleKey === 'trips' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Active Trips Queue (Detached)</h2>
            <div className="space-y-2">
              {trips.map((tr) => (
                <div key={tr.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-900 block">{tr.id}</span>
                    <span className="text-xs text-slate-600">{tr.pickupLocation?.address} → {tr.dropoffLocation?.address}</span>
                  </div>
                  <span className="font-bold text-xs text-emerald-700">${tr.pricing?.totalFare?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {moduleKey === 'map' && (
          <LiveFleetMap
            fleet={fleet}
            trips={trips}
            selectedTrip={selectedMapTrip}
            shouldZoom={Boolean(selectedMapTrip)}
            onSelectTrip={(trip) => setSelectedMapTrip(trip)}
            onChangeDriverDutyStatus={(driverId, duty) => setDriverDutyStatus(driverId, duty)}
            onCallDriver={(phone, name) => {
              workspaceBus.publish('CALL_OUTBOUND_STARTED', {
                targetNumber: phone,
                contactName: name,
              });
            }}
            onAssignDriverToTrip={async (tripId, driverId) => {
              const bookingService = getBookingService();
              if (bookingService.updateTrip) {
                await bookingService.updateTrip(tripId, {
                  assignedDriverId: driverId,
                  status: 'assigned',
                });
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
