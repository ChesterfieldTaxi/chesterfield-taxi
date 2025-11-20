import type { PricingRules, BookingDetails, FareBreakdown, Condition } from '../types/pricing';

/**
 * Calculate comprehensive fare based on pricing rules
 */
export function calculateFare(
    booking: BookingDetails,
    rules: PricingRules
): FareBreakdown {
    const breakdown: FareBreakdown = {
        baseFare: 0,
        distanceFare: 0,
        vehicleUpgrade: 0,
        passengerFees: 0,
        carSeatFees: 0,
        luggageFees: 0,
        specialRequestFees: 0,
        surcharges: 0,
        waitTimeFees: 0,
        subtotal: 0,
        minimumApplied: false,
        total: 0,
        lineItems: []
    };

    // Get trip type config
    const tripConfig = rules.tripTypes[booking.tripType];
    if (!tripConfig || !tripConfig.enabled) {
        throw new Error(`Trip type ${booking.tripType} not found or disabled`);
    }

    // 1. Base fee
    breakdown.baseFare = tripConfig.baseFee;
    if (breakdown.baseFare > 0) {
        breakdown.lineItems.push({
            label: 'Base Fee',
            amount: breakdown.baseFare,
            type: 'base'
        });
    }

    // 2. Distance-based fare (tiered)
    let remainingDistance = booking.distanceInYards;

    for (const tier of tripConfig.distanceTiers) {
        const tierStart = tier.from;
        const tierEnd = tier.to ?? Infinity;

        if (remainingDistance <= 0) break;

        // Calculate yards in this tier
        const yardsInTier = Math.min(
            remainingDistance,
            tierEnd - Math.max(tierStart, booking.distanceInYards - remainingDistance)
        );

        if (yardsInTier > 0) {
            const unitsInTier = Math.ceil(yardsInTier / tripConfig.distancePerUnit);
            const tierFare = unitsInTier * tier.ratePerUnit;
            breakdown.distanceFare += tierFare;

            const tierLabel = tier.to
                ? `Distance (${Math.round(tierStart / tripConfig.distancePerUnit)}-${Math.round(tierEnd / tripConfig.distancePerUnit)} units @ $${tier.ratePerUnit})`
                : `Distance (${unitsInTier} units @ $${tier.ratePerUnit})`;

            breakdown.lineItems.push({
                label: tierLabel,
                amount: tierFare,
                type: 'base'
            });

            remainingDistance -= yardsInTier;
        }
    }

    // 3. Vehicle upgrade
    const vehicleConfig = rules.vehicleModifiers[booking.vehicleType];
    if (vehicleConfig && vehicleConfig.modifier.amount > 0) {
        breakdown.vehicleUpgrade = vehicleConfig.modifier.amount;
        breakdown.lineItems.push({
            label: `${vehicleConfig.name} Upgrade`,
            amount: breakdown.vehicleUpgrade,
            type: 'modifier'
        });
    }

    // 4. Additional passengers
    const additionalPassengers = Math.max(0, booking.passengerCount - rules.passengerFees.basePassengers);
    if (additionalPassengers > 0) {
        breakdown.passengerFees = additionalPassengers * rules.passengerFees.additionalPassengerFee;
        breakdown.lineItems.push({
            label: `Additional Passengers (${additionalPassengers} × $${rules.passengerFees.additionalPassengerFee})`,
            amount: breakdown.passengerFees,
            type: 'fee'
        });
    }

    // 5. Car seats
    const totalCarSeats = booking.carSeats.infant + booking.carSeats.toddler + booking.carSeats.booster;
    if (totalCarSeats > 0 && rules.extraFees.carSeats.enabled) {
        Object.entries(booking.carSeats).forEach(([type, count]) => {
            if (count > 0) {
                const seatConfig = rules.extraFees.carSeats.types[type];
                if (seatConfig && seatConfig.enabled) {
                    const fee = count * seatConfig.fee;
                    breakdown.carSeatFees += fee;
                    breakdown.lineItems.push({
                        label: `${seatConfig.name} Car Seat (${count} × $${seatConfig.fee})`,
                        amount: fee,
                        type: 'fee'
                    });
                }
            }
        });
    }

    // 6. Luggage (if enabled and exceeds base)
    if (rules.extraFees.luggage.enabled) {
        const additionalLuggage = Math.max(0, booking.luggageCount - rules.extraFees.luggage.baseLuggage);
        if (additionalLuggage > 0 && rules.extraFees.luggage.additionalLuggageFee > 0) {
            breakdown.luggageFees = additionalLuggage * rules.extraFees.luggage.additionalLuggageFee;
            breakdown.lineItems.push({
                label: `Additional Luggage (${additionalLuggage} × $${rules.extraFees.luggage.additionalLuggageFee})`,
                amount: breakdown.luggageFees,
                type: 'fee'
            });
        }
    }

    // 7. Special requests
    booking.specialRequests.forEach(requestId => {
        const request = rules.specialRequests[requestId];
        if (request && request.enabled && request.fee > 0) {
            breakdown.specialRequestFees += request.fee;
            breakdown.lineItems.push({
                label: request.name,
                amount: request.fee,
                type: 'fee'
            });
        }
    });

    // 8. Surcharges (e.g., airport fee)
    tripConfig.surcharges.forEach(surcharge => {
        let applies = true;
        if (surcharge.conditions) {
            if (surcharge.conditions.isAirport !== undefined &&
                surcharge.conditions.isAirport !== booking.isAirport) {
                applies = false;
            }
        }

        if (applies) {
            const amount = surcharge.type === 'percentage'
                ? (breakdown.baseFare + breakdown.distanceFare) * (surcharge.amount / 100)
                : surcharge.amount;

            breakdown.surcharges += amount;
            breakdown.lineItems.push({
                label: surcharge.name,
                amount: amount,
                type: 'surcharge'
            });
        }
    });

    // 9. Wait time (if applicable)
    if (booking.waitTimeMinutes && tripConfig.waitTimeRate.enabled) {
        const chargeableMinutes = Math.max(0, booking.waitTimeMinutes - tripConfig.waitTimeRate.freeMinutes);
        if (chargeableMinutes > 0) {
            breakdown.waitTimeFees = (chargeableMinutes / 60) * tripConfig.waitTimeRate.ratePerHour;
            breakdown.lineItems.push({
                label: `Wait Time (${chargeableMinutes} min @ $${tripConfig.waitTimeRate.ratePerHour}/hr)`,
                amount: breakdown.waitTimeFees,
                type: 'fee'
            });
        }
    }

    // 10. Apply conditional modifiers
    const context = extractBookingContext(booking);
    const applicableModifiers = rules.conditionalModifiers
        .filter(mod => mod.enabled)
        .filter(mod => evaluateConditions(mod.conditions, mod.operator, context))
        .sort((a, b) => a.priority - b.priority);

    let runningTotal = breakdown.baseFare + breakdown.distanceFare + breakdown.vehicleUpgrade +
        breakdown.passengerFees + breakdown.carSeatFees + breakdown.luggageFees +
        breakdown.specialRequestFees + breakdown.surcharges + breakdown.waitTimeFees;

    applicableModifiers.forEach(modifier => {
        const modAmount = applyModifierAction(modifier.action, runningTotal);

        breakdown.lineItems.push({
            label: modifier.name,
            amount: modAmount,
            type: modifier.action.type === 'multiply' && (modifier.action.percentage ?? 0) < 0
                ? 'discount'
                : 'surcharge'
        });

        runningTotal += modAmount;
    });

    breakdown.subtotal = runningTotal;

    // 11. Apply minimum fare
    if (breakdown.subtotal < tripConfig.minimumFare) {
        breakdown.minimumApplied = true;
        breakdown.total = tripConfig.minimumFare;
        breakdown.lineItems.push({
            label: `Minimum Fare Applied`,
            amount: tripConfig.minimumFare - breakdown.subtotal,
            type: 'modifier'
        });
    } else {
        breakdown.total = breakdown.subtotal;
    }

    // 12. Round UP to nearest dollar
    breakdown.total = Math.ceil(breakdown.total);

    return breakdown;
}

/**
 * Extract booking context for conditional rule evaluation
 */
function extractBookingContext(booking: BookingDetails): Record<string, any> {
    const dt = booking.pickupDateTime;

    return {
        hour: dt.getHours(),
        minute: dt.getMinutes(),
        dayOfWeek: dt.getDay(),
        date: dt.toISOString().split('T')[0],
        month: dt.getMonth() + 1,
        year: dt.getFullYear(),
        hoursUntilPickup: booking.hoursUntilPickup,
        isAirport: booking.isAirport,
        pickupZone: booking.pickupZone,
        dropoffZone: booking.dropoffZone,
        accountType: booking.accountType,
        isRepeatCustomer: booking.isRepeatCustomer,
        tripType: booking.tripType,
        vehicleType: booking.vehicleType,
        passengerCount: booking.passengerCount,
        distanceInYards: booking.distanceInYards,
        weatherCondition: booking.weatherCondition,
        demandLevel: booking.demandLevel,
        isHoliday: booking.isHoliday,
        specialEventNearby: booking.specialEventNearby
    };
}

/**
 * Evaluate conditions with AND/OR logic
 */
function evaluateConditions(
    conditions: Condition[],
    operator: 'AND' | 'OR',
    context: Record<string, any>
): boolean {
    const results = conditions.map(cond => evaluateCondition(cond, context));
    return operator === 'AND' ? results.every(r => r) : results.some(r => r);
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(condition: Condition, context: Record<string, any>): boolean {
    const fieldValue = context[condition.field];
    const testValue = condition.value;

    switch (condition.operator) {
        case '==':
            return fieldValue === testValue;
        case '!=':
            return fieldValue !== testValue;
        case '>':
            return fieldValue > testValue;
        case '<':
            return fieldValue < testValue;
        case '>=':
            return fieldValue >= testValue;
        case '<=':
            return fieldValue <= testValue;
        case 'in':
            return Array.isArray(testValue) && testValue.includes(fieldValue);
        case 'not_in':
            return Array.isArray(testValue) && !testValue.includes(fieldValue);
        case 'contains':
            return String(fieldValue).includes(String(testValue));
        default:
            return false;
    }
}

/**
 * Apply a modifier action
 */
function applyModifierAction(
    action: { type: string; amount?: number; percentage?: number },
    currentTotal: number
): number {
    switch (action.type) {
        case 'add':
            return action.amount || 0;
        case 'multiply':
            const percentage = action.percentage || 0;
            return currentTotal * (percentage / 100);
        case 'set':
            return (action.amount || 0) - currentTotal;
        default:
            return 0;
    }
}
