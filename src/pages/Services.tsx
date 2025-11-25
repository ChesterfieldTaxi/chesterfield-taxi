import React from 'react';
import { Link } from 'react-router-dom';

const Services: React.FC = () => {
  return (
    <div className="services-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Transportation Services</h1>
          <p className="page-subtitle">Professional taxi service with flat-rate airport transfers and reliable local transportation.</p>
        </div>
      </header>

      {/* Service 1: Airport */}
      <section className="section" id="airport">
        <div className="container">
          <div className="service-detail">
            <div className="service-text">
              <h2>Reliable Airport Taxi & Shuttle Service (STL)</h2>
              <p>Start and end your journey with peace of mind. We provide dedicated airport transfers to Lambert-St. Louis International Airport.</p>

              <div className="service-features">
                <div className="feature">
                  <h3>Departures</h3>
                  <p>We recommend booking 24 hours in advance. Our drivers arrive 10 minutes early to help with luggage and get you to the terminal gate stress-free.</p>
                </div>
                <div className="feature">
                  <h3>Arrivals</h3>
                  <p>We monitor your flight status automatically. Whether you land early or are delayed, your driver will be waiting. We offer convenient curbside pickup at both Terminal 1 and Terminal 2.</p>
                </div>
              </div>

              <div className="rates-box">
                <h3>Popular Flat Rates (One-Way to/from STL)</h3>
                <ul className="rates-list">
                  <li><span>Chesterfield / Town & Country:</span> <span>~$45.00 - $55.00</span></li>
                  <li><span>Clayton / Ladue:</span> <span>~$35.00 - $40.00</span></li>
                  <li><span>Creve Coeur / Maryland Heights:</span> <span>~$30.00 - $35.00</span></li>
                  <li><span>Wildwood / Ballwin:</span> <span>~$60.00 - $70.00</span></li>
                  <li><span>St. Charles / St. Peters:</span> <span>~$35.00 - $45.00</span></li>
                  <li><span>O'Fallon / Lake St. Louis:</span> <span>~$55.00 - $65.00</span></li>
                </ul>
                <p className="rates-note">Note: Rates are estimates. An additional $5.00 Airport Use Fee applies to all pickups at the terminal.</p>
              </div>
              <Link to="/reservations" className="btn btn-primary">Book Airport Transfer</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Service 2: Corporate */}
      <section className="section bg-alt" id="corporate">
        <div className="container">
          <div className="service-detail">
            <h2>St. Louis Corporate Car Service</h2>
            <p>Business moves fast, and so do we. Chesterfield Taxi partners with local companies to provide reliable transportation for employees, clients, and business travel.</p>
            <ul className="feature-list">
              <li><strong>Priority Dispatch:</strong> Corporate account holders get priority vehicle allocation during peak hours.</li>
              <li><strong>Monthly Billing:</strong> Simplify your accounting with detailed monthly invoices and receipts.</li>
              <li><strong>Professional Fleet:</strong> Clean, well-maintained vehicles suitable for business travel and client transportation.</li>
            </ul>
            <Link to="/contact" className="btn btn-secondary">Open a Corporate Account</Link>
          </div>
        </div>
      </section>

      {/* Service 3: Medical */}
      <section className="section" id="medical">
        <div className="container">
          <div className="service-detail">
            <h2>Non-Emergency Medical Transport</h2>
            <p>We understand the importance of getting to doctor's appointments on time. We offer safe, compassionate, and patient transportation for seniors and individuals needing assistance getting to hospitals and clinics throughout the Barnes-Jewish, Mercy, and St. Luke's networks.</p>
          </div>
        </div>
      </section>

      {/* Service 4: Special Events */}
      <section className="section bg-alt" id="events">
        <div className="container">
          <div className="service-detail">
            <h2>Event Transportation & Night on the Town</h2>
            <p>Don't let parking ruin your evening. Whether it's a Cardinals game at Busch Stadium, a concert at Enterprise Center, or a wedding in wine country, we provide reliable door-to-door service. Enjoy your night responsibly with a designated professional driver.</p>
          </div>
        </div>
      </section>

      {/* Service 5: Courier */}
      <section className="section" id="courier">
        <div className="container">
          <div className="service-detail">
            <h2>Same-Day Courier Service</h2>
            <p>Need urgent document delivery or small package transport? We offer secure, expedited courier services across the St. Louis metro area. Faster than traditional mail and more personal than big-box delivery.</p>
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
          font-size: 2.5rem;
        }

        .page-subtitle {
          font-size: 1.2rem;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto;
        }

        .service-detail {
          max-width: 800px;
          margin: 0 auto;
        }

        .service-features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: var(--spacing-lg);
          margin: var(--spacing-lg) 0;
        }

        .feature h3 {
          color: var(--color-primary-dark);
          font-size: 1.1rem;
        }

        .rates-box {
          background-color: var(--color-background-alt);
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          border-left: 4px solid var(--color-primary);
          margin: var(--spacing-lg) 0;
        }

        .rates-list {
          list-style: none;
          margin: var(--spacing-md) 0;
        }

        .rates-list li {
          display: flex;
          justify-content: space-between;
          padding: var(--spacing-sm) 0;
          border-bottom: 1px solid var(--color-border);
        }

        .rates-list li:last-child {
          border-bottom: none;
        }

        .rates-note {
          font-size: 0.9rem;
          font-style: italic;
          opacity: 0.8;
        }

        .feature-list {
          list-style: none;
          margin: var(--spacing-lg) 0;
        }

        .feature-list li {
          margin-bottom: var(--spacing-sm);
          padding-left: var(--spacing-md);
          position: relative;
        }

        .feature-list li::before {
          content: '•';
          color: var(--color-primary);
          position: absolute;
          left: 0;
          font-weight: bold;
        }
      `}</style>
    </div>
  );
};

export default Services;
