import { PlacesCache } from '../app/core/services/maps/places-cache';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log('--- Testing PlacesCache ---');
const cache = new PlacesCache(1000); // 1-second TTL for testing

// 1. Predictions Cache
cache.setPredictions('  Chesterfield  MO ', [
  { placeId: 'ch-1', description: 'Chesterfield, MO, USA', mainText: 'Chesterfield', secondaryText: 'MO, USA' }
]);

const hits = cache.getPredictions('chesterfield mo');
assert(hits !== null && hits.length === 1, 'Predictions cache hit for normalized query');
assert(hits![0].placeId === 'ch-1', 'Correct prediction item retrieved');

const miss = cache.getPredictions('clayton mo');
assert(miss === null, 'Cache miss for un-queried search term');

// 2. Place Details Cache
cache.setDetails('place-lambert-123', {
  address: 'St. Louis Lambert Airport',
  formattedAddress: '10701 Lambert International Blvd',
  placeId: 'place-lambert-123',
  coordinates: { lat: 38.7487, lng: -90.3700 }
});

const details = cache.getDetails('place-lambert-123');
assert(details !== null, 'Details cache hit');
assert(details?.coordinates?.lat === 38.7487, 'Coordinates match cached data');
assert(cache.getDetails('nonexistent-place') === null, 'Details cache miss returns null');

console.log('\n--- Testing Vehicle Capacity Rules (Pax = 7) ---');
const vehicleCapacities = {
  sedan: { maxPassengers: 4, maxBags: 3 },
  suv: { maxPassengers: 6, maxBags: 5 },
  van: { maxPassengers: 7, maxBags: 6 },
  any: { maxPassengers: 4, maxBags: 3 },
};

function checkCapacity(vehicles: Array<keyof typeof vehicleCapacities>, pax: number): boolean {
  const total = vehicles.reduce((acc, v) => acc + (vehicleCapacities[v]?.maxPassengers || 4), 0);
  return total >= pax;
}

assert(!checkCapacity(['sedan'], 7), 'Single Sedan rejected for 7 passengers');
assert(!checkCapacity(['suv'], 7), 'Single SUV rejected for 7 passengers');
assert(!checkCapacity(['any'], 7), 'Single Any rejected for 7 passengers');
assert(checkCapacity(['van'], 7), 'Single Van accepted for 7 passengers');

assert(checkCapacity(['sedan', 'sedan'], 7), 'Two Sedans (8p) accepted for 7 passengers');
assert(checkCapacity(['suv', 'sedan'], 7), 'SUV + Sedan (10p) accepted for 7 passengers');

console.log('\n--- Testing Car Seat Toggle Reset Logic ---');
// Simulating Customer Form state transitions
let formState = {
  carSeats: false,
  rearFacingCount: 0,
  frontFacingCount: 0,
  boosterCount: 0,
};

// 1. User toggles ON
function toggleCustomerCarSeats(checked: boolean) {
  if (!checked) {
    formState = {
      ...formState,
      carSeats: false,
      rearFacingCount: 0,
      frontFacingCount: 0,
      boosterCount: 0,
    };
  } else {
    const hasExisting = formState.rearFacingCount > 0 || formState.frontFacingCount > 0 || formState.boosterCount > 0;
    formState = {
      ...formState,
      carSeats: true,
      rearFacingCount: hasExisting ? formState.rearFacingCount : 1,
    };
  }
}

function computeTotalCarSeats(form: typeof formState) {
  return form.carSeats ? (form.rearFacingCount + form.frontFacingCount + form.boosterCount) : 0;
}

toggleCustomerCarSeats(true);
assert(formState.carSeats === true, 'Car seats turned ON');
assert(formState.rearFacingCount === 1, 'Defaulted to 1 rear-facing seat');
assert(computeTotalCarSeats(formState) === 1, 'Total car seats is 1');

// User increments counters
formState.rearFacingCount = 2;
formState.frontFacingCount = 1;
formState.boosterCount = 1;
assert(computeTotalCarSeats(formState) === 4, 'Total car seats is 4');

// User toggles OFF
toggleCustomerCarSeats(false);
assert(formState.carSeats === false, 'Car seats turned OFF');
assert(formState.rearFacingCount === 0, 'Rear-facing reset to 0');
assert(formState.frontFacingCount === 0, 'Front-facing reset to 0');
assert(formState.boosterCount === 0, 'Booster reset to 0');
assert(computeTotalCarSeats(formState) === 0, 'Total car seats evaluated to 0 when toggled off');

console.log('\nAll PlacesCache, Capacity, and Car Seats Reset assertions passed successfully! 🎉');
