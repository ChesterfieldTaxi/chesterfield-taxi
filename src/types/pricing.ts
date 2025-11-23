// Pricing Engine Types

export interface PricingRules {
    version: string;
    lastUpdated: string;
    tripTypes: Record<string, TripTypeConfig>;
    vehicleModifiers: Record<string, VehicleModifier>;
    passengerFees: PassengerFees;
    extraFees: ExtraFees;
    specialRequests: Record<string, SpecialRequest>;
    conditionalModifiers: ConditionalModifier[];
}

export interface TripTypeConfig {
    name: string;
    enabled: boolean;
    baseFee: number;
    minimumFare: number;
    distanceUnit: 'yard' | 'mile' | 'km';
    distancePerUnit: number;
    distanceTiers: DistanceTier[];
    surcharges: Surcharge[];
    waitTimeRate: WaitTimeRate;
}

export interface DistanceTier {
    from: number;
    to: number | null;
    ratePerUnit: number;
}

export interface Surcharge {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    amount: number;
    conditions?: Record<string, any>;
}

export interface WaitTimeRate {
    enabled: boolean;
    ratePerHour: number;
    freeMinutes: number;
}

export interface VehicleModifier {
    name: string;
    enabled: boolean;
    maxPassengers: number;
    modifier: {
        type: 'fixed' | 'percentage';
        amount: number;
    };
}

export interface PassengerFees {
    basePassengers: number;
    additionalPassengerFee: number;
    maxPassengersWithoutUpgrade: number;
}

export interface ExtraFees {
    carSeats: CarSeatConfig;
    luggage: LuggageConfig;
}

export interface CarSeatConfig {
    enabled: boolean;
    perSeatFee: number;
    requiresMinivan: boolean;
    types: Record<string, CarSeatType>;
}

export interface CarSeatType {
    name: string;
    enabled: boolean;
    fee: number;
}

export interface LuggageConfig {
    enabled: boolean;
    baseLuggage: number;
    additionalLuggageFee: number;
}

export interface SpecialRequest {
    name: string;
    enabled: boolean;
    fee: number;
    requiresMinivan?: boolean;
    icon: string;
}

export interface ConditionalModifier {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    conditions: Condition[];
    operator: 'AND' | 'OR';
    action: RuleAction;
}

export interface Condition {
    field: string;
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'not_in' | 'contains';
    value: any;
}

export interface RuleAction {
    type: 'multiply' | 'add' | 'set';
    amount?: number;
    percentage?: number;
}

// Booking details for fare calculation
export interface BookingDetails {
    tripType: 'airport_transfer' | 'point_to_point';
    distanceInYards: number;
    vehicleType: 'Sedan' | 'SUV' | 'Minivan' | 'Any';
    passengerCount: number;
    luggageCount: number;
    carSeats: {
        infant: number;
        toddler: number;
        booster: number;
    };
    specialRequests: string[];
    waitTimeMinutes?: number;
    isAirport: boolean; // DEPRECATED: Use pickupIsAirport/dropoffIsAirport instead
    pickupIsAirport?: boolean;
    dropoffIsAirport?: boolean;
    pickupDateTime: Date;
    hoursUntilPickup?: number;
    pickupZone?: string;
    dropoffZone?: string;
    accountType?: 'individual' | 'corporate' | 'government';
    isRepeatCustomer?: boolean;
    weatherCondition?: string;
    demandLevel?: number;
    isHoliday?: boolean;
    specialEventNearby?: string;
}

// Fare breakdown result
export interface FareBreakdown {
    baseFare: number;
    distanceFare: number;
    vehicleUpgrade: number;
    passengerFees: number;
    carSeatFees: number;
    luggageFees: number;
    specialRequestFees: number;
    surcharges: number;
    waitTimeFees: number;
    subtotal: number;
    minimumApplied: boolean;
    total: number;
    lineItems: LineItem[];
}

export interface LineItem {
    label: string;
    amount: number;
    type: 'base' | 'modifier' | 'fee' | 'surcharge' | 'discount';
}
