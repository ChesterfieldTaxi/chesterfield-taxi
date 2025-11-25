import React from 'react';
import { Link } from 'react-router-dom';

const Home: React.FC = () => {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="container hero-content">
          <h1>Professional Taxi & Airport Transfer Service in St. Louis County</h1>
          <p className="hero-subtitle">Reliable airport transfers and local transportation. Serving St. Louis County with experienced drivers for over 30 years.</p>
          <div className="hero-buttons">
            <Link to="/reservations" className="btn btn-primary">Book a Ride Online</Link>
            <a href="tel:3147380100" className="btn btn-secondary">Call (314) 738-0100</a>
          </div>
        </div>
      </section>

      {/* Quick Booking Bar */}
      <section className="booking-bar">
        <div className="container">
          <h2>Where can we take you today?</h2>
          <div className="booking-placeholder">
            {/* Placeholder for form inputs */}
            <input type="text" placeholder="Pickup Address" disabled />
            <input type="text" placeholder="Dropoff Address" disabled />
            <input type="tel" placeholder="Phone Number" disabled />
            <Link to="/reservations" className="btn btn-primary">Book Now</Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="section why-choose-us">
        <div className="container">
          <h2 className="section-title">Experience the Difference of Professional Transportation</h2>
          <div className="features-grid">
            <div className="feature-card">
              <h3>Punctuality Guaranteed</h3>
              <p>We understand that every minute counts. Our dispatch team tracks flights and traffic patterns in real-time to ensure on-time pickups for every reservation.</p>
            </div>
            <div className="feature-card">
              <h3>Experienced Drivers</h3>
              <p>Our experienced drivers average 10+ years with the company. Fully licensed, background-checked, and experts in St. Louis area roads and traffic patterns.</p>
            </div>
            <div className="feature-card">
              <h3>Transparent Pricing</h3>
              <p>Clear, upfront flat-rate pricing for airport transfers. Metered rates for local trips. No surge pricing during rain or rush hour - ever.</p>
            </div>
            <div className="feature-card">
              <h3>Safety & Cleanliness</h3>
              <p>Every vehicle in our fleet undergoes rigorous daily sanitization and mechanical inspections. Your safety is our non-negotiable priority.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Services */}
      <section className="section bg-alt">
        <div className="container">
          <h2 className="section-title">Our Core Services</h2>
          <div className="services-grid">
            <div className="service-card">
              <h3>Lambert Airport Transfers (STL)</h3>
              <p>Stress-free curb-to-curb service for Terminal 1 and Terminal 2.</p>
            </div>
            <div className="service-card">
              <h3>Corporate Car Service</h3>
              <p>Reliable transportation for St. Louis businesses, professional service for your clients and employees.</p>
            </div>
            <div className="service-card">
              <h3>Local Taxi Service</h3>
              <p>Dependable rides for medical appointments, shopping, or nights out in West County.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Area Highlight */}
      <section className="section service-area">
        <div className="container">
          <div className="service-area-content">
            <h2>Proudly Serving St. Louis County</h2>
            <p>Established in 1995, Chesterfield Taxi has been your trusted transportation partner for over 30 years. Based in Overland, our fleet covers the entire region, including Clayton, Ladue, Town and Country, Creve Coeur, Maryland Heights, Wildwood, and St. Charles.</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section testimonials">
        <div className="container">
          <div className="testimonial-card">
            <blockquote>"I've used Chesterfield Taxi for my weekly airport commutes for two years. Zemene and his team are always punctual, and the cars are immaculate. Highly recommended over Uber for reliability."</blockquote>
            <cite>– Sarah J., Clayton, MO</cite>
          </div>
          <div className="cta-container">
            <h3>Ready to upgrade your ride?</h3>
            <div className="hero-buttons">
              <Link to="/reservations" className="btn btn-primary">Book Online</Link>
              <a href="tel:3147380100" className="btn btn-secondary">Call (314) 738-0100</a>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        .hero {
          background-color: #1a1a1a;
          color: white;
          padding: var(--spacing-xl) 0;
          text-align: center;
          background-image: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80');
          background-size: cover;
          background-position: center;
          min-height: 60vh;
          display: flex;
          align-items: center;
        }

        .hero h1 {
          font-size: 2.5rem;
          margin-bottom: var(--spacing-md);
          color: white;
        }

        .hero-subtitle {
          font-size: 1.2rem;
          margin-bottom: var(--spacing-lg);
          max-width: 800px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-buttons {
          display: flex;
          gap: var(--spacing-md);
          justify-content: center;
          flex-wrap: wrap;
        }

        .booking-bar {
          background-color: var(--color-primary);
          padding: var(--spacing-lg) 0;
          margin-top: -3rem;
          position: relative;
          z-index: 10;
          box-shadow: var(--shadow-lg);
        }

        .booking-bar h2 {
          text-align: center;
          color: white;
          margin-bottom: var(--spacing-md);
          font-size: 1.5rem;
        }

        .booking-placeholder {
          display: flex;
          gap: var(--spacing-md);
          justify-content: center;
          flex-wrap: wrap;
        }

        .booking-placeholder input {
          padding: var(--spacing-sm) var(--spacing-md);
          border: 1px solid var(--color-secondary);
          border-radius: var(--radius-sm);
          min-width: 200px;
        }

        .section-title {
          text-align: center;
          margin-bottom: var(--spacing-xl);
          font-size: 2rem;
        }

        .features-grid, .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: var(--spacing-lg);
        }

        .feature-card, .service-card {
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          background-color: var(--color-background);
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s;
        }

        .feature-card:hover, .service-card:hover {
          transform: translateY(-5px);
          box-shadow: var(--shadow-md);
        }

        .feature-card h3, .service-card h3 {
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-sm);
        }

        .bg-alt {
          background-color: var(--color-background-alt);
        }

        .service-area {
          background-color: var(--color-secondary);
          color: white;
          text-align: center;
        }

        .service-area h2 {
          color: var(--color-primary);
        }

        .testimonial-card {
          text-align: center;
          max-width: 800px;
          margin: 0 auto var(--spacing-xl);
          font-style: italic;
        }

        .testimonial-card blockquote {
          font-size: 1.2rem;
          margin-bottom: var(--spacing-md);
        }

        .testimonial-card cite {
          font-weight: 600;
          color: var(--color-primary-dark);
        }

        .cta-container {
          text-align: center;
          margin-top: var(--spacing-xl);
        }
      `}</style>
    </div>
  );
};

export default Home;
