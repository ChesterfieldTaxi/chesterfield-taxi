import React from 'react';

/**
 * Help content for each section of the booking form
 * Organized by section with title and content
 */

export const HELP_CONTENT = {
    pickupTime: {
        title: "Pickup Time Options",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Now:</strong> Your driver will arrive as soon as possible based on current availability (typically 10-15 minutes).</p>
                <p><strong>Schedule:</strong> Choose a specific date and time for your pickup. Perfect for airport trips or planned events.</p>
                <p style={{ marginBottom: 0, padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '14px' }}>
                    💡 <strong>Tip:</strong> For airport pickups, schedule at least 15 minutes after your flight's scheduled landing time.
                </p>
            </div>
        )
    },

    tripDetails: {
        title: "Route & Stops",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Drag to Reorder:</strong> Click and hold the location icons to rearrange your stops in a different order.</p>
                <p><strong>Add Stops:</strong> You can add up to 3 additional stops between your pickup and dropoff locations.</p>
                <p><strong>Airport Flights:</strong> If picking up from an airport, add your flight information so we can track any delays.</p>
                <p style={{ marginBottom: 0 }}><strong>Distance:</strong> Route distance is automatically calculated for accurate pricing.</p>
            </div>
        )
    },

    passengersLuggage: {
        title: "Passengers & Luggage",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Passengers:</strong> Include all travelers in your count (adults and children).</p>
                <p><strong>Luggage:</strong> Standard suitcases only. Small carry-on bags and purses don't count.</p>
                <p><strong>Car Seats:</strong> We provide child safety seats at no extra charge:</p>
                <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li><strong>Infant:</strong> 0-12 months (rear-facing)</li>
                    <li><strong>Toddler:</strong> 1-4 years (forward-facing)</li>
                    <li><strong>Booster:</strong> 4-8 years</li>
                </ul>
                <p style={{ marginBottom: 0, padding: '0.75rem', backgroundColor: '#dbeafe', borderRadius: '6px', fontSize: '14px' }}>
                    ℹ️ <strong>Note:</strong> Minivan is automatically selected when car seats are requested for safety.
                </p>
            </div>
        )
    },

    vehicleSelection: {
        title: "Choose Your Vehicle",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Sedan:</strong> Up to 4 passengers, 2-3 large suitcases</p>
                <p><strong>SUV:</strong> Up to 5 passengers, 4-5 large suitcases</p>
                <p><strong>Minivan:</strong> Up to 6 passengers, 6+ large suitcases</p>
                <p style={{ padding: '0.75rem', backgroundColor: '#f3f4f6', borderRadius: '6px', fontSize: '14px', marginBottom: 0 }}>
                    <strong>Auto-Selection:</strong> Your vehicle may be automatically selected based on passenger count or car seat requirements. Prices shown are estimates; final price is calculated at booking confirmation.
                </p>
            </div>
        )
    },

    specialRequests: {
        title: "Additional Services",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Pet-Friendly:</strong> Bring your furry friend! Small pets must be in carriers.</p>
                <p><strong>Wheelchair Accessible:</strong> Vehicle equipped with ramp or lift for wheelchair access.</p>
                <p><strong>Extra Luggage Space:</strong> For oversized items, sports equipment, or multiple bags.</p>
                <p><strong>Meet & Greet:</strong> Driver will meet you inside the terminal with a name sign.</p>
                <p style={{ marginBottom: 0 }}><strong>Child Booster:</strong> Additional booster seat if needed (beyond standard selections).</p>
            </div>
        )
    },

    returnTrip: {
        title: "Round Trip Options",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Wait:</strong> Driver will wait at your destination and return you immediately. Perfect for quick errands.</p>
                <p><strong>Schedule:</strong> Set a specific date and time for your return journey. Ideal for appointments or events.</p>
                <p><strong>Customize Route:</strong> Change pickup/dropoff locations for your return trip as needed.</p>
                <p style={{ marginBottom: 0, padding: '0.75rem', backgroundColor: '#fef3c7', borderRadius: '6px', fontSize: '14px' }}>
                    💡 <strong>Pricing:</strong> Round trip fare is calculated separately for each leg to ensure accurate pricing.
                </p>
            </div>
        )
    },

    contactInfo: {
        title: "Passenger Details",
        content: (
            <div>
                <p style={{ marginTop: 0 }}><strong>Phone Number:</strong> Required for driver communication and coordinating pickup. We'll call or text when your driver arrives.</p>
                <p><strong>Email Address:</strong> Booking confirmation and ride updates will be sent here. You'll receive a confirmation email immediately after booking.</p>
                <p style={{ marginBottom: 0, padding: '0.75rem', backgroundColor: '#dbeafe', borderRadius: '6px', fontSize: '14px' }}>
                    ℹ️ <strong>SMS Consent:</strong> Check the box to receive text message updates about your ride (optional but recommended).
                </p>
            </div>
        )
    }
};
