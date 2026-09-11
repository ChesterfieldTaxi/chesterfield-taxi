import React, { useState } from 'react';
import { Link } from 'react-router';
import {
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  ClockIcon,
  ShieldCheckIcon,
  CheckIcon,
  CarIcon,
  AlertCircleIcon,
  SpinnerIcon,
} from '../components/ui/Icons';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { COMPANY_CONFIG } from '../config/companyConfig';

export function meta() {
  return [
    { title: `Contact & Support – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content:
        `Contact ${COMPANY_CONFIG.name} dispatch 24/7. Call ${COMPANY_CONFIG.phone.dispatch}, submit corporate inquiries, or get assistance with airport reservations in Chesterfield, MO.`,
    },
  ];
}

const SERVICE_ZONES = [
  { city: 'Chesterfield', zip: '63005, 63017', note: 'Primary Hub & Instant Dispatch' },
  { city: 'Wildwood', zip: '63038, 63040', note: 'Full Coverage Residential & Commercial' },
  { city: 'Ballwin & Ellisville', zip: '63011, 63021', note: 'Manchester Corridor Service' },
  { city: 'Town & Country', zip: '63131', note: 'Mason & Clayton Rd Area' },
  { city: 'Creve Coeur & Maryland Hts', zip: '63141, 63043', note: 'Corporate Business Parks' },
  { city: 'Lambert STL Airport', zip: '63145', note: 'Terminals 1 & 2 Scheduled Service' },
  { city: 'Spirit of St. Louis (SUS)', zip: '63005', note: 'Private FBO Ramp Access' },
  { city: 'Downtown St. Louis', zip: '63101 - 63103', note: 'Sports & Convention Shuttles' },
];

export default function ContactRoute() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    inquiryType: 'general',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate sending inquiry to dispatch
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        inquiryType: 'general',
        message: '',
      });
    }, 800);
  };

  return (
    <div className="py-12 bg-slate-50 flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-100/90 text-amber-950 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider border border-amber-300">
            24/7 Operations Desk
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-950 tracking-tight">
            Contact &amp; Customer Support
          </h1>
          <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
            Need immediate dispatch, have questions regarding an upcoming trip, or looking to set up
            a corporate account? Our local team is here around the clock.
          </p>
        </div>

        {/* Primary Contact Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Telephone */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6 hover:border-amber-400 transition-colors">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <PhoneIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Phone Dispatch</h2>
                <p className="text-xs text-slate-500 mt-0.5">Direct line to our 24/7 operators</p>
              </div>
              <p className="text-sm text-slate-600">
                For immediate pickup, ASAP bookings, or urgent schedule changes, call us anytime.
              </p>
            </div>
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="inline-flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-extrabold text-sm py-3 px-4 rounded-xl transition-colors shadow-xs"
            >
              <PhoneIcon className="w-4 h-4" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>
          </div>

          {/* Card 2: Email */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6 hover:border-amber-400 transition-colors">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <MailIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Email &amp; Invoicing</h2>
                <p className="text-xs text-slate-500 mt-0.5">Corporate billing and receipts</p>
              </div>
              <p className="text-sm text-slate-600">
                For expense receipts, corporate contract setup, and general inquiries.
              </p>
            </div>
            <a
              href={`mailto:${COMPANY_CONFIG.email.dispatch}`}
              className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs py-3 px-4 rounded-xl transition-colors truncate"
            >
              <MailIcon className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">{COMPANY_CONFIG.email.dispatch}</span>
            </a>
          </div>

          {/* Card 3: Address & Hours */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-6 hover:border-amber-400 transition-colors">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <MapPinIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Dispatch Headquarters</h2>
                <p className="text-xs text-slate-500 mt-0.5">West County Operations Hub</p>
              </div>
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">{COMPANY_CONFIG.address.street}</p>
                <p>{COMPANY_CONFIG.address.city}, {COMPANY_CONFIG.address.state} {COMPANY_CONFIG.address.zip}</p>
                <div className="flex items-center gap-1.5 pt-2 text-amber-700 font-bold">
                  <ClockIcon className="w-3.5 h-3.5" />
                  <span>{COMPANY_CONFIG.operatingHours}</span>
                </div>
              </div>
            </div>

            <Link
              to="/book"
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs py-3 px-4 rounded-xl transition-colors shadow-xs"
            >
              <CarIcon className="w-4 h-4" />
              <span>Book Online 24/7</span>
            </Link>
          </div>
        </div>

        {/* Contact Form & Coverage Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Inquiry Form */}
          <div className="lg:col-span-7">
            <Card variant="elevated" className="border-slate-200/80 rounded-3xl p-6 sm:p-8 bg-white shadow-xs">
              <CardHeader className="p-0 pb-6 border-b border-slate-100">
                <CardTitle className="text-xl font-extrabold text-slate-950">
                  Send a Message to Dispatch
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Fill out the form below and an operations dispatcher will respond promptly.
                </CardDescription>
              </CardHeader>

              {submitted ? (
                <div className="py-10 text-center space-y-4">
                  <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                    <CheckIcon className="w-7 h-7 stroke-[3]" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Message Received!</h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    Thank you for reaching out. A {COMPANY_CONFIG.name} dispatch representative has received
                    your inquiry and will respond within 1 business hour.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSubmitted(false)}
                    className="mt-2"
                  >
                    Send Another Inquiry
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Jane Doe"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="(636) 555-0199"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="jane@example.com"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Inquiry Nature
                      </label>
                      <select
                        value={formData.inquiryType}
                        onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value })}
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="general">General Inquiry</option>
                        <option value="airport">Airport Transfer Question</option>
                        <option value="corporate">Corporate Billing Account</option>
                        <option value="lost_found">Lost &amp; Found Item</option>
                        <option value="group">Event / Multi-Vehicle Group</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Message &amp; Details *
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      placeholder="Please include trip dates, estimated times, passenger counts, or specific instructions..."
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-6"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <SpinnerIcon className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Transmitting Message...</span>
                        </span>
                      ) : (
                        'Submit Inquiry'
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          </div>

          {/* Service Area Coverage Directory */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                  Service Area Directory
                </span>
                <h3 className="text-xl font-extrabold text-slate-950 tracking-tight mt-1">
                  West County &amp; Regional Hubs
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  We provide continuous, round-the-clock service across the following primary zones:
                </p>
              </div>

              <div className="space-y-3">
                {SERVICE_ZONES.map((zone) => (
                  <div
                    key={zone.city}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{zone.city}</span>
                      <span className="text-slate-500">{zone.note}</span>
                    </div>
                    <span className="font-mono text-[11px] text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md font-semibold shrink-0">
                      {zone.zip}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <AlertCircleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 space-y-1">
                  <span className="font-bold block">Need an immediate ride right now?</span>
                  <p>
                    Online inquiries are reviewed throughout the day. For urgent immediate dispatch,
                    use our{' '}
                    <Link to="/book" className="underline font-bold">
                      online booking portal
                    </Link>{' '}
                    or call{' '}
                    <a href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`} className="underline font-bold">
                      {COMPANY_CONFIG.phone.dispatch}
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
