import type React from 'react';
import type { CommsCrmContextSummary } from '../../../../core/services/comms/comms-templates.service';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import type {
  UpcomingBookingPreview,
  WorkspaceEventMap,
} from '../../../../core/services/workspace-bus.service';
import { CommsCrmContextBanner } from './CommsCrmContextBanner';
import {
  PhoneIcon,
  PauseIcon,
  PlayIcon,
  CarIcon,
  ClockIcon,
  LinkIcon,
  FileTextIcon,
  MicOffIcon,
  MicIcon,
  KeypadGridIcon,
  PhoneOffIcon,
  SpinnerIcon,
  AlertTriangleIcon,
  XIcon,
} from '../../../ui/Icons';
import {
  formatCallTimer,
  getClientTelephonyCredentials,
  type CallNotice,
  type CallStatus,
  type CommsSheetDragProps,
  type SoftphoneStatus,
} from './comms-types';

const DTMF_DIALPAD_KEYS: { key: string; sub: string }[] = [
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
];

const IN_CALL_DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;
const IN_CALL_NOTE_CHIPS = ['Airport', 'Luggage', 'Car Seat', 'Cash', 'Van Req'] as const;

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
  showInCallTrips: boolean;
  showInCallNotes: boolean;
  showInCallKeypad: boolean;
  onToggleInCallTrips: () => void;
  onToggleInCallNotes: () => void;
  onToggleInCallKeypad: () => void;
  onInCallBookRide: () => void;
  onInCallSendLink: () => void;
  matchingCallerTrips: UpcomingBookingPreview[];
  onLoadCallerTrip: (trip: UpcomingBookingPreview) => void;
  onEditCallerTrip: (tripId: string) => void;
  inCallNoteText: string;
  onChangeInCallNoteText: (val: string) => void;
  onAppendCallNote: (chipText?: string) => void;
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
}

export function SoftphoneDialerPane({
  callStatus,
  bookingToast,
  activeCallContact,
  activeCallPhone,
  dialpadNumber,
  onChangeDialpadNumber,
  dialpadInputRef,
  callTimer,
  isMuted,
  callNotice,
  showInCallTrips,
  showInCallNotes,
  showInCallKeypad,
  onToggleInCallTrips,
  onToggleInCallNotes,
  onToggleInCallKeypad,
  onInCallBookRide,
  onInCallSendLink,
  matchingCallerTrips,
  onLoadCallerTrip,
  onEditCallerTrip,
  inCallNoteText,
  onChangeInCallNoteText,
  onAppendCallNote,
  onSendInCallDtmf,
  onToggleMute,
  onToggleHold,
  onEndCall,
  softphoneStatus,
  operatorPhoneInput,
  onChangeOperatorPhoneInput,
  isEditingOperatorPhone,
  onToggleEditingOperatorPhone,
  onSaveOperatorPhone,
  onCancelEditingOperatorPhone,
  activeKeypadFeedback,
  onDialDigit,
  onDeleteDialDigit,
  onClearDialpad,
  onStartCall,
  drivers,
  callerCrmContext,
  onRebookCallerRide,
  onSelectThread,
}: SoftphoneDialerPaneProps) {
  if (callStatus !== 'idle') {
    return (
      <div className="flex-1 flex flex-col justify-between p-4 bg-slate-900 text-white overflow-y-auto min-h-0 space-y-4">
        {/* Toast Notification */}
        {bookingToast && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl text-center shadow-md animate-in fade-in zoom-in-95 shrink-0">
            ✓ {bookingToast}
          </div>
        )}

        {/* Caller Info Header */}
        <div className="flex flex-col items-center text-center space-y-2 pt-1 shrink-0">
          <div className="relative">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-xl shadow-lg ${
                callStatus === 'connected'
                  ? 'bg-emerald-600 ring-4 ring-emerald-500/30'
                  : 'bg-amber-600 ring-4 ring-amber-500/30 animate-pulse'
              }`}
            >
              {activeCallContact ? (
                activeCallContact.charAt(0).toUpperCase()
              ) : (
                <PhoneIcon className="w-6 h-6 text-white" />
              )}
            </div>
            {callStatus === 'connected' && !isMuted && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
              </span>
            )}
          </div>

          <div>
            <h3 className="text-sm font-black text-white truncate max-w-[240px]">
              {activeCallContact || 'Unknown Caller'}
            </h3>
            <p className="text-[11px] font-mono text-slate-400">
              {activeCallPhone ? formatDisplayPhone(activeCallPhone) : dialpadNumber}
            </p>
          </div>

          {/* Status Pill & Waveform */}
          <div className="flex items-center gap-2">
            {callStatus === 'calling' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                Calling...
              </span>
            )}
            {callStatus === 'connected' && (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-mono font-bold text-emerald-300">
                  {formatCallTimer(callTimer)}
                </span>
                {!isMuted && (
                  <div className="flex items-center gap-0.5 ml-1 h-2.5">
                    <span className="w-0.5 h-2 bg-emerald-400 animate-pulse rounded-full" />
                    <span className="w-0.5 h-2.5 bg-emerald-400 animate-pulse rounded-full delay-75" />
                    <span className="w-0.5 h-1.5 bg-emerald-400 animate-pulse rounded-full delay-150" />
                  </div>
                )}
              </div>
            )}
            {callStatus === 'on_hold' && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                <PauseIcon className="w-3 h-3" />
                <span>On Hold</span>
              </span>
            )}
          </div>

          {/* Telephony Connection Notice */}
          {callNotice && (
            <div
              className={`px-3 py-1.5 rounded-xl text-[11px] font-medium max-w-xs text-center border ${
                callNotice.type === 'info'
                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                  : 'bg-amber-500/15 text-amber-200 border-amber-500/30'
              }`}
            >
              {callNotice.message}
            </div>
          )}
        </div>

        {/* Live Caller CRM Context Banner (VIP, Blacklist, Corporate, Active Trip & Rebook) */}
        <CommsCrmContextBanner
          crmContext={callerCrmContext}
          variant="dark"
          hideWhenUnknown={true}
          onOpenTrip={onEditCallerTrip}
          onRebookLastRide={onRebookCallerRide}
          onSelectThread={onSelectThread}
        />

        {/* Booking & Dispatch Actions Section */}
        <div className="bg-slate-800/80 rounded-2xl p-2.5 border border-slate-700/80 space-y-2 shrink-0">
          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={onInCallBookRide}
              className="py-2 px-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Load into draft booking"
            >
              <CarIcon className="w-4 h-4 text-white" />
              <span>Book</span>
            </button>

            <button
              type="button"
              onClick={onToggleInCallTrips}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs ${
                showInCallTrips
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
              title="View trips for this caller"
            >
              <ClockIcon className="w-4 h-4 text-amber-300" />
              <span>Trips</span>
            </button>

            <button
              type="button"
              onClick={onInCallSendLink}
              className="py-2 px-1 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs"
              title="Text web app link to caller"
            >
              <LinkIcon className="w-4 h-4 text-slate-300" />
              <span>Link</span>
            </button>

            <button
              type="button"
              onClick={onToggleInCallNotes}
              className={`py-2 px-1 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-xs ${
                showInCallNotes
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
              }`}
              title="Add notes to draft booking"
            >
              <FileTextIcon className="w-4 h-4 text-purple-300" />
              <span>Note</span>
            </button>
          </div>

          {/* Caller Trips Drawer */}
          {showInCallTrips && (
            <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Caller Trips ({matchingCallerTrips.length})
              </span>
              {matchingCallerTrips.length === 0 ? (
                <p className="text-[11px] text-slate-400 py-1 text-center">
                  No past or active trips for caller.
                </p>
              ) : (
                matchingCallerTrips.slice(0, 2).map((tr) => (
                  <div
                    key={tr.id}
                    className="p-2 rounded-xl bg-slate-900/90 border border-slate-700 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-white block truncate">
                        {tr.time} • ${tr.fare}
                      </span>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {tr.pickupAddress} ➔ {tr.dropoffAddress}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onLoadCallerTrip(tr)}
                        className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
                        title="Load this route into active draft reservation"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditCallerTrip(tr.id)}
                        className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] font-bold cursor-pointer"
                        title="Open trip in dispatch edit tab"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* In-Call Notes Drawer */}
          {showInCallNotes && (
            <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
              <div className="flex flex-wrap gap-1">
                {IN_CALL_NOTE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onAppendCallNote(chip)}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-purple-900/60 border border-slate-700 text-slate-200 text-[10px] font-semibold transition-colors cursor-pointer"
                  >
                    +{chip}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <input
                  type="text"
                  value={inCallNoteText}
                  onChange={(e) => onChangeInCallNoteText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAppendCallNote();
                    }
                  }}
                  placeholder="Add booking note..."
                  className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => onAppendCallNote()}
                  disabled={!inCallNoteText.trim()}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* DTMF Touch-tone Keypad Drawer */}
          {showInCallKeypad && (
            <div className="pt-2 border-t border-slate-700/80 space-y-1.5 animate-in fade-in">
              <div className="grid grid-cols-3 gap-1.5">
                {IN_CALL_DTMF_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onSendInCallDtmf(k)}
                    className="py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 active:bg-blue-600 text-white font-mono font-bold text-sm cursor-pointer shadow-xs"
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Core Phone Controls */}
        <div className="grid grid-cols-4 gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
              isMuted
                ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {isMuted ? (
              <MicOffIcon className="w-5 h-5 text-amber-300" />
            ) : (
              <MicIcon className="w-5 h-5 text-slate-300" />
            )}
            <span>{isMuted ? 'Unmute' : 'Mute'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleHold}
            className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
              callStatus === 'on_hold'
                ? 'bg-amber-600 text-white ring-2 ring-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            {callStatus === 'on_hold' ? (
              <PlayIcon className="w-5 h-5 text-amber-300" />
            ) : (
              <PauseIcon className="w-5 h-5 text-slate-300" />
            )}
            <span>{callStatus === 'on_hold' ? 'Resume' : 'Hold'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleInCallKeypad}
            className={`p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
              showInCallKeypad
                ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <KeypadGridIcon className="w-5 h-5 text-slate-300" />
            <span>Keypad</span>
          </button>

          <button
            type="button"
            onClick={onEndCall}
            className="p-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer shadow-lg shadow-rose-600/30 active:scale-95"
          >
            <PhoneOffIcon className="w-5 h-5 text-white" />
            <span>End</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-white overflow-y-auto">
      <div className="w-full max-w-xs space-y-3.5">
        <div className="p-3 bg-slate-100 rounded-2xl border border-slate-200 text-center relative focus-within:ring-2 focus-within:ring-blue-500/30">
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold mb-1">
            <span className="uppercase tracking-wider">
              Caller ID: {formatDisplayPhone(getClientTelephonyCredentials().phoneNumber)}
            </span>
            {softphoneStatus === 'ready' ? (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200"
                title="In-Browser Softphone active. Calls connect directly through your computer headset/microphone."
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Softphone: Headset Ready</span>
              </span>
            ) : softphoneStatus === 'initializing' ? (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200">
                <SpinnerIcon className="w-2.5 h-2.5 animate-spin text-blue-600" />
                <span>Connecting Softphone...</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={onToggleEditingOperatorPhone}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 ${
                  operatorPhoneInput
                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                    : 'text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300'
                }`}
                title="Configure forwarding cell/desk line to bridge live calls"
              >
                {operatorPhoneInput ? (
                  `Agent Line: ${formatDisplayPhone(operatorPhoneInput)}`
                ) : (
                  <>
                    <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                    <span>Set Agent Line</span>
                  </>
                )}
              </button>
            )}
          </div>
          {isEditingOperatorPhone && (
            <div className="mb-2 p-2 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-1.5 text-left">
              <label className="text-[10px] font-bold text-slate-600 block">
                Dispatcher Forwarding / Agent Phone:
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="tel"
                  value={operatorPhoneInput}
                  onChange={(e) => onChangeOperatorPhoneInput(e.target.value)}
                  placeholder="(314) 555-0100"
                  className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-300 font-mono bg-slate-50 focus:bg-white focus:outline-blue-500"
                />
                <button
                  type="button"
                  onClick={onSaveOperatorPhone}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelEditingOperatorPhone}
                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded-lg cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <p className="text-[9px] text-slate-400">
                Twilio calls the customer and bridges your agent phone into the live audio.
              </p>
            </div>
          )}
          <input
            ref={dialpadInputRef}
            type="text"
            value={dialpadNumber}
            onChange={(e) => onChangeDialpadNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (dialpadNumber.trim()) {
                  onStartCall();
                }
              }
            }}
            placeholder="Type or click number..."
            className="w-full text-center text-xl font-mono font-bold bg-transparent border-none focus:outline-none text-slate-900 mt-1"
          />
          {dialpadNumber && (
            <button
              type="button"
              onClick={onClearDialpad}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer p-1"
              title="Clear number"
            >
              ✕
            </button>
          )}
        </div>

        {/* Live Dialpad Caller CRM Lookup Banner (Matches Known Contacts or Trips Instantly) */}
        <CommsCrmContextBanner
          crmContext={callerCrmContext}
          variant="light"
          hideWhenUnknown={true}
          showIdentityHeader={true}
          onOpenTrip={onEditCallerTrip}
          onRebookLastRide={onRebookCallerRide}
          onSelectThread={onSelectThread}
        />

        {/* 12 Key DTMF Matrix */}
        <div className="grid grid-cols-3 gap-2.5">
          {DTMF_DIALPAD_KEYS.map((d) => {
            const isPressed = activeKeypadFeedback === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onDialDigit(d.key)}
                className={`p-3.5 rounded-2xl transition-all flex flex-col items-center justify-center cursor-pointer shadow-xs active:scale-95 ${
                  isPressed
                    ? 'bg-blue-600 text-white scale-95 ring-2 ring-blue-400 shadow-md'
                    : 'bg-slate-100 hover:bg-slate-200 active:bg-blue-600 active:text-white text-slate-900'
                }`}
              >
                <span className="text-lg font-black">{d.key}</span>
                {d.sub && (
                  <span
                    className={`text-[9px] font-semibold ${
                      isPressed ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {d.sub}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Call Controls */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onDeleteDialDigit}
            disabled={!dialpadNumber}
            className="p-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer flex-1"
            title="Backspace"
          >
            ⌫ Delete
          </button>
          <button
            type="button"
            onClick={() => onStartCall()}
            disabled={!dialpadNumber.trim()}
            className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex-2 flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95"
          >
            <PhoneIcon className="w-4 h-4" />
            <span>Call Number</span>
          </button>
        </div>

        {/* Quick Tip */}
        <div className="text-center">
          <span className="text-[10px] text-slate-400 font-medium">
            Press 0-9 on keyboard to dial • Enter to call
          </span>
        </div>

        {/* Driver Quick Dials */}
        {drivers.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Driver Speed Dials
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {drivers.slice(0, 4).map((drv) => (
                <button
                  key={drv.id}
                  type="button"
                  onClick={() => onStartCall(drv.phone, `Car #${drv.cabNumber}`)}
                  className="p-2 rounded-xl border border-slate-200 hover:border-emerald-300 bg-white hover:bg-emerald-50/30 text-left text-xs transition-colors cursor-pointer flex items-center justify-between"
                >
                  <span className="font-bold text-slate-800 truncate">
                    Car #{drv.cabNumber}
                  </span>
                  <PhoneIcon className="w-3 h-3 text-emerald-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Inbound Call Status Footer (No fake production simulator) */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[10px] text-slate-400 font-medium">Inbound Call HUD: Active</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Listening</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export interface AgentPhoneSetupModalProps {
  isOpen: boolean;
  pendingCallTarget: { phone: string; name?: string } | null;
  setupAgentPhoneInput: string;
  setupAgentPhoneError: string | null;
  onChangeSetupAgentPhoneInput: (val: string) => void;
  onSaveAndCall: () => void;
  onClose: () => void;
  sheetDrag: CommsSheetDragProps;
}

export function AgentPhoneSetupModal({
  isOpen,
  pendingCallTarget,
  setupAgentPhoneInput,
  setupAgentPhoneError,
  onChangeSetupAgentPhoneInput,
  onSaveAndCall,
  onClose,
  sheetDrag,
}: AgentPhoneSetupModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-sm w-full border-t sm:border border-slate-200 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        <div
          {...sheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <PhoneIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">Set Dispatcher Line</h3>
                <p className="text-[11px] text-slate-400 truncate">Connect your phone to speak live</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Close modal"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs text-slate-600 mb-3 leading-relaxed">
            To connect you with <strong className="text-slate-900">{pendingCallTarget?.name || pendingCallTarget?.phone}</strong>, enter your mobile or desk phone number. Twilio dials the recipient and simultaneously rings your phone so you speak together live.
          </p>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-700 block">
              Your Phone Number (Mobile or Desk):
            </label>
            <input
              type="tel"
              autoFocus
              placeholder="(314) 555-0100"
              value={setupAgentPhoneInput}
              onChange={(e) => onChangeSetupAgentPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSaveAndCall();
                }
              }}
              className={`w-full px-3 py-2 text-sm rounded-xl border font-mono bg-slate-50 focus:bg-white focus:outline-blue-500 focus:ring-2 focus:ring-blue-500/20 ${
                setupAgentPhoneError ? 'border-rose-400 bg-rose-50/30' : 'border-slate-300'
              }`}
            />
            {setupAgentPhoneError ? (
              <p className="text-[10px] text-rose-600 font-semibold">{setupAgentPhoneError}</p>
            ) : (
              <p className="text-[10px] text-slate-400">
                Tip: Want to speak through your computer microphone &amp; headset without ringing your cell phone? Configure Twilio WebRTC keys in Admin &gt; Integrations.
              </p>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl sm:rounded-lg hover:bg-slate-200/70 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSaveAndCall}
            className="px-4 py-2 sm:py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl sm:rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            <PhoneIcon className="w-3.5 h-3.5" />
            <span>Save &amp; Call Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
