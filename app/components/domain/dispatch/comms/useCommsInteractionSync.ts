import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { authorizedFetch } from '../../../../core/services/auth/auth-headers';
import {
  buildUnifiedCommsThreadSummaries,
  filterCommsInteractionEvents,
  matchesCommsContactAndSearchFilter,
  toggleCommsMultiFilter,
} from '../../../../core/services/comms/comms-templates.service';
import {
  commsEventToInteractionEvent,
  getCommsThreadService,
  interactionEventToCommsEvent,
} from '../../../../core/services/comms/comms-thread.service';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getDispatchEmailService } from '../../../../core/services/email/dispatch-email.service';
import { normalizePhone } from '../../../../core/services/passenger.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import { buildCommsEventId, type CommsEvent, type CommsThread } from '../../../../core/types/comms';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import type {
  CallTypeFilter,
  ChannelFilter,
  ContactFilter,
  InteractionEvent,
  MultiChannelKey,
  MultiContactKey,
  PlaybackSpeed,
} from './comms-types';
import { playInboundSmsChime } from './useTwilioSoftphoneDevice';

const INITIAL_INTERACTIONS: InteractionEvent[] = [];
const LEGACY_INTERACTIONS_STORAGE_KEY = 'ct_comms_interactions';
const RESYNC_THROTTLE_MS = 4_000;

function sortInteractionsDesc(items: InteractionEvent[]): InteractionEvent[] {
  return [...items].sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
}

function filterLegacySeedInteractions(items: unknown[]): InteractionEvent[] {
  const cleaned = (items as InteractionEvent[]).filter(
    (p: any) =>
      p &&
      !p?.snippet?.includes('Thank you for contacting our dispatch desk') &&
      !p?.id?.startsWith('sms_seed_') &&
      !p?.id?.startsWith('int-') &&
      !p?.id?.startsWith('rec_') &&
      p?.contactName !== 'Recorded Call' &&
      p?.contactPhone !== '+13145551234'
  );
  return sortInteractionsDesc(cleaned);
}

/**
 * One-time migration helper that drains and removes the retired `ct_comms_interactions`
 * storage key into `CommsThreadService` so deleted/read state can never diverge across refreshes.
 */
function migrateAndRetireLegacyInteractionsStorage(
  commsService = getCommsThreadService()
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = localStorage.getItem(LEGACY_INTERACTIONS_STORAGE_KEY);
    if (!raw) return;
    localStorage.removeItem(LEGACY_INTERACTIONS_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const cleaned = filterLegacySeedInteractions(parsed);
    if (cleaned.length > 0 && commsService.getAllEvents({ includeArchived: true, includeDeleted: true }).length === 0) {
      const migrated = cleaned.map((item) => interactionEventToCommsEvent(item));
      commsService.hydrateFromServerSync({ events: migrated });
    }
  } catch {
    try {
      localStorage.removeItem(LEGACY_INTERACTIONS_STORAGE_KEY);
    } catch {}
  }
}

function mergeEphemeralWithCanonical(
  ephemeral: InteractionEvent[],
  adaptedCanonical: InteractionEvent[],
  commsService = getCommsThreadService()
): InteractionEvent[] {
  if (ephemeral.length === 0) {
    return sortInteractionsDesc(adaptedCanonical);
  }

  const canonicalIds = new Set(adaptedCanonical.map((a) => a.id));
  const canonicalCallSids = new Set(
    adaptedCanonical.map((a) => a.callSid).filter((s): s is string => Boolean(s))
  );

  const activeEphemeral = ephemeral.filter((item) => {
    if (
      item.isDeleted ||
      commsService.isEventDeleted(item.id) ||
      (item.threadId && commsService.isThreadDeleted(item.threadId))
    ) {
      return false;
    }
    if (
      canonicalIds.has(item.id) ||
      canonicalIds.has(`sms_${item.id}`) ||
      canonicalIds.has(`call_${item.id}`) ||
      canonicalIds.has(`vm_${item.id}`) ||
      canonicalIds.has(`em_${item.id}`)
    ) {
      return false;
    }
    if (item.callSid && canonicalCallSids.has(item.callSid)) {
      return false;
    }
    if (item.id.startsWith('sms_out_')) {
      const normItemPhone = normalizePhone(item.contactPhone);
      const matchedOutbound = adaptedCanonical.some(
        (a) =>
          a.type === 'sms_outbound' &&
          normalizePhone(a.contactPhone) === normItemPhone &&
          a.snippet === item.snippet &&
          Math.abs((a.timestampMs || 0) - (item.timestampMs || 0)) < 120_000
      );
      if (matchedOutbound) return false;
    }
    return true;
  });

  if (activeEphemeral.length === 0) {
    return sortInteractionsDesc(adaptedCanonical);
  }
  return sortInteractionsDesc([...activeEphemeral, ...adaptedCanonical]);
}

export interface UseCommsInteractionSyncOptions {
  isVisible: boolean;
}

export function useCommsInteractionSync({ isVisible }: UseCommsInteractionSyncOptions) {
  const workspaceBus = getWorkspaceBus();

  // Canonical state derived strictly from CommsThreadService; ephemeralInteractions holds only in-flight live call/SMS bubbles
  const [commsThreads, setCommsThreads] = useState<CommsThread[]>([]);
  const [commsEvents, setCommsEvents] = useState<CommsEvent[]>([]);
  const [ephemeralInteractions, setEphemeralInteractions] = useState<InteractionEvent[]>(
    INITIAL_INTERACTIONS
  );

  const adaptedCanonicalEvents = useMemo(() => {
    const threadMap = new Map(commsThreads.map((t) => [t.id, t]));
    return commsEvents
      .filter((evt) => !evt.isDeleted && !threadMap.get(evt.threadId)?.isDeleted)
      .map((evt) => commsEventToInteractionEvent(evt, threadMap.get(evt.threadId)));
  }, [commsEvents, commsThreads]);

  const adaptedRef = useRef<InteractionEvent[]>(adaptedCanonicalEvents);
  adaptedRef.current = adaptedCanonicalEvents;

  const interactions = useMemo(
    () => mergeEphemeralWithCanonical(ephemeralInteractions, adaptedCanonicalEvents),
    [ephemeralInteractions, adaptedCanonicalEvents]
  );

  const setInteractions: Dispatch<SetStateAction<InteractionEvent[]>> = useCallback((updater) => {
    setEphemeralInteractions((prevEphemeral) => {
      const currentCombined = mergeEphemeralWithCanonical(prevEphemeral, adaptedRef.current);
      const nextCombined =
        typeof updater === 'function' ? updater(currentCombined) : updater;
      if (nextCombined === currentCombined) return prevEphemeral;
      const canonicalIdSet = new Set(adaptedRef.current.map((a) => a.id));
      return sortInteractionsDesc(
        nextCombined.filter((item) => !canonicalIdSet.has(item.id) && !item.isDeleted)
      );
    });
  }, []);

  // Filter state
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all');
  const [channelFilters, setChannelFilters] = useState<MultiChannelKey[]>([]);
  const [callTypeFilter, setCallTypeFilter] = useState<CallTypeFilter>('all');
  const [contactFilter, setContactFilter] = useState<ContactFilter>('all');
  const [contactFilters, setContactFilters] = useState<MultiContactKey[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleChannelFilter = useCallback(
    (key: MultiChannelKey) => setChannelFilters((prev) => toggleCommsMultiFilter(prev, key)),
    []
  );
  const toggleContactFilter = useCallback(
    (key: MultiContactKey) => setContactFilters((prev) => toggleCommsMultiFilter(prev, key)),
    []
  );

  // Audio playback state (voicemails & call recordings)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoicemailId, setPlayingVoicemailId] = useState<string | null>(null);
  const [playingCallId, setPlayingCallId] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);

  // Hydrate & subscribe to CommsThreadService + DispatchEmailService live mirror
  useEffect(() => {
    const commsService = getCommsThreadService();
    const emailService = getDispatchEmailService();

    migrateAndRetireLegacyInteractionsStorage(commsService);

    setCommsThreads(commsService.getThreads({ includeArchived: true }));
    setCommsEvents(commsService.getAllEvents({ includeArchived: true }));

    const unsubComms = commsService.subscribe(({ threads, events }) => {
      setCommsThreads(threads);
      setCommsEvents(events);
    });

    // Mirror DispatchEmailService (`dispatch@chesterfieldtaxi.com`) into CommsThreadService even before EmailDock opens
    const unsubEmails = emailService.subscribe(() => {
      void emailService.ensureCommsMirrorSynced();
    });
    void emailService.ensureCommsMirrorSynced();
    void emailService.syncWithServer({ seedSamplesIfOfflineEmpty: true });

    return () => {
      unsubComms();
      unsubEmails();
    };
  }, []);

  // Audio element player synchronization (uses server-signed audioUrl with sig + exp whenever available)
  useEffect(() => {
    if (!audioPlayerRef.current) return;
    const player = audioPlayerRef.current;

    let targetUrl: string | null = null;
    if (playingVoicemailId) {
      const vm = interactions.find((i) => i.id === playingVoicemailId);
      targetUrl =
        vm?.audioUrl ||
        (vm?.recordingSid
          ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(vm.recordingSid)}`
          : null);
    } else if (playingCallId) {
      const call = interactions.find((i) => i.id === playingCallId);
      targetUrl =
        call?.audioUrl ||
        (call?.recordingSid
          ? `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(
              call.recordingSid
            )}`
          : null);
    }

    if (targetUrl) {
      player.src = targetUrl;
      player.playbackRate = playbackSpeed;
      player.onended = () => {
        setPlayingVoicemailId(null);
        setPlayingCallId(null);
      };
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [playingVoicemailId, playingCallId, playbackSpeed, interactions]);

  // Unified telephony & multi-channel comms fetcher routed strictly through CommsThreadService
  const fetchTelephonyData = useCallback(async () => {
    const commsService = getCommsThreadService();
    try {
      const [syncResp, vmResp, msgResp, recResp] = await Promise.all([
        authorizedFetch('/api/telephony?action=sync_comms'),
        authorizedFetch('/api/telephony?action=list_voicemails'),
        authorizedFetch('/api/telephony?action=list_messages'),
        authorizedFetch('/api/telephony?action=list_recordings'),
        getDispatchEmailService().syncWithServer(),
      ]);

      if (syncResp.ok) {
        const syncData = (await syncResp.json()) as any;
        if (syncData?.success) {
          commsService.hydrateFromServerSync({
            threads: syncData.threads,
            events: syncData.events,
          });
        }
      }

      if (vmResp.ok) {
        const vmData = (await vmResp.json()) as any;
        if (vmData.success && Array.isArray(vmData.voicemails)) {
          for (const v of vmData.voicemails) {
            if (!v || v.isDeleted) continue;
            const rawSid = v.recordingSid || v.id;
            if (!rawSid) continue;
            const evtId = buildCommsEventId('voicemail', rawSid);
            if (commsService.isEventDeleted(evtId)) continue;

            const existing = commsService.getEventById(evtId);
            if (
              !existing ||
              existing.transcription !== v.transcription ||
              existing.audioUrl !== v.audioUrl
            ) {
              await commsService.recordCommsEvent(
                {
                  id: evtId,
                  recordingSid: v.recordingSid,
                  externalSid: rawSid,
                  channel: 'voicemail',
                  direction: 'inbound',
                  eventType: 'voicemail',
                  contactName: v.contactName,
                  contactPhone: v.contactPhone,
                  contactType: (v.contactType as InteractionEvent['contactType']) || 'passenger',
                  durationSeconds: parseInt(v.audioDuration || '30', 10),
                  audioDuration: v.audioDuration || '0:30',
                  audioUrl: v.audioUrl,
                  snippet: `Voicemail: ${
                    v.transcription ? v.transcription.slice(0, 50) + '...' : 'Audio message'
                  }`,
                  bodyText: v.transcription || '',
                  transcription: v.transcription,
                  suggestedBooking: v.suggestedBooking,
                  isUnread: existing ? existing.isUnread : (v.isUnread ?? true),
                  isArchived: existing ? existing.isArchived : v.isArchived,
                  statusUpdatedAtMs: existing?.statusUpdatedAtMs ?? v.statusUpdatedAtMs,
                  timestampMs: v.timestampMs || Date.now(),
                },
                { skipBroadcast: true }
              );
            }
          }
        }
      }

      if (msgResp.ok) {
        const msgData = (await msgResp.json()) as any;
        if (msgData.success && Array.isArray(msgData.messages)) {
          let hasNewInbound = false;
          for (const m of msgData.messages) {
            if (
              !m ||
              m.isDeleted ||
              m.body?.includes('Thank you for contacting our dispatch desk')
            ) {
              continue;
            }
            const rawSid = m.sid || m.id;
            if (!rawSid) continue;
            const evtId = buildCommsEventId('sms', rawSid);
            if (commsService.isEventDeleted(evtId)) continue;

            const existing = commsService.getEventById(evtId);
            if (existing) {
              const deliveryChanged =
                (m.status && existing.deliveryStatus !== m.status) ||
                (m.errorCode !== undefined && existing.errorCode !== m.errorCode) ||
                (m.errorMessage !== undefined && existing.errorMessage !== m.errorMessage);
              if (deliveryChanged) {
                await commsService.recordCommsEvent(
                  {
                    ...existing,
                    deliveryStatus: m.status || existing.deliveryStatus,
                    errorCode: m.errorCode !== undefined ? m.errorCode : existing.errorCode,
                    errorMessage:
                      m.errorMessage !== undefined ? m.errorMessage : existing.errorMessage,
                    isUnread: existing.isUnread,
                    isArchived: existing.isArchived,
                    isDeleted: existing.isDeleted,
                    statusUpdatedAtMs: existing.statusUpdatedAtMs,
                  },
                  { skipBroadcast: true }
                );
              }
              continue;
            }

            const phone = m.direction === 'inbound' ? m.from : m.to;
            const contact = getContactService().getContactByPhone(phone);
            const displayName = contact?.name || formatDisplayPhone(phone);
            const isInboundUnread = m.direction === 'inbound' ? (m.isUnread ?? true) : false;

            if (m.direction === 'inbound' && isInboundUnread) {
              hasNewInbound = true;
            }

            await commsService.recordCommsEvent(
              {
                id: evtId,
                externalSid: rawSid,
                channel: 'sms',
                direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
                eventType: m.direction === 'inbound' ? 'sms_inbound' : 'sms_outbound',
                contactName: displayName,
                contactPhone: phone,
                contactType: ((contact as any)?.type as any) || 'passenger',
                fromAddress: m.from,
                toAddress: m.to,
                snippet: m.body,
                bodyText: m.body,
                deliveryStatus: m.status,
                errorCode: m.errorCode,
                errorMessage: m.errorMessage,
                isUnread: isInboundUnread,
                isArchived: m.isArchived,
                statusUpdatedAtMs: m.statusUpdatedAtMs,
                timestampMs: m.timestampMs || Date.now(),
              },
              { skipBroadcast: true }
            );
          }

          if (hasNewInbound) {
            playInboundSmsChime();
          }
        }
      }

      if (recResp.ok) {
        const recData = (await recResp.json()) as any;
        if (recData.success && Array.isArray(recData.recordings)) {
          const callEvents = commsService
            .getAllEvents({ includeArchived: true })
            .filter((e) => e.channel === 'call' && !e.isDeleted);

          for (const r of recData.recordings) {
            if (!r) continue;
            const matchedCall = callEvents.find(
              (c) =>
                (r.callSid && c.externalSid === r.callSid) ||
                (r.sid && c.recordingSid === r.sid)
            );
            if (
              matchedCall &&
              (matchedCall.recordingSid !== r.sid ||
                matchedCall.audioUrl !== r.audioUrl ||
                matchedCall.durationSeconds !== r.durationSeconds)
            ) {
              await commsService.recordCommsEvent(
                {
                  ...matchedCall,
                  recordingSid: r.sid,
                  audioDuration: r.duration,
                  durationSeconds: r.durationSeconds,
                  audioUrl: r.audioUrl,
                  isUnread: matchedCall.isUnread,
                  isArchived: matchedCall.isArchived,
                  isDeleted: matchedCall.isDeleted,
                  statusUpdatedAtMs: matchedCall.statusUpdatedAtMs,
                },
                { skipBroadcast: true }
              );
            }
          }
        }
      }
    } catch {
      // Tolerated offline/background fetch error
    }
  }, []);

  // Hydrate telephony on initial open + throttled visibilitychange / focus / online re-sync triggers
  const lastTelephonyFetchRef = useRef<number>(0);
  const isVisibleRef = useRef<boolean>(isVisible);
  isVisibleRef.current = isVisible;

  const triggerThrottledResync = useCallback(
    (minIntervalMs = RESYNC_THROTTLE_MS) => {
      const now = Date.now();
      if (now - lastTelephonyFetchRef.current > minIntervalMs) {
        lastTelephonyFetchRef.current = now;
        getCommsThreadService().startRealtimeSync();
        void fetchTelephonyData();
      }
    },
    [fetchTelephonyData]
  );

  useEffect(() => {
    if (isVisible) {
      triggerThrottledResync(RESYNC_THROTTLE_MS);
    }
  }, [isVisible, triggerThrottledResync]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isVisibleRef.current) {
        triggerThrottledResync(RESYNC_THROTTLE_MS);
      }
    };
    const onWindowFocus = () => {
      if (isVisibleRef.current) {
        triggerThrottledResync(RESYNC_THROTTLE_MS);
      }
    };
    const onOnline = () => {
      triggerThrottledResync(1_000);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [triggerThrottledResync]);

  // Exclude soft-deleted items and respect showArchived filter across all derived lists & unread counts
  const visibleInteractions = useMemo(
    () =>
      interactions.filter(
        (item) => !item.isDeleted && (showArchived || !item.isArchived)
      ),
    [interactions, showArchived]
  );

  const visibleCommsThreads = useMemo(
    () =>
      commsThreads.filter(
        (thread) => !thread.isDeleted && (showArchived || !thread.isArchived)
      ),
    [commsThreads, showArchived]
  );

  // Pure domain filtering & multi-channel conversation list grouping
  const filterOptionsBase = useMemo(
    () => ({
      unreadOnly: filterUnreadOnly,
      contactFilter,
      contactFilters,
      searchQuery,
    }),
    [filterUnreadOnly, contactFilter, contactFilters, searchQuery]
  );

  const allHistoryCalls = useMemo(
    () => visibleInteractions.filter((item) => item.type.startsWith('call_')),
    [visibleInteractions]
  );
  const allMissedCalls = useMemo(
    () => visibleInteractions.filter((item) => item.type === 'call_missed'),
    [visibleInteractions]
  );
  const allVoicemails = useMemo(
    () => visibleInteractions.filter((item) => item.type === 'voicemail'),
    [visibleInteractions]
  );
  const allMessages = useMemo(
    () =>
      visibleInteractions.filter(
        (item) =>
          item.type.startsWith('sms_') &&
          !item.snippet?.includes('Thank you for contacting our dispatch desk')
      ),
    [visibleInteractions]
  );

  const filteredAllInteractions = useMemo(
    () =>
      filterCommsInteractionEvents(visibleInteractions, {
        channelFilter,
        channelFilters,
        ...filterOptionsBase,
      }),
    [visibleInteractions, channelFilter, channelFilters, filterOptionsBase]
  );

  const filteredHistoryCalls = useMemo(() => {
    return allHistoryCalls.filter((item) => {
      if (callTypeFilter === 'inbound' && item.type !== 'call_inbound') return false;
      if (callTypeFilter === 'outbound' && item.type !== 'call_outbound') return false;
      if (callTypeFilter === 'missed' && item.type !== 'call_missed') return false;
      return matchesCommsContactAndSearchFilter(item, filterOptionsBase);
    });
  }, [allHistoryCalls, callTypeFilter, filterOptionsBase]);

  const filteredMissedCalls = useMemo(
    () =>
      allMissedCalls.filter((item) =>
        matchesCommsContactAndSearchFilter(item, filterOptionsBase)
      ),
    [allMissedCalls, filterOptionsBase]
  );
  const filteredVoicemails = useMemo(
    () =>
      allVoicemails.filter((item) =>
        matchesCommsContactAndSearchFilter(item, filterOptionsBase)
      ),
    [allVoicemails, filterOptionsBase]
  );

  // Unified multi-channel conversation rows (phone, email, and merged phone+email threads)
  const conversationRows = useMemo(
    () => buildUnifiedCommsThreadSummaries(visibleInteractions, visibleCommsThreads, filterOptionsBase),
    [visibleInteractions, visibleCommsThreads, filterOptionsBase]
  );

  const filteredAllConversationRows = useMemo(
    () =>
      buildUnifiedCommsThreadSummaries(visibleInteractions, visibleCommsThreads, {
        channelFilter,
        channelFilters,
        ...filterOptionsBase,
      }),
    [visibleInteractions, visibleCommsThreads, channelFilter, channelFilters, filterOptionsBase]
  );

  const threadUnreadCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of conversationRows) {
      if (row.unreadCountTotal > 0) {
        map.set(row.threadId, row.unreadCountTotal);
        if (row.primaryPhone) {
          map.set(normalizePhone(row.primaryPhone) || row.primaryPhone, row.unreadCountTotal);
        }
        if (row.primaryEmail) {
          map.set(row.primaryEmail, row.unreadCountTotal);
        }
      }
    }
    return map;
  }, [conversationRows]);

  const messageConversations = useMemo(
    () => conversationRows.map((row) => row.latestEvent),
    [conversationRows]
  );

  const unreadCountAll = useMemo(
    () => visibleInteractions.filter((i) => i.isUnread).length,
    [visibleInteractions]
  );
  const unreadCountHistory = useMemo(
    () => allHistoryCalls.filter((i) => i.isUnread).length,
    [allHistoryCalls]
  );
  const unreadCountMissed = useMemo(
    () => allMissedCalls.filter((i) => i.isUnread).length,
    [allMissedCalls]
  );
  const unreadCountVoicemail = useMemo(
    () => allVoicemails.filter((i) => i.isUnread).length,
    [allVoicemails]
  );
  const unreadCountMessages = useMemo(
    () => allMessages.filter((i) => i.isUnread).length,
    [allMessages]
  );

  // Broadcast live unread count changes only when counts actually change
  const lastBroadcastCountsRef = useRef<string>('');
  useEffect(() => {
    const key = `${unreadCountMessages}|${unreadCountMissed}|${unreadCountVoicemail}`;
    if (lastBroadcastCountsRef.current === key) return;
    lastBroadcastCountsRef.current = key;
    workspaceBus.publish('UNREAD_COUNTS_CHANGED', {
      unreadMessages: unreadCountMessages,
      missedCalls: unreadCountMissed,
      unreadVoicemails: unreadCountVoicemail,
    });
  }, [workspaceBus, unreadCountMessages, unreadCountMissed, unreadCountVoicemail]);

  const handleCyclePlaybackSpeed = () => {
    setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  };

  const handleTogglePlayVoicemail = (id: string) => {
    setPlayingVoicemailId((prev) => (prev === id ? null : id));
  };

  const handleTogglePlayCall = (id: string) => {
    setPlayingCallId((prev) => (prev === id ? null : id));
  };

  const handleAudioEnded = () => {
    setPlayingVoicemailId(null);
    setPlayingCallId(null);
  };

  return {
    interactions,
    setInteractions,
    commsThreads,
    fetchTelephonyData,
    filterUnreadOnly,
    setFilterUnreadOnly,
    showArchived,
    setShowArchived,
    channelFilter,
    setChannelFilter,
    channelFilters,
    setChannelFilters,
    toggleChannelFilter,
    callTypeFilter,
    setCallTypeFilter,
    contactFilter,
    setContactFilter,
    contactFilters,
    setContactFilters,
    toggleContactFilter,
    searchQuery,
    setSearchQuery,
    allHistoryCalls,
    allMissedCalls,
    filteredAllInteractions,
    filteredHistoryCalls,
    filteredMissedCalls,
    filteredVoicemails,
    conversationRows,
    filteredAllConversationRows,
    threadUnreadCountMap,
    messageConversations,
    unreadCountAll,
    unreadCountHistory,
    unreadCountMissed,
    unreadCountVoicemail,
    unreadCountMessages,
    audioPlayerRef,
    playingVoicemailId,
    playingCallId,
    playbackSpeed,
    handleCyclePlaybackSpeed,
    handleTogglePlayVoicemail,
    handleTogglePlayCall,
    handleAudioEnded,
  };
}
