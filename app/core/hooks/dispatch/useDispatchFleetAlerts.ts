import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { AdminUser } from '../../services/auth/admin-auth.service';
import { getAdminConfigService } from '../../services/config/admin-config.service';
import { dispatchAlertsService } from '../../services/dispatch/dispatch-alerts.service';
import type { AppSettings } from '../../types/config';
import type { DispatchMessageItem } from '../../../components/domain/dispatch/FleetAlertCard';

const DEFAULT_TACTICAL_PRESETS: string[] = [
  'Airport surge at Lambert T1/T2.',
  'Traffic advisory: I-64 westbound heavy congestion.',
  'Check in with dispatch if available.',
  'Weather alert: slick roads, maintain safe following distance.',
  'Terminal 2 pickup queue backed up.',
  'Priority VIP pickup waiting at Lambert Main.',
];

const TTL_CACHE_KEY = 'chesterfield_alerts_ttl_minutes';
const PRESETS_CACHE_KEY = 'chesterfield_tactical_presets';

function sanitizePresetsList(raw?: string[] | null): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = Array.from(
    new Set(
      raw
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0)
    )
  );
  return cleaned.length > 0 ? cleaned : null;
}

export interface UseDispatchFleetAlertsParams {
  settings: AppSettings;
  user: AdminUser | null;
}

export function useDispatchFleetAlerts({ settings, user }: UseDispatchFleetAlertsParams) {
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(
    settings.fleetAlertsConfig?.autoDismissMinutes ?? 60
  );
  const [messages, setMessages] = useState<DispatchMessageItem[]>([]);
  const [msgRecipient, setMsgRecipient] = useState<string>('All Drivers');
  const [msgTargetDriverId, setMsgTargetDriverId] = useState<string | null>(null);
  const [msgText, setMsgText] = useState<string>('');
  const [msgPriority, setMsgPriority] = useState<'normal' | 'urgent'>('normal');
  // Default to 'unread' so read alerts automatically hide from the active view
  const [alertsFilter, setAlertsFilter] = useState<'all' | 'unread' | 'pinned'>('unread');
  const [tacticalPresets, setTacticalPresets] = useState<string[]>(
    () => sanitizePresetsList(settings.fleetAlertsConfig?.tacticalPresets) ?? DEFAULT_TACTICAL_PRESETS
  );
  const [isAddingPreset, setIsAddingPreset] = useState<boolean>(false);
  const [newPresetText, setNewPresetText] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(0);

  // Subscribe to real-time Firestore-backed dispatch_alerts
  useEffect(() => {
    setNowTick(Date.now());
    const unsubscribe = dispatchAlertsService.subscribe((liveAlerts) => {
      setMessages(liveAlerts);
    });
    return () => unsubscribe();
  }, []);

  // Hydrate non-authoritative localStorage cache only when server settings are unset
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (settings.fleetAlertsConfig?.autoDismissMinutes === undefined) {
        const savedTtl = localStorage.getItem(TTL_CACHE_KEY);
        if (savedTtl !== null) {
          const parsedTtl = parseInt(savedTtl, 10);
          if (!Number.isNaN(parsedTtl) && parsedTtl >= 0) {
            setAlertDismissMinutes(parsedTtl);
          }
        }
      }

      if (!sanitizePresetsList(settings.fleetAlertsConfig?.tacticalPresets)) {
        const savedPresets = localStorage.getItem(PRESETS_CACHE_KEY);
        if (savedPresets) {
          const parsedPresets = sanitizePresetsList(JSON.parse(savedPresets));
          if (parsedPresets) {
            setTacticalPresets(parsedPresets);
          }
        }
      }
    } catch {
      // Ignore non-authoritative cache errors
    }
  }, [
    settings.fleetAlertsConfig?.autoDismissMinutes,
    settings.fleetAlertsConfig?.tacticalPresets,
  ]);

  // Keep TTL & tactical presets synchronized with AppSettings / admin-config.service
  useEffect(() => {
    if (settings.fleetAlertsConfig?.autoDismissMinutes !== undefined) {
      setAlertDismissMinutes(settings.fleetAlertsConfig.autoDismissMinutes);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(
            TTL_CACHE_KEY,
            String(settings.fleetAlertsConfig.autoDismissMinutes)
          );
        } catch {}
      }
    }
  }, [settings.fleetAlertsConfig?.autoDismissMinutes]);

  useEffect(() => {
    const serverPresets = sanitizePresetsList(settings.fleetAlertsConfig?.tacticalPresets);
    if (serverPresets) {
      setTacticalPresets(serverPresets);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(PRESETS_CACHE_KEY, JSON.stringify(serverPresets));
        } catch {}
      }
    }
  }, [settings.fleetAlertsConfig?.tacticalPresets]);

  // Subscribe to live AdminConfigService updates so presets & TTL sync across dispatchers
  useEffect(() => {
    const configSvc = getAdminConfigService();
    if (!configSvc.subscribeToSettings) return;
    const unsubscribe = configSvc.subscribeToSettings((liveSettings) => {
      if (liveSettings.fleetAlertsConfig?.autoDismissMinutes !== undefined) {
        setAlertDismissMinutes(liveSettings.fleetAlertsConfig.autoDismissMinutes);
      }
      const syncedPresets = sanitizePresetsList(liveSettings.fleetAlertsConfig?.tacticalPresets);
      if (syncedPresets) {
        setTacticalPresets(syncedPresets);
      }
    });
    return () => unsubscribe();
  }, []);

  // Periodic clock tick for client-side TTL expiry filtering
  useEffect(() => {
    if (alertDismissMinutes === 0) return;
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 30_000);
    return () => clearInterval(interval);
  }, [alertDismissMinutes]);

  const handleTogglePinAlert = useCallback((id: string) => {
    void dispatchAlertsService.togglePin(id);
  }, []);

  const handleToggleReadAlert = useCallback((id: string) => {
    void dispatchAlertsService.toggleRead(id);
  }, []);

  const handleDismissAlert = useCallback((id: string) => {
    void dispatchAlertsService.dismissAlert(id);
  }, []);

  const handleMarkAllAlertsRead = useCallback(() => {
    void dispatchAlertsService.markAllRead();
  }, []);

  const handleClearUnpinnedAlerts = useCallback(() => {
    void dispatchAlertsService.clearUnpinned();
  }, []);

  const handleUpdateAlertDismissMinutes = useCallback(
    async (mins: number) => {
      setAlertDismissMinutes(mins);
      try {
        localStorage.setItem(TTL_CACHE_KEY, String(mins));
      } catch {}
      if (user) {
        try {
          await getAdminConfigService().updateSettings({
            fleetAlertsConfig: {
              ...(settings.fleetAlertsConfig || {}),
              autoDismissMinutes: mins,
              tacticalPresets,
            },
            updatedBy: user.email || user.uid,
          });
        } catch (e) {
          console.warn('Failed to persist alerts autoDismissMinutes setting to server', e);
        }
      }
    },
    [user, settings.fleetAlertsConfig, tacticalPresets]
  );

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = msgText.trim();
      if (!trimmed) return;

      setMsgText('');
      const resolvedTargetDriverId =
        msgRecipient !== 'All Drivers' && msgTargetDriverId ? msgTargetDriverId : null;
      void dispatchAlertsService.sendAlert({
        to: msgRecipient,
        text: trimmed,
        priority: msgPriority,
        targetDriverId: resolvedTargetDriverId,
        createdByUid: user?.uid ?? null,
        createdByName: user?.displayName || user?.email || null,
      });
    },
    [msgRecipient, msgTargetDriverId, msgText, msgPriority, user]
  );

  const handleSaveNewPreset = useCallback(() => {
    const trimmed = newPresetText.trim();
    if (!trimmed) return;
    const updated = Array.from(new Set([...tacticalPresets, trimmed]));
    setTacticalPresets(updated);
    try {
      localStorage.setItem(PRESETS_CACHE_KEY, JSON.stringify(updated));
    } catch {}
    if (user) {
      void getAdminConfigService()
        .updateSettings({
          fleetAlertsConfig: {
            ...(settings.fleetAlertsConfig || {}),
            autoDismissMinutes: alertDismissMinutes,
            tacticalPresets: updated,
          },
          updatedBy: user.email || user.uid,
        })
        .catch((e) => {
          console.warn('Failed to persist tacticalPresets setting to server', e);
        });
    }
    setMsgText(trimmed);
    setNewPresetText('');
    setIsAddingPreset(false);
  }, [newPresetText, tacticalPresets, user, settings.fleetAlertsConfig, alertDismissMinutes]);

  const pushSystemAlert = useCallback(
    (text: string, toLabel: string = 'Dispatch Operations', dedupeKey?: string) => {
      if (!text.trim()) return;
      void dispatchAlertsService.pushSystemAlert(text, toLabel, {
        dedupeKey,
        ttlMinutes: alertDismissMinutes,
      });
    },
    [alertDismissMinutes]
  );

  const activeAndSortedMessages = useMemo(() => {
    const now = nowTick || Date.now();
    const ttlMs = alertDismissMinutes * 60 * 1000;
    return messages
      .filter((m) => {
        if (alertDismissMinutes === 0) return true;
        if (m.isPinned) return true;
        if (!m.createdAt) return true;
        return now - m.createdAt < ttlMs;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [messages, alertDismissMinutes, nowTick]);

  const unreadAlertsCount = useMemo(
    () => activeAndSortedMessages.filter((m) => !m.isRead).length,
    [activeAndSortedMessages]
  );

  const pinnedAlertsCount = useMemo(
    () => activeAndSortedMessages.filter((m) => m.isPinned).length,
    [activeAndSortedMessages]
  );

  return {
    messages,
    alertDismissMinutes,
    msgRecipient,
    setMsgRecipient,
    msgTargetDriverId,
    setMsgTargetDriverId,
    msgText,
    setMsgText,
    msgPriority,
    setMsgPriority,
    alertsFilter,
    setAlertsFilter,
    tacticalPresets,
    isAddingPreset,
    setIsAddingPreset,
    newPresetText,
    setNewPresetText,
    activeAndSortedMessages,
    unreadAlertsCount,
    pinnedAlertsCount,
    handleTogglePinAlert,
    handleToggleReadAlert,
    handleDismissAlert,
    handleMarkAllAlertsRead,
    handleClearUnpinnedAlerts,
    handleUpdateAlertDismissMinutes,
    handleSendMessage,
    handleSaveNewPreset,
    pushSystemAlert,
  };
}
