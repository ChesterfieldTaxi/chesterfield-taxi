/**
 * Push Notification & Service Worker Orchestration Service (Phase 34)
 *
 * Responsibilities:
 * 1. SSR-safe management of browser `Notification` permissions (`default` | `granted` | `denied` | `unsupported`).
 * 2. Local opt-in preference persistence (`ct_push_alerts_enabled`).
 * 3. Root Service Worker (`/sw.js`) registration and `NOTIFICATION_CLICK` client message forwarding.
 * 4. Optional Firebase Cloud Messaging (FCM) Web Push token provisioning & `/users/{uid}` (`fcmTokens`) sync
 *    when `VITE_FIREBASE_VAPID_KEY` and Firebase are configured.
 * 5. Background-capable notification triggers (`notifyIncomingDriverOffer`, `notifyDispatchAlert`)
 *    via `ServiceWorkerRegistration.showNotification` / SW `postMessage` + mobile haptic vibration.
 */

import { arrayRemove, arrayUnion, doc, setDoc } from 'firebase/firestore';
import type { Trip } from '../../types/trip';
import type { PendingDriverUpdateAck } from '../dispatch/trip-update-ack.service';
import { authorizedFetch } from '../auth/auth-headers';
import { getFirebaseApp, getFirestoreDb, isFirebaseConfigured } from '../firebase';

export type PushPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export const PUSH_ALERTS_STORAGE_KEY = 'ct_push_alerts_enabled';
export const FCM_TOKEN_STORAGE_KEY = 'ct_fcm_device_token';
export const DEFAULT_ALERT_VIBRATION = [200, 100, 200];

export interface DispatchAlertInput {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  vibrate?: number[];
}

export interface FormattedNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon: string;
  badge: string;
  requireInteraction: boolean;
  vibrate: number[];
  data: Record<string, unknown>;
}

export interface NotificationDispatchResult {
  shown: boolean;
  reason?: string;
  payload: FormattedNotificationPayload;
}

export interface NotificationClickEventPayload {
  url: string;
  tag?: string;
  data?: Record<string, unknown>;
}

function getVapidKey(): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_VAPID_KEY) {
    return String(import.meta.env.VITE_FIREBASE_VAPID_KEY).trim() || undefined;
  }
  if (typeof process !== 'undefined' && process.env?.VITE_FIREBASE_VAPID_KEY) {
    return String(process.env.VITE_FIREBASE_VAPID_KEY).trim() || undefined;
  }
  return undefined;
}

/**
 * Pure deterministic payload builder for incoming driver trip offers.
 */
export function formatDriverOfferNotificationPayload(
  trip: Partial<Trip>
): FormattedNotificationPayload {
  const isAsap = trip.bookingType === 'asap' || !trip.scheduledPickupTime;
  const offerPrefix = isAsap ? 'ASAP Trip Offer' : 'Scheduled Trip Offer';
  const totalFare = trip.pricing?.totalFare;
  const fareLabel =
    typeof totalFare === 'number' && Number.isFinite(totalFare)
      ? ` — $${totalFare.toFixed(2)}`
      : '';

  const passengerName = [trip.passenger?.firstName, trip.passenger?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  const pickup = trip.pickupLocation?.address?.trim() || 'Pickup pending';
  const dropoff = trip.dropoffLocation?.address?.trim() || 'Destination pending';
  const scheduledStr =
    !isAsap && trip.scheduledPickupTime
      ? ` (${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })})`
      : '';

  const body = `${passengerName ? `${passengerName}${scheduledStr} · ` : ''}${pickup} → ${dropoff}`;
  const tag = trip.id ? `ct-driver-offer-${trip.id}` : 'ct-driver-offer';
  const url = '/app/driver';

  return {
    title: `${offerPrefix}${fareLabel}`,
    body,
    url,
    tag,
    icon: '/icon-driver-192.svg',
    badge: '/icon-driver-192.svg',
    requireInteraction: true,
    vibrate: [...DEFAULT_ALERT_VIBRATION],
    data: {
      url,
      tag,
      tripId: trip.id || null,
      bookingType: trip.bookingType || 'asap',
      kind: 'driver_offer',
    },
  };
}

/**
 * Pure deterministic payload builder for live assigned-trip modifications requiring driver acknowledgement.
 */
export function formatDriverTripUpdatedPayload(
  trip: Partial<Trip>,
  ack: PendingDriverUpdateAck
): FormattedNotificationPayload {
  const passengerName = [trip.passenger?.firstName, trip.passenger?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  const shortTripRef = trip.id ? ` #${String(trip.id).slice(-6).toUpperCase()}` : '';
  const sourceLabel = ack.source === 'guest_manage_ride' ? 'Passenger' : 'Dispatch';
  const title = passengerName
    ? `⚠️ Trip Updated (${passengerName}) — Please Acknowledge`
    : `⚠️ Trip${shortTripRef} Updated by ${sourceLabel}`;

  const body =
    Array.isArray(ack.changesSummary) && ack.changesSummary.length > 0
      ? ack.changesSummary.join(' • ')
      : `${sourceLabel} updated your assigned trip — open Driver Console to acknowledge.`;

  const tag = `ct-driver-trip-update-${trip.id || 'trip'}-${ack.revisionId}`;
  const url = '/app/driver';

  return {
    title,
    body,
    url,
    tag,
    icon: '/icon-driver-192.svg',
    badge: '/icon-driver-192.svg',
    requireInteraction: true,
    vibrate: [250, 100, 250, 100, 300],
    data: {
      url,
      tag,
      tripId: trip.id || null,
      revisionId: ack.revisionId,
      source: ack.source,
      changesSummary: ack.changesSummary,
      kind: 'driver_trip_update',
    },
  };
}

/**
 * Pure deterministic payload builder for Dispatch Console alerts.
 */
export function formatDispatchAlertPayload(
  input: DispatchAlertInput
): FormattedNotificationPayload {
  const title = (input.title || '').trim() || 'Chesterfield Dispatch Alert';
  const body = (input.body || '').trim() || 'New activity requires dispatcher attention.';
  const url = (input.url || '').trim() || '/app/dispatch';
  const tag = (input.tag || '').trim() || 'ct-dispatch-alert';
  const vibrate =
    Array.isArray(input.vibrate) && input.vibrate.length > 0
      ? [...input.vibrate]
      : [...DEFAULT_ALERT_VIBRATION];

  return {
    title,
    body,
    url,
    tag,
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    requireInteraction: Boolean(input.requireInteraction),
    vibrate,
    data: {
      url,
      tag,
      kind: 'dispatch_alert',
    },
  };
}

/**
 * Pure helper formatting 1 or more newly arrived UNCONFIRMED / ASAP rides for Dispatch.
 */
export function formatDispatchNewRideAlert(trips: Partial<Trip>[]): DispatchAlertInput {
  if (!trips.length) {
    return {
      title: 'New Dispatch Queue Activity',
      body: 'Open Dispatch Console to review incoming bookings.',
      url: '/app/dispatch',
      tag: 'ct-dispatch-ride',
    };
  }

  if (trips.length === 1) {
    const trip = trips[0];
    const isAsap = trip.bookingType === 'asap';
    const isUnconfirmed = trip.status === 'UNCONFIRMED' || trip.status === 'unconfirmed';
    const label = isAsap
      ? 'ASAP Ride Request'
      : isUnconfirmed
      ? 'Unconfirmed Web Booking'
      : 'New Pending Ride';
    const fare =
      typeof trip.pricing?.totalFare === 'number' && Number.isFinite(trip.pricing.totalFare)
        ? ` ($${trip.pricing.totalFare.toFixed(2)})`
        : '';
    const pax =
      [trip.passenger?.firstName, trip.passenger?.lastName].filter(Boolean).join(' ').trim() ||
      'Guest';
    const pickup = trip.pickupLocation?.address || 'Pickup';
    const dropoff = trip.dropoffLocation?.address || 'Destination';

    return {
      title: `${label}${fare} — ${pax}`,
      body: `${pickup} → ${dropoff}`,
      url: trip.id ? `/app/dispatch?tripId=${encodeURIComponent(trip.id)}` : '/app/dispatch',
      tag: trip.id ? `ct-dispatch-ride-${trip.id}` : 'ct-dispatch-ride',
      requireInteraction: isAsap || isUnconfirmed,
    };
  }

  const latest = trips[0];
  return {
    title: `${trips.length} New Rides Need Dispatch Review`,
    body: `Latest: ${latest.pickupLocation?.address || 'Pickup'} → ${
      latest.dropoffLocation?.address || 'Destination'
    }`,
    url: '/app/dispatch',
    tag: 'ct-dispatch-ride-batch',
    requireInteraction: true,
  };
}

class PushNotificationService {
  private static instance: PushNotificationService;
  private swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private swMessageListenerBound = false;
  private stateListeners = new Set<() => void>();
  private clickListeners = new Set<(payload: NotificationClickEventPayload) => void>();
  private fcmToken: string | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.fcmToken = localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
      } catch {
        this.fcmToken = null;
      }
    }
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  private emitChange(): void {
    this.stateListeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  public subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onNotificationClick(
    listener: (payload: NotificationClickEventPayload) => void
  ): () => void {
    this.clickListeners.add(listener);
    this.bindServiceWorkerMessageListener();
    return () => {
      this.clickListeners.delete(listener);
    };
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermissionState(): PushPermissionState {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return 'unsupported';
    }
    const perm = Notification.permission;
    if (perm === 'granted' || perm === 'denied' || perm === 'default') {
      return perm;
    }
    return 'unsupported';
  }

  public isAlertsEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    const permission = this.getPermissionState();
    if (permission !== 'granted') return false;
    try {
      const stored = localStorage.getItem(PUSH_ALERTS_STORAGE_KEY);
      if (stored === 'false') return false;
      if (stored === 'true') return true;
    } catch {}
    // Default to enabled once browser Notification permission has been granted
    return true;
  }

  public isAppInBackground(): boolean {
    if (typeof document === 'undefined') return false;
    return Boolean(document.hidden || document.visibilityState === 'hidden');
  }

  public getFcmToken(): string | null {
    return this.fcmToken;
  }

  private bindServiceWorkerMessageListener(): void {
    if (
      this.swMessageListenerBound ||
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    this.swMessageListenerBound = true;
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data;
      if (msg && typeof msg === 'object' && msg.type === 'NOTIFICATION_CLICK' && msg.payload) {
        const clickPayload: NotificationClickEventPayload = {
          url: String(msg.payload.url || '/app'),
          tag: msg.payload.tag ? String(msg.payload.tag) : undefined,
          data:
            msg.payload.data && typeof msg.payload.data === 'object'
              ? (msg.payload.data as Record<string, unknown>)
              : undefined,
        };
        this.clickListeners.forEach((listener) => {
          try {
            listener(clickPayload);
          } catch {}
        });
      }
    });
  }

  /**
   * Registers `/sw.js` at root scope (`/`) on supported browser clients.
   * Safe no-op during SSR or in unsupported environments.
   */
  public async registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return null;
    }

    this.bindServiceWorkerMessageListener();

    if (this.swRegistration) {
      return this.swRegistration;
    }

    if (this.swRegistrationPromise) {
      return this.swRegistrationPromise;
    }

    this.swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        this.swRegistration = reg;
        return reg;
      })
      .catch((err) => {
        console.warn('[PushNotificationService] Service Worker registration skipped:', err);
        return null;
      })
      .finally(() => {
        this.swRegistrationPromise = null;
      });

    return this.swRegistrationPromise;
  }

  /**
   * Requests browser Notification permission, enables push alerts preference,
   * and optionally registers an FCM token on `/users/{uid}` when configured.
   */
  public async requestPermissionAndEnable(uid?: string): Promise<PushPermissionState> {
    if (!this.isSupported()) {
      return 'unsupported';
    }

    let permission = this.getPermissionState();
    if (permission === 'default') {
      try {
        const result = await Notification.requestPermission();
        permission =
          result === 'granted' || result === 'denied' || result === 'default'
            ? result
            : 'unsupported';
      } catch {
        permission = this.getPermissionState();
      }
    }

    if (permission === 'granted') {
      try {
        localStorage.setItem(PUSH_ALERTS_STORAGE_KEY, 'true');
      } catch {}
      await this.registerServiceWorker();
      if (uid) {
        void this.syncFcmTokenForUser(uid);
      }
    }

    this.emitChange();
    return permission;
  }

  /**
   * Updates user opt-in preference (`ct_push_alerts_enabled`).
   * If enabling while permission is still `default`, triggers permission prompt.
   */
  public async setAlertsEnabled(enabled: boolean, uid?: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (enabled) {
      const currentPerm = this.getPermissionState();
      if (currentPerm === 'unsupported' || currentPerm === 'denied') {
        this.emitChange();
        return false;
      }
      if (currentPerm === 'default') {
        const nextPerm = await this.requestPermissionAndEnable(uid);
        return nextPerm === 'granted';
      }
      try {
        localStorage.setItem(PUSH_ALERTS_STORAGE_KEY, 'true');
      } catch {}
      await this.registerServiceWorker();
      if (uid) {
        void this.syncFcmTokenForUser(uid);
      }
      this.emitChange();
      return true;
    }

    try {
      localStorage.setItem(PUSH_ALERTS_STORAGE_KEY, 'false');
    } catch {}
    if (this.fcmToken && uid) {
      void this.removeFcmTokenForUser(uid);
    }
    this.emitChange();
    return false;
  }

  /**
   * Obtains an FCM Web Push token (when `VITE_FIREBASE_VAPID_KEY` + Firebase are configured)
   * and persists it onto `/users/{uid}.fcmTokens`.
   */
  public async syncFcmTokenForUser(uid: string): Promise<string | null> {
    if (
      !uid ||
      typeof window === 'undefined' ||
      this.getPermissionState() !== 'granted' ||
      !this.isAlertsEnabled()
    ) {
      return null;
    }

    const vapidKey = getVapidKey();
    if (!vapidKey || !isFirebaseConfigured()) {
      return null;
    }

    try {
      const messagingMod = await import('firebase/messaging');
      const supported = await messagingMod.isSupported().catch(() => false);
      if (!supported) return null;

      const swReg = await this.registerServiceWorker();
      const messaging = messagingMod.getMessaging(getFirebaseApp());
      const token = await messagingMod.getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swReg || undefined,
      });

      if (!token) return null;

      this.fcmToken = token;
      try {
        localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      } catch {}

      const nowIso = new Date().toISOString();

      // 1. Persist directly to `/users/{uid}` via Firestore SDK (allowed by owner rule)
      try {
        await setDoc(
          doc(getFirestoreDb(), 'users', uid),
          {
            fcmTokens: arrayUnion(token),
            fcmUpdatedAt: nowIso,
          },
          { merge: true }
        );
      } catch {
        // Fallback handled by /api/push below
      }

      // 2. Sync with authenticated server endpoint `/api/push`
      try {
        await authorizedFetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'register_token', token }),
        });
      } catch {}

      this.emitChange();
      return token;
    } catch (err) {
      console.warn('[PushNotificationService] Optional FCM token registration skipped:', err);
      return null;
    }
  }

  public async removeFcmTokenForUser(uid?: string): Promise<void> {
    const token = this.fcmToken;
    if (!token || typeof window === 'undefined') return;

    this.fcmToken = null;
    try {
      localStorage.removeItem(FCM_TOKEN_STORAGE_KEY);
    } catch {}

    if (uid && isFirebaseConfigured()) {
      try {
        await setDoc(
          doc(getFirestoreDb(), 'users', uid),
          {
            fcmTokens: arrayRemove(token),
            fcmUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch {}
    }

    try {
      await authorizedFetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_token', token }),
      });
    } catch {}

    this.emitChange();
  }

  private triggerVibration(pattern: number[]): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
      return;
    }
    try {
      navigator.vibrate(pattern);
    } catch {}
  }

  private async dispatchViaServiceWorker(
    payload: FormattedNotificationPayload,
    options?: { requireHidden?: boolean }
  ): Promise<NotificationDispatchResult> {
    if (typeof window === 'undefined') {
      return { shown: false, reason: 'ssr_environment', payload };
    }

    const isHidden = this.isAppInBackground();
    if (options?.requireHidden && !isHidden) {
      return { shown: false, reason: 'document_visible', payload };
    }

    // Respect explicit user opt-out in localStorage
    try {
      if (localStorage.getItem(PUSH_ALERTS_STORAGE_KEY) === 'false') {
        return { shown: false, reason: 'disabled_by_user', payload };
      }
    } catch {}

    const alertsEnabled = this.isAlertsEnabled();
    if (!isHidden && !alertsEnabled) {
      return { shown: false, reason: 'alerts_not_enabled', payload };
    }

    // Trigger tactile mobile vibration even if system Notification permission hasn't been granted yet
    this.triggerVibration(payload.vibrate);

    if (this.getPermissionState() !== 'granted') {
      return { shown: false, reason: 'permission_not_granted', payload };
    }

    const swOptions: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
      body: payload.body,
      tag: payload.tag,
      icon: payload.icon,
      badge: payload.badge,
      requireInteraction: payload.requireInteraction,
      renotify: true,
      vibrate: payload.vibrate,
      data: payload.data,
    };

    try {
      const reg =
        this.swRegistration ||
        (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
          ? (await navigator.serviceWorker.getRegistration('/')) ||
            (await this.registerServiceWorker())
          : null);

      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(payload.title, swOptions as NotificationOptions);
        return { shown: true, payload };
      }

      if (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        navigator.serviceWorker.controller
      ) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_LOCAL_NOTIFICATION',
          payload,
        });
        return { shown: true, payload };
      }

      if (typeof Notification === 'function') {
        const notif = new Notification(payload.title, {
          body: payload.body,
          tag: payload.tag,
          icon: payload.icon,
          data: payload.data,
        });
        notif.onclick = () => {
          try {
            window.focus();
            notif.close();
          } catch {}
        };
        return { shown: true, payload };
      }
    } catch (err) {
      console.warn('[PushNotificationService] Notification display warning:', err);
      return { shown: false, reason: 'display_error', payload };
    }

    return { shown: false, reason: 'unsupported', payload };
  }

  /**
   * Triggers a high-priority background-capable notification + vibration for an incoming driver offer.
   */
  public async notifyIncomingDriverOffer(
    trip: Partial<Trip>
  ): Promise<NotificationDispatchResult> {
    const payload = formatDriverOfferNotificationPayload(trip);
    return this.dispatchViaServiceWorker(payload);
  }

  /**
   * Triggers a high-priority notification + haptic vibration when an assigned trip is updated
   * and requires driver acknowledgement.
   */
  public async notifyDriverTripUpdated(
    trip: Partial<Trip>,
    ack: PendingDriverUpdateAck
  ): Promise<NotificationDispatchResult> {
    const payload = formatDriverTripUpdatedPayload(trip, ack);
    return this.dispatchViaServiceWorker(payload);
  }

  /**
   * Triggers a background-capable notification + vibration for Dispatch Console alerts.
   */
  public async notifyDispatchAlert(
    input: DispatchAlertInput,
    options?: { requireHidden?: boolean }
  ): Promise<NotificationDispatchResult> {
    const payload = formatDispatchAlertPayload(input);
    return this.dispatchViaServiceWorker(payload, options);
  }
}

export const pushNotificationService = PushNotificationService.getInstance();
