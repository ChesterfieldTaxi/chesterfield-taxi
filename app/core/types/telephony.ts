/**
 * Telephony & Communications Data Models
 * 
 * Defines contracts for masked phone proxy routing (Twilio relay),
 * automated dispatch SMS telemetry, and Dispatch desk WebRTC softphone.
 */

export interface MaskedRelaySession {
  id: string;
  tripId: string;
  virtualProxyNumber: string; // e.g. "+13147380100" (company relay)
  driverPhone: string;
  passengerPhone: string;
  status: 'active' | 'closed';
  createdAt: string;
  expiresAt: string;
  callCount: number;
  smsCount: number;
}

export type SmsNotificationType =
  | 'driver_en_route'
  | 'driver_arrived'
  | 'trip_started'
  | 'trip_completed'
  | 'custom';

export interface SmsNotification {
  id: string;
  tripId: string;
  recipientPhone: string;
  recipientRole: 'passenger' | 'driver';
  type: SmsNotificationType;
  message: string;
  status: 'sent' | 'delivered' | 'failed';
  sentAt: string;
}

export type WebRtcCallState = 'idle' | 'calling' | 'connected' | 'ended';

export interface WebRtcCallSession {
  callId: string;
  peerNumber: string;
  peerName?: string;
  status: WebRtcCallState;
  durationSeconds: number;
  isMuted: boolean;
  startedAt?: string;
  endedAt?: string;
}

export interface ITelephonyService {
  /**
   * Provisions a masked phone relay session for a trip to protect private numbers.
   */
  createMaskedSession(
    tripId: string,
    driverPhone: string,
    passengerPhone: string
  ): Promise<MaskedRelaySession>;

  /**
   * Retrieves active masked relay session for a trip.
   */
  getMaskedSession(tripId: string): Promise<MaskedRelaySession | null>;

  /**
   * Closes a masked phone relay session upon trip completion or cancellation.
   */
  closeMaskedSession(tripId: string): Promise<void>;

  /**
   * Sends an automated lifecycle telemetry SMS to the passenger.
   */
  sendLifecycleSms(
    tripId: string,
    type: SmsNotificationType,
    context: {
      passengerPhone: string;
      driverName?: string;
      vehicleUnit?: string;
      vehicleModel?: string;
      etaMinutes?: number;
      finalFare?: number;
    }
  ): Promise<SmsNotification>;

  /**
   * Retrieves SMS history for a trip or system-wide.
   */
  getSmsHistory(tripId?: string): Promise<SmsNotification[]>;

  /**
   * Initiates a softphone call session (WebRTC simulation/provider bridge).
   */
  startSoftphoneCall(phoneNumber: string, peerName?: string): WebRtcCallSession;

  /**
   * Terminates an active softphone call session.
   */
  endSoftphoneCall(callId: string): WebRtcCallSession;
}
