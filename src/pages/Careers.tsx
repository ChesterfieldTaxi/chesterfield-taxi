import React, { useState } from 'react';

const Careers: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    licenseNumber: '',
    experience: '',
    hasClassE: 'no',
    resume: null as File | null,
    licenseCopy: null as File | null
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (files && files[0]) {
      setFormData(prev => ({ ...prev, [name]: files[0] }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Application submitted:', formData);
    alert('Thank you for your application! We will review your details and contact you if your qualifications match our needs.');
  };

  return (
    <div className="careers-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="container">
          <h1>Drive with Chesterfield Taxi</h1>
          <p className="page-subtitle">Build a career with a company that values your work.</p>
        </div>
      </header>

      {/* The Chesterfield Advantage */}
      <section className="section">
        <div className="container">
          <div className="careers-content">
            <h2>Why Professional Drivers Choose Us</h2>
            <p>Unlike gig-economy apps, we offer stability and support.</p>
            <div className="benefits-grid">
              <div className="benefit-card">
                <h3>Competitive Earnings</h3>
                <p>Keep more of what you earn with fair splits and tips.</p>
              </div>
              <div className="benefit-card">
                <h3>Real Support</h3>
                <p>Talk to a real dispatcher, not a chatbot. We have your back on the road.</p>
              </div>
              <div className="benefit-card">
                <h3>Flexible Scheduling</h3>
                <p>Full-time and part-time shifts available to fit your life.</p>
              </div>
              <div className="benefit-card">
                <h3>Great Customers</h3>
                <p>Serve corporate clients and regulars who appreciate professional service.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Requirements */}
      <section className="section bg-alt">
        <div className="container">
          <div className="careers-content">
            <h2>Requirements</h2>
            <ul className="requirements-list">
              <li>Valid Class E Chauffeur’s License (or CDL).</li>
              <li>Clean driving record (MVR check required).</li>
              <li>Must pass a criminal background check and drug screening.</li>
              <li>Minimum age of 25 (for insurance purposes).</li>
              <li>Strong knowledge of St. Louis County roads.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="section">
        <div className="container">
          <div className="form-container">
            <h2>Apply Now</h2>
            <form onSubmit={handleSubmit} className="application-form">
              <fieldset>
                <legend>Personal Details</legend>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="name">Full Name</label>
                    <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email Address</label>
                    <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone Number</label>
                    <input type="tel" id="phone" name="phone" required value={formData.phone} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="address">Address</label>
                    <input type="text" id="address" name="address" required value={formData.address} onChange={handleChange} />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>Qualifications</legend>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="licenseNumber">License Number</label>
                    <input type="text" id="licenseNumber" name="licenseNumber" required value={formData.licenseNumber} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="experience">Years of Professional Driving Experience</label>
                    <input type="number" id="experience" name="experience" min="0" required value={formData.experience} onChange={handleChange} />
                  </div>
                  <div className="form-group full-width">
                    <label htmlFor="hasClassE">Do you currently hold a Class E License?</label>
                    <select id="hasClassE" name="hasClassE" value={formData.hasClassE} onChange={handleChange}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend>Documents</legend>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="resume">Upload Resume (PDF/Image)</label>
                    <input type="file" id="resume" name="resume" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="licenseCopy">Copy of License (PDF/Image)</label>
                    <input type="file" id="licenseCopy" name="licenseCopy" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                  </div>
                </div>
              </fieldset>

              <div className="form-footer">
                <button type="submit" className="btn btn-primary">Submit Application</button>
              </div>
            </form>
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

        .careers-content {
          max-width: 900px;
          margin: 0 auto;
        }

        .careers-content h2 {
          text-align: center;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-lg);
        }

        .careers-content p {
          text-align: center;
          margin-bottom: var(--spacing-xl);
        }

        .benefits-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--spacing-lg);
        }

        .benefit-card {
          background-color: var(--color-background);
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          text-align: center;
          border-top: 4px solid var(--color-primary);
        }

        .benefit-card h3 {
          font-size: 1.1rem;
          margin-bottom: var(--spacing-sm);
        }

        .benefit-card p {
          font-size: 0.9rem;
          margin-bottom: 0;
        }

        .bg-alt {
          background-color: var(--color-background-alt);
        }

        .requirements-list {
          list-style: none;
          max-width: 600px;
          margin: 0 auto;
        }

        .requirements-list li {
          margin-bottom: var(--spacing-md);
          padding-left: var(--spacing-lg);
          position: relative;
        }

        .requirements-list li::before {
          content: '✓';
          color: var(--color-primary);
          position: absolute;
          left: 0;
          font-weight: bold;
        }

        .form-container {
          max-width: 800px;
          margin: 0 auto;
          background-color: white;
          padding: var(--spacing-lg);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
        }

        .form-container h2 {
          text-align: center;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-lg);
        }

        fieldset {
          border: none;
          margin-bottom: var(--spacing-lg);
          padding: 0;
        }

        legend {
          font-size: 1.2rem;
          font-weight: 600;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-md);
          border-bottom: 1px solid var(--color-border);
          width: 100%;
          padding-bottom: var(--spacing-xs);
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: var(--spacing-md);
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
        }

        .full-width {
          grid-column: 1 / -1;
        }

        label {
          font-weight: 500;
          font-size: 0.9rem;
        }

        input, select {
          padding: var(--spacing-sm);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 1rem;
        }

        input:focus, select:focus {
          outline: none;
          border-color: var(--color-primary);
          box-shadow: 0 0 0 2px rgba(212, 175, 55, 0.2);
        }

        .form-footer {
          text-align: center;
          margin-top: var(--spacing-lg);
        }
      `}</style>
    </div>
  );
};

export default Careers;
