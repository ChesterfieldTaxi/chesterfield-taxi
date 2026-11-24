/**
 * Phase 64 Automated Verification Suite (`scripts/test-design-system-and-dispatch-persistence-phase64.ts`)
 *
 * Verifies:
 * 1. `parseStoredDispatchPanelLayout` & `serializeDispatchPanelLayout` (`useDispatchPanelResize.ts`):
 *    - `sidebarWidth` (`320..680`, default `430`), `queueHeight` (`150..1200`, default `240` — preserving
 *      `780px` & `920px` heights from `1080p`/`1440p` monitors!), `operationsWidth` (`320..760`, default `400`),
 *      and `activeDockTab` (`ct_dispatch_active_dock_tab`) round-trip accurately.
 *    - Dynamic viewport clamping (`Math.max(220, Math.floor(viewportHeight * 0.68))`) clamps rendered
 *      dimensions on smaller viewports without destroying `storedQueueHeight`.
 *    - Zero mount-render overwrite `useEffect` in `useDispatchPanelResize.ts`.
 * 2. `FloatingWindow.tsx` geometry persistence (`ct_floating_win_${id}`) & off-screen viewport clamping.
 * 3. `Select.tsx` pure option extraction (`extractSelectOptionsFromChildren`, `resolveSelectOptions`,
 *    `filterSelectOptions`), `createPortal` + `document.body` + `z-[99999]` + locked width (`lockedWidthRef`),
 *    zero native `<select` tags, plus `Switch`, `Checkbox` (Royal Blue default), and `SegmentedControl` exports.
 * 4. Static Zero-Native-`<select>` Gate Outside Admin: scans every `.tsx` file under `app/` excluding
 *    `app/components/domain/admin/**` and asserts zero `<select` occurrences.
 * 5. Monolith line ceilings, untouched `firestore.rules` & `vercel.json`, and zero `"HUD Now"` / bracketed
 *    driver status strings across `app/`.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import {
  ACTIVE_DOCK_TAB_STORAGE_KEY,
  DEFAULT_DISPATCH_PANEL_LAYOUT,
  DOCK_WIDTH_STORAGE_KEY,
  QUEUE_HEIGHT_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  parseStoredDispatchPanelLayout,
  serializeDispatchPanelLayout,
} from '../app/core/hooks/dispatch/useDispatchPanelResize';
import {
  FLOATING_WINDOW_STORAGE_PREFIX,
  clampFloatingWindowGeometry,
  getFloatingWindowStorageKey,
  parseStoredFloatingWindowGeometry,
  serializeFloatingWindowGeometry,
} from '../app/components/ui/FloatingWindow';
import {
  extractSelectOptionsFromChildren,
  filterSelectOptions,
  resolveSelectOptions,
} from '../app/components/ui/Select';
import * as UiPrimitives from '../app/components/ui';

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

function testDispatchPanelResizePersistence(): void {
  console.log('1️⃣  Testing parseStoredDispatchPanelLayout, serializeDispatchPanelLayout & race-free hook...');

  // Defaults on empty / invalid records
  const emptyParsed = parseStoredDispatchPanelLayout(null);
  assert.equal(emptyParsed.sidebarWidth, DEFAULT_DISPATCH_PANEL_LAYOUT.sidebarWidth);
  assert.equal(emptyParsed.queueHeight, DEFAULT_DISPATCH_PANEL_LAYOUT.queueHeight);
  assert.equal(emptyParsed.operationsWidth, DEFAULT_DISPATCH_PANEL_LAYOUT.operationsWidth);
  assert.equal(emptyParsed.activeDockTab, 'none');

  const outOfBounds = parseStoredDispatchPanelLayout({
    [SIDEBAR_WIDTH_STORAGE_KEY]: '120',
    [QUEUE_HEIGHT_STORAGE_KEY]: '1800',
    [DOCK_WIDTH_STORAGE_KEY]: '999',
    [ACTIVE_DOCK_TAB_STORAGE_KEY]: 'invalid_tab',
  });
  assert.equal(outOfBounds.sidebarWidth, 430);
  assert.equal(outOfBounds.queueHeight, 240);
  assert.equal(outOfBounds.operationsWidth, 400);
  assert.equal(outOfBounds.activeDockTab, 'none');

  // Round-trip 1080p height (702px) & 1440p heights (780px & 920px) — MUST NOT be rejected at 600px!
  for (const tallQueueHeight of [702, 780, 920, 1150]) {
    const serialized = serializeDispatchPanelLayout({
      sidebarWidth: 520,
      queueHeight: tallQueueHeight,
      operationsWidth: 485,
      activeDockTab: 'comms',
    });
    assert.equal(serialized[SIDEBAR_WIDTH_STORAGE_KEY], '520');
    assert.equal(serialized[QUEUE_HEIGHT_STORAGE_KEY], String(tallQueueHeight));
    assert.equal(serialized[DOCK_WIDTH_STORAGE_KEY], '485');
    assert.equal(serialized[ACTIVE_DOCK_TAB_STORAGE_KEY], 'comms');

    const roundTripped = parseStoredDispatchPanelLayout(serialized);
    assert.equal(roundTripped.sidebarWidth, 520);
    assert.equal(roundTripped.queueHeight, tallQueueHeight);
    assert.equal(roundTripped.storedQueueHeight, tallQueueHeight);
    assert.equal(roundTripped.operationsWidth, 485);
    assert.equal(roundTripped.activeDockTab, 'comms');
  }

  // Dynamic viewport clamping preserves `storedQueueHeight` (920px from 1440p) while clamping rendered screen height on 768p laptop
  const laptopClamped = parseStoredDispatchPanelLayout(
    serializeDispatchPanelLayout({
      sidebarWidth: 640,
      queueHeight: 920,
      operationsWidth: 680,
      activeDockTab: 'drivers',
    }),
    { width: 1366, height: 768 }
  );
  assert.equal(laptopClamped.storedQueueHeight, 920);
  assert.equal(laptopClamped.queueHeight, Math.floor(768 * 0.68));
  assert.equal(laptopClamped.activeDockTab, 'drivers');

  // On 1440p monitor (2560x1440), 920px renders unclamped (920 <= Math.floor(1440 * 0.68) = 979)
  const qhdRendered = parseStoredDispatchPanelLayout(
    serializeDispatchPanelLayout({
      sidebarWidth: 540,
      queueHeight: 920,
      operationsWidth: 500,
      activeDockTab: 'email',
    }),
    { width: 2560, height: 1440 }
  );
  assert.equal(qhdRendered.queueHeight, 920);
  assert.equal(qhdRendered.storedQueueHeight, 920);
  assert.equal(qhdRendered.activeDockTab, 'email');

  // Verify `useDispatchPanelResize.ts` contains zero mount-render overwrite effect
  const hookSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/core/hooks/dispatch/useDispatchPanelResize.ts'),
    'utf8'
  );
  assert.equal(
    hookSrc.includes('hasHydratedDimensionsRef'),
    false,
    'Legacy race-prone hasHydratedDimensionsRef write effect must be removed from useDispatchPanelResize.ts'
  );
  assert.equal(
    /\},\s*\[[^\]]*sidebarWidth[^\]]*queueHeight[^\]]*\]\s*\)/.test(hookSrc),
    false,
    'useDispatchPanelResize.ts must not write to localStorage inside a [sidebarWidth, queueHeight] useEffect'
  );
  assert.ok(
    hookSrc.includes('ct_dispatch_active_dock_tab'),
    'useDispatchPanelResize.ts must persist activeDockTab under ct_dispatch_active_dock_tab'
  );

  console.log('   ✅ Passed Dispatch panel layout persistence & zero mount-overwrite verification.\n');
}

function testFloatingWindowGeometryPersistence(): void {
  console.log('2️⃣  Testing FloatingWindow geometry persistence & off-screen viewport clamping...');

  assert.equal(FLOATING_WINDOW_STORAGE_PREFIX, 'ct_floating_win_');
  assert.equal(getFloatingWindowStorageKey('driver_queue'), 'ct_floating_win_driver_queue');

  const rawSerialized = serializeFloatingWindowGeometry({
    x: 180,
    y: 95,
    width: 640,
    height: 540,
  });
  const hydratedDesktop = parseStoredFloatingWindowGeometry(rawSerialized, {
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(hydratedDesktop, { x: 180, y: 95, width: 640, height: 540 });

  // Off-screen ultrawide geometry restored onto a smaller 1280x720 viewport must clamp completely inside viewport
  const offscreenSerialized = serializeFloatingWindowGeometry({
    x: 2350,
    y: 1180,
    width: 900,
    height: 860,
  });
  const clampedSmall = parseStoredFloatingWindowGeometry(
    offscreenSerialized,
    { width: 1280, height: 720 },
    { minWidth: 360, minHeight: 280 }
  );
  assert.ok(clampedSmall !== null);
  assert.ok(clampedSmall.width <= 1280 - 24);
  assert.ok(clampedSmall.height <= 720 - 24);
  assert.ok(clampedSmall.x >= 12 && clampedSmall.x + clampedSmall.width <= 1280 - 12);
  assert.ok(clampedSmall.y >= 12 && clampedSmall.y + clampedSmall.height <= 720 - 12);

  // Negative off-screen coordinates clamp cleanly to >= 12px
  const clampedNegative = clampFloatingWindowGeometry(
    { x: -500, y: -320, width: 520, height: 480 },
    { width: 1440, height: 900 }
  );
  assert.equal(clampedNegative.x, 12);
  assert.equal(clampedNegative.y, 12);
  assert.equal(clampedNegative.width, 520);
  assert.equal(clampedNegative.height, 480);

  assert.equal(parseStoredFloatingWindowGeometry(null, { width: 1440, height: 900 }), null);
  assert.equal(parseStoredFloatingWindowGeometry('{broken', { width: 1440, height: 900 }), null);

  const fwSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/ui/FloatingWindow.tsx'), 'utf8');
  assert.ok(fwSrc.includes('ct_floating_win_'), 'FloatingWindow.tsx must use ct_floating_win_ storage prefix');
  assert.ok(fwSrc.includes('pointerup'), 'FloatingWindow.tsx must persist geometry on pointerup/mouseup');

  console.log('   ✅ Passed FloatingWindow geometry persistence & off-screen viewport clamping.\n');
}

function testDesignSystemPrimitives(): void {
  console.log('3️⃣  Testing Portal Select option extraction/filtering & UI primitive exports...');

  // Verify barrel exports in app/components/ui/index.ts
  assert.equal(typeof UiPrimitives.Select, 'object'); // forwardRef component
  assert.equal(typeof UiPrimitives.Switch, 'function');
  assert.equal(typeof UiPrimitives.Checkbox, 'function');
  assert.equal(typeof UiPrimitives.SegmentedControl, 'function');

  // Test JSX <option>, <optgroup>, and Fragment child extraction
  const jsxChildren = [
    React.createElement('option', { key: 'all', value: 'all' }, 'All Vehicles'),
    React.createElement(
      'optgroup',
      { key: 'grp-exec', label: 'Executive Fleet' },
      React.createElement('option', { key: 'sedan', value: 'sedan' }, 'Executive Sedan'),
      React.createElement('option', { key: 'suv', value: 'suv', disabled: true }, 'Luxury SUV')
    ),
    React.createElement(
      React.Fragment,
      { key: 'frag' },
      React.createElement('option', { key: 'wav', value: 'wav' }, 'Wheelchair WAV')
    ),
  ];

  const extracted = extractSelectOptionsFromChildren(jsxChildren);
  assert.equal(extracted.length, 4);
  assert.deepEqual(extracted[0], {
    value: 'all',
    label: 'All Vehicles',
    disabled: false,
    group: undefined,
  });
  assert.deepEqual(extracted[1], {
    value: 'sedan',
    label: 'Executive Sedan',
    disabled: false,
    group: 'Executive Fleet',
  });
  assert.deepEqual(extracted[2], {
    value: 'suv',
    label: 'Luxury SUV',
    disabled: true,
    group: 'Executive Fleet',
  });
  assert.deepEqual(extracted[3], {
    value: 'wav',
    label: 'Wheelchair WAV',
    disabled: false,
    group: undefined,
  });

  // Explicit `options` prop takes precedence over children
  const explicit = resolveSelectOptions(
    [
      { value: 'DL', label: 'Delta Air Lines', badge: 'T1', subtitle: 'Exit Door 6' },
      { value: 'WN', label: 'Southwest Airlines', badge: 'T2', subtitle: 'Exit Door 12' },
    ],
    jsxChildren
  );
  assert.equal(explicit.length, 2);
  assert.equal(filterSelectOptions(explicit, 'door 12').length, 1);
  assert.equal(filterSelectOptions(explicit, 'door 12')[0].value, 'WN');
  assert.equal(filterSelectOptions(extracted, 'executive fleet').length, 2);

  // Verify Select.tsx uses createPortal + document.body + z-[99999] + lockedWidthRef and zero <select tags
  const selectSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/ui/Select.tsx'), 'utf8');
  assert.ok(selectSrc.includes('createPortal'), 'Select.tsx must render menu via createPortal');
  assert.ok(selectSrc.includes('document.body'), 'Select.tsx must portal to document.body');
  assert.ok(selectSrc.includes('z-[99999]'), 'Select.tsx must use z-[99999]');
  assert.ok(selectSrc.includes('lockedWidthRef'), 'Select.tsx must lock open width to prevent layout shift');
  assert.equal(/<select\b/.test(selectSrc), false, 'Select.tsx must contain zero native <select tags');

  // Verify Switch.tsx & Checkbox.tsx default to Royal Blue (`bg-blue-600`)
  const switchSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/ui/Switch.tsx'), 'utf8');
  const checkboxSrc = fs.readFileSync(path.join(ROOT_DIR, 'app/components/ui/Checkbox.tsx'), 'utf8');
  assert.ok(switchSrc.includes("tone = 'blue'") && switchSrc.includes('bg-blue-600'));
  assert.ok(checkboxSrc.includes("tone = 'blue'") && checkboxSrc.includes('bg-blue-600'));

  console.log('   ✅ Passed Portal Select, Switch, Checkbox & SegmentedControl checks.\n');
}

function testZeroNativeSelectOutsideAdmin(): void {
  console.log('4️⃣  Scanning all non-Admin .tsx files under app/ for zero native <select> tags...');

  const adminDirPrefix = path.normalize(path.join(ROOT_DIR, 'app/components/domain/admin')) + path.sep;
  const allTsxFiles = collectFiles(path.join(ROOT_DIR, 'app'), /\.tsx$/);
  const nonAdminTsxFiles = allTsxFiles.filter(
    (absPath) => !path.normalize(absPath).startsWith(adminDirPrefix)
  );

  assert.ok(
    nonAdminTsxFiles.length >= 80,
    `Expected at least 80 non-admin .tsx files, scanned ${nonAdminTsxFiles.length}`
  );

  const offendingFiles: string[] = [];
  for (const file of nonAdminTsxFiles) {
    const src = fs.readFileSync(file, 'utf8');
    if (/<select\b/.test(src)) {
      offendingFiles.push(path.relative(ROOT_DIR, file));
    }
  }

  assert.deepEqual(
    offendingFiles,
    [],
    `Found forbidden native <select> elements outside Admin: ${offendingFiles.join(', ')}`
  );

  // Also ensure DriverAssignDropdown is still preserved in DispatchPaymentAssignmentSection.tsx
  const paymentSectionSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'app/components/domain/dispatch/booking/DispatchPaymentAssignmentSection.tsx'),
    'utf8'
  );
  assert.ok(
    paymentSectionSrc.includes('<DriverAssignDropdown'),
    'DispatchPaymentAssignmentSection.tsx must preserve <DriverAssignDropdown /> for driver assignment'
  );

  console.log(`   ✅ Verified 0 native <select> elements across ${nonAdminTsxFiles.length} non-Admin .tsx files.\n`);
}

function testMonolithCeilingsAndGuardrails(): void {
  console.log('5️⃣  Testing Monolith Line Ceilings, Immutable Files & Terminology Hygiene...');

  const ceilings: Array<[string, number]> = [
    ['app/components/ui/Select.tsx', 430],
    ['app/components/ui/FloatingWindow.tsx', 530],
    ['app/components/ui/SegmentedControl.tsx', 120],
    ['app/core/hooks/dispatch/useDispatchPanelResize.ts', 260],
    ['app/components/domain/dispatch/LiveFleetMap.tsx', 1200],
    ['app/routes/admin.tsx', 1000],
    ['app/routes/dispatch.tsx', 1600],
    ['app/routes/driver.tsx', 1900],
    ['app/components/domain/BookingEngineV2.tsx', 1350],
    ['app/components/domain/dispatch/DispatchBookingEngine.tsx', 1800],
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
  console.log('🚀 Running Platform Phase 64 Design System Primitives & Dispatch Persistence Suite...\n');
  testDispatchPanelResizePersistence();
  testFloatingWindowGeometryPersistence();
  testDesignSystemPrimitives();
  testZeroNativeSelectOutsideAdmin();
  testMonolithCeilingsAndGuardrails();
  console.log('🎉 ALL PHASE 64 VERIFICATION ASSERTIONS PASSED!');
}

main();
