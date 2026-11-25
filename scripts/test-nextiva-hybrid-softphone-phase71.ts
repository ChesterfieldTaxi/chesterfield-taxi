/**
 * Platform Phase 71 + 71.B Automated Verification Suite
 * (`scripts/test-nextiva-hybrid-softphone-phase71.ts`)
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildIncomingCallTwiml,
  buildOutboundClientCallTwiml,
  buildTelephonyWebhookUrls,
  buildVoiceDialStatusTwiml,
  resolveOutboundCallerId,
  resolveTelephonyInboundMode,
} from '../app/core/services/comms/telephony-twiml.util';
import {
  computeTwilioWebhookSignature,
  resolveCredentials,
  verifyTwilioWebhookSignature,
} from '../app/core/services/comms/telephony-credentials.server';
import {
  handleTelephonyGet,
  handleTelephonyPost,
  resetTelephonyGatewayStoreForTests,
} from '../app/core/services/comms/telephony-gateway.server';
import { resetCommsServerStoreForTests } from '../app/core/services/comms/comms-thread.server';
import {
  DEFAULT_APP_SETTINGS,
  normalizeIntegrationsConfig,
} from '../app/core/services/config/admin-config.service';
import { TelephonyWebhookGuideCard } from '../app/components/domain/admin/integrations/TelephonyWebhookGuideCard';
import { TelephonyAndSmsTemplatesPanel } from '../app/components/domain/admin/integrations/TelephonyAndSmsTemplatesPanel';

const ROOT_DIR = process.cwd();
const readRel = (rel: string): string => fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');

function collectFiles(dir: string, extRegex: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectFiles(full, extRegex));
    else if (entry.isFile() && extRegex.test(entry.name)) results.push(full);
  }
  return results;
}

const PHASE71_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  TWILIO_ACCOUNT_SID: 'AC_TEST_FIXTURE',
  TWILIO_AUTH_TOKEN: 'tw_auth_token_test_fixture_phase71',
  TWILIO_PHONE_NUMBER: '+13147380100',
  TWILIO_BRIDGE_PHONE_NUMBER: '+13142281454',
  TWILIO_API_KEY_SID: 'SK_TEST_FIXTURE',
  TWILIO_API_KEY_SECRET: 'api_secret_test_fixture_phase71',
  TWILIO_TWIML_APP_SID: 'AP_TEST_FIXTURE',
  DISPATCH_FORWARDING_PHONE: '+13145550100',
};

const signedGet = (url: string) =>
  new Request(url, {
    headers: { 'X-Twilio-Signature': computeTwilioWebhookSignature(PHASE71_ENV.TWILIO_AUTH_TOKEN, url, null) },
  });

const signedPost = (url: string, params: Record<string, string>, sigUrl = url) =>
  new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Twilio-Signature': computeTwilioWebhookSignature(PHASE71_ENV.TWILIO_AUTH_TOKEN, sigUrl, params),
    },
    body: new URLSearchParams(params).toString(),
  });

function testInboundModeCallerIdAndWebhookUrls(): void {
  console.log('1️⃣  Testing resolveTelephonyInboundMode, resolveOutboundCallerId & Webhook URLs...');
  for (const tok of ['simulring', 'simultaneous_ring', 'nextiva_bridge', 'SIMULRING']) {
    assert.equal(resolveTelephonyInboundMode(tok), 'simultaneous_ring');
  }
  for (const tok of ['standalone', 'standalone_ivr', 'ivr']) {
    assert.equal(resolveTelephonyInboundMode(tok), 'standalone_ivr');
  }
  assert.equal(resolveTelephonyInboundMode('standalone', 'simulring', 'simultaneous_ring'), 'standalone_ivr');
  assert.equal(resolveTelephonyInboundMode(null, 'nextiva_bridge', 'standalone_ivr'), 'simultaneous_ring');
  assert.equal(resolveTelephonyInboundMode(undefined, '', 'simultaneous_ring'), 'simultaneous_ring');
  assert.equal(resolveTelephonyInboundMode(undefined, undefined, undefined), 'standalone_ivr');

  assert.equal(resolveOutboundCallerId({ fromNumber: '+13145550999', callerId: '+13145550888', phoneNumber: '+13147380100', bridgePhoneNumber: '+13142281454' }), '+13145550999');
  assert.equal(resolveOutboundCallerId({ callerId: '+13145550888', phoneNumber: '+13147380100', bridgePhoneNumber: '+13142281454' }), '+13145550888');
  assert.equal(resolveOutboundCallerId({ phoneNumber: '+13147380100', bridgePhoneNumber: '+13142281454' }), '+13147380100');
  assert.equal(resolveOutboundCallerId({ phoneNumber: '', bridgePhoneNumber: '+13142281454' }), '+13142281454');

  const simUrls = buildTelephonyWebhookUrls('https://chesterfieldtaxi.com/', 'simultaneous_ring');
  assert.equal(simUrls.inboundVoiceUrl, 'https://chesterfieldtaxi.com/api/telephony?action=incoming_call&mode=simulring');
  assert.equal(simUrls.outboundTwimlAppUrl, 'https://chesterfieldtaxi.com/api/telephony?action=voice_client_twiml');
  assert.equal(simUrls.callStatusCallbackUrl, 'https://chesterfieldtaxi.com/api/telephony?action=call_status_callback');
  assert.equal(buildTelephonyWebhookUrls('https://chesterfieldtaxi.com', 'standalone_ivr').inboundVoiceUrl, 'https://chesterfieldtaxi.com/api/telephony?action=incoming_call');
}

function testZeroSdkPureTwimlBuilders(): void {
  console.log('2️⃣  Testing Zero-SDK TwiML Builders (incoming_call, voice_client_twiml & voice_dial_status)...');
  const simXml = buildIncomingCallTwiml({ mode: 'simultaneous_ring', clientIdentity: 'dispatch_agent', forwardingPhone: '+13145550100' });
  for (const required of ['answerOnBridge="true"', 'timeout="25"', 'record="record-from-answer"', 'recordingStatusCallback="/api/telephony?action=call_recording_status"', 'recordingStatusCallbackEvent="completed"', '<Client>dispatch_agent</Client>', '<Reject reason="busy"/>']) {
    assert.equal(simXml.includes(required), true, `simulring TwiML must include ${required}`);
  }
  for (const forbidden of ['<Say', '<Record', 'handle_unanswered', '<Number>']) {
    assert.equal(simXml.includes(forbidden), false, `simulring TwiML must NOT include ${forbidden}`);
  }
  const ivrXml = buildIncomingCallTwiml({ mode: 'standalone_ivr', clientIdentity: 'dispatch_agent', forwardingPhone: '+13145550100' });
  assert.equal(ivrXml.includes('<Say voice="alice">Thank you for calling Chesterfield Taxi.') && ivrXml.includes('action="/api/telephony?action=handle_unanswered"') && ivrXml.includes('<Number>+13145550100</Number>'), true);

  // Outbound WebRTC softphone XML
  const outXml = buildOutboundClientCallTwiml({ to: '+13145857762', callerId: '+13147380100' });
  for (const needle of [
    '<?xml version="1.0" encoding="UTF-8"?><Response>',
    'callerId="+13147380100"', 'timeout="30"', 'record="record-from-answer"',
    'recordingStatusCallback="/api/telephony?action=call_recording_status"',
    'recordingStatusCallbackEvent="completed"', 'action="/api/telephony?action=voice_dial_status"',
    '<Number>+13145857762</Number></Dial></Response>',
  ]) assert.equal(outXml.includes(needle), true, `outbound TwiML must include ${needle}`);
  assert.equal(buildOutboundClientCallTwiml({ to: '+13145857762', callerId: '' }).includes('callerId='), false);
  assert.equal(buildOutboundClientCallTwiml({ to: '' }), '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">No destination number was provided.</Say><Hangup/></Response>');

  // Dial status diagnostics TwiML
  const failStatusXml = buildVoiceDialStatusTwiml({ dialCallStatus: 'failed', errorCode: '21212' });
  assert.equal(failStatusXml.includes('The outbound call could not be completed. Please confirm your outbound caller ID is verified in Twilio Console.') && failStatusXml.includes('<Hangup/>'), true);
  assert.equal(buildVoiceDialStatusTwiml({ dialCallStatus: 'completed' }), '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
}

async function testTelephonyGatewayClientRoutingAndApexWwwSignatures(): Promise<void> {
  console.log('3️⃣  Testing GET/POST simulring, From=client:* routing, voice_dial_status & apex/www signatures...');
  resetCommsServerStoreForTests();
  resetTelephonyGatewayStoreForTests();

  const resolved = await resolveCredentials(undefined, { ...PHASE71_ENV, TWILIO_INBOUND_MODE: 'simulring' });
  assert.deepEqual([resolved.phoneNumber, resolved.bridgePhoneNumber, resolved.inboundMode], ['+13147380100', '+13142281454', 'simultaneous_ring']);

  const simUrl = 'https://chesterfieldtaxi.com/api/telephony?action=incoming_call&mode=simulring';
  const getSimRes = await handleTelephonyGet(signedGet(simUrl), { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true });
  assert.equal(getSimRes.status, 200);
  assert.equal(getSimRes.headers.get('Content-Type'), 'text/xml');
  const getSimXml = await getSimRes.text();
  assert.equal(getSimXml.includes('answerOnBridge="true"') && !getSimXml.includes('<Say') && !getSimXml.includes('handle_unanswered'), true);

  const postSimRes = await handleTelephonyPost(
    signedPost(simUrl, { CallSid: 'CA_SIMUL_001', From: '+13145550199', To: '+13142281454' }),
    { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true }
  );
  const postSimXml = await postSimRes.text();
  assert.equal(postSimRes.status === 200 && postSimXml.includes('answerOnBridge="true"') && postSimXml.includes('<Reject reason="busy"/>') && !postSimXml.includes('<Say'), true);

  // Critical Phase 71.B check: POST /api/telephony WITHOUT ?action= and with From=client:dispatch_agent routes to voice_client_twiml (NOT incoming_call)
  const bareUrl = 'https://chesterfieldtaxi.com/api/telephony';
  const clientOutParams = { CallSid: 'CA_CLIENT_OUT_01', From: 'client:dispatch_agent', To: '+13145857762' };
  const clientOutRes = await handleTelephonyPost(signedPost(bareUrl, clientOutParams), { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true });
  assert.equal(clientOutRes.status, 200);
  assert.equal(clientOutRes.headers.get('Content-Type'), 'text/xml');
  const clientOutXml = await clientOutRes.text();
  assert.equal(clientOutXml.includes('callerId="+13147380100"') && clientOutXml.includes('<Number>+13145857762</Number>'), true);
  assert.equal(clientOutXml.includes('Thank you for calling') || clientOutXml.includes('<Client>'), false, 'must NOT route From=client:* to incoming_call');

  // Apex <-> www signature verification across redirects
  const apexUrl = 'https://chesterfieldtaxi.com/api/telephony?action=voice_client_twiml';
  const wwwUrl = 'https://www.chesterfieldtaxi.com/api/telephony?action=voice_client_twiml';
  const dialParams = { To: '+13145857762', From: 'client:dispatch_agent' };
  const sigForApex = computeTwilioWebhookSignature(PHASE71_ENV.TWILIO_AUTH_TOKEN, apexUrl, dialParams);
  const sigForWww = computeTwilioWebhookSignature(PHASE71_ENV.TWILIO_AUTH_TOKEN, wwwUrl, dialParams);

  assert.equal(verifyTwilioWebhookSignature({ url: wwwUrl, params: dialParams, signatureHeader: sigForApex, authToken: PHASE71_ENV.TWILIO_AUTH_TOKEN }).valid, true);
  assert.equal(verifyTwilioWebhookSignature({ url: apexUrl, params: dialParams, signatureHeader: sigForWww, authToken: PHASE71_ENV.TWILIO_AUTH_TOKEN }).valid, true);

  const crossHostRes = await handleTelephonyPost(signedPost(wwwUrl, dialParams, apexUrl), { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true });
  assert.equal(crossHostRes.status, 200);
  assert.equal((await crossHostRes.text()).includes('callerId="+13147380100"'), true);

  // Voice webhook signature failure returns valid text/xml TwiML (never JSON)
  const badVoiceSigRes = await handleTelephonyPost(
    new Request(apexUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'badSig==' }, body: 'To=%2B13145857762' }),
    { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true }
  );
  assert.equal(badVoiceSigRes.headers.get('Content-Type'), 'text/xml');
  assert.equal((await badVoiceSigRes.text()).includes('Dispatch voice webhook configuration check failed.'), true);

  // Fallback to bridgePhoneNumber when TWILIO_PHONE_NUMBER unset + voice_dial_status POST
  const fallbackXml = await (await handleTelephonyPost(signedPost(apexUrl, dialParams), { env: { ...PHASE71_ENV, TWILIO_PHONE_NUMBER: '' }, enforceWebhookSignature: true, skipFirestore: true })).text();
  assert.equal(fallbackXml.includes('callerId="+13142281454"'), true);

  const dialStatUrl = 'https://chesterfieldtaxi.com/api/telephony?action=voice_dial_status';
  const dialStatRes = await handleTelephonyPost(signedPost(dialStatUrl, { CallSid: 'CA_1', DialCallStatus: 'failed', ErrorCode: '21212' }), { env: PHASE71_ENV, enforceWebhookSignature: true, skipFirestore: true });
  assert.equal(dialStatRes.status === 200 && (await dialStatRes.text()).includes('confirm your outbound caller ID is verified'), true);
}

function testNormalizeConfigSsrAndCommsHygiene(): void {
  console.log('4️⃣  Testing normalizeIntegrationsConfig, SSR Markup, Phantom Purge & Flex Scroll...');
  const normalized = normalizeIntegrationsConfig({
    telephony: {
      provider: 'twilio', accountSid: 'AC_TEST_FIXTURE', phoneNumber: '+13147380100',
      bridgePhoneNumber: ' +13142281454 ', inboundMode: 'simultaneous_ring', voiceOnlyMode: true,
      authToken: 'SHOULD_BE_STRIPPED_FIXTURE', apiKeySecret: 'SHOULD_BE_STRIPPED_FIXTURE',
    },
  });
  assert.deepEqual([normalized.telephony?.phoneNumber, normalized.telephony?.bridgePhoneNumber, normalized.telephony?.inboundMode, normalized.telephony?.voiceOnlyMode], ['+13147380100', '+13142281454', 'simultaneous_ring', true]);
  assert.equal('authToken' in (normalized.telephony || {}) || 'apiKeySecret' in (normalized.telephony || {}), false);

  const guideSimHtml = renderToStaticMarkup(React.createElement(TelephonyWebhookGuideCard, {
    inboundMode: 'simultaneous_ring', outboundCallerId: '+13147380100', bridgePhoneNumber: '+13142281454', voiceOnlyMode: true, origin: 'https://chesterfieldtaxi.com',
  }));
  for (const needle of [
    'https://chesterfieldtaxi.com/api/telephony?action=incoming_call&amp;mode=simulring',
    'https://chesterfieldtaxi.com/api/telephony?action=voice_client_twiml',
    'https://chesterfieldtaxi.com/api/telephony?action=call_status_callback',
    'Simulate Incoming Ring (Local Test)', 'Voice-Only (A2P SMS Deferred)',
  ]) assert.equal(guideSimHtml.includes(needle), true);

  const panelHtml = renderToStaticMarkup(React.createElement(TelephonyAndSmsTemplatesPanel, {
    settings: { ...DEFAULT_APP_SETTINGS, integrations: { ...DEFAULT_APP_SETTINGS.integrations, telephony: { provider: 'twilio', accountSid: 'AC_TEST_FIXTURE', phoneNumber: '+13147380100', bridgePhoneNumber: '+13142281454', inboundMode: 'simultaneous_ring', voiceOnlyMode: true, status: 'connected' } } },
    onSave: async () => {}, onNotifySuccess: () => {},
  }));
  for (const needle of ['Verified Outbound Caller ID', 'Twilio Inbound Bridge Number', 'Inbound Call Mode', 'Voice-Only Mode (A2P SMS Deferred)', 'Paused — Voice-Only Mode']) {
    assert.equal(panelHtml.includes(needle), true);
  }

  // Zero `import twilio` in telephony-twiml-webhooks.server.ts
  const webhooksSrc = readRel('app/core/services/comms/telephony-twiml-webhooks.server.ts');
  assert.equal(/\bimport\s+twilio\b/.test(webhooksSrc) || /from\s+['"]twilio['"]/.test(webhooksSrc), false, 'telephony-twiml-webhooks.server.ts must have 0 twilio SDK imports');

  // Zero `+13147391800` & zero 12_000 polling interval in useCommsInteractionSync.ts
  const syncSrc = readRel('app/components/domain/dispatch/comms/useCommsInteractionSync.ts');
  assert.equal(syncSrc.includes('+13147391800'), false, 'must purge hardcoded +13147391800 phantom phone');
  assert.equal(/\b12_?000\b/.test(syncSrc) || /\bsetInterval\b/.test(syncSrc), false, 'must remove 12s setInterval polling');

  // Omnichannel thread flex scroll min-h-0 fixes
  const commsHubSrc = readRel('app/components/domain/dispatch/CommsHub.tsx');
  assert.equal(commsHubSrc.includes('flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden'), true, 'CommsHub thread container must include min-h-0');
  const smsPaneSrc = readRel('app/components/domain/dispatch/comms/SmsThreadPane.tsx');
  assert.equal(smsPaneSrc.includes('flex-1 min-h-0 flex flex-col min-w-0 overflow-hidden bg-white'), true, 'SmsThreadPane root must include min-h-0 overflow-hidden');
  assert.equal(smsPaneSrc.includes('flex-1 min-h-0 overflow-y-auto'), true, 'SmsThreadPane stream must include min-h-0');
}

function testGuardrailsAndLineCeilings(): void {
  console.log('5️⃣  Testing 0 <select>, Secret Hygiene, Line Ceilings & Untouched Files...');
  for (const filePath of collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/)) {
    const rel = path.relative(ROOT_DIR, filePath).replace(/\\/g, '/');
    assert.equal(/<select\b/.test(fs.readFileSync(filePath, 'utf8')), false, `${rel} must contain 0 raw <select>`);
  }
  const secretShapes = [/\bAC[0-9a-f]{32}\b/i, /\bSK[0-9a-f]{32}\b/i, /\bAP[0-9a-f]{32}\b/i, /AKIA[0-9A-Z]{16}/, /sk_(live|test)_[0-9A-Za-z]{16,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  for (const rel of [
    'app/core/services/comms/telephony-twiml.util.ts',
    'app/core/services/comms/telephony-credentials.server.ts',
    'app/core/services/comms/telephony-twiml-webhooks.server.ts',
    'app/core/services/comms/telephony-gateway.server.ts',
    'app/components/domain/dispatch/comms/useCommsInteractionSync.ts',
    'app/components/domain/admin/integrations/TelephonyWebhookGuideCard.tsx',
    'app/components/domain/admin/integrations/TelephonyAndSmsTemplatesPanel.tsx',
    'scripts/test-nextiva-hybrid-softphone-phase71.ts',
  ]) {
    const src = readRel(rel);
    for (const re of secretShapes) assert.equal(re.test(src), false, `${rel} must not contain secret-shaped literal`);
  }
  const ceilings: Array<[string, number]> = [
    ['app/core/services/comms/telephony-twiml.util.ts', 200],
    ['app/components/domain/admin/integrations/TelephonyWebhookGuideCard.tsx', 220],
    ['app/components/domain/admin/integrations/TelephonyAndSmsTemplatesPanel.tsx', 440],
    ['app/components/domain/dispatch/CommsHub.tsx', 900],
    ['app/routes/dispatch.tsx', 1600],
    ['scripts/test-nextiva-hybrid-softphone-phase71.ts', 400],
  ];
  for (const [rel, maxLines] of ceilings) {
    const count = readRel(rel).split(/\r?\n/).length;
    assert.equal(count < maxLines, true, `${rel} (${count}L) must stay strictly < ${maxLines}L`);
  }
  const gitStatus = execSync('git status --porcelain', { cwd: ROOT_DIR, encoding: 'utf8' });
  assert.equal(gitStatus.includes('firestore.rules'), false, 'firestore.rules must remain untouched');
  assert.equal(gitStatus.includes('vercel.json'), false, 'vercel.json must remain untouched');
  assert.equal(gitStatus.includes('DriverAssignDropdown.tsx'), false, 'DriverAssignDropdown.tsx must remain untouched');
}

async function main(): Promise<void> {
  console.log('📞 Running Platform Phase 71 + 71.B Nextiva Hybrid & Zero-SDK TwiML Suite...\n');
  testInboundModeCallerIdAndWebhookUrls();
  testZeroSdkPureTwimlBuilders();
  await testTelephonyGatewayClientRoutingAndApexWwwSignatures();
  testNormalizeConfigSsrAndCommsHygiene();
  testGuardrailsAndLineCeilings();
  console.log('\n✅ ALL PLATFORM PHASE 71 + 71.B VERIFICATION CHECKS PASSED!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
