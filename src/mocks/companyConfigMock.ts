// Mock company configuration for development
// This will be replaced with Firestore data in production

import type { CompanyConfig } from '../types/companyConfig';

export const mockCompanyConfig: CompanyConfig = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),

    businessInfo: {
        legalName: 'Chesterfield Taxi and Car Service',
        displayName: 'Chesterfield Taxi and Car Service',
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
            general: 'info@chesterfieldcar.com',
            support: 'support@chesterfieldcar.com',
            booking: 'bookings@chesterfieldcar.com'
        },
        address: {
            street: '1814 Woodson Rd',
            city: 'Overland',
            state: 'MO',
            zip: '63114',
            country: 'USA',
            mapUrl: 'https://maps.google.com/?q=1814+Woodson+Rd+Overland+MO+63114'
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
    },

    pricing: {
        baseRate: 3.50,
        perMileRate: 2.50,
        minFare: 15.00,
        hourlyRate: 55.00,
        waitRatePerMinute: 0.50,
        airportFees: {
            pickup: 5.00,
            dropoff: 0.00,
            curbside: 0.00
        },
        vehicleMultipliers: {
            sedan: 1.0,
            suv: 1.5,
            minivan: 1.5,
            passenger_van: 2.0
        }
    },

    features: {
        enableGuestBooking: true,
        enableCareersPage: true,
        enableBlog: false,
        maintenanceMode: false
    },

    payment: {
        acceptedMethods: ['cash', 'credit_card', 'account'],
        depositRequired: false,
        depositPercentage: 0
    }
};
