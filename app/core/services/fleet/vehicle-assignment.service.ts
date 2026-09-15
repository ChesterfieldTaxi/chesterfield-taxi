import { collection, doc, getDoc, setDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import type { VehicleAssignmentShift } from '../../types/driver';

const DEMO_SHIFTS_KEY = 'chesterfield_demo_shifts_v1';

const DEFAULT_DEMO_SHIFTS: VehicleAssignmentShift[] = [
  {
    id: 'shift-demo-1',
    driverId: 'drv-101',
    vehicleId: 'veh-204',
    vehicleNumber: 'Cab #204',
    startedAt: '2026-09-14T06:00:00.000Z',
    endedAt: '2026-09-14T14:30:00.000Z',
    status: 'completed',
  },
  {
    id: 'shift-demo-2',
    driverId: 'drv-102',
    vehicleId: 'veh-204',
    vehicleNumber: 'Cab #204',
    startedAt: '2026-09-14T15:00:00.000Z',
    status: 'active',
  },
  {
    id: 'shift-demo-3',
    driverId: 'drv-103',
    vehicleId: 'veh-301',
    vehicleNumber: 'Cab #301',
    startedAt: '2026-09-14T07:00:00.000Z',
    endedAt: '2026-09-14T17:00:00.000Z',
    status: 'completed',
  },
  {
    id: 'shift-demo-4',
    driverId: 'drv-101',
    vehicleId: 'veh-102',
    vehicleNumber: 'Cab #102',
    startedAt: '2026-09-13T08:00:00.000Z',
    endedAt: '2026-09-13T16:00:00.000Z',
    status: 'completed',
  },
];

export class VehicleAssignmentService {
  private getLocalShifts(): VehicleAssignmentShift[] {
    if (typeof window === 'undefined') return [...DEFAULT_DEMO_SHIFTS];
    try {
      const raw = localStorage.getItem(DEMO_SHIFTS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [...DEFAULT_DEMO_SHIFTS];
  }

  private saveLocalShift(shift: VehicleAssignmentShift) {
    if (typeof window === 'undefined') return;
    try {
      const shifts = this.getLocalShifts();
      const idx = shifts.findIndex(s => s.id === shift.id);
      if (idx >= 0) {
        shifts[idx] = shift;
      } else {
        shifts.unshift(shift);
      }
      localStorage.setItem(DEMO_SHIFTS_KEY, JSON.stringify(shifts));
    } catch {}
  }

  /**
   * Start a new shift session for a driver and vehicle.
   */
  async startShift(driverId: string, vehicleId: string, vehicleNumber: string): Promise<VehicleAssignmentShift> {
    const shift: VehicleAssignmentShift = {
      id: `shift-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      driverId,
      vehicleId,
      vehicleNumber,
      startedAt: new Date().toISOString(),
      status: 'active'
    };

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'vehicleAssignments', shift.id);
        await setDoc(ref, shift);
      } catch (e) {
        console.warn('[VehicleAssignmentService] Failed to save shift to Firestore:', e);
      }
    }

    this.saveLocalShift(shift);
    return shift;
  }

  /**
   * End an active shift session.
   */
  async endShift(shiftId: string): Promise<void> {
    let shift: VehicleAssignmentShift | null = null;

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'vehicleAssignments', shiftId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          shift = snap.data() as VehicleAssignmentShift;
        }
      } catch (e) {
        console.warn('[VehicleAssignmentService] Failed to read shift from Firestore:', e);
      }
    }

    if (!shift) {
      const localShifts = this.getLocalShifts();
      shift = localShifts.find(s => s.id === shiftId) || null;
    }

    if (!shift) {
      throw new Error(`Shift ${shiftId} not found`);
    }

    shift.endedAt = new Date().toISOString();
    shift.status = 'completed';

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const ref = doc(db, 'vehicleAssignments', shiftId);
        await setDoc(ref, shift, { merge: true });
      } catch (e) {
        console.warn('[VehicleAssignmentService] Failed to update shift in Firestore:', e);
      }
    }

    this.saveLocalShift(shift);
  }

  /**
   * Bidirectional Temporal Query: Lookup which driver operated a vehicle at a specific timestamp.
   */
  async getDriverForVehicleAtTime(vehicleIdOrNumber: string, timestamp: string): Promise<VehicleAssignmentShift | null> {
    const norm = vehicleIdOrNumber.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const q = query(
          collection(db, 'vehicleAssignments'),
          where('startedAt', '<=', timestamp)
        );
        const snap = await getDocs(q);
        const shifts = snap.docs.map(d => d.data() as VehicleAssignmentShift);
        
        for (const shift of shifts) {
          const shiftVehIdNorm = shift.vehicleId.toLowerCase().replace(/[^a-z0-9]/g, '');
          const shiftVehNumNorm = shift.vehicleNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (shiftVehIdNorm === norm || shiftVehNumNorm.includes(norm) || norm.includes(shiftVehNumNorm)) {
            if (!shift.endedAt || shift.endedAt >= timestamp) {
              return shift;
            }
          }
        }
      } catch (e) {
        console.warn('[VehicleAssignmentService] Firestore query failed:', e);
      }
    }

    // Local fallback
    const local = this.getLocalShifts();
    for (const shift of local) {
      const shiftVehIdNorm = shift.vehicleId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const shiftVehNumNorm = shift.vehicleNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (shiftVehIdNorm === norm || shiftVehNumNorm.includes(norm) || norm.includes(shiftVehNumNorm)) {
        if (shift.startedAt <= timestamp && (!shift.endedAt || shift.endedAt >= timestamp)) {
          return shift;
        }
      }
    }

    return null;
  }

  /**
   * Bidirectional Temporal Query: List all vehicles operated by a specific driver.
   */
  async getVehiclesOperatedByDriver(driverId: string): Promise<VehicleAssignmentShift[]> {
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const q = query(
          collection(db, 'vehicleAssignments'),
          where('driverId', '==', driverId)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => d.data() as VehicleAssignmentShift);
      } catch (e) {
        console.warn('[VehicleAssignmentService] getVehiclesOperatedByDriver failed:', e);
      }
    }

    const local = this.getLocalShifts();
    return local.filter(s => s.driverId === driverId);
  }

  /**
   * Query shifts for a specific vehicle within a date window.
   */
  async getShiftsForVehicle(
    vehicleIdOrNumber: string,
    startDate?: string,
    endDate?: string
  ): Promise<VehicleAssignmentShift[]> {
    const norm = vehicleIdOrNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    let allShifts: VehicleAssignmentShift[] = [];

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const snap = await getDocs(collection(db, 'vehicleAssignments'));
        allShifts = snap.docs.map(d => d.data() as VehicleAssignmentShift);
      } catch (e) {
        console.warn('[VehicleAssignmentService] getShiftsForVehicle failed:', e);
        allShifts = this.getLocalShifts();
      }
    } else {
      allShifts = this.getLocalShifts();
    }

    return allShifts.filter(shift => {
      const shiftVehIdNorm = shift.vehicleId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const shiftVehNumNorm = shift.vehicleNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
      const matchVehicle = !norm || shiftVehIdNorm === norm || shiftVehNumNorm.includes(norm) || norm.includes(shiftVehNumNorm);
      if (!matchVehicle) return false;

      if (startDate && shift.startedAt < startDate) return false;
      if (endDate && shift.startedAt > endDate) return false;

      return true;
    }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  /**
   * Retrieve all recorded shifts with optional limit.
   */
  async getAllShifts(limitCount = 50): Promise<VehicleAssignmentShift[]> {
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const snap = await getDocs(collection(db, 'vehicleAssignments'));
        const shifts = snap.docs.map(d => d.data() as VehicleAssignmentShift);
        if (shifts.length > 0) {
          return shifts.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, limitCount);
        }
      } catch (e) {
        console.warn('[VehicleAssignmentService] getAllShifts failed:', e);
      }
    }

    const local = this.getLocalShifts();
    return local.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, limitCount);
  }
}

let instance: VehicleAssignmentService | null = null;
export function getVehicleAssignmentService(): VehicleAssignmentService {
  if (!instance) {
    instance = new VehicleAssignmentService();
  }
  return instance;
}
