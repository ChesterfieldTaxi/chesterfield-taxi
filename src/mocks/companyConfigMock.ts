// Mock company configuration for development
// This will be replaced with Firestore data in production

import type { CompanyConfig } from '../types/companyConfig';

export const mockCompanyConfig: CompanyConfig = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),

    businessInfo: {
        legalName: 'Chesterfield Taxi Service LLC',
        displayName: 'Chesterfield Taxi',
        tagline: 'Your Reliable Ride, Anytime',
        founded: '2020'
    },

    contactInfo: {
        phone: {
            display: '(314) 738-0100',
            dialable: '+13147380100',
            sms: true
        },
        email: {
            general: 'info@chesterfieldtaxi.com',
            support: 'support@chesterfieldtaxi.com',
            booking: 'bookings@chesterfieldtaxi.com'
        },
        address: {
            street: '123 Main Street',
            city: 'Chesterfield',
            state: 'MO',
            zip: '63017',
            country: 'USA',
            mapUrl: 'https://maps.google.com/?q=Chesterfield+MO'
        },
        social: {
            facebook: 'https://facebook.com/chesterfieldtaxi',
            instagram: 'https://instagram.com/chesterfieldtaxi'
        }
    },

    operatingHours: {
        timezone: 'America/Chicago',
        is24Hours: true,
        notes: '24/7 service available for your convenience'
    },

    serviceArea: {
        primaryCity: 'Chesterfield',
        primaryState: 'Missouri',
        serviceRadius: 50
    },

    bookingLimits: {
        passengers: {
            min: 1,
            max: 7,
            largeGroupThreshold: 7
        },
        luggage: {
            min: 0,
            max: 7
        },
        carSeats: {
            min: 0,
            max: 4,
            maxTotal: 4
        },
        stops: {
            min: 0,
            max: 4
        },
        advanceBooking: {
            minHoursInAdvance: 0,
            maxDaysInAdvance: 90
        },
        operatingHours: {
            enforceBusinessHours: false,
            allowOutsideHoursScheduling: true,
            blockSameDayAfterHour: null
        }
    }
};
