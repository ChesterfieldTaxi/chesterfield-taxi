import React, { useState } from 'react';
import { useCompanyConfig } from '../hooks/useCompanyConfig';

const Contact: React.FC = () => {
  const { config } = useCompanyConfig();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: 'General Inquiry',
    message: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Contact form submitted:', formData);
    alert('Thank you for contacting us! We will get back to you shortly.');
  };

  return (
    <div className="contact-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Contact Us</h1>
          <p className="page-subtitle">We are available 24 hours a day, 7 days a week.</p>
        </div>
      </header>

      <div className="container section">
        <div className="contact-grid">
          {/* Contact Info & Map */}
          <div className="contact-info-col">
            <div className="info-card">
              <h2>Get in Touch</h2>
              <div className="info-item">
                <h3>Dispatch & Reservations</h3>
                <p>
                  <a href={`tel:${config?.contactInfo.phone.dialable || '+13147380100'}`}>
                    {config?.contactInfo.phone.display || '(314) 738-0100'}
                  </a>
                </p>
              </div>
              <div className="info-item">
                <h3>Email</h3>
                <p>
                  Customer Service: <a href={`mailto:${config?.contactInfo.email.general || 'info@chesterfieldtaxi.com'}`}>
                    {config?.contactInfo.email.general || 'info@chesterfieldtaxi.com'}
                  </a>
                </p>
                <p>
                  Bookings: <a href={`mailto:${config?.contactInfo.email.booking || 'bookings@chesterfieldtaxi.com'}`}>
                    {config?.contactInfo.email.booking || 'bookings@chesterfieldtaxi.com'}
                  </a>
                </p>
              </div>
              <div className="info-item">
                <h3>Headquarters</h3>
                <address>
                  {config?.businessInfo.displayName || 'Chesterfield Taxi'} & Car Service<br />
                  {config?.contactInfo.address.street || '1814 Woodson Road'}<br />
                  {config?.contactInfo.address.city || 'Overland'}, {config?.contactInfo.address.state || 'MO'} {config?.contactInfo.address.zip || '63114'}
                </address>
              </div>
            </div>

            <div className="map-container">
              {/* Placeholder for Google Map */}
              <div className="map-placeholder">
                Google Map Embed centered on St. Louis County service area
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="contact-form-col">
            <div className="form-container">
              <h2>Send us a Message</h2>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="name">Name</label>
                  <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="subject">Subject</label>
                  <select id="subject" name="subject" value={formData.subject} onChange={handleChange}>
                    <option value="General Inquiry">General Inquiry</option>
                    <option value="Lost & Found">Lost & Found</option>
                    <option value="Corporate Account Request">Corporate Account Request</option>
                    <option value="Feedback">Feedback</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="message">Message</label>
                  <textarea id="message" name="message" rows={5} required value={formData.message} onChange={handleChange}></textarea>
                </div>
                <button type="submit" className="btn btn-primary full-width-btn">Send Message</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <section className="section bg-alt">
        <div className="container">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <div className="faq-grid">
            <div className="faq-item">
              <h3>Q: How far in advance should I book an airport ride?</h3>
              <p>A: For early morning flights, we strongly recommend booking by 8:00 PM the night before. For other times, a 2-4 hour notice is appreciated to guarantee availability.</p>
            </div>
            <div className="faq-item">
              <h3>Q: Do you accept credit cards?</h3>
              <p>A: Yes, all vehicles are equipped with secure card readers accepting Visa, MasterCard, Amex, and Discover. We also accept cash.</p>
            </div>
            <div className="faq-item">
              <h3>Q: Is there a cancellation fee?</h3>
              <p>A: We request at least 2 hours' notice for cancellations. Cancellations made within 2 hours of pickup may be subject to a fee.</p>
            </div>
            <div className="faq-item">
              <h3>Q: Do you provide car seats for children?</h3>
              <p>A: Yes! We prioritize safety. Child car seats are available for a small additional fee. Please request this specifically when booking.</p>
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

        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-xl);
        }

        .info-card {
          margin-bottom: var(--spacing-lg);
        }

        .info-card h2 {
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
        }

        .info-item {
          margin-bottom: var(--spacing-md);
        }

        .info-item h3 {
          font-size: 1rem;
          margin-bottom: var(--spacing-xs);
          color: #666;
        }

        .info-item p, .info-item address {
          font-size: 1.1rem;
          font-style: normal;
          line-height: 1.6;
        }

        .info-item a {
          color: var(--color-primary-dark);
          font-weight: 500;
        }

        .map-container {
          height: 300px;
          background-color: #eee;
          border-radius: var(--radius-md);
          overflow: hidden;
        }

        .map-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          background-color: #e0e0e0;
          text-align: center;
          padding: var(--spacing-md);
        }

        .form-container {
          background-color: white;
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          border: 1px solid var(--color-border);
        }

        .form-container h2 {
          margin-bottom: var(--spacing-md);
        }

        .form-group {
          margin-bottom: var(--spacing-md);
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
        }

        label {
          font-weight: 500;
          font-size: 0.9rem;
        }

        input, select, textarea {
          padding: var(--spacing-sm);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 1rem;
          width: 100%;
        }

        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
        }

        .full-width-btn {
          width: 100%;
        }

        .bg-alt {
          background-color: var(--color-background-alt);
        }

        .section-title {
          text-align: center;
          margin-bottom: var(--spacing-xl);
        }

        .faq-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: var(--spacing-lg);
        }

        .faq-item {
          background-color: white;
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
        }

        .faq-item h3 {
          color: var(--color-primary-dark);
          font-size: 1.1rem;
          margin-bottom: var(--spacing-sm);
        }

        @media (max-width: 768px) {
          .contact-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default Contact;
