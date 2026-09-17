import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { getWorkspaceBus, type WorkspaceModuleKey } from '../core/services/workspace-bus.service';
import { CommsHub } from '../components/domain/dispatch/CommsHub';
import { EmailDock } from '../components/domain/dispatch/EmailDock';
import { BookingEngineV2 } from '../components/domain/BookingEngineV2';
import { getBookingService } from '../core/services/booking';
import type { Trip } from '../core/types/trip';

export function meta() {
  return [{ title: 'Dispatch Window Pop-Out – Chesterfield Taxi' }];
}

const INITIAL_DRIVERS = [
  { id: 'drv-101', name: 'Driver 101 (Mike T.)', status: 'available', vehicle: 'Toyota Camry (#204)', tier: 'Sedan', phone: '(314) 555-0101', zone: 'Chesterfield Valley', driverScore: 98 },
  { id: 'drv-104', name: 'Driver 104 (Sarah K.)', status: 'on_trip', vehicle: 'Chevy Suburban (#301)', tier: 'SUV', phone: '(314) 555-0104', zone: 'Lambert Airport (STL)', driverScore: 95 },
  { id: 'drv-108', name: 'Driver 108 (David R.)', status: 'available', vehicle: 'Toyota Sienna (#14)', tier: 'Minivan', phone: '(314) 555-0108', zone: 'Town & Country', driverScore: 99 },
  { id: 'drv-112', name: 'Driver 112 (Alex M.)', status: 'offline', vehicle: 'Ford Explorer (#402)', tier: 'SUV', phone: '(314) 555-0112', zone: 'Ballwin / Manchester', driverScore: 91 },
];

export default function DispatchPopoutRoute() {
  const [searchParams] = useSearchParams();
  const moduleKey = (searchParams.get('module') || 'comms') as WorkspaceModuleKey;

  const [drivers] = useState(INITIAL_DRIVERS);
  const [trips, setTrips] = useState<Trip[]>([]);

  const workspaceBus = getWorkspaceBus();

  useEffect(() => {
    // Notify main window that this module is active in an external window
    workspaceBus.publish('WINDOW_REGISTER', { moduleKey, timestamp: Date.now() });

    const handleBeforeUnload = () => {
      workspaceBus.publish('WINDOW_UNLOAD', { moduleKey });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    const bookingService = getBookingService();
    const unsubTrips = bookingService.subscribeToAllTrips
      ? bookingService.subscribeToAllTrips(
          (list: Trip[]) => setTrips(list),
          (err: any) => console.error(err)
        )
      : () => {};

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
      if (typeof unsubTrips === 'function') unsubTrips();
    };
  }, [moduleKey, workspaceBus]);

  const getModuleTitle = (key: WorkspaceModuleKey) => {
    switch (key) {
      case 'comms':
        return 'Omnichannel Communications Console';
      case 'email':
        return 'Dispatch Email & Bookings Console';
      case 'booking':
        return 'Quick Ride Booking & Reservation Engine';
      case 'drivers':
        return 'Fleet & Driver Roster';
      case 'map':
        return 'Live GPS Radar Fleet Map';
      case 'trips':
        return 'Dispatch Queue & Trips Table';
      default:
        return 'Dispatch Module';
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden font-sans">
      {/* ─── Compact Detached Window Header ─── */}
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

      {/* ─── Detached Content Body ─── */}
      <div className="flex-1 min-h-0 bg-white text-slate-900 overflow-hidden">
        {moduleKey === 'comms' && (
          <CommsHub
            isPopout={true}
            drivers={drivers}
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
            onClose={() => window.close()}
            onPopulateBooking={(data) => {
              workspaceBus.publish('POPULATE_BOOKING', data);
            }}
          />
        )}

        {moduleKey === 'booking' && (
          <div className="h-full overflow-y-auto p-4 max-w-4xl mx-auto">
            <BookingEngineV2 />
          </div>
        )}

        {moduleKey === 'drivers' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900">Drivers Roster (Detached)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {drivers.map((drv) => (
                <div key={drv.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-slate-900">{drv.vehicle}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase">
                      {drv.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{drv.name}</p>
                  <p className="text-xs font-mono text-slate-500">{drv.phone}</p>
                </div>
              ))}
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
          <div className="h-full flex items-center justify-center bg-slate-100 p-8 text-center text-slate-600">
            <div>
              <span className="text-3xl block mb-2">🗺️</span>
              <h3 className="font-extrabold text-sm text-slate-900">Live GPS Fleet Radar</h3>
              <p className="text-xs text-slate-500 mt-1">Satellite map tracking active vehicles and route polylines.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
