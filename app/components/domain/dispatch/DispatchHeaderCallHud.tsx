import React, { useState, useEffect } from 'react';
import {
  getWorkspaceBus,
  type WorkspaceMessage,
  type UpcomingBookingPreview,
} from '../../../core/services/workspace-bus.service';
import {
  matchPassengerByPhone,
  resolvePrimarySmsPhone,
  DEFAULT_PASSENGER_ACCOUNT,
} from '../../../core/services/passenger.service';
import type { Trip } from '../../../core/types/trip';
import { PhoneIcon, CheckIcon, XIcon, CalendarIcon, PlusIcon } from '../../ui/Icons';

interface DispatchHeaderCallHudProps {
  trips?: Trip[];
  onOpenBooking?: () => void;
  onOpenComms?: () => void;
  onPopulateBooking?: (data: any) => void;
}

export function DispatchHeaderCallHud({
  trips = [],
  onOpenBooking,
  onOpenComms,
  onPopulateBooking,
}: DispatchHeaderCallHudProps) {
  const [activeCall, setActiveCall] = useState<{
    callSid?: string;
    callerNumber: string;
    callerName: string;
    numberType: 'home' | 'mobile' | 'work' | 'other';
    mobileForSms: string;
    upcomingBookings: UpcomingBookingPreview[];
    vipTag?: string;
  } | null>(null);

  const [isMinimized, setIsMinimized] = useState(false);
  const workspaceBus = getWorkspaceBus();

  // Listen for incoming calls across windows via WorkspaceBus
  useEffect(() => {
    const unsub = workspaceBus.subscribe((msg: WorkspaceMessage) => {
      if (msg.type === 'CALL_INCOMING') {
        const payload = msg.payload;
        setActiveCall({
          callSid: payload.callSid,
          callerNumber: payload.callerNumber,
          callerName: payload.callerName || 'Unregistered Caller',
          numberType: payload.numberType || 'mobile',
          mobileForSms: payload.mobileForSms || payload.callerNumber,
          upcomingBookings: payload.upcomingBookings || [],
          vipTag: payload.vipTag,
        });
        setIsMinimized(false);
      } else if (msg.type === 'CALL_ENDED') {
        setActiveCall(null);
      }
    });

    return unsub;
  }, [workspaceBus]);

  // Handle answering call
  const handleAnswer = () => {
    if (!activeCall) return;
    workspaceBus.publish('CALL_ANSWERED', {
      callSid: activeCall.callSid,
      callerNumber: activeCall.callerNumber,
    });
    if (onOpenComms) onOpenComms();
  };

  // Handle pre-populating booking form from caller CRM
  const handlePopulateBooking = () => {
    if (!activeCall) return;
    const payload = {
      passengerName: activeCall.callerName,
      passengerPhone: activeCall.mobileForSms, // Uses cell phone for SMS confirmations!
      callingFromPhone: activeCall.callerNumber,
      pickupAddress:
        activeCall.upcomingBookings.length > 0
          ? activeCall.upcomingBookings[0].pickupAddress
          : DEFAULT_PASSENGER_ACCOUNT.savedPlaces[0]?.address || '14848 Conway Rd, Chesterfield, MO',
      notes: `Inbound Call via ${activeCall.numberType.toUpperCase()} line (${activeCall.callerNumber}). SMS updates routed to ${activeCall.mobileForSms}.`,
    };

    workspaceBus.publish('POPULATE_BOOKING', payload);
    if (onPopulateBooking) onPopulateBooking(payload);
    if (onOpenBooking) onOpenBooking();
  };

  // Diagnostic simulator for dispatcher testing
  const handleSimulateInboundCall = () => {
    // Simulate call from Sarah Jenkins' HOME landline (314) 532-1200
    const matched = matchPassengerByPhone('(314) 532-1200');
    const passenger = matched ? matched.passenger : DEFAULT_PASSENGER_ACCOUNT;
    const smsCell = resolvePrimarySmsPhone(passenger);

    const upcoming: UpcomingBookingPreview[] = [
      {
        id: 'bk-994',
        time: 'Tomorrow 6:00 AM',
        pickupAddress: '14848 Conway Rd, Chesterfield, MO',
        dropoffAddress: 'Lambert Airport Terminal 1 (STL)',
        fare: 68.5,
      },
    ];

    workspaceBus.publish('CALL_INCOMING', {
      callSid: `CA_${Date.now()}`,
      callerNumber: '(314) 532-1200',
      callerName: `${passenger.firstName} ${passenger.lastName}`,
      numberType: 'home',
      mobileForSms: smsCell,
      upcomingBookings: upcoming,
      vipTag: 'VIP Executive',
    });
  };

  if (!activeCall) {
    return (
      <div className="hidden lg:flex items-center">
        <button
          type="button"
          onClick={handleSimulateInboundCall}
          className="text-xs font-bold text-slate-700 hover:text-slate-900 px-2.5 py-1 rounded-xl border border-slate-300 hover:border-slate-400 bg-slate-100 hover:bg-slate-200 transition-all cursor-pointer flex items-center gap-2 shadow-2xs"
          title="Simulate an inbound customer phone call to test the Screen-Pop CTI workflow"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-xs" />
          <span>Test Call HUD</span>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Top Navbar Inbound Call Pill */}
      <div className="hidden lg:flex items-center">
        <button
          type="button"
          onClick={() => setIsMinimized(!isMinimized)}
          className="text-xs font-extrabold text-white px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 animate-pulse transition-all cursor-pointer flex items-center gap-2 shadow-md ring-2 ring-emerald-300"
          title="Incoming Call active - Click to toggle HUD"
        >
          <PhoneIcon className="w-3.5 h-3.5 animate-bounce" />
          <span>Inbound: {activeCall.callerName}</span>
        </button>
      </div>

      {/* Floating HUD Modal / Minimized Floating Trigger */}
      {isMinimized ? (
        <div className="fixed top-14 right-4 z-50 animate-bounce">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            className="bg-emerald-600 text-white px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2 border-2 border-emerald-400 cursor-pointer text-xs font-black"
          >
            <PhoneIcon className="w-4 h-4 animate-spin" />
            <span>Incoming: {activeCall.callerName}</span>
            <span className="text-[10px] bg-white text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">
              Expand
            </span>
          </button>
        </div>
      ) : (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-slate-950 text-white rounded-2xl p-4 shadow-2xl border-2 border-emerald-500 ring-4 ring-emerald-500/20">
            <div className="flex items-start justify-between gap-4">
              {/* Caller Details & Ringing Animation */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/40 animate-pulse">
                  <PhoneIcon className="w-6 h-6" />
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-base text-white tracking-wide">
                      {activeCall.callerName}
                    </span>
                    {activeCall.vipTag && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black">
                        ⭐ {activeCall.vipTag}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-extrabold animate-pulse">
                      Ringing Line...
                    </span>
                  </div>

                  {/* Multi-phone numbers */}
                  <div className="flex items-center gap-2 text-xs text-slate-200 flex-wrap">
                    <span className="font-mono text-emerald-300 font-extrabold">
                      Calling: {activeCall.callerNumber}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-semibold">
                      {activeCall.numberType === 'home' ? '🏠 Home Landline' : '📱 Mobile Line'}
                    </span>
                    {activeCall.mobileForSms !== activeCall.callerNumber && (
                      <span className="text-[11px] text-cyan-300 flex items-center gap-1 font-mono font-bold">
                        <span>(SMS Mobile: {activeCall.mobileForSms})</span>
                      </span>
                    )}
                  </div>

                  {/* Upcoming Reservation Screen-Pop */}
                  {activeCall.upcomingBookings.length > 0 && (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-200">
                        <CalendarIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-bold text-white">Upcoming Booking:</span>
                        <span className="truncate max-w-[280px] text-slate-200 font-medium">
                          {activeCall.upcomingBookings[0].time} to{' '}
                          {activeCall.upcomingBookings[0].dropoffAddress}
                        </span>
                      </div>
                      <span className="font-mono font-black text-emerald-400 shrink-0">
                        ${activeCall.upcomingBookings[0].fare.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Top Right Window Minimizer & Dismiss */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Minimize HUD"
                >
                  <span className="text-sm font-bold">_</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCall(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Dismiss"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Action Button Row */}
            <div className="mt-3.5 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAnswer}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/40 flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <PhoneIcon className="w-3.5 h-3.5" />
                  <span>Answer &amp; Dock</span>
                </button>

                <button
                  type="button"
                  onClick={handlePopulateBooking}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-md shadow-blue-600/40 flex items-center gap-2 active:scale-95 cursor-pointer"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>➕ Populate Booking ({activeCall.callerName.split(' ')[0]})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  workspaceBus.publish('CALL_ENDED', { durationSeconds: 0 });
                  setActiveCall(null);
                }}
                className="px-3 py-1.5 rounded-xl border border-rose-500/60 bg-rose-950/40 hover:bg-rose-900/60 text-rose-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Send to Voicemail
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
