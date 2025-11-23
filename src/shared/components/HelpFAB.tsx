import React, { useState } from 'react';

interface HelpLinkProps {
    icon: string;
    label: string;
    href: string;
    subtitle?: string;
    openInNew?: boolean;
}

const HelpLink: React.FC<HelpLinkProps> = ({ icon, label, href, subtitle, openInNew }) => (
    <a
        href={href}
        target={openInNew ? "_blank" : undefined}
        rel={openInNew ? "noopener noreferrer" : undefined}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px',
            textDecoration: 'none',
            color: '#1f2937',
            borderRadius: '8px',
            transition: 'background-color 0.2s',
            border: '1px solid #f3f4f6'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 500, fontSize: '14px' }}>{label}</span>
            {subtitle && <span style={{ fontSize: '12px', color: '#6b7280' }}>{subtitle}</span>}
        </div>
    </a>
);

export const HelpFAB: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.3)',
                        zIndex: 998,
                        animation: 'fadeIn 0.2s ease-out'
                    }}
                />
            )}

            {/* Quick Links Panel */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: '90px',
                    right: '20px',
                    width: '300px',
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    padding: '16px',
                    zIndex: 999,
                    animation: 'slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    transformOrigin: 'bottom right'
                }}>
                    <div style={{ marginBottom: '12px', padding: '0 4px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#111827' }}>Quick Help</h3>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>How can we assist you today?</p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <HelpLink
                            icon="📞"
                            label="Call Us"
                            href="tel:+13147380100"
                            subtitle="(314) 738-0100"
                        />
                        <HelpLink
                            icon="📧"
                            label="Contact Support"
                            href="mailto:support@chesterfieldtaxi.com"
                        />
                        <HelpLink
                            icon="📄"
                            label="Privacy Policy"
                            href="/privacy-policy"
                            openInNew
                        />
                        <HelpLink
                            icon="📋"
                            label="Terms of Service"
                            href="/terms-of-service"
                        />
                    </div>

                    <div style={{
                        marginTop: '16px',
                        paddingTop: '12px',
                        borderTop: '1px solid #f3f4f6',
                        textAlign: 'center',
                        fontSize: '11px',
                        color: '#9ca3af'
                    }}>
                        © 2025 Chesterfield Taxi
                    </div>
                </div>
            )}

            {/* FAB Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    width: '56px',
                    height: '56px',
                    borderRadius: '28px',
                    backgroundColor: '#2563eb',
                    color: 'white',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3), 0 2px 4px -1px rgba(37, 99, 235, 0.15)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    zIndex: 1000,
                    transition: 'transform 0.2s, background-color 0.2s',
                    animation: 'pulse 3s infinite'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.backgroundColor = '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.backgroundColor = '#2563eb';
                }}
            >
                {isOpen ? '✕' : '?'}
            </button>

            <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }

        @media print {
          button, div[style*="position: fixed"] {
            display: none !important;
          }
        }
      `}</style>
        </>
    );
};
