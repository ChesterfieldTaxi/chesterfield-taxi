import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';

interface ReturnTripV3Props {
    isReturnTrip: boolean;
    returnDateTime: Date | null;
    onIsReturnTripChange: (isReturn: boolean) => void;
    onReturnDateTimeChange: (date: Date) => void;
    pickupLocation: string;
    dropoffLocation: string;
}

export const ReturnTripV3: React.FC<ReturnTripV3Props> = ({
    isReturnTrip,
    returnDateTime,
    onIsReturnTripChange,
    onReturnDateTimeChange,
    pickupLocation,
    dropoffLocation
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Toggle */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb'
            }}>
                <div>
                    <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        Book Return Trip
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                        Save time by booking both ways
                    </div>
                </div>
                <label style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '48px',
                    height: '28px'
                }}>
                    <input
                        type="checkbox"
                        checked={isReturnTrip}
                        onChange={(e) => onIsReturnTripChange(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: isReturnTrip ? '#2563eb' : '#cbd5e1',
                        transition: '0.3s',
                        borderRadius: '28px'
                    }}>
                        <span style={{
                            position: 'absolute',
                            content: '',
                            height: '20px',
                            width: '20px',
                            left: isReturnTrip ? '24px' : '4px',
                            bottom: '4px',
                            backgroundColor: 'white',
                            transition: '0.3s',
                            borderRadius: '50%'
                        }} />
                    </span>
                </label>
            </div>

            {/* Return Trip Details */}
            {isReturnTrip && (
                <div style={{
                    padding: '1rem',
                    backgroundColor: '#eff6ff',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '0.5rem', color: '#1e40af' }}>
                            Return Route:
                        </div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '13px',
                            color: '#1e40af'
                        }}>
                            <span>{dropoffLocation || 'Dropoff'}</span>
                            <span>→</span>
                            <span>{pickupLocation || 'Original pickup'}</span>
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '14px' }}>
                            Return Date & Time
                        </label>
                        <DateTimePicker
                            value={returnDateTime}
                            onChange={onReturnDateTimeChange}
                            showTimePicker={true}
                            placeholder="Select return date and time"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
