import React from 'react';
import { Link } from 'react-router-dom';
import { useFleetConfig } from '../hooks/useFleetConfig';

const Fleet: React.FC = () => {
  const { fleetConfig } = useFleetConfig();

  return (
    <div className="fleet-page">
      {/* Hero Header */}
      <header className="fleet-hero">
        <div className="container">
          <h1>Our Premium Fleet</h1>
          <p className="hero-subtitle">Choose the perfect vehicle for your journey</p>
        </div>
      </header>

      {/* Vehicle Grid */}
      <section className="section">
        <div className="container">
          <div className="vehicles-grid">
            {Object.values(fleetConfig?.vehicles || {})
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((vehicle) => (
                <div key={vehicle.id} className="vehicle-card">
                  <div className="vehicle-image-container">
                    <img
                      src={vehicle.images.default}
                      srcSet={`${vehicle.images.default} 1x, ${vehicle.images.highRes} 2x`}
                      alt={vehicle.name}
                      className="vehicle-img"
                    />
                  </div>

                  <div className="vehicle-details">
                    <div className="vehicle-header">
                      <h2>{vehicle.name}</h2>
                    </div>

                    <p className="vehicle-description">{vehicle.description.split('Best For: ')[0]}</p>

                    <div className="capacity-badges">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      <span>{vehicle.physicalCapacity} Passengers</span>
                      <span className="divider">•</span>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 6V5c0-1 1-2 2-2h4c1 0 2 1 2 2v1"></path>
                        <path d="M4 10h16"></path>
                        <path d="M6 10v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9"></path>
                        <rect x="4" y="6" width="16" height="4" rx="1"></rect>
                      </svg>
                      <span>{vehicle.luggageCapacity} Suitcases</span>
                    </div>

                    <div className="vehicle-features-list">
                      {vehicle.features.slice(0, 3).map((feature, i) => (
                        <div key={i} className="feature-item">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="section trust-section">
        <div className="container">
          <h2>The Chesterfield Standard</h2>
          <p className="section-intro">Every vehicle in our fleet meets rigorous standards for safety, comfort, and reliability.</p>

          <div className="trust-grid">
            <div className="trust-card">
              <div className="trust-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <h3>Comprehensive Insurance</h3>
              <p>All vehicles fully insured for your peace of mind</p>
            </div>

            <div className="trust-card">
              <div className="trust-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <h3>Regular Maintenance</h3>
              <p>Professional servicing every 3,000 miles</p>
            </div>

            <div className="trust-card">
              <div className="trust-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              </div>
              <h3>Safety Inspected</h3>
              <p>Rigorous safety checks before every shift</p>
            </div>

            <div className="trust-card">
              <div className="trust-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h3>Professionally Cleaned</h3>
              <p>Deep cleaned and sanitized daily</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Book Your Ride?</h2>
            <p>Experience the Chesterfield difference with our premium fleet</p>
            <div className="cta-buttons">
              <Link to="/reservations" className="btn btn-primary-large">
                Book Online Now
              </Link>
              <a href="tel:+13147380100" className="btn btn-secondary-large">
                Call (314) 738-0100
              </a>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .fleet-page {
          min-height: 100vh;
        }

        .fleet-hero {
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          color: white;
          padding: 6rem 0 4rem;
          text-align: center;
        }

        .fleet-hero h1 {
          font-size: 3rem;
          margin-bottom: 1rem;
          font-weight: 700;
        }

        .hero-subtitle {
          font-size: 1.25rem;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto;
        }

        .vehicles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 2.5rem;
          margin-top: 3rem;
        }

        .vehicle-card {
          background: white;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
        }

        .vehicle-card:hover {
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          transform: translateY(-4px);
        }

        .vehicle-image-container {
          position: relative;
          background: linear-gradient(to bottom, #f8f9fa, #e9ecef);
          padding: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 250px;
        }

        .vehicle-img {
          max-width: 100%;
          height: auto;
          object-fit: contain;
        }



        .vehicle-details {
          padding: 2rem;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .vehicle-header h2 {
          font-size: 1.75rem;
          color: var(--color-primary-dark);
          margin-bottom: 0.25rem;
        }

        .vehicle-subtitle {
          color: #666;
          font-size: 0.95rem;
          margin-bottom: 1rem;
        }

        .vehicle-description {
          color: #555;
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }

        .capacity-badges {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--color-primary-dark);
        }

        .capacity-badges svg {
          color: var(--color-primary);
          flex-shrink: 0;
        }

        .capacity-badges .divider {
          color: #ccc;
          font-weight: 300;
        }

        .vehicle-features-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.95rem;
          color: #555;
        }

        .feature-item svg {
          color: var(--color-primary);
          flex-shrink: 0;
        }

        .book-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem;
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          margin-top: auto;
        }

        .book-btn:hover {
          background: var(--color-primary-dark);
          transform: translateX(4px);
        }

        .book-btn svg {
          transition: transform 0.2s ease;
        }

        .book-btn:hover svg {
          transform: translateX(4px);
        }

        .trust-section {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          padding: 4rem 0;
        }

        .trust-section h2 {
          text-align: center;
          font-size: 2.5rem;
          color: var(--color-primary-dark);
          margin-bottom: 1rem;
        }

        .section-intro {
          text-align: center;
          font-size: 1.1rem;
          color: #666;
          max-width: 600px;
          margin: 0 auto 3rem;
        }

        .trust-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
        }

        .trust-card {
          background: white;
          padding: 2rem;
          border-radius: 12px;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .trust-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          background: rgba(212, 175, 55, 0.1);
          border-radius: 50%;
          margin-bottom: 1.5rem;
        }

        .trust-icon svg {
          color: var(--color-primary);
        }

        .trust-card h3 {
          font-size: 1.25rem;
          color: var(--color-primary-dark);
          margin-bottom: 0.75rem;
        }

        .trust-card p {
          color: #666;
          line-height: 1.6;
        }

        .cta-section {
          background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-secondary) 100%);
          color: white;
          padding: 4rem 0;
        }

        .cta-content {
          text-align: center;
        }

        .cta-content h2 {
          font-size: 2.5rem;
          margin-bottom: 1rem;
        }

        .cta-content > p {
          font-size: 1.2rem;
          opacity: 0.95;
          margin-bottom: 2rem;
        }

        .cta-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn-primary-large, .btn-secondary-large {
          padding: 1rem 2.5rem;
          font-size: 1.1rem;
          font-weight: 600;
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s ease;
          display: inline-block;
        }

        .btn-primary-large {
          background: white;
          color: var(--color-primary-dark);
        }

        .btn-primary-large:hover {
          background: #f8f9fa;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255,255,255,0.3);
        }

        .btn-secondary-large {
          background: transparent;
          color: white;
          border: 2px solid white;
        }

        .btn-secondary-large:hover {
          background: rgba(255,255,255,0.1);
          transform: translateY(-2px);
        }

        @media (max-width: 768px) {
          .fleet-hero h1 {
            font-size: 2rem;
          }

          .vehicles-grid {
            grid-template-columns: 1fr;
          }

          .trust-grid {
            grid-template-columns: 1fr;
          }

          .cta-content h2 {
            font-size: 2rem;
          }

          .cta-buttons {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
};

export default Fleet;
