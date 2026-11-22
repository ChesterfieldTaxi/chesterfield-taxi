import type React from 'react';
import type { CommsChannel, CommsEventType } from '../../../../core/types/comms';
import type { Trip } from '../../../../core/types/trip';
import type { BottomSheetDragHandlers } from '../../../../core/hooks/useBottomSheetDragToClose';

export type CommsTab = 'all' | 'phone' | 'messages' | 'voicemail';
export type ChannelFilter = 'all' | 'calls' | 'voicemail' | 'messages' | 'emails' | 'notes';
export type ContactFilter = 'all' | 'passengers' | 'drivers';
export type CallTypeFilter = 'all' | 'inbound' | 'outbound' | 'missed';
export type CallsSubTab = 'keypad' | 'history' | 'missed';
export type CallStatus = 'idle' | 'calling' | 'connected' | 'on_hold';
export type SoftphoneStatus =
  | 'unconfigured'
  | 'initializing'
  | 'ready'
  | 'connecting'
  | 'on_call'
  | 'error';
export type ThreadTab = 'all' | 'sms' | 'calls' | 'emails' | 'notes';
export type PlaybackSpeed = 1 | 1.5 | 2;

export interface CallNotice {
  type: 'info' | 'warning' | 'error';
  message: string;
}

export interface InteractionEvent {
  id: string;
  threadId?: string;
  channel?: CommsChannel;
  type: CommsEventType;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  contactType: 'passenger' | 'driver' | 'corporate' | 'unknown';
  homePhone?: string;
  mobilePhone?: string;
  timestamp: string;
  timestampMs: number;
  durationSeconds?: number;
  subject?: string;
  snippet: string;
  bodyText?: string;
  emailMessageId?: string;
  tripId?: string;
  actorName?: string;
  isUnread?: boolean;
  deliveryStatus?: string;
  errorCode?: number | string;
  errorMessage?: string;
  hasRecording?: boolean;
  recordingSid?: string;
  callSid?: string;
  audioUrl?: string;
  audioDuration?: string;
  transcription?: string;
  suggestedBooking?: {
    pickup: string;
    dropoff: string;
    pickupTime: string;
    passengerName: string;
    passengerPhone: string;
    passengerEmail?: string;
    notes?: string;
  };
}

export interface CommsHubProps {
  user?: any;
  initialTab?: CommsTab;
  onTabChange?: (tab: CommsTab) => void;
  isPopout?: boolean;
  isVisible?: boolean;
  showWindowControls?: boolean;
  onClose?: () => void;
  onPopOut?: () => void;
  onPopulateBooking?: (bookingData: any) => void;
  onOpenEditTrip?: (tripId: string) => void;
  drivers?: any[];
  trips?: Trip[];
}

export interface CommsSheetDragProps {
  sheetStyle: React.CSSProperties;
  dragHandlers: BottomSheetDragHandlers;
}

export const STORAGE_KEY_INTERACTIONS = 'ct_comms_interactions';

export const formatMessageTimestamp = (timestampMs?: number, fallbackStr?: string): string => {
  if (!timestampMs) return fallbackStr || '';
  const d = new Date(timestampMs);
  if (isNaN(d.getTime())) return fallbackStr || '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const formatCallTimer = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function getClientTelephonyCredentials() {
  let sid = '';
  let token = '';
  let phone = '';
  let operatorPhone = '';
  let apiKeySid = '';
  let apiKeySecret = '';
  let twimlAppSid = '';

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      sid = localStorage.getItem('ct_twilio_sid') || '';
      token = localStorage.getItem('ct_twilio_token') || '';
      phone = localStorage.getItem('ct_twilio_phone') || '';
      operatorPhone = localStorage.getItem('ct_dispatch_operator_phone') || '';
      apiKeySid = localStorage.getItem('ct_twilio_api_key') || '';
      apiKeySecret = localStorage.getItem('ct_twilio_api_secret') || '';
      twimlAppSid = localStorage.getItem('ct_twilio_twiml_app_sid') || '';

      if (!sid || !token || !phone || !apiKeySid || !apiKeySecret || !twimlAppSid) {
        const stored = localStorage.getItem('chesterfield_taxi_app_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          const tel = parsed?.integrations?.telephony;
          if (tel) {
            sid = sid || tel.accountSid || '';
            token = token || tel.authToken || '';
            phone = phone || tel.phoneNumber || '';
            operatorPhone = operatorPhone || tel.operatorPhone || '';
            apiKeySid = apiKeySid || tel.apiKeySid || '';
            apiKeySecret = apiKeySecret || tel.apiKeySecret || '';
            twimlAppSid = twimlAppSid || tel.twimlAppSid || '';
          }
        }
      }
    } catch {
      // Ignore storage read failures
    }
  }

  return {
    accountSid: sid.trim(),
    authToken: token.trim(),
    phoneNumber: phone.trim() || '+13142281454',
    operatorPhone: operatorPhone.trim(),
    apiKeySid: apiKeySid.trim(),
    apiKeySecret: apiKeySecret.trim(),
    twimlAppSid: twimlAppSid.trim(),
  };
}

export const getStoredTwilioCreds = () => {
  if (typeof window === 'undefined') return { sid: '', token: '', phone: '' };
  const creds = getClientTelephonyCredentials();
  return {
    sid: creds.accountSid,
    token: creds.authToken,
    phone: creds.phoneNumber,
  };
};
