import React from 'react';
import { Link } from 'react-router-dom';

const About: React.FC = () => {
  return (
    <div className="about-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>About Chesterfield Taxi</h1>
          <p className="page-subtitle">Locally owned and operated since 1995. Over 30 years of trusted service.</p>
        </div>
      </header>

      {/* Our Story */}
      <section className="section">
        <div className="container">
          <div className="about-content">
            <h2>Over 30 Years of Trusted Service</h2>
            <p>Founded in 1995, Chesterfield Taxi & Car Service has been serving St. Louis County for over 30 years. Owned and operated by Zemene Muche, we've grown from a single taxi into a trusted fleet specializing in airport transfers and local transportation. We're not a tech company or ride-share service - we're a professional taxi company with experienced drivers who know St. Louis roads like the back of their hand.</p>
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

      {/* Our Drivers */}
      <section className="section">
        <div className="container">
          <div className="about-content">
            <h2>Experienced, Professional Drivers</h2>
            <p>Our driver team averages over 10 years of experience. Many have been with us since the beginning. They're not gig workers - they're career professionals who take pride in providing safe, reliable transportation. All drivers are fully licensed, background-checked, drug-screened, and trained in defensive driving and customer service.</p>
          </div>
        </div>
      </section>

      {/* Airport Transfer Specialists */}
      <section className="section bg-alt">
        <div className="container">
          <div className="about-content">
            <h2>Lambert Airport (STL) Transfer Specialists</h2>
            <p>Airport transfers are our specialty. We monitor flight arrivals in real-time, offer flat-rate pricing (no surprises), and provide curb-to-curb service at both Terminal 1 and Terminal 2. Whether you're flying out or coming home, we'll be there on time, every time.</p>
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
