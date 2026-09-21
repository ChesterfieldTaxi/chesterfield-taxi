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
    if (body.subject && body.html && body.recipient) {
      result = await emailService.sendDirect({
        recipient: body.recipient,
        subject: body.subject,
        html: body.html,
        text: body.text,
      });
    } else {
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
        case 'booking_declined':
          result = await emailService.sendBookingDeclined(body.payload);
          break;
        case 'clarification_request':
          result = await emailService.sendClarificationRequest(body.payload);
          break;
        default:
          return Response.json(
            { success: false, error: `Unsupported dispatch type: ${(body as { type: string }).type}` },
            { status: 400 }
          );
      }
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
  const getEnvVar = (key: string): string | undefined => {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.[key]) {
      return (globalThis as any).process.env[key];
    }
    return undefined;
  };

  const apiKey = getEnvVar('RESEND_API_KEY');
  const fromEmail = getEnvVar('RESEND_FROM_EMAIL') || getEnvVar('EMAIL_FROM');
  const adminEmail = getEnvVar('DISPATCH_ALERT_EMAIL') || getEnvVar('ADMIN_ALERT_EMAIL');

  return Response.json({
    status: 'healthy',
    gateway: 'Chesterfield Taxi Resend Email Dispatch Gateway',
    timestamp: new Date().toISOString(),
    environment: {
      hasResendApiKey: Boolean(apiKey),
      apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'MISSING (Check Vercel Environment Variables)',
      configuredFromEmail: fromEmail || 'Chesterfield Taxi <onboarding@resend.dev> (Sandbox Default)',
      configuredAdminAlert: adminEmail || 'dispatch@chesterfieldtaxi.com (Default)',
    },
    resendDomainNotice: !fromEmail || fromEmail.includes('onboarding@resend.dev')
      ? 'Resend sandbox active: Only emails to the registered account owner (admin@chesterfieldtaxi.com) will deliver until a domain is verified at resend.com/domains.'
      : 'Custom domain sender configured. Ensure your domain DNS records (DKIM, SPF) are verified at resend.com/domains.',
  });
}
