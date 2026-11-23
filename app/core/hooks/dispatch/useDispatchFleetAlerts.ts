import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { AdminUser } from '../../services/auth/admin-auth.service';
import { getAdminConfigService } from '../../services/config/admin-config.service';
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

function createDefaultFleetMessages(): DispatchMessageItem[] {
  return [
    {
      id: 'msg-1',
      to: 'All Drivers',
      text: 'Morning briefing: Lambert Airport terminal arrivals surge active until 11:30 AM.',
      timestamp: '08:15 AM',
      createdAt: 0,
      priority: 'normal',
      isPinned: true,
      isRead: false,
    },
    {
      id: 'msg-2',
      to: 'Driver 104 (Sarah K.)',
      text: 'Terminal 1 pickup confirmed for passenger Johnson.',
      timestamp: '08:32 AM',
      createdAt: 0,
      priority: 'normal',
      isPinned: false,
      isRead: false,
    },
  ];
}

export interface UseDispatchFleetAlertsParams {
  settings: AppSettings;
  user: AdminUser | null;
}

export function useDispatchFleetAlerts({ settings, user }: UseDispatchFleetAlertsParams) {
  const [alertDismissMinutes, setAlertDismissMinutes] = useState<number>(
    settings.fleetAlertsConfig?.autoDismissMinutes ?? 60
  );
  const [messages, setMessages] = useState<DispatchMessageItem[]>(() => createDefaultFleetMessages());
  const [msgRecipient, setMsgRecipient] = useState<string>('All Drivers');
  const [msgText, setMsgText] = useState<string>('');
  const [msgPriority, setMsgPriority] = useState<'normal' | 'urgent'>('normal');
  const [alertsFilter, setAlertsFilter] = useState<'all' | 'unread' | 'pinned'>('all');
  const [tacticalPresets, setTacticalPresets] = useState<string[]>(DEFAULT_TACTICAL_PRESETS);
  const [isAddingPreset, setIsAddingPreset] = useState<boolean>(false);
  const [newPresetText, setNewPresetText] = useState<string>('');
  const hasHydratedRef = useRef<boolean>(false);

  // Hydrate persisted alerts, TTL & tactical presets post-mount for deterministic SSR parity
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    try {
      const savedTtl = localStorage.getItem('chesterfield_alerts_ttl_minutes');
      if (savedTtl) {
        const parsedTtl = parseInt(savedTtl, 10);
        if (!isNaN(parsedTtl)) setAlertDismissMinutes(parsedTtl);
      }

      const savedAlerts = localStorage.getItem('chesterfield_dispatch_alerts');
      if (savedAlerts) {
        const parsed: DispatchMessageItem[] = JSON.parse(savedAlerts);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        } else {
          setMessages([
            {
              id: 'msg-1',
              to: 'All Drivers',
              text: 'Morning briefing: Lambert Airport terminal arrivals surge active until 11:30 AM.',
              timestamp: '08:15 AM',
              createdAt: now - 15 * 60 * 1000,
              priority: 'normal',
              isPinned: true,
              isRead: false,
            },
            {
              id: 'msg-2',
              to: 'Driver 104 (Sarah K.)',
              text: 'Terminal 1 pickup confirmed for passenger Johnson.',
              timestamp: '08:32 AM',
              createdAt: now - 5 * 60 * 1000,
              priority: 'normal',
              isPinned: false,
              isRead: false,
            },
          ]);
        }
      } else {
        setMessages((prev) =>
          prev.map((m, idx) =>
            m.createdAt === 0 ? { ...m, createdAt: now - (idx === 0 ? 15 : 5) * 60 * 1000 } : m
          )
        );
      }

      const savedPresets = localStorage.getItem('chesterfield_tactical_presets');
      if (savedPresets) {
        const parsedPresets = JSON.parse(savedPresets);
        if (Array.isArray(parsedPresets) && parsedPresets.length > 0) {
          setTacticalPresets(parsedPresets);
        }
      }
    } catch {
      // Ignore storage errors
    }
    hasHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedRef.current) return;
    try {
      localStorage.setItem('chesterfield_dispatch_alerts', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (alertDismissMinutes === 0) return;
    const checkAndPrune = () => {
      const now = Date.now();
      const ttlMs = alertDismissMinutes * 60 * 1000;
      setMessages((prev) => {
        const unexpired = prev.filter((m) => m.isPinned || !m.createdAt || now - m.createdAt < ttlMs);
        return unexpired.length !== prev.length ? unexpired : prev;
      });
    };
    const interval = setInterval(checkAndPrune, 30_000);
    return () => clearInterval(interval);
  }, [alertDismissMinutes]);

  const handleTogglePinAlert = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isPinned: !m.isPinned } : m)));
  }, []);

  const handleToggleReadAlert = useCallback((id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: !m.isRead } : m)));
  }, []);

  const handleDismissAlert = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const handleMarkAllAlertsRead = useCallback(() => {
    setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
  }, []);

  const handleClearUnpinnedAlerts = useCallback(() => {
    setMessages((prev) => prev.filter((m) => m.isPinned));
  }, []);

  const handleUpdateAlertDismissMinutes = useCallback(
    async (mins: number) => {
      setAlertDismissMinutes(mins);
      try {
        localStorage.setItem('chesterfield_alerts_ttl_minutes', String(mins));
      } catch {}
      if (user?.role === 'admin') {
        try {
          await getAdminConfigService().updateSettings({
            fleetAlertsConfig: { autoDismissMinutes: mins },
          });
        } catch (e) {
          console.warn('Failed to persist alerts autoDismissMinutes setting to server', e);
        }
      }
    },
    [user]
  );

  const handleSendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!msgText.trim()) return;

      const newMsg: DispatchMessageItem = {
        id: `msg-${Date.now()}`,
        to: msgRecipient,
        text: msgText.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: Date.now(),
        priority: msgPriority,
        isPinned: false,
        isRead: false,
      };
      setMessages((prev) => [newMsg, ...prev]);
      setMsgText('');
    },
    [msgRecipient, msgText, msgPriority]
  );

  const handleSaveNewPreset = useCallback(() => {
    if (!newPresetText.trim()) return;
    const updated = [...tacticalPresets, newPresetText.trim()];
    setTacticalPresets(updated);
    try {
      localStorage.setItem('chesterfield_tactical_presets', JSON.stringify(updated));
    } catch {}
    setMsgText(newPresetText.trim());
    setNewPresetText('');
    setIsAddingPreset(false);
  }, [newPresetText, tacticalPresets]);

  const pushSystemAlert = useCallback(
    (text: string, toLabel: string = 'Dispatch Operations') => {
      if (!text.trim()) return;
      const now = Date.now();
      const item: DispatchMessageItem = {
        id: `sys-alert-${now}-${Math.random().toString(36).slice(2, 6)}`,
        to: toLabel,
        text: text.trim(),
        timestamp: new Date(now).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        createdAt: now,
        priority: 'urgent',
        isPinned: false,
        isRead: false,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.text === item.text && !m.isRead)) return prev;
        const next = [item, ...prev].slice(0, 100);
        try {
          localStorage.setItem('chesterfield_dispatch_alerts', JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  const activeAndSortedMessages = useMemo(() => {
    const now = Date.now();
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
  }, [messages, alertDismissMinutes]);

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
