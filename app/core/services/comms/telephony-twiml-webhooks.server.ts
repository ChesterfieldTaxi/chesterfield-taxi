/**
 * Server-Isolated Twilio TwiML & Inbound/Callback Webhook Handlers
 * (`telephony-twiml-webhooks.server.ts`)
 *
 * Extracted from `telephony-gateway.server.ts` (Phase 47):
 * Handles all inbound Twilio TwiML generation (`incoming_call`, `voice_client_twiml`,
 * `handle_unanswered`, `voicemail_recorded`, `incoming_sms`) and asynchronous status/recording/
 * transcription webhook callbacks (`call_status_callback`, `call_recording_status`,
 * `voicemail_transcription`) across both `GET` and `POST` webhook deliveries.
 */

import { formatDisplayPhone, sanitizeToE164 } from '../../utils/phone';
import { getContactService } from '../customer/contact.service';
import {
  attachCallRecordingServer,
  ingestCommsEventServer,
  updateVoicemailTranscriptionServer,
} from './comms-thread.server';
import {
  buildSignedAudioProxyUrl,
  makeEnvReader,
  shouldEnforceTwilioWebhookSignature,
  telephonyStore,
  verifyTwilioWebhookSignature,
  type ResolvedTelephonyCredentials,
  type TelephonyApiRequest,
  type TelephonyHttpHandlerOptions,
} from './telephony-credentials.server';
import {
  TWIML_VOICE_WEBHOOK_ACTIONS,
  buildIncomingCallTwiml,
  buildOutboundClientCallTwiml,
  buildVoiceDialStatusTwiml,
  buildVoiceWebhookErrorTwiml,
  resolveOutboundCallerId,
  resolveTelephonyInboundMode,
  type TelephonyInboundMode,
} from './telephony-twiml.util';

export async function handleTelephonyWebhookGet(params: {
  request: Request;
  url: URL;
  action: string;
  resolved: ResolvedTelephonyCredentials;
  options?: TelephonyHttpHandlerOptions;
}): Promise<Response | null> {
  const { request, url, action, resolved, options } = params;
  const readEnv = makeEnvReader(options?.env);

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
      if (TWIML_VOICE_WEBHOOK_ACTIONS.has(action)) {
        console.warn('[TelephonyWebhook] GET signature check failed:', {
          action,
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
    const rawTo = url.searchParams.get('To') || url.searchParams.get('to') || '';
    const callerId = resolveOutboundCallerId({
      fromNumber: url.searchParams.get('FromNumber') || url.searchParams.get('fromNumber'),
      callerId: url.searchParams.get('CallerId') || url.searchParams.get('callerId'),
      phoneNumber: resolved.phoneNumber,
      bridgePhoneNumber: resolved.bridgePhoneNumber,
    });
    const formattedTo = rawTo.trim() ? sanitizeToE164(rawTo) : '';
    const formattedCallerId = callerId ? sanitizeToE164(callerId) : '';
    const twiml = buildOutboundClientCallTwiml({
      to: formattedTo,
      callerId: formattedCallerId || undefined,
    });

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  if (action === 'voice_dial_status') {
    const dialCallStatus =
      url.searchParams.get('DialCallStatus') ||
      url.searchParams.get('dialCallStatus') ||
      url.searchParams.get('CallStatus');
    const errorCode =
      url.searchParams.get('ErrorCode') ||
      url.searchParams.get('DialSipResponseCode') ||
      url.searchParams.get('errorCode');
    if (String(dialCallStatus || '').toLowerCase() === 'failed' || errorCode) {
      console.warn('[TelephonyWebhook] GET voice_dial_status failure:', {
        dialCallStatus,
        errorCode,
      });
    }
    return new Response(buildVoiceDialStatusTwiml({ dialCallStatus, errorCode }), {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  if (action === 'incoming_call') {
    const formattedForwarding = resolved.forwardingPhone
      ? sanitizeToE164(resolved.forwardingPhone)
      : '';
    const inboundMode = resolveTelephonyInboundMode(
      url.searchParams.get('mode'),
      readEnv('TWILIO_INBOUND_MODE'),
      resolved.inboundMode
    );
    const twiml = buildIncomingCallTwiml({
      mode: inboundMode,
      clientIdentity: 'dispatch_agent',
      forwardingPhone: formattedForwarding || undefined,
    });

    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
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

  return null;
}

export async function handleTelephonyWebhookPostAction(params: {
  effectiveAction: string;
  queryAction: string | null;
  data: TelephonyApiRequest;
  url: URL;
  twilioFromNumber: string;
  bridgePhoneNumber?: string;
  inboundMode?: TelephonyInboundMode;
  forwardingPhone: string;
  options?: TelephonyHttpHandlerOptions;
}): Promise<Response | null> {
  const {
    effectiveAction,
    queryAction,
    data,
    url,
    twilioFromNumber,
    bridgePhoneNumber,
    inboundMode,
    forwardingPhone,
    options,
  } = params;
  const readEnv = makeEnvReader(options?.env);
  const signOpts = { nowMs: options?.nowMs, env: options?.env };
  const fallbackNumber = twilioFromNumber || bridgePhoneNumber || '';

  // ─── TWIML APP OUTBOUND VOICE ROUTE (POST / Webhook) ───
  if (effectiveAction === 'voice_client_twiml' || queryAction === 'voice_client_twiml') {
    const rawTo =
      data.to || (data as any).To || url.searchParams.get('To') || url.searchParams.get('to') || '';
    const callerId = resolveOutboundCallerId({
      fromNumber:
        (data as any).FromNumber ||
        (data as any).fromNumber ||
        url.searchParams.get('FromNumber') ||
        url.searchParams.get('fromNumber'),
      callerId:
        (data as any).CallerId ||
        (data as any).callerId ||
        url.searchParams.get('CallerId') ||
        url.searchParams.get('callerId'),
      phoneNumber: twilioFromNumber,
      bridgePhoneNumber,
    });
    const formattedTo = String(rawTo).trim() ? sanitizeToE164(String(rawTo)) : '';
    const formattedCallerId = callerId ? sanitizeToE164(callerId) : '';
    const twiml = buildOutboundClientCallTwiml({
      to: formattedTo,
      callerId: formattedCallerId || undefined,
    });

    return new Response(twiml, {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // ─── OUTBOUND CLIENT DIAL COMPLETION / DIAGNOSTICS (POST / Webhook) ───
  if (effectiveAction === 'voice_dial_status' || queryAction === 'voice_dial_status') {
    const dialCallStatus =
      (data as any).DialCallStatus ||
      (data as any).dialCallStatus ||
      data.status ||
      (data as any).CallStatus ||
      url.searchParams.get('DialCallStatus');
    const errorCode =
      (data as any).ErrorCode ||
      (data as any).errorCode ||
      (data as any).DialSipResponseCode ||
      url.searchParams.get('ErrorCode');
    if (String(dialCallStatus || '').toLowerCase() === 'failed' || errorCode) {
      console.warn('[TelephonyWebhook] POST voice_dial_status failure:', {
        callSid: (data as any).CallSid || data.callSid,
        dialCallStatus,
        errorCode,
      });
    }
    return new Response(buildVoiceDialStatusTwiml({ dialCallStatus, errorCode }), {
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

  // ─── INBOUND WEBHOOK: VOICE CALL ───
  if (effectiveAction === 'incoming_call') {
    const inboundCallSid = (data as any).CallSid || data.callSid || '';
    const inboundFrom = data.from || (data as any).From || '';
    const inboundTo = data.to || (data as any).To || fallbackNumber;

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
    const resolvedMode = resolveTelephonyInboundMode(
      url.searchParams.get('mode') || (data as any).mode,
      readEnv('TWILIO_INBOUND_MODE'),
      inboundMode
    );
    const twiml = buildIncomingCallTwiml({
      mode: resolvedMode,
      clientIdentity: 'dispatch_agent',
      forwardingPhone: formattedForwarding || undefined,
    });

    return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } });
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
    const sid =
      (data as any).MessageSid || (data as any).SmsSid || `msg_${options?.nowMs ?? Date.now()}`;
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

  return null;
}
