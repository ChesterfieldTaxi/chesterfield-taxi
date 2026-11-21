/**
 * Driver Domain Service
 *
 * Manages Driver profiles, shift state (on_duty, off_duty, on_break),
 * active fleet vehicle assignment, atomic offer accept/decline,
 * step-by-step trip transitions, and canonical breakdown-synced meter extras.
 */

import { collection, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from './firebase';
import { sanitizePayload } from './firestore-sanitizer';
import type {
  DriverProfile,
  DriverDutyStatus,
  DriverMeterExtra,
  DriverScheduleConfig,
} from '../types/driver';
import type { DriverTelemetryPing, PriceLineItem, Trip, TripStatus } from '../types/trip';
import { getBookingService } from './booking';
import { getOperatorService } from './operator.service';
import { getWorkspaceBus } from './workspace-bus.service';

const DRIVERS_STORAGE_KEY = 'chesterfield_active_driver_profile';

export const DEFAULT_SCHEDULE: DriverScheduleConfig = {
  weeklyHours: {
    mon: { enabled: true, startHour: '07:00', endHour: '17:00' },
    tue: { enabled: true, startHour: '07:00', endHour: '17:00' },
    wed: { enabled: true, startHour: '07:00', endHour: '17:00' },
    thu: { enabled: true, startHour: '07:00', endHour: '17:00' },
    fri: { enabled: true, startHour: '07:00', endHour: '19:00' },
    sat: { enabled: true, startHour: '08:00', endHour: '16:00' },
    sun: { enabled: false, startHour: '08:00', endHour: '14:00' },
  },
  timeOffList: [],
};

// Kept empty in client bundles so production driver UIDs/phones are never shipped in JS
export const DEFAULT_DRIVERS: DriverProfile[] = [];

export class DriverService {
  private activeDriverId: string = '';
  private driverListeners = new Set<(driver: DriverProfile) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedId = localStorage.getItem('chesterfield_current_driver_id');
        if (savedId) this.activeDriverId = savedId;
      } catch {}
    }
  }

  public getActiveDriverId(): string {
    return this.activeDriverId;
  }

  public setActiveDriverId(driverId: string): void {
    this.activeDriverId = driverId;
    if (typeof window !== 'undefined') {
      try {
        if (driverId) {
          localStorage.setItem('chesterfield_current_driver_id', driverId);
        } else {
          localStorage.removeItem('chesterfield_current_driver_id');
        }
      } catch {}
    }
  }

  public async getDriverProfile(driverId?: string): Promise<DriverProfile> {
    const id = (driverId || this.activeDriverId || '').trim();
    if (!id) {
      throw new Error('No authenticated driver ID is bound.');
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as DriverProfile;
          return {
            ...data,
            id,
            schedule: data.schedule || DEFAULT_SCHEDULE,
          };
        }

        // Hydrate from `/users/{id}` if driver profile hasn't been initialized yet
        const userRef = doc(db, 'users', id);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.data();
          const firstName = uData.firstName || (uData.displayName ? uData.displayName.split(' ')[0] : '');
          const lastName = uData.lastName || (uData.displayName ? uData.displayName.split(' ').slice(1).join(' ') : '');
          const cabNumber =
            uData.cabNumber ||
            (uData.assignedUnit ? uData.assignedUnit.match(/#?(\d+)/)?.[1] || uData.assignedUnit : '');
          const username = uData.username || '';

          return {
            id,
            name: uData.displayName || uData.name || uData.email?.split('@')[0] || 'Driver',
            firstName,
            lastName,
            email: uData.email,
            cabNumber,
            username,
            phone: uData.phone || '',
            dutyStatus: (uData.status === 'suspended' ? 'off_duty' : 'off_duty') as DriverDutyStatus,
            vehicleUnit: uData.assignedUnit ? String(uData.assignedUnit).replace(/^Cab\s*#?/i, 'Car #') : (cabNumber ? `Car #${cabNumber}` : ''),
            vehicleTier: uData.vehicleTier || 'standard',
            commissionRate:
              typeof uData.commissionRate === 'number' ? uData.commissionRate : undefined,
            zone: uData.status === 'suspended' ? 'Suspended' : 'Chesterfield Valley',
            schedule: DEFAULT_SCHEDULE,
            driverScore: uData.driverScore || 95,
            isBlacklisted: Boolean(uData.isBlacklisted),
            isArchived: Boolean(uData.isArchived),
            blacklistReason: uData.blacklistReason,
          };
        }
      } catch (e) {
        console.warn('[DriverService] Error loading driver from Firestore, using fallback:', e);
      }
    }

    // Check OperatorService cache/defaults
    const op = getOperatorService().getOperatorById(id);
    if (op) {
      return {
        id: op.uid,
        name: op.displayName || op.email.split('@')[0],
        firstName: op.firstName,
        lastName: op.lastName,
        email: op.email,
        cabNumber: op.cabNumber,
        username: op.username,
        phone: op.phone || '',
        dutyStatus: (op.status === 'suspended' ? 'off_duty' : 'on_duty') as DriverDutyStatus,
        vehicleUnit: op.assignedUnit ? String(op.assignedUnit).replace(/^Cab\s*#?/i, 'Car #') : (op.cabNumber ? `Car #${op.cabNumber}` : ''),
        vehicleTier: 'standard',
        zone: op.status === 'suspended' ? 'Suspended' : 'Chesterfield Valley',
        schedule: DEFAULT_SCHEDULE,
        driverScore: op.driverScore || 95,
        isBlacklisted: Boolean(op.isBlacklisted),
        isArchived: Boolean(op.isArchived),
        blacklistReason: op.blacklistReason,
      };
    }

    // Check LocalStorage fallback
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRIVERS_STORAGE_KEY + '_' + id);
        if (saved) return JSON.parse(saved);
      } catch {}
    }

    return {
      id,
      name: 'Driver',
      phone: '',
      dutyStatus: 'off_duty',
      vehicleUnit: '',
      vehicleTier: 'standard',
      zone: 'Chesterfield Valley',
      schedule: DEFAULT_SCHEDULE,
    };
  }

  public async setDutyStatus(status: DriverDutyStatus, driverId?: string): Promise<DriverProfile> {
    const id = driverId || this.activeDriverId;
    const current = await this.getDriverProfile(id);

    if (status === 'on_duty' && (current.isBlacklisted || current.isArchived)) {
      throw new Error(
        `Shift activation rejected: Driver profile is ${current.isBlacklisted ? 'blacklisted' : 'archived'}${
          current.blacklistReason ? ' (' + current.blacklistReason + ')' : ''
        }`
      );
    }

    const updated: DriverProfile = {
      ...current,
      dutyStatus: status,
      lastActiveAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', id);
        await setDoc(ref, sanitizePayload(updated), { merge: true });
      } catch (e) {
        console.warn('[DriverService] Error updating duty status in Firestore:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DRIVERS_STORAGE_KEY + '_' + id, JSON.stringify(updated));
      } catch {}
    }

    // Cross-device Firestore shift tracking (prevents duplicate shifts on on_break -> on_duty)
    try {
      const { getVehicleAssignmentService } = await import('./fleet/vehicle-assignment.service');
      const assignmentService = getVehicleAssignmentService();

      if (status === 'off_duty') {
        await assignmentService.endAllActiveShiftsForDriver(id);
        if (typeof window !== 'undefined') localStorage.removeItem('active_shift_id_' + id);
      } else if (status === 'on_duty' && updated.vehicleUnit) {
        const vehId = updated.vehicleId || `unit-${updated.vehicleUnit.replace(/\D/g, '') || id}`;
        const shift = await assignmentService.startShift(id, vehId, updated.vehicleUnit);
        if (typeof window !== 'undefined') localStorage.setItem('active_shift_id_' + id, shift.id);
      }
    } catch (err) {
      console.warn('[DriverService] Shift tracking sync warning:', err);
    }

    this.notifyDriverListeners(updated);
    try {
      getWorkspaceBus().publish('DRIVER_STATUS_UPDATE', {
        driverId: id,
        cabNumber: updated.cabNumber || updated.vehicleUnit,
        status: status === 'on_break' ? 'break' : status === 'off_duty' ? 'offline' : 'available',
        dutyStatus: status,
      });
    } catch {}
    return updated;
  }

  public async setVehicleUnit(
    vehicleUnit: string,
    vehicleId?: string,
    driverId?: string,
    vehicleMeta?: {
      vehicleTier?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      licensePlate?: string;
    }
  ): Promise<DriverProfile> {
    const id = driverId || this.activeDriverId;
    const current = await this.getDriverProfile(id);
    if (current.isBlacklisted || current.isArchived) {
      throw new Error(
        `Vehicle selection rejected: Driver profile is ${current.isBlacklisted ? 'blacklisted' : 'archived'}`
      );
    }

    const cabDigits = vehicleUnit.match(/#?(\d+)/)?.[1] || current.cabNumber;
    const updated: DriverProfile = {
      ...current,
      vehicleUnit,
      cabNumber: cabDigits,
      vehicleId: vehicleId || current.vehicleId,
      vehicleTier: vehicleMeta?.vehicleTier || current.vehicleTier,
      vehicleMake: vehicleMeta?.vehicleMake ?? current.vehicleMake,
      vehicleModel: vehicleMeta?.vehicleModel ?? current.vehicleModel,
      vehicleColor: vehicleMeta?.vehicleColor ?? current.vehicleColor,
      licensePlate: vehicleMeta?.licensePlate ?? current.licensePlate,
      lastActiveAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', id);
        await setDoc(ref, sanitizePayload(updated), { merge: true });
      } catch (e) {
        console.warn('[DriverService] Error updating vehicle unit in Firestore:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DRIVERS_STORAGE_KEY + '_' + id, JSON.stringify(updated));
      } catch {}
    }

    if (current.dutyStatus === 'on_duty' || current.dutyStatus === 'on_break') {
      try {
        const { getVehicleAssignmentService } = await import('./fleet/vehicle-assignment.service');
        const assignmentService = getVehicleAssignmentService();
        const vehId = vehicleId || `unit-${vehicleUnit.replace(/\D/g, '') || id}`;
        const shift = await assignmentService.startShift(id, vehId, vehicleUnit);
        if (typeof window !== 'undefined') localStorage.setItem('active_shift_id_' + id, shift.id);
      } catch (e) {
        console.warn('[DriverService] Error rotating active shift for new vehicle:', e);
      }
    }

    this.notifyDriverListeners(updated);
    return updated;
  }

  public async updateSchedule(schedule: DriverScheduleConfig, driverId?: string): Promise<DriverProfile> {
    const id = driverId || this.activeDriverId;
    const current = await this.getDriverProfile(id);
    const updated: DriverProfile = {
      ...current,
      schedule,
      lastActiveAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', id);
        await setDoc(ref, sanitizePayload(updated), { merge: true });
      } catch (e) {
        console.warn('[DriverService] Error updating schedule in Firestore:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DRIVERS_STORAGE_KEY + '_' + id, JSON.stringify(updated));
      } catch {}
    }

    this.notifyDriverListeners(updated);
    return updated;
  }

  public subscribeToDriver(driverId: string, onUpdate: (driver: DriverProfile) => void): () => void {
    if (!driverId) return () => {};

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', driverId);
        const unsub = onSnapshot(
          ref,
          (snap) => {
            if (snap.exists()) {
              onUpdate({ ...(snap.data() as DriverProfile), id: driverId });
            } else {
              this.getDriverProfile(driverId).then(onUpdate).catch(() => {});
            }
          },
          (err) => {
            console.warn('[DriverService] Snapshot error, loading profile fallback:', err);
            this.getDriverProfile(driverId).then(onUpdate).catch(() => {});
          }
        );
        return unsub;
      } catch (e) {
        console.warn('[DriverService] Snapshot subscribe failed, using local fallback:', e);
      }
    }

    this.driverListeners.add(onUpdate);
    this.getDriverProfile(driverId).then(onUpdate).catch(() => {});

    return () => {
      this.driverListeners.delete(onUpdate);
    };
  }

  private notifyDriverListeners(driver: DriverProfile) {
    for (const listener of this.driverListeners) {
      try {
        listener(driver);
      } catch (err) {
        console.error('[DriverService] Driver listener notification failed:', err);
      }
    }
  }

  /**
   * Atomically accept a broadcast/offered ride.
   */
  public async acceptOffer(tripId: string, driverId: string): Promise<Trip> {
    const bookingService = getBookingService();
    if (bookingService.acceptDriverOffer) {
      return await bookingService.acceptDriverOffer(tripId, driverId);
    }
    return await this.transitionTrip(tripId, 'assigned', driverId, 'Driver accepted offer');
  }

  /**
   * Atomically decline an offered ride without assigning the declining driver.
   */
  public async declineOffer(tripId: string, driverId: string, reason?: string): Promise<Trip> {
    const bookingService = getBookingService();
    if (bookingService.declineDriverOffer) {
      return await bookingService.declineDriverOffer(tripId, driverId, reason);
    }
    throw new Error('Booking service does not support offer declines.');
  }

  /**
   * Driver Step-by-Step Transition Action
   */
  public async transitionTrip(
    tripId: string,
    targetStatus: TripStatus,
    driverId: string,
    reason?: string
  ): Promise<Trip> {
    const bookingService = getBookingService();
    if (!bookingService.updateTripStatus) {
      throw new Error('Booking service does not support status updates.');
    }

    const updated = await bookingService.updateTripStatus(tripId, targetStatus, {
      actorRole: 'driver',
      assignedDriverId: driverId,
      reason: reason || 'Driver transitioned trip to ' + targetStatus,
    });

    if (targetStatus === 'completed') {
      try {
        const driverProfile = await this.getDriverProfile(driverId);
        const prevRatio = driverProfile.completionRatio || 100;
        const newRatio = Math.min(100, Number((prevRatio + 0.1).toFixed(1)));
        await this.updateDriverScore(driverId, { completionRatio: newRatio });
      } catch (err) {
        console.warn('Failed to update driver score', err);
      }
    }

    return updated;
  }

  public async updateDriverScore(driverId: string, scores: Partial<DriverProfile>): Promise<DriverProfile> {
    const current = await this.getDriverProfile(driverId);
    const updated = { ...current, ...scores };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', driverId);
        await setDoc(ref, sanitizePayload(updated), { merge: true });
      } catch (e) {
        console.warn('[DriverService] Error updating driver score:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DRIVERS_STORAGE_KEY + '_' + driverId, JSON.stringify(updated));
      } catch {}
    }
    this.notifyDriverListeners(updated);
    return updated;
  }

  /**
   * Append an in-cab extra fee (toll, parking, luggage, cleaning, custom) and
   * atomically sync `pricing.breakdown[]` so `sum(breakdown[].amount) === totalFare`.
   */
  public async addMeterExtra(tripId: string, extra: DriverMeterExtra): Promise<Trip> {
    const bookingService = getBookingService();
    const currentStatusRes = await bookingService.getBookingStatus(tripId);
    if (!currentStatusRes || !currentStatusRes.trip) {
      throw new Error('Trip ' + tripId + ' not found.');
    }

    const trip = currentStatusRes.trip;
    const cleanAmount = Number(Number(extra.amount || 0).toFixed(2));
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      throw new Error('Extra fee amount must be greater than $0.00.');
    }

    const cleanExtra: DriverMeterExtra = {
      ...extra,
      name: extra.name.trim() || 'In-Car Extra',
      amount: cleanAmount,
    };

    const currentExtras = trip.pricing.driverExtras || [];
    const updatedExtras = [...currentExtras, cleanExtra];
    const driverExtrasTotal = Number(
      updatedExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
    );

    const baseTotalWithoutDriverExtras = Number(
      (trip.pricing.totalFare - (trip.pricing.driverExtrasTotal || 0)).toFixed(2)
    );
    const newTotalFare = Number((baseTotalWithoutDriverExtras + driverExtrasTotal).toFixed(2));

    // Preserve canonical breakdown invariant
    const existingBreakdown: PriceLineItem[] = Array.isArray(trip.pricing.breakdown) && trip.pricing.breakdown.length > 0
      ? [...trip.pricing.breakdown]
      : [
          {
            id: 'base-quoted-fare',
            label: 'Base Fare',
            amount: baseTotalWithoutDriverExtras,
            category: 'base',
          },
        ];

    const extraLineItem: PriceLineItem = {
      id: `driver-extra-${cleanExtra.id}`,
      label: cleanExtra.name,
      amount: cleanExtra.amount,
      category: cleanExtra.category === 'toll' ? 'surcharge' : 'extra',
      detail: cleanExtra.category === 'toll' ? 'In-Car Toll' : `In-Car ${cleanExtra.category}`,
    };

    const updatedPricing = {
      ...trip.pricing,
      driverExtras: updatedExtras,
      driverExtrasTotal,
      totalFare: newTotalFare,
      breakdown: [...existingBreakdown, extraLineItem],
    };

    if (bookingService.updateTrip) {
      return await bookingService.updateTrip(tripId, {
        pricing: updatedPricing,
        meterExtras: updatedExtras,
      });
    }

    return trip;
  }

  /**
   * Persist live taximeter metrics on a metered trip while preserving pre-booked extras,
   * surcharges, discounts, and canonical `pricing.breakdown[]`.
   */
  public async updateLiveMeter(
    tripId: string,
    meterDistanceMiles: number,
    meterDurationMinutes: number,
    meterCalculatedFare: number,
    options?: { lockQuotedFare?: boolean }
  ): Promise<Trip> {
    const bookingService = getBookingService();
    const currentStatusRes = await bookingService.getBookingStatus(tripId);
    if (!currentStatusRes || !currentStatusRes.trip) {
      throw new Error('Trip ' + tripId + ' not found.');
    }

    const trip = currentStatusRes.trip;
    const driverExtrasTotal = trip.pricing.driverExtrasTotal || 0;

    // Decision #2: For upfront quoted / flat-corridor trips, never overwrite the locked quoted fare
    if (options?.lockQuotedFare) {
      const updatedPricing = {
        ...trip.pricing,
        meterDistanceMiles,
        meterDurationMinutes,
      };
      if (bookingService.updateTrip) {
        return await bookingService.updateTrip(tripId, { pricing: updatedPricing });
      }
      return trip;
    }

    // Metered trip: keep non-base items (extras/surcharges/discounts/driver extras) intact
    const existingBreakdown = Array.isArray(trip.pricing.breakdown) ? trip.pricing.breakdown : [];
    const preservedNonBaseItems = existingBreakdown.filter(
      (item) => item.category !== 'base' && item.category !== 'rounding'
    );
    const preservedNonBaseSum = Number(
      preservedNonBaseItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2)
    );

    const hasDriverExtrasInBreakdown = preservedNonBaseItems.some((i) =>
      i.id.startsWith('driver-extra-')
    );
    const unrepresentedDriverExtras = hasDriverExtrasInBreakdown ? 0 : driverExtrasTotal;

    const cleanMeterFare = Number(meterCalculatedFare.toFixed(2));
    const finalFare = Number(
      Math.max(0, cleanMeterFare + preservedNonBaseSum + unrepresentedDriverExtras).toFixed(2)
    );

    const updatedBreakdown: PriceLineItem[] = [
      {
        id: 'metered-base-fare',
        label: 'Base Fare',
        amount: cleanMeterFare,
        category: 'base',
        detail: `${meterDistanceMiles.toFixed(2)} mi · ${meterDurationMinutes.toFixed(1)} min`,
      },
      ...preservedNonBaseItems,
    ];

    const updatedPricing = {
      ...trip.pricing,
      meterDistanceMiles,
      meterDurationMinutes,
      meterCalculatedFare: cleanMeterFare,
      totalFare: finalFare,
      breakdown: updatedBreakdown,
    };

    if (bookingService.updateTrip) {
      return await bookingService.updateTrip(tripId, {
        pricing: updatedPricing,
      });
    }

    return trip;
  }

  /**
   * Persist a live GPS telemetry fix to `drivers/{driverId}` so Dispatch can track
   * Available, En Route, Arrived/In Progress, and On-Break drivers continuously.
   */
  public async updateDriverLocation(
    driverId: string,
    ping: DriverTelemetryPing
  ): Promise<void> {
    if (!driverId || !ping?.coordinates) return;

    const payload = {
      id: driverId,
      currentLocation: ping,
      locationUpdatedAt: ping.timestamp || new Date().toISOString(),
      lastActiveAt: ping.timestamp || new Date().toISOString(),
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', driverId);
        await setDoc(ref, sanitizePayload(payload), { merge: true });
      } catch (e) {
        console.warn('[DriverService] Failed to write driver GPS telemetry to Firestore:', e);
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const key = DRIVERS_STORAGE_KEY + '_' + driverId;
        const raw = localStorage.getItem(key);
        const existing = raw ? JSON.parse(raw) : { id: driverId };
        localStorage.setItem(key, JSON.stringify({ ...existing, ...payload }));
      } catch {}
    }
  }

  /**
   * Real-time subscription to ALL driver operational profiles (`drivers` collection),
   * delivering live `dutyStatus` (`on_duty | on_break | off_duty`) and `currentLocation`.
   */
  public subscribeToAllDrivers(
    callback: (profiles: Record<string, DriverProfile>) => void
  ): () => void {
    const readLocalMap = (): Record<string, DriverProfile> => {
      const map: Record<string, DriverProfile> = {};
      if (typeof window === 'undefined') return map;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(DRIVERS_STORAGE_KEY + '_')) {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            if (parsed?.id) map[parsed.id] = parsed;
          }
        }
      } catch {}
      return map;
    };

    callback(readLocalMap());

    if (!isFirebaseConfigured()) {
      return () => {};
    }

    try {
      const db = getFirestoreDb();
      const unsub = onSnapshot(
        collection(db, 'drivers'),
        (snapshot) => {
          const profiles: Record<string, DriverProfile> = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Partial<DriverProfile>;
            profiles[docSnap.id] = {
              ...(data as DriverProfile),
              id: docSnap.id,
            };
          });
          callback(profiles);
        },
        (err) => {
          console.warn('[DriverService] subscribeToAllDrivers snapshot error:', err);
        }
      );
      return unsub;
    } catch (e) {
      console.warn('[DriverService] Failed to subscribe to drivers collection:', e);
      return () => {};
    }
  }
}

let driverServiceInstance: DriverService | null = null;

export function getDriverService(): DriverService {
  if (!driverServiceInstance) {
    driverServiceInstance = new DriverService();
  }
  return driverServiceInstance;
}
