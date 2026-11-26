import type React from 'react';
import { useState } from 'react';
import {
  resolveCommsEmailDeliveryBadge,
  resolveInteractionSelectorTarget,
} from '../../../../core/services/comms/comms-templates.service';
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
} from '../../../ui/Icons';
import {
  CommsChannelDirectionIcon,
  CommsContactAvatar,
  CommsTimestampWithHoverReadToggle,
} from './CommsContactAvatar';
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
  onSelectContact: (selectorTarget: string, focusEventId?: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onOpenEmailInDock?: (evt: InteractionEvent) => void;
  selectedRowKeys?: ReadonlySet<string>;
  onToggleSelectRow?: (eventId: string) => void;
  onToggleRowReadStatus?: (eventId: string, currentlyUnread: boolean) => void;
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
  const [expandedVoicemailIds, setExpandedVoicemailIds] = useState<Set<string>>(() => new Set());
  const isSelectionMode = Boolean(selectedRowKeys && selectedRowKeys.size > 0);
  const { getRowGestureProps } = useLongPressSelection({
    isSelectionMode,
    onToggleSelect: (key) => onToggleSelectRow?.(key),
  });

  const toggleVoicemailExpanded = (id: string) => {
    setExpandedVoicemailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        const timestampLabel = formatMessageTimestamp(event.timestampMs, event.timestamp);
        const gestureProps = getRowGestureProps(event.id, () => {
          if (target) onSelectContact(target, event.id);
        });

        // Unified 2-Row Voicemail Entry with Inline ▾ Transcription Expand
        if (event.type === 'voicemail') {
          const isPlaying = playingVoicemailId === event.id;
          const isExpanded = expandedVoicemailIds.has(event.id);
          const transcriptPreview = event.transcription || cleanCommsEmailSnippet(event.snippet) || 'Voicemail message';
          return (
            <div
              key={event.id}
              data-voicemail-row={event.id}
              {...gestureProps}
              className={`group min-h-[52px] px-3 py-1.5 cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'bg-blue-100/70 hover:bg-blue-100'
                  : isUnread
                  ? 'bg-amber-50/40 hover:bg-amber-50/70'
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CommsContactAvatar
                  name={event.contactName}
                  phone={event.contactPhone}
                  email={event.contactEmail}
                  fallbackId={event.id}
                  rowKey={event.id}
                  isSelected={isSelected}
                  isSelectionMode={isSelectionMode}
                  onToggleSelect={onToggleSelectRow}
                  selectionAriaLabel={isSelected ? 'Deselect voicemail' : 'Select voicemail'}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-xs truncate ${isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
                        {event.contactName}
                      </span>
                      <span className="px-1 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] font-bold shrink-0">
                        VM
                      </span>
                    </div>
                    <CommsTimestampWithHoverReadToggle
                      rowKey={event.id}
                      timestampLabel={timestampLabel}
                      isUnread={isUnread}
                      onToggleRowReadStatus={onToggleRowReadStatus}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <CommsChannelDirectionIcon type={event.type} />
                      <span className="text-[10.5px] font-mono font-bold text-amber-800 shrink-0">
                        {formatCallDur(event)}
                      </span>
                      <span className={`text-[11px] truncate ${isUnread ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                        · {transcriptPreview}
                      </span>
                      {event.transcription && (
                        <button
                          type="button"
                          data-voicemail-expand-toggle={event.id}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Collapse transcription' : 'Expand transcription'}
                          title={isExpanded ? 'Collapse transcription' : 'Expand transcription'}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVoicemailExpanded(event.id);
                          }}
                          className="p-0.5 rounded hover:bg-amber-100 text-amber-700 shrink-0 cursor-pointer"
                        >
                          <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {playable && (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onTogglePlayVoicemail(event.id)}
                            title={isPlaying ? 'Pause voicemail' : 'Play voicemail'}
                            aria-label={isPlaying ? 'Pause voicemail' : 'Play voicemail'}
                            className="w-6 h-6 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center cursor-pointer"
                          >
                            {isPlaying ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={onCyclePlaybackSpeed}
                            className="h-6 px-1.5 rounded bg-white border border-slate-200 text-[9.5px] font-bold text-slate-700 cursor-pointer"
                          >
                            {playbackSpeed}x
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onConvertVoicemailToBooking(event.suggestedBooking)}
                        className="h-6 px-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer"
                      >
                        Book
                      </button>
                      {event.contactPhone && (
                        <button
                          type="button"
                          onClick={() => onStartCall(event.contactPhone, event.contactName)}
                          title={`Call ${event.contactName}`}
                          aria-label={`Call ${event.contactName}`}
                          className="w-6 h-6 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center cursor-pointer"
                        >
                          <PhoneIcon className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {isExpanded && event.transcription && (
                <div
                  data-voicemail-expanded-body={event.id}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1.5 ml-[42px] pl-2 border-l-2 border-amber-400 text-[11px] text-slate-700 italic whitespace-pre-wrap leading-relaxed"
                >
                  &ldquo;{event.transcription}&rdquo;
                </div>
              )}
            </div>
          );
        }

        // Unified 2-Row Call History Item (hasPlayableCallAudio strictly gated)
        if (event.type.startsWith('call_')) {
          const isMissed = event.type === 'call_missed';
          const isOutbound = event.type === 'call_outbound';
          const isPlaying = playingCallId === event.id;
          const statusLabel = isMissed
            ? 'Missed Call'
            : `${isOutbound ? 'Outbound Call' : 'Inbound Call'} · ${formatCallDur(event)}`;
          return (
            <div
              key={event.id}
              data-call-log-row={event.id}
              {...gestureProps}
              className={`group min-h-[52px] px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-colors select-none ${
                isSelected
                  ? 'bg-blue-100/70 hover:bg-blue-100'
                  : isUnread
                  ? 'bg-blue-50/50 hover:bg-blue-50'
                  : 'bg-white hover:bg-slate-50'
              }`}
            >
              <CommsContactAvatar
                name={event.contactName}
                phone={event.contactPhone}
                email={event.contactEmail}
                fallbackId={event.id}
                rowKey={event.id}
                isSelected={isSelected}
                isSelectionMode={isSelectionMode}
                onToggleSelect={onToggleSelectRow}
                selectionAriaLabel={isSelected ? 'Deselect call' : 'Select call'}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-xs truncate ${isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
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
                  </div>
                  <CommsTimestampWithHoverReadToggle
                    rowKey={event.id}
                    timestampLabel={timestampLabel}
                    isUnread={isUnread}
                    onToggleRowReadStatus={onToggleRowReadStatus}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <CommsChannelDirectionIcon type={event.type} />
                    <span className={`text-[11px] truncate ${isMissed ? 'text-rose-700 font-medium' : isUnread ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {playable && (
                      <div data-call-audio-player="true" className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onTogglePlayCall(event.id)}
                          title={isPlaying ? 'Pause call recording' : 'Play call recording'}
                          aria-label={isPlaying ? 'Pause call recording' : 'Play call recording'}
                          className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                        >
                          {isPlaying ? <PauseIcon className="w-3 h-3" /> : <PlayIcon className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="h-6 px-1.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9.5px] font-bold cursor-pointer"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>
                    )}
                    {event.contactPhone && (
                      <button
                        type="button"
                        onClick={() => onStartCall(event.contactPhone, event.contactName)}
                        title={`Call ${event.contactName}`}
                        aria-label={`Call ${event.contactName}`}
                        className="w-6 h-6 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center cursor-pointer"
                      >
                        <PhoneIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Unified 2-Row Omnichannel SMS / Email / Note Stream Row (in mode === 'all')
        const isEmail = event.type.startsWith('email_');
        const emailBadge = isEmail
          ? resolveCommsEmailDeliveryBadge(event.deliveryStatus, event.type === 'email_outbound' ? 'outbound' : 'inbound')
          : null;

        return (
          <div
            key={event.id}
            {...gestureProps}
            className={`group min-h-[52px] px-3 py-1.5 flex items-center gap-2.5 cursor-pointer transition-colors select-none ${
              isSelected
                ? 'bg-blue-100/70 hover:bg-blue-100'
                : isUnread
                ? 'bg-blue-50/50 hover:bg-blue-50'
                : 'bg-white hover:bg-slate-50'
            }`}
          >
            <CommsContactAvatar
              name={event.contactName}
              phone={event.contactPhone}
              email={event.contactEmail}
              fallbackId={event.id}
              rowKey={event.id}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              onToggleSelect={onToggleSelectRow}
              selectionAriaLabel={isSelected ? 'Deselect item' : 'Select item'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-xs truncate ${isUnread ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'}`}>
                    {event.contactName}
                  </span>
                  {emailBadge && (
                    <span className="px-1 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold shrink-0">
                      {emailBadge.label}
                    </span>
                  )}
                </div>
                <CommsTimestampWithHoverReadToggle
                  rowKey={event.id}
                  timestampLabel={timestampLabel}
                  isUnread={isUnread}
                  onToggleRowReadStatus={onToggleRowReadStatus}
                />
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  <CommsChannelDirectionIcon type={event.type} />
                  <p className={`text-[11px] truncate ${isUnread ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                    {cleanCommsEmailSnippet(event.snippet)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isEmail && onOpenEmailInDock ? (
                    <button
                      type="button"
                      onClick={() => onOpenEmailInDock(event)}
                      title="Open in Email"
                      aria-label="Open in Email"
                      className="w-6 h-6 rounded-md bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <ExternalLinkIcon className="w-3 h-3" />
                    </button>
                  ) : event.contactPhone ? (
                    <button
                      type="button"
                      onClick={() => onStartCall(event.contactPhone, event.contactName)}
                      title={`Call ${event.contactName}`}
                      aria-label={`Call ${event.contactName}`}
                      className="w-6 h-6 rounded-md bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white flex items-center justify-center cursor-pointer"
                    >
                      <PhoneIcon className="w-3 h-3" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
