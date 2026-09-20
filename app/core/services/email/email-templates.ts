/**
 * Transactional HTML Email Templates
 * 
 * Provides responsive, mobile-optimized HTML and plain-text email templates
 * with inline CSS for universal email client compatibility.
 */

import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type {
  BookingConfirmationEmailPayload,
  AdminDispatchAlertEmailPayload,
  StatusUpdateEmailPayload,
  BookingDeclinedEmailPayload,
} from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Common HTML email shell wrapping branded header, container, and footer.
 */
export function formatVehicleTier(tier: string): string {
  if (!tier) return 'Standard Sedan';
  const clean = tier.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'any' || clean.startsWith('any')) return 'Any Vehicle (Best Available)';
  if (clean === 'standard' || clean === 'sedan') return 'Executive Sedan';
  if (clean === 'xl' || clean === 'suv' || clean === 'large suv') return 'Full-Size SUV (XL)';
  if (clean === 'compact suv') return 'Compact SUV';
  if (clean === 'wheelchair' || clean === 'van' || clean === 'wav') return 'Accessible Van / WAV';
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
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
  <title>${companyName}</title>
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
  ${previewText ? `<div style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>` : ''}
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center">
        <div class="email-container">
          <!-- Header Banner -->
          <div class="header-banner">
            <h1 class="header-title">${companyName}</h1>
            <p class="header-tagline">${COMPANY_CONFIG.tagline}</p>
          </div>
          <!-- Body Content -->
          <div class="content-body">
            ${contentHtml}
          </div>
          <!-- Footer -->
          <div class="footer-section">
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
              24/7 Dispatch Desk: <a href="tel:${rawPhone || COMPANY_CONFIG.phone.primaryRaw}" style="color: #2563eb; text-decoration: none; font-weight: 700;">${companyPhone}</a>
            </p>
            <p style="margin: 0 0 8px 0;">
              ${COMPANY_CONFIG.operatingHours} • ${companyAddress}
            </p>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              &copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.
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
  if (!method) return 'Standard Fleet Billing';
  switch (method.toLowerCase()) {
    case 'card':
      return 'Credit / Debit Card';
    case 'cash':
      return 'Pay in Vehicle (Cash / Card)';
    case 'corporate':
    case 'account':
      return 'Corporate Billing Account';
    default:
      return method.toUpperCase();
  }
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

  const subject = `⏳ Booking Request Received: #${payload.tripId} | ${companyName}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-amber" style="font-size: 13px; padding: 6px 16px;">
        ⏳ Booking Request Received • Under Dispatch Review
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 16px 0 6px 0;">
        We've Received Your Ride Request, ${payload.passenger.firstName}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
        Your reservation request <strong>#${payload.tripId}</strong> has entered our 24/7 dispatch queue. Our operations team is reviewing driver availability and schedule timing.
      </p>
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

    <!-- Trip Schedule & Vehicle Class -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #d97706;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Requested Timing</div>
            <div class="item-value">
              ${payload.pickupTime}
              <div style="font-size: 12px; color: #d97706; font-weight: 600; margin-top: 2px;">
                ${isScheduled ? 'Scheduled Reservation' : 'Immediate Dispatch (ASAP)'}
              </div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Preference</div>
            <div class="item-value">
              ${formatVehicleTier(payload.vehicleTier)}
              <div style="font-size: 12px; color: #64748b; font-weight: normal; margin-top: 2px;">
                ${payload.passengerCount || 1} Passengers • ${payload.luggageCount || 0} Luggage
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${payload.oversizedItemsSummary ? `
    <!-- Oversized Luggage & Cargo Notice -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 8px; padding: 14px 16px; margin: 14px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase;">
        🧳 Declared Oversized Cargo & Equipment
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #78350f; margin-top: 3px;">
        ${payload.oversizedItemsSummary}
      </div>
      <div style="font-size: 11px; color: #b45309; margin-top: 3px;">
        Vehicle assignment has been flagged for oversized equipment capacity.
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
        ${lambertInstructions}
      </div>
    </div>
    ` : ''}

    <!-- Route Overview -->
    <div class="card-box">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Requested Itinerary
      </div>

      <div class="route-point">
        <div class="item-label" style="color: #d97706;">● Pickup Location</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${payload.pickupAddress}
        </div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${payload.pickupNotes}</div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">◆ Intermediate Stop</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">${s.address}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${s.notes}</div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Dropoff Destination</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${payload.dropoffAddress}
        </div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${payload.dropoffNotes}</div>` : ''}
      </div>
    </div>

    ${hasFlight ? `
    <!-- Airport Flight Details -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #334155; margin-bottom: 8px;">
        ✈ Flight Details
      </div>
      <div style="font-size: 13px; color: #0f172a;">
        ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || 'Airline'} ${payload.flightDetails?.flightNumber ? `Flight #${payload.flightDetails.flightNumber}` : ''}
        ${payload.flightDetails?.departureAirport ? ` (${payload.flightDetails.departureAirport.toUpperCase()})` : ''}
      </div>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Special Requests -->
    <div class="card-box">
      <div class="item-label">Passenger Notes / Special Requests</div>
      <div style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5;">
        ${payload.specialRequests}
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
              ${formatPaymentMethod(payload.paymentMethod)}
            </div>
          </td>
          <td align="right" valign="middle">
            <div class="item-label">Estimated Fare</div>
            <div class="fare-total" style="color: #0f172a;">
              $${payload.totalFare.toFixed(2)} <span style="font-size: 13px; color: #64748b; font-weight: 600;">${payload.currency}</span>
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Dispatch Assistance Callout -->
    <div class="dispatch-box" style="border-left-color: #d97706; background-color: #fffbeb; border-color: #fde68a;">
      <div style="font-weight: 700; color: #92400e; font-size: 13px; margin-bottom: 4px;">
        Need immediate dispatch assistance or urgent changes?
      </div>
      <div style="font-size: 13px; color: #78350f; line-height: 1.5;">
        Call 24/7 Dispatch directly at 
        <a href="tel:${rawPhone || COMPANY_CONFIG.phone.primaryRaw}" style="font-weight: 700; color: #b45309; text-decoration: underline;">
          ${companyPhone}
        </a>. Reference Request <strong>#${payload.tripId}</strong>.
      </div>
    </div>
    `,
    `We have received your ride request #${payload.tripId} for ${payload.pickupTime}. Our dispatch team is reviewing your details.`,
    payload.companySettings,
    'amber'
  );

  const text = `
========================================
${companyName} - BOOKING REQUEST RECEIVED
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

We have received your ride request #${payload.tripId}.
Our 24/7 dispatch operations team is reviewing route timing and vehicle availability. You will receive an official confirmation shortly.

REQUEST DETAILS:
- Request ID: #${payload.tripId}
- Status: Under Dispatch Review
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle Preference: ${formatVehicleTier(payload.vehicleTier)}
- Passengers: ${payload.passengerCount || 1} | Bags: ${payload.luggageCount || 0}
${payload.oversizedItemsSummary ? `- Oversized Cargo: ${payload.oversizedItemsSummary}\n` : ''}
- Pickup: ${payload.pickupAddress} ${payload.pickupNotes ? `(Note: ${payload.pickupNotes})` : ''}
- Dropoff: ${payload.dropoffAddress} ${payload.dropoffNotes ? `(Note: ${payload.dropoffNotes})` : ''}
${isLambert ? `- Lambert Pickup Instructions: ${lambertInstructions}\n` : ''}
${hasFlight ? `- Flight: ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || ''} ${payload.flightDetails?.flightNumber || ''}\n` : ''}
${payload.specialRequests ? `- Special Requests: ${payload.specialRequests}\n` : ''}

PAYMENT & FARE:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- Estimated Fare: $${payload.totalFare.toFixed(2)} ${payload.currency}

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

  const subject = `✓ Booking Confirmed: #${payload.tripId} | ${companyName}`;

  const registerUrl = `https://chesterfieldtaxi.com/register?email=${encodeURIComponent(
    payload.passenger.email
  )}&name=${encodeURIComponent(
    payload.passenger.firstName + ' ' + payload.passenger.lastName
  )}&phone=${encodeURIComponent(payload.passenger.phone || '')}`;

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-emerald" style="font-size: 13px; padding: 6px 16px;">
        ✓ Reservation Confirmed &amp; Dispatched
      </span>
      <h2 style="font-size: 22px; font-weight: 800; color: #0f172a; margin: 16px 0 6px 0;">
        Your Ride is Confirmed, ${payload.passenger.firstName}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">
        Your reservation <strong>#${payload.tripId}</strong> has been locked in our 24/7 dispatch schedule. A professional chauffeur will arrive at your requested pickup location.
      </p>
    </div>

    <!-- Trip Schedule & Vehicle Class -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #2563eb;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Pickup Timing</div>
            <div class="item-value">
              ${payload.pickupTime}
              <div style="font-size: 12px; color: #2563eb; font-weight: 600; margin-top: 2px;">
                ${isScheduled ? 'Scheduled Reservation' : 'Immediate Dispatch (ASAP)'}
              </div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Tier</div>
            <div class="item-value">
              ${formatVehicleTier(payload.vehicleTier)}
              <div style="font-size: 12px; color: #64748b; font-weight: normal; margin-top: 2px;">
                ${payload.passengerCount || 1} Passengers • ${payload.luggageCount || 0} Luggage
              </div>
            </div>
          </td>
        </tr>
      </table>
    </div>

    ${isLambert ? `
    <!-- Lambert Airport Curbside Pickup Instructions Box -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 16px; margin: 16px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 4px;">
        ✈ STL Lambert Curbside Pickup Instructions
      </div>
      <div style="font-size: 12px; color: #1e3a8a; line-height: 1.5;">
        ${lambertInstructions}
      </div>
    </div>
    ` : ''}

    ${payload.oversizedItemsSummary ? `
    <!-- Oversized Luggage & Cargo Details -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 14px 16px; margin: 14px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #1e40af; text-transform: uppercase;">
        🧳 Confirmed Oversized Cargo & Equipment
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #1e3a8a; margin-top: 3px;">
        ${payload.oversizedItemsSummary}
      </div>
    </div>
    ` : ''}

    <!-- Route Overview -->
    <div class="card-box">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Confirmed Itinerary
      </div>

      <div class="route-point">
        <div class="item-label" style="color: #2563eb;">● Pickup Location</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${payload.pickupAddress}
        </div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${payload.pickupNotes}</div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">◆ Intermediate Stop</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">${s.address}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${s.notes}</div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 16px; margin-left: 4px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">■ Dropoff Destination</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${payload.dropoffAddress}
        </div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${payload.dropoffNotes}</div>` : ''}
      </div>
    </div>

    ${hasFlight ? `
    <!-- Airport Flight Operations Box -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 10px;">
        ✈ Airport Flight Operations (Real-Time Delay Tracking)
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 8px;">
            <div class="item-label">Airline & Flight</div>
            <div class="item-value" style="font-size: 14px;">
              ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || 'Commercial Carrier'}
              ${payload.flightDetails?.flightNumber ? ` #${payload.flightDetails.flightNumber}` : ''}
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 8px;">
            <div class="item-label">Origin / Terminal</div>
            <div class="item-value" style="font-size: 14px;">
              ${payload.flightDetails?.departureAirport ? payload.flightDetails.departureAirport.toUpperCase() : 'Lambert Airport'}
            </div>
          </td>
        </tr>
      </table>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Driver Notes -->
    <div class="card-box">
      <div class="item-label">Driver Dispatch Remarks</div>
      <div style="font-size: 13px; color: #334155; margin-top: 4px; line-height: 1.5;">
        ${payload.specialRequests}
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
              ${formatPaymentMethod(payload.paymentMethod)}
            </div>
          </td>
          <td align="right" valign="middle">
            <div class="item-label">Total Quoted Fare</div>
            <div class="fare-total">
              $${payload.totalFare.toFixed(2)} <span style="font-size: 13px; color: #64748b; font-weight: 600;">${payload.currency}</span>
            </div>
          </td>
        </tr>
      </table>
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
      <a href="${registerUrl}" 
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
        <a href="tel:${rawPhone || COMPANY_CONFIG.phone.primaryRaw}" style="font-weight: 700; color: #1d4ed8; text-decoration: underline;">
          ${companyPhone}
        </a>. Reference trip ID <strong>#${payload.tripId}</strong>.
      </div>
    </div>
    `,
    `Your ${companyName} reservation #${payload.tripId} is confirmed for ${payload.pickupTime}. Total: $${payload.totalFare.toFixed(2)}.`,
    payload.companySettings,
    'blue'
  );

  const text = `
========================================
${companyName} - RESERVATION CONFIRMED
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Your reservation #${payload.tripId} has been confirmed with our 24/7 dispatch operations.

TRIP DETAILS:
- Trip ID: #${payload.tripId}
- Status: Confirmed
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle Class: ${formatVehicleTier(payload.vehicleTier)}
- Passengers: ${payload.passengerCount || 1} | Bags: ${payload.luggageCount || 0}
${payload.oversizedItemsSummary ? `- Oversized Cargo: ${payload.oversizedItemsSummary}\n` : ''}
- Pickup: ${payload.pickupAddress} ${payload.pickupNotes ? `(Note: ${payload.pickupNotes})` : ''}
- Dropoff: ${payload.dropoffAddress} ${payload.dropoffNotes ? `(Note: ${payload.dropoffNotes})` : ''}
${isLambert ? `- Lambert Pickup Instructions: ${lambertInstructions}\n` : ''}
${hasFlight ? `- Flight: ${payload.flightDetails?.airlineName || payload.flightDetails?.airlineCode || ''} ${payload.flightDetails?.flightNumber || ''}\n` : ''}
${payload.specialRequests ? `- Driver Notes: ${payload.specialRequests}\n` : ''}

PAYMENT & TOTAL:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- Quoted Total: $${payload.totalFare.toFixed(2)} ${payload.currency}

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
        New Booking #${payload.tripId}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 13px;">
        Submitted via Web Portal • Dispatch Action Required
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
            <div style="font-size: 16px; font-weight: 700; color: #0f172a;">${payload.passengerName}</div>
            <div style="font-size: 13px; color: #475569; margin-top: 2px;">
              <a href="tel:${payload.passengerPhone}" style="color: #0f172a; font-weight: 600; text-decoration: none;">📞 ${payload.passengerPhone}</a>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
              ✉ ${payload.passengerEmail}
            </div>
          </td>
          <td width="50%" align="right" valign="top">
            <div class="item-label">Capacity</div>
            <div style="font-size: 14px; font-weight: 600; color: #0f172a;">
              ${payload.passengerCount || 1} Pax • ${payload.luggageCount || 0} Luggage
            </div>
            <div style="font-size: 12px; color: #d97706; font-weight: 700; text-transform: uppercase; margin-top: 4px;">
              Tier: ${formatVehicleTier(payload.vehicleTier)}
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
        ${payload.oversizedItemsSummary}
      </div>
    </div>
    ` : ''}

    <!-- Routing Details -->
    <div class="card-box" style="border-left: 4px solid #d97706;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px;">
        Pickup & Dropoff Route
      </div>
      
      <div class="route-point">
        <div class="item-label" style="color: #d97706;">Pickup Location (${payload.pickupTime})</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${payload.pickupAddress}</div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Pickup Note: <strong>${payload.pickupNotes}</strong></div>` : ''}
      </div>

      ${payload.intermediateStops && payload.intermediateStops.length > 0 ? payload.intermediateStops.map(s => `
      <div style="border-left: 2px dashed #cbd5e1; height: 14px; margin-left: 4px; margin-top: 6px; margin-bottom: 6px;"></div>
      <div class="route-point">
        <div class="item-label" style="color: #475569;">Intermediate Stop</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${s.address}</div>
        ${s.notes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Stop Note: <strong>${s.notes}</strong></div>` : ''}
      </div>`).join('') : ''}

      <div style="border-left: 2px dashed #cbd5e1; height: 14px; margin-left: 4px; margin-top: 6px; margin-bottom: 6px;"></div>

      <div class="route-point">
        <div class="item-label" style="color: #0f172a;">Dropoff Destination</div>
        <div style="font-size: 15px; font-weight: 700; color: #0f172a;">${payload.dropoffAddress}</div>
        ${payload.dropoffNotes ? `<div style="font-size: 12px; color: #475569; margin-top: 3px; background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">Dropoff Note: <strong>${payload.dropoffNotes}</strong></div>` : ''}
      </div>
    </div>

    ${payload.flightDetails?.airlineCode || payload.flightDetails?.flightNumber ? `
    <!-- Airport & Flight Operations -->
    <div style="background-color: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 14px; margin: 16px 0;">
      <div style="font-weight: 700; color: #854d0e; font-size: 13px; margin-bottom: 6px;">
        ✈ Airport Flight Tracking Data
      </div>
      <div style="font-size: 13px; color: #713f12; line-height: 1.6;">
        <strong>Airline:</strong> ${payload.flightDetails.airlineName || payload.flightDetails.airlineCode || 'N/A'}<br>
        <strong>Flight #:</strong> ${payload.flightDetails.flightNumber || 'N/A'}<br>
        <strong>Origin Airport:</strong> ${payload.flightDetails.departureAirport || 'N/A'}<br>
        <strong>Checked Baggage:</strong> ${payload.flightDetails.hasCheckedLuggage ? 'YES' : 'NO'}
      </div>
    </div>
    ` : ''}

    ${payload.specialRequests ? `
    <!-- Special Driver Instructions -->
    <div class="card-box" style="border-left: 4px solid #ef4444; background: #fef2f2;">
      <div class="item-label" style="color: #991b1b;">Special Passenger / Driver Instructions</div>
      <div style="font-size: 13px; color: #7f1d1d; font-weight: 600; margin-top: 4px; line-height: 1.5;">
        "${payload.specialRequests}"
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
              ${payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard'}
            </div>
          </td>
          <td align="right">
            <div class="item-label">Quoted Revenue</div>
            <div class="fare-total" style="color: #059669;">
              $${payload.totalFare.toFixed(2)} ${payload.currency}
            </div>
          </td>
        </tr>
      </table>
    </div>
    `,
    `[ALERT] New Ride #${payload.tripId} (${payload.bookingType.toUpperCase()}) for ${payload.passengerName}. Pickup: ${payload.pickupAddress}`,
    payload.companySettings
  );

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
- Vehicle Tier: ${formatVehicleTier(payload.vehicleTier)}

ROUTING:
- Pickup: ${payload.pickupAddress} ${payload.pickupNotes ? `[Note: ${payload.pickupNotes}]` : ''}
- Dropoff: ${payload.dropoffAddress} ${payload.dropoffNotes ? `[Note: ${payload.dropoffNotes}]` : ''}
${payload.flightDetails?.airlineCode ? `- Flight: ${payload.flightDetails.airlineCode} #${payload.flightDetails.flightNumber} from ${payload.flightDetails.departureAirport}\n` : ''}
${payload.specialRequests ? `- Special Notes: ${payload.specialRequests}\n` : ''}

REVENUE:
- Quoted Fare: $${payload.totalFare.toFixed(2)} ${payload.currency}
- Payment: ${payload.paymentMethod ? formatPaymentMethod(payload.paymentMethod) : 'Standard'}
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
  const statusTitles: Record<string, string> = {
    pending: 'Booking Received & Pending Dispatch',
    offered: 'Broadcasting Ride to Drivers',
    assigned: 'Driver Assigned to Your Ride',
    completed: 'Ride Completed - Thank You!',
    cancelled: 'Ride Booking Cancelled',
  };

  const statusHeadline = statusTitles[payload.newStatus] || `Trip Status Update: ${payload.newStatus.toUpperCase()}`;
  const subject = `Ride Update #${payload.tripId}: ${statusHeadline} | ${COMPANY_CONFIG.name}`;

  const isAssigned = payload.newStatus === 'assigned';
  const isCancelled = payload.newStatus === 'cancelled';
  const isCompleted = payload.newStatus === 'completed';

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge ${isCancelled ? 'badge-amber' : isCompleted ? 'badge-emerald' : 'badge-blue'}" style="font-size: 13px; padding: 6px 14px;">
        Status: ${payload.newStatus.toUpperCase()}
      </span>
      <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 12px 0 4px 0;">
        ${statusHeadline}
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px;">
        Trip Reference <strong>#${payload.tripId}</strong>
      </p>
    </div>

    <!-- Status message explanation -->
    <div class="card-box" style="margin-top: 0; border-left: 4px solid #0f172a;">
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">
        ${isAssigned ? `
          Great news! A professional driver has accepted your ride and is scheduled to service your pickup.
        ` : isCompleted ? `
          Thank you for traveling with ${COMPANY_CONFIG.name}! Your ride has been marked complete by your driver.
        ` : isCancelled ? `
          Your ride reservation has been cancelled. If you believe this was in error, please contact our dispatch team immediately.
        ` : `
          Your reservation is currently being coordinated by our central dispatch desk.
        `}
        ${payload.statusReason ? `<div style="margin-top: 8px; font-style: italic; color: #64748b;">Note: "${payload.statusReason}"</div>` : ''}
      </div>
    </div>

    ${isAssigned && payload.driverInfo ? `
    <!-- Driver Info Box -->
    <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-weight: 700; color: #1e40af; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">
        Assigned Driver Information
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td>
            <div style="font-size: 15px; font-weight: 700; color: #0f172a;">
              ${payload.driverInfo.name || 'Professional Driver'}
            </div>
            ${payload.driverInfo.phone ? `
              <div style="font-size: 13px; color: #1e40af; margin-top: 2px;">
                📞 <a href="tel:${payload.driverInfo.phone}" style="color: #1e40af; font-weight: 600; text-decoration: none;">${payload.driverInfo.phone}</a>
              </div>
            ` : ''}
          </td>
          ${payload.driverInfo.vehicleModel ? `
          <td align="right">
            <div class="item-label">Vehicle / Plate</div>
            <div style="font-size: 13px; font-weight: 600; color: #0f172a;">
              ${payload.driverInfo.vehicleModel}
            </div>
            ${payload.driverInfo.licensePlate ? `
              <div style="font-size: 12px; color: #64748b; font-weight: 700;">Plate: ${payload.driverInfo.licensePlate}</div>
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
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${payload.pickupAddress}</div>
      
      <div class="item-label">Dropoff Destination</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 10px;">${payload.dropoffAddress}</div>

      <div class="item-label">Pickup Timing</div>
      <div style="font-size: 14px; font-weight: 600; color: #0f172a;">${payload.pickupTime}</div>
    </div>

    <!-- Contact Support -->
    <div class="dispatch-box">
      <div style="font-size: 13px; color: #713f12; line-height: 1.5;">
        Questions about this update? Call 24/7 Dispatch at 
        <a href="tel:${COMPANY_CONFIG.phone.primaryRaw}" style="font-weight: 700; color: #0f172a; text-decoration: underline;">
          ${COMPANY_CONFIG.phone.dispatch}
        </a>.
      </div>
    </div>
    `,
    `Ride update for #${payload.tripId}: Status changed to ${payload.newStatus.toUpperCase()}.`
  );

  const text = `
========================================
${COMPANY_CONFIG.name} - RIDE STATUS UPDATE
========================================
Trip ID: #${payload.tripId}
New Status: ${payload.newStatus.toUpperCase()}

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

${statusHeadline}
${payload.statusReason ? `Reason: ${payload.statusReason}\n` : ''}
${isAssigned && payload.driverInfo ? `Driver: ${payload.driverInfo.name || 'Assigned'} | Phone: ${payload.driverInfo.phone || 'N/A'}\n` : ''}
Route:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}

Need help? Call 24/7 Dispatch at ${COMPANY_CONFIG.phone.dispatch}.
========================================
© ${new Date().getFullYear()} ${COMPANY_CONFIG.legalName}
  `.trim();

  return { subject, html, text };
}

/**
 * Renders the Booking Declined notification email.
 */
export function renderBookingDeclinedEmail(
  payload: BookingDeclinedEmailPayload
): RenderedEmail {
  const subject = `Booking Update: Ride #${payload.tripId} - ${COMPANY_CONFIG.name}`;

  const html = renderEmailShell(
    `
    <div style="margin-bottom: 24px; text-align: center;">
      <div style="display: inline-block; width: 48px; height: 48px; border-radius: 24px; background-color: #fef2f2; border: 1px solid #fecaca; line-height: 48px; font-size: 24px;">
        ⚠️
      </div>
      <h2 style="font-size: 20px; font-weight: 700; color: #991b1b; margin: 12px 0 4px 0;">Ride Request Status Update</h2>
      <p style="font-size: 14px; color: #64748b; margin: 0;">Trip ID #${payload.tripId}</p>
    </div>

    <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-bottom: 16px;">
      Dear ${payload.passenger.firstName} ${payload.passenger.lastName},
    </p>

    <p style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 20px;">
      Thank you for your booking request with ${COMPANY_CONFIG.name}. After reviewing current fleet availability and service schedules, our dispatch team is unfortunately unable to accommodate this specific ride request at this time.
    </p>

    <!-- Reason Box -->
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; color: #991b1b; margin-bottom: 4px;">
        Reason Provided by Dispatch
      </div>
      <div style="font-size: 15px; font-weight: 600; color: #7f1d1d; margin-bottom: ${payload.customNotes ? '8px' : '0'};">
        ${payload.reason}
      </div>
      ${
        payload.customNotes
          ? `<div style="font-size: 13px; color: #991b1b; font-style: italic; border-top: 1px dashed #fecaca; padding-top: 8px;">
              "${payload.customNotes}"
             </div>`
          : ''
      }
    </div>

    <!-- Requested Itinerary -->
    <div class="summary-card">
      <div class="summary-title">Original Ride Request Details</div>

      <div class="route-point">
        <div class="route-dot pickup-dot"></div>
        <div class="route-address">
          <div class="route-label">Pickup Address</div>
          <div class="route-value">${payload.pickupAddress}</div>
        </div>
      </div>

      <div class="route-point">
        <div class="route-dot dropoff-dot"></div>
        <div class="route-address">
          <div class="route-label">Dropoff Address</div>
          <div class="route-value">${payload.dropoffAddress}</div>
        </div>
      </div>

      <div style="border-top: 1px dashed #cbd5e1; margin-top: 12px; padding-top: 12px; display: flex; justify-content: space-between; font-size: 13px;">
        <span style="color: #64748b;">Requested Pickup:</span>
        <span style="font-weight: 600; color: #0f172a;">${payload.pickupTime}</span>
      </div>
    </div>

    <!-- Need assistance box -->
    <div class="dispatch-box">
      <div style="font-size: 14px; font-weight: 700; color: #713f12; margin-bottom: 4px;">
        Need assistance or want to adjust your schedule?
      </div>
      <div style="font-size: 13px; color: #713f12; line-height: 1.5;">
        Our live dispatchers are standing by 24/7 to help explore alternate pickup times or nearby routing options. Please give us a direct call at 
        <a href="tel:${COMPANY_CONFIG.phone.primaryRaw}" style="font-weight: 700; color: #0f172a; text-decoration: underline;">
          ${COMPANY_CONFIG.phone.dispatch}
        </a>.
      </div>
    </div>
    `,
    `Notice regarding your ride request #${payload.tripId}`
  );

  const text = `
========================================
${COMPANY_CONFIG.name} - RIDE REQUEST UPDATE
========================================
Trip ID: #${payload.tripId}
Status: DECLINED

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Thank you for your booking request with ${COMPANY_CONFIG.name}. After reviewing fleet capacity, our dispatch team is unfortunately unable to accommodate this request at this time.

Reason: ${payload.reason}
${payload.customNotes ? `Additional notes: ${payload.customNotes}\n` : ''}

Requested Route:
- Pickup: ${payload.pickupAddress} at ${payload.pickupTime}
- Dropoff: ${payload.dropoffAddress}

If you would like to explore alternative pickup times or discuss options with a live dispatcher, please call us 24/7 at ${COMPANY_CONFIG.phone.dispatch}.
========================================
© ${new Date().getFullYear()} ${COMPANY_CONFIG.legalName}
  `.trim();

  return { subject, html, text };
}

