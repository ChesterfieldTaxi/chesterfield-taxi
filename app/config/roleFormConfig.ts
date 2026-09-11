/**
 * Centralized Role-Based Form Configuration Engine
 * 
 * Provides declarative configurations for the Master Booking Engine (`<BookingEngine />`).
 * Manages role-based form schemas (`customer`, `dispatcher`, `admin`), section ordering,
 * capability flags (recurring trips, price overrides, direct driver assignment, passenger lookup),
 * and dynamic runtime fallback synchronization with Firestore admin settings.
 */

export type BookingRole = 'customer' | 'dispatcher' | 'admin';

export type BookingSectionId =
  | 'passenger-lookup'
  | 'timing'
  | 'locations'
  | 'passengers-luggage'
  | 'vehicle-selection'
  | 'passenger-info'
  | 'ride-instructions'
  | 'recurring'
  | 'driver-assignment'
  | 'pricing-override'
  | 'payment';

export interface RoleCapabilities {
  canRecurringTrips: boolean;
  canPriceOverride: boolean;
  canDirectDriverAssign: boolean;
  canBypassPayment: boolean;
  hasPassengerLookup: boolean;
  showInternalNotes: boolean;
  requireTermsAcceptance: boolean;
}

export interface BookingSectionConfig {
  id: BookingSectionId;
  title: string;
  subtitle?: string;
  badge?: string;
  order: number;
  enabled: boolean;
}

export interface RoleBookingConfig {
  role: BookingRole;
  name: string;
  description: string;
  sectionOrder: BookingSectionId[];
  capabilities: RoleCapabilities;
  sections: Record<BookingSectionId, BookingSectionConfig>;
}

/**
 * Standard preset sections definition.
 */
const BASE_SECTIONS: Record<BookingSectionId, BookingSectionConfig> = {
  'passenger-lookup': {
    id: 'passenger-lookup',
    title: 'Passenger & Account Lookup',
    subtitle: 'Search phone or email to auto-fill passenger history and corporate accounts',
    badge: 'Dispatch Only',
    order: 0,
    enabled: true,
  },
  'timing': {
    id: 'timing',
    title: 'Pickup Time',
    subtitle: 'Choose immediate ASAP pickup or schedule in advance',
    order: 1,
    enabled: true,
  },
  'locations': {
    id: 'locations',
    title: 'Trip Details & Route',
    subtitle: 'Enter pickup, dropoff, and optional intermediate stops',
    order: 2,
    enabled: true,
  },
  'passengers-luggage': {
    id: 'passengers-luggage',
    title: 'Passengers & Luggage',
    subtitle: 'Specify party size and baggage count for vehicle fit',
    order: 3,
    enabled: true,
  },
  'vehicle-selection': {
    id: 'vehicle-selection',
    title: 'Select Vehicle Class',
    subtitle: 'Choose from our premium sedans, executive SUVs, or WAV accessible fleet',
    order: 4,
    enabled: true,
  },
  'passenger-info': {
    id: 'passenger-info',
    title: 'Passenger Contact Information',
    subtitle: 'Contact details for driver dispatch and trip confirmation notifications',
    order: 5,
    enabled: true,
  },
  'ride-instructions': {
    id: 'ride-instructions',
    title: 'Special Instructions & Driver Notes',
    subtitle: 'Gate codes, flight remarks, corporate billing codes, or special requests',
    order: 6,
    enabled: true,
  },
  'recurring': {
    id: 'recurring',
    title: 'Recurring Trip Schedule',
    subtitle: 'Generate repeating daily, weekly, or custom date-range bookings',
    badge: 'Batch Dispatch',
    order: 7,
    enabled: true,
  },
  'driver-assignment': {
    id: 'driver-assignment',
    title: 'Driver Assignment',
    subtitle: 'Broadcast to regional driver pool or assign directly to specific vehicle',
    badge: 'Operations',
    order: 8,
    enabled: true,
  },
  'pricing-override': {
    id: 'pricing-override',
    title: 'Fare & Price Overrides',
    subtitle: 'Adjust rate, add itemized adjustment notes, or grant courtesy discount',
    badge: 'Manager Override',
    order: 9,
    enabled: true,
  },
  'payment': {
    id: 'payment',
    title: 'Payment & Confirmation',
    subtitle: 'Select payment method, billing terms, and finalize booking',
    order: 10,
    enabled: true,
  },
};

/**
 * Customer Public Role Schema
 * Ordering: Timing -> Locations -> Passengers & Luggage -> Vehicle -> Contact & Instructions -> Payment
 */
export const CUSTOMER_ROLE_CONFIG: RoleBookingConfig = {
  role: 'customer',
  name: 'Public Customer Portal',
  description: 'Streamlined single-page booking portal designed for customer reservations.',
  sectionOrder: [
    'timing',
    'locations',
    'passengers-luggage',
    'vehicle-selection',
    'passenger-info',
    'payment',
  ],
  capabilities: {
    canRecurringTrips: false,
    canPriceOverride: false,
    canDirectDriverAssign: false,
    canBypassPayment: false,
    hasPassengerLookup: false,
    showInternalNotes: false,
    requireTermsAcceptance: true,
  },
  sections: {
    ...BASE_SECTIONS,
    'passenger-lookup': { ...BASE_SECTIONS['passenger-lookup'], enabled: false },
    'recurring': { ...BASE_SECTIONS['recurring'], enabled: false },
    'driver-assignment': { ...BASE_SECTIONS['driver-assignment'], enabled: false },
    'pricing-override': { ...BASE_SECTIONS['pricing-override'], enabled: false },
  },
};

/**
 * Dispatcher Console Role Schema
 * Ordering: Passenger Lookup first -> Timing -> Locations -> Passengers -> Vehicle -> Recurring -> Driver Assignment -> Pricing Override -> Instructions -> Payment
 */
export const DISPATCHER_ROLE_CONFIG: RoleBookingConfig = {
  role: 'dispatcher',
  name: 'Dispatcher Operator Console',
  description: 'Full-featured reservation engine for 24/7 dispatchers and telephone bookings.',
  sectionOrder: [
    'passenger-lookup',
    'timing',
    'locations',
    'passengers-luggage',
    'vehicle-selection',
    'recurring',
    'driver-assignment',
    'pricing-override',
    'ride-instructions',
    'payment',
  ],
  capabilities: {
    canRecurringTrips: true,
    canPriceOverride: true,
    canDirectDriverAssign: true,
    canBypassPayment: true,
    hasPassengerLookup: true,
    showInternalNotes: true,
    requireTermsAcceptance: false,
  },
  sections: {
    ...BASE_SECTIONS,
    'passenger-info': {
      ...BASE_SECTIONS['passenger-info'],
      subtitle: 'Auto-populated via passenger lookup or entered manually',
    },
  },
};

/**
 * Admin Console Role Schema
 * Inherits all dispatcher capabilities with unrestricted management overrides.
 */
export const ADMIN_ROLE_CONFIG: RoleBookingConfig = {
  ...DISPATCHER_ROLE_CONFIG,
  role: 'admin',
  name: 'Administrator Master Console',
  description: 'Unrestricted master reservation system with auditing and administrative controls.',
};

/**
 * Registry of default role form configs.
 */
export const DEFAULT_ROLE_FORM_CONFIGS: Record<BookingRole, RoleBookingConfig> = {
  customer: CUSTOMER_ROLE_CONFIG,
  dispatcher: DISPATCHER_ROLE_CONFIG,
  admin: ADMIN_ROLE_CONFIG,
};

/**
 * Resolves the configuration for a given role, applying any dynamic overrides.
 * Includes fallback logic to allow dynamic updates from Firestore admin settings.
 * 
 * @param role Target booking role ('customer' | 'dispatcher' | 'admin')
 * @param overrides Optional partial configuration overrides
 */
export function getRoleFormConfig(
  role: BookingRole = 'customer',
  overrides?: Partial<RoleBookingConfig>
): RoleBookingConfig {
  const baseConfig = DEFAULT_ROLE_FORM_CONFIGS[role] || CUSTOMER_ROLE_CONFIG;

  if (!overrides) {
    return { ...baseConfig };
  }

  return {
    ...baseConfig,
    ...overrides,
    capabilities: {
      ...baseConfig.capabilities,
      ...(overrides.capabilities || {}),
    },
    sections: {
      ...baseConfig.sections,
      ...(overrides.sections || {}),
    },
    sectionOrder: overrides.sectionOrder || baseConfig.sectionOrder,
  };
}
