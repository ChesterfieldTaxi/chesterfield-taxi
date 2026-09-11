/**
 * Resend Transactional Email Dispatch Service
 * 
 * Provides production email integration via the Resend API alongside
 * a StubEmailDispatchService for offline development and testing.
 */

import { Resend } from 'resend';
import type {
  IEmailDispatchService,
  BookingConfirmationEmailPayload,
  AdminDispatchAlertEmailPayload,
  EmailDispatchResult,
} from './types';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export interface EmailServiceConfig {
  apiKey?: string;
  fromAddress?: string;
  adminAlertRecipient?: string;
}

const DEFAULT_FROM_ADDRESS = `${COMPANY_CONFIG.name} <${COMPANY_CONFIG.email.dispatch}>`;
const DEFAULT_ADMIN_EMAIL = COMPANY_CONFIG.email.support || 'admin@chesterfieldtaxi.com';

/**
 * Generates branded HTML body for passenger booking confirmations.
 */
function buildBookingConfirmationHtml(payload: BookingConfirmationEmailPayload): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Booking Confirmation - ${COMPANY_CONFIG.name}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 24px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: #0f172a; color: #ffffff; padding: 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
          .content { padding: 24px; }
          .details-card { background: #f1f5f9; border-radius: 6px; padding: 16px; margin: 16px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 600; text-align: right; }
          .fare-total { font-size: 18px; font-weight: 700; color: #d97706; }
          .divider { height: 1px; background: #cbd5e1; margin: 12px 0; }
          .footer { padding: 16px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${COMPANY_CONFIG.name}</h1>
            <p style="margin: 4px 0 0; color: #f59e0b; font-size: 14px; font-weight: 600;">Ride Confirmation</p>
          </div>
          <div class="content">
            <p>Dear ${payload.passenger.firstName} ${payload.passenger.lastName},</p>
            <p>Your ride booking <strong>#${payload.tripId}</strong> has been received and confirmed by our 24/7 dispatch operations.</p>
            
            <div class="details-card">
              <div class="row">
                <span class="label">Pickup Location</span>
                <span class="value">${payload.pickupAddress}</span>
              </div>
              <div class="row">
                <span class="label">Dropoff Location</span>
                <span class="value">${payload.dropoffAddress}</span>
              </div>
              <div class="row">
                <span class="label">Pickup Time</span>
                <span class="value">${payload.pickupTime} (${payload.bookingType.toUpperCase()})</span>
              </div>
              <div class="row">
                <span class="label">Vehicle Class</span>
                <span class="value">${payload.vehicleTier.toUpperCase()}</span>
              </div>
              <div class="divider"></div>
              <div class="row">
                <span class="label">Payment Method</span>
                <span class="value">${payload.paymentMethod.toUpperCase()}</span>
              </div>
              <div class="row">
                <span class="label fare-total">Total Quoted Fare</span>
                <span class="value fare-total">$${payload.totalFare.toFixed(2)} ${payload.currency}</span>
              </div>
            </div>
            
            <p style="font-size: 13px; color: #64748b;">
              Need to modify or cancel your booking? Please reply directly to this email or call our dispatch desk at ${COMPANY_CONFIG.phone.dispatch}.
            </p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} ${COMPANY_CONFIG.legalName}. All rights reserved.
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Generates dispatch alert HTML for administrators.
 */
function buildAdminDispatchAlertHtml(payload: AdminDispatchAlertEmailPayload): string {
  return `
    <h2>🚨 New Booking Alert - ${payload.urgency === 'high' ? 'URGENT (ASAP)' : 'Scheduled'}</h2>
    <p><strong>Trip ID:</strong> ${payload.tripId}</p>
    <p><strong>Passenger:</strong> ${payload.passengerName} (${payload.passengerPhone} / ${payload.passengerEmail})</p>
    <p><strong>Pickup:</strong> ${payload.pickupAddress}</p>
    <p><strong>Dropoff:</strong> ${payload.dropoffAddress}</p>
    <p><strong>Time:</strong> ${payload.pickupTime} (${payload.bookingType})</p>
    <p><strong>Tier:</strong> ${payload.vehicleTier}</p>
    <p><strong>Fare:</strong> $${payload.totalFare.toFixed(2)} ${payload.currency}</p>
    ${payload.specialRequests ? `<p><strong>Notes:</strong> ${payload.specialRequests}</p>` : ''}
  `;
}

/**
 * Stub Email Service for local development, unit tests, and offline execution.
 */
export class StubEmailDispatchService implements IEmailDispatchService {
  public dispatchedEmails: EmailDispatchResult[] = [];

  public async sendBookingConfirmation(
    payload: BookingConfirmationEmailPayload
  ): Promise<EmailDispatchResult> {
    const messageId = `msg_stub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const result: EmailDispatchResult = {
      success: true,
      messageId,
      recipient: payload.passenger.email,
      subject: `Booking Confirmed: Trip #${payload.tripId}`,
      dispatchedAt: new Date().toISOString(),
    };

    this.dispatchedEmails.push(result);
    console.info(`[StubEmailDispatch] Sent booking confirmation to ${payload.passenger.email} (Trip #${payload.tripId})`);
    return result;
  }

  public async sendAdminDispatchAlert(
    payload: AdminDispatchAlertEmailPayload
  ): Promise<EmailDispatchResult> {
    const messageId = `msg_stub_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const result: EmailDispatchResult = {
      success: true,
      messageId,
      recipient: DEFAULT_ADMIN_EMAIL,
      subject: `[Dispatch Alert] New Booking #${payload.tripId} (${payload.bookingType})`,
      dispatchedAt: new Date().toISOString(),
    };

    this.dispatchedEmails.push(result);
    console.info(`[StubEmailDispatch] Sent admin dispatch alert for Trip #${payload.tripId}`);
    return result;
  }
}

/**
 * Production Resend Email Dispatch Service.
 */
export class ResendEmailService implements IEmailDispatchService {
  private resend: Resend;
  private fromAddress: string;
  private adminAlertRecipient: string;

  constructor(config?: EmailServiceConfig) {
    const apiKey = config?.apiKey ?? process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable or config parameter is required.');
    }

    this.resend = new Resend(apiKey);
    this.fromAddress = config?.fromAddress ?? process.env.EMAIL_FROM ?? DEFAULT_FROM_ADDRESS;
    this.adminAlertRecipient = config?.adminAlertRecipient ?? process.env.ADMIN_ALERT_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  }

  public async sendBookingConfirmation(
    payload: BookingConfirmationEmailPayload
  ): Promise<EmailDispatchResult> {
    const subject = `Booking Confirmation - Trip #${payload.tripId}`;
    const html = buildBookingConfirmationHtml(payload);

    try {
      const response = await this.resend.emails.send({
        from: this.fromAddress,
        to: payload.passenger.email,
        subject,
        html,
      });

      if (response.error) {
        return {
          success: false,
          recipient: payload.passenger.email,
          subject,
          error: response.error.message,
          dispatchedAt: new Date().toISOString(),
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
        recipient: payload.passenger.email,
        subject,
        dispatchedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        recipient: payload.passenger.email,
        subject,
        error: errorMessage,
        dispatchedAt: new Date().toISOString(),
      };
    }
  }

  public async sendAdminDispatchAlert(
    payload: AdminDispatchAlertEmailPayload
  ): Promise<EmailDispatchResult> {
    const subject = `[Dispatch Alert] New Ride Request #${payload.tripId} (${payload.bookingType.toUpperCase()})`;
    const html = buildAdminDispatchAlertHtml(payload);

    try {
      const response = await this.resend.emails.send({
        from: this.fromAddress,
        to: this.adminAlertRecipient,
        subject,
        html,
      });

      if (response.error) {
        return {
          success: false,
          recipient: this.adminAlertRecipient,
          subject,
          error: response.error.message,
          dispatchedAt: new Date().toISOString(),
        };
      }

      return {
        success: true,
        messageId: response.data?.id,
        recipient: this.adminAlertRecipient,
        subject,
        dispatchedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        recipient: this.adminAlertRecipient,
        subject,
        error: errorMessage,
        dispatchedAt: new Date().toISOString(),
      };
    }
  }
}

/**
 * Factory retrieving the appropriate IEmailDispatchService.
 * Seamlessly selects ResendEmailService when RESEND_API_KEY is defined,
 * otherwise falls back to StubEmailDispatchService.
 */
let cachedEmailService: IEmailDispatchService | null = null;

export function getEmailDispatchService(options?: {
  forceStub?: boolean;
  config?: EmailServiceConfig;
}): IEmailDispatchService {
  if (options?.forceStub) {
    return new StubEmailDispatchService();
  }

  if (cachedEmailService) {
    return cachedEmailService;
  }

  const apiKey = options?.config?.apiKey ?? process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      cachedEmailService = new ResendEmailService(options?.config);
      return cachedEmailService;
    } catch (err) {
      console.warn('[getEmailDispatchService] Failed to initialize ResendEmailService, falling back to stub:', err);
      cachedEmailService = new StubEmailDispatchService();
      return cachedEmailService;
    }
  }

  cachedEmailService = new StubEmailDispatchService();
  return cachedEmailService;
}
