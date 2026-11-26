import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DRIVER_BOTTOM_TABS,
  DRIVER_PROFILE_SUB_TABS,
} from '../app/core/utils/driver-ui.util';
import {
  dispatchAlertsService,
  filterAlertsForDriver,
  isAlertReadByDriver,
  isAlertVisibleToDriver,
  normalizeAlertRecord,
  type DispatchAlertRecord,
} from '../app/core/services/dispatch/dispatch-alerts.service';
import { DriverMessagesPane } from '../app/components/domain/driver/DriverMessagesPane';
import { DriverProfilePane } from '../app/components/domain/driver/DriverProfilePane';
import { DEFAULT_SCHEDULE } from '../app/core/services/driver.service';
import type { DriverProfile } from '../app/core/types/driver';

async function runTests() {
  // 1. Config-driven tab arrays
  assert.deepEqual(
    DRIVER_BOTTOM_TABS.map((t) => t.id),
    ['active', 'offers', 'scheduled', 'messages', 'profile'],
    'Bottom nav must have the 5 expected tabs'
  );
  assert.deepEqual(
    DRIVER_PROFILE_SUB_TABS.map((t) => t.id),
    ['earnings', 'hours', 'account'],
    'Profile pane must have Earnings | Hours | Account sub-tabs'
  );

  // 2. Normalization & driver-scoped filtering
  const broadcastAlert = normalizeAlertRecord('alert-b1', {
    to: 'All Drivers',
    text: 'Airport surge at Terminal 2',
    priority: 'urgent',
    targetDriverId: null,
  });
  const directToMe = normalizeAlertRecord('alert-d1', {
    to: 'Car #12',
    text: 'Call dispatch on channel 2',
    priority: 'normal',
    targetDriverId: 'drv-101',
  });
  const directToOther = normalizeAlertRecord('alert-d2', {
    to: 'Car #99',
    text: 'Private message for another driver',
    priority: 'normal',
    targetDriverId: 'drv-999',
  });
  const dispatchInternal = normalizeAlertRecord('alert-sys', {
    to: 'Dispatch Operations',
    text: 'Unassigned trip SLA warning',
    priority: 'urgent',
    source: 'system',
  });
  const dismissedAlert = normalizeAlertRecord('alert-dis', {
    to: 'All Drivers',
    text: 'Old dismissed alert',
    dismissedAt: Date.now() - 1000,
  });

  assert.equal(isAlertVisibleToDriver(broadcastAlert, 'drv-101'), true);
  assert.equal(isAlertVisibleToDriver(directToMe, 'drv-101'), true);
  assert.equal(isAlertVisibleToDriver(directToOther, 'drv-101'), false);
  assert.equal(isAlertVisibleToDriver(dispatchInternal, 'drv-101'), false);
  assert.equal(isAlertVisibleToDriver(dismissedAlert, 'drv-101'), false);

  const filtered = filterAlertsForDriver(
    [broadcastAlert, directToMe, directToOther, dispatchInternal, dismissedAlert],
    'drv-101'
  );
  assert.deepEqual(
    filtered.map((a) => a.id),
    ['alert-b1', 'alert-d1'],
    'Driver feed must include only broadcast + self-targeted non-dismissed, non-internal alerts'
  );

  // 3. Service subscribeForDriver & markDriverAlertRead (preserves dispatcher isRead)
  const sentBroadcast = await dispatchAlertsService.sendAlert({
    to: 'All Drivers',
    text: 'Phase 91 test broadcast',
    priority: 'urgent',
    targetDriverId: null,
  });
  const sentDirect = await dispatchAlertsService.sendAlert({
    to: 'Driver 101',
    text: 'Phase 91 direct alert',
    priority: 'normal',
    targetDriverId: 'drv-101',
  });
  const sentOther = await dispatchAlertsService.sendAlert({
    to: 'Driver 999',
    text: 'Phase 91 other driver alert',
    priority: 'normal',
    targetDriverId: 'drv-999',
  });
  assert.ok(sentBroadcast && sentDirect && sentOther);

  let latestForDrv101: DispatchAlertRecord[] = [];
  const unsub = dispatchAlertsService.subscribeForDriver('drv-101', (alerts) => {
    latestForDrv101 = alerts;
  });

  assert.ok(latestForDrv101.some((a) => a.id === sentBroadcast.id));
  assert.ok(latestForDrv101.some((a) => a.id === sentDirect.id));
  assert.ok(!latestForDrv101.some((a) => a.id === sentOther.id));
  assert.equal(isAlertReadByDriver(sentBroadcast, 'drv-101'), false);

  await dispatchAlertsService.markDriverAlertRead(sentBroadcast.id, 'drv-101');
  const updatedBroadcast = latestForDrv101.find((a) => a.id === sentBroadcast.id);
  assert.ok(updatedBroadcast, 'Updated broadcast should still be in driver feed');
  assert.equal(isAlertReadByDriver(updatedBroadcast, 'drv-101'), true);
  assert.equal(
    updatedBroadcast.isRead,
    false,
    'markDriverAlertRead must not mutate dispatcher-side isRead'
  );
  assert.equal(isAlertReadByDriver(updatedBroadcast, 'drv-999'), false);
  unsub();

  // 4. DriverMessagesPane render checks
  const emptyHtml = renderToStaticMarkup(
    React.createElement(DriverMessagesPane, {
      alerts: [],
      driverUid: 'drv-101',
      onMarkRead: () => {},
    })
  );
  assert.ok(emptyHtml.includes('No Dispatch Messages'), 'Empty state should render');

  const messagesHtml = renderToStaticMarkup(
    React.createElement(DriverMessagesPane, {
      alerts: [updatedBroadcast, sentDirect],
      driverUid: 'drv-101',
      onMarkRead: () => {},
    })
  );
  assert.ok(messagesHtml.includes('Broadcast'), 'Should render Broadcast badge');
  assert.ok(messagesHtml.includes('Direct'), 'Should render Direct badge');
  assert.ok(messagesHtml.includes('Urgent'), 'Should render Urgent badge');
  assert.ok(messagesHtml.includes('Acknowledged'), 'Read alert should show Acknowledged');
  assert.ok(messagesHtml.includes('Acknowledge'), 'Unread alert should show Acknowledge button');

  // 5. DriverProfilePane render checks (Earnings, Hours, Account)
  const sampleDriver: DriverProfile = {
    id: 'drv-101',
    name: 'Alex Mercer',
    phone: '(314) 555-0199',
    email: 'alex.mercer@chesterfieldtaxi.com',
    dutyStatus: 'on_duty',
    vehicleUnit: '12',
    vehicleTier: 'sedan',
    vehicleMake: 'Toyota',
    vehicleModel: 'Camry',
    vehicleColor: 'Silver',
    licensePlate: 'MO-91TX',
  };

  const baseProfileProps = {
    driver: sampleDriver,
    globalCommissionRate: 0.75,
    payoutHistory: [],
    completedTrips: [],
    scheduleConfig: DEFAULT_SCHEDULE,
    isScheduleDirty: false,
    newTimeOffStart: '',
    newTimeOffEnd: '',
    newTimeOffReason: '',
    isSavingSchedule: false,
    onToggleDay: () => {},
    onTimeChange: () => {},
    onSetNewTimeOffStart: () => {},
    onSetNewTimeOffEnd: () => {},
    onSetNewTimeOffReason: () => {},
    onAddTimeOff: () => {},
    onRemoveTimeOff: () => {},
    onSaveSchedule: () => {},
    preferredNavApp: 'google' as const,
    onChangeNavApp: () => {},
    onOpenVehiclePicker: () => {},
    onSignOut: () => {},
  };

  const earningsTabHtml = renderToStaticMarkup(
    React.createElement(DriverProfilePane, { ...baseProfileProps, subTab: 'earnings' })
  );
  assert.ok(earningsTabHtml.includes('Earnings &amp; Settlement History'));

  const hoursTabHtml = renderToStaticMarkup(
    React.createElement(DriverProfilePane, { ...baseProfileProps, subTab: 'hours' })
  );
  assert.ok(hoursTabHtml.includes('Availability &amp; Working Hours'));

  const accountTabHtml = renderToStaticMarkup(
    React.createElement(DriverProfilePane, { ...baseProfileProps, subTab: 'account' })
  );
  assert.ok(accountTabHtml.includes('Alex Mercer'));
  assert.ok(accountTabHtml.includes('Car #12'));
  assert.ok(accountTabHtml.includes('Preferred Navigation App'));
  assert.ok(accountTabHtml.includes('Sign Out'));

  // 6. Firestore rules check
  const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  assert.ok(
    rulesText.includes('match /dispatch_alerts/{alertId}') &&
      rulesText.includes("affectedKeys().hasOnly(['readBy', 'updatedAt'])"),
    'firestore.rules must allow driver read & readBy-only update on dispatch_alerts'
  );

  console.log('Phase 91 verification passed: all assertions succeeded.');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
