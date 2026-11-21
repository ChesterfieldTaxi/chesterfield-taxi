import type React from 'react';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import type { ContactRecord } from '../../../../core/services/customer/contact.service';
import type { UpcomingBookingPreview } from '../../../../core/services/workspace-bus.service';
import {
  AlertTriangleIcon,
  ChatBubbleLeftRightIcon,
  MailIcon,
  MicIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  SpinnerIcon,
  XIcon,
  ZapIcon,
} from '../../../ui/Icons';
import { CommsBatchActionBar } from './CommsBatchActionBar';
import { CommsFilterToolbar } from './CommsFilterToolbar';
import {
  formatMessageTimestamp,
  type CommsSheetDragProps,
  type ContactFilter,
  type InteractionEvent,
  type PlaybackSpeed,
  type ThreadTab,
} from './comms-types';

const NEW_SMS_PRESET_CHIPS = [
  'Your driver is arriving shortly.',
  'Your trip has been confirmed with Chesterfield Taxi.',
  'Please meet your driver outside baggage claim.',
  'Your driver is waiting at the pickup location.',
] as const;

export interface SmsThreadPaneProps {
  mode: 'thread' | 'list';
  // Thread view (VIEW 2) props
  activeContactSummary?: InteractionEvent | null;
  activeContactRecord?: ContactRecord | null;
  onBackFromThread: () => void;
  onOpenContactEdit: () => void;
  onBookContactRide: () => void;
  threadTab: ThreadTab;
  onChangeThreadTab: (tab: ThreadTab) => void;
  totalContactInteractionCount: number;
  threadSmsCount: number;
  threadCallCount: number;
  has10DlcBlockedMessages: boolean;
  upcomingBookingsForContact: UpcomingBookingPreview[];
  onViewUpcomingTrip: (trip: UpcomingBookingPreview) => void;
  selectedInteractions: InteractionEvent[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  playingCallId: string | null;
  onTogglePlayCall: (id: string) => void;
  playingVoicemailId: string | null;
  onTogglePlayVoicemail: (id: string) => void;
  playbackSpeed: PlaybackSpeed;
  onCyclePlaybackSpeed: () => void;
  onStartCall: (numberToCall?: string, contactName?: string) => void;
  onConvertVoicemailToBooking: (suggested: InteractionEvent['suggestedBooking']) => void;
  smsReplyText: string;
  onChangeSmsReplyText: (val: string) => void;
  isSendingSms: boolean;
  onSendSms: () => void;
  smsStatusMessage: string | null;
  // Messaging list view (VIEW 5) props
  messageConversations: InteractionEvent[];
  threadUnreadCountMap: Map<string, number>;
  selectedItemIds: Set<string>;
  isAllSelected: boolean;
  masterCheckboxRef: React.RefObject<HTMLInputElement | null>;
  onToggleSelectAll: () => void;
  onToggleSelectRow: (id: string) => void;
  onClearSelection: () => void;
  onBatchMarkRead: () => void;
  onBatchMarkUnread: () => void;
  onBatchArchive: () => void;
  unreadCountMessages: number;
  filterUnreadOnly: boolean;
  onToggleUnreadOnly: () => void;
  contactFilter: ContactFilter;
  onChangeContactFilter: (val: ContactFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (val: string) => void;
  onSelectContact: (phone: string) => void;
  onOpenFreshNewMessageModal: () => void;
}

export function SmsThreadPane({
  mode,
  activeContactSummary,
  activeContactRecord,
  onBackFromThread,
  onOpenContactEdit,
  onBookContactRide,
  threadTab,
  onChangeThreadTab,
  totalContactInteractionCount,
  threadSmsCount,
  threadCallCount,
  has10DlcBlockedMessages,
  upcomingBookingsForContact,
  onViewUpcomingTrip,
  selectedInteractions,
  messagesEndRef,
  playingCallId,
  onTogglePlayCall,
  playingVoicemailId,
  onTogglePlayVoicemail,
  playbackSpeed,
  onCyclePlaybackSpeed,
  onStartCall,
  onConvertVoicemailToBooking,
  smsReplyText,
  onChangeSmsReplyText,
  isSendingSms,
  onSendSms,
  smsStatusMessage,
  messageConversations,
  threadUnreadCountMap,
  selectedItemIds,
  isAllSelected,
  masterCheckboxRef,
  onToggleSelectAll,
  onToggleSelectRow,
  onClearSelection,
  onBatchMarkRead,
  onBatchMarkUnread,
  onBatchArchive,
  unreadCountMessages,
  filterUnreadOnly,
  onToggleUnreadOnly,
  contactFilter,
  onChangeContactFilter,
  searchQuery,
  onChangeSearchQuery,
  onSelectContact,
  onOpenFreshNewMessageModal,
}: SmsThreadPaneProps) {
  if (mode === 'thread' && activeContactSummary) {
    return (
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Thread Header */}
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBackFromThread}
              className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={onOpenContactEdit}
              className="text-left group hover:bg-slate-200/60 p-1.5 -m-1.5 rounded-xl transition-all cursor-pointer"
              title="Click to view & edit contact profile"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                  <span>{activeContactRecord?.name || activeContactSummary.contactName}</span>
                  <span className="text-slate-400 group-hover:text-blue-600 text-xs">✎</span>
                </span>
                {activeContactRecord?.isVip && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-black uppercase">
                    VIP
                  </span>
                )}
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                  Verified Contact
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span>Calling: {activeContactSummary.contactPhone}</span>
                {activeContactSummary.mobilePhone && (
                  <span className="text-blue-600 font-semibold">
                    • SMS Cell: {activeContactSummary.mobilePhone}
                  </span>
                )}
                <span className="text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                  Edit Profile
                </span>
              </div>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onStartCall(
                  activeContactSummary.mobilePhone || activeContactSummary.contactPhone
                )
              }
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <PhoneIcon className="w-3 h-3" />
              <span>Call</span>
            </button>

            <button
              type="button"
              onClick={onBookContactRide}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Book</span>
            </button>
          </div>
        </div>

        {/* Thread Channel Filter Sub-Bar & 10DLC Notice Banner */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-white border border-slate-200/90 p-0.5 rounded-lg text-[10px] font-bold">
            <button
              type="button"
              onClick={() => onChangeThreadTab('all')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                threadTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({totalContactInteractionCount})
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('sms')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'sms'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MailIcon className="w-3 h-3" />
              <span>SMS ({threadSmsCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeThreadTab('calls')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                threadTab === 'calls'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PhoneIcon className="w-3 h-3" />
              <span>Calls ({threadCallCount})</span>
            </button>
          </div>

          {has10DlcBlockedMessages && (
            <div className="flex items-center gap-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-md font-medium">
              <AlertTriangleIcon className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="font-bold text-amber-700">10DLC Notice:</span>
              <span className="hidden sm:inline">
                Carrier requires A2P 10DLC campaign registration.
              </span>
            </div>
          )}
        </div>

        {has10DlcBlockedMessages && (
          <div className="bg-amber-50/95 border-b border-amber-200 px-3 py-1.5 flex items-start gap-2 text-[11px] text-amber-900 shrink-0">
            <span className="font-bold text-amber-700 shrink-0">Carrier Alert:</span>
            <span className="leading-tight">
              Outbound SMS to US mobile networks (Verizon/AT&amp;T/T-Mobile) is blocked by carriers until A2P 10DLC Campaign registration is approved in Twilio Console. Inbound texts and VoIP delivery (e.g. 314-738-0100) are working normally.
            </span>
          </div>
        )}

        {/* Upcoming / Past Bookings Banner for Contact */}
        {upcomingBookingsForContact.length > 0 && (
          <div className="bg-blue-50/70 border-b border-blue-100 px-3 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-900">1 Upcoming Reservation:</span>
              <span className="text-blue-700">
                {upcomingBookingsForContact[0].time} to {upcomingBookingsForContact[0].dropoffAddress}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onViewUpcomingTrip(upcomingBookingsForContact[0])}
              className="text-[10px] font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
            >
              View Trip
            </button>
          </div>
        )}

        {/* Thread Activity Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
          {selectedInteractions.map((evt, idx) => {
            const prevEvt = idx > 0 ? selectedInteractions[idx - 1] : null;
            const curDateStr = evt.timestampMs ? new Date(evt.timestampMs).toDateString() : '';
            const prevDateStr = prevEvt?.timestampMs ? new Date(prevEvt.timestampMs).toDateString() : '';
            const showDateSeparator = curDateStr && curDateStr !== prevDateStr;

            return (
              <div key={evt.id} className="flex flex-col">
                {/* Optional Date Header Separator */}
                {showDateSeparator && (
                  <div className="flex justify-center my-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/80 text-slate-600">
                      {new Date(evt.timestampMs!).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                )}

                {/* SMS Inbound Bubble */}
                {evt.type === 'sms_inbound' && (
                  <div className="self-start max-w-[80%] bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] font-bold text-slate-600">
                        {evt.contactName}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-800 leading-relaxed">{evt.snippet}</p>
                  </div>
                )}

                {/* SMS Outbound Bubble */}
                {evt.type === 'sms_outbound' && (
                  <div className="self-end max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm p-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-[10px] text-blue-100 font-semibold">
                        Chesterfield Dispatch
                      </span>
                      <span className="text-[10px] text-blue-200 font-mono">
                        {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed">{evt.snippet}</p>
                    {evt.deliveryStatus && (
                      <div className="flex items-center justify-end gap-1 mt-1 text-[9px]">
                        {evt.deliveryStatus === 'delivered' ? (
                          <span className="text-emerald-300 font-medium flex items-center gap-0.5">
                            ✓✓ Delivered
                          </span>
                        ) : evt.deliveryStatus === 'sent' || evt.deliveryStatus === 'queued' ? (
                          <span className="text-blue-200 flex items-center gap-0.5">
                            ✓ Sent to carrier
                          </span>
                        ) : evt.deliveryStatus === 'undelivered' ? (
                          <span
                            className="text-amber-200 font-medium flex items-center gap-1"
                            title={
                              evt.errorMessage ||
                              'Carrier rejected delivery. US carriers require A2P 10DLC registration in Twilio Console.'
                            }
                          >
                            <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                            <span>Undelivered (10DLC blocked)</span>
                          </span>
                        ) : evt.deliveryStatus === 'failed' ? (
                          <span
                            className="text-rose-200 font-medium flex items-center gap-1"
                            title={evt.errorMessage || 'SMS dispatch failed'}
                          >
                            <AlertTriangleIcon className="w-3 h-3 shrink-0" />
                            <span>Failed</span>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {/* Call Event with Recording Playback */}
                {evt.type.startsWith('call_') && (
                  <div className="self-start w-full max-w-[85%] bg-emerald-50/70 border border-emerald-200/90 rounded-2xl rounded-tl-sm p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                          <PhoneIcon className="w-3 h-3" />
                        </div>
                        <span className="text-[11px] font-black text-emerald-950">
                          {evt.type === 'call_inbound'
                            ? 'Inbound Call'
                            : evt.type === 'call_outbound'
                            ? 'Outbound Call'
                            : 'Missed Call'}{' '}
                          • {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-800 font-bold">
                        {evt.audioDuration ||
                          `${Math.floor((evt.durationSeconds || 60) / 60)}:${(
                            (evt.durationSeconds || 60) % 60
                          )
                            .toString()
                            .padStart(2, '0')}`}
                      </span>
                    </div>

                    {/* Call Recording Audio Scrubber */}
                    <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onTogglePlayCall(evt.id)}
                          className="w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                        >
                          {playingCallId === evt.id ? (
                            <PauseIcon className="w-3.5 h-3.5" />
                          ) : (
                            <PlayIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="h-2 w-24 bg-emerald-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-emerald-600 ${
                              playingCallId === evt.id ? 'w-2/3 animate-pulse' : 'w-0'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="px-1.5 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-bold border border-emerald-300 transition-colors cursor-pointer"
                          title="Playback speed"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onStartCall(evt.contactPhone, evt.contactName)}
                        className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <PhoneIcon className="w-2.5 h-2.5" />
                        <span>Call</span>
                      </button>
                    </div>

                    {evt.transcription && (
                      <p className="text-[11px] text-slate-700 italic border-l-2 border-emerald-400 pl-2">
                        "{evt.transcription}"
                      </p>
                    )}
                  </div>
                )}

                {/* Voicemail Bubble with Audio Scrubber & Actions */}
                {evt.type === 'voicemail' && (
                  <div className="self-start max-w-[85%] bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm p-3 shadow-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900">
                        <MicIcon className="w-3 h-3 text-amber-700" />
                        <span>
                          Voicemail &middot; {formatMessageTimestamp(evt.timestampMs, evt.timestamp)}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-amber-700 font-bold">
                        {evt.audioDuration}
                      </span>
                    </div>

                    {/* Voicemail Audio Scrubber */}
                    <div className="flex items-center justify-between pt-0.5 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onTogglePlayVoicemail(evt.id)}
                          className="w-7 h-7 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center text-xs font-bold transition-transform active:scale-95 cursor-pointer shadow-xs"
                        >
                          {playingVoicemailId === evt.id ? (
                            <PauseIcon className="w-3.5 h-3.5" />
                          ) : (
                            <PlayIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <div className="h-2 w-24 bg-amber-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-amber-600 ${
                              playingVoicemailId === evt.id ? 'w-2/3 animate-pulse' : 'w-0'
                            }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={onCyclePlaybackSpeed}
                          className="px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold border border-amber-300 transition-colors cursor-pointer"
                          title="Playback speed"
                        >
                          {playbackSpeed}x
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onStartCall(evt.contactPhone, evt.contactName)}
                          className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <PhoneIcon className="w-2.5 h-2.5" />
                          <span>Call</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onConvertVoicemailToBooking(evt.suggestedBooking)}
                          className="px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <span>Book</span>
                        </button>
                      </div>
                    </div>

                    {evt.transcription && (
                      <p className="text-xs text-slate-800 italic border-l-2 border-amber-400 pl-2">
                        "{evt.transcription}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {selectedInteractions.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <MailIcon className="w-8 h-8 mb-2 opacity-30 text-slate-500" />
              <p className="text-xs font-bold text-slate-600">
                {threadTab === 'sms'
                  ? 'No SMS text messages for this contact yet.'
                  : threadTab === 'calls'
                  ? 'No calls or voicemails recorded for this contact yet.'
                  : 'No interactions recorded for this contact yet.'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Use the composer below to send an SMS text message.
              </p>
            </div>
          )}
          {/* Auto-scroll anchor to stick to the bottom of the thread */}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Response Templates & SMS Composer */}
        <div className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[10px]">
            <button
              type="button"
              onClick={() => onChangeSmsReplyText('Your cab is 5 minutes away.')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
            >
              <ZapIcon className="w-2.5 h-2.5 text-amber-500" />
              <span>&ldquo;Cab is 5 mins away&rdquo;</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeSmsReplyText('Your driver has arrived outside.')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
            >
              <ZapIcon className="w-2.5 h-2.5 text-amber-500" />
              <span>&ldquo;Driver has arrived&rdquo;</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeSmsReplyText('We have confirmed your airport reservation.')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 whitespace-nowrap cursor-pointer"
            >
              <ZapIcon className="w-2.5 h-2.5 text-amber-500" />
              <span>&ldquo;Reservation confirmed&rdquo;</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={smsReplyText}
              onChange={(e) => onChangeSmsReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSendSms();
              }}
              placeholder={`Send SMS to ${
                activeContactSummary.mobilePhone || activeContactSummary.contactPhone
              }...`}
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-blue-500 bg-slate-50 focus:bg-white"
            />
            <button
              type="button"
              onClick={onSendSms}
              disabled={isSendingSms || !smsReplyText.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              {isSendingSms ? <SpinnerIcon className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Send</span>
            </button>
          </div>

          {smsStatusMessage && (
            <p className="text-[10px] text-emerald-600 font-bold">{smsStatusMessage}</p>
          )}
        </div>
      </div>
    );
  }

  // mode === 'list' (VIEW 5: MESSAGING LIST)
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-y-auto">
      {/* Messages Actions Header Bar */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">SMS Conversations</span>
          <span className="text-[10px] text-slate-500 font-medium">
            ({messageConversations.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenFreshNewMessageModal}
          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>New Message</span>
        </button>
      </div>

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
          unreadCount={unreadCountMessages}
          filterUnreadOnly={filterUnreadOnly}
          onToggleUnreadOnly={onToggleUnreadOnly}
          contactFilter={contactFilter}
          onChangeContactFilter={onChangeContactFilter}
          searchQuery={searchQuery}
          onChangeSearchQuery={onChangeSearchQuery}
          showChannelFilter={false}
          placeholder="Filter messages..."
        />
      )}
      <div className="divide-y divide-slate-100">
        {messageConversations.length === 0 ? (
          <div className="text-center py-12 text-slate-400 space-y-3 px-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <ChatBubbleLeftRightIcon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">No Messages Found</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Start a new conversation with a customer or driver.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenFreshNewMessageModal}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Compose Message</span>
            </button>
          </div>
        ) : (
          messageConversations.map((sms) => {
            const isRowSelected = selectedItemIds.has(sms.id);
            const unreadInThread =
              threadUnreadCountMap.get(normalizePhone(sms.contactPhone) || sms.contactPhone) || 0;
            const isThreadUnread = unreadInThread > 0 || sms.isUnread;
            return (
              <div
                key={sms.id}
                onClick={() => onSelectContact(sms.contactPhone)}
                className={`p-3 transition-all cursor-pointer flex items-center gap-2.5 border-l-4 ${
                  isRowSelected
                    ? 'bg-blue-100/70 border-l-blue-700'
                    : isThreadUnread
                    ? 'bg-blue-50/70 hover:bg-blue-100/60 border-l-blue-600'
                    : 'bg-white hover:bg-slate-50 border-l-transparent text-slate-700'
                }`}
              >
                {/* Checkbox + Unread indicator */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelectRow(sms.id);
                  }}
                  className="flex items-center gap-1.5 shrink-0"
                >
                  <input
                    type="checkbox"
                    checked={isRowSelected}
                    onChange={() => {}}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  {isThreadUnread ? (
                    <span
                      className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.8)] shrink-0"
                      title="Unread SMS"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-transparent shrink-0" />
                  )}
                </div>

                {/* Contact Initial Avatar */}
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {sms.contactName ? sms.contactName.charAt(0).toUpperCase() : '#'}
                </div>

                {/* Text Details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-xs truncate ${
                          isThreadUnread ? 'font-black text-slate-900' : 'font-bold text-slate-800'
                        }`}
                      >
                        {sms.contactName}
                      </span>
                      {unreadInThread > 1 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-600 text-white font-bold shrink-0">
                          {unreadInThread}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                      {sms.timestamp}
                    </span>
                  </div>
                  <p
                    className={`text-xs line-clamp-1 mt-0.5 ${
                      isThreadUnread ? 'text-slate-900 font-medium' : 'text-slate-500'
                    }`}
                  >
                    {sms.snippet}
                  </p>
                </div>

                {/* Quick 1-Click Call */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartCall(sms.contactPhone, sms.contactName);
                  }}
                  title={`Call ${sms.contactName}`}
                  className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <PhoneIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export interface NewSmsMessageModalProps {
  isOpen: boolean;
  newMsgError: string | null;
  msgContactSearch: string;
  newMsgRecipientPhone: string;
  newMsgRecipientName: string;
  newMsgBody: string;
  isSendingNewMsg: boolean;
  isMsgContactDropdownOpen: boolean;
  filteredContactsForMsg: ContactRecord[];
  onRecipientInputChange: (val: string) => void;
  onRecipientInputFocus: () => void;
  onSelectContactOption: (contact: ContactRecord) => void;
  onBodyChange: (val: string) => void;
  onSelectPresetChip: (preset: string) => void;
  onOpenThread: () => void;
  onSend: () => void;
  onClose: () => void;
  sheetDrag: CommsSheetDragProps;
}

export function NewSmsMessageModal({
  isOpen,
  newMsgError,
  msgContactSearch,
  newMsgRecipientPhone,
  newMsgRecipientName,
  newMsgBody,
  isSendingNewMsg,
  isMsgContactDropdownOpen,
  filteredContactsForMsg,
  onRecipientInputChange,
  onRecipientInputFocus,
  onSelectContactOption,
  onBodyChange,
  onSelectPresetChip,
  onOpenThread,
  onSend,
  onClose,
  sheetDrag,
}: NewSmsMessageModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetDrag.sheetStyle}
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-slate-200 max-w-lg w-full max-h-[92dvh] overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
      >
        {/* Header */}
        <div
          {...sheetDrag.dragHandlers}
          className="bg-slate-900 text-white px-4 sm:px-5 pt-2 sm:pt-4 pb-3.5 shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-slate-600/80 mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <MailIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white truncate">New Text Message</h3>
                <p className="text-[11px] text-slate-400 truncate">
                  Send an SMS dispatch or chat with a passenger
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 rounded-full sm:rounded-lg bg-slate-800/80 sm:bg-transparent text-slate-300 hover:text-white hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
              aria-label="Close new message modal"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1">
          {newMsgError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {newMsgError}
            </div>
          )}

          {/* Recipient Search & Input */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Recipient (Phone Number or Contact)
            </label>
            <div className="relative">
              <input
                type="text"
                value={msgContactSearch || newMsgRecipientPhone}
                onChange={(e) => onRecipientInputChange(e.target.value)}
                onFocus={onRecipientInputFocus}
                placeholder="Search contact by name, phone, or enter 10-digit number..."
                className="w-full px-3 py-2 pr-8 rounded-xl border border-slate-200 text-xs text-slate-900 bg-white focus:outline-blue-500 font-medium"
              />
              {newMsgRecipientName && (
                <span className="absolute right-2.5 top-2 text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md pointer-events-none">
                  {newMsgRecipientName}
                </span>
              )}
            </div>

            {/* Dropdown search results */}
            {isMsgContactDropdownOpen && filteredContactsForMsg.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredContactsForMsg.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => onSelectContactOption(c)}
                    className="p-2.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800 block">{c.name}</span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {formatDisplayPhone(c.mobilePhone || c.phone)}
                        {c.corporateAccountName ? ` • ${c.corporateAccountName}` : ''}
                      </span>
                    </div>
                    {(c.corporateAccountNumber || (c as any).accountNumber) && (
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                        {c.corporateAccountNumber || (c as any).accountNumber}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Message text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">Message Text</label>
              <span className="text-[10px] text-slate-400 font-medium">
                {newMsgBody.length} chars
              </span>
            </div>
            <textarea
              rows={4}
              value={newMsgBody}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder="Type your message to passenger or driver..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900 bg-white focus:outline-blue-500 resize-none font-normal"
            />
          </div>

          {/* Quick Preset Chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Quick Responses
            </span>
            <div className="flex flex-wrap gap-1.5">
              {NEW_SMS_PRESET_CHIPS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSelectPresetChip(preset)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                >
                  {preset.slice(0, 36)}...
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onOpenThread}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
          >
            Open Thread
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSendingNewMsg}
              onClick={onSend}
              className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSendingNewMsg ? (
                <>
                  <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <MailIcon className="w-3.5 h-3.5" />
                  <span>Send SMS</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface MobileComposeSmsFabProps {
  isVisible: boolean;
  onOpenCompose: () => void;
}

export function MobileComposeSmsFab({ isVisible, onOpenCompose }: MobileComposeSmsFabProps) {
  if (!isVisible) return null;
  return (
    <button
      type="button"
      onClick={onOpenCompose}
      className="lg:hidden fixed bottom-16 right-4 z-30 w-12 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl shadow-blue-600/30 flex items-center justify-center transition-all cursor-pointer"
      title="Compose New Text Message"
      aria-label="Compose New Text Message"
    >
      <PlusIcon className="w-5 h-5" />
    </button>
  );
}
