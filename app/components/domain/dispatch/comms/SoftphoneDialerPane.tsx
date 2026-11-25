import type React from 'react';
import type { CommsCrmContextSummary } from '../../../../core/services/comms/comms-templates.service';
import { getWorkspaceBus, type UpcomingBookingPreview, type WorkspaceEventMap } from '../../../../core/services/workspace-bus.service';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import { KeypadGridIcon, MicIcon, MicOffIcon, PauseIcon, PhoneIcon, PhoneOffIcon, PlayIcon, SpinnerIcon, UserIcon } from '../../../ui/Icons';
import { formatCallTimer, getClientTelephonyCredentials, type CallNotice, type CallStatus, type SoftphoneStatus } from './comms-types';

export { AgentPhoneSetupModal, type AgentPhoneSetupModalProps } from './CommsModals';

const DTMF_DIALPAD_KEYS: ReadonlyArray<{ key: string; sub: string }> = [
  { key: '1', sub: '' }, { key: '2', sub: 'ABC' }, { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' }, { key: '5', sub: 'JKL' }, { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' }, { key: '8', sub: 'TUV' }, { key: '9', sub: 'WXYZ' },
  { key: '*', sub: '' }, { key: '0', sub: '+' }, { key: '#', sub: '' },
];

export interface SoftphoneDialerPaneProps {
  callStatus: CallStatus;
  bookingToast: string | null;
  activeCallContact: string | null;
  activeCallPhone: string | null;
  dialpadNumber: string;
  onChangeDialpadNumber: (val: string) => void;
  dialpadInputRef: React.RefObject<HTMLInputElement | null>;
  callTimer: number;
  isMuted: boolean;
  callNotice: CallNotice | null;
  showInCallKeypad: boolean;
  onToggleInCallKeypad: () => void;
  onInCallBookRide: () => void;
  onInCallSendLink: () => void;
  matchingCallerTrips?: UpcomingBookingPreview[];
  onEditCallerTrip?: (tripId: string) => void;
  onSendInCallDtmf: (digit: string) => void;
  onToggleMute: () => void;
  onToggleHold: () => void;
  onEndCall: () => void;
  softphoneStatus: SoftphoneStatus;
  operatorPhoneInput: string;
  onChangeOperatorPhoneInput: (val: string) => void;
  isEditingOperatorPhone: boolean;
  onToggleEditingOperatorPhone: () => void;
  onSaveOperatorPhone: () => void;
  onCancelEditingOperatorPhone: () => void;
  activeKeypadFeedback: string | null;
  onDialDigit: (digit: string) => void;
  onDeleteDialDigit: () => void;
  onClearDialpad: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  drivers: any[];
  callerCrmContext?: CommsCrmContextSummary | null;
  onRebookCallerRide?: (payload: WorkspaceEventMap['POPULATE_BOOKING']) => void;
  onSelectThread?: (selectorTarget: string) => void;
  onBackToHistory?: () => void;
}

function CallerQuickChip({
  crm, dark = false, onBook, onSelectThread,
}: {
  crm?: CommsCrmContextSummary | null;
  dark?: boolean;
  onBook: () => void;
  onSelectThread?: (target: string) => void;
}) {
  if (!crm || !crm.hasKnownContext) return null;
  const selector = crm.primaryPhone || crm.primaryEmail || crm.threadId || '';
  return (
    <div className={`rounded-xl px-2.5 py-1.5 border flex items-center justify-between gap-2 text-xs ${dark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-extrabold truncate">{crm.contactName}</span>
        {crm.isBlacklisted ? (
          <span className="px-1.5 rounded bg-rose-100 text-rose-800 text-[9px] font-black uppercase shrink-0">Blocked</span>
        ) : crm.isVip ? (
          <span className="px-1.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase shrink-0">VIP</span>
        ) : crm.isDriver ? (
          <span className="px-1.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">Driver</span>
        ) : crm.corporateAccountName ? (
          <span className="px-1.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-bold shrink-0">Corp</span>
        ) : null}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={onBook} className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] font-bold cursor-pointer">
          Book
        </button>
        <button
          type="button"
          onClick={() => getWorkspaceBus().publish('OPEN_CLIENT_PROFILE', { phone: crm.primaryPhone || undefined, email: crm.primaryEmail || undefined, name: crm.contactName || undefined, source: 'comms_hub' })}
          className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer border ${dark ? 'bg-slate-700 border-slate-600 text-slate-100 hover:bg-slate-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}
        >
          <UserIcon className="w-2.5 h-2.5" /><span>Profile</span>
        </button>
        {onSelectThread && selector && (
          <button type="button" onClick={() => onSelectThread(selector)} className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold cursor-pointer">
            Thread
          </button>
        )}
      </div>
    </div>
  );
}

export function SoftphoneDialerPane({
  callStatus, bookingToast, activeCallContact, activeCallPhone, dialpadNumber, onChangeDialpadNumber,
  dialpadInputRef, callTimer, isMuted, callNotice, showInCallKeypad, onToggleInCallKeypad,
  onInCallBookRide, onInCallSendLink, onSendInCallDtmf, onToggleMute, onToggleHold, onEndCall,
  softphoneStatus, operatorPhoneInput, onChangeOperatorPhoneInput, isEditingOperatorPhone,
  onToggleEditingOperatorPhone, onSaveOperatorPhone, onCancelEditingOperatorPhone,
  activeKeypadFeedback, onDialDigit, onDeleteDialDigit, onClearDialpad, onStartCall,
  drivers, callerCrmContext, onSelectThread, onBackToHistory,
}: SoftphoneDialerPaneProps) {
  if (callStatus !== 'idle') {
    return (
      <div className="flex-1 min-h-0 flex flex-col justify-between p-3.5 bg-slate-900 text-white overflow-y-auto space-y-3">
        {bookingToast && <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-lg text-center">✓ {bookingToast}</div>}
        <div className="text-center space-y-1.5 pt-1">
          <h3 className="text-sm font-black truncate">{activeCallContact || 'Active Call'}</h3>
          <p className="text-xs font-mono text-slate-400">{activeCallPhone ? formatDisplayPhone(activeCallPhone) : dialpadNumber}</p>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{callStatus === 'calling' ? 'Calling...' : formatCallTimer(callTimer)}</span>
          </span>
          {callNotice && <p className="text-[11px] text-amber-200 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1">{callNotice.message}</p>}
        </div>

        <CallerQuickChip crm={callerCrmContext} dark={true} onBook={onInCallBookRide} onSelectThread={onSelectThread} />

        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={onInCallBookRide} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer">Book Ride</button>
          <button type="button" onClick={onInCallSendLink} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer">Text Booking Link</button>
        </div>

        {showInCallKeypad && (
          <div className="grid grid-cols-3 gap-1.5 bg-slate-800 p-2 rounded-xl">
            {DTMF_DIALPAD_KEYS.map((d) => (
              <button key={d.key} type="button" onClick={() => onSendInCallDtmf(d.key)} className="py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-mono font-bold text-sm cursor-pointer">
                {d.key}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={onToggleMute} className={`p-2 rounded-xl flex flex-col items-center gap-1 text-[11px] font-bold cursor-pointer ${isMuted ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
            {isMuted ? <MicOffIcon className="w-4 h-4" /> : <MicIcon className="w-4 h-4" />}<span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button type="button" onClick={onToggleHold} className={`p-2 rounded-xl flex flex-col items-center gap-1 text-[11px] font-bold cursor-pointer ${callStatus === 'on_hold' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
            {callStatus === 'on_hold' ? <PlayIcon className="w-4 h-4" /> : <PauseIcon className="w-4 h-4" />}<span>{callStatus === 'on_hold' ? 'Resume' : 'Hold'}</span>
          </button>
          <button type="button" onClick={onToggleInCallKeypad} className={`p-2 rounded-xl flex flex-col items-center gap-1 text-[11px] font-bold cursor-pointer ${showInCallKeypad ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
            <KeypadGridIcon className="w-4 h-4" /><span>Keypad</span>
          </button>
          <button type="button" onClick={onEndCall} className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center gap-1 text-[11px] font-bold cursor-pointer">
            <PhoneOffIcon className="w-4 h-4" /><span>End</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center p-3.5 bg-white overflow-y-auto">
      <div className="w-full max-w-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            data-dialer-back-to-calls="true"
            onClick={() => onBackToHistory?.()}
            className="px-2 py-1 rounded-lg hover:bg-slate-100 text-xs font-extrabold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
          >
            ← Calls
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Softphone Keypad</span>
        </div>
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 relative">
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
            <span>ID: {formatDisplayPhone(getClientTelephonyCredentials().phoneNumber)}</span>
            {softphoneStatus === 'ready' ? (
              <span className="text-emerald-700 font-bold inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />WebRTC Ready</span>
            ) : softphoneStatus === 'initializing' ? (
              <span className="text-blue-700 font-bold inline-flex items-center gap-1"><SpinnerIcon className="w-2.5 h-2.5 animate-spin" />Connecting</span>
            ) : (
              <button type="button" onClick={onToggleEditingOperatorPhone} className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-bold cursor-pointer">
                {operatorPhoneInput ? `Line: ${formatDisplayPhone(operatorPhoneInput)}` : 'Set Agent Line'}
              </button>
            )}
          </div>
          {isEditingOperatorPhone && (
            <div className="mb-2 flex items-center gap-1">
              <input type="tel" value={operatorPhoneInput} onChange={(e) => onChangeOperatorPhoneInput(e.target.value)} placeholder="(314) 555-0100" className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 font-mono bg-white" />
              <button type="button" onClick={onSaveOperatorPhone} className="px-2 py-1 bg-blue-600 text-white text-xs font-bold rounded cursor-pointer">Save</button>
              <button type="button" onClick={onCancelEditingOperatorPhone} className="px-1.5 py-1 bg-slate-200 text-slate-700 text-xs rounded cursor-pointer">✕</button>
            </div>
          )}
          <input
            ref={dialpadInputRef}
            type="text"
            value={dialpadNumber}
            onChange={(e) => onChangeDialpadNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dialpadNumber.trim()) { e.preventDefault(); onStartCall(); } }}
            placeholder="Type or dial number..."
            className="w-full text-center text-lg font-mono font-bold bg-transparent focus:outline-none text-slate-900"
          />
          {dialpadNumber && <button type="button" onClick={onClearDialpad} className="absolute right-2.5 bottom-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer">✕</button>}
        </div>

        <CallerQuickChip crm={callerCrmContext} onBook={onInCallBookRide} onSelectThread={onSelectThread} />

        <div className="grid grid-cols-3 gap-2">
          {DTMF_DIALPAD_KEYS.map((d) => {
            const pressed = activeKeypadFeedback === d.key;
            return (
              <button key={d.key} type="button" onClick={() => onDialDigit(d.key)} className={`py-2.5 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors ${pressed ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-900'}`}>
                <span className="text-base font-black leading-none">{d.key}</span>
                {d.sub && <span className={`text-[8.5px] font-semibold mt-0.5 ${pressed ? 'text-blue-100' : 'text-slate-400'}`}>{d.sub}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={onDeleteDialDigit} disabled={!dialpadNumber} className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-bold cursor-pointer flex-1">⌫ Delete</button>
          <button type="button" onClick={() => onStartCall()} disabled={!dialpadNumber.trim()} className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-extrabold cursor-pointer flex-2 inline-flex items-center justify-center gap-1.5">
            <PhoneIcon className="w-3.5 h-3.5" /><span>Call</span>
          </button>
        </div>

        {drivers.length > 0 && (
          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-1.5">
            {drivers.slice(0, 4).map((drv) => (
              <button key={drv.id} type="button" onClick={() => onStartCall(drv.phone, `Car #${drv.cabNumber}`)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-300 bg-white text-xs font-bold text-slate-800 flex items-center justify-between cursor-pointer">
                <span className="truncate">Car #{drv.cabNumber}</span><PhoneIcon className="w-3 h-3 text-emerald-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
