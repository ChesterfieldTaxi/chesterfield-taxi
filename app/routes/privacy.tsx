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
    <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider border border-emerald-200">
          <ShieldCheckIcon className="w-3.5 h-3.5" />
          Data Protection & Privacy
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl mx-auto">
          Last updated: September 2026. This policy outlines how {COMPANY_CONFIG.name} gathers, processes, and protects your personal information when utilizing our website, dispatch services, and passenger applications.
        </p>
      </div>

      {/* Main Content */}
      <Card className="p-6 sm:p-10 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-8 text-sm text-slate-600 leading-relaxed">
        {/* Section 1 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">1</span>
            Information We Collect
          </h2>
          <p>
            To fulfill your transportation requests and maintain passenger safety, {COMPANY_CONFIG.name} collects the following categories of information:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li><strong>Contact Details:</strong> Your name, phone number, and email address used for booking confirmations, chauffeur arrival notices, and digital receipts.</li>
            <li><strong>Trip & Routing Data:</strong> Pickup addresses, destinations, intermediate waypoints, flight numbers for airport tracking, and date/time schedules.</li>
            <li><strong>Payment & Billing Data:</strong> Payment card tokens, transaction IDs, or corporate account numbers processed securely through encrypted, PCI-compliant payment gateways. We never store raw credit card CVV codes.</li>
            <li><strong>Special Transit Notes:</strong> Child safety seat requirements, mobility/wheelchair assistance instructions, gate access codes, and luggage notes.</li>
          </ul>
        </section>

        {/* Section 2 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">2</span>
            How We Use Your Information
          </h2>
          <p>
            Your information is strictly utilized to deliver and improve professional transportation services:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>Dispatching closest available fleet vehicles to your designated pickup point.</li>
            <li>Providing assigned chauffeurs with your pickup address and passenger contact details for seamless coordination.</li>
            <li>Calculating transparent, fixed upfront fares and issuing itemized digital receipts.</li>
            <li>Continuously monitoring flight arrival timings at St. Louis Lambert International (STL) to adjust dispatch schedules for flight delays.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">3</span>
            SMS & Automated Text Messaging Disclosure
          </h2>
          <p>
            By checking the SMS notification agreement during the booking process or creating a Passenger Portal account, you consent to receive non-marketing transactional SMS alerts related strictly to your requested transportation.
          </p>
          <p>
            These messages include:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-slate-600">
            <li>Booking confirmation and review status updates.</li>
            <li>Chauffeur dispatch and real-time live vehicle tracking links.</li>
            <li>Driver arrival notifications when the vehicle reaches your curb.</li>
          </ul>
          <p>
            You may opt out of SMS messages at any time by replying <strong>STOP</strong> to any dispatch message or by calling our office. Standard message and data rates may apply.
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">4</span>
            Information Sharing & Third Parties
          </h2>
          <p>
            <strong>We do not sell, rent, or trade your personal data to marketing third parties or data brokers.</strong> Information is shared solely with vetted operational partners necessary to execute your trip (e.g., licensed dispatch systems, telecommunications providers for SMS alerts, and PCI-compliant payment gateways).
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">5</span>
            Data Security & Retention
          </h2>
          <p>
            We implement industry-standard encryption protocols (TLS/SSL) to protect data in transit and at rest. Account data and trip history are retained only as long as necessary to provide booking history, satisfy tax and financial auditing requirements, and resolve customer support queries.
          </p>
        </section>

        {/* Section 6 */}
        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">6</span>
            Contact Us Regarding Privacy
          </h2>
          <p>
            If you have questions about our privacy practices, wish to update your stored contact preferences, or request data deletion, please contact our privacy compliance desk:
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors"
            >
              <PhoneIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs transition-colors"
            >
              Contact Support Office
            </Link>
          </div>
        </section>
      </Card>
    </div>
  );
}
