import type React from 'react';
import {
  resolveCommsEmailDeliveryBadge,
  resolveInteractionSelectorTarget,
} from '../../../../core/services/comms/comms-templates.service';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import {
  ChatBubbleLeftRightIcon,
  CheckIcon,
  MailIcon,
  MailOpenIcon,
  MicIcon,
  PauseIcon,
  PhoneIcon,
  PhoneOffIcon,
  PlayIcon,
} from '../../../ui/Icons';
import { cleanCommsEmailSnippet, hasPlayableCallAudio } from './comms-timeline.util';
import {
  formatMessageTimestamp,
  type InteractionEvent,
  type PlaybackSpeed,
} from './comms-types';
import { useLongPressSelection } from './useLongPressSelection';

export type VoicemailCallLogMode = 'all' | 'call_history' | 'call_missed' | 'voicemail';

export interface VoicemailCallLogPaneProps {
  mode: VoicemailCallLogMode;
  items: InteractionEvent[];
  playingVoicemailId: string | null;
  onTogglePlayVoicemail: (id: string) => void;
  playingCallId: string | null;
  onTogglePlayCall: (id: string) => void;
  playbackSpeed: PlaybackSpeed;
  onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  onSelectContact: (selectorTarget: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onOpenEmailInDock?: (evt: InteractionEvent) => void;
  selectedRowKeys?: ReadonlySet<string>;
  onToggleSelectRow?: (eventId: string) => void;
  onToggleRowReadStatus?: (eventId: string, currentlyUnread: boolean) => void;
}

function RowSelectOverlay({
  eventId,
  checked,
  isSelectionMode,
  onToggle,
  roundedClass = 'rounded-md',
}: {
  eventId: string;
  checked: boolean;
  isSelectionMode: boolean;
  onToggle: (id: string) => void;
  roundedClass?: string;
}) {
  return (
    <button
      type="button"
      data-row-checkbox={eventId}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(eventId);
      }}
      aria-label={checked ? 'Deselect item' : 'Select item'}
      className={`absolute inset-0 ${roundedClass} flex items-center justify-center transition-opacity cursor-pointer ${
        checked || isSelectionMode
          ? 'opacity-100 bg-white/95'
          : 'opacity-0 group-hover:opacity-100 bg-white/95'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors ${
          checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-400'
        }`}
      >
        {checked && <CheckIcon className="w-2.5 h-2.5 stroke-[3]" />}
      </span>
    </button>
  );
}

function RowReadToggleButton({
  eventId,
  isUnread,
  onToggle,
}: {
  eventId: string;
  isUnread: boolean;
  onToggle: (id: string, currentlyUnread: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-row-read-toggle={eventId}
      onClick={() => onToggle(eventId, isUnread)}
      title={isUnread ? 'Mark as Read' : 'Mark as Unread'}
      aria-label={isUnread ? 'Mark as Read' : 'Mark as Unread'}
      className="p-1 rounded-md bg-slate-100 hover:bg-blue-600 text-slate-600 hover:text-white cursor-pointer"
    >
      {isUnread ? <MailOpenIcon className="w-3 h-3" /> : <MailIcon className="w-3 h-3" />}
    </button>
  );
}

function formatCallDur(evt: InteractionEvent): string {
  if (evt.audioDuration) return evt.audioDuration;
  const secs = evt.durationSeconds || 0;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export function VoicemailCallLogPane({
  mode,
  items,
  playingVoicemailId,
  onTogglePlayVoicemail,
  playingCallId,
  onTogglePlayCall,
  playbackSpeed,
  onCyclePlaybackSpeed,
  onStartCall,
  onSelectContact,
  onConvertVoicemailToBooking,
  onOpenEmailInDock,
  selectedRowKeys,
  onToggleSelectRow,
  onToggleRowReadStatus,
}: VoicemailCallLogPaneProps) {
  const isSelectionMode = Boolean(selectedRowKeys && selectedRowKeys.size > 0);
  const { getRowGestureProps } = useLongPressSelection({
    isSelectionMode,
    onToggleSelect: (key) => onToggleSelectRow?.(key),
  });

  if (items.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center text-xs text-slate-400 bg-white">
        {mode === 'voicemail'
          ? 'No voicemails match the active filter.'
          : mode === 'call_missed'
          ? 'No missed inbound calls.'
          : 'No communications match the active filter.'}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 bg-white">
      {items.map((event) => {
        const playable = hasPlayableCallAudio(event);
        const target = resolveInteractionSelectorTarget(event) || event.contactPhone;
        const isSelected = Boolean(selectedRowKeys?.has(event.id));
        const isUnread = Boolean(event.isUnread);
        const gestureProps = getRowGestureProps(event.id, () => {
          if (target) onSelectContact(target);
        });

        // Voicemail Transcript + Audio Player Card
        if (event.type === 'voicemail') {
          const isPlaying = playingVoicemailId === event.id;
          return (
            <div
              key={event.id}
              {...gestureProps}
              className={`group p-3 space-y-2 cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'bg-blue-100/70 hover:bg-blue-100'
                  : isUnread
                  ? 'bg-amber-50/40 hover:bg-amber-50/70'
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <MicIcon className="w-3.5 h-3.5" />
                    {onToggleSelectRow && (
                      <RowSelectOverlay
                        eventId={event.id}
                        checked={isSelected}
                        isSelectionMode={isSelectionMode}
                        onToggle={onToggleSelectRow}
                        roundedClass="rounded-lg"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-extrabold text-slate-900 block truncate">
                      {event.contactName}
                    </span>
                    <span className="text-[10.5px] font-mono text-slate-500">
                      {event.contactPhone ? formatDisplayPhone(event.contactPhone) : ''}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                  {formatMessageTimestamp(event.timestampMs, event.timestamp)}
                </span>
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
              >
                <div className="flex items-center gap-2">
                  {playable && (
                    <>
                      <button
                        type="button"
                        onClick={() => onTogglePlayVoicemail(event.id)}
                        className="w-6 h-6 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center cursor-pointer"
                      >
                        {isPlaying ? (
                          <PauseIcon className="w-3 h-3" />
                        ) : (
                          <PlayIcon className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={onCyclePlaybackSpeed}
                        className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer"
                      >
                        {playbackSpeed}x
                      </button>
                    </>
                  )}
                  <span className="text-[11px] font-mono font-bold text-slate-700">
                    {formatCallDur(event)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {onToggleRowReadStatus && (
                    <RowReadToggleButton
                      eventId={event.id}
                      isUnread={isUnread}
                      onToggle={onToggleRowReadStatus}
                    />
                  )}
                  {event.contactPhone && (
                    <button
                      type="button"
                      onClick={() => onStartCall(event.contactPhone, event.contactName)}
                      className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold cursor-pointer"
                    >
                      Call
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onConvertVoicemailToBooking(event.suggestedBooking)}
                    className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] font-bold cursor-pointer"
                  >
                    Book
                  </button>
                </div>
              </div>

              {event.transcription && (
                <p className="text-[11px] text-slate-700 italic line-clamp-2 pl-2 border-l-2 border-amber-400">
                  &ldquo;{event.transcription}&rdquo;
                </p>
              )}
            </div>
          );
        }

        // 1-Row Call History Item (hasPlayableCallAudio strictly gated)
        if (event.type.startsWith('call_')) {
          const isMissed = event.type === 'call_missed';
          const isOutbound = event.type === 'call_outbound';
          const isPlaying = playingCallId === event.id;
          return (
            <div
              key={event.id}
              data-call-log-row={event.id}
              {...gestureProps}
              className={`group min-h-[42px] px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'bg-blue-100/70 hover:bg-blue-100'
                  : isUnread
                  ? 'bg-blue-50/50 hover:bg-blue-50'
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
                  {isMissed ? (
                    <PhoneOffIcon className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <PhoneIcon className={`w-3.5 h-3.5 ${isOutbound ? 'text-blue-600' : 'text-emerald-600'}`} />
                  )}
                  {onToggleSelectRow && (
                    <RowSelectOverlay
                      eventId={event.id}
                      checked={isSelected}
                      isSelectionMode={isSelectionMode}
                      onToggle={onToggleSelectRow}
                    />
                  )}
                </div>
                <span className={`text-xs truncate ${event.isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
                  {event.contactName}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                    isMissed
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : isOutbound
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {isMissed ? 'Missed' : isOutbound ? 'Out' : 'In'}
                </span>
                <span className="text-[10.5px] font-mono text-slate-400 shrink-0">
                  {formatCallDur(event)} · {formatMessageTimestamp(event.timestampMs, event.timestamp)}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {playable && (
                  <div data-call-audio-player="true" className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onTogglePlayCall(event.id)}
                      className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                    >
                      {isPlaying ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={onCyclePlaybackSpeed}
                      className="px-1 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9.5px] font-bold cursor-pointer"
                    >
                      {playbackSpeed}x
                    </button>
                  </div>
                )}
                {onToggleRowReadStatus && (
                  <RowReadToggleButton
                    eventId={event.id}
                    isUnread={isUnread}
                    onToggle={onToggleRowReadStatus}
                  />
                )}
                {event.contactPhone && (
                  <button
                    type="button"
                    onClick={() => onStartCall(event.contactPhone, event.contactName)}
                    className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-[10.5px] font-bold cursor-pointer"
                  >
                    Call
                  </button>
                )}
              </div>
            </div>
          );
        }

        // Compact Omnichannel SMS / Email / Note Row (in mode === 'all')
        const isEmail = event.type.startsWith('email_');
        const emailBadge = isEmail
          ? resolveCommsEmailDeliveryBadge(event.deliveryStatus, event.type === 'email_outbound' ? 'outbound' : 'inbound')
          : null;

        return (
          <div
            key={event.id}
            {...gestureProps}
            className={`group min-h-[48px] px-3 py-1.5 flex items-center justify-between gap-2 cursor-pointer transition-colors select-none ${
              isSelected
                ? 'bg-blue-100/70 hover:bg-blue-100'
                : isUnread
                ? 'bg-blue-50/50 hover:bg-blue-50'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
                {isEmail ? (
                  <MailIcon className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-blue-600" />
                )}
                {onToggleSelectRow && (
                  <RowSelectOverlay
                    eventId={event.id}
                    checked={isSelected}
                    isSelectionMode={isSelectionMode}
                    onToggle={onToggleSelectRow}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs truncate ${event.isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
                    {event.contactName}
                  </span>
                  {emailBadge && (
                    <span className="px-1 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold shrink-0">
                      {emailBadge.label}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-400 ml-auto shrink-0">
                    {formatMessageTimestamp(event.timestampMs, event.timestamp)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {cleanCommsEmailSnippet(event.snippet)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {onToggleRowReadStatus && (
                <RowReadToggleButton
                  eventId={event.id}
                  isUnread={isUnread}
                  onToggle={onToggleRowReadStatus}
                />
              )}
              {isEmail && onOpenEmailInDock ? (
                <button
                  type="button"
                  onClick={() => onOpenEmailInDock(event)}
                  className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold cursor-pointer"
                >
                  Email ↗
                </button>
              ) : event.contactPhone ? (
                <button
                  type="button"
                  onClick={() => onStartCall(event.contactPhone, event.contactName)}
                  className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white text-[10.5px] font-bold cursor-pointer"
                >
                  Call
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
