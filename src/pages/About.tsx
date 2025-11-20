import React from 'react';
import { Link } from 'react-router-dom';

const About: React.FC = () => {
  return (
    <div className="about-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>About Chesterfield Taxi</h1>
          <p className="page-subtitle">Local St. Louis ownership. World-class service standards.</p>
        </div>
      </header>

      {/* Our Story */}
      <section className="section">
        <div className="container">
          <div className="about-content">
            <h2>Driven by Excellence</h2>
            <p>Chesterfield Taxi & Car Service was founded with a simple mission: to provide a level of service that rideshare apps simply cannot match. Owned and operated by Zemene Muche, we have grown from a single car into a premier fleet serving St. Louis County. We are not a tech company trying to disrupt transportation; we are a transportation company dedicated to serving our community.</p>
          </div>
        </div>
      </section>

      {/* Our Philosophy */}
      <section className="section bg-alt">
        <div className="container">
          <div className="about-content">
            <h2>The "Passenger Care" Approach</h2>
            <p>We believe you are a guest, not just a fare. Our drivers are trained in defensive driving, local geography, and customer etiquette. We assist with doors, handle your luggage, and respect your privacy during the ride.</p>
          </div>
        </div>
      </section>

      {/* Service Areas */}
      <section className="section">
        <div className="container">
          <div className="about-content">
            <h2>We are your local experts for:</h2>
            <div className="service-areas-grid">
              <div className="area-item">Chesterfield (63017, 63005)</div>
              <div className="area-item">Clayton & Ladue (63105, 63124)</div>
              <div className="area-item">Town and Country (63131)</div>
              <div className="area-item">Creve Coeur (63141)</div>
              <div className="area-item">Maryland Heights (63043)</div>
              <div className="area-item">St. Charles & O'Fallon</div>
              <div className="area-item">Wildwood & Ballwin</div>
              <div className="area-item">Downtown St. Louis</div>
            </div>
            <div className="cta-container">
              <Link to="/reservations" className="btn btn-primary">Book Your Ride</Link>
            </div>
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

        .about-content {
          max-width: 800px;
          margin: 0 auto;
          text-align: center;
        }

        .about-content h2 {
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
        }

        .about-content p {
          font-size: 1.1rem;
          line-height: 1.8;
          margin-bottom: var(--spacing-lg);
        }

        .bg-alt {
          background-color: var(--color-background-alt);
        }

        .service-areas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--spacing-md);
          margin: var(--spacing-lg) 0;
        }

        .area-item {
          background-color: var(--color-background);
          padding: var(--spacing-md);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--color-border);
          font-weight: 500;
        }

        .cta-container {
          margin-top: var(--spacing-xl);
        }
      `}</style>
    </div>
  );
};

export default About;
