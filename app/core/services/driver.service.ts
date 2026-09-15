/**
 * Driver Domain Service
 * 
 * Manages Driver profiles, shift state (on_duty, off_duty, on_break),
 * active vehicle assignment, step-by-step trip transitions,
 * and live meter extra fee attachments.
 */

import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from './firebase';
import { sanitizePayload } from './firestore-sanitizer';
import type { DriverProfile, DriverDutyStatus, DriverMeterExtra, DriverScheduleConfig, DayOfWeek } from '../types/driver';
import type { Trip, TripStatus } from '../types/trip';
import { getBookingService } from './booking';

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
  timeOffList: [
    {
      id: 'to-1',
      startDate: '2026-09-24',
      endDate: '2026-09-26',
      reason: 'Family event / Vacation',
      createdAt: '2026-09-10T12:00:00Z',
    },
  ],
};

export const DEFAULT_DRIVERS: DriverProfile[] = [
  {
    id: 'drv-101',
    name: 'Driver 101 (Mike T.)',
    phone: '(314) 555-0101',
    dutyStatus: 'on_duty',
    vehicleUnit: 'Cab #204 (Camry)',
    vehicleTier: 'standard',
    zone: 'Chesterfield Valley',
    schedule: DEFAULT_SCHEDULE,
  },
  {
    id: 'drv-104',
    name: 'Driver 104 (Sarah K.)',
    phone: '(314) 555-0104',
    dutyStatus: 'on_duty',
    vehicleUnit: 'Cab #301 (Suburban)',
    vehicleTier: 'xl',
    zone: 'Lambert Airport (STL)',
    schedule: DEFAULT_SCHEDULE,
  },
  {
    id: 'drv-108',
    name: 'Driver 108 (David R.)',
    phone: '(314) 555-0108',
    dutyStatus: 'on_duty',
    vehicleUnit: 'Cab #102 (Transit WAV)',
    vehicleTier: 'wheelchair',
    zone: 'Town and Country',
    schedule: DEFAULT_SCHEDULE,
  },
  {
    id: 'drv-112',
    name: 'Driver 112 (James W.)',
    phone: '(314) 555-0112',
    dutyStatus: 'off_duty',
    vehicleUnit: 'Cab #208 (Lincoln)',
    vehicleTier: 'premium',
    zone: 'Ballwin / Manchester',
    schedule: DEFAULT_SCHEDULE,
  },
];


export class DriverService {
  private activeDriverId: string = 'drv-101';
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
        localStorage.setItem('chesterfield_current_driver_id', driverId);
      } catch {}
    }
  }

  public async getDriverProfile(driverId?: string): Promise<DriverProfile> {
    const id = driverId || this.activeDriverId;
    
    // Check Firestore if configured
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          return snap.data() as DriverProfile;
        }
      } catch (e) {
        console.warn('[DriverService] Error loading driver from Firestore, using fallback:', e);
      }
    }

    // Check LocalStorage fallback
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(DRIVERS_STORAGE_KEY + '_' + id);
        if (saved) return JSON.parse(saved);
      } catch {}
    }

    const defaultProfile = DEFAULT_DRIVERS.find((d) => d.id === id) || {
      id,
      name: 'Driver ' + id,
      phone: '(314) 738-0100',
      dutyStatus: 'on_duty' as DriverDutyStatus,
      vehicleUnit: 'Cab #204',
      vehicleTier: 'standard',
      zone: 'Chesterfield',
    };

    return defaultProfile;
  }

  public async setDutyStatus(status: DriverDutyStatus, driverId?: string): Promise<DriverProfile> {
    const id = driverId || this.activeDriverId;
    const current = await this.getDriverProfile(id);
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
    
    // Shift Tracking Logic
    try {
      const { getVehicleAssignmentService } = await import('./fleet/vehicle-assignment.service');
      const assignmentService = getVehicleAssignmentService();
      
      // If toggling off_duty, end active shift if any is stored locally (simplified for now)
      if (status === 'off_duty') {
        const activeShiftId = typeof window !== 'undefined' ? localStorage.getItem('active_shift_id_' + id) : null;
        if (activeShiftId) {
          await assignmentService.endShift(activeShiftId);
          if (typeof window !== 'undefined') localStorage.removeItem('active_shift_id_' + id);
        }
      } else if (status === 'on_duty' && updated.vehicleUnit) {
         // Generate a mock vehicle ID for now, since we only have unit number string
         const shift = await assignmentService.startShift(id, 'veh-' + updated.vehicleUnit.replace(/\D/g, ''), updated.vehicleUnit);
         if (typeof window !== 'undefined') localStorage.setItem('active_shift_id_' + id, shift.id);
      }
    } catch (err) {
      console.warn('Failed to update vehicle assignment shift', err);
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
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'drivers', driverId);
        const unsub = onSnapshot(ref, (snap) => {
          if (snap.exists()) {
            onUpdate(snap.data() as DriverProfile);
          } else {
            this.getDriverProfile(driverId).then(onUpdate);
          }
        });
        return unsub;
      } catch (e) {
        console.warn('[DriverService] Snapshot subscribe failed, using local fallback:', e);
      }
    }

    this.driverListeners.add(onUpdate);
    this.getDriverProfile(driverId).then(onUpdate);

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
      reason: reason || ('Driver transitioned trip to ' + targetStatus),
    });
    
    // Update driver score if completed
    if (targetStatus === 'completed') {
      try {
        const driverProfile = await this.getDriverProfile(driverId);
        const prevRatio = driverProfile.completionRatio || 100;
        const newRatio = Math.min(100, prevRatio + 0.1); // Mock increment
        
        await this.updateDriverScore(driverId, { completionRatio: newRatio });
      } catch(err) {
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
   * Append an on-the-fly extra fee (toll, parking, luggage, cleaning) during in_progress
   */
  public async addMeterExtra(
    tripId: string,
    extra: DriverMeterExtra
  ): Promise<Trip> {
    const bookingService = getBookingService();
    const currentStatusRes = await bookingService.getBookingStatus(tripId);
    if (!currentStatusRes || !currentStatusRes.trip) {
      throw new Error('Trip ' + tripId + ' not found.');
    }

    const trip = currentStatusRes.trip;
    const currentExtras = trip.pricing.driverExtras || [];
    const updatedExtras = [...currentExtras, extra];
    const driverExtrasTotal = Number(
      updatedExtras.reduce((sum, item) => sum + item.amount, 0).toFixed(2)
    );

    // Recalculate total fare
    const baseTotal = trip.pricing.totalFare - (trip.pricing.driverExtrasTotal || 0);
    const newTotalFare = Number((baseTotal + driverExtrasTotal).toFixed(2));

    const updatedPricing = {
      ...trip.pricing,
      driverExtras: updatedExtras,
      driverExtrasTotal,
      totalFare: newTotalFare,
    };

    if (bookingService.updateTrip) {
      return await bookingService.updateTrip(tripId, {
        pricing: updatedPricing,
      });
    }

    return trip;
  }

  /**
   * Update live taximeter distance, time, and calculated fare
   */
  public async updateLiveMeter(
    tripId: string,
    meterDistanceMiles: number,
    meterDurationMinutes: number,
    meterCalculatedFare: number
  ): Promise<Trip> {
    const bookingService = getBookingService();
    const currentStatusRes = await bookingService.getBookingStatus(tripId);
    if (!currentStatusRes || !currentStatusRes.trip) {
      throw new Error('Trip ' + tripId + ' not found.');
    }

    const trip = currentStatusRes.trip;
    const extrasTotal = trip.pricing.driverExtrasTotal || 0;
    const finalFare = Number((meterCalculatedFare + extrasTotal).toFixed(2));

    const updatedPricing = {
      ...trip.pricing,
      meterDistanceMiles,
      meterDurationMinutes,
      meterCalculatedFare,
      totalFare: finalFare,
    };

    if (bookingService.updateTrip) {
      return await bookingService.updateTrip(tripId, {
        pricing: updatedPricing,
      });
    }

    return trip;
  }
}

let driverServiceInstance: DriverService | null = null;

export function getDriverService(): DriverService {
  if (!driverServiceInstance) {
    driverServiceInstance = new DriverService();
  }
  return driverServiceInstance;
}
