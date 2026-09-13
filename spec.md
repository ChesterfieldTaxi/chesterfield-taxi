# Specification: Functional Outcomes

## 1. Multi-Step Booking Process
The booking portal will guide the user through a sequential, config-driven flow:
1. **Pickup & Dropoff:** Location selection with autocomplete capabilities.
2. **Time Selection:** Options for ASAP or scheduled future bookings.
3. **Vehicle Selection:** Displaying vehicle tiers (e.g., Standard, Premium, XL, Wheelchair Accessible).
4. **Details:** Collecting passenger info, luggage counts, and special requests.
5. **Payment/Confirmation:** Final review and booking submission.

## 2. Server-Side Google Maps Routing
- Routing calculations (distance and duration) must be performed securely on the server or via serverless functions.
- The client-side should only display the results and map visuals, ensuring the pricing engine uses tamper-proof distance and time data from the backend.

## 3. Pure Functional Pricing Engine
- Pricing calculations will be handled entirely by a pure, deterministic functional engine.
- **Inputs:** Distance, Duration, Vehicle Type, Time of Day (for surge pricing), Base Fare.
- **Output:** Final quoted price.
- **Constraint:** The pricing engine must have no side effects (e.g., no database calls or external API mutations within the calculation functions).

## 4. Resend Email Dispatch
- Transactional emails will be sent reliably via Resend.
- **Triggers:** Booking confirmation (User), New booking alert (Admin/Console), and status updates (e.g., Driver Assigned).

## 5. Phase 9: Admin Configuration Panel & Dynamic Firestore Sync
- **Centralized App Settings in Firestore:** Global configuration stored at document `config/appSettings` containing:
  - `company`: name, phone, email, address.
  - `branding`: primaryColor, secondaryColor, logoUrl.
  - `pricing`: baseFare, perMileRate, airportFee, surgeMultiplier.
  - `vehicles`: array of editable vehicle tiers (`id`, `name`, `baseMultiplier`, `maxPassengers`, `maxLuggage`).
- **Client-Side Auth Route Guards:** Protection of `/admin` routes via Firebase Auth state listening (`onAuthStateChanged`). Unauthenticated visitors are redirected to `/admin/login`.
- **Dynamic Pricing & Fleet Hydration:** The pricing engine and booking service dynamically query and apply runtime settings from `config/appSettings`, with resilient fallback to default JSON configs when offline or unconfigured.
- **Interactive Multi-Tab Admin Portal:**
  - Tab 1: General & Branding (company contact info, color pickers, brand identity).
  - Tab 2: Pricing & Rules (base fare, mileage rate, airport surcharge, real-time surge multiplier override).
  - Tab 3: Fleet Management (add, edit, toggle, and delete vehicle tiers with custom capacity and fare multipliers).
  - Tab 4: Live Bookings (live stream of submitted trips from Firestore with status workflow controls).
## 6. Phase 10: Multi-Page Architecture & Site Navigation
- **SPA Multi-Route Architecture:** Refactor public routes into a responsive, multi-page experience powered by React Router v7 layout routes.
- **Persistent Public Layout Wrapper:**
  - `Navbar.tsx`: Responsive navigation header featuring company branding (`/`), dynamic navigation links (`Home`, `Services`, `About`, `Contact`), Admin Console link, prominent "Book Now" CTA (`/book`), and an animated mobile drawer menu.
  - `Footer.tsx`: Universal company disclosures, service area coverage directory, 24/7 dispatch phone and email contacts, quick links, and copyright notices.
- **Dedicated Page Routes:**
  - `app/routes/_index.tsx` (Home Landing Page): High-conversion landing page with hero banner, value proposition badges, instant rate estimation teaser, service area showcase, and direct `/book` CTAs.
  - `app/routes/book.tsx` (Dedicated Booking Portal): Distraction-free route hosting the complete 5-step interactive booking form wizard with live fare calculations.
  - `app/routes/services.tsx` (Services Overview): Detailed service breakdowns (Airport Transfers for Lambert STL & Spirit SUS, Corporate Billing Accounts, Event Transport, Hourly Charters) with vehicle tier specifications and booking CTAs.
  - `app/routes/about.tsx` (About Us): Company heritage in West County, safety certifications, driver vetting standards, and wheelchair accessibility (WAV) guarantees.
  - `app/routes/contact.tsx` (Contact & Support): 24/7 dispatch phone, direct email, business hours, service area coverage list, and an interactive inquiry contact form.

## 7. Phase 11: Airport Logic & Enhanced Wizard Fields
- **Regional Airport Hub Recognition:** Centralized registry defining supported regional airport hubs:
  - Lambert-St. Louis International Airport (STL)
  - Spirit of St. Louis Airport (SUS - Chesterfield VIP/Corporate hub)
  - St. Louis Downtown Airport (CPS)
- **Automatic Route Detection:** Pure functional matching against pickup and dropoff addresses to identify airport journeys without requiring manual user toggling.
- **Flight & Airport Operation Fields (Step 4):**
  - `airlineCode`: Carrier dropdown pre-populated with major commercial airlines (Southwest, American, Delta, United, Alaska, Spirit, Frontier, Allegiant, etc.).
  - `flightNumber`: Validated numeric text input constrained strictly to 1-4 digits (`^\d{1,4}$`) to prevent users from mistakenly entering 6-character alphanumeric booking confirmation codes.
  - `departureAirport`: Originating city or airport code the passenger is flying from (e.g. "Chicago O'Hare (ORD)").
  - `hasCheckedLuggage`: Boolean toggle indicating whether passengers checked bags, alerting dispatchers and drivers to expected baggage claim wait times.
- **Luggage Capacity Warning System:** Live comparison of total baggage count against the luggage limit of the chosen vehicle tier (Sedan: 2, Premium: 3, XL: 5, WAV: 2), displaying proactive warnings when capacity is exceeded.
- **Flight Remarks & Dispatch Metadata:** Seamless integration of airline, flight number, departure airport, and checked luggage status into trip metadata and dispatch notes.

## 8. Phase 12: Brand & Content Centralization
- **Single-Source-of-Truth Brand Configuration:** Centralized module (`app/config/companyConfig.ts`) exposing `COMPANY_CONFIG` containing brand identity and contact information:
  - `name`: "Chesterfield Taxi"
  - `tagline`: "Professional Car Service"
  - `legalName`: "Chesterfield Taxi & Transportation LLC"
  - `phone`:
    - `primary`: "(314) 738-0100" (formatted human-readable display)
    - `primaryRaw`: "+13147380100" (RFC 3966 `tel:` link format)
    - `dispatch`: "(314) 738-0100" (standardized across headers, footers, and cards)
  - `email`:
    - `dispatch`: "dispatch@chesterfieldtaxi.com"
    - `support`: "support@chesterfieldtaxi.com"
  - `operatingHours`: "24 Hours a Day, 365 Days a Year"
  - `serviceAreas`: Standardized coverage list encompassing West St. Louis County, regional airports (STL, SUS), and downtown corridors.
- **Elimination of Hardcoded Strings:** Complete refactor of presentation and route components (`Navbar.tsx`, `Footer.tsx`, `BookingConfirmation.tsx`, `contact.tsx`, `about.tsx`, `_index.tsx`, `services.tsx`, `book.tsx`) to consume `COMPANY_CONFIG`.
- **Airport Origin Code Normalization:** Automatic uppercase conversion (`.toUpperCase()`) of origin airport codes (e.g., `ord` -> `ORD`) during input entry, metadata serialization in `BookingForm.tsx`, and receipt presentation in `BookingConfirmation.tsx`.

## 9. Phase 13: Live Resend Email Integration & Transactional Workflows
- **Production Resend Service Client (`ResendEmailService`):**
  - Integrated with official Resend API for reliable transactional email delivery.
  - Graceful fallback for local development: if `RESEND_API_KEY` is not set or offline, email dispatch logs a simulated delivery to the console without throwing breaking exceptions or crashing the user experience.
  - Sender address standardization: defaults to `${COMPANY_CONFIG.name} <${COMPANY_CONFIG.email.dispatch}>` (`Chesterfield Taxi <dispatch@chesterfieldtaxi.com>`) with environment override support (`RESEND_FROM_EMAIL`).
  - Dispatch alert recipient defaults to `COMPANY_CONFIG.email.dispatch` (`dispatch@chesterfieldtaxi.com`) with override support (`DISPATCH_ALERT_EMAIL`).
- **Secure Serverless Dispatch Bridge (`/api/send-email`):**
  - React Router v7 resource route (`app/routes/api.send-email.ts`) protecting secret `RESEND_API_KEY` on the server so it is never exposed to browser bundles.
  - Client-side invocations seamlessly forward requests to the server action endpoint.
- **Responsive Transactional HTML Email Templates:**
  - **Passenger Confirmation Receipt:** Clean, branded HTML layout including trip reference ID, pickup date/time (ASAP vs scheduled), route details (pickup and dropoff with driver notes), vehicle class, passenger and luggage counts, itemized fare breakdown, flight operations block (airline, flight #, origin city/airport, checked luggage status), and 24/7 dispatch phone (`COMPANY_CONFIG.phone.dispatch`).
  - **Dispatcher Alert Email:** High-visibility alert sent to `COMPANY_CONFIG.email.dispatch` featuring urgency level (`URGENT - ASAP` vs `Scheduled`), passenger contact details (name, phone, email), route details, vehicle class, fare quote, payment method, driver notes, and airport details.
  - **Admin Ride Status Update Notification:** Branded notification sent to the passenger upon state machine status transitions (e.g., Confirmed, Driver Dispatched, Completed, Cancelled) with assigned driver info and dispatch hotline.
- **Automated Workflow Triggers & Visual Feedback:**
  - **Booking Submission:** Automatically triggers both the passenger confirmation receipt and dispatcher alert upon successful trip creation in `BookingForm.tsx`.
  - **Confirmation Screen Visual Feedback:** `BookingConfirmation.tsx` renders dynamic visual feedback confirming dispatch to the passenger's email address (with message ID or simulated development badge).
  - **Admin Status Transition:** Optional automated notification dispatched to the passenger when an admin updates a trip status in `AdminBookingsTab.tsx`.

## 10. Phase 14: Google Maps & Route Matrix Integration
- **Client-Side Google Maps API Loader (`GoogleMapsLoader`):**
  - Robust client-side loader leveraging `@googlemaps/js-api-loader` to load Google Maps JavaScript API with libraries `places`, `routes`, and `geometry`.
  - Securely accesses public API key via `import.meta.env.VITE_GOOGLE_MAPS_API_KEY`.
  - Graceful fallback: If no key is configured or rate limits/network errors occur, the application provides an informative, non-intrusive offline state and preserves full booking functionality using curated St. Louis/Chesterfield regional landmarks.
- **Regional Geographic Bounding & Centering:**
  - Regional centroid centered on Chesterfield, MO (`lat: 38.6631, lng: -90.5771`).
  - Autocomplete location biasing constrained strictly to the St. Louis metropolitan area and West County regional bounds (latitudes `38.35°N` to `38.90°N`, longitudes `90.85°W` to `90.10°W`), enveloping Spirit of St. Louis Airport (SUS), St. Louis Lambert International Airport (STL), St. Louis Downtown Airport (CPS), and West County municipalities (Chesterfield, Wildwood, Ballwin, Town & Country, Creve Coeur).
  - Country restriction constrained to `us`.
- **Places Autocomplete on All Location Inputs:**
  - Integrated on Pickup Address, Dropoff Destination, and Intermediate Stop inputs in the booking form.
  - Extracts full formatted addresses, place IDs, and lat/lng coordinates upon selection, updating form state and triggering instant quote recalculation.
- **Multi-Stop Itineraries (Intermediate Stops):**
  - Config-driven intermediate stop field in Step 1 supporting add/remove stop interactions.
  - Waypoints seamlessly passed to routing engines to calculate cumulative trip mileage and driving durations.
  - Intermediate stop data propagated to `TripLocation` data models, Firestore persistence, and confirmation notifications.
- **Real Directions & Distance Matrix Calculation:**
  - Live driving distance (in statute miles) and driving duration (in minutes) computed via Google Maps `DirectionsService` and `DistanceMatrixService` for authentic road-network turn-by-turn routing.
  - Real metrics feed directly into the pure functional pricing engine pipeline (`calculateTripPricing`), replacing mock and straight-line approximations.
  - Server-side fallback (`server-route.service.ts`) updated to Chesterfield, MO coordinates with optional server-side Google Maps Directions API fetch.

## 11. Phase 15: Master Booking Engine Architecture & Single-Page UI
- **Centralized Form Configuration Engine (`app/config/roleFormConfig.ts`):**
  - Declarative role-based form schemas catering to `customer`, `dispatcher`, and `admin` personas.
  - Section ordering customization: Customer flow prioritizes Pickup Timing & Trip Details first, while Dispatcher/Admin flow leads with instant Passenger Lookup.
  - Role capabilities and permission flags: `canRecurringTrips`, `canPriceOverride`, `canDirectDriverAssign`, `canBypassPayment`, and `hasPassengerLookup`.
  - Resilient runtime hydration with dynamic fallback merging default presets with Firestore `config/appSettings`.
- **Core Master Booking Engine Component (`<BookingEngine />`):**
  - Unified booking interface consolidating customer and operator capabilities into a robust, high-performance module.
  - Accepts `mode="customer" | "dispatcher" | "admin"`, optional role config overrides, and submission handlers.
  - **Passenger Lookup Hook & Service:** As-you-type phone/email lookup querying past customer records, auto-populating contact details, corporate billing codes, and historical routing preferences.
  - **Recurring Trip Generator UI:** Flexible frequency controls (Daily, Weekly, Custom intervals) generating batch trip itineraries linked by a shared `recurringGroupId`.
  - **Manual Price & Payment Overrides:** Allows operators to adjust fares, append itemized billing notes (discounts, surcharge explanations), and toggle offline/in-cab payment bypass modes.
- **Single-Page Customer Booking Portal Refactor:**
  - Elimination of rigid step-by-step wizard friction in favor of a responsive, vertically scrollable single-page portal.
  - Seamless vertical cards:
    1. Pickup Time Selection (ASAP vs Scheduled)
    2. Trip Details & Route (Pickup, Intermediate Stops, Dropoff, Airport Hub Detection & Flight Ops)
    3. Passengers & Luggage (Passenger count, Luggage count, Luggage limit alerts)
    4. Vehicle Selection Cards (Interactive fleet selector with specifications and rate previews)
    5. Passenger Information & Ride Instructions (Contact details, corporate accounts, driver notes)
    6. Payment Options & Disclosures (Payment methods, billing terms)
  - **Sticky Bottom Summary Footer:** Persistent floating summary bar displaying active route, selected vehicle class, real-time fare calculation (`ESTIMATED TOTAL`), and primary "Book Ride" CTA with auto-scroll to missing validations.
  - **Contextual Help & Fare Breakdown Panel:** Right-hand interactive panel featuring input focus listeners (`onFocus`) that dynamically display field-specific guides (flight tracking explanation, corporate billing instructions, airport meetup points) alongside a transparent, itemized fare breakdown.

### 12. Phase 16: Dispatcher & Admin Console Specification
- **Role-Based Access Control (RBAC):**
  - Implement three roles: `customer` (default), `dispatcher`, and `admin`.
  - Deduced securely based on authentication details (`admin@` mapped to `admin`, `dispatch@` mapped to `dispatcher`).
  - Strict Route Guarding:
    - `/admin`: Exclusively for `admin` users. Redirects to `/admin/login?message=unauthorized` if accessed by dispatchers or customers.
    - `/dispatch`: Accessible by both `dispatcher` and `admin` users.
- **Dispatcher Console (`/dispatch`):**
  - Streamlined layout presenting only the "Live Bookings" tab, optimized for fast-paced operational workflows.
  - Real-time Firestore listeners updating the dispatch queue instantly upon customer submission.
  - Status filters (`pending`, `offered`, `assigned`, `completed`) and full text search across passenger, phone, and locations.
  - Vehicle and driver assignment modals, capable of triggering driver broadcasts or direct assignments.
  - Manual status overrides with detailed audit logging and real-time passenger notification triggering via Resend.
- **Advanced Trip Management & Override Capabilities:**
  - `<BookingEngine mode="dispatcher" />` integration within the New Dispatch Booking modal.
  - As-you-type passenger CRM lookup filling past contact profiles automatically.
  - Manual fare/toll overrides, bypassing automated engine calculation for custom jobs.
  - Payment collection bypass features allowing off-platform billing (e.g. corporate invoicing or cash).
  - Recurring Trip Generator UI enabling generation of batch reservations on daily, weekly, or custom schedules.
- **Site-Wide Dynamic Branding:**
  - The saved branding colors from the Admin Settings (e.g., `settings.branding.primaryColor`) dynamically project CSS variables (`--brand-primary`) into the root `layout.tsx`.
  - Enables instant site-wide branding updates across the booking portal without requiring redeployment.

### 13. Phase 17: Multi-Stop Routing, Dynamic Branding CSS Injection, & Advanced Pricing Rules
- **Multi-Stop Routing & Waypoint Management:**
  - Dynamic intermediate stop waypoint management in both Customer Booking V2 (`BookingEngineV2.tsx`) and Single-Page V1 / Dispatcher Engine (`BookingEngine.tsx`).
  - Supports adding up to 5 intermediate stops with individual location autocomplete, optional stop notes, and immediate validation.
  - Interactive waypoint re-ordering (Move Up `↑`, Move Down `↓`) and removal (`✕`), keeping sequential stop ordering intact.
  - Backward compatibility: transparently populates legacy `hasIntermediateStop` and `intermediateStopAddress` properties while emitting full `intermediateStops: TripLocation[]` arrays for storage and email notifications.
  - Google Maps routing engine calculates true road mileage and travel duration across all intermediate waypoints seamlessly.
- **Global Dynamic Branding & CSS Variable Injection:**
  - Injects `primaryColor` and `secondaryColor` hex values from `companyConfig.ts` and Firestore `appSettings` directly into root CSS custom properties (`--color-primary`, `--color-secondary`, `--brand-primary`, `--brand-secondary`).
  - SSR zero-flash protection: initial colors injected directly onto `<html style="...">` attributes during server-side render in `root.tsx`.
  - Client synchronization: dynamic observation in `layout.tsx` updates `document.documentElement.style` on settings change.
  - UI components (such as `Button.tsx` primary and secondary variants, active indicators, and badges) consume CSS variables with built-in fallbacks.
  - Live brand preview card in `AdminGeneralTab.tsx` updates instantaneously to preview brand appearance before saving.
- **Advanced Pricing Pipeline & Dispatcher Overrides:**
  - Pure functional pipeline architecture (`rules.ts`, `pipeline.ts`) supporting:
    - Base fare tiers by vehicle type (`sedan`, `suv`, `van`, `luxury`).
    - Distance rate tiers (0–15 miles baseline, 15+ miles long-haul discount bracket).
    - Multi-stop surcharges (configurable `$5.00` per intermediate stop default).
    - Highway tolls & bridge fees (configurable default or manual custom entry).
    - Peak demand / surge multipliers (configurable surge rules and multipliers).
  - Dispatcher and manager override controls:
    - Waive multi-stop waypoint surcharges (`waiveMultiStopFees`).
    - Waive airport commercial pickup gate fees (`waiveAirportFee`).
    - Bypass peak demand surge multiplier (`bypassSurge`), enforcing 1.0x baseline rates.
    - Custom bridge/highway tolls entry (`customTolls`).
    - Courtesy discount credit (`manualDiscount`).
    - Agreed total flat fare override (`manualFare` + `overrideReason`).
  - Itemized transparent fare breakdown showing all baseline, surcharge, toll, surge, discount, and override line items.

### 14. Phase 18: Admin Console Navigation & Management Restructure
- **Consolidated 8-Element Admin Architecture:**
  - Standardized the `/admin` navigation experience with 8 clean, dedicated views and controls:
    1. **Dashboard**: High-level KPI summary cards (Total Bookings, Active Dispatched Trips, Revenue, Fleet Utilization), interactive visual revenue & trip charts, active trip volume breakdown, and an unassigned booking alert banner with quick dispatch jump links.
    2. **General**: Company contact details, legal business metadata, regional localization (timezone, currency, date formatting), 24/7 operating hours configurations, and live dynamic branding preview with color pickers.
    3. **Rates**: Dedicated pricing control center hosting live base rates, mileage, minute, tolls, and surge parameters, alongside structured shell interfaces ready for Phase 19 Named Pricing Rules and Step Increment Tables.
    4. **Vehicles**: Unified dual-section fleet and asset manager with split sub-navigation:
       - *Section 1 (Vehicle Types)*: Class definitions (Sedan, SUV, Van, Wheelchair/Limo), capacity limits, luggage constraints, and base fare multipliers.
       - *Section 2 (Physical Fleet)*: Asset management table tracking Vehicle #, Type, Make, Model, Year, Color, License Plate, VIN, Insurance details, odometer mileage, status toggles, and maintenance history logs.
    5. **Zones**: Geofence map manager for drawing and saving named polygon and radius zones. Visualizes regional operational zones (Chesterfield Valley, Spirit Airport SUS, Lambert Airport STL, West County Corridor, Downtown Metro) with configurable surge multipliers, flat fees, and interactive polygon/radius geometry.
    6. **Operators**: Integrated staff and driver roster table with role management (RBAC), contact info (name, email, phone), and status toggles (Active vs Suspended). Direct synchronization with Firestore `/users` with filtering for `driver`, `dispatcher`, and `admin` roles.
    7. **Advanced**: Sensitive system configurations (maintenance mode, max dispatch drafts, auto-dispatch interval), API key health monitors (Google Maps, Resend, Firebase), Firestore rule security parameters, and audit logging table tracking administrative actions.
    8. **Dispatch Button**: High-visibility header CTA button that routes the user directly to the `/dispatch` 3-pane console.
- **Dedicated Firestore Schemas:**
  - `/fleet`: Independent collection storing physical asset records (`PhysicalFleetAsset`).
  - `/zones`: Dedicated collection storing regional geofence definitions (`ZoneGeofence`).
  - `/users`: Role-based user documents with support for `'driver' | 'dispatcher' | 'admin'` roles and operational contact records.

### 15. Phase 19: Condition-Based Pricing Matrix & Dynamic Branding Studio
- **Condition-Based Pricing Matrix Engine:**
  - **Named Pricing Rules Repository (`/pricingRules`)**:
    - Centralized Firestore collection storing rule sets evaluated by priority (1-100) with active toggles and `allowDriverSelection` permissions.
    - Regional seeded presets: Spirit of St. Louis Airport (SUS) Corporate Flat Corridor, Lambert Airport (STL) Terminal Gate Fee, Rush Hour Peak Commute Surcharge, Weekend Late Night Safety Stipend, Corporate Account Preferred Pricing, and Long-Distance Interstate Discount.
  - **Dynamic Multi-Condition Triggers**:
    - Spatial Geofence trigger: Matches pickup or dropoff within named polygon or radius zones.
    - Distance Bounds: Evaluates min/max mileage brackets (e.g. 15-30 miles).
    - Schedule & Calendar: Matches day of week, time windows (e.g. 07:00-09:30), and calendar holiday dates.
    - Account Classification: Retail vs Corporate Account vs VIP.
    - Vehicle Class: Target specific vehicle tiers (sedan, executive, xl minivan, wheelchair).
    - Rule Modifiers: Flat fare overrides, multipliers, flat surcharges, and percentage surcharges.
  - **Incremental Distance & Delay Rates**:
    - Flag drop base fare covering initial distance (e.g. $5.00 covering first 1.5 miles before incremental rates trigger).
    - Configurable step increments (e.g. price per 0.1 mile / per 90 seconds wait time).
    - Decaying bracket tiers (e.g., 0-5 mi @ $0.35/0.1 mi, 5-15 mi @ $0.25/0.1 mi, 15-30 mi @ $0.20/0.1 mi, 30+ mi @ $0.15/0.1 mi).
    - Configurable delay/wait time increments ($ per 90 sec after optional grace period).
  - **Condition Surcharges & Extras**:
    - Car Seat Equipment: Flat fee per seat multiplied by total car seat count (rear-facing, front-facing, booster).
    - Extra Passenger Surcharge: Configurable base allowance (e.g. 2 passengers included) with a per-head fee for additional passengers.
    - Vehicle Class Surcharges: Flat or percentage fees per vehicle tier.
    - Operational Zone Surcharges: Dynamic flat or percentage adders linked to `/zones`.
  - **Dispatcher & Driver Operational Controls**:
    - Dispatcher Draft Tabs: Dynamic Named Rule Selector with auto-matching suggestions or manual rule selection, plus manual flat fare overrides.
    - Driver App Console / Quick Action Interface: Mobile-responsive driver view for inspecting trip fares, selecting driver-permitted rules, and applying manual flat fare overrides directly.
- **Granular Dynamic Branding Studio with Live Preview:**
  - **Expanded Token Architecture**:
    - Typography: Heading font family (`--font-heading`), body font family (`--font-body`), heading color (`--color-heading`), body text color (`--color-text-main`), and muted text color (`--color-text-muted`).
    - Buttons: Primary button fill (`--btn-primary-bg`) and text color (`--btn-primary-text`), secondary button fill (`--btn-secondary-bg`) and text color (`--btn-secondary-text`), button border radius (`--btn-radius`).
    - Surfaces: Navbar background (`--navbar-bg`), surface card background (`--card-bg`), and brand accent colors (`--color-primary`, `--color-secondary`).
  - **Side-by-Side Admin Studio Layout**:
    - Left Column: Studio control panel with real-time color pickers, Google fonts selectors, border radius controls, and one-click themed presets.
    - Right Column: Interactive live preview canvas rendering navigation bar, headings, typography, button variants, and sample booking cards.
    - Draft Isolation: Edits in the studio alter the live preview canvas instantaneously without modifying site-wide styles until the operator clicks "Publish Changes to Site-Wide".
  - **Universal CSS Variable Injection**:
    - Published tokens are injected into root HTML styles in `root.tsx`, `layout.tsx`, and `admin.tsx`, guaranteeing uniform styling across all public customer views and internal operator consoles.

### 16. Phase 20: Advanced Condition Rules Engine, Rule Inheritance & Geographic Entity Manager
- **Geographic Entity Engine (`/admin` -> Zones):**
  - **Zone Groups (`/zoneGroups`)**:
    - Group multiple individual geofences (radii and polygons) into named operational clusters (e.g. "Metro West Corridor", "Regional Aviation Hubs", "Out-of-County Zones").
    - Unified spatial evaluation: A trip matches a Zone Group if its pickup or dropoff coordinates lie within any child zone of the group.
    - Configurable cluster-level flat surcharges and percentage multipliers.
  - **Named Location Collections (`/locationCollections`)**:
    - Manage curated registries of Point-of-Interest (POI) markers and address lists (e.g. "Regional Aviation Hubs", "Sports Arenas & Venues", "Metro Transit Stations").
    - Each collection contains structured `LocationPoint` records (`id`, `name`, `address`, `coordinates: { lat, lng }`, `category`, `flatFee`).
    - Proximity-based geofencing matching pickup or destination against collection landmarks with configurable distance thresholds.
  - **Dedicated Firestore Schemas**:
    - `/zones`: Individual radius and polygon geofences (`ZoneGeofence`).
    - `/zoneGroups`: Clustered zone collections (`ZoneGroup`).
    - `/locationCollections`: Point-of-interest sets (`LocationCollection`).
- **Rule Inheritance & Visual Condition Rule Builder (`/admin` -> Rates):**
  - **Rule Inheritance Cascades (Parent/Child Rules)**:
    - Child rules define a `parentRuleId` referencing a parent rule to inherit base fares, distance/time rate tiers, and default surcharges.
    - Child rules dynamically apply delta overrides (e.g. custom flat discount, added surcharge, or rate multiplier) while reflecting updates made to parent rules.
    - Pure functional cascade resolution with cycle detection to prevent circular references.
  - **Visual IF/THEN Condition Rule Builder**:
    - Interactive drawer interface structured around declarative IF [Triggers] THEN [Actions] logic.
    - **IF Triggers**:
      - Geofence: Match specific Zone, Zone Group, or Location Collection.
      - Temporal: Time-of-day windows, days of week, and calendar holiday dates.
      - Trip Bounds: Min/max distance (miles) and min/max duration (minutes).
      - Fleet & Passenger: Vehicle tier classes, equipment (car seats, luggage minimums), and passenger counts.
      - Customer Classification: Account types (`retail`, `corporate`, `vip`) and account tags (e.g. `VIP_TIER`, `AIRPORT_PREFERRED`).
    - **THEN Actions**:
      - Inherit Base Rule: Inherits parent rule rates and overrides.
      - Base / Mileage Rate Overrides: Set custom base fare, per-mile rate, or per-minute rate.
      - Surcharge Adders: Flat or percentage fees (e.g. child seats, excess luggage, zone fees).
      - Rate Multipliers: Peak or promotional scaling factor.
      - Flat Fare Override: Enforce fixed corridor rate.
    - **Execution Control**:
      - Priority ranking with drag-and-drop / up-down reordering.
      - Active/inactive toggle.
      - "Stop Processing on Match" short-circuit execution control.
      - "Allow Driver App Manual Select" permission toggle.
- **Granular Step-Increment Fare Calculation Engine:**
  - Decaying distance step brackets with granular step sizes (e.g. $0.35 per 0.1 mile for miles 0-5, decaying to $0.25 for 5-15, $0.20 for 15-30, and $0.15 for 30+).
  - Delay wait-time step calculation (e.g. $0.60 per 60s/90s under threshold after grace period).
  - Live Fare Matrix Simulator integration with interactive audit trail logging displaying parent rule cascades and step calculation breakdowns.

### 17. Phase 21: Public Booking Engine Overhaul & Dispatcher Confirmation Workflow
- **Public Customer Booking Engine Alignment with Phase 20 Pricing Engine (`/book`):**
  - Connect the customer booking wizard directly into the full multi-tier pricing evaluation pipeline.
  - Evaluate Zone Groups, Location Collections, and geographic geofences server-side and client-side based on pickup and destination coordinates.
  - Apply decaying step-increment rate brackets and condition-based surcharges to upfront quote generation.
- **Granular Equipment & Passenger Selectors:**
  - Car seat breakdown selector by category: Infant (Rear-Facing, max 2), Toddler (Front-Facing, max 3), and Youth Booster (max 3), strictly enforcing the platform vehicle safety limit of 4 total child seats.
  - Granular luggage options: Total bags counter, luggage classification (Checked, Carry-on, Oversized / Sports / Strollers), and passenger counts.
  - Calculate real-time equipment surcharges and validate vehicle category capacity before final submission.
- **UNCONFIRMED Trip Status Lifecycle:**
  - Force all customer-submitted web bookings to enter the system with initial `status: 'UNCONFIRMED'`.
  - Record audit log entry in `statusHistory`: `from: null, to: 'UNCONFIRMED', actorRole: 'passenger', reason: 'Web booking submitted by customer (pending dispatcher review)'`.
  - Disallow direct driver assignment or dispatch until confirmed by a dispatcher.
- **Dispatcher Review & Confirmation Workflow (`/dispatch`):**
  - **Unconfirmed Filter & Visual Alert Badge**:
    - High-visibility interactive filter pill in bottom trip queue with alert badge and pulsing animations when unconfirmed web bookings are pending.
    - Prominent visual alert highlighting for pending unconfirmed rows in the bottom trips queue table.
  - **Dispatcher Review Action Modal**:
    - Comprehensive booking review modal summarizing passenger details, requested vehicle tier, route details, pickup date/time, car seats breakdown (infant/toddler/booster), luggage options, and price breakdown.
    - **Accept Action**:
      - Updates trip status to `'CONFIRMED'`.
      - Automatically dispatches formal passenger confirmation email via transactional email service (Resend).
      - Transitions booking to active dispatch pipeline for driver assignment.
    - **Decline Action**:
      - Interactive rejection interface offering preset standard rejection reasons:
        1. "No driver availability"
        2. "Outside service boundary"
        3. "Vehicle class unavailable"
        4. "Custom message" (with dispatcher message input).
      - Updates trip status to `'DECLINED'`.
      - Automatically dispatches courteous notification email to the passenger citing the rejection reason and providing 24/7 dispatch desk contact options.


