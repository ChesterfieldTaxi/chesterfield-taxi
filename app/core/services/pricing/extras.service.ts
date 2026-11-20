/**
 * Universal Extras & Services Catalog Service
 *
 * Manages fleet-wide passenger add-ons:
 * - Child Safety Seats ($10.00/seat with vehicle auto-upgrade to SUV/Minivan)
 * - Extra Passengers (1 included free, $1.00 per additional head)
 * - Intermediate Stops ($5.00/stop with 5 min free waiting time)
 * - Curb Waiting (Grace period & per-minute rates)
 * - Oversized Cargo Categories & Fees
 * - Custom Bookable Fleet Extras
 *
 * Stored in Firestore `/pricingConfig/universalExtras` with LocalStorage caching.
 */

import { doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import { type UniversalExtrasConfig, DEFAULT_OVERSIZED_BAG_CATEGORIES } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const EXTRAS_STORAGE_KEY = 'chesterfield_taxi_universal_extras';

export const DEFAULT_UNIVERSAL_EXTRAS: UniversalExtrasConfig = {
  carSeatFeePerUnit: 10.0,
  carSeatAutoUpgradeVehicleType: true,
  passengerBaseAllowance: 1, // First passenger free
  extraPassengerFeePerHead: 1.0, // $1 each additional
  intermediateStopFee: 5.0, // $5 per waypoint
  intermediateStopFreeWaitingMinutes: 5,
  curbWaitingGraceMinutes: 10, // 10 min grace at pickup curb
  curbWaitingRatePerMinute: 0.5, // $0.50/min thereafter
  pickupGraceMinutes: 10,
  waitingRatePerMinute: 0.5,
  petFee: 0.0,
  oversizedBagsConfig: DEFAULT_OVERSIZED_BAG_CATEGORIES,
  oversizedAutoUpgradeVehicleType: true,
  customExtras: [],
};

function normalizeExtrasConfig(raw: Partial<UniversalExtrasConfig>): UniversalExtrasConfig {
  const merged = { ...DEFAULT_UNIVERSAL_EXTRAS, ...raw };
  const grace =
    typeof raw.curbWaitingGraceMinutes === 'number'
      ? raw.curbWaitingGraceMinutes
      : typeof raw.pickupGraceMinutes === 'number'
      ? raw.pickupGraceMinutes
      : DEFAULT_UNIVERSAL_EXTRAS.curbWaitingGraceMinutes;
  const waitRate =
    typeof raw.curbWaitingRatePerMinute === 'number'
      ? raw.curbWaitingRatePerMinute
      : typeof raw.waitingRatePerMinute === 'number'
      ? raw.waitingRatePerMinute
      : DEFAULT_UNIVERSAL_EXTRAS.curbWaitingRatePerMinute;

  return {
    ...merged,
    curbWaitingGraceMinutes: grace,
    pickupGraceMinutes: grace,
    curbWaitingRatePerMinute: waitRate,
    waitingRatePerMinute: waitRate,
    oversizedBagsConfig:
      Array.isArray(merged.oversizedBagsConfig) && merged.oversizedBagsConfig.length > 0
        ? merged.oversizedBagsConfig
        : DEFAULT_OVERSIZED_BAG_CATEGORIES,
    customExtras: Array.isArray(merged.customExtras)
      ? merged.customExtras.map((ce) => ({
          ...ce,
          isActive: ce.isActive !== false,
          showOnBookingForm: ce.showOnBookingForm !== false,
        }))
      : [],
  };
}

export class UniversalExtrasService {
  private cache: UniversalExtrasConfig | null = null;
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.db = this.isConfigured ? getFirestoreDb() : null;
  }

  public getCached(): UniversalExtrasConfig {
    if (this.cache) {
      return { ...this.cache };
    }
    if (typeof window === 'undefined') return DEFAULT_UNIVERSAL_EXTRAS;
    try {
      const raw = localStorage.getItem(EXTRAS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.carSeatFeePerUnit === 'number') {
          const normalized = normalizeExtrasConfig(parsed);
          this.cache = normalized;
          return { ...normalized };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_UNIVERSAL_EXTRAS;
  }

  public setCached(cfg: UniversalExtrasConfig): void {
    const normalized = normalizeExtrasConfig(cfg);
    this.cache = normalized;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(EXTRAS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage errors
    }
  }

  public async getExtras(forceRefresh = false): Promise<UniversalExtrasConfig> {
    if (this.cache && !forceRefresh) {
      return { ...this.cache };
    }

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'universalExtras');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as Partial<UniversalExtrasConfig>;
          const normalized = normalizeExtrasConfig(data);
          this.setCached(normalized);
          return { ...normalized };
        }
      } catch (err) {
        console.warn('[UniversalExtrasService] Firestore fetch error, using cache:', err);
      }
    }

    const cached = this.getCached();
    this.cache = cached;
    return { ...cached };
  }

  public subscribeToExtras(
    onUpdate: (extras: UniversalExtrasConfig) => void,
    onError?: (err: Error) => void
  ): () => void {
    onUpdate(this.getCached());

    if (!this.isConfigured || !this.db) {
      this.getExtras().then(onUpdate).catch((err) => onError?.(err));
      return () => {};
    }

    try {
      const ref = doc(this.db, 'pricingConfig', 'universalExtras');
      return onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const normalized = normalizeExtrasConfig(snap.data() as Partial<UniversalExtrasConfig>);
            this.setCached(normalized);
            onUpdate(normalized);
          }
        },
        (err) => {
          console.warn('[UniversalExtrasService] Snapshot error:', err);
          onError?.(err);
        }
      );
    } catch (err) {
      console.warn('[UniversalExtrasService] Snapshot setup failed:', err);
      return () => {};
    }
  }

  public async saveExtras(cfg: UniversalExtrasConfig): Promise<void> {
    const normalized = normalizeExtrasConfig(cfg);
    this.setCached(normalized);

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'universalExtras');
        await setDoc(ref, sanitizePayload(normalized), { merge: true });
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
  return getUniversalExtrasService().getCached();
}

export async function saveUniversalExtrasConfig(cfg: UniversalExtrasConfig): Promise<void> {
  const svc = getUniversalExtrasService();
  svc.setCached(cfg);
  await svc.saveExtras(cfg);
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
  showOnBookingForm?: boolean;
}
