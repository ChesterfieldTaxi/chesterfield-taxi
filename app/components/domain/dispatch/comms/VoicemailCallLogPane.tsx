import type React from 'react';
import {
  CarIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  HomeModernIcon,
  MailIcon,
  MicIcon,
  PauseIcon,
  PhoneIcon,
  PhoneOffIcon,
  PlayIcon,
  TrashIcon,
  XIcon,
} from '../../../ui/Icons';
import { CommsBatchActionBar } from './CommsBatchActionBar';
import { CommsFilterToolbar } from './CommsFilterToolbar';
import type {
  CallTypeFilter,
  ChannelFilter,
  CommsSheetDragProps,
  ContactFilter,
  InteractionEvent,
  PlaybackSpeed,
} from './comms-types';

export type VoicemailCallLogMode = 'all' | 'call_history' | 'call_missed' | 'voicemail';

export interface VoicemailCallLogPaneProps {
  mode: VoicemailCallLogMode;
  items: InteractionEvent[];
  selectedItemIds: Set<string>;
  isAllSelected: boolean;
  masterCheckboxRef: React.RefObject<HTMLInputElement | null>;
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  onClearSelection: () => void;
  onBatchMarkRead: () => void;
  onBatchMarkUnread: () => void;
  onBatchArchive: () => void;
  unreadCount: number;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  channelFilter: ChannelFilter;
  onChangeChannelFilter: (val: ChannelFilter) => void;
  callTypeFilter: CallTypeFilter;
  onChangeCallTypeFilter: (val: CallTypeFilter) => void;
  forwardToast: string | null;
  onDismissForwardToast: () => void;
  playingVoicemailId: string | null;
  onTogglePlayVoicemail: (id: string) => void;
  playingCallId: string | null;
  onTogglePlayCall: (id: string) => void;
  playbackSpeed: PlaybackSpeed;
  onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  onOpenInKeypad: (phone: string) => void;
  onSelectContact: (phone: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  onToggleReadStatus: (id: string) => void;
  onForwardItem: (item: InteractionEvent) => void;
  onArchiveItem: (id: string) => void;
  commsLongPressTriggeredIdRef: React.RefObject<string | null>;
  onRowTouchStart: (event: InteractionEvent, e: React.TouchEvent<HTMLDivElement>) => void;
  onRowTouchMove: (e: React.TouchEvent<HTMLDivElement>) => void;
  onRowTouchEnd: () => void;
}

export function VoicemailCallLogPane({
  mode,
  items,
  selectedItemIds,
  isAllSelected,
  masterCheckboxRef,
  onToggleSelectAll,
  onToggleSelectRow,
  onClearSelection,
  onBatchMarkRead,
  onBatchMarkUnread,
  onBatchArchive,
  unreadCount,
  filterUnreadOnly,
  onToggleUnreadOnly,
  contactFilter,
  onChangeContactFilter,
  searchQuery,
  onChangeSearchQuery,
  channelFilter,
  onChangeChannelFilter,
  callTypeFilter,
  onChangeCallTypeFilter,
  forwardToast,
  onDismissForwardToast,
  playingVoicemailId,
  onTogglePlayVoicemail,
  playingCallId,
  onTogglePlayCall,
  playbackSpeed,
  onCyclePlaybackSpeed,
  onStartCall,
  onOpenInKeypad,
  onSelectContact,
  onConvertVoicemailToBooking,
  onToggleReadStatus,
  onForwardItem,
  onArchiveItem,
  commsLongPressTriggeredIdRef,
  onRowTouchStart,
  onRowTouchMove,
  onRowTouchEnd,
}: VoicemailCallLogPaneProps) {
  if (mode === 'all') {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Batch Actions Bar OR Filter Toolbar */}
        <CommsBatchActionBar
          selectedCount={selectedItemIds.size}
          onMarkRead={onBatchMarkRead}
          onMarkUnread={onBatchMarkUnread}
          onArchive={onBatchArchive}
          onClear={onClearSelection}
        />
        {selectedItemIds.size === 0 && (
          <CommsFilterToolbar
            isAllSelected={isAllSelected}
            masterCheckboxRef={masterCheckboxRef}
            onToggleSelectAll={onToggleSelectAll}
            unreadCount={unreadCount}
            filterUnreadOnly={filterUnreadOnly}
            onToggleUnreadOnly={onToggleUnreadOnly}
            contactFilter={contactFilter}
            onChangeContactFilter={onChangeContactFilter}
            searchQuery={searchQuery}
            onChangeSearchQuery={onChangeSearchQuery}
            showChannelFilter={true}
            channelFilter={channelFilter}
            onChangeChannelFilter={(val) => onChangeChannelFilter(val as ChannelFilter)}
            channelOptions={[
              { value: 'all', label: 'All channels' },
              { value: 'calls', label: 'Calls Only' },
              { value: 'voicemail', label: 'Voicemail Only' },
              { value: 'messages', label: 'Messaging Only' },
            ]}
            placeholder="Filter communications..."
          />
        )}

        {/* Temporary Toast for Forward / Clipboard Copy */}
        {forwardToast && (
          <div className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <CheckIcon className="w-3.5 h-3.5" />
              <span>{forwardToast}</span>
            </div>
            <button
              type="button"
              onClick={onDismissForwardToast}
              className="text-blue-200 hover:text-white"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Event rows list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No communications found matching the selected filters.
            </div>
          ) : (
            items.map((event) => {
              const isRowSelected = selectedItemIds.has(event.id);
              return (
                <div
                  key={event.id}
                  onTouchStart={(e) => onRowTouchStart(event, e)}
                  onTouchMove={onRowTouchMove}
                  onTouchEnd={onRowTouchEnd}
                  onTouchCancel={onRowTouchEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => {
                    if (commsLongPressTriggeredIdRef.current === event.id) {
                      commsLongPressTriggeredIdRef.current = null;
                      return;
                    }
                    if (selectedItemIds.size > 0) {
                      onToggleSelectRow(event.id);
                      return;
                    }
                    onSelectContact(event.contactPhone);
                  }}
                  className={`group relative p-3 transition-all cursor-pointer flex items-start justify-between gap-2.5 border-l-4 select-none ${
                    isRowSelected
                      ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                      : event.isUnread
                      ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                      : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                  }`}
                >
                  {/* Checkbox column (desktop always visible; mobile only when multi-select active) + Unread Dot */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSelectRow(event.id);
                    }}
                    className="pt-1 flex items-center gap-1.5 shrink-0"
                  >
                    <input
                      type="checkbox"
                      checked={isRowSelected}
                      onChange={() => {}}
                      className={`w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer ${
                        selectedItemIds.size > 0 ? 'block' : 'hidden lg:block'
                      }`}
                    />
                    {event.isUnread ? (
                      <span
                        className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                        title="Unread message"
                      />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                    )}
                  </div>

                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {/* Event Type Icon Badge */}
                    <div className="shrink-0 mt-0.5">
                      {event.type === 'voicemail' && (
                        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-2xs">
                          <MicIcon className="w-4 h-4" />
                        </div>
                      )}
                      {event.type === 'call_inbound' && (
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                          <PhoneIcon className="w-4 h-4" />
                        </div>
                      )}
                      {event.type === 'call_missed' && (
                        <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-2xs">
                          <PhoneOffIcon className="w-4 h-4" />
                        </div>
                      )}
                      {event.type.startsWith('sms_') && (
                        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shadow-2xs">
                          <MailIcon className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Contact & Event Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-xs ${
                            event.isUnread
                              ? 'font-black text-slate-900'
                              : 'font-bold text-slate-800'
                          }`}
                        >
                          {event.contactName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {event.contactPhone}
                        </span>
                        {event.homePhone && (
                          <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                            <HomeModernIcon className="w-2.5 h-2.5 text-slate-500" />
                            <span>Home Line</span>
                          </span>
                        )}
                        {event.contactType === 'driver' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                            Driver
                          </span>
                        )}
                      </div>

                      {/* Snippet / Transcript */}
                      <p
                        className={`text-xs line-clamp-1 mt-0.5 ${
                          event.isUnread ? 'text-slate-900 font-medium' : 'text-slate-600'
                        }`}
                      >
                        {event.snippet}
                      </p>

                      {/* Voicemail Audio Controls, Speed, & Booking Shortcut */}
                      {event.type === 'voicemail' && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onTogglePlayVoicemail(event.id);
                                }}
                                className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                              >
                                {playingVoicemailId === event.id ? (
                                  <PauseIcon className="w-3.5 h-3.5" />
                                ) : (
                                  <PlayIcon className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <span className="text-[11px] font-mono font-bold text-amber-900">
                                {event.audioDuration}
                              </span>
                              <div className="h-2 w-24 bg-amber-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full bg-amber-600 ${
                                    playingVoicemailId === event.id ? 'w-2/3 animate-pulse' : 'w-0'
                                  }`}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCyclePlaybackSpeed();
                                }}
                                className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 transition-colors cursor-pointer"
                                title="Toggle playback speed"
                              >
                                {playbackSpeed}x
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCall(event.contactPhone, event.contactName);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                                title="Call customer"
                              >
                                <PhoneIcon className="w-2.5 h-2.5" />
                                <span>Call</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onConvertVoicemailToBooking(event.suggestedBooking);
                                }}
                                className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                              >
                                <span>Book</span>
                              </button>
                            </div>
                          </div>

                          {event.transcription && (
                            <p className="text-[11px] text-slate-700 italic border-l-2 border-amber-400 pl-2">
                              "{event.transcription}"
                            </p>
                          )}
                        </div>
                      )}

                      {/* Call Recording Playback Scrubber for Call Events */}
                      {event.type.startsWith('call_') &&
                        (event.hasRecording ||
                          (event.durationSeconds && event.durationSeconds > 0)) && (
                          <div className="mt-2.5 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onTogglePlayCall(event.id);
                                  }}
                                  className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                                >
                                  {playingCallId === event.id ? (
                                    <PauseIcon className="w-3.5 h-3.5" />
                                  ) : (
                                    <PlayIcon className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <span className="text-[11px] font-mono font-bold text-emerald-950">
                                  {event.audioDuration ||
                                    `${Math.floor(
                                      (event.durationSeconds || 60) / 60
                                    )}:${((event.durationSeconds || 60) % 60)
                                      .toString()
                                      .padStart(2, '0')}`}
                                </span>
                                <div className="h-2 w-24 bg-emerald-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full bg-emerald-600 ${
                                      playingCallId === event.id ? 'w-2/3 animate-pulse' : 'w-0'
                                    }`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCyclePlaybackSpeed();
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                                  title="Playback speed"
                                >
                                  {playbackSpeed}x
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onStartCall(event.contactPhone, event.contactName);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
                              >
                                <PhoneIcon className="w-2.5 h-2.5" />
                                <span>Call</span>
                              </button>
                            </div>

                            {event.transcription && (
                              <p className="text-[11px] text-slate-700 italic border-l-2 border-emerald-400 pl-2">
                                "{event.transcription}"
                              </p>
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Timestamp & Quick Badges */}
                  <div className="shrink-0 text-right flex flex-col items-end gap-1.5 pl-2">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {event.timestamp}
                    </span>
                    {event.type === 'call_missed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStartCall(event.contactPhone);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold border border-rose-200 cursor-pointer flex items-center gap-1"
                      >
                        <PhoneIcon className="w-2.5 h-2.5" />
                        <span>Call</span>
                      </button>
                    )}
                  </div>

                  {/* Hover Action Overlay Strip (Gmail / Linear Style) */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-3 top-3 hidden group-hover:flex items-center gap-1 bg-white/95 backdrop-blur-xs shadow-md border border-slate-200 rounded-xl px-2 py-1 z-20 animate-in fade-in zoom-in-95 duration-100"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleReadStatus(event.id)}
                      title={event.isUnread ? 'Mark as Read' : 'Mark as Unread'}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      {event.isUnread ? (
                        <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <MailIcon className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(event.contactPhone, event.contactName)}
                      title={`Call ${event.contactName}`}
                      className="p-1 rounded-lg hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectContact(event.contactPhone)}
                      title="Open SMS message thread"
                      className="p-1 rounded-lg hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onForwardItem(event)}
                      title="Copy summary to clipboard"
                      className="p-1 rounded-lg hover:bg-amber-50 text-slate-600 hover:text-amber-600 transition-colors cursor-pointer"
                    >
                      <ExternalLinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onArchiveItem(event.id)}
                      title="Archive / Remove"
                      className="p-1 rounded-lg hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (mode === 'call_history') {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        <CommsBatchActionBar
          selectedCount={selectedItemIds.size}
          onMarkRead={onBatchMarkRead}
          onMarkUnread={onBatchMarkUnread}
          onArchive={onBatchArchive}
          onClear={onClearSelection}
        />
        {selectedItemIds.size === 0 && (
          <CommsFilterToolbar
            isAllSelected={isAllSelected}
            masterCheckboxRef={masterCheckboxRef}
            onToggleSelectAll={onToggleSelectAll}
            unreadCount={unreadCount}
            filterUnreadOnly={filterUnreadOnly}
            onToggleUnreadOnly={onToggleUnreadOnly}
            contactFilter={contactFilter}
            onChangeContactFilter={onChangeContactFilter}
            searchQuery={searchQuery}
            onChangeSearchQuery={onChangeSearchQuery}
            showChannelFilter={true}
            channelFilter={callTypeFilter}
            onChangeChannelFilter={(val) => onChangeCallTypeFilter(val as CallTypeFilter)}
            channelOptions={[
              { value: 'all', label: 'All Call Types' },
              { value: 'inbound', label: 'Inbound Only' },
              { value: 'outbound', label: 'Outbound Only' },
              { value: 'missed', label: 'Missed Only' },
            ]}
            placeholder="Filter call history..."
          />
        )}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <p className="text-xs font-bold text-slate-600">No Call History Matches</p>
              <p className="text-[11px]">No call records match your current filter criteria.</p>
            </div>
          ) : (
            items.map((call) => {
              const isCallPlaying = playingCallId === call.id;
              const isMissed = call.type === 'call_missed';
              const isOutbound = call.type === 'call_outbound';
              const isRowSelected = selectedItemIds.has(call.id);

              return (
                <div
                  key={call.id}
                  onClick={() => onSelectContact(call.contactPhone)}
                  className={`group relative p-3.5 transition-all cursor-pointer space-y-2 border-l-4 ${
                    isRowSelected
                      ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                      : call.isUnread
                      ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                      : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                  }`}
                >
                  {/* Caller Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelectRow(call.id);
                        }}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        {call.isUnread ? (
                          <span
                            className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                            title="Unread call"
                          />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                        )}
                      </div>
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                          isMissed
                            ? 'bg-rose-100 text-rose-600'
                            : isOutbound
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-emerald-100 text-emerald-600'
                        }`}
                      >
                        <PhoneIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">
                          {call.contactName}
                        </h4>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {call.contactPhone}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 block font-medium">
                        {call.timestamp}
                      </span>
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md uppercase tracking-wider ${
                          isMissed
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isOutbound
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isMissed ? 'Missed' : isOutbound ? 'Outbound' : 'Inbound'}
                      </span>
                    </div>
                  </div>

                  {/* Snippet / Description */}
                  <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-xl border border-slate-100">
                    {call.transcription || call.snippet}
                  </p>

                  {/* Audio Playback Scrubber if recording exists */}
                  {call.hasRecording && (
                    <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-emerald-800">
                        <span className="flex items-center gap-1.5">
                          <MicIcon className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Call Recording</span>
                          <span className="text-slate-400 font-normal">
                            ({call.audioDuration || '2:14'})
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="px-1.5 py-0.5 bg-white border border-emerald-300 rounded font-mono font-bold text-[9px] text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                          title="Toggle playback speed"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onTogglePlayCall(call.id)}
                          className="w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-2xs active:scale-95"
                        >
                          {isCallPlaying ? (
                            <PauseIcon className="w-3 h-3 text-white" />
                          ) : (
                            <PlayIcon className="w-3 h-3 text-white ml-0.5" />
                          )}
                        </button>
                        <div className="flex-1 h-2 bg-emerald-200/60 rounded-full overflow-hidden relative cursor-pointer">
                          <div
                            className={`h-full bg-emerald-500 rounded-full transition-all duration-300 ${
                              isCallPlaying ? 'w-2/3 animate-pulse' : 'w-0'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-emerald-700 font-bold shrink-0">
                          {isCallPlaying ? '0:45' : call.audioDuration || '0:00'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions: Call Back / Dial */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onOpenInKeypad(call.contactPhone)}
                      className="px-2 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Keypad
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(call.contactPhone, call.contactName)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <PhoneIcon className="w-3 h-3" />
                      <span>Call</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (mode === 'call_missed') {
    return (
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        <CommsBatchActionBar
          selectedCount={selectedItemIds.size}
          onMarkRead={onBatchMarkRead}
          onMarkUnread={onBatchMarkUnread}
          onArchive={onBatchArchive}
          onClear={onClearSelection}
        />
        {selectedItemIds.size === 0 && (
          <CommsFilterToolbar
            isAllSelected={isAllSelected}
            masterCheckboxRef={masterCheckboxRef}
            onToggleSelectAll={onToggleSelectAll}
            unreadCount={unreadCount}
            filterUnreadOnly={filterUnreadOnly}
            onToggleUnreadOnly={onToggleUnreadOnly}
            contactFilter={contactFilter}
            onChangeContactFilter={onChangeContactFilter}
            searchQuery={searchQuery}
            onChangeSearchQuery={onChangeSearchQuery}
            showChannelFilter={false}
            placeholder="Filter missed calls..."
          />
        )}
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
              <span>Missed Inbound Calls</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Unanswered customer and driver attempts requiring callback
            </p>
          </div>
          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            {items.length} Missed
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
          {items.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-lg">
                ✓
              </div>
              <p className="text-xs font-bold text-slate-600">No Missed Calls</p>
              <p className="text-[11px]">
                All incoming call attempts have been answered or resolved.
              </p>
            </div>
          ) : (
            items.map((call) => {
              const isRowSelected = selectedItemIds.has(call.id);
              return (
                <div
                  key={call.id}
                  onClick={() => onSelectContact(call.contactPhone)}
                  className={`group relative p-3.5 transition-all cursor-pointer space-y-2.5 border-l-4 ${
                    isRowSelected
                      ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                      : call.isUnread
                      ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                      : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelectRow(call.id);
                        }}
                        className="flex items-center gap-1.5 shrink-0"
                      >
                        <input
                          type="checkbox"
                          checked={isRowSelected}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        {call.isUnread ? (
                          <span
                            className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                            title="Unread missed call"
                          />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <PhoneIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">
                          {call.contactName}
                        </h4>
                        <p className="text-[11px] text-slate-600 font-mono font-medium">
                          {call.contactPhone}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-500 font-medium block">
                        {call.timestamp}
                      </span>
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
                        Missed Call
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 bg-rose-50/60 p-2 rounded-xl border border-rose-100">
                    {call.transcription || call.snippet}
                  </p>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => onOpenInKeypad(call.contactPhone)}
                      className="px-2 py-1 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Keypad
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartCall(call.contactPhone, call.contactName)}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <PhoneIcon className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // mode === 'voicemail'
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      <CommsBatchActionBar
        selectedCount={selectedItemIds.size}
        onMarkRead={onBatchMarkRead}
        onMarkUnread={onBatchMarkUnread}
        onArchive={onBatchArchive}
        onClear={onClearSelection}
      />
      {selectedItemIds.size === 0 && (
        <CommsFilterToolbar
          isAllSelected={isAllSelected}
          masterCheckboxRef={masterCheckboxRef}
          onToggleSelectAll={onToggleSelectAll}
          unreadCount={unreadCount}
          filterUnreadOnly={filterUnreadOnly}
          onToggleUnreadOnly={onToggleUnreadOnly}
          contactFilter={contactFilter}
          onChangeContactFilter={onChangeContactFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={onChangeSearchQuery}
          showChannelFilter={false}
          placeholder="Filter voicemails..."
        />
      )}
      <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-extrabold text-xs text-slate-900">Voicemail Inbox</h3>
          <p className="text-[11px] text-slate-500">
            Audio playback and automated booking transcripts
          </p>
        </div>
        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
          {unreadCount} New Voicemail
        </span>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
        {items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-2">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-lg">
              ✓
            </div>
            <p className="text-xs font-bold text-slate-600">No Voicemails Found</p>
            <p className="text-[11px]">No voicemail messages match your active filter.</p>
          </div>
        ) : (
          items.map((vm) => {
            const isRowSelected = selectedItemIds.has(vm.id);
            return (
              <div
                key={vm.id}
                onClick={() => onToggleSelectRow(vm.id)}
                className={`group relative p-3.5 transition-all cursor-pointer space-y-3 border-l-4 ${
                  isRowSelected
                    ? 'bg-blue-100/70 border-l-blue-700 shadow-2xs'
                    : vm.isUnread
                    ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600 font-semibold'
                    : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelectRow(vm.id);
                      }}
                      className="flex items-center gap-1.5 shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={isRowSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      {vm.isUnread ? (
                        <span
                          className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                          title="Unread voicemail"
                        />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                      )}
                    </div>
                    <div>
                      <span className="font-black text-xs text-slate-900 block">
                        {vm.contactName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-600">
                        {vm.contactPhone}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">{vm.timestamp}</span>
                </div>

                {/* Audio Controls */}
                <div className="flex items-center justify-between bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onTogglePlayVoicemail(vm.id)}
                      className="w-9 h-9 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center shadow-xs cursor-pointer active:scale-95 transition-all"
                    >
                      {playingVoicemailId === vm.id ? (
                        <PauseIcon className="w-4 h-4 text-white" />
                      ) : (
                        <PlayIcon className="w-4 h-4 text-white ml-0.5" />
                      )}
                    </button>
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-900 block">
                        {vm.audioDuration}
                      </span>
                      <span className="text-[10px] text-slate-400">Recorded via Twilio PSTN</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onCyclePlaybackSpeed}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                      title="Toggle playback speed"
                    >
                      {playbackSpeed}x
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartCall(vm.contactPhone, vm.contactName)}
                      className="px-2 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                      title={`Call ${vm.contactName}`}
                    >
                      <PhoneIcon className="w-3 h-3" />
                      <span>Call</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onConvertVoicemailToBooking(vm.suggestedBooking)}
                      className="px-2.5 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <span>Book</span>
                    </button>
                  </div>
                </div>

                {/* Transcript */}
                {vm.transcription && (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Speech-to-Text Transcription
                    </span>
                    <p className="italic leading-relaxed">"{vm.transcription}"</p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface CommsRowActionSheetProps {
  event: InteractionEvent | null;
  onClose: () => void;
  onCallBack: (target: InteractionEvent) => void;
  onOpenThread: (target: InteractionEvent) => void;
  onBookTrip: (target: InteractionEvent) => void;
  onToggleRead: (target: InteractionEvent) => void;
  onSelectMultiple: (target: InteractionEvent) => void;
  onArchive: (target: InteractionEvent) => void;
  sheetDrag: CommsSheetDragProps;
}

export function CommsRowActionSheet({
  event,
  onClose,
  onCallBack,
  onOpenThread,
  onBookTrip,
  onToggleRead,
  onSelectMultiple,
  onArchive,
  sheetDrag,
}: CommsRowActionSheetProps) {
  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-[122] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 w-full max-w-md max-h-[85dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        {/* Header with drag-down-to-close */}
        <div
          {...sheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 pt-2 pb-3.5 shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-white truncate">
                {event.contactName}
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                {event.contactPhone} · {event.timestamp}
              </div>
              {event.snippet && (
                <p className="text-[11px] text-slate-300 line-clamp-1 mt-1">
                  {event.snippet}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Close communication actions"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto overscroll-contain pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onCallBack(event)}
              className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <PhoneIcon className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-extrabold">Call Back</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenThread(event)}
              className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-extrabold">Open Thread</span>
            </button>

            <button
              type="button"
              onClick={() => onBookTrip(event)}
              className="p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <CarIcon className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-extrabold">Book Trip</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleRead(event)}
              className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-900 flex flex-col items-start gap-1.5 transition-all active:scale-98 cursor-pointer"
            >
              <CheckIcon className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-extrabold">
                {event.isUnread ? 'Mark Read' : 'Mark Unread'}
              </span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => onSelectMultiple(event)}
              className="w-full px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <CheckIcon className="w-4 h-4 text-blue-600" />
              <span>Select Multiple</span>
            </button>

            <button
              type="button"
              onClick={() => onArchive(event)}
              className="w-full px-3.5 py-3 flex items-center gap-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
            >
              <TrashIcon className="w-4 h-4 text-rose-600" />
              <span>Archive Communication</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
