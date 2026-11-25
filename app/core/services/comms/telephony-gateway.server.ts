/**
 * Server-Isolated Telephony & Twilio Gateway (`telephony-gateway.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) — isolates `twilio`, `node:crypto`, `node:fs`,
 * `node:path`, and secret credentials so `app/routes/api.telephony.ts` compiles to
 * a `0.00 kB` client bundle.
 *
 * Orchestrates authenticated staff/operator telephony endpoints and delegates:
 * - Credential resolution, `X-Twilio-Signature` HMAC-SHA1 verification, signed `audio_proxy`
 *   tokens, and WebRTC voice tokens to `telephony-credentials.server.ts`.
 * - Inbound TwiML & status/recording/voicemail/SMS webhooks to
 *   `telephony-twiml-webhooks.server.ts`.
 * - Outbound PSTN calls, SMS dispatch, and Twilio REST credential verification to
 *   `telephony-outbound-rest.server.ts`.
 */

import { buildCommsEventId } from '../../types/comms';
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
import {
  getCommsServerStore,
  ingestCommsEventServer,
  updateCommsStatusServer,
} from './comms-thread.server';
import {
  DISPATCHER_ONLY_TELEPHONY_ACTIONS,
  OPERATOR_TELEPHONY_ACTIONS,
  RECORDING_SID_PATTERN,
  TWILIO_WEBHOOK_ACTIONS,
  buildSignedAudioProxyUrl,
  buildSyncCommsPayload,
  buildVoiceTokenResponse,
  computeTwilioWebhookSignature,
  handleTelephonyAudioProxyGet,
  makeEnvReader,
  resetTelephonyGatewayStoreForTests,
  resolveCredentials,
  shouldEnforceStaffAuth,
  shouldEnforceTwilioWebhookSignature,
  signAudioProxyToken,
  telephonyStore,
  verifyAudioProxyToken,
  verifyTwilioWebhookSignature,
  type StoredSms,
  type StoredVoicemail,
  type TelephonyActionName,
  type TelephonyApiRequest,
  type TelephonyHttpHandlerOptions,
  type TwilioWebhookSignatureResult,
} from './telephony-credentials.server';
import {
  handleOutboundMakeCallPost,
  handleOutboundSendSmsPost,
  handleSaveOrVerifyTelephonyCredentialsPost,
} from './telephony-outbound-rest.server';
import {
  handleTelephonyWebhookGet,
  handleTelephonyWebhookPostAction,
} from './telephony-twiml-webhooks.server';
import {
  TWIML_VOICE_WEBHOOK_ACTIONS,
  buildVoiceWebhookErrorTwiml,
} from './telephony-twiml.util';

export {
  DISPATCHER_ONLY_TELEPHONY_ACTIONS,
  OPERATOR_TELEPHONY_ACTIONS,
  TWILIO_WEBHOOK_ACTIONS,
  buildSignedAudioProxyUrl,
  computeTwilioWebhookSignature,
  formatDisplayPhone,
  resetTelephonyGatewayStoreForTests,
  sanitizePhoneNumber,
  sanitizeToE164,
  signAudioProxyToken,
  toE164,
  validatePhoneNumber,
  verifyAudioProxyToken,
  verifyTwilioWebhookSignature,
};

export type {
  StoredSms,
  StoredVoicemail,
  TelephonyActionName,
  TelephonyApiRequest,
  TelephonyHttpHandlerOptions,
  TwilioWebhookSignatureResult,
};

function buildActiveSignedVoicemails(signOpts: {
  nowMs?: number;
  env?: Record<string, string | undefined>;
}) {
  const serverStore = getCommsServerStore();
  return telephonyStore.voicemails
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
}

function enrichAndFilterMessagesWithServerStore(msgs: any[]) {
  const serverStore = getCommsServerStore();
  return msgs
    .filter((m: any) => {
      if (m?.body?.includes('Thank you for contacting our dispatch desk')) return false;
      const rawSid = m?.sid || m?.id;
      const evt =
        (rawSid ? serverStore.events.get(buildCommsEventId('sms', rawSid)) : undefined) ||
        (m?.id ? serverStore.events.get(m.id) : undefined);
      if (evt?.isDeleted) return false;
      if (evt?.threadId && serverStore.threads.get(evt.threadId)?.isDeleted) return false;
      return true;
    })
    .map((m: any) => {
      const rawSid = m?.sid || m?.id;
      const evt =
        (rawSid ? serverStore.events.get(buildCommsEventId('sms', rawSid)) : undefined) ||
        (m?.id ? serverStore.events.get(m.id) : undefined);
      return {
        ...m,
        isUnread: evt ? evt.isUnread : m.direction === 'inbound' ? (m.isUnread ?? true) : false,
        ...(evt?.isArchived !== undefined ? { isArchived: evt.isArchived } : {}),
        ...(evt?.statusUpdatedAtMs !== undefined
          ? { statusUpdatedAtMs: evt.statusUpdatedAtMs }
          : {}),
      };
    });
}

function syncLegacyTelephonyStoreWithCommsStore(): void {
  const serverStore = getCommsServerStore();
  telephonyStore.voicemails = telephonyStore.voicemails
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
      return evt ? { ...vm, isUnread: evt.isUnread } : vm;
    });

  telephonyStore.messages = telephonyStore.messages.filter((m) => {
    const evt =
      serverStore.events.get(buildCommsEventId('sms', m.sid || m.id)) ||
      serverStore.events.get(m.id);
    if (evt?.isDeleted) return false;
    if (evt?.threadId && serverStore.threads.get(evt.threadId)?.isDeleted) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. `GET /api/telephony` Handler
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
    return handleTelephonyAudioProxyGet({ request, url, resolved, options });
  }

  // ─── B. TWILIO WEBHOOK CALLBACKS (GET) — Enforce `X-Twilio-Signature` When Configured ───
  if (TWILIO_WEBHOOK_ACTIONS.has(action)) {
    try {
      const webhookResp = await handleTelephonyWebhookGet({
        request,
        url,
        action,
        resolved,
        options,
      });
      if (webhookResp) {
        return webhookResp;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (TWIML_VOICE_WEBHOOK_ACTIONS.has(action)) {
        console.warn('[TelephonyWebhook] GET voice webhook exception:', {
          action,
          url: request.url,
          error: errMsg,
        });
        return new Response(buildVoiceWebhookErrorTwiml(), {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      throw err;
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
      phoneNumber: resolved.phoneNumber || resolved.bridgePhoneNumber || '',
    });
  }

  const signOpts = { nowMs: options?.nowMs, env: options?.env };

  // ─── LIST VOICEMAILS (GET) ───
  if (action === 'list_voicemails') {
    return Response.json({
      success: true,
      voicemails: buildActiveSignedVoicemails(signOpts),
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

    if (!accountSid || !authToken || !accountSid.startsWith('AC')) {
      return Response.json({
        success: true,
        messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
      });
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

        // Persist newly seen or status-progressed Twilio messages into CommsThreadServer store
        // without overwriting existing isDeleted, isArchived, or read status.
        const serverStore = getCommsServerStore();
        for (const lm of liveMessages) {
          const evtId = buildCommsEventId('sms', lm.sid);
          const existingEvt = serverStore.events.get(evtId);
          const existingThr = existingEvt
            ? serverStore.threads.get(existingEvt.threadId)
            : undefined;
          if (existingEvt?.isDeleted || existingThr?.isDeleted) {
            continue;
          }
          const deliveryChanged =
            existingEvt &&
            ((lm.status && existingEvt.deliveryStatus !== lm.status) ||
              (lm.errorCode !== undefined && existingEvt.errorCode !== lm.errorCode) ||
              (lm.errorMessage !== undefined && existingEvt.errorMessage !== lm.errorMessage));

          if (!existingEvt || deliveryChanged) {
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
                isUnread: existingEvt ? existingEvt.isUnread : lm.direction === 'inbound',
                isArchived: existingEvt?.isArchived,
                isDeleted: existingEvt?.isDeleted,
                statusUpdatedAtMs: existingEvt?.statusUpdatedAtMs,
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
        const pendingLocal = telephonyStore.messages.filter(
          (m: any) => !seenSids.has(m.sid || m.id)
        );
        const combined = enrichAndFilterMessagesWithServerStore([
          ...pendingLocal,
          ...liveMessages,
        ]).sort((a: any, b: any) => (b.timestampMs || 0) - (a.timestampMs || 0));
        return Response.json({ success: true, messages: combined });
      }
      return Response.json({
        success: true,
        messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
      });
    } catch {
      return Response.json({
        success: true,
        messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
      });
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
// 2. `POST /api/telephony` Handler
// ─────────────────────────────────────────────────────────────────────────────

function inferFallbackFormWebhookAction(formObj: Record<string, any>): TelephonyActionName {
  const rawFrom = String(formObj.From || formObj.from || '').trim().toLowerCase();
  if (rawFrom.startsWith('client:')) {
    return 'voice_client_twiml';
  }
  if (formObj.CallSid) {
    return 'incoming_call';
  }
  if (formObj.MessageSid) {
    return 'incoming_sms';
  }
  return 'verify_credentials';
}

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

  let detectedVoiceWebhookAction: string | null = null;
  try {
    const url = new URL(request.url);
    const queryAction = url.searchParams.get('action');
    if (queryAction && TWIML_VOICE_WEBHOOK_ACTIONS.has(queryAction)) {
      detectedVoiceWebhookAction = queryAction;
    }
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
              inferFallbackFormWebhookAction(formObj)) as TelephonyActionName,
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
              inferFallbackFormWebhookAction(formObj)) as TelephonyActionName,
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
    const isVoiceWebhook =
      TWIML_VOICE_WEBHOOK_ACTIONS.has(effectiveAction) ||
      (queryAction ? TWIML_VOICE_WEBHOOK_ACTIONS.has(queryAction) : false);
    if (isVoiceWebhook) {
      detectedVoiceWebhookAction = effectiveAction;
    }
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
          if (isVoiceWebhook) {
            console.warn('[TelephonyWebhook] POST signature check failed:', {
              action: effectiveAction,
              url: request.url,
              code: sigResult.code,
              error: sigResult.error,
            });
            return new Response(buildVoiceWebhookErrorTwiml(), {
              status: 403,
              headers: { 'Content-Type': 'text/xml' },
            });
          }
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
      bridgePhoneNumber,
      inboundMode,
      forwardingPhone,
      apiKeySid,
      apiKeySecret,
      twimlAppSid,
    } = await resolveCredentials(data, options?.env);

    const signOpts = { nowMs: options?.nowMs, env: options?.env };
    const effectiveFromNumber = twilioFromNumber || bridgePhoneNumber || '';

    // ─── C. TWIML & WEBHOOK POST ACTIONS ───
    const webhookPostResponse = await handleTelephonyWebhookPostAction({
      effectiveAction,
      queryAction,
      data,
      url,
      twilioFromNumber,
      bridgePhoneNumber,
      inboundMode,
      forwardingPhone,
      options,
    });
    if (webhookPostResponse) {
      return webhookPostResponse;
    }

    // ─── SYNC COMMS (POST) ───
    if (effectiveAction === 'sync_comms') {
      const payload = await buildSyncCommsPayload(auth, options, {
        events: data.events,
        threads: data.threads,
      });
      return Response.json(payload);
    }

    // ─── AUTHORITATIVE STATUS MUTATION (POST) ───
    if (effectiveAction === 'update_comms_status') {
      const statusResult = await updateCommsStatusServer({
        eventIds: data.eventIds,
        threadIds: data.threadIds,
        channels: data.channels,
        isUnread: data.isUnread,
        isArchived: data.isArchived,
        isDeleted: data.isDeleted,
        statusUpdatedAtMs: data.statusUpdatedAtMs,
        events: data.events,
        threads: data.threads,
        staffBearerToken: auth.isDispatcher ? auth.rawToken : undefined,
        skipFirestore: options?.skipFirestore,
        nowMs: options?.nowMs,
      });
      syncLegacyTelephonyStoreWithCommsStore();
      return Response.json({
        success: true,
        ...statusResult,
      });
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
        phoneNumber: effectiveFromNumber,
      });
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

    // ─── LIST VOICEMAILS VIA POST ───
    if (effectiveAction === 'list_voicemails') {
      return Response.json({
        success: true,
        voicemails: buildActiveSignedVoicemails(signOpts),
      });
    }

    const isConfigured = Boolean(
      accountSid && authToken && accountSid.startsWith('AC') && authToken.length >= 16
    );

    // ─── SAVE OR VERIFY CREDENTIALS ───
    const credsResponse = await handleSaveOrVerifyTelephonyCredentialsPost({
      effectiveAction,
      data,
      accountSid,
      authToken,
      twilioFromNumber: effectiveFromNumber,
      isConfigured,
      fetchFn,
    });
    if (credsResponse) {
      return credsResponse;
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
      return handleOutboundMakeCallPost({
        request,
        data,
        accountSid,
        authHeader,
        twilioFromNumber: effectiveFromNumber,
        forwardingPhone,
        auth,
        fetchFn,
        options,
      });
    }

    // ─── 2. Send SMS Notification via Twilio REST API ───
    if (effectiveAction === 'send_sms') {
      return handleOutboundSendSmsPost({
        data,
        accountSid,
        authToken,
        authHeader,
        twilioFromNumber: effectiveFromNumber,
        isConfigured,
        auth,
        fetchFn,
        options,
      });
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
        return Response.json({
          success: true,
          messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
        });
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
          return Response.json({
            success: true,
            messages: enrichAndFilterMessagesWithServerStore(liveMessages),
          });
        }
        return Response.json({
          success: true,
          messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
        });
      } catch {
        return Response.json({
          success: true,
          messages: enrichAndFilterMessagesWithServerStore(telephonyStore.messages),
        });
      }
    }

    return Response.json(
      { success: false, error: `Unsupported telephony action: ${effectiveAction}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (detectedVoiceWebhookAction) {
      console.warn('[TelephonyWebhook] Unhandled POST voice webhook error:', {
        action: detectedVoiceWebhookAction,
        url: request.url,
        error: errorMessage,
      });
      return new Response(buildVoiceWebhookErrorTwiml(), {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }
    console.error('[api.telephony] Server error:', errorMessage);
    return Response.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
