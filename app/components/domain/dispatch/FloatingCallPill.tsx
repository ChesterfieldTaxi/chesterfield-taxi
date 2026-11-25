import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LiveFleetDriver } from '../../../core/hooks/useDispatchFleet';
import { resolveCommsCrmContext } from '../../../core/services/comms/comms-templates.service';
import { getContactService, normalizePhone } from '../../../core/services/customer/contact.service';
import type { DriverRosterItem } from '../../../core/services/operator.service';
import { getWorkspaceBus } from '../../../core/services/workspace-bus.service';
import type { Trip } from '../../../core/types/trip';
import { formatDisplayPhone } from '../../../core/utils/phone';
import { ChatBubbleLeftRightIcon, KeypadGridIcon, MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, UserIcon } from '../../ui/Icons';

export const FLOATING_CALL_PILL_STORAGE_KEY = 'ct_floating_call_pill_pos_v1';
export const DEFAULT_FLOATING_CALL_PILL_POSITION = { top: 58, right: 16 } as const;

export interface FloatingCallPillPosition { top: number; right: number; }

const PILL_WIDTH_PX = 332;
const PILL_MIN_MARGIN_PX = 8;
const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

export function clampFloatingCallPillPosition(
  raw: Partial<FloatingCallPillPosition> | null | undefined,
  viewport: { width: number; height: number }
): FloatingCallPillPosition {
  const safeW = Math.max(360, Number.isFinite(viewport.width) ? viewport.width : 1280);
  const safeH = Math.max(240, Number.isFinite(viewport.height) ? viewport.height : 800);
  const rawTop = typeof raw?.top === 'number' && Number.isFinite(raw.top) ? raw.top : DEFAULT_FLOATING_CALL_PILL_POSITION.top;
  const rawRight = typeof raw?.right === 'number' && Number.isFinite(raw.right) ? raw.right : DEFAULT_FLOATING_CALL_PILL_POSITION.right;
  const maxRight = Math.max(PILL_MIN_MARGIN_PX, safeW - PILL_WIDTH_PX - PILL_MIN_MARGIN_PX);
  const maxTop = Math.max(PILL_MIN_MARGIN_PX, safeH - 84);
  return {
    top: Math.round(Math.max(PILL_MIN_MARGIN_PX, Math.min(rawTop, maxTop))),
    right: Math.round(Math.max(PILL_MIN_MARGIN_PX, Math.min(rawRight, maxRight))),
  };
}

export function parseStoredFloatingCallPillPosition(
  rawJson: string | null | undefined,
  viewport: { width: number; height: number }
): FloatingCallPillPosition | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Number.isFinite(parsed.top) && !Number.isFinite(parsed.right)) return null;
    return clampFloatingCallPillPosition(parsed, viewport);
  } catch {
    return null;
  }
}

export function serializeFloatingCallPillPosition(pos: FloatingCallPillPosition): string {
  return JSON.stringify({ top: Math.round(pos.top), right: Math.round(pos.right) });
}

export function formatFloatingCallTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(safe / 60).toString().padStart(2, '0');
  const s = (safe % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export interface FloatingCallPillProps {
  incomingCallAlert: { from: string; callSid?: string } | null;
  activeCallStatus: 'idle' | 'calling' | 'connected' | 'on_hold';
  activeCallMeta: { contactName: string; phoneNumber: string; duration: number } | null;
  callDuration: number;
  dialedNumber?: string;
  trips?: Trip[];
  drivers?: ReadonlyArray<LiveFleetDriver | DriverRosterItem>;
  initialMuted?: boolean;
  initialKeypadOpen?: boolean;
  onDismissIncomingCallAlert?: () => void;
}

export function FloatingCallPill({
  incomingCallAlert,
  activeCallStatus,
  activeCallMeta,
  callDuration,
  dialedNumber = '',
  trips = [],
  drivers = [],
  initialMuted = false,
  initialKeypadOpen = false,
  onDismissIncomingCallAlert,
}: FloatingCallPillProps) {
  const [pos, setPos] = useState<FloatingCallPillPosition>(DEFAULT_FLOATING_CALL_PILL_POSITION);
  const [isMuted, setIsMuted] = useState<boolean>(initialMuted);
  const [isKeypadOpen, setIsKeypadOpen] = useState<boolean>(initialKeypadOpen);
  const [contactsVersion, setContactsVersion] = useState(0);
  const posRef = useRef<FloatingCallPillPosition>(pos);
  posRef.current = pos;

  const isRinging = Boolean(incomingCallAlert);
  const isLiveCall = !isRinging && activeCallStatus !== 'idle';

  useEffect(() => getContactService().subscribe(() => setContactsVersion((v) => v + 1)), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      const vp = { width: window.innerWidth, height: window.innerHeight };
      try {
        const stored = parseStoredFloatingCallPillPosition(localStorage.getItem(FLOATING_CALL_PILL_STORAGE_KEY), vp);
        setPos((prev) => stored || clampFloatingCallPillPosition(prev, vp));
      } catch {
        setPos((prev) => clampFloatingCallPillPosition(prev, vp));
      }
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const bus = getWorkspaceBus();
    return bus.subscribe((msg) => {
      if (msg.type === 'CALL_MUTE_CHANGED') setIsMuted(Boolean(msg.payload.isMuted));
      else if (msg.type === 'CALL_ENDED') {
        setIsMuted(false);
        setIsKeypadOpen(false);
      }
    });
  }, []);

  const rawPhone = isRinging ? incomingCallAlert?.from || '' : activeCallMeta?.phoneNumber || dialedNumber || '';

  const callerInfo = useMemo(() => {
    const clean = normalizePhone(rawPhone);
    const contact = rawPhone ? getContactService().getContactByPhone(rawPhone) : null;
    const matchedDriver = clean ? drivers.find((d) => normalizePhone(d.phone) === clean) : undefined;
    const crm = rawPhone
      ? resolveCommsCrmContext({ phone: rawPhone, contactNameHint: activeCallMeta?.contactName, contact, trips, drivers: drivers as any[] })
      : null;
    const formattedPhone = rawPhone ? formatDisplayPhone(rawPhone) : 'Unknown Line';
    const resolvedName =
      contact?.name ||
      (matchedDriver ? `${matchedDriver.name}${matchedDriver.cabNumber ? ` (#${matchedDriver.cabNumber})` : ''}` : '') ||
      (crm?.hasKnownContext && crm.contactName !== 'Unknown Caller' ? crm.contactName : '') ||
      (activeCallMeta?.contactName && activeCallMeta.contactName !== rawPhone ? activeCallMeta.contactName : '') ||
      formattedPhone;

    const badge: 'Blacklist' | 'VIP' | 'Driver' | null =
      contact?.isBlacklisted || crm?.isBlacklisted
        ? 'Blacklist'
        : matchedDriver || crm?.isDriver
        ? 'Driver'
        : contact?.isVip || crm?.isVip
        ? 'VIP'
        : null;

    return { resolvedName, formattedPhone, badge };
  }, [rawPhone, activeCallMeta?.contactName, trips, drivers, contactsVersion]);

  const handleDragStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement | null)?.closest('button, input, a') || typeof window === 'undefined') return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = posRef.current;

    const onMove = (ev: MouseEvent) => {
      const next = clampFloatingCallPillPosition(
        { top: startPos.top + (ev.clientY - startY), right: startPos.right - (ev.clientX - startX) },
        { width: window.innerWidth, height: window.innerHeight }
      );
      posRef.current = next;
      setPos(next);
    };
    const onUp = () => {
      try {
        localStorage.setItem(FLOATING_CALL_PILL_STORAGE_KEY, serializeFloatingCallPillPosition(posRef.current));
      } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  if (!isRinging && !isLiveCall) return null;

  const bus = getWorkspaceBus();
  const effectiveSecs = activeCallMeta?.duration ?? callDuration;
  const badgeCls =
    callerInfo.badge === 'Blacklist' ? 'bg-rose-500 text-white' : callerInfo.badge === 'VIP' ? 'bg-amber-400 text-slate-950' : 'bg-sky-400 text-slate-950';
  const openProfile = () =>
    bus.publish('OPEN_CLIENT_PROFILE', { phone: rawPhone || undefined, name: callerInfo.resolvedName, source: 'floating_call_pill' });

  const pillNode = (
    <div
      data-floating-call-pill={isRinging ? 'ringing' : 'live'}
      onMouseDown={handleDragStart}
      style={{ top: `${pos.top}px`, right: `${pos.right}px` }}
      className="fixed z-[260] w-[332px] max-w-[calc(100vw-24px)] rounded-2xl bg-slate-950/95 text-white border border-slate-700/90 shadow-2xl backdrop-blur-md px-3 py-2.5 select-none cursor-grab active:cursor-grabbing transition-all duration-200"
    >
      {isRinging ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
              <span className="w-6 h-6 rounded-full bg-emerald-400/40 animate-ping absolute" />
              <PhoneIcon className="w-4 h-4 text-emerald-400 relative" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-extrabold text-white truncate">{callerInfo.resolvedName}</span>
                {callerInfo.badge && <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase shrink-0 ${badgeCls}`}>{callerInfo.badge}</span>}
              </div>
              <div className="text-[10.5px] font-mono text-emerald-300 truncate">Incoming · {callerInfo.formattedPhone}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={openProfile} className="py-1.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer">
              <UserIcon className="w-3 h-3 text-blue-400 shrink-0" />
              <span>Profile</span>
            </button>
            <button type="button" onClick={() => { bus.publish('REJECT_INCOMING_CALL', {}); onDismissIncomingCallAlert?.(); }} className="py-1.5 px-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-extrabold cursor-pointer">
              Decline
            </button>
            <button type="button" onClick={() => { bus.publish('ANSWER_INCOMING_CALL', {}); onDismissIncomingCallAlert?.(); }} className="py-1.5 px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-black shadow-sm cursor-pointer">
              Answer
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 shrink-0">
              <span className={`w-2 h-2 rounded-full ${activeCallStatus === 'calling' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
              <span className="text-[11px] font-mono font-extrabold text-emerald-300 tabular-nums">● {formatFloatingCallTimer(effectiveSecs)}</span>
            </div>
            <div className="min-w-0 flex-1 flex items-center justify-end gap-1.5">
              <span className="text-xs font-extrabold text-white truncate" title={callerInfo.formattedPhone}>{callerInfo.resolvedName}</span>
              {callerInfo.badge && <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase shrink-0 ${badgeCls}`}>{callerInfo.badge}</span>}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1">
            <button
              type="button"
              onClick={() => { const next = !isMuted; setIsMuted(next); bus.publish('TOGGLE_CALL_MUTE', { muted: next }); }}
              className={`py-1.5 px-1 rounded-xl text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer ${isMuted ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}
              title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ? <MicOffIcon className="w-3 h-3 shrink-0" /> : <MicIcon className="w-3 h-3 shrink-0" />}
              <span>Mute</span>
            </button>
            <button
              type="button"
              onClick={() => setIsKeypadOpen((v) => !v)}
              className={`py-1.5 px-1 rounded-xl text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer ${isKeypadOpen ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'}`}
              title="Toggle DTMF Keypad"
            >
              <KeypadGridIcon className="w-3 h-3 shrink-0" />
              <span>Keypad</span>
            </button>
            <button type="button" onClick={openProfile} className="py-1.5 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer" title="Open Client Profile">
              <UserIcon className="w-3 h-3 shrink-0" />
              <span>Profile</span>
            </button>
            <button type="button" onClick={() => bus.publish('OPEN_COMMS_THREAD', { phone: rawPhone || undefined, tab: 'all' })} className="py-1.5 px-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold flex items-center justify-center gap-0.5 cursor-pointer" title="Open Conversation Thread">
              <ChatBubbleLeftRightIcon className="w-3 h-3 shrink-0" />
              <span>Thread</span>
            </button>
            <button type="button" onClick={() => bus.publish('CALL_ENDED', { durationSeconds: effectiveSecs })} className="py-1.5 px-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center gap-0.5 cursor-pointer shadow-sm" title="End Call">
              <PhoneOffIcon className="w-3 h-3 shrink-0" />
              <span>End</span>
            </button>
          </div>

          {isKeypadOpen && (
            <div className="pt-1.5 border-t border-slate-800 grid grid-cols-3 gap-1">
              {DTMF_KEYS.map((digit) => (
                <button key={digit} type="button" onClick={() => bus.publish('SEND_CALL_DTMF', { digit })} className="py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 active:bg-blue-600 text-white font-mono font-bold text-xs cursor-pointer">
                  {digit}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' && document.body
    ? (createPortal(pillNode, document.body) as unknown as React.ReactElement)
    : pillNode;
}
