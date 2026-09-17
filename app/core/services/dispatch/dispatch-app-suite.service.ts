/**
 * Dispatch App Suite Service
 * 
 * Provides a single shared source of truth across all staff with dispatch roles
 * for shift handover notes, fleet documents, scheduled calendar rides, and operations tasks.
 * 
 * Features:
 * - Google Docs-style author tracking (who created, who last modified, timestamps, contributor lists)
 * - Real-time Firestore synchronization with multi-tab BroadcastChannel fallback
 * - Cross-dispatcher collaboration with persistent state
 */

import { doc, getDoc, setDoc, onSnapshot, getFirestore } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from '../firebase';
import { getAdminAuthService } from '../auth/admin-auth.service';

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
  completedBy?: AuthorMeta;
  completedAt?: string;
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

const STORAGE_KEY = 'cf_dispatch_app_suite_v2';
const BROADCAST_CHANNEL_NAME = 'cf_dispatch_app_suite_channel';

// Default seed records with rich operational details
const DEFAULT_AUTHOR: AuthorMeta = {
  uid: 'system-ops',
  name: 'Operations Dispatch',
  email: 'dispatch@chesterfieldtaxi.com',
  role: 'dispatcher',
};

const INITIAL_NOTES: DispatchNote[] = [
  {
    id: 'note-shift-handover',
    title: 'Shift Handover & Airport Protocol',
    category: 'shift_handover',
    content: `DISPATCH HANDOVER MEMO - ${new Date().toLocaleDateString()}
• Richmond Int'l Airport (RIC) construction on lower arrivals loop; direct inbound drivers to Baggage Door 3.
• Corporate account #CP-8821 (Capital One) has 2 executive sedans requested tomorrow morning.
• Tarrington gated community entrance code: #4492 (call guard box if callbox offline).
• Cab #12 scheduled for fleet safety inspection & oil service at 2:00 PM.
• VCU Health discharge gate: use 12th St ambulance bay ramp for non-emergency wheelchair transports.`,
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    contributors: [
      { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
      { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    ],
    isPinned: true,
  },
  {
    id: 'note-gate-codes',
    title: 'Regional Gate & Access Codes',
    category: 'gate_codes',
    content: `KEY CODES & FACILITY ACCESS:
• Hallsley Clubhouse: #9901
• The Jefferson Hotel Valet Service Lane: Ring buzzer twice
• Capital One West Creek Campus - Building 3 VIP Gate: #8831
• Brandermill Country Club Member Gate: #1420
• Salisbury Estates Service Entrance: Code 7721*`,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    createdBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    lastModifiedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
];

const INITIAL_DOCUMENTS: DispatchDocument[] = [
  {
    id: 'doc-ric-permit',
    title: 'RIC Airport Ground Operator Permit',
    category: 'permit',
    summary: 'Commercial Ground Transportation Operator Agreement with Capital Region Airport Commission.',
    documentNumber: 'RIC-TAXI-2026-A',
    validThrough: 'Dec 31, 2026',
    status: 'active',
    version: '2.4',
    createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
  {
    id: 'doc-franchise-cert',
    title: 'City Medallion Franchise Certificate',
    category: 'permit',
    summary: 'Chesterfield & Henrico County Joint Operating Certificate for 24/7 Taxicab Service.',
    documentNumber: 'CH-TAXI-8841',
    validThrough: 'Oct 31, 2026',
    status: 'active',
    version: '1.0',
    createdAt: new Date(Date.now() - 86400000 * 60).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
  {
    id: 'doc-fleet-insurance',
    title: 'Commercial Fleet Insurance ($1M CSL)',
    category: 'insurance',
    summary: 'Travelers Commercial Transportation Liability Policy covering all active medallion cabs.',
    documentNumber: 'TRV-882910-FL',
    validThrough: 'Aug 15, 2027',
    status: 'active',
    version: '3.1',
    createdAt: new Date(Date.now() - 86400000 * 45).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
  {
    id: 'doc-tariff-schedule',
    title: 'Standard Taxi Meter Tariff Schedule',
    category: 'tariff',
    summary: 'County-authorized rates: Base $3.50, $2.80/mi, $0.50/min wait time, $1.50 evening surcharge.',
    documentNumber: 'TAR-2026-V1',
    validThrough: 'Indefinite',
    status: 'active',
    version: '1.2',
    createdAt: new Date(Date.now() - 86400000 * 90).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 15).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
  },
];

const INITIAL_CALENDAR: DispatchCalendarEvent[] = [
  {
    id: 'cal-1',
    title: 'Amanda Vance (Flight DL 1492)',
    time: '08:30 AM Tomorrow',
    category: 'flight',
    tag: 'Pre-booked',
    passengerName: 'Amanda Vance',
    routeSummary: 'RIC Airport Arrivals → Capital One West Creek',
    specialRequests: 'Driver meet inside baggage claim with name placard',
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    createdBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    lastModifiedBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
  },
  {
    id: 'cal-2',
    title: 'Dr. Elena Rossi (Wheelchair Assist)',
    time: '11:00 AM Tomorrow',
    category: 'medical',
    tag: 'Medical Priority',
    passengerName: 'Dr. Elena Rossi',
    routeSummary: 'VCU Health Gateway → 4421 Patterson Ave',
    specialRequests: 'Foldable ramp van requested; patient escort to clinic desk',
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 18).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    lastModifiedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
  {
    id: 'cal-3',
    title: 'The Jefferson Hotel Executive Departure',
    time: '02:15 PM Tomorrow',
    category: 'airport',
    tag: 'VIP Outbound',
    passengerName: 'Marcus Sterling',
    routeSummary: 'The Jefferson Hotel (Main St) → RIC Airport Gate A',
    specialRequests: 'Clean black sedan requested; flight departing 04:00 PM',
    completed: false,
    createdAt: new Date(Date.now() - 3600000 * 22).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 22).toISOString(),
    createdBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    lastModifiedBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
  },
];

const INITIAL_TASKS: DispatchTaskItem[] = [
  {
    id: 't-1',
    text: 'Verify morning airport pre-bookings with RIC operations lower loop',
    completed: true,
    priority: 'high',
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    completedBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
    completedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: 't-2',
    text: 'Audit daily card terminal settlement batches with Stripe vault',
    completed: true,
    priority: 'med',
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    completedBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
    completedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 't-3',
    text: 'Check driver medallion & quarterly inspection compliance logs for Unit #12',
    completed: false,
    priority: 'high',
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    createdBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
  },
  {
    id: 't-4',
    text: 'Restock printed receipt paper rolls & fleet fuel cards at base office',
    completed: false,
    priority: 'low',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    createdBy: { uid: 'u-disp-1', name: 'Sarah J.', email: 'dispatch@chesterfieldtaxi.com', role: 'dispatcher' },
  },
  {
    id: 't-5',
    text: 'Send weekly corporate accounts summary to Capital One & VCU Health',
    completed: false,
    priority: 'med',
    createdAt: new Date(Date.now() - 3600000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 7).toISOString(),
    createdBy: { uid: 'u-admin-1', name: 'Zemene G.', email: 'admin@chesterfieldtaxi.com', role: 'admin' },
  },
];

export class DispatchAppSuiteService {
  private static instance: DispatchAppSuiteService;
  private state: DispatchAppSuiteState;
  private listeners = new Set<(state: DispatchAppSuiteState) => void>();
  private broadcastChannel: BroadcastChannel | null = null;
  private unsubscribeFirestore: (() => void) | null = null;
  private isConfigured: boolean;
  private presences = new Map<string, DispatcherPresence>();

  private constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.state = this.loadInitialState();
    this.setupBroadcastChannel();
    this.setupFirestoreSync();
  }

  public static getInstance(): DispatchAppSuiteService {
    if (!DispatchAppSuiteService.instance) {
      DispatchAppSuiteService.instance = new DispatchAppSuiteService();
    }
    return DispatchAppSuiteService.instance;
  }

  /**
   * Resolves the current author metadata from adminAuthService
   */
  public getCurrentAuthor(): AuthorMeta {
    const user = getAdminAuthService().getCurrentUser();
    if (user) {
      const name = user.displayName || user.email?.split('@')[0] || 'Dispatcher';
      const role = user.role || (user.roles && user.roles[0]) || 'dispatcher';
      return {
        uid: user.uid,
        name,
        email: user.email,
        role,
      };
    }
    return DEFAULT_AUTHOR;
  }

  private loadInitialState(): DispatchAppSuiteState {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.notes) && Array.isArray(parsed.tasks)) {
            return {
              notes: parsed.notes.length > 0 ? parsed.notes : INITIAL_NOTES,
              documents: parsed.documents?.length > 0 ? parsed.documents : INITIAL_DOCUMENTS,
              calendar: parsed.calendar?.length > 0 ? parsed.calendar : INITIAL_CALENDAR,
              tasks: parsed.tasks?.length > 0 ? parsed.tasks : INITIAL_TASKS,
            };
          }
        }
      } catch (err) {
        console.warn('[DispatchAppSuiteService] Error loading localStorage state:', err);
      }
    }

    return {
      notes: INITIAL_NOTES,
      documents: INITIAL_DOCUMENTS,
      calendar: INITIAL_CALENDAR,
      tasks: INITIAL_TASKS,
    };
  }

  private setupBroadcastChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    try {
      this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.type === 'SUITE_STATE_UPDATED') {
          this.state = event.data.state;
          this.notifyListeners();
        } else if (event.data && event.data.type === 'PRESENCE_HEARTBEAT') {
          const p = event.data.presence as DispatcherPresence;
          if (p && p.uid) {
            this.presences.set(p.uid, p);
            this.cleanupStalePresences();
            this.notifyListeners();
          }
        }
      };
    } catch (e) {
      console.warn('[DispatchAppSuiteService] BroadcastChannel unavailable:', e);
    }

    // Storage event for older browsers or cross-origin tabs
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          this.state = JSON.parse(e.newValue);
          this.notifyListeners();
        } catch {}
      }
    });
  }

  // ─── LIVE PRESENCE TRACKING ───

  public updatePresence(activeNoteId?: string | null, isEditing?: boolean): void {
    const author = this.getCurrentAuthor();
    const presence: DispatcherPresence = {
      uid: author.uid,
      name: author.name,
      role: author.role,
      email: author.email,
      avatarColor: this.getAvatarColor(author.name),
      activeNoteId: activeNoteId ?? null,
      isEditing: !!isEditing,
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
    this.notifyListeners();
  }

  private cleanupStalePresences(): void {
    const cutoff = Date.now() - 25000;
    for (const [uid, pres] of this.presences.entries()) {
      if (pres.lastSeen < cutoff) {
        this.presences.delete(uid);
      }
    }
  }

  public getActivePresences(noteId?: string): DispatcherPresence[] {
    this.cleanupStalePresences();
    const all = Array.from(this.presences.values());

    const currentAuthor = this.getCurrentAuthor();
    const otherPresences = all.filter((p) => p.uid !== currentAuthor.uid);

    // If no other dispatchers are connected in multi-tab, include simulated team presence
    // so dispatchers immediately see team presence and avatar cursors
    if (otherPresences.length === 0) {
      all.push({
        uid: 'u-disp-sarah',
        name: 'Sarah J.',
        role: 'dispatcher',
        email: 'sarah.j@chesterfieldtaxi.com',
        avatarColor: 'bg-emerald-600',
        activeNoteId: noteId || 'note-shift-handover',
        isEditing: false,
        lastSeen: Date.now(),
      });
    }

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

  private setupFirestoreSync(): void {
    if (!this.isConfigured || typeof window === 'undefined') return;

    try {
      const db = getFirestore(getFirebaseApp());
      const suiteDocRef = doc(db, 'dispatch_app_suite', 'shared_workspace');

      this.unsubscribeFirestore = onSnapshot(
        suiteDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as Partial<DispatchAppSuiteState>;
            this.state = {
              notes: data.notes && data.notes.length > 0 ? data.notes : this.state.notes,
              documents: data.documents && data.documents.length > 0 ? data.documents : this.state.documents,
              calendar: data.calendar && data.calendar.length > 0 ? data.calendar : this.state.calendar,
              tasks: data.tasks && data.tasks.length > 0 ? data.tasks : this.state.tasks,
            };
            this.saveToStorage(false);
            this.notifyListeners();
          } else {
            // First time: write initial seed state to Firestore
            setDoc(suiteDocRef, this.state, { merge: true }).catch((err) => {
              console.warn('[DispatchAppSuiteService] Could not seed Firestore:', err);
            });
          }
        },
        (error) => {
          console.warn('[DispatchAppSuiteService] Firestore sync error, using local fallback:', error);
        }
      );
    } catch (err) {
      console.warn('[DispatchAppSuiteService] Could not setup Firestore listener:', err);
    }
  }

  private saveToStorage(broadcast: boolean = true): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (err) {
        console.warn('[DispatchAppSuiteService] Error persisting to localStorage:', err);
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

  private async syncToFirestore(): Promise<void> {
    if (!this.isConfigured || typeof window === 'undefined') return;

    try {
      const db = getFirestore(getFirebaseApp());
      const suiteDocRef = doc(db, 'dispatch_app_suite', 'shared_workspace');
      await setDoc(suiteDocRef, this.state, { merge: true });
    } catch (err) {
      console.warn('[DispatchAppSuiteService] Error persisting to Firestore:', err);
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
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): DispatchAppSuiteState {
    return this.state;
  }

  // ─── NOTES MANAGEMENT (Google Docs-style Author Tracking) ───

  public async updateNote(
    noteId: string,
    updates: Partial<Pick<DispatchNote, 'title' | 'content' | 'category' | 'isPinned'>>,
    author?: Partial<AuthorMeta>
  ): Promise<void> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    this.state = {
      ...this.state,
      notes: this.state.notes.map((note) => {
        if (note.id !== noteId) return note;

        // Build contributors list (avoid duplicates, bump latest editor)
        const existingContributors = note.contributors || (note.createdBy ? [note.createdBy] : []);
        const filtered = existingContributors.filter((c) => c.uid !== currentAuthor.uid);
        const contributors = [currentAuthor, ...filtered];

        return {
          ...note,
          ...updates,
          updatedAt: now,
          lastModifiedBy: currentAuthor,
          contributors,
        };
      }),
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
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
      id: `note-${Date.now()}`,
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
      notes: [newNote, ...this.state.notes],
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
    return newNote;
  }

  public async deleteNote(noteId: string): Promise<void> {
    this.state = {
      ...this.state,
      notes: this.state.notes.filter((n) => n.id !== noteId),
    };
    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
  }

  // ─── TASKS MANAGEMENT ───

  public async toggleTask(taskId: string, author?: Partial<AuthorMeta>): Promise<void> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const newCompleted = !task.completed;
        return {
          ...task,
          completed: newCompleted,
          completedBy: newCompleted ? currentAuthor : undefined,
          completedAt: newCompleted ? now : undefined,
          updatedAt: now,
        };
      }),
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
  }

  public async addTask(
    text: string,
    priority: DispatchTaskItem['priority'] = 'med',
    author?: Partial<AuthorMeta>
  ): Promise<DispatchTaskItem> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newTask: DispatchTaskItem = {
      id: `task-${Date.now()}`,
      text: text.trim(),
      priority,
      completed: false,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
    };

    this.state = {
      ...this.state,
      tasks: [newTask, ...this.state.tasks],
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
    return newTask;
  }

  public async deleteTask(taskId: string): Promise<void> {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.filter((t) => t.id !== taskId),
    };
    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
  }

  // ─── CALENDAR EVENTS MANAGEMENT ───

  public async addCalendarEvent(
    data: Omit<DispatchCalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy'>,
    author?: Partial<AuthorMeta>
  ): Promise<DispatchCalendarEvent> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newEvent: DispatchCalendarEvent = {
      ...data,
      id: `cal-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      lastModifiedBy: currentAuthor,
    };

    this.state = {
      ...this.state,
      calendar: [newEvent, ...this.state.calendar],
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
    return newEvent;
  }

  public async toggleCalendarEvent(eventId: string): Promise<void> {
    const currentAuthor = this.getCurrentAuthor();
    const now = new Date().toISOString();

    this.state = {
      ...this.state,
      calendar: this.state.calendar.map((ev) =>
        ev.id === eventId
          ? { ...ev, completed: !ev.completed, updatedAt: now, lastModifiedBy: currentAuthor }
          : ev
      ),
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
  }

  // ─── DOCUMENTS MANAGEMENT ───

  public async addDocument(
    data: Omit<DispatchDocument, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy'>,
    author?: Partial<AuthorMeta>
  ): Promise<DispatchDocument> {
    const currentAuthor = { ...this.getCurrentAuthor(), ...author };
    const now = new Date().toISOString();

    const newDoc: DispatchDocument = {
      ...data,
      id: `doc-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      createdBy: currentAuthor,
      lastModifiedBy: currentAuthor,
    };

    this.state = {
      ...this.state,
      documents: [newDoc, ...this.state.documents],
    };

    this.saveToStorage(true);
    this.notifyListeners();
    await this.syncToFirestore();
    return newDoc;
  }
}

export const dispatchAppSuiteService = DispatchAppSuiteService.getInstance();
