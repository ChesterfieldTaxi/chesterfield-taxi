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
} from './types';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Common HTML email shell wrapping branded header, container, and footer.
 */
function renderEmailShell(contentHtml: string, previewText: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${COMPANY_CONFIG.name}</title>
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
    .email-wrapper { width: 100%; background-color: #f1f5f9; padding: 24px 0; }
    .email-container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); }
    .header-banner { background: #0f172a; padding: 28px 24px; text-align: center; }
    .header-title { color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; margin: 0; }
    .header-tagline { color: #f59e0b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; margin: 4px 0 0 0; }
    .content-body { padding: 28px 24px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; }
    .badge-amber { background-color: #fef3c7; color: #92400e; }
    .badge-emerald { background-color: #d1fae5; color: #065f46; }
    .badge-blue { background-color: #dbeafe; color: #1e40af; }
    .card-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .item-label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    .item-value { font-size: 15px; color: #0f172a; font-weight: 600; }
    .route-point { margin-bottom: 12px; }
    .route-point:last-child { margin-bottom: 0; }
    .fare-total { font-size: 22px; font-weight: 800; color: #0f172a; }
    .dispatch-box { background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .footer-section { background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6; }
    .footer-link { color: #475569; text-decoration: underline; }
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
            <h1 class="header-title">${COMPANY_CONFIG.name}</h1>
            <p class="header-tagline">${COMPANY_CONFIG.tagline}</p>
          </div>
          <!-- Body Content -->
          <div class="content-body">
            ${contentHtml}
          </div>
          <!-- Footer -->
          <div class="footer-section">
            <p style="margin: 0 0 6px 0; font-weight: 600; color: #334155;">
              24/7 Dispatch Desk: <a href="tel:${COMPANY_CONFIG.phone.primaryRaw}" style="color: #0f172a; text-decoration: none; font-weight: 700;">${COMPANY_CONFIG.phone.dispatch}</a>
            </p>
            <p style="margin: 0 0 8px 0;">
              ${COMPANY_CONFIG.operatingHours} • ${COMPANY_CONFIG.address.formatted}
            </p>
            <p style="margin: 0; font-size: 11px; color: #94a3b8;">
              &copy; ${new Date().getFullYear()} ${COMPANY_CONFIG.legalName}. All rights reserved.
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
function formatPaymentMethod(method: string): string {
  switch (method) {
    case 'card':
      return 'Credit / Debit Card';
    case 'cash':
      return 'Pay in Vehicle (Cash / Card)';
    case 'corporate':
      return 'Corporate Billing Account';
    default:
      return method.toUpperCase();
  }
}

/**
 * 1. Passenger Confirmation Receipt
 */
export function renderPassengerConfirmationEmail(
  payload: BookingConfirmationEmailPayload
): RenderedEmail {
  const subject = `Booking Confirmation - Trip #${payload.tripId} | ${COMPANY_CONFIG.name}`;
  const isScheduled = payload.bookingType === 'scheduled';
  const hasFlight = Boolean(
    payload.flightDetails?.airlineCode ||
    payload.flightDetails?.flightNumber ||
    payload.flightDetails?.isAirportTrip
  );

  const html = renderEmailShell(
    `
    <div style="text-align: center; margin-bottom: 24px;">
      <span class="badge badge-emerald" style="font-size: 13px; padding: 6px 14px;">
        ✓ Reservation Confirmed
      </span>
      <h2 style="font-size: 20px; font-weight: 800; color: #0f172a; margin: 14px 0 4px 0;">
        Thank You, ${payload.passenger.firstName}!
      </h2>
      <p style="margin: 0; color: #64748b; font-size: 14px;">
        Your ride reservation <strong>#${payload.tripId}</strong> has entered our 24/7 dispatch queue.
      </p>
    </div>

    <!-- Trip Schedule & Vehicle Class -->
    <div class="card-box" style="margin-top: 0;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Pickup Timing</div>
            <div class="item-value">
              ${payload.pickupTime}
              <div style="font-size: 12px; color: #d97706; font-weight: 600; margin-top: 2px;">
                ${isScheduled ? 'Scheduled Reservation' : 'Immediate Dispatch (ASAP)'}
              </div>
            </div>
          </td>
          <td width="50%" valign="top" style="padding-bottom: 12px;">
            <div class="item-label">Vehicle Tier</div>
            <div class="item-value" style="text-transform: capitalize;">
              ${payload.vehicleTier} Class
              ${payload.passengerCount ? `<div style="font-size: 12px; color: #64748b; font-weight: normal; margin-top: 2px;">${payload.passengerCount} Passengers • ${payload.luggageCount || 0} Bags</div>` : ''}
            </div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Route Overview -->
    <div class="card-box">
      <div style="font-size: 13px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Trip Route Details
      </div>

      <div class="route-point">
        <div class="item-label" style="color: #d97706;">● Pickup Location</div>
        <div class="item-value" style="font-size: 14px; font-weight: 600;">
          ${payload.pickupAddress}
        </div>
        ${payload.pickupNotes ? `<div style="font-size: 12px; color: #64748b; margin-top: 3px; font-style: italic;">Note: ${payload.pickupNotes}</div>` : ''}
      </div>

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
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 13px; font-weight: 700; color: #92400e; margin-bottom: 10px; display: flex; align-items: center;">
        ✈ Airport Flight Operations
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
            <div class="item-label">Origin / Route</div>
            <div class="item-value" style="font-size: 14px;">
              ${payload.flightDetails?.departureAirport ? payload.flightDetails.departureAirport.toUpperCase() : 'Non-stop Arrival'}
            </div>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top: 4px;">
            <div style="font-size: 12px; color: #92400e;">
              Checked Bags: <strong>${payload.flightDetails?.hasCheckedLuggage ? 'Yes (Driver will coordinate baggage claim timing)' : 'Carry-on only'}</strong>
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
    <div class="card-box" style="background-color: #f1f5f9; border-color: #cbd5e1;">
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

    <!-- Dispatch Assistance Callout -->
    <div class="dispatch-box">
      <div style="font-weight: 700; color: #854d0e; font-size: 13px; margin-bottom: 4px;">
        Need to change your pickup time or modify this reservation?
      </div>
      <div style="font-size: 13px; color: #713f12; line-height: 1.5;">
        Call our 24/7 dispatch supervisor directly at 
        <a href="tel:${COMPANY_CONFIG.phone.primaryRaw}" style="font-weight: 700; color: #0f172a; text-decoration: underline;">
          ${COMPANY_CONFIG.phone.dispatch}
        </a>. Reference trip ID <strong>#${payload.tripId}</strong>.
      </div>
    </div>
    `,
    `Your ${COMPANY_CONFIG.name} reservation #${payload.tripId} is confirmed for ${payload.pickupTime}. Total: $${payload.totalFare.toFixed(2)}.`
  );

  const text = `
========================================
${COMPANY_CONFIG.name} - RIDE CONFIRMATION
========================================

Dear ${payload.passenger.firstName} ${payload.passenger.lastName},

Your reservation #${payload.tripId} has been confirmed.

TRIP DETAILS:
- Trip ID: #${payload.tripId}
- Timing: ${payload.pickupTime} (${isScheduled ? 'Scheduled' : 'ASAP'})
- Vehicle Class: ${payload.vehicleTier.toUpperCase()}
- Passengers: ${payload.passengerCount || 1} | Bags: ${payload.luggageCount || 0}
- Pickup: ${payload.pickupAddress} ${payload.pickupNotes ? `(Note: ${payload.pickupNotes})` : ''}
- Dropoff: ${payload.dropoffAddress} ${payload.dropoffNotes ? `(Note: ${payload.dropoffNotes})` : ''}
${hasFlight ? `- Flight: ${payload.flightDetails?.airlineCode || ''} ${payload.flightDetails?.flightNumber || ''} from ${payload.flightDetails?.departureAirport || ''}\n` : ''}
${payload.specialRequests ? `- Driver Notes: ${payload.specialRequests}\n` : ''}

PAYMENT:
- Payment Method: ${formatPaymentMethod(payload.paymentMethod)}
- Quoted Total: $${payload.totalFare.toFixed(2)} ${payload.currency}

Need assistance or changes? Call 24/7 Dispatch at ${COMPANY_CONFIG.phone.dispatch}.
========================================
© ${new Date().getFullYear()} ${COMPANY_CONFIG.legalName}
  `.trim();

  return { subject, html, text };
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
              Tier: ${payload.vehicleTier}
            </div>
          </td>
        </tr>
      </table>
    </div>

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
    `[ALERT] New Ride #${payload.tripId} (${payload.bookingType.toUpperCase()}) for ${payload.passengerName}. Pickup: ${payload.pickupAddress}`
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
- Vehicle Tier: ${payload.vehicleTier.toUpperCase()}

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
