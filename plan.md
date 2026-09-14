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
    - `fromZoneId`?: string, `toZoneId`?: string (explicit Origin -> Destination corridor pair)
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
    - `overrideBaseFare`?: boolean, `overrideRates`?: boolean, `overrideSurcharges`?: boolean
  - `allowDriverSelection`: boolean
  - `priority`: number
  - `isActive`: boolean
- UI Drawer Usability:
  - Inherited rule editor renders parent values disabled with explicit override toggles.
  - Non-blocking Priority Collision Detection warning when saving rules with identical priority or overlapping triggers.
  - "Test Rule in Simulator" auto-fills simulator state and routes to the live calculation tab.

### 8.3 Granular Step-Increment Fare Calculation Engine
- Decaying distance bracket calculation:
  - Pure incremental step accumulator computing steps = ceil(miles_in_tier / step_size).
  - Step rates scale per bracket (e.g., $0.35/0.1mi initial -> $0.25/0.1mi intermediate -> $0.20/0.1mi long range -> $0.15/0.1mi extended regional).
  - Open-Ended Step Increments (`isOpenEnded: true`):
    - The final bracket tier can be marked as "Open-Ended / After", removing upper distance ceiling (`endMiles: Infinity`).
    - The pure pricing pipeline computes `tierCapacity = Infinity`, processing all remaining mileage at that final bracket rate.
- Delay wait-time step calculator:
  - Excess delay minutes beyond grace period converted to seconds and evaluated as steps = ceil(excess_seconds / step_seconds).
- Pure Inheritance Resolution:
  - Resolves `parentRuleId` recursively with cycle guard, merging parent base fares, mileage rates, minute rates, corridor parameters, and default surcharges, before applying child delta overrides.
- Consolidated Universal Surcharges:
  - Dedicated Sub-Tab 4 housing child safety car seats, extra headcount allowance, vehicle tier surcharges, and highway toll pass-throughs.

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

## 10. Phase 22 Architecture: TaxiCaller-Style Unified Tariff Engine

### 10.1 Tariff Profile Schema (`app/core/types/tariff.ts`)
```typescript
export interface TariffProfile {
  id: string;
  name: string; // e.g. "Standard Flat Rate", "METER", "MiniVan Flat Rate"
  currency: string; // "USD"
  units: 'imperial' | 'metric';
  fareIncrement?: number; // e.g. 2.50
  priority: number; // 1 to 100
  isActive: boolean;
  isDefault?: boolean;
  parentTariffId?: string; // Optional inheritance from parent profile
  groupId?: string; // Optional group assignment (e.g. Airport Corridors)
  inheritance?: {
    overrideTaximeter?: boolean;
    overrideCorridors?: boolean;
    overrideExtras?: boolean;
    overrideTriggers?: boolean;
  };
  triggers: {
    vehicleTiers?: string[];
    zoneIds?: string[];
    zoneGroupIds?: string[];
    locationCollectionIds?: string[];
    daysOfWeek?: number[];
    timeWindows?: Array<{ start: string; end: string }>;
  };
  taximeter: {
    startPrice: number;
    initialDistanceIncluded: number;
    initialTimeIncluded: number;
    primaryDistanceStep: number;
    primaryDistanceRate: number;
    primaryDistanceLimit: number;
    intermediateIncrements?: Array<{
      id: string;
      name?: string;
      upToDistance: number;
      stepDistance: number;
      ratePerStep: number;
    }>;
    thenDistanceStep: number;
    thenDistanceRate: number;
    freeTrafficMinutes: number;
    waitingRatePerStep: number;
    waitingStepSeconds: number;
    minimumPrice: number;
  };
  corridors: Array<{
    id: string;
    name: string;
    fromZoneId?: string;
    fromLocationCollectionId?: string;
    toZoneId?: string;
    toLocationCollectionId?: string;
    flatPrice: number;
    allowReturn?: boolean;
    priorityRank?: number;
  }>;
  extras: {
    carSeatFeePerUnit: number;
    passengerBaseAllowance: number;
    extraPassengerFeePerHead: number;
    vehicleTierMultipliers?: Record<string, number>;
    customSurcharges?: Array<{ id: string; name: string; amount: number; type: 'flat' | 'percent' }>;
  };
}
```

### 10.2 Pure Pipeline Execution Sequence
1. Match active `TariffProfile` with highest `priority` rank matching vehicle tier, schedule, and pickup/dropoff.
2. Resolve any inheritance from `parentTariffId` for non-overridden attributes.
3. Check `profile.corridors` for Origin ➔ Destination match (or reverse match if `allowReturn: true`). If matched, assign flat price.
4. If no corridor matched, execute `profile.taximeter`:
   - `startPrice`
   - Primary distance step calculation up to `primaryDistanceLimit`
   - Intermediate increment brackets (up to each successive limit)
   - Open-ended `thenDistanceRate` step calculation for remaining distance to infinity
   - Delay waiting steps beyond `freeTrafficMinutes`
   - Enforce `minimumPrice` floor.
5. Append `profile.extras` and universal surcharges.
6. Record complete audit trail.

## 11. Phase 23 Architecture: System Audit & Hardening
### 11.1 Security & Indexes
- Strict RBAC rules in firestore.rules for trips, tariffs, pricingRules, fleet, zones, config.
- Explicit compound indexes defined in firestore.indexes.json.
### 11.2 Performance & Maintainability
- Virtualized list rendering in dispatch queue for 100+ concurrent trips.
- Decoupled, pure functional pricing evaluation.

## 12. Phase 24 Architecture: Driver Mobile PWA & Multi-Party Real-Time Sync
### 12.1 Driver Console & Shift State Machine
- **Driver Shift State**: `on_duty` | `off_duty` | `on_break` stored in driver profile/roster with live vehicle binding.
- **Trip Lifecycle State Machine**:
  `offered` / `assigned` ➔ `accepted` ➔ `en_route` ➔ `arrived` ➔ `in_progress` ➔ `completed` (with `declined` / `cancelled` fallbacks).
### 12.2 In-Vehicle Live Meter Engine
- Pure Functional Taximeter evaluation executing at runtime using matched `TariffProfile`.
- Real-time elapsed duration and distance increment tracking.
- Interactive extras adder allowing addition of tolls, parking, luggage, and cleaning fees.
### 12.3 Multi-Party Snapshot Sync
- Firestore `onSnapshot` subscriptions bridging the Driver Console, Dispatch Console (`/dispatch`), Admin Dashboard (`/admin`), and Customer Booking Tracker (`/booking/status/:tripId`).

## 13. Phase 25 Architecture: Passenger Mobile Web App (`/app`)

### 13.1 Passenger Domain Models & Local-First Storage (`app/core/types/passenger.ts`)
```typescript
export type SavedPlaceCategory = 'home' | 'work' | 'airport' | 'medical' | 'favorite' | 'other';

export interface SavedPlace {
  id: string;
  label: string;
  category: SavedPlaceCategory;
  address: string;
  notes?: string;
  coordinates?: { lat: number; lng: number };
}

export interface PassengerAccount {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  passengerNotes?: string;
  preferredVehicleTier?: 'standard' | 'premium' | 'xl' | 'wheelchair';
  communicationPreferences: {
    smsUpdates: boolean;
    emailReceipts: boolean;
    phoneCalls: boolean;
  };
  savedPlaces: SavedPlace[];
  recentSearches?: string[];
}
```

### 13.2 Passenger Service & Reactive State Management
- `PassengerService` singleton (`app/core/services/passenger.service.ts`):
  - Local-first persistence via `localStorage` with sensible Chesterfield default profiles and saved locations.
  - CRUD operations for saved places with validation and category tagging.
  - Active reservation detection querying live Firestore status (`UNCONFIRMED`, `CONFIRMED`, `ASSIGNED`, `EN ROUTE`, `IN_PROGRESS`).
  - Ride history resolution joining Firestore trips with localized cache.

### 13.4 Self-Contained In-App Booking Flow & Reactive Hydration
- Handoff directly inside `/app` without navigating to `/book`:
  - `BookingEngineV2` is directly embedded within the `book` tab of `/app`.
  - `initialValues?: BookingEngineV2InitialValues` prop reactively hydrates origin, destination, vehicle class, passenger count, and custom notes whenever selected from 1-tap chips, Saved Places actions, or past trip rebooking.
  - Keeps the entire booking, pricing, and confirmation flow fully self-contained inside the passenger portal.

### 13.5 Dedicated App Shell Layout & Floating Assistance FAB
- Decoupled Route Architecture:
  - Elevate `/app` to top-level route in `app/routes.ts` outside `routes/layout.tsx`.
  - Public marketing header/footer completely suppressed within `/app`.
- Public Site Navigation:
  - Clean menu: `Home`, `Services`, `Fleet & Rates`, `About`, `Contact`.
  - Sleek "Sign In" button adjacent to the "Book Now" CTA on desktop and mobile.
- Dedicated Passenger App Shell:
  - Minimalist top status bar with compact brand logo, "Passenger Portal" indicator badge, greeting, and live ride beacon.
  - Sticky bottom navigation bar on mobile and dock navigation on desktop with 4 tabs (`[ 🚖 Book ]`, `[ 📜 Trips ]`, `[ 📍 Places ]`, `[ 👤 Profile ]`).
  - Floating Action Button (`?`) anchored above the bottom nav opening a quick popover with:
    - 24/7 Dispatch Desk direct dial (`(314) 738-0100`).
    - Direct Office line (`(314) 738-9921`).
    - Interactive Help Center & FAQ Modal (Airport pickups STL, child car seats, luggage guidelines, and cancellation policy).
    - Email Dispatch link (`dispatch@chesterfieldtaxi.com`).
    - "Back to Main Website" escape link (`to="/"`) and "Sign Out".

## 14. Phase 26 Architecture: Modular Website Builder & White-Label CMS Studio
### 14.1 Modular Component Registry
- Pure UI components (Hero Banner, Quick Booking Card, Flat Tariff Matrix, Fleet Showcase, Service Area List, Testimonial Carousel, Contact / Dispatch Bar, Custom HTML Block).
- Mapped in `app/components/cms/SectionRegistry.tsx` using a `SECTION_REGISTRY` pattern.
- A dynamic page renderer interprets JSON-based layout orders and passes configuration props down to these registered components.

### 14.2 Admin Visual CMS Studio (`/admin?tab=website`)
- **Layout Reordering Canvas**: Drag-and-drop interface for adding, removing, enabling/disabling, and reordering homepage layout sections.
- **Live Section Property Inspector**: Dynamic form bindings mapping to the active section's parameters (e.g. heading texts, subheadings, background images, CTAs).
- **Visual Theme & Asset Switcher**: Extends the branding studio to support Google Fonts selection, icon sets, and extended logo/favicon uploads.

### 14.3 Advanced CMS & SEO Tools
- **Monaco CSS Editor**: Browser-based code editor integrated into the CMS panel, securely injecting custom stylesheet overrides into the application `<head>`.
- **Script Injector**: Specialized admin fields for managing tracking pixels, analytics tags, and chat widgets.
- **SEO & Social Graph**: Route-specific Meta Title, Description, and OpenGraph tags to control social sharing cards.
