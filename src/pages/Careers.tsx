import React, { useState } from 'react';
import { submitCareerApplication, CareerApplicationData } from '../services/careersService';
import { useToast } from '../shared/hooks/useToast';
import { FILE_SIZE_LIMITS } from '../services/storageService';
import { PageHeader } from '../components/PageHeader';

const Careers: React.FC = () => {
  const { success: showSuccess, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [applicationId, setApplicationId] = useState('');
  const [formData, setFormData] = useState<CareerApplicationData>({
    roleType: 'driver',
    name: '',
    email: '',
    phone: '',
    address: '',
    // Driver specific
    licenseNumber: '',
    experience: '',
    hasClassE: 'no',
    resume: null,
    licenseCopy: null,
    // Dispatcher specific
    customerServiceExperience: '',
    dispatchExperience: 'no',
    computerSkills: 'intermediate',
    availability: ''
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    // Validate file sizes before upload
    if (formData.resume && formData.resume.size > FILE_SIZE_LIMITS.RESUME) {
      const limitMB = (FILE_SIZE_LIMITS.RESUME / (1024 * 1024)).toFixed(1);
      showError(`Resume file size exceeds ${limitMB}MB limit`);
      return;
    }

    if (formData.licenseCopy && formData.licenseCopy.size > FILE_SIZE_LIMITS.LICENSE) {
      const limitMB = (FILE_SIZE_LIMITS.LICENSE / (1024 * 1024)).toFixed(1);
      showError(`License file size exceeds ${limitMB}MB limit`);
      return;
    }

    setIsSubmitting(true);

    try {
      const id = await submitCareerApplication(formData);

      setApplicationId(id);
      setIsSubmitted(true);
      showSuccess(`Application submitted successfully! Reference ID: ${id}`);

      // Reset form
      setFormData({
        roleType: 'driver',
        name: '',
        email: '',
        phone: '',
        address: '',
        licenseNumber: '',
        experience: '',
        hasClassE: 'no',
        resume: null,
        licenseCopy: null,
        customerServiceExperience: '',
        dispatchExperience: 'no',
        computerSkills: 'intermediate',
        availability: ''
      });

      // Reset file inputs
      const resumeInput = document.getElementById('resume') as HTMLInputElement;
      const licenseInput = document.getElementById('licenseCopy') as HTMLInputElement;
      if (resumeInput) resumeInput.value = '';
      if (licenseInput) licenseInput.value = '';
    } catch (error) {
      console.error('Submission error:', error);
      showError(error instanceof Error ? error.message : 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="careers-page">
      <PageHeader
        title="Join the Chesterfield Taxi Team"
        subtitle="Build a career with a company that values your work."
        backgroundImage="/vehicles/minivan.png"
      />

      {/* The Chesterfield Advantage */}
      <section className="section">
        <div className="container">
          <div className="careers-content">
            <h2>Why Professional Drivers Choose Us</h2>
            <p>Unlike gig-economy apps, we offer stability and support.</p>
            <div className="benefits-grid">
              <div className="benefit-card">
                <h3>Competitive Pay</h3>
                <p>{formData.roleType === 'driver' ? 'Keep more of what you earn with fair splits and tips.' : 'Hourly wage with performance bonuses.'}</p>
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
            {formData.roleType === 'driver' ? (
              <ul className="requirements-list">
                <li>Valid Class E Chauffeur’s License (or CDL).</li>
                <li>Clean driving record (MVR check required).</li>
                <li>Must pass a criminal background check and drug screening.</li>
                <li>Minimum age of 25 (for insurance purposes).</li>
                <li>Strong knowledge of St. Louis County roads.</li>
              </ul>
            ) : (
              <ul className="requirements-list">
                <li>Excellent communication and multitasking skills.</li>
                <li>Customer service experience (minimum 2 years preferred).</li>
                <li>Ability to work under pressure during peak hours.</li>
                <li>Basic computer proficiency (dispatch software training provided).</li>
                <li>Must pass background check.</li>
                <li>Flexible schedule (evening/weekend shifts available).</li>
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="section">
        <div className="container">
          {isSubmitted ? (
            <div className="form-container">
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div style={{ fontSize: '64px', color: 'var(--color-primary)', marginBottom: '1rem' }}>✓</div>
                <h2 style={{ marginBottom: '1rem' }}>Application Submitted!</h2>
                <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                  Thank you for your interest in joining the Chesterfield Taxi team. We have received your application and documents.
                </p>
                <div style={{ backgroundColor: '#f5f5f5', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', display: 'inline-block', minWidth: '300px' }}>
                  <span style={{ color: '#666', fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem' }}>Application Reference ID</span>
                  <strong style={{ color: 'var(--color-primary-dark)', fontSize: '1.5rem', letterSpacing: '1px' }}>{applicationId}</strong>
                </div>
                <div style={{ textAlign: 'left', maxWidth: '600px', margin: '0 auto', backgroundColor: '#f9f9f9', padding: '2rem', borderRadius: '8px', marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-primary-dark)' }}>Next Steps</h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    <li style={{ padding: '0.8rem 0', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-primary)', marginRight: '10px', fontWeight: 'bold' }}>1.</span>
                      Review: Our hiring team will review your qualifications and documents.
                    </li>
                    <li style={{ padding: '0.8rem 0', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-primary)', marginRight: '10px', fontWeight: 'bold' }}>2.</span>
                      Contact: If your profile matches our needs, we will contact you within 3-5 business days.
                    </li>
                    <li style={{ padding: '0.8rem 0', display: 'flex', alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-primary)', marginRight: '10px', fontWeight: 'bold' }}>3.</span>
                      Interview: Qualified candidates will be invited for an in-person interview.
                    </li>
                  </ul>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setIsSubmitted(false)}
                >
                  Submit Another Application
                </button>
              </div>
            </div>
          ) : (
            <div className="form-container">
              <h2>Apply Now</h2>
              <form onSubmit={handleSubmit} className="application-form">
                <fieldset>
                  <legend>Position Applying For</legend>
                  <div className="role-selection">
                    <label className="role-option">
                      <input
                        type="radio"
                        name="roleType"
                        value="driver"
                        checked={formData.roleType === 'driver'}
                        onChange={handleChange}
                      />
                      <div className="role-card">
                        <h3>Driver</h3>
                        <p>Professional taxi driver positions. Full-time and part-time available.</p>
                      </div>
                    </label>
                    <label className="role-option">
                      <input
                        type="radio"
                        name="roleType"
                        value="dispatcher"
                        checked={formData.roleType === 'dispatcher'}
                        onChange={handleChange}
                      />
                      <div className="role-card">
                        <h3>Dispatcher</h3>
                        <p>Coordinate rides and support drivers from our dispatch center.</p>
                      </div>
                    </label>
                  </div>
                </fieldset>

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
                    {formData.roleType === 'driver' ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <div className="form-group">
                          <label htmlFor="customerServiceExperience">Years of Customer Service Experience</label>
                          <input type="number" id="customerServiceExperience" name="customerServiceExperience" min="0" required value={formData.customerServiceExperience} onChange={handleChange} />
                        </div>
                        <div className="form-group">
                          <label htmlFor="computerSkills">Computer Proficiency</label>
                          <select id="computerSkills" name="computerSkills" value={formData.computerSkills} onChange={handleChange}>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </select>
                        </div>
                        <div className="form-group full-width">
                          <label htmlFor="dispatchExperience">Do you have previous dispatch experience?</label>
                          <select id="dispatchExperience" name="dispatchExperience" value={formData.dispatchExperience} onChange={handleChange}>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </div>
                        <div className="form-group full-width">
                          <label htmlFor="availability">Availability (Days/Hours)</label>
                          <input type="text" id="availability" name="availability" placeholder="e.g., Weekends, Evenings, Mon-Fri" required value={formData.availability} onChange={handleChange} />
                        </div>
                      </>
                    )}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Documents</legend>
                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="resume">Upload Resume (PDF/Image)</label>
                      <input type="file" id="resume" name="resume" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                    </div>
                    {formData.roleType === 'driver' && (
                      <div className="form-group">
                        <label htmlFor="licenseCopy">Copy of License (PDF/Image)</label>
                        <input type="file" id="licenseCopy" name="licenseCopy" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileChange} />
                      </div>
                    )}
                  </div>
                </fieldset>

                <div className="form-footer">
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting Application...' : 'Submit Application'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>

      <style>{`

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
          padding: var(--spacing-xl);
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
          margin-bottom: var(--spacing-xl);
          padding: 0;
        }

        legend {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-lg);
          border-bottom: 2px solid var(--color-border);
          width: 100%;
          padding-bottom: var(--spacing-xs);
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: var(--spacing-lg);
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
          font-weight: 600;
          font-size: 0.9rem;
          color: #444;
        }

        input, select {
          padding: 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          font-family: inherit;
          font-size: 1rem;
          background-color: #f9f9f9;
          transition: all 0.2s;
        }

        input:focus, select:focus {
          outline: none;
          border-color: var(--color-primary);
          background-color: white;
          box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.15);
        }
        
        input[type="file"] {
          padding: 0.5rem;
          background-color: white;
        }

        .form-footer {
          text-align: center;
          margin-top: var(--spacing-xl);
        }
        
        .form-footer button {
          padding: 1rem 3rem;
          font-size: 1.1rem;
        }

        .role-selection {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-lg);
        }

        .role-option {
          cursor: pointer;
        }

        .role-option input {
          display: none;
        }

        .role-card {
          border: 2px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--spacing-lg);
          text-align: center;
          height: 100%;
          transition: all 0.2s ease;
          background-color: white;
        }
        
        .role-option:hover .role-card {
          transform: translateY(-2px);
          box-shadow: var(--shadow-sm);
          border-color: #ccc;
        }

        .role-option input:checked + .role-card {
          border-color: var(--color-primary);
          background-color: rgba(212, 175, 55, 0.05);
          box-shadow: 0 4px 12px rgba(212, 175, 55, 0.15);
          transform: translateY(-2px);
        }

        .role-card h3 {
          color: var(--color-primary-dark);
          margin-bottom: var(--spacing-sm);
          font-size: 1.2rem;
        }

        .role-card p {
          font-size: 0.95rem;
          margin-bottom: 0;
          color: #666;
          line-height: 1.5;
        }

        @media (max-width: 600px) {
          .role-selection {
            grid-template-columns: 1fr;
          }
          
          .form-container {
            padding: var(--spacing-lg);
          }
        }
      `}</style>
    </div>
  );
};

export default Careers;
