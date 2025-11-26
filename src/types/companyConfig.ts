// Company Configuration Types

export interface CompanyConfig {
    version: string;
    lastUpdated: string;
    businessInfo: BusinessInfo;
    contactInfo: ContactInfo;
    operatingHours: OperatingHours;
    serviceArea: ServiceArea;
    bookingLimits: BookingLimits;
}

export interface BusinessInfo {
    legalName: string;
    displayName: string;
    tagline?: string;
    founded?: string;
}

export interface ContactInfo {
    phone: {
        display: string;      // "(314) 777-0797"
        dialable: string;      // "+13147770797"
        sms: boolean;
    };
    email: {
        general: string;       // "info@chesterfieldtaxi.com"
        support: string;       // "support@chesterfieldtaxi.com"
        booking: string;       // "bookings@chesterfieldtaxi.com"
    };
    address: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
        mapUrl?: string;
    };
    social?: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        linkedin?: string;
    };
}

export interface OperatingHours {
    timezone: string;         // "America/Chicago"
    is24Hours: boolean;
    notes: string;
}

export interface ServiceArea {
    primaryCity: string;
    primaryState: string;
    serviceRadius: number;    // miles
}

export interface BookingLimits {
    passengers: {
        min: number;
        max: number;
        largeGroupThreshold: number;
    };
    luggage: {
        min: number;
        max: number;
    };
    carSeats: {
        min: number;
        max: number;
        maxTotal: number;
    };
    stops: {
        min: number;
        max: number;
    };
    advanceBooking: {
        minHoursInAdvance: number;
        maxDaysInAdvance: number;
    };
    operatingHours: {
        enforceBusinessHours: boolean;
        allowOutsideHoursScheduling: boolean;
        blockSameDayAfterHour: number | null;
    };
}


