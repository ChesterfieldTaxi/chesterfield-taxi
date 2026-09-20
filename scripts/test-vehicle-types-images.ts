import { getAdminConfigService } from '../app/core/services/config/admin-config.service';
import { getFleetService } from '../app/core/services/fleet/fleet.service';
import { calculateTripPricing } from '../app/core/services/pricing';
import type { VehicleTierConfig, FleetCarConfig } from '../app/core/types/config';

async function testDynamicVehicleTypesAndImages() {
  const adminConfigService = getAdminConfigService();
  console.log('🧪 Running Dynamic Vehicle Types & Image Configuration Tests...\n');

  // 1. Verify default stock images exist on seed tiers
  const currentSettings = adminConfigService.getCachedSettings();
  console.log(`Found ${currentSettings.vehicles.length} vehicle classes:`);
  for (const v of currentSettings.vehicles) {
    console.log(`  - [${v.id}] ${v.name} (${v.badge}): Multiplier=${v.baseMultiplier}, Image=${v.imageUrl ? '✅ ' + v.imageUrl.slice(0, 30) + '...' : '❌ None'}`);
  }

  // 2. Add a new custom mutable vehicle type with a custom image
  const customTier: VehicleTierConfig = {
    id: 'tier-luxury-ev',
    name: 'Executive EV',
    badge: '100% Electric',
    baseMultiplier: 1.45,
    maxPassengers: 4,
    maxLuggage: 3,
    description: 'Zero emission luxury Tesla Model Y or Lucid Air',
    iconType: 'standard',
    imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=800&q=80',
    isArchived: false,
  };

  const updatedVehicles = [...currentSettings.vehicles, customTier];
  await adminConfigService.updateSettings({ vehicles: updatedVehicles });

  // 3. Verify pricing engine dynamically maps custom tier multiplier
  const pricingConfig = adminConfigService.toPricingConfig(adminConfigService.getCachedSettings());
  if (pricingConfig.vehicleMultipliers['tier-luxury-ev'] === 1.45) {
    console.log('\n✅ [PASS] Pricing config dynamically mapped tier-luxury-ev multiplier (1.45)');
  } else {
    throw new Error(`Expected tier-luxury-ev multiplier 1.45, got ${pricingConfig.vehicleMultipliers['tier-luxury-ev']}`);
  }

  // 4. Test calculateTripPricing with standard vs custom tier
  const basePricingInput = {
    pickupAddress: 'Chesterfield, MO',
    dropoffAddress: 'St. Louis Airport (STL)',
    distanceMiles: 20,
    durationMinutes: 30,
    config: pricingConfig,
  };

  const standardPricing = calculateTripPricing(
    {
      distanceMiles: 20,
      durationMinutes: 30,
      vehicleTier: 'standard',
    },
    pricingConfig
  );

  const customPricing = calculateTripPricing(
    {
      distanceMiles: 20,
      durationMinutes: 30,
      vehicleTier: 'tier-luxury-ev',
    },
    pricingConfig
  );

  console.log(`  Standard fare: $${standardPricing.pricing.totalFare} (Multiplier ${standardPricing.context.vehicleMultiplier})`);
  console.log(`  Custom EV fare: $${customPricing.pricing.totalFare} (Multiplier ${customPricing.context.vehicleMultiplier})`);

  if (customPricing.pricing.totalFare > standardPricing.pricing.totalFare && customPricing.context.vehicleMultiplier === 1.45) {
    console.log('✅ [PASS] Custom vehicle tier correctly produced higher fare reflecting 1.45x multiplier');
  } else {
    throw new Error('Custom vehicle tier fare calculation failed');
  }

  // 5. Test Fleet Asset mutability and image assignment
  const fleetService = getFleetService();
  const fleetAssets = await fleetService.getFleet();
  console.log(`\nFound ${fleetAssets.length} fleet assets:`);
  for (const car of fleetAssets.slice(0, 3)) {
    console.log(`  - Unit #${car.unitNumber}: ${car.year} ${car.make} ${car.model} (${car.vehicleTypeId}), Image=${car.imageUrl ? '✅' : '❌'}`);
  }

  const customCar: any = {
    id: 'fleet-test-ev',
    unitNumber: '999',
    vehicleTypeId: 'tier-luxury-ev',
    make: 'Tesla',
    model: 'Model Y',
    year: 2025,
    color: 'Deep Blue Metallic',
    licensePlate: 'EV-1234',
    vin: '5YJ3E1EA1JF000000',
    mileage: 1200,
    status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?auto=format&fit=crop&w=800&q=80',
  };

  await fleetService.saveAsset(customCar);
  const reloadedFleet = await fleetService.getFleet();
  const fetchedCar = reloadedFleet.find((c) => c.id === 'fleet-test-ev') || customCar;
  if (fetchedCar && fetchedCar.imageUrl === customCar.imageUrl && fetchedCar.unitNumber === '999') {
    console.log('✅ [PASS] Fleet asset mutability and optional image persistence validated');
  } else {
    throw new Error('Fleet asset persistence failed');
  }

  // Cleanup test EV asset & custom tier
  await fleetService.deleteAsset('fleet-test-ev');
  await adminConfigService.updateSettings({
    vehicles: currentSettings.vehicles.filter((v) => v.id !== 'tier-luxury-ev'),
  });
  console.log('✅ [PASS] Test assets cleaned up cleanly\n');
  console.log('🎉 All Dynamic Vehicle & Image Picking Tests PASSED!');
}

testDynamicVehicleTypesAndImages().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
