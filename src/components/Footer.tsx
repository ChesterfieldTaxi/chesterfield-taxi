import React from 'react';
import { Link } from 'react-router-dom';
import { useCompanyConfig } from '../hooks/useCompanyConfig';

const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const { config } = useCompanyConfig();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <h3 className="footer-logo">{config?.businessInfo.displayName || 'Chesterfield Taxi'} & Car Service</h3>
            <p>Premium transportation services for St. Louis County and beyond.</p>
            <div className="contact-info">
              <p><strong>Phone:</strong> {config?.contactInfo.phone.display || '(314) 738-0100'}</p>
              <p><strong>Email:</strong> {config?.contactInfo.email.general || 'info@chesterfieldtaxi.com'}</p>
            </div>
          </div>

          <div className="footer-col">
            <h4>Quick Links</h4>
            <ul className="footer-links">
              <li><Link to="/">Home</Link></li>
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/reservations">Book a Ride</Link></li>
              <li><Link to="/fleet">Our Fleet</Link></li>
              <li><Link to="/careers">Careers</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Service Areas</h4>
            <ul className="footer-links">
              <li>Chesterfield</li>
              <li>Clayton & Ladue</li>
              <li>Town and Country</li>
              <li>Creve Coeur</li>
              <li>St. Charles</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Legal</h4>
            <ul className="footer-links">
              <li><Link to="/privacy-policy">Privacy Policy</Link></li>
              <li><Link to="/terms-of-service">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {currentYear} Chesterfield Taxi & Car Service. All rights reserved.</p>
        </div>
      </div>
      <style>{`
        .footer {
          background-color: #1a1a1a;
          color: #f0f0f0;
          padding: var(--spacing-xl) 0 var(--spacing-lg);
          margin-top: auto;
        }

        .footer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--spacing-xl);
          margin-bottom: var(--spacing-xl);
        }

        .footer-logo {
          color: var(--color-text-light);
          font-family: var(--font-family-sans);
          margin-bottom: var(--spacing-md);
        }

        .footer-col h4 {
          color: var(--color-text-light);
          font-family: var(--font-family-sans);
          margin-bottom: var(--spacing-md);
          font-size: 1.1rem;
        }

        .footer-links {
          list-style: none;
        }

        .footer-links li {
          margin-bottom: var(--spacing-sm);
        }

        .footer-links a {
          opacity: 0.8;
          transition: opacity 0.2s;
        }

        .footer-links a:hover {
          opacity: 1;
          color: var(--color-primary);
        }

        .contact-info p {
          margin-bottom: var(--spacing-xs);
        }

        .footer-bottom {
          border-top: 1px solid #333;
          padding-top: var(--spacing-lg);
          text-align: center;
          font-size: 0.9rem;
          opacity: 0.6;
        }

        @media print {
          .footer {
            display: none !important;
          }
        }
      `}</style>
    </footer>
  );
};

export default Footer;
