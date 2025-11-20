import React, { useMemo } from 'react';
import { usePricingRules } from '../hooks/usePricingRules';
import { calculateFare } from '../utils/pricingEngine';
import type { BookingDetails } from '../types/pricing';

export const PricingTest: React.FC = () => {
    const { rules, loading } = usePricingRules(true);

    // Test scenarios
    const scenarios: Array<{ name: string; booking: BookingDetails }> = useMemo(() => [
        {
            name: 'Airport Transfer - Sedan, 1 Passenger',
            booking: {
                tripType: 'airport_transfer',
                distanceInYards: 50000,
                vehicleType: 'Sedan',
                passengerCount: 1,
                luggageCount: 2,
                carSeats: { infant: 0, toddler: 0, booster: 0 },
                specialRequests: [],
                isAirport: true,
                pickupDateTime: new Date('2025-01-20T12:00:00')
            }
        },
        {
            name: 'Airport Transfer - SUV, 3 Passengers',
            booking: {
                tripType: 'airport_transfer',
                distanceInYards: 35200,
                vehicleType: 'SUV',
                passengerCount: 3,
                luggageCount: 3,
                carSeats: { infant: 0, toddler: 0, booster: 0 },
                specialRequests: [],
                isAirport: true,
                pickupDateTime: new Date('2025-01-20T14:30:00')
            }
        },
        {
            name: 'Point-to-Point - Minivan with Car Seat',
            booking: {
                tripType: 'point_to_point',
                distanceInYards: 20000,
                vehicleType: 'Minivan',
                passengerCount: 4,
                luggageCount: 2,
                carSeats: { infant: 0, toddler: 1, booster: 0 },
                specialRequests: ['petFriendly'],
                isAirport: false,
                pickupDateTime: new Date('2025-01-20T10:00:00')
            }
        },
        {
            name: 'Point-to-Point - Peak Hours (Monday 8am)',
            booking: {
                tripType: 'point_to_point',
                distanceInYards: 15000,
                vehicleType: 'Sedan',
                passengerCount: 2,
                luggageCount: 1,
                carSeats: { infant: 0, toddler: 0, booster: 0 },
                specialRequests: [],
                isAirport: false,
                pickupDateTime: new Date('2025-01-20T08:00:00') // Monday 8am = peak hours
            }
        },
        {
            name: 'Point-to-Point - Late Night (10:30pm)',
            booking: {
                tripType: 'point_to_point',
                distanceInYards: 12000,
                vehicleType: 'Sedan',
                passengerCount: 1,
                luggageCount: 0,
                carSeats: { infant: 0, toddler: 0, booster: 0 },
                specialRequests: [],
                isAirport: false,
                pickupDateTime: new Date('2025-01-20T22:30:00') // 10:30pm = late night
            }
        }
    ], []);

    const results = useMemo(() => {
        if (!rules) return [];
        return scenarios.map(scenario => ({
            ...scenario,
            breakdown: calculateFare(scenario.booking, rules)
        }));
    }, [rules, scenarios]);

    if (loading) {
        return <div style={{ padding: '2rem' }}>Loading pricing rules...</div>;
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
            <h1 style={{ marginBottom: '0.5rem' }}>Pricing Engine Test</h1>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
                Validating tiered distance calculations, modifiers, and conditional surcharges
            </p>

            {results.map((result, idx) => (
                <div
                    key={idx}
                    style={{
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '1.5rem',
                        marginBottom: '2rem'
                    }}
                >
                    <h2 style={{ marginTop: 0, marginBottom: '1rem', color: '#111827' }}>
                        {result.name}
                    </h2>

                    {/* Booking Details */}
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1rem',
                        borderRadius: '6px',
                        marginBottom: '1rem',
                        fontSize: '14px'
                    }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                            <div><strong>Trip Type:</strong> {result.booking.tripType.replace('_', ' ')}</div>
                            <div><strong>Distance:</strong> {result.booking.distanceInYards.toLocaleString()} yards</div>
                            <div><strong>Vehicle:</strong> {result.booking.vehicleType}</div>
                            <div><strong>Passengers:</strong> {result.booking.passengerCount}</div>
                            <div><strong>Car Seats:</strong> {
                                result.booking.carSeats.infant + result.booking.carSeats.toddler + result.booking.carSeats.booster || 'None'
                            }</div>
                            <div><strong>Time:</strong> {result.booking.pickupDateTime.toLocaleString()}</div>
                        </div>
                    </div>

                    {/* Calculation Breakdown */}
                    <div style={{
                        backgroundColor: 'white',
                        padding: '1rem',
                        borderRadius: '6px',
                        marginBottom: '1rem'
                    }}>
                        <h3 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '16px' }}>
                            📊 Calculation Breakdown
                        </h3>

                        {result.breakdown.lineItems.length === 0 ? (
                            <div style={{ color: '#666', fontSize: '14px' }}>No charges applied</div>
                        ) : (
                            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                        <th style={{ textAlign: 'left', padding: '0.5rem 0', fontWeight: 600 }}>Charge</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Amount</th>
                                        <th style={{ textAlign: 'right', padding: '0.5rem 0', fontWeight: 600 }}>Type</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.breakdown.lineItems.map((item, itemIdx) => (
                                        <tr key={itemIdx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '0.5rem 0' }}>{item.label}</td>
                                            <td style={{
                                                padding: '0.5rem 0',
                                                textAlign: 'right',
                                                color: item.type === 'discount' ? '#10b981' : '#111827',
                                                fontWeight: 500
                                            }}>
                                                ${item.amount.toFixed(2)}
                                            </td>
                                            <td style={{
                                                padding: '0.5rem 0',
                                                textAlign: 'right',
                                                fontSize: '12px',
                                                color: '#666'
                                            }}>
                                                {item.type}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Totals */}
                    <div style={{
                        backgroundColor: '#2563eb',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '14px', opacity: 0.9 }}>
                                Subtotal: ${result.breakdown.subtotal.toFixed(2)}
                                {result.breakdown.minimumApplied && (
                                    <span style={{ marginLeft: '0.5rem', fontSize: '12px' }}>
                                        (Minimum applied)
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '0.25rem' }}>
                                Final Total: ${result.breakdown.total.toFixed(0)}
                            </div>
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>
                            Rounded up to nearest dollar
                        </div>
                    </div>

                    {/* Validation Notes */}
                    <details style={{ marginTop: '1rem', fontSize: '14px' }}>
                        <summary style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 500 }}>
                            📝 Validation Notes
                        </summary>
                        <div style={{
                            marginTop: '0.5rem',
                            padding: '1rem',
                            backgroundColor: '#eff6ff',
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe'
                        }}>
                            {generateValidationNotes(result.booking, result.breakdown, rules)}
                        </div>
                    </details>
                </div>
            ))}
        </div>
    );
};

// Helper to generate validation notes
function generateValidationNotes(booking: BookingDetails, breakdown: any, rules: any): React.ReactNode {
    const notes: string[] = [];

    const tripConfig = rules.tripTypes[booking.tripType];
    const miles = (booking.distanceInYards / 1760).toFixed(2);

    notes.push(`✓ Distance: ${booking.distanceInYards.toLocaleString()} yards = ${miles} miles`);

    // Distance calculation
    if (booking.tripType === 'airport_transfer') {
        const tier1 = Math.min(booking.distanceInYards, 35200);
        const tier2 = Math.max(0, booking.distanceInYards - 35200);
        const units1 = Math.ceil(tier1 / 176);
        const units2 = Math.ceil(tier2 / 176);

        notes.push(`✓ Tier 1 (0-35,200 yards): ${tier1.toLocaleString()} yards = ${units1} units × $0.255 = $${(units1 * 0.255).toFixed(2)}`);
        if (tier2 > 0) {
            notes.push(`✓ Tier 2 (35,200+ yards): ${tier2.toLocaleString()} yards = ${units2} units × $0.230 = $${(units2 * 0.230).toFixed(2)}`);
        }
    } else {
        const units = Math.ceil(booking.distanceInYards / 176);
        notes.push(`✓ Base fee: $3.50`);
        notes.push(`✓ Distance: ${booking.distanceInYards.toLocaleString()} yards = ${units} units × $0.250 = $${(units * 0.250).toFixed(2)}`);
    }

    // Modifiers
    if (booking.vehicleType !== 'Sedan' && booking.vehicleType !== 'Any') {
        notes.push(`✓ ${booking.vehicleType} upgrade: +$10.00`);
    }

    if (booking.passengerCount > 1) {
        notes.push(`✓ Additional passengers: ${booking.passengerCount - 1} × $1 = $${booking.passengerCount - 1}.00`);
    }

    const totalCarSeats = booking.carSeats.infant + booking.carSeats.toddler + booking.carSeats.booster;
    if (totalCarSeats > 0) {
        notes.push(`✓ Car seats: ${totalCarSeats} × $10 = $${totalCarSeats * 10}.00`);
    }

    if (booking.isAirport) {
        notes.push(`✓ Airport surcharge: +$5.00`);
    }

    // Conditionals
    const hour = booking.pickupDateTime.getHours();
    const day = booking.pickupDateTime.getDay();

    if (hour >= 7 && hour <= 9 && day >= 1 && day <= 5) {
        notes.push(`✓ Peak hours (Mon-Fri 7am-9am): +15%`);
    }

    if (hour >= 22) {
        notes.push(`✓ Late night (after 10pm): +$10.00`);
    }

    // Minimum
    if (breakdown.minimumApplied) {
        notes.push(`✓ Minimum fare: $${tripConfig.minimumFare}.00 (subtotal was $${breakdown.subtotal.toFixed(2)})`);
    }

    // Rounding
    notes.push(`✓ Final total rounded UP to nearest dollar: $${breakdown.total}`);

    return (
        <div>
            {notes.map((note, idx) => (
                <div key={idx} style={{ marginBottom: '0.25rem' }}>{note}</div>
            ))}
        </div>
    );
}
