/**
 * Transactional HTML Email Templates — Executive Clean Edition
 *
 * Provides responsive, mobile-optimized HTML and plain-text email templates
 * with inline CSS and table-based layout for universal email client compatibility
 * (Gmail, Apple Mail, Outlook, Yahoo, iOS/Android).
 *
 * Visually aligned with the Chesterfield Taxi web app & Admin Console:
 * clean white cards, slate-100 canvas, royal-blue (#2563eb) accent,
 * crisp typography, tabular-nums currency, and zero emojis.
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import { buildCombinedLambertPickupInstructions } from '../../config/airports';
import type { PriceLineItem } from '../../types';
import { reconcileBreakdownWithoutRounding } from '../../utils/fare-breakdown.util';
import { buildGuestAccountSignupHref } from '../../utils/guest-trip-claim.util';
import { formatVehicleTier, formatVehicleTierDisplay } from '../../utils/vehicle-tier-format.util';
import type {
  BookingConfirmationEmailPayload,
  AdminDispatchAlertEmailPayload,
  StatusUpdateEmailPayload,
  BookingDeclinedEmailPayload,
  BookingClarificationRequestEmailPayload,
  TripReceiptEmailPayload,
  CorporateInvoiceEmailPayload,
  FlightOperationsEmailDetails,
} from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

type EmailAccentTheme = 'blue' | 'amber' | 'emerald' | 'rose';

const THEME_PALETTE: Record<
  EmailAccentTheme,
  { accent: string; badgeBg: string; badgeBorder: string; badgeText: string; dot: string }
> = {
  blue: {
    accent: '#2563eb',
    badgeBg: '#eff6ff',
    badgeBorder: '#bfdbfe',
    badgeText: '#1d4ed8',
    dot: '#2563eb',
  },
  emerald: {
    accent: '#059669',
    badgeBg: '#ecfdf5',
    badgeBorder: '#a7f3d0',
    badgeText: '#047857',
    dot: '#10b981',
  },
  amber: {
    accent: '#d97706',
    badgeBg: '#fffbeb',
    badgeBorder: '#fde68a',
    badgeText: '#b45309',
    dot: '#f59e0b',
  },
  rose: {
    accent: '#dc2626',
    badgeBg: '#fef2f2',
    badgeBorder: '#fecaca',
    badgeText: '#b91c1c',
    dot: '#ef4444',
  },
};

/**
 * Resolves the canonical public application origin without hardcoding a single domain.
 */
export function getAppBaseUrl(): string {
  const envSource =
    (typeof process !== 'undefined' && process.env) ||
    (typeof globalThis !== 'undefined' && (globalThis as any).process?.env);
  const envUrl =
    envSource?.APP_BASE_URL ||
    envSource?.PUBLIC_APP_URL ||
    envSource?.VITE_APP_BASE_URL ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_APP_BASE_URL);
  if (typeof envUrl === 'string' && /^https?:\/\//i.test(envUrl.trim())) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    /^https?:\/\//i.test(window.location.origin)
  ) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://www.chesterfieldcar.com';
}

export function resolveTrackingUrl(
  tripId: string,
  trackingToken?: string,
  explicitTrackingUrl?: string
): string {
  if (explicitTrackingUrl && /^https?:\/\//i.test(explicitTrackingUrl.trim())) {
    return explicitTrackingUrl.trim();
  }
  const ref = (trackingToken || tripId || '').trim();
  return `${getAppBaseUrl()}/track/${encodeURIComponent(ref)}`;
}

/**
 * Escapes HTML special characters in user-provided strings before template interpolation.
 */
export function escapeHtml(input?: string | null): string {
  if (!input) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { formatVehicleTier, formatVehicleTierDisplay };

function formatPaymentMethod(method?: string): string {
  if (!method) return 'Pay in Car';
  switch (method.toLowerCase()) {
    case 'card':
      return 'Credit / Debit Card';
    case 'card_terminal':
    case 'pay_in_cab':
      return 'Pay in Car (Card)';
    case 'stripe_preauth':
      return 'Pre-Authorized Card';
    case 'cash':
      return 'Pay in Car (Cash)';
    case 'corporate':
    case 'account':
    case 'corporate_account':
      return 'Corporate Account';
    default:
      return method.replace(/_/g, ' ').toUpperCase();
  }
}

function getCompanyInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z]/.test(w));
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return 'CT';
}

function renderStatusPill(label: string, theme: EmailAccentTheme): string {
  const t = THEME_PALETTE[theme];
  return `
    <span style="display: inline-block; padding: 5px 12px; border-radius: 9999px; background-color: ${t.badgeBg}; border: 1px solid ${t.badgeBorder}; color: ${t.badgeText}; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">
      <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${t.dot}; margin-right: 6px; vertical-align: middle;"></span>${escapeHtml(label)}
    </span>
  `;
}

function renderCtaButton(href: string, label: string, bgColor: string = '#2563eb'): string {
  return `
    <div style="margin-top: 18px;">
      <a href="${escapeHtml(href)}" style="display: inline-block; background-color: ${bgColor}; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 11px 24px; border-radius: 10px; letter-spacing: -0.01em;">
        ${escapeHtml(label)} &rarr;
      </a>
    </div>
  `;
}

function renderRouteTimelineHtml(opts: {
  pickupAddress: string;
  pickupLabel?: string;
  pickupNotes?: string;
  intermediateStops?: Array<{ address: string; notes?: string }>;
  dropoffAddress: string;
  dropoffLabel?: string;
  dropoffNotes?: string;
}): string {
  const stopsHtml =
    opts.intermediateStops && opts.intermediateStops.length > 0
      ? opts.intermediateStops
          .map(
            (s, i) => `
        <tr>
          <td width="20" valign="top" style="padding: 4px 0;">
            <div style="width: 8px; height: 8px; border-radius: 2px; background-color: #64748b; margin-top: 4px;"></div>
          </td>
          <td valign="top" style="padding: 0 0 12px 6px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;">
              Stop ${i + 1}
            </div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; line-height: 1.4;">
              ${escapeHtml(s.address)}
            </div>
            ${
              s.notes
                ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px;">Note: ${escapeHtml(s.notes)}</div>`
                : ''
            }
          </td>
        </tr>`
          )
          .join('')
      : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 4px;">
      <tr>
        <td width="20" valign="top" style="padding: 4px 0;">
          <div style="width: 9px; height: 9px; border-radius: 50%; background-color: #10b981; margin-top: 4px;"></div>
        </td>
        <td valign="top" style="padding: 0 0 12px 6px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #059669;">
            ${escapeHtml(opts.pickupLabel || 'Pickup')}
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; line-height: 1.4;">
            ${escapeHtml(opts.pickupAddress)}
          </div>
          ${
            opts.pickupNotes
              ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px;">Note: ${escapeHtml(opts.pickupNotes)}</div>`
              : ''
          }
        </td>
      </tr>
      ${stopsHtml}
      <tr>
        <td width="20" valign="top" style="padding: 4px 0;">
          <div style="width: 9px; height: 9px; border-radius: 50%; background-color: #ef4444; margin-top: 4px;"></div>
        </td>
        <td valign="top" style="padding: 0 0 2px 6px;">
          <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #dc2626;">
            ${escapeHtml(opts.dropoffLabel || 'Dropoff')}
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; line-height: 1.4;">
            ${escapeHtml(opts.dropoffAddress)}
          </div>
          ${
            opts.dropoffNotes
              ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px;">Note: ${escapeHtml(opts.dropoffNotes)}</div>`
              : ''
          }
        </td>
      </tr>
    </table>
  `;
}

function renderFlightSummaryBox(
  flight: FlightOperationsEmailDetails | undefined,
  heading: string = 'Flight Tracking'
): string {
  if (!flight) return '';
  const hasAny = Boolean(
    flight.airlineCode ||
      flight.airlineName ||
      flight.flightNumber ||
      flight.tailNumber ||
      flight.fboFacility ||
      flight.isAirportTrip
  );
  if (!hasAny) return '';

  const isPrivate = Boolean(flight.isPrivateAviation || flight.tailNumber);
  const summary = isPrivate
    ? `Private Aviation · Tail #${escapeHtml(flight.tailNumber || 'N/A')}${
        flight.fboFacility ? ` (${escapeHtml(flight.fboFacility)})` : ''
      }`
    : `${escapeHtml(flight.airlineName || flight.airlineCode || 'Commercial Airline')}${
        flight.flightNumber ? ` Flight #${escapeHtml(flight.flightNumber)}` : ''
      }${flight.departureAirport ? ` · From ${escapeHtml(flight.departureAirport.toUpperCase())}` : ''}`;

  return `
    <div style="margin-top: 12px; padding: 10px 14px; background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px;">
      <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #0369a1;">
        ${escapeHtml(heading)}
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 3px;">
        ${summary}
      </div>
    </div>
  `;
}

/**
 * Determines whether a transactional rider email should display the Guest-to-User Account Signup CTA.
 * Hidden when `customerId` is already linked or when the trip status is `cancelled` / `declined`.
 */
export function shouldRenderGuestSignupCta(
  input?: {
    customerId?: string | null;
    status?: string | null;
    newStatus?: string | null;
    tripId?: string | null;
  } | null
): boolean {
  if (!input || !String(input.tripId || '').trim()) return false;
  if (typeof input.customerId === 'string' && input.customerId.trim().length > 0) {
    return false;
  }
  const rawStatus = String(input.newStatus ?? input.status ?? '')
    .trim()
    .toLowerCase();
  if (rawStatus === 'cancelled' || rawStatus === 'declined') {
    return false;
  }
  return true;
}

function renderGuestSignupCtaHtml(registerUrl: string): string {
  return `
    <!-- Client Portal Account CTA -->
    <div data-guest-signup-cta="true" style="background-color: #0f172a; border-radius: 14px; padding: 22px 20px; margin: 20px 0 18px 0; text-align: center; color: #ffffff;">
      <div style="font-size: 10px; font-weight: 800; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.1em;">
        Client Portal
      </div>
      <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-top: 6px; letter-spacing: -0.01em;">
        Save this ride &amp; rebook in seconds
      </div>
      <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin: 6px auto 16px auto; max-width: 420px;">
        Create a free account to link this trip to your ride history, save favorite addresses, and access instant receipts.
      </div>
      <a href="${escapeHtml(registerUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 22px; border-radius: 10px;">
        Create Free Account &rarr;
      </a>
    </div>
  `;
}

function renderGuestSignupCtaText(registerUrl: string): string {
  return `\nCLIENT PORTAL ACCOUNT:\nSave this ride & rebook in seconds: ${registerUrl}\n`;
}

/**
 * Renders the canonical Admin Tariff price breakdown (Base Fare + Extras + Surcharges + Discounts,
 * with any rounding folded silently into Base Fare) as clean inline-CSS HTML rows for email clients.
 */
function renderPriceBreakdownHtml(
  breakdown?: PriceLineItem[],
  tariffProfileName?: string,
  targetTotalFare?: number
): string {
  if (!breakdown || breakdown.length === 0) return '';
  const ordered = reconcileBreakdownWithoutRounding(breakdown, targetTotalFare);
  if (ordered.length === 0) return '';

  const rowsHtml = ordered
    .map((item) => {
      const isWaived = Boolean(item.isWaived);
      const isDiscount = !isWaived && (item.category === 'discount' || item.amount < 0);
      const color = isDiscount || isWaived ? '#047857' : '#475569';
      const formattedAmt = isWaived
        ? '$0.00'
        : isDiscount
        ? `-$${Math.abs(item.amount).toFixed(2)}`
        : `$${item.amount.toFixed(2)}`;
      return `
        <tr>
          <td style="padding: 4px 0; font-size: 12px; color: ${color}; ${
        item.category === 'base' ? 'font-weight: 700; color: #0f172a;' : ''
      }">
            ${escapeHtml(item.label)}
          </td>
          <td align="right" style="padding: 4px 0; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: ${
        isDiscount || isWaived ? '#047857' : '#0f172a'
      };">
            ${formattedAmt}
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td colspan="2" style="padding-bottom: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;">
            Fare Breakdown${tariffProfileName ? ` &middot; ${escapeHtml(tariffProfileName)}` : ''}
          </td>
        </tr>
        ${rowsHtml}
      </table>
    </div>
  `;
}

function renderPriceBreakdownText(
  breakdown?: PriceLineItem[],
  targetTotalFare?: number
): string {
  if (!breakdown || breakdown.length === 0) return '';
  const ordered = reconcileBreakdownWithoutRounding(breakdown, targetTotalFare);
  if (ordered.length === 0) return '';
  return (
    '\nFARE BREAKDOWN:\n' +
    ordered
      .map((item) => {
        const amt = item.isWaived
          ? '$0.00'
          : item.amount < 0
          ? `-$${Math.abs(item.amount).toFixed(2)}`
          : `$${item.amount.toFixed(2)}`;
        return `- ${item.label}: ${amt}`;
      })
      .join('\n')
  );
}

/**
 * Common Executive Clean HTML email shell wrapping branded header, container, and footer.
 */
function renderEmailShell(
  contentHtml: string,
  previewText: string = '',
  companyOverride?: { name?: string; phone?: string; address?: string },
  theme: EmailAccentTheme = 'blue'
): string {
  const companyName = companyOverride?.name || COMPANY_CONFIG.name;
  const companyPhone = companyOverride?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyAddress = companyOverride?.address || COMPANY_CONFIG.address.formatted;
  const safeCompanyName = escapeHtml(companyName);
  const safeCompanyPhone = escapeHtml(companyPhone);
  const safeCompanyAddress = escapeHtml(companyAddress);
  const rawPhone = companyPhone.replace(/\D/g, '');
  const initials = escapeHtml(getCompanyInitials(companyName));
  const palette = THEME_PALETTE[theme];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeCompanyName}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    .email-wrapper { width: 100%; background-color: #f1f5f9; padding: 32px 12px; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.06); }
    .content-body { padding: 28px 28px 24px 28px; }
    .card-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 16px 0; }
    .card-white { background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 16px 0; }
    .section-title { font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.07em; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
    .item-label { font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .item-value { font-size: 14px; color: #0f172a; font-weight: 600; line-height: 1.4; }
    .fare-total { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .footer-section { background-color: #f8fafc; padding: 22px 28px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6; }
    @media only screen and (max-width: 620px) {
      .email-wrapper { padding: 16px 8px !important; }
      .email-container { width: 100% !important; border-radius: 12px !important; }
      .content-body { padding: 22px 18px 18px 18px !important; }
      .header-pad { padding: 18px 18px !important; }
    }
  </style>
</head>
<body>
  ${
    previewText
      ? `<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(
          previewText
        )}</div>`
      : ''
  }
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center">
        <div class="email-container">
          <!-- 4px Semantic Accent Stripe -->
          <div style="height: 4px; background-color: ${palette.accent}; line-height: 4px; font-size: 4px;">&nbsp;</div>

          <!-- Clean Executive Brand Header -->
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
            <tr>
              <td class="header-pad" style="padding: 18px 28px;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td valign="middle">
                      <table cellpadding="0" cellspacing="0" role="presentation">
                        <tr>
                          <td valign="middle" style="padding-right: 12px;">
                            <div style="width: 36px; height: 36px; border-radius: 10px; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 800; line-height: 36px; text-align: center; letter-spacing: 0.03em;">
                              ${initials}
                            </div>
                          </td>
                          <td valign="middle">
                            <div style="font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; line-height: 1.2;">
                              ${safeCompanyName}
                            </div>
                            <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px;">
                              ${escapeHtml(COMPANY_CONFIG.tagline)}
                            </div>
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" valign="middle">
                      <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="display: inline-block; padding: 6px 12px; border-radius: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0; color: #0f172a; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap;">
                        ${safeCompanyPhone}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <!-- Body Content -->
          <div class="content-body">
            ${contentHtml}
          </div>

          <!-- Clean Executive Footer -->
          <div class="footer-section">
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
              24/7 Dispatch Desk:
              <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="color: #2563eb; text-decoration: none; font-weight: 700;">
                ${safeCompanyPhone}
              </a>
            </p>
            <p style="margin: 0 0 8px 0; color: #64748b;">
              ${escapeHtml(COMPANY_CONFIG.operatingHours)} &middot; ${safeCompanyAddress}
            </p>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              &copy; ${new Date().getFullYear()} ${safeCompanyName}. All rights reserved.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Renders complete passenger, contact person, child seat, and party breakdown card for emails.
 */
function renderPassengerDetailsCard(
  passenger: BookingConfirmationEmailPayload['passenger'],
  passengerCount?: number,
  luggageCount?: number,
  contactPerson?: BookingConfirmationEmailPayload['contactPerson'],
  additionalPassengers?: BookingConfirmationEmailPayload['additionalPassengers'],
  carSeatsBreakdown?: BookingConfirmationEmailPayload['carSeatsBreakdown'],
  accentColor: string = '#2563eb'
): string {
  const hasCarSeats = Boolean(
    carSeatsBreakdown &&
      ((carSeatsBreakdown.total && carSeatsBreakdown.total > 0) ||
        (carSeatsBreakdown.rearFacing && carSeatsBreakdown.rearFacing > 0) ||
        (carSeatsBreakdown.frontFacing && carSeatsBreakdown.frontFacing > 0) ||
        (carSeatsBreakdown.booster && carSeatsBreakdown.booster > 0))
  );

  const carSeatParts: string[] = [];
  if (carSeatsBreakdown?.rearFacing) carSeatParts.push(`${carSeatsBreakdown.rearFacing} Rear-Facing`);
  if (carSeatsBreakdown?.frontFacing) carSeatParts.push(`${carSeatsBreakdown.frontFacing} Front-Facing`);
  if (carSeatsBreakdown?.booster) carSeatParts.push(`${carSeatsBreakdown.booster} Booster`);

  const hasBooker = Boolean(contactPerson?.isBookerDifferent && contactPerson?.contactName);
  const hasAdditional = Boolean(additionalPassengers && additionalPassengers.length > 0);
  const rawPhone = passenger.phone ? passenger.phone.replace(/\D/g, '') : '';

  return `
    <div class="card-white">
      <div class="section-title">Passenger &amp; Party Details</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="58%" valign="top">
            <div class="item-label">Primary Passenger</div>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(passenger.firstName)} ${escapeHtml(passenger.lastName)}
            </div>
            <div style="margin-top: 4px; font-size: 13px; color: #475569;">
              <a href="tel:${escapeHtml(rawPhone || passenger.phone)}" style="color: ${accentColor}; text-decoration: none; font-weight: 600;">
                ${escapeHtml(passenger.phone || 'Phone not provided')}
              </a>
            </div>
            ${
              passenger.email
                ? `<div style="margin-top: 2px; font-size: 12px; color: #64748b;">
                    <a href="mailto:${escapeHtml(passenger.email)}" style="color: #64748b; text-decoration: none;">${escapeHtml(passenger.email)}</a>
                  </div>`
                : ''
            }
          </td>
          <td width="42%" valign="top" align="right">
            <div class="item-label">Party &amp; Luggage</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
              ${passengerCount || 1} Passenger${(passengerCount || 1) > 1 ? 's' : ''}
            </div>
            <div style="margin-top: 3px; font-size: 13px; color: #475569;">
              ${luggageCount ?? 0} Standard Bag${(luggageCount ?? 0) === 1 ? '' : 's'}
            </div>
          </td>
        </tr>
      </table>

      ${
        hasBooker && contactPerson
          ? `
        <div style="margin-top: 12px; padding: 10px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
          <div class="item-label">Booker / Authorized Contact</div>
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
            ${escapeHtml(contactPerson.contactName)}${
              contactPerson.contactRole
                ? ` <span style="font-weight: 500; color: #64748b;">(${escapeHtml(contactPerson.contactRole)})</span>`
                : ''
            }
          </div>
          <div style="font-size: 12px; color: #475569; margin-top: 2px;">
            ${
              contactPerson.contactPhone
                ? `<a href="tel:${escapeHtml(contactPerson.contactPhone.replace(/\D/g, ''))}" style="color: ${accentColor}; text-decoration: none; font-weight: 600;">${escapeHtml(contactPerson.contactPhone)}</a>`
                : ''
            }
            ${contactPerson.contactPhone && contactPerson.contactEmail ? ' &middot; ' : ''}
            ${
              contactPerson.contactEmail
                ? `<a href="mailto:${escapeHtml(contactPerson.contactEmail)}" style="color: #475569; text-decoration: none;">${escapeHtml(contactPerson.contactEmail)}</a>`
                : ''
            }
          </div>
        </div>`
          : ''
      }

      ${
        hasCarSeats
          ? `
        <div style="margin-top: 10px; padding: 10px 12px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px;">
          <span style="font-size: 10px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.06em;">
            Child Safety Seats:
          </span>
          <span style="font-size: 13px; font-weight: 700; color: #1e3a8a; margin-left: 6px;">
            ${escapeHtml(carSeatParts.join(' · '))}
          </span>
        </div>`
          : ''
      }

      ${
        hasAdditional && additionalPassengers
          ? `
        <div style="margin-top: 10px; padding: 10px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
          <div class="item-label">Additional Named Passengers</div>
          <div style="font-size: 12px; color: #0f172a; font-weight: 500; margin-top: 2px;">
            ${additionalPassengers
              .map((ap) => `${escapeHtml(ap.name)}${ap.phone ? ` (${escapeHtml(ap.phone)})` : ''}`)
              .join(' &middot; ')}
          </div>
        </div>`
          : ''
      }
    </div>
  `;
}

function renderPassengerDetailsText(
  passenger: BookingConfirmationEmailPayload['passenger'],
  passengerCount?: number,
  luggageCount?: number,
  contactPerson?: BookingConfirmationEmailPayload['contactPerson'],
  additionalPassengers?: BookingConfirmationEmailPayload['additionalPassengers'],
  carSeatsBreakdown?: BookingConfirmationEmailPayload['carSeatsBreakdown']
): string {
  let out = `PASSENGER & CONTACT DETAILS:
- Primary Passenger: ${passenger.firstName} ${passenger.lastName}
- Direct Phone: ${passenger.phone || 'N/A'}
- Direct Email: ${passenger.email || 'N/A'}
- Party Size: ${passengerCount || 1} Passengers | Standard Luggage: ${luggageCount ?? 0} Bags`;

  if (contactPerson?.isBookerDifferent && contactPerson?.contactName) {
    out += `\n- Booker / Authorized Contact: ${contactPerson.contactName}${
      contactPerson.contactRole ? ` (${contactPerson.contactRole})` : ''
    } [Phone: ${contactPerson.contactPhone || 'N/A'}, Email: ${contactPerson.contactEmail || 'N/A'}]`;
  }

  if (carSeatsBreakdown) {
    const parts: string[] = [];
    if (carSeatsBreakdown.rearFacing) parts.push(`${carSeatsBreakdown.rearFacing} Rear-Facing`);
    if (carSeatsBreakdown.frontFacing) parts.push(`${carSeatsBreakdown.frontFacing} Front-Facing`);
    if (carSeatsBreakdown.booster) parts.push(`${carSeatsBreakdown.booster} Booster`);
    if (parts.length > 0) {
      out += `\n- Child Safety Car Seats: ${parts.join(', ')}`;
    }
  }

  if (additionalPassengers && additionalPassengers.length > 0) {
    out += `\n- Additional Named Passengers: ${additionalPassengers
      .map((a) => `${a.name}${a.phone ? ` (${a.phone})` : ''}`)
      .join(', ')}`;
  }

  return out;
}

function isLambertAddress(address?: string): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return (
    lower.includes('lambert') ||
    lower.includes('stl airport') ||
    lower.includes('10701 lambert') ||
    lower.includes('st. louis lambert') ||
    lower.includes('st louis lambert')
  );
}

/**
 * 1A. Passenger Booking Request Received (Pending Dispatch Review / Unconfirmed)
 */
export function renderBookingRequestReceivedEmail(
  payload: BookingConfirmationEmailPayload
): RenderedEmail {
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const isScheduled = payload.bookingType === 'scheduled';
  const isLambert = isLambertAddress(payload.pickupAddress);
  const lambertInstructions =
    payload.lambertPickupInstructions ||
    buildCombinedLambertPickupInstructions();

  const hasReturn = Boolean(payload.returnTripDetails);
  const totalCombinedFare = hasReturn
    ? payload.totalFare + (payload.returnTripDetails?.totalFare || 0)
    : payload.totalFare;
  const trackingUrl = resolveTrackingUrl(payload.tripId, payload.trackingToken, payload.trackingUrl);
  const safeTripId = escapeHtml(payload.tripId);
  const safeReturnTripId = escapeHtml(payload.returnTripDetails?.tripId);
  const safeFirstName = escapeHtml(payload.passenger.firstName);
  const safeCompanyPhone = escapeHtml(companyPhone);

  const subject = hasReturn
    ? `Round-Trip Request Received: #${payload.tripId} & #${payload.returnTripDetails?.tripId} | ${companyName}`
    : `Ride Request Received: #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(
        hasReturn ? 'Round-Trip Request · Under Review' : 'Request Received · Under Review',
        'amber'
      )}
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 6px 0;">
        We've received your ${hasReturn ? 'round-trip ' : ''}request, ${safeFirstName}
      </h2>
      <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.55;">
        ${
          hasReturn
            ? `Your trip requests <strong>#${safeTripId}</strong> (Outbound) and <strong>#${safeReturnTripId}</strong> (Return) are with our 24/7 dispatch team. We are confirming driver availability and pickup timing.`
            : `Your trip request <strong>#${safeTripId}</strong> is with our 24/7 dispatch team. We are confirming driver availability and pickup timing.`
        }
      </p>
      ${renderCtaButton(trackingUrl, 'Track Trip Status', '#d97706')}
    </div>

    <!-- 3-Step Review Progress Bar -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px; margin: 16px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="33%" align="center" style="font-size: 11px; color: #047857; font-weight: 700;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #10b981; color: #ffffff; line-height: 24px; margin: 0 auto 6px auto; font-size: 12px; font-weight: 800;">1</div>
            Request Sent
          </td>
          <td width="33%" align="center" style="font-size: 11px; color: #b45309; font-weight: 800;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #f59e0b; color: #ffffff; line-height: 24px; margin: 0 auto 6px auto; font-size: 12px; font-weight: 800;">2</div>
            Dispatch Review
          </td>
          <td width="33%" align="center" style="font-size: 11px; color: #94a3b8; font-weight: 600;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background-color: #e2e8f0; color: #64748b; line-height: 24px; margin: 0 auto 6px auto; font-size: 12px; font-weight: 700;">3</div>
            Confirmed
          </td>
        </tr>
      </table>
      <div style="font-size: 12px; color: #92400e; margin-top: 12px; text-align: center; line-height: 1.45;">
        You will receive a confirmation email as soon as dispatch assigns your car and driver.
      </div>
    </div>

    ${renderPassengerDetailsCard(
      payload.passenger,
      payload.passengerCount,
      payload.luggageCount,
      payload.contactPerson,
      payload.additionalPassengers,
      payload.carSeatsBreakdown,
      '#d97706'
    )}

    <!-- Outbound Itinerary -->
    <div class="card-box">
      <div class="section-title">
        ${hasReturn ? `1. Outbound Trip (#${safeTripId})` : `Trip Details (#${safeTripId})`}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%" valign="top">
            <div class="item-label">Requested Pickup</div>
            <div class="item-value">${escapeHtml(payload.pickupTime)}</div>
            <div style="font-size: 11px; color: #b45309; font-weight: 700; margin-top: 2px;">
              ${isScheduled ? 'Scheduled Pickup' : 'Immediate Pickup (ASAP)'}
            </div>
          </td>
          <td width="50%" valign="top" align="right">
            <div class="item-label">Vehicle</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.pickupAddress,
          pickupNotes: payload.pickupNotes,
          intermediateStops: payload.intermediateStops,
          dropoffAddress: payload.dropoffAddress,
          dropoffNotes: payload.dropoffNotes,
        })}
      </div>
      ${renderFlightSummaryBox(payload.flightDetails, 'Flight Tracking')}
    </div>

    ${
      hasReturn && payload.returnTripDetails
        ? `
    <!-- Return Itinerary -->
    <div class="card-box">
      <div class="section-title" style="color: #0369a1;">
        2. Return Trip (#${safeReturnTripId})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%" valign="top">
            <div class="item-label">Return Pickup</div>
            <div class="item-value">${escapeHtml(payload.returnTripDetails.pickupTime)}</div>
          </td>
          <td width="50%" valign="top" align="right">
            <div class="item-label">Vehicle</div>
            <div class="item-value">
              ${escapeHtml(
                formatVehicleTier(
                  payload.returnTripDetails.vehicleTier,
                  undefined,
                  payload.returnTripDetails.vehicleDisplayName
                )
              )}
            </div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.returnTripDetails.pickupAddress,
          pickupLabel: 'Return Pickup',
          dropoffAddress: payload.returnTripDetails.dropoffAddress,
          dropoffLabel: 'Return Dropoff',
        })}
      </div>
      ${renderFlightSummaryBox(payload.returnTripDetails.flightDetails, 'Return Flight Tracking')}
    </div>`
        : ''
    }

    ${
      payload.oversizedItemsSummary
        ? `
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #92400e;">Oversized Items</div>
      <div style="font-size: 13px; font-weight: 600; color: #78350f;">${escapeHtml(payload.oversizedItemsSummary)}</div>
    </div>`
        : ''
    }

    ${
      isLambert
        ? `
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #0369a1;">STL Lambert Curbside Pickup Instructions</div>
      <div style="font-size: 13px; color: #0f172a; line-height: 1.5; margin-top: 2px;">${escapeHtml(lambertInstructions)}</div>
    </div>`
        : ''
    }

    ${
      payload.customExtrasSummary
        ? `
    <div class="card-white">
      <div class="item-label" style="color: #047857;">Selected Extras &amp; Add-Ons</div>
      <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${escapeHtml(payload.customExtrasSummary)}</div>
    </div>`
        : ''
    }

    ${
      payload.specialRequests
        ? `
    <div class="card-white">
      <div class="item-label">Passenger Notes / Special Requests</div>
      <div style="font-size: 13px; color: #334155; line-height: 1.5;">${escapeHtml(payload.specialRequests)}</div>
    </div>`
        : ''
    }

    <!-- Fare Summary -->
    <div class="card-white" style="border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td valign="middle">
            <div class="item-label">Payment Method</div>
            <div class="item-value">${escapeHtml(formatPaymentMethod(payload.paymentMethod))}</div>
            ${
              hasReturn
                ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Covers Outbound &amp; Return</div>`
                : ''
            }
          </td>
          <td align="right" valign="middle">
            <div class="item-label">${hasReturn ? 'Combined Estimate' : 'Estimated Fare'}</div>
            <div class="fare-total">
              $${totalCombinedFare.toFixed(2)}
              <span style="font-size: 12px; color: #64748b; font-weight: 600;">${escapeHtml(payload.currency)}</span>
            </div>
            ${
              hasReturn
                ? `<div style="font-size: 11px; color: #64748b;">Outbound $${payload.totalFare.toFixed(2)} + Return $${payload.returnTripDetails?.totalFare.toFixed(2)}</div>`
                : ''
            }
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName, payload.totalFare)}
    </div>

    ${
      shouldRenderGuestSignupCta(payload)
        ? renderGuestSignupCtaHtml(
            buildGuestAccountSignupHref({
              baseUrl: getAppBaseUrl(),
              tripIds: [payload.tripId, payload.returnTripDetails?.tripId],
              email: payload.passenger.email,
              name: `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim(),
              phone: payload.passenger.phone,
            })
          )
        : ''
    }

    <!-- Assistance Callout -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-top: 18px;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px;">
        Need urgent changes or dispatch assistance?
      </div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5;">
        Call our 24/7 dispatch desk at
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #2563eb; text-decoration: none;">${safeCompanyPhone}</a>
        and reference <strong>#${safeTripId}</strong>${hasReturn ? ` or <strong>#${safeReturnTripId}</strong>` : ''}.
      </div>
    </div>
    `,
    `We have received your ${hasReturn ? 'round-trip ' : ''}ride request #${payload.tripId}. Dispatch is reviewing your details.`,
    payload.companySettings,
    'amber'
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops
          .map((s, idx) => `- Stop ${idx + 1}: ${s.address}${s.notes ? ` (Note: ${s.notes})` : ''}`)
          .join('\n') + '\n'
      : '';

  const text = `
========================================
${companyName} - ${hasReturn ? 'ROUND-TRIP ' : ''}BOOKING REQUEST RECEIVED
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

We have received your ${hasReturn ? 'round-trip ' : ''}ride request #${payload.tripId}${
    hasReturn ? ` & #${payload.returnTripDetails?.tripId}` : ''
  }.
Our 24/7 dispatch operations team is reviewing route timing and vehicle availability. You will receive an official confirmation shortly.

Track Live Status: ${trackingUrl}

${renderPassengerDetailsText(
  payload.passenger,
  payload.passengerCount,
  payload.luggageCount,
  payload.contactPerson,
  payload.additionalPassengers,
  payload.carSeatsBreakdown
)}

OUTBOUND TRIP: #${payload.tripId}
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` (Note: ${payload.pickupNotes})` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` (Note: ${payload.dropoffNotes})` : ''}
${
  payload.flightDetails?.airlineName ||
  payload.flightDetails?.airlineCode ||
  payload.flightDetails?.flightNumber ||
  payload.flightDetails?.tailNumber
    ? `- Flight: ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || ''} ${
        payload.flightDetails?.flightNumber || payload.flightDetails?.tailNumber || ''
      }\n`
    : ''
}${
    hasReturn && payload.returnTripDetails
      ? `
RETURN TRIP: #${payload.returnTripDetails.tripId}
- Return Timing: ${payload.returnTripDetails.pickupTime}
- Return Vehicle: ${formatVehicleTier(
          payload.returnTripDetails.vehicleTier,
          undefined,
          payload.returnTripDetails.vehicleDisplayName
        )}
- Return Pickup: ${payload.returnTripDetails.pickupAddress}
- Return Dropoff: ${payload.returnTripDetails.dropoffAddress}
`
      : ''
  }${payload.oversizedItemsSummary ? `- Oversized Items: ${payload.oversizedItemsSummary}\n` : ''}${
    payload.customExtrasSummary ? `- Selected Extras: ${payload.customExtrasSummary}\n` : ''
  }${payload.specialRequests ? `SPECIAL REQUESTS / NOTES:\n${payload.specialRequests}\n` : ''}
PAYMENT & FARE:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- ${hasReturn ? 'Combined Fare' : 'Estimated Fare'}: $${totalCombinedFare.toFixed(2)} ${
    payload.currency
  }${renderPriceBreakdownText(payload.breakdown, payload.totalFare)}
${
  shouldRenderGuestSignupCta(payload)
    ? renderGuestSignupCtaText(
        buildGuestAccountSignupHref({
          baseUrl: getAppBaseUrl(),
          tripIds: [payload.tripId, payload.returnTripDetails?.tripId],
          email: payload.passenger.email,
          name: `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim(),
          phone: payload.passenger.phone,
        })
      )
    : ''
}
Questions or changes? Call 24/7 Dispatch at ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 1B. Passenger Booking Confirmed
 */
export function renderBookingConfirmedEmail(
  payload: BookingConfirmationEmailPayload
): RenderedEmail {
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const isScheduled = payload.bookingType === 'scheduled';
  const isLambert = isLambertAddress(payload.pickupAddress);
  const lambertInstructions =
    payload.lambertPickupInstructions ||
    buildCombinedLambertPickupInstructions();

  const hasReturn = Boolean(payload.returnTripDetails);
  const totalCombinedFare = hasReturn
    ? payload.totalFare + (payload.returnTripDetails?.totalFare || 0)
    : payload.totalFare;
  const trackingUrl = resolveTrackingUrl(payload.tripId, payload.trackingToken, payload.trackingUrl);
  const returnTrackingUrl = payload.returnTripDetails
    ? resolveTrackingUrl(payload.returnTripDetails.tripId, payload.returnTripDetails.trackingToken)
    : '';
  const safeTripId = escapeHtml(payload.tripId);
  const safeReturnTripId = escapeHtml(payload.returnTripDetails?.tripId);
  const safeFirstName = escapeHtml(payload.passenger.firstName);
  const safeCompanyPhone = escapeHtml(companyPhone);

  const subject = hasReturn
    ? `Round-Trip Booking Confirmed: #${payload.tripId} & #${payload.returnTripDetails?.tripId} | ${companyName}`
    : `Booking Confirmed: #${payload.tripId} | ${companyName}`;

  const registerUrl = buildGuestAccountSignupHref({
    baseUrl: getAppBaseUrl(),
    tripIds: [payload.tripId, payload.returnTripDetails?.tripId],
    email: payload.passenger.email,
    name: `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim(),
    phone: payload.passenger.phone,
  });
  const showGuestSignupCta = shouldRenderGuestSignupCta(payload);

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      ${renderStatusPill(
        hasReturn ? 'Round-Trip Confirmed' : 'Booking Confirmed',
        'emerald'
      )}
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 6px 0;">
        Your ride is confirmed, ${safeFirstName}
      </h2>
      <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.55;">
        ${
          hasReturn
            ? `Trips <strong>#${safeTripId}</strong> (Outbound) and <strong>#${safeReturnTripId}</strong> (Return) are confirmed on our 24/7 dispatch schedule.`
            : `Trip <strong>#${safeTripId}</strong> is confirmed on our 24/7 dispatch schedule. Your driver will meet you at the pickup location below.`
        }
      </p>
      ${renderCtaButton(trackingUrl, 'Track Your Ride Live', '#2563eb')}
    </div>

    ${renderPassengerDetailsCard(
      payload.passenger,
      payload.passengerCount,
      payload.luggageCount,
      payload.contactPerson,
      payload.additionalPassengers,
      payload.carSeatsBreakdown,
      '#2563eb'
    )}

    <!-- Outbound Confirmed Itinerary -->
    <div class="card-box">
      <div class="section-title">
        ${hasReturn ? `1. Outbound Trip (#${safeTripId})` : `Confirmed Trip Details (#${safeTripId})`}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%" valign="top">
            <div class="item-label">Pickup Time</div>
            <div class="item-value">${escapeHtml(payload.pickupTime)}</div>
            <div style="font-size: 11px; color: #2563eb; font-weight: 700; margin-top: 2px;">
              ${isScheduled ? 'Scheduled Pickup' : 'Pickup Now (ASAP)'}
            </div>
          </td>
          <td width="50%" valign="top" align="right">
            <div class="item-label">Vehicle</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.pickupAddress,
          pickupNotes: payload.pickupNotes,
          intermediateStops: payload.intermediateStops,
          dropoffAddress: payload.dropoffAddress,
          dropoffNotes: payload.dropoffNotes,
        })}
      </div>
      ${renderFlightSummaryBox(payload.flightDetails, 'Flight Tracking')}
    </div>

    ${
      hasReturn && payload.returnTripDetails
        ? `
    <!-- Return Confirmed Itinerary -->
    <div class="card-box">
      <div class="section-title" style="color: #0369a1;">
        2. Return Trip (#${safeReturnTripId})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%" valign="top">
            <div class="item-label">Return Pickup</div>
            <div class="item-value">${escapeHtml(payload.returnTripDetails.pickupTime)}</div>
          </td>
          <td width="50%" valign="top" align="right">
            <div class="item-label">Vehicle</div>
            <div class="item-value">
              ${escapeHtml(
                formatVehicleTier(
                  payload.returnTripDetails.vehicleTier,
                  undefined,
                  payload.returnTripDetails.vehicleDisplayName
                )
              )}
            </div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.returnTripDetails.pickupAddress,
          pickupLabel: 'Return Pickup',
          dropoffAddress: payload.returnTripDetails.dropoffAddress,
          dropoffLabel: 'Return Dropoff',
        })}
      </div>
      ${renderFlightSummaryBox(payload.returnTripDetails.flightDetails, 'Return Flight Tracking')}
      <div style="margin-top: 12px;">
        <a href="${escapeHtml(returnTrackingUrl)}" style="font-size: 12px; font-weight: 700; color: #2563eb; text-decoration: none;">
          Track Return Trip &rarr;
        </a>
      </div>
    </div>`
        : ''
    }

    ${
      isLambert
        ? `
    <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #0369a1;">STL Lambert Curbside Pickup Instructions</div>
      <div style="font-size: 13px; color: #0f172a; line-height: 1.5; margin-top: 2px;">${escapeHtml(lambertInstructions)}</div>
    </div>`
        : ''
    }

    ${
      payload.oversizedItemsSummary
        ? `
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #1d4ed8;">Oversized Items</div>
      <div style="font-size: 13px; font-weight: 600; color: #1e3a8a;">${escapeHtml(payload.oversizedItemsSummary)}</div>
    </div>`
        : ''
    }

    ${
      payload.customExtrasSummary
        ? `
    <div class="card-white">
      <div class="item-label" style="color: #047857;">Confirmed Extras &amp; Add-Ons</div>
      <div style="font-size: 13px; font-weight: 600; color: #0f172a;">${escapeHtml(payload.customExtrasSummary)}</div>
    </div>`
        : ''
    }

    ${
      payload.specialRequests
        ? `
    <div class="card-white">
      <div class="item-label">Notes for Driver</div>
      <div style="font-size: 13px; color: #334155; line-height: 1.5;">${escapeHtml(payload.specialRequests)}</div>
    </div>`
        : ''
    }

    <!-- Fare & Payment Summary -->
    <div class="card-white" style="border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td valign="middle">
            <div class="item-label">Payment Method</div>
            <div class="item-value">${escapeHtml(formatPaymentMethod(payload.paymentMethod))}</div>
            ${
              hasReturn
                ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Covers Outbound &amp; Return</div>`
                : ''
            }
          </td>
          <td align="right" valign="middle">
            <div class="item-label">${hasReturn ? 'Combined Round-Trip Fare' : 'Total Quoted Fare'}</div>
            <div class="fare-total" style="color: #1d4ed8;">
              $${totalCombinedFare.toFixed(2)}
              <span style="font-size: 12px; color: #64748b; font-weight: 600;">${escapeHtml(payload.currency)}</span>
            </div>
            ${
              hasReturn
                ? `<div style="font-size: 11px; color: #64748b;">Outbound $${payload.totalFare.toFixed(2)} + Return $${payload.returnTripDetails?.totalFare.toFixed(2)}</div>`
                : ''
            }
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName, payload.totalFare)}
    </div>

    ${showGuestSignupCta ? renderGuestSignupCtaHtml(registerUrl) : ''}

    <!-- Assistance Callout -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px;">
        Need to change your pickup time or trip details?
      </div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5;">
        Call our 24/7 dispatch desk at
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #2563eb; text-decoration: none;">${safeCompanyPhone}</a>
        and reference <strong>#${safeTripId}</strong>${hasReturn ? ` or <strong>#${safeReturnTripId}</strong>` : ''}.
      </div>
    </div>
    `,
    `Your ${companyName} trip #${payload.tripId} is confirmed for ${payload.pickupTime}. Total: $${totalCombinedFare.toFixed(2)}.`,
    payload.companySettings,
    'blue'
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops
          .map((s, idx) => `- Stop ${idx + 1}: ${s.address}${s.notes ? ` (Note: ${s.notes})` : ''}`)
          .join('\n') + '\n'
      : '';

  const text = `
========================================
${companyName} - ${hasReturn ? 'ROUND-TRIP ' : ''}BOOKING CONFIRMED
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Your trip #${payload.tripId}${
    hasReturn ? ` & #${payload.returnTripDetails?.tripId}` : ''
  } has been confirmed on our 24/7 dispatch schedule.

TRACK YOUR RIDE LIVE:
${trackingUrl}${hasReturn ? `\nTrack Return Trip: ${returnTrackingUrl}` : ''}

${renderPassengerDetailsText(
  payload.passenger,
  payload.passengerCount,
  payload.luggageCount,
  payload.contactPerson,
  payload.additionalPassengers,
  payload.carSeatsBreakdown
)}

OUTBOUND TRIP: #${payload.tripId}
- Status: Confirmed
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` (Note: ${payload.pickupNotes})` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` (Note: ${payload.dropoffNotes})` : ''}
${isLambert ? `- Lambert Pickup Instructions: ${lambertInstructions}\n` : ''}${
    hasReturn && payload.returnTripDetails
      ? `
RETURN TRIP: #${payload.returnTripDetails.tripId}
- Status: Confirmed
- Timing: ${payload.returnTripDetails.pickupTime}
- Vehicle: ${formatVehicleTier(
          payload.returnTripDetails.vehicleTier,
          undefined,
          payload.returnTripDetails.vehicleDisplayName
        )}
- Return Pickup: ${payload.returnTripDetails.pickupAddress}
- Return Dropoff: ${payload.returnTripDetails.dropoffAddress}
`
      : ''
  }${payload.oversizedItemsSummary ? `- Oversized Items: ${payload.oversizedItemsSummary}\n` : ''}${
    payload.customExtrasSummary ? `- Confirmed Extras: ${payload.customExtrasSummary}\n` : ''
  }${payload.specialRequests ? `- Notes for Driver: ${payload.specialRequests}\n` : ''}
PAYMENT & TOTAL:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- ${hasReturn ? 'Combined Fare' : 'Quoted Total'}: $${totalCombinedFare.toFixed(2)} ${
    payload.currency
  }${renderPriceBreakdownText(payload.breakdown, payload.totalFare)}
${showGuestSignupCta ? renderGuestSignupCtaText(registerUrl) : ''}
Need assistance or changes? Call 24/7 Dispatch at ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 1. Passenger Confirmation Email (Unified router)
 */
export function renderPassengerConfirmationEmail(
  payload: BookingConfirmationEmailPayload
): RenderedEmail {
  const s = (payload.status || '').trim().toUpperCase();
  const isConfirmed =
    s === 'CONFIRMED' ||
    s === 'ASSIGNED' ||
    s === 'EN_ROUTE' ||
    s === 'ARRIVED' ||
    s === 'IN_PROGRESS' ||
    s === 'COMPLETED' ||
    s === 'ACCEPTED';
  if (isConfirmed) {
    return renderBookingConfirmedEmail(payload);
  }
  return renderBookingRequestReceivedEmail(payload);
}

/**
 * 2. Dispatcher Alert Email
 */
export function renderDispatcherAlertEmail(
  payload: AdminDispatchAlertEmailPayload
): RenderedEmail {
  const isUrgent = payload.urgency === 'high';
  const subject = `[DISPATCH ALERT] ${isUrgent ? 'URGENT ASAP' : 'SCHEDULED'} Ride #${
    payload.tripId
  } - ${payload.passengerName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(
        isUrgent ? 'Urgent · Immediate Pickup (ASAP)' : 'Scheduled Pickup',
        isUrgent ? 'rose' : 'blue'
      )}
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 12px 0 4px 0;">
        New Booking #${escapeHtml(payload.tripId)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        ${escapeHtml(payload.bookingSource || 'Online Booking')} &middot; Dispatch Action Required
      </p>
    </div>

    <!-- Passenger Summary -->
    <div class="card-white">
      <div class="section-title">Passenger Information</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="55%" valign="top">
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.passengerName)}</div>
            <div style="font-size: 13px; margin-top: 3px;">
              <a href="tel:${escapeHtml(payload.passengerPhone)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">
                ${escapeHtml(payload.passengerPhone)}
              </a>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              ${escapeHtml(payload.passengerEmail)}
            </div>
          </td>
          <td width="45%" align="right" valign="top">
            <div class="item-label">Party &amp; Vehicle</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
              ${payload.passengerCount || 1} ${(payload.passengerCount || 1) === 1 ? 'Passenger' : 'Passengers'} &middot; ${payload.luggageCount || 0} ${(payload.luggageCount || 0) === 1 ? 'Bag' : 'Bags'}
            </div>
            <div style="font-size: 12px; color: #2563eb; font-weight: 700; margin-top: 3px;">
              ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${
      payload.oversizedItemsSummary
        ? `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #b91c1c;">Vehicle Assignment Alert · Oversized Items</div>
      <div style="font-size: 13px; font-weight: 700; color: #7f1d1d;">${escapeHtml(payload.oversizedItemsSummary)}</div>
    </div>`
        : ''
    }

    ${
      payload.customExtrasSummary
        ? `
    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #047857;">Selected Extras &amp; Add-Ons</div>
      <div style="font-size: 13px; font-weight: 700; color: #065f46;">${escapeHtml(payload.customExtrasSummary)}</div>
    </div>`
        : ''
    }

    <!-- Route Card -->
    <div class="card-box">
      <div class="section-title">Pickup &amp; Dropoff Route &middot; ${escapeHtml(payload.pickupTime)}</div>
      ${renderRouteTimelineHtml({
        pickupAddress: payload.pickupAddress,
        pickupLabel: `Pickup (${payload.pickupTime})`,
        pickupNotes: payload.pickupNotes,
        intermediateStops: payload.intermediateStops,
        dropoffAddress: payload.dropoffAddress,
        dropoffNotes: payload.dropoffNotes,
      })}
      ${renderFlightSummaryBox(
        payload.flightDetails,
        payload.flightDetails?.isPrivateAviation || payload.flightDetails?.tailNumber
          ? 'Private Aviation / FBO Details'
          : 'Airport Flight Tracking'
      )}
    </div>

    ${
      payload.returnTripDetails
        ? `
    <div class="card-white" style="border-color: #c7d2fe; background-color: #eef2ff;">
      <div class="section-title" style="color: #3730a3; border-bottom-color: #c7d2fe;">
        Linked Return Trip (#${escapeHtml(payload.returnTripDetails.tripId)})
      </div>
      <div style="font-size: 13px; color: #1e1b4b; line-height: 1.55;">
        <strong>Return Pickup:</strong> ${escapeHtml(payload.returnTripDetails.pickupTime)}<br>
        <strong>From:</strong> ${escapeHtml(payload.returnTripDetails.pickupAddress)}<br>
        <strong>To:</strong> ${escapeHtml(payload.returnTripDetails.dropoffAddress)}<br>
        <strong>Return Fare:</strong> $${payload.returnTripDetails.totalFare.toFixed(2)}
      </div>
    </div>`
        : ''
    }

    ${
      payload.specialRequests
        ? `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 14px 16px; margin: 14px 0;">
      <div class="item-label" style="color: #b91c1c;">Special Passenger / Driver Notes</div>
      <div style="font-size: 13px; color: #7f1d1d; font-weight: 600; line-height: 1.5;">
        &ldquo;${escapeHtml(payload.specialRequests)}&rdquo;
      </div>
    </div>`
        : ''
    }

    <!-- Financial Breakdown -->
    <div class="card-white" style="border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div class="item-label">Payment Method</div>
            <div class="item-value">
              ${escapeHtml(payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard')}
            </div>
          </td>
          <td align="right">
            <div class="item-label">Quoted Fare</div>
            <div class="fare-total" style="color: #047857;">
              $${payload.totalFare.toFixed(2)}
              <span style="font-size: 12px; color: #64748b; font-weight: 600;">${escapeHtml(payload.currency)}</span>
            </div>
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName, payload.totalFare)}
    </div>
    `,
    `[ALERT] New Ride #${payload.tripId} (${payload.bookingType.toUpperCase()}) for ${payload.passengerName}. Pickup: ${payload.pickupAddress}`,
    payload.companySettings,
    isUrgent ? 'rose' : 'blue'
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops
          .map((s, idx) => `- Stop ${idx + 1}: ${s.address}${s.notes ? ` [Note: ${s.notes}]` : ''}`)
          .join('\n') + '\n'
      : '';

  const text = `
========================================
NEW RIDE DISPATCH ALERT
========================================
Trip #: #${payload.tripId}
Urgency: ${isUrgent ? 'URGENT (ASAP)' : 'SCHEDULED'}
Passenger: ${payload.passengerName}
Phone: ${payload.passengerPhone}
Email: ${payload.passengerEmail}
Passengers / Bags: ${payload.passengerCount || 1} Passengers / ${payload.luggageCount || 0} Bags

TIMING & VEHICLE:
- Pickup Time: ${payload.pickupTime}
- Vehicle: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}

ROUTING:
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` [Note: ${payload.pickupNotes}]` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` [Note: ${payload.dropoffNotes}]` : ''}
${
  payload.returnTripDetails
    ? `- Linked Return Trip (#${payload.returnTripDetails.tripId}): ${payload.returnTripDetails.pickupAddress} -> ${payload.returnTripDetails.dropoffAddress} at ${payload.returnTripDetails.pickupTime} ($${payload.returnTripDetails.totalFare.toFixed(2)})\n`
    : ''
}${payload.oversizedItemsSummary ? `- Oversized Items: ${payload.oversizedItemsSummary}\n` : ''}${
    payload.customExtrasSummary ? `- Selected Extras: ${payload.customExtrasSummary}\n` : ''
  }${payload.specialRequests ? `- Driver Notes: ${payload.specialRequests}\n` : ''}
FARE:
- Quoted Fare: $${payload.totalFare.toFixed(2)} ${payload.currency}
- Payment: ${payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard'}${renderPriceBreakdownText(
    payload.breakdown,
    payload.totalFare
  )}
========================================
  `.trim();

  return { subject, html, text };
}

/**
 * 3. Ride Status Update Notification
 */
export function renderStatusUpdateEmail(
  payload: StatusUpdateEmailPayload
): RenderedEmail {
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const statusKey = String(payload.newStatus || '').trim();
  const statusLower = statusKey.toLowerCase();

  const statusTitles: Record<string, string> = {
    unconfirmed: 'Booking Request Received & Pending Review',
    pending: 'Booking Received & Pending Dispatch',
    confirmed: 'Booking Confirmed',
    offered: 'Assigning Your Driver',
    assigned: 'Driver Assigned to Your Ride',
    accepted: 'Driver Confirmed & Preparing',
    en_route: 'Your Driver is On the Way',
    arrived: 'Your Driver Has Arrived',
    in_progress: 'Your Trip is In Progress',
    completed: 'Ride Completed — Thank You',
    cancelled: 'Ride Booking Cancelled',
    declined: 'Ride Request Declined',
  };

  const statusHeadline =
    statusTitles[statusLower] || `Trip Status Update: ${statusKey.toUpperCase()}`;
  const subject = `Ride Update #${payload.tripId}: ${statusHeadline} | ${companyName}`;

  const isAssigned =
    statusLower === 'assigned' ||
    statusLower === 'accepted' ||
    statusLower === 'en_route' ||
    statusLower === 'arrived';
  const isCancelled = statusLower === 'cancelled' || statusLower === 'declined';
  const isCompleted = statusLower === 'completed';
  const showTrackCta = !isCancelled && !isCompleted;
  const trackingUrl = resolveTrackingUrl(payload.tripId, payload.trackingToken, payload.trackingUrl);
  const safeTripId = escapeHtml(payload.tripId);
  const safeVehicle = escapeHtml(
    formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)
  );
  const theme: EmailAccentTheme = isCancelled ? 'rose' : isCompleted ? 'emerald' : 'blue';
  const showStatusGuestSignupCta = shouldRenderGuestSignupCta(payload);
  const statusRegisterUrl = buildGuestAccountSignupHref({
    baseUrl: getAppBaseUrl(),
    tripIds: [payload.tripId],
    email: payload.passenger.email,
    name: `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim(),
    phone: payload.passenger.phone,
  });

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(statusKey.replace(/_/g, ' '), theme)}
      <h2 style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 4px 0;">
        ${escapeHtml(statusHeadline)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Trip <strong>#${safeTripId}</strong>
      </p>
      ${showTrackCta ? renderCtaButton(trackingUrl, 'Track Live on Map', '#2563eb') : ''}
    </div>

    <div class="card-white">
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">
        ${
          statusLower === 'en_route'
            ? 'Your driver is on the way to your pickup location. Use the live tracking link above for real-time arrival updates.'
            : statusLower === 'arrived'
            ? 'Your driver has arrived outside your pickup location and is ready for you.'
            : statusLower === 'in_progress'
            ? 'Your trip is underway. Thank you for riding with us.'
            : statusLower === 'confirmed'
            ? 'Your trip has been confirmed on our 24/7 dispatch schedule.'
            : isAssigned
            ? 'A driver has been assigned and scheduled for your pickup.'
            : isCompleted
            ? `Thank you for riding with ${escapeHtml(companyName)}. Your trip has been completed.`
            : isCancelled
            ? 'Your trip has been cancelled. If you believe this was a mistake, please call our dispatch desk right away.'
            : 'Your trip is being coordinated by our 24/7 dispatch desk.'
        }
        ${
          payload.statusReason
            ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #64748b;">Note: &ldquo;${escapeHtml(payload.statusReason)}&rdquo;</div>`
            : ''
        }
      </div>
    </div>

    ${
      isAssigned && payload.driverInfo
        ? `
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px 18px; margin: 16px 0;">
      <div class="item-label" style="color: #1d4ed8; margin-bottom: 8px;">Assigned Driver</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(payload.driverInfo.name || 'Assigned Driver')}
            </div>
            ${
              payload.driverInfo.phone
                ? `<div style="font-size: 13px; margin-top: 3px;">
                    <a href="tel:${escapeHtml(payload.driverInfo.phone.replace(/\D/g, '') || payload.driverInfo.phone)}" style="color: #1d4ed8; font-weight: 600; text-decoration: none;">${escapeHtml(payload.driverInfo.phone)}</a>
                  </div>`
                : ''
            }
          </td>
          ${
            payload.driverInfo.vehicleModel
              ? `<td align="right">
                  <div class="item-label">Car / Plate</div>
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.driverInfo.vehicleModel)}</div>
                  ${
                    payload.driverInfo.licensePlate
                      ? `<div style="font-size: 12px; color: #475569; font-weight: 600;">Plate: ${escapeHtml(payload.driverInfo.licensePlate)}</div>`
                      : ''
                  }
                </td>`
              : ''
          }
        </tr>
      </table>
    </div>`
        : ''
    }

    <div class="card-box">
      <div class="section-title">Trip Details</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%">
            <div class="item-label">Pickup Time</div>
            <div class="item-value">${escapeHtml(payload.pickupTime)}</div>
          </td>
          <td width="50%" align="right">
            <div class="item-label">Vehicle</div>
            <div class="item-value">${safeVehicle}</div>
          </td>
        </tr>
      </table>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.pickupAddress,
          dropoffAddress: payload.dropoffAddress,
        })}
      </div>
    </div>

    ${showStatusGuestSignupCta ? renderGuestSignupCtaHtml(statusRegisterUrl) : ''}

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;">
      <div style="font-size: 13px; color: #475569; line-height: 1.5;">
        Questions about this update? Call 24/7 Dispatch at
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #2563eb; text-decoration: none;">${escapeHtml(companyPhone)}</a>.
      </div>
    </div>
    `,
    `Ride update for #${payload.tripId}: Status changed to ${statusKey.toUpperCase()}.`,
    payload.companySettings,
    theme
  );

  const text = `
========================================
${companyName} - RIDE STATUS UPDATE
========================================
Trip #: #${payload.tripId}
New Status: ${statusKey.toUpperCase()}

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

${statusHeadline}
${payload.statusReason ? `Reason: ${payload.statusReason}\n` : ''}${
    isAssigned && payload.driverInfo
      ? `Driver: ${payload.driverInfo.name || 'Assigned'}${
          payload.driverInfo.phone ? ` | Phone: ${payload.driverInfo.phone}` : ''
        }\n`
      : ''
  }${showTrackCta ? `Track Live: ${trackingUrl}\n` : ''}
Route:
- Vehicle: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}
${showStatusGuestSignupCta ? renderGuestSignupCtaText(statusRegisterUrl) : ''}
Need help? Call 24/7 Dispatch at ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 4. Booking Declined Notification Email
 */
export function renderBookingDeclinedEmail(
  payload: BookingDeclinedEmailPayload
): RenderedEmail {
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const isReturnOnly = payload.legScope === 'return';
  const isOutboundOnly = payload.legScope === 'outbound';
  const isRoundTrip = payload.legScope === 'roundtrip';

  const scopePrefix = isReturnOnly
    ? 'Return Trip'
    : isOutboundOnly
    ? 'Outbound Trip'
    : isRoundTrip
    ? 'Round-Trip'
    : 'Ride';

  const subject = `Booking Update: ${scopePrefix} Request #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(`${scopePrefix} Unavailable`, 'rose')}
      <h2 style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 4px 0;">
        ${escapeHtml(scopePrefix)} Request Update
      </h2>
      <p style="font-size: 13px; color: #64748b; margin: 0;">
        Trip <strong>#${escapeHtml(payload.tripId)}</strong>${
          payload.linkedTripId ? ` (Linked: #${escapeHtml(payload.linkedTripId)})` : ''
        }
      </p>
    </div>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 12px 0;">
      Dear ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)},
    </p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 18px 0;">
      Thank you for your booking request with ${escapeHtml(companyName)}. After checking current driver availability and schedules, our dispatch team is unable to accommodate this ${escapeHtml(scopePrefix.toLowerCase())} request at this time.${
        isReturnOnly
          ? ' <strong>Please note:</strong> Your outbound trip remains scheduled and active unless you ask to change it.'
          : ''
      }
    </p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 18px; margin-bottom: 18px;">
      <div class="item-label" style="color: #b91c1c;">Reason Provided by Dispatch</div>
      <div style="font-size: 14px; font-weight: 700; color: #7f1d1d;">
        ${escapeHtml(payload.reason)}
      </div>
      ${
        payload.customNotes
          ? `<div style="font-size: 13px; color: #991b1b; border-top: 1px solid #fecaca; margin-top: 8px; padding-top: 8px;">
              &ldquo;${escapeHtml(payload.customNotes)}&rdquo;
            </div>`
          : ''
      }
    </div>

    <div class="card-box">
      <div class="section-title">Original ${escapeHtml(scopePrefix)} Request</div>
      ${renderRouteTimelineHtml({
        pickupAddress: payload.pickupAddress,
        dropoffAddress: payload.dropoffAddress,
      })}
      <div style="border-top: 1px solid #e2e8f0; margin-top: 12px; padding-top: 10px; font-size: 13px; color: #475569;">
        <span>Requested Pickup:</span>
        <strong style="color: #0f172a; margin-left: 6px;">${escapeHtml(payload.pickupTime)}</strong>
        ${
          payload.vehicleTier || payload.vehicleDisplayName
            ? `<div style="margin-top: 4px;"><span>Vehicle:</span> <strong style="color: #0f172a; margin-left: 6px;">${escapeHtml(
                formatVehicleTier(payload.vehicleTier || '', undefined, payload.vehicleDisplayName)
              )}</strong></div>`
            : ''
        }
      </div>
    </div>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 3px;">
        Want to check alternate pickup times?
      </div>
      <div style="font-size: 13px; color: #475569; line-height: 1.5;">
        Our dispatchers are available 24/7 at
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #2563eb; text-decoration: none;">${escapeHtml(companyPhone)}</a>.
      </div>
    </div>
    `,
    `Notice regarding your ${scopePrefix.toLowerCase()} request #${payload.tripId}`,
    payload.companySettings,
    'rose'
  );

  const text = `
========================================
${companyName} - ${scopePrefix.toUpperCase()} REQUEST UPDATE
========================================
Trip #: #${payload.tripId}
Status: DECLINED

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Thank you for your booking request with ${companyName}. After checking driver availability, our dispatch team is unable to accommodate this ${scopePrefix.toLowerCase()} request at this time.${
    isReturnOnly ? '\n(Note: Your outbound trip remains scheduled.)' : ''
  }

Reason: ${payload.reason}
${payload.customNotes ? `Additional notes: ${payload.customNotes}\n` : ''}

Requested Route:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}

To check alternate pickup times with a live dispatcher, call us 24/7 at ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 5. Dispatch Request for Clarification / Information Email
 */
export function renderClarificationRequestEmail(
  payload: BookingClarificationRequestEmailPayload
): RenderedEmail {
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const legLabel =
    payload.legScope === 'return'
      ? 'Return Trip'
      : payload.legScope === 'outbound'
      ? 'Outbound Trip'
      : payload.legScope === 'roundtrip'
      ? 'Round-Trip'
      : 'Ride';

  const subject = `Action Required: Information Needed for ${legLabel} Request #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill('Action Required · Information Needed', 'amber')}
      <h2 style="font-size: 21px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 4px 0;">
        Quick Question About Your Trip
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Trip <strong>#${escapeHtml(payload.tripId)}</strong> &middot; ${escapeHtml(legLabel)}
      </p>
    </div>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 12px 0;">
      Dear ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)},
    </p>
    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 18px 0;">
      Our dispatch desk is reviewing your ${escapeHtml(legLabel.toLowerCase())} request. Before we assign your driver, please confirm the detail below:
    </p>

    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 16px 18px; margin-bottom: 16px;">
      <div class="item-label" style="color: #b45309;">Question from Dispatch</div>
      <div style="font-size: 14px; font-weight: 700; color: #78350f;">
        ${escapeHtml(payload.clarificationTopic)}
      </div>
      ${
        payload.customMessage
          ? `<div style="font-size: 13px; color: #92400e; line-height: 1.5; border-top: 1px solid #fde68a; margin-top: 8px; padding-top: 8px;">
              &ldquo;${escapeHtml(payload.customMessage)}&rdquo;
            </div>`
          : ''
      }
    </div>

    <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;">
      <div class="item-label" style="color: #047857;">How to Respond</div>
      <div style="font-size: 13px; color: #065f46; line-height: 1.5;">
        Reply directly to this email with your updated details, or call 24/7 Dispatch at
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #047857; text-decoration: underline;">${escapeHtml(companyPhone)}</a>.
      </div>
    </div>

    <div class="card-box">
      <div class="section-title">Trip Details &middot; ${escapeHtml(payload.pickupTime)}</div>
      ${renderRouteTimelineHtml({
        pickupAddress: payload.pickupAddress,
        dropoffAddress: payload.dropoffAddress,
      })}
    </div>
    `,
    `Information needed for your ${legLabel.toLowerCase()} request #${payload.tripId}`,
    payload.companySettings,
    'amber'
  );

  const text = `
========================================
${companyName} - ACTION REQUIRED: INFORMATION NEEDED
========================================
Trip #: #${payload.tripId}
Scope: ${legLabel}
Status: PENDING CLARIFICATION

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Our dispatch desk is reviewing your ${legLabel.toLowerCase()} booking request #${payload.tripId}. Before we assign your driver, we need a quick detail confirmed:

QUESTION: ${payload.clarificationTopic}
${payload.customMessage ? `Details: ${payload.customMessage}\n` : ''}
HOW TO RESPOND:
- Reply directly to this email with your updated information, OR
- Call our 24/7 Dispatch Desk at ${companyPhone} (reference Trip #${payload.tripId}).

TRIP DETAILS:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 6. Official Post-Trip Final Tax Receipt Email
 */
export function renderTripReceiptEmail(
  payload: TripReceiptEmailPayload
): RenderedEmail {
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const currency = payload.currency || 'USD';
  const tipAmount = Number(payload.tipAmount || 0);
  const grandTotal = Number(payload.grandTotal || payload.subtotalFare + tipAmount);
  const vehicleLabel = formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName);
  const paymentDisplay = `${formatPaymentMethod(payload.paymentMethod)}${
    payload.cardLast4 ? ` ···· ${payload.cardLast4}` : ''
  }`;
  const statusLabel = payload.paymentStatus
    ? payload.paymentStatus.replace(/_/g, ' ').toUpperCase()
    : 'PAID';

  const showReceiptGuestSignupCta = shouldRenderGuestSignupCta(payload);
  const receiptRegisterUrl = buildGuestAccountSignupHref({
    baseUrl: getAppBaseUrl(),
    tripIds: [payload.tripId],
    email: payload.passenger.email,
    name: `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim(),
    phone: payload.passenger.phone,
  });

  const subject = `Trip Receipt (#${payload.tripId}) — $${grandTotal.toFixed(2)} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(`Official Receipt · ${statusLabel}`, 'emerald')}
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 4px 0;">
        Thank you for riding, ${escapeHtml(payload.passenger.firstName)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Receipt <strong>#${escapeHtml(payload.tripId)}</strong> &middot; Completed ${escapeHtml(payload.completedAt)}
      </p>
    </div>

    <div class="card-box">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom: 12px;">
        <tr>
          <td width="50%" valign="top">
            <div class="item-label">Passenger</div>
            <div class="item-value">
              ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)}
            </div>
            ${
              payload.corporateAccountName
                ? `<div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 2px;">${escapeHtml(
                    payload.corporateAccountName
                  )}${payload.poNumber ? ` (PO: ${escapeHtml(payload.poNumber)})` : ''}</div>`
                : ''
            }
          </td>
          <td width="50%" align="right" valign="top">
            <div class="item-label">Driver &amp; Car</div>
            <div class="item-value">${escapeHtml(payload.driverName || 'Assigned Driver')}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              ${payload.vehicleUnit ? `${escapeHtml(payload.vehicleUnit)} &middot; ` : ''}${escapeHtml(vehicleLabel)}
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${renderRouteTimelineHtml({
          pickupAddress: payload.pickupAddress,
          pickupLabel: `Pickup (${payload.pickupTime})`,
          intermediateStops: payload.intermediateStops,
          dropoffAddress: payload.dropoffAddress,
        })}
        ${
          payload.distanceMiles
            ? `<div style="font-size: 11px; color: #64748b; margin-top: 10px;">
                Distance: ${payload.distanceMiles.toFixed(1)} mi${
                payload.durationMinutes ? ` &middot; Duration: ${Math.round(payload.durationMinutes)} min` : ''
              }
              </div>`
            : ''
        }
      </div>
    </div>

    <div class="card-white" style="border-color: #cbd5e1;">
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName, payload.subtotalFare)}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #475569;">Ride Subtotal</td>
          <td align="right" style="padding: 4px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0f172a;">
            $${payload.subtotalFare.toFixed(2)}
          </td>
        </tr>
        ${
          tipAmount > 0
            ? `<tr>
                <td style="padding: 4px 0; font-size: 13px; color: #475569;">Driver Tip</td>
                <td align="right" style="padding: 4px 0; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0f172a;">
                  $${tipAmount.toFixed(2)}
                </td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding: 10px 0 4px 0; font-size: 15px; font-weight: 800; color: #0f172a; border-top: 2px solid #e2e8f0;">
            Total Charged (${escapeHtml(currency)})
          </td>
          <td align="right" style="padding: 10px 0 4px 0; font-size: 20px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #047857; border-top: 2px solid #e2e8f0;">
            $${grandTotal.toFixed(2)}
          </td>
        </tr>
      </table>
      <div style="margin-top: 10px; font-size: 12px; color: #475569; border-top: 1px solid #f1f5f9; padding-top: 8px;">
        <strong>Payment Method:</strong> ${escapeHtml(paymentDisplay)} &nbsp;&middot;&nbsp; <strong>Status:</strong> ${escapeHtml(statusLabel)}
      </div>
    </div>

    ${showReceiptGuestSignupCta ? renderGuestSignupCtaHtml(receiptRegisterUrl) : ''}
    `,
    `Official receipt for your ${companyName} ride #${payload.tripId}: $${grandTotal.toFixed(2)}.`,
    payload.companySettings,
    'emerald'
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops.map((s, i) => `- Stop ${i + 1}: ${s.address}`).join('\n') + '\n'
      : '';

  const text = `
========================================
${companyName} - OFFICIAL TRIP RECEIPT
========================================
Receipt #: #${payload.tripId}
Completed: ${payload.completedAt}
Passenger: ${payload.passenger.firstName} ${payload.passenger.lastName}
Driver: ${payload.driverName || 'Assigned Driver'}${
    payload.vehicleUnit ? ` (${payload.vehicleUnit})` : ''
  }
Vehicle: ${vehicleLabel}

ROUTE:
- Pickup (${payload.pickupTime}): ${payload.pickupAddress}
${stopsText}- Dropoff: ${payload.dropoffAddress}
${renderPriceBreakdownText(payload.breakdown, payload.subtotalFare)}

TOTALS:
- Ride Subtotal: $${payload.subtotalFare.toFixed(2)}
${tipAmount > 0 ? `- Driver Tip: $${tipAmount.toFixed(2)}\n` : ''}- Grand Total: $${grandTotal.toFixed(2)} ${currency}
- Payment Method: ${paymentDisplay} (${statusLabel})
${showReceiptGuestSignupCta ? renderGuestSignupCtaText(receiptRegisterUrl) : ''}
Questions regarding this receipt? Call 24/7 Dispatch at ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 7. Corporate B2B Invoice Statement Email
 */
export function renderCorporateInvoiceEmail(
  payload: CorporateInvoiceEmailPayload
): RenderedEmail {
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyAddress = payload.companySettings?.address || COMPANY_CONFIG.address.formatted;
  const companyEmail = payload.companySettings?.email || COMPANY_CONFIG.email.dispatch;
  const discountAmt = Number(payload.discountAmount || 0);

  const subject = `Invoice ${payload.invoiceNumber} — $${payload.totalAmount.toFixed(2)} Due ${payload.dueDate} | ${companyName}`;

  const rowsHtml = payload.lineItems
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 9px 6px; font-size: 12px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap;">
          ${escapeHtml(item.date || payload.issuedDate)}
        </td>
        <td style="padding: 9px 6px; font-size: 12px; color: #0f172a;">
          <div style="font-weight: 600;">${escapeHtml(item.description)}</div>
          ${
            item.passengerName || item.poNumber
              ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${
                  item.passengerName ? `Passenger: ${escapeHtml(item.passengerName)}` : ''
                }${item.passengerName && item.poNumber ? ' &middot; ' : ''}${
                  item.poNumber ? `PO: ${escapeHtml(item.poNumber)}` : ''
                }</div>`
              : ''
          }
        </td>
        <td align="right" style="padding: 9px 6px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0f172a; white-space: nowrap;">
          $${item.amount.toFixed(2)}
        </td>
      </tr>`
    )
    .join('');

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 22px;">
      ${renderStatusPill(`Corporate Invoice · ${payload.invoiceNumber}`, 'blue')}
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.025em; margin: 14px 0 4px 0;">
        Statement for ${escapeHtml(payload.customerName)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Issued <strong>${escapeHtml(payload.issuedDate)}</strong> &middot; Due <strong>${escapeHtml(payload.dueDate)}</strong>${
          payload.billingCycle ? ` (${escapeHtml(payload.billingCycle.toUpperCase())})` : ''
        }
      </p>
    </div>

    <div class="card-white" style="border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <thead>
          <tr style="border-bottom: 2px solid #e2e8f0;">
            <th align="left" style="padding: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;">Date</th>
            <th align="left" style="padding: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;">Service / Trip Details</th>
            <th align="right" style="padding: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
        <tr>
          <td style="padding: 4px 6px; font-size: 13px; color: #475569;">Subtotal</td>
          <td align="right" style="padding: 4px 6px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #0f172a;">
            $${payload.subtotal.toFixed(2)}
          </td>
        </tr>
        ${
          discountAmt > 0
            ? `<tr>
                <td style="padding: 4px 6px; font-size: 13px; color: #047857;">Contract Discount</td>
                <td align="right" style="padding: 4px 6px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; color: #047857;">
                  -$${discountAmt.toFixed(2)}
                </td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding: 10px 6px 4px 6px; font-size: 15px; font-weight: 800; color: #0f172a; border-top: 2px solid #e2e8f0;">
            Total Balance Due
          </td>
          <td align="right" style="padding: 10px 6px 4px 6px; font-size: 20px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #1d4ed8; border-top: 2px solid #e2e8f0;">
            $${payload.totalAmount.toFixed(2)}
          </td>
        </tr>
      </table>
    </div>

    ${
      payload.notes
        ? `<div class="card-box"><div class="item-label">Statement Notes</div><div style="font-size: 13px; color: #334155; line-height: 1.5;">${escapeHtml(payload.notes)}</div></div>`
        : ''
    }

    ${
      payload.payLinkUrl
        ? `<div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 18px 20px; text-align: center; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #1d4ed8; margin-bottom: 6px;">
              Instant 1-Tap Online Settlement
            </div>
            <div style="font-size: 13px; color: #334155; margin-bottom: 12px;">
              Pay Invoice <strong>${escapeHtml(payload.invoiceNumber)}</strong> securely online via Card, Apple Pay, or Google Pay.
            </div>
            <a href="${escapeHtml(payload.payLinkUrl)}" style="display: inline-block; background-color: #1d4ed8; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; padding: 11px 24px; border-radius: 10px;">
              Pay $${payload.totalAmount.toFixed(2)} Online &rarr;
            </a>
            <div style="font-size: 11px; color: #64748b; margin-top: 8px; word-break: break-all;">
              ${escapeHtml(payload.payLinkUrl)}
            </div>
          </div>`
        : ''
    }

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
        Remittance &amp; Billing Inquiries
      </div>
      <div style="font-size: 12px; color: #475569; line-height: 1.6;">
        Please reference Invoice <strong>${escapeHtml(payload.invoiceNumber)}</strong> on all remittances.<br>
        Payable to: <strong>${escapeHtml(companyName)}</strong>, ${escapeHtml(companyAddress)}<br>
        Billing Desk:
        <a href="mailto:${escapeHtml(companyEmail)}" style="color: #2563eb; font-weight: 700; text-decoration: none;">${escapeHtml(companyEmail)}</a>
        &middot; ${escapeHtml(companyPhone)}
      </div>
    </div>
    `,
    `Corporate Invoice ${payload.invoiceNumber} from ${companyName} ($${payload.totalAmount.toFixed(2)} due ${payload.dueDate}).`,
    payload.companySettings,
    'blue'
  );

  const linesText = payload.lineItems
    .map(
      (i) =>
        `- ${i.date || payload.issuedDate} | ${i.description}${
          i.poNumber ? ` [PO: ${i.poNumber}]` : ''
        }: $${i.amount.toFixed(2)}`
    )
    .join('\n');

  const text = `
========================================
${companyName} - CORPORATE INVOICE STATEMENT
========================================
Invoice Number: ${payload.invoiceNumber}
Billed To: ${payload.customerName}${payload.accountNumber ? ` (Acct: ${payload.accountNumber})` : ''}
Issued Date: ${payload.issuedDate}
Due Date: ${payload.dueDate}

ITEMIZED CHARGES:
${linesText}

Subtotal: $${payload.subtotal.toFixed(2)}
${discountAmt > 0 ? `Contract Discount: -$${discountAmt.toFixed(2)}\n` : ''}Total Balance Due: $${payload.totalAmount.toFixed(2)}

${payload.notes ? `Notes: ${payload.notes}\n` : ''}${payload.payLinkUrl ? `Pay Online (1-Tap): ${payload.payLinkUrl}\n\n` : ''}REMITTANCE:
Please reference ${payload.invoiceNumber} payable to ${companyName}, ${companyAddress}.
Questions? Email ${companyEmail} or call ${companyPhone}.
========================================
(c) ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}
