/**
 * Serverless / SSR Resource Route: Twilio Telephony Verification Endpoint
 * 
 * Securely handles POST requests to verify Twilio credentials against
 * https://api.twilio.com/2010-04-01/Accounts/{AccountSid}.json
 * 
 * Strictly returns JSON objects wrapped in try/catch to ensure Vercel / SSR
 * never serves raw HTML error pages (<!DOCTYPE html>).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';

export interface TelephonyVerifyRequestBody {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  action?: string;
  credentials?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
  };
}

export interface TelephonyVerifyResponse {
  success: boolean;
  message?: string;
  error?: string;
  status?: string;
  friendlyName?: string;
  accountSid?: string;
  configured?: boolean;
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

function jsonResponse(data: TelephonyVerifyResponse, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  return jsonResponse(
    {
      success: false,
      error: 'Method Not Allowed. Telephony credential verification requires a POST request.',
    },
    405
  );
}

export async function action({ request }: ActionFunctionArgs) {
  // Guard HTTP method: strictly POST
  if (request.method !== 'POST') {
    return jsonResponse(
      {
        success: false,
        error: 'Method Not Allowed. Use POST.',
      },
      405
    );
  }

  try {
    let body: TelephonyVerifyRequestBody = {};
    try {
      body = (await request.json()) as TelephonyVerifyRequestBody;
    } catch {
      return jsonResponse(
        {
          success: false,
          error: 'Malformed JSON payload in request body.',
        },
        400
      );
    }

    // Resolve credentials from flat body, nested credentials, or environment fallback
    const accountSid = (
      body.accountSid ||
      body.credentials?.accountSid ||
      process.env.TWILIO_ACCOUNT_SID ||
      ''
    ).trim();

    const authToken = (
      body.authToken ||
      body.credentials?.authToken ||
      process.env.TWILIO_AUTH_TOKEN ||
      ''
    ).trim();

    // Validate Account SID format and Auth Token existence
    if (!accountSid || !authToken) {
      return jsonResponse(
        {
          success: false,
          error: 'Twilio Account SID and Auth Token are required.',
          configured: false,
        },
        200
      );
    }

    if (!accountSid.startsWith('AC')) {
      return jsonResponse(
        {
          success: false,
          error: "Invalid Credentials: Account SID must start with 'AC'.",
          configured: false,
        },
        200
      );
    }

    if (authToken.length < 16) {
      return jsonResponse(
        {
          success: false,
          error: 'Invalid Credentials: Auth Token must be at least 16 characters.',
          configured: false,
        },
        200
      );
    }

    // Direct fetch to validate credentials against Twilio REST API
    const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioEndpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`;

    let twilioResp: Response;
    try {
      twilioResp = await fetch(twilioEndpoint, {
        method: 'GET',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      return jsonResponse(
        {
          success: false,
          error: `Network error communicating with Twilio: ${msg}`,
          configured: false,
        },
        200
      );
    }

    // Safely parse Twilio response
    let twilioData: any = null;
    const respContentType = twilioResp.headers.get('content-type') || '';
    if (respContentType.includes('application/json')) {
      try {
        twilioData = await twilioResp.json();
      } catch {
        twilioData = null;
      }
    } else {
      const rawText = await twilioResp.text().catch(() => '');
      twilioData = { message: rawText };
    }

    if (twilioResp.ok && twilioData) {
      return jsonResponse({
        success: true,
        message: 'Connected',
        status: twilioData.status || 'active',
        friendlyName: twilioData.friendly_name || 'Twilio Account',
        accountSid,
        configured: true,
      });
    } else {
      const twilioErrorMsg =
        twilioData?.message ||
        `Twilio authentication failed with HTTP ${twilioResp.status} (${twilioResp.statusText})`;
      return jsonResponse(
        {
          success: false,
          error: twilioErrorMsg || 'Invalid Credentials',
          configured: false,
        },
        200
      );
    }
  } catch (err: unknown) {
    // Blanket error recovery to guarantee strict JSON return and prevent SSR raw HTML pages
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.telephony.verify] Server error:', errorMessage);
    return jsonResponse(
      {
        success: false,
        error: `Unexpected server error: ${errorMessage}`,
        configured: false,
      },
      500
    );
  }
}
