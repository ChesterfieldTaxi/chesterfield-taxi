/**
 * Booking Services Export & Factory
 */

import type { IBookingService } from '../booking-service';
import { FirebaseBookingService, type FirebaseClientConfig } from './firebase-booking.service';
import { MockBookingService } from './mock-booking.service';

export * from './firebase-booking.service';
export * from './mock-booking.service';

let defaultServiceInstance: IBookingService | null = null;

/**
 * Returns an IBookingService instance.
 * Automatically selects FirebaseBookingService when Firebase configuration exists,
 * otherwise falls back seamlessly to MockBookingService for local development and testing.
 */
export function getBookingService(options?: {
  forceMock?: boolean;
  firebaseConfig?: FirebaseClientConfig;
}): IBookingService {
  if (options?.forceMock) {
    return new MockBookingService();
  }

  if (defaultServiceInstance) {
    return defaultServiceInstance;
  }

  const hasFirebase = Boolean(
    options?.firebaseConfig?.apiKey ||
    process.env.VITE_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY
  );

  if (hasFirebase) {
    try {
      defaultServiceInstance = new FirebaseBookingService(options?.firebaseConfig);
      return defaultServiceInstance;
    } catch (err) {
      console.warn('[getBookingService] Failed to initialize FirebaseBookingService, falling back to MockBookingService:', err);
      defaultServiceInstance = new MockBookingService();
      return defaultServiceInstance;
    }
  }

  defaultServiceInstance = new MockBookingService();
  return defaultServiceInstance;
}
