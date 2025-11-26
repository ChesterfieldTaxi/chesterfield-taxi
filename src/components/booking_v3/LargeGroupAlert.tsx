import React from 'react';
import { useCompanyConfig } from '../../hooks/useCompanyConfig';

export const LargeGroupAlert: React.FC = () => {
    const { config } = useCompanyConfig();

    // Use fallbacks if config is loading or unavailable
    const phone = config?.contactInfo.phone || { display: '(314) 738-0100', dialable: '+13147380100' };
    const threshold = config?.bookingLimits.passengers.largeGroupThreshold || 7;
    const is24Hours = config?.operatingHours.is24Hours ?? true;

    return (
        <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            animation: 'slideDown 0.3s ease'
        }}>
            <style>
                {`
                    @keyframes slideDown {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes pulse {
                        0%, 100% { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                        50% { box-shadow: 0 6px 12px rgba(37, 99, 235, 0.3); }
                    }
                `}
            </style>
            <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#f59e0b">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#92400e' }}>
                        Large Group Booking Required
                    </h3>
                    <p style={{ margin: '0.5rem 0 0', color: '#78350f', lineHeight: 1.6 }}>
                        For groups of {threshold} or more passengers,
                        we need to arrange custom transportation which may require multiple vehicles.
                        Please call us directly for a personalized quote.
                    </p>
                    <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <a
                            href={`tel:${phone.dialable}`}
                            style={{
                                backgroundColor: '#2563eb',
                                color: 'white',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                animation: 'pulse 2s infinite'
                            }}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
                            </svg>
                            Call {phone.display}
                        </a>
                        <span style={{ color: '#78350f', fontSize: '14px' }}>
                            {is24Hours ? 'Available 24/7' : 'Call during business hours'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
