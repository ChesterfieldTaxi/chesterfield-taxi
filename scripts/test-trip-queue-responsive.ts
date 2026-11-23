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
import { isValidDisplayLayout, type DisplayLayout } from '../app/core/hooks/useDisplayLayout';

function main() {
  console.log('=== Responsive Trips Queue Overflow & 4-Mode DisplayLayout Suite ===');

  // 1. Threshold constants & 4-mode DisplayLayout validator
  assert.equal(TABLE_OVERFLOW_MIN_WIDTH_PX, 920, 'Baseline auto-table overflow threshold must be 920px');
  assert.equal(TABLE_OVERFLOW_HYSTERESIS_PX, 8, 'Table overflow hysteresis buffer must be 8px');
  assert.equal(CARD_GRID_TWO_COL_MIN_PX, 580, '2-column card threshold must be 580px');
  assert.equal(CARD_GRID_THREE_COL_MIN_PX, 900, '3-column card threshold must be 900px');
  assert.equal(CARD_GRID_FOUR_COL_MIN_PX, 1220, '4-column card threshold must be 1220px');

  for (const validMode of ['auto', 'table', 'cards', 'compact'] as const) {
    assert.equal(isValidDisplayLayout(validMode), true, `Expected "${validMode}" to be valid DisplayLayout`);
  }
  assert.equal(isValidDisplayLayout('grid'), false);
  assert.equal(isValidDisplayLayout(null), false);
  console.log('✓ 1. Responsive threshold constants & 4-mode DisplayLayout validator verified');

  // 2. SSR / Pre-measurement determinism (queueWidthPx === 0) for both 'table' and 'auto'
  for (const mode of ['table', 'auto'] as const) {
    const ssrRes = resolveEffectiveQueueDisplayLayout({
      displayLayout: mode,
      isDesktop: true,
      queueWidthPx: 0,
    });
    assert.deepEqual(ssrRes, {
      effectiveDisplayLayout: 'table',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx: 920,
    });
  }
  console.log('✓ 2. SSR pre-measurement determinism verified (queueWidthPx = 0 -> table)');

  // 3. Explicit 'table' mode on desktop ALWAYS renders 'table' (700px, 980px, 1400px, even with requiredTableWidthPx = 1265px)
  for (const width of [480, 620, 700, 850, 919, 980, 1120, 1400]) {
    const explicitTable = resolveEffectiveQueueDisplayLayout({
      displayLayout: 'table',
      isDesktop: true,
      queueWidthPx: width,
      requiredTableWidthPx: 1265,
    });
    assert.equal(
      explicitTable.effectiveDisplayLayout,
      'table',
      `Explicit 'table' at ${width}px must NEVER get trapped in Cards (Auto)`
    );
    assert.equal(
      explicitTable.isAutoCardsFallback,
      false,
      `Explicit 'table' at ${width}px must have isAutoCardsFallback = false`
    );
  }
  console.log('✓ 3. Explicit desktop "table" override verified across 480px..1400px (zero Cards trap)');

  // 4. Responsive 'auto' mode transitions (920px baseline)
  const autoTransitionChecks: Array<{
    width: number;
    expectedLayout: DisplayLayout;
    expectedAuto: boolean;
    scenario: string;
  }> = [
    { width: 1490, expectedLayout: 'table', expectedAuto: false, scenario: '1920p Main view without right dock (1490px)' },
    { width: 990, expectedLayout: 'table', expectedAuto: false, scenario: '1920p with Booking (430px) + Phone Dock (500px) -> 990px fits compact 900px table!' },
    { width: 920, expectedLayout: 'table', expectedAuto: false, scenario: 'Exact baseline boundary (920px)' },
    { width: 919, expectedLayout: 'cards', expectedAuto: true, scenario: 'Just below baseline boundary (919px)' },
    { width: 850, expectedLayout: 'cards', expectedAuto: true, scenario: '1680p with Phone/Email dock open (850px)' },
    { width: 620, expectedLayout: 'cards', expectedAuto: true, scenario: 'Both sidebars widened (620px)' },
    { width: 480, expectedLayout: 'cards', expectedAuto: true, scenario: 'Maximum squeezed center pane (480px)' },
    { width: 920, expectedLayout: 'table', expectedAuto: false, scenario: 'Center pane widened back to 920px -> restores table' },
    { width: 1400, expectedLayout: 'table', expectedAuto: false, scenario: 'Right dock closed (1400px) -> table intact' },
  ];

  for (const step of autoTransitionChecks) {
    const resolved = resolveEffectiveQueueDisplayLayout({
      displayLayout: 'auto',
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
  console.log('✓ 4. Responsive "auto" mode Table ↔ Cards transitions verified (920px baseline)');

  // 5. Dynamic DOM scrollWidth overflow escalation + hysteresis in 'auto' mode
  const measuredOverflowRequiredPx = 1185;
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'auto',
      isDesktop: true,
      queueWidthPx: 1050,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: true,
      effectiveMinTableWidthPx: 1185,
    },
    'In auto mode, when live table scrollWidth overflows at 1050px (requiring 1185px), must switch to Cards (Auto)'
  );
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'auto',
      isDesktop: true,
      queueWidthPx: 1184,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'cards',
      isAutoCardsFallback: true,
      effectiveMinTableWidthPx: 1185,
    },
    'Hysteresis must hold Cards (Auto) up to 1184px without oscillating'
  );
  assert.deepEqual(
    resolveEffectiveQueueDisplayLayout({
      displayLayout: 'auto',
      isDesktop: true,
      queueWidthPx: 1185,
      requiredTableWidthPx: measuredOverflowRequiredPx,
    }),
    {
      effectiveDisplayLayout: 'table',
      isAutoCardsFallback: false,
      effectiveMinTableWidthPx: 1185,
    },
    'Once center pane widens >= 1185px, Table (Auto) restores cleanly'
  );
  console.log('✓ 5. Live DOM scrollWidth overflow escalation & +8px hysteresis verified in auto mode');

  // 6. Explicit Cards & Compact preferences on desktop never trigger auto-fallback flag
  for (const explicitMode of ['cards', 'compact'] as const) {
    for (const width of [480, 620, 859, 920, 990, 1280]) {
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
  console.log('✓ 6. Explicit desktop cards & compact modes verified across all widths');

  // 7. Mobile override (!isDesktop) always forces cards without auto-fallback badge
  for (const savedMode of ['auto', 'table', 'cards', 'compact'] as const) {
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
  console.log('✓ 7. Mobile (!isDesktop) override verified across all 4 modes');

  // 8. Container-driven dynamic card column counts across resize sweep
  const columnExpectations: Array<{ width: number; cols: 1 | 2 | 3 | 4 }> = [
    { width: 0, cols: 1 },
    { width: 360, cols: 1 },
    { width: 480, cols: 1 },
    { width: 579, cols: 1 },
    { width: 580, cols: 2 },
    { width: 620, cols: 2 },
    { width: 899, cols: 2 },
    { width: 900, cols: 3 },
    { width: 990, cols: 3 },
    { width: 1219, cols: 3 },
    { width: 1220, cols: 4 },
    { width: 1490, cols: 4 },
    { width: 1600, cols: 4 },
  ];

  for (const { width, cols } of columnExpectations) {
    const actual = computeResponsiveTripCardColumns(width);
    assert.equal(actual, cols, `Expected ${cols} card column(s) at ${width}px, got ${actual}`);
  }
  console.log('✓ 8. Dynamic container card column calculations verified (360px..1600px)');

  // 9. Static source guardrails on decomposed queue modules
  const rootDir = process.cwd();
  const panePath = path.join(rootDir, 'app/components/domain/dispatch/DispatchTripQueuePane.tsx');
  const cardsPath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueCardsGrid.tsx');
  const tablePath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueTableView.tsx');
  const toolbarPath = path.join(rootDir, 'app/components/domain/dispatch/queue/TripQueueToolbar.tsx');

  const paneSource = fs.readFileSync(panePath, 'utf8');
  const paneLines = paneSource.split(/\r?\n/).length;
  assert.ok(
    paneLines < 900,
    `DispatchTripQueuePane.tsx must be < 900 lines (actual: ${paneLines})`
  );
  assert.ok(
    paneSource.includes("displayLayout === 'auto' ? handleTableOverflowDetected : undefined"),
    'DispatchTripQueuePane.tsx must only attach handleTableOverflowDetected when displayLayout === "auto"'
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
    tableSource.includes('min-w-[900px]'),
    'TripQueueTableView.tsx must use compact min-w-[900px]'
  );
  assert.ok(
    tableSource.includes('onTableOverflowDetected') && tableSource.includes('scroller.scrollWidth'),
    'TripQueueTableView.tsx must measure live scroller.scrollWidth > scroller.clientWidth overflow'
  );

  const toolbarSource = fs.readFileSync(toolbarPath, 'utf8');
  assert.ok(
    toolbarSource.includes('Cards (Auto)') &&
      toolbarSource.includes('Table (Auto)') &&
      toolbarSource.includes('Table ↔ Cards'),
    'TripQueueToolbar.tsx must expose Auto (Table ↔ Cards), Table (Auto), and Cards (Auto) labels'
  );
  console.log(`✓ 9. Source guardrails verified (DispatchTripQueuePane.tsx = ${paneLines} lines < 900)`);

  console.log('ALL RESPONSIVE TRIPS QUEUE TESTS PASSED! ✅');
}

main();
