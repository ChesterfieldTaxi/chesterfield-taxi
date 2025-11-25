
import { calculateFare } from '../src/utils/pricingEngine';
import { PricingRules, BookingDetails } from '../src/types/pricing';

const mockRules: PricingRules = {
    version: '1.0',
    lastUpdated: '2023-10-27',
    tripTypes: {
        point_to_point: {
            name: 'Point to Point',
            enabled: true,
            baseFee: 10,
            minimumFare: 25,
            distanceUnit: 'mile',
            distancePerUnit: 1760, // 1 mile in yards
            distanceTiers: [
                { from: 0, to: null, ratePerUnit: 2.5 } // $2.50 per mile
            ],
            surcharges: [],
            waitTimeRate: { enabled: true, ratePerHour: 60, freeMinutes: 15 }
        },
        airport_transfer: {
            name: 'Airport Transfer',
            enabled: true,
            baseFee: 15,
            minimumFare: 35,
            distanceUnit: 'mile',
            distancePerUnit: 1760,
            distanceTiers: [
                { from: 0, to: null, ratePerUnit: 2.5 }
            ],
            surcharges: [
                { id: 'airport_fee', name: 'Airport Fee', type: 'fixed', amount: 5, conditions: { pickupIsAirport: true } }
            ],
            waitTimeRate: { enabled: true, ratePerHour: 60, freeMinutes: 30 }
        }
    },
    vehicleModifiers: {
        Sedan: { name: 'Sedan', enabled: true, maxPassengers: 4, modifier: { type: 'fixed', amount: 0 } },
        SUV: { name: 'SUV', enabled: true, maxPassengers: 6, modifier: { type: 'fixed', amount: 15 } },
        Minivan: { name: 'Minivan', enabled: true, maxPassengers: 7, modifier: { type: 'fixed', amount: 10 } },
        Any: { name: 'Any', enabled: true, maxPassengers: 4, modifier: { type: 'fixed', amount: 0 } }
    },
    passengerFees: {
        basePassengers: 4,
        additionalPassengerFee: 5,
        maxPassengersWithoutUpgrade: 4
    },
    extraFees: {
        carSeats: {
            enabled: true,
            perSeatFee: 10,
            requiresMinivan: false,
            types: {
                infant: { name: 'Infant', enabled: true, fee: 10 },
                toddler: { name: 'Toddler', enabled: true, fee: 10 },
                booster: { name: 'Booster', enabled: true, fee: 5 }
            }
        },
        luggage: {
            enabled: true,
            baseLuggage: 2,
            additionalLuggageFee: 5
        }
    },
    specialRequests: {},
    conditionalModifiers: []
};

function runTest(name: string, booking: BookingDetails, expectedTotal?: number) {
    console.log(`\n--- Test: ${name} ---`);
    try {
        const result = calculateFare(booking, mockRules);
        console.log('Breakdown:', JSON.stringify(result, null, 2));
        if (expectedTotal !== undefined) {
            if (result.total === expectedTotal) {
                console.log('PASS: Total matches expected.');
            } else {
                console.error(`FAIL: Expected ${expectedTotal}, got ${result.total}`);
            }
        }
    } catch (e) {
        console.error('ERROR:', e);
    }
}

// Test 1: Basic Point to Point, 10 miles (17600 yards)
// Base: 10
// Distance: 10 * 2.5 = 25
// Total: 35
runTest('Basic P2P 10 miles', {
    tripType: 'point_to_point',
    distanceInYards: 17600,
    vehicleType: 'Sedan',
    passengerCount: 1,
    luggageCount: 1,
    carSeats: { infant: 0, toddler: 0, booster: 0 },
    specialRequests: [],
    isAirport: false,
    pickupDateTime: new Date()
}, 35);

// Test 2: Passenger Fee (5 pax)
// Base: 10
// Distance: 25
// Pax Fee: (5 - 4) * 5 = 5
// Total: 40
runTest('Passenger Fee (5 pax)', {
    tripType: 'point_to_point',
    distanceInYards: 17600,
    vehicleType: 'SUV', // Need SUV for 5 pax
    passengerCount: 5,
    luggageCount: 1,
    carSeats: { infant: 0, toddler: 0, booster: 0 },
    specialRequests: [],
    isAirport: false,
    pickupDateTime: new Date()
}, 55); // 35 (base+dist) + 15 (SUV upgrade) + 5 (pax fee) = 55

// Test 3: Luggage Fee (4 bags)
// Base: 10
// Distance: 25
// Luggage Fee: (4 - 2) * 5 = 10
// Total: 45
runTest('Luggage Fee (4 bags)', {
    tripType: 'point_to_point',
    distanceInYards: 17600,
    vehicleType: 'Sedan',
    passengerCount: 1,
    luggageCount: 4,
    carSeats: { infant: 0, toddler: 0, booster: 0 },
    specialRequests: [],
    isAirport: false,
    pickupDateTime: new Date()
}, 45);

// Test 4: Car Seats (1 infant, 1 booster)
// Base: 10
// Distance: 25
// Car Seat Fee: 10 (infant) + 5 (booster) = 15
// Total: 50
runTest('Car Seats', {
    tripType: 'point_to_point',
    distanceInYards: 17600,
    vehicleType: 'Sedan',
    passengerCount: 1,
    luggageCount: 1,
    carSeats: { infant: 1, toddler: 0, booster: 1 },
    specialRequests: [],
    isAirport: false,
    pickupDateTime: new Date()
}, 50);

// Test 5: Airport Pickup
// Base: 15
// Distance: 25
// Surcharge: 5
// Total: 45
runTest('Airport Pickup', {
    tripType: 'airport_transfer',
    distanceInYards: 17600,
    vehicleType: 'Sedan',
    passengerCount: 1,
    luggageCount: 1,
    carSeats: { infant: 0, toddler: 0, booster: 0 },
    specialRequests: [],
    isAirport: true,
    pickupIsAirport: true,
    pickupDateTime: new Date()
}, 45);
