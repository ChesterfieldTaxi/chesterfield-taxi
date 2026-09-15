import { collection, doc, getDoc, setDoc, query, where, getDocs, orderBy } from 'firebase/firestore';
import { getFirestoreDb, isFirebaseConfigured } from '../firebase';
import type { VehicleAssignmentShift } from '../../types/driver';

export class VehicleAssignmentService {
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

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`shift_${shift.id}`, JSON.stringify(shift));
      } catch {}
    }

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

    if (!shift && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(`shift_${shiftId}`);
        if (raw) shift = JSON.parse(raw);
      } catch {}
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

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`shift_${shiftId}`, JSON.stringify(shift));
      } catch {}
    }
  }

  /**
   * Lookup which driver operated a vehicle at a specific timestamp.
   */
  async getDriverForVehicleAtTime(vehicleId: string, timestamp: string): Promise<VehicleAssignmentShift | null> {
    if (isFirebaseConfigured()) {
      try {
        const db = getFirestoreDb();
        const q = query(
          collection(db, 'vehicleAssignments'),
          where('vehicleId', '==', vehicleId),
          where('startedAt', '<=', timestamp)
        );
        const snap = await getDocs(q);
        const shifts = snap.docs.map(d => d.data() as VehicleAssignmentShift);
        
        // Find the shift that was active at the given timestamp
        for (const shift of shifts) {
          if (!shift.endedAt || shift.endedAt >= timestamp) {
            return shift;
          }
        }
      } catch (e) {
        console.warn('[VehicleAssignmentService] Query failed:', e);
      }
    }
    return null; // Local mock query not implemented for brevity
  }
}

let instance: VehicleAssignmentService | null = null;
export function getVehicleAssignmentService(): VehicleAssignmentService {
  if (!instance) {
    instance = new VehicleAssignmentService();
  }
  return instance;
}
