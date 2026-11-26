import React from 'react';
import { Link } from 'react-router';
import { ShieldCheckIcon, ClockIcon, CarIcon, PhoneIcon } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Terms and Conditions – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content: `Read the terms and conditions for booking and riding with ${COMPANY_CONFIG.name}. Upfront fare policies, cancellations, baggage allowances, and passenger guidelines.`,
    },
  ];
}

export default function TermsPage() {
  return (
    <div className="py-12 bg-surface-subtle flex-1 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-status-info-bg text-status-info-fg text-xs font-bold uppercase tracking-wider border border-status-info-border">
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          Legal &amp; Passenger Agreements
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-fg-primary tracking-tight">
          Terms and Conditions
        </h1>
        <p className="text-sm text-fg-muted max-w-2xl mx-auto">
          Last updated: March 2026. Please review the service terms governing your reservations, rides, and accounts with {COMPANY_CONFIG.name}.
        </p>
      </div>

      {/* Main Content */}
      <Card className="p-6 sm:p-10 bg-surface-card border border-border-subtle/90 rounded-2xl shadow-xs space-y-8 text-sm text-fg-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">1</span>
            Booking Reservations & Confirmation
          </h2>
          <p>
            When submitting a ride request through the {COMPANY_CONFIG.name} online portal or booking engine, your reservation is subject to driver dispatch availability and review. While many point-to-point and immediate trips are confirmed automatically, scheduled reservations (particularly peak airport transfers and multi-vehicle requests) may require manual dispatch confirmation.
          </p>
          <p>
            You will receive immediate automated SMS and email notifications detailing the status of your reservation, driver assignment, vehicle license plate, and estimated arrival times.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">2</span>
            Upfront Pricing & Zero Surge Guarantee
          </h2>
          <p>
            {COMPANY_CONFIG.name} operates on transparent, upfront fixed pricing. We do not implement unpredictable surge multipliers during rainstorms, local sporting events, or peak holiday rush. The upfront fare quoted during your booking covers the specified origin, destination, and passenger count.
          </p>
          <p>
            Additional charges may apply only in the event of:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-fg-secondary">
            <li>Unscheduled intermediate stops requested during the trip.</li>
            <li>Excessive passenger wait times at standard residential or commercial pickups beyond the complimentary 10-minute grace period (for flight-monitored airport arrivals, we track your flight in real time and wait as long as it takes as a general policy, handling exceptional cases individually).</li>
            <li>Special cleaning or sanitization fees necessitated by severe vehicle interior damage or contamination.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">3</span>
            Cancellation & Modification Policy
          </h2>
          <p>
            We understand that travel schedules change unexpectedly. Scheduled trips can be modified or cancelled without penalty up to two (2) hours prior to your scheduled pickup time directly via your Client Portal or by calling our 24/7 dispatch office.
          </p>
          <p>
            Cancellations made within two hours of scheduled pickup, or no-shows once the driver has arrived on site, may incur a standard cancellation fee to compensate the driver for fuel and travel time.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">4</span>
            Passenger Conduct & Vehicle Safety
          </h2>
          <p>
            All passengers are required to wear seatbelts at all times during the ride in compliance with Missouri state law. Smoking, vaping, and consumption of open alcoholic beverages are strictly prohibited inside all fleet vehicles.
          </p>
          <p>
            Drivers reserve the right to decline or end a ride if a passenger exhibits unruly, aggressive, or unsafe behavior towards the driver, other passengers, or other road users.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">5</span>
            Luggage & Personal Belongings
          </h2>
          <p>
            Passengers are responsible for ensuring that the number and size of bags requested does not exceed vehicle capacity. {COMPANY_CONFIG.name} and its contracted drivers are not liable for lost, stolen, or forgotten personal items, though our lost-and-found team will make every reasonable effort to safeguard and return items left in fleet vehicles.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-info-bg-strong text-status-info-fg text-xs font-black flex items-center justify-center">6</span>
            Contacting Dispatch
          </h2>
          <p>
            For questions regarding these terms, reservation assistance, or corporate billing accounts, please contact our 24/7 team:
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-surface-muted hover:bg-surface-emphasis text-fg-strong rounded-xl font-bold text-xs transition-colors"
            >
              <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-4 py-2 bg-status-info-bg hover:bg-status-info-bg-strong text-status-info-fg rounded-xl font-bold text-xs transition-colors"
            >
              Contact Dispatch Office
            </Link>
          </div>
        </section>
      </Card>
      </div>
    </div>
  );
}
