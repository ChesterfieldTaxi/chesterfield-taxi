/**
 * Pure Canned SMS Templates, Unified Caller/Thread CRM Context & Multi-Channel
 * Thread Grouping Service (`comms-templates.service.ts`)
 *
 * Strictly adheres to `constitution.md`:
 * - Pure / client-safe domain module: ZERO `*.server.ts` or `node:*` imports.
 * - Config-driven `CANNED_DISPATCH_SMS_TEMPLATES` + `interpolateCommsSmsTemplate`
 *   with STL Terminal 1 Exit Door 6 / Terminal 2 Exit Door 12 / SUS FBO curbside
 *   intelligence (`resolveStlTerminalInfo`) and zero leftover `{...}` placeholders.
 * - Pure `resolveCommsCrmContext` powering live CRM context across
 *   `SmsThreadPane` and `SoftphoneDialerPane` (live dialpad + active/ringing calls).
 * - Pure multi-channel thread list grouping & `All` tab filtering across
 *   `Calls + SMS + Voicemails + Emails + Internal Notes`.
 */

import type {
  ChannelFilter,
  ContactFilter,
  InteractionEvent,
  MultiChannelKey,
  MultiContactKey,
} from '../../../components/domain/dispatch/comms/comms-types';
import {
  detectAirportInAddresses,
  resolveStlTerminalInfo,
  type TerminalPickupLocations,
} from '../../config/airports';
import { getAdminConfigService } from '../config/admin-config.service';
import {
  normalizeCannedSmsTemplates,
  type AppSettings,
  type CannedSmsTemplateCategory,
} from '../../types/config';
import type {
  CommsChannel,
  CommsContactType,
  CommsThread,
  CommsUnreadByChannel,
} from '../../types/comms';
import type { DispatchEmailDeliveryStatus } from '../../types/dispatch-email';
import type { DriverProfile } from '../../types/driver';
import type { Trip, TripStatus } from '../../types/trip';
import { formatDisplayPhone } from '../../utils/phone';
import {
  collectContactEmailsNormalized,
  collectContactPhonesE164,
  getContactService,
  normalizeEmail,
  normalizePhone,
  normalizePhoneE164,
  resolveCanonicalThreadId,
  type ContactRecord,
} from '../customer/contact.service';
import {
  buildPopulateRebookPayloadFromTrip,
  buildTripTrackingUrl,
  isActiveOrUpcomingTripStatus,
} from '../email/dispatch-email.service';
import {
  extractTripFlightCredentials,
  resolveTripFlightBadge,
  type TripFlightBadgeDescriptor,
} from '../flight/flight-status.service';
export { resolveTripFlightBadge, type TripFlightBadgeDescriptor };
import { getPayLinkService } from '../payments/pay-link.service';
import type { WorkspaceEventMap } from '../workspace-bus.service';
import { getCommsThreadService } from './comms-thread.service';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Config-Driven UI Descriptors (Channel Filters, Channel Badges, Email Pills)
// ─────────────────────────────────────────────────────────────────────────────

export const COMMS_ALL_CHANNEL_FILTER_OPTIONS: ReadonlyArray<{
  value: ChannelFilter;
  label: string;
}> = [
  { value: 'all', label: 'All channels' },
  { value: 'calls', label: 'Calls Only' },
  { value: 'voicemail', label: 'Voicemail Only' },
  { value: 'messages', label: 'Messaging Only' },
  { value: 'emails', label: 'Emails Only' },
  { value: 'notes', label: 'Internal Notes' },
] as const;

export interface CommsChannelBadgeConfig {
  channel: CommsChannel;
  label: string;
  shortLabel: string;
  tone: 'blue' | 'emerald' | 'amber' | 'indigo' | 'slate';
}

export const COMMS_CHANNEL_BADGE_CONFIG: Record<CommsChannel, CommsChannelBadgeConfig> = {
  sms: { channel: 'sms', label: 'SMS', shortLabel: 'SMS', tone: 'blue' },
  call: { channel: 'call', label: 'Call', shortLabel: 'Call', tone: 'emerald' },
  voicemail: { channel: 'voicemail', label: 'Voicemail', shortLabel: 'VM', tone: 'amber' },
  email: { channel: 'email', label: 'Email', shortLabel: 'Email', tone: 'indigo' },
  note: { channel: 'note', label: 'Internal Note', shortLabel: 'Note', tone: 'slate' },
};

export const COMMS_ORDERED_CHANNELS: readonly CommsChannel[] = [
  'sms',
  'call',
  'voicemail',
  'email',
  'note',
] as const;

export interface CommsEmailDeliveryPillDescriptor {
  status: DispatchEmailDeliveryStatus | string;
  label: string;
  tone: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
  isWarning: boolean;
}

export function resolveCommsEmailDeliveryBadge(
  deliveryStatus?: string | null,
  direction: 'inbound' | 'outbound' = 'inbound'
): CommsEmailDeliveryPillDescriptor {
  const norm = (deliveryStatus || (direction === 'inbound' ? 'received' : 'sent'))
    .trim()
    .toLowerCase();

  switch (norm) {
    case 'delivered':
      return { status: 'delivered', label: 'Delivered', tone: 'emerald', isWarning: false };
    case 'sent':
      return { status: 'sent', label: 'Sent', tone: 'blue', isWarning: false };
    case 'queued':
      return { status: 'queued', label: 'Queued', tone: 'slate', isWarning: false };
    case 'delayed':
      return { status: 'delayed', label: 'Delayed', tone: 'amber', isWarning: true };
    case 'simulated':
      return { status: 'simulated', label: 'Simulated', tone: 'amber', isWarning: false };
    case 'bounced':
      return { status: 'bounced', label: 'Bounced', tone: 'rose', isWarning: true };
    case 'complained':
      return { status: 'complained', label: 'Spam Report', tone: 'rose', isWarning: true };
    case 'failed':
      return { status: 'failed', label: 'Failed', tone: 'rose', isWarning: true };
    case 'received':
    default:
      return {
        status: norm || 'received',
        label: direction === 'outbound' ? 'Sent' : 'Received',
        tone: direction === 'outbound' ? 'blue' : 'slate',
        isWarning: false,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Config-Driven Canned SMS Templates & Pure Variable Interpolation
// ─────────────────────────────────────────────────────────────────────────────

export type CannedDispatchSmsTemplateId =
  | 'driver_en_route'
  | 'driver_arrived'
  | 'airport_curbside'
  | 'reservation_confirmed'
  | 'payment_link'
  | 'flight_checkin';

export interface CommsSmsTemplateContext {
  firstName?: string;
  passengerName?: string;
  tripId?: string;
  pickupTime?: string;
  pickupShort?: string;
  dropoffShort?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  driverName?: string;
  carUnit?: string;
  trackingUrl?: string;
  payUrl?: string;
  airlineCode?: string;
  airportCode?: string;
  airlineOrAirportHint?: string;
}

export interface CannedDispatchSmsTemplate {
  id: CannedDispatchSmsTemplateId;
  label: string;
  shortLabel: string;
  description: string;
  bodyTemplate: string;
}

export const CANNED_DISPATCH_SMS_TEMPLATES: readonly CannedDispatchSmsTemplate[] = [
  {
    id: 'driver_en_route',
    label: 'Driver En Route + Live Tracking',
    shortLabel: 'Driver En Route',
    description: 'Notifies passenger that their driver & Car # are en route with ETA/pickup time and live tracking link.',
    bodyTemplate:
      'Hi {firstName}, {driverName} in {carUnit} is en route for your {pickupTime} pickup at {pickupShort}. Live tracking: {trackingUrl}',
  },
  {
    id: 'driver_arrived',
    label: 'Driver Arrived Curbside',
    shortLabel: 'Driver Arrived',
    description: 'Notifies passenger that their assigned Car # is waiting curbside with live tracking link.',
    bodyTemplate:
      'Hi {firstName}, {driverName} has arrived curbside in {carUnit} at {pickupShort}. View vehicle & contact dispatch: {trackingUrl}',
  },
  {
    id: 'airport_curbside',
    label: 'STL / SUS Airport Curbside Instructions',
    shortLabel: 'STL / SUS Curbside',
    description: 'Sends STL Terminal 1 Exit Door 6, Terminal 2 Exit Door 12, or SUS FBO meeting instructions + tracking link.',
    bodyTemplate:
      'Hi {firstName}, Chesterfield Taxi airport pickup ({tripId}): {airportCurbsideGuidance}. Live tracking: {trackingUrl}',
  },
  {
    id: 'reservation_confirmed',
    label: 'Reservation Confirmed',
    shortLabel: 'Confirmed',
    description: 'Confirms scheduled reservation reference, pickup time, route, and tracking link.',
    bodyTemplate:
      'Hi {firstName}, your Chesterfield Taxi reservation ({tripId}) for {pickupTime} from {pickupShort} to {dropoffShort} is confirmed. Track live: {trackingUrl}',
  },
  {
    id: 'payment_link',
    label: '1-Tap Secure Payment Link',
    shortLabel: '1-Tap Pay Link',
    description: 'Sends tokenized Stripe 1-tap payment link (/pay/...) for Apple Pay, Google Pay, or card.',
    bodyTemplate:
      'Hi {firstName}, complete secure 1-tap payment for your Chesterfield Taxi ride ({tripId}) via Apple Pay, Google Pay, or card: {payUrl}',
  },
  {
    id: 'flight_checkin',
    label: 'Flight Arrival Luggage Check-In',
    shortLabel: 'Flight Check-In',
    description: 'Friendly arrival check-in asking passenger to text once luggage is collected so driver pulls curbside.',
    bodyTemplate:
      'Hi {firstName}! Welcome in — please text us here once you have collected your luggage at {pickupShort} so {driverName} ({carUnit}) can pull right up to the curb.',
  },
] as const;

const CANNED_SMS_TEMPLATE_MAP = new Map<string, CannedDispatchSmsTemplate>(
  CANNED_DISPATCH_SMS_TEMPLATES.map((tpl) => [tpl.id, tpl])
);

/**
 * Formats a raw cab/unit identifier (`"104"`, `"#104"`, `"Car 104"`, `"Car #104"`)
 * into canonical `"Car #104"` without double-prefixing.
 */
export function formatCommsCarUnit(rawUnit?: string | null): string | undefined {
  const trimmed = (rawUnit || '').trim();
  if (!trimmed) return undefined;
  const stripped = trimmed.replace(/^car\s*#?\s*/i, '').replace(/^#/, '').trim();
  if (!stripped) return undefined;
  return `Car #${stripped}`;
}

/**
 * Produces a concise SMS-friendly location label (e.g. `"14848 Conway Rd, Chesterfield, MO"` -> `"14848 Conway Rd"`).
 */
export function shortenCommsAddress(
  rawAddress?: string | null,
  fallback: string = 'your pickup location'
): string {
  const trimmed = (rawAddress || '').trim();
  if (!trimmed) return fallback;
  const firstSegment = trimmed.split(',')[0]?.trim() || trimmed;
  if (firstSegment.length <= 44) return firstSegment;
  return `${firstSegment.slice(0, 41).trimEnd()}...`;
}

/**
 * Pure regional STL / SUS / CPS curbside meeting instruction builder powered by `resolveStlTerminalInfo`.
 * Distinguishes STL Terminal 1 Exit Door 6, STL Terminal 2 Exit Door 12, and SUS / CPS FBO coordination.
 */
export function resolveAirportCurbsideSmsGuidance(input: {
  airlineCode?: string;
  airportCode?: string;
  airlineOrAirportHint?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  carUnit?: string;
  pickupConfig?: TerminalPickupLocations | null;
}): string {
  const formattedCar = formatCommsCarUnit(input.carUnit) || 'your assigned vehicle';
  const pickupAddr = (input.pickupAddress || '').trim();
  const dropoffAddr = (input.dropoffAddress || '').trim();
  const detection = detectAirportInAddresses(pickupAddr, dropoffAddr);

  const effectiveAirportCode =
    (input.airportCode || '').trim().toUpperCase() ||
    detection.airport?.iataCode ||
    undefined;

  const combinedHint =
    (input.airlineCode || '').trim() ||
    (input.airlineOrAirportHint || '').trim() ||
    pickupAddr ||
    dropoffAddr;

  const effectivePickupConfig =
    input.pickupConfig ?? getAdminConfigService().getCachedSettings().customerBookingConfig;
  const termInfo = resolveStlTerminalInfo(combinedHint, effectiveAirportCode, effectivePickupConfig);

  if (termInfo.airportCode === 'SUS') {
    return `Meet ${formattedCar} at SUS FBO (${termInfo.pickupDoorGuidance})`;
  }
  if (termInfo.airportCode === 'CPS') {
    return `Meet ${formattedCar} at CPS FBO (${termInfo.pickupDoorGuidance})`;
  }
  if (termInfo.terminal === 'Terminal 2') {
    return `Proceed to Lower Level Baggage Claim and meet ${formattedCar} outside STL ${termInfo.pickupDoorGuidance}`;
  }
  if (termInfo.terminal === 'Terminal 1') {
    return `Proceed to Lower Level Baggage Claim and meet ${formattedCar} outside STL ${termInfo.pickupDoorGuidance}`;
  }

  return `Meet ${formattedCar} outside Baggage Claim — ${termInfo.pickupDoorGuidance}`;
}

function resolveSmsTemplateVariableMap(
  context: CommsSmsTemplateContext = {}
): Record<string, string> {
  const cleanPassenger = (context.passengerName || '').trim();
  const cleanFirstInput = (context.firstName || '').trim();
  const derivedFirst =
    cleanFirstInput ||
    (cleanPassenger ? cleanPassenger.split(/\s+/)[0] : '') ||
    'there';
  const effectivePassenger =
    cleanPassenger || (cleanFirstInput ? cleanFirstInput : 'Valued Passenger');

  const formattedCar = formatCommsCarUnit(context.carUnit) || 'your assigned vehicle';
  const effectiveDriver =
    (context.driverName || '').trim() || 'your Chesterfield Taxi driver';

  const rawPickupShort =
    (context.pickupShort || '').trim() ||
    shortenCommsAddress(context.pickupAddress, 'your pickup location');
  const rawDropoffShort =
    (context.dropoffShort || '').trim() ||
    shortenCommsAddress(context.dropoffAddress, 'your destination');

  const airportCurbsideGuidance = resolveAirportCurbsideSmsGuidance({
    airlineCode: context.airlineCode,
    airportCode: context.airportCode,
    airlineOrAirportHint:
      context.airlineOrAirportHint || context.pickupAddress || context.pickupShort,
    pickupAddress: context.pickupAddress || context.pickupShort,
    dropoffAddress: context.dropoffAddress || context.dropoffShort,
    carUnit: formattedCar,
  });

  return {
    firstName: derivedFirst,
    passengerFirstName: derivedFirst,
    passengerName: effectivePassenger,
    tripId: (context.tripId || '').trim() || 'your reservation',
    pickupTime: (context.pickupTime || '').trim() || 'your scheduled pickup time',
    pickupShort: rawPickupShort,
    dropoffShort: rawDropoffShort,
    pickupAddress: (context.pickupAddress || '').trim() || rawPickupShort,
    dropoffAddress: (context.dropoffAddress || '').trim() || rawDropoffShort,
    driverName: effectiveDriver,
    carUnit: formattedCar,
    trackingUrl:
      (context.trackingUrl || '').trim() || 'https://chesterfieldtaxi.com/booking/lookup',
    payUrl: (context.payUrl || '').trim() || 'https://chesterfieldtaxi.com/pay',
    airportCurbsideGuidance,
    pickupDoor: airportCurbsideGuidance,
  };
}

/**
 * Pure variable interpolation engine for Chesterfield Taxi Canned SMS Templates.
 * Accepts a `CannedDispatchSmsTemplate` object, a template ID (`'driver_en_route'`, etc.),
 * or a raw template string containing `{...}` placeholders.
 * Guarantees ZERO raw `{...}` placeholders ever remain even when optional fields are missing.
 */
export function interpolateCommsSmsTemplate(
  template: CannedDispatchSmsTemplate | CannedDispatchSmsTemplateId | string,
  context: CommsSmsTemplateContext = {}
): string {
  const vars = resolveSmsTemplateVariableMap(context);
  const rawBody =
    typeof template === 'string'
      ? CANNED_SMS_TEMPLATE_MAP.get(template)?.bodyTemplate ?? template
      : template.bodyTemplate;

  if (!rawBody) return '';

  const replaced = rawBody.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, tokenName: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, tokenName)) {
      return vars[tokenName];
    }
    return '';
  });

  // Clean up any leftover empty braces or collapsed double spaces
  return replaced
    .replace(/\{[^}]*\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

export interface ResolvedCannedSmsTemplate {
  id: string;
  label: string;
  shortLabel: string;
  category: CannedSmsTemplateCategory;
  description: string;
  bodyTemplate: string;
  enabled: boolean;
  isBuiltIn: boolean;
}

const BUILT_IN_SMS_CATEGORIES: Record<CannedDispatchSmsTemplateId, CannedSmsTemplateCategory> = {
  driver_en_route: 'dispatch',
  driver_arrived: 'arrival',
  airport_curbside: 'airport',
  reservation_confirmed: 'dispatch',
  payment_link: 'billing',
  flight_checkin: 'airport',
};

/**
 * Resolves built-in + custom Canned SMS templates merged with `settings.integrations.cannedSmsTemplates`.
 * Excludes disabled templates by default (`includeDisabled: false`).
 */
export function getResolvedCannedSmsTemplates(
  settings?: Partial<AppSettings> | null,
  options?: { includeDisabled?: boolean }
): ResolvedCannedSmsTemplate[] {
  const cfg = normalizeCannedSmsTemplates(settings?.integrations?.cannedSmsTemplates);
  const includeDisabled = Boolean(options?.includeDisabled);

  const builtInResolved: ResolvedCannedSmsTemplate[] = CANNED_DISPATCH_SMS_TEMPLATES.map((tpl) => {
    const ov = cfg.builtInOverrides[tpl.id];
    return {
      id: tpl.id,
      label: ov?.label?.trim() || tpl.label,
      shortLabel: ov?.shortLabel?.trim() || tpl.shortLabel,
      category: BUILT_IN_SMS_CATEGORIES[tpl.id] || 'dispatch',
      description: tpl.description,
      bodyTemplate: ov?.bodyTemplate?.trim() || tpl.bodyTemplate,
      enabled: ov?.enabled !== false,
      isBuiltIn: true,
    };
  });

  const customResolved: ResolvedCannedSmsTemplate[] = cfg.customTemplates.map((custom) => ({
    id: custom.id,
    label: custom.label,
    shortLabel: custom.shortLabel?.trim() || custom.label.slice(0, 28),
    category: custom.category,
    description: custom.description || 'Custom dispatch SMS template',
    bodyTemplate: custom.bodyTemplate,
    enabled: custom.enabled,
    isBuiltIn: false,
  }));

  const combined = [...builtInResolved, ...customResolved];
  return includeDisabled ? combined : combined.filter((item) => item.enabled);
}

export function getCannedDispatchSmsTemplateById(
  id: CannedDispatchSmsTemplateId | string,
  settings?: Partial<AppSettings> | null
): CannedDispatchSmsTemplate | ResolvedCannedSmsTemplate | undefined {
  if (settings) {
    return getResolvedCannedSmsTemplates(settings, { includeDisabled: true }).find(
      (t) => t.id === id
    );
  }
  return CANNED_SMS_TEMPLATE_MAP.get(id);
}

export interface InterpolatedCommsSmsChip {
  id: CannedDispatchSmsTemplateId | string;
  label: string;
  shortLabel: string;
  description: string;
  text: string;
}

export function buildInterpolatedCommsSmsChips(
  context?: CommsSmsTemplateContext | null,
  settings?: Partial<AppSettings> | null
): InterpolatedCommsSmsChip[] {
  const safeCtx = context || {};
  const templates = getResolvedCannedSmsTemplates(settings, { includeDisabled: false });
  return templates.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    shortLabel: tpl.shortLabel,
    description: tpl.description,
    text: interpolateCommsSmsTemplate({ bodyTemplate: tpl.bodyTemplate } as any, safeCtx),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pure Unified Caller / Thread CRM Context Resolver (`resolveCommsCrmContext`)
// ─────────────────────────────────────────────────────────────────────────────

const TRIP_STATUS_LABELS: Record<
  string,
  { label: string; tone: 'emerald' | 'blue' | 'amber' | 'indigo' | 'slate'; priority: number }
> = {
  in_progress: { label: 'In Progress', tone: 'emerald', priority: 1 },
  arrived: { label: 'Driver Arrived', tone: 'emerald', priority: 2 },
  en_route: { label: 'Driver En Route', tone: 'blue', priority: 3 },
  accepted: { label: 'Driver Accepted', tone: 'blue', priority: 4 },
  assigned: { label: 'Driver Assigned', tone: 'blue', priority: 5 },
  offered: { label: 'Driver Offered', tone: 'amber', priority: 6 },
  pending: { label: 'Pending Dispatch', tone: 'amber', priority: 7 },
  CONFIRMED: { label: 'Confirmed', tone: 'indigo', priority: 8 },
  confirmed: { label: 'Confirmed', tone: 'indigo', priority: 8 },
  UNCONFIRMED: { label: 'Unconfirmed', tone: 'amber', priority: 9 },
  unconfirmed: { label: 'Unconfirmed', tone: 'amber', priority: 9 },
  completed: { label: 'Completed', tone: 'slate', priority: 20 },
  cancelled: { label: 'Cancelled', tone: 'slate', priority: 30 },
  DECLINED: { label: 'Declined', tone: 'slate', priority: 31 },
  declined: { label: 'Declined', tone: 'slate', priority: 31 },
};

const VEHICLE_TIER_LABELS: Record<string, string> = {
  standard: 'Standard Sedan',
  premium: 'Executive Sedan',
  executive: 'Executive Sedan',
  xl: 'SUV / XL Van',
  suv: 'SUV / XL',
  van: 'Passenger Van',
  wheelchair: 'Wheelchair WAV',
};

export interface CommsActiveTripSummary {
  trip: Trip;
  tripId: string;
  status: TripStatus;
  statusLabel: string;
  statusTone: 'emerald' | 'blue' | 'amber' | 'indigo' | 'slate';
  pickupTimeLabel: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupShort: string;
  dropoffShort: string;
  assignedDriverId: string | null;
  driverName?: string;
  carUnit?: string;
  driverPhone?: string;
  isAirportTrip: boolean;
  flightBadge?: TripFlightBadgeDescriptor;
  trackingUrl: string;
  cachedPayToken?: string;
  payUrl?: string;
  payLinkState: 'paid' | 'open' | 'refunded' | 'none';
  totalFare: number;
}

export interface CommsCrmContextSummary {
  hasKnownContext: boolean;
  isKnownContact: boolean;
  isDriver: boolean;
  driverUnit?: string;
  contactId?: string;
  threadId?: string;
  contactName: string;
  firstName: string;
  primaryPhone?: string;
  displayPhone?: string;
  primaryEmail?: string;
  isVip: boolean;
  vipReason?: string;
  isBlacklisted: boolean;
  blacklistReason?: string;
  corporateAccountId?: string;
  corporateAccountName?: string;
  corporateAccountNumber?: string;
  preferredVehicleTier?: string;
  preferredVehicleLabel?: string;
  accessibilityBadges: string[];
  tripCount: number;
  customerScore?: number;
  internalNotes?: string;
  activeTrips: CommsActiveTripSummary[];
  lastCompletedTrip: Trip | null;
  rebookPayload: WorkspaceEventMap['POPULATE_BOOKING'] | null;
  primaryMatchedTrip: Trip | null;
  templateContext: CommsSmsTemplateContext;
}

export interface ResolveCommsCrmContextInput {
  phone?: string | null;
  email?: string | null;
  threadId?: string | null;
  contactNameHint?: string | null;
  contact?: ContactRecord | null;
  thread?: CommsThread | null;
  trips?: Trip[];
  drivers?: Array<
    Partial<DriverProfile> & {
      id: string;
      name?: string;
      cabNumber?: string;
      vehicleUnit?: string;
      phone?: string;
    }
  >;
  originOverride?: string;
}

function formatTripPickupTimeForComms(trip: Trip): string {
  if (!trip.scheduledPickupTime || trip.bookingType === 'asap') {
    return trip.bookingType === 'asap' && !trip.scheduledPickupTime ? 'ASAP' : 'Scheduled';
  }
  const parsed = new Date(trip.scheduledPickupTime);
  if (Number.isNaN(parsed.getTime())) {
    return trip.scheduledPickupTime;
  }
  return parsed.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function buildAccessibilityBadges(
  contact?: ContactRecord | null,
  fallbackTrips: Trip[] = []
): string[] {
  const badges: string[] = [];
  const addUnique = (label: string) => {
    if (!badges.includes(label)) badges.push(label);
  };

  const needs = contact?.accessibilityNeeds;
  if (needs?.wheelchair || contact?.preferredVehicleTier === 'wheelchair') {
    addUnique('Wheelchair WAV');
  }
  if (needs?.walker) {
    addUnique('Folding Walker');
  }
  if (needs?.serviceAnimal) {
    addUnique('Service Animal');
  }
  if (needs?.extraAssistance) {
    addUnique('Extra Assistance');
  }

  if (badges.length === 0) {
    const hasWavTrip = fallbackTrips.some((t) => t.vehicleTier === 'wheelchair');
    if (hasWavTrip) addUnique('Wheelchair WAV');
  }

  return badges;
}

/**
 * Pure Unified Caller / Thread CRM Context Resolver.
 * Computes contact governance/CRM flags, matched `activeTrips` (driver `Car #`, flight delay badge,
 * tracking & pay URLs), `lastCompletedTrip` + `rebookPayload`, and dynamic SMS `templateContext`.
 */
export function resolveCommsCrmContext(
  input: ResolveCommsCrmContextInput
): CommsCrmContextSummary {
  const trips = Array.isArray(input.trips) ? input.trips : [];
  const drivers = Array.isArray(input.drivers) ? input.drivers : [];

  const rawPhone = (input.phone || '').trim();
  const rawPhoneDigits = normalizePhone(rawPhone);
  const validInputPhoneE164 = rawPhoneDigits.length >= 7 ? normalizePhoneE164(rawPhone) : '';
  const validInputEmail =
    normalizeEmail(input.email) || (rawPhone.includes('@') ? normalizeEmail(rawPhone) : '');
  const explicitThreadId =
    input.threadId || (rawPhone.startsWith('thr_') ? rawPhone : undefined);

  const contactService = getContactService();
  const commsService = getCommsThreadService();

  const resolvedThread: CommsThread | null =
    input.thread ||
    (explicitThreadId || validInputPhoneE164 || validInputEmail
      ? commsService.findThread({
          threadId: explicitThreadId,
          phone: validInputPhoneE164 || undefined,
          email: validInputEmail || undefined,
        })
      : null);

  const isTempInputContact = Boolean(
    input.contact?.id && String(input.contact.id).startsWith('temp_')
  );

  const storedContact: ContactRecord | null =
    (!isTempInputContact && input.contact ? input.contact : null) ||
    (resolvedThread?.contactId && !resolvedThread.contactId.startsWith('temp_')
      ? contactService.getContactById(resolvedThread.contactId)
      : null) ||
    (validInputPhoneE164 ? contactService.getContactByPhone(validInputPhoneE164) : null) ||
    (resolvedThread?.primaryPhone
      ? contactService.getContactByPhone(resolvedThread.primaryPhone)
      : null) ||
    (validInputEmail ? contactService.getContactByEmail(validInputEmail) : null) ||
    (resolvedThread?.primaryEmail
      ? contactService.getContactByEmail(resolvedThread.primaryEmail)
      : null);

  const effectiveContact = storedContact || input.contact || null;
  const isKnownContact = Boolean(storedContact);

  // Collect all normalized phones & emails for unified trip matching
  const candidatePhonesE164 = collectContactPhonesE164(effectiveContact, [
    validInputPhoneE164,
    resolvedThread?.primaryPhone,
    ...(resolvedThread?.phones || []),
  ]);
  const normPhoneSet = new Set(
    candidatePhonesE164
      .map((p) => normalizePhone(p))
      .filter((d) => d.length >= 7)
  );

  const candidateEmails = collectContactEmailsNormalized(effectiveContact, [
    validInputEmail,
    resolvedThread?.primaryEmail,
    ...(resolvedThread?.emails || []),
  ]);
  const normEmailSet = new Set(candidateEmails);

  const linkedTripIdSet = new Set(resolvedThread?.linkedTripIds || []);

  // Check if phone matches an active fleet driver
  const matchedDriver =
    normPhoneSet.size > 0
      ? drivers.find((d) => {
          const dNorm = normalizePhone(d.phone || '');
          return dNorm.length >= 7 && normPhoneSet.has(dNorm);
        }) || null
      : null;

  // Match customer trips across phone, email, contactId, or thread linkedTripIds
  const matchedTrips = trips.filter((trip) => {
    if (!trip || trip.isArchived) return false;
    if (linkedTripIdSet.has(trip.id)) return true;
    if (
      storedContact?.id &&
      (trip.customerId === storedContact.id || trip.userId === storedContact.id)
    ) {
      return true;
    }

    const pPhoneNorm = normalizePhone(trip.passenger?.phone || '');
    const cPhoneNorm = normalizePhone(trip.contactPerson?.phone || '');
    if (
      (pPhoneNorm.length >= 7 && normPhoneSet.has(pPhoneNorm)) ||
      (cPhoneNorm.length >= 7 && normPhoneSet.has(cPhoneNorm))
    ) {
      return true;
    }

    const pEmailNorm = normalizeEmail(trip.passenger?.email);
    const cEmailNorm = normalizeEmail(trip.contactPerson?.email);
    if (
      (pEmailNorm && normEmailSet.has(pEmailNorm)) ||
      (cEmailNorm && normEmailSet.has(cEmailNorm))
    ) {
      return true;
    }

    return false;
  });

  // Also enrich phones/emails if matched trip carries cross-channel contact info
  for (const mt of matchedTrips) {
    const tPhoneE164 = normalizePhoneE164(mt.passenger?.phone);
    if (tPhoneE164 && !candidatePhonesE164.some((p) => normalizePhone(p) === normalizePhone(tPhoneE164))) {
      candidatePhonesE164.push(tPhoneE164);
    }
    const tEmail = normalizeEmail(mt.passenger?.email);
    if (tEmail && !candidateEmails.includes(tEmail)) {
      candidateEmails.push(tEmail);
    }
  }

  const payLinkService = getPayLinkService();
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const activeTripRecords = matchedTrips
    .filter((t) => isActiveOrUpcomingTripStatus(t.status))
    .sort((a, b) => {
      const pa = TRIP_STATUS_LABELS[a.status]?.priority ?? 15;
      const pb = TRIP_STATUS_LABELS[b.status]?.priority ?? 15;
      if (pa !== pb) return pa - pb;
      const ta = Date.parse(a.scheduledPickupTime || a.createdAt || '') || 0;
      const tb = Date.parse(b.scheduledPickupTime || b.createdAt || '') || 0;
      return ta - tb;
    });

  const activeTrips: CommsActiveTripSummary[] = activeTripRecords.map((trip) => {
    const statusMeta = TRIP_STATUS_LABELS[trip.status] || {
      label: String(trip.status),
      tone: 'slate' as const,
      priority: 15,
    };
    const assignedDrv = trip.assignedDriverId ? driverById.get(trip.assignedDriverId) : undefined;
    const rawUnit =
      assignedDrv?.cabNumber ||
      assignedDrv?.vehicleUnit ||
      trip.assignedVehicle?.vehicleNumber ||
      undefined;
    const carUnit = formatCommsCarUnit(rawUnit);
    const driverName =
      assignedDrv?.name ||
      (assignedDrv?.firstName
        ? `${assignedDrv.firstName} ${assignedDrv.lastName || ''}`.trim()
        : undefined) ||
      trip.offerCascade?.activeOfferedDriverName ||
      undefined;

    const flightCreds = extractTripFlightCredentials(trip);
    const rawFlightBadge = resolveTripFlightBadge(trip);
    const flightBadge = rawFlightBadge.hasFlight ? rawFlightBadge : undefined;

    const trackingUrl = buildTripTrackingUrl(trip, input.originOverride);
    const cachedPayToken = payLinkService.getTripCachedPayToken(trip);
    const payUrl = cachedPayToken ? payLinkService.buildPayUrl(cachedPayToken) : undefined;
    const payLinkState = payLinkService.getTripPayLinkDisplayState(trip);

    const pickupAddress = trip.pickupLocation?.address || '';
    const dropoffAddress = trip.dropoffLocation?.address || '';

    return {
      trip,
      tripId: trip.id,
      status: trip.status,
      statusLabel: statusMeta.label,
      statusTone: statusMeta.tone,
      pickupTimeLabel: formatTripPickupTimeForComms(trip),
      pickupAddress,
      dropoffAddress,
      pickupShort: shortenCommsAddress(pickupAddress, 'Pickup'),
      dropoffShort: shortenCommsAddress(dropoffAddress, 'Destination'),
      assignedDriverId: trip.assignedDriverId,
      driverName,
      carUnit,
      driverPhone: assignedDrv?.phone,
      isAirportTrip: flightCreds.isAirportTrip,
      flightBadge,
      trackingUrl,
      cachedPayToken,
      payUrl,
      payLinkState,
      totalFare: trip.pricing?.totalFare ?? 0,
    };
  });

  const completedTrips = matchedTrips
    .filter((t) => t.status === 'completed')
    .sort((a, b) => {
      const ta =
        Date.parse(a.completedAt || a.scheduledPickupTime || a.updatedAt || a.createdAt || '') || 0;
      const tb =
        Date.parse(b.completedAt || b.scheduledPickupTime || b.updatedAt || b.createdAt || '') || 0;
      return tb - ta;
    });

  const lastCompletedTrip: Trip | null = completedTrips[0] || null;
  const baseRebook = lastCompletedTrip
    ? buildPopulateRebookPayloadFromTrip(lastCompletedTrip)
    : null;

  const rebookPayload: WorkspaceEventMap['POPULATE_BOOKING'] | null = baseRebook
    ? {
        ...baseRebook,
        ...(storedContact?.corporateAccountName && !baseRebook.corporateAccount
          ? {
              corporateAccount: storedContact.corporateAccountName,
              corporateAccountName: storedContact.corporateAccountName,
            }
          : {}),
        ...(storedContact?.corporateAccountNumber && !baseRebook.corporateAccountNumber
          ? {
              corporateAccountNumber: storedContact.corporateAccountNumber,
              accountNumber: storedContact.corporateAccountNumber,
            }
          : {}),
        ...(storedContact?.defaultPoNumber && !baseRebook.billingPo
          ? {
              billingPo: storedContact.defaultPoNumber,
              poNumber: storedContact.defaultPoNumber,
            }
          : {}),
        ...(storedContact?.accessibilityNeeds && !baseRebook.accessibilityNeeds
          ? { accessibilityNeeds: storedContact.accessibilityNeeds }
          : {}),
      }
    : null;

  const primaryTripRef = activeTrips[0]?.trip || lastCompletedTrip || matchedTrips[0] || null;
  const tripPassengerFullName = primaryTripRef
    ? `${primaryTripRef.passenger?.firstName || ''} ${
        primaryTripRef.passenger?.lastName || ''
      }`
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  const primaryPhone = candidatePhonesE164[0] || undefined;
  const primaryEmail = candidateEmails[0] || undefined;
  const displayPhone = primaryPhone ? formatDisplayPhone(primaryPhone) : undefined;

  const contactName =
    storedContact?.name ||
    (matchedDriver?.name ? `${matchedDriver.name}` : '') ||
    tripPassengerFullName ||
    (resolvedThread?.contactName && !resolvedThread.contactName.startsWith('+')
      ? resolvedThread.contactName
      : '') ||
    (input.contactNameHint &&
    input.contactNameHint !== 'Caller' &&
    input.contactNameHint !== 'Unknown Caller'
      ? input.contactNameHint
      : '') ||
    (!isTempInputContact && effectiveContact?.name ? effectiveContact.name : '') ||
    displayPhone ||
    primaryEmail ||
    'Unknown Caller';

  const firstName =
    (storedContact?.firstName || '').trim() ||
    (primaryTripRef?.passenger?.firstName || '').trim() ||
    (contactName &&
    !contactName.startsWith('(') &&
    !contactName.startsWith('+') &&
    !contactName.includes('@') &&
    contactName !== 'Unknown Caller'
      ? contactName.split(/\s+/)[0]
      : 'there');

  const isBlacklisted = Boolean(
    storedContact?.isBlacklisted ||
      matchedDriver?.isBlacklisted ||
      matchedTrips.some((t) => Boolean(t.isBlacklisted))
  );
  const blacklistReason =
    storedContact?.blacklistReason ||
    matchedDriver?.blacklistReason ||
    matchedTrips.find((t) => t.blacklistReason)?.blacklistReason ||
    (isBlacklisted ? 'Flagged on dispatch governance list' : undefined);

  const corporateAccountName =
    storedContact?.corporateAccountName || resolvedThread?.corporateAccountName || undefined;
  const corporateAccountNumber =
    storedContact?.corporateAccountNumber ||
    (primaryTripRef?.metadata &&
    typeof (primaryTripRef.metadata as Record<string, any>).corporateAccountNumber === 'string'
      ? ((primaryTripRef.metadata as Record<string, any>).corporateAccountNumber as string)
      : undefined) ||
    undefined;
  const corporateAccountId =
    storedContact?.corporateAccountId ||
    resolvedThread?.corporateAccountId ||
    primaryTripRef?.corporateAccountId ||
    undefined;

  const preferredVehicleTier =
    storedContact?.preferredVehicleTier || primaryTripRef?.vehicleTier || undefined;
  const preferredVehicleLabel =
    preferredVehicleTier && preferredVehicleTier !== 'standard'
      ? VEHICLE_TIER_LABELS[preferredVehicleTier] || preferredVehicleTier
      : undefined;

  const accessibilityBadges = buildAccessibilityBadges(storedContact, matchedTrips);

  const noteFragments = [
    storedContact?.internalDispatcherNotes?.trim(),
    storedContact?.notes?.trim(),
  ].filter((v): v is string => Boolean(v));
  const uniqueNotes = Array.from(new Set(noteFragments));
  const internalNotes = uniqueNotes.length > 0 ? uniqueNotes.join(' · ') : undefined;

  const tripCount = Math.max(storedContact?.tripCount ?? 0, matchedTrips.length);
  const customerScore = storedContact?.customerScore;

  const hasKnownContext = Boolean(
    isKnownContact ||
      matchedTrips.length > 0 ||
      matchedDriver ||
      (resolvedThread && (resolvedThread.channels?.length || 0) > 0)
  );

  // Build ready-to-interpolate SMS template context from best active or recent trip
  const primaryActive = activeTrips[0];
  const primaryFlightCreds = primaryTripRef
    ? extractTripFlightCredentials(primaryTripRef)
    : undefined;

  const templateContext: CommsSmsTemplateContext = {
    firstName,
    passengerName:
      contactName !== 'Unknown Caller' && !contactName.includes('@')
        ? contactName
        : tripPassengerFullName || undefined,
    tripId: primaryActive?.tripId || lastCompletedTrip?.id,
    pickupTime: primaryActive?.pickupTimeLabel,
    pickupShort:
      primaryActive?.pickupShort ||
      (lastCompletedTrip?.pickupLocation?.address
        ? shortenCommsAddress(lastCompletedTrip.pickupLocation.address, 'your pickup location')
        : shortenCommsAddress(storedContact?.homeAddress, 'your pickup location')),
    dropoffShort:
      primaryActive?.dropoffShort ||
      (lastCompletedTrip?.dropoffLocation?.address
        ? shortenCommsAddress(lastCompletedTrip.dropoffLocation.address, 'your destination')
        : shortenCommsAddress(storedContact?.workAddress, 'your destination')),
    pickupAddress:
      primaryActive?.pickupAddress ||
      lastCompletedTrip?.pickupLocation?.address ||
      storedContact?.homeAddress,
    dropoffAddress:
      primaryActive?.dropoffAddress ||
      lastCompletedTrip?.dropoffLocation?.address ||
      storedContact?.workAddress,
    driverName: primaryActive?.driverName,
    carUnit: primaryActive?.carUnit,
    trackingUrl:
      primaryActive?.trackingUrl ||
      (lastCompletedTrip ? buildTripTrackingUrl(lastCompletedTrip, input.originOverride) : undefined),
    payUrl:
      primaryActive?.payUrl ||
      (lastCompletedTrip && payLinkService.getTripCachedPayToken(lastCompletedTrip)
        ? payLinkService.buildPayUrl(payLinkService.getTripCachedPayToken(lastCompletedTrip)!)
        : undefined),
    airlineCode: primaryFlightCreds?.airline || undefined,
    airportCode: primaryFlightCreds?.airportCode || undefined,
    airlineOrAirportHint:
      primaryFlightCreds?.airline ||
      primaryActive?.flightBadge?.terminal ||
      primaryActive?.pickupAddress ||
      undefined,
  };

  const canonicalTid =
    resolvedThread?.id ||
    (primaryPhone || primaryEmail || storedContact?.id
      ? resolveCanonicalThreadId({
          contact: storedContact,
          contactId: storedContact?.id,
          phone: primaryPhone,
          email: primaryEmail,
        })
      : undefined);

  return {
    hasKnownContext,
    isKnownContact,
    isDriver: Boolean(matchedDriver),
    driverUnit: matchedDriver
      ? formatCommsCarUnit(matchedDriver.cabNumber || matchedDriver.vehicleUnit)
      : undefined,
    contactId: storedContact?.id,
    threadId: canonicalTid !== 'thr_unknown' ? canonicalTid : undefined,
    contactName,
    firstName,
    primaryPhone,
    displayPhone,
    primaryEmail,
    isVip: Boolean(storedContact?.isVip),
    vipReason: storedContact?.vipReason || undefined,
    isBlacklisted,
    blacklistReason,
    corporateAccountId,
    corporateAccountName,
    corporateAccountNumber,
    preferredVehicleTier,
    preferredVehicleLabel,
    accessibilityBadges,
    tripCount,
    customerScore,
    internalNotes,
    activeTrips,
    lastCompletedTrip,
    rebookPayload,
    primaryMatchedTrip: primaryTripRef,
    templateContext,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Pure Multi-Channel Filtering & Unified Conversation Thread Grouping
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterCommsInteractionsOptions {
  channelFilter?: ChannelFilter;
  channelFilters?: ReadonlyArray<MultiChannelKey>;
  contactFilter?: ContactFilter;
  contactFilters?: ReadonlyArray<MultiContactKey>;
  unreadOnly?: boolean;
  searchQuery?: string;
}

export function toggleCommsMultiFilter<T extends string>(
  current: ReadonlyArray<T>,
  value: T
): T[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

export function matchesCommsChannelFilter(
  item: InteractionEvent,
  channelFilter: ChannelFilter = 'all',
  channelFilters?: ReadonlyArray<MultiChannelKey>
): boolean {
  if (channelFilters && channelFilters.length > 0) {
    return channelFilters.some((ch) => matchesCommsChannelFilter(item, ch));
  }
  if (channelFilter === 'all') return true;
  if (channelFilter === 'calls') return item.type.startsWith('call_');
  if (channelFilter === 'voicemail') return item.type === 'voicemail';
  if (channelFilter === 'messages') return item.type.startsWith('sms_');
  if (channelFilter === 'emails') return item.type.startsWith('email_');
  if (channelFilter === 'notes') return item.type === 'internal_note';
  return true;
}

function matchesContactFiltersList(
  contactType: CommsContactType,
  isCorporate: boolean,
  contactFilters?: ReadonlyArray<MultiContactKey>,
  contactFilter?: ContactFilter
): boolean {
  if (contactFilters && contactFilters.length > 0) {
    return contactFilters.some((cf) => {
      if (cf === 'drivers') return contactType === 'driver';
      if (cf === 'corporate') return contactType === 'corporate' || isCorporate;
      if (cf === 'passengers') return contactType === 'passenger' || contactType === 'unknown';
      return false;
    });
  }
  if (
    contactFilter === 'passengers' &&
    contactType !== 'passenger' &&
    contactType !== 'corporate' &&
    contactType !== 'unknown'
  ) {
    return false;
  }
  if (contactFilter === 'drivers' && contactType !== 'driver') return false;
  if (contactFilter === 'corporate' && contactType !== 'corporate' && !isCorporate) return false;
  return true;
}

export function matchesCommsContactAndSearchFilter(
  item: InteractionEvent,
  options: Omit<FilterCommsInteractionsOptions, 'channelFilter' | 'channelFilters'> = {}
): boolean {
  if (item.snippet?.includes('Thank you for contacting our dispatch desk')) {
    return false;
  }
  if (options.unreadOnly && !item.isUnread) {
    return false;
  }
  if (
    !matchesContactFiltersList(
      item.contactType,
      item.contactType === 'corporate',
      options.contactFilters,
      options.contactFilter
    )
  ) {
    return false;
  }

  const q = (options.searchQuery || '').trim().toLowerCase();
  if (q) {
    const haystacks = [
      item.contactName,
      item.contactPhone,
      item.contactEmail,
      item.subject,
      item.snippet,
      item.bodyText,
      item.transcription,
      item.tripId,
      item.actorName,
    ];
    const matched = haystacks.some(
      (val) => typeof val === 'string' && val.toLowerCase().includes(q)
    );
    if (!matched) return false;
  }

  return true;
}

export function filterCommsInteractionEvents(
  items: InteractionEvent[],
  options: FilterCommsInteractionsOptions = {}
): InteractionEvent[] {
  const channelFilter = options.channelFilter || 'all';
  return items.filter(
    (item) =>
      matchesCommsChannelFilter(item, channelFilter, options.channelFilters) &&
      matchesCommsContactAndSearchFilter(item, options)
  );
}

export interface CommsConversationRowSummary {
  threadId: string;
  /** Canonical click selector (`primaryPhone || primaryEmail || threadId`) */
  selectorTarget: string;
  latestEvent: InteractionEvent;
  contactName: string;
  contactType: CommsContactType;
  primaryPhone?: string;
  displayPhone?: string;
  primaryEmail?: string;
  isVip: boolean;
  isBlacklisted: boolean;
  corporateAccountName?: string;
  channels: CommsChannel[];
  channelCounts: Record<CommsChannel, number>;
  unreadCountTotal: number;
  unreadByChannel: CommsUnreadByChannel;
}

function inferInteractionChannel(evt: InteractionEvent): CommsChannel {
  if (evt.channel) return evt.channel;
  if (evt.type.startsWith('sms_')) return 'sms';
  if (evt.type.startsWith('call_')) return 'call';
  if (evt.type === 'voicemail') return 'voicemail';
  if (evt.type.startsWith('email_')) return 'email';
  return 'note';
}

/**
 * Pure multi-channel conversation list builder.
 * Unifies phone-only, email-only, and multi-channel (phone + email) interactions into
 * canonical conversation rows with multi-channel activity badges (`SMS`, `Call`, `VM`, `Email`, `Note`)
 * and exact unread counts.
 */
export function buildUnifiedCommsThreadSummaries(
  interactions: InteractionEvent[],
  threads: CommsThread[] = [],
  filterOptions: FilterCommsInteractionsOptions = {}
): CommsConversationRowSummary[] {
  const contactService = getContactService();
  const hasChannelRestriction = Boolean(
    (filterOptions.channelFilters && filterOptions.channelFilters.length > 0) ||
      (filterOptions.channelFilter && filterOptions.channelFilter !== 'all')
  );
  const sourceInteractions = hasChannelRestriction
    ? interactions.filter((evt) =>
        matchesCommsChannelFilter(
          evt,
          filterOptions.channelFilter || 'all',
          filterOptions.channelFilters
        )
      )
    : interactions;
  const threadById = new Map<string, CommsThread>();
  for (const t of threads) {
    if (t && t.id && !t.mergedIntoThreadId && !t.isDeleted) {
      threadById.set(t.id, t);
    }
  }

  interface Bucket {
    threadId: string;
    thread?: CommsThread;
    contact?: ContactRecord | null;
    events: InteractionEvent[];
    phones: string[];
    emails: string[];
  }

  const buckets = new Map<string, Bucket>();

  for (const evt of sourceInteractions) {
    if (evt.snippet?.includes('Thank you for contacting our dispatch desk')) continue;

    const resolution = contactService.resolveUnifiedContact({
      phone: evt.contactPhone,
      email: evt.contactEmail,
      name: evt.contactName,
      contactType: evt.contactType,
      autoLink: false,
    });

    const explicitThread = evt.threadId ? threadById.get(evt.threadId) : undefined;
    const canonicalThread =
      (resolution.threadId !== 'thr_unknown' ? threadById.get(resolution.threadId) : undefined) ||
      explicitThread;

    const groupKey =
      canonicalThread?.id ||
      (resolution.threadId !== 'thr_unknown'
        ? resolution.threadId
        : evt.threadId || `thr_evt_${evt.id}`);

    let bucket = buckets.get(groupKey);
    if (!bucket) {
      bucket = {
        threadId: groupKey,
        thread: canonicalThread,
        contact: resolution.contact,
        events: [],
        phones: [...resolution.phones],
        emails: [...resolution.emails],
      };
      buckets.set(groupKey, bucket);
    } else {
      if (!bucket.contact && resolution.contact) bucket.contact = resolution.contact;
      if (!bucket.thread && canonicalThread) bucket.thread = canonicalThread;
      for (const p of resolution.phones) {
        if (!bucket.phones.some((ep) => normalizePhone(ep) === normalizePhone(p))) {
          bucket.phones.push(p);
        }
      }
      for (const em of resolution.emails) {
        if (!bucket.emails.includes(em)) {
          bucket.emails.push(em);
        }
      }
    }

    bucket.events.push(evt);
  }

  const rows: CommsConversationRowSummary[] = [];

  for (const bucket of buckets.values()) {
    const sortedDesc = [...bucket.events].sort(
      (a, b) => (b.timestampMs || 0) - (a.timestampMs || 0)
    );
    const latest = sortedDesc[0];
    if (!latest) continue;

    const channelCounts: Record<CommsChannel, number> = {
      sms: 0,
      call: 0,
      voicemail: 0,
      email: 0,
      note: 0,
    };
    const unreadByChannel: CommsUnreadByChannel = {
      sms: 0,
      call: 0,
      voicemail: 0,
      email: 0,
    };

    for (const e of sortedDesc) {
      const ch = inferInteractionChannel(e);
      channelCounts[ch] += 1;
      if (e.isUnread) {
        if (ch === 'sms') unreadByChannel.sms += 1;
        else if (ch === 'call') unreadByChannel.call += 1;
        else if (ch === 'voicemail') unreadByChannel.voicemail += 1;
        else if (ch === 'email') unreadByChannel.email += 1;
      }
    }

    const unreadCountTotal =
      unreadByChannel.sms +
      unreadByChannel.call +
      unreadByChannel.voicemail +
      unreadByChannel.email;

    if (filterOptions.unreadOnly && unreadCountTotal === 0) {
      continue;
    }

    const primaryPhone =
      bucket.phones[0] ||
      normalizePhoneE164(bucket.thread?.primaryPhone) ||
      normalizePhoneE164(latest.contactPhone) ||
      undefined;
    const primaryEmail =
      bucket.emails[0] ||
      normalizeEmail(bucket.thread?.primaryEmail) ||
      normalizeEmail(latest.contactEmail) ||
      undefined;

    const contactType: CommsContactType =
      (bucket.contact?.corporateAccountId ? 'corporate' : undefined) ||
      bucket.thread?.contactType ||
      latest.contactType ||
      'passenger';

    const isCorpBucket = Boolean(
      bucket.contact?.corporateAccountId ||
        bucket.contact?.corporateAccountName ||
        bucket.thread?.corporateAccountName ||
        contactType === 'corporate'
    );
    if (
      !matchesContactFiltersList(
        contactType,
        isCorpBucket,
        filterOptions.contactFilters,
        filterOptions.contactFilter
      )
    ) {
      continue;
    }

    const contactName =
      bucket.contact?.name ||
      (bucket.thread?.contactName && !bucket.thread.contactName.startsWith('+')
        ? bucket.thread.contactName
        : '') ||
      latest.contactName ||
      (primaryPhone ? formatDisplayPhone(primaryPhone) : primaryEmail || 'Customer');

    const q = (filterOptions.searchQuery || '').trim().toLowerCase();
    if (q) {
      const threadMetaMatch = [
        contactName,
        primaryPhone,
        primaryEmail,
        bucket.contact?.corporateAccountName,
        bucket.contact?.corporateAccountNumber,
      ].some((v) => typeof v === 'string' && v.toLowerCase().includes(q));
      const anyEventMatch = sortedDesc.some((ev) =>
        matchesCommsContactAndSearchFilter(ev, { searchQuery: q })
      );
      if (!threadMetaMatch && !anyEventMatch) {
        continue;
      }
    }

    const channels = COMMS_ORDERED_CHANNELS.filter(
      (ch) => channelCounts[ch] > 0 || bucket.thread?.channels?.includes(ch)
    );

    const selectorTarget = primaryPhone || primaryEmail || bucket.threadId;

    rows.push({
      threadId: bucket.threadId,
      selectorTarget,
      latestEvent: {
        ...latest,
        threadId: bucket.threadId,
        contactName,
        contactPhone: primaryPhone || '',
        contactEmail: primaryEmail,
        contactType,
      },
      contactName,
      contactType,
      primaryPhone,
      displayPhone: primaryPhone ? formatDisplayPhone(primaryPhone) : undefined,
      primaryEmail,
      isVip: Boolean(bucket.contact?.isVip),
      isBlacklisted: Boolean(bucket.contact?.isBlacklisted),
      corporateAccountName:
        bucket.contact?.corporateAccountName || bucket.thread?.corporateAccountName,
      channels,
      channelCounts,
      unreadCountTotal,
      unreadByChannel,
    });
  }

  return rows.sort(
    (a, b) => (b.latestEvent.timestampMs || 0) - (a.latestEvent.timestampMs || 0)
  );
}

/**
 * Pure helper resolving a click/selection target (`primaryPhone || primaryEmail || threadId`)
 * for any `InteractionEvent` row so email-only and note-only events open cleanly.
 */
export function resolveInteractionSelectorTarget(event: InteractionEvent): string {
  const cleanPhone = normalizePhoneE164(event.contactPhone) || event.contactPhone?.trim();
  if (cleanPhone) return cleanPhone;
  const cleanEmail = normalizeEmail(event.contactEmail) || event.contactEmail?.trim();
  if (cleanEmail) return cleanEmail;
  return event.threadId || '';
}
