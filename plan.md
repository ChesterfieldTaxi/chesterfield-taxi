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

## 15. Phase 27 Architecture: Full-Stack Authentication, OAuth & Session Management
### 15.1 Unified Auth Interfaces
- `/signin` and `/register` routes acting as central gateways.
- Support for email/password and federated identities (Google/Facebook OAuth via Firebase Auth).
- Support for both Passenger and Driver registration workflows with specific claim setup in Firestore users collection.

### 15.2 Protected Route Guards
- Higher-Order Components or loaders in React Router v7 leveraging Firebase Auth tokens to evaluate claims.
- Graceful redirects for unauthenticated access with `?redirect=` return URLs.
- Post-authentication routing based on Role:
  - Passengers are routed to their personal `/app` dashboard.
  - Drivers to `/driver` console.
  - Dispatch/Admin to `/admin`.

### 15.3 Guest Trip Claiming
- On the `/track/$tripToken` route, detect if the current session is an unauthenticated guest.
- Present a CTA to "Save Account & Claim Trips".
- On account creation, link previous `email` or `phone` matching trips to the new Firebase UID.
  
## 16. Phase 28 Architecture: Admin Onboarding Center & Role Provisioning
### 16.1 Admin Onboarding Queue (`/admin?tab=operators&sub=onboarding`)
- **Table View**: Display incoming applicants from `/applications` collection.
- **Filters**: Status filters (Pending, Under Review, Approved, Rejected).
- **Candidate Dossier Card**: An expandable drawer displaying comprehensive application data (contact info, role, experience, address, license details, attached documents).

### 16.2 Background & Compliance Verification Checklist
- **Compliance Controls**: Interactive toggles in the Candidate Dossier for background check status, driver license verification, MVR clearance, and vehicle insurance approval.
- **Audit Log**: Capture the admin user who reviewed and updated candidate statuses with timestamps.

### 16.3 One-Click Account Provisioning & Role Injection
- **Approve & Provision Account Action**: Automate user creation in Firebase Auth & `/users` collection with the corresponding role (`driver`, `dispatcher`, `accountant`, or `admin`).
- **Driver Profile Linkage**: If the applicant is a driver, automatically link or create their Driver Profile in the fleet system.
- **Temporary Credentials & Welcome Sheet**: Generate secure initial temporary credentials and render a printable/copyable dispatch sheet that triggers an automated email.

## 17. Phase 29: Vehicle Shift History, Audit Trail & Universal Blacklist/Archive Engine + Dual Scoring & Conditional Booking Rules
### 17.1 Shift Tracking & Temporal Mapping
- Collection `/vehicleAssignments` stores Driver Shift records (`driverId`, `vehicleId`, `vehicleNumber`, `startedAt`, `endedAt`, `status`).
- Bidirectional temporal queries for resolving driver operations at historical timestamps and driver shift rosters.
- Admin Shift History modal and search tool for cab unit number + date window exploration.

### 17.2 Immutable Snapshots & Audit Trail
- Trip models freeze `assignedVehicle` snapshot metadata upon driver assignment to prevent retroactive distortions.
- Trips maintain an immutable `auditLog` array recording all lifecycle events (`TRIP_REQUESTED`, `AUTO_CONFIRMED`, `FLAGGED_FOR_HUMAN_REVIEW`, `DISPATCH_OFFERED`, `DRIVER_ACCEPTED`, `STATUS_CHANGED`, `FARE_ADJUSTED`, `TRIP_COMPLETED`, `TRIP_CANCELED`, `BLACK_LISTED`) with actor role, actor ID, and metadata.
- Audit Log Inspector modal in `/admin?tab=trips` and `/dispatch` for chronological event inspections.

### 17.3 Dual Scoring Engine
- Customer Score (0–100 / 5-star): Evaluates cancellation frequencies, no-shows, and payment records. Low scores trigger Mode B dispatcher review.
- Driver Score (0–100 / 5-star): Evaluates acceptance rate, on-time arrivals, trip completion ratio, and customer ratings. Restricts access to premium tiers.
- Real-time score badges across admin and dispatch interfaces.

### 17.4 3-Tier Conditional Booking Lifecycle Engine
- `bookingRulesEngine.ts` evaluates booking requests against rules (Customer Score, Driver Score threshold, Time of day, Zone restrictions).
- Mode A (AUTO_CONFIRM): Auto-confirms rides directly into dispatch pipeline.
- Mode B (REQUIRE_REVIEW): Holds ride in `pending` / `PENDING_DISPATCHER_REVIEW` with descriptive policy tags for dispatcher approval.
- Mode C (BLACKLIST_BLOCK): Halts booking creation and registers security audit entry.

### 17.5 Universal Governance & Blacklist Engine
- Universal `isArchived`, `isBlacklisted`, and `blacklistReason` fields across Passengers, Drivers, Staff Operators, Fleet Units, Trips, and Geo-Locations.
- Route guards rejecting blacklisted passenger bookings, driver/staff logins, grounded vehicles in shifts, and blacklisted pickup/dropoff zones.
- Governance UI in `/admin` for Rules Manager, Geo-Fence Manager, and Universal Archive/Blacklist actions.

## 18. Phase 29B Architecture: Responsive Mobile Overhaul, Mobile Dispatch Console, Multi-Role View Switcher & Custom Layout Options

### 18.1 Multi-Role View Launcher & Unified App Shell
- **Role Hierarchy & Permitted Workspaces**:
  - `admin`: Full unrestricted access to Admin (`/admin`), Dispatch (`/dispatch`), Driver (`/driver`), and Customer (`/app`).
  - `dispatcher`: Access to Dispatch (`/dispatch`), Driver (`/driver`), and Customer (`/app`).
  - `driver`: Access to Driver (`/driver`) and Customer (`/app`).
  - `customer`: Access to Customer (`/app`) and public booking.
- **Component Architecture**:
  - `RoleViewSwitcher.tsx`: Self-contained interactive popover/dropdown rendering accessible workspace targets with visual active indicators and icons.
  - Integration across headers: Mounted in Admin Header (`/admin`), Dispatch Header (`/dispatch`), and within `UserDropdown.tsx` for consistent global accessibility.
  - Sign-in destination engine: Post-login redirection accurately parses user's `roles` array and defaults to highest appropriate workspace.

### 18.2 Dispatch Console Mobile View State Machine (`/dispatch`)
- **Responsive Viewport Toggles**:
  - Viewport detection isolates desktop multi-column view from mobile single-pane focus.
  - Mobile mode (`lg:hidden`) exposes a 3-tab segmented controller:
    1. `activeMobileTab === 'booking'`: Renders draft tabs and `DispatchBookingEngine` full-screen.
    2. `activeMobileTab === 'map'`: Renders Google Maps canvas full-screen with driver overlays.
    3. `activeMobileTab === 'queue'`: Renders active trips table/cards full-screen with filter pills and search.
  - Slide-out mobile navigation drawer provides touch access to Drivers roster, Messages, Softphone, and Switcher without interfering with map or booking states.

### 18.3 Configurable Display Layout Engine
- **Layout Modes**:
  - `'cards'`: High-density responsive card grid, ideal for touchscreens and mobile viewports.
  - `'table'`: Analytical tabular view wrapped in scrollable containers.
  - `'compact'`: Minimalist single-line rows for maximum vertical data throughput.
- **Hook & Storage Schema**:
  - `useDisplayLayout(key, defaultLayout)` hook with automatic mobile detection (`window.innerWidth < 768px ? 'cards' : 'table'`).
  - Syncs changes to `localStorage` under keys `ct_display_layout_admin` and `ct_display_layout_dispatch`.
- `LayoutToggle.tsx`: Clean 3-way toggle button group embedded in Admin and Dispatch toolbars.

### 18.4 Admin Console Responsive & Table Overflow Remediation
- **Header Actions**: Responsive layout with preserved action buttons ("Launch Dispatch", "Live Site", "Switch View") across all breakpoints.
- **Horizontal Table Protection**: All administrative grid tables wrapped in `overflow-x-auto` with styled scrollbars (`custom-scrollbar`) and min-width constraints, preventing body-level horizontal overflow.

## 19. Phase 30 Architecture: End-to-End Live Simulation & Production Infrastructure Hardening

### 19.1 Multi-Role E2E Simulation Architecture
- **Automated Integration Test Pipeline (`test-e2e-simulation.ts`)**:
  - Exercises full multi-role booking lifecycles across domain services without requiring live manual browser interaction.
  - **Passenger Flow**:
    - Creates trip reservation under multiple customer scenarios.
    - Tests `BookingRulesEngine` evaluation for Mode A (auto-confirmed `CONFIRMED`), Mode B (review required `UNCONFIRMED` with rule reason tags), and Mode C (blacklist block rejection with security audit event).
  - **Dispatcher Flow**:
    - Queries active trips queue across Card, Table, and Compact display layout formats.
    - Transitions unconfirmed trips to confirmed, and assigns active driver shift unit (`Cab #204` / `drv-101`).
    - Verifies real-time event broadcasting to active subscribers.
  - **Driver Flow**:
    - Accepts trip offer on driver shift interface.
    - Cycles status sequentially through `assigned` -> `en_route` -> `arrived` -> `in_progress` -> `completed`.
    - Validates immutable vehicle snapshot (`assignedVehicle`) freezing upon driver assignment.
    - Validates automated sequential appending of `TripAuditEvent` entries to `auditLog` array.
  - **Tracking Flow**:
    - Subscribes to live trip updates simulating `/track/$tripToken`.
    - Verifies real-time reception of status changes, telemetry coordinates, and status beacon indicators.

### 19.2 Multi-Tenant Firestore Security Rules RBAC Matrix
| Collection | Role / Subject | Permitted Operations | Conditions / Safeguards |
| :--- | :--- | :--- | :--- |
| `/users/{uid}` | Customer / Passenger | `read`, `create`, `update` | Own profile only (`request.auth.uid == uid`), cannot elevate role |
| `/users/{uid}` | Dispatcher / Admin | `read`, `create`, `update`, `delete` | Full elevated operational management |
| `/trips/{id}` | Public / Guest | `create`, `get` | Create `UNCONFIRMED`/`pending`; read by unique tripId/token for tracking |
| `/trips/{id}` | Customer / Passenger | `list`, `update` | Query own trips (`customerId == uid`); update notes or cancel |
| `/trips/{id}` | Driver | `get`, `update` | Only assigned trips (`assignedDriverId == uid`) or offered trips |
| `/trips/{id}` | Dispatcher / Admin | `read`, `write` | Full access for dispatch, override, assignment, and status cycling |
| `/vehicleAssignments` | Driver | `create`, `read`, `update` | Active shift records where `driverId == uid` |
| `/vehicleAssignments` | Dispatcher / Admin | `read`, `write` | Operational fleet shift management and audit history |
| `/applications` | Candidate / Applicant | `create` | Public candidate submission; zero read permissions for queue privacy |
| `/applications` | Dispatcher / Admin | `read`, `write` | Onboarding queue processing and compliance verification |
| Operational Config | Public / All | `read` | Read tariffs, pricing rules, zones, and branding config |
| Operational Config | Dispatcher / Admin | `write` | Restricted configuration mutation |
| Wildcard `/{doc=**}` | Dispatcher / Admin | `read`, `write` | Default denies general unauthorized access |

### 19.3 Production Bundle Optimization & Asset Code-Splitting
- **Dynamic Lazy Loading**:
  - Dynamically load heavy components (such as `@monaco-editor/react` in `AdminWebsiteTab.tsx`) using `React.lazy()` and `Suspense` with elegant loading skeletons.
- **Rollup Chunking Strategy (`vite.config.ts`)**:
  - `vendor-monaco`: `@monaco-editor/react`
  - `vendor-dnd`: `@hello-pangea/dnd`
  - `vendor-maps`: `@googlemaps/js-api-loader`
  - `firebase`: Firebase SDK modular bundle
  - `react-router`: Core routing runtime
  - `core-ui`: Universal UI component library

## 20. Phase 31 Architecture: Enterprise External API Integrations (Payments, Invoicing, and Telephony)

### 20.1 Payments & Card Vaulting Architecture (`payment.service.ts`)
- **Vendor Abstraction (`IPaymentService`)**:
  - Unified interface supporting Stripe / Square API contracts with zero-downtime test/mock simulation fallback.
  - Card vaulting engine creates tokenized `VaultedCard` records (`last4`, `brand`, `expMonth`, `expYear`, `token`, `isDefault`) stored against the passenger profile (`PassengerAccount.vaultedPaymentMethods`).
- **Two-Stage Authorization Lifecycle**:
  - `createPreAuthorization(tripId, amount, customerId, cardId)`: Triggered automatically upon trip confirmation (`CONFIRMED` or driver `accepted`), placing a temporary pre-auth hold on the vaulted card.
  - `capturePayment(tripId, finalFare, tip, extras)`: Triggered upon trip completion (`completed`), capturing the pre-authorized amount adjusted with actual taximeter fare, extra fees, tolls, and customer gratuity.
- **Driver PWA In-Cab Terminal**:
  - Terminal flow embedded in `/driver` triggering upon completion with tip calculation buttons (`15%`, `20%`, `25%`, `Custom`, `No Tip`) and immediate card receipt confirmation.
- **Automated Driver Payouts Engine**:
  - Calculates net split per trip: Driver base share (e.g. 75%), Platform commission (25%), 100% tip pass-through to driver, and 100% toll reimbursement to driver.
  - Generates immutable `DriverPayout` entities linked to accounting ledger.

### 20.2 B2B Corporate Invoicing & Accounting Sync Architecture (`invoicing.service.ts`)
- **B2B Billing Contract (`IInvoicingService`)**:
  - Periodic automated invoice generation for corporate accounts based on billing cycles (`net15`, `net30`, `net60`, `immediate`).
  - Batch invoicing engine queries unbilled completed trips matching corporate IDs and consolidates into formal `InvoiceRecord` entities.
- **PDF Generation Pipeline**:
  - High-fidelity PDF rendering engine producing professional printable invoice documents formatted with Chesterfield Taxi logo, corporate billing details, trip log with PO numbers, itemized line items, payment terms, and bank remittance instructions.
- **Accounting Ledger Sync**:
  - Financial ledger recording balanced entries across platform accounts (`fare_revenue`, `platform_commission`, `driver_payout`, `tip_collected`, `toll_reimbursement`, `refund`).
  - Standardized export modules for QuickBooks CSV (`quickbooks_csv`), QuickBooks IIF (`quickbooks_iif`), and General Ledger JSON (`general_ledger_json`).
- **Admin Financials Console Integration**:
  - Tab routing `/admin?tab=financials` (aliased to `invoicing`) with sub-tabs: Ledger, Corporate Accounts, Payment Gateways, and Accounting Sync.

### 20.3 Telephony & Communications Architecture (`telephony.service.ts`)
- **Masked Virtual Phone Relay (`ITelephonyService`)**:
  - Virtual proxy number session provisioning (Twilio Proxy emulation).
  - Routes inbound and outbound calls/SMS between passenger and driver through Chesterfield Taxi proxy numbers to ensure phone privacy.
  - Session lifecycle hooks tie to trip state machine (starts on `assigned`, terminates on `completed` or `cancelled`).
- **Automated Lifecycle SMS Telemetry**:
  - Event listener triggers automated SMS notifications upon trip state changes:
    - `en_route`: Informs passenger driver is heading to pickup with vehicle info and ETA.
    - `arrived`: Alerts passenger driver has arrived outside with vehicle make/model/cab unit.
    - `in_progress`: Confirms trip initiation.
    - `completed`: Delivers completion confirmation with final charged fare.
  - In-memory/Firestore message audit trail tracking delivery status and timestamp.
- **Dispatcher WebRTC Softphone (`/dispatch`)**:
  - Full-featured browser softphone interface integrated into tactical dispatch workspace.
  - Connects to WebRTC audio session state machine (`idle` -> `connecting` -> `in_call` -> `ended`) with live duration timer, mute toggle, DTMF keypad tone generation, and click-to-call hooks on driver roster and active trip rows.

## 21. Phase 32: Production Launch, Web Booking Stress Testing, Security Standards & UI/UX Hardening

### 21.1 Live Production Cutover
- Transition `app/config/companyConfig.ts` to `constructionMode: false`.
- Synchronize dynamic Firestore runtime setting overrides (`config/appSettings`) so dispatchers can switch between Live and Maintenance mode in real-time from the Admin Console.

### 21.2 Defensive Security & OWASP Hardening
- **Seed API Protection (`/api/seed-stress-data`)**: Restrict mass trip seeding behind authorization token (`x-admin-secret`) and block execution in production environments.
- **Email Gateway Lockdown (`/api/send-email`)**: Disable open mail relay functionality by restricting raw HTML sending to authenticated admin roles, while strictly whitelisting verified transactional trip events.
- **Payment Gateway Isolation (`/api/payments`)**: Deprecate client-supplied secret key overrides; enforce server-side environment variables (`STRIPE_SECRET_KEY`) exclusively.
- **Firestore Least Privilege (`firestore.rules`)**: Harden `/trips/{tripId}` rules to prevent unauthorized state transitions (`COMPLETED`, `IN_PROGRESS`) and restrict public trip read access to valid tokens or authenticated owners.
- **Bot Mitigation & XSS Sanitization**: Deploy hidden honeypot fields (`faxNumber`, `websiteUrl`) on public web forms and enforce HTML/script tag stripping before Firestore ingestion.

### 21.3 Web Booking UI/UX Design System
- **Progressive Disclosure Flow**: Multi-step indicator (`1. Route & Time`, `2. Vehicle`, `3. Passenger & Options`, `4. Confirmation`) with inline validation states.
- **Mobile Touch Ergonomics**: Persistent mobile sticky summary bar displaying real-time fare calculation and primary CTA.
- **Post-Booking Experience (`BookingConfirmation.tsx`)**: High-fidelity reservation card with copyable reference ID `#CT-XXXXX`, 3-phase dispatch lifecycle timeline, Google/Apple calendar export (`.ics`), PDF receipt generation, and direct 24/7 dispatch phone link.

### 21.4 Web Booking Automated Stress Testing Suite (`scripts/stress-test-web-booking.ts`)
- **Concurrency Load (50+ simultaneous bookings)**: Multi-threaded async bookings verifying ID uniqueness, Firestore batch writing resilience, and atomic sequence integrity.
- **Fuzzing & Malformed Input Injection**: Fuzzing tests evaluating XSS strings, Unicode/emojis, 10,000-character strings, edge-case temporal values, and abnormal vehicle capacity requests.
- **Anti-Tamper Pricing Verification**: Verifying that client attempts to manipulate fares (e.g. `$0.01` or negative sums) are rejected and re-calculated deterministically by the server/core pricing engine.
- **Bot Honeypot Validation**: Testing automated rejection of spam payloads containing populated honeypot values.

## 22. Phase 33 Architecture: Codebase Modularization, Shared Hooks & Dead-Code Cleanup

### 22.1 Architectural Guardrails & Non-Functional Invariants
- **Zero Behavior Change**: All pricing algorithms, Firestore collections/queries, trip lifecycle transitions, Tailwind CSS styles, mobile touch/drag gestures, and UX workflows remain strictly identical.
- **Config-Driven Preservation**: `app/config/formConfig.ts` and `app/config/roleFormConfig.ts` remain untouched.
- **Memoization, Event Bus & Storage Contracts**:
  - Preserve `React.memo` boundaries (`MemoizedDraftBookingPane`, `DispatchBookingEngine`, `CommsHub`), stable `useCallback`/`useMemo` references, and `WorkspaceBus` event subscriptions (`POPULATE_BOOKING`, etc.).
  - Preserve all `localStorage` and `sessionStorage` keys (`ct_dispatch_*`, `ct_driver_*`, `ct_comms_*`, `ct_display_layout_*`).
  - Keep `formatUsPhone` exported from `app/components/domain/BookingEngineV2.tsx` for compatibility with `scripts/stress-test-web-booking.ts`.

### 22.2 Dead-Code Retirement & Repository Hygiene
- Verify zero active route or script consumers for legacy V1 `app/components/domain/BookingEngine.tsx` and `app/components/domain/BookingForm.tsx`, remove both files, and prune barrel re-exports from `app/components/domain/index.ts`.
- Add `.vercel/` to `.gitignore` and execute `git rm --cached -r .vercel` so `.vercel/react-router-build-result.json` no longer pollutes working tree status during builds.

### 22.3 Dispatch Workspace Module Architecture (`app/components/domain/dispatch/`)
- **`TripActionDropdown.tsx`**: Portal/positioned row-action dropdown menu for trip lifecycle overrides, driver assignment, cloning, and audit inspection.
- **`MemoizedDraftBookingPane.tsx`**: Isolated `React.memo` wrapper around `DispatchBookingEngine` preserving multi-draft tab performance.
- **`DispatchTripQueuePane.tsx`**: Search/filter/layout toolbar plus Table, Card Grid, and Compact List queue renderers.
- **`DispatchLiveMapPane.tsx`**: Fleet telemetry map panel, Google Maps markers, geo-zone overlays, route polylines, and map layer controls.
- **`DispatchDriverRosterPane.tsx`**: Active driver shift list, candidate driver picker sheet, and mobile touch-and-hold quick-action sheets.
- **`DispatchTripDetailsDrawer.tsx`**: Trip inspection drawer, unconfirmed Mode B review modal, and audit log inspector triggers.
- **`app/routes/dispatch.tsx`**: Streamlined route orchestrator coordinating Firestore subscriptions, state synchronization, split-pane layout, and mobile 3-tab navigation.

### 22.4 Driver PWA Module Architecture (`app/components/domain/driver/` & `app/core/utils/driver-ui.util.ts`)
- **`app/core/utils/driver-ui.util.ts`**: Pure deterministic utilities (`formatCabUnitLabel`, `openMapNavigation`, `isTripQuotedLocked`, `splitDriverExtras`, `maskPhoneForDisplay`), re-exported from `app/routes/driver.tsx` for backwards compatibility.
- **`DriverShiftControls.tsx`**: Shift duty toggle, vehicle unit selector, and driver HUD header.
- **`DriverOfferSheet.tsx`**: Real-time incoming trip offer sheet/card with countdown and accept/decline controls.
- **`DriverLiveMeterCard.tsx`**: Active trip progression card, sequential lifecycle CTA flow (`en_route` -> `arrived` -> `in_progress` -> `completed`), live taximeter, and itemized extras controls.
- **`DriverPaymentTerminalModal.tsx`**: In-cab payment settlement modal with tip presets (`15%`, `20%`, `25%`, `Custom`, `No Tip`) and card/cash completion.
- **`DriverEarningsHistoryPane.tsx`**: Completed trip and shift earnings summary view.

### 22.5 CommsHub Sub-Panes & Dynamic WebRTC Voice SDK Loading (`app/components/domain/dispatch/comms/`)
- Extract focused sub-modules from `app/components/domain/dispatch/CommsHub.tsx`:
  - `CommsFilterToolbar.tsx`: Channel tabs, search, unread/priority filters.
  - `CommsBatchActionBar.tsx`: Multi-select batch read/archive/delete action bar.
  - `SoftphoneDialerPane.tsx`: Embedded WebRTC numeric dialpad, DTMF keypad, active call controls, and call timer.
  - `SmsThreadPane.tsx`: Two-way SMS conversation list, thread message view, quick templates, and booking population triggers.
  - `VoicemailCallLogPane.tsx`: Inbound/outbound call history, voicemail playback, and callback triggers.
- Convert static `@twilio/voice-sdk` imports to dynamic `import('@twilio/voice-sdk')` triggered only when the softphone initializes, keeping WebRTC SDK bytes out of the critical initial bundle parse.

### 22.6 Shared Booking Hooks & Helpers (`app/core/hooks/booking/`)
- Extract identical pure logic shared across `DispatchBookingEngine.tsx` and `BookingEngineV2.tsx` into `app/core/hooks/booking/`:
  - Multi-stop waypoint array manipulation (add, remove, reorder/update stops).
  - Return-trip address/route synchronization helpers.
  - Corporate account / PO verification state and API helper hook.

## 23. Phase 34 Architecture: Driver & Dispatch PWA Hardening (Service Worker, Web Push & Screen Wake Lock)

### 23.1 Architectural Guardrails & SSR Encapsulation
- Strictly isolate all browser Web APIs (`navigator.serviceWorker`, `navigator.wakeLock`, `navigator.vibrate`, `Notification`, `document.visibilityState`, `AudioContext`) inside dedicated hooks (`app/core/hooks/`) and services (`app/core/services/notifications/`, `app/core/services/sound-notification.service.ts`), keeping React JSX components declarative and free of raw browser plumbing per `constitution.md`.
- Guard every browser global access behind runtime checks (`typeof window !== 'undefined'`, `typeof navigator !== 'undefined'`, `typeof document !== 'undefined'`) for React Router v7 SSR compatibility.

### 23.2 Manifest & Root Service Worker Architecture (`public/manifest-driver.json`, `public/sw.js`, `app/root.tsx`)
- **Driver Manifest Scope**: `public/manifest-driver.json` sets `id: "/app/driver"`, `start_url: "/app/driver"`, and `scope: "/app/driver"`.
- **Dynamic Manifest Link**: `Layout` in `app/root.tsx` inspects `useLocation().pathname` to emit `/manifest-driver.json` on `/app/driver*` and `/driver*`, and `/manifest.json` on all other paths.
- **Zero-Build Root Service Worker (`public/sw.js`)**:
  - **Caching**: Stale-while-revalidate for static `/icon-*.svg` and `/manifest*.json`; network-first with cached/offline fallback for HTML navigation requests; strict pass-through (zero caching) for `/api/*`, `.data` loader payloads, and cross-origin Firebase/Maps/Stripe endpoints.
  - **Notification Dispatch**: Handles `push` events (JSON `{ title, body, url, tag, requireInteraction, vibrate }`) and `message` events (`{ type: 'SHOW_LOCAL_NOTIFICATION', payload }`) via `self.registration.showNotification(...)`.
  - **Window Focus & Deep-Link Handoff**: `notificationclick` closes the notification, queries `clients.matchAll({ type: 'window', includeUncontrolled: true })` for an open `/app/driver` or `/app/dispatch` client, focuses it and posts `{ type: 'NOTIFICATION_CLICK', payload }`, or opens `clients.openWindow(targetUrl)` if none exists.

### 23.3 Screen Wake Lock Lifecycle (`app/core/hooks/useWakeLock.ts`)
- `useWakeLock({ enabled: boolean })` returns `{ isSupported, isActive, error, requestLock, releaseLock }`.
- Acquires a `WakeLockSentinel` via `navigator.wakeLock.request('screen')` when `enabled` is `true` and `document.visibilityState === 'visible'`; releases cleanly when `enabled` flips to `false` or on component unmount.
- Subscribes to `document` `visibilitychange` to automatically re-request the sentinel whenever the driver or dispatcher returns to the foreground tab while `enabled` remains `true`.

### 23.4 Push Notification Service, Server Endpoint & Acoustic Cadences
- **`app/core/services/notifications/push-notification.service.ts`**:
  - Pure payload builders (`formatDriverOfferNotificationPayload`, `formatDispatchAlertPayload`) decoupled from browser globals for deterministic unit testing.
  - Tracks `Notification.permission`, persists user opt-in (`ct_push_alerts_enabled` in `localStorage`), lazily initializes `firebase/messaging` when `VITE_FIREBASE_VAPID_KEY` + Firebase are configured, and syncs device tokens onto `/users/{uid}` (`fcmTokens` array).
  - Exposes `notifyIncomingDriverOffer(trip)` and `notifyDispatchAlert({ title, body, url, tag })` routing through `ServiceWorkerRegistration.showNotification` / SW `postMessage` + `navigator.vibrate([200, 100, 200])`.
- **`app/routes/api.push.ts`** (registered at `api/push` in `app/routes.ts`):
  - Verifies caller identity via `verifyServerRequestAuth`.
  - Supports `register_token` and `remove_token` mutations on `/users/{uid}.fcmTokens`, `status` diagnostics, and `send_push` via FCM HTTP v1 (when server credentials are configured) with clean stub diagnostics otherwise.
- **`app/core/services/sound-notification.service.ts`**:
  - `playDriverOfferAlert()` / `stopDriverOfferAlert()`: Repeating urgent multi-tone offer chime on a 2.6s cadence with 30s safety auto-stop and immediate cancellation on accept/decline/mute.
  - `playSlaWarningChime()`: Distinct double-pulse warning tone for SLA threshold alerts.
- **UI Hook Integration (`usePushNotifications`, `driver.tsx`, `DriverShiftControls.tsx`, `dispatch.tsx`)**:
  - `driver.tsx` binds `useWakeLock({ enabled: driver?.dutyStatus === 'on_duty' })`, triggers offer sound + push notification on unseen `offeredTrips`, stops offer alert when offers clear or on accept/decline, and passes memoized wake-lock and push props to `DriverShiftControls`.
  - `dispatch.tsx` persists `ct_dispatch_wake_lock` in `localStorage`, exposes **Keep Screen Awake** and **Browser Push Alerts** controls in the Dispatch header settings popover & operations drawer, and invokes `notifyDispatchAlert` for new `UNCONFIRMED` / `ASAP` trips arriving while backgrounded.

## 24. Phase 35 Architecture: Scheduled-Ride SLA Monitor & Auto-Dispatch / Offer Cascade

### 24.1 Architectural Guardrails & Pure Domain Isolation
- Per `constitution.md`, keep all candidate eligibility filtering, spatial/idle/score ranking, SLA urgency math, and sequential offer cascade state transitions in pure, deterministic, unit-testable domain services under `app/core/services/dispatch/` (`sla-monitor.service.ts` and `auto-dispatch.service.ts`), never inline in React components.
- Enforce defense-in-depth relative URL validation (`rawUrl.startsWith('/') && !rawUrl.startsWith('//')`, else `'/app/driver'`) in `public/sw.js` and `app/routes/api.push.ts`.

### 24.2 Configuration, Trip Schema & Firestore Security Rules
- **`app/core/types/config.ts` & `app/core/services/config/admin-config.service.ts`**:
  - Define `DispatchAutomationConfig` (`autoOfferOnConfirm: false`, `rankingStrategy: 'nearest_in_zone'`, `offerTimeoutSeconds: 45` clamped `15`–`180`, `maxCascadeAttempts: 3` clamped `1`–`10`, `slaWarningMinutes: 60`, `slaCriticalMinutes: 30`, `airportExtraLeadMinutes: 15`) and `normalizeDispatchAutomationConfig`.
  - Hydrate and persist `AppSettings.dispatchAutomation` in `AdminConfigService` (`DEFAULT_APP_SETTINGS`, `mergeWithDefaults`, `updateSettings`).
- **`app/core/types/trip.ts`, `firestore.rules`, `firebase-booking.service.ts`, `mock-booking.service.ts`**:
  - Add `Trip.offerCascade` and `Trip.slaStatus` schemas; allow `offered -> CONFIRMED` / `offered -> offered` state transitions in `TRIP_STATE_TRANSITIONS`.
  - Add `'offerCascade'` and `'slaStatus'` to the offered-driver `affectedKeys().hasOnly([...])` list in `firestore.rules` (lines 176–198) so driver accept/decline transactions on `/app/driver` succeed under strict security rules.
  - Update `acceptDriverOffer` and `declineDriverOffer` in `FirebaseBookingService` and `MockBookingService` to atomically transition `offerCascade.state = 'accepted'` on accept and clear `offerCascade.activeOfferedDriverId = null` on decline so the cascade coordinator advances immediately without waiting for timeout expiry.

### 24.3 Pure SLA Monitor & Auto-Dispatch Services (`app/core/services/dispatch/`)
- **`sla-monitor.service.ts`**:
  - `evaluateTripSlaUrgency(trip, config, nowMs)`: Evaluates unassigned scheduled `UNCONFIRMED` / `CONFIRMED` / `pending` / `offered` trips, adds `airportExtraLeadMinutes` when `detectAirportInAddresses` matches STL/SUS/CPS, computes `minutesUntilPickup`, and classifies `'normal' | 'warning' | 'critical' | 'overdue'`.
  - `scanUpcomingUnassignedSlaTrips(trips, config, options)`: Batch-scans trips, returns sorted evaluations and counts (`overdueCount`, `criticalCount`, `warningCount`, `normalCount`, `atRiskTrips`).
- **`auto-dispatch.service.ts`**:
  - `rankAutoDispatchCandidates(trip, drivers, zones, config, options)`: Pure deterministic pipeline filtering out off-duty/break, busy/en-route/conflicting, blacklisted/archived drivers, grounded/blacklisted fleet vehicles, `rejectedByIds` / `attemptedDriverIds`, and incompatible vehicle capacities/tiers, then sorting by `nearest_in_zone` (`isCoordinateInZone` + `calculateHaversineDistanceMiles`), `longest_idle_in_zone`, or `highest_driver_score`.
  - `startOfferCascade`, `advanceOrExpireOfferCascade`, `cancelOfferCascade`: Sequential 1-driver-at-a-time offer coordinator (`status: 'offered'`, `offeredToIds: [candidate.driverId]`, `offerExpiresAt`), logging `DISPATCH_OFFERED` / `STATUS_CHANGED` audit events, triggering optional `/api/push` `send_push`, rolling over on decline/timeout, and marking `offerCascade.state = 'exhausted'` (reverting `status` to `'CONFIRMED'` or `'pending'` and `offeredToIds: []`) after `maxCascadeAttempts` or zero remaining candidates.

### 24.4 Serverless Scheduled SLA Cron (`app/routes/api.cron.sla-dispatch.ts`, `app/routes.ts`, `vercel.json`)
- Register `api/cron/sla-dispatch` (`GET` & `POST`) in `app/routes.ts` and configure `"crons": [{ "path": "/api/cron/sla-dispatch", "schedule": "0 10 * * *" }]` in `vercel.json` (daily 4:00 AM Central pre-dawn airport sweep).
- Authenticate via `Authorization: Bearer ${CRON_SECRET}`, `x-admin-secret`, or verified Admin/Dispatcher token (`verifyServerRequestAuth`).
- Support Google Service Account Firestore REST (`FIREBASE_SERVICE_ACCOUNT_JSON`), staff-token Firestore REST, and `IBookingService` local fallback; idempotently stamp `slaStatus.criticalNotifiedAt` and send alert email/SMS to dispatch operations when unattended scheduled rides enter the `critical` / `overdue` window.

### 24.5 Dispatch, Driver & Admin UI Integration
- **Dispatch Console**:
  - `dispatch.tsx`: Lightweight 5s SLA & cascade coordinator effect (`playSlaWarningChime` + `notifyDispatchAlert` once per threshold transition, `advanceOrExpireOfferCascade` on decline/timeout, optional `autoOfferOnConfirm` trigger on confirm/auto-confirmed arrival) plus `handleStartAutoOffer` and `handleCancelAutoOffer` handlers.
  - `DispatchTripQueuePane.tsx`, `TripActionDropdown.tsx`, `DispatchTripDetailsDrawer.tsx`: SLA Urgency Banner with 1-click at-risk filter & jump, SLA countdown badges, isolated 1s live cascade countdown pills, and 1-tap **Auto-Offer** / **Cancel Cascade** actions.
- **Driver App (`DriverOfferSheet.tsx`, `DriverLiveMeterCard.tsx`)**:
  - Isolated 1s countdown badge & progress bar (`Accept within Xs · Step k/N`) whenever `offerCascade?.offerExpiresAt` is present on an incoming offer.
- **Admin Console (`AdminRulesTab.tsx`)**:
  - **Dispatch Automation & Scheduled SLA** card bound to `settings.dispatchAutomation`.

## 25. Phase 36 Architecture: Complete Payment & Invoicing Loop (Stripe Webhooks + 1-Tap Pay Links)

### 25.1 Architectural & Security Guardrails
- **Server-Only Cryptographic & Reconciliation Isolation (`constitution.md`)**:
  - Keep all `node:crypto` HMAC-SHA256 verification, Firestore REST reconciliation, and Stripe REST settlement logic inside server-isolated `*.server.ts` modules (`app/core/services/payments/stripe-webhook.server.ts` and `app/core/services/payments/pay-link.server.ts`), ensuring `api.payments.webhook.ts` and `api.pay.ts` emit `0.00 kB` client chunks.
  - Keep pure token/projection sanitization and anti-tamper fare math in `app/core/utils/pay-token.util.ts` (using Web Crypto / pure TypeScript with zero Node-only imports) and client service methods in `app/core/services/payments/pay-link.service.ts` so React components never embed raw API or domain logic.
- **Anti-Tamper Server Authority**:
  - `create_checkout_intent` ignores any client-supplied base fare or invoice total, reading `baseAmount` exclusively from the persisted `PayLinkProjection`, validating `tipAmount >= 0` (and `0` when `allowTip === false`), and computing `chargeAmount = baseAmount + validatedTipAmount` on the server.
  - `confirm_payment` queries `GET https://api.stripe.com/v1/payment_intents/{id}` on the server and verifies `status` (`succeeded` | `requires_capture`), `metadata.payToken === payToken`, and `amount >= Math.round(baseAmount * 100)` before marking any link, trip, or invoice paid.
- **Zero-PII Public Token Projection (`firestore.rules` & `/payLinks/{payToken}`)**:
  - Mirror `/tripTracking/{trackingToken}`: `/payLinks/{payToken}` permits `get: if true; list: if false; create, update: if isDispatcher() || isDriver(); delete: if isDispatcher();` with a strict `keys().hasOnly([...])` allowlist containing only masked customer/company labels, reference `#`, sanitized route/period summary, sanitized line items, amounts, currency, `allowTip`, `status`, timestamps, and `receiptNumber`.
  - `/paymentWebhookEvents/{eventId}` is locked down to `allow read, write: if isDispatcher();`.

### 25.2 Verified Stripe Webhook Engine (`stripe-webhook.server.ts` & `api.payments.webhook.ts`)
- **`verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret, toleranceSeconds = 300)`**:
  - Parses `t=<unix_sec>` and all `v1=<hex_hmac>` values from `Stripe-Signature`.
  - Rejects missing/malformed headers or `|now - t| > toleranceSeconds` (`400`).
  - Computes `HMAC-SHA256(webhookSecret, "${timestamp}.${rawBody}")` and compares against every `v1` signature via `crypto.timingSafeEqual` to support zero-downtime webhook secret rotation.
- **Dual-Layer Idempotency**:
  - Event-level lock `/paymentWebhookEvents/{event.id}` prevents duplicate Stripe webhook deliveries (`200 { received: true, duplicate: true }`).
  - Settlement-level lock `pi_${paymentIntentId}` (plus deterministic ledger entry IDs) prevents double-posting between synchronous `confirm_payment` and asynchronous `payment_intent.succeeded` webhooks.
- **Event Reconciliation**:
  - `payment_intent.amount_capturable_updated` -> trip `payment.status = 'authorized'` + `TripAuditEvent`.
  - `payment_intent.succeeded` -> reconciles `trip` (`payment.status = 'captured'`, `tipAmount`, `payLink.status = 'paid'`, balanced `fare_revenue`, `tip_collected`, `platform_commission`, `driver_payout` ledger entries) or `invoice` (`status = 'paid'`, `paidAt`, `paymentReference`, AR transaction settlement, `payLink.status = 'paid'`, balanced `invoice_settlement` ledger entry).
  - `payment_intent.payment_failed` / `payment_intent.canceled` -> appends failure/cancellation audit trail without corrupting open balances.
  - `charge.refunded` -> records `refund` ledger entry and stamps refund audit metadata on the linked trip/invoice/payLink.
- **Staff Diagnostics (`GET /api/payments/webhook`)**:
  - Authenticated via `verifyServerRequestAuth` (Dispatcher/Admin only), returning `{ webhookSecretConfigured, stripeConfigured, endpointPath: '/api/payments/webhook', subscribedEvents, recentEvents }`.

### 25.3 Tokenized Pay Links & Public Checkout (`pay-link.server.ts`, `pay-link.service.ts`, `api.pay.ts`, `pay.$payToken.tsx`)
- **`app/routes/api.pay.ts`**:
  - `GET /api/pay?token=pay_...`: IP rate-limited lookup auto-expiring stale `open` links (`now > expiresAt`) and returning sanitized `PayLinkProjection` + `{ stripeConfigured, stripePublishableKey }`.
  - `POST /api/pay`:
    - `create_link`: Staff/Driver authenticated creation/reuse of `/payLinks/{payToken}` for `trip` or `invoice` targets, caching `payToken` on the target record and optionally sending SMS (Twilio) and/or Executive Clean payment-request email (`ResendEmailService`).
    - `create_checkout_intent`: Rate-limited server-authoritative Stripe `PaymentIntent` creation (`automatic_payment_methods[enabled]=true`) with clean `{ stripeConfigured: false, message }` fallback when Stripe is unconfigured.
    - `confirm_payment`: Rate-limited server-verified `PaymentIntent` confirmation sharing `pi_${paymentIntentId}` idempotency with the webhook engine.
- **Public Checkout & Staff Surface Integration**:
  - `app/routes/pay.$payToken.tsx`: Mobile-first Executive Clean standalone checkout route (`/pay/:payToken`) with itemized summary, tip presets (`15%`, `20%`, `25%`, `Custom`, `No Tip`), Stripe Payment Element (`js.stripe.com/v3/`), graceful fallback notice, instant Paid Receipt view, and Print Receipt button.
  - Staff triggers wired into `DispatchTripDetailsDrawer.tsx`, `DriverPaymentTerminalModal.tsx` (`driver.tsx`), `AdminInvoicingSubpage.tsx` (including PDF invoice remittance footer), and `AdminIntegrationsSubpage.tsx` (`webhooks` sub-tab).

## 26. Phase 37 Architecture: Corporate Client Self-Service Portal (`/app/corporate`)

### 26.1 Architectural & Multi-Tenant Security Guardrails (`constitution.md`)
- **Service-Layer Domain Encapsulation**:
  - Isolate all B2B tenant queries, credit utilization math, RFC 4180 CSV expense generation, team/location mutations, PO rotation orchestration, and Admin manager provisioning inside `app/core/services/corporate-portal.service.ts` (reusing `corporate-account.service.ts`, `invoicing.service.ts`, and `pay-link.service.ts`). UI components (`app/routes/corporate.tsx`, `AdminCustomersSubpage.tsx`) remain strictly declarative.
- **Zero-Trust Multi-Tenant Lockdown (`firestore.rules` & Server Auth)**:
  - `/users/{userId}`: Forbid `corporateAccountId` and `corporateAccountNumber` during self-registration (`allow create`) and self-profile edits (`allow update` `affectedKeys().hasAny([...])`) so only `isDispatcher()` can assign or change a user's corporate tenant binding.
  - `isCorporateManagerFor(accountId)`: Requires `isAuthenticated() && hasUserRole('corporate_manager') && 'corporateAccountId' in getUserData() && getUserData().corporateAccountId != null && accountId != null && getUserData().corporateAccountId == accountId`.
  - `/corporateAccounts/{accountId}`: `allow get: if isDispatcher() || isCorporateManagerFor(accountId); allow list: if isDispatcher();` and `allow update` for `isCorporateManagerFor(accountId)` restricted via `affectedKeys().hasOnly(['currentPoNumber', 'poGeneratedAt', 'poNumberHistory', 'authorizedBookers', 'authorizedRiders', 'savedCompanyLocations', 'costCenters', 'updatedAt'])`.
  - `/corporateLookup/{lookupKey}`: Allow `isCorporateManagerFor(resource.data.corporateAccountId)` to update only `['currentPoHash', 'revokedPoHashes', 'updatedAt']` during self-service PO rotation.
  - `/trips/{tripId}` & `/invoices/{invoiceId}`: Stamp top-level `corporateAccountId` on corporate trips (`Trip.corporateAccountId`) and enforce `isCorporateManagerFor(resource.data.corporateAccountId)` on `get`/`list` (and `request.resource.data.corporateAccountId` on `trips` `create`).
  - `server-auth.server.ts` & `pay-link.server.ts`: Hydrate `isCorporateManager`, `corporateAccountId`, and `corporateAccountNumber` in `verifyServerRequestAuth`; permit `corporate_manager` in `POST /api/pay` (`create_link`) strictly when `targetType === 'invoice'` and `loadedInvoice.corporateAccountId === auth.corporateAccountId` (rejecting cross-tenant invoices with `403`).

### 26.2 RBAC, Config Schema & Unified Workspace Routing
- Extend `UserRole` (`'corporate_manager'`) and `AdminUser` (`corporateAccountId`, `corporateAccountNumber`) in `app/core/services/auth/admin-auth.service.ts`.
- Extend `CorporateAccountConfig` in `app/core/types/config.ts` with `authorizedRiders`, `costCenters`, `savedCompanyLocations`, and `portalManagers`.
- Register workspace `'corporate'` (`path: '/app/corporate'`, `requiredRole: 'corporate_manager'`) in `workspace-routing.util.ts`, `app.hub.tsx` (Indigo/Slate theme + `BuildingIcon`), `RoleViewSwitcher.tsx`, `UserDropdown.tsx`, `legacy.redirect.tsx` (`/corporate` -> `/app/corporate`), and `app/routes.ts`.

### 26.3 Corporate Portal Service & UI Architecture (`corporate-portal.service.ts`, `corporate.tsx`, `BookingEngineV2.tsx`, `AdminCustomersSubpage.tsx`)
- **`CorporatePortalService`**:
  - `getCorporateDashboardSummary(corporateAccountId)`: Computes `activeRides`, `completedCycleRides`, `unbilledSpend`, `openInvoiceBalance`, `availableCredit`, and `creditUtilizationPercent = ((openInvoiceBalance + unbilledSpend) / creditLimit) * 100`.
  - `getCorporateTrips(corporateAccountId)` & `exportCorporateTripsCsv(trips, account)`: Scoped Firestore `where('corporateAccountId', '==', id)` + local merge and formula-safe CSV export (`Date, Trip ID, Traveler, Department/Cost Center, PO #, Pickup, Dropoff, Fare, Status`).
  - `getCorporateInvoices(corporateAccountId)` & `getCorporatePrintableInvoice(corporateAccountId, invoiceId)`: Scoped invoice list & printable statement builder integrated with Phase 36 1-tap Pay Links.
  - `updateCorporateTeamAndSettings(corporateAccountId, patch)` & `rotateCorporatePoSelfService(corporateAccountId, reason, actorEmail)`: Strict field-allowlisted self-service mutations and PO rotation audit trail.
  - `provisionCorporatePortalManager(input)`: Secondary Firebase Auth app user creation / existing `/users/{uid}` role binding (`roles: ['corporate_manager']`, `corporateAccountId`, `corporateAccountNumber`) + `account.portalManagers` persistence.
- **`app/routes/corporate.tsx` (`/app/corporate`)**:
  - Guarded for `corporate_manager` (locked to `user.corporateAccountId`) and `admin` (with header **Admin Account Preview Selector**).
  - 4-tab responsive Executive Clean B2B shell: **Overview & Live Rides**, **Book Company Ride** (embedded `BookingEngineV2` with `corporatePortalContext`, Authorized Rider picker, Cost Center selector, and 1-tap Saved Company Locations), **Team, Locations & PO Security**, and **Statements & Billing** (printable PDF modal, CSV export, and 1-tap `/pay/:payToken` checkout).

## 27. Phase 38 Architecture: Live Flight Status Tracking for STL & SUS Airport Pickups

### 27.1 Architectural & Server-Secret Guardrails (`constitution.md`)
- **Pure Domain & Server-Isolated Aviation Layer**:
  - Keep all aviation telemetry contracts in `app/core/types/flight.ts`, pure STL/SUS/CPS terminal resolution & pickup alignment math in `app/core/config/airports.ts`, client orchestration in `app/core/services/flight/flight-status.service.ts`, and upstream HTTP adapters + secret keys in `app/core/services/flight/flight-status.server.ts`.
  - Never expose `FLIGHT_API_KEY`, `AERODATABOX_API_KEY`, `AERODATABOX_RAPIDAPI_HOST`, or `FLIGHTAWARE_API_KEY` to client code; `app/routes/api.flight-status.ts` delegates strictly to `flight-status.server.ts` so its client chunk remains `0.00 kB`.
- **Quota, Rate-Limit & Cache Protection**:
  - Enforce per-IP sliding-window rate limiting (`checkRateLimit`) on public `/api/flight-status` lookups, strict IATA carrier/flight-number parsing (`parseFlightIdent`), and strict `YYYY-MM-DD` `serviceDate` validation.
  - Cache normalized `FlightTelemetrySnapshot` results for **15 minutes** (`900_000` ms) under deterministic key `${airlineCode}_${flightNumber}_${serviceDate}` in both server memory and `/flightStatusCache/{cacheKey}` (Firestore REST).
  - Restrict `forceRefresh: true` cache bypasses and server-side trip `flightTelemetry` mutations strictly to authenticated Dispatchers/Admins (`verifyServerRequestAuth`).
  - Lock down `/flightStatusCache/{cacheKey}` in `firestore.rules` with `allow get: if true; allow list: if false; allow write: if isDispatcher();` (and permit `'flightTelemetry'` / `'flightNotes'` on customer pre-dispatch trip edits).

### 27.2 Pure STL/SUS Terminal Intelligence & Pickup Alignment (`app/core/config/airports.ts`)
- **`parseFlightIdent(airlineInput, flightNumberInput)`**:
  - Resolves carrier names (`"Southwest Airlines"` -> `"WN"`, `"Lufthansa"` -> `"LH"`, `"Air Canada"` -> `"AC"`, etc.) or 2-character IATA codes, strips non-digits/carrier prefixes from `flightNumberInput` (`"WN 1425"` -> `airlineCode: "WN"`, `flightNumber: "1425"`), and validates 1–4 digit flight numbers into `{ airlineCode, airlineName, flightNumber, flightIdent }`.
- **`resolveStlTerminalInfo(airlineCodeOrName, airportCode = 'STL')`**:
  - `SUS` / `CPS`: Returns private FBO ramp/lobby coordination metadata (`terminal: 'Private FBO'`, `pickupDoorGuidance`).
  - `STL` Terminal 2 (`WN` Southwest, `LH` Lufthansa, and international charters): `{ terminal: 'Terminal 2', pickupDoorGuidance: 'Terminal 2 · Baggage Claim Exit Door 12' }`.
  - `STL` Terminal 1 (`AA`, `DL`, `UA`, `AS`, `NK`, `F9`, `AC`, `OO`, `YX`, `G4`, `B6`, `SY`, `MX`, `HA`, etc.): `{ terminal: 'Terminal 1', pickupDoorGuidance: 'Terminal 1 · Lower Level Exit Door 6 / Door 12' }`.
- **`evaluateFlightPickupAlignment(snapshot, scheduledPickupIso, options)`**:
  - Compares `scheduledPickupIso` against `estimatedArrivalIso || scheduledArrivalIso` (plus configurable curb/baggage buffer, default `20`m with checked bags or `15`m carry-on):
    - Flags `conflict: 'pickup_before_arrival'` when `scheduledPickupTime < effectiveArrivalTime`, computing `recommendedPickupIso = effectiveArrivalTime + bufferMinutes`.
    - Flags `conflict: 'significant_delay'` when `snapshot.delayMinutes >= 15` (or arrival-to-pickup drift >= 15m), computing `recommendedPickupIso` preserving the rider's post-landing buffer (or shifting by `delayMinutes`).

### 27.3 Pluggable Aviation Provider Engine (`app/core/services/flight/`)
- **`flight-status.server.ts`**:
  - `AeroDataBoxProvider`: Supports RapidAPI (`x-rapidapi-key`, `x-rapidapi-host`) and direct AeroDataBox (`x-api-market-key` / `Authorization`) against `/flights/number/{flightIdent}/{serviceDate}`, prioritizing STL/SUS arrival legs and normalizing `FlightOperationalStatus`, `delayMinutes`, `originIata`, `terminal`, `gate`, `baggageClaim`, and STL `pickupDoorGuidance`.
  - `FlightAwareProvider`: Queries `https://aeroapi.flightaware.com/aeroapi/flights/{flightIdent}` (`x-apikey`), selects the leg matching `serviceDate` (and STL/SUS destination when present), and normalizes arrival telemetry + STL `pickupDoorGuidance`.
  - `FallbackScheduleProvider`: Deterministic zero-key / upstream-failure fallback enriching the snapshot with resolved STL `Terminal 1` / `Terminal 2` / `SUS` guidance, carrier name, scheduled alignment metadata, and `isSimulatedFallback: true`.
  - Exposes `lookupFlightTelemetryServer` (with injectable `fetchImpl` & `env` for deterministic unit testing), `getFlightIntegrationDiagnostics`, `handleFlightStatusGet`, and `handleFlightStatusPost`.
- **`flight-status.service.ts`**:
  - Client service wrapping `GET / POST /api/flight-status`, `refreshTripFlightTelemetry`, and `syncTripPickupToFlightEta` (updating `Trip.scheduledPickupTime` + `Trip.flightTelemetry`, appending immutable `TripAuditEvent` `STATUS_CHANGED` with `fieldChanges`, and firing `/api/push` + toast notification when `assignedDriverId` is present).

### 27.4 Booking, Dispatch, Driver & Admin Surface Integration
- **Booking (`FlightAssistanceCard.tsx`, `BookingEngineV2.tsx`, `DispatchBookingEngine.tsx`)**:
  - Live STL Terminal & Exit Door guidance badge on airline selection; **"Check Flight Status"** pill button; inline telemetry status card; auto-fill of empty `flightOrigin`; pickup alignment warning with 1-tap **"Use Recommended Pickup Time"**; persistence of `flightTelemetry` on `CreateTripInput`.
- **Dispatch (`DispatchFlightTelemetryBadge.tsx`, `DispatchTripQueuePane.tsx`, `DispatchTripDetailsDrawer.tsx`, `dispatch.tsx`)**:
  - Compact color-coded telemetry pills across Table, Card, and Compact queue layouts; full Flight Telemetry & 1-Tap **"Refresh Flight"** + **"Adjust Pickup Time to New ETA"** controls inside `DispatchTripDetailsDrawer.tsx`.
- **Driver (`DriverTripManifest.tsx`) & Admin (`AdminIntegrationsSubpage.tsx`)**:
  - Live flight status badge, terminal/gate/baggage belt, and STL exit door guidance in `DriverTripManifest.tsx`; Flight Status Telemetry readiness & cache diagnostics card in `AdminIntegrationsSubpage.tsx`.

### 27.5 Phase 38.B Architecture: Quota & Operational Window Gates (Staff-Only, Confirmed-Only & 24-Hour Pickup Lock)
- **Pure Domain Gate (`evaluateFlightCheckEligibility` in `app/core/config/airports.ts`)**:
  - Accepts `{ status, bookingType, scheduledPickupTime, isStaffContext, nowMs }` and deterministically returns `{ eligible, reason, message, unlocksAtIso }`:
    - `!isStaffContext` -> `{ eligible: false, reason: 'staff_only' }`
    - `status` in `['UNCONFIRMED', 'unconfirmed']` -> `{ eligible: false, reason: 'unconfirmed', message: 'Confirm booking first to enable live flight tracking.' }`
    - `status` in `['DECLINED', 'declined', 'cancelled', 'completed']` -> `{ eligible: false, reason: 'terminal_status', message: 'Live flight tracking is disabled for closed/completed trips.' }`
    - `bookingType !== 'asap'` with valid `scheduledPickupTime`:
      - `pickupMs - nowMs > 24 * 3_600_000` -> `{ eligible: false, reason: 'outside_24h_window', unlocksAtIso, message: 'Live flight tracking unlocks within 24 hours of scheduled pickup.' }`
      - `nowMs - pickupMs > 12 * 3_600_000` -> `{ eligible: false, reason: 'past_window', message: 'Pickup window has passed (>12h ago); live flight lookup locked.' }`
    - Otherwise `{ eligible: true }`.
- **Server-Side Staff Auth & Operational Window Enforcement (`flight-status.server.ts`)**:
  - All `GET` and `POST /api/flight-status` requests require Dispatcher/Admin auth (`401` unauthenticated, `403` non-dispatcher) when `isFirebaseConfigured()` or `NODE_ENV === 'production'` (or `enforceAuth: true` in verification tests).
  - `lookupFlightTelemetryServer` rejects `scheduledPickupIso` outside `[-12h, +24h]` of `nowMs` and `serviceDate` outside `[-1, +1]` calendar days of `nowMs` with `400` (`code: 'OUTSIDE_24H_WINDOW'`) before any upstream `fetchImpl` invocation.
- **UI & Service Gate Wiring**:
  - `FlightAssistanceCard` / `FlightTelemetryCheckPanel` default `allowLiveCheck = false` so customer/corporate forms render only local STL Terminal & Exit Door guidance; `DispatchBookingEngine` passes `allowLiveCheck={true}` + `bookingType` + `scheduledPickupIso` to show unlocked live checks within 24h/ASAP and *"Unlocks 24h before pickup"* otherwise.
  - `FlightStatusService.checkFlightStatus` uses `authorizedFetch`; `refreshTripFlightTelemetry` & `syncTripPickupToFlightEta` enforce `evaluateFlightCheckEligibility`; `DispatchTripDetailsDrawer` disables `Refresh Flight` & `Adjust Pickup Time` with inline reason pills when ineligible.

## 28. Phase 39 Architecture (Wave 2 Phase 1): Unified Multi-Channel Thread Engine, Serverless Telephony Persistence & Security Hardening

### 28.1 Architectural & Bundle Isolation Guardrails (`constitution.md`)
- **Domain/Service Separation**:
  - Keep all contact normalization, identity resolution, canonical `threadId` derivation, thread merging, and unread rollup math inside pure/service modules (`app/core/types/comms.ts`, `app/core/services/customer/contact.service.ts`, `app/core/services/comms/comms-thread.service.ts`, `app/core/services/comms/comms-thread.server.ts`). UI components (`CommsHub.tsx`, `SmsThreadPane.tsx`, `VoicemailCallLogPane.tsx`, `EmailDock.tsx`) strictly consume service contracts and `WorkspaceBus` events.
- **Zero-Byte Client Telephony Route (`0.00 kB`)**:
  - Isolate all `twilio` SDK (`AccessToken`, `VoiceResponse`), `node:crypto`, `node:fs`, `node:path`, and secret credential handling inside `app/core/services/comms/telephony-gateway.server.ts`.
  - Refactor `app/routes/api.telephony.ts` into a pure `loader`/`action` wrapper delegating to `telephony-gateway.server.ts` so `api.telephony` compiles to a `0.00 kB` client bundle.
  - Preserve Vercel Hobby cron configuration (`"0 10 * * *"`) in `vercel.json` untouched.

### 28.2 Multi-Channel Schemas, Unified Contact Resolution & Thread Merging
- **Firestore Schemas (`app/core/types/comms.ts` & `firestore.rules`)**:
  - `/commsThreads/{threadId}` (`allow read, write: if isDispatcher();`): `id`, `contactId?`, `contactName`, `contactType`, `primaryPhone?` (E.164), `phones` (E.164[]), `primaryEmail?` (lowercase), `emails` (lowercase[]), `corporateAccountId?`, `corporateAccountName?`, `linkedTripIds`, `channels`, `lastEventAt`, `lastEventAtMs`, `lastChannel`, `lastDirection`, `lastSubject?`, `lastSnippet`, `unreadCountTotal`, `unreadByChannel: { sms, call, voicemail, email }`, `isStarred?`, `isArchived?`, `createdAt`, `updatedAt`.
  - `/commsEvents/{eventId}` (`allow read, write: if isDispatcher();`): deterministic idempotent `id` (`sms_${MessageSid}`, `call_${CallSid}`, `vm_${RecordingSid}`, `em_${emailId}`, `note_${id}`), `threadId`, `channel`, `direction`, `eventType`, `contactId?`, `contactName`, `contactPhone?`, `contactEmail?`, `fromAddress`, `toAddress`, `subject?`, `snippet`, `bodyText?`, `emailMessageId?`, `tripId?`, `deliveryStatus?`, `errorCode?`, `errorMessage?`, `externalSid?`, `recordingSid?`, `durationSeconds?`, `audioUrl?`, `audioDuration?`, `transcription?`, `suggestedBooking?`, `isUnread`, `actorId?`, `actorName?`, `timestampIso`, `timestampMs`.
  - `/telephonyWebhookEvents/{eventId}` (`allow read, write: if isDispatcher();`): webhook delivery audit & idempotency log.
- **Unified Contact & Canonical Thread Resolution (`app/core/services/customer/contact.service.ts`)**:
  - `normalizeEmail(email)`: Strips optional display-name angle brackets, trims, and lowercases valid email addresses.
  - `getContactByEmail(email)` & `resolveUnifiedContact({ phone?, email?, name? })`: Resolves customer records across E.164 phones and lowercase emails so calls/texts from `+13145550199` and emails to `dispatch@chesterfieldtaxi.com` from `amanda.vance@bayer.com` resolve to the same `ContactRecord` and canonical `threadId` (`resolveCanonicalThreadId`).
  - Thread Merge Engine (`mergeCommsThreads` / `CommsThreadService.mergeThreadsForContact`): Automatically merges fragmented phone-only (`thr_phone_...`) and email-only (`thr_email_...`) threads into the canonical `thr_contact_...` thread upon contact save or trip creation, re-pointing all `CommsEvent.threadId` references and recomputing exact `unreadByChannel` rollups.

### 28.3 Client & Server Thread Services (`app/core/services/comms/`)
- **`comms-thread.service.ts`**:
  - Lazy staff-scoped Firestore `onSnapshot` listeners on `/commsThreads` and `/commsEvents` (sanitizing writes via `sanitizePayload`), backed by `localStorage` persistence and `WorkspaceBus` (`COMMS_EVENT_RECORDED`, `OPEN_COMMS_THREAD`, `OPEN_EMAIL_MESSAGE`) synchronization.
  - Exposes `recordCommsEvent`, `addInternalNote`, `markThreadRead`, `markThreadsUnread`, `archiveThreads`, `linkTripToThread`, `mergeThreadsForContact`, `commsEventToInteractionEvent`, and `interactionEventToCommsEvent`.
- **`comms-thread.server.ts`**:
  - Idempotent server ingestion writing to Firestore REST via `getServiceAccountDatastoreToken()` or verified dispatcher `rawToken`, plus bounded in-memory `commsServerStore` retaining inbound webhook events and flushing dirty threads/events to Firestore on authenticated `sync_comms` requests.

### 28.4 Twilio Signature Verification & `/api/telephony` Auth Hardening (`telephony-gateway.server.ts`)
- **`verifyTwilioWebhookSignature`**:
  - Reconstructs external callback URL respecting `x-forwarded-proto` and `x-forwarded-host` behind Vercel, sorts POST form keys lexicographically, computes `HMAC-SHA1(authToken, url + sortedKeyValues)` in Base64, and compares via `crypto.timingSafeEqual`.
  - Enforced on `incoming_call`, `incoming_sms`, `handle_unanswered`, `voicemail_recorded`, `voicemail_transcription`, `call_status_callback`, and `call_recording_status` when `TWILIO_AUTH_TOKEN` is configured in production (`TWILIO_VALIDATE_WEBHOOK_SIGNATURE !== 'false'`), returning `403` on missing or invalid signatures.
- **Endpoint Auth Matrix**:
  - `auth.isDispatcher`: `get_voice_token`, `list_messages`, `list_recordings`, `list_voicemails`, `sync_comms`, `verify_credentials`, `save_credentials` (`401` unauthenticated, `403` non-dispatcher).
  - `auth.isDispatcher || auth.isDriver`: `make_call`, `send_sms`, `end_call`, `get_call_status` (`401` unauthenticated, `403` unauthorized role).
  - `audio_proxy`: Accepts either verified staff `Authorization` Bearer header OR short-lived HMAC-SHA256 query signature (`sig` + `exp` appended by `buildSignedAudioProxyUrl` on staff responses), rejecting unsigned/expired/tampered unauthenticated requests with `401`/`403`.

## 29. Phase 40 Architecture (Wave 2 Phase 2): Single-Mailbox Dispatch Email Backend (`dispatch@chesterfieldtaxi.com`), Resend Inbound Webhook & Outbound Thread Sync

### 29.1 Architectural & Bundle Isolation Guardrails (`constitution.md`)
- **Pure Domain vs. Server Isolation (`0.00 kB` Client Chunks)**:
  - Keep all subject normalization, XSS HTML sanitization, plain-text fallback conversion, and deterministic Email-to-Booking extraction pure and free of Node/DOM globals inside `app/core/services/email/email-booking-parser.ts` and `app/core/types/dispatch-email.ts`.
  - Isolate all `node:crypto` Svix HMAC-SHA256 verification, Resend Receiving API fetches, Firestore REST persistence, and server-side outbound/inquiry recording inside `app/core/services/email/dispatch-email.server.ts` (never exported from client barrels).
  - Keep `app/routes/api.email.webhook.ts` and `app/routes/api.send-email.ts` as thin `loader`/`action` resource wrappers delegating to `dispatch-email.server.ts` so `api.email.webhook`, `api.send-email`, `api.telephony`, and `api.flight-status` all compile to `0.00 kB` client chunks.
  - Scope mailbox handling strictly to `DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com'` and preserve Vercel Hobby cron (`"0 10 * * *"`) in `vercel.json`.

### 29.2 Schema, HTML Sanitizer & Email-to-Booking Parser (`dispatch-email.ts`, `email-booking-parser.ts`)
- **`app/core/types/dispatch-email.ts`**:
  - Defines `DISPATCH_MAILBOX_ADDRESS`, `DispatchEmailFolder`, `DispatchEmailDeliveryStatus`, `DispatchEmailCategory`, `DispatchEmailAttachmentMeta`, `DispatchEmailRecord` (`/dispatchEmails/{emailId}`), `EmailWebhookEventRecord` (`/emailWebhookEvents/{webhookEventId}`), and `DispatchEmailDiagnosticsSummary`.
- **`app/core/services/email/email-booking-parser.ts`**:
  - `normalizeEmailSubject(subject)`: Iteratively strips `Re:`, `Fwd:`, `FW:`, and `[Website Inquiry - ...]` prefixes and collapses whitespace.
  - `sanitizeDispatchEmailHtml(rawHtml)` & `htmlToPlainText(html)`: Removes `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<meta>`, `<link>`, `<base>`, `<svg>`, and `<style>` blocks/expressions, strips all `on*` event attributes and `javascript:`/`vbscript:`/`data:text/html` URIs, allowlists clean email tags (`p`, `br`, `div`, `span`, `strong`, `em`, `ul`, `ol`, `li`, `table`, `blockquote`, `hr`, `a` with `target="_blank" rel="noopener noreferrer"`), and provides plain-text extraction when `text` is absent.
  - `extractSuggestedBookingFromEmail({ subject, textBody, fromName, fromEmail })`: Extracts passenger name, E.164 phone (`sanitizeToE164`), pickup/dropoff addresses + regional airport intelligence (`detectAirportInAddresses`), pickup date/time, IATA flight ident (`parseFlightIdent`), corporate account/PO code (`Account:`, `PO:`, `#CORP-...`, `#BY-...`), and classifies inbound `folder` & `category`.

### 29.3 Svix Webhook Engine, Receiving Fetch & Outbound Sync (`dispatch-email.server.ts`)
- **`verifyResendWebhookSignature`**:
  - Validates `svix-id`, `svix-timestamp` (`toleranceSeconds = 300`), and space-delimited `svix-signature` (`v1,<base64>`) headers against Base64-decoded `RESEND_WEBHOOK_SECRET` (stripping `whsec_`) using `HMAC-SHA256(secretBytes, "${svixId}.${svixTimestamp}.${rawBody}")` and `crypto.timingSafeEqual`.
- **Inbound & Status Webhook Processing (`POST /api/email/webhook`)**:
  - Deduplicates retries via `/emailWebhookEvents/{svixId}`.
  - `email.received`: Validates `dispatch@chesterfieldtaxi.com` recipient in `to`/`cc` (returning `{ received: true, ignored: true }` for unrelated recipients), fetches `/emails/receiving/{email_id}` with `Authorization: Bearer ${RESEND_API_KEY}` when `html`/`text` are not inline, correlates `threadId` via RFC `In-Reply-To`/`References` against stored `rfcMessageId` first then `resolveUnifiedContact` second, persists `/dispatchEmails/{emailId}`, and calls `ingestCommsEventServer` (`email_inbound`, `em_${emailId}`).
  - `email.sent` / `email.delivered` / `email.bounced` / `email.complained` / `email.delivery_delayed`: Updates `deliveryStatus` and `deliveryError` on `/dispatchEmails/{emailId}` and linked `/commsEvents/em_${emailId}`.
  - Staff-only (`auth.isDispatcher`) `GET /api/email/webhook?diagnostics=1` and `GET/POST /api/email/webhook?action=sync_emails`.
- **Outbound & Website Inquiry Sync (`POST /api/send-email`)**:
  - Generates `<em_${emailId}@chesterfieldtaxi.com>` `Message-ID`, sets `replyTo: 'dispatch@chesterfieldtaxi.com'`, forwards `In-Reply-To`/`References` headers to Resend, records customer/corporate outbound emails into `/dispatchEmails` + `CommsThread` (`email_outbound`), records public `contact_inquiry` as unread inbound `inquiries`/`website_inquiry` into `/dispatchEmails` + `CommsThread` (`email_inbound`), and excludes internal `dispatcher_alert` from customer threads.
- **Security Rules & Admin Diagnostics (`firestore.rules`, `AdminIntegrationsSubpage.tsx`)**:
  - `allow read, write: if isDispatcher();` on `/dispatchEmails/{emailId}` and `/emailWebhookEvents/{eventId}`.
  - Dispatch Email & Resend Inbound Webhook diagnostics card in `AdminIntegrationsSubpage.tsx` (`webhooks` sub-tab).

## 30. Phase 41 Architecture (Wave 2 Phase 3): Dedicated `EmailDock` Client Overhaul (Live Folders, Threaded Composer & Cross-Channel Sender Timeline)

### 30.1 Architectural & Bundle Guardrails (`constitution.md`)
- **Pure/Client Domain Service Abstraction**:
  - Encapsulate all `/dispatchEmails` Firestore `onSnapshot` subscriptions, `/api/email/webhook?action=sync_emails` hydration, `localStorage` persistence (`ct_dispatch_emails_v1` & `ct_dispatch_email_drafts_v1`), smart folder filtering, conversation grouping, auto-saved drafts, canned template interpolation, `POPULATE_BOOKING` mapping, and cross-channel sender timeline resolution inside `app/core/services/email/dispatch-email.service.ts`.
  - Never import `*.server.ts` or `node:*` modules into `dispatch-email.service.ts` or any `app/components/domain/dispatch/**` UI component so all `/api/*` resource routes (`api.email.webhook`, `api.send-email`, `api.telephony`, `api.flight-status`) continue compiling to `0.00 kB` client chunks.
  - Keep `EmailDock` strictly scoped to the single operational mailbox `DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com'` and preserve `"0 10 * * *"` in `vercel.json`.

### 30.2 Client Dispatch Email Service, Drafts & Canned Templates (`dispatch-email.service.ts`)
- **Real-Time & Cross-Window Sync**:
  - Subscribes lazily to Firestore `/dispatchEmails` (`orderBy('timestampMs', 'desc')`, `limit(250)`) when `isFirebaseConfigured()`, hydrates/flushes via `authorizedFetch('/api/email/webhook?action=sync_emails')` while preserving newer local triage timestamps, persists to `ct_dispatch_emails_v1` & `ct_dispatch_email_drafts_v1`, and broadcasts `EMAIL_STATE_CHANGED: { unreadCount, updatedAt }` over `WorkspaceBus`.
  - Synchronizes read/unread and archive/trash transitions (`markEmailsRead`, `markEmailsUnread`, `toggleEmailStar`, `moveEmailsToFolder`) bidirectionally with `CommsThreadService` (`em_${emailId}`) so `unreadByChannel.email` never drifts.
- **Drafts, Outbound Authoritative Hydration & Templates**:
  - Manages `DispatchEmailDraft` lifecycle (`saveDraft`, `listDrafts`, `discardDraft` / `deleteDraft`).
  - `sendComposerEmail` calls `POST /api/send-email` (`type: 'direct'`) via `authorizedFetch` with RFC threading context (`threadId`, `inReplyTo`, `references`, `tripId`, `contactPhone`, `contactName`), records a single outbound `DispatchEmailRecord` keyed by the server's authoritative `emailId` (`out_...`) + `rfcMessageId` (preventing duplicate local vs. server records), syncs `CommsThreadService`, and discards any source draft.
  - Provides config-driven `CANNED_DISPATCH_EMAIL_TEMPLATES` (6 templates including STL Terminal 1 Exit Door 6 / Terminal 2 Exit Door 12 / SUS FBO guidance and `{payUrl}`) and pure `interpolateDispatchEmailTemplate(template, context)`.

### 30.3 Modular `EmailDock` Component Architecture (`app/components/domain/dispatch/email/*` + `EmailDock.tsx`)
- **`EmailFolderToolbar.tsx`**: Single-mailbox `dispatch@chesterfieldtaxi.com` header (hidden when `isDocked` inside the Dispatch right drawer to prevent double headers), config-driven folder pills (`Inbox`, `Bookings`, `Inquiries`, `Sent`, `Receipts`, `Drafts`, `Starred`, `Archive`, `Trash`) with live badges, `/` search focus shortcut, `Unread Only` filter, manual `Sync` trigger, and multi-select Batch Action Bar.
- **`EmailMessageListPane.tsx`**: High-density thread/message rows and draft rows with conversation count badges (`> 1`), delivery status pills (`Delivered`, `Sent`, `Bounced`, `Simulated`), attachment chips, category/VIP/Corporate pills, star toggle, selection checkboxes, and `useBottomSheetDragToClose` mobile long-press action sheet.
- **`EmailReaderPane.tsx`**: Chronological threaded conversation viewer collapsing older messages to 1-line headers with click-to-expand and keeping the latest message expanded, `sanitizeDispatchEmailHtml` rendering, bounce/error alert banner, attachment chips, structured **Extracted Booking Card** (`POPULATE_BOOKING`), and `Reply` / `Reply All` / `Forward` triggers.
- **`EmailComposerPane.tsx`**: Supports inline threaded Reply/Reply-All/Forward and New Email composition (`From: Chesterfield Taxi Dispatch <dispatch@chesterfieldtaxi.com>`), `ContactService` recipient autocomplete, collapsible `Cc`, Canned Template picker, 1-tap `/track/...` and `/pay/...` (`getPayLinkService()`) link insertion, debounced auto-save draft indicator, and `Cmd/Ctrl + Enter` send.
- **`EmailCrossChannelRail.tsx`**: Toggleable / side-by-side **Unified Customer Activity & Trips** panel displaying the sender's chronologically interleaved `CommsThread` timeline (`Calls + SMS + Voicemails + Notes + Emails`), matched `Trip` cards (`Open Trip`, `Populate Rebook`, `Insert Tracking Link`, `Insert Pay Link`), and 1-tap `Open in Comms Hub` / `Call Customer` actions.
- **`EmailDock.tsx`, `dispatch.tsx` & `dispatch.popout.tsx`**: Thin orchestrator preserving `EmailDockProps` (`+ trips?`, `onOpenEditTrip?` with `getBookingService()` fallback), live unread badge wiring in `dispatch.tsx`, and full pop-out support in `dispatch.popout.tsx`.

## 31. Phase 42 Architecture (Wave 2 Phase 4): `CommsHub` Multi-Channel Thread UI/UX, Canned SMS Templates & Live Caller CRM Context

### 31.1 Architectural & Bundle Guardrails (`constitution.md`)
- **Pure/Client Domain Service Abstraction**:
  - Encapsulate all canned SMS template definitions, variable interpolation, STL/SUS curbside door resolution, unified CRM context resolution, active/completed trip matching, and multi-channel thread list grouping/filtering inside `app/core/services/comms/comms-templates.service.ts` (exported via `app/core/services/comms/index.ts`).
  - Never import `*.server.ts` or `node:*` modules into `app/core/services/comms/comms-templates.service.ts` or any `app/components/domain/dispatch/comms/*` component so all `/api/*` resource routes (`api.email.webhook`, `api.send-email`, `api.telephony`, `api.flight-status`, `api.pay`) retain `0.00 kB` client chunks.
  - Keep `EmailDock` as its dedicated email dock while surfacing unified cross-channel Email timeline cards + 1-tap `OPEN_EMAIL_MESSAGE` deep-links inside `CommsHub`, and preserve `"0 10 * * *"` in `vercel.json`.

### 31.2 Canned SMS Templates, CRM Context & Thread Grouping Service (`comms-templates.service.ts`)
- **`CANNED_DISPATCH_SMS_TEMPLATES` & `interpolateCommsSmsTemplate(template, context)`**:
  - Defines 6 config-driven operational templates: `driver_en_route`, `driver_arrived`, `airport_curbside`, `reservation_confirmed`, `payment_link`, and `flight_checkin`.
  - Resolves `{firstName}`, `{passengerName}`, `{tripId}`, `{pickupTime}`, `{pickupShort}`, `{dropoffShort}`, `{driverName}`, `{carUnit}` (normalized `"Car #..."`), `{trackingUrl}`, `{payUrl}`, and `{airportCurbsideGuidance}` (via `resolveStlTerminalInfo` for STL Terminal 1 Exit Door 6, STL Terminal 2 Exit Door 12, and SUS FBO) with safe fallbacks and final `{...}` scrubbing so zero raw placeholders ever remain.
- **`resolveCommsCrmContext({ phone?, email?, threadId?, contact?, thread?, trips, drivers })`**:
  - Resolves unified contact/thread identity across `ContactService`, `CommsThread`, `trips`, and `drivers`, returning `CommsCrmContextSummary` (`contactName`, `firstName`, `primaryPhone`, `primaryEmail`, `isVip`, `vipReason`, `isBlacklisted`, `blacklistReason`, `corporateAccountName`, `corporateAccountNumber`, `preferredVehicleTier`, `accessibilityBadges`, `tripCount`, `customerScore`, `internalNotes`, `activeTrips` with status label + driver `Car #` + `resolveTripFlightBadge` + `buildTripTrackingUrl` + cached `payToken`/`payUrl`, `lastCompletedTrip`, `rebookPayload` via `buildPopulateRebookPayloadFromTrip`, and pre-built `templateContext`).
- **Multi-Channel Thread Grouping & Filtering (`buildUnifiedCommsThreadSummaries` & `filterCommsInteractionEvents`)**:
  - Groups `InteractionEvent` + `CommsThread` records into canonical conversation rows supporting phone-only, email-only, and unified phone+email contacts with per-channel badges (`sms`, `call`, `voicemail`, `email`, `note`) and unread counts, plus pure `all`/`calls`/`voicemail`/`messages`/`emails`/`notes` filtering.

### 31.3 Multi-Channel `CommsHub`, Timeline Power Tools & `CommsCrmContextBanner`
- **`CommsHub.tsx` & `EmailDock.tsx`**:
  - Subscribes to `getDispatchEmailService()` (and triggers `syncWithServer` + `ensureCommsMirrorSynced()`) inside `CommsHub.tsx` so `dispatch@chesterfieldtaxi.com` inbound/outbound emails hydrate `CommsHub` threads even when `EmailDock` has not been opened yet.
  - Supports canonical `threadId` / `primaryPhone || primaryEmail` thread selection, outbound SMS retry (`handleRetrySms`), `OPEN_EMAIL_MESSAGE` + `FOCUS_MODULE: 'email'` deep-linking (opening matched email or pre-filled compose draft in `EmailDock`), and capture-safe keyboard shortcuts (`/`, `Cmd/Ctrl + Enter`, `Escape`).
- **`SmsThreadPane.tsx`**:
  - `mode === 'list'`: Renders unified multi-channel conversation rows (phone, email, or both) with channel activity pills (`SMS`, `Call`, `VM`, `Email`, `Note`) and unread counts.
  - `mode === 'thread'`: Renders `Call` | `Email` | `Book` header actions, `CommsCrmContextBanner`, upgraded Email cards (delivery status pills, linked `tripId` badge, `Book`, `"Open in Email Dock"`), **1-Tap Retry** on failed/undelivered outbound SMS bubbles, compact `SMS Reply` vs `Internal Note` composer mode toggle, config-driven dynamic Canned SMS chips, and **1-Tap Insert Tracking Link** + **1-Tap Insert Pay Link** (`getPayLinkService()`) buttons (plus upgraded dynamic chips in `NewSmsMessageModal`).
- **`CommsCrmContextBanner.tsx` & `SoftphoneDialerPane.tsx`**:
  - Reusable light/dark CRM banner displaying Blacklist alert (`isBlacklisted`), VIP badge, Corporate Account pill, Accessibility/Vehicle preference tags, Active/Upcoming Trip pill (`Car #`, flight delay badge, 1-tap **Open Trip**), and 1-tap **Rebook Last Ride** (`POPULATE_BOOKING`), rendered in `SmsThreadPane` and `SoftphoneDialerPane` (both during active/ringing calls and live on the dialpad when entered digits match a known contact or trip).

## 32. Phase 43 Architecture (Wave 2 Phase 5): Production Cutover Readiness, Firestore Rules/Indexes Alignment & Headless Browser Smoke Suite

### 32.1 Architectural & Production Cutover Guardrails (`constitution.md`)
- **Strict Boundary Preservation**:
  - Keep all 13 `/api/*` resource routes (`api.public-config`, `api.track`, `api.corporate-verify`, `api.send-email`, `api.email.webhook`, `api.seed-stress-data`, `api.payments`, `api.payments.webhook`, `api.pay`, `api.push`, `api.cron.sla-dispatch`, `api.telephony`, `api.telephony.verify`, `api.flight-status` — specifically the 13 zero-byte server-only routes) isolated from client bundles (`0.00 kB` client chunks).
  - Preserve `"0 10 * * *"` in `vercel.json` untouched for Vercel Hobby compatibility.
  - Keep production server harness and headless browser verification self-contained inside `scripts/serve-prod-build.ts` and `scripts/test-browser-smoke.ts` using existing `devDependencies` (`puppeteer-core`, `tsx`, `@react-router/node`).

### 32.2 CEL-Safe Firestore Security Rules & Composite Index Matrix (`firestore.rules` + `firestore.indexes.json`)
- **`firestore.rules` CEL-Safety & RBAC Verification**:
  - Guard optional map property reads with `'field' in map` checks across document-level `get`, `create`, and `update` rules on `/users`, `/trips`, `/tripTracking`, `/tripTrackingLookup`, `/payLinks`, `/vehicleAssignments`, `/applications`, `/inquiries`, `/corporateAccounts`, `/corporateLookup`, `/invoices`, `/unbilledTransactions`, `/financialLedger`, and `/driverPayouts`, while keeping `allow list` predicates on `/trips` and `/invoices` statically provable for Firestore's query planner.
  - Maintain strict `allow list: if false;` on zero-PII token/hash lookup collections (`/tripTracking`, `/tripTrackingLookup`, `/payLinks`, `/flightStatusCache`, `/corporateLookup`) and strict `allow read, write: if isDispatcher();` on operational comms, email, and webhook idempotency collections (`/paymentWebhookEvents`, `/commsThreads`, `/commsEvents`, `/telephonyWebhookEvents`, `/dispatchEmails`, `/emailWebhookEvents`).
- **`firestore.indexes.json` Composite Index Definitions**:
  - Preserve the 2 baseline `trips` indexes (`status` ASC + `pickupDateTime` ASC; `isAsap` ASC + `status` ASC) and register 7 Wave 1 + Wave 2 composite indexes across `trips` (`corporateAccountId` ASC + `createdAt` DESC; `corporateAccountId` ASC + `scheduledPickupTime` DESC), `invoices` (`corporateAccountId` ASC + `issuedDate` DESC), `commsEvents` (`threadId` ASC + `timestampMs` ASC; `threadId` ASC + `timestampMs` DESC), and `dispatchEmails` (`folder` ASC + `timestampMs` DESC; `threadId` ASC + `timestampMs` ASC).

### 32.3 Vercel-Preset Production Build Server (`scripts/serve-prod-build.ts`)
- **Dynamic `ServerBuild` Discovery**:
  - Inspects `build/server/index.js` first and falls back to `build/server/nodejs_*/index.js` produced by `@vercel/react-router/vite` (`vercelPreset()`), importing the module via `pathToFileURL(serverEntryPath).href` for cross-platform Windows/POSIX ESM compatibility.
  - Hydrates `.env.local` and `.env` into `process.env` (without overriding already-defined environment variables) when started locally.
- **Static Asset Pipeline & SSR Delegation**:
  - Serves `GET`/`HEAD` static files from `build/client` and `public` (preventing path traversal and bypassing `/api/*` and React Router `.data` single-fetch endpoints) with accurate `Content-Type` headers, immutable caching on `/assets/*`, `no-cache` + `Service-Worker-Allowed: /` on `/sw.js`, and baseline security headers.
  - Delegates all SSR document requests, `.data` loader fetches, and `/api/*` actions/loaders to `createRequestListener({ build })` from `@react-router/node`, and exposes `close()` using `server.closeAllConnections()` for deterministic teardown.

### 32.4 Headless Chromium Smoke & Hydration Suite (`scripts/test-browser-smoke.ts`)
- **Browser Discovery & Instrumentation**:
  - Resolves `process.env.CHROME_PATH`, Windows Chrome/Edge installation paths, and macOS/Linux Chromium binaries, launching `puppeteer-core` in headless mode against `startProdBuildServer({ port: 0, host: '127.0.0.1' })`.
  - Records `pageerror`, `console` (`error` and React hydration warnings `#418`, `#423`, `Hydration failed`), same-origin `>= 500` responses, and `/assets/*` chunk failures across:
    1. Public & customer SSR routes (`/`, `/book`, `/services`, `/about`, `/contact`, `/apply`, `/terms`, `/privacy`, `/track`, `/pay/pay_smoke_invalid_token_check`, `/app/login`, `/app/register`).
    2. PWA & static endpoints (`/manifest.json`, `/manifest-driver.json`, `/sw.js`).
    3. Serverless API endpoints (`/api/public-config`, `/api/send-email`, and unauthenticated `401`/`403` JSON enforcement on `/api/telephony?action=list_messages`, `/api/flight-status?diagnostics=1`, and `/api/email/webhook?diagnostics=1`).
    4. Authenticated/role-gated application workspaces (`/app`, `/app/dispatch`, `/app/dispatch/popout?module=email`, `/app/dispatch/popout?module=comms`, `/app/driver`, `/app/corporate`, `/app/admin`).
  - Guarantees clean browser and HTTP server shutdown inside `finally`.

## 33. Phase 44 Architecture (Wave 3 Phase 1): Server/Client Bundle Separation & Route-Level Lazy Chunking

### 33.1 Zero-Behavior-Change & Bundle Isolation Guardrails (`constitution.md`)
- **Non-Functional Refactor Invariants**:
  - Zero changes to pricing pipeline formulas, Firestore schemas/rules/indexes, `/api/*` request/response JSON contracts, UI layout/styling, `WorkspaceBus` event payloads, or SSR/client initial render trees.
  - Preserve `"0 10 * * *"` in `vercel.json` and enforce zero secret-shaped literals across `app/` and `scripts/` (`constitution.md` Section 3).

### 33.2 Server-Only Public Config Loader (`app/core/services/config/public-settings.server.ts`)
- **`loadPublicSettingsForServer()` Extraction**:
  - Moves `loadPublicSettingsForServer()` out of `app/routes/api.public-config.ts` into `app/core/services/config/public-settings.server.ts` (`*.server.ts` boundary).
  - Both `app/routes/api.public-config.ts` and `app/routes/book.tsx` import `loadPublicSettingsForServer` from `../core/services/config/public-settings.server` so React Router's Vite compiler strips the server dependency graph from client bundles and all **14** `/api/*` routes emit `0.00 kB` client chunks.

### 33.3 Vehicle Tier Formatter Decoupling & Server-Gated Email Templates (`vehicle-tier-format.util.ts`, `resend-email.service.ts`)
- **Pure Formatter Utility (`app/core/utils/vehicle-tier-format.util.ts`)**:
  - Houses `formatVehicleTier` and `formatVehicleTierDisplay` with zero email/template dependencies; re-exported from `app/core/services/email/email-templates.ts` for backward compatibility while all 12 client/UI routes and components import directly from `vehicle-tier-format.util.ts`.
- **Dynamic Server-Only `resend` & `./email-templates` Loading (`resend-email.service.ts`, `email/index.ts`)**:
  - Removes static top-level `import { Resend } from 'resend'` and `./email-templates` imports from `resend-email.service.ts` and removes `export * from './email-templates'` from `app/core/services/email/index.ts`.
  - Loads `resend` and `./email-templates` via dynamic `await import(...)` strictly inside server-side (`typeof window === 'undefined'`) execution branches so browser calls remain lightweight `fetch('/api/send-email')` requests and the `~74 kB` `email-templates` chunk is eliminated from browser bundles.

### 33.4 Route-Level & Workspace Lazy Chunking (`admin.tsx`, `dispatch.popout.tsx`, `dispatch.tsx`)
- **Admin Console Per-Tab Splitting (`app/routes/admin.tsx`)**:
  - Replaces static barrel imports from `../components/domain/admin`, `AdminIntegrationsSubpage`, and `AdminRulesTab` with 14 direct module `React.lazy()` definitions wrapped in a `<Suspense>` spinner inside `<main>`, shrinking the `admin-*.js` route entry chunk below `120 KB`.
- **Dispatch Contextual Email Extraction & Lazy Workspace Modules**:
  - Moves `getContextualEmailMeta` and `sendDispatchContextualTripEmail` into `app/core/services/dispatch/dispatch-trip-email.util.ts` (re-exported from `DispatchTripDetailsDrawer.tsx`) so `app/routes/dispatch.tsx` no longer statically pulls in `DispatchTripDetailsDrawer.tsx`.
  - Wraps `CommsHub`, `EmailDock`, `DispatchBookingEngine`, and `LiveFleetMap` with `React.lazy()` + `<Suspense>` in `app/routes/dispatch.popout.tsx`.
  - Wraps `CommsHub`, `EmailDock`, `AppSuiteLauncher`, and `DispatchTripDetailsDrawer` with `React.lazy()` + `<Suspense>` in `app/routes/dispatch.tsx`, keeping desktop `CommsHub` mounted once loaded for WebRTC softphone continuity and conditionally mounting `DispatchTripDetailsDrawer` when any modal target (`reviewTrip`, `auditTrailTrip`, `driverModalTrip`, `completeTripTarget`) is active.

### 33.5 Automated Bundle Budget Gate (`scripts/test-browser-smoke.ts`)
- Extends `verifyCutoverConfigInvariants(rootDir)` to scan `build/client/assets/`:
  - Asserts all 14 `api.*.js` chunks are `< 1024` bytes (`0.00 kB`).
  - Asserts the `admin-*.js` route entry chunk is `< 153600` bytes (`< 150 KB`).

## 34. Phase 45 Architecture (Wave 3 Phase 2): Dual Booking Engine Decomposition (`BookingEngineV2.tsx` & `DispatchBookingEngine.tsx`)

### 34.1 Zero-Behavior-Change & Hydration Guardrails (`constitution.md`)
- **Strict Functional & SSR Determinism Parity**:
  - Zero changes to pricing/surcharge formulas, route/waypoint debouncing, return-trip seeding & symmetric round-trip fare balancing, corporate PO verification & credit-limit checks, Stripe card pre-authorization / in-cab fallbacks, multi-car convoy splitting & `multiCarAssociates` linkage, recurring schedule creation, edit-mode locking, or `WorkspaceBus` (`POPULATE_BOOKING`) integration.
  - Maintain deterministic React 19 SSR hydration: `useState` initializers must never read `localStorage` during initial render; client-only storage/timezone defaults run strictly inside `useEffect`.
  - Preserve `"0 10 * * *"` in `vercel.json`, zero secret-shaped literals across `app/` and `scripts/` (`constitution.md` Section 3), and `0.00 kB` client chunks across all 14 `/api/*` routes.

### 34.2 Customer Booking Engine Architecture (`BookingEngineV2.tsx` `< 1,600` lines)
- **Hook & Form Model (`app/core/hooks/booking/useCustomerBookingSubmission.ts`)**:
  - Defines `CustomerBookingFormState` + `createInitialCustomerBookingFormState` and encapsulates:
    - Debounced (800ms) outbound & return `bookingService.calculateQuote(...)` orchestration (`quote`, `isQuoteLoading`, `quoteError`, `returnQuote`, `isReturnQuoteLoading`), supporting single-vehicle and multi-vehicle quotes plus `surchargesVersion` reactivity.
    - Full customer validation (`validateForm`, scrolling/focusing the first invalid `[name=...]` or `[data-field=...]` element) and honeypot anti-bot protection (`isBotHoneypotTriggered`).
    - Complete `handleBookRide` submission pipeline: Corporate Portal / `/api/corporate/verify` validation, Stripe `createPreAuthorization`, `editingTripId` in-place `UNCONFIRMED` update, multi-car web convoy creation (`buildPerVehiclePricingSpecs` + `distributeAcrossCars` + `multiCarAssociates`), linked return trip creation & cross-linking, and `sendBookingConfirmation` + `sendAdminDispatchAlert` email dispatch.
- **Section Components (`app/components/domain/booking/sections/`)**:
  - `CustomerRouteTimingSection.tsx`: Section 1 card (ASAP vs. Scheduled switcher, `ModernDatePicker` / `ModernTimePicker`, swap route button, `DispatchLocationInput` pickup/stops/dropoff, route estimate bar, and outbound `FlightAssistanceCard` with `allowLiveCheck={false}`).
  - `CustomerVehicleExtrasSection.tsx`: Section 2 card (3-column passenger/carry-on/checked steppers, oversized cargo categories & notes, child safety seats with Missouri statutory notice, Admin optional custom extras, and single/multi-vehicle tier selector with restriction badges).
  - `CustomerReturnTripSection.tsx`: Standalone round-trip card (`Add Return Trip` switch, return date/time, return route/stops/swap, return `FlightAssistanceCard`, return pax/bags/oversized/car-seats/custom-extras, return single/multi-vehicle selector, and return estimated fare bar).
  - `CustomerPassengerNotesSection.tsx`: Section 3 card (primary passenger name/phone/email, additional passengers list, booker/coordinator drawer, and collapsible special requests / gate code / driver notes).
  - `CustomerPaymentSection.tsx`: Section 4 Payment Method card (`card` / `cash` / `account` tabs, `StripePaymentInput` vs. Pay-in-Car toggle, Corporate Portal / public corporate account & PO inputs) plus `CustomerTripSummaryCard` (sticky right-column itinerary preview, `PriceBreakdownPanel`, SMS/Terms checkboxes, validation banner, desktop submit CTA) and `CustomerMobileSubmitBar` (sticky mobile bottom bar).
- **Orchestrator (`app/components/domain/BookingEngineV2.tsx`)**:
  - Retains all public props, types, and utility re-exports (`formatUsPhone`, `formatTime12h`, `COMMON_FBO_FACILITIES`, etc.) for 100% backward compatibility with `app/routes/book.tsx`, `app/routes/app.tsx`, `app/routes/corporate.tsx`, and `scripts/stress-test-web-booking.ts`.

### 34.3 Operator Dispatch Booking Engine Architecture (`DispatchBookingEngine.tsx` `< 1,700` lines)
- **Submission, Quote & Hydration Hook (`app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts`)**:
  - Encapsulates:
    - Pure snapshot & hydration helpers (`buildDispatchFormValuesSnapshot`, `hydrateDispatchStateFromInitialTrip`, `applySavedDraftOverlayToDispatchState`, `buildDispatchDraftStoragePayload`) eliminating duplicated 120-field object literals while keeping `hasHydratedDraft` mount-race protection intact.
    - Debounced outbound (550ms) and return (650ms) 4-pillar `bookingService.calculateQuote(...)` effects (honoring `skipFirstEditQuoteRef` in Edit Mode, multi-vehicle non-duplicated extras math, named pricing rules, corporate/courtesy discounts, and fee waivers).
    - Complete `handleSubmit` workflow: corporate PO & credit-limit validation (`validateDispatchAccount`), Edit Mode unsplit -> multi-car convoy split (`Car 1` update + `Cars 2..N` sibling creation + `multiCarAssociates`), standard Edit Mode update (respecting `isCompleted` / `isCancelled` locks), new single-car or multi-car convoy creation + Car 1 direct driver assignment, linked single/multi-car return leg creation, recurring schedule occurrence creation (`generateRecurringDates`), and consolidated passenger confirmation email dispatch.
- **Operator Section Components (`app/components/domain/dispatch/booking/`)**:
  - `DispatchConvoyBanners.tsx`: Completed/cancelled trip lock notices, `submitError` alert banner, linked multi-car convoy edit banner (`CAR k/N` with sibling `Open` buttons), and multi-vehicle split info notice.
  - `DispatchRoutingTimingSection.tsx`: Pickup Time pill switch (`Later` vs `ASAP` + `Draft saved` / `Edits cached` badge), Outbound Route card (`DispatchLocationInput` pickup/stops/dropoff + swap + `+ Flight Info` + `Add stop`), and Outbound Airport/Private Aviation FBO + `FlightTelemetryCheckPanel` (`allowLiveCheck={true}`).
  - `DispatchPassengerCrmSection.tsx`: Primary passenger name/phone/email with instant `ContactService` + `lookupTrips` caller autocomplete, `VIP` / `BLOCKED` / Corporate badges, recent address quick-fill chips, additional passenger rows, and booker/contact person expansion.
  - `DispatchExtrasVehicleSection.tsx`: Trip Details 3-column steppers, oversized cargo, 3-tier child safety seats, Admin custom extras, collapsible special requests & gate code, and inline multi-vehicle selector with live per-tier quotes & capacity guards.
  - `DispatchPaymentAssignmentSection.tsx`: Segmented `cash` / `card` / `account` tabs, PCI-safe card reference sub-panel, corporate account selector + live PO anti-fraud feedback & supervisor override, named pricing rule/tariff & `%`/`$` discount controls, fee waiver chips, company & driver assignment, and `Notes for All` + `Internal Notes`.
  - `DispatchReturnRepeatSection.tsx`: Linked round-trip lock card (`Open Outbound/Return Leg in New Tab`) or interactive Return Trip panel (return route/stops/swap, return flight telemetry check, date/time, pax/bags/oversized/car-seats, return vehicles, auto-create toggle) + Repeat / Recurring Ride schedule panel.
  - `DispatchBookingFooterBar.tsx`: Expandable `PriceBreakdownPanel` drawer, sticky bottom action bar (manual fare override input, `Details` toggle, round-trip leg split, `Email Confirm` toggle, `Copy Booking` / `Clear`, `Book` / `Update` submit button), and Clear Form `ConfirmationModal`.
- **Orchestrator (`app/components/domain/dispatch/DispatchBookingEngine.tsx`)**:
  - Keeps `export const DispatchBookingEngine = React.memo(DispatchBookingEngineComponent)` and all `DispatchFormValues` / `DispatchBookingEngineProps` exports 100% intact.

### 34.4 Monolith Prevention Guardrail (`scripts/test-browser-smoke.ts`)
- Extends `verifyCutoverConfigInvariants(rootDir)` to read `app/components/domain/BookingEngineV2.tsx` and `app/components/domain/dispatch/DispatchBookingEngine.tsx` and assert each file has `< 1800` lines (`split(/\r?\n/).length < 1800`).

## 35. Phase 46 Architecture (Wave 3 Phase 3): Dispatch Workspace Decomposition & Responsive Trips Queue

### 35.1 Architectural, SSR Determinism & Bundle Guardrails (`constitution.md`)
- **Strict Functional & SSR Hydration Parity**:
  - Preserve 100% of existing dispatch triage flows, SLA alerts, offer cascades, flight telemetry, Stripe pay links, standardized SMS/Email floating `+` compose & bottom-docked composers, mobile 5-tab `Trips · Booking · Comms · Email · Fleet` navigation, and `WorkspaceBus` synchronization.
  - All `useState` initializers must remain 100% deterministic across Node SSR and initial browser render (never reading `localStorage` or `window.innerWidth` inside `useState` initializers; `ResizeObserver` and `localStorage` hydration run strictly inside `useEffect`).
  - Keep all 14 `/api/*` resource routes at `0.00 kB` client chunks, `admin-*.js` `< 150 KB`, zero secret-shaped literals across `app/` and `scripts/` (`constitution.md` Section 3), and `"0 10 * * *"` in `vercel.json`.

### 35.2 Responsive Trips Queue & Modular Views (`app/components/domain/dispatch/queue/*` & `DispatchTripQueuePane.tsx` `< 900` lines)
- **Pure Layout & Column Calculator (`app/components/domain/dispatch/queue/trip-queue-layout.util.ts`)**:
  - `TABLE_OVERFLOW_MIN_WIDTH_PX = 860`: Minimum Trips Queue container width required for dense table columns without horizontal clipping/overflow.
  - `resolveEffectiveQueueDisplayLayout({ displayLayout, isDesktop, queueWidthPx })`:
    - On mobile (`!isDesktop`), returns `{ effectiveDisplayLayout: 'cards', isAutoCardsFallback: false }`.
    - On desktop when `displayLayout === 'table'` and `queueWidthPx > 0 && queueWidthPx < 860`, returns `{ effectiveDisplayLayout: 'cards', isAutoCardsFallback: true }` without mutating the user's persisted `'table'` preference; once `queueWidthPx >= 860` (or `queueWidthPx === 0` pre-measure), returns `{ effectiveDisplayLayout: 'table', isAutoCardsFallback: false }`.
    - Otherwise returns `{ effectiveDisplayLayout: displayLayout, isAutoCardsFallback: false }`.
  - `computeResponsiveTripCardColumns(queueWidthPx)`:
    - Returns `null` when `queueWidthPx <= 0` (allowing `@container/tripqueue` CSS container queries to govern initial SSR/pre-measure layout).
    - Returns `1` for `< 580px`, `2` for `580–899px`, `3` for `900–1219px`, and `4` for `>= 1220px`.
- **Decomposed Queue Sub-Modules (`app/components/domain/dispatch/queue/`)**:
  - `TripQueueToolbar.tsx`: Queue status tabs, search input, date-range picker, urgency/filter pills, multi-select batch action bar, and Layout switcher dropdown (`Cards`, `Table`, `Compact`) rendering `Cards (Auto)` badge/label when `isAutoCardsFallback` is active.
  - `TripQueueTableView.tsx`: Dense operational table view with sortable headers, status/SLA/flight/convoy pills, driver assignment & cascade controls, and row actions.
  - `TripQueueCardsGrid.tsx`: Container-responsive card grid (`@container/tripqueue` wrapper + inline `gridTemplateColumns: repeat(${cardColumns}, minmax(0, 1fr))` when `cardColumns !== null`) so resizing either sidebar smoothly reflows `1..4` card columns in real time.
  - `TripQueueCompactList.tsx`: High-density single-row compact list view.

### 35.3 Dispatch Workspace Route Decomposition (`app/routes/dispatch.tsx` `< 1,750` lines)
- **Extracted Dispatch Hooks (`app/core/hooks/dispatch/`)**:
  - `useDispatchPanelResize.ts`: Manages `leftSidebarWidth`, `bottomQueueHeight`, `rightDockWidth`, active drag state, pointer-move/pointer-up clamping against viewport bounds, and post-mount `localStorage` hydration/persistence.
  - `useDispatchSlaCascadeLoop.ts`: Encapsulates the periodic SLA urgency scanner, tactical alerts computation, sound/browser notification triggers, and expired driver-offer auto-cascade loop.
- **Extracted Workspace Shell Components (`app/components/domain/dispatch/workspace/`)**:
  - `DispatchDesktopTopHeader.tsx`: Incoming call banner, `Main | Phone | Email | Drivers` workspace mode switcher with live unread/active badges, `DispatchHeaderCallHud`, Tactical Alerts bell popover, audio/wake-lock/push settings menu, and `<Suspense>`-wrapped `AppSuiteLauncher`.
  - `DispatchNavigationShell.tsx`: Left slide-out operations/profile navigation drawer and mobile 5-tab `Trips · Booking · Comms · Email · Fleet` bottom navigation bar.
  - `DispatchRightOperationsDock.tsx`: Resizable right desktop dock hosting `<Suspense>`-wrapped `CommsHub` (preserving hidden-mount WebRTC continuity once initialized), `EmailDock`, and `DispatchDriverRosterPane` with drag resizer handle.

### 35.4 Trip Details Drawer & CommsHub Decomposition (`DispatchTripDetailsDrawer.tsx` `< 1,200`L & `CommsHub.tsx` `< 1,600`L)
- **Trip Details Drawer Sub-Modules (`app/components/domain/dispatch/drawer/`)**:
  - `TripDrawerOverviewSection.tsx`: Itinerary stops, passenger/booker CRM summary, chauffeur/vehicle assignment & cascade status, airport flight telemetry & 1-tap pickup ETA sync, multi-car convoy links, and notes.
  - `TripDrawerPricingPaymentSection.tsx`: 4-pillar fare breakdown, Stripe pre-auth/capture/void controls, 1-tap `/pay/...` payment link generation & copy/SMS/email dispatch, corporate PO billing details, and receipt actions.
  - `DispatchCompleteTripModal.tsx`: Trip completion modal with final fare/tip/tolls adjustment, payment settlement confirmation, and receipt trigger.
  - `DispatchTripDetailsDrawer.tsx` preserves all exports (`DispatchTripDetailsDrawer`, `getContextualEmailMeta`, `sendDispatchContextualTripEmail`).
- **CommsHub Sub-Modules (`app/components/domain/dispatch/comms/`)**:
  - `useTwilioSoftphoneDevice.ts`: Encapsulates Web Audio / ringtone synthesis, lazy `@twilio/voice-sdk` `Device` registration & token refresh, inbound/outbound call lifecycle, mute/DTMF/hangup controls, and PSTN bridge fallback.
  - `CommsRowActionSheet.tsx`: Contextual row action sheet / mobile bottom sheet for thread/call/voicemail triage actions (mark read/unread, call, SMS, open email, populate booking, archive).
  - `CommsHub.tsx` remains `React.memo`-wrapped with its standardized bottom-docked SMS composer and floating `+` button intact.

### 35.5 Monolith Prevention Guardrails (`scripts/test-browser-smoke.ts` & `scripts/test-trip-queue-responsive.ts`)
- `scripts/test-trip-queue-responsive.ts`: Unit-tests `resolveEffectiveQueueDisplayLayout` and `computeResponsiveTripCardColumns` across `0px` (SSR), `480px`, `579px`, `580px`, `620px`, `859px`, `860px`, `899px`, `900px`, `950px`, `1219px`, `1220px`, `1280px`, mobile override (`!isDesktop`), `'cards'`/`'compact'` modes, and non-destructive `'table'` user preference preservation across dock open/close cycles.
- `scripts/test-browser-smoke.ts`: Extends `verifyCutoverConfigInvariants` to enforce:
  - `app/routes/dispatch.tsx < 2000` lines
  - `app/components/domain/dispatch/DispatchTripQueuePane.tsx < 1200` lines
  - `app/components/domain/dispatch/DispatchTripDetailsDrawer.tsx < 1500` lines
  - `app/components/domain/dispatch/CommsHub.tsx < 1800` lines

## 36. Phase 47 Architecture (Wave 3 Phase 4): Heavy Admin Subpages & Wave 2 Domain Service Split

### 36.1 Strict Zero-Behavior-Change, Bundle & Security Guardrails (`constitution.md`)
- **Zero-Behavior-Change Invariants**:
  - Preserve 100% of invoicing & AR reconciliation math, corporate PO governance/CSV import/batch invoicing, driver payout & commission split calculations, geofence polygon/circle/group/collection/blacklist logic, Twilio `X-Twilio-Signature` HMAC-SHA1 verification, signed `audio_proxy` token streaming, WebRTC softphone JWT issuance, Resend Svix HMAC-SHA256 webhook verification & RFC email threading, and React 19 SSR hydration determinism.
  - Keep all 14 `/api/*` client route chunks `< 1024` bytes (`0.00 kB`), `admin-*.js` `< 150 KB`, zero `email-templates-*.js` client chunks, zero secret-shaped literals across `app/` and `scripts/` (`constitution.md` Section 3), and `"0 10 * * *"` in `vercel.json`.

### 36.2 Admin Subpages Decomposition (`AdminInvoicingSubpage.tsx` `< 1,200`L & `AdminZonesTab.tsx` `< 1,100`L)
- **Admin Invoicing Modules (`app/components/domain/admin/invoicing/`)**:
  - `useAdminInvoicingActions.ts`: Encapsulates AR & invoice state derivations, QuickBooks/CSV/GL export actions, 1-tap Stripe invoice pay-link copy/email, corporate batch invoicing, PO regeneration/CSV import callbacks, billing/driver commission policy persistence, and Stripe/Square/Twilio live credential testers.
  - `InvoiceLedgerTable.tsx`: Renders the 4 KPI summary cards (`Total Unbilled AR`, `Outstanding >30d`, `Settled Revenue This Month`, `Total Invoiced`) and dual-mode `Accounts Receivable Transactions Ledger` (`ar_ledger` mobile cards + desktop table) / `Invoiced & Reconciled Statements` (`invoices` mobile cards + desktop table).
  - `InvoiceBuilderModal.tsx`: Renders the mobile-sheet-enabled `New Corporate Account` modal, `New Invoice` builder modal, and printable PDF Invoice Preview modal (`#printable-invoice-modal` with 1-tap pay link remittance footer).
  - `CorporateAccountsPanel.tsx`: Renders the `Corporate Accounts` sub-view (search/status/PO filters, paginated corporate cards with Active PO Authorization & Fraud Prevention controls, financial terms, and `RegeneratePoModal` / `PoHistoryModal` / `CorporateCsvImportModal` bindings).
  - `DriverPayoutsPanel.tsx`: Renders the `Accounting Sync & General Ledger` (including `driver_payout` disbursements), `Payment Gateways & Terminals` (Stripe, Square, and `Default Driver Commission Split` / billing policies), and `Twilio Telephony & Voice/SMS Tester` sub-views.
  - `AdminInvoicingSubpage.tsx` (`< 1,200` lines): Clean orchestrator preserving `export type InvoicingSubTab` and `export function AdminInvoicingSubpage`.
- **Admin Zones Modules (`app/components/domain/admin/zones/`)**:
  - `types.ts` & `useAdminZonesController.ts`: Shared sub-tab/map/archive types, coordinate projection helpers, SSR-deterministic state, `ZoneService` subscriptions, memoized filters, and CRUD/consolidation/archive handlers.
  - `ZoneDirectoryListPane.tsx`: Sub-tab top action bar (`ZoneSubTabActionBar`), filter controls, and left-column directory lists for `Operational Geofences` (`zones`), `Zone Groups` (`groups`), `Location Collections` (`collections`), and `Blacklists` (`blacklists`).
  - `ZoneInspectorEditorPane.tsx`: Editor drawers/forms for creating and editing individual Zones (polygon/circle geometry, airport/FBO/surcharge flags), Zone Groups, Location Collections (POI search & radius buffers), and Restricted Blacklists.
  - `ZonePolygonMapCanvas.tsx`: Interactive Google Maps (`InteractiveZoneGoogleMap`) & schematic SVG workspace, vertex drawing/undo/4-point-box/clear controls, and bottom live selection HUD.
  - `AdminZonesTab.tsx` (`< 1,100` lines): Clean orchestrator preserving `export interface AdminZonesTabProps`, `export type AdminZonesSubTab`, and `export function AdminZonesTab`.

### 36.3 Wave 2 Domain Services Split (`< 1,300`L each)
- **Telephony Gateway Split (`app/core/services/comms/`)**:
  - `telephony-credentials.server.ts`: Types & action sets (`TelephonyActionName`, `TelephonyApiRequest`, `StoredVoicemail`, `StoredSms`, `TWILIO_WEBHOOK_ACTIONS`, `DISPATCHER_ONLY_TELEPHONY_ACTIONS`, `OPERATOR_TELEPHONY_ACTIONS`, `TelephonyHttpHandlerOptions`, `TwilioWebhookSignatureResult`), bounded in-memory store & `resetTelephonyGatewayStoreForTests()`, `computeTwilioWebhookSignature` & `verifyTwilioWebhookSignature` (HMAC-SHA1 + `timingSafeEqual`), `signAudioProxyToken` / `buildSignedAudioProxyUrl` / `verifyAudioProxyToken` / `handleTelephonyAudioProxyGet`, `resolveCredentials`, `buildVoiceTokenResponse`, and `buildSyncCommsPayload`.
  - `telephony-twiml-webhooks.server.ts`: Inbound & callback TwiML/webhook handlers for GET and POST (`handleTelephonyWebhookGet`, `handleTelephonyWebhookPostAction`).
  - `telephony-outbound-rest.server.ts`: Outbound PSTN `make_call`, `send_sms`, and `save_credentials` / `verify_credentials` Twilio REST handlers (`handleSaveOrVerifyTelephonyCredentialsPost`, `handleOutboundMakeCallPost`, `handleOutboundSendSmsPost`).
  - `telephony-gateway.server.ts` (`< 1,300` lines): Orchestrates `handleTelephonyGet` and `handleTelephonyPost` and **re-exports 100% of existing public symbols and types** so `api.telephony.ts`, `api.telephony.verify.ts`, and `scripts/test-comms-threads-telephony.ts` require zero changes.
- **Client/Pure Dispatch Email Service Split (`app/core/services/email/`)**:
  - `dispatch-email-catalog.ts` & `dispatch-email-timeline.ts` (strictly client-safe: zero `*.server` or `node:*` imports): Storage keys, folder & badge configs (`DISPATCH_EMAIL_FOLDER_CONFIGS`, `DISPATCH_EMAIL_DELIVERY_BADGE_CONFIG`, `DISPATCH_EMAIL_CATEGORY_BADGE_CONFIG`), canned dispatch email templates & interpolation (`CANNED_DISPATCH_EMAIL_TEMPLATES`, `interpolateDispatchEmailTemplate`, `getCannedDispatchTemplateById`), pure filter/search/folder-count/conversation-thread helpers, `formatDispatchEmailTimestamp`, `buildTripTrackingUrl`, `parseRequestedPickupDateTime`, `buildPopulateBookingPayloadFromEmail`, `buildPopulateRebookPayloadFromTrip`, `buildReplyOrForwardDraftSeed`, `buildDefaultSampleDispatchEmails`, `isActiveOrUpcomingTripStatus`, and `resolveSenderCrossChannelTimeline`.
  - `dispatch-email.service.ts` (`< 1,300` lines): Retains `DispatchEmailService` and `getDispatchEmailService()` and **re-exports 100% of existing public symbols and types** from `./dispatch-email-catalog` and `./dispatch-email-timeline`.
- **Server Dispatch Email & Webhook Engine Split (`app/core/services/email/`)**:
  - `dispatch-email-store.server.ts`: Shared `DispatchEmailServerStore` (`getDispatchEmailServerStore`, `resetDispatchEmailServerStoreForTests`), env/auth policy readers, RFC parent lookup, and Firestore REST persistence helpers.
  - `dispatch-email-webhook.server.ts`: Svix HMAC-SHA256 signature calculation & verification (`DEFAULT_SVIX_TOLERANCE_SECONDS`, `ResendWebhookSignatureResult`, `computeResendWebhookSignature`, `verifyResendWebhookSignature`), Resend inbound `email.received` & delivery status (`email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`) handlers, `flushAndSyncDispatchEmailsServer`, `getDispatchEmailDiagnostics`, and `handleEmailWebhookGet` / `handleEmailWebhookPost`.
  - `dispatch-email.server.ts` (`< 1,300` lines): Retains outbound RFC Message-ID & customer/composer email dispatch (`handleSendEmailPost`, `handleSendEmailGet`) and **re-exports 100% of existing public symbols and types** from `./dispatch-email-store.server` and `./dispatch-email-webhook.server` so `api.email.webhook.ts`, `api.send-email.ts`, `scripts/test-dispatch-email-webhook.ts`, and `scripts/test-email-dock-service.ts` require zero changes.

### 36.4 Monolith Prevention Guardrails (`scripts/test-browser-smoke.ts`)
- Extends `monolithBudgets` in `verifyCutoverConfigInvariants` (`scripts/test-browser-smoke.ts`) to assert:
  - `app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx < 1400` lines
  - `app/components/domain/admin/AdminZonesTab.tsx < 1300` lines
  - `app/core/services/comms/telephony-gateway.server.ts < 1400` lines
  - `app/core/services/email/dispatch-email.service.ts < 1400` lines
  - `app/core/services/email/dispatch-email.server.ts < 1400` lines




