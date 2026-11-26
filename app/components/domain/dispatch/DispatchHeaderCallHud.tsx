import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getContactService, normalizePhone } from '../../../core/services/customer/contact.service';
import { getLatestSoftphoneViewState, getWorkspaceBus, type UpcomingBookingPreview, type WorkspaceMessage } from '../../../core/services/workspace-bus.service';
import type { Trip } from '../../../core/types/trip';
import { formatDisplayPhone } from '../../../core/utils/phone';
import { CalendarIcon, CarIcon, ExternalLinkIcon, KeypadGridIcon, MicIcon, MicOffIcon, PauseIcon, PhoneIcon, PhoneOffIcon, PlayIcon, PlusIcon, XIcon } from '../../ui/Icons';

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

export interface DispatchHeaderCallHudProps {
  trips?: Trip[];
  drivers?: ReadonlyArray<{ id: string; name: string; cabNumber?: string; phone?: string }>;
  onOpenBooking?: () => void;
  onOpenEditTrip?: (tripId: string) => void;
  onOpenComms?: (tab?: 'all' | 'phone' | 'messages' | 'voicemail', phone?: string) => void;
  onPopulateBooking?: (data: any) => void;
  missedCallsCount?: number;
  isPhoneDockActive?: boolean;
  activeDockTab?: string;
  commsActiveTab?: string;
  commsCallsSubTab?: string;
  incomingCallAlert?: { from: string; callSid?: string; callerName?: string } | null;
  onDismissIncomingCallAlert?: () => void;
  activeCallStatus?: 'idle' | 'calling' | 'connected' | 'on_hold';
  activeCallMeta?: { contactName: string; phoneNumber: string; duration?: number; callSid?: string } | null;
  callDuration?: number;
  initialMuted?: boolean;
  initialKeypadOpen?: boolean;
  initialFlydownOpen?: boolean;
  onTogglePhoneDock?: () => void;
  hideIdleButtonOnDesktop?: boolean;
}

interface InternalCallState {
  callSid?: string;
  callerNumber: string;
  callerName?: string;
  upcomingBookings: UpcomingBookingPreview[];
  vipTag?: string;
  mode: 'incoming' | 'calling' | 'connected' | 'on_hold';
}

export function formatHudCallTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function DispatchHeaderCallHud({
  trips = [], drivers = [], onOpenBooking, onOpenEditTrip, onOpenComms, onPopulateBooking,
  missedCallsCount = 0, isPhoneDockActive = false, activeDockTab,
  commsActiveTab: propCommsActiveTab, commsCallsSubTab: propCommsCallsSubTab,
  incomingCallAlert, onDismissIncomingCallAlert, activeCallStatus = 'idle', activeCallMeta,
  callDuration: propCallDuration = 0, initialMuted = false, initialKeypadOpen = false,
  initialFlydownOpen, onTogglePhoneDock, hideIdleButtonOnDesktop = false,
}: DispatchHeaderCallHudProps) {
  const workspaceBus = getWorkspaceBus();
  const containerRef = useRef<HTMLDivElement>(null);

  const [busCall, setBusCall] = useState<InternalCallState | null>(null);
  const [localDuration, setLocalDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isOnHold, setIsOnHold] = useState(activeCallStatus === 'on_hold');
  const [showDtmfKeypad, setShowDtmfKeypad] = useState(initialKeypadOpen);
  const [flydownOverride, setFlydownOverride] = useState<boolean | null>(
    typeof initialFlydownOpen === 'boolean' ? initialFlydownOpen : null
  );
  const initialBusView = getLatestSoftphoneViewState();
  const [hasLiveBusState, setHasLiveBusState] = useState<boolean>(Boolean(initialBusView));
  const [liveCommsTab, setLiveCommsTab] = useState<string>(initialBusView?.activeTab || propCommsActiveTab || 'all');
  const [liveCallsSubTab, setLiveCallsSubTab] = useState<string>(initialBusView?.callsSubTab || propCommsCallsSubTab || 'history');

  useEffect(() => { if (!hasLiveBusState && propCommsActiveTab) setLiveCommsTab(propCommsActiveTab); }, [hasLiveBusState, propCommsActiveTab]);
  useEffect(() => { if (!hasLiveBusState && propCommsCallsSubTab) setLiveCallsSubTab(propCommsCallsSubTab); }, [hasLiveBusState, propCommsCallsSubTab]);

  const latestBusView = getLatestSoftphoneViewState();
  const useLiveBus = hasLiveBusState || Boolean(latestBusView);
  const commsActiveTab = useLiveBus ? (hasLiveBusState ? liveCommsTab : latestBusView!.activeTab) : (propCommsActiveTab || liveCommsTab);
  const commsCallsSubTab = useLiveBus ? (hasLiveBusState ? liveCallsSubTab : latestBusView!.callsSubTab) : (propCommsCallsSubTab || liveCallsSubTab);
  const isKeypadTabVisible = Boolean(isPhoneDockActive && commsActiveTab === 'phone' && commsCallsSubTab === 'keypad');

  const prevContextKeyRef = useRef('');
  const contextKey = `${Boolean(incomingCallAlert)}_${activeCallStatus}_${Boolean(busCall)}_${isPhoneDockActive}_${isKeypadTabVisible}_${activeDockTab || ''}`;
  if (prevContextKeyRef.current && prevContextKeyRef.current !== contextKey && initialFlydownOpen === undefined) {
    prevContextKeyRef.current = contextKey;
    if (flydownOverride !== null) setFlydownOverride(null);
  } else {
    prevContextKeyRef.current = contextKey;
  }

  useEffect(() => workspaceBus.subscribe((msg: WorkspaceMessage) => {
    if (msg.type === 'SOFTPHONE_VIEW_STATE_CHANGED') {
      setHasLiveBusState(true);
      setLiveCommsTab(msg.payload.activeTab);
      setLiveCallsSubTab(msg.payload.callsSubTab);
      setFlydownOverride(null);
    } else if (msg.type === 'INCOMING_CALL') {
      setBusCall({ callSid: msg.payload.callSid, callerNumber: msg.payload.from, upcomingBookings: [], mode: 'incoming' });
      setLocalDuration(0);
      setFlydownOverride(true);
    } else if (msg.type === 'CALL_INCOMING') {
      setBusCall({
        callSid: msg.payload.callSid, callerNumber: msg.payload.callerNumber, callerName: msg.payload.callerName,
        upcomingBookings: msg.payload.upcomingBookings || [], vipTag: msg.payload.vipTag, mode: 'incoming',
      });
      setLocalDuration(0);
      setFlydownOverride(true);
    } else if (msg.type === 'INCOMING_CALL_DISMISSED') {
      setBusCall((prev) => (prev?.mode === 'incoming' ? null : prev));
    } else if (msg.type === 'CALL_OUTBOUND_STARTED') {
      setBusCall({ callSid: msg.payload.callSid, callerNumber: msg.payload.targetNumber, callerName: msg.payload.contactName, upcomingBookings: [], mode: 'calling' });
      setLocalDuration(0);
      setIsOnHold(false);
      setFlydownOverride(null);
    } else if (msg.type === 'CALL_ANSWERED') {
      setBusCall((prev) => ({
        callSid: msg.payload.callSid || prev?.callSid, callerNumber: msg.payload.callerNumber || prev?.callerNumber || '',
        callerName: prev?.callerName, upcomingBookings: prev?.upcomingBookings || [], vipTag: prev?.vipTag, mode: 'connected',
      }));
      setIsOnHold(false);
      setFlydownOverride(null);
    } else if (msg.type === 'CALL_MUTE_CHANGED') {
      setIsMuted(Boolean(msg.payload?.isMuted));
    } else if (msg.type === 'CALL_ENDED') {
      setBusCall(null); setLocalDuration(0); setIsMuted(false); setIsOnHold(false); setShowDtmfKeypad(false); setFlydownOverride(null);
    }
  }), [workspaceBus]);

  const effectiveCall = useMemo<InternalCallState | null>(() => {
    if (incomingCallAlert?.from) {
      return {
        callSid: incomingCallAlert.callSid, callerNumber: incomingCallAlert.from, callerName: incomingCallAlert.callerName,
        upcomingBookings: busCall?.upcomingBookings || [], vipTag: busCall?.vipTag, mode: 'incoming',
      };
    }
    if (busCall) return isOnHold && busCall.mode !== 'incoming' ? { ...busCall, mode: 'on_hold' } : busCall;
    if (activeCallStatus !== 'idle' && activeCallMeta) {
      return {
        callSid: activeCallMeta.callSid, callerNumber: activeCallMeta.phoneNumber, callerName: activeCallMeta.contactName,
        upcomingBookings: [], mode: isOnHold ? 'on_hold' : activeCallStatus,
      };
    }
    return null;
  }, [incomingCallAlert, busCall, activeCallStatus, activeCallMeta, isOnHold]);

  useEffect(() => {
    if (!effectiveCall || effectiveCall.mode === 'incoming') return;
    const t = setInterval(() => setLocalDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [effectiveCall?.mode, effectiveCall?.callerNumber]);

  const callerMeta = useMemo(() => {
    if (!effectiveCall) return null;
    const rawNum = effectiveCall.callerNumber || '';
    const norm = normalizePhone(rawNum);
    const contact = rawNum ? getContactService().getContactByPhone(rawNum) : null;
    const drv = norm ? drivers.find((d) => normalizePhone(d.phone || '') === norm) : undefined;
    const matchedTrip = norm
      ? trips.find((t) => normalizePhone(t.passenger?.phone || '') === norm && !['completed', 'cancelled', 'declined'].includes(String(t.status)))
      : undefined;
    const displayPhone = rawNum ? formatDisplayPhone(rawNum) : '';
    const resolvedName =
      contact?.name ||
      (drv ? `${drv.name}${drv.cabNumber ? ` (#${drv.cabNumber})` : ''}` : '') ||
      (effectiveCall.callerName && effectiveCall.callerName !== rawNum ? effectiveCall.callerName : '') ||
      (matchedTrip ? `${matchedTrip.passenger?.firstName || ''} ${matchedTrip.passenger?.lastName || ''}`.trim() : '') ||
      displayPhone || 'Caller';
    return {
      callerNumber: rawNum, displayPhone, callerName: resolvedName,
      isVip: Boolean(contact?.isVip || effectiveCall.vipTag),
      isBlacklisted: Boolean(contact?.isBlacklisted),
      isDriver: Boolean(drv), contact, upcomingTrip: matchedTrip,
    };
  }, [effectiveCall, drivers, trips]);

  const isIncoming = effectiveCall?.mode === 'incoming';
  const isSwitchedToOtherDock = activeDockTab === 'email' || activeDockTab === 'drivers' || activeDockTab === 'alerts';
  const defaultFlydownOpen = isIncoming ? true : !isPhoneDockActive && !isSwitchedToOtherDock;
  const showFlydown = Boolean(effectiveCall && (flydownOverride !== null ? flydownOverride : defaultFlydownOpen));

  useEffect(() => {
    if (!showFlydown) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setFlydownOverride(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [showFlydown]);

  if (effectiveCall && !isIncoming && isKeypadTabVisible) return null;

  if (!effectiveCall || !callerMeta) {
    return (
      <div className={`relative inline-flex items-center ${hideIdleButtonOnDesktop ? 'lg:hidden' : ''}`} ref={containerRef}>
        <button
          type="button" onClick={onTogglePhoneDock} title="Phone & Messages Hub (Alt+P)" aria-label="Phone"
          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
            isPhoneDockActive ? 'bg-blue-600 text-white shadow-md' : 'text-fg-secondary hover:text-fg-primary hover:bg-surface-muted bg-surface-card border border-border-subtle shadow-2xs'
          }`}
        >
          <PhoneIcon className="w-4 h-4" />
          {missedCallsCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">{missedCallsCount}</span>
          )}
        </button>
      </div>
    );
  }

  const effectiveSecs = propCallDuration > 0 ? propCallDuration : activeCallMeta?.duration ?? localDuration;
  const timerLabel = formatHudCallTimer(effectiveSecs);

  const openKeypadInDock = () => {
    onOpenComms?.('phone', callerMeta.callerNumber);
    workspaceBus.publish('OPEN_SOFTPHONE_KEYPAD', {});
    setFlydownOverride(false);
  };

  const handleBook = () => {
    const c = callerMeta.contact;
    const payload = {
      passengerName: c?.name || (callerMeta.callerName !== callerMeta.displayPhone ? callerMeta.callerName : ''),
      passengerPhone: c?.phone || callerMeta.callerNumber, phone: c?.phone || callerMeta.callerNumber,
      passengerEmail: c?.email || '', pickupAddress: c?.homeAddress || effectiveCall.upcomingBookings[0]?.pickupAddress || '',
      dropoffAddress: c?.workAddress && c?.homeAddress ? c.workAddress : '',
      corporateAccount: c?.corporateAccountName || '', billingPo: c?.defaultPoNumber || '',
    };
    workspaceBus.publish('POPULATE_BOOKING', payload);
    onPopulateBooking?.(payload);
    onOpenBooking?.();
    setFlydownOverride(false);
  };

  const handleOpenTrips = () => {
    workspaceBus.publish('OPEN_CLIENT_PROFILE', {
      phone: callerMeta.callerNumber || undefined, email: callerMeta.contact?.email || undefined,
      name: callerMeta.callerName || undefined, initialTab: 'trips', source: 'header_call_hud',
    });
    setFlydownOverride(false);
  };

  const handleAnswer = () => {
    workspaceBus.publish('ANSWER_INCOMING_CALL', {});
    onDismissIncomingCallAlert?.();
    setBusCall((prev) => (prev ? { ...prev, mode: 'connected' } : null));
  };

  const handleDecline = () => {
    workspaceBus.publish('REJECT_INCOMING_CALL', {});
    onDismissIncomingCallAlert?.();
    setBusCall(null);
    setFlydownOverride(null);
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    workspaceBus.publish('TOGGLE_CALL_MUTE', { muted: next });
  };

  const handleEndCall = () => {
    workspaceBus.publish('CALL_ENDED', { durationSeconds: effectiveSecs, callSid: effectiveCall.callSid });
    setBusCall(null); setShowDtmfKeypad(false); setFlydownOverride(null);
  };

  const hudStateAttr = isIncoming ? 'incoming' : !isPhoneDockActive && !isSwitchedToOtherDock ? 'active-dock-closed' : 'active-compact';

  return (
    <div className="relative inline-flex items-center gap-1" ref={containerRef} data-call-hud-state={hudStateAttr}>
      <div className="inline-flex items-center rounded-xl bg-emerald-600 text-white shadow-md border border-emerald-500 overflow-hidden">
        <button type="button" data-call-hud-pill="true" onClick={() => setFlydownOverride(!showFlydown)} title="Toggle call controls flydown" className="px-2.5 py-1.5 text-xs font-extrabold hover:bg-emerald-500 transition-colors cursor-pointer inline-flex items-center gap-1.5">
          <PhoneIcon className={`w-3.5 h-3.5 shrink-0 ${isIncoming ? 'animate-bounce' : ''}`} />
          <span className="truncate max-w-[180px]">{isIncoming ? `Inbound · ${callerMeta.callerName}` : `● ${timerLabel} · ${callerMeta.callerName}`}</span>
        </button>
        {!isIncoming && (
          <button type="button" data-maximize-keypad-btn="true" onClick={(e) => { e.stopPropagation(); openKeypadInDock(); }} title="Maximize to Phone Keypad" aria-label="Maximize to Phone Keypad" className="px-2 py-1.5 border-l border-emerald-500/70 hover:bg-emerald-500 text-emerald-50 cursor-pointer">
            <ExternalLinkIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {showFlydown && (
        <div data-call-hud-flydown="true" className="absolute right-0 top-full mt-2 w-80 sm:w-92 bg-surface-header text-white rounded-2xl shadow-2xl border border-emerald-500/80 z-50 overflow-hidden">
          <div className="px-3 py-2 bg-surface-header border-b border-border-header flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">{isIncoming ? 'Incoming Call' : 'Call in Progress'}</span>
            <button type="button" onClick={() => setFlydownOverride(false)} className="p-1 rounded-lg text-fg-subtle hover:text-white hover:bg-surface-header-elevated cursor-pointer" title="Minimize"><XIcon className="w-3.5 h-3.5" /></button>
          </div>

          <div className="p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-sm text-white truncate">{callerMeta.callerName}</span>
                  {callerMeta.isBlacklisted && <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black uppercase">Blocked</span>}
                  {callerMeta.isVip && <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase">VIP</span>}
                  {callerMeta.isDriver && <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[9px] font-bold">Driver</span>}
                </div>
                {callerMeta.displayPhone && <p className="font-mono text-[11px] text-fg-subtle">{callerMeta.displayPhone}</p>}
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono font-bold text-[11px] shrink-0">
                {isIncoming ? 'Ringing...' : effectiveCall.mode === 'calling' ? 'Calling...' : timerLabel}
              </span>
            </div>

            {callerMeta.upcomingTrip && onOpenEditTrip && (
              <button type="button" onClick={() => { onOpenEditTrip(callerMeta.upcomingTrip!.id); setFlydownOverride(false); }} className="w-full px-2.5 py-1.5 rounded-xl bg-surface-header hover:bg-surface-header-elevated border border-border-header flex items-center justify-between gap-2 text-[11px] cursor-pointer">
                <span className="inline-flex items-center gap-1.5 truncate text-fg-on-header"><CalendarIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" /><span className="truncate">Upcoming #{callerMeta.upcomingTrip.id.slice(-6).toUpperCase()}</span></span>
                <span className="text-emerald-400 font-bold shrink-0">Edit →</span>
              </button>
            )}

            {isIncoming ? (
              <div className="space-y-2 pt-1 border-t border-border-header">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleAnswer} className="py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"><PhoneIcon className="w-3.5 h-3.5" /><span>Answer</span></button>
                  <button type="button" onClick={handleDecline} className="py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black inline-flex items-center justify-center gap-1.5 cursor-pointer"><PhoneOffIcon className="w-3.5 h-3.5" /><span>Decline</span></button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={handleBook} className="py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><PlusIcon className="w-3 h-3" /><span>Book</span></button>
                  <button type="button" onClick={handleOpenTrips} className="py-1.5 rounded-lg bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><CarIcon className="w-3 h-3 text-blue-400" /><span>Trips</span></button>
                  <button type="button" onClick={openKeypadInDock} className="py-1.5 rounded-lg bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><PhoneIcon className="w-3 h-3 text-emerald-400" /><span>Phone Dock</span></button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1 border-t border-border-header">
                {showDtmfKeypad && (
                  <div className="grid grid-cols-3 gap-1 bg-surface-header p-1.5 rounded-xl border border-border-header">
                    {DTMF_KEYS.map((digit) => (
                      <button key={digit} type="button" onClick={() => workspaceBus.publish('SEND_CALL_DTMF', { digit })} className="py-1 rounded-lg bg-surface-header-elevated hover:bg-surface-header-muted text-white font-mono font-bold text-xs cursor-pointer">{digit}</button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  <button type="button" onClick={handleToggleMute} className={`py-1.5 rounded-xl font-bold flex flex-col items-center gap-0.5 text-[11px] cursor-pointer ${isMuted ? 'bg-amber-600 text-white' : 'bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header'}`}>
                    {isMuted ? <MicOffIcon className="w-3.5 h-3.5" /> : <MicIcon className="w-3.5 h-3.5" />}<span>{isMuted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button type="button" onClick={() => setIsOnHold((v) => !v)} className={`py-1.5 rounded-xl font-bold flex flex-col items-center gap-0.5 text-[11px] cursor-pointer ${effectiveCall.mode === 'on_hold' ? 'bg-amber-500 text-slate-950' : 'bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header'}`}>
                    {effectiveCall.mode === 'on_hold' ? <PlayIcon className="w-3.5 h-3.5" /> : <PauseIcon className="w-3.5 h-3.5" />}<span>Hold</span>
                  </button>
                  <button type="button" onClick={() => setShowDtmfKeypad((v) => !v)} className={`py-1.5 rounded-xl font-bold flex flex-col items-center gap-0.5 text-[11px] cursor-pointer ${showDtmfKeypad ? 'bg-blue-600 text-white' : 'bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header'}`}>
                    <KeypadGridIcon className="w-3.5 h-3.5" /><span>Keypad</span>
                  </button>
                  <button type="button" onClick={handleEndCall} className="py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold flex flex-col items-center gap-0.5 text-[11px] cursor-pointer">
                    <PhoneOffIcon className="w-3.5 h-3.5" /><span>End Call</span>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={handleBook} className="py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><PlusIcon className="w-3 h-3" /><span>Book</span></button>
                  <button type="button" onClick={handleOpenTrips} className="py-1.5 rounded-lg bg-surface-header-elevated hover:bg-surface-header-muted text-fg-on-header font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><CarIcon className="w-3 h-3 text-blue-400" /><span>Trips</span></button>
                  <button type="button" onClick={openKeypadInDock} className="py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold inline-flex items-center justify-center gap-1 cursor-pointer"><PhoneIcon className="w-3 h-3" /><span>Open Phone Dock</span></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
