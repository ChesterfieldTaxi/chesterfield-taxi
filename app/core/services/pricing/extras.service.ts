/**
 * Universal Extras & Services Catalog Service
 * 
 * Manages fleet-wide default add-ons:
 * - Child Safety Seats ($10.00/seat with vehicle auto-upgrade to SUV/Minivan)
 * - Extra Passengers (1 included free, $1.00 per additional head)
 * - Intermediate Stops ($5.00/stop with 5 min free waiting time)
 * - Curb Waiting (Grace period & per-minute rates)
 * 
 * Stored in Firestore `/pricingConfig/universalExtras` with LocalStorage caching.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { UniversalExtrasConfig } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const EXTRAS_STORAGE_KEY = 'chesterfield_taxi_universal_extras';

export const DEFAULT_UNIVERSAL_EXTRAS: UniversalExtrasConfig = {
  carSeatFeePerUnit: 10.00,
  carSeatAutoUpgradeVehicleType: true,
  passengerBaseAllowance: 1, // First passenger free
  extraPassengerFeePerHead: 1.00, // $1 each additional
  intermediateStopFee: 5.00, // $5 per waypoint
  intermediateStopFreeWaitingMinutes: 5,
  curbWaitingGraceMinutes: 10, // 10 min grace at pickup curb
  curbWaitingRatePerMinute: 0.50, // $0.50/min thereafter
  petFee: 0.00,
  customExtras: [],
};

export class UniversalExtrasService {
  private cache: UniversalExtrasConfig | null = null;
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.db = this.isConfigured ? getFirestoreDb() : null;
  }

  private getCached(): UniversalExtrasConfig {
    if (typeof window === 'undefined') return DEFAULT_UNIVERSAL_EXTRAS;
    try {
      const raw = localStorage.getItem(EXTRAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.carSeatFeePerUnit === 'number') {
          return { ...DEFAULT_UNIVERSAL_EXTRAS, ...parsed };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_UNIVERSAL_EXTRAS;
  }

  private setCached(cfg: UniversalExtrasConfig): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // Ignore storage errors
    }
  }

  public async getExtras(): Promise<UniversalExtrasConfig> {
    if (this.cache) {
      return { ...this.cache };
    }

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'universalExtras');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as UniversalExtrasConfig;
          const merged = { ...DEFAULT_UNIVERSAL_EXTRAS, ...data };
          this.cache = merged;
          this.setCached(merged);
          return merged;
        }
      } catch (err) {
        console.warn('[UniversalExtrasService] Firestore fetch error, using cache:', err);
      }
    }

    const cached = this.getCached();
    this.cache = cached;
    return cached;
  }

  public async saveExtras(cfg: UniversalExtrasConfig): Promise<void> {
    this.cache = { ...cfg };
    this.setCached(cfg);

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'universalExtras');
        await setDoc(ref, sanitizePayload(cfg), { merge: true });
      } catch (err) {
        console.error('[UniversalExtrasService] Failed to save to Firestore:', err);
        throw err;
      }
    }
  }
}

let extrasServiceInstance: UniversalExtrasService | null = null;

export function getUniversalExtrasService(): UniversalExtrasService {
  if (!extrasServiceInstance) {
    extrasServiceInstance = new UniversalExtrasService();
  }
  return extrasServiceInstance;
}

export function getUniversalExtrasConfig(): UniversalExtrasConfig {
  const svc = getUniversalExtrasService();
  return (svc as any).getCached ? (svc as any).getCached() : DEFAULT_UNIVERSAL_EXTRAS;
}

export function saveUniversalExtrasConfig(cfg: UniversalExtrasConfig): void {
  const svc = getUniversalExtrasService();
  if ((svc as any).setCached) {
    (svc as any).setCached(cfg);
  }
  svc.saveExtras(cfg).catch((e) => console.error(e));
}

export type { UniversalExtrasConfig };
export const DEFAULT_UNIVERSAL_EXTRAS_CONFIG = DEFAULT_UNIVERSAL_EXTRAS;

export interface CustomFleetExtra {
  id: string;
  name: string;
  fee: number;
  description?: string;
  isPerUnit?: boolean;
  isActive?: boolean;
}
