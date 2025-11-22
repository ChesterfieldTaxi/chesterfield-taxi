/**
 * Booking Service API Abstraction Layer
 * 
 * This interface provides a stable API that remains unchanged even when
 * the backend implementation switches (e.g., localStorage → Firestore).
 * 
 * Current: LocalStorage implementation (for development/testing)
 * Future: Firestore implementation (production-ready)
 */

import type { BookingFormV3State } from '../../hooks/useBookingFormV3';

export interface BookingData extends Omit<BookingFormV3State, 'isNow'> {
  referenceNumber: string;
  status: 'pending' | 'confirmed' | 'assigned' | 'completed' | 'cancelled';
  submittedAt: Date;
  confirmedAt?: Date;
}

/**
 * Booking Service Interface
 * All implementations must conform to this contract
 */
export interface BookingService {
  /**
   * Submit a new booking request
   * @returns Reference number for tracking
   */
  submitBooking(data: Partial<BookingFormV3State>): Promise<{ referenceNumber: string }>;

  /**
   * Retrieve booking by reference number
   */
  getBooking(referenceNumber: string): Promise<BookingData | null>;

  /**
   * Get bookings by phone number (for tracking)
   */
  getBookingsByPhone(phone: string): Promise<BookingData[]>;
}

/**
 * Generate unique reference number
 * Format: YYYYMMDD-XXXX (e.g., 20251122-A3F9)
 */
const generateReferenceNumber = (): string => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${dateStr}-${random}`;
};

/**
 * LocalStorage Implementation (Development/Mock)
 * 
 * Stores bookings in browser localStorage for testing.
 * Persists across page reloads but limited to single browser.
 */
class LocalBookingService implements BookingService {
  private readonly STORAGE_KEY = 'chesterfield_bookings';

  async submitBooking(data: Partial<BookingFormV3State>): Promise<{ referenceNumber: string }> {
    const referenceNumber = generateReferenceNumber();

    const booking: BookingData = {
      ...data as BookingFormV3State,
      referenceNumber,
      status: 'pending',
      submittedAt: new Date(),
    };

    // Get existing bookings
    const bookings = this.getAllBookings();
    bookings.push(booking);

    // Save to localStorage
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(bookings));

    // Simulate network delay (realistic UX)
    await new Promise(resolve => setTimeout(resolve, 500));

    return { referenceNumber };
  }

  async getBooking(referenceNumber: string): Promise<BookingData | null> {
    const bookings = this.getAllBookings();
    return bookings.find(b => b.referenceNumber === referenceNumber) || null;
  }

  async getBookingsByPhone(phone: string): Promise<BookingData[]> {
    const bookings = this.getAllBookings();
    return bookings.filter(b => b.phone === phone);
  }

  private getAllBookings(): BookingData[] {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (!stored) return [];

    try {
      return JSON.parse(stored).map((b: any) => ({
        ...b,
        submittedAt: new Date(b.submittedAt),
        confirmedAt: b.confirmedAt ? new Date(b.confirmedAt) : undefined,
      }));
    } catch (error) {
      console.error('[BookingService] Failed to parse bookings:', error);
      return [];
    }
  }
}

/**
 * Firestore Implementation (Future - Production)
 * 
 * Uncomment and configure when ready to use Firebase.
 */
/*
import { collection, addDoc, getDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';

class FirestoreBookingService implements BookingService {
  private readonly COLLECTION = 'bookings';

  async submitBooking(data: Partial<BookingFormV3State>): Promise<{ referenceNumber: string }> {
    const referenceNumber = generateReferenceNumber();
    
    const booking: BookingData = {
      ...data as BookingFormV3State,
      referenceNumber,
      status: 'pending',
      submittedAt: new Date(),
    };

    await addDoc(collection(db, this.COLLECTION), booking);
    
    return { referenceNumber };
  }

  async getBooking(referenceNumber: string): Promise<BookingData | null> {
    const q = query(
      collection(db, this.COLLECTION),
      where('referenceNumber', '==', referenceNumber)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    return snapshot.docs[0].data() as BookingData;
  }

  async getBookingsByPhone(phone: string): Promise<BookingData[]> {
    const q = query(
      collection(db, this.COLLECTION),
      where('phone', '==', phone)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as BookingData);
  }
}
*/

/**
 * Active Service Instance
 * 
 * To switch from LocalStorage to Firestore:
 * 1. Uncomment FirestoreBookingService above
 * 2. Change this line to: `new FirestoreBookingService()`
 * 3. All components continue working unchanged!
 */
export const bookingService: BookingService = new LocalBookingService();
