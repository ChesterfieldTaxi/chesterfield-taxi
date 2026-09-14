import React from 'react';
import { COMPANY_CONFIG } from '../../../config/companyConfig';

export interface ServiceAreaListSectionProps {
  title?: string;
  areas?: string[];
}

export const ServiceAreaListSection: React.FC<ServiceAreaListSectionProps> = ({
  title = 'Areas We Serve',
  areas = COMPANY_CONFIG.serviceAreas
}) => {
  return (
    <section className="py-16 bg-white border-t border-slate-100">
      <div className="container mx-auto px-4 max-w-4xl text-center">
        <h2 className="text-3xl font-bold text-slate-800 mb-8">{title}</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {areas.map((area, idx) => (
            <span key={idx} className="bg-slate-100 text-slate-700 px-4 py-2 rounded-full text-sm font-medium">
              {area}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
