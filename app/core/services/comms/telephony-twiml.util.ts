/**
 * Pure TwiML Builder, Inbound Mode Resolver & Outbound Caller ID Utilities
 * (`telephony-twiml.util.ts` — zero DOM, zero React, zero Node/Twilio SDK)
 */

export type TelephonyInboundMode = 'simultaneous_ring' | 'standalone_ivr';

export interface BuildIncomingCallTwimlOptions {
  mode: TelephonyInboundMode;
  clientIdentity?: string;
  forwardingPhone?: string;
  timeoutSeconds?: number;
}

export interface BuildOutboundClientCallTwimlOptions {
  to?: string | null;
  callerId?: string | null;
  timeoutSeconds?: number;
}

export interface BuildVoiceDialStatusTwimlOptions {
  dialCallStatus?: string | null;
  errorCode?: string | null;
}

export interface OutboundCallerIdCandidates {
  fromNumber?: string | null;
  callerId?: string | null;
  phoneNumber?: string | null;
  bridgePhoneNumber?: string | null;
}

export interface TelephonyWebhookUrls {
  inboundVoiceUrl: string;
  outboundTwimlAppUrl: string;
  callStatusCallbackUrl: string;
}

export const TWIML_VOICE_WEBHOOK_ACTIONS = new Set<string>([
  'incoming_call',
  'voice_client_twiml',
  'voice_dial_status',
  'handle_unanswered',
  'voicemail_recorded',
]);

const SIMULTANEOUS_RING_ALIASES = new Set(['simulring', 'simultaneous_ring', 'nextiva_bridge']);
const STANDALONE_IVR_ALIASES = new Set(['standalone', 'standalone_ivr', 'ivr']);

function escapeTwimlXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseInboundModeToken(raw?: string | null): TelephonyInboundMode | null {
  const token = String(raw ?? '').trim().toLowerCase();
  if (!token) return null;
  if (SIMULTANEOUS_RING_ALIASES.has(token)) return 'simultaneous_ring';
  if (STANDALONE_IVR_ALIASES.has(token)) return 'standalone_ivr';
  return null;
}

/** Priority: `queryMode` -> `envMode` -> `configMode` -> `'standalone_ivr'` default. */
export function resolveTelephonyInboundMode(
  queryMode?: string | null,
  envMode?: string | null,
  configMode?: string | null
): TelephonyInboundMode {
  return (
    parseInboundModeToken(queryMode) ??
    parseInboundModeToken(envMode) ??
    parseInboundModeToken(configMode) ??
    'standalone_ivr'
  );
}

/**
 * Generates inbound Twilio Voice TwiML:
 * - `'simultaneous_ring'`: `answerOnBridge="true"`, zero `<Say>`, zero `<Record>`,
 *   zero `handle_unanswered` rollover; `<Reject reason="busy"/>` if unbridged so
 *   Nextiva desk/mobile phones & Nextiva voicemail keep ringing cleanly.
 * - `'standalone_ivr'`: legacy greeting + `handle_unanswered` rollover + optional forwarding.
 */
export function buildIncomingCallTwiml(options: BuildIncomingCallTwimlOptions): string {
  const identity = escapeTwimlXml(
    (options.clientIdentity || 'dispatch_agent').trim() || 'dispatch_agent'
  );
  const rawTimeout = options.timeoutSeconds;
  const hasCustomTimeout =
    typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0;

  if (options.mode === 'simultaneous_ring') {
    const timeout = hasCustomTimeout ? Math.round(rawTimeout) : 25;
    return (
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      `<Dial answerOnBridge="true" timeout="${timeout}" record="record-from-answer" recordingStatusCallback="/api/telephony?action=call_recording_status" recordingStatusCallbackEvent="completed">` +
      `<Client>${identity}</Client>` +
      '</Dial>' +
      '<Reject reason="busy"/>' +
      '</Response>'
    );
  }

  const timeout = hasCustomTimeout ? Math.round(rawTimeout) : 30;
  const forwarding = (options.forwardingPhone || '').trim();
  const numberTag = forwarding ? `<Number>${escapeTwimlXml(forwarding)}</Number>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    '<Say voice="alice">Thank you for calling Chesterfield Taxi. Connecting your call to dispatch.</Say>' +
    `<Dial timeout="${timeout}" record="record-from-answer" recordingStatusCallback="/api/telephony?action=call_recording_status" recordingStatusCallbackEvent="completed" action="/api/telephony?action=handle_unanswered">` +
    `<Client>${identity}</Client>${numberTag}` +
    '</Dial>' +
    '</Response>'
  );
}

/** Generates pure UTF-8 TwiML for WebRTC browser softphone outbound PSTN dialing. */
export function buildOutboundClientCallTwiml(options: BuildOutboundClientCallTwimlOptions): string {
  const cleanTo = String(options.to ?? '').trim();
  if (!cleanTo) {
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">No destination number was provided.</Say><Hangup/></Response>';
  }
  const cleanCallerId = String(options.callerId ?? '').trim();
  const callerIdAttr = cleanCallerId ? ` callerId="${escapeTwimlXml(cleanCallerId)}"` : '';
  const rawTimeout = options.timeoutSeconds;
  const timeout =
    typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) && rawTimeout > 0
      ? Math.round(rawTimeout)
      : 30;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Response>' +
    `<Dial${callerIdAttr} timeout="${timeout}" record="record-from-answer" recordingStatusCallback="/api/telephony?action=call_recording_status" recordingStatusCallbackEvent="completed" action="/api/telephony?action=voice_dial_status">` +
    `<Number>${escapeTwimlXml(cleanTo)}</Number>` +
    '</Dial>' +
    '</Response>'
  );
}

/** Generates diagnostic completion TwiML for `/api/telephony?action=voice_dial_status`. */
export function buildVoiceDialStatusTwiml(
  options: BuildVoiceDialStatusTwimlOptions = {}
): string {
  const status = String(options.dialCallStatus ?? '').trim().toLowerCase();
  if (status === 'failed') {
    return '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">The outbound call could not be completed. Please confirm your outbound caller ID is verified in Twilio Console.</Say><Hangup/></Response>';
  }
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}

/** Safe TwiML response returned when a voice webhook fails signature check or throws. */
export function buildVoiceWebhookErrorTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Dispatch voice webhook configuration check failed.</Say><Hangup/></Response>';
}

/** Prioritizes `fromNumber` -> `callerId` -> Verified `phoneNumber` -> `bridgePhoneNumber`. */
export function resolveOutboundCallerId(candidates: OutboundCallerIdCandidates): string {
  for (const val of [
    candidates.fromNumber,
    candidates.callerId,
    candidates.phoneNumber,
    candidates.bridgePhoneNumber,
  ]) {
    const trimmed = String(val ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Builds copy-ready Twilio Console & TwiML App webhook URLs for the given origin and mode. */
export function buildTelephonyWebhookUrls(
  origin: string,
  inboundMode: TelephonyInboundMode
): TelephonyWebhookUrls {
  const base = (origin || 'https://chesterfieldtaxi.com').trim().replace(/\/+$/, '');
  const inboundQuery =
    inboundMode === 'simultaneous_ring'
      ? 'action=incoming_call&mode=simulring'
      : 'action=incoming_call';
  return {
    inboundVoiceUrl: `${base}/api/telephony?${inboundQuery}`,
    outboundTwimlAppUrl: `${base}/api/telephony?action=voice_client_twiml`,
    callStatusCallbackUrl: `${base}/api/telephony?action=call_status_callback`,
  };
}
