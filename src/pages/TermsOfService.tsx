import React from 'react';

const TermsOfService: React.FC = () => {
    return (
        <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            padding: '40px 20px',
            lineHeight: '1.6',
            color: '#374151'
        }}>
            <h1 style={{ fontSize: '32px', marginBottom: '24px', color: '#111827' }}>Terms of Service</h1>
            <p style={{ color: '#6b7280', marginBottom: '40px' }}>Last Updated: November 22, 2025</p>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>1. Acceptance of Terms</h2>
                <p>By accessing or using the services provided by Chesterfield Taxi ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>2. Booking and Cancellations</h2>
                <p><strong>Reservations:</strong> We recommend booking at least 24 hours in advance to guarantee availability. Immediate requests are subject to vehicle availability.</p>
                <p style={{ marginTop: '12px' }}><strong>Cancellations:</strong> Cancellations made less than 2 hours before the scheduled pickup time may be subject to a cancellation fee. No-shows will be charged the full fare.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>3. Fares and Payments</h2>
                <p>Fares are calculated based on distance, time, and vehicle type. Quoted rates are estimates and may vary due to traffic, weather, or route changes. Payment is due at the completion of the ride unless prepaid. We accept major credit cards and cash.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>4. Passenger Conduct</h2>
                <p>Passengers are expected to behave respectfully towards drivers and other passengers. We reserve the right to refuse service to anyone who appears intoxicated, unruly, or poses a safety risk. Smoking and consumption of alcohol (unless in authorized vehicles) are prohibited.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>5. Liability</h2>
                <p>Chesterfield Taxi is not liable for delays caused by traffic, weather, mechanical failure, or other conditions beyond our control. We are not responsible for lost or damaged personal items left in vehicles.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>6. Modifications to Service</h2>
                <p>We reserve the right to modify or discontinue our service at any time without notice. We may also update these Terms of Service from time to time.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '24px', marginBottom: '16px', color: '#1f2937' }}>7. Contact Us</h2>
                <p>If you have any questions about these Terms of Service, please contact us at:</p>
                <div style={{ marginTop: '16px' }}>
                    <p><strong>Chesterfield Taxi</strong></p>
                    <p>Phone: <a href="tel:+13147380100" style={{ color: '#2563eb' }}>(314) 738-0100</a></p>
                    <p>Email: <a href="mailto:support@chesterfieldtaxi.com" style={{ color: '#2563eb' }}>support@chesterfieldtaxi.com</a></p>
                </div>
            </section>
        </div>
    );
};

export default TermsOfService;
