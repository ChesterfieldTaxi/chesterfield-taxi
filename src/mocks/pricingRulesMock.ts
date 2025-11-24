// Mock pricing rules for development/testing
// This will be replaced with Firestore data in production

import type { PricingRules } from '../types/pricing';

export const mockPricingRules: PricingRules = {
    version: "2.0",
    lastUpdated: new Date().toISOString(),

    tripTypes: {
        airport_transfer: {
            name: "Airport Transfer",
            enabled: true,
            baseFee: 0,
            minimumFare: 28,
            distanceUnit: "yard",
            distancePerUnit: 176,
            distanceTiers: [
                {
                    from: 0,
                    to: 35200,
                    ratePerUnit: 0.255
                },
                {
                    from: 35200,
                    to: null,
                    ratePerUnit: 0.230
                }
            ],
            surcharges: [
                {
                    id: "airport_fee",
                    name: "Airport Pickup Surcharge",
                    type: "fixed",
                    amount: 5,
                    conditions: { pickupIsAirport: true }
                }
            ],
            waitTimeRate: {
                enabled: false,
                ratePerHour: 0,
                freeMinutes: 0
            }
        },

        point_to_point: {
            name: "Point-to-Point",
            enabled: true,
            baseFee: 3.5,
            minimumFare: 20,
            distanceUnit: "yard",
            distancePerUnit: 176,
            distanceTiers: [
                {
                    from: 0,
                    to: null,
                    ratePerUnit: 0.250
                }
            ],
            surcharges: [],
            waitTimeRate: {
                enabled: true,
                ratePerHour: 30,
                freeMinutes: 5
            }
        }
    },

    vehicleModifiers: {
        Sedan: {
            name: "Sedan",
            enabled: true,
            maxPassengers: 4,
            modifier: {
                type: "fixed",
                amount: 0
            }
        },
        SUV: {
            name: "SUV",
            enabled: true,
            maxPassengers: 4,
            modifier: {
                type: "fixed",
                amount: 10
            }
        },
        Minivan: {
            name: "Minivan",
            enabled: true,
            maxPassengers: 6,
            modifier: {
                type: "fixed",
                amount: 10
            }
        }
    },

    passengerFees: {
        basePassengers: 1,
        additionalPassengerFee: 1,
        maxPassengersWithoutUpgrade: 4
    },

    extraFees: {
        carSeats: {
            enabled: true,
            perSeatFee: 10,
            requiresMinivan: true,
            types: {
                infant: {
                    name: "Infant (0-1yr)",
                    enabled: true,
                    fee: 10
                },
                toddler: {
                    name: "Toddler (1-4yr)",
                    enabled: true,
                    fee: 10
                },
                booster: {
                    name: "Booster (4-8yr)",
                    enabled: true,
                    fee: 10
                }
            }
        },
        luggage: {
            enabled: false,
            baseLuggage: 2,
            additionalLuggageFee: 0
        }
    },

    specialRequests: {
        petFriendly: {
            name: "Pet-friendly",
            enabled: true,
            fee: 0,
            icon: "🐕"
        },
        wheelchair: {
            name: "Wheelchair accessible",
            enabled: true,
            fee: 0,
            requiresMinivan: true,
            icon: "♿"
        },
        quietRide: {
            name: "Quiet ride",
            enabled: true,
            fee: 0,
            icon: "🤫"
        },
        musicOk: {
            name: "Music OK",
            enabled: true,
            fee: 0,
            icon: "🎵"
        },
        gateCode: {
            name: "Gate code required",
            enabled: true,
            fee: 0,
            icon: "#️⃣"
        }
    },

    conditionalModifiers: [
        {
            id: "peak_hours_surcharge",
            name: "Peak Hours Surcharge (+15%)",
            enabled: true,
            priority: 10,
            conditions: [
                { field: "hour", operator: ">=", value: 7 },
                { field: "hour", operator: "<=", value: 9 },
                { field: "dayOfWeek", operator: "in", value: [1, 2, 3, 4, 5] }
            ],
            operator: "AND",
            action: {
                type: "multiply",
                percentage: 15
            }
        },
        {
            id: "late_night_surcharge",
            name: "Late Night Surcharge (+$10)",
            enabled: true,
            priority: 10,
            conditions: [
                { field: "hour", operator: ">=", value: 22 }
            ],
            operator: "OR",
            action: {
                type: "add",
                amount: 10
            }
        },
        {
            id: "weekend_premium",
            name: "Weekend Premium (+10%)",
            enabled: false,
            priority: 20,
            conditions: [
                { field: "dayOfWeek", operator: "in", value: [0, 6] }
            ],
            operator: "AND",
            action: {
                type: "multiply",
                percentage: 10
            }
        }
    ]
};
