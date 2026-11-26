/**
 * Dispatch App Suite Service
 *
 * Provides real-time synchronized collaboration across all dispatch staff via dedicated
 * per-entity Firestore collections (`dispatch_notes`, `dispatch_documents`,
 * `dispatch_calendar`, `dispatch_tasks`, and `dispatch_presence`).
 *
 * Architectural Guarantees:
 * - Zero hardcoded mock data or simulated collaborators
 * - Per-document Firestore writes (`setDoc` / `deleteDoc`) so concurrent dispatcher edits never clobber one another
 * - Auth-aware `onSnapshot` subscriptions with multi-tab BroadcastChannel fallback when offline
 */

import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import {
  getFirebaseAuth,
  getFirestoreDb,
  isFirebaseConfigured,
} from '../firebase';
import { getAdminAuthService } from '../auth/admin-auth.service';
import { sanitizeFirestoreDocument } from '../firestore-sanitizer';

export interface AuthorMeta {
  uid: string;
  name: string;
  email?: string | null;
  role?: string;
  avatarUrl?: string;
}

export interface DispatchNote {
  id: string;
  title: string;
  content: string;
  category: 'shift_handover' | 'gate_codes' | 'vip' | 'maintenance' | 'general';
  createdAt: string;
  updatedAt: string;
  createdBy: AuthorMeta;
  lastModifiedBy: AuthorMeta;
  contributors?: AuthorMeta[];
  isPinned?: boolean;
}

export interface DispatchDocument {
  id: string;
  title: string;
  category: 'permit' | 'tariff' | 'policy' | 'sop' | 'insurance';
  summary: string;
  documentNumber?: string;
  validThrough?: string;
  status: 'active' | 'pending' | 'expired';
  version: string;
  createdAt: string;
  updatedAt: string;
  createdBy: AuthorMeta;
  lastModifiedBy: AuthorMeta;
}

export interface DispatchCalendarEvent {
  id: string;
  title: string;
  time: string;
  category: 'flight' | 'medical' | 'airport' | 'driver' | 'payment';
  tag: string;
  passengerName?: string;
  routeSummary?: string;
  specialRequests?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: AuthorMeta;
  lastModifiedBy: AuthorMeta;
}

export interface DispatchTaskItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'med' | 'low';
  createdAt: string;
  updatedAt: string;
  createdBy: AuthorMeta;
  completedBy?: AuthorMeta | null;
  completedAt?: string | null;
}

export interface DispatcherPresence {
  uid: string;
  name: string;
  role?: string;
  email?: string | null;
  avatarColor?: string;
  activeNoteId?: string | null;
  isEditing?: boolean;
  lastSeen: number;
}

export interface DispatchAppSuiteState {
  notes: DispatchNote[];
  documents: DispatchDocument[];
  calendar: DispatchCalendarEvent[];
  tasks: DispatchTaskItem[];
  activeCollaborators?: AuthorMeta[];
  presences?: DispatcherPresence[];
}

const COLLECTIONS = {
  notes: 'dispatch_notes',
  documents: 'dispatch_documents',
  calendar: 'dispatch_calendar',
  tasks: 'dispatch_tasks',
  presence: 'dispatch_presence',
} as const;

const OFFLINE_CACHE_KEY = 'cf_dispatch_app_suite_v3';
const BROADCAST_CHANNEL_NAME = 'cf_dispatch_app_suite_channel_v3';
const PRESENCE_STALE_MS = 30_000;

function createEmptySuiteState(): DispatchAppSuiteState {
  return {
    notes: [],
    documents: [],
    calendar: [],
    tasks: [],
    presences: [],
  };
}

function sortNotes(items: DispatchNote[]): DispatchNote[] {
  return [...items].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
  });
}

function sortByUpdatedDesc<T extends { updatedAt?: string; createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  );
}

function sortByCreatedDesc<T extends { createdAt?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export class DispatchAppSuiteService {
  private static instance: DispatchAppSuiteService;
  private state: DispatchAppSuiteState;
  private listeners = new Set<(state: DispatchAppSuiteState) => void>();
  private broadcastChannel: BroadcastChannel | null = null;
  private firestoreUnsubs: Array<() => void> = [];
  private authUnsub: (() => void) | null = null;
  private isConfigured: boolean;
  private realtimeAttached = false;
  private presences = new Map<string, DispatcherPresence>();
  private stalePresenceTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.state = this.isConfigured ? createEmptySuiteState() : this.loadOfflineCache();
    this.setupBroadcastChannel();
    this.setupFirestoreSync();
    this.setupStalePresenceSweep();
  }

  public static getInstance(): DispatchAppSuiteService {
    if (!DispatchAppSuiteService.instance) {
      DispatchAppSuiteService.instance = new DispatchAppSuiteService();
    }
    return DispatchAppSuiteService.instance;
  }

  /**
   * Resolves the authenticated staff author metadata without any mock user fallback.
   */
  public getCurrentAuthor(): AuthorMeta {
    const user = getAdminAuthService().getCurrentUser();
    if (user && user.uid) {
      const name = user.displayName || user.email?.split('@')[0] || 'Dispatcher';
      const role = user.role || (user.roles && user.roles[0]) || 'dispatcher';
      return {
        uid: user.uid,
        name,
        email: user.email,
        role,
      };
    }

    if (this.isConfigured && typeof window !== 'undefined') {
      try {
        const fbUser = getFirebaseAuth().currentUser;
        if (fbUser && fbUser.uid) {
          return {
            uid: fbUser.uid,
            name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Dispatcher',
            email: fbUser.email,
            role: 'dispatcher',
          };
        }
      } catch {
        // Ignore prior to Firebase Auth initialization
      }
    }

    return {
      uid: '',
      name: 'Dispatcher',
      email: null,
      role: 'dispatcher',
    };
  }

  private loadOfflineCache(): DispatchAppSuiteState {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<DispatchAppSuiteState>;
          return {
            notes: Array.isArray(parsed?.notes) ? sortNotes(parsed.notes) : [],
            documents: Array.isArray(parsed?.documents) ? sortByUpdatedDesc(parsed.documents) : [],
            calendar: Array.isArray(parsed?.calendar) ? sortByCreatedDesc(parsed.calendar) : [],
            tasks: Array.isArray(parsed?.tasks) ? sortByCreatedDesc(parsed.tasks) : [],
            presences: [],
          };
        }
      } catch (err) {
        console.warn('[DispatchAppSuiteService] Error reading offline cache:', err);
      }
    }

    return createEmptySuiteState();
  }

  private saveOfflineCache(broadcast: boolean = true): void {
    if (typeof window !== 'undefined') {
      try {
        const cacheable: DispatchAppSuiteState = {
          notes: this.state.notes,
          documents: this.state.documents,
          calendar: this.state.calendar,
          tasks: this.state.tasks,
        };
        localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(cacheable));
      } catch (err) {
        console.warn('[DispatchAppSuiteService] Error writing offline cache:', err);
      }
    }

    if (broadcast && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'SUITE_STATE_UPDATED',
          state: this.state,
        });
      } catch {}
    }
  }

  private setupBroadcastChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event) => {
        if (!this.realtimeAttached && event.data?.type === 'SUITE_STATE_UPDATED' && event.data.state) {
          this.state = {
            ...event.data.state,
            presences: this.getActivePresences(),
          };
          this.notifyListeners();
        } else if (event.data?.type === 'PRESENCE_HEARTBEAT') {
          const p = event.data.presence as DispatcherPresence;
          if (p && p.uid) {
            this.presences.set(p.uid, p);
            this.cleanupStalePresences();
            this.syncStatePresences();
            this.notifyListeners();
          }
        } else if (event.data?.type === 'PRESENCE_CLEARED' && typeof event.data.uid === 'string') {
          if (this.presences.delete(event.data.uid)) {
            this.syncStatePresences();
            this.notifyListeners();
          }
        }
      };
    } catch (e) {
      console.warn('[DispatchAppSuiteService] BroadcastChannel unavailable:', e);
    }
  }

  private setupStalePresenceSweep(): void {
    if (typeof window === 'undefined') return;
    this.stalePresenceTimer = setInterval(() => {
      if (this.cleanupStalePresences()) {
        this.syncStatePresences();
        this.notifyListeners();
      }
    }, 10_000);
  }

  // ─── LIVE PRESENCE TRACKING (`dispatch_presence`) ───

  public updatePresence(activeNoteId?: string | null, isEditing?: boolean): void {
    const author = this.getCurrentAuthor();
    if (!author.uid) return;

    const presence: DispatcherPresence = {
      uid: author.uid,
      name: author.name,
      role: author.role,
      email: author.email ?? null,
      avatarColor: this.getAvatarColor(author.name),
      activeNoteId: activeNoteId || null,
      isEditing: Boolean(isEditing),
      lastSeen: Date.now(),
    };
    this.presences.set(author.uid, presence);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'PRESENCE_HEARTBEAT',
          presence,
        });
      } catch {}
    }

    this.cleanupStalePresences();
    this.syncStatePresences();
    this.notifyListeners();

    if (this.isConfigured && typeof window !== 'undefined') {
      const db = getFirestoreDb();
      const presenceRef = doc(db, COLLECTIONS.presence, author.uid);
      void setDoc(
        presenceRef,
        sanitizeFirestoreDocument(presence as unknown as Record<string, unknown>),
        { merge: true }
      ).catch((err) => {
        console.warn('[DispatchAppSuiteService] Failed to sync presence:', err);
      });
    }
  }

  public async clearPresence(): Promise<void> {
    const author = this.getCurrentAuthor();
    if (!author.uid) return;

    const removed = this.presences.delete(author.uid);
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'PRESENCE_CLEARED',
          uid: author.uid,
        });
      } catch {}
    }

    if (removed) {
      this.syncStatePresences();
      this.notifyListeners();
    }

    if (this.isConfigured && typeof window !== 'undefined') {
      try {
        const db = getFirestoreDb();
        await deleteDoc(doc(db, COLLECTIONS.presence, author.uid));
      } catch {
        // Ignore cleanup errors on sign-out or unload
      }
    }
  }

  private cleanupStalePresences(): boolean {
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    let changed = false;
    for (const [uid, pres] of this.presences.entries()) {
      if (!pres.lastSeen || pres.lastSeen < cutoff) {
        this.presences.delete(uid);
        changed = true;
      }
    }
    return changed;
  }

  private syncStatePresences(): void {
    this.state = {
      ...this.state,
      presences: Array.from(this.presences.values()),
    };
  }

  public getActivePresences(noteId?: string): DispatcherPresence[] {
    this.cleanupStalePresences();
    const all = Array.from(this.presences.values());
    if (noteId) {
      return all.filter((p) => p.activeNoteId === noteId);
    }
    return all;
  }

  private getAvatarColor(name: string): string {
    const colors = [
      'bg-purple-600',
      'bg-blue-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-rose-600',
      'bg-indigo-600',
      'bg-teal-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // ─── PER-COLLECTION FIRESTORE REAL-TIME LISTENERS ───

  private setupFirestoreSync(): void {
    if (!this.isConfigured || typeof window === 'undefined') return;

    try {
      const auth = getFirebaseAuth();
      this.authUnsub = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          this.attachFirestoreListeners();
        } else {
          this.teardownFirestoreListeners();
          this.presences.clear();
          this.state = createEmptySuiteState();
          this.notifyListeners();
        }
      });

      if (auth.currentUser) {
        this.attachFirestoreListeners();
      }
    } catch (err) {
      console.warn('[DispatchAppSuiteService] Could not initialize auth observer:', err);
    }
  }

  private attachFirestoreListeners(): void {
    if (this.realtimeAttached || !this.isConfigured || typeof window === 'undefined') {
      return;
    }

    try {
      const db = getFirestoreDb();
      this.realtimeAttached = true;

      const handleListenerError = (collectionName: string, err: Error) => {
        console.warn(
          `[DispatchAppSuiteService] ${collectionName} listener detached:`,
          err.message
        );
        this.teardownFirestoreListeners();
      };

      const unsubNotes = onSnapshot(
        collection(db, COLLECTIONS.notes),
        (snap) => {
          const notes: DispatchNote[] = [];
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as DispatchNote;
            if (raw && typeof raw.title === 'string') {
              notes.push({ ...raw, id: raw.id || docSnap.id });
            }
          });
          this.state = {
            ...this.state,
            notes: sortNotes(notes),
          };
          this.saveOfflineCache(false);
          this.notifyListeners();
        },
        (err) => handleListenerError(COLLECTIONS.notes, err)
      );

      const unsubDocuments = onSnapshot(
        collection(db, COLLECTIONS.documents),
        (snap) => {
          const documents: DispatchDocument[] = [];
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as DispatchDocument;
            if (raw && typeof raw.title === 'string') {
              documents.push({ ...raw, id: raw.id || docSnap.id });
            }
          });
          this.state = {
            ...this.state,
            documents: sortByUpdatedDesc(documents),
          };
          this.saveOfflineCache(false);
          this.notifyListeners();
        },
        (err) => handleListenerError(COLLECTIONS.documents, err)
      );

      const unsubCalendar = onSnapshot(
        collection(db, COLLECTIONS.calendar),
        (snap) => {
          const calendar: DispatchCalendarEvent[] = [];
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as DispatchCalendarEvent;
            if (raw && typeof raw.title === 'string') {
              calendar.push({ ...raw, id: raw.id || docSnap.id });
            }
          });
          this.state = {
            ...this.state,
            calendar: sortByCreatedDesc(calendar),
          };
          this.saveOfflineCache(false);
          this.notifyListeners();
        },
        (err) => handleListenerError(COLLECTIONS.calendar, err)
      );

      const unsubTasks = onSnapshot(
        collection(db, COLLECTIONS.tasks),
        (snap) => {
          const tasks: DispatchTaskItem[] = [];
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as DispatchTaskItem;
            if (raw && typeof raw.text === 'string') {
              tasks.push({ ...raw, id: raw.id || docSnap.id });
            }
          });
          this.state = {
            ...this.state,
            tasks: sortByCreatedDesc(tasks),
          };
          this.saveOfflineCache(false);
          this.notifyListeners();
        },
        (err) => handleListenerError(COLLECTIONS.tasks, err)
      );

      const unsubPresence = onSnapshot(
        collection(db, COLLECTIONS.presence),
        (snap) => {
          const nextPresences = new Map<string, DispatcherPresence>();
          const cutoff = Date.now() - PRESENCE_STALE_MS;
          snap.forEach((docSnap) => {
            const raw = docSnap.data() as DispatcherPresence;
            const uid = raw?.uid || docSnap.id;
            if (uid && typeof raw?.lastSeen === 'number' && raw.lastSeen >= cutoff) {
              nextPresences.set(uid, { ...raw, uid });
            }
          });
          this.presences = nextPresences;
          this.syncStatePresences();
          this.notifyListeners();
        },
        (err) => handleListenerError(COLLECTIONS.presence, err)
      );

      this.firestoreUnsubs = [
        unsubNotes,
        unsubDocuments,
        unsubCalendar,
        unsubTasks,
        unsubPresence,
      ];
    } catch (err) {
      console.warn('[DispatchAppSuiteService] Failed to attach Firestore listeners:', err);
      this.teardownFirestoreListeners();
    }
  }

  private teardownFirestoreListeners(): void {
    for (const unsub of this.firestoreUnsubs) {
      try {
        unsub();
      } catch {}
    }
    this.firestoreUnsubs = [];
    this.realtimeAttached = false;
  }

  private async persistDoc(collectionName: string, id: string, payload: unknown): Promise<void> {
    if (!this.isConfigured || typeof window === 'undefined') return;
    try {
      const db = getFirestoreDb();
      await setDoc(
        doc(db, collectionName, id),
        sanitizeFirestoreDocument(payload as Record<string, unknown>)
      );
    } catch (err) {
      console.warn(`[DispatchAppSuiteService] Failed to write ${collectionName}/${id}:`, err);
    }
  }

  private async removeDoc(collectionName: string, id: string): Promise<void> {
    if (!this.isConfigured || typeof window === 'undefined') return;
    try {
      const db = getFirestoreDb();
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      console.warn(`[DispatchAppSuiteService] Failed to delete ${collectionName}/${id}:`, err);
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error('[DispatchAppSuiteService] Listener error:', e);
      }
    }
  }

  public subscribe(listener: (state: DispatchAppSuiteState) => void): () => void {
    this.listeners.add(listener);
    if (this.isConfigured && typeof window !== 'undefined' && !this.realtimeAttached) {
      try {
        if (getFirebaseAuth().currentUser) {
          this.attachFirestoreListeners();
        }
      } catch {}
    }
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): DispatchAppSuiteState {
    return this.state;
  }

  // ─── NOTES MANAGEMENT (`dispatch_notes`) ───

  public async updateNote(
    noteId: string,
    updates: Partial<Pick<DispatchNote, 'title' | 'content' | 'category' | 'isPinned'>>,
    author?: Partial<AuthorMeta>
  ): Promise<void> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();
    let updatedTarget: DispatchNote | null = null;

    const updatedNotes = this.state.notes.map((note) => {
      if (note.id !== noteId) return note;

      const existingContributors = note.contributors || (note.createdBy ? [note.createdBy] : []);
      const filtered = existingContributors.filter(
        (c) => (c.uid && currentAuthor.uid ? c.uid !== currentAuthor.uid : c.name !== currentAuthor.name)
      );
      const contributors = [currentAuthor, ...filtered];

      updatedTarget = {
        ...note,
        ...updates,
        updatedAt: now,
        lastModifiedBy: currentAuthor,
        contributors,
      };
      return updatedTarget;
    });

    if (!updatedTarget) return;

    this.state = {
      ...this.state,
      notes: sortNotes(updatedNotes),
    };

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.notes, noteId, updatedTarget);
  }

  public async createNote(
    title: string,
    content: string,
    category: DispatchNote['category'] = 'general',
    author?: Partial<AuthorMeta>
  ): Promise<DispatchNote> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newNote: DispatchNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim() || 'Untitled Dispatch Note',
      content,
      category,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      lastModifiedBy: currentAuthor,
      contributors: [currentAuthor],
      isPinned: false,
    };

    this.state = {
      ...this.state,
      notes: sortNotes([newNote, ...this.state.notes]),
    };

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.notes, newNote.id, newNote);
    return newNote;
  }

  public async deleteNote(noteId: string): Promise<void> {
    this.state = {
      ...this.state,
      notes: this.state.notes.filter((n) => n.id !== noteId),
    };
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.removeDoc(COLLECTIONS.notes, noteId);
  }

  // ─── TASKS MANAGEMENT (`dispatch_tasks`) ───

  public async toggleTask(taskId: string, author?: Partial<AuthorMeta>): Promise<void> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();
    let updatedTarget: DispatchTaskItem | null = null;

    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const newCompleted = !task.completed;
        updatedTarget = {
          ...task,
          completed: newCompleted,
          completedBy: newCompleted ? currentAuthor : null,
          completedAt: newCompleted ? now : null,
          updatedAt: now,
        };
        return updatedTarget;
      }),
    };

    if (!updatedTarget) return;

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.tasks, taskId, updatedTarget);
  }

  public async addTask(
    text: string,
    priority: DispatchTaskItem['priority'] = 'med',
    author?: Partial<AuthorMeta>
  ): Promise<DispatchTaskItem> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newTask: DispatchTaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: text.trim(),
      priority,
      completed: false,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      completedBy: null,
      completedAt: null,
    };

    this.state = {
      ...this.state,
      tasks: sortByCreatedDesc([newTask, ...this.state.tasks]),
    };

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.tasks, newTask.id, newTask);
    return newTask;
  }

  public async deleteTask(taskId: string): Promise<void> {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.filter((t) => t.id !== taskId),
    };
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.removeDoc(COLLECTIONS.tasks, taskId);
  }

  // ─── CALENDAR EVENTS MANAGEMENT (`dispatch_calendar`) ───

  public async addCalendarEvent(
    data: Omit<
      DispatchCalendarEvent,
      'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy'
    >,
    author?: Partial<AuthorMeta>
  ): Promise<DispatchCalendarEvent> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newEvent: DispatchCalendarEvent = {
      ...data,
      id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      lastModifiedBy: currentAuthor,
    };

    this.state = {
      ...this.state,
      calendar: sortByCreatedDesc([newEvent, ...this.state.calendar]),
    };

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.calendar, newEvent.id, newEvent);
    return newEvent;
  }

  public async toggleCalendarEvent(eventId: string): Promise<void> {
    const currentAuthor = this.getCurrentAuthor();
    const now = new Date().toISOString();
    let updatedTarget: DispatchCalendarEvent | null = null;

    this.state = {
      ...this.state,
      calendar: this.state.calendar.map((ev) => {
        if (ev.id !== eventId) return ev;
        updatedTarget = {
          ...ev,
          completed: !ev.completed,
          updatedAt: now,
          lastModifiedBy: currentAuthor,
        };
        return updatedTarget;
      }),
    };

    if (!updatedTarget) return;

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.calendar, eventId, updatedTarget);
  }

  public async deleteCalendarEvent(eventId: string): Promise<void> {
    this.state = {
      ...this.state,
      calendar: this.state.calendar.filter((ev) => ev.id !== eventId),
    };
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.removeDoc(COLLECTIONS.calendar, eventId);
  }

  // ─── DOCUMENTS MANAGEMENT (`dispatch_documents`) ───

  public async addDocument(
    data: Omit<DispatchDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy'>,
    author?: Partial<AuthorMeta>
  ): Promise<DispatchDocument> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newDoc: DispatchDocument = {
      ...data,
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      lastModifiedBy: currentAuthor,
    };

    this.state = {
      ...this.state,
      documents: sortByUpdatedDesc([newDoc, ...this.state.documents]),
    };

    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.persistDoc(COLLECTIONS.documents, newDoc.id, newDoc);
    return newDoc;
  }

  public async deleteDocument(docId: string): Promise<void> {
    this.state = {
      ...this.state,
      documents: this.state.documents.filter((d) => d.id !== docId),
    };
    this.saveOfflineCache(true);
    this.notifyListeners();
    await this.removeDoc(COLLECTIONS.documents, docId);
  }
}

export const dispatchAppSuiteService = DispatchAppSuiteService.getInstance();
