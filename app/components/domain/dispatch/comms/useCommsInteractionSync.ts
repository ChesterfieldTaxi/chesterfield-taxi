import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
import type { CommsEvent, CommsThread } from '../../../../core/types/comms';
import { formatDisplayPhone } from '../../../../core/utils/phone';
import {
  STORAGE_KEY_INTERACTIONS,
  type CallTypeFilter,
  type ChannelFilter,
  type ContactFilter,
  type InteractionEvent,
  type MultiChannelKey,
  type MultiContactKey,
  type PlaybackSpeed,
} from './comms-types';
import { playInboundSmsChime } from './useTwilioSoftphoneDevice';

const INITIAL_INTERACTIONS: InteractionEvent[] = [];

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

function readStoredInteractionsClientOnly(): InteractionEvent[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return INITIAL_INTERACTIONS;
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY_INTERACTIONS);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const cleaned = filterLegacySeedInteractions(parsed);
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(STORAGE_KEY_INTERACTIONS, JSON.stringify(cleaned.slice(0, 100)));
        }
        return cleaned;
      }
    }
  } catch {
    // Ignore storage parse failures
  }
  return INITIAL_INTERACTIONS;
}

function mergeAdaptedEventsWithInteractions(
  prev: InteractionEvent[],
  threads: CommsThread[],
  events: CommsEvent[]
): InteractionEvent[] {
  if (events.length === 0) return prev;
  const threadMap = new Map(threads.map((t) => [t.id, t]));
  const adapted = events.map((evt) =>
    commsEventToInteractionEvent(evt, threadMap.get(evt.threadId))
  );

  const mergedById = new Map<string, InteractionEvent>();
  for (const item of prev) {
    const prefixedSms = `sms_${item.id}`;
    const prefixedCall = `call_${item.id}`;
    const prefixedVm = `vm_${item.id}`;
    if (
      adapted.some(
        (a) =>
          a.id === item.id ||
          a.id === prefixedSms ||
          a.id === prefixedCall ||
          a.id === prefixedVm
      )
    ) {
      continue;
    }
    mergedById.set(item.id, item);
  }
  for (const a of adapted) {
    mergedById.set(a.id, a);
  }
  return Array.from(mergedById.values()).sort(
    (x, y) => (y.timestampMs || 0) - (x.timestampMs || 0)
  );
}

export interface UseCommsInteractionSyncOptions {
  isVisible: boolean;
}

export function useCommsInteractionSync({ isVisible }: UseCommsInteractionSyncOptions) {
  const workspaceBus = getWorkspaceBus();

  // SSR-deterministic initializers — localStorage & service snapshots hydrate inside useEffect
  const [interactions, setInteractionsRaw] = useState<InteractionEvent[]>(INITIAL_INTERACTIONS);
  const setInteractions: Dispatch<SetStateAction<InteractionEvent[]>> = useCallback((updater) => {
    setInteractionsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return next === prev ? prev : sortInteractionsDesc(next);
    });
  }, []);
  const [commsThreads, setCommsThreads] = useState<CommsThread[]>([]);
  const hasHydratedStorageRef = useRef(false);

  // Filter state
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
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

  // Persist interactions to localStorage strictly after initial client hydration
  useEffect(() => {
    if (
      hasHydratedStorageRef.current &&
      typeof window !== 'undefined' &&
      window.localStorage &&
      interactions.length > 0
    ) {
      try {
        localStorage.setItem(STORAGE_KEY_INTERACTIONS, JSON.stringify(interactions.slice(0, 100)));
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [interactions]);

  // Hydrate localStorage + subscribe to CommsThreadService & DispatchEmailService live mirror
  useEffect(() => {
    const commsService = getCommsThreadService();
    const emailService = getDispatchEmailService();

    const storedItems = readStoredInteractionsClientOnly();
    hasHydratedStorageRef.current = true;

    if (storedItems.length > 0 && commsService.getAllEvents().length === 0) {
      const seeded = storedItems.map((item) => interactionEventToCommsEvent(item));
      commsService.hydrateFromServerSync({ events: seeded });
    }

    const initialThreads = commsService.getThreads();
    const initialEvents = commsService.getAllEvents();
    setCommsThreads(initialThreads);

    if (storedItems.length > 0 || initialEvents.length > 0) {
      setInteractions((prev) => {
        const base = storedItems.length > 0 && prev.length === 0 ? storedItems : prev;
        const combined =
          prev.length > 0 && storedItems.length > 0
            ? sortInteractionsDesc(
                Array.from(new Map([...storedItems, ...prev].map((i) => [i.id, i])).values())
              )
            : sortInteractionsDesc(base);
        return mergeAdaptedEventsWithInteractions(combined, initialThreads, initialEvents);
      });
    }

    const unsubComms = commsService.subscribe(({ threads, events }) => {
      setCommsThreads(threads);
      if (events.length === 0) return;
      setInteractions((prev) => mergeAdaptedEventsWithInteractions(prev, threads, events));
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

  // Unified telephony & multi-channel comms fetcher
  const fetchTelephonyData = async () => {
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
          getCommsThreadService().hydrateFromServerSync({
            threads: syncData.threads,
            events: syncData.events,
          });
        }
      }

      if (vmResp.ok) {
        const vmData = (await vmResp.json()) as any;
        if (vmData.success && Array.isArray(vmData.voicemails)) {
          setInteractions((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newVms = vmData.voicemails
              .filter((v: any) => !existingIds.has(v.id))
              .map((v: any) => ({
                id: v.id,
                type: 'voicemail' as const,
                contactName: v.contactName,
                contactPhone: v.contactPhone,
                contactType: (v.contactType as InteractionEvent['contactType']) || 'passenger',
                timestamp: v.timestamp,
                timestampMs: v.timestampMs || Date.now(),
                durationSeconds: parseInt(v.audioDuration || '30', 10),
                audioDuration: v.audioDuration || '0:30',
                snippet: `Voicemail: ${v.transcription ? v.transcription.slice(0, 50) + '...' : 'Audio message'}`,
                transcription: v.transcription,
                recordingSid: v.recordingSid,
                suggestedBooking: v.suggestedBooking,
                isUnread: v.isUnread ?? true,
              }));
            if (newVms.length === 0) return prev;
            return sortInteractionsDesc([...newVms, ...prev]);
          });
        }
      }

      if (msgResp.ok) {
        const msgData = (await msgResp.json()) as any;
        if (msgData.success && Array.isArray(msgData.messages)) {
          setInteractions((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const newMsgs: InteractionEvent[] = [];
            let hasNewInbound = false;
            let hasStateUpdates = false;
            const updatedPrev = [...prev];

            msgData.messages.forEach((m: any) => {
              if (m.body?.includes('Thank you for contacting our dispatch desk')) {
                return;
              }

              const phone = m.direction === 'inbound' ? m.from : m.to;

              // Update delivery status & error details if already present by SID
              const existingIdx = updatedPrev.findIndex((p) => p.id === m.id);
              if (existingIdx !== -1) {
                const existing = updatedPrev[existingIdx];
                if (
                  (m.status && existing.deliveryStatus !== m.status) ||
                  (m.errorCode !== undefined && existing.errorCode !== m.errorCode) ||
                  (m.errorMessage !== undefined && existing.errorMessage !== m.errorMessage)
                ) {
                  hasStateUpdates = true;
                  updatedPrev[existingIdx] = {
                    ...existing,
                    deliveryStatus: m.status || existing.deliveryStatus,
                    errorCode: m.errorCode !== undefined ? m.errorCode : existing.errorCode,
                    errorMessage:
                      m.errorMessage !== undefined ? m.errorMessage : existing.errorMessage,
                  };
                }
                return;
              }

              // Reconcile optimistic outbound SMS bubbles
              const optimisticIdx = updatedPrev.findIndex(
                (p) =>
                  p.id.startsWith('sms_out_') &&
                  normalizePhone(p.contactPhone) === normalizePhone(phone) &&
                  p.snippet === m.body &&
                  Math.abs((p.timestampMs || 0) - (m.timestampMs || 0)) < 120000
              );

              if (optimisticIdx !== -1) {
                hasStateUpdates = true;
                updatedPrev[optimisticIdx] = {
                  ...updatedPrev[optimisticIdx],
                  id: m.id,
                  deliveryStatus: m.status || updatedPrev[optimisticIdx].deliveryStatus,
                  errorCode:
                    m.errorCode !== undefined
                      ? m.errorCode
                      : updatedPrev[optimisticIdx].errorCode,
                  errorMessage:
                    m.errorMessage !== undefined
                      ? m.errorMessage
                      : updatedPrev[optimisticIdx].errorMessage,
                };
                existingIds.add(m.id);
                return;
              }

              const contact = getContactService().getContactByPhone(phone);
              const displayName = contact?.name || formatDisplayPhone(phone);

              if (m.direction === 'inbound') {
                hasNewInbound = true;
              }

              newMsgs.push({
                id: m.id,
                type: (m.direction === 'inbound' ? 'sms_inbound' : 'sms_outbound') as any,
                contactName: displayName,
                contactPhone: phone,
                contactType: ((contact as any)?.type as any) || 'passenger',
                timestamp: m.timestamp,
                timestampMs: m.timestampMs || Date.now(),
                snippet: m.body,
                deliveryStatus: m.status,
                errorCode: m.errorCode,
                errorMessage: m.errorMessage,
                isUnread: m.direction === 'inbound' ? (m.isUnread ?? true) : false,
              });
            });

            if (newMsgs.length === 0 && !hasStateUpdates) return prev;

            if (hasNewInbound) {
              playInboundSmsChime();
            }

            return [...newMsgs, ...updatedPrev].sort(
              (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
            );
          });
        }
      }

      if (recResp.ok) {
        const recData = (await recResp.json()) as any;
        if (recData.success && Array.isArray(recData.recordings)) {
          setInteractions((prev) => {
            let anyRecAttached = false;
            const updated = prev.map((item) => {
              if (item.type.startsWith('call_')) {
                const match = recData.recordings.find(
                  (r: any) =>
                    (item.callSid && r.callSid === item.callSid) ||
                    (item.recordingSid && r.sid === item.recordingSid)
                );
                if (
                  match &&
                  (item.recordingSid !== match.sid ||
                    item.audioUrl !== match.audioUrl ||
                    item.durationSeconds !== match.durationSeconds)
                ) {
                  anyRecAttached = true;
                  return {
                    ...item,
                    recordingSid: match.sid,
                    audioDuration: match.duration,
                    durationSeconds: match.durationSeconds,
                    audioUrl: match.audioUrl,
                  };
                }
              }
              return item;
            });

            if (!anyRecAttached) return prev;
            return sortInteractionsDesc(updated);
          });
        }
      }
    } catch {
      // Tolerated offline/background fetch error
    }
  };

  // Hydrate telephony once on initial open + on CommsHub visibility transition (live Firestore handles realtime updates)
  const lastTelephonyFetchRef = useRef<number>(0);

  useEffect(() => {
    if (isVisible) {
      const now = Date.now();
      if (now - lastTelephonyFetchRef.current > 4_000) {
        lastTelephonyFetchRef.current = now;
        void fetchTelephonyData();
      }
    }
  }, [isVisible]);

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
    () => interactions.filter((item) => item.type.startsWith('call_')),
    [interactions]
  );
  const allMissedCalls = useMemo(
    () => interactions.filter((item) => item.type === 'call_missed'),
    [interactions]
  );
  const allVoicemails = useMemo(
    () => interactions.filter((item) => item.type === 'voicemail'),
    [interactions]
  );
  const allMessages = useMemo(
    () =>
      interactions.filter(
        (item) =>
          item.type.startsWith('sms_') &&
          !item.snippet?.includes('Thank you for contacting our dispatch desk')
      ),
    [interactions]
  );

  const filteredAllInteractions = useMemo(
    () =>
      filterCommsInteractionEvents(interactions, {
        channelFilter,
        channelFilters,
        ...filterOptionsBase,
      }),
    [interactions, channelFilter, channelFilters, filterOptionsBase]
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
    () => buildUnifiedCommsThreadSummaries(interactions, commsThreads, filterOptionsBase),
    [interactions, commsThreads, filterOptionsBase]
  );

  const filteredAllConversationRows = useMemo(
    () =>
      buildUnifiedCommsThreadSummaries(interactions, commsThreads, {
        channelFilter,
        channelFilters,
        ...filterOptionsBase,
      }),
    [interactions, commsThreads, channelFilter, channelFilters, filterOptionsBase]
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
    () => interactions.filter((i) => i.isUnread).length,
    [interactions]
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
