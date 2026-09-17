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
 * Sanitizes and formats an input phone number to standard E.164 (+1XXXXXXXXXX) format.
 * Replaces all non-numeric characters except leading '+'.
 * Examples:
 *   "314-585-7762"       => "+13145857762"
 *   "13145857762"        => "+13145857762"
 *   "+13145857762"       => "+13145857762"
 *   "(314) 585-7762"     => "+13145857762"
 *   "+1 (314) 585-7762"  => "+13145857762"
 */
export function sanitizePhoneNumber(phone: string | undefined | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) return '';

  if (hasLeadingPlus) {
    return `+${digitsOnly}`;
  }

  // 10 digits: US/Canada standard NANP without country code
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  // 11 digits starting with 1: US/Canada with country code but missing leading '+'
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

export const toE164 = sanitizePhoneNumber;


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

    // Helper to validate E.164 phone numbers (+1XXXXXXXXXX or international)
    const isValidE164 = (num: string) => /^\+[1-9]\d{9,14}$/.test(num);

    // ─── 1. Outbound Voice Call via Twilio REST API ───
    if (data.action === 'make_call') {
      if (!data.to) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: 'Destination phone number "to" is required.',
            message: 'Number must be verified in Twilio Trial Console',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize input numbers to E.164 before initiating Twilio call
      const formattedTo = sanitizePhoneNumber(data.to);
      const formattedFrom = sanitizePhoneNumber(data.from || twilioFromNumber);

      if (!isValidE164(formattedTo)) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: `Invalid destination number "${data.to}". Number must be verified in Twilio Trial Console.`,
            message: 'Number must be verified in Twilio Trial Console',
            to: data.to,
            formattedTo,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!isValidE164(formattedFrom)) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_FROM_NUMBER',
            error: `Invalid caller ID number "${data.from || twilioFromNumber}". Number must be verified in Twilio Trial Console.`,
            message: 'Number must be verified in Twilio Trial Console',
            from: data.from || twilioFromNumber,
            formattedFrom,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

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
        }, { headers: { 'Content-Type': 'application/json' } });
      } else {
        const isParamOrTrialIssue =
          callResult.code === 21608 || // Unverified 'To' number on trial account
          callResult.code === 21211 || // Invalid 'To' Phone Number
          callResult.code === 21212 || // Invalid 'From' Phone Number
          callResult.code === 21606 || // 'From' number is not a valid incoming number
          callResult.code === 21219 || // 'To' phone number not verified
          callResult.code === 21408 || // Geo permissions
          callResult.code === 21614 || // Not a valid mobile number
          (callResult.message &&
            (callResult.message.toLowerCase().includes('unverified') ||
             callResult.message.toLowerCase().includes('trial') ||
             callResult.message.toLowerCase().includes('verify') ||
             callResult.message.toLowerCase().includes('caller id') ||
             callResult.message.toLowerCase().includes('permission')));

        const errorMsg = isParamOrTrialIssue
          ? 'Number must be verified in Twilio Trial Console'
          : (callResult.message || 'Twilio call placement failed');

        return Response.json(
          {
            success: false,
            code: isParamOrTrialIssue ? 'TWILIO_NUMBER_UNVERIFIED' : 'TWILIO_CALL_FAILED',
            error: errorMsg,
            message: 'Number must be verified in Twilio Trial Console',
            details: callResult.message,
            twilioCode: callResult.code,
            moreInfo: callResult.more_info || 'https://www.twilio.com/console/phone-numbers/verified',
            to: formattedTo,
            from: formattedFrom,
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // ─── 2. Send SMS Notification via Twilio REST API ───
    if (data.action === 'send_sms') {
      if (!data.to || !data.body) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_PARAMETERS',
            error: '"to" and "body" are required for SMS dispatch.',
            message: 'Number must be verified in Twilio Trial Console',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize input numbers to E.164 before initiating Twilio SMS
      const formattedTo = sanitizePhoneNumber(data.to);
      const formattedFrom = sanitizePhoneNumber(data.from || twilioFromNumber);

      if (!isValidE164(formattedTo)) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_TO_NUMBER',
            error: `Invalid destination number "${data.to}". Number must be verified in Twilio Trial Console.`,
            message: 'Number must be verified in Twilio Trial Console',
            to: data.to,
            formattedTo,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!isValidE164(formattedFrom)) {
        return Response.json(
          {
            success: false,
            code: 'INVALID_FROM_NUMBER',
            error: `Invalid sender phone number "${data.from || twilioFromNumber}". Number must be verified in Twilio Trial Console.`,
            message: 'Number must be verified in Twilio Trial Console',
            from: data.from || twilioFromNumber,
            formattedFrom,
            help: 'https://www.twilio.com/console/phone-numbers/verified',
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

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
        }, { headers: { 'Content-Type': 'application/json' } });
      } else {
        const isParamOrTrialIssue =
          smsResult.code === 21608 ||
          smsResult.code === 21211 ||
          smsResult.code === 21212 ||
          smsResult.code === 21606 ||
          smsResult.code === 21219 ||
          smsResult.code === 21408 ||
          smsResult.code === 21614 ||
          (smsResult.message &&
            (smsResult.message.toLowerCase().includes('unverified') ||
             smsResult.message.toLowerCase().includes('trial') ||
             smsResult.message.toLowerCase().includes('verify') ||
             smsResult.message.toLowerCase().includes('caller id') ||
             smsResult.message.toLowerCase().includes('permission')));

        const errorMsg = isParamOrTrialIssue
          ? 'Number must be verified in Twilio Trial Console'
          : (smsResult.message || 'Twilio SMS dispatch failed');

        return Response.json(
          {
            success: false,
            code: isParamOrTrialIssue ? 'TWILIO_NUMBER_UNVERIFIED' : 'TWILIO_SMS_FAILED',
            error: errorMsg,
            message: 'Number must be verified in Twilio Trial Console',
            details: smsResult.message,
            twilioCode: smsResult.code,
            moreInfo: smsResult.more_info || 'https://www.twilio.com/console/phone-numbers/verified',
            to: formattedTo,
            from: formattedFrom,
          },
          { status: 400, headers: { 'Content-Type': 'application/json' } }
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
