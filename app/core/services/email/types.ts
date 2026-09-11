/**
 * Email Dispatch Service Types & Payloads
 * 
 * Defines email models for Resend transactional email communications,
 * including passenger booking confirmations, dispatcher alerts, and status update notifications.
 */

import type { TripStatus } from '../../types';

export interface FlightOperationsEmailDetails {
  airlineName?: string;
  airlineCode?: string;
  flightNumber?: string;
  departureAirport?: string;
  hasCheckedLuggage?: boolean;
  isAirportTrip?: boolean;
}

export interface BookingConfirmationEmailPayload {
  tripId: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  pickupAddress: string;
  pickupNotes?: string;
  dropoffAddress: string;
  dropoffNotes?: string;
  pickupTime: string;
  bookingType: 'asap' | 'scheduled';
  vehicleTier: string;
  passengerCount?: number;
  luggageCount?: number;
  totalFare: number;
  currency: string;
  paymentMethod: string;
  specialRequests?: string;
  flightDetails?: FlightOperationsEmailDetails;
}

export interface AdminDispatchAlertEmailPayload {
  tripId: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  passengerCount?: number;
  luggageCount?: number;
  pickupAddress: string;
  pickupNotes?: string;
  dropoffAddress: string;
  dropoffNotes?: string;
  pickupTime: string;
  vehicleTier: string;
  totalFare: number;
  currency: string;
  bookingType: 'asap' | 'scheduled';
  paymentMethod?: string;
  specialRequests?: string;
  urgency: 'high' | 'normal';
  flightDetails?: FlightOperationsEmailDetails;
}

export interface StatusUpdateEmailPayload {
  tripId: string;
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
  driverInfo?: {
    name?: string;
    phone?: string;
    vehicleModel?: string;
    licensePlate?: string;
  };
  statusReason?: string;
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

export type EmailDispatchApiRequest =
  | { type: 'booking_confirmation'; payload: BookingConfirmationEmailPayload }
  | { type: 'dispatcher_alert'; payload: AdminDispatchAlertEmailPayload }
  | { type: 'status_update'; payload: StatusUpdateEmailPayload };

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
}

