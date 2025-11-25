import { calculateFare } from '../src/utils/pricingEngine';
import { mockPricingRules } from '../src/mocks/pricingRulesMock';

console.log('\n=== Testing Fixed Pricing Engine ===\n');

// Test case from user's screenshot: 7 mi airport transfer with 3 passengers
const testBooking = {
    tripType: 'airport_transfer' as const,
    distanceInYards: 7 * 1760, // 7 miles
    vehicleType: 'Sedan' as const,
    passengerCount: 3,
    luggageCount: 1,
    carSeats: { infant: 0, toddler: 0, booster: 0 },
    specialRequests: [],
    isAirport: true,
    pickupIsAirport: false, // Going TO airport (not FROM)
    dropoffIsAirport: true,
    pickupDateTime: new Date()
};

console.log('Booking Details:');
console.log(`- Distance: 7 miles`);
console.log(`- Passengers: 3`);
console.log(`- Dropoff: Airport (TO airport, not FROM)`);
console.log('');

// Test Sedan
const sedanResult = calculateFare({ ...testBooking, vehicleType: 'Sedan' }, mockPricingRules);
console.log('SEDAN:');
console.log(`Total: $${sedanResult.total}`);
console.log(`Expected: ~$30 (min $28 + $2 passenger fees)`);
console.log(`Line items:`, sedanResult.lineItems.map(item => `${item.label}: $${item.amount}`));
console.log('');

// Test SUV
const suvResult = calculateFare({ ...testBooking, vehicleType: 'SUV' }, mockPricingRules);
console.log('SUV:');
console.log(`Total: $${suvResult.total}`);
console.log(`Expected: ~$40 (min $28 + $10 vehicle + $2 passenger fees)`);
console.log(`Line items:`, suvResult.lineItems.map(item => `${item.label}: $${item.amount}`));
console.log('');

// Test Minivan
const minivanResult = calculateFare({ ...testBooking, vehicleType: 'Minivan' }, mockPricingRules);
console.log('MINIVAN:');
console.log(`Total: $${minivanResult.total}`);
console.log(`Expected: ~$40 (min $28 + $10 vehicle + $2 passenger fees)`);
console.log(`Line items:`, minivanResult.lineItems.map(item => `${item.label}: $${item.amount}`));
console.log('');

// Test with airport PICKUP (should add $5 surcharge)
const airportPickupBooking = {
    ...testBooking,
    pickupIsAirport: true,
    dropoffIsAirport: false
};

const sedanPickup = calculateFare({ ...airportPickupBooking, vehicleType: 'Sedan' }, mockPricingRules);
console.log('SEDAN with AIRPORT PICKUP:');
console.log(`Total: $${sedanPickup.total}`);
console.log(`Expected: ~$35 (min $28 + $2 passenger fees + $5 airport surcharge)`);
console.log(`Line items:`, sedanPickup.lineItems.map(item => `${item.label}: $${item.amount}`));
