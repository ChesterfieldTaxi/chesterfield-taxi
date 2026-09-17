/**
 * Serverless / SSR Resource Route: Telephony & Twilio Gateway
 * 
 * Securely handles Twilio outbound PSTN voice calling, SMS dispatches,
 * and masked phone relay requests using server-side or admin-configured credentials.
 */

import type { ActionFunctionArgs } from 'react-router';

export interface TelephonyApiRequest {
  action: 'make_call' | 'send_sms' | 'verify_credentials';
  to?: string;
  from?: string;
  body?: string;
  customTwiml?: string;
  credentials?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
  };
}

/**
 * Formats a phone number to standard E.164 (+1XXXXXXXXXX) format
 */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (digits.length > 0 && !phone.startsWith('+')) {
    return `+${digits}`;
  }
  return phone.trim();
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const data = (await request.json()) as TelephonyApiRequest;
    if (!data || !data.action) {
      return Response.json(
        { success: false, error: 'Malformed request: "action" is required.' },
        { status: 400 }
      );
    }

    // Resolve credentials from environment or request payload
    const accountSid =
      process.env.TWILIO_ACCOUNT_SID ||
      data.credentials?.accountSid?.trim() ||
      '';
    const authToken =
      process.env.TWILIO_AUTH_TOKEN ||
      data.credentials?.authToken?.trim() ||
      '';
    const twilioFromNumber =
      process.env.TWILIO_PHONE_NUMBER ||
      data.credentials?.phoneNumber?.trim() ||
      '+13145550199';

    // Verify if live Twilio credentials are configured
    const isConfigured = Boolean(
      accountSid &&
      authToken &&
      accountSid.startsWith('AC') &&
      authToken.length >= 16
    );

    if (data.action === 'verify_credentials') {
      if (!isConfigured) {
        return Response.json({
          success: false,
          configured: false,
          error:
            'Twilio credentials not configured. Please supply a valid Account SID starting with AC and Auth Token.',
        });
      }

      try {
        const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const resp = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
          {
            headers: { Authorization: authHeader },
          }
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
        } else {
          return Response.json({
            success: false,
            configured: false,
            error: result.message || 'Twilio authentication failed',
            code: result.code,
          });
        }
      } catch (err: any) {
        return Response.json({
          success: false,
          configured: false,
          error: err.message || 'Network error communicating with Twilio',
        });
      }
    }

    if (!isConfigured) {
      const targetPhone = data.to ? toE164(data.to) : 'target phone';
      return Response.json({
        success: false,
        code: 'TWILIO_NOT_CONFIGURED',
        simulated: true,
        message:
          `Twilio credentials not configured. Your cell phone (${targetPhone}) will not ring until you enter your Twilio Account SID, Auth Token, and Twilio Phone Number in Admin > Financials & Invoicing > Twilio & Telephony, or set TWILIO_ACCOUNT_SID in .env.`,
        instructions:
          '1. Go to Admin Console > Financials & Invoicing > Twilio & Telephony.\n2. Enter your Twilio Account SID (starts with AC...) and Auth Token.\n3. Enter your Twilio Outbound Phone Number.\n4. Click "Place Test Phone Call" to verify your cell phone rings.',
      });
    }

    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    // ─── 1. Outbound Voice Call via Twilio REST API ───
    if (data.action === 'make_call') {
      if (!data.to) {
        return Response.json(
          { success: false, error: 'Destination phone number "to" is required.' },
          { status: 400 }
        );
      }

      const formattedTo = toE164(data.to);
      const formattedFrom = toE164(data.from || twilioFromNumber);

      const twiml =
        data.customTwiml ||
        `<Response><Say voice="alice">Hello! This is Chesterfield Taxi dispatch connecting your call. Please hold while we connect you to dispatch.</Say><Pause length="1"/><Say voice="alice">Test call completed. Have a wonderful day!</Say></Response>`;

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Twiml', twiml);

      const callResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
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
        return Response.json({
          success: true,
          callSid: callResult.sid,
          status: callResult.status,
          to: callResult.to,
          from: callResult.from,
          message: `Outbound call placed to ${formattedTo}. Your cell phone should ring shortly!`,
        });
      } else {
        return Response.json(
          {
            success: false,
            code: 'TWILIO_CALL_FAILED',
            error: callResult.message || 'Twilio call placement failed',
            twilioCode: callResult.code,
            moreInfo: callResult.more_info,
          },
          { status: 400 }
        );
      }
    }

    // ─── 2. Send SMS Notification via Twilio REST API ───
    if (data.action === 'send_sms') {
      if (!data.to || !data.body) {
        return Response.json(
          { success: false, error: '"to" and "body" are required for SMS dispatch.' },
          { status: 400 }
        );
      }

      const formattedTo = toE164(data.to);
      const formattedFrom = toE164(data.from || twilioFromNumber);

      const params = new URLSearchParams();
      params.append('To', formattedTo);
      params.append('From', formattedFrom);
      params.append('Body', data.body);

      const smsResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
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
        return Response.json({
          success: true,
          messageSid: smsResult.sid,
          status: smsResult.status,
          to: smsResult.to,
          from: smsResult.from,
          message: `SMS message sent successfully to ${formattedTo}!`,
        });
      } else {
        return Response.json(
          {
            success: false,
            code: 'TWILIO_SMS_FAILED',
            error: smsResult.message || 'Twilio SMS dispatch failed',
            twilioCode: smsResult.code,
            moreInfo: smsResult.more_info,
          },
          { status: 400 }
        );
      }
    }

    return Response.json(
      { success: false, error: `Unsupported telephony action: ${data.action}` },
      { status: 400 }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.telephony] Server error:', errorMessage);
    return Response.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
