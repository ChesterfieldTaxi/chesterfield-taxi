/**
 * Surcharges Catalog Service
 * 
 * Manages operational, geographic, temporal, and cancellation charges:
 * - Lambert & Spirit Airport Commercial Access Fee ($4.00)
 * - Peak Demand Surge Multipliers (e.g. 1.25x)
 * - Out-of-Area Remote Service Fee ($15.00 outside 15-mile radius)
 * - Late Cancellation Fee (within 1 hour of pickup)
 * - Passenger No-Show Fee ($28.00 minimum floor)
 * 
 * Stored in Firestore `/pricingConfig/surcharges` with LocalStorage caching.
 */

import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { SurchargesConfig } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const SURCHARGES_STORAGE_KEY = 'chesterfield_taxi_surcharges_config_v2';

export const DEFAULT_SURCHARGES_CONFIG: SurchargesConfig = {
  airportGateFee: 4.00,
  airportTargetZoneIds: ['zone-lambert-airport', 'zone-spirit-airport'],
  peakSurgeMultiplier: 1.25,
  outOfAreaRemoteFee: 15.00,
  outOfAreaThresholdMiles: 15.0,
  cancellationFeeWithinOneHour: 28.00,
  noShowFee: 28.00,
  customSurcharges: [
    {
      id: 'surcharge-suv-minivan-fee',
      name: 'SUV / Minivan Upgrade Fee',
      description: 'Vehicle size & luggage capacity upgrade for SUV and Van/WAV',
      amount: 10.00,
      type: 'flat',
      isActive: true,
      applicableTariffIds: ['tariff-airport-flat', 'tariff-point-to-point-meter'],
      triggers: {
        vehicleTiers: ['xl', 'suv', 'van', 'minivan', 'wheelchair', 'wheelchair_wav'],
      },
    },
  ],
};

export class SurchargesService {
  private cache: SurchargesConfig | null = null;
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.db = this.isConfigured ? getFirestoreDb() : null;
  }

  private getCached(): SurchargesConfig {
    if (typeof window === 'undefined') return DEFAULT_SURCHARGES_CONFIG;
    try {
      const raw = localStorage.getItem(SURCHARGES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.airportGateFee === 'number') {
          return { ...DEFAULT_SURCHARGES_CONFIG, ...parsed };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SURCHARGES_CONFIG;
  }

  private setCached(cfg: SurchargesConfig): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SURCHARGES_STORAGE_KEY, JSON.stringify(cfg));
    } catch {
      // Ignore storage errors
    }
  }

  public async getSurcharges(): Promise<SurchargesConfig> {
    if (this.cache) {
      return { ...this.cache };
    }

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'surcharges');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as SurchargesConfig;
          const merged = { ...DEFAULT_SURCHARGES_CONFIG, ...data };
          this.cache = merged;
          this.setCached(merged);
          return merged;
        }
      } catch (err) {
        console.warn('[SurchargesService] Firestore fetch error, using cache:', err);
      }
    }

    const cached = this.getCached();
    this.cache = cached;
    return cached;
  }

  public async saveSurcharges(cfg: SurchargesConfig): Promise<void> {
    this.cache = { ...cfg };
    this.setCached(cfg);

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'surcharges');
        await setDoc(ref, sanitizePayload(cfg), { merge: true });
      } catch (err) {
        console.error('[SurchargesService] Failed to save to Firestore:', err);
        throw err;
      }
    }
  }
}

let surchargesServiceInstance: SurchargesService | null = null;

export function getSurchargesService(): SurchargesService {
  if (!surchargesServiceInstance) {
    surchargesServiceInstance = new SurchargesService();
  }
  return surchargesServiceInstance;
}

export function getSurchargesConfig(): SurchargesConfig {
  const svc = getSurchargesService();
  return (svc as any).getCached ? (svc as any).getCached() : DEFAULT_SURCHARGES_CONFIG;
}

export function saveSurchargesConfig(cfg: SurchargesConfig): void {
  const svc = getSurchargesService();
  if ((svc as any).setCached) {
    (svc as any).setCached(cfg);
  }
  svc.saveSurcharges(cfg).catch((e) => console.error(e));
}

export type { SurchargesConfig };
