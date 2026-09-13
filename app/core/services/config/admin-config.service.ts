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
  CustomerBookingConfig,
  CorporateAccountConfig,
  InvoiceRecord,
  SecurityControlsConfig,
  ConfigAuditEntry,
  IAdminConfigService,
  VehicleTierConfig,
} from '../../types/config';
import type { PricingConfig } from '../pricing/types';
import { DEFAULT_PRICING_CONFIG } from '../pricing/rules';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import { sanitizePayload } from '../firestore-sanitizer';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export const DEFAULT_CUSTOMER_BOOKING_CONFIG: CustomerBookingConfig = {
  allowMultiVehicle: false,
  maxVehiclesAllowed: 3,
  multiVehicleCallPhone: COMPANY_CONFIG.phone.dispatch,
  multiVehicleCallEmail: COMPANY_CONFIG.email.dispatch,
  multiVehicleCustomNote: '',
  allowImmediateAsap: true,
  minAdvanceNoticeMinutes: 30,
  maxAdvanceBookingDays: 90,
  asapSearchRadiusMiles: 25,
  requireFlightNumberForAirport: false,
  airportMeetAndGreetOptions: 'curbside',
  flightDelayGraceMinutes: 45,
  allowRoundTrip: true,
  roundTripDiscountPercent: 5,
  allowChildSafetySeats: true,
  carSeatRentalFeePerUnit: 10,
  maxChildSeatsAllowed: 4,
  freeCancellationWindowMinutes: 120,
  lateCancellationFeePercent: 25,
  noShowFeeAmount: 50,
  cardPreAuthThresholdAmount: 100,
  acceptedPaymentMethods: ['card', 'cash', 'account'],
  allowDriverNotes: true,
  allowPetRequest: true,
  allowWheelchairRequest: true,
  allowLuggageSpecialRequest: true,
  publicFormBanner: {
    enabled: false,
    text: '24/7 Airport & Regional Chauffeur Service across Greater St. Louis.',
    type: 'info',
  },
};

export const DEFAULT_CORPORATE_ACCOUNTS: CorporateAccountConfig[] = [
  {
    id: 'corp-001',
    companyName: 'Bayer Crop Science (St. Louis HQ)',
    accountNumber: 'CORP-BAY-902',
    billingCycle: 'net30',
    creditLimit: 15000,
    billingContactName: 'Laura Vance',
    billingContactEmail: 'laura.vance@bayer.example.com',
    billingContactPhone: '(314) 694-1000',
    discountPercent: 10,
    poRequired: true,
    isActive: true,
    authorizedBookers: ['laura.vance@bayer.example.com', 'traveldesk@bayer.example.com'],
    notes: 'Executive transfers and weekly guest airport shuttles.',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'corp-002',
    companyName: 'Mercy Hospital St. Louis - Patient Transport',
    accountNumber: 'CORP-MRC-441',
    billingCycle: 'net15',
    creditLimit: 8500,
    billingContactName: 'Marcus Bennett',
    billingContactEmail: 'transport.billing@mercy.example.com',
    billingContactPhone: '(314) 251-6000',
    discountPercent: 12,
    poRequired: false,
    isActive: true,
    authorizedBookers: ['transport.billing@mercy.example.com'],
    notes: 'Priority discharge and non-emergency wheelchair medical transport.',
    createdAt: '2026-02-01T10:30:00Z',
  },
  {
    id: 'corp-003',
    companyName: 'Drury Plaza Hotel Chesterfield Valley',
    accountNumber: 'CORP-DRY-108',
    billingCycle: 'net30',
    creditLimit: 5000,
    billingContactName: 'Front Desk Lead',
    billingContactEmail: 'guestservices.valley@druryhotels.example.com',
    billingContactPhone: '(636) 532-3300',
    discountPercent: 5,
    poRequired: false,
    isActive: true,
    authorizedBookers: ['guestservices.valley@druryhotels.example.com'],
    notes: 'Direct guest airport billing and local corporate transfers.',
    createdAt: '2026-03-10T14:15:00Z',
  },
];

export const DEFAULT_INVOICES: InvoiceRecord[] = [
  {
    id: 'inv-2026-001',
    invoiceNumber: 'INV-2026-0089',
    corporateAccountId: 'corp-001',
    customerName: 'Bayer Crop Science',
    customerEmail: 'laura.vance@bayer.example.com',
    tripIds: ['trip-8812', 'trip-8834', 'trip-8890'],
    totalAmount: 384.50,
    status: 'paid',
    issuedDate: '2026-08-31',
    dueDate: '2026-09-30',
    paidDate: '2026-09-08',
    lineItems: [
      { description: 'STL Lambert Airport Shuttle (3 transfers)', amount: 255.00 },
      { description: 'Chesterfield Valley to Downtown Chauffeur', amount: 129.50 },
    ],
    notes: 'Paid via Corporate Wire Transfer',
  },
  {
    id: 'inv-2026-002',
    invoiceNumber: 'INV-2026-0094',
    corporateAccountId: 'corp-002',
    customerName: 'Mercy Hospital St. Louis',
    customerEmail: 'transport.billing@mercy.example.com',
    tripIds: ['trip-9102', 'trip-9145'],
    totalAmount: 198.20,
    status: 'issued',
    issuedDate: '2026-09-05',
    dueDate: '2026-09-20',
    lineItems: [
      { description: 'WAV Accessible Patient Transport (2 runs)', amount: 198.20 },
    ],
    notes: 'Net-15 Direct Billing',
  },
];

export const DEFAULT_SECURITY_CONTROLS: SecurityControlsConfig = {
  sessionTimeoutMinutes: 60,
  require2FA: false,
  enableIpAllowlist: false,
  allowedIpRanges: ['192.168.1.0/24', '10.0.0.0/16'],
  maxFailedLoginAttempts: 5,
  passwordExpiryDays: 90,
  requireSpecialChars: true,
  auditLoggingEnabled: true,
};

export const DEFAULT_CONFIG_AUDIT_TRAIL: ConfigAuditEntry[] = [
  {
    id: 'aud-001',
    timestamp: '2026-09-13T12:00:00Z',
    operatorId: 'admin@chesterfieldtaxi.com',
    operatorEmail: 'admin@chesterfieldtaxi.com',
    tab: 'advanced',
    section: 'customer-form',
    action: 'Updated Public Customer Form: Activated Multi-Vehicle Dispatch Engine',
    ipAddress: '192.168.1.100',
    changes: {
      allowMultiVehicle: { before: false, after: true },
      maxVehiclesAllowed: { before: 1, after: 3 },
    },
  },
  {
    id: 'aud-002',
    timestamp: '2026-09-13T11:15:00Z',
    operatorId: 'admin@chesterfieldtaxi.com',
    operatorEmail: 'admin@chesterfieldtaxi.com',
    tab: 'rates',
    section: 'base-rates',
    action: 'Adjusted Flag Drop Base Rate to $5.00 and Mileage to $2.25/mi',
    ipAddress: '192.168.1.100',
    changes: {
      baseFare: { before: 4.50, after: 5.00 },
    },
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  company: {
    name: COMPANY_CONFIG.name,
    phone: COMPANY_CONFIG.phone.dispatch,
    email: COMPANY_CONFIG.email.dispatch,
    address: COMPANY_CONFIG.address.formatted,
  },
  branding: {
    primaryColor: COMPANY_CONFIG.primaryColor || '#2563eb', // Cobalt-600
    secondaryColor: COMPANY_CONFIG.secondaryColor || '#0f172a', // Slate-900
    logoUrl: '',
    headingFont: COMPANY_CONFIG.headingFont || 'Inter',
    bodyFont: COMPANY_CONFIG.bodyFont || 'Inter',
    headingColor: COMPANY_CONFIG.headingColor || '#0f172a',
    bodyTextColor: COMPANY_CONFIG.bodyTextColor || '#334155',
    mutedTextColor: COMPANY_CONFIG.mutedTextColor || '#64748b',
    btnPrimaryBg: COMPANY_CONFIG.btnPrimaryBg || '#2563eb',
    btnPrimaryText: COMPANY_CONFIG.btnPrimaryText || '#ffffff',
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
  customerBookingConfig: { ...DEFAULT_CUSTOMER_BOOKING_CONFIG },
  corporateAccounts: [...DEFAULT_CORPORATE_ACCOUNTS],
  invoices: [...DEFAULT_INVOICES],
  securityControls: { ...DEFAULT_SECURITY_CONTROLS },
  configAuditTrail: [...DEFAULT_CONFIG_AUDIT_TRAIL],
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
      fleet: incoming.fleet && incoming.fleet.length > 0
        ? incoming.fleet
        : DEFAULT_APP_SETTINGS.fleet,
      publicFormVersion: 'v2',
      customerBookingConfig: {
        ...DEFAULT_CUSTOMER_BOOKING_CONFIG,
        ...(incoming.customerBookingConfig || {}),
      },
      corporateAccounts: incoming.corporateAccounts && incoming.corporateAccounts.length > 0
        ? incoming.corporateAccounts
        : DEFAULT_APP_SETTINGS.corporateAccounts,
      invoices: incoming.invoices && incoming.invoices.length > 0
        ? incoming.invoices
        : DEFAULT_APP_SETTINGS.invoices,
      securityControls: {
        ...DEFAULT_SECURITY_CONTROLS,
        ...(incoming.securityControls || {}),
      },
      configAuditTrail: incoming.configAuditTrail && incoming.configAuditTrail.length > 0
        ? incoming.configAuditTrail
        : DEFAULT_APP_SETTINGS.configAuditTrail,
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
    // Generate an automatic audit entry if audit logging is enabled
    const auditEnabled = updates.securityControls?.auditLoggingEnabled ?? this.cachedSettings.securityControls?.auditLoggingEnabled ?? true;
    let updatedAuditTrail = updates.configAuditTrail || this.cachedSettings.configAuditTrail || [...DEFAULT_CONFIG_AUDIT_TRAIL];

    if (auditEnabled && !updates.configAuditTrail) {
      const auditEntry: ConfigAuditEntry = {
        id: `aud-${Date.now().toString(36)}`,
        timestamp: new Date().toISOString(),
        operatorId: updates.updatedBy || 'admin@chesterfieldtaxi.com',
        operatorEmail: updates.updatedBy || 'admin@chesterfieldtaxi.com',
        tab: 'system',
        section: 'config-update',
        action: 'Admin Console settings updated',
        ipAddress: '192.168.1.100',
      };
      updatedAuditTrail = [auditEntry, ...updatedAuditTrail].slice(0, 100);
    }

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
      customerBookingConfig: updates.customerBookingConfig
        ? {
            ...(this.cachedSettings.customerBookingConfig || DEFAULT_CUSTOMER_BOOKING_CONFIG),
            ...updates.customerBookingConfig,
          }
        : (this.cachedSettings.customerBookingConfig || DEFAULT_CUSTOMER_BOOKING_CONFIG),
      corporateAccounts: updates.corporateAccounts || this.cachedSettings.corporateAccounts,
      invoices: updates.invoices || this.cachedSettings.invoices,
      securityControls: updates.securityControls
        ? {
            ...(this.cachedSettings.securityControls || DEFAULT_SECURITY_CONTROLS),
            ...updates.securityControls,
          }
        : (this.cachedSettings.securityControls || DEFAULT_SECURITY_CONTROLS),
      configAuditTrail: updatedAuditTrail,
      vehicles: updates.vehicles || this.cachedSettings.vehicles,
      fleet: updates.fleet || this.cachedSettings.fleet,
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
      flagDropIncludedMiles: settings.pricing.flagDropIncludedMiles,
      useStepIncrements: settings.pricing.useStepIncrements,
      stepIncrementTiers: settings.pricing.stepIncrementTiers,
      delayRate: settings.pricing.delayRate,
      conditionSurcharges: settings.pricing.conditionSurcharges,
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
