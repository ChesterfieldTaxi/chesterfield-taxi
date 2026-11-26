/**
 * Dispatch Fleet Alerts Service
 *
 * Real-time Firestore-backed persistence for `dispatch_alerts` with:
 * - Zero hardcoded mock data
 * - Persistent `isRead`, `isPinned`, and `dismissedAt` state across refreshes and dispatchers
 * - Deterministic `dedupeKey` system alert deduplication (including already-read and dismissed
 *   alerts within TTL) so refreshing the page never re-creates triaged system alerts
 * - Multi-tab BroadcastChannel + non-authoritative offline fallback when Firebase is unconfigured
 */

import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { DispatchMessageItem } from '../../../components/domain/dispatch/FleetAlertCard';
import {
  getFirebaseAuth,
  getFirestoreDb,
  isFirebaseConfigured,
} from '../firebase';
import { sanitizeFirestoreDocument } from '../firestore-sanitizer';

export interface DispatchAlertRecord extends DispatchMessageItem {
  dismissedAt?: number | null;
  dedupeKey?: string | null;
  source?: 'manual' | 'system';
  createdByUid?: string | null;
  createdByName?: string | null;
  updatedAt?: number;
}

export interface SendDispatchAlertInput {
  to: string;
  text: string;
  priority: 'normal' | 'urgent';
  createdByUid?: string | null;
  createdByName?: string | null;
}

export interface PushSystemAlertOptions {
  dedupeKey?: string;
  ttlMinutes?: number;
  priority?: 'normal' | 'urgent';
}

const COLLECTION_NAME = 'dispatch_alerts';
const OFFLINE_CACHE_KEY = 'cf_dispatch_alerts_v2';
const BROADCAST_CHANNEL_NAME = 'cf_dispatch_alerts_channel_v2';
const DEFAULT_DEDUPE_WINDOW_MINUTES = 60;

/**
 * Deterministic 32-bit FNV-1a hex digest for stable Firestore document IDs and dedupe keys.
 */
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildSystemAlertDedupeKey(
  text: string,
  toLabel: string = 'Dispatch Operations',
  explicitKey?: string
): string {
  const custom = typeof explicitKey === 'string' ? explicitKey.trim() : '';
  if (custom) {
    return custom.toLowerCase();
  }
  const normalizedTarget = (toLabel || 'Dispatch Operations').trim().toLowerCase();
  const normalizedText = text.trim().replace(/\s+/g, ' ').toLowerCase();
  return `sys:${normalizedTarget}:${normalizedText}`;
}

function toSystemAlertDocId(dedupeKey: string): string {
  const h1 = fnv1aHex(dedupeKey);
  const h2 = fnv1aHex(`${dedupeKey}::salt`);
  return `sys-${h1}${h2}`;
}

function formatAlertTimestamp(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeAlertRecord(
  id: string,
  raw: Partial<DispatchAlertRecord>
): DispatchAlertRecord {
  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now();
  return {
    id,
    to: typeof raw.to === 'string' && raw.to.trim() ? raw.to.trim() : 'All Drivers',
    text: typeof raw.text === 'string' ? raw.text : '',
    timestamp:
      typeof raw.timestamp === 'string' && raw.timestamp.trim()
        ? raw.timestamp
        : formatAlertTimestamp(createdAt),
    createdAt,
    updatedAt:
      typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
        ? raw.updatedAt
        : createdAt,
    priority: raw.priority === 'urgent' ? 'urgent' : 'normal',
    isPinned: Boolean(raw.isPinned),
    isRead: Boolean(raw.isRead),
    dismissedAt:
      typeof raw.dismissedAt === 'number' && Number.isFinite(raw.dismissedAt)
        ? raw.dismissedAt
        : null,
    dedupeKey: typeof raw.dedupeKey === 'string' && raw.dedupeKey ? raw.dedupeKey : null,
    source: raw.source === 'system' ? 'system' : 'manual',
    createdByUid: typeof raw.createdByUid === 'string' ? raw.createdByUid : null,
    createdByName: typeof raw.createdByName === 'string' ? raw.createdByName : null,
  };
}

export class DispatchAlertsService {
  private static instance: DispatchAlertsService;
  private records = new Map<string, DispatchAlertRecord>();
  private listeners = new Set<(alerts: DispatchAlertRecord[]) => void>();
  private firestoreUnsub: (() => void) | null = null;
  private authUnsub: (() => void) | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private inFlightDedupeKeys = new Set<string>();
  private isConfigured: boolean;
  private hasInitialSnapshot = false;

  private constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (!this.isConfigured) {
      this.loadOfflineCache();
    }
    this.setupBroadcastChannel();
    this.setupRealtimeSync();
  }

  public static getInstance(): DispatchAlertsService {
    if (!DispatchAlertsService.instance) {
      DispatchAlertsService.instance = new DispatchAlertsService();
    }
    return DispatchAlertsService.instance;
  }

  private loadOfflineCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.id === 'string' && typeof item.text === 'string') {
            this.records.set(item.id, normalizeAlertRecord(item.id, item));
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  private saveOfflineCache(broadcast = true): void {
    if (typeof window === 'undefined') return;
    const serialized = Array.from(this.records.values());
    try {
      localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(serialized));
    } catch {
      // Ignore storage quota errors
    }

    if (broadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'DISPATCH_ALERTS_SYNC',
          records: serialized,
        });
      } catch {
        // Non-blocking broadcast
      }
    }
  }

  private setupBroadcastChannel(): void {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (
            !this.hasInitialSnapshot &&
            event.data?.type === 'DISPATCH_ALERTS_SYNC' &&
            Array.isArray(event.data.records)
          ) {
            this.records.clear();
            for (const item of event.data.records) {
              if (item && typeof item.id === 'string') {
                this.records.set(item.id, normalizeAlertRecord(item.id, item));
              }
            }
            this.notifyListeners();
          }
        };
      } catch {
        // Ignore BroadcastChannel availability errors
      }
    }
  }

  private setupRealtimeSync(): void {
    if (!this.isConfigured || typeof window === 'undefined') return;

    try {
      const auth = getFirebaseAuth();
      this.authUnsub = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          this.attachFirestoreListener();
        } else {
          this.teardownFirestoreListener();
          this.records.clear();
          this.hasInitialSnapshot = false;
          this.notifyListeners();
        }
      });

      if (auth.currentUser) {
        this.attachFirestoreListener();
      }
    } catch (err) {
      console.warn('[DispatchAlertsService] Auth observer setup warning:', err);
    }
  }

  private attachFirestoreListener(): void {
    if (this.firestoreUnsub || !this.isConfigured || typeof window === 'undefined') {
      return;
    }

    try {
      const db = getFirestoreDb();
      const colRef = collection(db, COLLECTION_NAME);

      this.firestoreUnsub = onSnapshot(
        colRef,
        (snap) => {
          const next = new Map<string, DispatchAlertRecord>();
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as Partial<DispatchAlertRecord>;
            const id = raw.id || docSnap.id;
            if (typeof raw.text === 'string' && raw.text.trim()) {
              next.set(id, normalizeAlertRecord(id, raw));
            }
          });
          this.records = next;
          this.hasInitialSnapshot = true;
          this.saveOfflineCache(false);
          this.notifyListeners();
        },
        (err) => {
          console.warn('[DispatchAlertsService] Firestore listener detached:', err.message);
          this.teardownFirestoreListener();
        }
      );
    } catch (err) {
      console.warn('[DispatchAlertsService] Could not attach Firestore listener:', err);
      this.teardownFirestoreListener();
    }
  }

  private teardownFirestoreListener(): void {
    if (this.firestoreUnsub) {
      try {
        this.firestoreUnsub();
      } catch {}
      this.firestoreUnsub = null;
    }
  }

  public getActiveAlerts(): DispatchAlertRecord[] {
    return Array.from(this.records.values())
      .filter((item) => !item.dismissedAt)
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0) return;
    const active = this.getActiveAlerts();
    for (const listener of this.listeners) {
      try {
        listener(active);
      } catch (err) {
        console.error('[DispatchAlertsService] Listener error:', err);
      }
    }
  }

  public subscribe(listener: (alerts: DispatchAlertRecord[]) => void): () => void {
    this.listeners.add(listener);
    if (this.isConfigured && typeof window !== 'undefined' && !this.firestoreUnsub) {
      try {
        if (getFirebaseAuth().currentUser) {
          this.attachFirestoreListener();
        }
      } catch {}
    }
    listener(this.getActiveAlerts());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async persistRecord(record: DispatchAlertRecord): Promise<void> {
    if (!this.isConfigured || typeof window === 'undefined') return;
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, COLLECTION_NAME, record.id);
      await setDoc(
        docRef,
        sanitizeFirestoreDocument(record as unknown as Record<string, unknown>),
        { merge: true }
      );
    } catch (err) {
      console.warn('[DispatchAlertsService] Failed to persist alert:', err);
    }
  }

  public async sendAlert(input: SendDispatchAlertInput): Promise<DispatchAlertRecord | null> {
    const trimmed = input.text.trim();
    if (!trimmed) return null;

    const now = Date.now();
    const id = `alert-${now}-${Math.random().toString(36).slice(2, 7)}`;
    const record: DispatchAlertRecord = {
      id,
      to: input.to.trim() || 'All Drivers',
      text: trimmed,
      timestamp: formatAlertTimestamp(now),
      createdAt: now,
      updatedAt: now,
      priority: input.priority === 'urgent' ? 'urgent' : 'normal',
      isPinned: false,
      isRead: false,
      dismissedAt: null,
      dedupeKey: null,
      source: 'manual',
      createdByUid: input.createdByUid ?? null,
      createdByName: input.createdByName ?? null,
    };

    this.records.set(id, record);
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistRecord(record);
    return record;
  }

  public async toggleRead(id: string): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) return;

    const updated: DispatchAlertRecord = {
      ...existing,
      isRead: !existing.isRead,
      updatedAt: Date.now(),
    };
    this.records.set(id, updated);
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistRecord(updated);
  }

  public async togglePin(id: string): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) return;

    const updated: DispatchAlertRecord = {
      ...existing,
      isPinned: !existing.isPinned,
      updatedAt: Date.now(),
    };
    this.records.set(id, updated);
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistRecord(updated);
  }

  public async dismissAlert(id: string): Promise<void> {
    const existing = this.records.get(id);
    if (!existing) return;

    const now = Date.now();
    const updated: DispatchAlertRecord = {
      ...existing,
      dismissedAt: now,
      updatedAt: now,
    };
    this.records.set(id, updated);
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistRecord(updated);
  }

  public async markAllRead(): Promise<void> {
    const now = Date.now();
    const targets: DispatchAlertRecord[] = [];

    for (const rec of this.records.values()) {
      if (!rec.dismissedAt && !rec.isRead) {
        const updated: DispatchAlertRecord = {
          ...rec,
          isRead: true,
          updatedAt: now,
        };
        this.records.set(rec.id, updated);
        targets.push(updated);
      }
    }

    if (targets.length === 0) return;
    this.saveOfflineCache(true);
    this.notifyListeners();

    if (!this.isConfigured || typeof window === 'undefined') return;
    try {
      const db = getFirestoreDb();
      const batch = writeBatch(db);
      for (const item of targets) {
        const ref = doc(db, COLLECTION_NAME, item.id);
        batch.set(
          ref,
          sanitizeFirestoreDocument(item as unknown as Record<string, unknown>),
          { merge: true }
        );
      }
      await batch.commit();
    } catch (err) {
      console.warn('[DispatchAlertsService] Failed to batch mark alerts read:', err);
    }
  }

  public async clearUnpinned(): Promise<void> {
    const now = Date.now();
    const targets: DispatchAlertRecord[] = [];

    for (const rec of this.records.values()) {
      if (!rec.dismissedAt && !rec.isPinned) {
        const updated: DispatchAlertRecord = {
          ...rec,
          dismissedAt: now,
          updatedAt: now,
        };
        this.records.set(rec.id, updated);
        targets.push(updated);
      }
    }

    if (targets.length === 0) return;
    this.saveOfflineCache(true);
    this.notifyListeners();

    if (!this.isConfigured || typeof window === 'undefined') return;
    try {
      const db = getFirestoreDb();
      const batch = writeBatch(db);
      for (const item of targets) {
        const ref = doc(db, COLLECTION_NAME, item.id);
        batch.set(
          ref,
          sanitizeFirestoreDocument(item as unknown as Record<string, unknown>),
          { merge: true }
        );
      }
      await batch.commit();
    } catch (err) {
      console.warn('[DispatchAlertsService] Failed to batch clear unpinned alerts:', err);
    }
  }

  private isRecordWithinDedupeWindow(
    rec: DispatchAlertRecord,
    nowMs: number,
    ttlMinutes: number
  ): boolean {
    if (ttlMinutes === 0) return true;
    const effectiveMinutes =
      Number.isFinite(ttlMinutes) && ttlMinutes > 0
        ? ttlMinutes
        : DEFAULT_DEDUPE_WINDOW_MINUTES;
    const windowMs = effectiveMinutes * 60 * 1000;
    return nowMs - (rec.createdAt || 0) < windowMs;
  }

  /**
   * Publishes a system alert with deterministic `dedupeKey` deduplication.
   * Checks both in-memory records and Firestore (including already-read or dismissed
   * alert docs within TTL) so refreshing the page never re-creates triaged alerts.
   */
  public async pushSystemAlert(
    text: string,
    toLabel: string = 'Dispatch Operations',
    options?: PushSystemAlertOptions
  ): Promise<DispatchAlertRecord | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const dedupeKey = buildSystemAlertDedupeKey(trimmed, toLabel, options?.dedupeKey);
    const docId = toSystemAlertDocId(dedupeKey);
    const ttlMinutes = options?.ttlMinutes ?? DEFAULT_DEDUPE_WINDOW_MINUTES;
    const now = Date.now();

    if (this.inFlightDedupeKeys.has(dedupeKey)) {
      return null;
    }

    // 1. Check all known records in memory (including isRead === true and dismissedAt !== null)
    const existingById = this.records.get(docId);
    if (existingById && this.isRecordWithinDedupeWindow(existingById, now, ttlMinutes)) {
      return null;
    }
    for (const rec of this.records.values()) {
      if (
        (rec.dedupeKey === dedupeKey || (rec.text === trimmed && !rec.isRead && !rec.dismissedAt)) &&
        this.isRecordWithinDedupeWindow(rec, now, ttlMinutes)
      ) {
        return null;
      }
    }

    this.inFlightDedupeKeys.add(dedupeKey);
    try {
      // 2. Authoritative Firestore check (protects early post-refresh ticks before initial snapshot)
      if (this.isConfigured && typeof window !== 'undefined') {
        try {
          const db = getFirestoreDb();
          const docRef = doc(db, COLLECTION_NAME, docId);
          const existingSnap = await getDoc(docRef);
          if (existingSnap.exists()) {
            const hydrated = normalizeAlertRecord(
              docId,
              existingSnap.data() as Partial<DispatchAlertRecord>
            );
            this.records.set(docId, hydrated);
            if (this.isRecordWithinDedupeWindow(hydrated, Date.now(), ttlMinutes)) {
              return null;
            }
          }
        } catch {
          // Proceed with local state if offline or prior to auth hydration
        }
      }

      const createdMs = Date.now();
      const record: DispatchAlertRecord = {
        id: docId,
        to: toLabel.trim() || 'Dispatch Operations',
        text: trimmed,
        timestamp: formatAlertTimestamp(createdMs),
        createdAt: createdMs,
        updatedAt: createdMs,
        priority: options?.priority ?? 'urgent',
        isPinned: false,
        isRead: false,
        dismissedAt: null,
        dedupeKey,
        source: 'system',
        createdByUid: null,
        createdByName: 'System',
      };

      this.records.set(docId, record);
      this.saveOfflineCache(true);
      this.notifyListeners();
      await this.persistRecord(record);
      return record;
    } finally {
      this.inFlightDedupeKeys.delete(dedupeKey);
    }
  }
}

export const dispatchAlertsService = DispatchAlertsService.getInstance();
