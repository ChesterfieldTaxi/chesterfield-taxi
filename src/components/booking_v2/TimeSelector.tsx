import React from 'react';
import DateTimePicker from '../booking/DateTimePicker';
import '../../styles/BookingFormV2.css'; // Ensure we have access to variables if needed

interface TimeSelectorProps {
    isNow: boolean;
    setIsNow: (isNow: boolean) => void;
    pickupDateTime: Date | null;
    setPickupDateTime: (date: Date) => void;
}

const TimeSelector: React.FC<TimeSelectorProps> = ({ isNow, setIsNow, pickupDateTime, setPickupDateTime }) => {
    return (
        <div className="time-selector-container" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', height: '40px' }}>
            {/* Toggle Switch */}
            <div
                className="time-toggle-switch"
                onClick={() => setIsNow(!isNow)}
                style={{
                    position: 'relative',
                    width: '110px',
                    height: '40px',
                    cursor: 'pointer',
                    flexShrink: 0
                }}
            >
                <div
                    className="toggle-track"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '9999px',
                        backgroundColor: isNow ? 'var(--color-primary)' : '#e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'background-color 0.2s ease-in-out'
                    }}
                >
                    <div
                        className="toggle-thumb"
                        style={{
                            position: 'absolute',
                            top: '4px',
                            left: '4px',
                            width: '32px',
                            height: '32px',
                            backgroundColor: 'white',
                            borderRadius: '9999px',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                            transition: 'transform 0.2s ease-in-out',
                            transform: isNow ? 'translateX(0)' : 'translateX(68px)'
                        }}
                    ></div>

                    <span
                        style={{
                            position: 'absolute',
                            right: '21px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: isNow ? 'white' : 'transparent',
                            pointerEvents: 'none',
                            transition: 'color 0.2s'
                        }}
                    >
                        Now
                    </span>

                    <span
                        style={{
                            position: 'absolute',
                            left: '18px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: !isNow ? 'var(--color-text-muted)' : 'transparent',
                            pointerEvents: 'none',
                            transition: 'color 0.2s'
                        }}
                    >
                        Later
                    </span>
                </div>
            </div>

            {/* Date Picker Input */}
            <div
                style={{
                    flexGrow: 1,
                    height: '100%',
                    opacity: isNow ? 0 : 1,
                    pointerEvents: isNow ? 'none' : 'auto',
                    transition: 'opacity 0.3s ease-in-out'
                }}
            >
                <DateTimePicker
                    value={pickupDateTime}
                    onChange={setPickupDateTime}
                    placeholder="Select date and time"
                />
            </div>
        </div>
    );
};

export default TimeSelector;
