import { evaluateTaximeterFare, matchTariffProfile, DEFAULT_TARIFF_PROFILES } from '../app/core/services/pricing/tariff.service';
import { calculateTripPricing } from '../app/core/services/pricing/pipeline';
import { DEFAULT_PRICING_CONFIG } from '../app/core/services/pricing/rules';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName} (Got: ${actual})`);
    passed++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName} (Expected: ${expected}, Got: ${actual})`);
    failed++;
  }
}

async function runTests() {
  console.log('\n=== TESTING UNIFIED TARIFFS & MIGRATION ===\n');

  // Test 1: Standard Flat Rate Profile Matching
  console.log('1. Profile Matching:');
  const standardProfile = matchTariffProfile({ vehicleTier: 'standard' } as any, DEFAULT_TARIFF_PROFILES);
  assertEqual(standardProfile.id, 'tariff-standard-flat', 'Vehicle standard matches tariff-standard-flat');

  const sedanProfile = matchTariffProfile({ vehicleTier: 'sedan' } as any, DEFAULT_TARIFF_PROFILES);
  assertEqual(sedanProfile.id, 'tariff-standard-flat', 'Vehicle sedan matches tariff-standard-flat');

  const suvProfile = matchTariffProfile({ vehicleTier: 'suv' } as any, DEFAULT_TARIFF_PROFILES);
  assertEqual(suvProfile.id, 'tariff-minivan-flat', 'Vehicle suv matches tariff-minivan-flat');

  const vanProfile = matchTariffProfile({ vehicleTier: 'van' } as any, DEFAULT_TARIFF_PROFILES);
  assertEqual(vanProfile.id, 'tariff-minivan-flat', 'Vehicle van matches tariff-minivan-flat');

  const xlProfile = matchTariffProfile({ vehicleTier: 'xl' } as any, DEFAULT_TARIFF_PROFILES);
  assertEqual(xlProfile.id, 'tariff-minivan-flat', 'Vehicle xl matches tariff-minivan-flat');

  // Test 2: Standard Flat Rate Calculations
  console.log('\n2. Standard Flat Rate Taximeter Calculations:');
  
  // 5 miles: $0 + 50 * $0.255 = $12.75 -> $28.00 minimum floor
  const shortTrip = evaluateTaximeterFare(standardProfile.taximeter, 5.0, 15);
  assertEqual(shortTrip.baseFare, 0.00, 'Standard start price is $0.00');
  assertEqual(shortTrip.distanceFare, 12.75, 'Standard 5.0 mi distance fare is $12.75');
  assertEqual(shortTrip.isFloorApplied, true, 'Floor is applied for $12.75 < $28.00');
  assertEqual(shortTrip.subtotal, 28.00, 'Standard 5.0 mi subtotal is floored to $28.00');

  // 20 miles: $0 + 200 * $0.255 = $51.00
  const twentyMiTrip = evaluateTaximeterFare(standardProfile.taximeter, 20.0, 30);
  assertEqual(twentyMiTrip.distanceFare, 51.00, 'Standard 20.0 mi distance fare is $51.00');
  assertEqual(twentyMiTrip.subtotal, 51.00, 'Standard 20.0 mi subtotal is $51.00');

  // 25 miles: 20 mi @ $0.255/0.1 mi ($51.00) + 5 mi @ $0.230/0.1 mi ($11.50) = $62.50
  const twentyFiveMiTrip = evaluateTaximeterFare(standardProfile.taximeter, 25.0, 40);
  assertEqual(twentyFiveMiTrip.distanceFare, 62.50, 'Standard 25.0 mi distance fare is $62.50');
  assertEqual(twentyFiveMiTrip.subtotal, 62.50, 'Standard 25.0 mi subtotal is $62.50');

  // Test 3: MiniVan Flat Rate Calculations ($10 extra)
  console.log('\n3. MiniVan Flat Rate Taximeter Calculations:');
  
  // 25 miles: $10 start + $51.00 primary + $11.50 then = $72.50
  const minivanTwentyFive = evaluateTaximeterFare(suvProfile.taximeter, 25.0, 40);
  assertEqual(minivanTwentyFive.baseFare, 10.00, 'Minivan start price is $10.00');
  assertEqual(minivanTwentyFive.distanceFare, 62.50, 'Minivan 25.0 mi distance fare is $62.50');
  assertEqual(minivanTwentyFive.subtotal, 72.50, 'Minivan 25.0 mi subtotal is $72.50 ($10 more than standard)');

  // Test 4: Traffic Overcharge is $0
  console.log('\n4. Zero Traffic Overcharge:');
  const heavyTraffic = evaluateTaximeterFare(standardProfile.taximeter, 10.0, 180); // 3 hours in traffic
  assertEqual(heavyTraffic.delayFare, 0.00, '3 hours in traffic has $0.00 delay fare');

  // Test 5: Full Pipeline with Extras (Passengers and Car Seats)
  console.log('\n5. End-to-End Pricing Pipeline with Extras:');

  const config = {
    ...DEFAULT_PRICING_CONFIG,
    tariffs: DEFAULT_TARIFF_PROFILES,
    namedPricingRules: [],
  };

  // Standard 25 miles with 3 passengers (1 free + 2 extra @ $1.00)
  const p3Trip = calculateTripPricing(
    {
      pickupDateTime: new Date(),
      distanceMiles: 25.0,
      durationMinutes: 40,
      vehicleTier: 'standard',
      passengers: 3,
    },
    config
  );
  assertEqual(p3Trip.pricing.totalFare, 64.50, 'Standard 25 mi with 3 pax = $62.50 + $2.00 = $64.50');

  // Minivan 25 miles with 1 pax and 2 car seats ($20 extra)
  const carSeatTrip = calculateTripPricing(
    {
      pickupDateTime: new Date(),
      distanceMiles: 25.0,
      durationMinutes: 40,
      vehicleTier: 'xl',
      passengers: 1,
      carSeatsBreakdown: {
        rearFacing: 1,
        frontFacing: 1,
        booster: 0,
        total: 2,
      },
    },
    config
  );
  assertEqual(carSeatTrip.pricing.totalFare, 92.50, 'Minivan 25 mi with 2 car seats = $72.50 + $20.00 = $92.50');

  // Minivan 20 miles with 4 pax and 1 car seat:
  // Fare: $10 start + $51 dist = $61.00
  // Extra pax: 3 * $1.00 = $3.00
  // Car seat: 1 * $10.00 = $10.00
  // Total: $74.00
  const combinedTrip = calculateTripPricing(
    {
      pickupDateTime: new Date(),
      distanceMiles: 20.0,
      durationMinutes: 30,
      vehicleTier: 'xl',
      passengers: 4,
      carSeatsBreakdown: {
        rearFacing: 1,
        frontFacing: 0,
        booster: 0,
        total: 1,
      },
    },
    config
  );
  assertEqual(combinedTrip.pricing.totalFare, 74.00, 'Minivan 20 mi with 4 pax and 1 car seat = $74.00');

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
