import React from 'react';

export interface FlatTariffMatrixSectionProps {
  title?: string;
  tariffs?: Array<{ origin: string; destination: string; price: string }>;
}

export const FlatTariffMatrixSection: React.FC<FlatTariffMatrixSectionProps> = ({
  title = 'Popular Routes & Rates',
  tariffs = [
    { origin: 'Chesterfield', destination: 'Lambert Airport (STL)', price: '$65' },
    { origin: 'Wildwood', destination: 'Lambert Airport (STL)', price: '$75' },
    { origin: 'Chesterfield', destination: 'Downtown St. Louis', price: '$80' },
  ]
}) => {
  return (
    <section className="py-16 bg-surface-card">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="text-3xl font-bold text-center text-fg-strong mb-8">{title}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted text-fg-secondary">
                <th className="py-4 px-6 font-semibold border-b">From</th>
                <th className="py-4 px-6 font-semibold border-b">To</th>
                <th className="py-4 px-6 font-semibold border-b text-right">Flat Rate</th>
              </tr>
            </thead>
            <tbody>
              {tariffs.map((t, idx) => (
                <tr key={idx} className="border-b border-border-faint hover:bg-surface-subtle">
                  <td className="py-4 px-6 text-fg-secondary">{t.origin}</td>
                  <td className="py-4 px-6 text-fg-secondary">{t.destination}</td>
                  <td className="py-4 px-6 text-fg-primary font-medium text-right">{t.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
