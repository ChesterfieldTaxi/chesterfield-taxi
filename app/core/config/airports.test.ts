import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectAirportInAddresses } from './airports';

describe('detectAirportInAddresses', () => {
  it('does not treat Chesterfield Airport Rd / Road street addresses as SUS airport', () => {
    const rdResult = detectAirportInAddresses(
      '17107 Chesterfield Airport Rd, Chesterfield, MO 63005',
      '100 N Broadway, St. Louis, MO 63102'
    );
    assert.equal(rdResult.isAirportTrip, false);
    assert.equal(rdResult.airport, null);

    const roadResult = detectAirportInAddresses(
      '100 N Broadway, St. Louis, MO 63102',
      '16800 Chesterfield Airport Road, Chesterfield, MO 63005'
    );
    assert.equal(roadResult.isAirportTrip, false);
    assert.equal(roadResult.airport, null);
  });

  it('still detects Spirit of St. Louis Airport (SUS) for actual airport references', () => {
    const byName = detectAirportInAddresses(
      'Spirit of St. Louis Airport, Chesterfield, MO',
      '100 N Broadway, St. Louis, MO 63102'
    );
    assert.equal(byName.isAirportTrip, true);
    assert.equal(byName.isPickupAirport, true);
    assert.equal(byName.airport?.iataCode, 'SUS');

    const byKeyword = detectAirportInAddresses(
      'Chesterfield Airport, Chesterfield, MO',
      '100 N Broadway, St. Louis, MO 63102'
    );
    assert.equal(byKeyword.isAirportTrip, true);
    assert.equal(byKeyword.airport?.iataCode, 'SUS');
  });
});
