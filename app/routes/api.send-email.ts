/**
 * Serverless / SSR Resource Route: Resend Email Gateway
 * 
 * Securely handles email dispatches on the server side using the private
 * RESEND_API_KEY environment variable, keeping credentials out of client bundles.
 */

import type { ActionFunctionArgs } from 'react-router';
import { ResendEmailService } from '../core/services/email/resend-email.service';
import type { EmailDispatchApiRequest } from '../core/services/email/types';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { success: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  try {
    const body = (await request.json()) as EmailDispatchApiRequest;
    if (!body || !body.type || !body.payload) {
      return Response.json(
        { success: false, error: 'Malformed request: "type" and "payload" are required.' },
        { status: 400 }
      );
    }

    const emailService = new ResendEmailService();

    let result;
    switch (body.type) {
      case 'booking_confirmation':
        result = await emailService.sendBookingConfirmation(body.payload);
        break;
      case 'dispatcher_alert':
        result = await emailService.sendAdminDispatchAlert(body.payload);
        break;
      case 'status_update':
        result = await emailService.sendStatusUpdateNotification(body.payload);
        break;
      default:
        return Response.json(
          { success: false, error: `Unsupported dispatch type: ${(body as { type: string }).type}` },
          { status: 400 }
        );
    }

    return Response.json(result);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[api.send-email] Server action caught error:', errorMessage);
    return Response.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

export async function loader() {
  return Response.json({
    status: 'healthy',
    gateway: 'Chesterfield Taxi Resend Email Dispatch Gateway',
    timestamp: new Date().toISOString(),
  });
}
