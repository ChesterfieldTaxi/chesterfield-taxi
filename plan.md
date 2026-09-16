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


