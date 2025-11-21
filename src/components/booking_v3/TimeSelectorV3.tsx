import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';

interface TimeSelectorV3Props {
    isNow: boolean;
    pickupDateTime: Date | null;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* iOS-style Segmented Button */}
            <div style={{
                display: 'inline-flex',
                gap: '0.25rem',
                padding: '0.25rem',
                backgroundColor: '#e5e7eb',
                borderRadius: '6px',
                flexShrink: 0
            }}>
                <button
                    type="button"
                    onClick={() => onIsNowChange(true)}
                    style={{
                        padding: '0.5rem 1.25rem',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: isNow ? 'white' : 'transparent',
                        color: isNow ? '#111827' : '#6b7280',
                        fontWeight: 600,
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: isNow ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    Now
                </button>
                <button
                    type="button"
                    onClick={() => onIsNowChange(false)}
                    style={{
                        padding: '0.5rem 1.25rem',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: !isNow ? '#2563eb' : 'transparent',
                        color: !isNow ? 'white' : '#6b7280',
                        fontWeight: 600,
                        fontSize: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: !isNow ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                >
                    Schedule
                </button>
            </div>

            {/* ASAP Feedback */}
            {isNow && (
                <div style={{ fontSize: '13px', color: '#059669', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Pickup in ~15-20 mins
                </div>
            )}

            {/* DateTime Picker - inline when Schedule is selected */}
            {!isNow && (
                <div style={{ flex: 1, minWidth: '250px' }}>
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
