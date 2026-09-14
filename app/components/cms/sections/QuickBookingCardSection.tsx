import React from 'react';
import { Link } from 'react-router';

export interface QuickBookingCardSectionProps {
  title?: string;
  description?: string;
}

export const QuickBookingCardSection: React.FC<QuickBookingCardSectionProps> = ({
  title = 'Quick Booking',
  description = 'Book a ride instantly with our automated system.'
}) => {
  return (
    <section className="py-12 bg-slate-50">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-white rounded-xl shadow-md p-8 text-center border border-slate-200">
          <h2 className="text-2xl font-semibold text-slate-800 mb-2">{title}</h2>
          <p className="text-slate-600 mb-6">{description}</p>
          <Link to="/book" className="inline-block bg-primary text-white font-semibold py-3 px-8 rounded-lg hover:opacity-90 transition-opacity">
            Start Booking
          </Link>
        </div>
      </div>
    </section>
  );
};
