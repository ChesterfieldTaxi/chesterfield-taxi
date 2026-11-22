/**
 * Server-Isolated Twilio Outbound Voice, SMS & Credential Verification REST Handlers
 * (`telephony-outbound-rest.server.ts`)
 *
 * Extracted from `telephony-gateway.server.ts` (Phase 47):
 * - `save_credentials` & `verify_credentials` Twilio REST account verification
 * - `make_call` PSTN operator-bridge outbound call placement & `CommsEvent` ingestion
 * - `send_sms` outbound SMS dispatch (live Twilio REST + simulated/offline fallback) &
 *   `CommsEvent` ingestion.
 */

import {
  formatDisplayPhone,
  sanitizeToE164,
  validatePhoneNumber,
} from '../../utils/phone';
import type { VerifiedServerAuth } from '../auth/server-auth.server';
import { ingestCommsEventServer } from './comms-thread.server';
import {
  telephonyStore,
  type TelephonyApiRequest,
  type TelephonyHttpHandlerOptions,
} from './telephony-credentials.server';

export async function handleSaveOrVerifyTelephonyCredentialsPost(params: {
  effectiveAction: string;
  data: TelephonyApiRequest;
  accountSid: string;
  authToken: string;
  twilioFromNumber: string;
  isConfigured: boolean;
  fetchFn: typeof fetch;
}): Promise<Response | null> {
  const {
    effectiveAction,
    data,
    accountSid,
    authToken,
    twilioFromNumber,
    isConfigured,
    fetchFn,
  } = params;

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

  return null;
}

export async function handleOutboundMakeCallPost(params: {
  request: Request;
  data: TelephonyApiRequest;
  accountSid: string;
  authHeader: string;
  twilioFromNumber: string;
  forwardingPhone: string;
  auth: VerifiedServerAuth;
  fetchFn: typeof fetch;
  options?: TelephonyHttpHandlerOptions;
}): Promise<Response> {
  const {
    request,
    data,
    accountSid,
    authHeader,
    twilioFromNumber,
    forwardingPhone,
    auth,
    fetchFn,
    options,
  } = params;

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
        error:
          validationFrom.error ||
          `Invalid caller ID number "${data.from || twilioFromNumber}".`,
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

  const callParams = new URLSearchParams();
  callParams.append('To', formattedTo);
  callParams.append('From', formattedFrom);
  callParams.append('Twiml', twiml);
  callParams.append('Record', 'true');

  try {
    const reqUrl = new URL(request.url);
    const callbackUrl = `${reqUrl.protocol}//${reqUrl.host}/api/telephony?action=call_status_callback`;
    callParams.append('StatusCallback', callbackUrl);
    callParams.append('StatusCallbackMethod', 'POST');
    callParams.append('StatusCallbackEvent', 'completed');
    callParams.append('StatusCallbackEvent', 'busy');
    callParams.append('StatusCallbackEvent', 'no-answer');
    callParams.append('StatusCallbackEvent', 'failed');
    callParams.append('StatusCallbackEvent', 'canceled');
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
      body: callParams.toString(),
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

export async function handleOutboundSendSmsPost(params: {
  data: TelephonyApiRequest;
  accountSid: string;
  authToken: string;
  authHeader: string;
  twilioFromNumber: string;
  isConfigured: boolean;
  auth: VerifiedServerAuth;
  fetchFn: typeof fetch;
  options?: TelephonyHttpHandlerOptions;
}): Promise<Response> {
  const {
    data,
    accountSid,
    authToken,
    authHeader,
    twilioFromNumber,
    isConfigured,
    auth,
    fetchFn,
    options,
  } = params;

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

  const smsParams = new URLSearchParams();
  smsParams.append('To', formattedTo);
  smsParams.append('From', formattedFrom);
  smsParams.append('Body', smsBody);

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
        body: smsParams.toString(),
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
