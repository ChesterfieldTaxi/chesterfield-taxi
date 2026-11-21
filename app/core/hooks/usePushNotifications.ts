import { useState, useEffect, useCallback } from 'react';
import type { Trip } from '../types/trip';
import {
  pushNotificationService,
  formatDispatchNewRideAlert,
  type DispatchAlertInput,
  type PushPermissionState,
} from '../services/notifications/push-notification.service';

export interface UsePushNotificationsOptions {
  /** Authenticated user UID for optional FCM token registration on `/users/{uid}` */
  uid?: string | null;
  /** Optional navigation handler invoked when a Service Worker notification is clicked */
  onNavigate?: (url: string) => void;
}

export interface UsePushNotificationsResult {
  isSupported: boolean;
  permission: PushPermissionState;
  alertsEnabled: boolean;
  isRequesting: boolean;
  enableAlerts: () => Promise<boolean>;
  toggleAlerts: () => Promise<boolean>;
  notifyIncomingDriverOffer: (trip: Partial<Trip>) => Promise<void>;
  notifyDispatchAlert: (
    input: DispatchAlertInput,
    options?: { requireHidden?: boolean }
  ) => Promise<void>;
  notifyDispatchNewRidesWhenHidden: (trips: Partial<Trip>[]) => Promise<void>;
}

/**
 * SSR-safe React hook encapsulating Service Worker registration, Notification permissions,
 * `ct_push_alerts_enabled` preference state, and optional FCM token sync.
 */
export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsResult {
  const { uid, onNavigate } = options;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [permission, setPermission] = useState<PushPermissionState>('default');
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(false);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);

  const syncFromService = useCallback(() => {
    setIsSupported(pushNotificationService.isSupported());
    setPermission(pushNotificationService.getPermissionState());
    setAlertsEnabled(pushNotificationService.isAlertsEnabled());
  }, []);

  useEffect(() => {
    syncFromService();
    void pushNotificationService.registerServiceWorker();

    const unsubState = pushNotificationService.subscribe(syncFromService);

    const handleVisibility = () => syncFromService();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      unsubState();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [syncFromService]);

  // Sync FCM token cleanly when authenticated user already granted permission & enabled alerts
  useEffect(() => {
    if (!uid || permission !== 'granted' || !alertsEnabled) return;
    void pushNotificationService.syncFcmTokenForUser(uid);
  }, [uid, permission, alertsEnabled]);

  // Forward Service Worker NOTIFICATION_CLICK events to router navigation when provided
  useEffect(() => {
    if (!onNavigate) return;
    return pushNotificationService.onNotificationClick((payload) => {
      if (payload.url) {
        onNavigate(payload.url);
      }
    });
  }, [onNavigate]);

  const enableAlerts = useCallback(async (): Promise<boolean> => {
    setIsRequesting(true);
    try {
      const ok = await pushNotificationService.setAlertsEnabled(true, uid || undefined);
      syncFromService();
      return ok;
    } finally {
      setIsRequesting(false);
    }
  }, [uid, syncFromService]);

  const toggleAlerts = useCallback(async (): Promise<boolean> => {
    setIsRequesting(true);
    try {
      const currentlyEnabled = pushNotificationService.isAlertsEnabled();
      const next = await pushNotificationService.setAlertsEnabled(
        !currentlyEnabled,
        uid || undefined
      );
      syncFromService();
      return next;
    } finally {
      setIsRequesting(false);
    }
  }, [uid, syncFromService]);

  const notifyIncomingDriverOffer = useCallback(async (trip: Partial<Trip>): Promise<void> => {
    await pushNotificationService.notifyIncomingDriverOffer(trip);
  }, []);

  const notifyDispatchAlert = useCallback(
    async (
      input: DispatchAlertInput,
      alertOptions?: { requireHidden?: boolean }
    ): Promise<void> => {
      await pushNotificationService.notifyDispatchAlert(input, alertOptions);
    },
    []
  );

  const notifyDispatchNewRidesWhenHidden = useCallback(
    async (trips: Partial<Trip>[]): Promise<void> => {
      if (!trips.length) return;
      const alertInput = formatDispatchNewRideAlert(trips);
      await pushNotificationService.notifyDispatchAlert(alertInput, { requireHidden: true });
    },
    []
  );

  return {
    isSupported,
    permission,
    alertsEnabled,
    isRequesting,
    enableAlerts,
    toggleAlerts,
    notifyIncomingDriverOffer,
    notifyDispatchAlert,
    notifyDispatchNewRidesWhenHidden,
  };
}

/**
 * Lightweight root hook for client-side Service Worker registration and
 * cross-route `NOTIFICATION_CLICK` deep-link navigation.
 */
export function useRootPwaServiceWorker(onNavigate: (url: string) => void): void {
  useEffect(() => {
    void pushNotificationService.registerServiceWorker();
    const unsubClick = pushNotificationService.onNotificationClick((payload) => {
      if (payload.url && typeof window !== 'undefined') {
        const currentFull = window.location.pathname + window.location.search;
        if (payload.url !== currentFull) {
          onNavigate(payload.url);
        }
      }
    });
    return unsubClick;
  }, [onNavigate]);
}
