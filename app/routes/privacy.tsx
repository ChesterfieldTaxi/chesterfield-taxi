import React from 'react';
import { Link } from 'react-router';
import { ShieldCheckIcon, PhoneIcon } from '../components/ui/Icons';
import { Card } from '../components/ui/Card';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Privacy Policy – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content: `Read the privacy policy for ${COMPANY_CONFIG.name}. Learn how we collect, use, and protect your passenger contact details, location data, and SMS communication preferences.`,
    },
  ];
}

export default function PrivacyPage() {
  return (
    <div className="py-12 bg-surface-subtle flex-1 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-status-info-bg text-status-info-fg text-xs font-bold uppercase tracking-wider border border-status-info-border">
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          Data Protection &amp; Privacy
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-fg-primary tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-fg-muted max-w-2xl mx-auto">
          Last updated: March 2026. This policy outlines how {COMPANY_CONFIG.name} gathers, processes, and protects your personal information when utilizing our website, dispatch services, and passenger applications.
        </p>
      </div>

      {/* Main Content */}
      <Card className="p-6 sm:p-10 bg-surface-card border border-border-subtle/90 rounded-2xl shadow-xs space-y-8 text-sm text-fg-secondary leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">1</span>
            Information We Collect
          </h2>
          <p>
            To fulfill your transportation requests and maintain passenger safety, {COMPANY_CONFIG.name} collects the following categories of information:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-fg-secondary">
            <li><strong>Contact Details:</strong> Your name, phone number, and email address used for booking confirmations, driver arrival notices, and trip receipts.</li>
            <li><strong>Trip & Routing Data:</strong> Pickup addresses, destinations, intermediate stops, flight numbers for airport tracking, and date/time schedules.</li>
            <li><strong>Payment & Billing Data:</strong> Payment card tokens, transaction IDs, or corporate account numbers processed securely through encrypted, PCI-compliant payment processors. We never store raw credit card CVV codes.</li>
            <li><strong>Ride Notes:</strong> Child safety seat requests, gate access codes, and luggage notes.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">2</span>
            How We Use Your Information
          </h2>
          <p>
            Your information is used strictly to provide and improve your ride experience:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-fg-secondary">
            <li>Dispatching the closest available vehicle to your pickup location.</li>
            <li>Sharing your pickup address and contact details with your assigned driver so they can meet you smoothly.</li>
            <li>Calculating upfront fares and sending itemized trip receipts.</li>
            <li>Monitoring flight arrival times at St. Louis Lambert International (STL) to adjust pickup times for flight delays.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">3</span>
            SMS & Automated Text Messaging Disclosure
          </h2>
          <p>
            By checking the text update option during booking or creating a Client Portal account, you agree to receive non-marketing text updates about your ride.
          </p>
          <p>
            These messages include:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-fg-secondary">
            <li>Booking confirmation and status updates.</li>
            <li>Driver assignment and live ride tracking links.</li>
            <li>Driver arrival alerts when your car reaches pickup.</li>
          </ul>
          <p>
            You may opt out of SMS messages at any time by replying <strong>STOP</strong> to any dispatch message or by calling our office. Standard message and data rates may apply.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">4</span>
            Information Sharing & Third Parties
          </h2>
          <p>
            <strong>We do not sell, rent, or trade your personal data to marketing third parties or data brokers.</strong> Information is shared solely with vetted operational partners necessary to execute your trip (e.g., licensed dispatch systems, telecommunications providers for SMS alerts, and PCI-compliant payment gateways).
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">5</span>
            Data Security & Retention
          </h2>
          <p>
            We implement industry-standard encryption protocols (TLS/SSL) to protect data in transit and at rest. Account data and trip history are retained only as long as necessary to provide booking history, satisfy tax and financial auditing requirements, and resolve customer support queries.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-fg-primary flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-status-success-bg-strong text-status-success-fg text-xs font-black flex items-center justify-center">6</span>
            Contact Us Regarding Privacy
          </h2>
          <p>
            If you have questions about our privacy practices, wish to update your stored contact preferences, or request data deletion, please contact our privacy compliance desk:
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-status-success-bg hover:bg-status-success-bg-strong text-status-success-fg rounded-xl font-bold text-xs transition-colors"
            >
              Contact Support Office
            </Link>
          </div>
        </section>
      </Card>
      </div>
    </div>
  );
}
