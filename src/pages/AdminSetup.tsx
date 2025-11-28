import React, { useState } from 'react';
import { seedCompanyConfig } from '../services/configService';

const AdminSetup: React.FC = () => {
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSeed = async () => {
        setLoading(true);
        setStatus('Seeding configuration...');
        try {
            await seedCompanyConfig();
            setStatus('Success! Configuration seeded to Firestore.');
        } catch (error) {
            console.error(error);
            setStatus('Error seeding configuration. Check console.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container section">
            <h1>Admin Setup</h1>
            <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
                <h2>Database Initialization</h2>
                <p>Click the button below to upload the initial company configuration to Firestore.</p>
                <p>This includes:</p>
                <ul>
                    <li>Business Info (Name, Address, etc.)</li>
                    <li>Contact Details</li>
                    <li>Pricing Rules</li>
                    <li>Feature Flags</li>
                </ul>

                <div style={{ marginTop: '2rem' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleSeed}
                        disabled={loading}
                    >
                        {loading ? 'Seeding...' : 'Seed Configuration'}
                    </button>
                </div>

                {status && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: status.includes('Success') ? '#d4edda' : '#f8d7da', borderRadius: '4px' }}>
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSetup;
