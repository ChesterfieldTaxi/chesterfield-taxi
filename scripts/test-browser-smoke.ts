/**
 * Phase 43: Headless Browser Smoke, Hydration & Production Cutover Suite
 * (`scripts/test-browser-smoke.ts`)
 *
 * Boots the compiled `@vercel/react-router` production build (`startProdBuildServer`)
 * on `127.0.0.1` and drives real headless Chromium via `puppeteer-core` to verify:
 * 1. Firestore rules, composite indexes (`firestore.indexes.json`), and `vercel.json`
 *    production cutover invariants.
 * 2. Zero React 19 Hydration Mismatches (`#418`, `#423`, `Hydration failed`) and
 *    zero uncaught `pageerror` exceptions across all 12 public & customer routes:
 *    `/`, `/book`, `/services`, `/about`, `/contact`, `/apply`, `/terms`, `/privacy`,
 *    `/track`, `/pay/pay_smoke_invalid_token_check`, `/app/login`, `/app/register`.
 * 3. PWA & Static Asset Integrity (`/manifest.json`, `/manifest-driver.json` with
 *    `start_url: "/app/driver"`, and `/sw.js`).
 * 4. Serverless API Endpoint Smoke & Unauthenticated Security Gates
 *    (`/api/public-config`, `/api/send-email`, `/api/telephony?action=list_messages`,
 *    `/api/flight-status?diagnostics=1`, `/api/email/webhook?diagnostics=1`).
 * 5. Application Workspaces (`/app`, `/app/dispatch`, `/app/dispatch/popout?module=email`,
 *    `/app/dispatch/popout?module=comms`, `/app/driver`, `/app/corporate`, `/app/admin`)
 *    verifying zero uncaught `pageerror` exceptions or `/assets/*` chunk-loading failures.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startProdBuildServer, type RunningProdBuildServer } from './serve-prod-build';
import puppeteer, { type Browser } from 'puppeteer-core';
import { isFirebaseConfigured } from '../app/core/services/firebase';

const HYDRATION_ERROR_PATTERNS: RegExp[] = [
  /Minified React error #418/i,
  /Minified React error #423/i,
  /Minified React error #425/i,
  /\b#418\b/,
  /\b#423\b/,
  /Hydration failed/i,
  /error while hydrating/i,
  /server rendered HTML didn't match/i,
  /Did not expect server HTML to contain/i,
];

function detectChromiumExecutable(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS fallbacks
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux fallbacks
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `No Chromium/Chrome/Edge executable found. Checked CHROME_PATH and standard OS locations:\n${candidates.join('\n')}`
  );
}

function isHydrationErrorMessage(text: string): boolean {
  return HYDRATION_ERROR_PATTERNS.some((regex) => regex.test(text));
}

function isBenignThirdPartyConsoleError(text: string): boolean {
  // Ignore external Google Maps referrer/key console warnings or favicon 404s in headless CI,
  // while NEVER ignoring React hydration errors, chunk errors, or app exceptions.
  if (isHydrationErrorMessage(text)) return false;
  if (/Google Maps JavaScript API error/i.test(text)) return true;
  if (/Failed to load resource:.*favicon\.ico/i.test(text)) return true;
  return false;
}

interface CompositeIndexSpec {
  collectionGroup: string;
  fields: Array<{ fieldPath: string; order: string }>;
}

function verifyCutoverConfigInvariants(rootDir: string): void {
  console.log('1️⃣  Verifying Firestore Rules, Composite Indexes & Vercel Cron invariants...');

  // 1. vercel.json Hobby cron schedule must remain "0 10 * * *"
  const vercelJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
  assert.equal(
    vercelJson.crons?.[0]?.schedule,
    '0 10 * * *',
    'vercel.json must preserve Hobby cron schedule "0 10 * * *"'
  );

  // 2. firestore.rules collection coverage
  const rulesText = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
  const requiredRuleCollections = [
    '/users/{userId}',
    '/trips/{tripId}',
    '/tripTracking/{trackingToken}',
    '/tripTrackingLookup/{lookupKey}',
    '/payLinks/{payToken}',
    '/paymentWebhookEvents/{eventId}',
    '/flightStatusCache/{cacheKey}',
    '/commsThreads/{threadId}',
    '/commsEvents/{eventId}',
    '/telephonyWebhookEvents/{eventId}',
    '/dispatchEmails/{emailId}',
    '/emailWebhookEvents/{eventId}',
    '/corporateAccounts/{accountId}',
    '/corporateLookup/{lookupKey}',
    '/invoices/{invoiceId}',
  ];
  for (const colPattern of requiredRuleCollections) {
    assert.ok(
      rulesText.includes(`match ${colPattern}`),
      `firestore.rules missing explicit rule block for ${colPattern}`
    );
  }

  // 3. firestore.indexes.json composite index coverage
  const indexesJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'firestore.indexes.json'), 'utf8')
  ) as { indexes: CompositeIndexSpec[] };
  assert.ok(Array.isArray(indexesJson.indexes), 'firestore.indexes.json must contain indexes[]');

  const expectedIndexes: CompositeIndexSpec[] = [
    {
      collectionGroup: 'trips',
      fields: [
        { fieldPath: 'status', order: 'ASCENDING' },
        { fieldPath: 'pickupDateTime', order: 'ASCENDING' },
      ],
    },
    {
      collectionGroup: 'trips',
      fields: [
        { fieldPath: 'isAsap', order: 'ASCENDING' },
        { fieldPath: 'status', order: 'ASCENDING' },
      ],
    },
    {
      collectionGroup: 'trips',
      fields: [
        { fieldPath: 'corporateAccountId', order: 'ASCENDING' },
        { fieldPath: 'createdAt', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: 'trips',
      fields: [
        { fieldPath: 'corporateAccountId', order: 'ASCENDING' },
        { fieldPath: 'scheduledPickupTime', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: 'invoices',
      fields: [
        { fieldPath: 'corporateAccountId', order: 'ASCENDING' },
        { fieldPath: 'issuedDate', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: 'commsEvents',
      fields: [
        { fieldPath: 'threadId', order: 'ASCENDING' },
        { fieldPath: 'timestampMs', order: 'ASCENDING' },
      ],
    },
    {
      collectionGroup: 'commsEvents',
      fields: [
        { fieldPath: 'threadId', order: 'ASCENDING' },
        { fieldPath: 'timestampMs', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: 'dispatchEmails',
      fields: [
        { fieldPath: 'folder', order: 'ASCENDING' },
        { fieldPath: 'timestampMs', order: 'DESCENDING' },
      ],
    },
    {
      collectionGroup: 'dispatchEmails',
      fields: [
        { fieldPath: 'threadId', order: 'ASCENDING' },
        { fieldPath: 'timestampMs', order: 'ASCENDING' },
      ],
    },
  ];

  for (const expected of expectedIndexes) {
    const found = indexesJson.indexes.some(
      (idx) =>
        idx.collectionGroup === expected.collectionGroup &&
        idx.fields.length === expected.fields.length &&
        idx.fields.every(
          (f, i) =>
            f.fieldPath === expected.fields[i].fieldPath &&
            f.order === expected.fields[i].order
        )
    );
    const label = `${expected.collectionGroup}(${expected.fields
      .map((f) => `${f.fieldPath} ${f.order}`)
      .join(', ')})`;
    assert.ok(found, `firestore.indexes.json missing required composite index: ${label}`);
  }

  // 4. Secret-shaped literal scan across app/ and scripts/ (prevents GitHub Push Protection blocks)
  const forbiddenSecretPatterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'Twilio Account SID (AC + 32 hex)', regex: /\bAC[0-9a-fA-F]{32}\b/ },
    { label: 'Twilio API Key SID (SK + 32 hex)', regex: /\bSK[0-9a-fA-F]{32}\b/ },
    { label: 'Stripe Secret/Restricted Key', regex: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b/ },
    { label: 'Webhook Signing Secret (whsec_)', regex: /\bwhsec_(?!test_|fixture_)[0-9a-zA-Z+/=]{20,}\b/ },
    { label: 'Resend API Key (re_)', regex: /\bre_(?!test_|fixture_)[0-9a-zA-Z_]{20,}\b/ },
    { label: 'SendGrid API Key (SG.)', regex: /\bSG\.[0-9a-zA-Z_-]{16,}\.[0-9a-zA-Z_-]{16,}\b/ },
    { label: 'AWS Access Key ID (AKIA)', regex: /\bAKIA[0-9A-Z]{16}\b/ },
    { label: 'PEM Private Key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  ];

  const scanExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']);
  const secretViolations: string[] = [];

  const walkForSecrets = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walkForSecrets(fullPath);
      } else if (entry.isFile() && scanExtensions.has(path.extname(entry.name).toLowerCase())) {
        const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
        lines.forEach((line, idx) => {
          for (const rule of forbiddenSecretPatterns) {
            if (rule.regex.test(line)) {
              const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
              secretViolations.push(`${rel}:${idx + 1} matched ${rule.label}`);
            }
          }
        });
      }
    }
  };

  walkForSecrets(path.join(rootDir, 'app'));
  walkForSecrets(path.join(rootDir, 'scripts'));

  assert.deepEqual(
    secretViolations,
    [],
    `Secret-shaped token literals detected (use *_TEST_FIXTURE placeholders instead):\n${secretViolations.join('\n')}`
  );

  // 5. Production client bundle budget assertions (build/client/assets/)
  const clientAssetsDir = path.join(rootDir, 'build', 'client', 'assets');
  assert.ok(
    fs.existsSync(clientAssetsDir),
    `build/client/assets directory not found at ${clientAssetsDir} — run "npm run build" before "npm run test:smoke"`
  );

  const assetEntries = fs.readdirSync(clientAssetsDir);
  const apiChunks = assetEntries.filter((file) => /^api\..*\.js$/.test(file));
  assert.ok(
    apiChunks.length >= 14,
    `Expected at least 14 api.*.js route chunks in build/client/assets/, found ${apiChunks.length}: ${apiChunks.join(', ')}`
  );

  for (const apiChunk of apiChunks) {
    const stat = fs.statSync(path.join(clientAssetsDir, apiChunk));
    assert.ok(
      stat.size < 1024,
      `Server API route chunk "${apiChunk}" leaked client bundle code (${stat.size} bytes >= 1024 bytes; expected 0.00 kB)`
    );
  }

  const adminEntryChunks = assetEntries.filter((file) => /^admin-(?!auth\.)[^.]+\.js$/.test(file));
  assert.equal(
    adminEntryChunks.length,
    1,
    `Expected exactly 1 admin-*.js route entry chunk in build/client/assets/, found ${adminEntryChunks.length}: ${adminEntryChunks.join(', ')}`
  );
  const adminChunkStat = fs.statSync(path.join(clientAssetsDir, adminEntryChunks[0]));
  assert.ok(
    adminChunkStat.size < 153600,
    `Admin route entry chunk "${adminEntryChunks[0]}" exceeded 150 KB budget (${adminChunkStat.size} bytes >= 153600 bytes)`
  );

  const emailTemplateChunks = assetEntries.filter((file) => /^email-templates-.*\.js$/.test(file));
  assert.deepEqual(
    emailTemplateChunks,
    [],
    `Server email-templates leaked into client bundle assets: ${emailTemplateChunks.join(', ')}`
  );

  // 6. Dual Booking Engine, Dispatch Workspace, Heavy Admin Subpages & Wave 2 Services monolith prevention line-budget assertions
  const monolithBudgets: Array<{ relFile: string; maxLines: number }> = [
    { relFile: 'app/components/domain/BookingEngineV2.tsx', maxLines: 1800 },
    { relFile: 'app/components/domain/dispatch/DispatchBookingEngine.tsx', maxLines: 1800 },
    { relFile: 'app/routes/dispatch.tsx', maxLines: 2000 },
    { relFile: 'app/components/domain/dispatch/LiveFleetMap.tsx', maxLines: 1350 },
    { relFile: 'app/components/domain/dispatch/DispatchTripQueuePane.tsx', maxLines: 1200 },
    { relFile: 'app/components/domain/dispatch/DispatchTripDetailsDrawer.tsx', maxLines: 1500 },
    { relFile: 'app/components/domain/dispatch/CommsHub.tsx', maxLines: 1800 },
    { relFile: 'app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx', maxLines: 1400 },
    { relFile: 'app/components/domain/admin/AdminZonesTab.tsx', maxLines: 1300 },
    { relFile: 'app/components/domain/admin/AdminRulesTab.tsx', maxLines: 1400 },
    { relFile: 'app/core/services/comms/telephony-gateway.server.ts', maxLines: 1400 },
    { relFile: 'app/core/services/email/dispatch-email.service.ts', maxLines: 1400 },
    { relFile: 'app/core/services/email/dispatch-email.server.ts', maxLines: 1400 },
  ];
  const monolithLineSummary: string[] = [];

  for (const { relFile, maxLines } of monolithBudgets) {
    const absFile = path.join(rootDir, relFile);
    assert.ok(fs.existsSync(absFile), `Expected module file not found: ${relFile}`);
    const lineCount = fs.readFileSync(absFile, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < maxLines,
      `Monolith budget exceeded in ${relFile}: ${lineCount} lines >= ${maxLines} lines`
    );
    monolithLineSummary.push(`${path.basename(relFile)}=${lineCount}L/<${maxLines}L`);
  }

  console.log(
    `   ✅ Verified 15 Firestore rule blocks, ${expectedIndexes.length} composite indexes, Vercel Hobby cron, zero secret-shaped literals, ${apiChunks.length} zero-KB api.*.js chunks, zero email-templates client chunks, admin entry chunk (${(adminChunkStat.size / 1024).toFixed(2)} KB < 150 KB), and monolith line budgets (${monolithLineSummary.join(', ')}).\n`
  );
}

async function runSmokeSuite(): Promise<void> {
  const rootDir = process.cwd();
  console.log('🚀 Starting Phase 43 Production Build & Headless Browser Smoke Suite...\n');

  verifyCutoverConfigInvariants(rootDir);

  const executablePath = detectChromiumExecutable();
  console.log(`🌐 Detected Chromium executable: ${executablePath}`);

  let prodServer: RunningProdBuildServer | null = null;
  let browser: Browser | null = null;

  try {
    prodServer = await startProdBuildServer({
      port: 0,
      host: '127.0.0.1',
      rootDir,
      quiet: true,
    });
    const { baseUrl } = prodServer;
    console.log(`🖥️  Production build server booted at ${baseUrl}\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. PWA & Static Asset Integrity
    // ─────────────────────────────────────────────────────────────────────────
    console.log('2️⃣  Verifying PWA Manifests & Service Worker Static Assets...');

    const manifestRes = await fetch(`${baseUrl}/manifest.json`);
    assert.equal(manifestRes.status, 200, 'GET /manifest.json must return 200');
    const manifestJson = (await manifestRes.json()) as Record<string, unknown>;
    assert.ok(
      typeof manifestJson.name === 'string' && manifestJson.name.length > 0,
      '/manifest.json must contain a valid name'
    );

    const driverManifestRes = await fetch(`${baseUrl}/manifest-driver.json`);
    assert.equal(driverManifestRes.status, 200, 'GET /manifest-driver.json must return 200');
    const driverManifestJson = (await driverManifestRes.json()) as Record<string, unknown>;
    assert.equal(
      driverManifestJson.start_url,
      '/app/driver',
      '/manifest-driver.json must have start_url: "/app/driver"'
    );

    const swRes = await fetch(`${baseUrl}/sw.js`);
    assert.equal(swRes.status, 200, 'GET /sw.js must return 200');
    const swContentType = swRes.headers.get('content-type') || '';
    assert.match(
      swContentType,
      /javascript/i,
      `GET /sw.js must return JavaScript Content-Type (got "${swContentType}")`
    );
    const swSource = await swRes.text();
    assert.ok(
      swSource.includes("addEventListener('push'") || swSource.includes('addEventListener("push"'),
      '/sw.js must contain push event handler'
    );
    console.log('   ✅ /manifest.json, /manifest-driver.json, and /sw.js verified.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Serverless API Endpoint Smoke & Unauthenticated Security Checks
    // ─────────────────────────────────────────────────────────────────────────
    console.log('3️⃣  Verifying Serverless /api/* Endpoints & Unauthenticated Auth Gates...');

    const publicConfigRes = await fetch(`${baseUrl}/api/public-config`);
    assert.equal(publicConfigRes.status, 200, 'GET /api/public-config must return 200');
    assert.match(
      publicConfigRes.headers.get('content-type') || '',
      /application\/json/i,
      'GET /api/public-config must return JSON'
    );
    const publicConfigBody = (await publicConfigRes.json()) as Record<string, unknown>;
    assert.equal(publicConfigBody.success, true, '/api/public-config must return { success: true }');
    assert.ok(publicConfigBody.settings, '/api/public-config must include sanitized settings');

    const sendEmailGetRes = await fetch(`${baseUrl}/api/send-email`);
    assert.equal(sendEmailGetRes.status, 200, 'GET /api/send-email must return 200');
    assert.match(
      sendEmailGetRes.headers.get('content-type') || '',
      /application\/json/i,
      'GET /api/send-email must return JSON'
    );
    const sendEmailBody = (await sendEmailGetRes.json()) as Record<string, unknown>;
    assert.ok(typeof sendEmailBody === 'object' && sendEmailBody !== null);

    const firebaseAuthConfigured = isFirebaseConfigured();
    const protectedEndpoints = [
      '/api/telephony?action=list_messages',
      '/api/flight-status?diagnostics=1',
      '/api/email/webhook?diagnostics=1',
    ];

    for (const endpoint of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${endpoint}`);
      assert.ok(
        res.status < 500,
        `GET ${endpoint} must never return >= 500 (got ${res.status})`
      );
      const ct = res.headers.get('content-type') || '';
      assert.match(
        ct,
        /application\/json/i,
        `GET ${endpoint} must return JSON, never an HTML error page (got "${ct}")`
      );
      const parsed = (await res.json()) as Record<string, unknown>;
      assert.ok(typeof parsed === 'object' && parsed !== null);
      if (firebaseAuthConfigured) {
        assert.ok(
          res.status === 401 || res.status === 403,
          `GET ${endpoint} must return 401/403 when unauthenticated with Firebase configured (got ${res.status})`
        );
      }
      console.log(`   ✓ GET ${endpoint} -> ${res.status} JSON`);
    }
    console.log('   ✅ Serverless API smoke & auth checks passed.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Launch Headless Chromium: Public & Customer Routes Hydration Check
    // ─────────────────────────────────────────────────────────────────────────
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    let activeRoute = '';
    const pageErrors: string[] = [];
    const hydrationErrors: string[] = [];
    const unexpectedConsoleErrors: string[] = [];
    const server500Responses: string[] = [];
    const chunkLoadFailures: string[] = [];

    const resetRouteCollectors = (routePath: string) => {
      activeRoute = routePath;
      pageErrors.length = 0;
      hydrationErrors.length = 0;
      unexpectedConsoleErrors.length = 0;
      server500Responses.length = 0;
      chunkLoadFailures.length = 0;
    };

    page.on('pageerror', (err) => {
      const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
      pageErrors.push(`[${activeRoute}] ${msg}`);
      if (isHydrationErrorMessage(msg)) {
        hydrationErrors.push(`[${activeRoute}] ${msg}`);
      }
    });

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (isHydrationErrorMessage(text)) {
        hydrationErrors.push(`[${activeRoute}] (${type}) ${text}`);
      }
      if (type === 'error' && !isBenignThirdPartyConsoleError(text)) {
        unexpectedConsoleErrors.push(`[${activeRoute}] ${text}`);
      }
    });

    page.on('response', (response) => {
      const url = response.url();
      if (!url.startsWith(baseUrl)) return;
      const status = response.status();
      if (status >= 500) {
        server500Responses.push(`[${activeRoute}] ${status} ${url}`);
      }
      const pathname = new URL(url).pathname;
      if (pathname.startsWith('/assets/') && status >= 400) {
        chunkLoadFailures.push(`[${activeRoute}] ${status} ${pathname}`);
      }
    });

    page.on('requestfailed', (request) => {
      const url = request.url();
      if (!url.startsWith(baseUrl)) return;
      const failureText = request.failure()?.errorText || 'unknown';
      if (failureText.includes('ERR_ABORTED')) return;
      const pathname = new URL(url).pathname;
      if (pathname.startsWith('/assets/')) {
        chunkLoadFailures.push(`[${activeRoute}] ${failureText} ${pathname}`);
      }
    });

    console.log('4️⃣  Verifying Public & Customer SSR Routes (Hydration & Zero Exceptions)...');

    const publicRoutes = [
      '/',
      '/book',
      '/services',
      '/about',
      '/contact',
      '/apply',
      '/terms',
      '/privacy',
      '/track',
      '/pay/pay_smoke_invalid_token_check',
      '/app/login',
      '/app/register',
    ];

    for (const routePath of publicRoutes) {
      resetRouteCollectors(routePath);
      const navResponse = await page.goto(`${baseUrl}${routePath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      assert.ok(navResponse, `Navigation to ${routePath} must return an HTTP response`);
      assert.ok(
        navResponse.status() < 500,
        `Navigation to ${routePath} returned server error ${navResponse.status()}`
      );

      // Give React 19 client hydration & initial effects time to settle
      await new Promise((resolve) => setTimeout(resolve, 650));

      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      assert.ok(
        bodyText.trim().length > 0,
        `Route ${routePath} rendered an empty document body`
      );

      if (routePath === '/pay/pay_smoke_invalid_token_check') {
        assert.ok(
          !bodyText.includes('Service Temporarily Interrupted'),
          '/pay/pay_smoke_invalid_token_check must render graceful invalid/not-found payment link UI rather than Root ErrorBoundary'
        );
        assert.match(
          bodyText,
          /not found|invalid|expired|unavailable|chesterfield taxi/i,
          '/pay/pay_smoke_invalid_token_check must display graceful invalid/expired link state'
        );
      }

      assert.deepEqual(
        hydrationErrors,
        [],
        `React Hydration mismatch detected on ${routePath}:\n${hydrationErrors.join('\n')}`
      );
      assert.deepEqual(
        pageErrors,
        [],
        `Uncaught pageerror detected on ${routePath}:\n${pageErrors.join('\n')}`
      );
      assert.deepEqual(
        server500Responses,
        [],
        `Same-origin >= 500 response detected on ${routePath}:\n${server500Responses.join('\n')}`
      );
      assert.deepEqual(
        chunkLoadFailures,
        [],
        `Client asset chunk failure detected on ${routePath}:\n${chunkLoadFailures.join('\n')}`
      );
      assert.deepEqual(
        unexpectedConsoleErrors,
        [],
        `Unexpected console.error on public route ${routePath}:\n${unexpectedConsoleErrors.join('\n')}`
      );

      console.log(`   ✓ ${routePath} (${navResponse.status()} OK · hydrated cleanly)`);
    }
    console.log('   ✅ All 12 public & customer routes hydrated with zero errors.\n');

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Application Workspaces Navigation & Chunk Integrity
    // ─────────────────────────────────────────────────────────────────────────
    console.log('5️⃣  Verifying Application Workspaces (/app/*)...');

    const workspaceRoutes = [
      '/app',
      '/app/dispatch',
      '/app/dispatch/popout?module=email',
      '/app/dispatch/popout?module=comms',
      '/app/driver',
      '/app/corporate',
      '/app/admin',
    ];

    for (const routePath of workspaceRoutes) {
      resetRouteCollectors(routePath);
      const navResponse = await page.goto(`${baseUrl}${routePath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      assert.ok(navResponse, `Navigation to ${routePath} must return an HTTP response`);
      assert.ok(
        navResponse.status() < 500,
        `Navigation to ${routePath} returned server error ${navResponse.status()}`
      );

      // Allow client auth guard redirect (to /app/login) or workspace render to settle
      await new Promise((resolve) => setTimeout(resolve, 750));

      const finalPathname = new URL(page.url()).pathname;
      const bodyText = await page.evaluate(() => document.body?.innerText || '');
      assert.ok(
        bodyText.trim().length > 0,
        `Workspace navigation ${routePath} resulted in an empty document body`
      );

      if (routePath === '/app/driver') {
        // Verify dynamic manifest link on /app/driver (if still on /app/driver) or clean /app/login redirect
        const manifestHref = await page.evaluate(
          () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') || ''
        );
        if (finalPathname.startsWith('/app/driver')) {
          assert.equal(manifestHref, '/manifest-driver.json');
        } else {
          assert.ok(manifestHref === '/manifest.json' || manifestHref === '/manifest-driver.json');
        }
      }

      assert.deepEqual(
        hydrationErrors,
        [],
        `React Hydration mismatch detected on workspace ${routePath}:\n${hydrationErrors.join('\n')}`
      );
      assert.deepEqual(
        pageErrors,
        [],
        `Uncaught pageerror detected on workspace ${routePath}:\n${pageErrors.join('\n')}`
      );
      assert.deepEqual(
        server500Responses,
        [],
        `Same-origin >= 500 response detected on workspace ${routePath}:\n${server500Responses.join('\n')}`
      );
      assert.deepEqual(
        chunkLoadFailures,
        [],
        `Client asset chunk failure detected on workspace ${routePath}:\n${chunkLoadFailures.join('\n')}`
      );

      console.log(`   ✓ ${routePath} -> ${finalPathname} (zero pageerrors / chunk failures)`);
    }

    console.log('   ✅ All 7 application workspace routes verified cleanly.\n');
    console.log('🎉 Phase 43 Production Build & Headless Browser Smoke Suite PASSED (100%)!');
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn('[test-browser-smoke] Warning closing browser:', closeErr);
      }
    }
    if (prodServer) {
      try {
        await prodServer.close();
      } catch (closeErr) {
        console.warn('[test-browser-smoke] Warning closing prod server:', closeErr);
      }
    }
  }
}

runSmokeSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Phase 43 Headless Browser Smoke Suite FAILED:', err);
    process.exit(1);
  });
