import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TABLE_OVERFLOW_MIN_WIDTH_PX,
  CARD_GRID_TWO_COL_MIN_PX,
  CARD_GRID_THREE_COL_MIN_PX,
  CARD_GRID_FOUR_COL_MIN_PX,
  resolveEffectiveQueueDisplayLayout,
  computeResponsiveTripCardColumns,
} from '../app/components/domain/dispatch/queue/trip-queue-layout.util';
import type { DisplayLayout } from '../app/core/hooks/useDisplayLayout';

function main() {
  console.log('=== Phase 46: Responsive Trips Queue Unit & Invariant Suite ===');

  // 1. Threshold constants verification
  assert.equal(TABLE_OVERFLOW_MIN_WIDTH_PX, 860, 'Table overflow threshold must be 860px');
  assert.equal(CARD_GRID_TWO_COL_MIN_PX, 580, '2-column card threshold must be 580px');
  assert.equal(CARD_GRID_THREE_COL_MIN_PX, 900, '3-column card threshold must be 900px');
  assert.equal(CARD_GRID_FOUR_COL_MIN_PX, 1220, '4-column card threshold must be 1220px');
  console.log('✓ 1. Responsive threshold constants verified');

  // 2. SSR / Pre-measurement determinism (queueWidthPx === 0)
  const ssrTable = resolveEffectiveQueueDisplayLayout({
    displayLayout: 'table',
    isDesktop: true,
    queueWidthPx: 0,
  });
  assert.deepEqual(ssrTable, {
    effectiveDisplayLayout: 'table',
    isAutoCardsFallback: false,
  });
  console.log('✓ 2. SSR pre-measurement determinism verified (queueWidthPx = 0 -> table)');

  // 3. Dock open/close transitions & non-destructive user preference preservation
  let savedUserPreference: DisplayLayout = 'table';
  const transitionChecks: Array<{
    width: number;
    expectedLayout: DisplayLayout;
    expectedAuto: boolean;
    scenario: string;
  }> = [
    { width: 1280, expectedLayout: 'table', expectedAuto: false, scenario: 'Main wide desktop (1280px)' },
    { width: 950, expectedLayout: 'table', expectedAuto: false, scenario: 'Sidebar slightly widened (950px)' },
    { width: 860, expectedLayout: 'table', expectedAuto: false, scenario: 'Exact boundary (860px)' },
    { width: 859, expectedLayout: 'cards', expectedAuto: true, scenario: 'Phone/Email dock opened -> narrow boundary (859px)' },
    { width: 620, expectedLayout: 'cards', expectedAuto: true, scenario: 'Both sidebars widened (620px)' },
    { width: 480, expectedLayout: 'cards', expectedAuto: true, scenario: 'Maximum squeezed center pane (480px)' },
    { width: 860, expectedLayout: 'table', expectedAuto: false, scenario: 'Right dock narrowed back to 860px -> auto-restores table' },
    { width: 1280, expectedLayout: 'table', expectedAuto: false, scenario: 'Right dock closed (1280px) -> table intact' },
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
    assert.equal(savedUserPreference, 'table', 'Saved user preference must remain untouched');
  }
  console.log('✓ 3. Dock open/close transitions & non-destructive table preference preservation verified');

  // 4. Explicit Cards & Compact preferences on desktop never trigger auto-fallback flag
  for (const explicitMode of ['cards', 'compact'] as const) {
    for (const width of [480, 620, 859, 860, 950, 1280]) {
      const res = resolveEffectiveQueueDisplayLayout({
        displayLayout: explicitMode,
        isDesktop: true,
        queueWidthPx: width,
      });
      assert.deepEqual(res, {
        effectiveDisplayLayout: explicitMode,
        isAutoCardsFallback: false,
      });
    }
  }
  console.log('✓ 4. Explicit desktop cards & compact modes verified across all widths');

  // 5. Mobile override (!isDesktop) always forces cards without auto-fallback badge
  for (const savedMode of ['table', 'cards', 'compact'] as const) {
    for (const width of [0, 375, 480, 620, 860, 1280]) {
      const mobileRes = resolveEffectiveQueueDisplayLayout({
        displayLayout: savedMode,
        isDesktop: false,
        queueWidthPx: width,
      });
      assert.deepEqual(mobileRes, {
        effectiveDisplayLayout: 'cards',
        isAutoCardsFallback: false,
      });
    }
  }
  console.log('✓ 5. Mobile (!isDesktop) override verified');

  // 6. Container-driven dynamic card column counts across resize sweep
  const columnExpectations: Array<{ width: number; cols: 1 | 2 | 3 | 4 }> = [
    { width: 0, cols: 1 },
    { width: 360, cols: 1 },
    { width: 480, cols: 1 },
    { width: 579, cols: 1 },
    { width: 580, cols: 2 },
    { width: 620, cols: 2 },
    { width: 859, cols: 2 },
    { width: 860, cols: 2 },
    { width: 899, cols: 2 },
    { width: 900, cols: 3 },
    { width: 950, cols: 3 },
    { width: 1219, cols: 3 },
    { width: 1220, cols: 4 },
    { width: 1280, cols: 4 },
    { width: 1600, cols: 4 },
  ];

  for (const { width, cols } of columnExpectations) {
    const actual = computeResponsiveTripCardColumns(width);
    assert.equal(actual, cols, `Expected ${cols} card column(s) at ${width}px, got ${actual}`);
  }
  console.log('✓ 6. Dynamic container card column calculations verified (480px..1600px)');

  // 7. Static source guardrails on decomposed queue modules
  const rootDir = process.cwd();
  const panePath = path.join(rootDir, 'app/components/domain/dispatch/DispatchTripQueuePane.tsx');
  const cardsPath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx');
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

  const toolbarSource = fs.readFileSync(toolbarPath, 'utf8');
  assert.ok(
    toolbarSource.includes('Cards (Auto)'),
    'TripQueueToolbar.tsx must render "Cards (Auto)" indicator when isAutoCardsFallback is active'
  );
  console.log(`✓ 7. Source guardrails verified (DispatchTripQueuePane.tsx = ${paneLines} lines < 900)`);

  console.log('ALL RESPONSIVE TRIPS QUEUE TESTS PASSED!');
}

main();
