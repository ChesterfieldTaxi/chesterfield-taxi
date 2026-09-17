import React, { useState, useEffect, useRef } from 'react';
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
import {
  PhoneIcon,
  CheckIcon,
  XIcon,
  CalendarIcon,
  PlusIcon,
  HomeModernIcon,
  DevicePhoneMobileIcon,
} from '../../ui/Icons';

interface DispatchHeaderCallHudProps {
  trips?: Trip[];
  onOpenBooking?: () => void;
  onOpenEditTrip?: (tripId: string) => void;
  onOpenComms?: (tab?: 'all' | 'phone' | 'messages' | 'voicemail', phone?: string) => void;
  onPopulateBooking?: (data: any) => void;
  missedCallsCount?: number;
}

export function DispatchHeaderCallHud({
  trips = [],
  onOpenBooking,
  onOpenEditTrip,
  onOpenComms,
  onPopulateBooking,
  missedCallsCount = 0,
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

  const [callState, setCallState] = useState<'incoming' | 'connected' | 'on_hold'>('incoming');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  // Dropdown visibility states
  const [showInboundFlydown, setShowInboundFlydown] = useState(false);
  const [showCallpadFlydown, setShowCallpadFlydown] = useState(false);

  // Callpad state
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeDialerStatus, setActiveDialerStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [dialerDuration, setDialerDuration] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
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
        setCallState('incoming');
        setCallDuration(0);
        setShowInboundFlydown(true);
        setShowCallpadFlydown(false);
      } else if (msg.type === 'CALL_ENDED') {
        setActiveCall(null);
        setShowInboundFlydown(false);
        setCallState('incoming');
        setCallDuration(0);
      }
    });

    return unsub;
  }, [workspaceBus]);

  // Connected call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeCall && callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeCall, callState]);

  // Outbound callpad duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeDialerStatus === 'connected') {
      interval = setInterval(() => {
        setDialerDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeDialerStatus]);

  // Close flydowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowInboundFlydown(false);
        setShowCallpadFlydown(false);
      }
    }
    if (showInboundFlydown || showCallpadFlydown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInboundFlydown, showCallpadFlydown]);

  // Handle answering call inside flydown (dock stays untouched)
  const handleAnswer = () => {
    if (!activeCall) return;
    setCallState('connected');
    workspaceBus.publish('CALL_ANSWERED', {
      callSid: activeCall.callSid,
      callerNumber: activeCall.callerNumber,
    });
  };

  // Handle ending call
  const handleEndCall = () => {
    if (!activeCall) return;
    workspaceBus.publish('CALL_ENDED', {
      durationSeconds: callDuration,
      callSid: activeCall.callSid,
    });
    setActiveCall(null);
    setShowInboundFlydown(false);
  };

  // Handle pre-populating booking form from caller CRM
  const handleNewBooking = () => {
    if (!activeCall) return;
    const payload = {
      passengerName: activeCall.callerName,
      passengerPhone: activeCall.mobileForSms,
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
    setShowInboundFlydown(false);
  };

  // Handle Quick Text to caller's mobile
  const handleQuickText = () => {
    if (!activeCall) return;
    if (onOpenComms) {
      onOpenComms('messages', activeCall.mobileForSms);
    }
    setShowInboundFlydown(false);
  };

  // Handle routing caller to voicemail
  const handleSendVoicemail = () => {
    if (!activeCall) return;
    workspaceBus.publish('CALL_ENDED', {
      callSid: activeCall.callSid,
    });
    setActiveCall(null);
    setShowInboundFlydown(false);
  };

  // Diagnostic simulator for dispatcher testing
  const handleSimulateInboundCall = () => {
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

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleDialerKeyPress = (key: string) => {
    setDialedNumber((prev) => prev + key);
  };

  const handleStartDialerCall = () => {
    if (!dialedNumber) return;
    setActiveDialerStatus('calling');
    setTimeout(() => {
      setActiveDialerStatus('connected');
    }, 1200);
  };

  const handleEndDialerCall = () => {
    setActiveDialerStatus('idle');
    setDialerDuration(0);
  };

  const [showMaintenanceTools, setShowMaintenanceTools] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={containerRef}>
      {/* RESTING STATE: Phone Icon Button with Missed Counter */}
      {!activeCall ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setShowCallpadFlydown((prev) => !prev);
              setShowInboundFlydown(false);
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
              showCallpadFlydown
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
            }`}
            title="Open Softphone Callpad"
            aria-label="Phone Callpad"
          >
            <PhoneIcon className="w-4 h-4" />
            {missedCallsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                {missedCallsCount}
              </span>
            )}
          </button>

          {/* CALLPAD FLYDOWN (Anchored Directly Below Call Icon) */}
          {showCallpadFlydown && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <PhoneIcon className="w-4 h-4 text-emerald-400" />
                  <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                    Callpad / Softphone
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCallpadFlydown(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Close callpad"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              {activeDialerStatus === 'idle' ? (
                <div className="p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Caller ID:</span>
                    <span className="font-bold text-slate-700">(314) 738-0100</span>
                  </div>

                  {/* Dialed Number Display */}
                  <div className="relative">
                    <input
                      type="text"
                      value={dialedNumber}
                      onChange={(e) => setDialedNumber(e.target.value)}
                      placeholder="Enter number..."
                      className="w-full text-center font-mono font-black text-lg py-2 px-8 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 tracking-wider focus:outline-blue-500"
                    />
                    {dialedNumber && (
                      <button
                        type="button"
                        onClick={() => setDialedNumber('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* 12-Key DTMF Dialpad */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { key: '1', sub: '' },
                      { key: '2', sub: 'ABC' },
                      { key: '3', sub: 'DEF' },
                      { key: '4', sub: 'GHI' },
                      { key: '5', sub: 'JKL' },
                      { key: '6', sub: 'MNO' },
                      { key: '7', sub: 'PQRS' },
                      { key: '8', sub: 'TUV' },
                      { key: '9', sub: 'WXYZ' },
                      { key: '*', sub: '' },
                      { key: '0', sub: '+' },
                      { key: '#', sub: '' },
                    ].map((btn) => (
                      <button
                        key={btn.key}
                        type="button"
                        onClick={() => handleDialerKeyPress(btn.key)}
                        className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-blue-100 active:scale-95 text-slate-800 font-bold transition-all flex flex-col items-center justify-center cursor-pointer shadow-2xs"
                      >
                        <span className="text-sm font-black leading-none">{btn.key}</span>
                        {btn.sub && (
                          <span className="text-[8px] text-slate-400 leading-none">{btn.sub}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Call Controls */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setDialedNumber((prev) => prev.slice(0, -1))}
                      disabled={!dialedNumber}
                      className="p-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex-1"
                    >
                      ⌫ Delete
                    </button>
                    <button
                      type="button"
                      onClick={handleStartDialerCall}
                      disabled={!dialedNumber.trim()}
                      className="p-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold transition-all cursor-pointer flex-2 flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </button>
                  </div>

                  {/* Maintenance & Diagnostics Section */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowMaintenanceTools((prev) => !prev)}
                      className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-600 font-semibold py-1 cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🛠️</span>
                        <span>Diagnostics & Simulation</span>
                      </span>
                      <span>{showMaintenanceTools ? '▲' : '▼'}</span>
                    </button>
                    {showMaintenanceTools && (
                      <div className="mt-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2 animate-in fade-in duration-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-medium">Inbound Call Screen Pop:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setShowCallpadFlydown(false);
                              handleSimulateInboundCall();
                            }}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Simulate inbound call for staff diagnostics"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Simulate Inbound</span>
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-tight">
                          Live Twilio voice is active. This simulation triggers local screen pops and caller matching without placing a phone call.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Active Outbound Call State */
                <div className="p-4 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto animate-pulse">
                    <PhoneIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 font-mono">{dialedNumber}</h4>
                    <p className="text-xs text-slate-500 font-medium">
                      {activeDialerStatus === 'calling'
                        ? 'Connecting...'
                        : `Connected • ${formatSecs(dialerDuration)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleEndDialerCall}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    End Call
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* INCOMING / IN-CALL STATE: Emerald Pulsing Pill */
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowInboundFlydown((prev) => !prev)}
            className="text-xs font-extrabold text-white px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400 ring-2 ring-emerald-300 animate-pulse transition-all cursor-pointer flex items-center gap-2 shadow-md"
            title="Incoming call active - click to open flydown"
          >
            <PhoneIcon className="w-3.5 h-3.5 animate-bounce" />
            <span>
              {callState === 'connected'
                ? `Active: ${activeCall.callerName} (${formatSecs(callDuration)})`
                : `Inbound: ${activeCall.callerName}`}
            </span>
          </button>

          {/* INBOUND CALL FLYDOWN (Anchored Directly Below Green Pill) */}
          {showInboundFlydown && (
            <div className="absolute right-0 mt-2 w-84 sm:w-96 bg-slate-950 text-white rounded-2xl shadow-2xl border-2 border-emerald-500 ring-4 ring-emerald-500/20 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                    {callState === 'connected' ? 'Call in Progress' : 'Inbound Screen Pop'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowInboundFlydown(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Dismiss HUD"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3.5">
                {/* Caller Profile */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <PhoneIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-white truncate">
                          {activeCall.callerName}
                        </span>
                        {activeCall.vipTag && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-black shrink-0">
                            ⭐ {activeCall.vipTag}
                          </span>
                        )}
                      </div>
                      {/* Compact Phone Icons (Home & Mobile) */}
                      <div className="flex items-center gap-3 text-xs text-slate-300 font-mono mt-1 flex-wrap">
                        <div className="flex items-center gap-1" title="Calling line (Landline/Home)">
                          <HomeModernIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-semibold">{activeCall.callerNumber}</span>
                        </div>
                        {activeCall.mobileForSms && (
                          <div className="flex items-center gap-1 text-cyan-300" title="Primary SMS Mobile">
                            <DevicePhoneMobileIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="font-semibold">{activeCall.mobileForSms}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-full shrink-0">
                    {callState === 'connected' ? formatSecs(callDuration) : 'Ringing...'}
                  </span>
                </div>

                {/* Clickable Upcoming Reservation Preview */}
                {activeCall.upcomingBookings.length > 0 && (
                  <div
                    onClick={() => {
                      if (onOpenEditTrip) {
                        onOpenEditTrip(activeCall.upcomingBookings[0].id);
                      }
                      setShowInboundFlydown(false);
                    }}
                    className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 hover:border-blue-400 transition-all cursor-pointer flex items-center justify-between text-xs group"
                    title="Click to open trip in edit tab"
                  >
                    <div className="flex items-center gap-2 text-slate-300 min-w-0">
                      <CalendarIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span className="font-bold text-white shrink-0">Upcoming:</span>
                      <span className="truncate text-slate-300 font-medium">
                        {activeCall.upcomingBookings[0].time} to{' '}
                        {activeCall.upcomingBookings[0].dropoffAddress}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-[11px] group-hover:underline shrink-0 ml-2">
                      Open Edit →
                    </span>
                  </div>
                )}

                {/* Active Connected Call In-Flight Controls */}
                {callState !== 'incoming' ? (
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setIsMuted(!isMuted)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isMuted
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {isMuted ? '🔇 Muted' : '🎤 Mute'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCallState((prev) => (prev === 'connected' ? 'on_hold' : 'connected'))
                        }
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          callState === 'on_hold'
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                        }`}
                      >
                        {callState === 'on_hold' ? '⏸ On Hold' : 'Hold'}
                      </button>
                      <button
                        type="button"
                        onClick={handleEndCall}
                        className="flex-1 py-2 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all cursor-pointer"
                      >
                        End Call
                      </button>
                    </div>

                    <div className="pt-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={handleNewBooking}
                        className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span>New Booking</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickText}
                        className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                        <span>Text</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Incoming 4 Action Buttons */
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={handleAnswer}
                      className="px-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      title="Answer call inline inside HUD"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span>Answer</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleNewBooking}
                      className="px-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      title="Create new booking pre-filled with caller CRM data"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      <span>New Booking</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickText}
                      className="px-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-black text-xs rounded-xl shadow-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      title="Send SMS text to caller's mobile number"
                    >
                      <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                      <span>Text</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendVoicemail}
                      className="px-2 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 hover:text-white font-black text-xs rounded-xl shadow-xs flex flex-col items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      title="Route caller directly to voicemail"
                    >
                      <span className="text-xs">🔴</span>
                      <span>Voicemail</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
