import { getSpecialPlacesService, DEFAULT_SPECIAL_PLACES } from '../app/core/services/places/special-places.service';

console.log('=== VERIFYING SPECIAL PLACES SERVICE ===\n');

const service = getSpecialPlacesService();
const allPlaces = service.getAllPlaces();

console.log(`Loaded ${allPlaces.length} default special places.`);
if (allPlaces.length < 10) {
  throw new Error(`Expected at least 10 places, found ${allPlaces.length}`);
}

// Test search by alias
console.log('\n--- Testing Search by Alias "STL" ---');
const stlResults = service.searchPlaces('STL');
console.log(`Matches for "STL": ${stlResults.map(p => p.name).join(', ')}`);
if (!stlResults.some(p => p.id === 'place-lambert-airport-stl')) {
  throw new Error('Expected Lambert Airport to match "STL" alias');
}
console.log('[PASS] Search by alias "STL" successfully retrieved Lambert Airport.');

// Test search by alias "Valley"
console.log('\n--- Testing Search by Alias "Valley" ---');
const valleyResults = service.searchPlaces('Valley');
console.log(`Matches for "Valley": ${valleyResults.map(p => p.name).join(', ')}`);
if (!valleyResults.some(p => p.name.includes('Chesterfield Valley'))) {
  throw new Error('Expected Chesterfield Valley to match "Valley"');
}
console.log('[PASS] Search by alias "Valley" successfully retrieved Chesterfield Valley.');

// Test popular places
console.log('\n--- Testing Popular Places ---');
const popular = service.getPopularPlaces();
console.log(`Popular places (${popular.length}): ${popular.map(p => p.shortName || p.name).join(', ')}`);
if (popular.length === 0) {
  throw new Error('Expected popular places');
}
console.log('[PASS] Retrieved popular places for instant focus dropdown.');

console.log('\n=== ALL SPECIAL PLACES CHECKS PASSED ===');
