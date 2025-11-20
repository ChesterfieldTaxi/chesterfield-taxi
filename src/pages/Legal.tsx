import React from 'react';

const Legal: React.FC = () => {
  return (
    <div className="legal-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Legal & Policies</h1>
        </div>
      </header>

      <div className="container section">
        <div className="legal-content">
          {/* Privacy Policy */}
          <section className="policy-section">
            <h2>Privacy Policy</h2>
            <p>At Chesterfield Taxi, we value your trust. We collect only the information necessary to provide transportation services (Name, Contact Info, Pickup/Dropoff locations). We do not sell, trade, or transfer your personal data to outside parties. All payment data is processed via secure, encrypted gateways (Square/Stripe).</p>
          </section>

          <hr className="divider" />

          {/* Terms of Service */}
          <section className="policy-section">
            <h2>Terms of Service</h2>

            <div className="policy-item">
              <h3>Reservations</h3>
              <p>Online requests are not confirmed until you receive a confirmation email or call from our dispatch team.</p>
            </div>

            <div className="policy-item">
              <h3>Wait Time</h3>
              <p>For airport pickups, we offer a grace period after flight arrival. For non-airport pickups, wait time charges may apply after 10 minutes.</p>
            </div>

            <div className="policy-item">
              <h3>Cleaning Fee</h3>
              <p>A cleaning fee may be assessed for any damage or excessive mess requiring professional cleaning.</p>
            </div>

            <div className="policy-item">
              <h3>Zero Tolerance</h3>
              <p>We maintain a strict zero-tolerance policy regarding drug and alcohol use for our drivers. If you suspect a driver is under the influence, please terminate the ride safely and contact us immediately.</p>
            </div>
          </section>
        </div>
      </div>

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

        .legal-content {
          max-width: 800px;
          margin: 0 auto;
          background-color: white;
          padding: var(--spacing-xl);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--color-border);
        }

        .policy-section h2 {
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
          border-bottom: 2px solid var(--color-background-alt);
          padding-bottom: var(--spacing-sm);
        }

        .policy-section p {
          margin-bottom: var(--spacing-lg);
          line-height: 1.8;
        }

        .policy-item {
          margin-bottom: var(--spacing-lg);
        }

        .policy-item h3 {
          font-size: 1.1rem;
          margin-bottom: var(--spacing-xs);
          font-weight: 600;
        }

        .policy-item p {
          margin-bottom: 0;
        }

        .divider {
          border: 0;
          height: 1px;
          background-color: var(--color-border);
          margin: var(--spacing-xl) 0;
        }
      `}</style>
    </div>
  );
};

export default Legal;
