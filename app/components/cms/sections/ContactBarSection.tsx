import React from 'react';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export interface ContactBarSectionProps {
  title?: string;
  phone?: string;
}

export const ContactBarSection: React.FC<ContactBarSectionProps> = ({
  title = 'Need assistance? Call dispatch 24/7:',
  phone = COMPANY_CONFIG.phone.dispatch
}) => {
  return (
    <section className="bg-primary text-white py-6">
      <div className="container mx-auto px-4 text-center flex flex-col md:flex-row items-center justify-center gap-4">
        <span className="text-lg">{title}</span>
        <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-2xl font-bold hover:underline">
          {phone}
        </a>
      </div>
    </section>
  );
};
