import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TABLE_OVERFLOW_MIN_WIDTH_PX,
  TABLE_OVERFLOW_HYSTERESIS_PX,
  CARD_GRID_TWO_COL_MIN_PX,
  CARD_GRID_THREE_COL_MIN_PX,
  CARD_GRID_FOUR_COL_MIN_PX,
  resolveEffectiveQueueDisplayLayout,
  computeResponsiveTripCardColumns,
} from '../app/components/domain/dispatch/queue/trip-queue-layout.util';
import type { DisplayLayout } from '../app/core/hooks/useDisplayLayout';

function main() {
  console.log('=== Responsive Trips Queue Overflow & Dynamic Columns Suite ===');

  // 1. Threshold constants verification
  assert.equal(TABLE_OVERFLOW_MIN_WIDTH_PX, 1040, 'Baseline table overflow threshold must be 1040px');
  assert.equal(TABLE_OVERFLOW_HYSTERESIS_PX, 8, 'Table overflow hysteresis buffer must be 8px');
  assert.equal(CARD_GRID_TWO_COL_MIN_PX, 580, '2-column card threshold must be 580px');
  assert.equal(CARD_GRID_THREE_COL_MIN_PX, 900, '3-column card threshold must be 900px');
  assert.equal(CARD_GRID_FOUR_COL_MIN_PX, 1220, '4-column card threshold must be 1220px');
  console.log('✓ 1. Responsive threshold & hysteresis constants verified');

  // 2. SSR / Pre-measurement determinism (queueWidthPx === 0)
  const ssrTable = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'table',
    isDesktop: true,
    queueWidthPx: 0,
  });
  assert.deepEqual(ssrTable, {
    effectiveDisplayLayout: 'table',
    isAutoCardsFallback: false,
    effectiveMinTableWidthPx: 1040,
  });
  console.log('✓ 2. SSR pre-measurement determinism verified (queueWidthPx = 0 -> table)');

  // 3. Baseline dock open/close transitions (including 1920p desktop + Booking 430px + Phone Dock 500px = 990px!)
  const savedUserPreference: DisplayLayout = 'table';
  const transitionChecks: Array<{
    width: number;
    expectedLayout: DisplayLayout;
    expectedAuto: boolean;
    scenario: string;
  }> = [
    { width: 1490, expectedLayout: 'table', expectedAuto: false, scenario: '1920p Main view without right dock (1490px)' },
    { width: 1040, expectedLayout: 'table', expectedAuto: false, scenario: 'Exact baseline boundary (1040px)' },
    { width: 1039, expectedLayout: 'cards', expectedAuto: true, scenario: 'Just below baseline boundary (1039px)' },
    { width: 990, expectedLayout: 'cards', expectedAuto: true, scenario: '1920p with Left Booking (430px) + Phone/SMS Dock (500px) -> 990px' },
    { width: 850, expectedLayout: 'cards', expectedAuto: true, scenario: '1680p with Phone/Email dock open (850px)' },
    { width: 620, expectedLayout: 'cards', expectedAuto: true, scenario: 'Both sidebars widened (620px)' },
    { width: 480, expectedLayout: 'cards', expectedAuto: true, scenario: 'Maximum squeezed center pane (480px)' },
    { width: 1040, expectedLayout: 'table', expectedAuto: false, scenario: 'Center pane widened back to 1040px -> restores table' },
    { width: 1490, expectedLayout: 'table', expectedAuto: false, scenario: 'Right dock closed (1490px) -> table intact' },
  ];

  for (const step of transitionChecks) {
    const resolved = resolveEffectiveQueueDisplayLayout({
      displayLayout: savedUserPreference,
      isDesktop: true,
      queueWidthPx: step.width,
    });
    assert.equal(
      resolved.effectiveDisplayLayout,
      step.expectedLayout,
      `[${step.scenario}] Expected effectiveDisplayLayout=${step.expectedLayout}, got ${resolved.effectiveDisplayLayout}`
    );
    assert.equal(
      resolved.isAutoCardsFallback,
      step.expectedAuto,
      `[${step.scenario}] Expected isAutoCardsFallback=${step.expectedAuto}, got ${resolved.isAutoCardsFallback}`
    );
  }
  console.log('✓ 3. 1920p dock open/close transitions & non-destructive table preference verified');

  // 4. Dynamic DOM scrollWidth overflow escalation (e.g. Auto-Offer + SLA + Review pills needing 1265px)
  const measuredOverflowRequiredPx = 1265;
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'table',
      isDesktop: true,
      queueWidthPx: 1120,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: true,
      effectiveMinTableWidthPx: 1265,
    },
    'When live table scrollWidth overflows at 1120px (requiring 1265px), must switch to Cards (Auto)'
  );
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'table',
      isDesktop: true,
      queueWidthPx: 1264,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: true,
      effectiveMinTableWidthPx: 1265,
    },
    'Hysteresis must hold Cards (Auto) up to 1264px without oscillating'
  );
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'table',
      isDesktop: true,
      queueWidthPx: 1265,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'table',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx: 1265,
    },
    'Once center pane widens >= 1265px (e.g. dock closed at 1490px), Table view restores cleanly'
  );
  console.log('✓ 4. Live DOM scrollWidth overflow escalation & hysteresis restoration verified');

  // 5. Explicit Cards & Compact preferences on desktop never trigger auto-fallback flag
  for (const explicitMode of ['cards', 'compact'] as const) {
    for (const width of [480, 620, 859, 990, 1040, 1280]) {
      const res = resolveEffectiveQueueDisplayLayout({
        displayLayout: explicitMode,
        isDesktop: true,
        queueWidthPx: width,
        requiredTableWidthPx: 1265,
      });
      assert.equal(res.effectiveDisplayLayout, explicitMode);
      assert.equal(res.isAutoCardsFallback, false);
    }
  }
  console.log('✓ 5. Explicit desktop cards & compact modes verified across all widths');

  // 6. Mobile override (!isDesktop) always forces cards without auto-fallback badge
  for (const savedMode of ['table', 'cards', 'compact'] as const) {
    for (const width of [0, 375, 480, 620, 990, 1280]) {
      const mobileRes = resolveEffectiveQueueDisplayLayout({
        displayLayout: savedMode,
        isDesktop: false,
        queueWidthPx: width,
      });
      assert.equal(mobileRes.effectiveDisplayLayout, 'cards');
      assert.equal(mobileRes.isAutoCardsFallback, false);
    }
  }
  console.log('✓ 6. Mobile (!isDesktop) override verified');

  // 7. Container-driven dynamic card column counts across resize sweep
  const columnExpectations: Array<{ width: number; cols: 1 | 2 | 3 | 4 }> = [
    { width: 0, cols: 1 },
    { width: 360, cols: 1 },
    { width: 480, cols: 1 },
    { width: 579, cols: 1 },
    { width: 580, cols: 2 },
    { width: 620, cols: 2 },
    { width: 899, cols: 2 },
    { width: 900, cols: 3 },
    { width: 990, cols: 3 }, // 1920p with Left Booking + Right Phone Dock open -> 3 clean card columns!
    { width: 1219, cols: 3 },
    { width: 1220, cols: 4 },
    { width: 1490, cols: 4 },
    { width: 1600, cols: 4 },
  ];

  for (const { width, cols } of columnExpectations) {
    const actual = computeResponsiveTripCardColumns(width);
    assert.equal(actual, cols, `Expected ${cols} card column(s) at ${width}px, got ${actual}`);
  }
  console.log('✓ 7. Dynamic container card column calculations verified (360px..1600px)');

  // 8. Static source guardrails on decomposed queue modules
  const rootDir = process.cwd();
  const panePath = path.join(rootDir, 'app/components/domain/dispatch/DispatchTripQueuePane.tsx');
  const cardsPath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx');
  const tablePath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx');
  const toolbarPath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueToolbar.tsx');

  const paneLines = fs.readFileSync(panePath, 'utf8').split(/\r?\n/).length;
  assert.ok(
    paneLines < 900,
    `DispatchTripQueuePane.tsx must be < 900 lines (actual: ${paneLines})`
  );

  const cardsSource = fs.readFileSync(cardsPath, 'utf8');
  assert.ok(
    !cardsSource.includes('md:grid-cols-2') && !cardsSource.includes('xl:grid-cols-3'),
    'TripQueueCardsGrid.tsx must not use viewport-bound md:grid-cols-2 or xl:grid-cols-3'
  );
  assert.ok(
    cardsSource.includes('@container/tripqueue'),
    'TripQueueCardsGrid.tsx must include @container/tripqueue CSS container fallback'
  );

  const tableSource = fs.readFileSync(tablePath, 'utf8');
  assert.ok(
    tableSource.includes('onTableOverflowDetected') && tableSource.includes('scroller.scrollWidth'),
    'TripQueueTableView.tsx must measure live scroller.scrollWidth > scroller.clientWidth overflow'
  );

  const toolbarSource = fs.readFileSync(toolbarPath, 'utf8');
  assert.ok(
    toolbarSource.includes('Cards (Auto)'),
    'TripQueueToolbar.tsx must render "Cards (Auto)" indicator when isAutoCardsFallback is active'
  );
  console.log(`✓ 8. Source guardrails verified (DispatchTripQueuePane.tsx = ${paneLines} lines < 900)`);

  console.log('ALL RESPONSIVE TRIPS QUEUE TESTS PASSED! ✅');
}

main();
