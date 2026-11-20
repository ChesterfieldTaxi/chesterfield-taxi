/**
 * Surcharges Catalog Service
 *
 * Manages operational, geographic, temporal, vehicle-conditional, and cancellation charges:
 * - Lambert & Spirit Airport Commercial Access Fee ($4.00)
 * - Built-In Fuel / Gas Surcharge (Flat $, $/Mile, or %)
 * - Opt-In Peak Demand Surge Multiplier (only active when explicitly enabled)
 * - Out-of-Area Remote Service Fee ($15.00 outside 15-mile radius)
 * - Custom Conditional Surcharges (Vehicle Types, Distance, Time Window, Days, Zones)
 * - Late Cancellation & Passenger No-Show Protection
 *
 * Stored in Firestore `/pricingConfig/surcharges` with LocalStorage caching.
 */

import { doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { SurchargesConfig } from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const SURCHARGES_STORAGE_KEY = 'chesterfield_taxi_surcharges_config_v2';

export const DEFAULT_SURCHARGES_CONFIG: SurchargesConfig = {
  airportGateFee: 4.0,
  airportTargetZoneIds: ['zone-lambert-airport', 'zone-spirit-airport'],
  peakSurgeMultiplier: 1.25,
  isPeakSurgeActive: false,
  outOfAreaRemoteFee: 15.0,
  outOfAreaThresholdMiles: 15.0,
  cancellationFeeWithinOneHour: 28.0,
  noShowFee: 28.0,
  isFuelSurchargeActive: false,
  fuelSurchargeType: 'flat',
  fuelSurchargeAmount: 2.5,
  fuelSurchargeApplicableTariffs: ['tariff-airport-flat', 'tariff-point-to-point-meter'],
  airportFeeApplicableTariffs: ['tariff-airport-flat', 'tariff-point-to-point-meter'],
  surgeApplicableTariffs: ['tariff-point-to-point-meter'],
  remoteFeeApplicableTariffs: ['tariff-point-to-point-meter'],
  customSurcharges: [
    {
      id: 'surcharge-suv-minivan-fee',
      name: 'SUV / Minivan Upgrade Fee',
      description: 'Vehicle size & luggage capacity upgrade for SUV and Minivan/WAV',
      amount: 10.0,
      type: 'flat',
      isActive: true,
      applicableTariffIds: ['tariff-airport-flat', 'tariff-point-to-point-meter'],
      triggers: {
        vehicleTiers: ['xl', 'suv', 'van', 'minivan', 'wheelchair', 'wheelchair_wav'],
      },
    },
  ],
};

function normalizeSurchargesConfig(raw: Partial<SurchargesConfig>): SurchargesConfig {
  const merged = { ...DEFAULT_SURCHARGES_CONFIG, ...raw };
  const airportGateFee =
    typeof raw.airportGateFee === 'number'
      ? raw.airportGateFee
      : typeof raw.airportCommercialGateFee === 'number'
      ? raw.airportCommercialGateFee
      : DEFAULT_SURCHARGES_CONFIG.airportGateFee;
  const outOfAreaRemoteFee =
    typeof raw.outOfAreaRemoteFee === 'number'
      ? raw.outOfAreaRemoteFee
      : typeof raw.remoteServiceFlatFee === 'number'
      ? raw.remoteServiceFlatFee
      : DEFAULT_SURCHARGES_CONFIG.outOfAreaRemoteFee;
  const outOfAreaThresholdMiles =
    typeof raw.outOfAreaThresholdMiles === 'number'
      ? raw.outOfAreaThresholdMiles
      : typeof raw.remoteBoundaryDistanceMiles === 'number'
      ? raw.remoteBoundaryDistanceMiles
      : DEFAULT_SURCHARGES_CONFIG.outOfAreaThresholdMiles;
  const cancellationFeeWithinOneHour =
    typeof raw.cancellationFeeWithinOneHour === 'number'
      ? raw.cancellationFeeWithinOneHour
      : typeof raw.cancellationFee === 'number'
      ? raw.cancellationFee
      : DEFAULT_SURCHARGES_CONFIG.cancellationFeeWithinOneHour;

  return {
    ...merged,
    airportGateFee,
    airportCommercialGateFee: airportGateFee,
    outOfAreaRemoteFee,
    remoteServiceFlatFee: outOfAreaRemoteFee,
    outOfAreaThresholdMiles,
    remoteBoundaryDistanceMiles: outOfAreaThresholdMiles,
    cancellationFeeWithinOneHour,
    cancellationFee: cancellationFeeWithinOneHour,
    isPeakSurgeActive: Boolean(merged.isPeakSurgeActive),
    isFuelSurchargeActive: Boolean(merged.isFuelSurchargeActive),
    fuelSurchargeType: merged.fuelSurchargeType || 'flat',
    fuelSurchargeAmount:
      typeof merged.fuelSurchargeAmount === 'number'
        ? merged.fuelSurchargeAmount
        : DEFAULT_SURCHARGES_CONFIG.fuelSurchargeAmount,
    customSurcharges: Array.isArray(merged.customSurcharges) ? merged.customSurcharges : [],
  };
}

export class SurchargesService {
  private cache: SurchargesConfig | null = null;
  private lastFetchAt = 0;
  private hasLiveSubscription = false;
  private isConfigured: boolean;
  private db: Firestore | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    this.db = this.isConfigured ? getFirestoreDb() : null;
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === SURCHARGES_STORAGE_KEY && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            this.cache = normalizeSurchargesConfig(parsed);
            this.lastFetchAt = Date.now();
          } catch {}
        }
      });
    }
  }

  public getCached(): SurchargesConfig {
    if (this.cache) {
      return { ...this.cache };
    }
    if (typeof window === 'undefined') return DEFAULT_SURCHARGES_CONFIG;
    try {
      const raw = localStorage.getItem(SURCHARGES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.airportGateFee === 'number') {
          const normalized = normalizeSurchargesConfig(parsed);
          this.cache = normalized;
          return { ...normalized };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_SURCHARGES_CONFIG;
  }

  public setCached(cfg: SurchargesConfig): void {
    const normalized = normalizeSurchargesConfig(cfg);
    this.cache = normalized;
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SURCHARGES_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage errors
    }
  }

  public async getSurcharges(forceRefresh = false): Promise<SurchargesConfig> {
    const cacheFresh = this.cache && (this.hasLiveSubscription || Date.now() - this.lastFetchAt < 15_000);
    if (cacheFresh && !forceRefresh) {
      return { ...this.cache! };
    }

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'surcharges');
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const normalized = normalizeSurchargesConfig(snap.data() as Partial<SurchargesConfig>);
          this.setCached(normalized);
          this.lastFetchAt = Date.now();
          return { ...normalized };
        }
      } catch (err) {
        console.warn('[SurchargesService] Firestore fetch error, using cache:', err);
      }
    }

    const cached = this.getCached();
    this.cache = cached;
    this.lastFetchAt = Date.now();
    return { ...cached };
  }

  public subscribeToSurcharges(
    onUpdate: (cfg: SurchargesConfig) => void,
    onError?: (err: Error) => void
  ): () => void {
    onUpdate(this.getCached());

    if (!this.isConfigured || !this.db) {
      this.getSurcharges(true).then(onUpdate).catch((err) => onError?.(err));
      return () => {};
    }

    try {
      this.hasLiveSubscription = true;
      const ref = doc(this.db, 'pricingConfig', 'surcharges');
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) {
            const normalized = normalizeSurchargesConfig(snap.data() as Partial<SurchargesConfig>);
            this.setCached(normalized);
            this.lastFetchAt = Date.now();
            onUpdate(normalized);
          }
        },
        (err) => {
          console.warn('[SurchargesService] Snapshot error:', err);
          onError?.(err);
        }
      );
      return () => {
        this.hasLiveSubscription = false;
        unsub();
      };
    } catch (err) {
      this.hasLiveSubscription = false;
      console.warn('[SurchargesService] Snapshot setup failed:', err);
      return () => {};
    }
  }

  public async saveSurcharges(cfg: SurchargesConfig): Promise<void> {
    const normalized = normalizeSurchargesConfig(cfg);
    this.setCached(normalized);

    if (this.isConfigured && this.db) {
      try {
        const ref = doc(this.db, 'pricingConfig', 'surcharges');
        await setDoc(ref, sanitizePayload(normalized), { merge: true });
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
  return getSurchargesService().getCached();
}

export async function saveSurchargesConfig(cfg: SurchargesConfig): Promise<void> {
  const svc = getSurchargesService();
  svc.setCached(cfg);
  await svc.saveSurcharges(cfg);
}

export type { SurchargesConfig };
