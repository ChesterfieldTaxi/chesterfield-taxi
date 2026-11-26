import React from 'react';
import { Link } from 'react-router';

export interface QuickBookingCardSectionProps {
  title?: string;
  description?: string;
}

export const QuickBookingCardSection: React.FC<QuickBookingCardSectionProps> = ({
  title = 'Book a Ride',
  description = 'Get an upfront fare estimate and book your pickup in seconds.'
}) => {
  return (
    <section className="py-12 bg-surface-subtle">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="bg-surface-card rounded-xl shadow-md p-8 text-center border border-border-subtle">
          <h2 className="text-2xl font-semibold text-fg-strong mb-2">{title}</h2>
          <p className="text-fg-secondary mb-6">{description}</p>
          <Link to="/book" className="inline-block bg-primary text-white font-semibold py-3 px-8 rounded-lg hover:opacity-90 transition-opacity">
            Start Booking
          </Link>
        </div>
      </div>
    </section>
  );
};
