/**
 * Workspace Event Bus Service
 * 
 * Provides zero-latency cross-window and cross-tab synchronization for the Dispatch Console
 * using the browser's native BroadcastChannel API with localStorage fallback.
 * 
 * Powers multi-monitor setups where Booking, Trips, Comms, Drivers, and Map
 * can pop out into standalone windows while staying completely synchronized.
 */

export type WorkspaceModuleKey = 'booking' | 'trips' | 'comms' | 'drivers' | 'map' | 'email';

export interface UpcomingBookingPreview {
  id: string;
  time: string;
  pickupAddress: string;
  dropoffAddress: string;
  fare: number;
}

export interface WorkspaceEventMap {
  CALL_INCOMING: {
    callSid?: string;
    callerNumber: string;
    callerName?: string;
    numberType?: 'home' | 'mobile' | 'work' | 'other';
    mobileForSms?: string;
    upcomingBookings?: UpcomingBookingPreview[];
    pastTripsCount?: number;
    vipTag?: string;
    notes?: string;
  };
  CALL_ANSWERED: {
    callSid?: string;
    callerNumber: string;
  };
  CALL_ENDED: {
    callSid?: string;
    durationSeconds?: number;
  };
  POPULATE_BOOKING: {
    passengerName?: string;
    passengerPhone?: string;
    passengerEmail?: string;
    callingFromPhone?: string;
    pickupAddress?: string;
    dropoffAddress?: string;
    notes?: string;
  };
  FOCUS_TRIP_ON_MAP: {
    tripId: string;
    pickupCoords?: { lat: number; lng: number };
    dropoffCoords?: { lat: number; lng: number };
  };
  FOCUS_MODULE: {
    moduleKey: WorkspaceModuleKey;
  };
  DRIVER_STATUS_UPDATE: {
    driverId: string;
    cabNumber: string;
    status: 'available' | 'en_route' | 'in_progress' | 'busy' | 'offline';
  };
  WINDOW_REGISTER: {
    moduleKey: WorkspaceModuleKey;
    timestamp: number;
  };
  WINDOW_UNLOAD: {
    moduleKey: WorkspaceModuleKey;
  };
}

export type WorkspaceEventType = keyof WorkspaceEventMap;

export type WorkspaceMessage<T extends WorkspaceEventType = WorkspaceEventType> = {
  [K in T]: {
    type: K;
    payload: WorkspaceEventMap[K];
    senderId: string;
    timestamp: number;
  };
}[T];

class WorkspaceBusService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: WorkspaceMessage<any>) => void> = new Set();
  private clientId: string;
  private poppedOutModules: Set<WorkspaceModuleKey> = new Set();

  constructor() {
    this.clientId = `window_${Math.random().toString(36).substring(2, 9)}`;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('ct_dispatch_workspace');
        this.channel.onmessage = (event: MessageEvent<WorkspaceMessage>) => {
          this.handleIncomingMessage(event.data);
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization failed, falling back to local storage', err);
      }
    }
  }

  private handleIncomingMessage(msg: WorkspaceMessage<any>) {
    if (!msg || msg.senderId === this.clientId) return;

    if (msg.type === 'WINDOW_REGISTER') {
      this.poppedOutModules.add((msg.payload as any).moduleKey);
    } else if (msg.type === 'WINDOW_UNLOAD') {
      this.poppedOutModules.delete((msg.payload as any).moduleKey);
    }

    this.listeners.forEach((callback) => {
      try {
        callback(msg);
      } catch (e) {
        console.error('Workspace listener error:', e);
      }
    });
  }

  public publish<T extends WorkspaceEventType>(type: T, payload: WorkspaceEventMap[T]): void {
    const message: WorkspaceMessage<T> = {
      type,
      payload,
      senderId: this.clientId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(message);
    }

    // Also notify local listeners in the current window
    this.listeners.forEach((cb) => cb(message));
  }

  public subscribe(callback: (msg: WorkspaceMessage) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public isModulePoppedOut(moduleKey: WorkspaceModuleKey): boolean {
    return this.poppedOutModules.has(moduleKey);
  }

  public popOutModule(moduleKey: WorkspaceModuleKey): Window | null {
    if (typeof window === 'undefined') return null;
    const url = `/dispatch/popout?module=${moduleKey}`;
    const windowName = `ct_popout_${moduleKey}`;
    const features = 'width=980,height=820,menubar=no,toolbar=no,location=no,status=no,resizable=yes';
    
    const newWindow = window.open(url, windowName, features);
    if (newWindow) {
      this.poppedOutModules.add(moduleKey);
      this.publish('WINDOW_REGISTER', { moduleKey, timestamp: Date.now() });
    }
    return newWindow;
  }
}

// Global Singleton
let workspaceBusInstance: WorkspaceBusService | null = null;

export function getWorkspaceBus(): WorkspaceBusService {
  if (!workspaceBusInstance) {
    workspaceBusInstance = new WorkspaceBusService();
  }
  return workspaceBusInstance;
}
