/**
 * Admin Configuration Service Implementation
 * 
 * Implements IAdminConfigService to manage the dynamic system configuration
 * stored in Firestore at `config/appSettings`.
 * 
 * Manages:
 * - company: name, phone, email, address
 * - branding: primaryColor, secondaryColor, logoUrl
 * - pricing: baseFare, perMileRate, airportFee, surgeMultiplier
 * - vehicles: array of editable vehicle tiers
 * 
 * Provides fallback to default configuration and localStorage when offline or unconfigured.
 */

import { doc, getDoc, setDoc, onSnapshot, type Firestore } from 'firebase/firestore';
import type {
  AppSettings,
  IAdminConfigService,
  VehicleTierConfig,
} from '../../types/config';
import type { PricingConfig } from '../pricing/types';
import { DEFAULT_PRICING_CONFIG } from '../pricing/rules';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  company: {
    name: COMPANY_CONFIG.name,
    phone: COMPANY_CONFIG.phone.dispatch,
    email: COMPANY_CONFIG.email.dispatch,
    address: COMPANY_CONFIG.address.formatted,
  },
  branding: {
    primaryColor: COMPANY_CONFIG.primaryColor || '#f59e0b', // Amber-500
    secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a', // Slate-900
    logoUrl: '',
    headingFont: COMPANY_CONFIG.headingFont || 'Inter',
    bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#f59e0b',
    btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#020617',
    btnSecondaryBg: COMPANY_CONFIG.btnSecondaryBg || '#0f172a',
    btnSecondaryText: COMPANY_CONFIG.btnSecondaryText || '#ffffff',
    btnBorderRadius: COMPANY_CONFIG.btnBorderRadius || '8px',
    navbarBg: COMPANY_CONFIG.navbarBg || '#0f172a',
    cardBg: COMPANY_CONFIG.cardBg || '#ffffff',
  },
  pricing: {
    baseFare: 5.00,
    perMileRate: 2.25,
    airportFee: 4.00,
    surgeMultiplier: 1.00,
    perMinuteRate: 0.35,
    minimumFare: 10.00,
    multiStopFee: 5.00,
    defaultTolls: 0,
    // Phase 19: Condition-Based & Incremental Rates
    flagDropIncludedMiles: 1.5,
    useStepIncrements: false,
    stepIncrementTiers: [
      { id: 'tier-1', name: 'Initial Distance (0-5 mi)', startMiles: 0, endMiles: 5, stepMiles: 0.1, ratePerStep: 0.35 },
      { id: 'tier-2', name: 'Intermediate (5-15 mi)', startMiles: 5, endMiles: 15, stepMiles: 0.1, ratePerStep: 0.25 },
      { id: 'tier-3', name: 'Long Range (15-30 mi)', startMiles: 15, endMiles: 30, stepMiles: 0.1, ratePerStep: 0.20 },
      { id: 'tier-4', name: 'Extended Regional (30+ mi)', startMiles: 30, endMiles: 999, stepMiles: 0.1, ratePerStep: 0.15 },
    ],
    delayRate: {
      stepSeconds: 90,
      ratePerStep: 0.60,
      gracePeriodMinutes: 5,
    },
    conditionSurcharges: {
      carSeatFeePerUnit: 5.00,
      passengerBaseAllowance: 2,
      extraPassengerFeePerHead: 3.00,
      vehicleTierSurcharges: {
        standard: { flat: 0, percent: 0 },
        premium: { flat: 15.00, percent: 0 },
        xl: { flat: 20.00, percent: 0 },
        wheelchair: { flat: 0, percent: 0 },
      },
      zoneSurcharges: {},
    },
  },
  vehicles: [
    {
      id: 'standard',
      name: 'Standard Sedan',
      baseMultiplier: 1.0,
      maxPassengers: 4,
      maxLuggage: 2,
      description: 'Comfortable full-size sedan for daily local commutes, errands, and regional trips.',
      badge: 'Popular',
      iconType: 'standard',
    },
    {
      id: 'premium',
      name: 'Premium Executive',
      baseMultiplier: 1.5,
      maxPassengers: 4,
      maxLuggage: 3,
      description: 'Luxury sedan offering executive comfort, quiet cabin, and refreshments for VIP travel.',
      badge: 'Executive',
      iconType: 'premium',
    },
    {
      id: 'xl',
      name: 'XL Minivan / SUV',
      baseMultiplier: 1.75,
      maxPassengers: 6,
      maxLuggage: 5,
      description: 'Spacious high-capacity vehicle designed for families, airport transfers, and group outings.',
      badge: 'Family',
      iconType: 'xl',
    },
    {
      id: 'wheelchair',
      name: 'Wheelchair Accessible (WAV)',
      baseMultiplier: 1.0,
      maxPassengers: 4,
      maxLuggage: 2,
      description: 'Equipped with certified motorized ramps, secure floor tie-downs, and trained drivers.',
      badge: 'Accessible',
      iconType: 'wheelchair',
    },
  ],
  fleet: [
    {
      id: 'fleet-101',
      unitNumber: 'Cab #101',
      vehicleTypeId: 'standard',
      make: 'Toyota',
      model: 'Camry Hybrid',
      year: 2023,
      color: 'Silver',
      licensePlate: 'MO-7TX91',
      vin: '4T1B11HK5PU120481',
      assignedDriverId: 'driver-101',
      assignedDriverName: 'Mike T.',
      insurancePolicy: 'ST-902348-COMM',
      insuranceExpiry: '2027-06-30',
      mileage: 48250,
      status: 'active',
      maintenanceHistory: [
        {
          id: 'm-1',
          date: '2026-08-15',
          description: 'Synthetic oil change & tire rotation',
          cost: 110,
          odometer: 45000,
          performedBy: 'Chesterfield Auto Care',
        },
      ],
    },
    {
      id: 'fleet-104',
      unitNumber: 'Cab #104',
      vehicleTypeId: 'xl',
      make: 'Chevrolet',
      model: 'Suburban LT',
      year: 2024,
      color: 'Midnight Black',
      licensePlate: 'MO-3FL88',
      vin: '1GNSCHK78RR194021',
      assignedDriverId: 'driver-104',
      assignedDriverName: 'Sarah K.',
      insurancePolicy: 'ST-902348-COMM',
      insuranceExpiry: '2027-06-30',
      mileage: 26800,
      status: 'active',
      maintenanceHistory: [
        {
          id: 'm-2',
          date: '2026-07-20',
          description: 'Brake inspection and cabin air filter',
          cost: 185,
          odometer: 25000,
          performedBy: 'Plaza Motors STL',
        },
      ],
    },
    {
      id: 'fleet-108',
      unitNumber: 'Cab #108',
      vehicleTypeId: 'xl',
      make: 'Ford',
      model: 'Transit 350 Passenger',
      year: 2022,
      color: 'White',
      licensePlate: 'MO-9VN12',
      vin: '1FTBR1Y80NKB28190',
      assignedDriverId: 'driver-108',
      assignedDriverName: 'David R.',
      insurancePolicy: 'ST-902348-COMM',
      insuranceExpiry: '2027-06-30',
      mileage: 72150,
      status: 'active',
      maintenanceHistory: [
        {
          id: 'm-3',
          date: '2026-06-10',
          description: 'Transmission fluid service & multi-point inspection',
          cost: 340,
          odometer: 70000,
          performedBy: 'Fleet Tech Midwest',
        },
      ],
    },
  ],
  publicFormVersion: COMPANY_CONFIG.publicFormVersion || 'v2',
};

const LOCAL_STORAGE_KEY = 'chesterfield_taxi_app_settings';

export class AdminConfigService implements IAdminConfigService {
  private db: Firestore | null = null;
  private cachedSettings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  private initialized = false;
  private isConfigured = false;
  private activeUnsubscribe: (() => void) | null = null;

  constructor() {
    this.isConfigured = isFirebaseConfigured();
    if (this.isConfigured) {
      try {
        this.db = getFirestoreDb();
      } catch (err) {
        console.warn('[AdminConfigService] Firestore init warning:', err);
      }
    }
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppSettings>;
          this.cachedSettings = this.mergeWithDefaults(parsed);
        }
      } catch (err) {
        console.warn('[AdminConfigService] Failed to read from localStorage:', err);
      }
    }
  }

  private saveToLocalStorage(settings: AppSettings): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      } catch (err) {
        console.warn('[AdminConfigService] Failed to write to localStorage:', err);
      }
    }
  }

  private mergeWithDefaults(incoming?: Partial<AppSettings> | null): AppSettings {
    if (!incoming) return { ...DEFAULT_APP_SETTINGS };

    return {
      company: {
        ...DEFAULT_APP_SETTINGS.company,
        ...(incoming.company || {}),
      },
      branding: {
        ...DEFAULT_APP_SETTINGS.branding,
        ...(incoming.branding || {}),
      },
      pricing: {
        ...DEFAULT_APP_SETTINGS.pricing,
        ...(incoming.pricing || {}),
      },
      vehicles: incoming.vehicles && incoming.vehicles.length > 0
        ? incoming.vehicles
        : DEFAULT_APP_SETTINGS.vehicles,
      publicFormVersion: incoming.publicFormVersion || DEFAULT_APP_SETTINGS.publicFormVersion || 'v2',
      updatedAt: incoming.updatedAt,
      updatedBy: incoming.updatedBy,
    };
  }

  public getCachedSettings(): AppSettings {
    return this.cachedSettings;
  }

  public async getSettings(): Promise<AppSettings> {
    if (!this.db || !this.isConfigured) {
      return this.cachedSettings;
    }

    try {
      const docRef = doc(this.db, 'config', 'appSettings');
      const snapshot = await getDoc(docRef);

      if (snapshot.exists()) {
        const data = snapshot.data() as Partial<AppSettings>;
        this.cachedSettings = this.mergeWithDefaults(data);
        this.saveToLocalStorage(this.cachedSettings);
      }
      this.initialized = true;
      return this.cachedSettings;
    } catch (err) {
      console.warn('[AdminConfigService] Error fetching from Firestore, using cache/defaults:', err);
      return this.cachedSettings;
    }
  }

  public async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const merged: AppSettings = {
      ...this.cachedSettings,
      ...updates,
      company: {
        ...this.cachedSettings.company,
        ...(updates.company || {}),
      },
      branding: {
        ...this.cachedSettings.branding,
        ...(updates.branding || {}),
      },
      pricing: {
        ...this.cachedSettings.pricing,
        ...(updates.pricing || {}),
      },
      vehicles: updates.vehicles || this.cachedSettings.vehicles,
      updatedAt: new Date().toISOString(),
    };

    this.cachedSettings = merged;
    this.saveToLocalStorage(merged);

    if (this.db && this.isConfigured) {
      try {
        const docRef = doc(this.db, 'config', 'appSettings');
        const sanitizedSettings = sanitizePayload(merged);
        await setDoc(docRef, sanitizedSettings, { merge: true });
      } catch (err) {
        console.error('[AdminConfigService] Failed to persist updates to Firestore:', err);
        throw err;
      }
    }

    return merged;
  }

  public subscribeToSettings(
    onUpdate: (settings: AppSettings) => void,
    onError?: (error: Error) => void
  ): () => void {
    // Send current cached value immediately
    onUpdate(this.cachedSettings);

    if (!this.db || !this.isConfigured) {
      return () => {};
    }

    try {
      const docRef = doc(this.db, 'config', 'appSettings');
      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as Partial<AppSettings>;
            this.cachedSettings = this.mergeWithDefaults(data);
            this.saveToLocalStorage(this.cachedSettings);
            onUpdate(this.cachedSettings);
          }
        },
        (err) => {
          console.warn('[AdminConfigService] onSnapshot error:', err);
          if (onError) onError(err);
        }
      );
      return unsubscribe;
    } catch (err) {
      console.warn('[AdminConfigService] Failed to establish snapshot listener:', err);
      return () => {};
    }
  }

  public async resetToDefaults(): Promise<AppSettings> {
    return this.updateSettings(DEFAULT_APP_SETTINGS);
  }

  /**
   * Translates current dynamic AppSettings into a PricingConfig object
   * for hydration into the Pricing Pipeline.
   */
  public toPricingConfig(settings: AppSettings = this.cachedSettings): PricingConfig {
    const vehicleMultipliers: Record<string, number> = {
      ...DEFAULT_PRICING_CONFIG.vehicleMultipliers,
    };

    for (const vehicle of settings.vehicles) {
      vehicleMultipliers[vehicle.id] = vehicle.baseMultiplier;
    }

    return {
      baseFare: settings.pricing.baseFare,
      perMileRate: settings.pricing.perMileRate,
      perMinuteRate: settings.pricing.perMinuteRate ?? DEFAULT_PRICING_CONFIG.perMinuteRate,
      minimumFare: settings.pricing.minimumFare ?? DEFAULT_PRICING_CONFIG.minimumFare,
      vehicleMultipliers,
      multiStopFee: settings.pricing.multiStopFee ?? DEFAULT_PRICING_CONFIG.multiStopFee,
      defaultTolls: settings.pricing.defaultTolls ?? 0,
      airportSurcharge: settings.pricing.airportFee,
      currency: 'USD',
      manualSurgeMultiplier: settings.pricing.surgeMultiplier,
    };
  }
}

let serviceInstance: AdminConfigService | null = null;

export function getAdminConfigService(): AdminConfigService {
  if (!serviceInstance) {
    serviceInstance = new AdminConfigService();
  }
  return serviceInstance;
}
