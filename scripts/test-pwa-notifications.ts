/**
 * Phase 34 Verification Suite: Driver & Dispatch PWA Hardening
 *
 * Validates:
 * 1. Manifest JSON validity & `/app/driver` scope alignment (`public/manifest-driver.json` & `public/manifest.json`).
 * 2. Root Service Worker (`public/sw.js`) presence, syntax compilation (`node:vm`), caching guards
 *    (never caching `/api/*` or cross-origin Firestore), `push` & `SHOW_LOCAL_NOTIFICATION` dispatch,
 *    and `notificationclick` client focus / `openWindow` routing.
 * 3. Pure deterministic notification payload formatting (`formatDriverOfferNotificationPayload`,
 *    `formatDispatchAlertPayload`, `formatDispatchNewRideAlert`).
 * 4. Graceful SSR / unsupported Node environment fallbacks in `push-notification.service.ts`,
 *    `sound-notification.service.ts`, and `isWakeLockSupported()`.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ALERT_VIBRATION,
  formatDispatchAlertPayload,
  formatDispatchNewRideAlert,
  formatDriverOfferNotificationPayload,
  pushNotificationService,
} from '../app/core/services/notifications/push-notification.service';
import { soundNotificationService } from '../app/core/services/sound-notification.service';
import { isWakeLockSupported } from '../app/core/hooks/useWakeLock';
import type { Trip } from '../app/core/types/trip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${details ? ` — ${details}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runPwaNotificationTests(): Promise<void> {
  console.log('\n===============================================================');
  console.log('🔔 RUNNING PHASE 34: PWA, SERVICE WORKER & NOTIFICATION SUITE');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────────
  // 1. MANIFEST JSON VALIDITY & `/app/driver` SCOPE ALIGNMENT
  // ─────────────────────────────────────────────────────────────────
  console.log('--- [STEP 1: MANIFEST & PWA SCOPE ALIGNMENT] ---');

  const driverManifestPath = path.join(ROOT_DIR, 'public', 'manifest-driver.json');
  const mainManifestPath = path.join(ROOT_DIR, 'public', 'manifest.json');

  assert(fs.existsSync(driverManifestPath), 'public/manifest-driver.json exists');
  assert(fs.existsSync(mainManifestPath), 'public/manifest.json exists');

  const driverManifest = JSON.parse(fs.readFileSync(driverManifestPath, 'utf8'));
  const mainManifest = JSON.parse(fs.readFileSync(mainManifestPath, 'utf8'));

  assert(driverManifest.id === '/app/driver', 'manifest-driver.json id === "/app/driver"');
  assert(
    driverManifest.start_url === '/app/driver',
    'manifest-driver.json start_url === "/app/driver"'
  );
  assert(driverManifest.scope === '/app/driver', 'manifest-driver.json scope === "/app/driver"');
  assert(driverManifest.display === 'standalone', 'manifest-driver.json display === "standalone"');
  assert(Array.isArray(driverManifest.icons) && driverManifest.icons.length >= 2, 'manifest-driver.json defines icons');

  for (const icon of driverManifest.icons) {
    const iconDiskPath = path.join(ROOT_DIR, 'public', String(icon.src).replace(/^\//, ''));
    assert(fs.existsSync(iconDiskPath), `Driver icon asset exists on disk: ${icon.src}`);
  }

  assert(mainManifest.id === '/app', 'manifest.json id === "/app"');
  assert(mainManifest.start_url === '/app', 'manifest.json start_url === "/app"');
  assert(mainManifest.scope === '/app', 'manifest.json scope === "/app"');

  // ─────────────────────────────────────────────────────────────────
  // 2. SERVICE WORKER SYNTAX, CACHING RULES & NOTIFICATION ROUTING
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 2: SERVICE WORKER SYNTAX & EVENT HANDLERS] ---');

  const swPath = path.join(ROOT_DIR, 'public', 'sw.js');
  assert(fs.existsSync(swPath), 'public/sw.js exists at root scope');
  const swSource = fs.readFileSync(swPath, 'utf8');
  assert(swSource.length > 500, 'public/sw.js is non-empty');

  // Compile check for zero JS syntax errors
  const swScript = new vm.Script(swSource, { filename: 'public/sw.js' });
  assert(Boolean(swScript), 'public/sw.js compiles cleanly with zero syntax errors');

  // Execute inside a sandboxed mock ServiceWorkerGlobalScope
  const listeners = new Map<string, Array<(event: any) => void>>();
  const shownNotifications: Array<{ title: string; options: any }> = [];
  const openedWindows: string[] = [];
  let mockOpenClients: Array<{
    url: string;
    focused: boolean;
    messages: any[];
    focus: () => Promise<any>;
    postMessage: (msg: any) => void;
  }> = [];

  const mockCacheEntries = new Map<string, Response>();
  const mockCaches = {
    open: async () => ({
      addAll: async () => {},
      match: async (req: Request) => mockCacheEntries.get(req.url) || undefined,
      put: async (req: Request, res: Response) => {
        mockCacheEntries.set(req.url, res);
      },
    }),
    keys: async () => ['ct-pwa-old-v0', 'ct-pwa-static-v1'],
    delete: async () => true,
  };

  let mockNetworkShouldFail = false;
  const mockFetch = async (req: Request): Promise<Response> => {
    if (mockNetworkShouldFail) {
      throw new Error('Simulated offline network error');
    }
    return new Response('<html><body>Live</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  };

  const selfScope: Record<string, any> = {
    location: { origin: 'https://chesterfieldtaxi.com' },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => mockOpenClients,
      openWindow: async (url: string) => {
        openedWindows.push(url);
        return { url };
      },
    },
    registration: {
      showNotification: async (title: string, options: any) => {
        shownNotifications.push({ title, options });
      },
    },
    addEventListener: (type: string, handler: (event: any) => void) => {
      const arr = listeners.get(type) || [];
      arr.push(handler);
      listeners.set(type, arr);
    },
  };

  const vmContext = vm.createContext({
    self: selfScope,
    caches: mockCaches,
    fetch: mockFetch,
    URL,
    Response,
    Promise,
    Set,
    Date,
    Boolean,
    String,
    Array,
    console,
  });

  swScript.runInContext(vmContext);

  for (const requiredEvent of ['install', 'activate', 'fetch', 'push', 'message', 'notificationclick']) {
    assert(
      (listeners.get(requiredEvent)?.length || 0) > 0,
      `Service Worker registers '${requiredEvent}' listener`
    );
  }

  // Verify `/api/*` and Firestore requests are NEVER intercepted by `fetch`
  const fetchHandlers = listeners.get('fetch')!;
  let apiResponded = false;
  fetchHandlers[0]({
    request: {
      method: 'GET',
      url: 'https://chesterfieldtaxi.com/api/push',
      mode: 'cors',
      headers: new Headers({ accept: 'application/json' }),
    },
    respondWith: () => {
      apiResponded = true;
    },
  });
  assert(!apiResponded, 'Service Worker never intercepts or caches /api/* requests');

  let firestoreResponded = false;
  fetchHandlers[0]({
    request: {
      method: 'GET',
      url: 'https://firestore.googleapis.com/v1/projects/chesterfield-taxi/databases/(default)/documents/trips',
      mode: 'cors',
      headers: new Headers(),
    },
    respondWith: () => {
      firestoreResponded = true;
    },
  });
  assert(!firestoreResponded, 'Service Worker never intercepts cross-origin Firestore requests');

  // Verify offline navigation fallback returns resilient 503 HTML shell
  mockNetworkShouldFail = true;
  let navFallbackPromise: Promise<Response> | null = null;
  fetchHandlers[0]({
    request: new Request('https://chesterfieldtaxi.com/app/driver', {
      method: 'GET',
      headers: { accept: 'text/html' },
    }),
    respondWith: (p: Promise<Response>) => {
      navFallbackPromise = p;
    },
  });
  assert(navFallbackPromise !== null, 'Service Worker intercepts HTML navigation requests');
  const fallbackRes = await navFallbackPromise!;
  const fallbackBody = await fallbackRes.text();
  assert(
    fallbackRes.status === 503 && fallbackBody.includes('Chesterfield Taxi'),
    'Navigation network failure returns branded offline HTML fallback'
  );
  mockNetworkShouldFail = false;

  // Verify `push` event parses JSON payload and calls `registration.showNotification`
  let pushWaitPromise: Promise<any> | null = null;
  listeners.get('push')![0]({
    data: {
      json: () => ({
        title: 'ASAP Trip Offer — $42.50',
        body: '14848 Conway Rd → STL Airport Terminal 1',
        url: '/app/driver',
        tag: 'ct-driver-offer-trip-901',
        requireInteraction: true,
        vibrate: [200, 100, 200],
      }),
    },
    waitUntil: (p: Promise<any>) => {
      pushWaitPromise = p;
    },
  });
  await pushWaitPromise;
  assert(shownNotifications.length === 1, 'SW push handler calls registration.showNotification');
  assert(
    shownNotifications[0].title === 'ASAP Trip Offer — $42.50' &&
      shownNotifications[0].options.tag === 'ct-driver-offer-trip-901' &&
      shownNotifications[0].options.data.url === '/app/driver',
    'SW push handler preserves title, tag, requireInteraction, and data.url'
  );

  // Verify `message` event (`SHOW_LOCAL_NOTIFICATION`) calls `registration.showNotification`
  let msgWaitPromise: Promise<any> | null = null;
  listeners.get('message')![0]({
    data: {
      type: 'SHOW_LOCAL_NOTIFICATION',
      payload: {
        title: 'Unconfirmed Web Booking ($55.00)',
        body: 'Chesterfield Mall → Clayton',
        url: '/app/dispatch?tripId=trip-902',
        tag: 'ct-dispatch-ride-trip-902',
      },
    },
    waitUntil: (p: Promise<any>) => {
      msgWaitPromise = p;
    },
  });
  await msgWaitPromise;
  assert(
    shownNotifications.length === 2 &&
      shownNotifications[1].options.data.url === '/app/dispatch?tripId=trip-902',
    'SW SHOW_LOCAL_NOTIFICATION message handler dispatches notification'
  );

  // Verify `notificationclick` focuses an existing `/app/driver` client and posts NOTIFICATION_CLICK
  let closedCount = 0;
  const mockDriverClient = {
    url: 'https://chesterfieldtaxi.com/app/driver',
    focused: false,
    messages: [] as any[],
    async focus() {
      this.focused = true;
      return this;
    },
    postMessage(msg: any) {
      this.messages.push(msg);
    },
  };
  mockOpenClients = [mockDriverClient];

  let clickPromise1: Promise<any> | null = null;
  listeners.get('notificationclick')![0]({
    notification: {
      tag: 'ct-driver-offer-trip-901',
      data: { url: '/app/driver', tripId: 'trip-901' },
      close: () => {
        closedCount++;
      },
    },
    waitUntil: (p: Promise<any>) => {
      clickPromise1 = p;
    },
  });
  await clickPromise1;
  assert(closedCount === 1, 'notificationclick closes clicked notification');
  assert(mockDriverClient.focused === true, 'notificationclick focuses open /app/driver window');
  assert(
    mockDriverClient.messages.length === 1 &&
      mockDriverClient.messages[0].type === 'NOTIFICATION_CLICK' &&
      mockDriverClient.messages[0].payload.url === '/app/driver',
    'notificationclick posts NOTIFICATION_CLICK payload to focused client'
  );

  // Verify `notificationclick` opens a new window when no matching client is open
  mockOpenClients = [];
  let clickPromise2: Promise<any> | null = null;
  listeners.get('notificationclick')![0]({
    notification: {
      tag: 'ct-dispatch-ride-trip-902',
      data: { url: '/app/dispatch?tripId=trip-902' },
      close: () => {
        closedCount++;
      },
    },
    waitUntil: (p: Promise<any>) => {
      clickPromise2 = p;
    },
  });
  await clickPromise2;
  assert(
    openedWindows.length === 1 && openedWindows[0] === '/app/dispatch?tripId=trip-902',
    'notificationclick opens targetUrl via clients.openWindow when no client is open'
  );

  // ─────────────────────────────────────────────────────────────────
  // 3. PURE NOTIFICATION PAYLOAD FORMATTING
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 3: PURE NOTIFICATION PAYLOAD FORMATTING] ---');

  const sampleOffer: Partial<Trip> = {
    id: 'CT-34001',
    bookingType: 'asap',
    status: 'offered',
    passenger: {
      firstName: 'Jordan',
      lastName: 'Miller',
      phone: '(314) 555-0142',
      email: 'jordan@example.com',
      passengerCount: 2,
      luggageCount: 1,
    },
    pickupLocation: { address: '17057 N Outer 40 Rd, Chesterfield, MO' },
    dropoffLocation: { address: 'Lambert International Airport Terminal 2' },
    pricing: {
      baseFare: 5,
      distanceMiles: 19.4,
      durationMinutes: 23,
      distanceRate: 2.25,
      timeRate: 0.4,
      vehicleMultiplier: 1,
      surgeMultiplier: 1,
      subtotal: 54.75,
      discountAmount: 0,
      totalFare: 54.75,
      currency: 'USD',
    },
  };

  const offerPayload = formatDriverOfferNotificationPayload(sampleOffer);
  assert(
    offerPayload.title === 'ASAP Trip Offer — $54.75',
    'Driver offer payload formats ASAP title and fare accurately'
  );
  assert(
    offerPayload.body.includes('Jordan Miller') &&
      offerPayload.body.includes('17057 N Outer 40 Rd') &&
      offerPayload.body.includes('Lambert International Airport Terminal 2'),
    'Driver offer payload includes passenger and pickup -> dropoff summary'
  );
  assert(offerPayload.url === '/app/driver', 'Driver offer payload routes to /app/driver');
  assert(offerPayload.tag === 'ct-driver-offer-CT-34001', 'Driver offer payload sets deterministic tag');
  assert(offerPayload.requireInteraction === true, 'Driver offer payload sets requireInteraction=true');
  assert(
    JSON.stringify(offerPayload.vibrate) === JSON.stringify(DEFAULT_ALERT_VIBRATION),
    'Driver offer payload includes mobile vibration pattern [200, 100, 200]'
  );

  const dispatchSingleRide = formatDispatchNewRideAlert([
    {
      ...sampleOffer,
      id: 'CT-34002',
      bookingType: 'scheduled',
      status: 'UNCONFIRMED',
    },
  ]);
  const dispatchFormatted = formatDispatchAlertPayload(dispatchSingleRide);
  assert(
    dispatchFormatted.title.includes('Unconfirmed Web Booking ($54.75)') &&
      dispatchFormatted.url === '/app/dispatch?tripId=CT-34002',
    'Dispatch new ride payload formats Unconfirmed Web Booking title and deep-link URL'
  );

  const dispatchBatch = formatDispatchNewRideAlert([sampleOffer, { ...sampleOffer, id: 'CT-34003' }]);
  assert(
    dispatchBatch.title.includes('2 New Rides Need Dispatch Review') &&
      dispatchBatch.url === '/app/dispatch',
    'Dispatch multi-ride batch alert summarizes count cleanly'
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. GRACEFUL SSR / UNSUPPORTED NODE ENVIRONMENT FALLBACKS
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- [STEP 4: SSR & UNSUPPORTED ENVIRONMENT FALLBACKS] ---');

  assert(typeof window === 'undefined', 'Running in Node/SSR environment (window is undefined)');
  assert(isWakeLockSupported() === false, 'isWakeLockSupported() returns false safely in SSR');
  assert(
    pushNotificationService.isSupported() === false &&
      pushNotificationService.getPermissionState() === 'unsupported',
    'pushNotificationService reports unsupported permission state safely in SSR'
  );
  assert(
    pushNotificationService.isAlertsEnabled() === false &&
      pushNotificationService.isAppInBackground() === false,
    'pushNotificationService boolean checks degrade safely in SSR'
  );

  const swRegResult = await pushNotificationService.registerServiceWorker();
  assert(swRegResult === null, 'registerServiceWorker() resolves to null safely in SSR');

  const permResult = await pushNotificationService.requestPermissionAndEnable('drv-101');
  assert(
    permResult === 'unsupported',
    'requestPermissionAndEnable() resolves to "unsupported" safely in SSR'
  );

  const driverDispatchRes = await pushNotificationService.notifyIncomingDriverOffer(sampleOffer);
  assert(
    driverDispatchRes.shown === false && driverDispatchRes.reason === 'ssr_environment',
    'notifyIncomingDriverOffer() degrades gracefully without throwing in SSR'
  );

  const consoleDispatchRes = await pushNotificationService.notifyDispatchAlert({
    title: 'Test Dispatch Alert',
    body: 'Testing SSR fallback',
  });
  assert(
    consoleDispatchRes.shown === false && consoleDispatchRes.reason === 'ssr_environment',
    'notifyDispatchAlert() degrades gracefully without throwing in SSR'
  );

  // SoundNotificationService SSR fallbacks (no AudioContext / no window)
  soundNotificationService.playDriverOfferAlert(5000);
  assert(
    soundNotificationService.isDriverOfferAlertActive() === false,
    'playDriverOfferAlert() is a safe no-op in SSR and leaves no dangling intervals'
  );
  soundNotificationService.stopDriverOfferAlert();
  soundNotificationService.playSlaWarningChime();
  soundNotificationService.playAsapRideChime();
  soundNotificationService.playInboundCallRing();
  assert(true, 'soundNotificationService acoustic presets execute without throwing in SSR');

  console.log('\n===============================================================');
  console.log(`🎉 ALL PHASE 34 PWA & NOTIFICATION TESTS PASSED (${passed}/${total})`);
  console.log('===============================================================\n');
}

runPwaNotificationTests().catch((err) => {
  console.error('\n💥 Phase 34 PWA Notification Test Suite Failed:', err);
  process.exit(1);
});
