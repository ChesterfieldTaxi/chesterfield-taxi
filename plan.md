# Technical Architecture & Plan

## 1. Universal Field Schema
A config-driven schema will dictate the rendering of the multi-step form.
- Each form field will be defined by a JSON-like schema specifying `type`, `validationRules`, `dependencies`, and `UI presentation`.
- This schema acts as the single source of truth for the booking form state, drastically reducing boilerplate UI code.

## 2. Prioritized Pricing Pipeline
The Pure Functional Pricing Engine will follow a modular pipeline architecture:
- **Step 1:** Base Fare Calculation
- **Step 2:** Distance & Time Rate Application
- **Step 3:** Vehicle Multiplier Application
- **Step 4:** Surge/Time-of-day Multiplier
- **Step 5:** Discounts/Vouchers Deductions
Each step is a pure function that accepts the previous calculation's state context and returns a newly transformed state.

## 3. IBookingService Abstraction
- An `IBookingService` interface will fully decouple the React UI from the backend (Firebase).
- Core Methods will include: `createBooking()`, `calculateQuote()`, `getBookingStatus()`.
- This abstraction allows for seamless mocking during UI development, isolated testing, and the ability to swap backends without refactoring UI layers.

## 4. Firestore State Machine (Trips)
Trips stored in Firestore will strictly adhere to the following state transitions:
1. `pending`: Initial state. Booking submitted by user, awaiting dispatch.
2. `offered`: System is actively broadcasting the trip to eligible drivers.
3. `assigned`: A driver has accepted the trip.
4. `completed`: Trip has been successfully finished.
*(A `cancelled` state will serve as an escape hatch from any active state)*

## 5. Targeting Arrays
- The `Trip` document model will utilize an `offeredToIds` array to manage driver broadcasting.
- Firestore Security Rules will rely on this array to permit only targeted drivers to read or accept the specific trip offer.

## 6. Phase 18 Admin Console Architecture & Data Models
### 6.1 Firestore Collection Schemas
- `/fleet` (Physical Assets):
  - Document ID: string (`asset-{id}`)
  - `unitNumber`: string (e.g., 'Cab #101')
  - `vehicleTypeId`: string (references `/config/appSettings.vehicles[].id`)
  - `make`: string, `model`: string, `year`: number, `color`: string
  - `licensePlate`: string, `vin`: string
  - `insurancePolicy`: string, `insuranceExpiry`: string (ISO date string)
  - `mileage`: number (odometer)
  - `status`: `'active' | 'maintenance' | 'out_of_service' | 'inspecting'`
  - `assignedDriverId`?: string, `assignedDriverName`?: string
  - `maintenanceHistory`?: MaintenanceRecord[]
- `/zones` (Operational Geofences):
  - Document ID: string (`zone-{slug}`)
  - `name`: string, `description`?: string
  - `type`: `'radius' | 'polygon'`
  - `center`?: `{ lat: number, lng: number }`, `radiusMiles`?: number
  - `vertices`?: `Array<{ lat: number, lng: number }>`
  - `color`: string (hex color code for map rendering)
  - `surchargeMultiplier`?: number, `flatFee`?: number
  - `isActive`: boolean
- `/users` (RBAC & Roster Management):
  - Document ID: Firebase Auth UID
  - `email`: string, `displayName`?: string, `phone`?: string
  - `role`: `'driver' | 'dispatcher' | 'admin' | 'customer'`
  - `status`: `'active' | 'inactive' | 'suspended'`
  - `assignedVehicleUnit`?: string

### 6.2 Consolidated Admin Navigation & Sub-Navigation Architecture
- Dedicated 7-Tab Navigation Layout (`Dashboard`, `General`, `Rates`, `Vehicles`, `Zones`, `Operators`, `Advanced`) paired with a persistent, high-contrast `Dispatch Console` CTA header button.
- Sub-Navigation State Machine: Under `Vehicles`, users can toggle seamlessly between `Vehicle Types` (service classes & capacity limits) and `Physical Fleet` (asset registry & maintenance records).
- Graceful URL backwards-compatibility automatically maps legacy parameters (`?tab=pricing`, `?tab=fleet`, `?tab=staff`, `?tab=bookings`) to the new consolidated views.

## 7. Phase 19 Architecture & Firestore Schemas

### 7.1 `/pricingRules` Firestore Collection Schema
- Collection: `/pricingRules`
- Document ID: string (e.g. `rule-spirit-airport-corridor`, `rule-rush-hour`)
- Fields:
  - `id`: string
  - `name`: string
  - `description`?: string
  - `priority`: number (1 - 100, where higher numbers evaluate first)
  - `isActive`: boolean
  - `allowDriverSelection`: boolean (determines visibility in driver app quick action dropdowns)
  - `triggers`:
    - `zoneIds`?: string[] (matches pickup or dropoff within zone)
    - `minDistanceMiles`?: number
    - `maxDistanceMiles`?: number
    - `daysOfWeek`?: number[] (0 = Sunday ... 6 = Saturday)
    - `timeWindows`?: Array<{ start: string; end: string }> (e.g. `16:00` to `18:30`)
    - `holidayDates`?: string[] (e.g. `YYYY-MM-DD`)
    - `accountTypes`?: Array<'retail' | 'corporate' | 'vip'>
    - `vehicleTiers`?: string[] (e.g. `standard`, `premium`, `xl`, `wheelchair`)
  - `modifier`:
    - `type`: `'flat_override' | 'multiplier' | 'surcharge_flat' | 'surcharge_percent'`
    - `value`: number
  - `createdAt`?: string
  - `updatedAt`?: string

### 7.2 Extended Pricing Pipeline & Pure Functional Architecture
- **Flag Drop Initial Distance Allowance**:
  - `flagDropIncludedMiles`: Initial distance covered by `baseFare` before incremental mileage rates begin.
- **Decaying Distance Brackets & Step Increments**:
  - `stepIncrementTiers`: Array of `{ name, startMiles, endMiles, stepMiles, ratePerStep }`.
  - Calculates distance charges in granular step intervals (e.g. $0.35 per 0.1 mile) with bracket decay for long trips.
- **Wait-Time Delay Rate Config**:
  - `delayRate`: `{ stepSeconds, ratePerStep, gracePeriodMinutes }` (e.g. $0.60 per 90 seconds delay).
- **Condition Surcharges Step**:
  - `carSeatFeePerUnit`: Fee per child safety seat multiplied by total seat count.
  - `passengerBaseAllowance` & `extraPassengerFeePerHead`: Incremental passenger surcharge.
  - `zoneSurcharges`: Zone flat fees or multipliers evaluated against pickup/dropoff coordinates.
  - `namedPricingRules`: Evaluated in priority order; supports manual override or driver selection.

### 7.3 Dynamic Branding Studio Architecture
- Expanded Firestore document under `config/appSettings.branding`:
  - `headingFont`, `bodyFont`, `headingColor`, `bodyTextColor`, `mutedTextColor`
  - `btnPrimaryBg`, `btnPrimaryText`, `btnSecondaryBg`, `btnSecondaryText`, `btnBorderRadius`
  - `navbarBg`, `cardBg`, `primaryColor`, `secondaryColor`, `logoUrl`
- Isolated Studio State: Edits update only local component draft state in the Live Preview Canvas. Clicking "Publish Changes to Site-Wide" writes to Firestore and updates root CSS custom properties.
- Universal CSS Injection: Injects root variables in `root.tsx`, `layout.tsx`, and `admin.tsx`.

## 8. Phase 20 Architecture & Firestore Schemas

### 8.1 Geographic Entity Engine Schemas
- `/zones` (Operational Geofences):
  - Document ID: string (`zone-{slug}`)
  - `name`: string, `description`?: string
  - `type`: `'radius' | 'polygon'`
  - `center`?: `{ lat: number, lng: number }`, `radiusMiles`?: number
  - `vertices`?: `Array<{ lat: number, lng: number }>`
  - `color`: string (hex color code for map rendering)
  - `surchargeMultiplier`?: number, `flatFee`?: number
  - `isActive`: boolean

- `/zoneGroups` (Grouped Geofence Clusters):
  - Document ID: string (`group-{slug}`)
  - `name`: string (e.g. 'Metro West Corridor', 'Aviation Hubs')
  - `description`?: string
  - `zoneIds`: string[] (references `/zones` documents)
  - `color`: string
  - `surchargeMultiplier`?: number, `flatFee`?: number
  - `isActive`: boolean
  - `createdAt`?: string, `updatedAt`?: string

- `/locationCollections` (Point-of-Interest Curated Registries):
  - Document ID: string (`collection-{slug}`)
  - `name`: string (e.g. 'Regional Aviation Hubs', 'Sports & Entertainment Arenas')
  - `description`?: string
  - `category`?: string
  - `locations`: Array<{
      id: string;
      name: string;
      address: string;
      coordinates: { lat: number; lng: number };
      category?: string;
      flatFee?: number;
    }>
  - `flatFee`?: number
  - `surchargeMultiplier`?: number
  - `isActive`: boolean
  - `createdAt`?: string, `updatedAt`?: string

### 8.2 Rule Inheritance & Visual IF/THEN Pricing Rules
- Expanded `/pricingRules` schema:
  - `parentRuleId`?: string (references parent rule ID for base fare, distance/time rates, and default surcharges)
  - `stopProcessingOnMatch`?: boolean (halts subsequent lower-priority rule evaluations)
  - `triggers`:
    - `zoneIds`?: string[], `zoneGroupIds`?: string[], `locationCollectionIds`?: string[]
    - `minDistanceMiles`?: number, `maxDistanceMiles`?: number
    - `minDurationMinutes`?: number, `maxDurationMinutes`?: number
    - `daysOfWeek`?: number[], `timeWindows`?: Array<{ start: string; end: string }>, `holidayDates`?: string[]
    - `accountTypes`?: Array<'retail' | 'corporate' | 'vip'>, `accountTags`?: string[]
    - `vehicleTiers`?: string[]
    - `equipment`?: { minCarSeats?: number; minLuggage?: number }
    - `passengers`?: { min?: number; max?: number }
  - `modifier`:
    - `type`: `'flat_override' | 'multiplier' | 'surcharge_flat' | 'surcharge_percent' | 'base_override'`
    - `value`: number
    - `baseFareOverride`?: number, `perMileRateOverride`?: number, `perMinuteRateOverride`?: number
    - `surchargeAdders`?: Array<{ name: string; amount: number; type: 'flat' | 'percent' }>
  - `allowDriverSelection`: boolean
  - `priority`: number
  - `isActive`: boolean

### 8.3 Granular Step-Increment Fare Calculation Engine
- Decaying distance bracket calculation:
  - Pure incremental step accumulator computing steps = ceil(miles_in_tier / step_size).
  - Step rates scale per bracket (e.g., $0.35/0.1mi initial -> $0.25/0.1mi intermediate -> $0.20/0.1mi long range -> $0.15/0.1mi extended regional).
- Delay wait-time step calculator:
  - Excess delay minutes beyond grace period converted to seconds and evaluated as steps = ceil(excess_seconds / step_seconds).
- Pure Inheritance Resolution:
  - Resolves `parentRuleId` recursively with cycle guard, merging parent base fares, mileage rates, minute rates, and default surcharges, before applying child delta overrides.

## 9. Phase 21 Architecture: Public Booking Engine & Confirmation Workflow

### 9.1 Trip Lifecycle State Machine Expansion
- Extended `TripStatus` literal types:
  - Added `'UNCONFIRMED'`, `'CONFIRMED'`, `'DECLINED'` (and lowercase aliases).
- Valid State Transitions:
  - `UNCONFIRMED` -> `['CONFIRMED', 'DECLINED', 'cancelled', 'pending']`
  - `CONFIRMED` -> `['pending', 'offered', 'assigned', 'cancelled']`
  - `DECLINED` -> `['cancelled']` (terminal state)
  - `pending` -> `['CONFIRMED', 'offered', 'assigned', 'cancelled']`
- Web customer bookings created with `status: 'UNCONFIRMED'`.

### 9.2 Pricing Pipeline Bridge & Spatial Evaluation
- `calculateQuote` in `firebase-booking.service.ts` & `mock-booking.service.ts`:
  - Retrieves active `ZoneGeofence`, `ZoneGroup`, and `LocationCollection` registries.
  - Matches pickup/dropoff coordinates against geofences using Haversine distance and ray-casting.
  - Hydrates `PricingInput` with matched `zoneIds`, `zoneGroupIds`, `locationCollectionIds`, `carSeatsBreakdown`, and `equipment`.
  - Forwards `stepIncrementTiers`, `delayRate`, `conditionSurcharges`, and active named pricing rules via `PricingConfig`.

### 9.3 Equipment & Safety Configuration
- Enforces `COMPANY_CONFIG.carSeatLimits`:
  - `maxRearFacing: 2` (Infant)
  - `maxFrontFacing: 3` (Toddler)
  - `maxBooster: 3` (Youth Booster)
  - `maxTotalCarSeats: 4` (Total combined ceiling)
- Luggage options schema:
  - `luggageCount`: number
  - `hasOversizedLuggage`: boolean
  - `luggageType`: `'standard' | 'oversized' | 'carryon_only'`

### 9.4 Dispatcher Review & Transactional Email Workflows
- Bottom trip queue filter in `/dispatch`:
  - Filter pill `pillFilter === 'unconfirmed'` with count badge and pulse alert.
  - Row highlighting for pending unconfirmed bookings.
- Review Action Modal:
  - **Accept Action**: calls `updateTripStatus(tripId, 'CONFIRMED')` and dispatches `sendBookingConfirmation(payload)` via Resend API.
  - **Decline Action**: calls `updateTripStatus(tripId, 'DECLINED')` and dispatches `sendBookingDeclined(payload)` with preset or custom reason via Resend API.

