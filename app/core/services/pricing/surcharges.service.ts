/**
 * Surcharges Catalog Service (v2 Firewall Architecture)
 *
 * Manages a clean, uniform catalog of named surcharges stored in Firestore
 * `/pricingConfig/surcharges` with LocalStorage + cross-tab caching.
 *
 * Firewall Policy Model:
 * - Each surcharge has a master kill switch (`enabled: true | false`).
 * - When enabled, `defaultPolicy` determines baseline behavior:
 *   - `'universal'` (Allow by Default): applies to all rides unless a Rule WAIVEs it.
 *   - `'rule_only'` (Deny by Default): applies only when a Rule APPLY/OVERRIDEs it.
 *
 * Pre-v2 Firestore documents are normalized losslessly on read so live production
 * fares keep working seamlessly with zero downtime.
 */

import { doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import type {
  SurchargesConfig,
  SurchargeCatalogItem,
  SurchargeCalcMode,
  SurchargeDefaultPolicy,
} from '../../types/config';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';

const SURCHARGES_STORAGE_KEY = 'chesterfield_taxi_surcharges_config_v2';

export const BUILTIN_SURCHARGE_IDS = {
  FUEL: 'surcharge-fuel',
  PEAK_SURGE: 'surcharge-peak-surge',
  AIRPORT_ACCESS: 'surcharge-airport-access',
  REMOTE_AREA: 'surcharge-remote-area',
  SUV_MINIVAN_UPGRADE: 'surcharge-suv-minivan-fee',
} as const;

export const DEFAULT_SURCHARGE_ITEMS: SurchargeCatalogItem[] = [
  {
    id: BUILTIN_SURCHARGE_IDS.FUEL,
    name: 'Fuel / Gas Surcharge',
    description: 'Adjustable fuel offset applied per trip, per mile, or as a percentage of base fare.',
    enabled: false,
    defaultPolicy: 'universal',
    mode: 'flat',
    amount: 2.5,
    isBuiltIn: true,
  },
  {
    id: BUILTIN_SURCHARGE_IDS.PEAK_SURGE,
    name: 'Peak Demand Surge',
    description: 'Opt-in fare multiplier during high-demand weather or event windows.',
    enabled: false,
    defaultPolicy: 'universal',
    mode: 'multiplier',
    amount: 1.25,
    isBuiltIn: true,
  },
  {
    id: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS,
    name: 'Airport Commercial Access Fee',
    description: 'Airport commercial terminal pass-through access fee.',
    enabled: true,
    defaultPolicy: 'rule_only',
    mode: 'flat',
    amount: 4.0,
    isBuiltIn: true,
  },
  {
    id: BUILTIN_SURCHARGE_IDS.REMOTE_AREA,
    name: 'Out-of-Area Remote Service Fee',
    description: 'Extended pickup/dropoff radius surcharge outside standard metro coverage.',
    enabled: true,
    defaultPolicy: 'rule_only',
    mode: 'flat',
    amount: 15.0,
    isBuiltIn: true,
  },
  {
    id: BUILTIN_SURCHARGE_IDS.SUV_MINIVAN_UPGRADE,
    name: 'SUV / Minivan Upgrade Fee',
    description: 'Vehicle size & luggage capacity upgrade for SUV, Minivan, and WAV requests.',
    enabled: true,
    defaultPolicy: 'rule_only',
    mode: 'flat',
    amount: 10.0,
    isBuiltIn: false,
  },
];

export const DEFAULT_SURCHARGES_CONFIG: SurchargesConfig = {
  catalogVersion: 2,
  items: DEFAULT_SURCHARGE_ITEMS.map((item) => ({ ...item })),
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
  customSurcharges: [],
};

function sanitizeCalcMode(mode: unknown, fallback: SurchargeCalcMode = 'flat'): SurchargeCalcMode {
  if (mode === 'flat' || mode === 'per_mile' || mode === 'percent' || mode === 'multiplier') {
    return mode;
  }
  return fallback;
}

function sanitizePolicy(
  policy: unknown,
  fallback: SurchargeDefaultPolicy = 'rule_only'
): SurchargeDefaultPolicy {
  return policy === 'universal' || policy === 'rule_only' ? policy : fallback;
}

/**
 * Converts a pre-v2 SurchargesConfig document into a clean v2 `SurchargeCatalogItem[]`
 * list while preserving legacy auto-condition metadata for zero-downtime rollout.
 */
function buildItemsFromLegacy(raw: Partial<SurchargesConfig>): SurchargeCatalogItem[] {
  const airportFee =
    typeof raw.airportGateFee === 'number'
      ? raw.airportGateFee
      : typeof raw.airportCommercialGateFee === 'number'
      ? raw.airportCommercialGateFee
      : DEFAULT_SURCHARGES_CONFIG.airportGateFee;

  const remoteFee =
    typeof raw.outOfAreaRemoteFee === 'number'
      ? raw.outOfAreaRemoteFee
      : typeof raw.remoteServiceFlatFee === 'number'
      ? raw.remoteServiceFlatFee
      : DEFAULT_SURCHARGES_CONFIG.outOfAreaRemoteFee;

  const remoteThreshold =
    typeof raw.outOfAreaThresholdMiles === 'number'
      ? raw.outOfAreaThresholdMiles
      : typeof raw.remoteBoundaryDistanceMiles === 'number'
      ? raw.remoteBoundaryDistanceMiles
      : 15.0;

  const fuelAmount =
    typeof raw.fuelSurchargeAmount === 'number'
      ? raw.fuelSurchargeAmount
      : DEFAULT_SURCHARGES_CONFIG.fuelSurchargeAmount ?? 2.5;

  const peakMultiplier =
    typeof raw.peakSurgeMultiplier === 'number'
      ? raw.peakSurgeMultiplier
      : DEFAULT_SURCHARGES_CONFIG.peakSurgeMultiplier;

  const items: SurchargeCatalogItem[] = [
    {
      id: BUILTIN_SURCHARGE_IDS.FUEL,
      name: 'Fuel / Gas Surcharge',
      description: 'Adjustable fuel offset applied per trip, per mile, or as a percentage of base fare.',
      enabled: Boolean(raw.isFuelSurchargeActive),
      defaultPolicy: 'universal',
      mode: sanitizeCalcMode(raw.fuelSurchargeType, 'flat'),
      amount: fuelAmount,
      isBuiltIn: true,
    },
    {
      id: BUILTIN_SURCHARGE_IDS.PEAK_SURGE,
      name: 'Peak Demand Surge',
      description: 'Opt-in fare multiplier during high-demand weather or event windows.',
      enabled: Boolean(raw.isPeakSurgeActive),
      defaultPolicy: 'universal',
      mode: 'multiplier',
      amount: peakMultiplier,
      isBuiltIn: true,
    },
    {
      id: BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS,
      name: 'Airport Commercial Access Fee',
      description: 'Airport commercial terminal pass-through access fee.',
      enabled: airportFee > 0 && !raw.waiveAirportFee,
      defaultPolicy: 'rule_only',
      mode: 'flat',
      amount: airportFee,
      isBuiltIn: true,
      legacyAutoCondition: {
        kind: 'airport',
        airportZoneIds: raw.airportTargetZoneIds || ['zone-lambert-airport', 'zone-spirit-airport'],
      },
    },
    {
      id: BUILTIN_SURCHARGE_IDS.REMOTE_AREA,
      name: 'Out-of-Area Remote Service Fee',
      description: `Extended pickup/dropoff surcharge beyond ${remoteThreshold} mi regional boundary.`,
      enabled: remoteFee > 0 && !raw.waiveRemoteFee,
      defaultPolicy: 'rule_only',
      mode: 'flat',
      amount: remoteFee,
      isBuiltIn: true,
      legacyAutoCondition: {
        kind: 'remote_distance',
        remoteThresholdMiles: remoteThreshold,
      },
    },
  ];

  const legacyCustom = Array.isArray(raw.customSurcharges) ? raw.customSurcharges : [];
  for (const cs of legacyCustom) {
    if (!cs || !cs.id || items.some((existing) => existing.id === cs.id)) continue;
    const hasTriggers = Boolean(
      cs.triggers &&
        ((cs.triggers.vehicleTiers && cs.triggers.vehicleTiers.length > 0) ||
          (cs.triggers.vehicleTypes && cs.triggers.vehicleTypes.length > 0) ||
          (cs.triggers.zoneIds && cs.triggers.zoneIds.length > 0) ||
          (cs.triggers.daysOfWeek && cs.triggers.daysOfWeek.length > 0) ||
          cs.triggers.timeWindow ||
          cs.triggers.minDistanceMiles !== undefined ||
          cs.triggers.maxDistanceMiles !== undefined)
    );
    items.push({
      id: cs.id,
      name: cs.name,
      description: cs.description,
      enabled: cs.isActive !== false,
      defaultPolicy: hasTriggers ? 'rule_only' : 'universal',
      mode: sanitizeCalcMode(cs.type, 'flat'),
      amount: typeof cs.amount === 'number' ? cs.amount : 0,
      isBuiltIn: false,
      ...(hasTriggers
        ? {
            legacyAutoCondition: {
              kind: 'custom_triggers' as const,
              customTriggers: cs.triggers,
            },
          }
        : {}),
    });
  }

  return items;
}

/**
 * Returns the canonical v2 `SurchargeCatalogItem[]` array from any `SurchargesConfig`.
 */
export function getSurchargeCatalogItems(cfg?: Partial<SurchargesConfig> | null): SurchargeCatalogItem[] {
  if (!cfg) return DEFAULT_SURCHARGE_ITEMS.map((item) => ({ ...item }));
  if (Array.isArray(cfg.items) && cfg.items.length > 0) {
    return cfg.items.map((item) => ({
      ...item,
      enabled: Boolean(item.enabled),
      defaultPolicy: sanitizePolicy(item.defaultPolicy, 'rule_only'),
      mode: sanitizeCalcMode(item.mode, 'flat'),
      amount: typeof item.amount === 'number' && !isNaN(item.amount) ? item.amount : 0,
    }));
  }
  return buildItemsFromLegacy(cfg);
}

function normalizeSurchargesConfig(raw: Partial<SurchargesConfig>): SurchargesConfig {
  const isV2 = raw.catalogVersion === 2 && Array.isArray(raw.items) && raw.items.length > 0;
  const items: SurchargeCatalogItem[] = isV2
    ? raw.items!.map((item) => ({
        ...item,
        enabled: Boolean(item.enabled),
        defaultPolicy: sanitizePolicy(item.defaultPolicy, 'rule_only'),
        mode: sanitizeCalcMode(item.mode, 'flat'),
        amount: typeof item.amount === 'number' && !isNaN(item.amount) ? item.amount : 0,
      }))
    : buildItemsFromLegacy(raw);

  // Mirror built-in catalog items back to legacy flat fields for seamless read compatibility
  const fuelItem = items.find((i) => i.id === BUILTIN_SURCHARGE_IDS.FUEL);
  const surgeItem = items.find((i) => i.id === BUILTIN_SURCHARGE_IDS.PEAK_SURGE);
  const airportItem = items.find((i) => i.id === BUILTIN_SURCHARGE_IDS.AIRPORT_ACCESS);
  const remoteItem = items.find((i) => i.id === BUILTIN_SURCHARGE_IDS.REMOTE_AREA);

  const airportGateFee = airportItem
    ? airportItem.amount
    : typeof raw.airportGateFee === 'number'
    ? raw.airportGateFee
    : DEFAULT_SURCHARGES_CONFIG.airportGateFee;

  const outOfAreaRemoteFee = remoteItem
    ? remoteItem.amount
    : typeof raw.outOfAreaRemoteFee === 'number'
    ? raw.outOfAreaRemoteFee
    : DEFAULT_SURCHARGES_CONFIG.outOfAreaRemoteFee;

  const outOfAreaThresholdMiles =
    typeof raw.outOfAreaThresholdMiles === 'number'
      ? raw.outOfAreaThresholdMiles
      : typeof raw.remoteBoundaryDistanceMiles === 'number'
      ? raw.remoteBoundaryDistanceMiles
      : 15.0;

  const cancellationFeeWithinOneHour =
    typeof raw.cancellationFeeWithinOneHour === 'number'
      ? raw.cancellationFeeWithinOneHour
      : typeof raw.cancellationFee === 'number'
      ? raw.cancellationFee
      : DEFAULT_SURCHARGES_CONFIG.cancellationFeeWithinOneHour;

  return {
    ...DEFAULT_SURCHARGES_CONFIG,
    ...raw,
    catalogVersion: isV2 ? 2 : raw.catalogVersion,
    items,
    airportGateFee,
    airportCommercialGateFee: airportGateFee,
    outOfAreaRemoteFee,
    remoteServiceFlatFee: outOfAreaRemoteFee,
    outOfAreaThresholdMiles,
    remoteBoundaryDistanceMiles: outOfAreaThresholdMiles,
    cancellationFeeWithinOneHour,
    cancellationFee: cancellationFeeWithinOneHour,
    isPeakSurgeActive: surgeItem ? surgeItem.enabled : Boolean(raw.isPeakSurgeActive),
    peakSurgeMultiplier: surgeItem ? surgeItem.amount : raw.peakSurgeMultiplier ?? 1.25,
    isFuelSurchargeActive: fuelItem ? fuelItem.enabled : Boolean(raw.isFuelSurchargeActive),
    fuelSurchargeType:
      fuelItem && fuelItem.mode !== 'multiplier'
        ? fuelItem.mode
        : raw.fuelSurchargeType || 'flat',
    fuelSurchargeAmount: fuelItem ? fuelItem.amount : raw.fuelSurchargeAmount ?? 2.5,
    customSurcharges: Array.isArray(raw.customSurcharges) ? raw.customSurcharges : [],
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
      return { ...this.cache, items: this.cache.items ? this.cache.items.map((i) => ({ ...i })) : undefined };
    }
    if (typeof window === 'undefined') return DEFAULT_SURCHARGES_CONFIG;
    try {
      const raw = localStorage.getItem(SURCHARGES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (Array.isArray(parsed.items) || typeof parsed.airportGateFee === 'number')) {
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
    const normalized = normalizeSurchargesConfig({
      ...cfg,
      catalogVersion: 2,
      items: getSurchargeCatalogItems(cfg).map((item) => {
        // Strip legacyAutoCondition once admin explicitly saves v2 catalog
        const { legacyAutoCondition: _legacy, ...clean } = item;
        return clean;
      }),
    });
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

export type { SurchargesConfig, SurchargeCatalogItem };
