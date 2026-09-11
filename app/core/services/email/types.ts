/**
 * Email Dispatch Service Types & Payloads
 * 
 * Defines email models for Resend transactional email communications,
 * including passenger booking confirmations and admin dispatch alerts.
 */

export interface BookingConfirmationEmailPayload {
  tripId: string;
  passenger: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  bookingType: 'asap' | 'scheduled';
  vehicleTier: string;
  totalFare: number;
  currency: string;
  paymentMethod: string;
  specialRequests?: string;
}

export interface AdminDispatchAlertEmailPayload {
  tripId: string;
  passengerName: string;
  passengerPhone: string;
  passengerEmail: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupTime: string;
  vehicleTier: string;
  totalFare: number;
  currency: string;
  bookingType: 'asap' | 'scheduled';
  specialRequests?: string;
  urgency: 'high' | 'normal';
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  recipient: string;
  subject: string;
  error?: string;
  dispatchedAt: string; // ISO 8601
}

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
}
