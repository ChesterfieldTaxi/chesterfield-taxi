/**
 * Serverless / SSR Resource Route: Resend Email Gateway
 *
 * Securely handles email dispatches on the server side using the private
 * RESEND_API_KEY environment variable, keeping credentials out of client bundles.
 *
 * Security controls:
 * - Staff-only types (`direct`, `status_update`, `booking_declined`, `clarification_request`)
 *   require verified Firebase Dispatcher/Admin auth (or ADMIN_API_SECRET).
 * - Public checkout types (`booking_confirmation`, `dispatcher_alert`, `contact_inquiry`)
 *   are rate-limited per IP, strip `recipientEmailOverride` and `companySettings` overrides
 *   for non-staff callers, and validate recipient/trip payloads.
 */

import type { ActionFunctionArgs } from 'react-router';
import { ResendEmailService } from '../core/services/email/resend-email.service';
import type { EmailDispatchApiRequest } from '../core/services/email/types';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { isFirebaseConfigured } from '../core/services/firebase';
import {
  checkRateLimit,
  getRequestClientIp,
  verifyServerRequestAuth,
} from '../core/services/auth/server-auth.server';

const STRUCTURED_EMAIL_TYPES = new Set([
  'booking_confirmation',
  'dispatcher_alert',
  'status_update',
  'booking_declined',
  'clarification_request',
  'trip_receipt',
  'corporate_invoice',
  'contact_inquiry',
]);

const STAFF_ONLY_TYPES = new Set([
  'direct',
  'status_update',
  'booking_declined',
  'clarification_request',
  'corporate_invoice',
]);

const STAFF_OR_DRIVER_TYPES = new Set(['trip_receipt']);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    const body = (await request.json()) as
      | EmailDispatchApiRequest
      | {
          type: 'direct';
          recipient?: string;
          subject?: string;
          html?: string;
          text?: string;
          payload?: Record<string, any>;
        };

    if (!body || !body.type) {
      return Response.json(
        { success: false, error: 'Malformed request: "type" is required.' },
        { status: 400 }
      );
    }

    const auth = await verifyServerRequestAuth(request);
    const enforceAuth = process.env.NODE_ENV === 'production' || isFirebaseConfigured();
    const clientIp = getRequestClientIp(request);

    // Rate-limit public / non-staff email calls to block relay/spam abuse
    if (!auth.isDispatcher) {
      const allowed = checkRateLimit(`email_public:${clientIp}`, 12, 5 * 60_000);
      if (!allowed) {
        return Response.json(
          { success: false, error: 'Rate limit exceeded. Please wait a few minutes before sending another email.' },
          { status: 429 }
        );
      }
    }

    // Staff-only types strictly require Dispatcher/Admin authentication
    if (STAFF_ONLY_TYPES.has(body.type)) {
      if (enforceAuth && !auth.isDispatcher) {
        return Response.json(
          { success: false, error: 'Unauthorized: Staff authentication is required for this email action.' },
          { status: 403 }
        );
      }
    }

    // Driver or Staff types (official post-trip receipts)
    if (STAFF_OR_DRIVER_TYPES.has(body.type)) {
      if (enforceAuth && !auth.isDispatcher && !auth.isDriver) {
        return Response.json(
          { success: false, error: 'Unauthorized: Driver or Staff authentication is required to send receipts.' },
          { status: 403 }
        );
      }
    }

    const emailService = new ResendEmailService();

    // Direct HTML/text email (Dispatch EmailDock & Staff tools)
    if (body.type === 'direct') {
      const p = (body.payload && typeof body.payload === 'object' ? body.payload : {}) as Record<string, any>;
      const recipient = String(body.recipient || p.recipient || '').trim();
      const subject = String(body.subject || p.subject || '').trim();
      const html = String(body.html || p.html || '').trim();
      const text = String(body.text || p.text || '').trim();

      if (!recipient || !EMAIL_PATTERN.test(recipient) || !subject || !html) {
        return Response.json(
          { success: false, error: 'Direct email requires valid "recipient", "subject", and "html".' },
          { status: 400 }
        );
      }

      const result = await emailService.sendDirect({
        recipient,
        subject,
        html,
        text,
      });
      return Response.json(result);
    }

    const isStructuredDispatch =
      STRUCTURED_EMAIL_TYPES.has(body.type) &&
      typeof body.payload === 'object' &&
      body.payload !== null &&
      Object.keys(body.payload).length > 0;

    if (!isStructuredDispatch) {
      return Response.json(
        { success: false, error: `Malformed request: valid "payload" is required for type "${body.type}".` },
        { status: 400 }
      );
    }

    let result;
    switch (body.type) {
      case 'booking_confirmation': {
        const rawPayload = { ...(body.payload as any) };
        const targetEmail = String(rawPayload?.passenger?.email || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required.' },
            { status: 400 }
          );
        }

        // Prevent unauthenticated/customer callers from redirecting recipient or spoofing branding
        if (!auth.isDispatcher) {
          delete rawPayload.recipientEmailOverride;
          delete rawPayload.companySettings;
        }

        result = await emailService.sendBookingConfirmation(rawPayload);
        break;
      }
      case 'dispatcher_alert': {
        const rawPayload = { ...(body.payload as any) };
        if (!rawPayload?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId is required for dispatch alert.' },
            { status: 400 }
          );
        }
        if (!auth.isDispatcher) {
          delete rawPayload.companySettings;
        }
        result = await emailService.sendAdminDispatchAlert(rawPayload);
        break;
      }
      case 'status_update':
        result = await emailService.sendStatusUpdateNotification(body.payload);
        break;
      case 'booking_declined':
        result = await emailService.sendBookingDeclined(body.payload);
        break;
      case 'clarification_request':
        result = await emailService.sendClarificationRequest(body.payload);
        break;
      case 'trip_receipt': {
        const targetEmail = String((body.payload as any)?.passenger?.email || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !(body.payload as any)?.tripId) {
          return Response.json(
            { success: false, error: 'Valid tripId and passenger email are required for receipt.' },
            { status: 400 }
          );
        }
        result = await emailService.sendTripReceipt(body.payload);
        break;
      }
      case 'corporate_invoice': {
        const targetEmail = String((body.payload as any)?.customerEmail || '').trim();
        if (!targetEmail || !EMAIL_PATTERN.test(targetEmail) || !(body.payload as any)?.invoiceNumber) {
          return Response.json(
            { success: false, error: 'Valid customerEmail and invoiceNumber are required.' },
            { status: 400 }
          );
        }
        result = await emailService.sendCorporateInvoice(body.payload);
        break;
      }
      case 'contact_inquiry': {
        const p = body.payload as Record<string, any>;
        const dispatchEmail =
          process.env.DISPATCH_ALERT_EMAIL ||
          process.env.ADMIN_ALERT_EMAIL ||
          COMPANY_CONFIG.email.dispatch;
        const name = escapeHtml(p.name || 'Website Visitor');
        const email = escapeHtml(p.email || 'Not provided');
        const phone = escapeHtml(p.phone || 'Not provided');
        const subjectCategory = escapeHtml(p.subject || 'General Inquiry');
        const tripRef = escapeHtml(p.tripId || 'N/A');
        const message = escapeHtml(p.message || '');

        if (!String(p.message || '').trim()) {
          return Response.json(
            { success: false, error: 'Message body is required for contact inquiry.' },
            { status: 400 }
          );
        }

        result = await emailService.sendDirect({
          recipient: dispatchEmail,
          subject: `[Website Inquiry - ${subjectCategory}] From ${name}`,
          html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="margin:0 0 16px;color:#0f172a;">New ${escapeHtml(COMPANY_CONFIG.name)} Website Inquiry</h2>
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

  return Response.json({
    status: 'healthy',
    service: 'Chesterfield Taxi Email Dispatch Service',
    configured: Boolean(apiKey),
    customDomainConfigured: Boolean(fromEmail && !fromEmail.includes('onboarding@resend.dev')),
    timestamp: new Date().toISOString(),
  });
}
