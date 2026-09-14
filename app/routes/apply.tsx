import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { CarIcon, UserIcon, MailIcon, PhoneIcon } from '../components/ui/Icons';
import { collection, addDoc, getFirestore } from 'firebase/firestore';
import { getFirebaseApp } from '../core/services/firebase';

export function meta() {
  return [
    { title: 'Careers & Applications – Chesterfield Taxi' },
    { name: 'description', content: 'Apply for driving, dispatch, or corporate roles at Chesterfield Taxi.' },
  ];
}

export default function Apply() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    role: 'driver',
    fullName: '',
    email: '',
    phone: '',
    address: '',
    driversLicense: '',
    experienceYears: '0-1',
    coverLetter: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const db = getFirestore(getFirebaseApp());
      await addDoc(collection(db, 'applications'), {
        ...formData,
        status: 'PENDING_REVIEW',
        submittedAt: new Date().toISOString(),
      });
      setSuccess(true);
    } catch (err: any) {
      console.error('Error submitting application:', err);
      setError(err.message || 'Failed to submit application. Please try again or contact us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-6 bg-slate-50">
        <Card className="max-w-md w-full text-center shadow-xl border-slate-200">
          <CardContent className="p-8 space-y-6">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900">Application Received</h2>
            <p className="text-slate-600">
              Thank you for applying to join the Chesterfield Taxi team! Our recruiting team will review your application and contact you within 2-3 business days.
            </p>
            <Button onClick={() => navigate('/')} className="w-full">Return Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900">Join Our Team</h1>
          <p className="text-slate-600 max-w-xl mx-auto">
            We are always looking for professional drivers, experienced dispatchers, and reliable office staff to join the Chesterfield Taxi family.
          </p>
        </div>

        <Card className="shadow-xl border-slate-200">
          <CardHeader className="border-b border-slate-100 bg-white rounded-t-xl">
            <CardTitle>Employment Application</CardTitle>
          </CardHeader>
          <CardContent className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert variant="error" title="Submission Error">
                  {error}
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Position Applying For *</label>
                  <select
                    name="role"
                    required
                    value={formData.role}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="driver">Professional Driver (Company Unit)</option>
                    <option value="owner_operator">Driver (Owner-Operator)</option>
                    <option value="dispatcher">Dispatcher</option>
                    <option value="accountant">Accountant / Clerical</option>
                    <option value="field_supervisor">Field Supervisor</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Full Name *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      name="fullName"
                      required
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Email Address *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <MailIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Phone Number *</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <PhoneIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Years of Experience</label>
                  <select
                    name="experienceYears"
                    value={formData.experienceYears}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0-1">Less than 1 year</option>
                    <option value="1-3">1 to 3 years</option>
                    <option value="3-5">3 to 5 years</option>
                    <option value="5+">5+ years</option>
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Home Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Street, City, State, Zip"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {(formData.role === 'driver' || formData.role === 'owner_operator') && (
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="block text-sm font-semibold text-slate-700">Driver's License Number & State *</label>
                    <input
                      type="text"
                      name="driversLicense"
                      required
                      value={formData.driversLicense}
                      onChange={handleInputChange}
                      placeholder="e.g., MO J123456789"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Required for MVR background check.</p>
                  </div>
                )}

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700">Cover Letter / Additional Details</label>
                  <textarea
                    name="coverLetter"
                    rows={4}
                    value={formData.coverLetter}
                    onChange={handleInputChange}
                    placeholder="Tell us why you'd be a great fit, or list your vehicle details if applying as an owner-operator."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  ></textarea>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto min-w-[200px]">
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
