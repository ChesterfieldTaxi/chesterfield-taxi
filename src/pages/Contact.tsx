import React, { useState } from 'react';
import { useCompanyConfig } from '../hooks/useCompanyConfig';
import { submitContactInquiry } from '../services/contactService';
import { useToast } from '../shared/hooks/useToast';
import { ENV } from '../config/env';

const Contact: React.FC = () => {
  const { config } = useCompanyConfig();
  const { success: showSuccess, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [inquiryId, setInquiryId] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const id = await submitContactInquiry(formData);

      setInquiryId(id);
      setIsSubmitted(true);
      showSuccess(`Message sent successfully! Reference ID: ${id}`);

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: 'General Inquiry',
        message: ''
      });
    } catch (error) {
      console.error('Submission error:', error);
      showError(error instanceof Error ? error.message : 'Failed to send message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
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
          {/* Left Column: Info & Hours */}
          <div className="contact-info-col">
            {/* Contact Info Card */}
            <div className="info-card glass-panel">
              <h2>Get in Touch</h2>

              <div className="info-item">
                <div className="icon-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                </div>
                <div className="info-content">
                  <h3>Dispatch & Reservations</h3>
                  <p>
                    <a href={`tel:${config?.contactInfo.phone.dialable || '+13147380100'}`}>
                      {config?.contactInfo.phone.display || '(314) 738-0100'}
                    </a>
                  </p>
                </div>
              </div>

              <div className="info-item">
                <div className="icon-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </div>
                <div className="info-content">
                  <h3>Email</h3>
                  <p>
                    <a href={`mailto:${config?.contactInfo.email.general || 'info@chesterfieldtaxi.com'}`}>
                      {config?.contactInfo.email.general || 'info@chesterfieldtaxi.com'}
                    </a>
                  </p>
                </div>
              </div>

              <div className="info-item">
                <div className="icon-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                </div>
                <div className="info-content">
                  <h3>Headquarters</h3>
                  <address>
                    {config?.contactInfo.address.street || '1814 Woodson Road'}<br />
                    {config?.contactInfo.address.city || 'Overland'}, {config?.contactInfo.address.state || 'MO'} {config?.contactInfo.address.zip || '63114'}
                  </address>
                </div>
              </div>
            </div>

            {/* Business Hours Card */}
            <div className="hours-card glass-panel dark">
              <h2>Business Hours</h2>
              <div className="hours-list">
                <div className="hours-item">
                  <span className="day">Dispatch Office</span>
                  <span className="time">24/7</span>
                </div>
                <div className="hours-item">
                  <span className="day">Phone Support</span>
                  <span className="time">24 Hours Daily</span>
                </div>
                <div className="hours-item">
                  <span className="day">Office Visits</span>
                  <span className="time">Mon-Fri: 9am - 5pm</span>
                </div>
              </div>
              <p className="hours-note">For immediate dispatch, call anytime. For administrative inquiries, visit during office hours.</p>
            </div>
          </div>

          {/* Right Column: Contact Form OR Confirmation */}
          <div className="contact-form-col">
            {isSubmitted ? (
              <div className="form-container glass-panel">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '64px', color: 'var(--color-primary)', marginBottom: '1rem' }}>✓</div>
                  <h2 style={{ marginBottom: '1rem' }}>Message Sent Successfully!</h2>
                  <p style={{ color: '#666', marginBottom: '1.5rem' }}>
                    Thank you for contacting Chesterfield Taxi. We've received your message and will respond as soon as possible.
                  </p>
                  <div style={{ backgroundColor: '#f5f5f5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                    <span style={{ color: '#666', fontSize: '0.9rem' }}>Reference ID: </span>
                    <strong style={{ color: 'var(--color-primary-dark)', fontSize: '1.1rem' }}>{inquiryId}</strong>
                  </div>
                  <div style={{ textAlign: 'left', backgroundColor: '#f9f9f9', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>What Happens Next?</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e0e0e0' }}>✓ Our team will review your inquiry</li>
                      <li style={{ padding: '0.5rem 0', borderBottom: '1px solid #e0e0e0' }}>✓ You'll receive a response within 24 hours</li>
                      <li style={{ padding: '0.5rem 0' }}>✓ Keep your reference ID for follow-up</li>
                    </ul>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => setIsSubmitted(false)}
                    style={{ width: '100%' }}
                  >
                    Send Another Message
                  </button>
                </div>
              </div>
            ) : (
              <div className="form-container glass-panel">
                <h2>Send us a Message</h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="name">Name</label>
                      <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} placeholder="Your Name" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="email">Email</label>
                      <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} placeholder="your@email.com" />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="phone">Phone</label>
                      <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="(555) 555-5555" />
                    </div>
                    <div className="form-group">
                      <label htmlFor="subject">Subject</label>
                      <select id="subject" name="subject" value={formData.subject} onChange={handleChange}>
                        <option value="General Inquiry">General Inquiry</option>
                        <option value="Lost & Found">Lost & Found</option>
                        <option value="Corporate Account">Corporate Account</option>
                        <option value="Feedback">Feedback</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="message">Message</label>
                    <textarea id="message" name="message" rows={5} required value={formData.message} onChange={handleChange} placeholder="How can we help you?"></textarea>
                  </div>

                  <button type="submit" className="btn btn-primary full-width-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Map Section - Full Width Below */}
        <div className="map-section">
          <div className="map-container">
            <iframe
              title="Office Location"
              width="100%"
              height="450"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps/embed/v1/place?key=${ENV.MAPS_API_KEY}&q=${encodeURIComponent(
                `${config?.contactInfo.address.street || '1814 Woodson Rd'}, ${config?.contactInfo.address.city || 'Overland'}, ${config?.contactInfo.address.state || 'MO'} ${config?.contactInfo.address.zip || '63114'}`
              )}`}
            ></iframe>
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
          padding: 4rem 0;
          text-align: center;
          background-image: linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url('/vehicles/sedan.png');
          background-size: cover;
          background-position: center;
        }

        .page-header h1 {
          color: white;
          font-family: var(--font-family-sans);
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .page-subtitle {
          font-size: 1.25rem;
          opacity: 0.9;
          max-width: 600px;
          margin: 0 auto;
        }

        .contact-grid {
          display: grid;
          grid-template-columns: 1fr 1.5fr;
          gap: 3rem;
          margin-bottom: 3rem;
          align-items: stretch; /* Ensure columns stretch to same height */
        }

        .contact-info-col {
          display: flex;
          flex-direction: column;
          gap: 2rem; /* Replace margin-bottom on cards with gap here if needed, or keep margins */
        }
        
        .info-card {
          /* margin-bottom handled by gap or keep it */
        }

        .hours-card {
          flex: 1; /* Stretch to fill remaining space if form is taller */
          display: flex;
          flex-direction: column;
        }
        
        .hours-list {
          flex: 1; /* Push content to fill space */
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin: 1.5rem 0;
          justify-content: center;
        }

        .contact-form-col {
          height: 100%;
        }

        .form-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .form-container form {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .form-group:last-of-type {
          margin-bottom: auto; /* Push button to bottom if needed */
        }

        .glass-panel {
          background: white;
          border-radius: var(--radius-md);
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
          padding: 2rem;
          border: 1px solid rgba(0,0,0,0.05);
        }

        .glass-panel.dark {
          background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
          color: white;
        }

        .info-card h2, .form-container h2 {
          color: var(--color-primary-dark);
          margin-bottom: 1.5rem;
          font-size: 1.5rem;
          border-bottom: 2px solid var(--color-primary);
          padding-bottom: 0.5rem;
          display: inline-block;
        }
        
        .glass-panel.dark h2 {
          color: white;
          border-bottom-color: var(--color-primary);
        }

        .info-item {
          display: flex;
          align-items: flex-start;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .icon-wrapper {
          background-color: rgba(212, 175, 55, 0.1);
          color: var(--color-primary-dark);
          padding: 0.75rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .info-content h3 {
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #666;
          margin-bottom: 0.25rem;
        }

        .info-content p, .info-content address {
          font-size: 1.1rem;
          font-weight: 500;
          color: #333;
          font-style: normal;
          line-height: 1.4;
        }

        .info-content a {
          color: var(--color-primary-dark);
          text-decoration: none;
          transition: color 0.2s;
        }

        .info-content a:hover {
          color: var(--color-primary);
        }

        /* .hours-list defined above */

        .hours-item {
          display: flex;
          justify-content: space-between;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }

        .hours-item:last-child {
          border-bottom: none;
        }

        .hours-item .day {
          color: white; /* Fixed contrast: was var(--color-primary) */
          font-weight: 600;
        }

        .hours-item .time {
          color: rgba(255,255,255,0.9);
        }

        .hours-note {
          font-size: 0.9rem;
          opacity: 0.7;
          font-style: italic;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #444;
          font-size: 0.95rem;
        }

        input, select, textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid #ddd;
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 1rem;
          transition: all 0.2s;
          background-color: #f9f9f9;
        }

        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--color-primary);
          background-color: white;
          box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.1);
        }

        .full-width-btn {
          width: 100%;
          padding: 1rem;
          font-size: 1.1rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .map-section {
          margin-top: 3rem;
        }

        .map-container {
          height: 400px;
          background-color: #eee;
          border-radius: var(--radius-md);
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .map-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
          background-color: #e0e0e0;
          font-weight: 500;
        }

        .section-title {
          text-align: center;
          margin-bottom: 3rem;
          font-size: 2rem;
          color: var(--color-primary-dark);
        }

        .faq-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .faq-item {
          background: white;
          padding: 2rem;
          border-radius: var(--radius-md);
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          border-left: 4px solid var(--color-primary);
        }

        .faq-item h3 {
          color: var(--color-primary-dark);
          font-size: 1.1rem;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }

        .faq-item p {
          color: #555;
          line-height: 1.6;
          margin: 0;
        }

        @media (max-width: 900px) {
          .contact-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
          
          .form-row {
            grid-template-columns: 1fr;
            gap: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default Contact;
