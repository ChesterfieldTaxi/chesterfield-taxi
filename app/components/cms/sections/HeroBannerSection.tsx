import React from 'react';
import { Link } from 'react-router';

export interface HeroBannerSectionProps {
  heading?: string;
  subHeading?: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundImageUrl?: string;
}

export const HeroBannerSection: React.FC<HeroBannerSectionProps> = ({
  heading = 'Premium Ride Service',
  subHeading = 'Book your ride now.',
  ctaText = 'Book Now',
  ctaLink = '/book',
  backgroundImageUrl,
}) => {
  return (
    <section className="relative py-24 bg-slate-900 text-white flex items-center justify-center min-h-[400px]" style={{
      backgroundImage: backgroundImageUrl ? `url(${backgroundImageUrl})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      <div className="absolute inset-0 bg-black opacity-50"></div>
      <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">{heading}</h1>
        <p className="text-lg md:text-xl text-slate-300 mb-8">{subHeading}</p>
        {ctaLink && ctaText && (
          <Link to={ctaLink} className="inline-block bg-primary text-white font-semibold py-3 px-8 rounded-lg shadow-lg hover:bg-primary-dark transition-colors">
            {ctaText}
          </Link>
        )}
      </div>
    </section>
  );
};
