/**
 * Verification Script for Live Twilio Telephony & Admin Persistence
 */

import { AdminConfigService } from '../app/core/services/config/admin-config.service';
import { validatePhoneNumber, sanitizeToE164, formatDisplayPhone } from '../app/core/utils/phone';
import { action as telephonyAction, loader as telephonyLoader } from '../app/routes/api.telephony';

let failures = 0;
let passed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${testName}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${testName} ${detail ? `(${detail})` : ''}`);
    failures++;
  }
}

async function runTests() {
  console.log('\n=== [TWILIO HOOKUP] ADMIN SETTINGS & TELEPHONY VERIFICATION ===\n');

  // 1. AppSettings & AdminConfigService Integrations Block
  console.log('1. AdminConfigService Integrations Config:');
  const configService = new AdminConfigService();
  const settings = configService.getCachedSettings();

  assert(Boolean(settings.integrations), 'settings.integrations exists in AppSettings');
  assert(settings.integrations?.telephony?.provider === 'twilio', 'Default telephony provider is "twilio"');
  assert(Boolean(settings.integrations?.telephony?.phoneNumber), 'Default outbound Twilio number is populated');
  assert(settings.integrations?.telephony?.status === 'idle', 'Initial telephony status is "idle"');

  // 2. Phone Validation for Twilio Outbound & SMS
  console.log('\n2. Telephony Input Validation:');
  const validTwilio = validatePhoneNumber('+13147380100');
  assert(validTwilio.isValid && validTwilio.e164 === '+13147380100', 'Valid E.164 Twilio number passes', validTwilio.e164);

  const localPhone = validatePhoneNumber('314-739-8444');
  assert(localPhone.isValid && localPhone.e164 === '+13147398444', 'Formatted local phone normalizes to E.164');

  const invalidSID = validatePhoneNumber('12345');
  assert(!invalidSID.isValid, 'Short invalid phone number is rejected');

  // 3. Telephony API Webhook Loader Tests
  console.log('\n3. Serverless Telephony Route & Webhook Tests:');

  const voiceWebhookReq = new Request('https://chesterfieldtaxi.com/api/telephony?action=incoming_call');
  const voiceWebhookRes = await telephonyLoader({ request: voiceWebhookReq, params: {}, context: {} } as any);
  const voiceXml = await voiceWebhookRes.text();
  assert(voiceWebhookRes.headers.get('Content-Type') === 'text/xml', 'incoming_call returns text/xml header');
  assert(voiceXml.includes('<Say') && voiceXml.includes('<Dial'), 'incoming_call contains valid TwiML Say and Dial nodes');

  const smsWebhookReq = new Request('https://chesterfieldtaxi.com/api/telephony?action=incoming_sms');
  const smsWebhookRes = await telephonyLoader({ request: smsWebhookReq, params: {}, context: {} } as any);
  const smsXml = await smsWebhookRes.text();
  assert(smsWebhookRes.headers.get('Content-Type') === 'text/xml', 'incoming_sms returns text/xml header');
  assert(smsXml.includes('<Message'), 'incoming_sms contains valid TwiML Message node');

  // 4. Action Validation & Error Handling
  console.log('\n4. Telephony API Action Rejection Handling:');

  // Reject malformed SID on save_credentials
  const badSidReq = new Request('https://chesterfieldtaxi.com/api/telephony', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'save_credentials',
      credentials: {
        accountSid: 'INVALID_SID_NOT_AC',
        authToken: 'some_long_auth_token_here_12345',
        phoneNumber: '+13147380100',
      },
    }),
  });
  const badSidRes = await telephonyAction({ request: badSidReq, params: {}, context: {} } as any);
  const badSidData = await badSidRes.json();
  assert(!badSidData.success, 'save_credentials rejects non-AC Account SID');

  // Reject missing phone on make_call
  const missingToReq = new Request('https://chesterfieldtaxi.com/api/telephony', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'make_call',
    }),
  });
  const missingToRes = await telephonyAction({ request: missingToReq, params: {}, context: {} } as any);
  const missingToData = await missingToRes.json();
  assert(!missingToData.success, 'make_call rejects missing "to" parameter');

  // Reject missing body on send_sms
  const missingBodyReq = new Request('https://chesterfieldtaxi.com/api/telephony', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'send_sms',
      to: '+13147398444',
    }),
  });
  const missingBodyRes = await telephonyAction({ request: missingBodyReq, params: {}, context: {} } as any);
  const missingBodyData = await missingBodyRes.json();
  assert(!missingBodyData.success, 'send_sms rejects missing "body" parameter');

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passed + failures} | PASSED: ${passed} | FAILED: ${failures}`);
  console.log(`========================================\n`);

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
