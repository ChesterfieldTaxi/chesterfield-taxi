/**
 * Telephony & Communications Service
 * 
 * Provides masked virtual phone relay (Twilio proxy simulation),
 * automated dispatch SMS telemetry, and Dispatch desk WebRTC softphone engine.
 */

import type {
  MaskedRelaySession,
  SmsNotification,
  SmsNotificationType,
  WebRtcCallSession,
  ITelephonyService,
} from '../types/telephony';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import { isFirebaseConfigured, getFirestoreDb } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

const MASKED_SESSIONS_STORAGE_KEY = 'ct_telephony_masked_sessions';
const SMS_HISTORY_STORAGE_KEY = 'ct_telephony_sms_history';

class TelephonyService implements ITelephonyService {
  private sessions: Map<string, MaskedRelaySession> = new Map();
  private smsLogs: SmsNotification[] = [];
  private activeCall: WebRtcCallSession | null = null;

  constructor() {
    this.hydrateStorage();
  }

  private hydrateStorage() {
    if (typeof window === 'undefined') return;
    try {
      const storedSessions = localStorage.getItem(MASKED_SESSIONS_STORAGE_KEY);
      if (storedSessions) {
        const parsed = JSON.parse(storedSessions) as MaskedRelaySession[];
        parsed.forEach((s) => this.sessions.set(s.tripId, s));
      }

      const storedSms = localStorage.getItem(SMS_HISTORY_STORAGE_KEY);
      if (storedSms) {
        this.smsLogs = JSON.parse(storedSms);
      }
    } catch (e) {
      console.warn('[TelephonyService] Hydration warning:', e);
    }
  }

  private persistStorage() {
    if (typeof window === 'undefined') return;
    try {
      const sessionArr = Array.from(this.sessions.values());
      localStorage.setItem(MASKED_SESSIONS_STORAGE_KEY, JSON.stringify(sessionArr));
      localStorage.setItem(SMS_HISTORY_STORAGE_KEY, JSON.stringify(this.smsLogs));
    } catch (e) {
      console.warn('[TelephonyService] Persistence warning:', e);
    }
  }

  async createMaskedSession(
    tripId: string,
    driverPhone: string,
    passengerPhone: string
  ): Promise<MaskedRelaySession> {
    const existing = this.sessions.get(tripId);
    if (existing && existing.status === 'active') {
      return existing;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 6 * 3600 * 1000).toISOString(); // 6 hours validity
    const proxyNumber = COMPANY_CONFIG.phone.primaryRaw || '+13147380100';

    const session: MaskedRelaySession = {
      id: `proxy_${tripId}_${Date.now().toString(36)}`,
      tripId,
      virtualProxyNumber: proxyNumber,
      driverPhone,
      passengerPhone,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt,
      callCount: 0,
      smsCount: 0,
    };

    this.sessions.set(tripId, session);
    this.persistStorage();

    // Sync proxy number and telephony session to Firestore trip document if configured
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        if (db) {
          const tripRef = doc(db, 'trips', tripId);
          await updateDoc(tripRef, {
            telephonySessionId: session.id,
            proxyNumber: session.virtualProxyNumber,
          }).catch(() => {});
        }
      } catch {
        // Tolerated
      }
    }

    return session;
  }

  async getMaskedSession(tripId: string): Promise<MaskedRelaySession | null> {
    const session = this.sessions.get(tripId);
    if (!session) return null;
    if (new Date(session.expiresAt) < new Date()) {
      session.status = 'closed';
      this.persistStorage();
    }
    return session;
  }

  async closeMaskedSession(tripId: string): Promise<void> {
    const session = this.sessions.get(tripId);
    if (session) {
      session.status = 'closed';
      this.persistStorage();
    }
  }

  async sendLifecycleSms(
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
  ): Promise<SmsNotification> {
    let message = '';
    const unit = context.vehicleUnit ? `#${context.vehicleUnit}` : 'your taxi';
    const driver = context.driverName ? ` (${context.driverName})` : '';

    switch (type) {
      case 'driver_en_route':
        message = `Chesterfield Taxi: Cab ${unit}${driver} is on the way! Estimated arrival in ${context.etaMinutes || 7} minutes.`;
        break;
      case 'driver_arrived':
        message = `Chesterfield Taxi: Your driver has arrived outside in a ${context.vehicleModel || 'vehicle'} (Cab ${unit}).`;
        break;
      case 'trip_started':
        message = `Chesterfield Taxi: Your trip has started. Safe travels with Chesterfield Taxi!`;
        break;
      case 'trip_completed':
        message = `Chesterfield Taxi: Trip completed! Total fare: $${(context.finalFare || 0).toFixed(2)}. Thank you for riding with us.`;
        break;
      default:
        message = `Chesterfield Taxi dispatch update regarding trip #${tripId.slice(-6).toUpperCase()}.`;
    }

    const notification: SmsNotification = {
      id: `sms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      tripId,
      recipientPhone: context.passengerPhone,
      recipientRole: 'passenger',
      type,
      message,
      status: 'delivered',
      sentAt: new Date().toISOString(),
    };

    this.smsLogs = [notification, ...this.smsLogs];

    // If an active masked session exists, increment its SMS count
    const session = this.sessions.get(tripId);
    if (session && session.status === 'active') {
      session.smsCount += 1;
    }

    this.persistStorage();
    return notification;
  }

  async getSmsHistory(tripId?: string): Promise<SmsNotification[]> {
    if (tripId) {
      return this.smsLogs.filter((s) => s.tripId === tripId);
    }
    return this.smsLogs;
  }

  startSoftphoneCall(phoneNumber: string, peerName?: string): WebRtcCallSession {
    const now = new Date().toISOString();
    const session: WebRtcCallSession = {
      callId: `call_${Date.now().toString(36)}`,
      peerNumber: phoneNumber,
      peerName: peerName || phoneNumber,
      status: 'calling',
      durationSeconds: 0,
      isMuted: false,
      startedAt: now,
    };

    this.activeCall = session;
    return session;
  }

  endSoftphoneCall(callId: string): WebRtcCallSession {
    const endedSession: WebRtcCallSession = {
      callId,
      peerNumber: this.activeCall?.peerNumber || '',
      peerName: this.activeCall?.peerName,
      status: 'ended',
      durationSeconds: this.activeCall?.durationSeconds || 0,
      isMuted: false,
      startedAt: this.activeCall?.startedAt,
      endedAt: new Date().toISOString(),
    };

    this.activeCall = null;
    return endedSession;
  }
}

let telephonyServiceInstance: TelephonyService | null = null;

export function getTelephonyService(): ITelephonyService {
  if (!telephonyServiceInstance) {
    telephonyServiceInstance = new TelephonyService();
  }
  return telephonyServiceInstance;
}
