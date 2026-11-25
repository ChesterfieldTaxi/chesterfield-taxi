/**
 * Server-Isolated Telephony Credentials, HMAC Signatures, Audio Proxy & JWT Voice Tokens
 * (`telephony-credentials.server.ts`)
 *
 * Extracted from `telephony-gateway.server.ts` (Phase 47):
 * - Telephony types, action classification sets, and bounded in-memory store
 * - Cryptographic `X-Twilio-Signature` validation (`computeTwilioWebhookSignature`,
 *   `verifyTwilioWebhookSignature`) using `node:crypto` HMAC-SHA1 + `timingSafeEqual`
 * - Short-lived HMAC-signed `audio_proxy` query tokens (`signAudioProxyToken`,
 *   `buildSignedAudioProxyUrl`, `verifyAudioProxyToken`) & protected audio proxy handler
 * - Server credential resolution, WebRTC `AccessToken`/`VoiceGrant` JWT builder, and
 *   multi-channel `sync_comms` payload builder.
 */

import crypto from 'node:crypto';
import twilio from 'twilio';
import {
  buildCommsEventId,
  type CommsChannel,
  type CommsEvent,
  type CommsThread,
} from '../../types/comms';
import {
  verifyServerRequestAuth,
  type VerifiedServerAuth,
} from '../auth/server-auth.server';
import { isFirebaseConfigured } from '../firebase';
import { flushAndSyncCommsServer, getCommsServerStore } from './comms-thread.server';
import {
  resolveTelephonyInboundMode,
  type TelephonyInboundMode,
} from './telephony-twiml.util';

export type TelephonyActionName =
  | 'make_call'
  | 'end_call'
  | 'get_call_status'
  | 'call_status_callback'
  | 'get_voice_token'
  | 'voice_client_twiml'
  | 'voice_dial_status'
  | 'send_sms'
  | 'verify_credentials'
  | 'save_credentials'
  | 'incoming_call'
  | 'incoming_sms'
  | 'handle_unanswered'
  | 'voicemail_recorded'
  | 'voicemail_transcription'
  | 'list_voicemails'
  | 'list_recordings'
  | 'list_messages'
  | 'call_recording_status'
  | 'audio_proxy'
  | 'sync_comms'
  | 'update_comms_status';

export interface TelephonyApiRequest {
  action: TelephonyActionName;
  to?: string;
  from?: string;
  body?: string;
  callSid?: string;
  status?: string;
  identity?: string;
  operatorPhone?: string;
  forwardingPhone?: string;
  isTestCall?: boolean;
  customTwiml?: string;
  recordingSid?: string;
  tripId?: string;
  eventIds?: string[];
  threadIds?: string[];
  channels?: CommsChannel[];
  isUnread?: boolean;
  isArchived?: boolean;
  isDeleted?: boolean;
  statusUpdatedAtMs?: number;
  events?: CommsEvent[];
  threads?: CommsThread[];
  credentials?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    bridgePhoneNumber?: string;
    inboundMode?: TelephonyInboundMode;
    apiKeySid?: string;
    apiKeySecret?: string;
    twimlAppSid?: string;
  };
}

export interface StoredVoicemail {
  id: string;
  contactPhone: string;
  contactName: string;
  recordingSid?: string;
  audioUrl: string;
  audioDuration?: string;
  transcription?: string;
  timestamp: string;
  timestampMs: number;
  isUnread: boolean;
  suggestedBooking?: {
    passengerName?: string;
    passengerPhone?: string;
    pickup?: string;
    dropoff?: string;
    pickupTime?: string;
    notes?: string;
  };
}

export interface StoredSms {
  id: string;
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  status?: string;
  errorCode?: number | string;
  errorMessage?: string;
  timestamp: string;
  timestampMs: number;
}

export interface TelephonyInMemoryStore {
  voicemails: StoredVoicemail[];
  messages: StoredSms[];
  callStatuses: Record<string, { status: string; timestamp: number }>;
  recordings: any[];
}

export const telephonyStore: TelephonyInMemoryStore = ((globalThis as any).__ct_telephony_store ||= {
  voicemails: [],
  messages: [],
  callStatuses: {},
  recordings: [],
});

const ephemeralProcessSecret: string = ((globalThis as any).__ct_telephony_audio_secret ||=
  crypto.randomBytes(32).toString('hex'));

export function resetTelephonyGatewayStoreForTests(): void {
  telephonyStore.voicemails = [];
  telephonyStore.messages = [];
  telephonyStore.callStatuses = {};
  telephonyStore.recordings = [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Classification Sets
// ─────────────────────────────────────────────────────────────────────────────

export const TWILIO_WEBHOOK_ACTIONS = new Set<string>([
  'incoming_call',
  'incoming_sms',
  'handle_unanswered',
  'voicemail_recorded',
  'voicemail_transcription',
  'call_status_callback',
  'call_recording_status',
  'voice_client_twiml',
  'voice_dial_status',
]);

export const DISPATCHER_ONLY_TELEPHONY_ACTIONS = new Set<string>([
  'get_voice_token',
  'list_messages',
  'list_recordings',
  'list_voicemails',
  'sync_comms',
  'update_comms_status',
  'verify_credentials',
  'save_credentials',
]);

export const OPERATOR_TELEPHONY_ACTIONS = new Set<string>([
  'make_call',
  'send_sms',
  'end_call',
  'get_call_status',
]);

export interface TelephonyHttpHandlerOptions {
  enforceAuth?: boolean;
  enforceWebhookSignature?: boolean;
  authResolver?: (request: Request) => Promise<VerifiedServerAuth>;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  skipFirestore?: boolean;
}

export interface ResolvedTelephonyCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  bridgePhoneNumber?: string;
  inboundMode?: TelephonyInboundMode;
  forwardingPhone: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
}

export function makeEnvReader(envOverride?: Record<string, string | undefined>) {
  return (key: string): string => {
    if (envOverride && key in envOverride) {
      return String(envOverride[key] ?? '').trim();
    }
    return String(process.env[key] ?? '').trim();
  };
}

export function shouldEnforceStaffAuth(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const flag = readEnv('TELEPHONY_ENFORCE_AUTH');
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return (
    readEnv('NODE_ENV') === 'production' ||
    Boolean(readEnv('ADMIN_API_SECRET')) ||
    isFirebaseConfigured()
  );
}

export function shouldEnforceTwilioWebhookSignature(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string,
  authToken: string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const validateSetting = readEnv('TWILIO_VALIDATE_WEBHOOK_SIGNATURE');
  if (validateSetting === 'false') return false;
  if (validateSetting === 'true') return Boolean(authToken);
  return readEnv('NODE_ENV') === 'production' && Boolean(authToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cryptographic `X-Twilio-Signature` Verification (HMAC-SHA1 + timingSafeEqual)
// ─────────────────────────────────────────────────────────────────────────────

export interface TwilioWebhookSignatureResult {
  valid: boolean;
  status: number;
  code?: 'MISSING_SECRET' | 'MISSING_HEADER' | 'SIGNATURE_MISMATCH';
  error?: string;
}

/**
 * Computes the expected Base64 HMAC-SHA1 `X-Twilio-Signature` per Twilio's webhook specification:
 * `HMAC-SHA1(authToken, url + sortedKeys.map(k => k + params[k]).join(''))`
 */
export function computeTwilioWebhookSignature(
  authToken: string,
  url: string,
  params?: Record<string, string> | null
): string {
  let dataToSign = url;
  if (params && typeof params === 'object') {
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      dataToSign += `${key}${params[key] ?? ''}`;
    }
  }
  return crypto.createHmac('sha1', authToken).update(dataToSign, 'utf8').digest('base64');
}

function resolveCandidateWebhookUrls(request?: Request, explicitUrl?: string): string[] {
  const candidates: string[] = [];
  const pushUnique = (u?: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };
  const pushWithApexWwwVariant = (rawUrl?: string) => {
    if (!rawUrl) return;
    pushUnique(rawUrl);
    try {
      const parsedUrl = new URL(rawUrl);
      const hostname = parsedUrl.hostname.toLowerCase();
      if (
        hostname &&
        hostname.includes('.') &&
        !/^\d+\.\d+\.\d+\.\d+$/.test(hostname) &&
        !hostname.startsWith('[')
      ) {
        const altHostname = hostname.startsWith('www.') ? hostname.slice(4) : `www.${hostname}`;
        if (altHostname.includes('.')) {
          const portSuffix = parsedUrl.port ? `:${parsedUrl.port}` : '';
          pushUnique(
            `${parsedUrl.protocol}//${altHostname}${portSuffix}${parsedUrl.pathname}${parsedUrl.search}`
          );
        }
      }
    } catch {
      // Ignore malformed candidate URLs
    }
  };

  if (explicitUrl) {
    pushWithApexWwwVariant(explicitUrl);
  }

  if (request) {
    try {
      const parsed = new URL(request.url);
      const fwdProtoRaw = request.headers.get('x-forwarded-proto');
      const fwdHostRaw = request.headers.get('x-forwarded-host');

      if (fwdProtoRaw || fwdHostRaw) {
        const proto =
          (fwdProtoRaw ? fwdProtoRaw.split(',')[0].trim() : '') ||
          parsed.protocol.replace(':', '');
        let host =
          (fwdHostRaw ? fwdHostRaw.split(',')[0].trim() : '') ||
          request.headers.get('host')?.trim() ||
          parsed.host;

        if (proto === 'https' && host.endsWith(':443')) {
          host = host.slice(0, -4);
        } else if (proto === 'http' && host.endsWith(':80')) {
          host = host.slice(0, -3);
        }

        pushWithApexWwwVariant(`${proto}://${host}${parsed.pathname}${parsed.search}`);
      }

      pushWithApexWwwVariant(request.url);
    } catch {
      pushUnique(request.url);
    }
  }

  return candidates;
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies Twilio's `X-Twilio-Signature` header against proxy-aware request URL(s)
 * and sorted POST form parameters using constant-time `crypto.timingSafeEqual`.
 */
export function verifyTwilioWebhookSignature(input: {
  request?: Request;
  url?: string;
  params?: Record<string, string> | null;
  signatureHeader?: string | null;
  authToken?: string | null;
}): TwilioWebhookSignatureResult {
  const cleanSecret = String(input.authToken ?? '').trim();
  if (!cleanSecret) {
    return {
      valid: false,
      status: 503,
      code: 'MISSING_SECRET',
      error: 'TWILIO_AUTH_TOKEN is not configured on the server.',
    };
  }

  const rawHeader =
    input.signatureHeader !== undefined
      ? input.signatureHeader
      : input.request?.headers.get('x-twilio-signature');

  const providedSig = typeof rawHeader === 'string' ? rawHeader.trim() : '';
  if (!providedSig) {
    return {
      valid: false,
      status: 403,
      code: 'MISSING_HEADER',
      error: 'Missing X-Twilio-Signature header.',
    };
  }

  const candidateUrls = resolveCandidateWebhookUrls(input.request, input.url);
  if (candidateUrls.length === 0) {
    return {
      valid: false,
      status: 403,
      code: 'SIGNATURE_MISMATCH',
      error: 'Unable to determine webhook URL for signature validation.',
    };
  }

  for (const candidateUrl of candidateUrls) {
    const expected = computeTwilioWebhookSignature(cleanSecret, candidateUrl, input.params);
    if (constantTimeStringEqual(providedSig, expected)) {
      return { valid: true, status: 200 };
    }
  }

  return {
    valid: false,
    status: 403,
    code: 'SIGNATURE_MISMATCH',
    error: 'Invalid X-Twilio-Signature header.',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Short-Lived HMAC-Signed `audio_proxy` Query Tokens (`sig` + `exp`)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_AUDIO_PROXY_TTL_SECONDS = 3600;
export const RECORDING_SID_PATTERN = /^[A-Za-z0-9_-]{4,80}$/;

function resolveAudioSigningSecret(
  readEnv?: (key: string) => string,
  explicitSecret?: string
): string {
  if (explicitSecret && explicitSecret.trim()) return explicitSecret.trim();
  const reader = readEnv ?? makeEnvReader();
  return (
    reader('TELEPHONY_SIGNING_SECRET') ||
    reader('TWILIO_AUTH_TOKEN') ||
    reader('ADMIN_API_SECRET') ||
    ephemeralProcessSecret
  );
}

export function signAudioProxyToken(
  recordingSid: string,
  expSeconds: number,
  secret?: string
): string {
  const signingKey = resolveAudioSigningSecret(undefined, secret);
  return crypto
    .createHmac('sha256', signingKey)
    .update(`audio_proxy:${recordingSid}:${expSeconds}`, 'utf8')
    .digest('hex');
}

export function buildSignedAudioProxyUrl(
  recordingSid: string,
  options?: {
    ttlSeconds?: number;
    nowMs?: number;
    secret?: string;
    env?: Record<string, string | undefined>;
  }
): string {
  const cleanSid = String(recordingSid || '').trim();
  if (!cleanSid) return '';
  const nowMs = options?.nowMs ?? Date.now();
  const ttlSec = options?.ttlSeconds ?? DEFAULT_AUDIO_PROXY_TTL_SECONDS;
  const expSec = Math.floor(nowMs / 1000) + ttlSec;
  const secret = resolveAudioSigningSecret(makeEnvReader(options?.env), options?.secret);
  const sig = signAudioProxyToken(cleanSid, expSec, secret);
  return `/api/telephony?action=audio_proxy&recordingSid=${encodeURIComponent(
    cleanSid
  )}&exp=${expSec}&sig=${sig}`;
}

export function verifyAudioProxyToken(
  recordingSid: string,
  expParam: string | null | undefined,
  sigParam: string | null | undefined,
  options?: {
    nowMs?: number;
    secret?: string;
    env?: Record<string, string | undefined>;
  }
): { valid: boolean; status: number; reason?: 'missing' | 'expired' | 'mismatch' } {
  const cleanExp = String(expParam ?? '').trim();
  const cleanSig = String(sigParam ?? '').trim();
  if (!cleanExp || !cleanSig) {
    return { valid: false, status: 401, reason: 'missing' };
  }

  const expSec = Number(cleanExp);
  const nowSec = Math.floor((options?.nowMs ?? Date.now()) / 1000);
  if (!Number.isInteger(expSec) || expSec <= nowSec) {
    return { valid: false, status: 403, reason: 'expired' };
  }

  const secret = resolveAudioSigningSecret(makeEnvReader(options?.env), options?.secret);
  const expectedSig = signAudioProxyToken(recordingSid, expSec, secret);
  if (!constantTimeStringEqual(cleanSig, expectedSig)) {
    return { valid: false, status: 403, reason: 'mismatch' };
  }

  return { valid: true, status: 200 };
}

export function attachSignedAudioUrlsToEvent(
  evt: CommsEvent,
  options?: { nowMs?: number; env?: Record<string, string | undefined> }
): CommsEvent {
  const recSid =
    evt.recordingSid || (evt.channel === 'voicemail' ? evt.externalSid : undefined);
  if (!recSid || !RECORDING_SID_PATTERN.test(recSid)) {
    return evt;
  }
  return {
    ...evt,
    audioUrl: buildSignedAudioProxyUrl(recSid, options),
  };
}

export async function handleTelephonyAudioProxyGet(params: {
  request: Request;
  url: URL;
  resolved: ResolvedTelephonyCredentials;
  options?: TelephonyHttpHandlerOptions;
}): Promise<Response> {
  const { request, url, resolved, options } = params;
  const readEnv = makeEnvReader(options?.env);
  const fetchFn = options?.fetchImpl ?? fetch;
  const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;

  const recordingSid = (url.searchParams.get('recordingSid') || '').trim();
  if (!recordingSid || !RECORDING_SID_PATTERN.test(recordingSid)) {
    return Response.json(
      { success: false, error: 'Valid recordingSid is required.' },
      { status: 400 }
    );
  }

  const expParam = url.searchParams.get('exp');
  const sigParam = url.searchParams.get('sig');
  const hasQuerySignature = Boolean(expParam || sigParam);

  let authorized = false;
  let isAdminCaller = false;

  if (hasQuerySignature) {
    const tokenCheck = verifyAudioProxyToken(recordingSid, expParam, sigParam, {
      nowMs: options?.nowMs,
      env: options?.env,
    });
    if (tokenCheck.valid) {
      authorized = true;
    } else {
      const auth = await resolveAuth(request);
      if (auth.authenticated && auth.isDispatcher) {
        authorized = true;
        isAdminCaller = auth.isAdmin;
      } else {
        return Response.json(
          {
            success: false,
            code: tokenCheck.reason === 'expired' ? 'AUDIO_TOKEN_EXPIRED' : 'INVALID_AUDIO_TOKEN',
            error: 'Invalid or expired signed audio token.',
          },
          { status: 403 }
        );
      }
    }
  } else {
    const auth = await resolveAuth(request);
    if (!auth.authenticated) {
      return Response.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Authentication or signed audio token required for audio playback.',
        },
        { status: 401 }
      );
    }
    if (!auth.isDispatcher) {
      return Response.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Dispatcher or Admin role required for audio playback.',
        },
        { status: 403 }
      );
    }
    authorized = true;
    isAdminCaller = auth.isAdmin;
  }

  if (!authorized) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const allowClientCreds = readEnv('NODE_ENV') !== 'production' || isAdminCaller;
  const clientAccountSid = allowClientCreds ? url.searchParams.get('accountSid') : null;
  const clientAuthToken = allowClientCreds ? url.searchParams.get('authToken') : null;
  const accountSid = clientAccountSid || resolved.accountSid;
  const authToken = clientAuthToken || resolved.authToken;

  if (!accountSid || !authToken) {
    return Response.json(
      { success: false, error: 'Twilio credentials not configured.' },
      { status: 503 }
    );
  }

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const twilioAudioUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Recordings/${encodeURIComponent(recordingSid)}.mp3`;

  try {
    const resp = await fetchFn(twilioAudioUrl, {
      headers: { Authorization: authHeader },
    });

    if (!resp.ok) {
      return new Response('Audio stream unavailable or not found', { status: resp.status });
    }

    const audioBuffer = await resp.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err: any) {
    return new Response(`Error proxying audio: ${err.message}`, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Server Credential Resolution, Voice Token & Sync Payload Helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function resolveCredentials(
  data?: TelephonyApiRequest,
  envOverride?: Record<string, string | undefined>
): Promise<ResolvedTelephonyCredentials> {
  const readEnv = makeEnvReader(envOverride);
  let accountSid = (readEnv('TWILIO_ACCOUNT_SID') || data?.credentials?.accountSid || '').trim();
  let authToken = (readEnv('TWILIO_AUTH_TOKEN') || data?.credentials?.authToken || '').trim();
  let phoneNumber = (
    readEnv('TWILIO_PHONE_NUMBER') ||
    data?.credentials?.phoneNumber ||
    ''
  ).trim();
  let bridgePhoneNumber = (
    readEnv('TWILIO_BRIDGE_PHONE_NUMBER') ||
    data?.credentials?.bridgePhoneNumber ||
    ''
  ).trim();
  let rawInboundMode = (
    readEnv('TWILIO_INBOUND_MODE') ||
    data?.credentials?.inboundMode ||
    ''
  ).trim();
  let apiKeySid = (
    readEnv('TWILIO_API_KEY_SID') ||
    readEnv('TWILIO_API_KEY') ||
    data?.credentials?.apiKeySid ||
    ''
  ).trim();
  let apiKeySecret = (
    readEnv('TWILIO_API_KEY_SECRET') ||
    readEnv('TWILIO_API_SECRET') ||
    data?.credentials?.apiKeySecret ||
    ''
  ).trim();
  let twimlAppSid = (
    readEnv('TWILIO_TWIML_APP_SID') ||
    readEnv('TWILIO_APP_SID') ||
    data?.credentials?.twimlAppSid ||
    ''
  ).trim();
  let forwardingPhone = (
    readEnv('DISPATCH_FORWARDING_PHONE') ||
    readEnv('DISPATCH_PHONE_NUMBER') ||
    readEnv('FORWARDING_PHONE_NUMBER') ||
    data?.operatorPhone ||
    data?.forwardingPhone ||
    ''
  ).trim();

  if (
    !envOverride &&
    (!accountSid ||
      !authToken ||
      !phoneNumber ||
      !bridgePhoneNumber ||
      !rawInboundMode ||
      !forwardingPhone ||
      !apiKeySid ||
      !apiKeySecret ||
      !twimlAppSid)
  ) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      for (const envFile of ['.env.local', '.env']) {
        const envPath = path.resolve(process.cwd(), envFile);
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          const sidMatch = content.match(/^TWILIO_ACCOUNT_SID\s*=\s*["']?([^"'\r\n]+)["']?/m);
          const tokenMatch = content.match(/^TWILIO_AUTH_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?/m);
          const phoneMatch = content.match(/^TWILIO_PHONE_NUMBER\s*=\s*["']?([^"'\r\n]+)["']?/m);
          const bridgePhoneMatch = content.match(
            /^TWILIO_BRIDGE_PHONE_NUMBER\s*=\s*["']?([^"'\r\n]+)["']?/m
          );
          const inboundModeMatch = content.match(
            /^TWILIO_INBOUND_MODE\s*=\s*["']?([^"'\r\n]+)["']?/m
          );
          const apiKeyMatch = content.match(
            /^TWILIO_API_KEY(?:_SID)?\s*=\s*["']?([^"'\r\n]+)["']?/m
          );
          const apiSecretMatch = content.match(
            /^TWILIO_API_KEY_SECRET\s*=\s*["']?([^"'\r\n]+)["']?/m
          );
          const twimlAppMatch = content.match(
            /^TWILIO_TWIML_APP_SID\s*=\s*["']?([^"'\r\n]+)["']?/m
          );
          const fwdMatch =
            content.match(/^DISPATCH_FORWARDING_PHONE\s*=\s*["']?([^"'\r\n]+)["']?/m) ||
            content.match(/^DISPATCH_PHONE_NUMBER\s*=\s*["']?([^"'\r\n]+)["']?/m) ||
            content.match(/^FORWARDING_PHONE_NUMBER\s*=\s*["']?([^"'\r\n]+)["']?/m);

          if (!accountSid && sidMatch) accountSid = sidMatch[1].trim();
          if (!authToken && tokenMatch) authToken = tokenMatch[1].trim();
          if (!phoneNumber && phoneMatch) phoneNumber = phoneMatch[1].trim();
          if (!bridgePhoneNumber && bridgePhoneMatch) bridgePhoneNumber = bridgePhoneMatch[1].trim();
          if (!rawInboundMode && inboundModeMatch) rawInboundMode = inboundModeMatch[1].trim();
          if (!apiKeySid && apiKeyMatch) apiKeySid = apiKeyMatch[1].trim();
          if (!apiKeySecret && apiSecretMatch) apiKeySecret = apiSecretMatch[1].trim();
          if (!twimlAppSid && twimlAppMatch) twimlAppSid = twimlAppMatch[1].trim();
          if (!forwardingPhone && fwdMatch) forwardingPhone = fwdMatch[1].trim();
        }
      }
    } catch {
      // Ignore filesystem access exceptions in edge environments
    }
  }

  if (!phoneNumber && !bridgePhoneNumber) {
    phoneNumber = '+13142281454';
  }

  return {
    accountSid,
    authToken,
    phoneNumber,
    ...(bridgePhoneNumber ? { bridgePhoneNumber } : {}),
    ...(rawInboundMode
      ? { inboundMode: resolveTelephonyInboundMode(undefined, rawInboundMode, undefined) }
      : {}),
    forwardingPhone,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
  };
}

export function buildVoiceTokenResponse(params: {
  activeSid: string;
  activeApiKey: string;
  activeApiSecret: string;
  activeTwimlAppSid: string;
  identity: string;
  phoneNumber: string;
}): Response {
  if (
    !params.activeSid ||
    !params.activeApiKey ||
    !params.activeApiSecret ||
    !params.activeTwimlAppSid
  ) {
    return Response.json(
      {
        success: false,
        code: 'MISSING_WEBRTC_CREDENTIALS',
        error:
          'Twilio API Key SID, API Key Secret, and TwiML App SID are required for in-browser softphone.',
        missing: {
          accountSid: !params.activeSid,
          apiKeySid: !params.activeApiKey,
          apiKeySecret: !params.activeApiSecret,
          twimlAppSid: !params.activeTwimlAppSid,
        },
      },
      { status: 400 }
    );
  }

  try {
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: params.activeTwimlAppSid,
      incomingAllow: true,
    });

    const token = new AccessToken(
      params.activeSid,
      params.activeApiKey,
      params.activeApiSecret,
      {
        identity: params.identity,
        ttl: 28800,
      }
    );
    token.addGrant(voiceGrant);

    return Response.json({
      success: true,
      token: token.toJwt(),
      identity: params.identity,
      phoneNumber: params.phoneNumber,
    });
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function buildSyncCommsPayload(
  auth: VerifiedServerAuth,
  options?: TelephonyHttpHandlerOptions,
  clientPayload?: { events?: CommsEvent[]; threads?: CommsThread[] }
) {
  const synced = await flushAndSyncCommsServer({
    staffBearerToken: auth.isDispatcher ? auth.rawToken : undefined,
    clientEvents: clientPayload?.events,
    clientThreads: clientPayload?.threads,
    skipFirestore: options?.skipFirestore,
  });

  const signOpts = { nowMs: options?.nowMs, env: options?.env };
  const signedEvents = synced.events.map((e) => attachSignedAudioUrlsToEvent(e, signOpts));
  const serverStore = getCommsServerStore();

  const signedVoicemails = telephonyStore.voicemails
    .filter((vm) => {
      const evt =
        serverStore.events.get(buildCommsEventId('voicemail', vm.recordingSid || vm.id)) ||
        serverStore.events.get(vm.id);
      if (evt?.isDeleted) return false;
      if (evt?.threadId && serverStore.threads.get(evt.threadId)?.isDeleted) return false;
      return true;
    })
    .map((vm) => {
      const evt =
        serverStore.events.get(buildCommsEventId('voicemail', vm.recordingSid || vm.id)) ||
        serverStore.events.get(vm.id);
      return {
        ...vm,
        isUnread: evt ? evt.isUnread : vm.isUnread,
        ...(evt?.isArchived !== undefined ? { isArchived: evt.isArchived } : {}),
        ...(evt?.statusUpdatedAtMs !== undefined
          ? { statusUpdatedAtMs: evt.statusUpdatedAtMs }
          : {}),
        transcription: evt?.transcription || vm.transcription,
        audioUrl:
          vm.recordingSid && RECORDING_SID_PATTERN.test(vm.recordingSid)
            ? buildSignedAudioProxyUrl(vm.recordingSid, signOpts)
            : vm.audioUrl,
      };
    });

  const activeMessages = telephonyStore.messages
    .filter((m) => {
      const evt =
        serverStore.events.get(buildCommsEventId('sms', m.sid || m.id)) ||
        serverStore.events.get(m.id);
      if (evt?.isDeleted) return false;
      if (evt?.threadId && serverStore.threads.get(evt.threadId)?.isDeleted) return false;
      return true;
    })
    .map((m) => {
      const evt =
        serverStore.events.get(buildCommsEventId('sms', m.sid || m.id)) ||
        serverStore.events.get(m.id);
      return {
        ...m,
        ...(evt ? { isUnread: evt.isUnread } : {}),
        ...(evt?.isArchived !== undefined ? { isArchived: evt.isArchived } : {}),
        ...(evt?.statusUpdatedAtMs !== undefined
          ? { statusUpdatedAtMs: evt.statusUpdatedAtMs }
          : {}),
      };
    });

  const signedRecordings = (telephonyStore.recordings || []).map((rec: any) => ({
    ...rec,
    audioUrl:
      rec.sid && RECORDING_SID_PATTERN.test(rec.sid)
        ? buildSignedAudioProxyUrl(rec.sid, signOpts)
        : rec.audioUrl,
  }));

  return {
    success: true,
    threads: synced.threads,
    events: signedEvents,
    voicemails: signedVoicemails,
    messages: activeMessages,
    recordings: signedRecordings,
    flushedCount: synced.flushedCount,
    syncedAt: new Date(options?.nowMs ?? Date.now()).toISOString(),
  };
}
