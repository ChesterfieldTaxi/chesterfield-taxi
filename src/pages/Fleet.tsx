import React from 'react';
import { Link } from 'react-router-dom';
import { useFleetConfig } from '../hooks/useFleetConfig';

const Fleet: React.FC = () => {
  const { fleetConfig } = useFleetConfig();

  return (
    <div className="fleet-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Our Vehicle Fleet</h1>
          <p className="page-subtitle">Modern comfort. Meticulous maintenance. Uncompromised safety.</p>
        </div>
      </header>

      {/* Vehicle Fleet */}
      {Object.values(fleetConfig?.vehicles || {})
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((vehicle, index) => (
          <section key={vehicle.id} className={`section ${index % 2 !== 0 ? 'bg-alt' : ''}`}>
            <div className="container">
              <div className={`vehicle-card ${index % 2 !== 0 ? 'reverse' : ''}`}>
                <div className="vehicle-content">
                  <h2>{vehicle.name}</h2>
                  <p className="vehicle-type">{vehicle.description.split('. ')[0]}</p>
                  <p><strong>Best For:</strong> {vehicle.description.split('Best For: ')[1]}</p>

                  <div className="vehicle-features">
                    <h3>Features:</h3>
                    <ul>
                      {vehicle.features.map((feature, i) => (
                        <li key={i}>{feature}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="vehicle-capacity">
                    <span className="capacity-item">👤 {vehicle.physicalCapacity} Passengers</span>
                    <span className="capacity-item">🧳 {vehicle.luggageCapacity} Suitcases</span>
                  </div>
                </div>
                <div className="vehicle-image">
                  <img
                    src={vehicle.images.default}
                    srcSet={`${vehicle.images.default} 1x, ${vehicle.images.highRes} 2x`}
                    alt={vehicle.name}
                  />
                </div>
              </div>
            </div>
          </section>
        ))}

      {/* Maintenance Promise */}
      <section className="section maintenance-section">
        <div className="container">
          <div className="maintenance-content">
            <h2>The Chesterfield Standard</h2>
            <p>We take pride in our vehicles. Every car in our fleet is:</p>
            <ul className="maintenance-list">
              <li>Inspected daily for mechanical safety.</li>
              <li>Detailed regularly for a spotless interior.</li>
              <li>Smoke-free.</li>
            </ul>
            <Link to="/reservations" className="btn btn-primary">Book Your Ride</Link>
          </div>
        </div>
      </section>

      <style>{`
        .page-header {
          background-color: #1a1a1a;
          color: white;
          padding: var(--spacing-xl) 0;
          text-align: center;
        }

        .page-header h1 {
          color: white;
          font-family: var(--font-family-sans);
          font-size: 2.5rem;
        }

        .page-subtitle {
          font-size: 1.2rem;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto;
        }

        .vehicle-card {
          display: flex;
          align-items: center;
          gap: var(--spacing-xl);
          padding: var(--spacing-lg) 0;
        }

        .vehicle-card.reverse {
          flex-direction: row-reverse;
        }

        .vehicle-content {
          flex: 1;
        }

        .vehicle-image {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .vehicle-image img {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .vehicle-type {
          font-size: 1.2rem;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
          font-weight: 600;
        }

        .vehicle-features {
          margin: var(--spacing-md) 0;
          margin-bottom: var(--spacing-lg);
        }

        .vehicle-features h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-xs);
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .vehicle-features ul {
          list-style: none;
          padding: 0;
        }
        
        .vehicle-features li {
          position: relative;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }
        
        .vehicle-features li::before {
          content: '•';
          color: var(--color-primary);
          position: absolute;
          left: 0;
          font-weight: bold;
          font-size: 1.2rem;
          line-height: 1;
        }

        .vehicle-capacity {
          display: flex;
          gap: var(--spacing-lg);
          margin-top: var(--spacing-lg);
          font-weight: 600;
          background-color: #f5f5f5;
          padding: var(--spacing-md);
          border-radius: var(--radius-sm);
          display: inline-flex;
        }

        .bg-alt {
          background-color: var(--color-background-alt);
        }

        .maintenance-section {
          background-color: var(--color-secondary);
          color: white;
          text-align: center;
        }

        .maintenance-content {
          max-width: 800px;
          margin: 0 auto;
        }

        .maintenance-content h2 {
          color: var(--color-primary);
          margin-bottom: var(--spacing-md);
        }

        .maintenance-list {
          list-style: none;
          margin: var(--spacing-lg) 0;
          display: flex;
          justify-content: center;
          gap: var(--spacing-xl);
          flex-wrap: wrap;
        }

        .maintenance-list li {
          position: relative;
          padding-left: var(--spacing-lg);
        }

        .maintenance-list li::before {
          content: '✓';
          color: var(--color-primary);
          position: absolute;
          left: 0;
          font-weight: bold;
        }

        @media (max-width: 768px) {
          .vehicle-card, .vehicle-card.reverse {
            flex-direction: column;
          }
          
          .vehicle-image {
            width: 100%;
            height: 200px;
          }

          .maintenance-list {
            flex-direction: column;
            gap: var(--spacing-sm);
            align-items: center;
          }
        }
      `}</style>
    </div>
  );
};

export default Fleet;
