/**
 * Transactional HTML Email Templates
 * 
 * Provides responsive, mobile-optimized HTML and plain-text email templates
 * with inline CSS for universal email client compatibility.
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type { PriceLineItem } from '../../types';
import type { VehicleTierConfig } from '../../types/config';
import type {
  BookingConfirmationEmailPayload,
  AdminDispatchAlertEmailPayload,
  StatusUpdateEmailPayload,
  BookingDeclinedEmailPayload,
  BookingClarificationRequestEmailPayload,
  TripReceiptEmailPayload,
  CorporateInvoiceEmailPayload,
} from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

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
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:\/\//i.test(window.location.origin)) {
    return window.location.origin.replace(/\/+$/, '');
  }
  return 'https://chesterfieldtaxi.com';
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

/**
 * Resolves a human-friendly vehicle class label prioritizing:
 * 1. Explicit persisted `vehicleDisplayName`
 * 2. Live Admin `VehicleTierConfig.name` lookup by `id`
 * 3. Clean fallback formatter
 */
export function formatVehicleTier(
  tier: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  if (explicitDisplayName && explicitDisplayName.trim()) return explicitDisplayName.trim();
  if (!tier) return 'Standard Sedan';
  if (vehicles && vehicles.length > 0) {
    const matched = vehicles.find((v) => v.id.toLowerCase() === tier.trim().toLowerCase());
    if (matched?.name) return matched.name;
  }
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any' || clean.startsWith('any')) return 'Any Vehicle (Best Available)';
  if (clean === 'standard' || clean === 'sedan') return 'Standard Sedan';
  if (clean === 'premium') return 'Premium Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav') return 'Wheelchair Accessible Van (WAV)';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Concise UI badge formatting for vehicle tiers in tables, queues, and cards
 */
export function formatVehicleTierDisplay(
  tier?: string,
  vehicles?: VehicleTierConfig[],
  explicitDisplayName?: string
): string {
  if (explicitDisplayName && explicitDisplayName.trim()) return explicitDisplayName.trim();
  if (!tier) return 'Standard';
  if (vehicles && vehicles.length > 0) {
    const matched = vehicles.find((v) => v.id.toLowerCase() === tier.trim().toLowerCase());
    if (matched?.name) return matched.name;
  }
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any') return 'Any';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'midsize suv') return 'Midsize SUV';
  if (clean === 'standard') return 'Standard Sedan';
  if (clean === 'sedan') return 'Sedan';
  if (clean === 'xl') return 'Full-Size SUV (XL)';
  if (clean === 'suv' || clean === 'large suv' || clean === 'full size suv') return 'Full-Size SUV';
  if (clean === 'minivan') return 'Minivan';
  if (clean === 'van') return 'Passenger Van';
  if (clean === 'wheelchair' || clean === 'wav') return 'WAV';
  if (clean === 'premium') return 'Premium';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders the canonical Admin Tariff price breakdown (Base Fare + Extras + Surcharges + Discounts)
 * as clean inline-CSS HTML rows for email clients.
 */
function renderPriceBreakdownHtml(breakdown?: PriceLineItem[], tariffProfileName?: string): string {
  if (!breakdown || breakdown.length === 0) return '';
  const baseLine = breakdown.find((i) => i.category === 'base');
  const extras = breakdown.filter((i) => i.category === 'extra' && i.amount !== 0);
  const surcharges = breakdown.filter((i) => i.category === 'surcharge' && i.amount !== 0);
  const discounts = breakdown.filter((i) => i.category === 'discount' && i.amount !== 0);
  const rounding = breakdown.filter((i) => i.category === 'rounding' && i.amount !== 0);
  const ordered = [
    ...(baseLine ? [{ ...baseLine, label: 'Base Fare' }] : []),
    ...extras,
    ...surcharges,
    ...discounts,
    ...rounding,
  ];
  if (ordered.length === 0) return '';

  const rowsHtml = ordered
    .map((item) => {
      const isDiscount = item.category === 'discount' || item.amount < 0;
      const color = isDiscount ? '#047857' : '#334155';
      const formattedAmt = isDiscount
        ? `-$${Math.abs(item.amount).toFixed(2)}`
        : `$${item.amount.toFixed(2)}`;
      return `
        <tr>
          <td style="padding: 3px 0; font-size: 12px; color: ${color}; ${item.category === 'base' ? 'font-weight: 700; color: #0f172a;' : ''}">
            ${escapeHtml(item.label)}
          </td>
          <td align="right" style="padding: 3px 0; font-size: 12px; font-family: monospace; font-weight: 700; color: ${isDiscount ? '#047857' : '#0f172a'};">
            ${formattedAmt}
          </td>
        </tr>`;
    })
    .join('');

  return `
    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td colspan="2" style="padding-bottom: 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
            Fare Breakdown${tariffProfileName ? ` • ${escapeHtml(tariffProfileName)}` : ''}
          </td>
        </tr>
        ${rowsHtml}
      </table>
    </div>
  `;
}

function renderPriceBreakdownText(breakdown?: PriceLineItem[]): string {
  if (!breakdown || breakdown.length === 0) return '';
  const baseLine = breakdown.find((i) => i.category === 'base');
  const ordered = [
    ...(baseLine ? [{ ...baseLine, label: 'Base Fare' }] : []),
    ...breakdown.filter((i) => i.category === 'extra' && i.amount !== 0),
    ...breakdown.filter((i) => i.category === 'surcharge' && i.amount !== 0),
    ...breakdown.filter((i) => i.category === 'discount' && i.amount !== 0),
    ...breakdown.filter((i) => i.category === 'rounding' && i.amount !== 0),
  ];
  if (ordered.length === 0) return '';
  return (
    '\nFARE BREAKDOWN:\n' +
    ordered
      .map((item) => {
        const amt =
          item.amount < 0
            ? `-$${Math.abs(item.amount).toFixed(2)}`
            : `$${item.amount.toFixed(2)}`;
        return `- ${item.label}: ${amt}`;
      })
      .join('\n')
  );
}

/**
 * Common HTML email shell wrapping branded header, container, and footer.
 */
function renderEmailShell(
  contentHtml: string,
  previewText: string = '',
  companyOverride?: { name?: string; phone?: string; address?: string },
  theme: 'blue' | 'amber' = 'blue'
): string {
  const companyName = companyOverride?.name || COMPANY_CONFIG.name;
  const companyPhone = companyOverride?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyAddress = companyOverride?.address || COMPANY_CONFIG.address.formatted;
  const safeCompanyName = escapeHtml(companyName);
  const safeCompanyPhone = escapeHtml(companyPhone);
  const safeCompanyAddress = escapeHtml(companyAddress);
  const rawPhone = companyPhone.replace(/\D/g, '');

  const bannerGradient =
    theme === 'amber'
      ? 'linear-gradient(135deg, #78350f 0%, #b45309 50%, #d97706 100%)'
      : 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)';
  const taglineColor = theme === 'amber' ? '#fef3c7' : '#dbeafe';
  const containerShadow =
    theme === 'amber'
      ? '0 10px 25px -5px rgba(217, 119, 6, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.05)'
      : '0 10px 25px -5px rgba(37, 99, 235, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)';

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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; text-decoration: none; }
    .email-wrapper { width: 100%; background-color: #f1f5f9; padding: 28px 0; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: ${containerShadow}; border: 1px solid #e2e8f0; }
    .header-banner { background: ${bannerGradient}; padding: 32px 24px; text-align: center; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; margin: 0; }
    .header-tagline { color: ${taglineColor}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 6px 0 0 0; }
    .content-body { padding: 28px 24px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; }
    .badge-amber { background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
    .badge-blue { background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .card-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin: 16px 0; }
    .item-label { font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 3px; }
    .item-value { font-size: 15px; color: #0f172a; font-weight: 600; }
    .route-point { margin-bottom: 12px; }
    .route-point:last-child { margin-bottom: 0; }
    .fare-total { font-size: 22px; font-weight: 800; color: #1e40af; }
    .dispatch-box { background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .footer-section { background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6; }
    .footer-link { color: #2563eb; text-decoration: underline; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .content-body { padding: 20px 16px !important; }
    }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${escapeHtml(previewText)}</div>` : ''}
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center">
        <div class="email-container">
          <!-- Header Banner -->
          <div class="header-banner">
            <h1 class="header-title">${safeCompanyName}</h1>
            <p class="header-tagline">${escapeHtml(COMPANY_CONFIG.tagline)}</p>
          </div>
          <!-- Body Content -->
          <div class="content-body">
            ${contentHtml}
          </div>
          <!-- Footer -->
          <div class="footer-section">
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
              24/7 Dispatch Desk: <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="color: #2563eb; text-decoration: none; font-weight: 700;">${safeCompanyPhone}</a>
            </p>
            <p style="margin: 0 0 8px 0;">
              ${escapeHtml(COMPANY_CONFIG.operatingHours)} • ${safeCompanyAddress}
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
 * Formats payment method for display.
 */
function formatPaymentMethod(method?: string): string {
  if (!method) return 'Pay in Vehicle';
  switch (method.toLowerCase()) {
    case 'card':
      return 'Credit / Debit Card';
    case 'card_terminal':
      return 'In-Cab Card Terminal';
    case 'stripe_preauth':
      return 'Pre-Authorized Card';
    case 'cash':
      return 'Pay in Vehicle (Cash)';
    case 'corporate':
    case 'account':
    case 'corporate_account':
      return 'Corporate Direct Bill Account';
    default:
      return method.replace(/_/g, ' ').toUpperCase();
  }
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
  themeColor: string = '#2563eb'
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

  const hasBooker = Boolean(
    contactPerson?.isBookerDifferent && contactPerson?.contactName
  );

  const hasAdditional = Boolean(
    additionalPassengers && additionalPassengers.length > 0
  );

  const rawPhone = passenger.phone ? passenger.phone.replace(/\D/g, '') : '';

  return `
    <!-- Complete Passenger Details Card -->
    <div class="card-box" style="margin-top: 14px; margin-bottom: 16px; border-left: 4px solid ${themeColor}; background-color: #ffffff; border: 1px solid #e2e8f0; border-left: 4px solid ${themeColor};">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        👤 Complete Passenger &amp; Contact Details
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="55%" valign="top" style="padding-bottom: 10px;">
            <div class="item-label">Primary Passenger</div>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(passenger.firstName)} ${escapeHtml(passenger.lastName)}
            </div>
            <div style="margin-top: 5px; font-size: 13px; color: #475569;">
              📞 <a href="tel:${escapeHtml(rawPhone || passenger.phone)}" style="color: ${themeColor}; text-decoration: none; font-weight: 600;">${escapeHtml(passenger.phone || 'Phone not provided')}</a>
            </div>
            ${passenger.email ? `
            <div style="margin-top: 3px; font-size: 13px; color: #475569;">
              ✉️ <a href="mailto:${escapeHtml(passenger.email)}" style="color: ${themeColor}; text-decoration: none;">${escapeHtml(passenger.email)}</a>
            </div>
            ` : ''}
          </td>
          <td width="45%" valign="top" style="padding-bottom: 10px;">
            <div class="item-label">Party &amp; Luggage Capacity</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
              👥 ${passengerCount || 1} Passenger${(passengerCount || 1) > 1 ? 's' : ''}
            </div>
            <div style="margin-top: 4px; font-size: 13px; color: #475569; font-weight: 500;">
              🧳 ${luggageCount ?? 0} Standard Bag${(luggageCount ?? 0) === 1 ? '' : 's'}
            </div>
          </td>
        </tr>
      </table>

      ${hasBooker && contactPerson ? `
      <!-- Booker / Contact Person -->
      <div style="margin-top: 8px; padding: 10px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">
          📋 Booker / Authorized Contact (Different from Passenger)
        </div>
        <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-top: 2px;">
          ${escapeHtml(contactPerson.contactName)} ${contactPerson.contactRole ? `<span style="font-weight: 500; color: #64748b;">(${escapeHtml(contactPerson.contactRole)})</span>` : ''}
        </div>
        <div style="font-size: 12px; color: #475569; margin-top: 3px;">
          ${contactPerson.contactPhone ? `Phone: <a href="tel:${escapeHtml(contactPerson.contactPhone.replace(/\D/g, ''))}" style="color: ${themeColor}; text-decoration: none; font-weight: 600;">${escapeHtml(contactPerson.contactPhone)}</a>` : ''}
          ${contactPerson.contactPhone && contactPerson.contactEmail ? ' • ' : ''}
          ${contactPerson.contactEmail ? `Email: <a href="mailto:${escapeHtml(contactPerson.contactEmail)}" style="color: ${themeColor}; text-decoration: none;">${escapeHtml(contactPerson.contactEmail)}</a>` : ''}
        </div>
      </div>
      ` : ''}

      ${hasCarSeats ? `
      <!-- Child Safety Car Seats -->
      <div style="margin-top: 8px; padding: 8px 12px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
        <span style="font-size: 11px; font-weight: 800; color: #1e40af; text-transform: uppercase;">
          👶 Requested Child Car Seats:
        </span>
        <span style="font-size: 13px; font-weight: 700; color: #1e3a8a; margin-left: 4px;">
          ${escapeHtml(carSeatParts.join(' • '))}
        </span>
      </div>
      ` : ''}

      ${hasAdditional && additionalPassengers ? `
      <!-- Additional Passengers -->
      <div style="margin-top: 8px; padding: 8px 12px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">
          👥 Additional Named Passengers:
        </div>
        <div style="font-size: 12px; color: #1e293b; margin-top: 3px;">
          ${additionalPassengers.map((ap) => `${escapeHtml(ap.name)}${ap.phone ? ` (${escapeHtml(ap.phone)})` : ''}`).join(' • ')}
        </div>
      </div>
      ` : ''}
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
    out += `\n- Booker / Authorized Contact: ${contactPerson.contactName}${contactPerson.contactRole ? ` (${contactPerson.contactRole})` : ''} [Phone: ${contactPerson.contactPhone || 'N/A'}, Email: ${contactPerson.contactEmail || 'N/A'}]`;
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
    out += `\n- Additional Named Passengers: ${additionalPassengers.map((a) => `${a.name}${a.phone ? ` (${a.phone})` : ''}`).join(', ')}`;
  }

  return out;
}

/**
 * 1. Passenger Confirmation Receipt
 */
/**
 * 1A. Passenger Booking Request Received (Pending Review / Unconfirmed)
 */
export function renderBookingRequestReceivedEmail(
  payload: BookingConfirmationEmailPayload
): RenderedEmail {
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyAddress = payload.companySettings?.address || COMPANY_CONFIG.address.formatted;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');

  const isScheduled = payload.bookingType === 'scheduled';
  const hasFlight = Boolean(
    payload.flightDetails?.airlineCode ||
    payload.flightDetails?.airlineName ||
    payload.flightDetails?.flightNumber ||
    payload.flightDetails?.isAirportTrip
  );

  const isLambert =
    payload.pickupAddress?.toLowerCase().includes('lambert') ||
    payload.pickupAddress?.toLowerCase().includes('stl airport') ||
    payload.pickupAddress?.toLowerCase().includes('10701 lambert') ||
    payload.pickupAddress?.toLowerCase().includes('st. louis lambert') ||
    payload.pickupAddress?.toLowerCase().includes('st louis lambert');

  const lambertInstructions =
    payload.lambertPickupInstructions ||
    'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.';

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
    ? `⏳ Round-Trip Booking Request Received: #${payload.tripId} & #${payload.returnTripDetails?.tripId} | ${companyName}`
    : `⏳ Booking Request Received: #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-amber" style="font-size: 13px; padding: 6px 16px;">
        ⏳ ${hasReturn ? 'Round-Trip' : 'Booking'} Request Received • Under Dispatch Review
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 16px 0 6px 0;">
        We've Received Your ${hasReturn ? 'Round-Trip' : 'Ride'} Request, ${safeFirstName}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
        ${
          hasReturn
            ? `Your round-trip reservation requests <strong>#${safeTripId}</strong> (Outbound) and <strong>#${safeReturnTripId}</strong> (Return) have entered our 24/7 dispatch queue. Our operations team is reviewing driver availability and schedule timing.`
            : `Your reservation request <strong>#${safeTripId}</strong> has entered our 24/7 dispatch queue. Our operations team is reviewing driver availability and schedule timing.`
        }
      </p>
      <div style="margin-top: 16px;">
        <a href="${escapeHtml(trackingUrl)}" style="display: inline-block; background-color: #d97706; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 22px; border-radius: 8px;">
          Track Reservation Status Live &rarr;
        </a>
      </div>
    </div>

    <!-- 3-Step Review Progress Timeline -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 18px 16px; margin: 18px 0;">
      <div style="font-size: 11px; font-weight: 800; color: #92400e; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 12px; text-align: center;">
        Reservation Review Status
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="33%" align="center" style="font-size: 11px; color: #059669; font-weight: 700;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #d1fae5; color: #059669; line-height: 26px; margin: 0 auto 6px auto; font-size: 13px; font-weight: 800;">✓</div>
            1. Request Sent
          </td>
          <td width="33%" align="center" style="font-size: 11px; color: #d97706; font-weight: 800;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #fef3c7; color: #d97706; line-height: 26px; margin: 0 auto 6px auto; font-size: 13px; font-weight: 800; border: 2px solid #f59e0b;">⏳</div>
            2. Dispatch Review
          </td>
          <td width="33%" align="center" style="font-size: 11px; color: #94a3b8; font-weight: 600;">
            <div style="width: 26px; height: 26px; border-radius: 50%; background-color: #f1f5f9; color: #94a3b8; line-height: 26px; margin: 0 auto 6px auto; font-size: 13px;">3</div>
            3. Final Confirmation
          </td>
        </tr>
      </table>
      <div style="font-size: 12px; color: #92400e; margin-top: 14px; text-align: center; line-height: 1.45;">
        You will receive an itemized confirmation receipt as soon as dispatch assigns your vehicle and driver.
      </div>
    </div>

    <!-- Complete Passenger Details -->
    ${renderPassengerDetailsCard(
      payload.passenger,
      payload.passengerCount,
      payload.luggageCount,
      payload.contactPerson,
      payload.additionalPassengers,
      payload.carSeatsBreakdown,
      '#d97706'
    )}

    <!-- Outbound Leg Card -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #d97706;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        ${hasReturn ? `1. Outbound Journey (#${safeTripId})` : `Requested Itinerary (#${safeTripId})`}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Requested Timing</div>
            <div class="item-value">
              ${escapeHtml(payload.pickupTime)}
              <div style="font-size: 12px; color: #d97706; font-weight: 600; margin-top: 2px;">
                ${isScheduled ? 'Scheduled Reservation' : 'Immediate Dispatch (ASAP)'}
              </div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Preference</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>

      <div class="route-point" style="margin-top: 8px;">
        <div class="item-label" style="color: #d97706;">● Pickup Location</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.pickupAddress)}
        </div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(payload.pickupNotes)}</div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">◆ Intermediate Stop</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">${escapeHtml(s.address)}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(s.notes)}</div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Dropoff Destination</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.dropoffAddress)}
        </div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(payload.dropoffNotes)}</div>` : ''}
      </div>

      ${hasFlight ? `
      <!-- Airport Flight Details -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-top: 12px;">
        <div style="font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase;">
          ✈ Flight Details
        </div>
        <div style="font-size: 13px; color: #0f172a; margin-top: 2px;">
          ${
            payload.flightDetails?.isPrivateAviation || payload.flightDetails?.tailNumber
              ? `Private Aviation: Tail #${escapeHtml(payload.flightDetails?.tailNumber || 'N/A')}${payload.flightDetails?.fboFacility ? ` (${escapeHtml(payload.flightDetails.fboFacility)})` : ''}`
              : `${escapeHtml(payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || 'Airline')} ${payload.flightDetails?.flightNumber ? `Flight #${escapeHtml(payload.flightDetails.flightNumber)}` : ''}${payload.flightDetails?.departureAirport ? ` (${escapeHtml(payload.flightDetails.departureAirport.toUpperCase())})` : ''}`
          }
        </div>
      </div>
      ` : ''}
    </div>

    ${hasReturn && payload.returnTripDetails ? `
    <!-- Return Leg Card -->
    <div class="card-box" style="margin-top: 16px; border-left: 4px solid #0284c7;">
      <div style="font-size: 13px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        2. Return Journey (#${safeReturnTripId})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Return Scheduled Timing</div>
            <div class="item-value">
              ${escapeHtml(payload.returnTripDetails.pickupTime)}
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Preference</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.returnTripDetails.vehicleTier, undefined, payload.returnTripDetails.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>

      <div class="route-point" style="margin-top: 8px;">
        <div class="item-label" style="color: #0284c7;">● Return Pickup</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.returnTripDetails.pickupAddress)}
        </div>
      </div>

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Return Dropoff</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.returnTripDetails.dropoffAddress)}
        </div>
      </div>

      ${payload.returnTripDetails.flightDetails ? `
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 14px; margin-top: 12px;">
        <div style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase;">
          ✈ Return Flight Tracking
        </div>
        <div style="font-size: 13px; color: #0f172a; margin-top: 2px;">
          ${
            payload.returnTripDetails.flightDetails.isPrivateAviation || payload.returnTripDetails.flightDetails.tailNumber
              ? `Private Aviation: Tail #${escapeHtml(payload.returnTripDetails.flightDetails.tailNumber || 'N/A')}${payload.returnTripDetails.flightDetails.fboFacility ? ` (${escapeHtml(payload.returnTripDetails.flightDetails.fboFacility)})` : ''}`
              : `${escapeHtml(payload.returnTripDetails.flightDetails.airlineName || payload.returnTripDetails.flightDetails.airlineCode || 'Airline')} ${payload.returnTripDetails.flightDetails.flightNumber ? `Flight #${escapeHtml(payload.returnTripDetails.flightDetails.flightNumber)}` : ''}${payload.returnTripDetails.flightDetails.departureAirport ? ` (${escapeHtml(payload.returnTripDetails.flightDetails.departureAirport.toUpperCase())})` : ''}`
          }
        </div>
      </div>
      ` : ''}
    </div>
    ` : ''}

    ${payload.oversizedItemsSummary ? `
    <!-- Oversized Luggage & Cargo Notice -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 14px 16px; margin: 14px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase;">
        🧳 Declared Oversized Cargo &amp; Equipment
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #78350f; margin-top: 3px;">
        ${escapeHtml(payload.oversizedItemsSummary)}
      </div>
    </div>
    ` : ''}

    ${isLambert ? `
    <!-- Lambert Airport Curbside Instructions Callout -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0284c7; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #0369a1; margin-bottom: 4px;">
        ✈ STL Lambert Curbside Pickup Instructions
      </div>
      <div style="font-size: 12px; color: #0f172a; line-height: 1.5;">
        ${escapeHtml(lambertInstructions)}
      </div>
    </div>
    ` : ''}

    ${payload.customExtrasSummary ? `
    <!-- Selected Add-Ons / Custom Extras -->
    <div class="card-box" style="background-color: #f0fdf4; border-color: #bbf7d0;">
      <div class="item-label" style="color: #166534;">Selected Extras &amp; Add-Ons</div>
      <div style="font-size: 13px; font-weight: 600; color: #14532d; margin-top: 3px;">
        ${escapeHtml(payload.customExtrasSummary)}
      </div>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Special Requests -->
    <div class="card-box">
      <div class="item-label">Passenger Notes / Special Requests</div>
      <div style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5;">
        ${escapeHtml(payload.specialRequests)}
      </div>
    </div>
    ` : ''}

    <!-- Estimated Fare & Payment -->
    <div class="card-box" style="background-color: #f8fafc; border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td valign="middle">
            <div class="item-label">Payment Option</div>
            <div class="item-value" style="font-size: 14px;">
              ${escapeHtml(formatPaymentMethod(payload.paymentMethod))}
            </div>
            ${hasReturn ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Covers Outbound &amp; Return Journeys</div>` : ''}
          </td>
          <td align="right" valign="middle">
            <div class="item-label">${hasReturn ? 'Combined Round-Trip Fare' : 'Estimated Fare'}</div>
            <div class="fare-total" style="color: #0f172a;">
              $${totalCombinedFare.toFixed(2)} <span style="font-size: 13px; color: #64748b; font-weight: 600;">${escapeHtml(payload.currency)}</span>
            </div>
            ${hasReturn ? `<div style="font-size: 11px; color: #64748b;">(Outbound: $${payload.totalFare.toFixed(2)} + Return: $${payload.returnTripDetails?.totalFare.toFixed(2)})</div>` : ''}
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName)}
    </div>

    <!-- Dispatch Assistance Callout -->
    <div class="dispatch-box" style="border-left-color: #d97706; background-color: #fffbeb; border-color: #fde68a;">
      <div style="font-weight: 700; color: #92400e; font-size: 13px; margin-bottom: 4px;">
        Need immediate dispatch assistance or urgent changes?
      </div>
      <div style="font-size: 13px; color: #78350f; line-height: 1.5;">
        Call 24/7 Dispatch directly at 
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #b45309; text-decoration: underline;">
          ${safeCompanyPhone}
        </a>. Reference Request <strong>#${safeTripId}</strong>${hasReturn ? ` or <strong>#${safeReturnTripId}</strong>` : ''}.
      </div>
    </div>
    `,
    `We have received your ${hasReturn ? 'round-trip ' : ''}ride request #${payload.tripId}. Our dispatch team is reviewing your details.`,
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

We have received your ${hasReturn ? 'round-trip ' : ''}ride request #${payload.tripId}${hasReturn ? ` & #${payload.returnTripDetails?.tripId}` : ''}.
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

OUTBOUND LEG: #${payload.tripId}
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle Preference: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` (Note: ${payload.pickupNotes})` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` (Note: ${payload.dropoffNotes})` : ''}
${hasFlight ? `- Flight: ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || ''} ${payload.flightDetails?.flightNumber || payload.flightDetails?.tailNumber || ''}\n` : ''}
${hasReturn && payload.returnTripDetails ? `
RETURN LEG: #${payload.returnTripDetails.tripId}
- Return Timing: ${payload.returnTripDetails.pickupTime}
- Return Vehicle: ${formatVehicleTier(payload.returnTripDetails.vehicleTier, undefined, payload.returnTripDetails.vehicleDisplayName)}
- Return Pickup: ${payload.returnTripDetails.pickupAddress}
- Return Dropoff: ${payload.returnTripDetails.dropoffAddress}
${payload.returnTripDetails.flightDetails ? `- Return Flight: ${payload.returnTripDetails.flightDetails.airlineName || payload.returnTripDetails.flightDetails.airlineCode || ''} ${payload.returnTripDetails.flightDetails.flightNumber || payload.returnTripDetails.flightDetails.tailNumber || ''}\n` : ''}
` : ''}
${payload.oversizedItemsSummary ? `- Oversized Cargo: ${payload.oversizedItemsSummary}\n` : ''}${payload.customExtrasSummary ? `- Selected Extras: ${payload.customExtrasSummary}\n` : ''}${payload.specialRequests ? `SPECIAL REQUESTS / NOTES:\n${payload.specialRequests}\n` : ''}
PAYMENT & FARE:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- ${hasReturn ? 'Combined Fare' : 'Estimated Fare'}: $${totalCombinedFare.toFixed(2)} ${payload.currency}${renderPriceBreakdownText(payload.breakdown)}

Questions or changes? Call 24/7 Dispatch at ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
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
  const companyAddress = payload.companySettings?.address || COMPANY_CONFIG.address.formatted;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');

  const isScheduled = payload.bookingType === 'scheduled';
  const hasFlight = Boolean(
    payload.flightDetails?.airlineCode ||
    payload.flightDetails?.airlineName ||
    payload.flightDetails?.flightNumber ||
    payload.flightDetails?.isAirportTrip
  );

  const isLambert =
    payload.pickupAddress?.toLowerCase().includes('lambert') ||
    payload.pickupAddress?.toLowerCase().includes('stl airport') ||
    payload.pickupAddress?.toLowerCase().includes('10701 lambert') ||
    payload.pickupAddress?.toLowerCase().includes('st. louis lambert') ||
    payload.pickupAddress?.toLowerCase().includes('st louis lambert');

  const lambertInstructions =
    payload.lambertPickupInstructions ||
    'Terminal 1: Exit Door 12 (Baggage Claim level) • Terminal 2: Exit Door 2. Chauffeur tracks flight arrival in real-time.';

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
    ? `✓ Round-Trip Booking Confirmed: #${payload.tripId} & #${payload.returnTripDetails?.tripId} | ${companyName}`
    : `✓ Booking Confirmed: #${payload.tripId} | ${companyName}`;

  const registerUrl = `${getAppBaseUrl()}/app/register?email=${encodeURIComponent(
    payload.passenger.email
  )}&name=${encodeURIComponent(
    `${payload.passenger.firstName} ${payload.passenger.lastName}`.trim()
  )}&phone=${encodeURIComponent(payload.passenger.phone || '')}&claimTrip=${encodeURIComponent(
    payload.tripId
  )}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-emerald" style="font-size: 13px; padding: 6px 16px;">
        ✓ ${hasReturn ? 'Round-Trip' : 'Reservation'} Confirmed &amp; Dispatched
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 16px 0 6px 0;">
        Your Ride is Confirmed, ${safeFirstName}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
        ${
          hasReturn
            ? `Your round-trip reservations <strong>#${safeTripId}</strong> (Outbound) and <strong>#${safeReturnTripId}</strong> (Return) have been locked into our 24/7 dispatch schedule. A professional chauffeur will arrive at your requested pickup location.`
            : `Your reservation <strong>#${safeTripId}</strong> has been locked in our 24/7 dispatch schedule. A professional chauffeur will arrive at your requested pickup location.`
        }
      </p>
      <div style="margin-top: 16px;">
        <a href="${escapeHtml(trackingUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 11px 24px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.35);">
          📍 Track Your Ride Live &rarr;
        </a>
      </div>
    </div>

    <!-- Complete Passenger Details -->
    ${renderPassengerDetailsCard(
      payload.passenger,
      payload.passengerCount,
      payload.luggageCount,
      payload.contactPerson,
      payload.additionalPassengers,
      payload.carSeatsBreakdown,
      '#2563eb'
    )}

    <!-- Outbound Leg Card -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #2563eb;">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        ${hasReturn ? `1. Outbound Journey (#${safeTripId})` : `Confirmed Itinerary (#${safeTripId})`}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Pickup Timing</div>
            <div class="item-value">
              ${escapeHtml(payload.pickupTime)}
              <div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 2px;">
                ${isScheduled ? 'Scheduled Reservation' : 'Immediate Dispatch (ASAP)'}
              </div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Tier</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>

      <div class="route-point" style="margin-top: 8px;">
        <div class="item-label" style="color: #2563eb;">● Pickup Location</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.pickupAddress)}
        </div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(payload.pickupNotes)}</div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">◆ Intermediate Stop</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">${escapeHtml(s.address)}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(s.notes)}</div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Dropoff Destination</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.dropoffAddress)}
        </div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${escapeHtml(payload.dropoffNotes)}</div>` : ''}
      </div>

      ${hasFlight ? `
      <!-- Airport Flight Operations Box -->
      <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px 14px; margin-top: 14px;">
        <div style="font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 6px;">
          ✈ Airport Flight Operations (Real-Time Delay Tracking)
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td width="50%" valign="top">
              <div class="item-label">Carrier &amp; Flight</div>
              <div class="item-value" style="font-size: 14px;">
                ${
                  payload.flightDetails?.isPrivateAviation || payload.flightDetails?.tailNumber
                    ? `Tail #${escapeHtml(payload.flightDetails?.tailNumber || 'N/A')}${payload.flightDetails?.fboFacility ? ` (${escapeHtml(payload.flightDetails.fboFacility)})` : ''}`
                    : `${escapeHtml(payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || 'Commercial Carrier')}${payload.flightDetails?.flightNumber ? ` #${escapeHtml(payload.flightDetails.flightNumber)}` : ''}`
                }
              </div>
            </td>
            <td width="50%" valign="top">
              <div class="item-label">Origin / Terminal</div>
              <div class="item-value" style="font-size: 14px;">
                ${payload.flightDetails?.departureAirport ? escapeHtml(payload.flightDetails.departureAirport.toUpperCase()) : 'Terminal Arrival'}
              </div>
            </td>
          </tr>
        </table>
      </div>
      ` : ''}
    </div>

    ${hasReturn && payload.returnTripDetails ? `
    <!-- Return Leg Card -->
    <div class="card-box" style="margin-top: 16px; border-left: 4px solid #0284c7;">
      <div style="font-size: 13px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        2. Return Journey (#${safeReturnTripId})
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Return Scheduled Timing</div>
            <div class="item-value">
              ${escapeHtml(payload.returnTripDetails.pickupTime)}
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Tier</div>
            <div class="item-value">
              ${escapeHtml(formatVehicleTier(payload.returnTripDetails.vehicleTier, undefined, payload.returnTripDetails.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>

      <div class="route-point" style="margin-top: 8px;">
        <div class="item-label" style="color: #0284c7;">● Return Pickup</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.returnTripDetails.pickupAddress)}
        </div>
      </div>

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Return Dropoff</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${escapeHtml(payload.returnTripDetails.dropoffAddress)}
        </div>
      </div>

      ${payload.returnTripDetails.flightDetails ? `
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 14px; margin-top: 14px;">
        <div style="font-size: 12px; font-weight: 700; color: #0369a1; margin-bottom: 6px;">
          ✈ Return Flight Tracking
        </div>
        <div style="font-size: 13px; color: #0f172a;">
          ${
            payload.returnTripDetails.flightDetails.isPrivateAviation || payload.returnTripDetails.flightDetails.tailNumber
              ? `Private Aviation: Tail #${escapeHtml(payload.returnTripDetails.flightDetails.tailNumber || 'N/A')}${payload.returnTripDetails.flightDetails.fboFacility ? ` (${escapeHtml(payload.returnTripDetails.flightDetails.fboFacility)})` : ''}`
              : `${escapeHtml(payload.returnTripDetails.flightDetails.airlineName || payload.returnTripDetails.flightDetails.airlineCode || 'Airline')} ${payload.returnTripDetails.flightDetails.flightNumber ? `Flight #${escapeHtml(payload.returnTripDetails.flightDetails.flightNumber)}` : ''}${payload.returnTripDetails.flightDetails.departureAirport ? ` (${escapeHtml(payload.returnTripDetails.flightDetails.departureAirport.toUpperCase())})` : ''}`
          }
        </div>
      </div>
      ` : ''}
      <div style="margin-top: 12px;">
        <a href="${escapeHtml(returnTrackingUrl)}" style="font-size: 12px; font-weight: 700; color: #0369a1; text-decoration: underline;">
          Track Return Leg Live &rarr;
        </a>
      </div>
    </div>
    ` : ''}

    ${isLambert ? `
    <!-- Lambert Airport Curbside Pickup Instructions Box -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">
        ✈ STL Lambert Curbside Pickup Instructions
      </div>
      <div style="font-size: 12px; color: #1e3a8a; line-height: 1.5;">
        ${escapeHtml(lambertInstructions)}
      </div>
    </div>
    ` : ''}

    ${payload.oversizedItemsSummary ? `
    <!-- Oversized Luggage & Cargo Details -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 16px; margin: 14px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase;">
        🧳 Confirmed Oversized Cargo &amp; Equipment
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #1e3a8a; margin-top: 3px;">
        ${escapeHtml(payload.oversizedItemsSummary)}
      </div>
    </div>
    ` : ''}

    ${payload.customExtrasSummary ? `
    <!-- Confirmed Custom Extras -->
    <div class="card-box" style="background-color: #f0fdf4; border-color: #bbf7d0;">
      <div class="item-label" style="color: #166534;">Confirmed Extras &amp; Add-Ons</div>
      <div style="font-size: 13px; font-weight: 600; color: #14532d; margin-top: 3px;">
        ${escapeHtml(payload.customExtrasSummary)}
      </div>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Driver Notes -->
    <div class="card-box">
      <div class="item-label">Driver Dispatch Remarks / Special Requests</div>
      <div style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5;">
        ${escapeHtml(payload.specialRequests)}
      </div>
    </div>
    ` : ''}

    <!-- Fare & Payment Summary -->
    <div class="card-box" style="background-color: #f8fafc; border-color: #cbd5e1;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td valign="middle">
            <div class="item-label">Payment Method</div>
            <div class="item-value" style="font-size: 14px;">
              ${escapeHtml(formatPaymentMethod(payload.paymentMethod))}
            </div>
            ${hasReturn ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">Covers Outbound &amp; Return Journeys</div>` : ''}
          </td>
          <td align="right" valign="middle">
            <div class="item-label">${hasReturn ? 'Combined Round-Trip Fare' : 'Total Quoted Fare'}</div>
            <div class="fare-total">
              $${totalCombinedFare.toFixed(2)} <span style="font-size: 13px; color: #64748b; font-weight: 600;">${escapeHtml(payload.currency)}</span>
            </div>
            ${hasReturn ? `<div style="font-size: 11px; color: #64748b;">(Outbound: $${payload.totalFare.toFixed(2)} + Return: $${payload.returnTripDetails?.totalFare.toFixed(2)})</div>` : ''}
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName)}
    </div>

    <!-- Personal Account Upsell CTA Card -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 12px; padding: 22px 20px; margin: 24px 0; text-align: center; color: #ffffff;">
      <div style="font-size: 22px; margin-bottom: 6px;">⭐</div>
      <div style="font-size: 16px; font-weight: 800; color: #ffffff; letter-spacing: -0.01em;">
        Save Time on Your Future Rides
      </div>
      <div style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin: 8px auto 16px auto; max-width: 440px;">
        Create your free passenger account to track driver arrival in real-time, save your favorite addresses, and rebook rides in just 2 clicks.
      </div>
      <a href="${escapeHtml(registerUrl)}" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 11px 26px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.4);">
        Create Free Passenger Account &rarr;
      </a>
    </div>

    <!-- Dispatch Assistance Callout -->
    <div class="dispatch-box">
      <div style="font-weight: 700; color: #1e40af; font-size: 13px; margin-bottom: 4px;">
        Need to change your pickup time or modify this reservation?
      </div>
      <div style="font-size: 13px; color: #1e3a8a; line-height: 1.5;">
        Call our 24/7 dispatch desk directly at 
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #1d4ed8; text-decoration: underline;">
          ${safeCompanyPhone}
        </a>. Reference trip ID <strong>#${safeTripId}</strong>${hasReturn ? ` or <strong>#${safeReturnTripId}</strong>` : ''}.
      </div>
    </div>
    `,
    `Your ${companyName} reservation #${payload.tripId} is confirmed for ${payload.pickupTime}. Total: $${totalCombinedFare.toFixed(2)}.`,
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
${companyName} - ${hasReturn ? 'ROUND-TRIP ' : ''}RESERVATION CONFIRMED
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Your reservation #${payload.tripId}${hasReturn ? ` & #${payload.returnTripDetails?.tripId}` : ''} has been confirmed with our 24/7 dispatch operations.

TRACK YOUR RIDE LIVE:
${trackingUrl}${hasReturn ? `\nTrack Return Leg: ${returnTrackingUrl}` : ''}

${renderPassengerDetailsText(
  payload.passenger,
  payload.passengerCount,
  payload.luggageCount,
  payload.contactPerson,
  payload.additionalPassengers,
  payload.carSeatsBreakdown
)}

OUTBOUND LEG: #${payload.tripId}
- Status: Confirmed
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle Class: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` (Note: ${payload.pickupNotes})` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` (Note: ${payload.dropoffNotes})` : ''}
${isLambert ? `- Lambert Pickup Instructions: ${lambertInstructions}\n` : ''}${hasFlight ? `- Flight: ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || ''} ${payload.flightDetails?.flightNumber || payload.flightDetails?.tailNumber || ''}\n` : ''}
${hasReturn && payload.returnTripDetails ? `
RETURN LEG: #${payload.returnTripDetails.tripId}
- Status: Confirmed
- Timing: ${payload.returnTripDetails.pickupTime}
- Vehicle Class: ${formatVehicleTier(payload.returnTripDetails.vehicleTier, undefined, payload.returnTripDetails.vehicleDisplayName)}
- Return Pickup: ${payload.returnTripDetails.pickupAddress}
- Return Dropoff: ${payload.returnTripDetails.dropoffAddress}
${payload.returnTripDetails.flightDetails ? `- Return Flight: ${payload.returnTripDetails.flightDetails.airlineName || payload.returnTripDetails.flightDetails.airlineCode || ''} ${payload.returnTripDetails.flightDetails.flightNumber || payload.returnTripDetails.flightDetails.tailNumber || ''}\n` : ''}
` : ''}
${payload.oversizedItemsSummary ? `- Oversized Cargo: ${payload.oversizedItemsSummary}\n` : ''}${payload.customExtrasSummary ? `- Confirmed Extras: ${payload.customExtrasSummary}\n` : ''}${payload.specialRequests ? `- Driver Notes: ${payload.specialRequests}\n` : ''}
PAYMENT & TOTAL:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- ${hasReturn ? 'Combined Fare' : 'Quoted Total'}: $${totalCombinedFare.toFixed(2)} ${payload.currency}${renderPriceBreakdownText(payload.breakdown)}

CREATE A PASSENGER ACCOUNT:
Save time on future rides: ${registerUrl}

Need assistance or changes? Call 24/7 Dispatch at ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
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
  const subject = `🚨 [DISPATCH ALERT] ${isUrgent ? 'URGENT ASAP' : 'SCHEDULED'} Ride #${payload.tripId} - ${payload.passengerName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge ${isUrgent ? 'badge-amber' : 'badge-blue'}" style="font-size: 14px; padding: 6px 16px;">
        ${isUrgent ? '⚡ URGENT - IMMEDIATE PICKUP (ASAP)' : '🗓 SCHEDULED RESERVATION'}
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 12px 0 2px 0;">
        New Booking #${escapeHtml(payload.tripId)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        ${escapeHtml(payload.bookingSource || 'Submitted via Web Portal')} • Dispatch Action Required
      </p>
    </div>

    <!-- Passenger Information Box -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #0f172a;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 8px;">
        Passenger Information
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top">
            <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.passengerName)}</div>
            <div style="font-size: 13px; color: #475569; margin-top: 2px;">
              <a href="tel:${escapeHtml(payload.passengerPhone)}" style="color: #0f172a; font-weight: 600; text-decoration: none;">📞 ${escapeHtml(payload.passengerPhone)}</a>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              ✉ ${escapeHtml(payload.passengerEmail)}
            </div>
          </td>
          <td width="50%" align="right" valign="top">
            <div class="item-label">Capacity</div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">
              ${payload.passengerCount || 1} Pax • ${payload.luggageCount || 0} Luggage
            </div>
            <div style="font-size: 12px; color: #d97706; font-weight: 700; text-transform: uppercase; margin-top: 4px;">
              Tier: ${escapeHtml(formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName))}
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${payload.oversizedItemsSummary ? `
    <!-- Oversized Cargo Alert -->
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 8px; padding: 12px 14px; margin: 14px 0;">
      <div style="font-weight: 800; color: #991b1b; font-size: 12px; text-transform: uppercase;">
        🚨 Declared Oversized Cargo (Vehicle Assignment Alert)
      </div>
      <div style="font-size: 13px; font-weight: 700; color: #7f1d1d; margin-top: 3px;">
        ${escapeHtml(payload.oversizedItemsSummary)}
      </div>
    </div>
    ` : ''}

    ${payload.customExtrasSummary ? `
    <!-- Custom Bookable Extras -->
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 8px; padding: 12px 14px; margin: 14px 0;">
      <div style="font-weight: 800; color: #166534; font-size: 12px; text-transform: uppercase;">
        ✓ Selected Extras &amp; Add-Ons
      </div>
      <div style="font-size: 13px; font-weight: 700; color: #14532d; margin-top: 3px;">
        ${escapeHtml(payload.customExtrasSummary)}
      </div>
    </div>
    ` : ''}

    <!-- Routing Details -->
    <div class="card-box" style="border-left: 4px solid #d97706;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px;">
        Pickup & Dropoff Route
      </div>
      
      <div class="route-point">
        <div class="item-label" style="color: #d97706;">Pickup Location (${escapeHtml(payload.pickupTime)})</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.pickupAddress)}</div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Pickup Note: <strong>${escapeHtml(payload.pickupNotes)}</strong></div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 14px; margin-left: 4px; margin-top: 6px; margin-bottom: 6px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">Intermediate Stop</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(s.address)}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Stop Note: <strong>${escapeHtml(s.notes)}</strong></div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 14px; margin-left: 4px; margin-top: 6px; margin-bottom: 6px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">Dropoff Destination</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.dropoffAddress)}</div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Dropoff Note: <strong>${escapeHtml(payload.dropoffNotes)}</strong></div>` : ''}
      </div>
    </div>

    ${payload.returnTripDetails ? `
    <!-- Linked Return Trip -->
    <div class="card-box" style="border-left: 4px solid #4f46e5; background: #eef2ff;">
      <div style="font-size: 12px; font-weight: 700; color: #3730a3; text-transform: uppercase; margin-bottom: 8px;">
        🔄 Linked Return Journey (#${escapeHtml(payload.returnTripDetails.tripId)})
      </div>
      <div style="font-size: 13px; color: #1e1b4b; line-height: 1.5;">
        <strong>Return Pickup:</strong> ${escapeHtml(payload.returnTripDetails.pickupTime)}<br>
        <strong>From:</strong> ${escapeHtml(payload.returnTripDetails.pickupAddress)}<br>
        <strong>To:</strong> ${escapeHtml(payload.returnTripDetails.dropoffAddress)}<br>
        <strong>Return Fare:</strong> $${payload.returnTripDetails.totalFare.toFixed(2)}
      </div>
    </div>
    ` : ''}

    ${payload.flightDetails?.airlineCode || payload.flightDetails?.flightNumber || payload.flightDetails?.tailNumber || payload.flightDetails?.fboFacility ? `
    <!-- Airport & Aviation Operations -->
    <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <div style="font-weight: 700; color: #854d0e; font-size: 13px; margin-bottom: 6px;">
        ${payload.flightDetails.isPrivateAviation || payload.flightDetails.tailNumber ? '🛩️ Private Aviation / FBO Tracking Data' : '✈ Airport Flight Tracking Data'}
      </div>
      <div style="font-size: 13px; color: #713f12; line-height: 1.6;">
        ${payload.flightDetails.tailNumber ? `<strong>Tail #:</strong> ${escapeHtml(payload.flightDetails.tailNumber)}<br>` : ''}
        ${payload.flightDetails.fboFacility ? `<strong>FBO Facility:</strong> ${escapeHtml(payload.flightDetails.fboFacility)}<br>` : ''}
        ${payload.flightDetails.airlineName || payload.flightDetails.airlineCode ? `<strong>Airline:</strong> ${escapeHtml(payload.flightDetails.airlineName || payload.flightDetails.airlineCode)}<br>` : ''}
        ${payload.flightDetails.flightNumber ? `<strong>Flight #:</strong> ${escapeHtml(payload.flightDetails.flightNumber)}<br>` : ''}
        ${payload.flightDetails.departureAirport ? `<strong>Origin Airport:</strong> ${escapeHtml(payload.flightDetails.departureAirport)}<br>` : ''}
        <strong>Checked Baggage:</strong> ${payload.flightDetails.hasCheckedLuggage ? 'YES' : 'NO'}
      </div>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Special Driver Instructions -->
    <div class="card-box" style="border-left: 4px solid #ef4444; background: #fef2f2;">
      <div class="item-label" style="color: #991b1b;">Special Passenger / Driver Instructions</div>
      <div style="font-size: 13px; color: #7f1d1d; font-weight: 600; margin-top: 4px; line-height: 1.5;">
        "${escapeHtml(payload.specialRequests)}"
      </div>
    </div>
    ` : ''}

    <!-- Financial Breakdown -->
    <div class="card-box">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div class="item-label">Payment Type</div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">
              ${escapeHtml(payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard')}
            </div>
          </td>
          <td align="right">
            <div class="item-label">Quoted Revenue</div>
            <div class="fare-total" style="color: #059669;">
              $${payload.totalFare.toFixed(2)} ${escapeHtml(payload.currency)}
            </div>
          </td>
        </tr>
      </table>
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName)}
    </div>
    `,
    `[ALERT] New Ride #${payload.tripId} (${payload.bookingType.toUpperCase()}) for ${payload.passengerName}. Pickup: ${payload.pickupAddress}`,
    payload.companySettings
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops
          .map((s, idx) => `- Stop ${idx + 1}: ${s.address}${s.notes ? ` [Note: ${s.notes}]` : ''}`)
          .join('\n') + '\n'
      : '';

  const text = `
========================================
🚨 NEW RIDE DISPATCH ALERT
========================================
Trip ID: #${payload.tripId}
Urgency: ${isUrgent ? 'URGENT (ASAP)' : 'SCHEDULED'}
Passenger: ${payload.passengerName}
Phone: ${payload.passengerPhone}
Email: ${payload.passengerEmail}
Pax / Bags: ${payload.passengerCount || 1} Pax / ${payload.luggageCount || 0} Bags

TIMING & TIER:
- Pickup Time: ${payload.pickupTime}
- Vehicle Tier: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}

ROUTING:
- Pickup: ${payload.pickupAddress}${payload.pickupNotes ? ` [Note: ${payload.pickupNotes}]` : ''}
${stopsText}- Dropoff: ${payload.dropoffAddress}${payload.dropoffNotes ? ` [Note: ${payload.dropoffNotes}]` : ''}
${payload.returnTripDetails ? `- Linked Return (#${payload.returnTripDetails.tripId}): ${payload.returnTripDetails.pickupAddress} -> ${payload.returnTripDetails.dropoffAddress} at ${payload.returnTripDetails.pickupTime} ($${payload.returnTripDetails.totalFare.toFixed(2)})\n` : ''}${payload.flightDetails?.airlineCode || payload.flightDetails?.flightNumber || payload.flightDetails?.tailNumber ? `- Flight: ${payload.flightDetails.tailNumber ? `Tail #${payload.flightDetails.tailNumber} (${payload.flightDetails.fboFacility || 'FBO'})` : `${payload.flightDetails.airlineName || payload.flightDetails.airlineCode || ''} #${payload.flightDetails.flightNumber || ''} from ${payload.flightDetails.departureAirport || 'N/A'}`}\n` : ''}${payload.oversizedItemsSummary ? `- Oversized Cargo: ${payload.oversizedItemsSummary}\n` : ''}${payload.customExtrasSummary ? `- Selected Extras: ${payload.customExtrasSummary}\n` : ''}${payload.specialRequests ? `- Special Notes: ${payload.specialRequests}\n` : ''}
REVENUE:
- Quoted Fare: $${payload.totalFare.toFixed(2)} ${payload.currency}
- Payment: ${payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard'}${renderPriceBreakdownText(payload.breakdown)}
========================================
  `.trim();

  return { subject, html, text };
}

/**
 * 3. Admin Status Update Notification
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
    confirmed: 'Reservation Confirmed',
    offered: 'Broadcasting Ride to Chauffeurs',
    assigned: 'Chauffeur Assigned to Your Ride',
    accepted: 'Chauffeur Confirmed & Preparing',
    en_route: 'Your Chauffeur is En Route',
    arrived: 'Your Chauffeur Has Arrived at Pickup',
    in_progress: 'Your Trip is In Progress',
    completed: 'Ride Completed - Thank You!',
    cancelled: 'Ride Booking Cancelled',
    declined: 'Ride Request Declined',
  };

  const statusHeadline =
    statusTitles[statusLower] || `Trip Status Update: ${statusKey.toUpperCase()}`;
  const subject = `Ride Update #${payload.tripId}: ${statusHeadline} | ${companyName}`;

  const isAssigned = statusLower === 'assigned' || statusLower === 'accepted' || statusLower === 'en_route' || statusLower === 'arrived';
  const isCancelled = statusLower === 'cancelled' || statusLower === 'declined';
  const isCompleted = statusLower === 'completed';
  const showTrackCta = !isCancelled && !isCompleted;
  const trackingUrl = resolveTrackingUrl(payload.tripId, payload.trackingToken, payload.trackingUrl);
  const safeTripId = escapeHtml(payload.tripId);
  const safeVehicle = escapeHtml(
    formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)
  );

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge ${isCancelled ? 'badge-amber' : isCompleted ? 'badge-emerald' : 'badge-blue'}" style="font-size: 13px; padding: 6px 14px;">
        Status: ${escapeHtml(statusKey.replace(/_/g, ' ').toUpperCase())}
      </span>
      <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 12px 0 4px 0;">
        ${escapeHtml(statusHeadline)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px;">
        Trip Reference <strong>#${safeTripId}</strong>
      </p>
      ${
        showTrackCta
          ? `<div style="margin-top: 14px;">
              <a href="${escapeHtml(trackingUrl)}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 22px; border-radius: 8px;">
                📍 Track Live on Map &rarr;
              </a>
            </div>`
          : ''
      }
    </div>

    <!-- Status message explanation -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #0f172a;">
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">
        ${
          statusLower === 'en_route'
            ? 'Your professional chauffeur is currently driving to your pickup location. Use the live tracking link above for real-time GPS arrival updates.'
            : statusLower === 'arrived'
            ? 'Your chauffeur has arrived outside your pickup location and is ready for boarding.'
            : statusLower === 'in_progress'
            ? 'Your trip is underway. Thank you for riding with us!'
            : statusLower === 'confirmed'
            ? 'Your reservation has been confirmed and locked into our 24/7 dispatch schedule.'
            : isAssigned
            ? 'Great news! A professional chauffeur has been assigned and scheduled to service your pickup.'
            : isCompleted
            ? `Thank you for traveling with ${escapeHtml(companyName)}! Your ride has been marked complete by your chauffeur.`
            : isCancelled
            ? 'Your ride reservation has been cancelled. If you believe this was in error, please contact our dispatch team immediately.'
            : 'Your reservation is currently being coordinated by our central dispatch desk.'
        }
        ${payload.statusReason ? `<div style="margin-top: 8px; font-style: italic; color: #64748b;">Note: "${escapeHtml(payload.statusReason)}"</div>` : ''}
      </div>
    </div>

    ${isAssigned && payload.driverInfo ? `
    <!-- Driver Info Box -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-weight: 700; color: #1e40af; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">
        Assigned Chauffeur Information
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(payload.driverInfo.name || 'Professional Chauffeur')}
            </div>
            ${payload.driverInfo.phone ? `
              <div style="font-size: 13px; color: #1e40af; margin-top: 2px;">
                📞 <a href="tel:${escapeHtml(payload.driverInfo.phone.replace(/\D/g, '') || payload.driverInfo.phone)}" style="color: #1e40af; font-weight: 600; text-decoration: none;">${escapeHtml(payload.driverInfo.phone)}</a>
              </div>
            ` : ''}
          </td>
          ${payload.driverInfo.vehicleModel ? `
          <td align="right">
            <div class="item-label">Vehicle / Plate</div>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a;">
              ${escapeHtml(payload.driverInfo.vehicleModel)}
            </div>
            ${payload.driverInfo.licensePlate ? `
              <div style="font-size: 12px; color: #64748b; font-weight: 700;">Plate: ${escapeHtml(payload.driverInfo.licensePlate)}</div>
            ` : ''}
          </td>
          ` : ''}
        </tr>
      </table>
    </div>
    ` : ''}

    <!-- Route Review -->
    <div class="card-box">
      <div class="item-label">Pickup Location</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${escapeHtml(payload.pickupAddress)}</div>
      
      <div class="item-label">Dropoff Destination</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${escapeHtml(payload.dropoffAddress)}</div>

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%">
            <div class="item-label">Pickup Timing</div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${escapeHtml(payload.pickupTime)}</div>
          </td>
          <td width="50%">
            <div class="item-label">Vehicle Class</div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${safeVehicle}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Contact Support -->
    <div class="dispatch-box">
      <div style="font-size: 13px; color: #1e3a8a; line-height: 1.5;">
        Questions about this update? Call 24/7 Dispatch at 
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #0f172a; text-decoration: underline;">
          ${escapeHtml(companyPhone)}
        </a>.
      </div>
    </div>
    `,
    `Ride update for #${payload.tripId}: Status changed to ${statusKey.toUpperCase()}.`,
    payload.companySettings
  );

  const text = `
========================================
${companyName} - RIDE STATUS UPDATE
========================================
Trip ID: #${payload.tripId}
New Status: ${statusKey.toUpperCase()}

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

${statusHeadline}
${payload.statusReason ? `Reason: ${payload.statusReason}\n` : ''}${isAssigned && payload.driverInfo ? `Chauffeur: ${payload.driverInfo.name || 'Assigned'}${payload.driverInfo.phone ? ` | Phone: ${payload.driverInfo.phone}` : ''}\n` : ''}${showTrackCta ? `Track Live: ${trackingUrl}\n` : ''}
Route:
- Vehicle: ${formatVehicleTier(payload.vehicleTier, undefined, payload.vehicleDisplayName)}
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}

Need help? Call 24/7 Dispatch at ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * Renders the Booking Declined notification email.
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
    ? 'Return Leg'
    : isOutboundOnly
    ? 'Outbound Leg'
    : isRoundTrip
    ? 'Round-Trip'
    : 'Ride';

  const subject = `Booking Update: ${scopePrefix} Request #${payload.tripId} - ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="margin-bottom: 24px; text-align: center;">
      <div style="display: inline-block; width: 48px; height: 48px; border-radius: 24px; background-color: #fef2f2; border: 1px solid #fecaca; line-height: 48px; font-size: 24px;">
        ⚠️
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #991b1b; margin: 12px 0 4px 0;">${escapeHtml(scopePrefix)} Request Status Update</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">Trip ID #${escapeHtml(payload.tripId)}${payload.linkedTripId ? ` (Linked: #${escapeHtml(payload.linkedTripId)})` : ''}</p>
    </div>

    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 16px;">
      Dear ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)},
    </p>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
      Thank you for your booking request with ${escapeHtml(companyName)}. After reviewing current fleet availability and service schedules, our dispatch team is unfortunately unable to accommodate this specific ${escapeHtml(scopePrefix.toLowerCase())} request at this time.${
        isReturnOnly
          ? ' <strong>Please note:</strong> Your outbound ride remains scheduled and active unless you request otherwise.'
          : ''
      }
    </p>

    <!-- Reason Box -->
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; color: #991b1b; margin-bottom: 4px;">
        Reason Provided by Dispatch
      </div>
      <div style="font-size: 15px; font-weight: 600; color: #7f1d1d; margin-bottom: ${payload.customNotes ? '8px' : '0'};">
        ${escapeHtml(payload.reason)}
      </div>
      ${
        payload.customNotes
          ? `<div style="font-size: 13px; color: #991b1b; font-style: italic; border-top: 1px dashed #fecaca; padding-top: 8px;">
              "${escapeHtml(payload.customNotes)}"
             </div>`
          : ''
      }
    </div>

    <!-- Requested Itinerary (inline-styled for universal email client support) -->
    <div class="card-box">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px;">
        Original ${escapeHtml(scopePrefix)} Request Details
      </div>

      <div class="route-point" style="margin-bottom: 10px;">
        <div class="item-label" style="color: #059669;">Pickup Address</div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.pickupAddress)}</div>
      </div>

      <div class="route-point" style="margin-bottom: 10px;">
        <div class="item-label" style="color: #dc2626;">Dropoff Address</div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${escapeHtml(payload.dropoffAddress)}</div>
      </div>

      <div style="border-top: 1px dashed #cbd5e1; margin-top: 12px; padding-top: 10px; font-size: 13px;">
        <span style="color: #64748b;">Requested Pickup:</span>
        <strong style="color: #0f172a; margin-left: 6px;">${escapeHtml(payload.pickupTime)}</strong>
        ${
          payload.vehicleTier || payload.vehicleDisplayName
            ? `<div style="margin-top: 4px;"><span style="color: #64748b;">Vehicle Class:</span> <strong style="color: #0f172a; margin-left: 6px;">${escapeHtml(formatVehicleTier(payload.vehicleTier || '', undefined, payload.vehicleDisplayName))}</strong></div>`
            : ''
        }
      </div>
    </div>

    <!-- Need assistance box -->
    <div class="dispatch-box">
      <div style="font-size: 14px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">
        Need assistance or want to adjust your schedule?
      </div>
      <div style="font-size: 13px; color: #1e3a8a; line-height: 1.5;">
        Our live dispatchers are standing by 24/7 to help explore alternate pickup times or nearby routing options. Please give us a direct call at 
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #0f172a; text-decoration: underline;">
          ${escapeHtml(companyPhone)}
        </a>.
      </div>
    </div>
    `,
    `Notice regarding your ${scopePrefix.toLowerCase()} request #${payload.tripId}`,
    payload.companySettings
  );

  const text = `
========================================
${companyName} - ${scopePrefix.toUpperCase()} REQUEST UPDATE
========================================
Trip ID: #${payload.tripId}
Status: DECLINED

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Thank you for your booking request with ${companyName}. After reviewing fleet capacity, our dispatch team is unfortunately unable to accommodate this ${scopePrefix.toLowerCase()} request at this time.${isReturnOnly ? '\n(Note: Your outbound ride remains scheduled.)' : ''}

Reason: ${payload.reason}
${payload.customNotes ? `Additional notes: ${payload.customNotes}\n` : ''}

Requested Route:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}

If you would like to explore alternative pickup times or discuss options with a live dispatcher, please call us 24/7 at ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 4. Dispatch Request for Clarification / Information Email
 */
export function renderClarificationRequestEmail(
  payload: BookingClarificationRequestEmailPayload
): RenderedEmail {
  const companyPhone = payload.companySettings?.phone || COMPANY_CONFIG.phone.dispatch;
  const companyName = payload.companySettings?.name || COMPANY_CONFIG.name;
  const rawPhone = companyPhone.replace(/\D/g, '');
  const legLabel =
    payload.legScope === 'return'
      ? 'Return Leg'
      : payload.legScope === 'outbound'
      ? 'Outbound Leg'
      : payload.legScope === 'roundtrip'
      ? 'Round-Trip'
      : 'Ride';

  const subject = `❓ Action Required: Information Needed for ${legLabel} Request #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-amber" style="font-size: 13px; padding: 6px 16px;">
        ❓ Information Needed • Action Required
      </span>
      <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 14px 0 4px 0;">
        Information Needed for Your ${escapeHtml(legLabel)} Request
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px;">
        Booking Reference <strong>#${escapeHtml(payload.tripId)}</strong>
      </p>
    </div>

    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 16px;">
      Dear ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)},
    </p>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
      Our 24/7 dispatch desk is reviewing your ${escapeHtml(legLabel.toLowerCase())} reservation request. Before we can finalize driver assignment, we need a quick clarification regarding your trip details:
    </p>

    <!-- Clarification Note Box -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; color: #92400e; margin-bottom: 4px;">
        Dispatch Inquiry Topic
      </div>
      <div style="font-size: 15px; font-weight: 700; color: #78350f; margin-bottom: ${payload.customMessage ? '8px' : '0'};">
        ${escapeHtml(payload.clarificationTopic)}
      </div>
      ${
        payload.customMessage
          ? `<div style="font-size: 13px; color: #92400e; line-height: 1.5; border-top: 1px dashed #fde68a; padding-top: 8px;">
              "${escapeHtml(payload.customMessage)}"
             </div>`
          : ''
      }
    </div>

    <!-- How to reply / Next steps -->
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <div style="font-size: 13px; font-weight: 700; color: #166534; margin-bottom: 4px;">
        How to Respond
      </div>
      <div style="font-size: 13px; color: #15803d; line-height: 1.5;">
        You can simply <strong>reply directly to this email</strong> with your updated details, or call our 24/7 Dispatch Desk at 
        <a href="tel:${escapeHtml(rawPhone || COMPANY_CONFIG.phone.primaryRaw)}" style="font-weight: 700; color: #14532d; text-decoration: underline;">
          ${escapeHtml(companyPhone)}
        </a>.
      </div>
    </div>

    <!-- Original Route Overview -->
    <div class="card-box">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px;">
        Trip Snapshot
      </div>
      <div class="item-label">Pickup Location</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${escapeHtml(payload.pickupAddress)}</div>
      <div class="item-label">Dropoff Destination</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${escapeHtml(payload.dropoffAddress)}</div>
      <div class="item-label">Scheduled Pickup Timing</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${escapeHtml(payload.pickupTime)}</div>
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
Trip ID: #${payload.tripId}
Scope: ${legLabel}
Status: PENDING PASSENGER CLARIFICATION

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Our dispatch desk is reviewing your ${legLabel.toLowerCase()} booking request #${payload.tripId}. Before we can finalize driver assignment, we need a quick clarification:

INQUIRY: ${payload.clarificationTopic}
${payload.customMessage ? `Details: ${payload.customMessage}\n` : ''}

HOW TO RESPOND:
- Simply reply directly to this email with your updated information, OR
- Call our 24/7 Dispatch Desk at ${companyPhone} (reference Request #${payload.tripId}).

REQUEST DETAILS:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}
========================================
© ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 5. Official Post-Trip Final Tax Receipt Email
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
    payload.cardLast4 ? ` •••• ${payload.cardLast4}` : ''
  }`;
  const statusLabel = payload.paymentStatus
    ? payload.paymentStatus.replace(/_/g, ' ').toUpperCase()
    : 'PAID';

  const subject = `🧾 Your Trip Receipt (#${payload.tripId}) — $${grandTotal.toFixed(2)} | ${companyName}`;

  const stopsHtml =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops
          .map(
            (s, i) => `
        <div class="route-point">
          <div class="item-label" style="color: #475569;">◆ Stop ${i + 1}</div>
          <div class="item-value" style="font-size: 13px;">${escapeHtml(s.address)}</div>
        </div>`
          )
          .join('')
      : '';

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-emerald" style="font-size: 13px; padding: 6px 16px;">
        🧾 Official Trip Receipt • ${escapeHtml(statusLabel)}
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 14px 0 4px 0;">
        Thank You for Riding, ${escapeHtml(payload.passenger.firstName)}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Receipt <strong>#${escapeHtml(payload.tripId)}</strong> • Completed ${escapeHtml(payload.completedAt)}
      </p>
    </div>

    <div class="card-box" style="margin-top: 0; border-left: 4px solid #059669;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 10px;">
            <div class="item-label">Passenger</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(payload.passenger.firstName)} ${escapeHtml(payload.passenger.lastName)}
            </div>
            ${payload.corporateAccountName ? `<div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 2px;">Corp: ${escapeHtml(payload.corporateAccountName)}${payload.poNumber ? ` (PO: ${escapeHtml(payload.poNumber)})` : ''}</div>` : ''}
          </td>
          <td width="50%" align="right" valign="top" style="padding-bottom: 10px;">
            <div class="item-label">Chauffeur &amp; Vehicle</div>
            <div style="font-size: 14px; font-weight: 700; color: #0f172a;">
              ${escapeHtml(payload.driverName || 'Professional Chauffeur')}
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              ${payload.vehicleUnit ? `${escapeHtml(payload.vehicleUnit)} • ` : ''}${escapeHtml(vehicleLabel)}
            </div>
          </td>
        </tr>
      </table>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 8px; padding-top: 10px;">
        <div class="route-point">
          <div class="item-label" style="color: #059669;">● Pickup (${escapeHtml(payload.pickupTime)})</div>
          <div class="item-value" style="font-size: 13px;">${escapeHtml(payload.pickupAddress)}</div>
        </div>
        ${stopsHtml}
        <div class="route-point">
          <div class="item-label" style="color: #0f172a;">■ Dropoff</div>
          <div class="item-value" style="font-size: 13px;">${escapeHtml(payload.dropoffAddress)}</div>
        </div>
        ${
          payload.distanceMiles
            ? `<div style="font-size: 11px; color: #64748b; margin-top: 8px;">Trip Distance: ${payload.distanceMiles.toFixed(1)} mi${payload.durationMinutes ? ` • Duration: ${Math.round(payload.durationMinutes)} min` : ''}</div>`
            : ''
        }
      </div>
    </div>

    <div class="card-box" style="background-color: #f8fafc; border-color: #cbd5e1;">
      ${renderPriceBreakdownHtml(payload.breakdown, payload.tariffProfileName)}
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 10px;">
        <tr>
          <td style="padding: 4px 0; font-size: 13px; color: #475569;">Ride Subtotal</td>
          <td align="right" style="padding: 4px 0; font-size: 13px; font-family: monospace; font-weight: 700; color: #0f172a;">$${payload.subtotalFare.toFixed(2)}</td>
        </tr>
        ${
          tipAmount > 0
            ? `<tr>
                <td style="padding: 4px 0; font-size: 13px; color: #475569;">Chauffeur Gratuity (Tip)</td>
                <td align="right" style="padding: 4px 0; font-size: 13px; font-family: monospace; font-weight: 700; color: #0f172a;">$${tipAmount.toFixed(2)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding: 8px 0 4px 0; font-size: 16px; font-weight: 800; color: #0f172a; border-top: 2px solid #cbd5e1;">Total Charged (${escapeHtml(currency)})</td>
          <td align="right" style="padding: 8px 0 4px 0; font-size: 20px; font-weight: 800; font-family: monospace; color: #1e40af; border-top: 2px solid #cbd5e1;">$${grandTotal.toFixed(2)}</td>
        </tr>
      </table>
      <div style="margin-top: 10px; font-size: 12px; color: #475569; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
        <strong>Payment Method:</strong> ${escapeHtml(paymentDisplay)} &nbsp;•&nbsp; <strong>Status:</strong> ${escapeHtml(statusLabel)}
      </div>
    </div>
    `,
    `Official receipt for your ${companyName} ride #${payload.tripId}: $${grandTotal.toFixed(2)}.`,
    payload.companySettings,
    'blue'
  );

  const stopsText =
    payload.intermediateStops && payload.intermediateStops.length > 0
      ? payload.intermediateStops.map((s, i) => `- Stop ${i + 1}: ${s.address}`).join('\n') + '\n'
      : '';

  const text = `
========================================
${companyName} - OFFICIAL TRIP RECEIPT
========================================
Receipt ID: #${payload.tripId}
Completed: ${payload.completedAt}
Passenger: ${payload.passenger.firstName} ${payload.passenger.lastName}
Chauffeur: ${payload.driverName || 'Professional Chauffeur'}${payload.vehicleUnit ? ` (${payload.vehicleUnit})` : ''}
Vehicle: ${vehicleLabel}

ROUTE:
- Pickup (${payload.pickupTime}): ${payload.pickupAddress}
${stopsText}- Dropoff: ${payload.dropoffAddress}
${renderPriceBreakdownText(payload.breakdown)}

TOTALS:
- Ride Subtotal: $${payload.subtotalFare.toFixed(2)}
${tipAmount > 0 ? `- Gratuity (Tip): $${tipAmount.toFixed(2)}\n` : ''}- Grand Total: $${grandTotal.toFixed(2)} ${currency}
- Payment Method: ${paymentDisplay} (${statusLabel})

Questions regarding this receipt? Call 24/7 Dispatch at ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

/**
 * 6. Corporate B2B Invoice Statement Email
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
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 6px; font-size: 12px; color: #475569; font-family: monospace; white-space: nowrap;">${escapeHtml(item.date || payload.issuedDate)}</td>
        <td style="padding: 8px 6px; font-size: 12px; color: #0f172a;">
          <div style="font-weight: 600;">${escapeHtml(item.description)}</div>
          ${item.passengerName || item.poNumber ? `<div style="font-size: 11px; color: #64748b;">${item.passengerName ? `Pax: ${escapeHtml(item.passengerName)}` : ''}${item.passengerName && item.poNumber ? ' • ' : ''}${item.poNumber ? `PO: ${escapeHtml(item.poNumber)}` : ''}</div>` : ''}
        </td>
        <td align="right" style="padding: 8px 6px; font-size: 12px; font-family: monospace; font-weight: 700; color: #0f172a; white-space: nowrap;">$${item.amount.toFixed(2)}</td>
      </tr>`
    )
    .join('');

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-blue" style="font-size: 13px; padding: 6px 16px;">
        Corporate Statement • ${escapeHtml(payload.invoiceNumber)}
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 14px 0 4px 0;">
        Invoice for ${escapeHtml(payload.customerName)}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Issued: <strong>${escapeHtml(payload.issuedDate)}</strong> • Due Date: <strong>${escapeHtml(payload.dueDate)}</strong>${payload.billingCycle ? ` (${escapeHtml(payload.billingCycle.toUpperCase())})` : ''}
      </p>
    </div>

    <div class="card-box" style="margin-top: 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <thead>
          <tr style="border-bottom: 2px solid #cbd5e1;">
            <th align="left" style="padding: 6px; font-size: 10px; text-transform: uppercase; color: #64748b;">Date</th>
            <th align="left" style="padding: 6px; font-size: 10px; text-transform: uppercase; color: #64748b;">Service / Trip Details</th>
            <th align="right" style="padding: 6px; font-size: 10px; text-transform: uppercase; color: #64748b;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top: 12px;">
        <tr>
          <td style="padding: 4px 6px; font-size: 13px; color: #475569;">Subtotal</td>
          <td align="right" style="padding: 4px 6px; font-size: 13px; font-family: monospace; font-weight: 700; color: #0f172a;">$${payload.subtotal.toFixed(2)}</td>
        </tr>
        ${
          discountAmt > 0
            ? `<tr>
                <td style="padding: 4px 6px; font-size: 13px; color: #047857;">Contract Discount</td>
                <td align="right" style="padding: 4px 6px; font-size: 13px; font-family: monospace; font-weight: 700; color: #047857;">-$${discountAmt.toFixed(2)}</td>
              </tr>`
            : ''
        }
        <tr>
          <td style="padding: 8px 6px 4px 6px; font-size: 16px; font-weight: 800; color: #0f172a; border-top: 2px solid #cbd5e1;">Total Balance Due</td>
          <td align="right" style="padding: 8px 6px 4px 6px; font-size: 20px; font-weight: 800; font-family: monospace; color: #1e40af; border-top: 2px solid #cbd5e1;">$${payload.totalAmount.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    ${
      payload.notes
        ? `<div class="card-box"><div class="item-label">Statement Notes</div><div style="font-size: 13px; color: #334155; margin-top: 4px;">${escapeHtml(payload.notes)}</div></div>`
        : ''
    }

    <div class="dispatch-box">
      <div style="font-weight: 700; color: #1e40af; font-size: 13px; margin-bottom: 4px;">
        Remittance &amp; Billing Inquiries
      </div>
      <div style="font-size: 12px; color: #1e3a8a; line-height: 1.5;">
        Please reference Invoice <strong>${escapeHtml(payload.invoiceNumber)}</strong> on all remittances.<br>
        Payable to: <strong>${escapeHtml(companyName)}</strong>, ${escapeHtml(companyAddress)}<br>
        Billing Desk: <a href="mailto:${escapeHtml(companyEmail)}" style="color: #1d4ed8; font-weight: 700;">${escapeHtml(companyEmail)}</a> • ${escapeHtml(companyPhone)}
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
        `- ${i.date || payload.issuedDate} | ${i.description}${i.poNumber ? ` [PO: ${i.poNumber}]` : ''}: $${i.amount.toFixed(2)}`
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

${payload.notes ? `Notes: ${payload.notes}\n` : ''}
REMITTANCE:
Please reference ${payload.invoiceNumber} payable to ${companyName}, ${companyAddress}.
Questions? Email ${companyEmail} or call ${companyPhone}.
========================================
© ${new Date().getFullYear()} ${companyName}
  `.trim();

  return { subject, html, text };
}

