import React from 'react';
import { Link } from 'react-router-dom';

const Fleet: React.FC = () => {
  return (
    <div className="fleet-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Our Vehicle Fleet</h1>
          <p className="page-subtitle">Modern comfort. Meticulous maintenance. Uncompromised safety.</p>
        </div>
      </header>

      {/* Vehicle 1: Sedan */}
      <section className="section">
        <div className="container">
          <div className="vehicle-card">
            <div className="vehicle-content">
              <h2>Executive Sedan Series</h2>
              <p className="vehicle-type">Lincoln Town Car / Luxury Sedan</p>
              <p><strong>Best For:</strong> Corporate travel, airport transfers, couples.</p>

              <div className="vehicle-features">
                <h3>Features:</h3>
                <ul>
                  <li>Plush leather seating</li>
                  <li>Extra legroom</li>
                  <li>Quiet, smooth ride</li>
                  <li>Climate control</li>
                </ul>
              </div>

              <div className="vehicle-capacity">
                <span className="capacity-item">👤 3 Passengers</span>
                <span className="capacity-item">🧳 3 Suitcases</span>
              </div>
            </div>
            <div className="vehicle-image">
              {/* Placeholder image */}
              <div className="img-placeholder">Luxury Sedan Image</div>
            </div>
          </div>
        </div>
      </section>

      {/* Vehicle 2: Minivan */}
      <section className="section bg-alt">
        <div className="container">
          <div className="vehicle-card reverse">
            <div className="vehicle-content">
              <h2>Spacious Minivans</h2>
              <p className="vehicle-type">Toyota Sienna / Dodge Grand Caravan</p>
              <p><strong>Best For:</strong> Families, airport runs with extra luggage, small groups.</p>

              <div className="vehicle-features">
                <h3>Features:</h3>
                <ul>
                  <li>Easy entry and exit sliding doors</li>
                  <li>Ample rear cargo space</li>
                  <li>Child car seat compatible (seats available upon request)</li>
                </ul>
              </div>

              <div className="vehicle-capacity">
                <span className="capacity-item">👤 6 Passengers</span>
                <span className="capacity-item">🧳 4-5 Suitcases</span>
              </div>
            </div>
            <div className="vehicle-image">
              {/* Placeholder image */}
              <div className="img-placeholder">Minivan Image</div>
            </div>
          </div>
        </div>
      </section>

      {/* Vehicle 3: SUV */}
      <section className="section">
        <div className="container">
          <div className="vehicle-card">
            <div className="vehicle-content">
              <h2>Premium SUVs</h2>
              <p className="vehicle-type">Suburban / Yukon</p>
              <p><strong>Best For:</strong> VIP transport, severe weather safety, executive groups.</p>

              <div className="vehicle-features">
                <h3>Features:</h3>
                <ul>
                  <li>High clearance and 4WD safety</li>
                  <li>Premium sound and interior finishes</li>
                  <li>Maximum luggage capacity</li>
                </ul>
              </div>

              <div className="vehicle-capacity">
                <span className="capacity-item">👤 6 Passengers</span>
                <span className="capacity-item">🧳 6 Suitcases</span>
              </div>
            </div>
            <div className="vehicle-image">
              {/* Placeholder image */}
              <div className="img-placeholder">Luxury SUV Image</div>
            </div>
          </div>
        </div>
      </section>

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
          color: var(--color-text-light);
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
          height: 300px;
          background-color: #ddd;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .img-placeholder {
          color: #666;
          font-weight: bold;
        }

        .vehicle-type {
          font-size: 1.2rem;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
          font-weight: 600;
        }

        .vehicle-features {
          margin: var(--spacing-md) 0;
        }

        .vehicle-features h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-xs);
        }

        .vehicle-features ul {
          list-style: disc;
          padding-left: var(--spacing-lg);
        }

        .vehicle-capacity {
          display: flex;
          gap: var(--spacing-lg);
          margin-top: var(--spacing-lg);
          font-weight: 600;
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
