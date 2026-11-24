// Phase 65 Automated Verification Suite (`scripts/test-unified-dropdowns-and-admin-sweep-phase65.ts`)
//
// Verifies:
// 1. Global Zero-Native-`<select>` Gate Across ALL `.tsx` files under `app/` (`>= 200` files, zero exclusions!)
//    + all 27 Phase 65 Admin Console `.tsx` files migrated to `<Select />` + `<Checkbox />` in `AdminTripsSubpage.tsx`.
// 2. Unified `Actions ▾` (`TripActionDropdown.tsx`) Dropdown Visual Language & Zero Fly-In Positioning across
//    `Select.tsx`, `TripQueueFilterPopovers.tsx` (`TripQueueLayoutDropdown`, `TripStatusMultiSelectDropdown`,
//    `TripAddFilterDropdown`), and `MapLayersAndVehiclesToolbar.tsx` (`Vehicles ▾`, `Layers ▾`), while
//    preserving `DriverAssignDropdown.tsx` untouched and wired across Dispatch & Admin.
// 3. Dedicated `Unconfirmed` Header Quick-Filter & Red Circle Counter (`isUnconfirmedQuickFilterActive`,
//    `computeNextStatusFilterOnUnconfirmedToggle`, 11-status `STATUS_FILTER_OPTIONS` excluding `'unconfirmed'`,
//    zero `All Status (` width-shifting strings, and `bg-rose-600 text-white` badge in `TripQueueToolbar.tsx`).
// 4. Monolith line ceilings, untouched `firestore.rules` & `vercel.json`, untouched `DriverAssignDropdown.tsx`,
//    and zero `"HUD Now"` / bracketed driver status strings across `app/`.

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_QUEUE_STATUS_KEYS,
  ALL_QUEUE_STATUS_KEYS,
  computeNextStatusFilterOnUnconfirmedToggle,
  isUnconfirmedQuickFilterActive,
  matchesQueueStatusFilter,
} from '../app/core/hooks/dispatch/dispatch-workspace.util';
import {
  QUEUE_FILTER_MENU_ITEMS,
  STATUS_FILTER_OPTIONS,
  TripAddFilterDropdown,
  TripQueueLayoutDropdown,
  TripStatusMultiSelectDropdown,
} from '../app/components/domain/dispatch/queue/TripQueueFilterPopovers';

const ROOT_DIR = process.cwd();

function collectFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, pattern));
    } else if (entry.isFile() && pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const ADMIN_MIGRATED_FILES: ReadonlyArray<string> = [
  'app/components/domain/admin/AdminAdvancedTab.tsx',
  'app/components/domain/admin/AdminFleetTab.tsx',
  'app/components/domain/admin/AdminRulesTab.tsx',
  'app/components/domain/admin/AdminVehiclesTab.tsx',
  'app/components/domain/admin/customers/CustomerProfileDrawer.tsx',
  'app/components/domain/admin/general/LocalizationAndUnitsPanel.tsx',
  'app/components/domain/admin/invoicing/BillingPolicyAndQuickBooksPanel.tsx',
  'app/components/domain/admin/invoicing/CorporateAccountsPanel.tsx',
  'app/components/domain/admin/invoicing/InvoiceBuilderModal.tsx',
  'app/components/domain/admin/invoicing/PayoutSettlementModal.tsx',
  'app/components/domain/admin/places/SpecialPlacesAdminPanel.tsx',
  'app/components/domain/admin/pricing/audit/PricingAuditPanel.tsx',
  'app/components/domain/admin/pricing/rates/CorridorEditor.tsx',
  'app/components/domain/admin/pricing/rates/RatesPanel.tsx',
  'app/components/domain/admin/pricing/rules/PricingRulesPanel.tsx',
  'app/components/domain/admin/pricing/simulator/PersistentFareSimulator.tsx',
  'app/components/domain/admin/pricing/surcharges/SurchargesPanel.tsx',
  'app/components/domain/admin/rules/AdminAutoDispatchControlPanel.tsx',
  'app/components/domain/admin/rules/AdminAutoDispatchSimulator.tsx',
  'app/components/domain/admin/rules/BookingRulesSimulatorCard.tsx',
  'app/components/domain/admin/rules/ModularTierCard.tsx',
  'app/components/domain/admin/subpages/AdminTripsSubpage.tsx',
  'app/components/domain/admin/website/WebsiteFormControlsTab.tsx',
  'app/components/domain/admin/website/WebsiteNavigationTab.tsx',
  'app/components/domain/admin/website/WebsitePagesTab.tsx',
  'app/components/domain/admin/website/WebsiteThemesTab.tsx',
  'app/components/domain/admin/zones/ZoneInspectorEditorPane.tsx',
];

function testGlobalZeroNativeSelectGate(): void {
  console.log('1️⃣  Scanning ALL .tsx files across app/ (zero exclusions) for 0 native <select> elements...');

  const allTsxFiles = collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/);
  assert.ok(
    allTsxFiles.length >= 200,
    `Expected at least 200 .tsx files across app/, scanned ${allTsxFiles.length}`
  );

  const offendingFiles: string[] = [];
  for (const file of allTsxFiles) {
    const src = fs.readFileSync(file, 'utf8');
    if (/<select\b/.test(src)) {
      offendingFiles.push(path.relative(ROOT_DIR, file));
    }
  }

  assert.deepEqual(
    offendingFiles,
    [],
    `Found forbidden native <select> elements in app/: ${offendingFiles.join(', ')}`
  );

  assert.equal(ADMIN_MIGRATED_FILES.length, 27);
  for (const relPath of ADMIN_MIGRATED_FILES) {
    const src = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
    assert.ok(
      src.includes('<Select'),
      `Expected ${relPath} to render portal <Select />`
    );
  }

  const adminTripsSubpageSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/admin/subpages/AdminTripsSubpage.tsx'),
    'utf8'
  );
  assert.ok(
    adminTripsSubpageSrc.includes('<Checkbox'),
    'AdminTripsSubpage.tsx must use <Checkbox /> for Include Archived'
  );
  assert.equal(
    adminTripsSubpageSrc.includes('type="checkbox"'),
    false,
    'AdminTripsSubpage.tsx must contain zero raw <input type="checkbox">'
  );

  console.log(`   ✅ Verified 0 native <select> elements across all ${allTsxFiles.length} .tsx files in app/.\n`);
}

function testUnifiedActionsDropdownLanguageAndPositioning(): void {
  console.log('2️⃣  Testing Unified Actions ▾ visual shell, custom check indicators & zero fly-in portal positioning...');

  assert.equal(typeof TripStatusMultiSelectDropdown, 'function');
  assert.equal(typeof TripAddFilterDropdown, 'function');
  assert.equal(typeof TripQueueLayoutDropdown, 'function');
  assert.equal(QUEUE_FILTER_MENU_ITEMS.length, 8);

  const portalDropdownTargets = [
    'app/components/ui/Select.tsx',
    'app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx',
    'app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx',
  ];

  for (const relPath of portalDropdownTargets) {
    const src = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
    assert.ok(src.includes('createPortal'), `${relPath} must use createPortal`);
    assert.ok(src.includes('document.body'), `${relPath} must mount portal on document.body`);
    assert.ok(src.includes('z-[99999]'), `${relPath} must render at z-[99999]`);
    assert.ok(src.includes('rounded-xl'), `${relPath} must use unified rounded-xl shell`);
    assert.ok(
      src.includes('divide-y divide-slate-100'),
      `${relPath} must use divide-y divide-slate-100 section dividers`
    );
    assert.ok(
      src.includes('data-ui-select-portal="true"'),
      `${relPath} must set data-ui-select-portal="true" for workspace outside-click protection`
    );
    assert.ok(
      src.includes('coords !== null'),
      `${relPath} must guard portal mount on coords !== null`
    );
    assert.ok(
      src.includes('hover:bg-blue-50/80'),
      `${relPath} must apply Actions ▾ hover:bg-blue-50/80 row styling`
    );
  }

  // Select.tsx synchronous coordinate computation in openMenu before setIsOpen(true)
  const selectSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/ui/Select.tsx'), 'utf8');
  assert.ok(
    selectSrc.includes('const initial = calculatePosition();') &&
      selectSrc.includes('openMenu()'),
    'Select.tsx must compute coordinates synchronously inside openMenu() on trigger click'
  );

  // TripQueueFilterPopovers.tsx: 0 raw checkbox inputs, permanent Clear button, TripQueueLayoutDropdown exported
  const popoversSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx'),
    'utf8'
  );
  assert.equal(
    popoversSrc.includes('type="checkbox"'),
    false,
    'TripQueueFilterPopovers.tsx must contain 0 raw <input type="checkbox"> elements'
  );
  assert.ok(
    popoversSrc.includes('disabled={activeFilterKeys.length === 0}'),
    'TripAddFilterDropdown must keep Clear button permanently mounted (disabled when 0) to prevent header height jump'
  );
  assert.ok(
    popoversSrc.includes("width: '212px'") && popoversSrc.includes('Queue Layout'),
    'TripQueueLayoutDropdown must render 212px Queue Layout portal menu'
  );

  // MapLayersAndVehiclesToolbar.tsx: 0 raw checkbox inputs, 0 left: 16, openUpward transformOrigin, permanent All Off / Clear
  const mapToolbarSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx'),
    'utf8'
  );
  assert.equal(
    mapToolbarSrc.includes('type="checkbox"'),
    false,
    'MapLayersAndVehiclesToolbar.tsx must contain 0 raw <input type="checkbox"> elements'
  );
  assert.equal(
    mapToolbarSrc.includes('left: 16'),
    false,
    'MapLayersAndVehiclesToolbar.tsx must contain 0 left: 16 fallback coordinates'
  );
  assert.ok(
    mapToolbarSrc.includes("coords.openUpward ? 'bottom right' : 'top right'"),
    'MapLayersAndVehiclesToolbar.tsx must set openUpward-aware transformOrigin'
  );
  assert.ok(
    mapToolbarSrc.includes('disabled={activeOverlayCount === 0}') &&
      mapToolbarSrc.includes('disabled={selectedVehicleCount === 0}'),
    'MapLayersAndVehiclesToolbar.tsx must keep All Off and Clear buttons permanently mounted'
  );

  // Preserve unique DriverAssignDropdown untouched & wired across Dispatch + Admin
  const driverDropdownGitStatus = execSync(
    'git status --porcelain app/components/domain/dispatch/DriverAssignDropdown.tsx',
    { cwd: ROOT_DIR, encoding: 'utf8' }
  ).trim();
  assert.equal(
    driverDropdownGitStatus,
    '',
    `DriverAssignDropdown.tsx must remain completely untouched, got: ${driverDropdownGitStatus}`
  );

  for (const consumerRel of [
    'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx',
    'app/components/domain/dispatch/queue/TripQueueTableView.tsx',
    'app/components/domain/admin/trips/AdminTripsTablePanel.tsx',
  ]) {
    const consumerSrc = fs.readFileSync(path.join(ROOT_DIR, consumerRel), 'utf8');
    assert.ok(
      consumerSrc.includes('DriverAssignDropdown'),
      `${consumerRel} must continue using unique DriverAssignDropdown`
    );
  }

  console.log('   ✅ Passed Unified Actions ▾ visual language, zero fly-in & preserved DriverAssignDropdown checks.\n');
}

function testUnconfirmedQuickFilterAndRedCounter(): void {
  console.log('3️⃣  Testing Dedicated Unconfirmed Header Quick-Filter & Red Circle Counter...');

  // Keep 'unconfirmed' in ALL_QUEUE_STATUS_KEYS and ACTIVE_QUEUE_STATUS_KEYS so default combined views still include unconfirmed bookings
  assert.equal(ALL_QUEUE_STATUS_KEYS.includes('unconfirmed'), true);
  assert.equal(ACTIVE_QUEUE_STATUS_KEYS.includes('unconfirmed'), true);
  assert.equal(matchesQueueStatusFilter('unconfirmed', 'all'), true);
  assert.equal(matchesQueueStatusFilter('unconfirmed', 'unconfirmed'), true);
  assert.equal(matchesQueueStatusFilter('assigned', 'unconfirmed'), false);

  // Pure helper unit tests: isUnconfirmedQuickFilterActive
  assert.equal(isUnconfirmedQuickFilterActive('unconfirmed'), true);
  assert.equal(isUnconfirmedQuickFilterActive('UNCONFIRMED'), true);
  assert.equal(isUnconfirmedQuickFilterActive('all'), false);
  assert.equal(isUnconfirmedQuickFilterActive(''), false);
  assert.equal(isUnconfirmedQuickFilterActive('none'), false);
  assert.equal(isUnconfirmedQuickFilterActive('assigned'), false);
  assert.equal(isUnconfirmedQuickFilterActive('unconfirmed,confirmed'), false);

  // Round-trip 1: 'all' -> 'unconfirmed' -> 'all'
  const step1 = computeNextStatusFilterOnUnconfirmedToggle('all');
  assert.deepEqual(step1, { nextStatusFilter: 'unconfirmed', savedPreviousFilter: 'all' });
  const step2 = computeNextStatusFilterOnUnconfirmedToggle(
    step1.nextStatusFilter,
    step1.savedPreviousFilter
  );
  assert.deepEqual(step2, { nextStatusFilter: 'all', savedPreviousFilter: 'all' });

  // Round-trip 2: 'assigned,en_route' -> 'unconfirmed' -> 'assigned,en_route'
  const customOn = computeNextStatusFilterOnUnconfirmedToggle('assigned,en_route', 'all');
  assert.deepEqual(customOn, {
    nextStatusFilter: 'unconfirmed',
    savedPreviousFilter: 'assigned,en_route',
  });
  const customOff = computeNextStatusFilterOnUnconfirmedToggle(
    customOn.nextStatusFilter,
    customOn.savedPreviousFilter
  );
  assert.deepEqual(customOff, {
    nextStatusFilter: 'assigned,en_route',
    savedPreviousFilter: 'assigned,en_route',
  });

  // Fallback safety when previousNonUnconfirmedFilter is empty or 'unconfirmed'
  assert.deepEqual(computeNextStatusFilterOnUnconfirmedToggle('unconfirmed', ''), {
    nextStatusFilter: 'all',
    savedPreviousFilter: 'all',
  });
  assert.deepEqual(computeNextStatusFilterOnUnconfirmedToggle('unconfirmed', 'unconfirmed'), {
    nextStatusFilter: 'all',
    savedPreviousFilter: 'all',
  });

  // STATUS_FILTER_OPTIONS has 12 lifecycle/derived items (including 'late', excluding 'unconfirmed')
  assert.equal(STATUS_FILTER_OPTIONS.length, 12);
  assert.equal(
    STATUS_FILTER_OPTIONS.some((o) => o.key === 'unconfirmed'),
    false,
    "STATUS_FILTER_OPTIONS must exclude 'unconfirmed' (moved to dedicated header button)"
  );

  // TripQueueFilterPopovers.tsx has 0 width-shifting `All Status (` strings and 0 pulsing corner dots
  const popoversSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx'),
    'utf8'
  );
  assert.equal(
    popoversSrc.includes('All Status ('),
    false,
    'TripQueueFilterPopovers.tsx must contain 0 width-shifting "All Status (" strings'
  );
  assert.equal(
    popoversSrc.includes('animate-pulse'),
    false,
    'TripQueueFilterPopovers.tsx must contain 0 pulsing corner dots on Status ▾'
  );

  // TripQueueToolbar.tsx renders Unconfirmed button + bg-rose-600 text-white red circle counter + TripQueueLayoutDropdown
  const toolbarSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/queue/TripQueueToolbar.tsx'),
    'utf8'
  );
  assert.ok(
    toolbarSrc.includes('computeNextStatusFilterOnUnconfirmedToggle') &&
      toolbarSrc.includes('<span>Unconfirmed</span>') &&
      toolbarSrc.includes('bg-rose-600 text-white'),
    'TripQueueToolbar.tsx must render dedicated Unconfirmed quick-filter button with bg-rose-600 text-white circle counter'
  );
  assert.ok(
    toolbarSrc.includes('<TripQueueLayoutDropdown'),
    'TripQueueToolbar.tsx must render portal <TripQueueLayoutDropdown />'
  );
  assert.equal(
    toolbarSrc.includes('absolute right-0 top-full'),
    false,
    'TripQueueToolbar.tsx must not use an inline absolute right-0 top-full layout dropdown'
  );

  console.log('   ✅ Passed Unconfirmed header quick-filter & red circle counter checks.\n');
}

function testMonolithCeilingsAndGuardrails(): void {
  console.log('4️⃣  Testing Monolith Line Ceilings, Immutable Files & Terminology Hygiene...');

  const ceilings: Array<[string, number]> = [
    ['app/components/ui/Select.tsx', 430],
    ['app/components/domain/dispatch/queue/TripQueueFilterPopovers.tsx', 540],
    ['app/components/domain/dispatch/queue/TripQueueToolbar.tsx', 1150],
    ['app/components/domain/dispatch/map/MapLayersAndVehiclesToolbar.tsx', 430],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/routes/admin.tsx', 1000],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
    ['app/components/domain/admin/customers/CustomerProfileDrawer.tsx', 450],
    ['app/components/domain/admin/invoicing/BillingPolicyAndQuickBooksPanel.tsx', 400],
    ['app/components/domain/admin/invoicing/CorporateAccountsPanel.tsx', 450],
    ['app/components/domain/admin/invoicing/PayoutSettlementModal.tsx', 400],
    ['app/components/domain/admin/pricing/audit/PricingAuditPanel.tsx', 450],
    ['app/components/domain/admin/rules/BookingRulesSimulatorCard.tsx', 350],
    ['app/components/domain/admin/subpages/AdminTripsSubpage.tsx', 450],
    ['app/components/domain/admin/website/WebsiteFormControlsTab.tsx', 450],
    ['app/components/domain/admin/website/WebsiteThemesTab.tsx', 450],
    ['app/components/domain/admin/AdminRulesTab.tsx', 350],
  ];

  for (const [relPath, maxLines] of ceilings) {
    const absPath = path.join(ROOT_DIR, relPath);
    assert.equal(fs.existsSync(absPath), true, `Expected file to exist: ${relPath}`);
    const lineCount = fs.readFileSync(absPath, 'utf8').split(/\r?\n/).length;
    assert.ok(
      lineCount < maxLines,
      `${relPath} exceeded line ceiling: ${lineCount} >= ${maxLines}`
    );
  }

  const gitStatusImmutable = execSync('git status --porcelain firestore.rules vercel.json', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  assert.equal(
    gitStatusImmutable,
    '',
    `firestore.rules and vercel.json must remain untouched, got: ${gitStatusImmutable}`
  );

  const appFiles = collectFiles(path.join(ROOT_DIR, 'app'), /\.(ts|tsx)$/);
  const forbiddenTokens = ['HUD Now', '[Avail]', '[En Route]', '[Busy]', '[Break]', '[Off]'];
  for (const file of appFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const token of forbiddenTokens) {
      assert.equal(
        src.includes(token),
        false,
        `Forbidden string "${token}" found in ${path.relative(ROOT_DIR, file)}`
      );
    }
  }

  console.log('   ✅ Passed all monolith line ceilings, immutable file & terminology guardrails.\n');
}

function main(): void {
  console.log('🚀 Running Platform Phase 65 Unified Dropdowns, Unconfirmed Filter & Admin Sweep Suite...\n');
  testGlobalZeroNativeSelectGate();
  testUnifiedActionsDropdownLanguageAndPositioning();
  testUnconfirmedQuickFilterAndRedCounter();
  testMonolithCeilingsAndGuardrails();
  console.log('🎉 ALL PHASE 65 VERIFICATION ASSERTIONS PASSED!');
}

main();
