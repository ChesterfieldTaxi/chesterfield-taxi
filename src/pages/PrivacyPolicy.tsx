import React from 'react';

const PrivacyPolicy: React.FC = () => {
    return (
        <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '40px 20px',
            lineHeight: '1.6',
            color: '#374151'
        }}>
            <h1 style={{ fontSize: '32px', marginBottom: '24px', color: '#111827' }}>Privacy Policy</h1>
            <p style={{ color: '#6b7280', marginBottom: '40px' }}>Last Updated: November 22, 2025</p>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>1. Information We Collect</h2>
                <p>We collect information you provide directly to us when you book a ride, including:</p>
                <ul style={{ paddingLeft: '20px', marginTop: '12px' }}>
                    <li>Name and contact information (phone number, email address)</li>
                    <li>Pickup and drop-off locations</li>
                    <li>Flight details (if applicable)</li>
                    <li>Payment information</li>
                    <li>Special requests and notes</li>
                </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>2. How We Use Your Information</h2>
                <p>We use the information we collect to:</p>
                <ul style={{ paddingLeft: '20px', marginTop: '12px' }}>
                    <li>Provide, maintain, and improve our transportation services</li>
                    <li>Process your booking and payments</li>
                    <li>Send you booking confirmations and updates</li>
                    <li>Respond to your comments and questions</li>
                    <li>Comply with legal obligations</li>
                </ul>
            </section>

            <section style={{
                marginBottom: '32px',
                backgroundColor: '#f3f4f6',
                padding: '24px 20px',
                borderRadius: '8px',
                margin: '0 -20px' // Negative margin to align text with other sections while keeping background
            }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>3. Communication Consent (TCPA Compliance)</h2>
                <p>By providing your phone number and checking the consent box during booking, you expressly consent to receive non-marketing and marketing text messages and calls from Chesterfield Taxi, including those made with an autodialer or prerecorded voice, at the phone number provided.</p>
                <p style={{ marginTop: '12px' }}><strong>Consent is not a condition of purchase.</strong> You may opt-out of receiving marketing communications at any time by replying STOP to any text message or by contacting us directly.</p>
                <p style={{ marginTop: '12px' }}>Standard message and data rates may apply. Frequency of messages varies based on your booking activity.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>4. Data Security</h2>
                <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. Payment information is processed securely through PCI-compliant payment processors.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>5. Data Sharing</h2>
                <p>We do not sell your personal information. We may share your information with:</p>
                <ul style={{ paddingLeft: '20px', marginTop: '12px' }}>
                    <li>Drivers and dispatchers to fulfill your ride request</li>
                    <li>Service providers (e.g., payment processors, cloud hosting)</li>
                    <li>Legal authorities when required by law</li>
                </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>6. Your Rights</h2>
                <p>You have the right to access, correct, or delete your personal information. To exercise these rights, please contact us using the information below.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>7. Contact Us</h2>
                <p>If you have any questions about this Privacy Policy, please contact us at:</p>
                <div style={{ marginTop: '16px' }}>
                    <p><strong>Chesterfield Taxi</strong></p>
                    <p>Phone: <a href="tel:+13147380100" style={{ color: '#2563eb' }}>(314) 738-0100</a></p>
                    <p>Email: <a href="mailto:support@chesterfieldtaxi.com" style={{ color: '#2563eb' }}>support@chesterfieldtaxi.com</a></p>
                </div>
            </section>
        </div>
    );
};

export default PrivacyPolicy;
