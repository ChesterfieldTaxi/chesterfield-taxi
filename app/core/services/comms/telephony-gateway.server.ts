/**
 * Server-Isolated Telephony & Twilio Gateway (`telephony-gateway.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) — isolates `twilio`, `node:crypto`, `node:fs`,
 * `node:path`, and secret credentials so `app/routes/api.telephony.ts` compiles to
 * a `0.00 kB` client bundle.
 *
 * Security & Persistence Guarantees:
 * 1. Cryptographic `X-Twilio-Signature` validation (`verifyTwilioWebhookSignature`)
 *    using `node:crypto` HMAC-SHA1 + `crypto.timingSafeEqual` over proxy-aware URL +
 *    lexicographically sorted POST form parameters.
 * 2. Full `GET` & `POST` staff/operator authentication via `verifyServerRequestAuth`:
 *    - `auth.isDispatcher`: `get_voice_token`, `list_messages`, `list_recordings`,
 *      `list_voicemails`, `sync_comms`, `verify_credentials`, `save_credentials`.
 *    - `auth.isDispatcher || auth.isDriver`: `make_call`, `send_sms`, `end_call`, `get_call_status`.
 * 3. Protected `GET /api/telephony?action=audio_proxy`: requires either a verified staff
 *    `Authorization` Bearer header OR a short-lived server-signed HMAC query token
 *    (`sig` + `exp`, automatically appended to `audioUrl` values returned to staff).
 * 4. Unified multi-channel persistence of all inbound/outbound SMS, call statuses,
 *    call recordings, voicemails, and voicemail transcriptions via `comms-thread.server.ts`.
 */

import crypto from 'node:crypto';
import twilio from 'twilio';
import type { CommsEvent, CommsThread } from '../../types/comms';
import {
  formatDisplayPhone,
  sanitizePhoneNumber,
  sanitizeToE164,
  toE164,
  validatePhoneNumber,
} from '../../utils/phone';
import {
  verifyServerRequestAuth,
  type VerifiedServerAuth,
} from '../auth/server-auth.server';
import { getContactService } from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  attachCallRecordingServer,
  flushAndSyncCommsServer,
  getCommsServerStore,
  ingestCommsEventServer,
  updateVoicemailTranscriptionServer,
} from './comms-thread.server';

export {
  formatDisplayPhone,
  sanitizePhoneNumber,
  sanitizeToE164,
  toE164,
  validatePhoneNumber,
};

export type TelephonyActionName =
  | 'make_call'
  | 'end_call'
  | 'get_call_status'
  | 'call_status_callback'
  | 'get_voice_token'
  | 'voice_client_twiml'
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
  | 'sync_comms';

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
  customTwiml?: string;
  recordingSid?: string;
  tripId?: string;
  events?: CommsEvent[];
  threads?: CommsThread[];
  credentials?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
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

const telephonyStore: {
  voicemails: StoredVoicemail[];
  messages: StoredSms[];
  callStatuses: Record<string, { status: string; timestamp: number }>;
  recordings: any[];
} = ((globalThis as any).__ct_telephony_store ||= {
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
]);

export const DISPATCHER_ONLY_TELEPHONY_ACTIONS = new Set<string>([
  'get_voice_token',
  'list_messages',
  'list_recordings',
  'list_voicemails',
  'sync_comms',
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

function makeEnvReader(envOverride?: Record<string, string | undefined>) {
  return (key: string): string => {
    if (envOverride && key in envOverride) {
      return String(envOverride[key] ?? '').trim();
    }
    return String(process.env[key] ?? '').trim();
  };
}

function shouldEnforceStaffAuth(
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

function shouldEnforceTwilioWebhookSignature(
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

  if (explicitUrl) {
    pushUnique(explicitUrl);
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

        pushUnique(`${proto}://${host}${parsed.pathname}${parsed.search}`);
      }

      pushUnique(request.url);
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
const RECORDING_SID_PATTERN = /^[A-Za-z0-9_-]{4,80}$/;

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

function attachSignedAudioUrlsToEvent(
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

// ─────────────────────────────────────────────────────────────────────────────
// 3. Server Credential Resolution
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCredentials(
  data?: TelephonyApiRequest,
  envOverride?: Record<string, string | undefined>
) {
  const readEnv = makeEnvReader(envOverride);
  let accountSid = (readEnv('TWILIO_ACCOUNT_SID') || data?.credentials?.accountSid || '').trim();
  let authToken = (readEnv('TWILIO_AUTH_TOKEN') || data?.credentials?.authToken || '').trim();
  let phoneNumber = (
    readEnv('TWILIO_PHONE_NUMBER') ||
    data?.credentials?.phoneNumber ||
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

  if (!phoneNumber) {
    phoneNumber = '+13142281454';
  }

  return {
    accountSid,
    authToken,
    phoneNumber,
    forwardingPhone,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
  };
}

function buildVoiceTokenResponse(params: {
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

async function buildSyncCommsPayload(
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

  const signedVoicemails = telephonyStore.voicemails.map((vm) => ({
    ...vm,
    audioUrl:
      vm.recordingSid && RECORDING_SID_PATTERN.test(vm.recordingSid)
        ? buildSignedAudioProxyUrl(vm.recordingSid, signOpts)
        : vm.audioUrl,
  }));

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
    messages: telephonyStore.messages,
    recordings: signedRecordings,
    flushedCount: synced.flushedCount,
    syncedAt: new Date(options?.nowMs ?? Date.now()).toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. `GET /api/telephony` Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleTelephonyGet(
  request: Request,
  options?: TelephonyHttpHandlerOptions
): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  const readEnv = makeEnvReader(options?.env);
  const fetchFn = options?.fetchImpl ?? fetch;
  const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;
  const resolved = await resolveCredentials(undefined, options?.env);

  // ─── A. PROTECTED AUDIO STREAMING PROXY (Staff Bearer OR Signed HMAC `sig`+`exp`) ───
  if (action === 'audio_proxy') {
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

  // ─── B. TWILIO WEBHOOK CALLBACKS (GET) — Enforce `X-Twilio-Signature` When Configured ───
  if (TWILIO_WEBHOOK_ACTIONS.has(action)) {
    if (
      shouldEnforceTwilioWebhookSignature(
        options?.enforceWebhookSignature,
        readEnv,
        resolved.authToken
      )
    ) {
      const sigResult = verifyTwilioWebhookSignature({
        request,
        params: null,
        authToken: resolved.authToken,
      });
      if (!sigResult.valid) {
        return Response.json(
          { success: false, code: sigResult.code, error: sigResult.error },
          { status: sigResult.status }
        );
      }
    }

    if (action === 'call_status_callback') {
      const callSid = url.searchParams.get('callSid') || url.searchParams.get('CallSid') || '';
      const callStatus =
        url.searchParams.get('CallStatus') || url.searchParams.get('status') || '';
      const from = url.searchParams.get('From') || url.searchParams.get('from') || '';
      const to = url.searchParams.get('To') || url.searchParams.get('to') || '';
      const callDuration = parseInt(
        url.searchParams.get('CallDuration') || url.searchParams.get('Duration') || '0',
        10
      );

      if (callSid && callStatus) {
        const lowerStatus = callStatus.toLowerCase();
        telephonyStore.callStatuses[callSid] = {
          status: lowerStatus,
          timestamp: options?.nowMs ?? Date.now(),
        };
        const isMissed = ['no-answer', 'busy', 'canceled', 'failed'].includes(lowerStatus);
        await ingestCommsEventServer(
          {
            channel: 'call',
            direction: 'inbound',
            eventType: isMissed ? 'call_missed' : 'call_inbound',
            externalSid: callSid,
            contactPhone: from || undefined,
            fromAddress: from || undefined,
            toAddress: to || resolved.phoneNumber,
            durationSeconds: Number.isFinite(callDuration) ? callDuration : 0,
            deliveryStatus: lowerStatus,
            snippet: isMissed ? `Missed Call (${lowerStatus})` : `Call ${lowerStatus}`,
            isUnread: isMissed ? true : undefined,
          },
          {
            webhookAction: 'call_status_callback',
            webhookId: `call_status_callback_${callSid}_${lowerStatus}`,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );
      }
      return Response.json({ success: true, callSid, status: callStatus });
    }

    if (action === 'voice_client_twiml') {
      const to = url.searchParams.get('To') || url.searchParams.get('to');
      const callerId =
        url.searchParams.get('FromNumber') ||
        url.searchParams.get('CallerId') ||
        url.searchParams.get('fromNumber') ||
        url.searchParams.get('callerId') ||
        resolved.phoneNumber;
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const response = new VoiceResponse();

      if (to) {
        const dial = response.dial({
          callerId: callerId ? sanitizeToE164(callerId) : undefined,
          record: 'record-from-answer',
          recordingStatusCallback: '/api/telephony?action=call_recording_status',
          recordingStatusCallbackEvent: ['completed'],
          timeout: 30,
        });
        dial.number(sanitizeToE164(to));
      } else {
        response.say({ voice: 'alice' }, 'No destination number provided.');
      }

      return new Response(response.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    if (action === 'incoming_call') {
      const formattedForwarding = resolved.forwardingPhone
        ? sanitizeToE164(resolved.forwardingPhone)
        : '';

      const VoiceResponse = twilio.twiml.VoiceResponse;
      const response = new VoiceResponse();
      response.say(
        { voice: 'alice' },
        'Thank you for calling Chesterfield Taxi. Connecting your call to dispatch.'
      );

      const dial = response.dial({
        timeout: 30,
        record: 'record-from-answer',
        recordingStatusCallback: '/api/telephony?action=call_recording_status',
        recordingStatusCallbackEvent: ['completed'],
        action: '/api/telephony?action=handle_unanswered',
      });
      dial.client('dispatch_agent');
      if (formattedForwarding) {
        dial.number(formattedForwarding);
      }

      return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    if (action === 'handle_unanswered') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Our dispatch team is currently assisting other passengers. Please leave your name, phone number, pickup location, and time after the tone. Press pound when finished.</Say>
  <Record maxLength="120" finishOnKey="#" action="/api/telephony?action=voicemail_recorded" transcribe="true" transcribeCallback="/api/telephony?action=voicemail_transcription" playBeep="true" />
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    if (action === 'voicemail_recorded') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you, your voicemail has been received and our dispatch team will prepare your ride.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    if (action === 'incoming_sms') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response/>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }
  }

  // ─── C. STAFF / OPERATOR AUTHENTICATED `GET` ENDPOINTS ───
  const auth = await resolveAuth(request);
  const enforceAuth = shouldEnforceStaffAuth(options?.enforceAuth, readEnv);
  const isOperatorAction = OPERATOR_TELEPHONY_ACTIONS.has(action);
  const isDispatcherAction = !action || DISPATCHER_ONLY_TELEPHONY_ACTIONS.has(action);

  if (enforceAuth && (isDispatcherAction || isOperatorAction)) {
    if (!auth.authenticated) {
      return Response.json(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Staff authentication required for telephony endpoint.',
        },
        { status: 401 }
      );
    }
    if (isDispatcherAction && !auth.isDispatcher) {
      return Response.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Dispatcher or Admin role required for telephony operations.',
        },
        { status: 403 }
      );
    }
    if (isOperatorAction && !auth.isDispatcher && !auth.isDriver) {
      return Response.json(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Driver, Dispatcher, or Admin role required.',
        },
        { status: 403 }
      );
    }
  }

  const allowClientCreds = readEnv('NODE_ENV') !== 'production' || auth.isAdmin;

  // ─── SYNC COMMS (GET) ───
  if (action === 'sync_comms') {
    const payload = await buildSyncCommsPayload(auth, options);
    return Response.json(payload);
  }

  // ─── GET CALL STATUS ───
  if (action === 'get_call_status') {
    const callSid = url.searchParams.get('callSid');
    if (!callSid) {
      return Response.json({ success: false, error: 'callSid is required' }, { status: 400 });
    }

    const cached = telephonyStore.callStatuses?.[callSid];
    if (cached && ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(cached.status)) {
      return Response.json({
        success: true,
        callSid,
        status: cached.status,
      });
    }

    const activeSid =
      (allowClientCreds
        ? request.headers.get('x-twilio-sid') ||
          url.searchParams.get('sid') ||
          url.searchParams.get('accountSid')
        : null) || resolved.accountSid;
    const activeToken =
      (allowClientCreds
        ? request.headers.get('x-twilio-token') ||
          url.searchParams.get('token') ||
          url.searchParams.get('authToken')
        : null) || resolved.authToken;

    if (!activeSid || !activeToken) {
      if (cached) {
        return Response.json({ success: true, callSid, status: cached.status });
      }
      return Response.json({ success: false, error: 'Twilio not configured' }, { status: 401 });
    }

    try {
      const authHeader =
        'Basic ' + Buffer.from(`${activeSid}:${activeToken}`).toString('base64');
      const resp = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          activeSid
        )}/Calls/${encodeURIComponent(callSid)}.json`,
        { headers: { Authorization: authHeader } }
      );
      const result = (await resp.json()) as any;
      if (resp.ok) {
        if (result.status) {
          telephonyStore.callStatuses[callSid] = {
            status: result.status.toLowerCase(),
            timestamp: options?.nowMs ?? Date.now(),
          };
        }
        return Response.json({
          success: true,
          callSid: result.sid,
          status: result.status,
          duration: parseInt(result.duration || '0', 10),
          direction: result.direction,
          from: result.from,
          to: result.to,
        });
      }
      return Response.json({ success: false, error: result.message }, { status: resp.status });
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  // ─── GET TWILIO WEBRTC VOICE ACCESS TOKEN (GET) ───
  if (action === 'get_voice_token') {
    const activeSid =
      (allowClientCreds
        ? url.searchParams.get('accountSid') || request.headers.get('x-twilio-sid')
        : null) || resolved.accountSid;
    const activeApiKey =
      (allowClientCreds
        ? url.searchParams.get('apiKeySid') ||
          url.searchParams.get('apiKey') ||
          request.headers.get('x-twilio-api-key')
        : null) || resolved.apiKeySid;
    const activeApiSecret =
      (allowClientCreds
        ? url.searchParams.get('apiKeySecret') ||
          url.searchParams.get('apiSecret') ||
          request.headers.get('x-twilio-api-secret')
        : null) || resolved.apiKeySecret;
    const activeTwimlAppSid =
      (allowClientCreds
        ? url.searchParams.get('twimlAppSid') || request.headers.get('x-twilio-twiml-app-sid')
        : null) || resolved.twimlAppSid;
    const identity = url.searchParams.get('identity') || 'dispatch_agent';

    return buildVoiceTokenResponse({
      activeSid,
      activeApiKey,
      activeApiSecret,
      activeTwimlAppSid,
      identity,
      phoneNumber: resolved.phoneNumber,
    });
  }

  const signOpts = { nowMs: options?.nowMs, env: options?.env };

  // ─── LIST VOICEMAILS (GET) ───
  if (action === 'list_voicemails') {
    const signedVoicemails = telephonyStore.voicemails.map((vm) => ({
      ...vm,
      audioUrl:
        vm.recordingSid && RECORDING_SID_PATTERN.test(vm.recordingSid)
          ? buildSignedAudioProxyUrl(vm.recordingSid, signOpts)
          : vm.audioUrl,
    }));
    return Response.json({
      success: true,
      voicemails: signedVoicemails,
    });
  }

  // ─── LIST RECORDINGS (GET) ───
  if (action === 'list_recordings') {
    const accountSid =
      (allowClientCreds ? url.searchParams.get('accountSid') : null) || resolved.accountSid;
    const authToken =
      (allowClientCreds ? url.searchParams.get('authToken') : null) || resolved.authToken;

    const inMemoryRecordings = (telephonyStore.recordings || []).map((r: any) => ({
      ...r,
      audioUrl:
        r.sid && RECORDING_SID_PATTERN.test(r.sid)
          ? buildSignedAudioProxyUrl(r.sid, signOpts)
          : r.audioUrl,
    }));

    if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
      return Response.json({ success: true, recordings: inMemoryRecordings });
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const recResp = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          accountSid
        )}/Recordings.json?PageSize=50`,
        { headers: { Authorization: authHeader } }
      );
      const recData = (await recResp.json()) as any;

      if (recResp.ok && Array.isArray(recData.recordings)) {
        const twilioRecordings = recData.recordings.map((r: any) => {
          const durSec = parseInt(r.duration || '30', 10);
          return {
            sid: r.sid,
            callSid: r.call_sid,
            duration: `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`,
            durationSeconds: durSec,
            dateCreated: r.date_created,
            audioUrl: buildSignedAudioProxyUrl(r.sid, signOpts),
          };
        });

        const seenSids = new Set<string>();
        const combined = [];
        for (const r of [...inMemoryRecordings, ...twilioRecordings]) {
          if (!seenSids.has(r.sid)) {
            seenSids.add(r.sid);
            combined.push(r);
          }
        }
        return Response.json({ success: true, recordings: combined });
      }
      return Response.json({ success: true, recordings: inMemoryRecordings });
    } catch {
      return Response.json({ success: true, recordings: inMemoryRecordings });
    }
  }

  // ─── LIST MESSAGES (GET) ───
  if (action === 'list_messages') {
    const accountSid =
      (allowClientCreds ? url.searchParams.get('accountSid') : null) || resolved.accountSid;
    const authToken =
      (allowClientCreds ? url.searchParams.get('authToken') : null) || resolved.authToken;

    const filterOutThankYou = (msgs: any[]) =>
      msgs.filter((m: any) => !m.body?.includes('Thank you for contacting our dispatch desk'));

    if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
      return Response.json({ success: true, messages: filterOutThankYou(telephonyStore.messages) });
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const msgResp = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          accountSid
        )}/Messages.json?PageSize=50`,
        { headers: { Authorization: authHeader } }
      );
      const msgData = (await msgResp.json()) as any;

      if (msgResp.ok && Array.isArray(msgData.messages)) {
        const liveMessages: StoredSms[] = msgData.messages
          .filter((m: any) => !m.body?.includes('Thank you for contacting our dispatch desk'))
          .map((m: any) => ({
            id: m.sid,
            sid: m.sid,
            from: m.from,
            to: m.to,
            body: m.body,
            status: m.status,
            errorCode: m.error_code,
            errorMessage: m.error_message,
            direction: m.direction && m.direction.includes('inbound') ? 'inbound' : 'outbound',
            timestamp: new Date(m.date_sent || m.date_created).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestampMs: new Date(m.date_sent || m.date_created).getTime(),
          }));

        // Persist newly seen Twilio messages into unified CommsThreadServer store
        const serverStore = getCommsServerStore();
        for (const lm of liveMessages) {
          const evtId = `sms_${lm.sid}`;
          if (!serverStore.events.has(evtId)) {
            await ingestCommsEventServer(
              {
                channel: 'sms',
                direction: lm.direction,
                eventType: lm.direction === 'inbound' ? 'sms_inbound' : 'sms_outbound',
                externalSid: lm.sid,
                contactPhone: lm.direction === 'inbound' ? lm.from : lm.to,
                fromAddress: lm.from,
                toAddress: lm.to,
                snippet: lm.body,
                bodyText: lm.body,
                deliveryStatus: lm.status,
                errorCode: lm.errorCode,
                errorMessage: lm.errorMessage,
                isUnread: lm.direction === 'inbound',
                timestampMs: lm.timestampMs,
              },
              {
                staffBearerToken: auth.rawToken,
                skipFirestore: options?.skipFirestore,
                nowMs: options?.nowMs,
              }
            );
          }
        }

        const seenSids = new Set(liveMessages.map((m) => m.sid || m.id));
        const pendingLocal = filterOutThankYou(telephonyStore.messages).filter(
          (m: any) => !seenSids.has(m.sid || m.id)
        );
        const combined = [...pendingLocal, ...liveMessages].sort(
          (a: any, b: any) => (b.timestampMs || 0) - (a.timestampMs || 0)
        );
        return Response.json({ success: true, messages: combined });
      }
      return Response.json({ success: true, messages: filterOutThankYou(telephonyStore.messages) });
    } catch {
      return Response.json({ success: true, messages: filterOutThankYou(telephonyStore.messages) });
    }
  }

  // Default authenticated diagnostics
  const isConfigured = Boolean(
    resolved.accountSid &&
      resolved.authToken &&
      resolved.accountSid.startsWith('AC') &&
      resolved.authToken.length >= 16
  );

  return Response.json({
    status: isConfigured ? 'configured' : 'unconfigured',
    accountSid: resolved.accountSid
      ? `${resolved.accountSid.slice(0, 6)}...${resolved.accountSid.slice(-4)}`
      : null,
    phoneNumber: resolved.phoneNumber || null,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. `POST /api/telephony` Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleTelephonyPost(
  request: Request,
  options?: TelephonyHttpHandlerOptions
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const url = new URL(request.url);
    const queryAction = url.searchParams.get('action');
    const readEnv = makeEnvReader(options?.env);
    const fetchFn = options?.fetchImpl ?? fetch;
    const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;

    let data: TelephonyApiRequest = {
      action: (queryAction as TelephonyActionName) || 'verify_credentials',
    };
    const contentType = request.headers.get('content-type') || '';
    let formParamsForSignature: Record<string, string> | null = null;

    if (contentType.includes('application/json')) {
      try {
        const json = await request.json();
        data = { ...data, ...json };
      } catch {
        // Fall back to queryAction
      }
    } else if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      try {
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const rawText = await request.text();
          const searchParams = new URLSearchParams(rawText);
          const formObj: Record<string, any> = {};
          const strParams: Record<string, string> = {};
          searchParams.forEach((val, key) => {
            formObj[key] = val;
            strParams[key] = val;
          });
          formParamsForSignature = strParams;
          data = {
            ...formObj,
            action: (formObj.action ||
              queryAction ||
              (formObj.CallSid
                ? 'incoming_call'
                : formObj.MessageSid
                ? 'incoming_sms'
                : 'verify_credentials')) as TelephonyActionName,
            to: formObj.To || formObj.to,
            from: formObj.From || formObj.from,
            body: formObj.Body || formObj.body,
            credentials: formObj.credentials,
          };
        } else {
          const formData = await request.formData();
          const formObj: Record<string, any> = {};
          const strParams: Record<string, string> = {};
          formData.forEach((val, key) => {
            formObj[key] = val;
            if (typeof val === 'string') {
              strParams[key] = val;
            }
          });
          formParamsForSignature = strParams;
          data = {
            ...formObj,
            action: (formObj.action ||
              queryAction ||
              (formObj.CallSid
                ? 'incoming_call'
                : formObj.MessageSid
                ? 'incoming_sms'
                : 'verify_credentials')) as TelephonyActionName,
            to: formObj.To || formObj.to,
            from: formObj.From || formObj.from,
            body: formObj.Body || formObj.body,
            credentials: formObj.credentials,
          };
        }
      } catch {
        // Form parse error
      }
    }

    if (!data || !data.action) {
      return Response.json(
        { success: false, error: 'Malformed request: "action" is required.' },
        { status: 400 }
      );
    }

    const effectiveAction = data.action;
    const isWebhookAction =
      TWILIO_WEBHOOK_ACTIONS.has(effectiveAction) ||
      (queryAction ? TWILIO_WEBHOOK_ACTIONS.has(queryAction) : false);

    // Resolve server credentials first (without trusting unverified client secrets on webhooks)
    const baseResolved = await resolveCredentials(
      isWebhookAction ? undefined : data,
      options?.env
    );

    // ─── A. TWILIO WEBHOOK SIGNATURE GATE (`X-Twilio-Signature`) ───
    if (isWebhookAction) {
      if (
        shouldEnforceTwilioWebhookSignature(
          options?.enforceWebhookSignature,
          readEnv,
          baseResolved.authToken
        )
      ) {
        const sigResult = verifyTwilioWebhookSignature({
          request,
          params: formParamsForSignature || {},
          authToken: baseResolved.authToken,
        });
        if (!sigResult.valid) {
          return Response.json(
            { success: false, code: sigResult.code, error: sigResult.error },
            { status: sigResult.status }
          );
        }
      }
    }

    // ─── B. STAFF & OPERATOR AUTH GATE (`verifyServerRequestAuth`) ───
    const isDispatcherAction = DISPATCHER_ONLY_TELEPHONY_ACTIONS.has(effectiveAction);
    const isOperatorAction = OPERATOR_TELEPHONY_ACTIONS.has(effectiveAction);
    let auth: VerifiedServerAuth = {
      authenticated: false,
      isAdminSecret: false,
      roles: [],
      isAdmin: false,
      isDispatcher: false,
      isDriver: false,
      isCorporateManager: false,
    };

    if (isDispatcherAction || isOperatorAction) {
      auth = await resolveAuth(request);
      const enforceAuth = shouldEnforceStaffAuth(options?.enforceAuth, readEnv);
      if (enforceAuth) {
        if (!auth.authenticated) {
          return Response.json(
            {
              success: false,
              code: 'UNAUTHORIZED',
              error: 'Authentication required for telephony operations.',
            },
            { status: 401 }
          );
        }
        if (isDispatcherAction && !auth.isDispatcher) {
          return Response.json(
            {
              success: false,
              code: 'FORBIDDEN',
              error: 'Unauthorized: Dispatcher or Admin sign-in required.',
            },
            { status: 403 }
          );
        }
        if (isOperatorAction && !auth.isDispatcher && !auth.isDriver) {
          return Response.json(
            {
              success: false,
              code: 'FORBIDDEN',
              error: 'Unauthorized: Driver, Dispatcher, or Admin sign-in required.',
            },
            { status: 403 }
          );
        }
      }

      if (readEnv('NODE_ENV') === 'production' && !auth.isAdmin) {
        delete data.credentials;
      }
    }

    const {
      accountSid,
      authToken,
      phoneNumber: twilioFromNumber,
      forwardingPhone,
      apiKeySid,
      apiKeySecret,
      twimlAppSid,
    } = await resolveCredentials(data, options?.env);

    const signOpts = { nowMs: options?.nowMs, env: options?.env };

    // ─── SYNC COMMS (POST) ───
    if (effectiveAction === 'sync_comms') {
      const payload = await buildSyncCommsPayload(auth, options, {
        events: data.events,
        threads: data.threads,
      });
      return Response.json(payload);
    }

    // ─── GET TWILIO WEBRTC VOICE ACCESS TOKEN (POST) ───
    if (effectiveAction === 'get_voice_token') {
      const allowClientCreds = readEnv('NODE_ENV') !== 'production' || auth.isAdmin;
      const activeSid =
        (allowClientCreds
          ? data.credentials?.accountSid || request.headers.get('x-twilio-sid')
          : null) || accountSid;
      const activeApiKey =
        (allowClientCreds
          ? data.credentials?.apiKeySid || request.headers.get('x-twilio-api-key')
          : null) || apiKeySid;
      const activeApiSecret =
        (allowClientCreds
          ? data.credentials?.apiKeySecret || request.headers.get('x-twilio-api-secret')
          : null) || apiKeySecret;
      const activeTwimlAppSid =
        (allowClientCreds
          ? data.credentials?.twimlAppSid || request.headers.get('x-twilio-twiml-app-sid')
          : null) || twimlAppSid;
      const identity = data.identity || url.searchParams.get('identity') || 'dispatch_agent';

      return buildVoiceTokenResponse({
        activeSid,
        activeApiKey,
        activeApiSecret,
        activeTwimlAppSid,
        identity,
        phoneNumber: twilioFromNumber,
      });
    }

    // ─── TWIML APP OUTBOUND VOICE ROUTE (POST / Webhook) ───
    if (effectiveAction === 'voice_client_twiml' || queryAction === 'voice_client_twiml') {
      const to =
        data.to || (data as any).To || url.searchParams.get('To') || url.searchParams.get('to');
      const callerId =
        (data as any).FromNumber ||
        (data as any).fromNumber ||
        (data as any).CallerId ||
        (data as any).callerId ||
        url.searchParams.get('FromNumber') ||
        url.searchParams.get('CallerId') ||
        twilioFromNumber;
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const response = new VoiceResponse();

      if (to) {
        const dial = response.dial({
          callerId: callerId ? sanitizeToE164(callerId) : undefined,
          record: 'record-from-answer',
          recordingStatusCallback: '/api/telephony?action=call_recording_status',
          recordingStatusCallbackEvent: ['completed'],
          timeout: 30,
        });
        dial.number(sanitizeToE164(to));
      } else {
        response.say({ voice: 'alice' }, 'No destination number provided.');
      }

      return new Response(response.toString(), {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // ─── CALL RECORDING STATUS WEBHOOK CALLBACK (POST) ───
    if (effectiveAction === 'call_recording_status' || queryAction === 'call_recording_status') {
      const recordingSid =
        (data as any).RecordingSid || data.recordingSid || url.searchParams.get('RecordingSid');
      const callSid = (data as any).CallSid || data.callSid || url.searchParams.get('CallSid');
      const recordingDuration =
        (data as any).RecordingDuration || (data as any).recordingDuration || '30';
      const recordingStatus =
        (data as any).RecordingStatus || (data as any).recordingStatus || 'completed';

      if (recordingSid) {
        const durSec = parseInt(recordingDuration || '30', 10) || 30;
        const formattedDur = `${Math.floor(durSec / 60)}:${(durSec % 60)
          .toString()
          .padStart(2, '0')}`;
        const signedUrl = buildSignedAudioProxyUrl(recordingSid, signOpts);
        const newRecord = {
          sid: recordingSid,
          callSid: callSid || '',
          duration: formattedDur,
          durationSeconds: durSec,
          dateCreated: new Date(options?.nowMs ?? Date.now()).toISOString(),
          audioUrl: signedUrl,
          status: recordingStatus,
        };
        telephonyStore.recordings = (telephonyStore.recordings || []).filter(
          (r: any) => r.sid !== recordingSid
        );
        telephonyStore.recordings.unshift(newRecord);

        await attachCallRecordingServer({
          recordingSid,
          callSid: callSid || undefined,
          durationSeconds: durSec,
          audioDuration: formattedDur,
          audioUrl: signedUrl,
          status: recordingStatus,
          from: data.from,
          to: data.to,
          skipFirestore: options?.skipFirestore,
          nowMs: options?.nowMs,
        });
      }
      return Response.json({ success: true, recordingSid });
    }

    // ─── TWILIO CALL STATUS WEBHOOK CALLBACK (POST) ───
    if (effectiveAction === 'call_status_callback' || queryAction === 'call_status_callback') {
      const callSid =
        data.callSid ||
        (data as any).CallSid ||
        url.searchParams.get('callSid') ||
        (data as any).call_sid;
      const callStatus =
        data.status ||
        (data as any).CallStatus ||
        url.searchParams.get('CallStatus') ||
        (data as any).call_status;
      const callDuration = parseInt(
        String((data as any).CallDuration || (data as any).Duration || '0'),
        10
      );
      const directionRaw = String((data as any).Direction || 'inbound').toLowerCase();
      const isOutbound = directionRaw.includes('outbound');

      if (callSid && callStatus) {
        const lowerStatus = String(callStatus).toLowerCase();
        telephonyStore.callStatuses[callSid] = {
          status: lowerStatus,
          timestamp: options?.nowMs ?? Date.now(),
        };

        const isMissed =
          !isOutbound && ['no-answer', 'busy', 'canceled', 'failed'].includes(lowerStatus);
        const contactPhone = isOutbound ? data.to : data.from;
        const durSec = Number.isFinite(callDuration) ? callDuration : 0;
        const durFormatted =
          durSec > 0
            ? `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, '0')}`
            : undefined;

        await ingestCommsEventServer(
          {
            channel: 'call',
            direction: isOutbound ? 'outbound' : 'inbound',
            eventType: isMissed
              ? 'call_missed'
              : isOutbound
              ? 'call_outbound'
              : 'call_inbound',
            externalSid: callSid,
            contactPhone: contactPhone || undefined,
            fromAddress: data.from || undefined,
            toAddress: data.to || twilioFromNumber,
            durationSeconds: durSec,
            audioDuration: durFormatted,
            deliveryStatus: lowerStatus,
            snippet: isMissed
              ? `Missed Call (${formatDisplayPhone(contactPhone || 'Caller')})`
              : `${isOutbound ? 'Outbound' : 'Inbound'} Call (${durFormatted || lowerStatus})`,
            isUnread: isMissed ? true : isOutbound ? false : undefined,
          },
          {
            webhookAction: 'call_status_callback',
            webhookId: `call_status_callback_${callSid}_${lowerStatus}`,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );
      }
      return Response.json({ success: true, callSid, status: callStatus });
    }

    // ─── GET CALL STATUS ACTION (POST) ───
    if (effectiveAction === 'get_call_status') {
      const callSid = data.callSid || url.searchParams.get('callSid');
      if (!callSid) {
        return Response.json({ success: false, error: 'callSid is required' }, { status: 400 });
      }

      const cached = telephonyStore.callStatuses?.[callSid];
      if (
        cached &&
        ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(cached.status)
      ) {
        return Response.json({
          success: true,
          callSid,
          status: cached.status,
        });
      }

      if (!accountSid || !authToken) {
        if (cached) {
          return Response.json({ success: true, callSid, status: cached.status });
        }
        return Response.json({ success: false, error: 'Twilio not configured' }, { status: 401 });
      }
      try {
        const authHeader =
          'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
            accountSid
          )}/Calls/${encodeURIComponent(callSid)}.json`,
          { headers: { Authorization: authHeader } }
        );
        const result = (await resp.json()) as any;
        if (resp.ok) {
          if (result.status) {
            telephonyStore.callStatuses[callSid] = {
              status: result.status.toLowerCase(),
              timestamp: options?.nowMs ?? Date.now(),
            };
          }
          return Response.json({
            success: true,
            callSid: result.sid,
            status: result.status,
            duration: parseInt(result.duration || '0', 10),
            direction: result.direction,
            from: result.from,
            to: result.to,
          });
        }
        return Response.json({ success: false, error: result.message }, { status: resp.status });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500 });
      }
    }

    // ─── END ACTIVE CALL ACTION ───
    if (effectiveAction === 'end_call') {
      const callSid = data.callSid || url.searchParams.get('callSid');
      if (!callSid) {
        return Response.json({ success: false, error: 'callSid is required' }, { status: 400 });
      }
      if (!accountSid || !authToken) {
        return Response.json({ success: true, message: 'Local call ended' });
      }
      try {
        const authHeader =
          'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const endParams = new URLSearchParams();
        endParams.append('Status', 'completed');
        const endResp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
            accountSid
          )}/Calls/${encodeURIComponent(callSid)}.json`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: endParams.toString(),
          }
        );
        const endResult = (await endResp.json()) as any;
        return Response.json({ success: true, status: endResult.status });
      } catch (err: any) {
        return Response.json({ success: false, error: err.message }, { status: 500 });
      }
    }

    // ─── INBOUND WEBHOOK: VOICE CALL ───
    if (effectiveAction === 'incoming_call') {
      const inboundCallSid = (data as any).CallSid || data.callSid || '';
      const inboundFrom = data.from || (data as any).From || '';
      const inboundTo = data.to || (data as any).To || twilioFromNumber;

      if (inboundCallSid && inboundFrom) {
        await ingestCommsEventServer(
          {
            channel: 'call',
            direction: 'inbound',
            eventType: 'call_inbound',
            externalSid: inboundCallSid,
            contactPhone: inboundFrom,
            fromAddress: inboundFrom,
            toAddress: inboundTo,
            deliveryStatus: 'ringing',
            snippet: `Inbound Call (${formatDisplayPhone(inboundFrom)})`,
            isUnread: false,
          },
          {
            webhookAction: 'incoming_call',
            webhookId: `incoming_call_${inboundCallSid}`,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );
      }

      const formattedForwarding = forwardingPhone ? sanitizeToE164(forwardingPhone) : '';
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const response = new VoiceResponse();
      response.say(
        { voice: 'alice' },
        'Thank you for calling Chesterfield Taxi. Connecting your call to dispatch.'
      );

      const dial = response.dial({
        timeout: 30,
        record: 'record-from-answer',
        recordingStatusCallback: '/api/telephony?action=call_recording_status',
        recordingStatusCallbackEvent: ['completed'],
        action: '/api/telephony?action=handle_unanswered',
      });
      dial.client('dispatch_agent');
      if (formattedForwarding) {
        dial.number(formattedForwarding);
      }

      return new Response(response.toString(), { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── UNANSWERED INBOUND CALL ROLLOVER TO VOICEMAIL ───
    if (effectiveAction === 'handle_unanswered') {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Our dispatch team is currently assisting other passengers. Please leave your name, phone number, pickup location, and time after the tone. Press pound when finished.</Say>
  <Record maxLength="120" finishOnKey="#" action="/api/telephony?action=voicemail_recorded" transcribe="true" transcribeCallback="/api/telephony?action=voicemail_transcription" playBeep="true" />
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── VOICEMAIL RECORDED WEBHOOK ───
    if (effectiveAction === 'voicemail_recorded') {
      const formFrom = data.from || (data as any).From || 'Caller';
      const recordingUrl = (data as any).RecordingUrl || '';
      const recordingDuration = (data as any).RecordingDuration || '30';
      const recordingSid = (data as any).RecordingSid || data.recordingSid || '';
      const callSid = (data as any).CallSid || data.callSid || '';

      const durSec = parseInt(recordingDuration, 10) || 30;
      const formattedDur = `${Math.floor(durSec / 60)}:${(durSec % 60)
        .toString()
        .padStart(2, '0')}`;

      const resolution = getContactService().resolveUnifiedContact({
        phone: formFrom,
        autoLink: false,
      });

      const signedProxyUrl = recordingSid
        ? buildSignedAudioProxyUrl(recordingSid, signOpts)
        : recordingUrl;

      const ingested = await ingestCommsEventServer(
        {
          channel: 'voicemail',
          direction: 'inbound',
          eventType: 'voicemail',
          externalSid: recordingSid || callSid || `vm_${options?.nowMs ?? Date.now()}`,
          recordingSid: recordingSid || undefined,
          contactPhone: formFrom,
          contactName: resolution.contactName,
          fromAddress: formFrom,
          toAddress: data.to || twilioFromNumber,
          durationSeconds: durSec,
          audioDuration: formattedDur,
          audioUrl: signedProxyUrl,
          snippet: `Voicemail (${formattedDur})`,
          suggestedBooking: {
            passengerName: resolution.contactName || formFrom,
            passengerPhone: resolution.primaryPhone || formFrom,
            passengerEmail: resolution.primaryEmail,
            notes: `New Voicemail via Twilio Call (${formattedDur})`,
          },
          isUnread: true,
        },
        {
          webhookAction: 'voicemail_recorded',
          webhookId: `voicemail_recorded_${recordingSid || callSid || Date.now()}`,
          skipFirestore: options?.skipFirestore,
          nowMs: options?.nowMs,
        }
      );

      if (!ingested.webhookDuplicate) {
        const vmId = ingested.event.id;
        telephonyStore.voicemails = telephonyStore.voicemails.filter(
          (v) => v.id !== vmId && (!recordingSid || v.recordingSid !== recordingSid)
        );
        telephonyStore.voicemails.unshift({
          id: vmId,
          contactName: ingested.event.contactName,
          contactPhone: ingested.event.contactPhone || formFrom,
          recordingSid: recordingSid || undefined,
          audioUrl: signedProxyUrl,
          audioDuration: formattedDur,
          transcription: ingested.event.transcription,
          timestamp: 'Just now',
          timestampMs: ingested.event.timestampMs,
          isUnread: true,
          suggestedBooking: ingested.event.suggestedBooking,
        });
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you, your voicemail has been received and dispatch will prepare your reservation.</Say>
  <Hangup/>
</Response>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── VOICEMAIL TRANSCRIPTION WEBHOOK ───
    if (effectiveAction === 'voicemail_transcription') {
      const transcript = (data as any).TranscriptionText || (data as any).transcription || '';
      const recordingSid = (data as any).RecordingSid || data.recordingSid || '';
      const callSid = (data as any).CallSid || data.callSid || '';

      const vm = telephonyStore.voicemails.find(
        (v) =>
          (recordingSid && v.recordingSid === recordingSid) ||
          (recordingSid && v.id === `vm_${recordingSid}`) ||
          (callSid && v.id.includes(callSid))
      );
      if (vm) {
        vm.transcription = transcript;
        if (vm.suggestedBooking) {
          vm.suggestedBooking.notes = `Voicemail: "${transcript}"`;
        }
      }

      const serverUpdate = await updateVoicemailTranscriptionServer({
        recordingSid: recordingSid || undefined,
        callSid: callSid || undefined,
        transcription: transcript,
        from: data.from || (data as any).From,
        skipFirestore: options?.skipFirestore,
        nowMs: options?.nowMs,
      });

      return Response.json({
        success: true,
        updated: Boolean(vm || serverUpdate.updated),
        eventId: serverUpdate.event?.id,
      });
    }

    // ─── INBOUND WEBHOOK: SMS ───
    if (effectiveAction === 'incoming_sms') {
      const smsFrom = data.from || (data as any).From || 'Passenger';
      const smsBody = data.body || (data as any).Body || '';
      const sid = (data as any).MessageSid || (data as any).SmsSid || `msg_${options?.nowMs ?? Date.now()}`;
      const smsTo = data.to || (data as any).To || twilioFromNumber;

      const ingested = await ingestCommsEventServer(
        {
          channel: 'sms',
          direction: 'inbound',
          eventType: 'sms_inbound',
          externalSid: sid,
          contactPhone: smsFrom,
          fromAddress: smsFrom,
          toAddress: smsTo,
          snippet: smsBody,
          bodyText: smsBody,
          deliveryStatus: 'received',
          isUnread: true,
        },
        {
          webhookAction: 'incoming_sms',
          webhookId: `incoming_sms_${sid}`,
          skipFirestore: options?.skipFirestore,
          nowMs: options?.nowMs,
        }
      );

      if (!ingested.webhookDuplicate) {
        telephonyStore.messages = telephonyStore.messages.filter((m) => m.sid !== sid);
        telephonyStore.messages.unshift({
          id: ingested.event.id,
          sid,
          from: smsFrom,
          to: smsTo,
          body: smsBody,
          direction: 'inbound',
          timestamp: 'Just now',
          timestampMs: ingested.event.timestampMs,
        });
      }

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response/>`;
      return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
    }

    // ─── LIST VOICEMAILS VIA POST ───
    if (effectiveAction === 'list_voicemails') {
      const signedVoicemails = telephonyStore.voicemails.map((vm) => ({
        ...vm,
        audioUrl:
          vm.recordingSid && RECORDING_SID_PATTERN.test(vm.recordingSid)
            ? buildSignedAudioProxyUrl(vm.recordingSid, signOpts)
            : vm.audioUrl,
      }));
      return Response.json({ success: true, voicemails: signedVoicemails });
    }

    // ─── SAVE CREDENTIALS ENDPOINT ───
    if (effectiveAction === 'save_credentials') {
      const candidateSid = (data.credentials?.accountSid || accountSid || '').trim();
      const candidateToken = (data.credentials?.authToken || authToken || '').trim();
      const candidatePhone = (data.credentials?.phoneNumber || twilioFromNumber || '').trim();

      if (!candidateSid || !candidateToken) {
        return Response.json(
          {
            success: false,
            error: 'Twilio Account SID and Auth Token are required.',
          },
          { status: 400 }
        );
      }

      if (!candidateSid.startsWith('AC') || candidateSid.length < 30) {
        return Response.json(
          {
            success: false,
            error:
              "Invalid Account SID. Twilio Account SIDs must start with 'AC' followed by 32 alphanumeric characters.",
          },
          { status: 400 }
        );
      }

      const phoneValidation = validatePhoneNumber(candidatePhone);
      if (!phoneValidation.isValid) {
        return Response.json(
          {
            success: false,
            error: `Invalid Twilio Phone Number: ${phoneValidation.error}`,
          },
          { status: 400 }
        );
      }

      const authHeader =
        'Basic ' + Buffer.from(`${candidateSid}:${candidateToken}`).toString('base64');
      try {
        const verifyResp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(candidateSid)}.json`,
          { headers: { Authorization: authHeader } }
        );
        const verifyData = (await verifyResp.json()) as any;

        if (!verifyResp.ok) {
          return Response.json(
            {
              success: false,
              error:
                verifyData.message || 'Twilio authentication failed with provided credentials.',
              code: verifyData.code,
            },
            { status: 401 }
          );
        }

        process.env.TWILIO_ACCOUNT_SID = candidateSid;
        process.env.TWILIO_AUTH_TOKEN = candidateToken;
        process.env.TWILIO_PHONE_NUMBER = phoneValidation.e164;

        return Response.json({
          success: true,
          configured: true,
          friendlyName: verifyData.friendly_name || 'Active Account',
          accountSid: candidateSid,
          phoneNumber: phoneValidation.e164,
          message: `Twilio credentials verified & saved for "${
            verifyData.friendly_name || candidateSid
          }". Gateway is now live for calls & SMS!`,
        });
      } catch (networkErr: any) {
        return Response.json(
          {
            success: false,
            error: networkErr.message || 'Network error verifying Twilio credentials.',
          },
          { status: 500 }
        );
      }
    }

    const isConfigured = Boolean(
      accountSid && authToken && accountSid.startsWith('AC') && authToken.length >= 16
    );

    if (effectiveAction === 'verify_credentials') {
      if (!isConfigured) {
        return Response.json({
          success: false,
          configured: false,
          error:
            'Twilio credentials not configured. Please supply a valid Account SID starting with AC and Auth Token.',
        });
      }

      try {
        const authHeader =
          'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`,
          { headers: { Authorization: authHeader } }
        );
        const result = (await resp.json()) as any;

        if (resp.ok) {
          return Response.json({
            success: true,
            configured: true,
            friendlyName: result.friendly_name,
            status: result.status,
            accountSid,
            fromNumber: twilioFromNumber,
            message: 'Connected',
          });
        }
        return Response.json({
          success: false,
          configured: false,
          error: result.message || 'Twilio authentication failed',
          code: result.code,
        });
      } catch (err: any) {
        return Response.json({
          success: false,
          configured: false,
          error: err.message || 'Network error communicating with Twilio',
        });
      }
    }

    // Validate required inputs BEFORE short-circuiting on unconfigured Twilio so missing-param checks return 400
    if (effectiveAction === 'make_call' && !data.to) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_TO_NUMBER',
          error: 'Destination phone number "to" is required.',
          message: 'Number must be verified in Twilio Trial Console',
        },
        { status: 400 }
      );
    }

    if (effectiveAction === 'send_sms' && (!data.to || !data.body)) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_PARAMETERS',
          error: '"to" and "body" are required for SMS dispatch.',
        },
        { status: 400 }
      );
    }

    if (
      !isConfigured &&
      effectiveAction !== 'send_sms' &&
      effectiveAction !== 'list_recordings' &&
      effectiveAction !== 'list_messages'
    ) {
      const targetPhone = data.to ? toE164(data.to) : 'target phone';
      return Response.json({
        success: false,
        code: 'TWILIO_NOT_CONFIGURED',
        simulated: true,
        message: `Twilio credentials not configured. Your cell phone (${targetPhone}) will not ring until you enter your Twilio Account SID, Auth Token, and Twilio Phone Number in Admin > Integrations > Telephony.`,
        instructions:
          '1. Go to Admin Console > Integrations > Telephony.\n2. Enter your Twilio Account SID (starts with AC...) and Auth Token.\n3. Enter your Twilio Phone Number.\n4. Click "Save Telephony Credentials" and "Verify Twilio Credentials".',
      });
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // ─── 1. Outbound Voice Call via Twilio REST API ───
    if (effectiveAction === 'make_call') {
      const validationTo = validatePhoneNumber(data.to);
      const validationFrom = validatePhoneNumber(data.from || twilioFromNumber);

      if (!validationTo.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: validationTo.error || `Invalid destination number "${data.to}".`,
            message: validationTo.error || 'Number must be verified in Twilio Trial Console',
            to: data.to,
            formattedTo: validationTo.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400 }
        );
      }

      if (!validationFrom.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_FROM_NUMBER',
            error: validationFrom.error || `Invalid caller ID number "${data.from || twilioFromNumber}".`,
            message: validationFrom.error || 'Number must be verified in Twilio Trial Console',
            from: data.from || twilioFromNumber,
            formattedFrom: validationFrom.e164,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400 }
        );
      }

      const formattedTo = validationTo.e164;
      const formattedFrom = validationFrom.e164;
      const dispatchBridgePhone = (
        data.operatorPhone ||
        data.forwardingPhone ||
        forwardingPhone ||
        ''
      ).trim();

      if (!dispatchBridgePhone) {
        return Response.json(
          {
            success: false,
            code: 'NO_OPERATOR_PHONE',
            error: 'No dispatch operator phone configured.',
            message:
              'Please enter your mobile or desk phone number so Twilio can bridge you with the customer.',
          },
          { status: 400 }
        );
      }

      const formattedForwarding = sanitizeToE164(dispatchBridgePhone);
      const twiml = `<Response><Say voice="alice">Connecting you to Chesterfield Taxi dispatch desk.</Say><Dial timeout="25" record="record-from-answer" callerId="${formattedFrom}">${formattedForwarding}</Dial><Say voice="alice">Our dispatch agent was unable to connect. We will call you back shortly. Thank you.</Say><Hangup/></Response>`;

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Twiml', twiml);
      params.append('Record', 'true');

      try {
        const reqUrl = new URL(request.url);
        const callbackUrl = `${reqUrl.protocol}//${reqUrl.host}/api/telephony?action=call_status_callback`;
        params.append('StatusCallback', callbackUrl);
        params.append('StatusCallbackMethod', 'POST');
        params.append('StatusCallbackEvent', 'completed');
        params.append('StatusCallbackEvent', 'busy');
        params.append('StatusCallbackEvent', 'no-answer');
        params.append('StatusCallbackEvent', 'failed');
        params.append('StatusCallbackEvent', 'canceled');
      } catch {
        // Fallback gracefully
      }

      const callResp = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        }
      );

      const callResult = (await callResp.json()) as any;

      if (callResp.ok) {
        await ingestCommsEventServer(
          {
            channel: 'call',
            direction: 'outbound',
            eventType: 'call_outbound',
            externalSid: callResult.sid,
            contactPhone: formattedTo,
            fromAddress: formattedFrom,
            toAddress: formattedTo,
            tripId: data.tripId,
            deliveryStatus: callResult.status || 'initiated',
            snippet: `Outbound Call (${formatDisplayPhone(formattedTo)})`,
            isUnread: false,
            actorId: auth.uid,
            actorName: auth.email || 'Dispatcher',
          },
          {
            staffBearerToken: auth.rawToken,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );

        return Response.json({
          success: true,
          callSid: callResult.sid,
          status: callResult.status,
          to: callResult.to,
          from: callResult.from,
          message: `Outbound call placed to ${formattedTo}. Your cell phone should ring shortly!`,
        });
      }

      const isParamOrTrialIssue =
        callResult.code === 21608 ||
        callResult.code === 21211 ||
        callResult.code === 21212 ||
        callResult.code === 21606 ||
        callResult.code === 21219 ||
        callResult.code === 21408 ||
        callResult.code === 21614 ||
        (callResult.message &&
          (callResult.message.toLowerCase().includes('unverified') ||
            callResult.message.toLowerCase().includes('trial') ||
            callResult.message.toLowerCase().includes('verify') ||
            callResult.message.toLowerCase().includes('caller id') ||
            callResult.message.toLowerCase().includes('permission')));

      const errorMsg = isParamOrTrialIssue
        ? 'Number must be verified in Twilio Trial Console'
        : callResult.message || 'Twilio call placement failed';

      return Response.json(
        {
          success: false,
          code: isParamOrTrialIssue ? 'TWILIO_NUMBER_UNVERIFIED' : 'TWILIO_CALL_FAILED',
          error: errorMsg,
          message: 'Number must be verified in Twilio Trial Console',
          details: callResult.message,
          twilioCode: callResult.code,
          moreInfo:
            callResult.more_info || 'https://www.twilio.com/console/phone-numbers/verified',
          to: formattedTo,
          from: formattedFrom,
        },
        { status: 400 }
      );
    }

    // ─── 2. Send SMS Notification via Twilio REST API ───
    if (effectiveAction === 'send_sms') {
      const validationTo = validatePhoneNumber(data.to);
      const validationFrom = validatePhoneNumber(data.from || twilioFromNumber || '+13142281454');

      if (!validationTo.isValid) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: validationTo.error || `Invalid destination number "${data.to}".`,
            to: data.to,
            formattedTo: validationTo.e164,
          },
          { status: 400 }
        );
      }

      const formattedTo = validationTo.e164;
      const formattedFrom = validationFrom.isValid
        ? validationFrom.e164
        : twilioFromNumber || '+13142281454';
      const smsBody = String(data.body || '');

      if (!isConfigured || !accountSid || !authToken || !accountSid.startsWith('AC')) {
        const simSid = `sim_sms_${options?.nowMs ?? Date.now()}`;
        const ingested = await ingestCommsEventServer(
          {
            channel: 'sms',
            direction: 'outbound',
            eventType: 'sms_outbound',
            externalSid: simSid,
            contactPhone: formattedTo,
            fromAddress: formattedFrom,
            toAddress: formattedTo,
            snippet: smsBody,
            bodyText: smsBody,
            tripId: data.tripId,
            deliveryStatus: 'delivered',
            isUnread: false,
            actorId: auth.uid,
            actorName: auth.email || 'Dispatcher',
          },
          {
            staffBearerToken: auth.rawToken,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );

        telephonyStore.messages.unshift({
          id: ingested.event.id,
          sid: simSid,
          from: formattedFrom,
          to: formattedTo,
          body: smsBody,
          direction: 'outbound',
          status: 'delivered',
          timestamp: new Date(ingested.event.timestampMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          timestampMs: ingested.event.timestampMs,
        });

        return Response.json({
          success: true,
          simulated: true,
          messageSid: simSid,
          commsEventId: ingested.event.id,
          threadId: ingested.thread.id,
          status: 'delivered',
          to: formattedTo,
          from: formattedFrom,
          message: `SMS message simulated to ${formattedTo}.`,
        });
      }

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Body', smsBody);

      try {
        const smsResp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
            accountSid
          )}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          }
        );

        const smsResult = (await smsResp.json()) as any;

        if (smsResp.ok) {
          const ingested = await ingestCommsEventServer(
            {
              channel: 'sms',
              direction: 'outbound',
              eventType: 'sms_outbound',
              externalSid: smsResult.sid,
              contactPhone: formattedTo,
              fromAddress: formattedFrom,
              toAddress: formattedTo,
              snippet: smsBody,
              bodyText: smsBody,
              tripId: data.tripId,
              deliveryStatus: smsResult.status || 'sent',
              errorCode: smsResult.error_code,
              errorMessage: smsResult.error_message,
              isUnread: false,
              actorId: auth.uid,
              actorName: auth.email || 'Dispatcher',
            },
            {
              staffBearerToken: auth.rawToken,
              skipFirestore: options?.skipFirestore,
              nowMs: options?.nowMs,
            }
          );

          telephonyStore.messages.unshift({
            id: ingested.event.id,
            sid: smsResult.sid,
            from: formattedFrom,
            to: formattedTo,
            body: smsBody,
            direction: 'outbound',
            status: smsResult.status,
            errorCode: smsResult.error_code,
            errorMessage: smsResult.error_message,
            timestamp: new Date(ingested.event.timestampMs).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestampMs: ingested.event.timestampMs,
          });

          return Response.json({
            success: true,
            messageSid: smsResult.sid,
            commsEventId: ingested.event.id,
            threadId: ingested.thread.id,
            status: smsResult.status,
            to: smsResult.to,
            from: smsResult.from,
            message: `SMS message sent successfully to ${formattedTo}!`,
          });
        }

        const errorMsg = smsResult.message || 'Twilio SMS dispatch failed';
        const localSid = `sms_local_${options?.nowMs ?? Date.now()}`;
        const ingested = await ingestCommsEventServer(
          {
            channel: 'sms',
            direction: 'outbound',
            eventType: 'sms_outbound',
            externalSid: localSid,
            contactPhone: formattedTo,
            fromAddress: formattedFrom,
            toAddress: formattedTo,
            snippet: smsBody,
            bodyText: smsBody,
            tripId: data.tripId,
            deliveryStatus: 'failed',
            errorCode: smsResult.code,
            errorMessage: errorMsg,
            isUnread: false,
            actorId: auth.uid,
            actorName: auth.email || 'Dispatcher',
          },
          {
            staffBearerToken: auth.rawToken,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );

        telephonyStore.messages.unshift({
          id: ingested.event.id,
          sid: localSid,
          from: formattedFrom,
          to: formattedTo,
          body: smsBody,
          direction: 'outbound',
          status: 'failed',
          errorCode: smsResult.code,
          errorMessage: errorMsg,
          timestamp: new Date(ingested.event.timestampMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          timestampMs: ingested.event.timestampMs,
        });

        return Response.json(
          {
            success: false,
            simulated: false,
            messageSid: localSid,
            commsEventId: ingested.event.id,
            threadId: ingested.thread.id,
            status: 'failed',
            code: smsResult.code,
            error: errorMsg,
            to: formattedTo,
            from: formattedFrom,
            warning: errorMsg,
            message: `SMS dispatch failed: ${errorMsg}`,
          },
          { status: 400 }
        );
      } catch (err: any) {
        const localSid = `sms_local_${options?.nowMs ?? Date.now()}`;
        const ingested = await ingestCommsEventServer(
          {
            channel: 'sms',
            direction: 'outbound',
            eventType: 'sms_outbound',
            externalSid: localSid,
            contactPhone: formattedTo,
            fromAddress: formattedFrom,
            toAddress: formattedTo,
            snippet: smsBody,
            bodyText: smsBody,
            tripId: data.tripId,
            deliveryStatus: 'sent_simulated',
            isUnread: false,
            actorId: auth.uid,
            actorName: auth.email || 'Dispatcher',
          },
          {
            staffBearerToken: auth.rawToken,
            skipFirestore: options?.skipFirestore,
            nowMs: options?.nowMs,
          }
        );

        telephonyStore.messages.unshift({
          id: ingested.event.id,
          sid: localSid,
          from: formattedFrom,
          to: formattedTo,
          body: smsBody,
          direction: 'outbound',
          timestamp: new Date(ingested.event.timestampMs).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          timestampMs: ingested.event.timestampMs,
        });

        return Response.json({
          success: true,
          simulated: true,
          messageSid: localSid,
          commsEventId: ingested.event.id,
          threadId: ingested.thread.id,
          status: 'sent_simulated',
          to: formattedTo,
          from: formattedFrom,
          message: `SMS recorded locally (${err.message}).`,
        });
      }
    }

    // ─── LIST RECORDINGS VIA POST ───
    if (effectiveAction === 'list_recordings') {
      const inMemoryRecordings = (telephonyStore.recordings || []).map((r: any) => ({
        ...r,
        audioUrl:
          r.sid && RECORDING_SID_PATTERN.test(r.sid)
            ? buildSignedAudioProxyUrl(r.sid, signOpts)
            : r.audioUrl,
      }));
      if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
        return Response.json({ success: true, recordings: inMemoryRecordings });
      }
      try {
        const recResp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
            accountSid
          )}/Recordings.json?PageSize=50`,
          { headers: { Authorization: authHeader } }
        );
        const recData = (await recResp.json()) as any;
        if (recResp.ok && Array.isArray(recData.recordings)) {
          const twilioRecordings = recData.recordings.map((r: any) => {
            const durSec = parseInt(r.duration || '30', 10);
            return {
              sid: r.sid,
              callSid: r.call_sid,
              duration: `${Math.floor(durSec / 60)}:${(durSec % 60)
                .toString()
                .padStart(2, '0')}`,
              durationSeconds: durSec,
              dateCreated: r.date_created,
              audioUrl: buildSignedAudioProxyUrl(r.sid, signOpts),
            };
          });

          const seenSids = new Set<string>();
          const combined = [];
          for (const r of [...inMemoryRecordings, ...twilioRecordings]) {
            if (!seenSids.has(r.sid)) {
              seenSids.add(r.sid);
              combined.push(r);
            }
          }
          return Response.json({ success: true, recordings: combined });
        }
        return Response.json({ success: true, recordings: inMemoryRecordings });
      } catch {
        return Response.json({ success: true, recordings: inMemoryRecordings });
      }
    }

    // ─── LIST MESSAGES VIA POST ───
    if (effectiveAction === 'list_messages') {
      if (!isConfigured) {
        return Response.json({ success: true, messages: telephonyStore.messages });
      }
      try {
        const msgResp = await fetchFn(
          `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
            accountSid
          )}/Messages.json?PageSize=50`,
          { headers: { Authorization: authHeader } }
        );
        const msgData = (await msgResp.json()) as any;
        if (msgResp.ok && Array.isArray(msgData.messages)) {
          const liveMessages = msgData.messages.map((m: any) => ({
            id: m.sid,
            sid: m.sid,
            from: m.from,
            to: m.to,
            body: m.body,
            direction: m.direction && m.direction.includes('inbound') ? 'inbound' : 'outbound',
            timestamp: new Date(m.date_sent || m.date_created).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            timestampMs: new Date(m.date_sent || m.date_created).getTime(),
          }));
          return Response.json({ success: true, messages: liveMessages });
        }
        return Response.json({ success: true, messages: telephonyStore.messages });
      } catch {
        return Response.json({ success: true, messages: telephonyStore.messages });
      }
    }

    return Response.json(
      { success: false, error: `Unsupported telephony action: ${effectiveAction}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.telephony] Server error:', errorMessage);
    return Response.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
