import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PaymentData } from '../components/booking_v3/payment_methods';
import { Location } from '../hooks/useBookingFormV3';

export interface BookingSubmission {
    // Trip Details
    serviceType: string;
    vehicleType: string;
    passengers: number;
    luggage: number;
    carSeats: {
        infant: number;
        toddler: number;
        booster: number;
    };

    // Route
    pickup: Location;
    dropoff: Location;
    stops: Location[];
    distanceInYards: number;
    durationInSeconds: number;

    // Timing
    date: string;
    time: string;
    isASAP: boolean;

    // Flight Info
    flightInfo?: {
        airline: string;
        flightNumber: string;
        origin?: string;
    };

    // Return Trip
    isReturnTrip: boolean;
    returnDetails?: {
        date: string;
        time: string;
        isWait: boolean;
        pickup: Location;
        dropoff: Location;
        stops: Location[];
        flightInfo?: {
            airline: string;
            flightNumber: string;
            origin?: string;
        };
    };

    // Contact & Payment
    contact: {
        name: string;
        phone: string;
        email: string;
        isGuestBooking: boolean;
        guestName?: string;
        guestPhone?: string;
        guestEmail?: string;
    };
    payment: PaymentData;

    // Metadata
    instructions: {
        driverNotes: string;
        gateCode: string;
    };
    pricing: {
        basePrice: number;
        extras: number;
        total: number;
    };
}

/**
 * Recursively removes undefined values from an object
 * Firestore does not support undefined values
 */
const sanitizeData = (data: any): any => {
    if (data === null || data === undefined) {
        return null;
    }
    if (Array.isArray(data)) {
        return data.map(sanitizeData);
    }
    if (typeof data === 'object' && !(data instanceof Date)) {
        return Object.entries(data).reduce((acc, [key, value]) => {
            const sanitizedValue = sanitizeData(value);
            if (sanitizedValue !== undefined) {
                acc[key] = sanitizedValue;
            }
            return acc;
        }, {} as any);
    }
    return data;
};

/**
 * Generates a unique booking reference number
 * Format: CHE-YYYYMMDD-XXXX (where XXXX is random alphanumeric)
 */
const generateBookingReference = (): string => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `CHE-${yyyy}${mm}${dd}-${random}`;
};

/**
 * Submits a new booking to Firestore
 * @param bookingData The complete booking object
 * @returns The generated booking reference number
 */
export const submitBooking = async (bookingData: BookingSubmission): Promise<string> => {
    try {
        const referenceNumber = generateBookingReference();

        const rawBookingRecord = {
            ...bookingData,
            referenceNumber,
            status: 'pending', // pending, confirmed, completed, cancelled
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // Add searchable fields
            searchKeywords: [
                referenceNumber,
                bookingData.contact.name.toLowerCase(),
                bookingData.contact.email.toLowerCase(),
                bookingData.contact.phone
            ]
        };

        // Sanitize data to remove undefined values
        const bookingRecord = sanitizeData(rawBookingRecord);

        const docRef = await addDoc(collection(db, 'bookings'), bookingRecord);
        console.log('Booking submitted with ID: ', docRef.id);

        return referenceNumber;
    } catch (error) {
        console.error('Error adding booking: ', error);
        throw new Error('Failed to submit booking. Please try again.');
    }
};
