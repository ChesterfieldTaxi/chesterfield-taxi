import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';

interface TimeSelectorV3Props {
    isNow: boolean;
    pickupDateTime: Date;
    onIsNowChange: (isNow: boolean) => void;
    onDateTimeChange: (date: Date) => void;
}

export const TimeSelectorV3: React.FC<TimeSelectorV3Props> = ({
    isNow,
    pickupDateTime,
    onIsNowChange,
    onDateTimeChange
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Now/Later Toggle */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                padding: '0.25rem',
                backgroundColor: '#f3f4f6',
                borderRadius: '8px'
            }}>
                <button
                    type="button"
                    onClick={() => onIsNowChange(true)}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: isNow ? '#2563eb' : 'transparent',
                        color: isNow ? 'white' : '#6b7280',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Now
                </button>
                <button
                    type="button"
                    onClick={() => onIsNowChange(false)}
                    style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: 'none',
                        borderRadius: '6px',
                        backgroundColor: !isNow ? '#2563eb' : 'transparent',
                        color: !isNow ? 'white' : '#6b7280',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Schedule
                </button>
            </div>

            {/* Custom DateTime Picker (only show when "Later" is selected) */}
            {!isNow && (
                <div style={{
                    padding: '1rem',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                        Pickup Date & Time
                    </label>
                    <DateTimePicker
                        value={pickupDateTime}
                        onChange={onDateTimeChange}
                        showTimePicker={true}
                        placeholder="Select date and time"
                    />
                </div>
            )}
        </div>
    );
};
