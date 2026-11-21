/**
 * Email Dispatch Service Types & Payloads
 * 
 * Defines email models for Resend transactional email communications,
 * including passenger booking confirmations, dispatcher alerts, and status update notifications.
 */

import type { PriceLineItem, TripStatus } from '../../types';

export interface FlightOperationsEmailDetails {
  airlineName?: string;
  airlineCode?: string;
  flightNumber?: string;
  departureAirport?: string;
  tailNumber?: string;
  fboFacility?: string;
  isPrivateAviation?: boolean;
  hasCheckedLuggage?: boolean;
  isAirportTrip?: boolean;
}

export interface BookingConfirmationEmailPayload {
  tripId: string;
  trackingToken?: string;
  trackingUrl?: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  recipientEmailOverride?: string;
  pickupAddress: string;
  pickupNotes?: string;
  intermediateStops?: Array<{ address: string; notes?: string }>;
  dropoffAddress: string;
  dropoffNotes?: string;
  pickupTime: string;
  bookingType: 'asap' | 'scheduled';
  vehicleTier: string;
  vehicleDisplayName?: string;
  passengerCount?: number;
  luggageCount?: number;
  totalFare: number;
  breakdown?: PriceLineItem[];
  tariffProfileName?: string;
  currency: string;
  paymentMethod: string;
  specialRequests?: string;
  oversizedBags?: Record<string, number>;
  oversizedItemsSummary?: string;
  customExtrasSummary?: string;
  flightDetails?: FlightOperationsEmailDetails;
  status?: string;
  lambertPickupInstructions?: string;
  contactPerson?: {
    isBookerDifferent?: boolean;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    contactRole?: string;
  };
  carSeatsBreakdown?: {
    rearFacing?: number;
    frontFacing?: number;
    booster?: number;
    total?: number;
  };
  additionalPassengers?: Array<{
    name: string;
    phone?: string;
  }>;
  returnTripDetails?: {
    tripId: string;
    trackingToken?: string;
    pickupAddress: string;
    dropoffAddress: string;
    pickupTime: string;
    vehicleTier: string;
    vehicleDisplayName?: string;
    totalFare: number;
    passengerCount?: number;
    luggageCount?: number;
    flightDetails?: FlightOperationsEmailDetails;
  };
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface AdminDispatchAlertEmailPayload {
  tripId: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  passengerCount?: number;
  luggageCount?: number;
  oversizedBags?: Record<string, number>;
  oversizedItemsSummary?: string;
  customExtrasSummary?: string;
  pickupAddress: string;
  pickupNotes?: string;
  intermediateStops?: Array<{ address: string; notes?: string }>;
  dropoffAddress: string;
  dropoffNotes?: string;
  pickupTime: string;
  vehicleTier: string;
  vehicleDisplayName?: string;
  totalFare: number;
  breakdown?: PriceLineItem[];
  tariffProfileName?: string;
  bookingSource?: string;
  currency: string;
  bookingType: 'asap' | 'scheduled';
  paymentMethod?: string;
  specialRequests?: string;
  urgency: 'high' | 'normal';
  flightDetails?: FlightOperationsEmailDetails;
  status?: string;
  lambertPickupInstructions?: string;
  returnTripDetails?: {
    tripId: string;
    pickupAddress: string;
    dropoffAddress: string;
    pickupTime: string;
    vehicleTier: string;
    vehicleDisplayName?: string;
    totalFare: number;
    flightDetails?: FlightOperationsEmailDetails;
  };
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface StatusUpdateEmailPayload {
  tripId: string;
  trackingToken?: string;
  trackingUrl?: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  newStatus: TripStatus;
  previousStatus?: TripStatus | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  vehicleTier: string;
  vehicleDisplayName?: string;
  driverInfo?: {
    name?: string;
    phone?: string;
    vehicleModel?: string;
    licensePlate?: string;
  };
  statusReason?: string;
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface BookingDeclinedEmailPayload {
  tripId: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  vehicleTier?: string;
  vehicleDisplayName?: string;
  reason: string;
  customNotes?: string;
  legScope?: 'outbound' | 'return' | 'roundtrip';
  linkedTripId?: string;
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface BookingClarificationRequestEmailPayload {
  tripId: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  vehicleTier?: string;
  vehicleDisplayName?: string;
  clarificationTopic: string;
  customMessage?: string;
  legScope?: 'outbound' | 'return' | 'roundtrip';
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface TripReceiptEmailPayload {
  tripId: string;
  completedAt: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  pickupAddress: string;
  intermediateStops?: Array<{ address: string }>;
  dropoffAddress: string;
  pickupTime: string;
  vehicleTier: string;
  vehicleDisplayName?: string;
  driverName?: string;
  vehicleUnit?: string;
  distanceMiles?: number;
  durationMinutes?: number;
  subtotalFare: number;
  tipAmount?: number;
  grandTotal: number;
  currency?: string;
  breakdown?: PriceLineItem[];
  tariffProfileName?: string;
  paymentMethod: string;
  cardLast4?: string;
  paymentStatus?: string;
  corporateAccountName?: string;
  poNumber?: string;
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface CorporateInvoiceEmailPayload {
  invoiceId: string;
  invoiceNumber: string;
  issuedDate: string;
  dueDate: string;
  billingCycle?: string;
  customerName: string;
  customerEmail: string;
  accountNumber?: string;
  lineItems: Array<{
    date?: string;
    passengerName?: string;
    description: string;
    poNumber?: string;
    amount: number;
  }>;
  subtotal: number;
  discountAmount?: number;
  totalAmount: number;
  notes?: string;
  payLinkUrl?: string;
  companySettings?: {
    name?: string;
    phone?: string;
    address?: string;
    email?: string;
  };
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  recipient: string;
  subject: string;
  error?: string;
  dispatchedAt: string; // ISO 8601
  simulated?: boolean;
}

export type EmailDispatchApiRequest = (
  | { type: 'booking_confirmation'; payload: BookingConfirmationEmailPayload }
  | { type: 'dispatcher_alert'; payload: AdminDispatchAlertEmailPayload }
  | { type: 'status_update'; payload: StatusUpdateEmailPayload }
  | { type: 'booking_declined'; payload: BookingDeclinedEmailPayload }
  | { type: 'clarification_request'; payload: BookingClarificationRequestEmailPayload }
  | { type: 'trip_receipt'; payload: TripReceiptEmailPayload }
  | { type: 'corporate_invoice'; payload: CorporateInvoiceEmailPayload }
  | { type: 'contact_inquiry'; payload: Record<string, any> }
) & {
  subject?: string;
  html?: string;
  text?: string;
  recipient?: string;
};

/**
 * Transactional Email Dispatch Service Interface
 */
export interface IEmailDispatchService {
  /**
   * Sends booking confirmation and receipt email to the passenger.
   */
  sendBookingConfirmation(
    payload: BookingConfirmationEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends booking declined notification email to the passenger.
   */
  sendBookingDeclined(
    payload: BookingDeclinedEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends request for information or clarification email to the passenger.
   */
  sendClarificationRequest(
    payload: BookingClarificationRequestEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends new ride alert to the dispatch console or operations admin.
   */
  sendAdminDispatchAlert(
    payload: AdminDispatchAlertEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends ride status update notification email to the passenger.
   */
  sendStatusUpdateNotification(
    payload: StatusUpdateEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends itemized official tax receipt upon trip completion.
   */
  sendTripReceipt(
    payload: TripReceiptEmailPayload
  ): Promise<EmailDispatchResult>;

  /**
   * Sends itemized B2B corporate billing invoice statement.
   */
  sendCorporateInvoice(
    payload: CorporateInvoiceEmailPayload
  ): Promise<EmailDispatchResult>;
}

