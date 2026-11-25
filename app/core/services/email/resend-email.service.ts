/**
 * Resend Transactional Email Dispatch Service
 *
 * Provides production-grade transactional email integration via the Resend API
 * with secure server-side delegation, RFC-5322 single-mailbox threading headers
 * (`dispatch@chesterfieldtaxi.com`), responsive HTML templates, and graceful
 * development fallbacks when API keys are absent.
 *
 * Strictly free of `node:*`, `*.server.ts`, and static `resend` / `./email-templates`
 * browser imports: browser calls delegate via lightweight `fetch('/api/send-email')`
 * requests while `resend` and `./email-templates` load dynamically strictly inside
 * server-side (`typeof window === 'undefined'`) execution paths.
 */

import type { Resend } from 'resend';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { DISPATCH_MAILBOX_ADDRESS } from '../../types/dispatch-email';
import { getFirebaseAuthHeaders } from '../auth/auth-headers';
import type {
  AdminDispatchAlertEmailPayload,
  BookingClarificationRequestEmailPayload,
  BookingConfirmationEmailPayload,
  BookingDeclinedEmailPayload,
  CorporateInvoiceEmailPayload,
  EmailDispatchApiRequest,
  EmailDispatchResult,
  IEmailDispatchService,
  StatusUpdateEmailPayload,
  TripReceiptEmailPayload,
} from './types';

export interface EmailServiceConfig {
  apiKey?: string;
  fromAddress?: string;
  adminAlertRecipient?: string;
  replyToAddress?: string;
  fetchImpl?: typeof fetch;
}

export interface EmailSendTransportOptions {
  replyTo?: string;
  headers?: Record<string, string>;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  tripId?: string;
  invoiceId?: string;
  corporateAccountNumber?: string;
  contactPhone?: string;
  contactName?: string;
}

function getEnv(key: string): string | undefined {
  const envSource =
    (typeof process !== 'undefined' && process.env) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).process?.env);
  if (envSource && envSource[key]) {
    const cleaned = String(envSource[key]).trim().replace(/^["']|["']$/g, '').trim();
    return cleaned || undefined;
  }
  return undefined;
}

function isServerRuntime(): boolean {
  if (typeof window !== 'undefined') return false;
  if (typeof process !== 'undefined' && process.env?.VITE_CLIENT_BUILD === '1') return false;
  if (typeof import.meta !== 'undefined' && (import.meta as any).env?.SSR === false) return false;
  return true;
}

async function loadServerEmailTemplates() {
  if (isServerRuntime()) {
    return import('./email-templates');
  }
  return null;
}

const DEFAULT_ADMIN_EMAIL =
  getEnv('DISPATCH_MAILBOX_ADDRESS') ||
  getEnv('DISPATCH_ALERT_EMAIL') ||
  getEnv('ADMIN_ALERT_EMAIL') ||
  DISPATCH_MAILBOX_ADDRESS;

function getResolvedFromAddress(configuredFrom?: string): string {
  if (configuredFrom) return configuredFrom;
  const envFrom = getEnv('RESEND_FROM_EMAIL') || getEnv('EMAIL_FROM');
  if (envFrom) {
    return envFrom.includes('<') ? envFrom : `${COMPANY_CONFIG.name} <${envFrom}>`;
  }
  // If no custom domain is verified in Resend yet, Resend's API rejects non-verified domains with 403.
  // Using onboarding@resend.dev allows immediate delivery to test/registered recipient accounts while
  // setting replyTo to dispatch@chesterfieldtaxi.com.
  return `${COMPANY_CONFIG.name} <onboarding@resend.dev>`;
}

export class ResendEmailService implements IEmailDispatchService {
  private resendClient: Resend | null = null;
  private apiKey?: string;
  private fromAddress: string;
  private adminAlertRecipient: string;
  private replyToAddress: string;
  private fetchImpl?: typeof fetch;

  constructor(config?: EmailServiceConfig) {
    this.apiKey = config?.apiKey ?? getEnv('RESEND_API_KEY');
    this.fromAddress = getResolvedFromAddress(config?.fromAddress);
    this.adminAlertRecipient =
      config?.adminAlertRecipient ||
      getEnv('DISPATCH_ALERT_EMAIL') ||
      getEnv('ADMIN_ALERT_EMAIL') ||
      DISPATCH_MAILBOX_ADDRESS;
    this.replyToAddress =
      config?.replyToAddress ||
      getEnv('DISPATCH_MAILBOX_ADDRESS') ||
      COMPANY_CONFIG.email.dispatch ||
      DISPATCH_MAILBOX_ADDRESS;
    this.fetchImpl = config?.fetchImpl;
  }

  private async getServerResendClient(): Promise<Resend | null> {
    if (this.resendClient) return this.resendClient;
    if (!this.apiKey || this.fetchImpl) return null;
    if (isServerRuntime()) {
      try {
        const { Resend: ResendCtor } = await import('resend');
        this.resendClient = new ResendCtor(this.apiKey);
        return this.resendClient;
      } catch (err) {
        console.warn('[ResendEmailService] Failed to initialize Resend client:', err);
      }
    }
    return null;
  }

  /**
   * Dispatches email via browser fetch to `/api/send-email` or direct Resend API.
   */
  private async dispatch(
    request: EmailDispatchApiRequest,
    recipient: string,
    subject: string,
    html: string,
    text: string,
    transportOptions?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const isBrowser = typeof window !== 'undefined';

    // 1. Browser client environment -> delegate to serverless API route
    if (isBrowser) {
      try {
        const isDirect =
          (request.type as string) === 'direct' ||
          !request.payload ||
          Object.keys(request.payload).length === 0;
        const requestPayload = {
          ...(isDirect
            ? {
                ...request,
                recipient,
                subject,
                html,
                text,
              }
            : request),
          ...(transportOptions?.threadId ? { threadId: transportOptions.threadId } : {}),
          ...(transportOptions?.inReplyTo ? { inReplyTo: transportOptions.inReplyTo } : {}),
          ...(transportOptions?.references ? { references: transportOptions.references } : {}),
          ...(transportOptions?.tripId ? { tripId: transportOptions.tripId } : {}),
          ...(transportOptions?.invoiceId ? { invoiceId: transportOptions.invoiceId } : {}),
          ...(transportOptions?.corporateAccountNumber
            ? { corporateAccountNumber: transportOptions.corporateAccountNumber }
            : {}),
          ...(transportOptions?.contactPhone ? { contactPhone: transportOptions.contactPhone } : {}),
          ...(transportOptions?.contactName ? { contactName: transportOptions.contactName } : {}),
        };
        const authHeaders = await getFirebaseAuthHeaders();
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify(requestPayload),
        });

        if (response.ok) {
          const result = (await response.json()) as EmailDispatchResult;
          if (!result.success && result.error) {
            console.error(
              '[ResendEmailService] /api/send-email reported dispatch failure:',
              result.error
            );
          }
          return result;
        }

        let errorMessage = 'Email server error';
        try {
          const errorJson = await response.json();
          if (errorJson.error) errorMessage = errorJson.error;
        } catch {
          const errorText = await response.text();
          if (errorText) errorMessage = errorText;
        }

        console.error('[ResendEmailService] /api/send-email responded with error:', errorMessage);
        return {
          success: false,
          error: errorMessage,
          recipient,
          subject,
          dispatchedAt: new Date().toISOString(),
        };
      } catch (clientErr: any) {
        console.error('[ResendEmailService] Browser fetch to /api/send-email failed:', clientErr);
        return {
          success: false,
          error: clientErr?.message || 'Network error reaching email dispatch service',
          recipient,
          subject,
          dispatchedAt: new Date().toISOString(),
        };
      }
    }

    const effectiveReplyTo = transportOptions?.replyTo || this.replyToAddress;
    const cleanHeaders: Record<string, string> = {};
    if (transportOptions?.headers) {
      for (const [k, v] of Object.entries(transportOptions.headers)) {
        if (k && typeof v === 'string' && v.trim()) {
          cleanHeaders[k] = v.trim();
        }
      }
    }

    // 2. Server environment without API key -> simulated dispatch
    if (!this.apiKey) {
      console.info(
        `[ResendEmailService] [SIMULATED] "${subject}" to <${recipient}> (replyTo=${effectiveReplyTo}, RESEND_API_KEY not configured)`
      );
      return {
        success: true,
        simulated: true,
        messageId: `sim_server_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        recipient,
        subject,
        dispatchedAt: new Date().toISOString(),
      };
    }

    // 3A. Injectable custom fetch transport (deterministic server tests & edge runtimes)
    if (this.fetchImpl) {
      try {
        const resp = await this.fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.fromAddress,
            reply_to: effectiveReplyTo,
            to: [recipient],
            subject,
            html,
            text,
            ...(Object.keys(cleanHeaders).length > 0 ? { headers: cleanHeaders } : {}),
          }),
        });
        const json = (await resp.json().catch(() => ({}))) as {
          id?: string;
          message?: string;
          name?: string;
        };
        if (!resp.ok) {
          return {
            success: false,
            recipient,
            subject,
            error: json.message || `Resend HTTP ${resp.status}`,
            dispatchedAt: new Date().toISOString(),
          };
        }
        return {
          success: true,
          messageId: json.id,
          recipient,
          subject,
          dispatchedAt: new Date().toISOString(),
        };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          recipient,
          subject,
          error: errorMessage,
          dispatchedAt: new Date().toISOString(),
        };
      }
    }

    // 3B. Server environment with live Resend SDK client
    const resendClient = await this.getServerResendClient();
    if (!resendClient) {
      return {
        success: false,
        recipient,
        subject,
        error: 'Resend client failed to initialize.',
        dispatchedAt: new Date().toISOString(),
      };
    }

    try {
      const response = await resendClient.emails.send({
        from: this.fromAddress,
        replyTo: effectiveReplyTo,
        to: recipient,
        subject,
        html,
        text,
        ...(Object.keys(cleanHeaders).length > 0 ? { headers: cleanHeaders } : {}),
      });

      if (response.error) {
        console.error('[ResendEmailService] Email gateway error:', response.error);
        let errorMsg =
          'Unable to deliver email right now. Please verify sender domain configuration or try again.';
        if (
          response.error.name === 'validation_error' &&
          response.error.message?.includes('not verified')
        ) {
          errorMsg =
            'Email sender domain is not verified yet. Please contact your system administrator.';
        } else if (
          response.error.name === 'validation_error' &&
          response.error.message?.includes('testing emails')
        ) {
          errorMsg =
            'Email delivery is currently restricted to verified test recipients until domain verification is completed.';
        }
        return {
          success: false,
          recipient,
          subject,
          error: errorMsg,
          dispatchedAt: new Date().toISOString(),
        };
      }

      console.info(
        `[ResendEmailService] Dispatched "${subject}" to <${recipient}> (ID: ${response.data?.id})`
      );
      return {
        success: true,
        messageId: response.data?.id,
        recipient,
        subject,
        dispatchedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[ResendEmailService] Dispatch exception:', errorMessage);
      return {
        success: false,
        recipient,
        subject,
        error: errorMessage,
        dispatchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Dispatches pre-rendered transactional or direct reply email.
   */
  public async sendDirect(params: {
    recipient: string;
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
    threadId?: string;
    inReplyTo?: string;
    references?: string[];
    tripId?: string;
    invoiceId?: string;
    corporateAccountNumber?: string;
    contactPhone?: string;
    contactName?: string;
  }): Promise<EmailDispatchResult> {
    return this.dispatch(
      { type: 'direct', payload: {} },
      params.recipient,
      params.subject,
      params.html,
      params.text || '',
      {
        replyTo: params.replyTo,
        headers: params.headers,
        threadId: params.threadId,
        inReplyTo: params.inReplyTo,
        references: params.references,
        tripId: params.tripId,
        invoiceId: params.invoiceId,
        corporateAccountNumber: params.corporateAccountNumber,
        contactPhone: params.contactPhone,
        contactName: params.contactName,
      }
    );
  }

  /**
   * Sends passenger booking confirmation receipt.
   */
  public async sendBookingConfirmation(
    payload: BookingConfirmationEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const recipient = payload.recipientEmailOverride?.trim() || payload.passenger.email;
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'booking_confirmation', payload },
        recipient,
        `Booking Confirmation – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderPassengerConfirmationEmail(payload);
    return this.dispatch(
      { type: 'booking_confirmation', payload },
      recipient,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends immediate dispatch alert to operations team.
   */
  public async sendAdminDispatchAlert(
    payload: AdminDispatchAlertEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'dispatcher_alert', payload },
        this.adminAlertRecipient,
        `Dispatch Alert – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderDispatcherAlertEmail(payload);
    return this.dispatch(
      { type: 'dispatcher_alert', payload },
      this.adminAlertRecipient,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends ride status update notification to passenger.
   */
  public async sendStatusUpdateNotification(
    payload: StatusUpdateEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'status_update', payload },
        payload.passenger.email,
        `Ride Status Update – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderStatusUpdateEmail(payload);
    return this.dispatch(
      { type: 'status_update', payload },
      payload.passenger.email,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends booking declined notification to passenger.
   */
  public async sendBookingDeclined(
    payload: BookingDeclinedEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'booking_declined', payload },
        payload.passenger.email,
        `Booking Update – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderBookingDeclinedEmail(payload);
    return this.dispatch(
      { type: 'booking_declined', payload },
      payload.passenger.email,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends request for information or clarification email to passenger.
   */
  public async sendClarificationRequest(
    payload: BookingClarificationRequestEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'clarification_request', payload },
        payload.passenger.email,
        `Information Requested – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderClarificationRequestEmail(payload);
    return this.dispatch(
      { type: 'clarification_request', payload },
      payload.passenger.email,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends official itemized post-trip tax receipt email to passenger.
   */
  public async sendTripReceipt(
    payload: TripReceiptEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'trip_receipt', payload },
        payload.passenger.email,
        `Trip Receipt – #${payload.tripId}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderTripReceiptEmail(payload);
    return this.dispatch(
      { type: 'trip_receipt', payload },
      payload.passenger.email,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }

  /**
   * Sends B2B corporate billing invoice statement email.
   */
  public async sendCorporateInvoice(
    payload: CorporateInvoiceEmailPayload,
    options?: EmailSendTransportOptions
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    if (!templates) {
      return this.dispatch(
        { type: 'corporate_invoice', payload },
        payload.customerEmail,
        `Invoice ${payload.invoiceNumber} – ${COMPANY_CONFIG.name}`,
        '',
        '',
        options
      );
    }
    const rendered = templates.renderCorporateInvoiceEmail(payload);
    return this.dispatch(
      { type: 'corporate_invoice', payload },
      payload.customerEmail,
      rendered.subject,
      rendered.html,
      rendered.text,
      options
    );
  }
}

/**
 * Stub Email Service for unit tests and strictly isolated offline execution.
 */
export class StubEmailDispatchService implements IEmailDispatchService {
  public dispatchedEmails: EmailDispatchResult[] = [];

  public async sendBookingConfirmation(
    payload: BookingConfirmationEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderPassengerConfirmationEmail(payload).subject
      : `Booking Confirmation – #${payload.tripId}`;
    const recipient = payload.recipientEmailOverride?.trim() || payload.passenger.email;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_confirm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(`[StubEmailDispatch] Confirmation sent to ${recipient} (Trip #${payload.tripId})`);
    return result;
  }

  public async sendBookingDeclined(
    payload: BookingDeclinedEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderBookingDeclinedEmail(payload).subject
      : `Booking Update – #${payload.tripId}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_declined_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: payload.passenger.email,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(
      `[StubEmailDispatch] Booking declined email sent to ${payload.passenger.email} (Trip #${payload.tripId})`
    );
    return result;
  }

  public async sendClarificationRequest(
    payload: BookingClarificationRequestEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderClarificationRequestEmail(payload).subject
      : `Information Requested – #${payload.tripId}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_clarify_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: payload.passenger.email,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(
      `[StubEmailDispatch] Clarification request sent to ${payload.passenger.email} (Trip #${payload.tripId})`
    );
    return result;
  }

  public async sendAdminDispatchAlert(
    payload: AdminDispatchAlertEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderDispatcherAlertEmail(payload).subject
      : `Dispatch Alert – #${payload.tripId}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: DEFAULT_ADMIN_EMAIL,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(`[StubEmailDispatch] Dispatch alert logged for Trip #${payload.tripId}`);
    return result;
  }

  public async sendStatusUpdateNotification(
    payload: StatusUpdateEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderStatusUpdateEmail(payload).subject
      : `Ride Status Update – #${payload.tripId}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_status_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: payload.passenger.email,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(
      `[StubEmailDispatch] Status update (${payload.newStatus}) logged for Trip #${payload.tripId}`
    );
    return result;
  }

  public async sendTripReceipt(
    payload: TripReceiptEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderTripReceiptEmail(payload).subject
      : `Trip Receipt – #${payload.tripId}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_receipt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: payload.passenger.email,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(`[StubEmailDispatch] Receipt logged for Trip #${payload.tripId}`);
    return result;
  }

  public async sendCorporateInvoice(
    payload: CorporateInvoiceEmailPayload
  ): Promise<EmailDispatchResult> {
    const templates = await loadServerEmailTemplates();
    const subject = templates
      ? templates.renderCorporateInvoiceEmail(payload).subject
      : `Invoice ${payload.invoiceNumber} – ${COMPANY_CONFIG.name}`;
    const result: EmailDispatchResult = {
      success: true,
      simulated: true,
      messageId: `stub_invoice_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      recipient: payload.customerEmail,
      subject,
      dispatchedAt: new Date().toISOString(),
    };
    this.dispatchedEmails.push(result);
    console.info(
      `[StubEmailDispatch] Invoice ${payload.invoiceNumber} logged for ${payload.customerEmail}`
    );
    return result;
  }
}

/**
 * Singleton factory retrieving the universal IEmailDispatchService.
 */
let cachedEmailService: IEmailDispatchService | null = null;

export function getEmailDispatchService(options?: {
  forceStub?: boolean;
  config?: EmailServiceConfig;
}): IEmailDispatchService {
  if (options?.forceStub) {
    return new StubEmailDispatchService();
  }

  if (cachedEmailService && !options?.config) {
    return cachedEmailService;
  }

  const service = new ResendEmailService(options?.config);
  if (!options?.config) {
    cachedEmailService = service;
  }
  return service;
}
