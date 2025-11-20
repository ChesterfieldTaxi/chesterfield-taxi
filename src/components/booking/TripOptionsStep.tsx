import React from 'react';
import DateTimePicker from './DateTimePicker';
import type { Location } from '../../types/booking';

interface TripOptionsStepProps {
    // Return Trip Props
    isReturnTrip: boolean;
    setIsReturnTrip: (isReturn: boolean) => void;
    returnDateTime: Date | null;
    setReturnDateTime: (date: Date | null) => void;
    returnLocations: Location[];
    setReturnLocations: (locations: Location[]) => void;
}

// Helper Component for Return Time Toggle
const ReturnTimeToggle = ({ value, onChange }: { value: Date | null, onChange: (date: Date | null) => void }) => {
    const isWait = value === null;

    return (
        <>
            <div className="toggle-switch" onClick={() => onChange(isWait ? new Date() : null)}>
                <div className={`toggle-track ${!isWait ? 'later' : ''}`}>
                    <div className="toggle-thumb"></div>
                    <span className="toggle-text now" style={{ right: '20px' }}>Wait</span>
                    <span className="toggle-text later">Later</span>
                </div>
            </div>
            {!isWait && (
                <div style={{ flexGrow: 1 }}>
                    <DateTimePicker value={value} onChange={(d) => onChange(d)} placeholder="Select return time" />
                </div>
            )}
        </>
    );
};

const TripOptionsStep: React.FC<TripOptionsStepProps> = ({
    isReturnTrip, setIsReturnTrip, returnDateTime, setReturnDateTime, returnLocations, setReturnLocations
}) => {

    // Helper to render flight info if needed
    const renderFlightInfo = (locs: Location[], handler: (id: string, field: string, val: any) => void) => {
        const airportLoc = locs.find(l => l.isAirport);
        if (!airportLoc) return null;

        return (
            <div className="flight-info-section visible">
                <div className="form-section-header" style={{ color: 'var(--color-primary)', marginTop: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '4px' }}>flight</span>
                    Airport Details
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Airline"
                        value={airportLoc.airline || ''}
                        onChange={(e) => handler(airportLoc.id, 'airline', e.target.value)}
                    />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Flight Number"
                        value={airportLoc.flightNumber || ''}
                        onChange={(e) => handler(airportLoc.id, 'flightNumber', e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="form-section">
            {/* Return Trip */}
            <div className="mt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={isReturnTrip} onChange={(e) => setIsReturnTrip(e.target.checked)} />
                    Book Return Trip
                </label>

                <div className={`collapsible-section ${isReturnTrip ? 'visible' : ''}`}>
                    <div>
                        <div className="form-group-box mt-2" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                            <div className="time-toggle mb-2">
                                <ReturnTimeToggle
                                    value={returnDateTime}
                                    onChange={(date) => setReturnDateTime(date)}
                                />
                            </div>

                            {returnLocations.map((loc, index) => (
                                <div key={loc.id} className="location-group">
                                    <div className="location-icon-wrapper">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="location-icon" style={{
                                            color: index === 0 ? 'var(--color-success)' : index === returnLocations.length - 1 ? 'var(--color-error)' : '#9ca3af'
                                        }}>
                                            {index === 0 || index === returnLocations.length - 1
                                                ? <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></>
                                                : <circle cx="12" cy="12" r="1.5"></circle>
                                            }
                                        </svg>
                                        <input
                                            type="text"
                                            className="form-input location-input"
                                            value={loc.address}
                                            readOnly // Auto-filled from main trip
                                            style={{ backgroundColor: '#f3f4f6' }}
                                        />
                                    </div>
                                </div>
                            ))}
                            {/* Return Flight Info */}
                            {renderFlightInfo(returnLocations, (id, field, val) => {
                                const newLocs = returnLocations.map(l => l.id === id ? { ...l, [field]: val } : l);
                                setReturnLocations(newLocs);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TripOptionsStep;
