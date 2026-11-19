/**
 * Serverless / SSR Resource Route: Resend Email Gateway
 * 
 * Securely handles email dispatches on the server side using the private
 * RESEND_API_KEY environment variable, keeping credentials out of client bundles.
 */

import type { ActionFunctionArgs } from 'react-router';
import { ResendEmailService } from '../core/services/email/resend-email.service';
import type { EmailDispatchApiRequest } from '../core/services/email/types';

const STRUCTURED_EMAIL_TYPES = new Set([
  'booking_confirmation',
  'dispatcher_alert',
  'status_update',
  'booking_declined',
  'clarification_request',
  'contact_inquiry',
]);

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

    const isStructuredDispatch =
      STRUCTURED_EMAIL_TYPES.has(body.type) &&
      typeof body.payload === 'object' &&
      body.payload !== null &&
      Object.keys(body.payload).length > 0;

    let result;
    if (isStructuredDispatch) {
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
        case 'contact_inquiry': {
          const p = body.payload as Record<string, any>;
          const dispatchEmail =
            process.env.DISPATCH_ALERT_EMAIL ||
            process.env.ADMIN_ALERT_EMAIL ||
            'dispatch@chesterfieldtaxi.com';
          const name = escapeHtml(p.name || 'Website Visitor');
          const email = escapeHtml(p.email || 'Not provided');
          const phone = escapeHtml(p.phone || 'Not provided');
          const subjectCategory = escapeHtml(p.subject || 'General Inquiry');
          const tripRef = escapeHtml(p.tripId || 'N/A');
          const message = escapeHtml(p.message || '');

          result = await emailService.sendDirect({
            recipient: dispatchEmail,
            subject: `[Website Inquiry - ${subjectCategory}] From ${name}`,
            html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
              <h2 style="margin:0 0 16px;color:#0f172a;">New Chesterfield Taxi Website Inquiry</h2>
              <p style="margin:4px 0;"><strong>Category:</strong> ${subjectCategory}</p>
              <p style="margin:4px 0;"><strong>Name:</strong> ${name}</p>
              <p style="margin:4px 0;"><strong>Phone:</strong> ${phone}</p>
              <p style="margin:4px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin:4px 0;"><strong>Trip Reference:</strong> ${tripRef}</p>
              <hr style="margin:16px 0;border:none;border-top:1px solid #e2e8f0;" />
              <p style="white-space:pre-wrap;color:#334155;">${message}</p>
            </div>`,
            text: `New Website Inquiry (${subjectCategory})\nName: ${name}\nPhone: ${phone}\nEmail: ${email}\nTrip Ref: ${tripRef}\n\n${message}`,
          });
          break;
        }
        default:
          return Response.json(
            { success: false, error: `Unsupported dispatch type: ${(body as { type: string }).type}` },
            { status: 400 }
          );
      }
    } else if (body.subject && body.html && body.recipient) {
      // Security Guard: Prevent open mail relay - arbitrary HTML sending requires admin authorization
      const adminSecret = process.env.ADMIN_API_SECRET;
      const authHeader = request.headers.get('authorization') || request.headers.get('x-admin-secret');
      const isAuthorized = adminSecret ? authHeader === adminSecret || authHeader === `Bearer ${adminSecret}` : false;

      // In production or when admin secret configured, reject unauthenticated arbitrary emails
      if (process.env.NODE_ENV === 'production' && !isAuthorized) {
        return Response.json(
          { success: false, error: 'Unauthorized: Arbitrary direct email dispatch requires administrator authorization.' },
          { status: 403 }
        );
      }

      result = await emailService.sendDirect({
        recipient: body.recipient,
        subject: body.subject,
        html: body.html,
        text: body.text,
      });
    } else {
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
      configuredFromEmail: fromEmail || 'Chesterfield Taxi <onboarding@resend.dev> (Sandbox Default)',
      configuredAdminAlert: adminEmail || 'dispatch@chesterfieldtaxi.com (Default)',
    },
    resendDomainNotice: !fromEmail || fromEmail.includes('onboarding@resend.dev')
      ? 'Resend sandbox active: Only emails to the registered account owner (admin@chesterfieldtaxi.com) will deliver until a domain is verified at resend.com/domains.'
      : 'Custom domain sender configured. Ensure your domain DNS records (DKIM, SPF) are verified at resend.com/domains.',
  });
}
