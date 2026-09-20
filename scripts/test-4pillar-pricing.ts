import { calculateTripPricing } from '../app/core/services/pricing/pipeline';
import { DEFAULT_PRICING_CONFIG } from '../app/core/services/pricing/rules';
import { DEFAULT_TARIFF_PROFILES } from '../app/core/services/pricing/tariff.service';
import { DEFAULT_NAMED_PRICING_RULES } from '../app/core/services/pricing/pricing-rules.service';
import { DEFAULT_UNIVERSAL_EXTRAS } from '../app/core/services/pricing/extras.service';
import { DEFAULT_SURCHARGES_CONFIG } from '../app/core/services/pricing/surcharges.service';

console.log('=== RUNNING 4-PILLAR PRICING ENGINE VERIFICATION ===\n');

const baseConfig = {
  ...DEFAULT_PRICING_CONFIG,
  tariffs: DEFAULT_TARIFF_PROFILES,
  namedPricingRules: DEFAULT_NAMED_PRICING_RULES,
  universalExtras: DEFAULT_UNIVERSAL_EXTRAS,
  surchargesCatalog: DEFAULT_SURCHARGES_CONFIG,
};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log('[PASS] ' + testName);
    passed++;
  } else {
    console.error('[FAIL] ' + testName + (detail ? ' - ' + detail : ''));
    failed++;
  }
}

// Test 1: Bidirectional Airport Rule
console.log('--- Test 1: Airport Transfer Flat Rate (Bidirectional) ---');
const airportRes = calculateTripPricing(
  {
    distanceMiles: 15.0,
    durationMinutes: 25,
    originZoneId: 'zone-lambert-airport',
    isAirportPickup: true,
    passengers: 1,
  },
  baseConfig
);
const airportContext = airportRes.context;

assert(
  airportContext.tariffProfileId === 'tariff-airport-flat',
  'Routes to Airport Flat Rate tariff profile',
  'Got tariff: ' + airportContext.tariffProfileId
);
assert(
  (airportContext.appliedRuleNames || []).some(n => n.includes('Airport Transfer')),
  'Applied 1 unified Airport Transfer rule',
  'Applied rules: ' + (airportContext.appliedRuleNames || []).join(', ')
);
assert(
  airportContext.surcharges.some(s => s.name.includes('Airport Commercial Access Fee') && s.amount === 4.00),
  'Included .00 Airport Commercial Access Fee'
);
console.log('  Airport fare total: $' + airportContext.totalFare.toFixed(2));

// Test 2: Standard Point-to-Point Trip
console.log('\n--- Test 2: Point-to-Point METER (Standard Non-Airport) ---');
const meterRes = calculateTripPricing(
  {
    distanceMiles: 10.0,
    durationMinutes: 20,
    passengers: 1,
  },
  baseConfig
);
const meterContext = meterRes.context;

assert(
  meterContext.tariffProfileId === 'tariff-point-to-point-meter',
  'Routes to Point-to-Point METER tariff',
  'Got tariff: ' + meterContext.tariffProfileId
);
assert(
  !meterContext.surcharges.some(s => s.name.includes('Airport')),
  'No airport fee applied to city point-to-point'
);
console.log('  Meter fare total: $' + meterContext.totalFare.toFixed(2));

// Test 3: Smoke House Chesterfield Agreed Rates
console.log('\n--- Test 3: Smoke House Chesterfield 2023 Zip-Code Flat Rate ---');
const smokeRes = calculateTripPricing(
  {
    distanceMiles: 8.5,
    durationMinutes: 15,
    pickupZipCode: '63005',
    dropoffZipCode: '63011',
    corporateAccountId: 'corp-smoke-house',
    passengers: 1,
  },
  baseConfig
);
const smokeContext = smokeRes.context;

assert(
  smokeContext.tariffProfileId === 'tariff-smoke-house-rates',
  'Routes to Smoke House Agreed Rates profile',
  'Got tariff: ' + smokeContext.tariffProfileId
);
assert(
  smokeContext.totalFare === 39.50,
  'Customer Charge is exactly agreed rate (.50 for 63011 Ballwin)',
  'Got total: ' + smokeContext.totalFare
);
assert(
  smokeContext.driverPay === 39.50,
  'Driver pay equals customer charge (100% pass-through: .50)',
  'Got driverPay: ' + smokeContext.driverPay
);
console.log('  Smoke House 63011 fare: $' + smokeContext.totalFare.toFixed(2) + ', Driver Pay: $' + smokeContext.driverPay);

// Test 4: Universal Extras
console.log('\n--- Test 4: Universal Extras & Services ---');
const extrasRes = calculateTripPricing(
  {
    distanceMiles: 10.0,
    durationMinutes: 20,
    passengers: 3,
    intermediateStopsCount: 2,
    carSeatsBreakdown: { booster: 1, frontFacing: 1 },
    curbWaitMinutes: 20,
  },
  baseConfig
);
const extrasContext = extrasRes.context;

assert(
  extrasContext.surcharges.some(s => s.name.includes('Child Safety Seats') && s.amount === 20.00),
  'Applied .00 for 2 child safety seats (/seat)'
);
assert(
  extrasContext.surcharges.some(s => s.name.includes('Additional Passenger Fee') && s.amount === 2.00),
  'Applied .00 for 2 extra passengers (/head after 1st free)'
);
assert(
  extrasContext.surcharges.some(s => s.name.includes('Intermediate Stops') && s.amount === 10.00),
  'Applied .00 for 2 intermediate stops (/stop)'
);
assert(
  extrasContext.surcharges.some(s => s.name.includes('Curb Waiting') && s.amount === 5.00),
  'Applied .00 for 10 billable curb waiting minutes'
);
console.log('  Extras trip total: $' + extrasContext.totalFare.toFixed(2));

// Test 5: Hourly Dedicated Charter
console.log('\n--- Test 5: Hourly Dedicated Driver Charter (/hr) ---');
const hourlyRes = calculateTripPricing(
  {
    distanceMiles: 45.0,
    durationMinutes: 180,
    isHourlyBooking: true,
    hourlyDurationHours: 3,
  },
  baseConfig
);
const hourlyContext = hourlyRes.context;

assert(
  hourlyContext.tariffProfileId === 'tariff-hourly-charter',
  'Routes to Hourly Charter tariff',
  'Got tariff: ' + hourlyContext.tariffProfileId
);
assert(
  hourlyContext.totalFare === 225.00,
  'Hourly booking billed at /hr (3 hours = .00)',
  'Got total: ' + hourlyContext.totalFare
);
console.log('  Hourly 3-hr charter total: $' + hourlyContext.totalFare.toFixed(2));

console.log('\n=== RESULTS: ' + passed + ' PASSED, ' + failed + ' FAILED ===');
if (failed > 0) {
  process.exit(1);
}