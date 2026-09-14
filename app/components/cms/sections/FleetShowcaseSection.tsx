import React from 'react';

export interface FleetShowcaseSectionProps {
  title?: string;
  vehicles?: Array<{ name: string; pax: number; bags: number; image?: string }>;
}

export const FleetShowcaseSection: React.FC<FleetShowcaseSectionProps> = ({
  title = 'Our Fleet',
  vehicles = [
    { name: 'Standard Sedan', pax: 4, bags: 3 },
    { name: 'Premium SUV', pax: 6, bags: 5 },
    { name: 'Luxury Van', pax: 7, bags: 6 },
  ]
}) => {
  return (
    <section className="py-16 bg-slate-50">
      <div className="container mx-auto px-4 max-w-6xl">
        <h2 className="text-3xl font-bold text-center text-slate-800 mb-12">{title}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {vehicles.map((v, idx) => (
            <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="h-48 bg-slate-200 flex items-center justify-center">
                {v.image ? (
                  <img src={v.image} alt={v.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-400">Image Placeholder</span>
                )}
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-semibold text-slate-800 mb-2">{v.name}</h3>
                <p className="text-slate-500 text-sm">Up to {v.pax} Passengers • {v.bags} Bags</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
