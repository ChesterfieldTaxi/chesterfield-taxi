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
    - Child rules dynamically apply delta overrides while reflecting updates made to parent rules.
    - **Inherited Values & Override Toggles**: For inherited rules, parent values are rendered in a disabled state with individual "Override" toggles for Base Drop, Step Tiers, Rate Multipliers, and Surcharges.
    - Pure functional cascade resolution with cycle detection to prevent circular references.
  - **Visual IF/THEN Condition Rule Builder**:
    - Interactive drawer interface structured around declarative IF [Triggers] THEN [Actions] logic.
    - **IF Triggers**:
      - Geofence & Corridors: Match specific Zone, Zone Group, Location Collection, or explicit Origin Zone -> Destination Zone corridors (`fromZoneId` -> `toZoneId`).
      - Temporal: Time-of-day windows, days of week, and calendar holiday dates.
      - Trip Bounds: Min/max distance (miles) and min/max duration (minutes).
      - Fleet & Passenger: Vehicle tier classes, equipment (car seats, luggage minimums), and passenger counts.
      - Customer Classification: Account types (`retail`, `corporate`, `vip`) and account tags (e.g. `VIP_TIER`, `AIRPORT_PREFERRED`).
    - **THEN Actions**:
      - Inherit Base Rule: Inherits parent rule rates and overrides with disabled display and toggleable overrides.
      - Base / Mileage Rate Overrides: Set custom base fare, per-mile rate, or per-minute rate.
      - Surcharge Adders: Flat or percentage fees (e.g. child seats, excess luggage, zone fees).
      - Rate Multipliers: Peak or promotional scaling factor.
      - Flat Fare Override: Enforce fixed corridor rate (e.g. Origin Zone to Destination Zone flat rate).
    - **Execution Control & Usability**:
      - Priority ranking with drag-and-drop / up-down reordering.
      - Active/inactive toggle.
      - "Stop Processing on Match" short-circuit execution control.
      - "Allow Driver App Manual Select" permission toggle.
      - **Priority Collision Detection**: Lightweight non-blocking warning alert when saving rules with identical priority rankings or overlapping trigger criteria.
      - **Test Rule in Simulator Action**: Drawer action button to immediately populate the Live Fare Simulator with matching rule triggers and switch to the simulator view.
- **Granular Step-Increment Fare Calculation Engine:**
  - Decaying distance step brackets with granular step sizes (e.g. $0.35 per 0.1 mile for miles 0-5, decaying to $0.25 for 5-15, $0.20 for 15-30, and $0.15 for 30+).
  - **Open-Ended Step Increments ("And Above / After")**:
    - Embedded Step Increment editor supports an "Open-Ended / After" checkbox for the final distance tier and delay tier.
    - When checked, the upper bound input is replaced with open-ended display (`${startMiles}+ mi` or `After ${startMiles} mi`).
    - Calculation engine processes all subsequent distance or wait time using that final step rate with unbounded capacity (`Infinity`).
  - Delay wait-time step calculation (e.g. $0.60 per 60s/90s under threshold after grace period).
  - Live Fare Matrix Simulator integration with interactive audit trail logging displaying parent rule cascades and step calculation breakdowns.
- **Universal Surcharges & Zone Pair Corridors:**
  - Site-wide Universal Surcharges consolidated into a clean dedicated sub-tab (Child safety car seats, extra headcount allowance, vehicle tier surcharges, and highway toll pass-throughs).
  - Origin Zone -> Destination Zone corridor flat fare overrides inside individual named rules.

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

### 18. Phase 22: Unified Tariff Engine & Hierarchical Profile Architecture
- **Self-Contained Tariff Profiles (`TariffProfile`)**:
  - Replaces fragmented base rate forms with unified, self-contained Tariff Profile containers.
  - Top Profile Tabs: `Standard Flat Rate`, `MiniVan Flat Rate`, `METER`, `MiniVan METER`, with `+ New Tariff` creation and quick profile switching.
  - **Tariff Meta**: Profile Name, Currency (`USD`), Units (`Imperial` / `Metric`), Fare Increment (e.g. `$2.50` or `$0.10`), Priority Rank (1-100), Group Assignment, Parent Inheritance link, and Active status toggle.
  - **Unbranded Native Styling**: Proprietary, clean interface without external system badges, reference watermarks, or tab delete clutter.
  - **Safe Bottom Deletion**: Tab pills are clean navigation buttons without accidental `×` click targets. Each profile page features a dedicated, prominent red "Delete This Tariff Profile" action at the bottom of the workspace with safety confirmation.
  - **Dynamic Entity Configuration**:
    - **Admin-Configured Vehicle Classes**: Dynamically maps to the fleet tiers defined in `settings.vehicles` rather than fixed static arrays.
    - **Spatial Zones & Corridors**: Corridors and trigger matchers pull from live admin geofence zones (`zones`), zone groups (`zoneGroups`), and location collections (`locationCollections`).
    - **Configurable Extras**: Integrates live car seat allowances, extra passenger rates, and custom surcharges.
  - **Multi-Tier Intermediate Distance Increments**:
    - Extends beyond a simple two-bracket model by supporting arbitrary intermediate distance increments between the primary distance limit and the final open-ended "then" tier.
    - Structure: Flag Drop Start Price ➔ Primary Step Bracket (0 to Primary Limit) ➔ N Intermediate Increments (Bracket A up to Limit A, Bracket B up to Limit B, etc.) ➔ Open-Ended "Then" Step Rate (for all remaining miles to infinity).
  - **Tariff Profile Inheritance & Tariff Groups**:
    - **Tariff Groups (`TariffGroup`)**: Admins can define named groups of tariffs (e.g., "Airport Fleet Tariffs", "Standard Metro", "Corporate Contracts") to organize and batch-manage tariffs.
    - **Inheritance Engine**: Profiles can specify a `parentTariffId`. When inheriting, the child profile can inherit the parent's taximeter step rates, flat corridors, and extras, or toggle granular overrides (`overrideTaximeter`, `overrideCorridors`, `overrideExtras`, `overrideTriggers`).
  - **Flat Tariff Matrix (From / To Corridors)**:
    - Inline table mapping Origin (`fromZoneId` / `fromLocationCollectionId`) to Destination (`toZoneId` / `toLocationCollectionId`).
    - Fixed flat price overrides with bidirectional Two-Way Return (`allowReturn`) toggles.
    - Full Import/Export JSON support for corridor collections.
  - **Taximeter Section**:
    - Flag drop start price & included initial distance/time.
    - Primary distance rate per step up to distance limit.
    - N Intermediate distance step tiers.
    - Final "Then" Step Increment rate per step applied open-ended to infinity.
    - Free traffic delay allowance, waiting rate per step interval, and minimum fare floor.
  - **Extras & Surcharges**:
    - Car seat unit fee, passenger headcount allowance & extra passenger fees, vehicle tier multipliers, and custom surcharges.
- **Pure Pricing Pipeline Evaluation Sequence**:
  1. Match the active `TariffProfile` with the highest priority matching the trip's vehicle class, schedule, and pickup/dropoff location.
  2. Resolve any inheritance from `parentTariffId` for non-overridden attributes.
  3. Check if the trip matches an explicit From/To Flat Corridor inside that tariff (honoring return direction). If matched, apply flat fare.
  4. Otherwise, run the trip through the profile's Taximeter Step Bracket calculator (Flag drop + Primary Steps + Intermediate Increments + "Then" Open-Ended Steps + Delay Waiting Steps + Minimum Floor).
  5. Append applicable extras and universal surcharges.
  6. Log complete itemized profile audit trace step-by-step in the Live Simulator.
### 19. Phase 23: Advanced System Audit, Code Maintainability & Stress Testing
- **UI Polish:** Fix Live Fare Simulator sidebar sticky position.
- **Maintainability:** Modular decoupling, dynamic theme abstraction, strict schema typing.
- **Pricing Engine:** Determinism and collision resolution.
- **Stress Testing:** Data seeding utility for 100+ concurrent trips and virtualized list rendering.
- **Security:** Audit firestore.rules and composite indexes.

### 20. Phase 24: Driver Mobile App & Real-Time Sync
- **Mobile-Optimized Driver Console (`/driver`)**:
  - Touch-friendly, high-contrast PWA interface optimized for smartphones, tablets, and in-vehicle dash mounts.
  - Driver authentication and shift toggle: On-Duty, Off-Duty, and On-Break status controls updating driver availability and current active vehicle.
  - Active Trip Card: High-visibility passenger details (name, one-tap calling, pickup/dropoff addresses, intermediate waypoints, passenger count, child safety seat equipment, flight details, and estimated fare).
  - Step-by-Step Trip Lifecycle Transitions: Prominent single-tap status actions:
    * `ACCEPT TRIP` (transitions trip to `assigned` or `accepted`)
    * `EN ROUTE` (transitions trip to `en_route`)
    * `ARRIVED AT PICKUP` (transitions trip to `arrived`)
    * `START TRIP / IN_PROGRESS` (transitions trip to `in_progress`)
    * `COMPLETE TRIP` (transitions trip to `completed`)
    * `DECLINE` / `CANCEL` (returns trip to dispatch queue or cancels with reason).
- **In-Vehicle Live Taximeter & Meter Adjustments**:
  - Active during `in_progress` status.
  - Real-time GPS distance and elapsed duration calculation based on the active Tariff Profile.
  - Manual Extras Adder: Interface allowing drivers to append on-the-fly fees (tolls, airport surcharges, parking, luggage surcharge, cleaning fees) before completing the trip.
  - Immediate fare recalculation reflecting dynamically in total trip cost and audit breakdown.
- **Multi-Party Real-Time Firestore Synchronization**:
  - Live `onSnapshot` listeners connecting driver actions to:
    * Dispatcher Console (`/dispatch` queue tables, status badges, active vehicle tracking).
    * Admin Dashboard (`/admin` active trip monitoring).
    * Public Customer Booking Status Page (`/booking/status/:tripId`).

### 21. Phase 25: Passenger Mobile Web App (`/app`)
- **Mobile-First Passenger Portal (`/app`)**:
  - Dedicated, responsive web application for Chesterfield Taxi passengers, optimized for smartphones and mobile browsers.
  - Streamlined App Chrome: Clean, uncluttered layout with top nav and duplicate profile tabs removed in favor of a minimalist status bar with compact brand logo, customer greeting, and live ride beacon.
  - Self-Contained Booking Flow: Fully embeds the `BookingEngineV2` upfront pricing, vehicle selection, child safety seats, airport flight tracking, and instant confirmation wizard directly in `/app` with zero redirects to `/book`.
  - 1-Tap Saved Places Chips & Rebooking: Single-tap origin/destination chips ("Home", "Work", "Airport") and "Rebook" / "Ride To Here" actions automatically prefill the embedded engine and activate the booking tab in-place.
- **Customer Account & Saved Places Manager**:
  - Profile Management: Contact name, telephone number, email, default vehicle tier, and driver pickup notes (e.g. gate codes, preferred door, building entrance instructions).
  - Communication Preferences: Interactive toggles for SMS dispatch updates, email digital receipts, and driver arrival phone calls.
  - Saved Places CRUD: Add, edit, label, and categorize frequent origins and destinations with icons (`home`, `work`, `airport`, `medical`, `favorite`, `other`).
- **Past Trip Receipts & Ride History**:
  - Itemized Trip History: Filter and view past completed and cancelled reservations with date/time, vehicle tier, driver name, route details, and fare totals.
  - Digital Receipts View & Download: Itemized printable receipt modal (`window.print()` print-ready layout) displaying company credentials, trip token, breakdown of base fare, mileage, waiting time, extras, and payment method.
- **Navigation Decoupling & Dedicated App Shell Layout**:
  - Public Main Navigation Header: Menu links strictly limited to `Home`, `Services`, `Fleet & Rates`, `About`, `Contact`. Includes a sleek "Sign In" button adjacent to the "Book Now" CTA linking into `/app`.
  - Dedicated Passenger App Shell (`/app`): Decoupled from public marketing header and footer with isolated layout.
  - Sticky Bottom & Dock Navigation: Ergonomic bottom navigation bar on mobile and floating bottom dock on desktop with tabs: `[ 🚖 Book ]`, `[ 📜 Trips ]`, `[ 📍 Places ]`, `[ 👤 Profile ]`.
  - Floating Action Button (`?`) & Assistance Popover: Floating button anchored above the bottom nav opening a quick popover with 24/7 Dispatch Desk call button `(314) 738-0100`, direct office line `(314) 738-9921`, interactive Help Center & FAQ modal trigger, email dispatch, and website escape link.
  - Help Center & FAQ Modal: Interactive guide covering airport pickup grace periods at Lambert STL, child car seat accommodations, luggage capacities, and 2-hour free cancellation policy.

### 22. Phase 26: Modular Website Builder & White-Label CMS Studio
- **Modular Component Registry & Dynamic Renderer**:
  - `SECTION_REGISTRY` mapping configurable section types (`hero`, `booking-card`, `tariff-matrix`, `fleet-showcase`, `service-areas`, `testimonials`, `contact-bar`, `custom-html`) to pure UI React components.
  - Page builder engine recursively interpreting JSON schema from the Firestore config to render components dynamically in order.
- **Visual CMS Studio (`/admin?tab=website`)**:
  - Live preview canvas alongside a drag-and-drop layout sorter.
  - Property inspectors bound to each section schema (e.g. Hero headings, background images, and CTA routing).
  - Expanded Theme Switcher with Google Fonts pairings, asset uploads, and accent colors.
- **Advanced Marketing Tools**:
  - SEO / Social Graph Manager allowing Meta Title, Meta Description, and OpenGraph Image configuration per logical route.
  - CodeMirror / Monaco-based custom CSS editor for advanced site restyling.
  - Header & Footer script injection boundaries for installing external marketing analytics and chatbots safely.

### 23. Phase 27: Full-Stack Authentication, OAuth & Session Management
- **Unified Sign-In & Registration Views (`/signin`, `/register`)**:
  - Responsive, professional authentication pages with Email & Password input forms and client/server validation.
  - Social Auth Buttons: One-tap "Continue with Google" and "Continue with Facebook" OAuth buttons.
  - Clean tab toggle to switch between Passenger and Driver registration modes.
- **Role-Based Session Router & Protected Route Guards**:
  - Implementation of authentication state middleware / route guards.
  - Unauthenticated users attempting to access `/admin`, `/dispatch`, or `/driver` are redirected to `/signin?redirect=...`.
  - Automatic evaluation of user role claims upon successful sign-in:
    - Passenger -> `/app`
    - Driver -> `/driver`
    - Dispatcher / Admin -> `/admin` or `/dispatch`
  - Session persistence across page refreshes via secure tokens/cookies using Firebase Auth.
- **Guest-to-User Account Linking**:
  - Adding an option on the Guest Tracking page (`/track/$tripToken`) for guests to "Save Account & Claim Trips" using their booking email/phone, attaching previous guest bookings to their new registered passenger profile in `/app`.

### 24. Phase 28: Admin Onboarding Center, Candidate Processing & Role Provisioning
- **Admin Onboarding Queue (`/admin?tab=operators&sub=onboarding`)**:
  - Build a structured candidate processing dashboard with a table view listing incoming applicants from the `/applications` Firestore collection.
  - Support status filters (Pending, Under Review, Approved, Rejected).
  - **Candidate Dossier Card**: An expandable drawer displaying contact info, target role (Driver, Dispatcher, Accountant), experience, address, license details, and attached documents.
- **Background & Compliance Verification Checklist**:
  - Add interactive compliance controls inside the candidate drawer.
  - Toggles for background check status, driver license verification, MVR clearance, and vehicle insurance approval.
  - Audit log capturing which admin reviewed and updated candidate statuses.
- **One-Click Account Provisioning & Role Injection**:
  - Implement "Approve & Provision Account" action.
  - Create official user account in Firebase Auth / User Database with appropriate role (`driver`, `dispatcher`, `accountant`, or `admin`).
  - Automatically link or create their Driver Profile in the fleet system if the applicant is a Driver.
  - Generate secure initial temporary credentials and render a printable/copyable welcome dispatch sheet (with automated email trigger payload).

## 24. Phase 29: Vehicle Shift History, Audit Trail & Universal Blacklist/Archive Engine + Dual Scoring & Conditional Booking Rules
- **Universal Archive & Blacklist Engine (With Geo-Locations)**:
  - Universal status properties (`isArchived: boolean`, `isBlacklisted: boolean`, `blacklistReason?: string`) across Passengers, Drivers, Staff Operators, Fleet Vehicles, Trips, and Geo-Locations.
  - Passenger Blacklist: Instantly blocks booking submission across public /book and /app if passenger phone or email matches a blacklisted customer profile.
  - Driver/Staff Blacklist: Revokes active session tokens immediately, rejects login attempts at /signin, and prevents shift activation.
  - Vehicle Grounding/Blacklist: Excludes grounded and blacklisted vehicles from driver shift selection in /driver and dispatcher auto-assignment.
  - Location Blacklist: Evaluates pickup/dropoff coordinates and addresses against /blacklistedLocations registry, rejecting creation immediately (Mode C) with security audit logs.
- **Dual-Scoring Engine (Driver Score & Customer Score)**:
  - Customer Score (0–100 / 5-star equivalent): Evaluates trip completion rates, cancellation frequencies, no-shows, and payment reliability. Scores below threshold trigger Mode B manual dispatcher review before confirmation.
  - Driver Score (0–100 / 5-star equivalent): Evaluates offer acceptance rates, on-time arrivals, trip completion ratio, and customer ratings. Low scores restrict access to premium fleets and prioritize high-scoring drivers for automated dispatches.
  - Visual Badges: Real-time score badges and metrics rendered across /admin (Customer subpage, Operators tab, Fleet tab), /dispatch (candidate cards, roster, active queue), and driver profiles.
- **3-Tier Conditional Booking Lifecycle Engine (bookingRulesEngine.ts)**:
  - Evaluates incoming trip requests against time of day (late-night curfew), passenger score, driver threshold, and zone restrictions:
    - Mode A (AUTO_CONFIRM): Trips auto-confirmed directly into dispatch queues (e.g., daytime airport trips for verified high-scoring customers).
    - Mode B (REQUIRE_REVIEW): Sets status to pending / PENDING_DISPATCHER_REVIEW with tagged rule reasons ("Late-Night Policy", "Low Customer Score", "Congested Event Area") for dispatcher acceptance.
    - Mode C (BLACKLIST_BLOCK): Rejects booking creation outright with explanatory error messages and security audit entries.
- **Temporal Vehicle Shifts (/vehicleAssignments) & Search Tool**:
  - Automatically records shift documents (`driverId`, `vehicleId`, `vehicleNumber`, `startedAt`, `endedAt`, `status`) in /vehicleAssignments when drivers toggle ON-DUTY or select vehicles in /driver.
  - Bidirectional temporal query helpers: Resolves which driver operated a given vehicle number at any specific historical timestamp, and lists all vehicle shifts operated by a given driver.
  - Admin Shift History Search UI: Dedicated interactive modal and search tool in /admin?tab=fleet and /admin?tab=trips to input unit numbers + date windows to inspect assignments and associated trips.
- **Immutable Trip Snapshots & Comprehensive Audit Log Inspector**:
  - Immutable vehicle snapshot (`assignedVehicle`: `vehicleId`, `vehicleNumber`, `licensePlate`, `model`) frozen at the exact millisecond of assignment to guarantee audit accuracy.
  - Comprehensive `auditLog` timeline array (`TripAuditEvent[]`) on every trip capturing timestamped lifecycle transitions (`TRIP_REQUESTED`, `AUTO_CONFIRMED`, `FLAGGED_FOR_HUMAN_REVIEW`, `DISPATCH_OFFERED`, `DRIVER_ACCEPTED`, `STATUS_CHANGED`, `FARE_ADJUSTED`, `TRIP_COMPLETED`, `TRIP_CANCELED`, `BLACK_LISTED`) with actor IDs and notes.
  - Interactive Audit Log Inspector Modal in /admin?tab=trips and /dispatch displaying chronological event timelines.
- **Admin UI Governance Modules**:
  - Admin Rules Manager (/admin?tab=trips&sub=rules / /admin?tab=dispatch&sub=rules): Policy configurations for minimum customer score, late-night windows, auto-confirm toggles, and rule priorities.
  - Geo-Fence & Location Rules Manager (/admin?tab=zones): Interactive registry to configure polygon/radius zones and point hotspots with policy modes (Auto-Confirm, Require Review, Blacklist Block).
  - Universal Archive/Blacklist Drawer: Controls in /admin across all roster tables to archive, blacklist, or restore entities with mandatory reason recording.

### 25. Phase 29B: Responsive Mobile Overhaul, Mobile Dispatch Console, Multi-Role View Switcher & Custom Layout Options
- **Multi-Role View Switcher & App Shell Integration**:
  - Role-based landing: Authenticated users land automatically on their designated default console view upon sign-in (Admin -> `/admin`, Dispatcher -> `/dispatch`, Driver -> `/driver`, Passenger/Customer -> `/app`).
  - Unified View Launcher: For users possessing multi-role credentials or administrative privileges, a visual "Switch View" selector in the top app header, profile menus, and navigation bars permits instant 1-tap switching between Customer (`/app`), Driver (`/driver`), Dispatcher (`/dispatch`), and Admin (`/admin`).
  - Active workspace visual indicators, role privilege badges, and automatic session synchronization across all portals.
- **Dispatch Console Mobile Overhaul (`/dispatch`)**:
  - Slide-out mobile navigation drawer giving immediate thumb-friendly access to driver rosters, incoming and outgoing dispatch messages, quick softphone dialer, layout toggles, and workspace switching.
  - Ergonomic 3-Tab Mobile View Switcher (bottom/top tabs):
    1. `[ 📝 New Booking ]`: Full-width mobile reservation draft form and booking engine with real-time validation, multi-draft tabs, and instantaneous fare preview.
    2. `[ 🗺️ Live Map ]`: Full-screen responsive Google Map canvas with active driver telemetry markers, route overlays, and layer controls.
    3. `[ 🚕 Trip Queue ]`: Mobile-optimized active trip feed with search, quick filters, driver assignment actions, and review/override drawers.
  - Desktop multi-pane split layout seamlessly preserved on larger screens (>= 1024px).
- **Configurable Display Layout Engine (Cards vs. List/Table vs. Compact)**:
  - Persistent UI display toggles accessible in `/admin` and `/dispatch` header toolbars:
    - 🎴 Card Grid View: High-visual-density cards optimized for mobile viewports, touch targets, and field operations.
    - 📊 Dense Table View: Standard analytical data grid with responsive overflow protection for multi-column inspections.
    - 📑 Compact List View: Minimalist single-line rows designed for maximum record throughput and rapid vertical scanning.
  - Persistent client-side preference engine saving layout choices in `localStorage` per device.
  - Intelligent viewport detection: Automatically defaults to Card View on narrow screens (< 768px) while granting operators instant manual layout overrides.
- **Admin Console & Table Responsive Overhaul (`/admin`)**:
  - Restored header actions: Prominent, non-clipping action buttons for "Launch Dispatch", "Live Site", and workspace switching across both desktop and mobile viewports.
  - High-density table remediation: All data tables (Trips, Operators & Roster, Fleet Assets, Audit Logs, Geo-Zones, Invoicing, Onboarding Queue) wrapped in responsive `overflow-x-auto` containers with styled scrollbars to eliminate page-level horizontal blowout on mobile.

### 26. Phase 30: End-to-End Live Simulation & Production Infrastructure Hardening
- **Full Lifecycle E2E Simulation Walkthrough**:
  - **Passenger Flow**: Submitting ride requests on `/app` evaluated dynamically against the `BookingRulesEngine`:
    - Mode A (AUTO_CONFIRM): Verified high-reputation passengers automatically advance to `CONFIRMED`.
    - Mode B (REQUIRE_REVIEW): Low scores, unrated guests, or late-night trips held in `UNCONFIRMED` with tagged rule reasons.
    - Mode C (BLACKLIST_BLOCK): Restricts blacklisted passengers, prohibited geofences, and grounded assets with security audit logging.
  - **Dispatcher Flow**: Real-time triage in `/dispatch`:
    - Trip visualization and queue review across Card, Table, and Compact layouts.
    - Manual assignment to active driver shift unit with instant real-time broadcast to all subscribers.
  - **Driver Flow**: Lifecycle progression on `/driver` mobile PWA:
    - Step-by-step state cycling (`assigned` -> `en_route` -> `arrived` -> `in_progress` -> `completed`).
    - Immutable vehicle snapshot (`assignedVehicle`) freezing at assignment to prevent retroactive drift.
    - Comprehensive `auditLog` array timeline tracking actor role, timestamp, and transition context.
  - **Tracking Flow**: Real-time live customer telemetry map on `/track/$tripToken`:
    - Visual route path and real-time vehicle telemetry beacon with live status updates via Firestore snapshot listeners.
- **Role-Based Access Control (RBAC) & Firestore Security Rule Verification**:
  - Strict tenant boundary governance in `firestore.rules`:
    - Passengers view and mutate strictly their own profiles (`/users/{uid}`) and booked trips (`/trips/{tripId}`).
    - Drivers update strictly their assigned trips and active shift records (`/vehicleAssignments`).
    - Candidates submit applications (`/applications`) without permissions to read the candidate queue.
    - Dispatchers and Admins retain operational read/write access.
    - Closes wildcard security hole by requiring dispatcher authorization for unmapped collections.
- **Production Asset & Bundle Optimization**:
  - Code splitting and lazy loading for heavy dependencies (Monaco Editor via `React.lazy`, `@hello-pangea/dnd`, Maps loader).
  - Production chunk optimization in `vite.config.ts` manualChunks.
  - Clean up unused imports, dead CSS modules, and redundant console logs.

### 27. Phase 31: Enterprise External API Integrations (Payments, Invoicing, and Telephony)
- **Payments & Card Vaulting Engine (Stripe / Square)**:
  - **Tokenized Card Vaulting**:
    - Passengers on `/app` and web booking flows can securely vault credit/debit cards on file with PCI-compliant tokenization (`VaultedCard` model with brand, last 4 digits, expiry, token, and default designation).
    - Booking checkout allows 1-click payment using vaulted payment methods or manual card entry with instant tokenization.
  - **Pre-Authorization Holds & Automated Capture**:
    - Automatic pre-authorization hold initiated upon booking confirmation (`CONFIRMED` or driver `accepted`).
    - Automated payment capture triggered when the trip is marked `completed`, reconciling base fare, distance/meter calculations, itemized extras, tolls, and customer tips.
  - **Driver In-Cab Terminal & Tip Prompt**:
    - Driver PWA terminal integration on `/driver`: Upon completing a trip, driver triggers terminal screen with tip preset buttons (`15%`, `20%`, `25%`, `Custom`, `No Tip`) and contactless card settlement.
  - **Automated Driver Payouts Engine**:
    - Automated fare-splitting algorithm computing platform commission, driver net earnings, 100% tip pass-through, and 100% toll reimbursement.
    - Generates immutable `DriverPayout` records and ledger entries.
- **B2B Corporate Invoicing & Accounting Sync**:
  - **Automated Corporate Billing & Scheduled Invoicing**:
    - Corporate accounts billing terms supported: Net 15, Net 30, Net 60, and Immediate Charge.
    - Automated batch invoicing generator grouping unbilled completed corporate rides into consolidated periodic billing statements.
  - **Printable & Downloadable PDF Invoice Engine**:
    - High-fidelity PDF invoice template generation with official Chesterfield Taxi branding, contact details, tax ID, itemized ride breakdown (trip ID, date, passenger, route, PO #, amount), payment terms, and bank remittance slip.
  - **Accounting Sync (QuickBooks / Xero / General Ledger)**:
    - Daily financial ledger recording transaction lines across accounts: fare revenue, driver payouts, tips, tolls, and gateway processing fees.
    - One-click export to standard QuickBooks CSV and General Ledger JSON formats for external bookkeeping and tax reconciliation.
  - **Admin Financials Console (`/admin?tab=financials`)**:
    - Normalized tab navigation at `/admin?tab=financials` (aliased to `/admin?tab=invoicing`).
    - Dedicated tabs for Invoicing Ledger, Corporate Accounts, Payment Gateways, and Accounting Sync.
- **Telephony & Communication Suite (Twilio / WebRTC)**:
  - **Masked Virtual Phone Relay**:
    - Virtual proxy phone numbers (Twilio relay session) bridging communications between driver personal cell and passenger phone.
    - Preserves mutual privacy; direct mobile phone numbers are never exposed to counterparties.
    - Automated session lifecycle: created on driver dispatch assignment, expired on trip completion or cancellation.
  - **Automated SMS Telemetry Alerts**:
    - Automated dispatch milestone text messages triggered during state machine transitions:
      - `en_route`: "Cab #[unit] is en route. Driver: [name]. Estimated arrival: [ETA]."
      - `arrived`: "Your Chesterfield Taxi driver has arrived outside in [vehicle model] (Cab #[unit])."
      - `in_progress`: "Trip started. Safe travels with Chesterfield Taxi!"
      - `completed`: "Trip completed. Total fare: $[amount]. Thank you for riding with Chesterfield Taxi."
    - Complete SMS notification delivery history and logging.
  - **Embedded WebRTC Click-to-Call Softphone (`/dispatch`)**:
    - Fully operational browser softphone inside the tactical dispatch desk with numeric dial pad, DTMF tones, live call timer, mute toggle, and audio indicators.
    - Click-to-call integration directly from Driver Roster and Active Trip Queue items.

## 32. Phase 32: Production Launch, Web Booking Stress Testing, Security Standards & UI/UX Hardening
- **Production Cutover**:
  - Transition default company configuration to `constructionMode: false`.
  - Provide instant toggle resilience between live production and maintenance mode via admin settings in Firestore.
- **Defensive Security Hardening (OWASP / Zero Trust)**:
  - Authorization protection for developer seed endpoints (`/api/seed-stress-data`) to prevent unauthenticated database bloat.
  - Open relay prevention in transactional email API (`/api/send-email`), restricting raw HTML dispatches to authenticated administrators.
  - Server-side isolation of payment gateway credentials (`STRIPE_SECRET_KEY`), rejecting untrusted client credential overrides.
  - Firestore security rule refinement preventing unauthorized state tampering (`COMPLETED`, `IN_PROGRESS`) by public guests.
  - Invisible honeypot trap and input sanitization (XSS filtering) on public web booking endpoints.
- **Customer UI/UX Design Standards (NN/g & WCAG 2.1 AA)**:
  - Seamless 4-step booking progression with visible state indicators and auto-formatting phone inputs.
  - Mobile sticky action bar preserving live quote visibility and quick navigation.
  - High-conversion booking confirmation screen featuring copyable booking reference `#CT-XXXXX`, 3-step dispatch status progression, one-click calendar export (`.ics`), printable PDF receipt, and direct 24/7 dispatch phone link.
- **Comprehensive Automated Stress Testing Suite**:
  - High concurrency stress: 50+ simultaneous bookings executed in parallel validating non-colliding trip IDs and atomic state integrity.
  - Fuzzing & boundary stress: XSS payloads, Unicode, extreme length strings (10,000 chars), edge-case timestamps, and numerical bounds.
  - Anti-tamper pricing validation: Rejection and deterministic recalculation of tampered client fare submissions.
  - Bot mitigation verification: Automated rejection of submissions with populated honeypot fields.

## 33. Phase 33: Codebase Modularization, Shared Hooks & Dead-Code Cleanup
- **Zero-Regression Structural Refactoring**:
  - Strictly preserve all runtime behavior: pricing calculations, Firestore schemas/queries, trip state transitions, visual styling, mobile gestures, `React.memo` boundaries, `WorkspaceBus` event subscriptions (`POPULATE_BOOKING`, etc.), and `localStorage`/`sessionStorage` contracts (`ct_dispatch_*`, `ct_driver_*`, `ct_comms_*`, `ct_display_layout_*`).
  - Preserve config-driven architecture (`app/config/formConfig.ts`, `app/config/roleFormConfig.ts`) and public exports such as `formatUsPhone` from `app/components/domain/BookingEngineV2.tsx`.
- **Dead-Code Removal & Git Hygiene**:
  - Retire unused legacy V1 booking components (`app/components/domain/BookingEngine.tsx` and `app/components/domain/BookingForm.tsx`) and clean barrel re-exports in `app/components/domain/index.ts`.
  - Exclude `.vercel/` build artifacts via `.gitignore` and untrack `.vercel/react-router-build-result.json` from Git index.
- **Dispatch Console Decomposition (`/dispatch`)**:
  - Decompose `app/routes/dispatch.tsx` into cohesive, strongly typed domain panes under `app/components/domain/dispatch/` (`TripActionDropdown`, `MemoizedDraftBookingPane`, `DispatchTripQueuePane`, `DispatchLiveMapPane`, `DispatchDriverRosterPane`, `DispatchTripDetailsDrawer`), keeping `dispatch.tsx` focused on workspace state and layout orchestration.
- **Driver Mobile PWA Decomposition (`/driver`)**:
  - Extract pure formatting/navigation/fare helpers (`formatCabUnitLabel`, `openMapNavigation`, `isTripQuotedLocked`, `splitDriverExtras`, `maskPhoneForDisplay`) into `app/core/utils/driver-ui.util.ts`.
  - Decompose `app/routes/driver.tsx` into focused UI components under `app/components/domain/driver/` (`DriverShiftControls`, `DriverOfferSheet`, `DriverLiveMeterCard`, `DriverPaymentTerminalModal`, `DriverEarningsHistoryPane`).
- **Communications Hub Modularization & Lazy WebRTC Loading**:
  - Split `app/components/domain/dispatch/CommsHub.tsx` into modular sub-panes under `app/components/domain/dispatch/comms/` (`CommsFilterToolbar`, `CommsBatchActionBar`, `SoftphoneDialerPane`, `SmsThreadPane`, `VoicemailCallLogPane`).
  - Lazy-load `@twilio/voice-sdk` dynamically upon softphone initialization so WebRTC voice dependencies do not block initial bundle parsing.
- **Shared Booking Hooks & Pure Helpers**:
  - Consolidate duplicated pure booking logic shared between `DispatchBookingEngine.tsx` and `BookingEngineV2.tsx` into `app/core/hooks/booking/` (multi-stop waypoint manipulation, return-trip state sync, corporate PO verification helpers).

## 34. Phase 34: Driver & Dispatch PWA Hardening (Service Worker, Web Push & Screen Wake Lock)
- **Manifest & PWA Scope Alignment**:
  - Align `public/manifest-driver.json` so `id`, `start_url`, and `scope` target `"/app/driver"` (replacing legacy `"/driver"`).
  - Dynamically switch `<link rel="manifest">` in `app/root.tsx` via `useLocation()` to serve `/manifest-driver.json` on `/app/driver` (and legacy `/driver`) paths and `/manifest.json` on all other routes.
- **Root Service Worker & Background Notification Routing (`public/sw.js`)**:
  - Zero-build-step Service Worker registered at root scope (`/`), strictly guarded for client-only/supported browser environments.
  - Caching policies: Network-first strategy with offline HTML fallback for navigation requests; stale-while-revalidate for static `/icon-*.svg` and `/manifest*.json` assets; strict bypass (never caching) for `/api/*`, single-fetch `.data` payloads, and cross-origin Firestore/Auth/Maps/Stripe traffic.
  - Background & local notifications: Handles Web Push (`push` event parsing `{ title, body, url, tag, requireInteraction, vibrate }`) and client-dispatched Service Worker messages (`{ type: 'SHOW_LOCAL_NOTIFICATION', payload }`) via `self.registration.showNotification(...)`.
  - Interactive click routing (`notificationclick`): Closes notification, focuses an existing `/app/driver` or `/app/dispatch` window client and posts a `NOTIFICATION_CLICK` message, or opens `targetUrl` via `clients.openWindow(targetUrl)` when no matching workspace tab is open.
- **Screen Wake Lock Management (`useWakeLock`)**:
  - Encapsulated `useWakeLock({ enabled })` hook acquiring `navigator.wakeLock.request('screen')` when enabled and releasing cleanly when disabled or unmounted.
  - Automatic re-acquisition on `document` `visibilitychange` when returning to `visibilityState === 'visible'` (ensuring driver dash-mounted phones remain awake after switching back from Google Maps, Apple Maps, or Waze).
  - Graceful no-throw degradation on unsupported browsers, WebViews, or SSR.
- **Push Notification & Acoustic Alert Services**:
  - `PushNotificationService` (`app/core/services/notifications/push-notification.service.ts`) managing `Notification` permission states (`default` | `granted` | `denied` | `unsupported`), persisted opt-in preference (`ct_push_alerts_enabled`), haptic vibration (`[200, 100, 200]`), Service Worker notification dispatch (`notifyIncomingDriverOffer`, `notifyDispatchAlert`), and optional Firebase Cloud Messaging (FCM) token sync to `/users/{uid}.fcmTokens` when `VITE_FIREBASE_VAPID_KEY` and Firebase are configured.
  - Authenticated serverless resource route `/api/push` (`app/routes/api.push.ts`) supporting token registration/removal, status diagnostics, and FCM HTTP v1 / stubbed push dispatch.
  - Extended `SoundNotificationService` (`app/core/services/sound-notification.service.ts`) providing `playDriverOfferAlert()` / `stopDriverOfferAlert()` (urgent repeating chime cadence with auto-timeout and instant stop on accept/decline) and `playSlaWarningChime()` (double-pulse warning tone).
- **Driver & Dispatch Operational Integration**:
  - **Driver Console (`/app/driver`)**: Automatically activates Screen Wake Lock whenever `dutyStatus === 'on_duty'`; triggers repeating offer chime + background push alert on newly unseen `offeredTrips` and stops immediately on accept/decline or empty offers; displays compact **Screen Awake** status and 1-tap **Enable Push Alerts** control in `DriverShiftControls`.
  - **Dispatch Console (`/app/dispatch`)**: Provides optional **Keep Screen Awake** toggle (`ct_dispatch_wake_lock` in `localStorage`) and **Browser Push Alerts** opt-in control in the Dispatch header/settings menu, firing `notifyDispatchAlert` for incoming `UNCONFIRMED` / `ASAP` rides when the Dispatch tab is backgrounded (`document.hidden`).

## 35. Phase 35: Scheduled-Ride SLA Monitor & Auto-Dispatch / Offer Cascade
- **Defense-in-Depth Notification URL Guard**:
  - Enforce strict same-origin relative-path validation (`rawUrl.startsWith('/') && !rawUrl.startsWith('//')`, falling back to `'/app/driver'`) on notification `url` normalization in `public/sw.js` and `/api/push` (`send_push`).
- **Dispatch Automation & SLA Configuration (`DispatchAutomationConfig`)**:
  - Persist operator-configurable automation settings under `AppSettings.dispatchAutomation` with safe defaults:
    - **Locked-In Product Default**: `autoOfferOnConfirm: false` (1-tap Dispatcher-initiated offer cascade by default; optional Admin toggle to enable automatic cascade startup upon trip confirmation).
    - `rankingStrategy`: `'nearest_in_zone' | 'longest_idle_in_zone' | 'highest_driver_score'` (default `'nearest_in_zone'`).
    - `offerTimeoutSeconds`: Default `45` seconds (clamped `15`–`180`s).
    - `maxCascadeAttempts`: Default `3` attempts (clamped `1`–`10`).
    - `slaWarningMinutes`: Default `60` minutes prior to scheduled pickup.
    - `slaCriticalMinutes`: Default `30` minutes prior to scheduled pickup.
    - `airportExtraLeadMinutes`: Default `15` minutes automatically added to warning/critical SLA thresholds when `detectAirportInAddresses` matches STL, SUS, or CPS airport pickups/dropoffs.
- **Trip Cascade & SLA State Schema (`Trip.offerCascade` & `Trip.slaStatus`)**:
  - Track sequential single-driver cascade progress (`state: 'active' | 'accepted' | 'exhausted' | 'cancelled'`, `activeOfferedDriverId`, `activeOfferedDriverName`, `offerStartedAt`, `offerExpiresAt`, `timeoutSeconds`, `cascadeAttempt`, `maxAttempts`, `attemptedDriverIds`, `strategy`) and SLA urgency (`level: 'normal' | 'warning' | 'critical' | 'overdue'`, `minutesUntilPickup`, `warningNotifiedAt`, `criticalNotifiedAt`) directly on `Trip`.
  - Permit offered drivers on `/app/driver` to update `'offerCascade'` (and `'slaStatus'`) in `firestore.rules` during atomic offer acceptance or decline without permission errors.
- **Pure Scheduled-Ride SLA Monitor (`sla-monitor.service.ts`)**:
  - Deterministically evaluate unassigned scheduled `UNCONFIRMED`, `CONFIRMED`, `pending`, and `offered` trips (`assignedDriverId == null`), adding `airportExtraLeadMinutes` for regional airport trips and classifying urgency into `'normal' | 'warning' | 'critical' | 'overdue'`.
- **Pure Candidate Ranking & Sequential Offer Cascade (`auto-dispatch.service.ts`)**:
  - Exclude off-duty/break drivers, busy/en-route drivers on conflicting active trips, blacklisted/archived drivers, grounded/blacklisted fleet vehicles, and drivers already in `rejectedByIds` or `offerCascade.attemptedDriverIds`.
  - Enforce vehicle passenger/luggage capacity and tier/upgrade compatibility (SUV/Van, car seats, oversized cargo, wheelchair WAV).
  - Rank eligible candidates deterministically via `nearest_in_zone` (geofence containment + Haversine miles), `longest_idle_in_zone`, or `highest_driver_score`.
  - Offer sequentially to one active target driver per step (`status: 'offered'`, `offeredToIds: [candidate.driverId]`), automatically rolling over to the next candidate on driver decline or `offerExpiresAt` timeout up to `maxCascadeAttempts`, and reverting cleanly to `'CONFIRMED'` (or `'pending'`) with `offerCascade.state = 'exhausted'` and audit logging if exhausted.
- **Unattended Serverless SLA Cron (`/api/cron/sla-dispatch` & `vercel.json`)**:
  - Scheduled daily at `"0 10 * * *"` (4:00 AM Central pre-dawn airport sweep on Vercel Hobby) and secured via `CRON_SECRET`, `x-admin-secret`, or authenticated Dispatcher/Admin token.
  - Idempotently stamps `slaStatus.criticalNotifiedAt` on unattended critical/overdue unassigned scheduled trips, dispatches operations email/SMS alerts via `ResendEmailService` / Twilio, advances expired cascades, and optionally initiates `autoOffer` when `autoOfferOnConfirm` is enabled.
- **Dispatch, Driver & Admin UI Integration**:
  - **Dispatch Console (`/app/dispatch`)**: Periodic SLA & cascade coordinator tick playing `playSlaWarningChime()` + `notifyDispatchAlert` once per threshold transition; compact **SLA Urgency Banner** with 1-click filter/jump; color-coded SLA countdown badges (`Due in 42m`, `CRITICAL • 18m`, `OVERDUE`) and live cascade pills (`Offering Car #204 • 31s · 1/3`, `Cascade Exhausted`); 1-tap **Auto-Offer** and **Cancel Cascade** controls across queue cards/rows, `TripActionDropdown`, and `DispatchTripDetailsDrawer`.
  - **Driver App (`/app/driver`)**: Live 1-second countdown badge & progress bar (`Accept within 34s · Step 1/3`) in `DriverOfferSheet` and `DriverLiveMeterCard` whenever `offerCascade.offerExpiresAt` is active.
  - **Admin Console (`/app/admin`)**: **Dispatch Automation & Scheduled SLA** configuration card in `AdminRulesTab` controlling trigger mode, ranking strategy, timeout, max cascade attempts, and SLA warning/critical/airport lead buffers.

## 36. Phase 36: Complete Payment & Invoicing Loop (Stripe Webhooks + 1-Tap Pay Links)
- **Cryptographic Stripe Webhook Engine (`/api/payments/webhook`)**:
  - Server-isolated HMAC-SHA256 webhook verification (`verifyStripeWebhookSignature`) reading raw request payloads (`await request.text()`) prior to JSON parsing, supporting multi-`v1` signature rotation, constant-time `crypto.timingSafeEqual`, and configurable timestamp replay protection (`toleranceSeconds = 300`).
  - Strict event-level idempotency via `/paymentWebhookEvents/{event.id}` (Firestore + server cache) returning `200 { received: true, duplicate: true }` on duplicate deliveries without double-posting ledger entries or double-updating trips/invoices, paired with settlement-level idempotency (`pi_${paymentIntentId}`).
  - Automated financial & operational reconciliation across Stripe lifecycle events:
    - `payment_intent.amount_capturable_updated`: Marks linked trip payment hold `status: 'authorized'` and appends a `TripAuditEvent`.
    - `payment_intent.succeeded`: Reconciles `trip` targets (captured payment status, gratuity, `payToken` `'paid'` transition, and balanced `FinancialLedgerEntry` postings for `fare_revenue`, `tip_collected`, `platform_commission`, and `driver_payout`) and corporate `invoice` targets (`status: 'paid'`, `paidAt`, `paymentReference`, linked AR row settlement, `payToken` `'paid'` transition, and balanced `invoice_settlement` ledger entry).
    - `payment_intent.payment_failed` / `payment_intent.canceled`: Logs payment failure/cancellation status and audit trail without corrupting open balances or settled records.
    - `charge.refunded`: Posts `refund` entry in `financialLedger` and appends refund metadata/audit trail onto the linked trip or corporate invoice.
  - Authenticated staff `GET /api/payments/webhook` diagnostics endpoint (Dispatcher/Admin only via `verifyServerRequestAuth`) reporting signing-secret readiness, endpoint path, subscribed events, and recent processed webhook deliveries.
- **Zero-PII Tokenized 1-Tap Pay Links (`/payLinks/{payToken}`, `/api/pay`, `/pay/:payToken`)**:
  - High-entropy URL-safe tokens matching `/^pay_[a-zA-Z0-9_-]{24,80}$/` (`pay-token.util.ts`).
  - Strict Zero-PII public projection mirroring `/tripTracking`: exposes only masked customer/company label, reference `#`, sanitized pickup/dropoff or invoice period summary, sanitized itemized line items, authoritative `baseAmount`, `currency`, `allowTip`, `status`, `expiresAt`, `paidAt`, and `receiptNumber` — never exposing full passenger phone/email, gate codes, or corporate PO history to unauthenticated callers.
  - Anti-tamper server-authoritative checkout (`POST /api/pay`):
    - `create_link` (authenticated Dispatcher/Admin/Driver): Creates or reuses an active `PayLinkProjection` for `targetType: 'trip' | 'invoice'`, persists to `/payLinks/{payToken}`, caches token metadata on the target record, and optionally dispatches SMS (Twilio) and/or Executive Clean payment-request email (`ResendEmailService`).
    - `create_checkout_intent` (rate-limited public): Validates `open` & unexpired link state, computes authoritative `chargeAmount = baseAmount + validatedTipAmount` strictly from server-stored `baseAmount` (never trusting client fare totals), creates a Stripe `PaymentIntent` (`automatic_payment_methods[enabled]=true`), and cleanly returns `{ stripeConfigured: false, message }` directing callers to pay in-car or call `(314) 738-0100` when Stripe is unconfigured.
    - `confirm_payment` (rate-limited public): Verifies `PaymentIntent` status (`succeeded` or `requires_capture`), metadata token match, and amount directly against the Stripe REST API before marking the pay link and target trip/invoice paid using shared idempotency key `pi_${paymentIntentId}`.
- **Public Checkout Experience & Staff Triggers**:
  - **Standalone Public Checkout (`/pay/:payToken`)**: Mobile-first Executive Clean page with Chesterfield Taxi header, security badge, itemized ride or corporate invoice breakdown, tip selector (`15%`, `20%`, `25%`, `Custom`, `No Tip` when `allowTip` is enabled), live Stripe Payment Element (`js.stripe.com/v3/`) supporting Apple Pay / Google Pay / cards, graceful unconfigured fallback card, instant Paid Receipt view, and Print Receipt action.
  - **Dispatch Console (`DispatchTripDetailsDrawer.tsx`)**: 1-tap **Copy / Send Pay Link (SMS / Email)** controls and live `Open` / `Paid` link status indicator on trips.
  - **Driver Mobile App (`DriverPaymentTerminalModal.tsx`)**: **Text / Show Pay Link** fallback in the in-cab settlement modal so passengers can pay from their own device.
  - **Admin Corporate Invoicing (`AdminInvoicingSubpage.tsx`)**: **Generate / Send Pay Link** action on open corporate invoices plus 1-tap Pay Link remittance URL on printable PDF statements.
  - **Admin Integrations (`AdminIntegrationsSubpage.tsx` — `webhooks` sub-tab)**: Live Stripe Webhook configuration status, copyable `/api/payments/webhook` endpoint URL, subscribed event catalog, and recent processed webhook event log.

## 37. Phase 37: Corporate Client Self-Service Portal (`/app/corporate`)
- **Multi-Tenant B2B Isolation & Security Rules (`firestore.rules` & Server Auth)**:
  - Prevent privilege escalation and tenant spoofing on `/users/{userId}`: block `corporateAccountId` and `corporateAccountNumber` on self-registration (`allow create`) and add both to forbidden self-update keys (`allow update`) so only Dispatchers/Admins (`isDispatcher()`) can bind or modify a user's corporate account assignment.
  - Enforce `isCorporateManagerFor(accountId)` across Firestore collections:
    - `/corporateAccounts/{accountId}`: Permit `get` for `isDispatcher() || isCorporateManagerFor(accountId)` (`list` restricted to `isDispatcher()`), and restrict `corporate_manager` `update` strictly to safe self-service fields (`currentPoNumber`, `poGeneratedAt`, `poNumberHistory`, `authorizedBookers`, `authorizedRiders`, `savedCompanyLocations`, `costCenters`, `updatedAt`) — never `creditLimit`, `discountPercent`, `billingCycle`, `accountNumber`, or `isActive`.
    - `/corporateLookup/{lookupKey}`: Permit `corporate_manager` `update` strictly on PO hash rotation fields (`currentPoHash`, `revokedPoHashes`, `updatedAt`) for their own `corporateAccountId`.
    - `/trips/{tripId}`: Permit `get` and `list` for `isCorporateManagerFor(resource.data.corporateAccountId)` and `create` when `isCorporateManagerFor(request.resource.data.corporateAccountId)` with pre-dispatch status and unassigned-driver guards.
    - `/invoices/{invoiceId}`: Permit `get` and `list` for `isCorporateManagerFor(resource.data.corporateAccountId)` while keeping invoice mutations restricted to `isDispatcher()`.
  - Extend `verifyServerRequestAuth` (`server-auth.server.ts`) and `POST /api/pay` `create_link` (`pay-link.server.ts`) so an authenticated `corporate_manager` can generate/open a 1-tap Pay Link strictly for an invoice whose `corporateAccountId` matches their own `auth.corporateAccountId` (returning `403` for any cross-tenant invoice).
- **RBAC, Auth & Multi-Workspace Routing**:
  - Extend `UserRole` with `'corporate_manager'` and `AdminUser` with `corporateAccountId?: string` and `corporateAccountNumber?: string`.
  - Extend `CorporateAccountConfig` with B2B self-service portal fields (`authorizedRiders`, `costCenters`, `savedCompanyLocations`, `portalManagers`).
  - Register `'corporate'` (`Corporate Portal` at `/app/corporate`, legacy `/corporate` redirect) across `workspace-routing.util.ts`, `app.hub.tsx` (Executive Slate/Indigo card with `BuildingIcon`), `RoleViewSwitcher.tsx`, `UserDropdown.tsx`, and `app/routes.ts`.
  - Single-role `corporate_manager` users route directly to `/app/corporate`; `admin` superusers access all 5 workspaces including `/app/corporate` with an **Admin Account Preview Selector**.
- **Corporate Portal Domain Service (`corporate-portal.service.ts`)**:
  - Strictly parameterized by `corporateAccountId` per `constitution.md`: dashboard summary & credit-limit utilization math (`(openInvoices + unbilledSpend) / creditLimit`), scoped company trips & RFC 4180 CSV expense export, scoped corporate invoices & printable statement data, team/locations/cost-center updates, self-service anti-fraud PO rotation (`poNumberHistory`), and Admin portal manager provisioning.
- **Executive Clean B2B Workspace (`/app/corporate`) & Admin Provisioning**:
  - **1. Overview & Live Rides**: Credit limit utilization meter, unbilled cycle spend, open AR banner, active PO badge, and live company rides table/cards with 1-tap Live Tracking (`/track/:trackingToken` or `/booking/status/:tripId`).
  - **2. Book Company Ride**: Embedded `BookingEngineV2` pre-bound to verified Corporate Account direct billing with quick-fill **Authorized Employee / Guest Picker**, **Department / Cost Center** selector, and 1-tap **Company Saved Locations** chips (HQ, Lambert STL, Spirit SUS).
  - **3. Team, Locations & PO Security**: Manage authorized riders & bookers, cost center tags, saved company locations, and **1-Click Anti-Fraud PO Rotation** with `poNumberHistory` audit trail.
  - **4. Statements & Billing**: Scoped corporate statements with `Unpaid` / `Overdue` / `Paid` status pills, **View / Print PDF Statement** modal, **Export Rides CSV**, and **1-Tap "Pay Invoice Now"** launching `/pay/:payToken`.
  - **Admin Corporate Provisioning (`AdminCustomersSubpage.tsx`)**: **Provision Corporate Portal Manager** modal/drawer workflow assigning `roles: ['corporate_manager']`, `corporateAccountId`, and `corporateAccountNumber` onto `/users/{uid}`, recording `account.portalManagers`, and generating copyable `/app/corporate` login instructions.

## 38. Phase 38: Live Flight Status Tracking for STL & SUS Airport Pickups
- **Flight Telemetry Domain Types & Regional STL/SUS Terminal Intelligence**:
  - Standardized `FlightTelemetrySnapshot` model (`flightIdent`, `airlineCode`, `airlineName`, `flightNumber`, `serviceDate`, `status`, `scheduledDepartureIso`, `estimatedDepartureIso`, `scheduledArrivalIso`, `estimatedArrivalIso`, `delayMinutes`, `originIata`, `originCity`, `destinationIata`, `terminal`, `gate`, `baggageClaim`, `pickupDoorGuidance`, `provider`, `isSimulatedFallback`, `checkedAt`, `cacheExpiresAt`) and `IFlightStatusProvider` adapter contract (`app/core/types/flight.ts`), persisted as `Trip.flightTelemetry` (`app/core/types/trip.ts`).
  - Pure regional airport helpers in `app/core/config/airports.ts`:
    - `resolveStlTerminalInfo(airlineCodeOrName, airportCode)`: Maps Southwest (`WN`) and international Terminal 2 carriers (e.g., Lufthansa `LH`) to `{ terminal: 'Terminal 2', pickupDoorGuidance: 'Terminal 2 · Baggage Claim Exit Door 12' }`, commercial Terminal 1 carriers (`AA`, `DL`, `UA`, `AS`, `NK`, `F9`, `AC`, `OO`, `YX`, `G4`, `B6`, `SY`, `MX`, `HA`) to `{ terminal: 'Terminal 1', pickupDoorGuidance: 'Terminal 1 · Lower Level Exit Door 6 / Door 12' }`, and Spirit of St. Louis (`SUS`) / St. Louis Downtown (`CPS`) private aviation to FBO ramp-side/lobby coordination guidance.
    - `parseFlightIdent(airlineInput, flightNumberInput)`: Normalizes carrier names, 2–3 character IATA/ICAO codes, and combined strings (e.g., `"WN"`, `"1425"`, `"WN 1425"`, `"Southwest Airlines" + "1425"`) into `{ airlineCode, airlineName, flightNumber, flightIdent }`.
    - `evaluateFlightPickupAlignment(snapshot, scheduledPickupIso, options)`: Pure timing evaluator detecting when requested pickup precedes estimated arrival (`conflict: 'pickup_before_arrival'`) or when flight delay/arrival drift >= 15 minutes warrants shifting `scheduledPickupTime` (`conflict: 'significant_delay'`, `recommendedPickupIso`, `driftMinutes`).
- **Server-Isolated Provider-Agnostic Aviation Engine & 15-Minute Cache (`flight-status.server.ts`, `/api/flight-status`, `firestore.rules`)**:
  - Strict server-only secret isolation (`FLIGHT_API_KEY`, `AERODATABOX_API_KEY`, `AERODATABOX_RAPIDAPI_HOST`, `FLIGHTAWARE_API_KEY`) inside `app/core/services/flight/flight-status.server.ts` so `api.flight-status` emits a `0.00 kB` client bundle.
  - Three pluggable `IFlightStatusProvider` adapters:
    1. **`AeroDataBoxProvider`**: Queries `/flights/number/{flightIdent}/{serviceDate}` via RapidAPI or AeroDataBox direct API headers and normalizes timestamps, `delayMinutes`, origin/destination IATA, terminal, gate, and baggage belt.
    2. **`FlightAwareProvider`**: Queries FlightAware AeroAPI v4 `/flights/{flightIdent}` and normalizes matching `serviceDate` legs.
    3. **`FallbackScheduleProvider`**: Deterministic zero-downtime fallback enriching snapshots with STL `Terminal 1` / `Terminal 2` / `SUS` / `CPS` curbside guidance, carrier metadata, and `isSimulatedFallback: true` when no live aviation key is configured or an upstream API is unreachable.
  - Cost & abuse protection: Per-IP sliding-window rate limiting (`checkRateLimit`), strict IATA flight-ident & `YYYY-MM-DD` validation, and a **15-minute TTL cache** (`900_000` ms) keyed by `${airlineCode}_${flightNumber}_${serviceDate}` across server memory and `/flightStatusCache/{cacheKey}` (`allow get: if true; allow list: if false; allow write: if isDispatcher();` in `firestore.rules`). `forceRefresh: true` is permitted exclusively for authenticated Dispatchers/Admins.
- **Smart Booking Wizard Flight Check (`FlightAssistanceCard.tsx`, `BookingEngineV2.tsx`, `DispatchBookingEngine.tsx`)**:
  - Immediate **STL Terminal & Exit Door guidance badge** rendered as soon as an airline is selected for STL pickups/dropoffs.
  - **"Check Flight Status"** pill button when airline + flight number are provided: displays inline telemetry status (`On Time`, `Delayed +Xm`, `Landed`, `Cancelled`, or `Terminal Verified`), auto-populates blank `flightOrigin`, warns when scheduled pickup precedes estimated arrival or drifts significantly, offers a 1-tap **"Use Recommended Pickup Time"** button, and persists `flightTelemetry` onto the booked `Trip`.
- **Dispatch Queue, Trip Details, Driver Manifest & Admin Integrations**:
  - **Dispatch Console (`DispatchTripQueuePane.tsx`, `DispatchTripDetailsDrawer.tsx`, `dispatch.tsx`)**: Compact color-coded **Flight Telemetry Pills** (`On Time · STL T2`, `Delayed +42m`, `Landed · T1`, `Cancelled`) on airport trips, **"Refresh Flight"** button (`forceRefresh: true`), and **1-Tap "Adjust Pickup Time to New ETA"** when `delayMinutes >= 15` (or alignment drift >= 15m), updating `scheduledPickupTime`, appending an immutable `TripAuditEvent` (`STATUS_CHANGED`), and triggering a driver notification if a driver is assigned.
  - **Driver Mobile App (`DriverTripManifest.tsx`)**: Live flight status badge, terminal/gate/baggage claim, and STL curbside exit door / SUS FBO guidance inside the Driver Trip Manifest card.
  - **Admin Integrations (`AdminIntegrationsSubpage.tsx`)**: **Flight Status Telemetry (`AeroDataBox` / `FlightAware`)** readiness card polling `GET /api/flight-status?diagnostics=1` and displaying active provider mode, key configuration status, and 15-minute cache protection badge.
- **Phase 38.B Quota & Operational Window Gates (Staff-Only, Confirmed-Only & 24-Hour Pickup Lock)**:
  - **Pure Eligibility Evaluator (`evaluateFlightCheckEligibility`)**: Central domain gate in `app/core/config/airports.ts` (re-exported in `flight-status.service.ts`) enforcing:
    1. `staff_only`: Blocks non-staff contexts (`!isStaffContext`).
    2. `unconfirmed`: Blocks `UNCONFIRMED` / `unconfirmed` bookings (*"Confirm booking first to enable live flight tracking."*).
    3. `terminal_status`: Blocks `DECLINED`, `declined`, `cancelled`, and `completed` trips.
    4. `outside_24h_window` & `past_window`: For non-ASAP scheduled rides, locks live aviation API lookups until within `24` hours prior to `scheduledPickupTime` (computing exact `unlocksAtIso`) and locks lookups more than `12` hours past `scheduledPickupTime`.
  - **Server-Side Zero-Leak Enforcement (`/api/flight-status` & `flight-status.server.ts`)**:
    - Requires authenticated **Dispatcher / Admin** authorization (`auth.isDispatcher`) across all `GET` and `POST /api/flight-status` calls (`401` unauthenticated, `403` non-staff), paired with `authorizedFetch` in `FlightStatusService`.
    - Enforces `[-12h, +24h]` `scheduledPickupIso` bounds and `[-1, +1]` calendar-day `serviceDate` bounds inside `lookupFlightTelemetryServer` (`400` `OUTSIDE_24H_WINDOW`) prior to any upstream aviation API request.
  - **Customer vs. Staff Surface Separation**:
    - Customer booking surfaces (`/book`, `/app/passenger`, `/app/corporate` via `BookingEngineV2` & `FlightAssistanceCard` with `allowLiveCheck={false}`) render strictly the zero-cost local **STL Terminal 1 / Terminal 2 & Exit Door** guidance badge and never expose live aviation API buttons.
    - Staff surfaces (`DispatchBookingEngine.tsx` with `allowLiveCheck={true}` and `DispatchTripDetailsDrawer.tsx`) enforce `evaluateFlightCheckEligibility`, disabling `Check Flight Status`, `Refresh Flight`, and `Adjust Pickup Time` with explicit lock-reason pills (*"Confirm booking first..."* or *"Unlocks 24h before pickup (...)"*) until eligible.

## 39. Phase 39 (Wave 2 Phase 1): Unified Multi-Channel Thread Engine, Serverless Telephony Persistence & Security Hardening
- **Unified Multi-Channel Threading (`CommsThread` & `CommsEvent`)**:
  - Consolidates all customer and operator communications (`Calls + SMS + Voicemails + Emails + Internal Notes`) into canonical `CommsThread` (`/commsThreads/{threadId}`) and deterministic, idempotent `CommsEvent` (`/commsEvents/{eventId}`) records (`sms_${MessageSid}`, `call_${CallSid}`, `vm_${RecordingSid}`, `em_${emailId}`, `note_${id}`).
  - Unified identity resolution (`normalizeEmail`, `getContactByEmail`, `resolveUnifiedContact`, `resolveCanonicalThreadId`) links phone numbers (E.164) and email addresses (lowercase, e.g., `+13145550199` and `amanda.vance@bayer.com` to `dispatch@chesterfieldtaxi.com`) to the same `ContactRecord` and canonical `threadId`, with automatic thread merging (`mergeThreadsForContact`) when previously separate phone-only and email-only threads become linked via contact save or trip creation.
  - Per-channel and aggregate unread tracking (`unreadCountTotal`, `unreadByChannel: { sms, call, voicemail, email }`), linked trip IDs (`linkedTripIds`), corporate account metadata, and cross-dock navigation (`OPEN_COMMS_THREAD`, `OPEN_EMAIL_MESSAGE`, `COMMS_EVENT_RECORDED`) across `CommsHub` and `EmailDock`.
- **Serverless Telephony Persistence & Sync (`comms-thread.server.ts`, `comms-thread.service.ts`)**:
  - Server-isolated (`*.server.ts`) ingestion engine writing idempotently to `/commsThreads/{threadId}`, `/commsEvents/{eventId}`, and `/telephonyWebhookEvents/{eventId}` via Firestore REST (`getServiceAccountDatastoreToken()` or verified staff `rawToken`), paired with a bounded in-memory buffer (`commsServerStore`) that retains inbound webhooks and flushes them to Firestore whenever an authenticated dispatcher invokes `sync_comms`.
  - Real-time client synchronization (`onSnapshot` on `/commsThreads` and `/commsEvents` with `sanitizePayload`, `localStorage` offline cache, and `WorkspaceBus` broadcast fallback) plus bidirectional `InteractionEvent` adapters so `CommsHub` softphone, SMS, voicemail, email timeline cards, internal dispatcher notes, and batch actions work seamlessly.
- **Twilio Webhook Authenticity & Full Staff Auth Hardening (`telephony-gateway.server.ts`, `/api/telephony`, `firestore.rules`)**:
  - Strict server-only isolation in `telephony-gateway.server.ts` so `app/routes/api.telephony.ts` emits a `0.00 kB` client bundle.
  - Cryptographic `X-Twilio-Signature` verification (`verifyTwilioWebhookSignature` using `node:crypto` HMAC-SHA1 + `crypto.timingSafeEqual` over proxy-aware URL + sorted POST form parameters) enforced on Twilio webhook callbacks (`incoming_call`, `incoming_sms`, `handle_unanswered`, `voicemail_recorded`, `voicemail_transcription`, `call_status_callback`, `call_recording_status`) when `TWILIO_AUTH_TOKEN` is configured in production (`TWILIO_VALIDATE_WEBHOOK_SIGNATURE !== 'false'`).
  - Full `GET` & `POST /api/telephony` staff authentication gates via `verifyServerRequestAuth(request)`:
    - `auth.isDispatcher` required for `get_voice_token`, `list_messages`, `list_recordings`, `list_voicemails`, `sync_comms`, `verify_credentials`, and `save_credentials`.
    - `auth.isDispatcher || auth.isDriver` required for `make_call`, `send_sms`, `end_call`, and `get_call_status`.
    - `GET /api/telephony?action=audio_proxy` requires either a verified staff `Authorization` Bearer header OR a short-lived server-signed HMAC query token (`sig` + `exp`, automatically appended to `audioUrl` values returned to authenticated staff) so HTML `<audio>` playback in `CommsHub` works seamlessly while unauthenticated/unsigned requests receive `401`/`403`.
  - Explicit staff-only Firestore Security Rules (`allow read, write: if isDispatcher();`) on `/commsThreads/{threadId}`, `/commsEvents/{eventId}`, and `/telephonyWebhookEvents/{eventId}`.

## 40. Phase 40 (Wave 2 Phase 2): Single-Mailbox Dispatch Email Backend (`dispatch@chesterfieldtaxi.com`), Resend Inbound Webhook & Outbound Thread Sync
- **Single-Mailbox Dispatch Email Domain (`dispatch@chesterfieldtaxi.com`)**:
  - Strictly scoped to the single operational mailbox `DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com'` with zero multi-alias routing complexity.
  - Canonical `/dispatchEmails/{emailId}` (`DispatchEmailRecord`) and `/emailWebhookEvents/{webhookEventId}` (`EmailWebhookEventRecord`) collections supporting folders (`inbox`, `bookings`, `inquiries`, `sent`, `receipts`, `drafts`, `archive`, `trash`), delivery states (`received`, `queued`, `sent`, `delivered`, `bounced`, `complained`, `delayed`, `failed`, `simulated`), categories (`direct`, `booking_request`, `website_inquiry`, `booking_confirmation`, `status_update`, `clarification_request`, `booking_declined`, `trip_receipt`, `corporate_invoice`, `dispatcher_alert`, `general`), RFC-5322 threading metadata (`rfcMessageId`, `inReplyTo`, `references`, `normalizedSubject`), attachment metadata, `suggestedBooking`, and canonical `CommsThread` linkage (`threadId`, `commsEventId = em_${emailId}`).
- **Pure HTML XSS Sanitizer & Deterministic Email-to-Booking Parser (`email-booking-parser.ts`)**:
  - Zero Node/DOM side effects (`constitution.md` pure domain layer):
    - `normalizeEmailSubject(subject)`: Strips leading `Re:`, `Fwd:`, `FW:`, and `[Website Inquiry - ...]` prefixes and collapses whitespace for deterministic thread correlation.
    - `sanitizeDispatchEmailHtml(rawHtml)` & `htmlToPlainText(html)`: Strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, `<meta>`, `<link>`, `<base>`, `<style>` blocks/expressions, inline `on*=` event handlers, and `javascript:` / `vbscript:` / `data:text/html` URIs while preserving clean email formatting and enforcing `target="_blank" rel="noopener noreferrer"` on `<a>` links.
    - `extractSuggestedBookingFromEmail({ subject, textBody, fromName, fromEmail })`: Deterministically extracts passenger name, E.164 phone (`sanitizeToE164`), pickup & dropoff addresses (`Pickup:`, `From:`, `Dropoff:`, `Drop-off:`, `Destination:`, `To:`, plus STL/SUS/CPS detection via `detectAirportInAddresses`), requested pickup date/time, airline/flight ident (`parseFlightIdent`), and corporate account / PO number (`Account:`, `PO:`, `#CORP-...`, `#BY-...`), classifying inbound emails into `bookings`/`booking_request`, `inquiries`/`website_inquiry`, `receipts`, or `inbox`/`general`.
- **Svix-Verified Resend Inbound & Delivery Webhook (`POST /api/email/webhook` & `dispatch-email.server.ts`)**:
  - Server-isolated (`*.server.ts`) `verifyResendWebhookSignature` using `node:crypto` HMAC-SHA256 + `crypto.timingSafeEqual` over `${svixId}.${svixTimestamp}.${rawBody}` with Base64-decoded `whsec_...` secret, multi-signature (`v1,<base64>`) support, and `300`s replay window tolerance.
  - Strict `/emailWebhookEvents/{svixId}` idempotency, bounded `dispatchEmailServerStore` + Firestore REST persistence:
    - `email.received`: Enforces single-mailbox recipient (`dispatch@chesterfieldtaxi.com` in `to`/`cc`), fetches full inbound message (`html`, `text`, `headers`, `attachments`) from Resend Receiving API (`GET https://api.resend.com/emails/receiving/{email_id}`) when not inline, correlates thread via RFC `In-Reply-To`/`References` against stored `rfcMessageId` first then `resolveUnifiedContact` second, sanitizes HTML, runs `extractSuggestedBookingFromEmail`, persists `/dispatchEmails/{emailId}`, and ingests `email_inbound` onto the customer's multi-channel `CommsThread`.
    - `email.sent` / `email.delivered` / `email.bounced` / `email.complained` / `email.delivery_delayed`: Reconciles `deliveryStatus` (and `deliveryError` on bounce) across both `/dispatchEmails/{emailId}` and the linked `em_${emailId}` `CommsEvent`.
  - Staff-authenticated (`auth.isDispatcher`) `GET /api/email/webhook?diagnostics=1` readiness endpoint and `GET/POST /api/email/webhook?action=sync_emails` synchronization endpoint (`0.00 kB` client bundle).
- **Outbound `/api/send-email` RFC-5322 Threading & Multi-Channel Sync**:
  - Sets `replyTo: 'dispatch@chesterfieldtaxi.com'`, generates deterministic `Message-ID` (`<em_${emailId}@chesterfieldtaxi.com>`), and forwards `In-Reply-To` / `References` headers to Resend on replies (`0.00 kB` client bundle).
  - Automatically records all outbound customer/corporate dispatches (`direct`, `booking_confirmation`, `status_update`, `booking_declined`, `clarification_request`, `trip_receipt`, `corporate_invoice`) into `/dispatchEmails/{emailId}` (`receipts` or `sent`) AND appends `email_outbound` onto the customer's `CommsThread`.
  - Records public website `contact_inquiry` submissions as `inbound` (`folder: 'inquiries'`, `category: 'website_inquiry'`, `isUnread: true`) on both `/dispatchEmails` and the visitor's `CommsThread`, while keeping internal `dispatcher_alert` self-notifications off customer threads.
- **Security Rules & Admin Diagnostics**:
  - Staff-only Firestore Security Rules (`allow read, write: if isDispatcher();`) on `/dispatchEmails/{emailId}` and `/emailWebhookEvents/{eventId}`.
  - **Dispatch Email (`dispatch@chesterfieldtaxi.com`) & Resend Inbound Webhook** readiness card in `AdminIntegrationsSubpage.tsx`.

## 41. Phase 41 (Wave 2 Phase 3): Dedicated `EmailDock` Client Overhaul (Live Folders, Threaded Composer & Cross-Channel Sender Timeline)
- **Single-Mailbox Dedicated Dock & Pop-Out Scope (`dispatch@chesterfieldtaxi.com`)**:
  - Preserves `EmailDock` (`app/components/domain/dispatch/EmailDock.tsx`) as its dedicated Dock Drawer and Detached Pop-Out Pane (`/app/dispatch/popout?module=email`), scoped strictly to `DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com'`.
  - Retires the static hardcoded `INITIAL_EMAILS` React `useState` array in favor of `DispatchEmailService` (`app/core/services/email/dispatch-email.service.ts`), seeding realistic fallback `DispatchEmailRecord` entries only when Firestore, server `sync_emails`, and `localStorage` are all empty in offline dev so triage state persists and live inbound/outbound emails seamlessly supersede them.
- **Real-Time Multi-Window Synchronization & Smart Triage (`dispatch-email.service.ts`)**:
  - Real-time Firestore `onSnapshot` listener on `/dispatchEmails` (`orderBy('timestampMs', 'desc')`, bounded limit) when `isFirebaseConfigured()`, paired with `authorizedFetch('/api/email/webhook?action=sync_emails')` hydration/flush, `localStorage` persistence (`ct_dispatch_emails_v1` & `ct_dispatch_email_drafts_v1`), and `WorkspaceBus` (`EMAIL_STATE_CHANGED`) cross-window synchronization.
  - Supports 9 operational folder views: `'inbox'` (active non-archived/non-trashed inbound messages across `inbox` + `bookings` + `inquiries`), `'bookings'`, `'inquiries'`, `'sent'`, `'receipts'`, `'drafts'`, `'starred'` (`isStarred && folder !== 'trash'`), `'archive'`, and `'trash'`, plus instant search and `Unread Only` filtering.
  - Batch & single-message triage (`markEmailsRead`, `markEmailsUnread`, `toggleEmailStar`, `moveEmailsToFolder` across `inbox` | `archive` | `trash`, and `deleteDraft` / `discardDraft`) keeping `CommsThreadService` (`em_${emailId}` read/archive flags and `unreadByChannel.email`) in exact 1:1 sync.
- **Auto-Saved Drafts, Zero-Duplicate Outbound Threading & Canned Templates**:
  - `DispatchEmailDraft` (`id`, `toEmail`, `toName?`, `ccEmails?`, `subject`, `bodyText`, `threadId?`, `inReplyTo?`, `references?`, `tripId?`, `updatedAtMs`) with `saveDraft`, `listDrafts`, and `discardDraft` / `deleteDraft`.
  - `sendComposerEmail` dispatches via `authorizedFetch('/api/send-email')` (`type: 'direct'`, forwarding `threadId`, `inReplyTo`, `references`, `tripId`, `contactPhone`, `contactName`), hydrates the authoritative `emailId` / `rfcMessageId` returned by `/api/send-email` so sending never creates duplicate local + server records, and automatically removes any associated draft upon success.
  - Config-driven `CANNED_DISPATCH_EMAIL_TEMPLATES` and pure `interpolateDispatchEmailTemplate(template, context)` supporting `{firstName}`, `{passengerName}`, `{tripId}`, `{pickupAddress}`, `{dropoffAddress}`, `{pickupTime}`, `{trackingUrl}`, `{payUrl}`, and `{corporateAccount}` across 6 operational templates (*Reservation Confirmation & Chauffeur Details*, *STL / SUS Airport Curbside Pickup Instructions*, *Fare Quote & Online Booking Link*, *1-Tap Secure Payment / Invoice Link*, *Lost & Found Follow-Up*, and *Corporate Account & PO Confirmation*).
- **Modular `EmailDock` UI & Embedded Cross-Channel Sender Timeline (`app/components/domain/dispatch/email/*`)**:
  - `EmailFolderToolbar.tsx`: `dispatch@chesterfieldtaxi.com` header, compact operational folder pills with live unread/draft badges, `/` instant search shortcut, `Unread Only` toggle, manual `Sync` button, and multi-select Batch Action Bar.
  - `EmailMessageListPane.tsx`: High-density message/conversation rows with thread message count badge (`> 1`), delivery status pills (`Delivered`, `Sent`, `Bounced`, `Simulated`), attachment chip, category/VIP/Corporate badges, star toggle, multi-select checkbox, and scroll-safe mobile touch-and-hold action sheet (`useBottomSheetDragToClose`).
  - `EmailReaderPane.tsx`: Chronological conversation-threaded email viewer collapsing older messages to 1-line headers with click-to-expand and keeping the latest message expanded, safe HTML rendering via `sanitizeDispatchEmailHtml`, bounce/failure alert banner, attachment chips, structured **Extracted Booking Card** with 1-click **"Populate Dispatch Booking"** (`POPULATE_BOOKING`), and `Reply` / `Reply All` / `Forward` triggers.
  - `EmailComposerPane.tsx`: Inline threaded Reply/Reply-All/Forward and New Email composition (`From: Chesterfield Taxi Dispatch <dispatch@chesterfieldtaxi.com>`), `ContactService` `To` autocomplete, collapsible `Cc` field, Canned Template dropdown, **1-Tap Insert Tracking Link (`/track/...`)** and **1-Tap Insert Pay Link (`/pay/...` via `getPayLinkService()`)**, auto-saved draft indicator, and `Cmd/Ctrl + Enter` shortcut.
  - `EmailCrossChannelRail.tsx`: Toggleable / side-by-side **Unified Customer Activity & Trips** panel interleaving the sender's multi-channel `CommsThread` timeline (`Calls`, `SMS`, `Voicemails` with transcript snippet, `Internal Notes`, and `Emails`), matched active/upcoming/recent `Trip` cards (`Open Trip`, `Populate Rebook`, `Insert Tracking Link`, `Insert Pay Link`), and 1-tap **"Open in Comms Hub"** (`OPEN_COMMS_THREAD`) + **"Call Customer"** (`CALL_OUTBOUND_STARTED`).
- **Dispatch Workspace Integration (`dispatch.tsx`, `dispatch.popout.tsx`, `workspace-bus.service.ts`)**:
  - Broadcasts `EMAIL_STATE_CHANGED` across Dispatch windows, wires `trips` and `onOpenEditTrip` into `<EmailDock />` in both `/app/dispatch` and `/app/dispatch/popout?module=email` (with `getBookingService()` fallback inside `EmailDock`), and surfaces live unread email counts on the Dispatch `Email` dock/mobile tab badges.

## 42. Phase 42 (Wave 2 Phase 4): `CommsHub` Multi-Channel Thread UI/UX, Canned SMS Templates & Live Caller CRM Context
- **Pure Canned SMS Templates & Unified Caller/Thread CRM Context (`comms-templates.service.ts`)**:
  - Strictly pure/client-safe domain service (`app/core/services/comms/comms-templates.service.ts`, re-exported from `app/core/services/comms/index.ts`) with zero `*.server.ts` or `node:*` imports (`constitution.md`).
  - **Config-Driven Canned SMS Templates (`CANNED_DISPATCH_SMS_TEMPLATES`) & `interpolateCommsSmsTemplate(template, context)`**:
    1. `driver_en_route`: Driver en route with formatted `Car #` (`{carUnit}`), ETA/pickup time (`{pickupTime}`), `{pickupShort}`, and `{trackingUrl}`.
    2. `driver_arrived`: Driver arrived curbside (`{driverName}`, `{carUnit}`) at `{pickupShort}` + `{trackingUrl}`.
    3. `airport_curbside`: STL / SUS airport arrival & curbside meeting instructions dynamically resolved via `resolveStlTerminalInfo` (`STL Terminal 1 Exit Door 6`, `STL Terminal 2 Exit Door 12`, or `SUS FBO` private ramp/lobby) + `{trackingUrl}`.
    4. `reservation_confirmed`: Reservation `{tripId}` confirmed for `{pickupTime}` (`{pickupShort}` to `{dropoffShort}`) + `{trackingUrl}`.
    5. `payment_link`: 1-tap secure Stripe payment link (`{payUrl}`) for `{tripId}`.
    6. `flight_checkin`: Friendly arrival check-in asking `{firstName}` to text once luggage is collected so `{driverName}` (`{carUnit}`) can pull to the curb.
    - Supports `{firstName}`, `{passengerName}`, `{tripId}`, `{pickupTime}`, `{pickupShort}`, `{dropoffShort}`, `{driverName}`, `{carUnit}`, `{trackingUrl}`, and `{payUrl}` with deterministic fallbacks guaranteeing zero raw `{...}` placeholders ever remain.
  - **Pure Unified Caller / Thread CRM Context Resolver (`resolveCommsCrmContext`)**:
    - Computes a normalized `CommsCrmContextSummary` from `{ phone?, email?, threadId?, contact?, thread?, trips, drivers }`:
      - Contact flags: `contactName`, `firstName`, `primaryPhone`, `primaryEmail`, `isVip`, `vipReason`, `isBlacklisted`, `blacklistReason`, `corporateAccountName`, `corporateAccountNumber`, `preferredVehicleTier`, `accessibilityBadges: string[]`, `tripCount`, `customerScore`, `internalNotes`.
      - Matched `activeTrips` (status label, assigned driver name + formatted `Car #` unit, airport flight badge via `resolveTripFlightBadge`, `trackingUrl` via `buildTripTrackingUrl`, cached `payToken`/`payUrl`) plus `lastCompletedTrip` + `rebookPayload` (`buildPopulateRebookPayloadFromTrip`) for 1-tap rebooking.
- **Multi-Channel Thread List, Timeline & Composer Power Tools (`CommsHub.tsx` & `app/components/domain/dispatch/comms/*`)**:
  - **Live Cross-Channel Email Sync & Multi-Channel Thread List**:
    - Syncs `DispatchEmailService` directly into `CommsHub` so live inbound/outbound `dispatch@chesterfieldtaxi.com` emails appear inside `CommsHub` threads without needing `EmailDock` opened first, while keeping `EmailDock` as its dedicated email dock.
    - Upgrades conversation list rows (`SmsThreadPane` `mode === 'list'`) and selection in `CommsHub.tsx` so phone-only, email-only, and unified phone+email threads are selectable via canonical `threadId` / `primaryPhone || primaryEmail`, displaying multi-channel activity badges (`SMS`, `Call`, `VM`, `Email`, `Note`) and unread counts.
    - Supports full `All` tab channel filtering (`CommsFilterToolbar`) across `all`, `calls`, `voicemail`, `messages`, `emails`, and `notes`.
  - **Enhanced Multi-Channel Thread Timeline (`SmsThreadPane` `mode === 'thread'`)**:
    - Upgrades Email timeline cards with delivery status pills (`Received`, `Sent`, `Delivered`, `Bounced` / `Failed` warning), linked trip reference badge, `Book` button when `suggestedBooking` is present, and 1-tap **"Open in Email Dock"** (`OPEN_EMAIL_MESSAGE` + `FOCUS_MODULE: 'email'`).
    - Adds **1-Tap Retry** on failed/undelivered outbound SMS bubbles (`deliveryStatus === 'failed' || 'undelivered'`).
    - Adds a `Call` | `Email` | `Book` quick-action trio in the thread header (`Email` deep-links `EmailDock` via `OPEN_EMAIL_MESSAGE` + `FOCUS_MODULE: 'email'`) and a compact composer mode toggle (`SMS Reply` vs `Internal Note`) at the bottom of the thread so dispatchers can log internal notes from any thread tab without switching tabs.
  - **Dynamic Canned SMS Bar + 1-Tap Tracking & Pay Link Insertion**:
    - Replaces hardcoded SMS chips in `SmsThreadPane.tsx` and `NewSmsMessageModal` with config-driven `CANNED_DISPATCH_SMS_TEMPLATES` dynamically interpolated from `CommsCrmContextSummary`, paired with **1-Tap Insert Tracking Link** (`/track/...`) and **1-Tap Insert Pay Link** (`/pay/...` via `getPayLinkService()`) buttons when the contact has a matched trip.
- **Live Caller / Thread CRM Context Banner & Keyboard Shortcuts (`CommsCrmContextBanner.tsx`, `SoftphoneDialerPane.tsx`)**:
  - `CommsCrmContextBanner.tsx` rendered inside `SmsThreadPane.tsx` (selected thread) and `SoftphoneDialerPane.tsx` (active/ringing calls AND live on the dialpad when entered digits match a known contact or trip), surfacing VIP badge, Blacklist alert banner (`isBlacklisted`), Corporate Account pill, Accessibility/Vehicle preference tags, Active/Upcoming Trip pill (`Car #`, flight delay badge, 1-tap **Open Trip**), and 1-tap **Rebook Last Ride** (`POPULATE_BOOKING`).
  - Keyboard ergonomics across `CommsHub` & `SmsThreadPane`: `/` focuses the visible `CommsHub` search input when focus is outside editable fields, `Cmd/Ctrl + Enter` submits the active SMS reply or Internal Note, and `Escape` closes active `CommsHub` modals/action sheets or exits the active thread back to the list.

## 43. Phase 43 (Wave 2 Phase 5): Production Cutover Readiness, Firestore Rules/Indexes Alignment & Headless Browser Smoke Suite
- **Firestore Security Rules Audit & Composite Indexes Alignment (`firestore.rules` + `firestore.indexes.json`)**:
  - Comprehensive CEL-safety (`'key' in map` guards on optional map properties) and strict RBAC/multi-tenant boundary audit across all 15 operational and webhook collections: `/users`, `/trips`, `/tripTracking`, `/tripTrackingLookup`, `/payLinks`, `/paymentWebhookEvents`, `/flightStatusCache`, `/commsThreads`, `/commsEvents`, `/telephonyWebhookEvents`, `/dispatchEmails`, `/emailWebhookEvents`, `/corporateAccounts`, `/corporateLookup`, and `/invoices`.
  - Complete composite index manifest in `firestore.indexes.json` preserving existing `trips` dispatch queue indexes (`status` ASC + `pickupDateTime` ASC; `isAsap` ASC + `status` ASC) and adding all Wave 1 + Wave 2 multi-field query indexes:
    - `trips`: `corporateAccountId` ASC + `createdAt` DESC, and `corporateAccountId` ASC + `scheduledPickupTime` DESC.
    - `invoices`: `corporateAccountId` ASC + `issuedDate` DESC.
    - `commsEvents`: `threadId` ASC + `timestampMs` ASC, and `threadId` ASC + `timestampMs` DESC.
    - `dispatchEmails`: `folder` ASC + `timestampMs` DESC, and `threadId` ASC + `timestampMs` ASC.
- **Vercel-Preset Production Build Server Runner (`scripts/serve-prod-build.ts` & `npm start`)**:
  - Programmatic (`startProdBuildServer({ port?: number })`) and direct CLI Node HTTP server designed for `@vercel/react-router/vite` (`vercelPreset()`) builds where the compiled `ServerBuild` is emitted to `build/server/nodejs_*/index.js` (or `build/server/index.js`).
  - Resolves and dynamically imports the server entry via Windows-safe `pathToFileURL`, serves static assets from `build/client` and `public` (`/assets/*`, `/sw.js`, `/manifest.json`, `/manifest-driver.json`, icons, `robots.txt`, `sitemap.xml`) with accurate `Content-Type`, cache, and security headers, and forwards all SSR/single-fetch/API requests to `@react-router/node`'s `createRequestListener({ build })`.
- **Automated `puppeteer-core` Headless Chromium Smoke & Hydration Suite (`scripts/test-browser-smoke.ts` & `npm run test:smoke`)**:
  - Auto-detects local Chromium (`CHROME_PATH`, Google Chrome, Microsoft Edge, and macOS/Linux fallbacks), boots `startProdBuildServer({ port: 0 })` on `127.0.0.1`, and attaches `pageerror`, `console` (`error` / React hydration mismatch `#418` & `#423`), and same-origin `>= 500` / asset chunk listeners:
    - **Public & Customer Routes**: Verifies zero React hydration mismatches and zero uncaught page exceptions across `/`, `/book`, `/services`, `/about`, `/contact`, `/apply`, `/terms`, `/privacy`, `/track`, `/pay/pay_smoke_invalid_token_check` (graceful invalid/expired link state), `/app/login`, and `/app/register`.
    - **PWA & Static Asset Integrity**: Verifies `200` responses and valid payloads for `GET /manifest.json`, `GET /manifest-driver.json` (`start_url: "/app/driver"`), and `GET /sw.js`.
    - **Serverless API Endpoint Smoke & Auth Gates**: Verifies `GET /api/public-config` (`200` JSON) and `GET /api/send-email` (`200` JSON), plus unauthenticated security checks on `GET /api/telephony?action=list_messages`, `GET /api/flight-status?diagnostics=1`, and `GET /api/email/webhook?diagnostics=1` (returning clean JSON `401`/`403` when Firebase auth is configured, never `500` or HTML error pages).
    - **Application Workspaces**: Verifies zero uncaught `pageerror` exceptions and zero chunk-loading failures across `/app`, `/app/dispatch`, `/app/dispatch/popout?module=email`, `/app/dispatch/popout?module=comms`, `/app/driver`, `/app/corporate`, and `/app/admin`.
- **Full Wave 1 + Wave 2 Master Regression Gate**:
  - End-to-end production cutover verification across `npm run typecheck`, `npm run build` (confirming all 13 `/api/*` client chunks remain `0.00 kB`), `npm run test:smoke`, `npm run test:e2e`, `npm run test:stress`, and all 9 Wave 1 + Wave 2 domain test suites while keeping Vercel Hobby cron (`"0 10 * * *"`) in `vercel.json` untouched.

## 44. Phase 44 (Wave 3 Phase 1): Server/Client Bundle Separation & Route-Level Lazy Chunking
- **Zero-Behavior-Change Performance & Bundle Isolation Refactor**:
  - Strictly preserves all pricing calculations, Firestore schemas/security rules, API request/response contracts, SSR/client hydration determinism, `WorkspaceBus` cross-window synchronization, and Vercel Hobby cron (`"0 10 * * *"`).
- **100% Zero-KB `/api/*` Client Chunk Isolation (`public-settings.server.ts`)**:
  - Extracts `loadPublicSettingsForServer()` from `app/routes/api.public-config.ts` into server-only `app/core/services/config/public-settings.server.ts`, consumed by both `app/routes/api.public-config.ts` and `app/routes/book.tsx` `loader()` so all **14** `/api/*` resource routes compile to `0.00 kB` client chunks.
- **Elimination of `email-templates` & `resend` Browser Bundle Leak (`vehicle-tier-format.util.ts`)**:
  - Extracts pure `formatVehicleTier` and `formatVehicleTierDisplay` formatters into `app/core/utils/vehicle-tier-format.util.ts` (re-exporting from `app/core/services/email/email-templates.ts` for server/test compatibility) and updates all 12 client/UI surfaces (`BookingConfirmation.tsx`, `AdminTripsSubpage.tsx`, `DispatchTripDetailsDrawer.tsx`, `DispatchTripQueuePane.tsx`, `DriverLiveMeterCard.tsx`, `DriverShiftControls.tsx`, `DriverTripManifest.tsx`, `CustomerTelemetryMap.tsx`, `app/routes/app.tsx`, `app/routes/booking.status.tsx`, `app/routes/dispatch.tsx`, `app/routes/driver.tsx`).
  - Removes static top-level client imports of `resend` and `./email-templates` from `app/core/services/email/resend-email.service.ts` and `app/core/services/email/index.ts`, loading `resend` and `./email-templates` dynamically strictly inside server-side (`typeof window === 'undefined'`) execution paths while keeping browser dispatches lightweight `fetch('/api/send-email')` calls.
- **Per-Tab Code Splitting on `/app/admin` (`app/routes/admin.tsx`)**:
  - Converts all 14 Admin tab and subpage modules (`AdminDashboardTab`, `AdminGeneralTab`, `AdminRatesTab`, `AdminVehiclesTab`, `AdminZonesTab`, `AdminOperatorsTab`, `AdminAdvancedTab`, `AdminTripsSubpage`, `AdminInvoicingSubpage`, `AdminCustomersSubpage`, `AdminWebsiteTab`, `AdminArchiveTab`, `AdminIntegrationsSubpage`, `AdminRulesTab`) to direct module-level `React.lazy()` dynamic imports wrapped in `<Suspense>` inside the tab content area, reducing the `admin-*.js` route entry chunk from `~873 kB` to `< 120 kB`.
- **Detached Pop-Out & Secondary Dispatch Dock Lazy Chunking (`dispatch.popout.tsx`, `dispatch.tsx`, `dispatch-trip-email.util.ts`)**:
  - Extracts `getContextualEmailMeta` and `sendDispatchContextualTripEmail` from `DispatchTripDetailsDrawer.tsx` into `app/core/services/dispatch/dispatch-trip-email.util.ts` (re-exporting from `DispatchTripDetailsDrawer.tsx` for compatibility).
  - Converts `CommsHub`, `EmailDock`, `DispatchBookingEngine`, and `LiveFleetMap` in `app/routes/dispatch.popout.tsx` to `React.lazy()` + `<Suspense>` so detached pop-out windows (`?module=email`, `?module=comms`, `?module=booking`, `?module=map`) download only their active module.
  - Converts `CommsHub`, `EmailDock`, `AppSuiteLauncher`, and `DispatchTripDetailsDrawer` in `app/routes/dispatch.tsx` to `React.lazy()` + `<Suspense>` while preserving WebRTC softphone persistence, `WorkspaceBus` listeners, and SSR hydration parity.
- **Automated Production Bundle Budget Assertions (`scripts/test-browser-smoke.ts`)**:
  - Enforces automated build-asset assertions inside `verifyCutoverConfigInvariants` verifying every `api.*.js` chunk in `build/client/assets/` is `< 1024` bytes (`0.00 kB`) and the `admin-*.js` route entry chunk is `< 153600` bytes (`< 150 KB`).

## 45. Phase 45 (Wave 3 Phase 2): Dual Booking Engine Decomposition (`BookingEngineV2.tsx` & `DispatchBookingEngine.tsx`)
- **Strictly Zero-Behavior-Change Structural Refactor**:
  - Preserves 100% of existing 4-pillar pricing/surcharge math, multi-stop waypoints, return-trip parity & symmetric fare balancing, corporate PO anti-fraud verification, Stripe card pre-authorization & in-cab flows, multi-car convoy splitting & associate roster linkage, recurring schedule generation, edit-mode state & draft caching, deterministic React 19 SSR hydration (`useState` initializers never read `localStorage` during initial render), zero secret-shaped literals (`constitution.md` Section 3), and Vercel Hobby cron (`"0 10 * * *"`).
- **Customer Booking Engine Decomposition (`BookingEngineV2.tsx` `< 1,600` lines)**:
  - Preserves 100% of `BookingEngineV2` public exports (`BookingEngineV2`, `BookingEngineV2Props`, `BookingEngineV2InitialValues`, `CorporatePortalBookingContext`, `COMMON_FBO_FACILITIES`, `formatUsPhone`, `formatTime12h`, `SpecialRequestKey`, `CustomerVehicleChoice`, `WaypointItem`, `AdditionalPassengerItem`).
  - Extracts focused section components under `app/components/domain/booking/sections/`:
    - `CustomerRouteTimingSection.tsx`: ASAP/Scheduled timing switcher, pickup/dropoff autocomplete, multi-stop waypoints, route distance/duration preview, and outbound `FlightAssistanceCard`.
    - `CustomerVehicleExtrasSection.tsx`: Passenger/carry-on/checked counters, oversized cargo categories, Missouri RSMo § 307.179 child safety seats, universal custom add-on extras, and single/multi-vehicle tier selector.
    - `CustomerReturnTripSection.tsx`: Optional standalone return trip switch, return date/time, return route/stops/swap, return `FlightAssistanceCard`, return pax/bags/extras/car-seats, and return single/multi-vehicle parity selector.
    - `CustomerPassengerNotesSection.tsx`: Primary passenger contact details, additional passengers list, booker/coordinator contact drawer, and collapsible special requests / gate code / chauffeur notes.
    - `CustomerPaymentSection.tsx`: Cash/Card/Corporate payment method tabs, Stripe online vs. in-car card sub-panel, pre-verified/public corporate account & PO fields, sticky Trip Summary & Price Breakdown card, SMS/Terms agreements, desktop submit CTA, and mobile sticky submit bar.
  - Extracts live quote debouncing, customer form validation, Stripe pre-auth hold orchestration, corporate verification, multi-car web splitting, linked return creation, and email dispatch into `app/core/hooks/booking/useCustomerBookingSubmission.ts` (re-exported from `app/core/hooks/booking/index.ts`).
- **Operator Dispatch Booking Engine Decomposition (`DispatchBookingEngine.tsx` `< 1,700` lines)**:
  - Preserves 100% of `DispatchBookingEngine` (`React.memo`) and public type/value exports (`DispatchFormValues`, `DispatchBookingEngineProps`, `ContactPersonDetails`, `CardDetails`, `CorporateAccountDetails`, `ReturnTripDetails`, `RepeatTripDetails`, `COMMON_FBO_FACILITIES`, `AdditionalPassenger`, `CarSeatsBreakdown`, `VehicleChoice`).
  - Extracts focused operator booking modules under `app/components/domain/dispatch/booking/`:
    - `DispatchConvoyBanners.tsx`: Completed/cancelled trip lock banners, submit error alert, linked multi-car convoy edit banner with sibling navigation, and multi-vehicle split notice.
    - `DispatchRoutingTimingSection.tsx`: Timing pill switch with local draft-saved badge, outbound pickup/stops/dropoff routing, airport/private-aviation FBO fields, and live staff `FlightTelemetryCheckPanel` (`allowLiveCheck={true}`).
    - `DispatchPassengerCrmSection.tsx`: Instant CRM + historical trip phone/name lookup dropdown, VIP/BLOCKED/Corporate governance badges, 1-click recent address chips, multi-passenger rows, and booker/coordinator contact section.
    - `DispatchExtrasVehicleSection.tsx`: Pax/carry-on/checked counters, oversized cargo, 3-tier child safety seats, universal custom extras, special requests & gate code, and inline multi-vehicle selector with live per-tier quotes.
    - `DispatchPaymentAssignmentSection.tsx`: Segmented Cash/Card/Account tabs, PCI-safe card reference sub-panel, corporate PO anti-fraud validation & supervisor override, named pricing rule/tariff & courtesy discounts, fee waiver chips, company & driver assignment, and notes for all / internal dispatch notes.
    - `DispatchReturnRepeatSection.tsx`: Linked round-trip lock card or full return leg specifications (route, stops, return flight telemetry check, date/time, pax/bags/oversized/car-seats, return multi-vehicle selector, auto-create toggle) plus recurring ride schedule panel.
    - `DispatchBookingFooterBar.tsx`: Expandable canonical `PriceBreakdownPanel` drawer, sticky bottom action bar (manual fare override, breakdown toggle, leg split summary, email confirm toggle, Copy Booking / Clear Form, Book / Update CTA), and Clear Form `ConfirmationModal`.
  - Extracts live outbound/return 4-pillar quote effects, draft/edit hydration & snapshot helpers, and single-car / multi-car convoy / edit-split / linked-return / recurring-schedule / confirmation-email submission workflow into `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts`.
- **Automated Monolith Prevention Guardrail (`scripts/test-browser-smoke.ts`)**:
  - Extends `verifyCutoverConfigInvariants` in `scripts/test-browser-smoke.ts` to assert both `app/components/domain/BookingEngineV2.tsx` and `app/components/domain/dispatch/DispatchBookingEngine.tsx` remain `< 1800` lines.

## 46. Phase 46 (Wave 3 Phase 3): Dispatch Workspace Decomposition & Responsive Trips Queue (Table Overflow Auto-Cards + Dynamic Resizable Card Columns)
- **Strict Functional & SSR Determinism Guardrails**:
  - Preserves 100% of existing dispatch triage flows, SLA alerts, offer cascades, flight telemetry, pay links, standardized SMS/Email floating `+` compose & bottom-docked composers, mobile `Trips · Booking · Comms · Email · Fleet` navigation, deterministic React 19 SSR hydration (`useState` initializers never read `localStorage` or `window` dimensions during initial render), zero secret-shaped literals (`constitution.md` Section 3), and Vercel Hobby cron (`"0 10 * * *"`).
- **Responsive Trips Queue: Table Overflow Auto-Cards + Dynamic Container Columns (`DispatchTripQueuePane.tsx` `< 900` lines)**:
  - Decomposes `app/components/domain/dispatch/DispatchTripQueuePane.tsx` into modular sub-components under `app/components/domain/dispatch/queue/`:
    - `trip-queue-layout.util.ts`: Pure layout & responsive column calculators (`resolveEffectiveQueueDisplayLayout`, `computeResponsiveTripCardColumns`, `TABLE_OVERFLOW_MIN_WIDTH_PX = 860`) plus shared queue formatting/helper types.
    - `TripQueueToolbar.tsx`: Queue status tabs (`Active`, `Scheduled`, `Completed`, `Cancelled`), search input, date-range filter, urgency/filter pills, multi-select batch bar, and Layout switcher (`Cards` / `Table` / `Compact`) showing a subtle `Cards (Auto)` indicator when auto-switched.
    - `TripQueueTableView.tsx`: Dense tabular queue renderer.
    - `TripQueueCardsGrid.tsx`: Responsive container-driven card grid renderer.
    - `TripQueueCompactList.tsx`: High-density compact row renderer.
  - **Non-Destructive Table Horizontal Overflow → Auto-Cards Switch**:
    - Tracks live Trips Queue container width via `ResizeObserver` (`queueWidthPx`, initialized deterministically to `0` on SSR/initial render).
    - When `isDesktop && displayLayout === 'table'` and `queueWidthPx > 0 && queueWidthPx < 860` (e.g., when opening the Phone/Email/Drivers right dock or widening sidebars), resolves `effectiveDisplayLayout = 'cards'` and `isAutoCardsFallback = true` **without overwriting** the user's saved `'table'` preference in state/`localStorage`, and automatically restores `'table'` as soon as `queueWidthPx >= 860`.
  - **Container-Driven Dynamic Card Columns on Resize**:
    - Replaces viewport-bound `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` classes in `TripQueueCardsGrid.tsx` with true Trips-section container-width columns (`computeResponsiveTripCardColumns(queueWidthPx)`: `1` col `< 580px`, `2` cols `580–899px`, `3` cols `900–1219px`, `4` cols `>= 1220px`, backed by `@container/tripqueue` CSS fallback prior to client measurement) so dragging either the Left Booking Sidebar resizer or Right Operations Dock resizer smoothly updates card column count in real time without cramped cards or horizontal scrollbars.
- **Dispatch Route Orchestrator Decomposition (`app/routes/dispatch.tsx` `< 1,750` lines)**:
  - Extracts focused workspace hooks under `app/core/hooks/dispatch/`:
    - `useDispatchPanelResize.ts`: Left booking sidebar, bottom trip queue, and right operations dock pointer drag-resizing, clamping, and post-mount `localStorage` persistence.
    - `useDispatchSlaCascadeLoop.ts`: Periodic SLA urgency scanner, tactical alerts synthesizer, and auto-offer cascade timer loop.
  - Extracts focused workspace UI modules under `app/components/domain/dispatch/workspace/`:
    - `DispatchDesktopTopHeader.tsx`: Incoming softphone call alert banner, desktop `Main | Phone | Email | Drivers` workspace switcher, `DispatchHeaderCallHud`, Tactical Alerts bell dropdown, audio/wake-lock/push settings menu, and lazy `AppSuiteLauncher`.
    - `DispatchNavigationShell.tsx`: Slide-out operations/profile drawer and 5-tab `Trips · Booking · Comms · Email · Fleet` mobile bottom dock.
    - `DispatchRightOperationsDock.tsx`: Resizable right desktop dock hosting lazy `CommsHub` (kept mounted once loaded for WebRTC softphone continuity), `EmailDock`, and `DispatchDriverRosterPane`.
- **Drawer & CommsHub Decomposition (`DispatchTripDetailsDrawer.tsx` `< 1,200` lines & `CommsHub.tsx` `< 1,600` lines)**:
  - Splits `app/components/domain/dispatch/DispatchTripDetailsDrawer.tsx` into `app/components/domain/dispatch/drawer/` (`TripDrawerOverviewSection.tsx`, `TripDrawerPricingPaymentSection.tsx`, `DispatchCompleteTripModal.tsx`), preserving all exports (`DispatchTripDetailsDrawer`, `getContextualEmailMeta`, `sendDispatchContextualTripEmail`).
  - Splits `app/components/domain/dispatch/CommsHub.tsx` by extracting `useTwilioSoftphoneDevice.ts` (inbound ringtone + lazy `@twilio/voice-sdk` WebRTC device + PSTN bridge fallback) and `CommsRowActionSheet.tsx` under `app/components/domain/dispatch/comms/`, preserving `CommsHub` (`React.memo`) and the standardized bottom-docked SMS composer + floating `+` button.
- **Automated Monolith Prevention Guardrails (`scripts/test-browser-smoke.ts`)**:
  - Extends `verifyCutoverConfigInvariants` in `scripts/test-browser-smoke.ts` to assert line-count ceilings: `app/routes/dispatch.tsx < 2000` lines, `DispatchTripQueuePane.tsx < 1200` lines, `DispatchTripDetailsDrawer.tsx < 1500` lines, and `CommsHub.tsx < 1800` lines.

## 47. Phase 47 (Wave 3 Phase 4): Heavy Admin Subpages & Wave 2 Domain Service Split
- **Strictly Zero-Behavior-Change Structural Refactor**:
  - Preserves 100% of existing invoicing & Accounts Receivable math, corporate PO anti-fraud & batch billing workflows, driver commission/payout calculations, geofence polygon/circle/group/collection/blacklist spatial logic, Twilio `X-Twilio-Signature` HMAC-SHA1 verification, `audio_proxy` HMAC query token auth, WebRTC voice token issuance & PSTN fallback, Resend Svix HMAC-SHA256 webhook verification & RFC `Message-ID`/`In-Reply-To`/`References` email threading, deterministic React 19 SSR hydration, zero secret-shaped literals (`constitution.md` Section 3), and Vercel Hobby cron (`"0 10 * * *"`).
- **Heavy Admin Subpages Decomposition (`AdminInvoicingSubpage.tsx` `< 1,200`L & `AdminZonesTab.tsx` `< 1,100`L)**:
  - Splits `app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx` into focused modules under `app/components/domain/admin/invoicing/` (`InvoiceLedgerTable.tsx`, `InvoiceBuilderModal.tsx`, `CorporateAccountsPanel.tsx`, `DriverPayoutsPanel.tsx`, `useAdminInvoicingActions.ts`, `index.ts`) while preserving `AdminInvoicingSubpage`, `AdminInvoicingSubpageProps`, and `InvoicingSubTab` exports.
  - Splits `app/components/domain/admin/AdminZonesTab.tsx` into focused modules under `app/components/domain/admin/zones/` (`ZoneDirectoryListPane.tsx`, `ZoneInspectorEditorPane.tsx`, `ZonePolygonMapCanvas.tsx`, `useAdminZonesController.ts`, `types.ts`, `index.ts`) while preserving `AdminZonesTab`, `AdminZonesTabProps`, and `AdminZonesSubTab` exports.
- **Wave 2 Domain Services Modularization (`< 1,300` lines each)**:
  - Splits `app/core/services/comms/telephony-gateway.server.ts` into `telephony-credentials.server.ts` (env/credential resolution, `X-Twilio-Signature` HMAC-SHA1 verification, signed `audio_proxy` token helpers & streaming proxy, WebRTC voice JWT token builder, in-memory test store), `telephony-twiml-webhooks.server.ts` (inbound/outbound TwiML & call/recording/voicemail/SMS webhook handlers), and `telephony-outbound-rest.server.ts` (outbound PSTN `make_call`, `send_sms`, and Twilio REST credential verification), keeping `telephony-gateway.server.ts` (`< 1,300`L) as the orchestrator re-exporting 100% of existing public functions, constants, and types (`0.00 kB` client API chunks).
  - Splits `app/core/services/email/dispatch-email.service.ts` by extracting static seed emails, folder/badge configs, canned dispatch email templates, variable interpolation, and pure filter/conversation/booking-payload helpers into `app/core/services/email/dispatch-email-catalog.ts` and multi-channel sender timeline resolution into `app/core/services/email/dispatch-email-timeline.ts` (both strictly client-safe: zero `*.server` or `node:*` imports) and re-exporting every existing public symbol from `dispatch-email.service.ts` (`< 1,300`L).
  - Splits `app/core/services/email/dispatch-email.server.ts` by extracting shared server store/persistence helpers into `app/core/services/email/dispatch-email-store.server.ts` and Svix HMAC-SHA256 signature verification, Resend inbound `email.received` & delivery status webhook handlers, diagnostics, and server sync helpers into `app/core/services/email/dispatch-email-webhook.server.ts`, re-exporting every existing public symbol from `dispatch-email.server.ts` (`< 1,300`L) so `/api/email/webhook` and `/api/send-email` remain `0.00 kB` client chunks with zero caller modifications.
- **Automated Monolith Prevention Guardrails (`scripts/test-browser-smoke.ts`)**:
  - Extends `monolithBudgets` in `scripts/test-browser-smoke.ts` to assert:
    - `app/components/domain/admin/subpages/AdminInvoicingSubpage.tsx < 1400` lines
    - `app/components/domain/admin/AdminZonesTab.tsx < 1300` lines
    - `app/core/services/comms/telephony-gateway.server.ts < 1400` lines
    - `app/core/services/email/dispatch-email.service.ts < 1400` lines
    - `app/core/services/email/dispatch-email.server.ts < 1400` lines

## 48. Phase 48 (Wave 3 Phase 5 — Final Wave 3 Phase): Rates, Pricing Rules & Surcharge Enable/Disable Audit Trail
- **Staff-Only Audit Persistence & Zero Public PII Leakage**:
  - Preserves public read access on `/pricingConfig/{document=**}`, `/tariffs/{document=**}`, and `/pricingRules/{document=**}` for upfront customer quotes with **zero** operator emails, names, UIDs, or internal audit notes ever written into public pricing documents.
  - Persists the structured 4-pillar pricing audit log in **`/config/pricingAuditLog`** (`{ events: PricingAuditEvent[], updatedAt: string }`, capped to the latest `500` events and sanitized via `sanitizePayload`), already protected by `match /config/{document=**} { allow read, write: if isDispatcher(); }` in `firestore.rules` with zero rule modifications required.
  - Mirrors summary `ConfigAuditEntry` items into `AppSettings.configAuditTrail` so system-wide configuration auditing remains unified.
- **Instant 1-Click Surcharge Enable/Disable Toggle, Optional Note & Live Provenance (`SurchargesPanel.tsx`)**:
  - Clicking a surcharge card's `Enabled` / `Disabled` switch performs an **instant 1-click persisted save + audit event** (with per-card saving spinner/guard and zero blocking confirmation modals or separate `Save Surcharges` step required) without discarding unsaved rate, mode, or policy edits on other cards.
  - Pairs each surcharge card with a lightweight inline **optional audit note** input (`Optional reason / note (e.g. Winter storm I-64)...`) captured automatically when toggling in 1 click or clicking `Save Surcharges`, plus `+ Add note` / `Edit note` inline editing on existing provenance records (`updateAuditEventNote(eventId, note)`).
  - Displays live per-surcharge enable/disable provenance directly on each card:
    - When enabled: timestamp, operator identity, optional note badge, and quick `History →` drawer deep-link.
    - When disabled: timestamp, operator identity, automatically computed **`Was active {duration}`** (`activeDurationMinutes` from the matching prior `surcharge_enabled` event), optional note badge, and `History →` deep-link.
- **Full 4-Pillar Deterministic Diffing & Slide-Over Audit Inspector (`PricingAuditDrawer.tsx` & `PricingAdminWorkspace.tsx`)**:
  - Pure deterministic diff calculators (`diffSurchargesConfig`, `diffTariffChange`, `diffPricingRuleChange`, `diffUniversalExtrasChange`) emit structured `{ field, label, before, after }` diffs across Surcharges, Service Rates, Pricing Rules (`rule_enabled` / `rule_disabled` with active duration + `surchargeActions` directives), and Universal Extras while suppressing no-op saves (`diffs.length === 0`).
  - Slide-over `PricingAuditDrawer` mounted alongside `Live Fare Preview` in `PricingAdminWorkspace.tsx` featuring `All · Surcharges On/Off · Surcharges (All) · Rates · Rules · Extras` filter pills, per-surcharge dropdown filter, instant text search, color-coded timeline cards with `{ before → after }` diff chips, inline note editing, and RFC-4180 `Export CSV` (`chesterfield-pricing-audit-YYYY-MM-DD.csv`).

## 49. Phase 49 (Wave 3 Phase 6): Multi-Stop Queue Indicators, Color-Coded Map Route Teardrop Pins & Dispatch Map Preferences
- **Unified Green / Amber / Rose Route Color Language (`route-markers.util.ts`)**:
  - Aligns route pins and queue indicators across Dispatch Booking (`DispatchLocationInput.tsx`), Trips Queue, Live Fleet Map (`LiveFleetMap.tsx`), Detached Map Pop-out (`dispatch.popout.tsx`), and Customer Live Tracking (`CustomerTelemetryMap.tsx`):
    - **Pickup**: Emerald `#10b981` (border `#047857`) teardrop pin with inner white circle dot.
    - **Intermediate Stop (`1..N`)**: Amber/Orange `#f59e0b` (border `#b45309`) teardrop pin with bold centered white stop number (`1`, `2`, `3`, ...).
    - **Dropoff**: Rose/Red `#ef4444` (border `#b91c1c`) teardrop pin with inner white rounded square destination glyph.
- **Zero-Width-Regression Multi-Stop Queue Indicators & `Has Stops` Filter**:
  - **Trips Table (`TripQueueTableView.tsx` — Zero New Columns)**: Keeps the exact 10-column table structure and live `scrollWidth > clientWidth` auto-cards overflow detection, rendering a compact second-line amber pill (`+1 stop · Chesterfield Mall` / `+2 stops · ...`) inside the existing `PICKUP` `<td>` (`max-w-[160px]`) with full ordered itinerary hover tooltip (`buildTripItineraryTooltip`).
  - **Trip Cards (`TripQueueCardsGrid.tsx`)**: Upgrades the route box into a vertical **Green → Orange → Red** list where intermediate stops render as a single uniform-height clickable amber row (`+N stop(s) · preview ▾`) that expands inline on click to reveal numbered orange rows (`1..N`) between Pickup and Dropoff without selecting/opening the card.
  - **Compact List (`TripQueueCompactList.tsx`)**: Renders an inline compact `+N stop(s)` amber pill between Pickup and Dropoff with ordered itinerary tooltip.
  - **Queue Filter (`TripQueueToolbar.tsx` & `dispatch-workspace.util.ts`)**: Adds `has_stops` (`Has Stops`) to `QueueFilterType` and `FILTER_MENU_ITEMS`, renders an active amber filter pill (`Has Stops ✕`), and filters `filteredTrips` via `getTripIntermediateStopCount(trip) > 0` (plus matching intermediate stop addresses in text search).
- **Custom Teardrop Map Pins, Cased Directional Polyline & Live `DispatchMapPreferences`**:
  - Retires Google's generic red `A > B > C` `DirectionsRenderer` markers (`suppressMarkers: true`, `suppressPolylines: true`) in favor of pooled custom teardrop SVG markers (`34×42`, tip-anchored at `(17, 40)`) and managed polylines across both Google Directions mode and Mock Routing mode (`LiveFleetMap.tsx < 1,350`L via extracted `app/components/domain/dispatch/map/route-map-sync.ts` & `MapRouteOverlayHud.tsx`).
  - Persists SSR-deterministic `DispatchMapPreferences` (`ct_dispatch_map_prefs_v1`, all `true` by default, synced instantly across same-window components and detached `?module=map` pop-outs) exposed in both the Top-Right `⚙️` Console Settings Menu (`DispatchDesktopTopHeader.tsx`) and Slide-Out Operations Drawer (`DispatchNavigationShell.tsx`):
    1. `casedRouteWithArrows` (`true`): Outer dark navy casing (`#1e3a8a`) + inner `#2563eb` route line with periodic `FORWARD_CLOSED_ARROW` directional chevrons (`repeat: '90px'`).
    2. `interactiveRoutePinPopovers` (`true`): Clicking any Green / Orange `#1..#N` / Red route pin opens a floating waypoint details card with color badge, full street address, and location/driver notes.
    3. `showRouteSummaryPill` (`true`): Compact bottom-left floating route summary pill showing `🟢 Pickup → 🟠 N Stop(s) → 🔴 Dropoff`, passenger/`#TRIP` tag, resolved mileage/ETA, and 1-click **`✕`** Clear Route (`onClearSelectedTrip`).
  - Upgrades `CustomerTelemetryMap.tsx` pickup/stop/dropoff markers from default `'P'`/`'1'`/`'D'` markers to the shared `buildRouteWaypointPinDataUrl` teardrop SVG pins (`32×40`).

## 50. Phase 50 (Wave 4 Phase 1): Intelligent Auto-Dispatch Engine, Pre-Pickup Lead Window, Admin Control Center, `Auto-Pilot` Switch & `Auto-Dispatch Ready (N)` Sweep
- **Backward-Compatible `DispatchAutomationConfig`, RBAC Helper & `Trip` Schema (`app/core/types/config.ts` & `app/core/types/trip.ts`)**:
  - Adds `DispatchAutomationMode` (`'manual_1tap' | 'sequential_cascade' | 'broadcast_pool' | 'direct_auto_assign'`) and `ActiveAutoDispatchStrategyMode = Exclude<DispatchAutomationMode, 'manual_1tap'>`, inferring `'sequential_cascade'` from legacy `autoOfferOnConfirm === true` (else `'manual_1tap'`) and synchronizing `autoOfferOnConfirm = dispatchMode !== 'manual_1tap'`.
  - Extends `DispatchAutomationConfig` with `sweepExecutionMode` (`'sequential_cascade'`), `isPaused` / `pausedAt` / `pausedBy` / `pauseReason`, `broadcastPoolSize` (`3`, clamped `2..8`), `autoDispatchAsapRides` (`true`), `autoDispatchScheduledRides` (`true`), `scheduledDispatchLeadMinutes` (`45`, clamped `15..240`), `autoReleaseStagedDrivers` (`true`), `stagedAutoReleaseLeadMinutes` (`45`, clamped `15..240`), `authorizedLeadWindowDispatcherIds` (`string[]`), `maxPickupRadiusMiles` (`18`, clamped `0..100`, `0` = unlimited), `strictZoneFirst` (`true`), `minDriverScore` (`0`, clamped `0..100`), `maxGpsStaleSeconds` (`300`, clamped `0..3600`, `0` = allow no-GPS on-duty drivers), `operatingHoursMode` (`'always' | 'custom_window'`), `windowStartHour` (`22`) / `windowEndHour` (`6`), and `fallbackOnExhaustion` (`'alert_dispatch' | 'broadcast_all_eligible'`).
  - Exports pure `canOperatorConfigureLeadWindows(user, config)` granting Pre-Pickup / Auto-Release Lead-Window editing to any `'admin'` OR any `'dispatcher'` whose `uid` or normalized lowercase `email` is listed in `authorizedLeadWindowDispatcherIds`.
  - Extends `TripOfferCascade` (`mode`, `activeOfferedDriverIds`, `fallbackBroadcastUsed`), `TripAuditEvent` (`'DRIVER_ASSIGNED'`), and `Trip` (`plannedDriverId`, `plannedDriverLabel`, `plannedAt`, `plannedBy`) for seamless staged-driver priority.
- **4-Mode Auto-Dispatch Engine, Pre-Pickup Lead-Window Gating & `/api/auto-dispatch` (`auto-dispatch-ranking.ts`, `auto-dispatch.service.ts`, `auto-dispatch.server.ts`, `api.auto-dispatch.ts`)**:
  - Pure `evaluateAutoDispatchCandidates` returns `{ eligible, excluded }` enforcing duty, conflict, blacklist, grounded-vehicle, capacity/WAV/SUV, `minDriverScore`, `maxGpsStaleSeconds`, `maxPickupRadiusMiles`, and `strictZoneFirst` while recording structured `{ driverId, driverLabel, exclusionCode, exclusionReason }` diagnostics for every skipped unit.
  - Pure `isWithinAutoDispatchOperatingHours`, `isTripWithinDispatchLeadWindow`, `getReadyForAutoDispatchTrips`, and `isTripEligibleForAutoPilot` guarantee scheduled rides hours, days, weeks, or months ahead (`minutesUntilPickup > scheduledDispatchLeadMinutes + airportExtra`) remain untouched in `CONFIRMED` under both continuous `Auto-Pilot` and manual `Auto-Dispatch Ready (N)` sweeps.
  - Supports all 4 assignment modes: `manual_1tap` (with configurable `sweepExecutionMode`), `sequential_cascade` (1-by-1 rollover + optional `broadcast_all_eligible` exhaustion fallback), `broadcast_pool` (simultaneous Top-K offer pool with atomic first-accept win, partial-decline wait, and timeout batch rollover), and `direct_auto_assign` (`#1` candidate assigned immediately with frozen `assignedVehicle`, `DRIVER_ASSIGNED` audit event, and push alert).
  - Server-isolated `POST /api/auto-dispatch` (`0.00 kB` client chunk, rate-limited, zero Firestore rule changes) verifies authoritative Firestore state via service-account Datastore REST and runs `executeAutoDispatch` idempotently for unattended web bookings (`useCustomerBookingSubmission.ts`) and `sla-cron.server.ts` (`vercel.json` `"0 10 * * *"` preserved).
- **Admin Control Center (`AdminAutoDispatchControlPanel.tsx`), Dispatch `Auto-Pilot` Switch & 1-Click `Auto-Dispatch Ready (N)` Sweep**:
  - Extracts `AdminAutoDispatchControlPanel.tsx` (and `AdminAutoDispatchSimulator.tsx`) under `app/components/domain/admin/rules/` so `AdminRulesTab.tsx` drops `< 1,350` lines (enforced `< 1,400`L in `scripts/test-browser-smoke.ts`), providing 4 Mode Cards, `sweepExecutionMode`, Pre-Pickup Lead Window sliders, `Authorized Dispatchers (Lead-Window Control)` checklist, Candidate Guardrails, Operating Schedule, and Interactive Dry-Run Simulator (live `/drivers` + 1-click Sample 5-Car Fleet toggle).
  - Adds a 1-click **`⚡ Auto-Pilot: ON` / `⏸ Auto-Pilot: PAUSED`** pill and `⚙️` Console Settings **Pre-Pickup Lead Window** quick control (editable when `canOperatorConfigureLeadWindows` is `true`, read-only `Set by Admin` otherwise, audited in `AppSettings.configAuditTrail`) in `DispatchDesktopTopHeader.tsx`.
  - Adds live 1-click **`⚡ Auto-Dispatch Ready (N)`** sweep in `TripQueueToolbar.tsx` (`useDispatchSlaCascadeLoop.ts`) and upgrades `DispatchCascadePill` to render `⚡ Pool (K cars) • Ns` for `broadcast_pool`.

## 51. Phase 51 (Wave 4 Phase 2): Staged Driver Shift Planner (`plannedDriverId`), `DriverQueueWindow` Turnaround/Overlap Checker, `Send to Driver` / `Send` Actions, Authorized-Dispatcher Auto-Release Window & Staged Override Prompt
- **Zero `/app/driver` Leak & Strict UI Wording (`Send to Driver` / `Send`)**:
  - Staging a driver sets `plannedDriverId`, `plannedDriverLabel`, `plannedAt`, and `plannedBy` (plus a `DRIVER_STAGED` `TripAuditEvent`) while keeping `assignedDriverId: null`, `offeredToIds: []`, and `multiCarDriverIds` free of staged drivers—preserving `firestore.rules` untouched so staged placeholders remain 100% invisible on `/app/driver` with zero push/SMS alerts until explicitly sent or auto-released.
  - Strictly standardizes operator wording on **`Send to Driver`** (drawers, modals, booking segmented control, batch actions) and concise **`Send`** (`title="Send to Driver"`) on compact queue rows/cards; zero `"HUD Now"` labels anywhere.
- **Pure Staged Driver Domain Service (`app/core/services/dispatch/staged-driver-planner.service.ts`)**:
  - Placeholder lifecycle: `isTripEligibleForStaging`, `stageDriverForTrip`, `clearStagedDriver` (`DRIVER_UNSTAGED`), `sendStagedTripToDriver` (`direct_assign` default promoting `plannedDriverId -> assignedDriverId` with frozen `assignedVehicle` snapshot, `DRIVER_ASSIGNED` provenance, and push alert, plus optional `offer_first`), and batch `sendMultipleStagedTripsToDrivers`.
  - Chronological schedule & turnaround sanity checker (`computeDriverScheduleTimeline`): Interleaves live `Assigned` and `📌 Staged` rides chronologically, computing projected pickup/dropoff timestamps, `bufferMinutesAfterPrior`, and `conflictStatus` (`'overlap'` `< 0m`, `'tight_turnaround'` `0..14m`, `'ok'` `>= 15m` or first leg).
  - Non-destructive `computeAutoStageSuggestions`: Greedily pairs open unstaged scheduled rides with eligible non-blacklisted compatible drivers while simulating each driver's projected timeline so suggested `plannedDriverId` placeholders never introduce `< 15m` turnaround conflicts.
  - Lead-window automatic release & conflict partitioning: `getDueStagedTripsForAutoRelease`, `releaseDueStagedTrips` (auto-sending due staged trips inside `T - (stagedAutoReleaseLeadMinutes + airportExtra)` when the staged driver is `on_duty` and conflict-free, or returning `staged_driver_offline` / `staged_driver_conflict` alerts without dropping the ride), and `partitionTripsByStagedConflict`.
- **`DriverQueueWindow`, Queue Views, Drawer & `DispatchBookingEngine` (`Send to Driver` / `Send`)**:
  - `DriverQueueWindow.tsx`: Interleaves `Assigned` and `📌 Staged` rides with header summary badges (`Assigned (A)` · `📌 Staged (S)` · `❌ N Overlap` · `⚠️ N Tight (<15m)`), **`Send All Staged (S)`**, dashed indigo staged cards (`📌 Staged (Held in Dispatch)`), per-leg overlap/tight-turnaround callouts, and **`Send to Driver`** / **`Unstage`** actions.
  - Queue & Drawer surfaces (`useDispatchStagedPlanner.ts`, `DispatchTripQueuePane.tsx < 900`L via extracted `queue/DispatchTripQueueSheets.tsx`, `TripQueueTableView.tsx` 10-column invariant, `TripQueueCardsGrid.tsx`, `TripQueueCompactList.tsx`, `TripQueueToolbar.tsx`, `TripActionDropdown.tsx`, `DispatchDriverRosterPane.tsx`, `DispatchTripDetailsDrawer.tsx`): Renders dashed indigo `📌 Staged: <label>` pills with inline 1-click **`Send`** + `×` clear, **Stage Driver (Hold)** vs **Send to Driver** mode toggles/actions, **`Staged Only`** (`has_staged_driver`) filter, **`Auto-Stage Open`**, and batch **`Stage Driver`** / **`Send to Driver`**.
  - `DispatchBookingEngine` (`DispatchPaymentAssignmentSection.tsx`, `useDispatchBookingSubmission.ts`): Adds a 2-way **`Send to Driver`** | **`Stage (Hold)`** segmented control whenever a driver is selected—auto-defaulting to `Stage (Hold)` for future scheduled rides outside the Pre-Pickup Lead Window (and `Send to Driver` for ASAP or inside-window rides), always overrideable in 1 click, with edit-mode hydration restoring `Stage (Hold)` when `trip.plannedDriverId` is set.
- **Authorized-Dispatcher Auto-Release Window, `StagedDriverConflictModal.tsx` & Background Auto-Release Loop**:
  - Extends `DispatchDesktopTopHeader.tsx` (`⚙️` Console Settings) alongside `AdminAutoDispatchControlPanel.tsx` so operators authorized by `canOperatorConfigureLeadWindows(user, settings.dispatchAutomation)` can toggle **`Auto-Release Staged Drivers`** (`On/Off`) and edit **`Staged Release Lead (15–240m)`** with `ConfigAuditEntry` logging (`Set by Admin` read-only summary for unauthorized dispatchers).
  - Adds `StagedDriverConflictModal.tsx` intercepting `⚡ Auto-Dispatch Ready (N)`, single-trip `⚡ Auto-Offer`, and batch auto-dispatch whenever target trips include staged drivers, offering **`Keep Staged (Send to Staged Driver)`** (recommended), **`Skip Staged Trips`**, and **`Override Staged & Re-Rank`**.
  - Wires `releaseDueStagedTrips` into `useDispatchSlaCascadeLoop.ts` and server-side `/api/auto-dispatch` / `sla-cron.server.ts` with deduplicated tactical alerts when a due staged driver is offline or has a schedule overlap.

## 52. Phase 52 (Wave 4 Phase 3): Dispatch Queue Layout Override (`Table` vs `Auto-Cards`) & Live Booking-Form Map Route Sync
- **4-Mode `DisplayLayout` Contract (`'auto' | 'table' | 'cards' | 'compact'`) & Compact 10-Column Table**:
  - Extends `DisplayLayout` (`app/core/hooks/useDisplayLayout.ts`) with `'auto'` alongside `'table' | 'cards' | 'compact'` (validated on `localStorage` hydration; deterministic `'table'` SSR default preserved).
  - Separates explicit **`Table`** from responsive **`Auto`** in `resolveEffectiveQueueDisplayLayout` (`app/components/domain/dispatch/queue/trip-queue-layout.util.ts`):
    - Desktop **`'table'`** **always** renders `{ effectiveDisplayLayout: 'table', isAutoCardsFallback: false }` regardless of container width or `scrollWidth` (horizontally scrollable when narrower than `min-w-[900px]`, with zero `onTableOverflowDetected` escalation loop).
    - Desktop **`'auto'`** performs non-destructive responsive `Table ↔ Cards` switching (`TABLE_OVERFLOW_MIN_WIDTH_PX = 920` + live `scrollWidth > clientWidth + 1` escalation + `TABLE_OVERFLOW_HYSTERESIS_PX = 8`), showing `Table (Auto)` or `Cards (Auto)` in `TripQueueToolbar.tsx`.
    - Desktop `'cards'` and `'compact'` pass through unchanged; mobile (`!isDesktop`) continues rendering `'cards'`.
  - Tightens `TripQueueTableView.tsx` to `min-w-[900px]` with `px-2 py-2` cell padding, `max-w-[155px] xl:max-w-[210px]` truncated `PICKUP` / `DROPOFF` cells (`title={fullAddress}`, preserving the `+N stop(s)` amber sub-pill in `PICKUP`), and compact `max-w-[138px]` `DRIVER` `<select>` while keeping the exact `10` `<th>` columns.
- **Live Booking-Form Waypoint Pin & Road-Snapped Route Sync on `LiveFleetMap`**:
  - **Active Draft Priority Over Stale `selectedMapTrip`**: Tracks a deterministic location signature for the active booking draft (`activeDraftId`, `pickupAddress`, `pickupCoordinates`, `dropoffAddress`, `dropoffCoordinates`, `intermediateStops`); whenever the active draft's location signature changes with at least one location present, clears `selectedMapTrip` and `selectedQueueTripId` and enables map framing (`shouldZoomMap = true`) so `'draft_form'` renders immediately.
  - **Single-Endpoint Pin Preview + Debounced Geocoder Fallback**: `resolveActiveRouteContext` (`route-map-sync.ts`) emits `'draft_form'` contexts as soon as **only Pickup** (Emerald Green teardrop pin) or **only Dropoff** (Rose Red teardrop pin, plus any intermediate stops) is entered (`hasFullRoute: false`), smoothly panning/zooming (`zoom >= 13`) to explicit Places/preset coordinates immediately or resolving freeform typed text via cached `google.maps.Geocoder` (`450ms` debounce, offline `resolveMockCoordinates` fallback).
  - **Dismissible Route Overlay (`✕`) Without Clearing Form Inputs**: Clicking `✕` on `MapRouteOverlayHud` dismisses either `'selected_trip'` or `'draft_form'` map previews (via `dismissedRouteSig` until the draft's location signature changes again) without erasing booking form fields.
  - **Cached Live `DirectionsService` Road Polylines**: Removes the `!isRealtimeRoutingEnabled()` gate in `LiveFleetMap.tsx` whenever `window.google.maps.DirectionsService` is loaded on the live map, adding a `50`-entry in-memory LRU cache (`getCachedDirectionsResult` / `setCachedDirectionsResult` in `route-map-sync.ts`) for `0ms` repeat renders, `350ms` debounced `DirectionsService.route(...)` calls for uncached routes, cased directional polylines + Green / Orange `1..N` / Red pins, and once-per-signature `fitBounds(..., 56)` framing (`LiveFleetMap.tsx < 1,350`L, `dispatch.tsx < 1,600`L).








## 53. Phase 53 (Wave 4 Phase 4): Driver App Multi-Stop Progression, Full-Route Waypoints Navigation (`&waypoints=`) & Live Stop Free-Wait Timer (`/app/driver`)
- **Multi-Stop & Active-Leg Navigation URL Builders (`app/core/utils/driver-ui.util.ts`)**:
  - Pure, SSR-safe `formatNavTarget`, `buildSinglePointNavigationUrl`, `buildMultiStopNavigationUrl`, and `openTripRouteNavigation` (preserving 100% backward compatibility on `openMapNavigation`).
  - **Google Maps (`app === 'google'`)**: Builds `&waypoints=` URLs (`[Pickup, ...AllStops] -> Dropoff` before `in_progress`, or `RemainingUncompletedStops -> Dropoff` during `in_progress`, and direct `Dropoff` once all stops are completed/skipped).
  - **Apple Maps (`app === 'apple'`) & Waze (`app === 'waze'`)**: Resolves the next active leg (`Pickup` before `in_progress`, first uncompleted `Stop #k` during `in_progress`, or `Destination` once all stops are completed).
- **Stop Progression & Live Free-Wait Timer Engine (`driver-stop-progress.ts` & `useDriverMultiStopProgress.ts`)**:
  - Persists per-stop `DriverStopStepStatus` (`'pending' | 'arrived' | 'completed' | 'skipped'`), timestamps, waited seconds, and `waitFeeExtraId` inside `Trip.metadata.stopProgress` via `bookingService.updateTrip` without modifying `firestore.rules`.
  - Computes live free-wait grace countdown (`intermediateStopFreeWaitingMinutes`, default `5m`) and excess billable minutes (`Math.ceil(excessSeconds / 60) * curbWaitingRatePerMinute`, default `$0.50/min`) via `getUniversalExtrasService()`, with idempotent canonical `pricing.driverExtras` / `pricing.breakdown` / `meterExtras` synchronization and 1-tap `Undo` reversal.
- **Color-Coded Route Timeline & Dispatcher Visibility (`DriverRouteTimelineCard.tsx`, `DriverLiveMeterCard.tsx`, `DriverOfferSheet.tsx`, `TripDrawerOverviewSection.tsx`)**:
  - Visualizes Emerald Pickup (`●`) → Amber Numbered Intermediate Stops (`1..N`) → Rose Destination (`■`) across compact offer/queue cards and interactive active-trip cards, plus read-only live stop status pills in Dispatch's `TripDrawerOverviewSection.tsx`.

## Section 39: Standing Orders & Recurring Rides Series Manager (Platform Phase 54 — Wave 4 Phase 5)
- **Data Model (`/standingOrders/{seriesId}`)**: `StandingOrderSeries` (`app/core/types/standing-order.ts`) captures recurring passenger commutes, medical dialysis transports, and corporate shuttles with schedule cadence (`daily`, `weekdays`, `weekly`, `custom`), week parity (`all`, `odd`, `even`), holiday `skipDates` (`YYYY-MM-DD[]`), `preferredDriverId` + `preferredDriverMode` (`stage_hold` default | `send_to_driver` | `unassigned`), `generatedTripIds`, and `lastGeneratedDate`. Secured via existing `isDispatcher()` rule in `firestore.rules` without modifying infrastructure rules.
- **Dual-Mode Standing Order Engine (`standing-order.service.ts`)**: Syncs `/standingOrders/{seriesId}` in Firestore with `localStorage` (`chesterfield_standing_orders_v1`) and deterministic SSR/Node in-memory state; supports `pauseStandingOrderSeries` (optional open-future cancellation preserving `completed`/`in_progress`), `resumeStandingOrderSeries`, `updateStandingOrderSkipDates` (optional matching open trip cancellation), `assignPreferredDriverToSeries` (bulk staging with zero `/app/driver` leak), and `extendStandingOrderHorizon` (`+1 Week` / `+2 Weeks` / `+10 Rides` with strict date deduplication).
- **Dispatch & Admin Operations UI (`StandingOrdersDrawer.tsx`)**: Lazily mounted in `DispatchDesktopTopHeader.tsx` (`🔁 Series`, zero lines added to `dispatch.tsx`) and `AdminTripsSubpage.tsx` (`🔁 Standing Orders`), paired with initial skip-date chips in `DispatchReturnRepeatSection.tsx` and `🔁 Standing Order Series` badges in `TripDrawerOverviewSection.tsx`.

## 57. Phase 57 (Wave 4 Phase 8): Operational SLA, Auto-Dispatch, Surcharge & Revenue Intelligence (`AdminDashboardTab.tsx` Overhaul + CSV Export)
- **Pure Operational Intelligence & RFC-4180 CSV Engine (`app/core/services/analytics/operational-intelligence.service.ts` & `index.ts`)**:
  - Zero React, DOM, or server-only (`*.server` / `node:*`) imports so every function is deterministic, SSR-safe, and unit-testable via injectable `nowMs?: number`.
  - **Period Window & Prior-Period Comparison**: `resolveAnalyticsDateWindow` (`'today' | '7d' | '30d' | 'mtd' | 'all' | 'custom'`), canonical operational timestamp resolution (`scheduledPickupTime || actualPickupTime || completedAt || createdAt`), `filterTripsByAnalyticsWindow`, and `computePercentDelta` (`{ deltaPercent, direction }`).
  - **Operational SLA & Cancellation Policy Metrics (`computeSlaPerformanceMetrics`)**: Evaluates scheduled rides reaching pickup/completion (`actualPickupTime`, earliest `'arrived' | 'in_progress'` in `statusHistory`, or `completedAt - estimatedDuration`) against `scheduledPickupTime` (`onTimeGraceMinutes = 10`), computing `evaluatedScheduledCount`, `onTimeCount`, `lateCount`, `onTimeRatePercent`, `avgPickupVarianceMinutes`, SLA risk breakdown (`warning`, `critical`, `overdue`, notification counts, open unassigned scheduled at risk), and cancellation breakdown by `cancelledBy` plus `/track` guest cancellation policy fee previews (`metadata.guestCancellationPolicy`).
  - **Auto-Dispatch, Staged Shift & Wave 4 Workflow Intelligence (`computeAutoDispatchIntelligence`)**: Classifies trips across 5 dispatch channels (`sequential_cascade`, `broadcast_pool`, `direct_auto_assign`, `staged_release`, `manual_assign`), computes offer cascade funnel KPIs (`totalCascadesTriggered`, `acceptedCascades`, `exhaustedCascades`, `cancelledCascades`, `activeCascades`, `firstAttemptAcceptCount`, `firstAttemptAcceptRatePercent`, `overallCascadeAcceptRatePercent`, `exhaustionRatePercent`, `avgAttemptsPerAcceptedCascade`, `avgOfferResponseSeconds`), and surfaces Wave 4 adoption counters (`currentlyStagedCount`, `standingOrderTripsCount`, `driverUpdateAckStats` from `metadata.pendingDriverUpdateAck`, and `guestSelfServiceStats` from `metadata.pendingGuestChangeRequest` & passenger `'TRIP_MODIFIED'` events).
  - **Revenue Waterfall, Surcharge/Rule Attribution & `/config/pricingAuditLog` Correlation (`computeRevenueAttributionMetrics`)**: Separates `completedRevenue`, `scheduledPipelineRevenue`, and `grossBookedRevenue` while excluding `'cancelled'` and `'declined'`/`'DECLINED'` trips; computes canonical waterfall (`baseAndDistanceRevenue`, `surchargesRevenue`, `extrasAndWaitRevenue`, `tipsTotal`, `discountsTotal`, `avgFare`, payment method mix + settled `payLinkStatus === 'paid'`); extracts itemized surcharge & rule attribution from `pricing.breakdown` with lossless legacy fallback (`itemizedSurcharges`, `airportSurcharge`, `appliedRuleNames`) without double-counting and correlates live state & provenance against `PricingAuditEvent[]`, `SurchargesConfig`, and `NamedPricingRule[]`; groups corridors & tariffs (`matchedCorridorName || tariffProfileName` + *STL Lambert Airport*, *Spirit of St. Louis (SUS)*, *Chesterfield & West County Local*).
  - **Chronological Time-Series & Leaderboards (`computeTimeSeriesAndLeaderboards`)**: Replaces colliding `Mon..Sun` day-of-week buckets with true chronological `'hour'`, `'day'`, and `'month'` buckets, data-driven 5-block operational peak demand windows (`04:00–07:59` through `20:00–03:59`), Corporate Account B2B leaderboard, Driver Performance leaderboard, and pickup zone/city origination breakdown.
  - **Formula-Safe RFC-4180 Multi-Report CSV Exporter (`escapeCsvCell` & `exportAnalyticsCsvReport`)**: Neutralizes spreadsheet formula injection (`=`, `+`, `-` non-numeric, `@` prefixed with `'`) and quotes `,`, `"`, `\r`, `\n` across 4 reports: `executive_summary`, `trips_sla_dispatch`, `surcharge_tariff_attribution`, and `driver_corporate_leaderboard`.
- **Modular Admin Dashboard & Analytics Decomposition (`AdminDashboardTab.tsx < 450`L + `app/components/domain/admin/analytics/*`)**:
  - Preserves `DashboardSubTab` (`'overview' | 'telemetry' | 'analytics'`) and `SUB_PAGES.dashboard` in `app/routes/admin.tsx` (`< 1,000`L).
  - Extracts `AnalyticsPeriodToolbar.tsx`, `ExecutiveOverviewPanel.tsx`, `OperationalSlaAndDispatchPanel.tsx`, `SurchargeRevenueAttributionPanel.tsx`, `CorporateAndFleetLeaderboardPanel.tsx`, and `SystemHealthTelemetryPanel.tsx`.

## 58. Phase 58 (Wave 4 Phase 9 — Final Wave 4 Phase): Local Airport & West County SEO Engine (`/robots.txt`, Dynamic `/sitemap.xml` & Pre-Quoted Corridor Landing Pages)
- **Pure Local SEO, Corridor Catalog, Fare Estimator & JSON-LD Engine (`app/core/services/seo/local-corridor-seo.service.ts` & `index.ts`)**:
  - Zero React, DOM, or server-only (`*.server` / `node:*`) imports so every function is deterministic, SSR-safe, and unit-testable.
  - **Curated 8-Corridor Catalog (`LOCAL_SEO_CORRIDORS`)**: Typed regional corridors (`chesterfield-to-stl-airport`, `spirit-of-st-louis-airport-sus`, `clayton-to-stl-airport`, `town-and-country-car-service`, `creve-coeur-executive-taxi`, `wildwood-and-ellisville-taxi`, `maryland-heights-westport-taxi`, `downtown-st-louis-airport-transfer`) with coordinates, distance/duration baselines, ZIP codes, landmarks, terminal/FBO pickup instructions, and corridor FAQs (`getCorridorBySlug`, `getRelatedCorridors`).
  - **Instant Upfront Corridor Fare Estimator & `/book` Query Prefill (`computeCorridorFareEstimates`, `buildPrepopulatedBookUrl`, `parseBookRouteQueryInitialValues`)**: Computes deterministic `outbound` and `inbound` upfront estimates across active customer vehicle tiers (`Standard Sedan (Up to 4 Pax)`, `Executive / Premium`, `XL SUV / Minivan (Up to 6 Pax)`) honoring `settings.pricing`, `settings.vehicles`, passenger capacity, and STL/SUS airport commercial access surcharges; generates and validates `/book?...` prefill URLs with strict coordinate bounds (`Number.isFinite`, valid lat/lng, non-zero) and string length caps.
  - **JSON-LD & XSS-Safe Script Serialization**: `buildTaxiServiceJsonLd` (`['TaxiService', 'LocalBusiness']` + 24/7 `openingHoursSpecification` + `ReserveAction` targeting `/book?...`), `buildFaqPageJsonLd`, `buildBreadcrumbListJsonLd`, and `serializeJsonLdScriptPayload` (escaping `<`, `>`, `&` as `\u003c`, `\u003e`, `\u0026`).
  - **Dynamic `/robots.txt` & `/sitemap.xml` Builders (`resolveCanonicalSiteOrigin`, `generateRobotsTxt`, `generateSitemapXml`)**: Emits canonical crawl directives allowing public marketing/booking pages while disallowing `/admin`, `/dispatch`, `/driver`, `/corporate`, `/app`, `/pay/`, `/booking/status`, `/api/`, `/construction`, `/signin`, and `/register`, plus valid UTF-8 XML sitemaps covering all 10 core public routes and all 8 `/service-areas/:corridorSlug` pages.
- **SSR Resource Routes, Pre-Quoted Corridor Pages & Internal Linking**:
  - Removes stale static `public/robots.txt` and `public/sitemap.xml` (eliminating Vercel CDN static shadowing) and registers `0.00 kB` server-only resource routes `app/routes/robots.txt.ts` and `app/routes/sitemap.xml.ts`.
  - Wires `parseBookRouteQueryInitialValues` into `app/routes/book.tsx` (`< 200`L) `loader` and `BookingEngineV2.tsx` (`< 1,350`L) `initialValues` so clicking any corridor CTA pre-populates Pickup, Dropoff, Coordinates, Vehicle Class, and Passengers with zero hydration mismatch.
  - Adds `/service-areas` hub (`app/routes/service-areas._index.tsx`) and `/service-areas/:corridorSlug` (`app/routes/service-areas.$corridorSlug.tsx`, throwing `404` `Response` on unknown slugs) with 1-click `Outbound ↔ Inbound` direction swap, `1–6` passenger selector, live tier cards, and internal crawl links in `Footer.tsx` and `services.tsx`.

## 59. Phase 59 (Wave 5 Phase 1): Admin IA Overhaul, Focused `General` (`Company Info` + `Time & Units`), Unified `Website, Brand & SEO` Theme Studio, `System & Governance` Archive & `Trips` Parity
- **Locked-In 3-Group Admin Information Architecture & 100% Legacy Deep-Link Aliasing (`AdminSidebar.tsx`, `admin.tsx` & `admin-nav.util.ts`)**:
  - Reorganizes the Admin Console into 13 primary modules grouped across 3 operational domains:
    1. **`Operations`**: `dashboard` (*Dashboard* — `overview`, `analytics`, `telemetry`), `trips` (*Trips* — `dispatch`, `standing-orders`, `exceptions`, `history`), `automation` (*Dispatch & Automation* — `auto-dispatch`, `intake-rules`, `console`, `standing-defaults`).
    2. **`Clients, Billing & Fleet`**: `customers` (*Clients & Corporate* — `directory`, `corporate`), `invoicing` (*Billing & Payouts* — `ledger`, `accounts`, `payouts`, `accounting-sync`), `rates` (*Rates & Pricing* — `rates`, `extras`, `surcharges`, `rules`, `audit`), `vehicles` (*Vehicles* — `types`, `fleet`), `zones` (*Service Zones* — `zones`, `places`, `groups`, `blacklists`), `operators` (*Drivers & Staff* — `roster`, `onboarding`).
    3. **`Website, Comms & System`**: `website` (*Website, Brand & SEO* — `themes`, `form`, `seo`, `pages`, `layout`, `navigation`, `css`), `integrations` (*Comms & Integrations* — `gateways`, `telephony`, `webhooks`), `general` (*General* — `profile`, `units`), `advanced` (*System & Governance* — `security`, `audit`, `archive`, `system`).
  - Pure deterministic `resolveAdminTabAndSub(rawTab, rawSub)` helper (`app/core/utils/admin-nav.util.ts`) resolves every legacy URL bookmark (`archive`, `trips?sub=rules`, `trips?sub=archive`, `general?sub=studio`, `general?sub=localization`, `rules`, `financials`, `pricing`, `fleet`, `staff`, `bookings`, `form`, `layout`, `advanced?sub=website|form|customer-form`) without broken links.
  - Retires orphaned `/app/admin/settings` UI with a lightweight `302` SSR loader + client `<Navigate>` redirect to `/app/admin?tab=website&sub=form`, and deletes `AdminLayoutTab.tsx`.
- **Focused `General` Hub (`CompanyConfig`, `LocalizationConfig` & Decomposed `< 450`L Panels)**:
  - Backwards-compatibly extends `CompanyConfig` (`legalEntityName`, `dispatchEmail`, `operatingHoursLabel`, `is24x7`, `advanceBookingMaxDays`) and `LocalizationConfig` (`12h` vs `24h` clock, `distanceUnit: 'mi' | 'km'`, `speedUnit: 'mph' | 'kmh'`, `temperatureUnit: 'F' | 'C'`, `defaultServiceRegion`) with pure normalization helpers and full `AdminConfigService` persistence.
  - Splits `AdminGeneralTab.tsx` (`< 200`L orchestrator) into `CompanyProfilePanel.tsx` (`< 350`L) and `LocalizationAndUnitsPanel.tsx` (`< 350`L with live formatted sample preview bar).
- **Unified Brand & Theme Studio (`WebsiteThemesTab.tsx < 450`L & `BrandLivePreviewCanvas.tsx < 400`L)**:
  - Consolidates duplicate Brand Studio editors into `Website, Brand & SEO -> Themes & Branding`, reconciling all 6 curated `THEME_PRESETS`, typography, button border-radius, color token pickers, custom logo URL, and side-by-side Desktop/Mobile `BrandLivePreviewCanvas` with draft-vs-published workflow.
- **Governance Archive Consolidation & Promoted Pricing Audit Log**:
  - Removes dead `'website'` branch from `AdminAdvancedTab.tsx` (`< 850`L) and mounts `AdminArchiveTab` under `System & Governance -> Universal Archive` (`?tab=advanced&sub=archive`).
  - Promotes `audit` (`Pricing Audit Log`) to a 5th top-level pillar tab in `PricingAdminWorkspace.tsx` & `AdminRatesTab.tsx` (`PricingAuditPanel.tsx < 300`L) while retaining the slide-over `Audit History` drawer on the other 4 pillars.
- **`Trips` Decomposition (`< 450`L), Embedded `Standing Orders`, Phase 55/56 Exceptions & Dispatch Control Parity**:
  - Adds `mode?: 'drawer' | 'embedded'` to `StandingOrdersDrawer.tsx` so `Trips -> Standing Orders` renders inline while `/app/dispatch` keeps drawer mode unchanged.
  - Decomposes `AdminTripsSubpage.tsx` (`< 450`L) + sub-panels (`< 450`L each) with 4-state portal `DriverAssignDropdown` (immediate assignment + Stage/Hold `stageDriverForTrip` / `sendStagedTripToDriver` / `clearStagedDriverFromTrip`), universal `TripActionDropdown` (enabling `Complete Trip` across `assigned`/`accepted`/`en_route`/`arrived`/`in_progress`), and actionable `Exceptions & Rider Edits` chips for SLA/unassigned alerts, Phase 56 `📝 Rider Edit Req` (with 1-tap Approve/Decline), Phase 55 `⏳ Awaiting Driver Ack`, and Cancelled/Declined/No-Show trips.

## 60. Phase 60 (Wave 5 Phase 2): Dedicated `Clients & Corporate` Directory Split + `Billing & Payouts` Overhaul (Accounts, Drivers, Staff & Other Payees)
- **Corporate Portal Governance, Extended Billing Policy & Multi-Payee Settlement Schemas (`app/core/types/config.ts` & `app/core/types/invoicing.ts`)**:
  - **`CorporatePortalGovernanceConfig` (`AppSettings.corporatePortalPolicy?`)**: `allowSelfManageRiders` (default `true`), `allowSelfManageSavedLocations` (default `true`), `defaultRequirePoForNewAccounts` (default `true`), `poFormatRegex?` (validated when non-empty), and `creditLimitEnforcement: 'soft_warning' | 'hard_block'` (default `'soft_warning'`), normalized via `normalizeCorporatePortalPolicy(raw?)` and wired live into `/app/corporate` permissions, `corporate-account.service.ts` PO validation, and `useCorporatePoVerification.ts` / `useCustomerBookingSubmission.ts` credit-limit enforcement.
  - **`BillingSettingsConfig` (`AppSettings.billingSettings?`)**: Preserves remittance bank, card surcharge, terminal, USDOT, and tax ID fields while adding `payLinkExpiryHours` (default `72`, clamped `1..720`), `payLinkAllowTipOnTrips` (default `true`), `payLinkAllowTipOnInvoices` (default `false`), `autoSendPayLinkReceiptSms` (default `true`), `driverDefaultCommissionPercent` (default `75`, clamped `0..100`), `staffDispatcherHourlyRate` (default `24`), and `staffPerBookingBonusAmount` (default `0`), normalized via `normalizeBillingSettingsConfig(raw?)` and wired into `pay-token.util.ts` Pay Link builders.
  - **Multi-Role Payees & Settlements (`PayoutPayeeRecord` on `AppSettings.customPayees?` & `PayoutSettlementRecord` on `AppSettings.payoutSettlements?`)**: Supports `'driver'`, `'staff'`, and `'other'` (`'affiliate' | 'contractor' | 'vendor' | 'concierge'`) settlements across `'pending' | 'approved' | 'paid'` lifecycles, extending `LedgerEntryType` with `'staff_payout' | 'vendor_payout'` (`5010-DriverPayout`, `5020-StaffPayroll`, `5030-VendorAffiliatePayout`).
- **Pure Payout Calculation & Formula-Safe CSV Export Engine (`app/core/services/payouts.service.ts`)**:
  - Zero React/DOM/Firebase imports; provides `computeDriverEarningsRollup`, `computeStaffPayoutPreview`, `computeOtherPayeeSettlement`, `buildPayoutLedgerEntry`, and `exportPayoutsCsv` (reusing formula-safe `escapeCsvCell` from `operational-intelligence.service.ts`).
- **Dedicated `Clients & Corporate` Directory Split (`AdminCustomersSubpage.tsx < 450`L + `app/components/domain/admin/customers/* < 450`L)**:
  - Splits passenger profiles (`PassengerDirectoryPanel.tsx` + `CustomerProfileDrawer.tsx` with `?phone=...`/`?id=...` deep-links, VIP/archive filters, blacklist controls, reliability scores, and `"View Invoices →"` links) from corporate identity & portal governance (`CorporateDirectoryPanel.tsx`, `CorporateGovernanceCard.tsx`, `CorporateAccountDirectoryDrawer.tsx`, `CorporatePortalManagersModal.tsx`, and `"Billing & Credit →"` deep-links to `/app/admin?tab=invoicing&sub=accounts&accountId=<id>`).
- **Dedicated `Billing & Payouts` Overhaul (`AdminInvoicingSubpage.tsx < 400`L & `app/components/domain/admin/invoicing/*`)**:
  - Removes all duplicate Stripe/Square/Twilio API credential & test forms from `DriverPayoutsPanel.tsx` (`< 450`L) and `useAdminInvoicingActions.ts` (`< 650`L), linking cleanly to `Comms & Integrations`.
  - Delivers focused 4-pillar billing operations: `ledger` (*Invoices & AR Ledger* honoring `payLinkExpiryHours` & `payLinkAllowTipOnInvoices`), `accounts` (*Corporate Billing* `CorporateAccountsPanel.tsx < 450`L with `?accountId=...` deep-link focus, credit-limit progress bar, `Soft Warning` vs `Hard Block` toggle, financial terms editor, CSV import, batch invoicing, and `"Directory & Portal Logins →"` link), `payouts` (*Driver, Staff & Other Payouts* `DriverPayoutsPanel.tsx < 450`L + `PayoutSettlementModal.tsx < 400`L with 3-pill Payee Switcher, settlement history, and CSV export), and `accounting-sync` (*Policy & QuickBooks* `BillingPolicyAndQuickBooksPanel.tsx < 400`L).

## 61. Phase 61 (Wave 5 Phase 3): `Dispatch & Automation` Top-Level Hub + `Drivers & Staff` App Policies & Monolith Decomposition (Live Engine Wiring)
- **Live-Wired Operational Config Contracts (`app/core/types/config.ts` & `admin-config.service.ts`)**:
  - **`DispatchConsoleSettingsConfig` (`AppSettings.dispatchConsoleConfig?`)**: `conflictGuardEnabled` (`true`), `nearbyWindowMinutes` (`90`, clamped `15..360`), `tightTurnaroundMinutes` (`15`, clamped `5..120`), `autoClearFormAfterCreate` (`true`), `defaultQueueLayout` (`'auto' | 'table' | 'cards' | 'compact'`, default `'auto'`), and `maxConcurrentDraftTabs` (`8`, clamped `2..20`), synchronized bidirectionally with top-level `enableRealtimeRouting` via `normalizeDispatchConsoleConfig(raw?, enableRealtimeRouting?)`.
  - **`StandingOrdersGovernanceConfig` (`AppSettings.standingOrdersConfig?`)**: `defaultHorizonDays` (`7 | 14 | 30`, default `14`), `maxHorizonDays` (`60`, clamped `7..180`), `defaultAssignmentMode` (`'stage_hold' | 'send_to_driver'`, default `'stage_hold'`), `defaultSkipHolidays` (`true`), and `holidayCalendarDates` (seeded with major US holidays for current/upcoming years), normalized via `normalizeStandingOrdersConfig(raw?)`.
  - **`DriverAppPoliciesConfig` (`AppSettings.driverAppConfig?`)**: `intermediateStopFreeWaitingMinutes` (`5`, clamped `0..30`, bidirectionally synced with `UniversalExtrasConfig.intermediateStopFreeWaitingMinutes`), `intermediateStopExcessWaitRatePerMinute` (`0.50`, clamped `0..10`, synced with `UniversalExtrasConfig.curbWaitingRatePerMinute`), `requireDriverUpdateAck` (`true`), `unacknowledgedAlertMinutes` (`5`, clamped `1..60`), `enforceScreenWakeLockOnDuty` (`true`), `enableAudibleOfferChime` (`true`), and `defaultNavigationProvider` (`'google_maps' | 'apple_maps' | 'waze'`, default `'google_maps'`), normalized via `normalizeDriverAppPoliciesConfig(raw?, extras?)`.
- **Zero-Dead-Toggle Runtime Wiring**:
  - `booking-conflict-checker.service.ts` (`evaluateDispatchBookingConflicts`) short-circuits cleanly (`signature: 'disabled'`) when `conflictConfig.conflictGuardEnabled === false` and honors custom `nearbyWindowMinutes` & `tightTurnaroundMinutes`; `useDispatchBookingSubmission.ts` & `dispatch.tsx` honor `autoClearFormAfterCreate`, `defaultQueueLayout`, and `maxConcurrentDraftTabs`.
  - `standing-order.service.ts` merges `holidayCalendarDates` automatically when `skipHolidays: true` across `createStandingOrderSeries`, `registerStandingOrderFromDispatchBooking`, and `extendStandingOrderHorizon`, while respecting `defaultHorizonDays`, `maxHorizonDays`, and `defaultAssignmentMode`.
  - `trip-update-ack.service.ts`, `useDispatchBookingSubmission.ts`, and `admin-trips-exceptions.util.ts` honor `requireDriverUpdateAck` (`false` skips stamping `pendingDriverUpdateAck`) and expose `isDriverUpdateAckOverdue(trip, unacknowledgedAlertMinutes, nowMs)`; `/app/driver` (`driver.tsx` & `useDriverMultiStopProgress.ts`) reads `intermediateStopFreeWaitingMinutes`, `intermediateStopExcessWaitRatePerMinute`, `enforceScreenWakeLockOnDuty`, `enableAudibleOfferChime`, and `defaultNavigationProvider` fallback.
- **Complete `Dispatch & Automation` Hub (`AdminRulesTab.tsx < 350`L + `app/components/domain/admin/rules/* < 450`L)**:
  - Decomposes `AdminRulesTab.tsx` (`919`L → `< 250`L section router) across `auto-dispatch` (`AdminAutoDispatchControlPanel.tsx` + Fleet Alert Auto-Dismiss timer), `intake-rules` (`BookingIntakeRulesPanel.tsx < 450`L + `BookingRulesSimulatorCard.tsx < 350`L), `console` (`DispatchConsoleSettingsPanel.tsx < 400`L with Conflict Guard, workspace defaults & relocated `enableRealtimeRouting` + cross-link in `System & Governance -> Maintenance`), and `standing-defaults` (`StandingOrderDefaultsPanel.tsx < 400`L with horizon/assignment defaults & interactive Shared Holiday Skip Calendar).
- **Expanded `Drivers & Staff` Hub, RBAC Lead-Window Matrix & `Driver App Policies` (`AdminOperatorsTab.tsx < 350`L + `app/components/domain/admin/operators/* < 450`L)**:
  - Expands `SUB_PAGES.operators` in `admin-nav.util.ts` to `roster`, `permissions` (*Role & Lead-Window Access*), `driver-policies` (*Driver App Policies*), and `onboarding` (*Applications*).
  - Decomposes `AdminOperatorsTab.tsx` (`1,847`L → `< 280`L orchestrator) into `OperatorRosterPanel.tsx` (`< 450`L), `OperatorEditorDrawer.tsx` (`< 450`L), `operator-provisioning.util.ts` (`< 300`L), `OperatorPermissionsPanel.tsx` (`< 380`L multi-role matrix + `authorizedLeadWindowDispatcherIds` toggles), and `DriverAppPoliciesPanel.tsx` (`< 380`L synced with `UniversalExtrasService`).

## 62. Phase 62 (Wave 5 Phase 4): `Website, Brand & SEO` Controls (Public Corporate Checkout Gate, Guest `/track` Self-Service & Local SEO Corridor Manager) + `Comms & Integrations` Decomposition & Controls
- **Public Corporate Checkout Gate -> `/app/corporate` Portal (`CustomerBookingConfig`, `BookingEngineV2.tsx`, `CustomerPaymentSection.tsx` & `useCustomerBookingSubmission.ts`)**:
  - Adds `allowPublicCorporateCheckout?: boolean` (default `false`) to `CustomerBookingConfig`, updates `DEFAULT_CUSTOMER_BOOKING_CONFIG.acceptedPaymentMethods` to `['card', 'cash']` (while keeping `DispatchBookingEngine.tsx` on `/app/dispatch` 100% supporting `Account` for internal operators), and exports pure `resolveRetailAcceptedPaymentMethods(bookingConfig?)`.
  - Decouples `/app/corporate` (`corporatePortalContext`) from retail checkout: `BookingEngineV2.tsx` preserves `form.paymentMethod === 'account'` unconditionally when `corporatePortalContext` is active; `CustomerPaymentSection.tsx` renders a locked `Pre-Verified Corporate Direct Billing` card on `/app/corporate` and shows `"Booking on a company account? Sign in to the Corporate Portal →"` (linking to `/app/corporate`) on `/book` & `/app/passenger` when public corporate checkout is disabled; `useCustomerBookingSubmission.ts` rejects unauthorized retail `'account'` submissions.
- **Guest `/track` "Manage My Ride" Policy Controls (`GuestSelfServicePolicyConfig` & Live `/api/track` Wiring)**:
  - Adds `GuestSelfServicePolicyConfig` (`CustomerBookingConfig.guestSelfServicePolicy?`) + pure `normalizeGuestSelfServicePolicy(raw?)` governing `enableGuestSelfService` (`true`), `allowGuestNotesAndFlightEdits` (`true`), `allowGuestPreDispatchRouteTimeEdits` (`true`), `guestDirectEditMinLeadMinutes` (`30`, clamped `0..720`), `allowGuestAssignedChangeRequests` (`true`), `allowGuestCancellation` (`true`), and `maxLookupAttemptsPer5Min` (`5`, clamped `3..30`).
  - Wired into `evaluateGuestManageEligibility(trip, policy?, nowMs?)`, `evaluateGuestCancellationPolicy`, `guest-manage-ride.server.ts`, `api.track.ts`, `public-settings.server.ts`, and `GuestManageRidePanel.tsx`.
- **Local Airport & West County SEO Corridor Config (`LocalSeoAdminConfig` & Live SSR / Sitemap Wiring)**:
  - Adds `LocalSeoCorridorOverride` & `LocalSeoAdminConfig` (`AppSettings.localSeoConfig?`) + pure `normalizeLocalSeoConfig(raw?)` supporting per-corridor `enabled`, `featured`, `customHeroHeadline`, `customHeroSubheadline`, `customMetaTitle`, `customMetaDescription`, and `customFaqs`.
  - Wired via `getResolvedLocalSeoCorridors`, `getResolvedCorridorBySlug`, and `buildSitemapXml` / `generateSitemapXml` across `/service-areas`, `/service-areas/:corridorSlug` (`404` when `enabled === false`), and `/sitemap.xml` (excluding disabled corridors and ordering featured corridors first).
- **Flight Tracking, Canned SMS & Dispatch Email Policies (`AppSettings.integrations`)**:
  - **`FlightTrackingPolicyConfig` (`integrations.flightTracking?` + `normalizeFlightTrackingPolicy`)**: `flightLookupWindowHours` (`24`, clamped `2..72`, wired into `evaluateFlightCheckEligibility` & `/api/flight-status`), `cacheTtlMinutes` (`15`, clamped `1..120`), `preferredProvider` (`'auto' | 'aerodatabox' | 'flightaware' | 'heuristic_only'`), and `delayAlertThresholdMinutes` (`20`, clamped `5..180`).
  - **`CannedSmsTemplatesConfig` (`integrations.cannedSmsTemplates?` + `normalizeCannedSmsTemplates`)**: Supports built-in overrides (`label`, `bodyTemplate`, `enabled`) and custom templates (`id`, `label`, `category`, `bodyTemplate`, `enabled`), wired via `getResolvedCannedSmsTemplates(settings?)` & `interpolateCommsSmsTemplate` (including `{passengerFirstName}` & `{pickupDoor}`) into Dispatch `CommsHub` (`SmsThreadPane.tsx`).
  - **`DispatchEmailPolicyConfig` (`integrations.dispatchEmail?` + `normalizeDispatchEmailPolicy`)**: `inboundParseToBookingDraft` (`true`), `outboundSignature` (`'Chesterfield Taxi Dispatch · (314) 738-0100'`), `blockedSenderList` (`string[]`), and `autoAckInboundBookingEmails` (`false`), wired via `isInboundEmailSenderBlocked` into `/api/email/webhook` and signature seeding in `EmailDock` / `EmailComposerPane`.
- **`Website, Brand & SEO` & `Comms & Integrations` Monolith Decompositions (`< 450`L / `< 300`L Ceilings)**:
  - Slims `WebsiteFormControlsTab.tsx` (`< 450`L) with Corporate Portal Gate + extracted `GuestSelfServicePolicyCard.tsx` (`< 350`L), and slims `AdminWebsiteTab.tsx` (`< 360`L) with extracted `WebsiteLocalSeoPanel.tsx` (`< 450`L).
  - Expands `SUB_PAGES.integrations` to 5 sub-tabs (`gateways`, `telephony`, `email`, `flights`, `webhooks`) and decomposes `AdminIntegrationsSubpage.tsx` (`1,642`L → `< 260`L) into `< 450`L panels under `app/components/domain/admin/integrations/`: `PaymentGatewaysPanel.tsx`, `TelephonyAndSmsTemplatesPanel.tsx`, `DispatchEmailConfigPanel.tsx`, `FlightTrackingConfigPanel.tsx`, and `WebhooksAndPushPanel.tsx`.

## 63. Phase 63 (Wave 5 Phase 5): Custom Dispatch Map Overlays (`Zones`, `Live Traffic`, `Places`, `Exclusions`), Multi-Select Vehicle Filter, `"Geofences"` → `"Zones"` Rename & Dispatch Queue / Time Picker Polish
- **Custom Dispatch Map Overlays (All OFF by Default) & Multi-Select Vehicle Filter (`useDispatchMapPreferences.ts`, `config.ts`, `LiveFleetMap.tsx` & `app/components/domain/dispatch/map/*`)**:
  - Extends `DispatchMapPreferences` with `showZonesOverlay` (`false`), `showTrafficOverlay` (`false`), `showPlacesOverlay` (`false`), `showExclusionsOverlay` (`false`), and `selectedVehicleTypes: string[]` (`[]` = all vehicle types shown), synchronized live across `/app/dispatch` and detached `/app/dispatch/popout?module=map` via `localStorage` + `storage` / in-window listeners, with Admin fallback defaults (`defaultShowZonesOverlay`, `defaultShowTrafficOverlay`, `defaultShowPlacesOverlay`, `defaultShowExclusionsOverlay`, all `false`) in `DispatchConsoleSettingsConfig` & `DispatchConsoleSettingsPanel.tsx`.
  - Exports pure `resolveDriverVehicleTypeKey(driver, fleetCars?, vehicleTiers?)` and `matchesSelectedVehicleTypes(driver, selectedVehicleTypes, fleetCars?, vehicleTiers?)` in `fleet-car-marker.util.ts` supporting canonical vehicle types (`'sedan'`, `'suv'`, `'minivan'`, `'van'`, `'wheelchair_wav'`) and custom `VehicleTierConfig` IDs across car markers, status count pills, awaiting-GPS list, and fallback radar.
  - Adds `useLiveMapCustomOverlays.ts` (`< 430`L) & `MapCustomOverlayInfoCard.tsx` (`< 250`L) rendering Google `TrafficLayer`, active `/zones` polygons/radii (with click info card showing Zone Name, flat/multiplier surcharge, and live count of Available Drivers inside that zone), category-coded `/locationCollections` + Special Places POIs (with 1-click `"Set Pickup"` / `"Set Dropoff"` via `WorkspaceBus` `POPULATE_BOOKING`), and crimson/amber `/blacklistedLocations` safety exclusion circles, disposing all listeners and map instances cleanly on toggle-off/unmount.
  - Mounts portal-anchored (`createPortal(..., document.body)`, `z-[99999]`, viewport-clamped) `Vehicles ▾` (`Vehicles (N) ▾`) and `Layers ▾` (`Layers (N) ▾`) HUD popovers in `MapLayersAndVehiclesToolbar.tsx` (`< 430`L).
- **Site-Wide `"Geofences"` → `"Zones"` UI Rename & Authorized Dispatchers Admin Visibility**:
  - Renames user-facing `"Geofence"` / `"Geofences"` labels to `"Zone"` / `"Zones"` across `admin-nav.util.ts` (`SUB_PAGES.zones[0].label === 'Zones'`), `AdminSidebar.tsx`, `admin.tsx`, `AdminZonesTab` sub-components, `ModularTierCard.tsx`, and `BookingRulesSimulatorCard.tsx`, while preserving `ZoneGeofence` & `/zones` backwards compatibility and adding `export type OperationalZone = ZoneGeofence;` in `app/core/types/zone.ts`.
  - Lists active `admin` accounts alongside `dispatcher` accounts in `AdminAutoDispatchControlPanel.tsx` (`Authorized Dispatchers (Lead-Window Control)`), rendering `admin` rows with a locked purple `✓ Always Authorized (Admin)` badge.
- **Portal-Anchored Date/Time Pickers, Strict 2-Line Queue Rows, Clean `ASAP` & Private Aviation `SUS FBO` Suppression**:
  - Fixes `ModernDatePicker` & `ModernTimePicker` (`ModernDateTimePicker.tsx < 600`L) clipping inside `DispatchLeftBookingSidebar` by rendering popovers via `createPortal(..., document.body)` (`position: fixed`, `z-[99999]`) with viewport clamping, above/below auto-flip, resize/scroll repositioning, and dual `triggerRef` + `popoverRef` outside-click handling.
  - Enforces uniform max 2-line height across all columns in `TripQueueTableView.tsx` (`< 620`L) and removes `asapCreatedSubStr` completely so `ASAP` rows display clean `ASAP` without creation timestamps underneath.
  - Suppresses `✈️ SUS FBO` / private aviation flight badges in `resolveTripFlightBadge(trip)` (`flight-status.service.ts` returning `hasFlight: false` when `creds.isPrivateAviation` is `true`) while keeping `resolveStlTerminalInfo` in `airports.ts` intact for SMS/email curbside templates.

## 64. Phase 64 (Wave 5 Phase 6): Dispatch Layout Resize Persistence + `DriverAssignDropdown`-Style Portal `Select`, Unified UI Primitives & Customer / Dispatch / Portal Rollout
- **Deterministic Dispatch Split-Pane, Right Dock & `FloatingWindow` Geometry Persistence (`useDispatchPanelResize.ts < 260`L, `FloatingWindow.tsx < 530`L & `dispatch.tsx < 1,600`L)**:
  - Eliminates the initial-mount overwrite race in `useDispatchPanelResize.ts` where a second `useEffect` ran on the same render as hydration and overwrote `localStorage` back to default `430` / `240` / `400` dimensions, and raises `queueHeight` persisted ceiling from `600px` to `1200px` (`150..1200`, dynamically clamped on screen to `Math.max(220, Math.floor(viewportHeight * 0.68))` without destroying stored `1080p`/`1440p` heights).
  - Exports pure `parseStoredDispatchPanelLayout(storageRecord, viewport?)` and `serializeDispatchPanelLayout({ sidebarWidth, queueHeight, operationsWidth, activeDockTab? })` (`sidebarWidth`: `320..680`, `queueHeight`: `150..1200`, `operationsWidth`: `320..760`), writing to `localStorage` strictly inside explicit user resize handlers and setter wrappers, plus SSR-safe `ct_dispatch_active_dock_tab` persistence for the right operations dock (`'none' | 'drivers' | 'comms' | 'email' | 'phone' | 'alerts'`).
  - Persists per-window `{ x, y, width, height }` in `FloatingWindow.tsx` under `ct_floating_win_${id}` on drag/resize completion (`pointerup`/`mouseup`) and hydrates clamped within `window.innerWidth` / `window.innerHeight` when `isOpen` becomes `true` on desktop (`>= 768px`).
- **Portal-Anchored `Select` & Unified Royal Blue Primitives (`Select.tsx < 430`L, `Switch.tsx`, `Checkbox.tsx`, `SegmentedControl.tsx < 120`L & `ui/index.ts`)**:
  - Replaces native OS `<select>` inside `Select.tsx` with a `DriverAssignDropdown`-style `createPortal(..., document.body)` (`position: fixed`, `z-[99999]`) popover featuring fixed open width (zero layout shift on select/clear), viewport-edge clamping (`8px` inset + upward auto-flip), resize/scroll tracking, outside-click & `Escape` dismissal, keyboard navigation (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`, `Space`), auto-search input (`searchable === true` or `>= 8` options), `xs` / `sm` / `md` sizes, `default` / `subtle` / `dark` variants, rich `SelectOption` metadata (`subtitle`, `badge`, `dotClass`, `dotColor`, `icon`, `group`), JSX `<option>` / `<optgroup>` child extraction (`extractSelectOptionsFromChildren`), and dual `onValueChange` + synthetic `onChange` compatibility.
  - Updates `Switch.tsx` and `Checkbox.tsx` default active accents from legacy `amber-500` to Royal Blue (`bg-blue-600`, `border-blue-600`, `focus-visible:ring-blue-500`) with `tone?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose'` and `size?: 'sm' | 'md'`, and adds `<SegmentedControl />` (`xs` / `sm` / `md`, `surface` / `brand` / `dark`) exported from `app/components/ui/index.ts`.
- **Complete Non-Admin Portal `Select` Rollout (`0` Native `<select>` Elements Outside `app/components/domain/admin/**`)**:
  - Migrates all 22 non-Admin `.tsx` surfaces across Customer Booking (`FlightAssistanceCard.tsx`, `CustomerPassengerNotesSection.tsx`, `FieldRenderer.tsx`), Dispatch Console (`AppSuiteLauncher.tsx`, `DispatchPassengerCrmSection.tsx`, `DispatchPaymentAssignmentSection.tsx`, `DispatchReturnRepeatSection.tsx`, `DispatchRoutingTimingSection.tsx`, `comms-ContactModal.tsx`, `CommsFilterToolbar.tsx`, `SmsThreadPane.tsx`, `CustomDateTimePicker.tsx`, `DispatchDriverRosterPane.tsx`, `EmailComposerPane.tsx`, `DispatchTripQueueSheets.tsx`, `TripQueueToolbar.tsx`, `DispatchDesktopTopHeader.tsx`, `DispatchRightOperationsDock.tsx`), and Corporate / Public / Passenger routes (`corporate.tsx`, `app.tsx`, `apply.tsx`, `contact.tsx`) while preserving `DriverAssignDropdown` for all driver assignment controls.

## 65. Phase 65 (Wave 5 Phase 7 — Wave 5 Finale): Unified `Actions ▾` Dropdown Visual Language, Dedicated `Unconfirmed` Header Filter & Admin Console Full Sweep (`0` Native `<select>`s Site-Wide)
- **Unified `Actions ▾` (`TripActionDropdown.tsx`) Portal Dropdown Visual Language & Zero Fly-In Positioning**:
  - Unifies `Select.tsx`, `TripQueueLayoutDropdown` (`Table ▾` Queue Layout Mode), `TripStatusMultiSelectDropdown` (`Status ▾`), `TripAddFilterDropdown` (`Filter ▾`), and `MapLayersAndVehiclesToolbar.tsx` (`Vehicles ▾` & `Layers ▾`) onto the crisp `TripActionDropdown.tsx` visual shell (`bg-white rounded-xl shadow-xl border border-slate-200/90 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 text-left divide-y divide-slate-100 select-none z-[99999]` with `data-ui-select-portal="true"`), while keeping `DriverAssignDropdown.tsx` visually unique and untouched.
  - Replaces all raw OS `<input type="checkbox">` inputs inside dropdown menus with right-aligned `<CheckIcon />` (single-select) and custom `14px` rounded check indicators (`w-3.5 h-3.5 rounded-[4px] border`) inside edge-to-edge `px-3 py-1.5` `<button type="button">` rows (`bg-blue-50/80 text-blue-700 font-bold` when selected; `hover:bg-blue-50/80 hover:text-blue-700` when hovered), plus fixed-height `min-h-[28px]` `bg-slate-50/60` header strips where `Clear` / `All Off` remain permanently mounted (`disabled:opacity-40`) for zero popover layout shift.
  - Enforces synchronous frame-1 coordinate computation inside trigger `onClick` handlers (`coords` initialized to `null`, `createPortal` rendered only when `coords !== null`, accurate `transformOrigin` for upward/downward and left/right alignment) eliminating any `(0,0)` or `left: 16` first-click fly-in.
- **Dedicated `Unconfirmed` Header Quick-Filter with Red Circle Counter (`TripQueueToolbar.tsx`, `TripQueueFilterPopovers.tsx` & `dispatch-workspace.util.ts`)**:
  - Exports pure `isUnconfirmedQuickFilterActive(statusFilter)` and `computeNextStatusFilterOnUnconfirmedToggle(currentStatusFilter, previousNonUnconfirmedFilter?)` in `dispatch-workspace.util.ts`, toggling cleanly between `'unconfirmed'` and the operator's prior status selection (while keeping `'unconfirmed'` inside `ALL_QUEUE_STATUS_KEYS` and `ACTIVE_QUEUE_STATUS_KEYS` so default combined views still surface incoming unconfirmed bookings).
  - Mounts a dedicated `Unconfirmed` quick-filter button between `All Dates ▾` and `Status ▾` in `TripQueueToolbar.tsx` with a red circle counter badge (`bg-rose-600 text-white` when `unconfirmedCount > 0` or active; `bg-slate-200 text-slate-600` when `0` and inactive), removes `'unconfirmed'` from `STATUS_FILTER_OPTIONS` (11 lifecycle statuses), and removes width-shifting `(N new)` / pulsing corner dots from `Status ▾`.
- **Admin Console Full Dropdown Sweep (`73` Native `<select>`s Across `27` Files → `0` Site-Wide)**:
  - Migrates all `73` remaining native `<select>` elements across `27` Admin Console `.tsx` files (`AdminAdvancedTab`, `AdminFleetTab`, `AdminRulesTab`, `AdminVehiclesTab`, `CustomerProfileDrawer`, `LocalizationAndUnitsPanel`, `BillingPolicyAndQuickBooksPanel`, `CorporateAccountsPanel`, `InvoiceBuilderModal`, `PayoutSettlementModal`, `SpecialPlacesAdminPanel`, `PricingAuditPanel`, `CorridorEditor`, `RatesPanel`, `PricingRulesPanel`, `PersistentFareSimulator`, `SurchargesPanel`, `AdminAutoDispatchControlPanel`, `AdminAutoDispatchSimulator`, `BookingRulesSimulatorCard`, `ModularTierCard`, `AdminTripsSubpage`, `WebsiteFormControlsTab`, `WebsiteNavigationTab`, `WebsitePagesTab`, `WebsiteThemesTab`, and `ZoneInspectorEditorPane`) to `<Select />`, achieving **`0` native `<select>` elements across all `.tsx` files in `app/`**.

## 66. Phase 66 (Wave 6 Phase 1): Trips Queue `Active Only` Default, Pure Icon Status Pills, `Columns ▾` Selector + Presets, Multi-Column Sorting & Clickable `#TRIP_ID` Links
- **Default `Status ▾` Filter to `Active Only` (`dispatch-workspace.util.ts`, `config.ts`, `DispatchConsoleSettingsPanel.tsx`, `dispatch.tsx`, `TripQueueToolbar.tsx`, `TripQueueFilterPopovers.tsx`)**:
  - Exports `DEFAULT_ACTIVE_ONLY_STATUS_FILTER` (`'unconfirmed,confirmed,pending,offered,assigned,accepted,en_route,arrived,in_progress'`) hiding historical `completed`, `cancelled`, and `declined` clutter on load while keeping incoming `unconfirmed` + all 8 active lifecycle rides visible.
  - Extends `DispatchConsoleSettingsConfig` (`normalizeDispatchConsoleConfig` & `DispatchConsoleSettingsPanel.tsx` via `<Select size="sm">`) with `defaultQueueStatusFilter?: 'active_only' | 'all'` defaulting to `'active_only'`, initializes `statusFilter` in `dispatch.tsx` and `prevNonUnconfirmedStatusRef` in `TripQueueToolbar.tsx` to `DEFAULT_ACTIVE_ONLY_STATUS_FILTER` (while preserving backward-compatible `'all'` fallback in `computeNextStatusFilterOnUnconfirmedToggle` when `previousNonUnconfirmedFilter` is omitted/empty), and renders `Active Only` calmly in `TripStatusMultiSelectDropdown`.
- **Pure Inline SVG Icon Status Pills (`DispatchStatusBadge.tsx < 240`L)**:
  - Replaces multi-word text status pills in compact queue/table/bar surfaces (`TripQueueTableView.tsx`, `TripQueueCompactList.tsx`, `TripQueueCardsGrid.tsx`, `AdminTripsTablePanel.tsx`, and `DispatchLeftBookingSidebar.tsx`) with pure crisp inline `w-3.5 h-3.5` SVG icon pills (`compact: true` default) preserving semantic badge colors, `aria-label`, and descriptive hover `title` tooltips across all 12 lifecycle statuses (`unconfirmed`, `confirmed`, `pending`, `offered`, `assigned`, `accepted`, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`, `declined`), while supporting `compact: false` icon + text rendering.
- **`Columns ▾` Portal Selector + Presets & Dynamic Overflow Width (`trip-queue-columns.util.ts < 240`L & `TripQueueColumnsDropdown.tsx < 260`L)**:
  - Supports 11 toggleable/pinned `TripQueueColumnKey` columns (`trip_id`, `date_time`, `passenger`, `pickup`, `dropoff`, `driver`, `vehicle`, `price`, `payment`, `status`, and pinned `action`) persisted in `localStorage` (`ct_dispatch_table_columns_v1`) + custom event sync across queue panes, with 3 one-click presets (`Full Desk`, `Standard`, `Compact Dock`), `Reset` guard, minimum 1 non-action column guard, and dynamic `computeQueueTableMinWidthPx(cols)` so hiding columns lowers the table `minWidth` and prevents unnecessary `Cards (Auto)` fallback.
- **Multi-Column Queue Sorting (`dispatch-workspace.util.ts` & `TripQueueTableView.tsx < 615`L)**:
  - Exports pure `cycleQueueColumnSort` and `sortQueueTripsByColumn` supporting 3-state cycling (`asc` → `desc` → `'smart'`) across all 10 data columns (`trip_id`, `date`, `passenger`, `pickup`, `dropoff`, `driver`, `vehicle`, `price`, `payment`, and lifecycle `status` rank) with deterministic `id` tie-breaking, active `▲` / `▼` header indicators, `Live` badge when `'smart'`, and 1-click `Live ↺` reset pill on `DATE/TIME`.
- **Clickable `#TRIP_ID` Links to Open Trip Details & Audit Modal**:
  - Wires clickable `#TRIP_ID` buttons (`title="Open Trip Details & Audit"`) across the `DispatchLeftBookingSidebar.tsx` Edit Context Bar, `MapRouteOverlayHud.tsx` (`LiveFleetMap.tsx` + `DispatchLiveMapPane.tsx` + `dispatch.tsx`), and the `TripQueueTableView.tsx` `TRIP #` column.

## 67. Phase 67 (Wave 6 Phase 2): Active Admin Vehicles (`Any → Assigned`), Starred `Places` Overlay Fix, Searchable `YYZ Toronto` Flight Combobox & Dynamic `Waive Fees ▾` Dropdown
- **Active Admin Vehicles Unification & `Any → <Assigned Tier>` Display (`fleet-car-marker.util.ts`, `TripQueueToolbar.tsx`, `vehicle-tier-format.util.ts`, `TripQueueTableView.tsx`, `AdminTripsTablePanel.tsx`, `dispatch-workspace.util.ts`)**:
  - Updates `buildVehicleTypeFilterOptions(fleet, fleetCars, vehicleTiers)` and `resolveDriverVehicleTypeKey` / `matchesSelectedVehicleTypes` so when `vehicleTiers` has active non-archived Admin vehicles (`!v.isArchived && v.isActive !== false`), `Vehicles ▾` options are built strictly from those active Admin `VehicleTierConfig` entries in configured order using live `v.name` labels (including built-in IDs like `standard`, `premium`, `xl`, `wheelchair`, `compact-suv`, `midsize-suv`, `minivan`), falling back to `CANONICAL_VEHICLE_TYPE_OPTIONS` only when `vehicleTiers` is empty/null.
  - Filters `Filter ▾ -> Vehicle` in `TripQueueToolbar.tsx` strictly to active non-archived `settings.vehicles` plus `"Any"`.
  - Prioritizes live `vehicles` lookup by `tier` ID ahead of persisted `explicitDisplayName` in `formatVehicleTier` & `formatVehicleTierDisplay`, and exports `formatTripVehicleColumnDisplay(trip, vehicles, drivers, fleetCars)` rendering **`Any → <Assigned Tier>`** (e.g., `Any → Midsize SUV`) when a trip booked as `'any'` has an assigned driver (or `'Any'` when unassigned), wired across `TripQueueTableView.tsx`, `AdminTripsTablePanel.tsx`, and `sortQueueTripsByColumn` (`'vehicle'`).
- **Starred (`isPopular`) Admin Places Overlay Fix (`special-places.service.ts`, `workspace-bus.service.ts`, `useLiveMapCustomOverlays.ts`)**:
  - Fixes `SpecialPlacesService.syncWithFirestore()` so saved Firestore `/specialPlaces` documents merge by `id` over non-deleted `DEFAULT_SPECIAL_PLACES` (tracking deleted tombstones in `localStorage` under `ct_deleted_special_place_ids_v1` in `deletePlace(id)`) without clobbering the default landmark catalog, and emits live `SPECIAL_PLACES_UPDATED` / subscriber updates on `savePlace` & `deletePlace`.
  - Updates `showPlacesOverlay` in `useLiveMapCustomOverlays.ts` to render strictly active Starred Admin Places (`sp.isActive && sp.isPopular && !sp.isArchived`), removing `/locationCollections` merging and re-syncing live when places are starred or unstarred in Admin.
- **Searchable `YYZ Toronto` Airport Combobox & Auto Return Flight (`airport-catalog.ts < 320`L, `AirportCityCombobox.tsx < 280`L, `FlightAssistanceCard.tsx`, `DispatchRoutingTimingSection.tsx`, `DispatchReturnRepeatSection.tsx`, `flight-status.service.ts`, `useReturnTripSync.ts`)**:
  - Adds `MAJOR_AIRPORTS` (~115 major US, Canadian, Mexican, Caribbean, international & private FBO hubs) plus pure `formatAirportCodeCity` (`"YYZ Toronto"`), `searchAirportCatalog` (code prefix -> city -> airport name), and `extractAirportIataCode` (`"YYZ Toronto"` -> `"YYZ"`).
  - Mounts portal-anchored `<AirportCityCombobox />` (`createPortal`, `z-[99999]`, `coords !== null`, `Actions ▾` shell, keyboard navigation, clear button, custom 3–4 char regional code fallback) across all 6 commercial & private outbound/return flight origin/destination fields in Customer & Dispatch booking, normalizes codes via `extractAirportIataCode` in `flight-status.service.ts`, and auto-enables `returnProvideFlightInfo = true` when outbound dropoff is an airport and `Return Trip` is toggled ON (unless manually dismissed).
- **Dynamic `Waive Fees ▾` Multi-Select Dropdown (`types.ts`, `rules.ts`, `DispatchWaiveFeesDropdown.tsx < 280`L, `DispatchPaymentAssignmentSection.tsx`, `DispatchBookingEngine.tsx`, `PriceBreakdownPanel.tsx`)**:
  - Extends `PricingCalculationInput` (`PricingInput`) with `waivedSurchargeIds?: string[]` and `waivedExtraKeys?: string[]` (maintaining backward compatibility with `waiveAirportFee`, `waiveMultiStopFees`, and `bypassSurge`), waiving matching enabled catalog surcharges and active extras (`'car_seat'`, `'extra_passenger'`, `'intermediate_stop'`, `'oversized_cargo'`, `'curb_wait'`, `'custom:' + ce.id`) in `rules.ts` with `amount: 0`, `isWaived: true`, and `originalAmount`.
  - Replaces the 3 hardcoded waiver buttons in `DispatchPaymentAssignmentSection.tsx` with a portaled `Waive Fees ▾` (`Waive Fees (N) ▾`) multi-select dropdown (`Actions ▾` shell + `MenuCheckIndicator`) listing only active Admin Surcharges (`s.enabled`) and active non-zero Admin Extras with live quote badges, removable emerald waived chips, and emerald/strikethrough `(Waived)` rows in `PriceBreakdownPanel.tsx`.

## 68. Phase 68 (Wave 6 Phase 3): Derived `Late` Pickup Status (Flight-Delay Exempt), Localhost Maintenance Bypass + `/book` Anti-Spam Shield, Inline STL Airport Text Autocomplete, Headquarters `HQ` Map Pin, `/track` Custom Pickers + Pulsing Button, `<CollapsibleSection>` & `Card`/`Cash` Symmetry
- **Derived `Late` Driver Pickup Status (Flight-Delay Exempt) (`dispatch-workspace.util.ts`, `DispatchStatusBadge.tsx < 240`L, `TripQueueFilterPopovers.tsx`, `TripQueueTableView.tsx < 615`L, `DispatchLeftBookingSidebar.tsx`, `AdminTripsTablePanel.tsx < 420`L, `dispatch.tsx < 1,600`L)**:
  - Exports pure `evaluateTripDriverLateStatus(trip, nowMs)` activating strictly when `Boolean(trip?.assignedDriverId)` AND `status` is pre-arrival (`'assigned' | 'accepted' | 'en_route'`) AND `scheduledPickupTime` is valid with `nowMs > pickupMs + 60_000`, while exempting delayed inbound flights (`flightTelemetry?.status === 'delayed'`, `metadata.flightDelayed`, or positive `delayMinutes` prior to post-delay arrival window).
  - Includes `'late'` at the top of `ACTIVE_QUEUE_STATUS_KEYS`, `ALL_QUEUE_STATUS_KEYS`, and `STATUS_FILTER_OPTIONS`, updates `matchesQueueStatusFilter(tripOrStatus, statusFilter, nowMs?)` (supporting both `Trip` objects and legacy status strings) so `'late'` and `Active Only` surface late trips, and prioritizes `late` at the top of `Status` and `smart` (`Live`) sorting.
  - Renders a pulsing rose alarm-clock SVG `Late` status pill (`bg-rose-600 text-white border-rose-700 animate-pulse`) with tooltip `"Late (+Nm) — <Assigned/Accepted/En Route>"` backed by a 30-second live clock tick across Dispatch Queue, Edit Sidebar, and Admin Trips.
- **Localhost Maintenance Auto-Bypass + Multi-Layer `/book` Anti-Spam Shield (`layout.tsx`, `app.tsx`, `security-sanitizer.util.ts`, `BookingEngineV2.tsx < 1,350`L, `useCustomerBookingSubmission.ts`)**:
  - Exports pure `isLocalhostDevHost(hostname?)` (`localhost`, `127.0.0.1`, `[::1]`) auto-bypassing `<UnderConstruction />` on local dev servers with a compact fixed bottom-right `"Live Site: Maintenance ON"` indicator pill while keeping production Maintenance Mode active.
  - Replaces `display: 'none'` honeypot in `BookingEngineV2.tsx` with an offscreen `clip-path: inset(50%)` `websiteUrl` trap (`autoComplete="new-password"`, `tabIndex={-1}`, `aria-hidden="true"`) + `< 4000ms` dwell-time bot trap returning a simulated confirmation ID without Firestore/email side effects, blocks non-staff non-localhost `handleBookRide` when `constructionMode === true`, enforces verified autocomplete `pickupCoordinates` & `dropoffCoordinates`, and rejects all-digit / consonant-mash spam names via pure `isLikelyGibberishOrNumericName` & `hasSpamConsonantMash`.
- **Inline Text Autocomplete `AirportCityCombobox` (`>= 145` STL-Connected Airports) & Headquarters `HQ` Map Pin (`airport-catalog.ts < 320`L, `AirportCityCombobox.tsx < 280`L, `config.ts`, `CompanyProfilePanel.tsx`, `useLiveMapCustomOverlays.ts < 430`L)**:
  - Converts `AirportCityCombobox.tsx` into a direct inline text `<input>` with portaled suggestions (`createPortal`, `z-[99999]`, `coords !== null`, `0` `type="checkbox"`), instant typing filter, `onBlur` 3–4 char IATA/ICAO normalization via `resolveAirportDisplayValue`, and zero-click free-text entry, backed by `>= 145` airports in `MAJOR_AIRPORTS` covering STL nonstop, seasonal, Midwest Cape Air, Caribbean/Mexico, Canadian, European (`FRA`/`LHR`), and private FBO fields.
  - Adds optional `headquartersCoordinates` on `CompanyInfoConfig` (`CompanyConfig`), wires `LocationAutocomplete` in `CompanyProfilePanel.tsx`, and renders a dedicated navy/gold **Headquarters (`HQ`)** map pin + 1-click Set Pickup/Dropoff popover on the Dispatch map.
- **`/track` Custom Date/Time Pickers + Pulsing Confirmation CTA, `<CollapsibleSection>` & `Card`/`Cash` Symmetry (`GuestManageRidePanel.tsx`, `CollapsibleSection.tsx < 90`L, `CustomerPaymentSection.tsx`)**:
  - Replaces raw `type="date"` / `type="time"` inputs in `GuestManageRidePanel.tsx` with `<ModernDatePicker />` & `<ModernTimePicker />`, and styles `"Request Dispatch Confirmation"` + `Time / Address` approval mode in high-contrast amber-orange (`bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold ring-2 ring-amber-400/60`) with a pulsing attention indicator.
  - Introduces `<CollapsibleSection />` (`grid transition-[grid-template-rows,opacity] duration-200 ease-out`) wrapping Oversized Cargo, Child Safety Seats, and Flight Info panels across `/book` & Dispatch booking forms, and aligns `Cash (In Car)` in `CustomerPaymentSection.tsx` to the exact 2-line shell of `Card (In Car)`.



## 69. Phase 69 (Wave 6 Phase 4): Redesigned Corporate `Account` 4-Signal Caller Verification, Incoming-Call `ClientProfileWindow`, `Driver Homes` Map Layer, Compact Flight Code Display (`WN` / `YYZ`), Darker `Completed`/`Cancelled` Badges & Sidebar-Docked `Clear` Prompt + `FloatingWindow` Portal Fix
- **Redesigned Corporate `Account` 4-Signal Caller Verification (`config.ts`, `CorporateAccountModals.tsx`, `corporate-caller-auth.util.ts < 240`L, `DispatchCorporateAccountCard.tsx < 320`L, `DispatchPaymentAssignmentSection.tsx`, `DispatchBookingEngine.tsx`, `useDispatchBookingSubmission.ts`)**:
  - Adds optional `bookingPin?: string` (4–8 alphanumeric Verbal Booking PIN) to `CorporateAccountConfig`, editable in Admin (`CorporateAccountModals.tsx` / `CorporateAccountsPanel.tsx`).
  - Exports pure `searchCorporateAccounts(accounts, query)` (matching `accountNumber` or `companyName`) and `evaluateCorporateCallerVerification({ account, callerPhone, passengerPhone, passengerEmail, bookerPhone, bookerEmail, enteredPin, selectedRiderId, poValidation })` in `corporate-caller-auth.util.ts`.
  - Replaces the legacy Corporate sub-panel in `DispatchPaymentAssignmentSection.tsx` with `<DispatchCorporateAccountCard />` featuring an always-searchable `<Select searchable>` by Account # or Company Name, completely removes the dispatcher-facing `Invoicing Terms` / billing cycle selector (inheriting `CorporateAccountConfig.billingCycle` silently in submission metadata), and surfaces 4-signal caller verification: (a) automatic Caller/Passenger/Booker Phone & Email Roster Match (`"✓ Verified Roster Match"` pill), (b) Verbal Booking PIN check when `bookingPin` is set, (c) searchable Authorized Rider & Cost-Center quick-pickers, and (d) live Anti-Fraud PO validation + supervisor override.
- **Incoming-Call `ClientProfileWindow` (`FloatingWindow`) (`ClientProfileWindow.tsx < 380`L, `client-trip-history.util.ts < 180`L, `dispatch.tsx < 1,600`L, `DispatchPassengerCrmSection.tsx`, `CommsHub.tsx < 900`L, `workspace-bus.service.ts`)**:
  - Renders `<FloatingWindow id="client_profile" ...>` (`initialSize={{ width: 540, height: 520 }}`) auto-opening on incoming/answered calls from existing clients (`TelephonyService` / `WorkspaceBus` `'OPEN_CLIENT_PROFILE'` when caller phone matches a `ContactRecord` or past passenger in `trips`, deduplicated per call `callSid`/session) plus 1-click **"Client Profile"** triggers in Dispatch Passenger CRM and `CommsHub.tsx`.
  - Displays CRM badges (`VIP`, Corporate Account, Customer Score, Total Trips & Spend, Dispatcher Notes) alongside a compact list of the last `10` trips (`Date` · `Pickup → Dropoff` · `Vehicle` · `Fare` · pure icon `DispatchStatusBadge`), **`Load More Trips (+10)`** pagination, and a 1-click **`Load into New Tab`** button per row (`cloneTripToDispatchFormValues` opening a pre-populated booking draft tab in `dispatch.tsx`).
- **Driver Home Addresses & `Layers ▾ -> Driver Homes` (`driver.ts`, `operator.service.ts`, `useDispatchFleet.ts`, `OperatorEditorDrawer.tsx`, `useDispatchMapPreferences.ts`, `MapLayersAndVehiclesToolbar.tsx`, `driver-homes-overlay.util.ts < 240`L, `useLiveMapCustomOverlays.ts < 430`L, `MapCustomOverlayInfoCard.tsx`)**:
  - Extends `DriverProfile`, `OperatorUser`, and `LiveFleetDriver` with optional `homeAddress?: string` and `homeCoordinates?: GeoPoint`, editable via `<LocationAutocomplete />` (`"Driver Home Address"`) in `OperatorEditorDrawer.tsx` when `'driver'` role is selected.
  - Adds `showDriverHomesOverlay: boolean` (default `false`) to `DispatchMapPreferences` and a **`Driver Homes`** toggle inside `Layers ▾`, rendering House (`HOME` / `#Cab`) pins for active non-archived drivers with `homeCoordinates` (respecting `selectedVehicleTypes`), with click popover showing Driver Name, `#Cab`, Vehicle Class, Shift Schedule, Home Address, and 1-click **"Open Driver Queue"**.
- **Compact Flight Codes (`WN` / `YYZ`), Darker Terminal Statuses, Sidebar `Clear` Prompt & `FloatingWindow` Portal (`Select.tsx`, `AirportCityCombobox.tsx < 280`L, `FlightAssistanceCard.tsx`, `DispatchRoutingTimingSection.tsx`, `DispatchReturnRepeatSection.tsx`, `DispatchStatusBadge.tsx`, `DispatchBookingFooterBar.tsx`, `FloatingWindow.tsx`, `hq-place-marker.util.ts`)**:
  - Adds optional `selectedLabel?: string` to `SelectOption` (and `data-selected-label` on `<option>` parsed in `extractSelectOptionsFromChildren`) so closed `<Select>` triggers render `selectedOption.selectedLabel || selectedOption.label` (`title={selectedOption.label}`) while dropdown menus show full `opt.label`, wired with `selectedLabel: al.code` (`"WN"`, `"AA"`, `"DL"`) across all Customer & Dispatch Airline `<Select>`s.
  - Updates `AirportCityCombobox.tsx` so unfocused/selected inputs display/commit only the IATA code (`extractAirportIataCode(value) || value`, e.g. `"YYZ"`, `"ORD"`, `"TEB"`, with full `resolveAirportDisplayValue(value)` on `title` hover) while keeping full `"YYZ Toronto"` + airport name inside the open suggestion list and preserving `formatAirportCodeCity` & `resolveAirportDisplayValue` exports in `airport-catalog.ts`.
  - Darkens `STATUS_META_BY_KEY.completed.pillClass` (`'bg-emerald-700 text-white border-emerald-800'`) and `STATUS_META_BY_KEY.cancelled.pillClass` (`'bg-rose-800 text-white border-rose-900'`) in `DispatchStatusBadge.tsx`.
  - Replaces `<ConfirmationModal />` in `DispatchBookingFooterBar.tsx` with a compact sidebar-docked confirmation card (`w-full`, `z-30`) right above the sticky footer, portals `FloatingWindow.tsx` via `createPortal(..., document.body)` (`zIndex >= 200`), and adds `PlacesService.findPlaceFromQuery` fallback in `hq-place-marker.util.ts`.


## 70. Phase 70 (Wave 6 Phase 5): `ClientProfileWindow` Operational Upgrades — 1-Click `⇄ Book Return`, `Active & Upcoming Rides` Action Strip & Unified `Saved & Frequent Places` Quick-Fill (`Set Pickup` / `Set Dropoff` + Inline `+ Save Place`)
- **`ContactRecord.savedPlaces` & `ContactService` (`contact.service.ts`)**:
  - Adds `ContactSavedPlaceCategory = 'home' | 'work' | 'airport' | 'medical' | 'favorite' | 'other'`, `ContactSavedPlace` (`id`, `label`, `category`, `address`, `coordinates?`, `notes?`) and optional `savedPlaces?: ContactSavedPlace[]` on `ContactRecord`.
  - Adds `saveContactPlace(identity, place)` (creates the `ContactRecord` when the caller only existed in `trips`, dedupes by `id` / normalized address, syncs `homeAddress` / `workAddress` for `'home'` / `'work'`, persists to `localStorage`, publishes `CONTACT_UPDATED`) and `removeContactPlace(contactId, placeId)`; exports pure `normalizePlaceAddressKey`.
- **Pure Client Profile Workflows (`client-profile-workflows.util.ts < 240`L, zero React/DOM)**:
  - `buildReturnTabValuesFromClientTrip(trip, nowMs?)` swaps pickup ↔ dropoff (address, coordinates, placeId), reverses `intermediateStops`, resets to `asap` with current local date / 5-minute-rounded time, clears stale outbound flight fields when the new pickup is not an airport, and preserves passenger, counts, vehicle, `paymentMethod` and `corporateDetails`.
  - `normalizeClonedDraftTiming` / `buildNewTabValuesFromClientTrip(trip, nowMs?)` never copy historical past timestamps onto new drafts (reset to `asap` today) while preserving still-future `scheduledPickupTime`.
  - `partitionClientActiveUpcomingAndPastTrips` splits non-terminal (live-first, then soonest-first) from terminal (`completed` / `cancelled` / `declined`, newest-first) trips; `resolveClientSavedAndFrequentPlaces` returns a deduplicated `ClientQuickPlaceItem[]` (saved → Home/Work contact fields → matched corporate `savedCompanyLocations` → top frequent endpoints with `tripCount`, filling up to `maxItems = 6`); `buildPopulateDraftPayloadFromClientPlace` builds the `POPULATE_BOOKING` payload (`onlyFillEmptyPassenger: true`).
- **`POPULATE_BOOKING.onlyFillEmptyPassenger` (`workspace-bus.service.ts`, `dispatch-workspace.util.ts`, `useDispatchDraftSync.ts`)**: new optional flag + pure `resolvePopulatePassengerMode` (`overwrite` / `fill_empty` / `keep_current`) so Set Pickup / Set Dropoff never clobber a different passenger already entered on a busy draft (passenger + corporate fields untouched, notes not duplicated), while blank drafts hydrate passenger + corporate fields. Legacy callers are unchanged.
- **UI (`ClientProfileSections.tsx < 320`L, `ClientProfileHeaderCard.tsx`, `ClientProfileWindow.tsx < 380`L, `dispatch.tsx < 1,600`L)**: `<ClientUpcomingRidesStrip />` (`Active & Upcoming Rides (N)`, status badge, `#SHORT_ID`, pickup time, driver badge, `Edit` / `Map`), `<ClientSavedPlacesSection />` (`Saved & Frequent Places`, `Set Pickup` / `Set Dropoff` with `✓` feedback, `✕` remove, `+ Save Place` inline form using `<Select size="xs">` + `<LocationAutocomplete />`), `⇄ Book Return` beside `Load into New Tab` on each past trip, and `dispatch.tsx` wiring for `corporateAccounts`, `onEditTrip`, `onFocusTripOnMap`, `onPopulateBookingDraft`.
- **Verification**: `scripts/test-client-profile-return-places-and-upcoming-phase70.ts < 400`L plus `npm run typecheck`, Phases 64–70 suites and `npm run build`.

## 71. Phase 71 (Wave 6 Phase 6): Nextiva Hybrid Simultaneous-Ring Softphone (`answerOnBridge="true"` Non-Stealing Inbound TwiML, Separate Twilio Bridge vs. Verified Outbound Caller ID, Copy-Ready Webhook Setup Card & Local Incoming-Ring Simulator)
- **Non-Stealing Simultaneous-Ring TwiML & Inbound Mode Resolver (`app/core/services/comms/telephony-twiml.util.ts < 160`L, zero DOM/React)**:
  - Exports `TelephonyInboundMode = 'simultaneous_ring' | 'standalone_ivr'`, `resolveTelephonyInboundMode(queryMode?, envMode?, configMode?)` (`'simulring' | 'simultaneous_ring' | 'nextiva_bridge'` → `'simultaneous_ring'`; `'standalone' | 'standalone_ivr' | 'ivr'` → `'standalone_ivr'`; defaults to `'standalone_ivr'` for 100% legacy Phase 47 backward compatibility), `buildIncomingCallTwiml(...)`, `resolveOutboundCallerId(...)`, and `buildTelephonyWebhookUrls(...)`.
  - In `'simultaneous_ring'` mode, emits `<Dial answerOnBridge="true" timeout="{timeoutSeconds ?? 25}" record="record-from-answer" recordingStatusCallback="/api/telephony?action=call_recording_status" recordingStatusCallbackEvent="completed"><Client>{clientIdentity}</Client></Dial><Reject reason="busy"/>` with **zero** `<Say>`, **zero** `<Record>`, and **zero** `handle_unanswered` rollover so Twilio never steals inbound calls from Nextiva desk/mobile phones or Nextiva voicemail when no browser dispatcher clicks Accept.
  - In `'standalone_ivr'` mode, preserves the existing `<Say>` greeting + `<Dial timeout="30" action="/api/telephony?action=handle_unanswered">` + optional `forwardingPhone` TwiML verbatim.
- **Server Telephony Gateway Separation (`telephony-credentials.server.ts`, `telephony-twiml-webhooks.server.ts`, `telephony-gateway.server.ts`, `telephony-outbound-rest.server.ts`)**:
  - Adds `TWILIO_BRIDGE_PHONE_NUMBER` and `TWILIO_INBOUND_MODE` env resolution to `resolveCredentials` (`ResolvedTelephonyCredentials.bridgePhoneNumber?`, `inboundMode?`).
  - Wires `resolveTelephonyInboundMode(url.searchParams.get('mode'), readEnv('TWILIO_INBOUND_MODE'), resolved.inboundMode)` and `buildIncomingCallTwiml(...)` into both `GET incoming_call` and `POST incoming_call`.
  - Ensures `voice_client_twiml` (`GET` & `POST`) prioritizes `FromNumber` / `CallerId` / `resolved.phoneNumber` (Verified Outbound Caller ID, e.g. `+13147380100`) and falls back to `bridgePhoneNumber` only if `phoneNumber` is unset.
- **Admin Telephony Hybrid Config & Copy-Ready Webhook Setup Card (`config.ts`, `admin-config.service.ts`, `TelephonyWebhookGuideCard.tsx < 220`L, `TelephonyAndSmsTemplatesPanel.tsx < 440`L)**:
  - Extends `IntegrationsConfig['telephony']` (`TelephonyIntegrationConfig`) with `bridgePhoneNumber?: string`, `inboundMode?: 'simultaneous_ring' | 'standalone_ivr'`, and `voiceOnlyMode?: boolean` (default `false`), exporting `normalizeIntegrationsConfig` while continuing to strip `authToken` and `apiKeySecret`.
  - Updates `TelephonyAndSmsTemplatesPanel.tsx` with Verified Outbound Caller ID, Twilio Inbound Bridge Number, Inbound Call Mode (`<Select size="sm">`), and Voice-Only Mode (A2P SMS Deferred) `<Switch />` (visually collapsing/muting the Test Outbound SMS panel when active).
  - Adds `<TelephonyWebhookGuideCard />` with 1-click Copy buttons for origin-derived Inbound Voice Webhook (`?action=incoming_call&mode=simulring` or `?action=incoming_call`), TwiML App Outbound Voice URL (`?action=voice_client_twiml`), and Call Status Callback URL (`?action=call_status_callback`), plus a 1-click **"Simulate Incoming Ring (Local Test)"** button publishing `INCOMING_CALL` on `WorkspaceBus` to verify the Dispatch softphone ring banner and automatic `ClientProfileWindow` screen-pop before enabling live Nextiva forwarding.
- **Verification**: `scripts/test-nextiva-hybrid-softphone-phase71.ts < 400`L plus `npm run typecheck`, existing telephony & Phases 69–71 suites, and `npm run build`.

### Phase 71.B: Zero-SDK TwiML Hardening (`voice_client_twiml` + `From=client:*` Routing + Apex/`www` Signature Support), Purge Phantom `+13147391800` & 12s Polling, and Omnichannel Thread Scroll Fix
- **Zero-SDK Pure XML TwiML & `voice_dial_status` Diagnostics (`telephony-twiml.util.ts < 200`L & `telephony-twiml-webhooks.server.ts`)**:
  - Exports pure `buildOutboundClientCallTwiml({ to, callerId, timeoutSeconds })` (`action="/api/telephony?action=voice_dial_status"`, XML-escaped `<Number>`, `<Say>No destination number was provided.</Say><Hangup/>` when empty) and `buildVoiceDialStatusTwiml({ dialCallStatus, errorCode })` (audible caller-ID verification diagnostic `<Say>` on `failed`, clean `<Hangup/>` otherwise).
  - Completely removes `import twilio from 'twilio'` from `telephony-twiml-webhooks.server.ts` so Vercel Serverless never encounters CJS/ESM `twilio.twiml.VoiceResponse` runtime bundling crashes, and registers `'voice_dial_status'` across `GET` & `POST` webhooks.
- **Auto-Route `From=client:*`, Apex/`www` Webhook Signatures & XML Error Safety (`telephony-gateway.server.ts` & `telephony-credentials.server.ts`)**:
  - Routes `POST /api/telephony` payloads without `?action=` whose `From` starts with `client:` directly to `'voice_client_twiml'` (never `'incoming_call'`).
  - Expands `resolveCandidateWebhookUrls` with bidirectional `www.` <-> apex host variants (`chesterfieldtaxi.com` <-> `www.chesterfieldtaxi.com`) so canonical domain redirects never trigger false `X-Twilio-Signature` rejections, and returns valid `text/xml` (`Dispatch voice webhook configuration check failed.`) on voice webhook signature failures or exceptions instead of JSON `500`.
- **Purge Phantom Recording Entries, Deterministic Sort, Stop 12s Polling & Flex Scroll Fix (`useCommsInteractionSync.ts`, `CommsHub.tsx < 900`L, `SmsThreadPane.tsx`)**:
  - Deletes the unattached recording generator in `useCommsInteractionSync.ts` (attaching recordings strictly to matching `callSid`/`recordingSid` call events), strips stale cached `rec_*` / `'Recorded Call'` phantom rows from `ct_comms_interactions` on hydration and persists the cleaned list, sorts all `setInteractions` updates by `timestampMs` descending, and removes the 12-second 4-endpoint `setInterval` polling loop.
  - Adds `min-h-0` to the thread flex containers in `CommsHub.tsx` and `SmsThreadPane.tsx` so omnichannel threads scroll smoothly from top to bottom.

## 72. Phase 72 (Wave 6 Phase 7): Compact Draggable `FloatingCallPill` (FaceTime / Dynamic Island Style + End-Call Deduplication), Unified `ClientProfileWindow` (`Overview & Trips` | `Edit Profile`) & Console-Wide Non-Blocking `FloatingWindow` Multi-Tasking Sweep
- **Compact Draggable `FloatingCallPill` & End-Call Deduplication (`FloatingCallPill.tsx < 300`L, `DispatchDesktopTopHeader.tsx`, `CommsHub.tsx < 900`L, `useDispatchWorkspaceSync.ts`, `useTwilioSoftphoneDevice.ts`, `workspace-bus.service.ts`, `dispatch.tsx < 1,600`L)**:
  - Creates portaled (`createPortal(..., document.body)` with SSR-safe fallback) compact ~`330px` draggable `<FloatingCallPill />` at `z-[260]`, persisting clamped `{ top, right }` coordinates in `ct_floating_call_pill_pos_v1` (default `{ top: 58, right: 16 }`).
  - **Ringing Mode (`incomingCallAlert`)**: pulsing emerald ring indicator, resolved Caller Name & formatted phone, `VIP` / `Driver` / `Blacklist` badge, `[Profile]` (`OPEN_CLIENT_PROFILE`), `[Decline]` (`REJECT_INCOMING_CALL`), and `[Answer]` (`ANSWER_INCOMING_CALL`) with zero screen pushdown.
  - **Live Call Mode (`activeCallStatus !== 'idle'`)**: morphs smoothly in-place into a sleek dark Dynamic-Island pill with `● MM:SS` live timer, Caller Name, `[Mute]` (`TOGGLE_CALL_MUTE` / `CALL_MUTE_CHANGED`), `[Keypad]` (compact 12-key DTMF popover publishing `SEND_CALL_DTMF`), `[Profile]`, `[Thread]` (`OPEN_COMMS_THREAD`), and crimson `[End]` (`CALL_ENDED`).
  - Removes duplicate full-width incoming call banners from `DispatchDesktopTopHeader.tsx` and `CommsHub.tsx`, mounts `<FloatingCallPill />` in `dispatch.tsx`, and stops `INCOMING_CALL` in `useDispatchWorkspaceSync.ts` from forcing `setActiveDockTab('phone')`.
  - Eliminates triple-fired end-call loops & duplicate post-call fetches in `useTwilioSoftphoneDevice.ts` via idempotent `isEndingCallRef` + `endedCallSidsRef` + idle early-return guard + single cleared `postCallFetchTimerRef`.
- **Unified `ClientProfileWindow` (`Overview & Trips` | `Edit Profile`) & `comms-ContactModal.tsx` Retirement (`ClientProfileEditTab.tsx < 340`L, `ClientProfileWindow.tsx < 360`L, `contact.service.ts`, `CommsHub.tsx < 900`L, `useCommsMessagingAndContacts.ts`)**:
  - Creates `<ClientProfileEditTab />` (`< 340`L) inside `ClientProfileWindow` with Name, Primary + Additional Phones, Primary + Secondary Email, VIP `<Switch />` + VIP Reason, searchable Corporate Account `<Select searchable>` + Department + Default PO, Home & Work `<LocationAutocomplete />`, Preferred Vehicle `<Select />`, Mobility `<Checkbox />` options, and Dispatcher Notes saving via `getContactService().saveContact(...)` / `upsertContact(...)`.
  - Adds a 2-tab segmented toggle (`Overview & Trips` | `Edit Profile`) to `ClientProfileWindow.tsx` (`< 360`L), honoring `initialTab?: 'overview' | 'edit'` on `OPEN_CLIENT_PROFILE` payloads, deletes legacy `comms-ContactModal.tsx`, and routes all contact edit triggers to `OPEN_CLIENT_PROFILE` (`initialTab: 'edit'`).
- **Console-Wide Non-Blocking `FloatingWindow` (`hasBackdrop={false}`) Multi-Tasking Sweep**:
  - Converts blocking full-screen dark backdrop modals (`DispatchBookingConflictGuard`, `DispatchCompleteTripModal`, `DispatchDriverFareModal`, `DispatchTripQueueSheets`, `DispatchDriverSheets`, `StagedDriverConflictModal`, `NewSmsMessageModal`, `CommsRowActionSheet` / `VoicemailCallLogPane`, `AgentPhoneSetupModal`, `EmailMessageListPane`, and `dispatch.tsx` lazy fallback) onto non-blocking `<FloatingWindow hasBackdrop={false} ...>` surfaces.
- **Verification**: `scripts/test-floating-call-pill-and-nonblocking-windows-phase72.ts < 360`L plus `npm run typecheck`, Phases 69–72 suites, and `npm run build`.

## 73. Phase 73 (Wave 6 Phase 8): Clean-Slate Dispatch Comms Dock v2 Rebuild (Linear / OpenPhone Density, Associated Omnichannel Trip Cards, `hasPlayableCallAudio` Gating, 1-Bar Thread Header & Slim `[SMS | Note]` Composer)
- **Retire Legacy Comms Bloat & Extract Compact Modals (`CommsModals.tsx < 220`L)**:
  - Permanently deletes `CommsCrmContextBanner.tsx`, `CommsRowActionSheet.tsx`, and `CommsBatchActionBar.tsx` (`0` remaining imports across `app/` and `scripts/`).
  - Extracts `AgentPhoneSetupModal` and `NewSmsMessageModal` (`FloatingWindow` `hasBackdrop={false}`) into `app/components/domain/dispatch/comms/CommsModals.tsx` (`< 220`L) with preserved prop contracts and re-exports them from `SoftphoneDialerPane.tsx` and `SmsThreadPane.tsx`.
- **Softphone Bug Fixes (`useTwilioSoftphoneDevice.ts`)**:
  - Removes `creds.apiKeySecret` gating from `handleStartCall` (`if (!activeDevice && softphoneStatus !== 'error') { activeDevice = await ensureWebRtcDevice(); }`) so browser WebRTC initializes cleanly when server-only secrets are stripped from client config.
  - Stops writing `CallSid` (`CA...`) into `recordingSid` on optimistic call items (`callSid` populated instead; `recordingSid` left `undefined` until a real `RE...` recording attaches).
  - Preserves inbound vs. outbound call snippet labels on `handleEndCall` (`i.type === 'call_inbound' ? 'Inbound Call' : 'Outbound Call'`).
- **Pure Omnichannel Timeline & Audio/Email Utilities (`comms-timeline.util.ts < 220`L & `comms-types.ts`)**:
  - Expands `ThreadTab` to `'all' | 'sms' | 'calls' | 'emails' | 'trips' | 'notes'`.
  - Exports `hasPlayableCallAudio(evt)` (`true` strictly on `evt.audioUrl`, valid `RE[0-9a-f]{32}` `recordingSid`, or voicemail with `recordingSid`), `cleanCommsEmailSnippet(raw)` (strips `====` / `----` ASCII divider banners and collapses whitespace), `buildReturnTripDraftPayload(trip, nowMs?)`, and `buildOmnichannelTimelineItems({ events, trips, contactPhone, contactEmail, contactId, threadTab, nowMs })` matching caller `Trip[]` by last-10 phone digits, lowercase email, or `customerId === contactId`, returning `pinnedUpcomingTrip` (soonest active/upcoming non-completed/non-cancelled/non-declined trip, or `null`) and chronological ascending `{ kind: 'event', timestampMs, event } | { kind: 'trip', timestampMs, trip }` items.
- **Clean-Slate Dock Chrome (`CommsHub.tsx < 340`L & `CommsFilterToolbar.tsx < 240`L)**:
  - **Row 1 (`h-10`)**: Dock header (`Phone & SMS`, live WebRTC softphone status pill, `+ New` SMS button, optional popout/close) + compact 4-segment switch `All` | `Calls` | `SMS` | `VM` with unread badges.
  - **Row 2 (`h-9`, list views only — hidden inside open threads)**: `h-7` `/` search input + portaled **`Filter ▾`** (`createPortal(..., document.body)`, `z-[260]`, `rounded-xl shadow-xl ring-1 ring-slate-900/5` with Channel `All/Calls/Voicemail/SMS/Email/Notes`, Contact `All/Passengers/Drivers`, `Unread Only` `<Switch />`, `Mark All Read`, and `Refresh`).
- **Omnichannel Thread v2, Trip Cards, 1-Row Calls & Slim Composer (`SmsThreadPane.tsx < 360`L, `CommsComposerBar.tsx < 240`L, `VoicemailCallLogPane.tsx < 320`L, `SoftphoneDialerPane.tsx < 320`L, `useCommsMessagingAndContacts.ts < 360`L)**:
  - **Thread List View**: ~`52px` rows with initials, Name, `VIP`/`Driver`/`Corp` micro-pill, timestamp, cleaned 1-line preview, unread badge, and quick `[Call]` + `[Client Profile]` buttons.
  - **1-Bar Sticky Thread Header (`h-10`)**: `←` · Name & formatted phone · `VIP`/`Driver`/`Corp`/`Blocked` pill · `[Call]` · `[Book]` (`POPULATE_BOOKING`) · `[Client Profile]` (`OPEN_CLIENT_PROFILE`) · portaled **`Filter ▾`** (`All`, `SMS`, `Calls`, `Email`, `Trips`, `Notes` + `Open in Email Dock` + `Mark Unread`), eliminating duplicate contact bars, horizontal sub-tab strips, and multi-line yellow `Carrier Alert` banners.
  - **Associated Trip Cards**: 1-line pinned active/upcoming ride pill directly below header when `pinnedUpcomingTrip` exists (`#TRIP_ID` · `Time` · `Pickup → Dropoff` · `<DispatchStatusBadge />` · `[Edit]` · `[Map]`) plus interleaved chronological Trip Cards inside the scroll stream (`#TRIP_ID` · `Date/Time` · `$Fare` · `<DispatchStatusBadge />` on Row 1; `Pickup → Dropoff` + `[Edit]` + `[⇄ Return]` on Row 2).
  - **1-Row Call Logs & Clean Email Cards**: ~`36px` call rows gating audio scrubbers strictly behind `hasPlayableCallAudio(evt)` and clean email cards via `cleanCommsEmailSnippet` + `[Open in Email ↗]`.
  - **Slim 1-Row Composer (`CommsComposerBar.tsx`)**: `[SMS | Note]` toggle (auto-defaulting to `Note` when `voiceOnlyMode` is `true` with `"Voice-Only"` badge) + 1-row input + portaled **`Templates ▾`** (interpolated `CANNED_DISPATCH_SMS_TEMPLATES` + `+ Tracking Link` + `+ Pay Link`) + `[Send]`.
- **Verification**: `scripts/test-comms-dock-v2-rebuild-phase73.ts < 360`L plus `npm run typecheck`, `test-comms-multichannel-ui.ts`, Phases 69–73 suites, and `npm run build`.

### Phase 73.B (Wave 6 Phase 8.B): Comms & `Profile` v2.1 Polish (`Profile` Rename, 3-Tab `ClientProfileWindow` + `[Thread]` Jump, Universal `OPEN_TRIP_DETAILS` + `#Cab` / Flight Badges + Inline Quick-Name Save, `All` Tab `Grouped | Stream` Toggle, `Vehicles`/`Layers`-Style Multi-Select `Filter ▾` & Bottom `New SMS` FAB Sheet)
- **`Profile` Button Rename & 3-Tab `ClientProfileWindow` (`Trips` | `Places` | `Contact`) (`DispatchPassengerCrmSection.tsx`, `SmsThreadPane.tsx < 380`L, `SoftphoneDialerPane.tsx`, `ClientProfileHeaderCard.tsx < 120`L, `ClientProfileWindow.tsx < 340`L, `ClientProfileEditTab.tsx < 285`L, `workspace-bus.service.ts`)**:
  - Renames visible `Client Profile` button labels to **`Profile`** across `DispatchPassengerCrmSection.tsx`, `SmsThreadPane.tsx`, and `SoftphoneDialerPane.tsx` while preserving `data-client-profile-label="Client Profile"` on `CommsHub.tsx` and the `'Client Profile'` fallback window title in `ClientProfileWindow.tsx`.
  - Splits `ClientProfileWindow.tsx` (`< 340`L) into 3 tabs (`ClientProfileTab = 'trips' | 'places' | 'contact'`, normalizing legacy `'overview' -> 'trips'` and `'edit' -> 'contact'` via `normalizeClientProfileTab`), rendering `ClientProfileHeaderCard` (`< 120`L) persistently above the 3-tab switch with both `[Call]` and **`[Thread]`** (`OPEN_COMMS_THREAD` + `FOCUS_MODULE: { moduleKey: 'comms' }`).
  - **Tab 1 (`Trips`)**: `ClientUpcomingRidesStrip` + paginated `Recent Trips` (`Load into New Tab`, `⇄ Book Return`, clickable `#TRIP_ID`).
  - **Tab 2 (`Places`)**: `ClientSavedPlacesSection` (`Set Pickup`, `Set Dropoff`, `+ Save Place`).
  - **Tab 3 (`Contact`)**: `ClientProfileEditTab` (`< 285`L, retaining `Home & Work Addresses` and staying cleanly on save with `✓ Contact profile saved` notice).
- **Universal `OPEN_TRIP_DETAILS` Bus, Clickable `#TRIP_ID`, `#Cab` / Flight Delay Badges & Inline Quick-Name Save (`workspace-bus.service.ts`, `useDispatchWorkspaceSync.ts`, `dispatch.tsx < 1,600`L, `comms-templates.service.ts`, `comms-timeline.util.ts < 220`L, `SmsThreadPane.tsx < 380`L)**:
  - Adds `OPEN_TRIP_DETAILS: { tripId: string; initialTab?: 'details' | 'audit' }` to `WorkspaceEventMap`, handled in `useDispatchWorkspaceSync.ts` / `dispatch.tsx` (`handleOpenReviewModal(found, initialTab || 'details')`) and wired via `onOpenTripDetails` into `CommsHub` -> `SmsThreadPane`.
  - Renders clickable `#TRIP_ID` `<button data-open-trip-details={tripId}>` (`text-blue-700 hover:underline cursor-pointer`) on Pinned Active/Upcoming Ride Pills, Interleaved Timeline Trip Cards, and Email Cards (`evt.tripId`), plus compact `#Cab` (`#947` / `#947 staged` / `Unassigned`) and flight telemetry badge (`resolveTripFlightBadge(trip)`) on Pinned Ride Pills and Interleaved Trip Cards.
  - Adds 1-second inline quick-name editing (`data-quick-name-trigger` / `data-quick-name-input`) in the `h-10` thread header calling `getContactService().upsertContact(...)` + `mergeThreadsForContact` on `Enter`.
- **`All` Tab `Grouped | Stream` Toggle, `Vehicles`/`Layers`-Style Multi-Select `Filter ▾` & Bottom `New SMS` FAB Sheet (`CommsHub.tsx < 360`L, `CommsFilterToolbar.tsx < 250`L, `useCommsInteractionSync.ts`, `SmsThreadPane.tsx < 380`L, `CommsModals.tsx < 250`L)**:
  - Adds a 2-way `Grouped | Stream` toggle (`localStorage` `ct_comms_all_view_mode`, default `'grouped'`) in `CommsFilterToolbar.tsx` when `activeTab === 'all'` (`Grouped` renders filtered unified contact rows via `SmsThreadPane` `mode="list"`; `Stream` renders chronological events via `VoicemailCallLogPane` `mode="all"`).
  - Upgrades both list `Filter ▾` (**Channels**: `calls`, `voicemail`, `messages`, `emails`, `notes`; **Contacts**: `passengers`, `drivers`, `corporate`; `Unread Only` switch; `Mark All Read` / `Refresh`) and thread `Filter ▾` (**Timeline Types**: `sms`, `calls`, `emails`, `trips`, `notes`; `Open in Email Dock`; `Mark Unread`) to `MapLayersAndVehiclesToolbar`-style portaled multi-select checkbox menus (`w-3.5 h-3.5 rounded-[4px]` blue check boxes, uppercase header strips with **`All · Clear`**, `bg-blue-50/80 text-blue-700` checked rows, empty `[]` = all).
  - Replaces the top-row `+ New` button in `CommsHub.tsx` with a bottom-right **`New SMS` FAB** (`data-comms-new-sms-fab="true"`, `absolute bottom-3.5 right-3.5 z-30`) on list views and a dock-bottom slide-up **`CommsBottomNewSmsSheet`** (`data-comms-bottom-sms-sheet="true"`, `absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl`, keeping `NewSmsMessageModal` exported) featuring 1-tap Active/Upcoming Ride Passenger chips, contact autocomplete, `Templates`, `+ Tracking` / `+ Pay`, `[Thread]`, and `[Send]`.
- **Verification**: `scripts/test-comms-profile-polish-phase73b.ts < 360`L plus `npm run typecheck`, `test-comms-multichannel-ui.ts`, Phases 69–73B suites, and `npm run build`.

## 74. Phase 74 (Wave 6 Phase 9): Call HUD Simplification, `Messages` Rename, Bottom `Keypad` FAB, Explicit `Trips | Places | Profile` Window & Client Preferred/Excluded Drivers Engine
- **User-Facing `SMS` -> `Messages` / `Message` Rename & `FloatingCallPill` Retirement**:
  - Renames user-facing `SMS` labels to `Messages` / `Message` across `DispatchRightOperationsDock.tsx` (`Phone & Messages`), `CommsHub.tsx` (`Phone & Messages` popout/window header, 4-segment `All | Calls | Messages | VM`, `<span>New Message</span>` on `data-comms-new-sms-fab="true"`), `CommsModals.tsx` (`New Message`), `SmsThreadPane.tsx` (`+ New Message` CTA, `Messages` timeline filter option), `CommsFilterToolbar.tsx` (`Messages` channel filter option), and `CommsComposerBar.tsx` (`Message | Note` toggle + `Message (314) ...` placeholder), while preserving internal `'messages'` / `'sms'` keys.
  - Deletes `app/components/domain/dispatch/FloatingCallPill.tsx`, removes `<FloatingCallPill />` from `app/routes/dispatch.tsx`, and updates `scripts/test-floating-call-pill-and-nonblocking-windows-phase72.ts`.
- **Bottom-Right `Keypad` FAB & Cleaner Comms Top Bar (`CommsHub.tsx < 360`L, `SoftphoneDialerPane.tsx < 260`L)**:
  - Replaces the top-left Keypad button in `CommsHub.tsx` Row 1 with a passive `●` WebRTC status dot (rendering `Phone & Messages` + window controls in Row 1 only when `isPopout || showWindowControls`).
  - Replaces the separate `h-8` `History | Missed | Keypad` sub-bar on `Calls` with a compact `All | Missed` toggle inside `CommsFilterToolbar`'s `leadingSlot` (`activeTab === 'phone'`) and a `← Calls` back button (`onBackToHistory`) at the top of `SoftphoneDialerPane.tsx` when idle.
  - Renders context-aware bottom-right FABs inside `absolute bottom-3.5 right-3.5 z-30` (`showListToolbar && !messaging.isNewMessageModalOpen`): emerald `Keypad` FAB (`data-comms-keypad-fab="true"`) on `phone`/`voicemail`, blue `New Message` FAB (`data-comms-new-sms-fab="true"`) on `messages`, and side-by-side `Keypad` + `New Message` FABs on `all`.
- **Non-Disruptive Calling & Context-Aware `DispatchHeaderCallHud.tsx` (`< 360`L)**:
  - Extends `WorkspaceEventMap` with `START_SOFTPHONE_CALL: { to: string; contactName?: string }`, `OPEN_SOFTPHONE_KEYPAD: Record<string, never>`, and `SOFTPHONE_VIEW_STATE_CHANGED: { activeTab: string; callsSubTab: string }`.
  - Routes `handleStartCall` in `useDispatchTripTriageActions.ts` through `START_SOFTPHONE_CALL` (`useTwilioSoftphoneDevice.ts`), removes forced `setActiveDockTab('phone')` from Map/Queue/`ClientProfileWindow`/`DriverQueueWindow` in `dispatch.tsx`, gates `phone`+`keypad` auto-switching on `isVisible` or `OPEN_SOFTPHONE_KEYPAD`, and broadcasts `SOFTPHONE_VIEW_STATE_CHANGED`.
  - Rebuilds `DispatchHeaderCallHud.tsx` (`< 360`L, 0 duplicate ring interval) across 4 context-aware states (`isKeypadTabVisible = isPhoneDockActive && commsActiveTab === 'phone' && commsCallsSubTab === 'keypad'`): (1) Incoming Call pill + auto-open Flydown (`Answer`, `Decline`, `Book`, `Trips` -> `OPEN_CLIENT_PROFILE` `{ initialTab: 'trips' }`, `Phone Dock`), (2) Outgoing/Connected + `!isPhoneDockActive` pill + auto-open Call in Progress Flydown (`Mute`, `Hold`, `Keypad`, `End Call`, `Book`, `Trips`, `Open Phone Dock`), (3) Outgoing/Connected + `isKeypadTabVisible` hidden completely, and (4) Outgoing/Connected + `!isKeypadTabVisible && isPhoneDockActive` compact `● MM:SS · Caller Name` pill (flydown closed by default, toggleable, with `data-maximize-keypad-btn="true"` returning to `Phone -> Keypad`).
- **Explicit `Trips | Places | Profile` Window, Booking Autocomplete -> `Trips` & Client Preferred/Excluded Drivers Engine (`ClientProfileWindow.tsx < 340`L, `ClientDriverPreferencesCard.tsx < 160`L, `ClientProfileEditTab.tsx < 285`L, `contact.service.ts`, `useDispatchBookingSubmission.ts`, `auto-dispatch-ranking.ts`)**:
  - Makes `ClientProfileWindow.tsx` explicit-only (ignoring `'incoming_call' | 'answered_call' | 'outbound_call'` sources and removing `INCOMING_CALL` / `CALL_INCOMING` / `CALL_ANSWERED` auto-open) and publishes `OPEN_CLIENT_PROFILE` (`{ initialTab: 'trips', source: 'passenger_crm' }`) inside `DispatchPassengerCrmSection.handleApplyCallerCandidate`.
  - Renames the 3rd tab of `ClientProfileWindow` to `Profile` (`'trips' | 'places' | 'profile'`), adds `Contact Info` section + `<ClientDriverPreferencesCard />` (`< 160`L) inside `ClientProfileEditTab.tsx` (`< 285`L), and extends `ContactRecord` with mutually exclusive `preferredDriverIds?: string[]` (`#1..#N` ordered with `↑`/`↓`/`✕`) and `excludedDriverIds?: string[]` (`Do Not Send` rose pills + `✕`).
  - Propagates `clientPreferredDriverIds` & `clientExcludedDriverIds` onto `Trip.metadata` in `useDispatchBookingSubmission.ts` and enforces `'EXCLUDED_BY_CLIENT'` hard exclusion (unless `trip.plannedDriverId === drv.id`) + `preferredDriverRank?: number` (`1`-based, sorted right after `isPlannedDriver`) in `evaluateAutoDispatchCandidates` (`auto-dispatch-ranking.ts`).
- **Verification**: `scripts/test-call-hud-and-driver-prefs-phase74.ts < 360`L plus `npm run typecheck`, Phases 69–74 suites, and `npm run build`.

## 75. Phase 75 (User Phase 76): Zero-Flash Call HUD Keypad Sync, Upgraded Complete Trip Modal, Locked-Height Hero Fare Slot, Platform-Wide Rounding Elimination & Guest-to-User Conversion Loop
- **Zero-Flash Header Call HUD Keypad Sync (`workspace-bus.service.ts`, `CommsHub.tsx`, `DispatchHeaderCallHud.tsx`)**:
  - Caches the latest `SOFTPHONE_VIEW_STATE_CHANGED` payload (`{ activeTab: string; callsSubTab: string } | null`) inside `WorkspaceBusService`, exposing `getLatestSoftphoneViewState()` and `resetSoftphoneViewStateForTests()`.
  - Syncs programmatic `activeTab` transitions in `CommsHub.tsx` (`useEffect(() => { onTabChange?.(activeTab); }, [activeTab])`) so outbound/answered calls switching to `phone` + `keypad` immediately update parent `commsActiveTab` in `dispatch.tsx`.
  - Initializes `DispatchHeaderCallHud.tsx` live state from `getLatestSoftphoneViewState()`, tracks `hasLiveBusState`, and prefers `liveCommsTab` / `liveCallsSubTab` over `propCommsActiveTab` / `propCommsCallsSubTab` whenever `hasLiveBusState` is `true` (falling back to props in stateless SSR tests when `false`), returning `null` on frame 1 with zero initial pill flash when `Phone -> Keypad` is active.
- **Complete Trip Prompt Upgrade (`DispatchCompleteTripModal.tsx < 435`L & `AdminTripsSubpage.tsx`)**:
  - Adds a searchable Completing Driver `<Select searchable />` (`0` raw `<select>`) pre-filled from `assignedDriverId || plannedDriverId || ''` with active `drivers` (`drv.formattedLabel || formatDriverAssignmentLabel(drv)`) + `'unassigned'` (`Unassigned / Partner`), persisting `assignedDriverId` (clearing stale `plannedDriverId`/`plannedDriverLabel` when assigning), updating `metadata.assignedDriverName` & `assignedDriverPhone`, and passing the selected driver's name/cab to `sendTripReceipt`.
  - Adds Completion Date & Time controls (`ModernDatePicker` + `ModernTimePicker`, `data-complete-trip-datetime="true"`) pre-filled to local date (`YYYY-MM-DD`) and 5-minute rounded time (`HH:MM`) with quick `Now` and `Scheduled Dropoff` chips, saving ISO `completedAt` + `payment.paidAt` and formatting `completedAtIso` in `sendTripReceipt` and the status audit reason.
  - Wires `AdminTripsSubpage.tsx` (`onCompleteTrip` across table, exceptions, and slide-over) to open `DispatchCompleteTripModal` instead of bypassing settlement via direct status transition.
- **Landing Page Hero Locked-Height Fare Slot (`app/routes/_index.tsx`)**:
  - Removes `showBreakdown`, the `Price Breakdown ▾` / `Hide Breakdown ▲` toggle, and the itemized breakdown list from `_index.tsx`.
  - Replaces conditional fare preview rendering with an always-mounted `h-[68px] min-h-[68px] max-h-[68px]` slot (`data-hero-fare-slot="true"`) across Idle (`$—`), Calculating (`Calculating optimal route...`), and Quoted (`$XX.XX`) states for `0px` Hero height shift.
- **Platform-Wide `Rounding` Line-Item Elimination (`fare-breakdown.util.ts < 120`L, `rules.ts`, `multi-car.util.ts`, `booking-form.utils.ts`, Renderers & Emails)**:
  - Creates pure `app/core/utils/fare-breakdown.util.ts` (`< 120`L, `0` React/DOM/`node:*` imports) exporting `reconcileBreakdownWithoutRounding(items, targetTotalFare?, fallbackPricing?)` that strips `category === 'rounding'`, `sourceType === 'rounding'`, and `/^rounding$/i` items and folds any rounding/alignment delta silently into `'base'` (`Base Fare`) with penny-exact reconciliation (`<= $0.005`) while keeping Admin `RatesPanel.tsx` rounding controls and `auditTrail` step 6 intact.
  - Folds `roundingAdj` directly into `'base'` in `rules.ts` and reconciles breakdowns across `multi-car.util.ts`, `booking-form.utils.ts`, `PriceBreakdownPanel.tsx`, `email-templates.ts`, `pay-token.util.ts`, `DriverTripManifest.tsx`, and `PersistentFareSimulator.tsx`.
- **Guest-to-User Conversion Loop (`guest-trip-claim.util.ts < 120`L, `GuestAccountActivationCard.tsx < 230`L, Auth Routes & Emails)**:
  - Creates `app/core/utils/guest-trip-claim.util.ts` (`< 120`L) exporting exact-case `parseClaimTripIds` (never `.toUpperCase()`), `buildGuestAccountSignupHref`, and `claimGuestTripsForUser(uid, rawOrIds)` updating `{ customerId: uid, userId: uid }` per `firestore.rules`.
  - Replaces `.toUpperCase()` claiming in `app.register.tsx` & `app.login.tsx`, extends `AdminAuthService.registerWithEmail` with optional `extraProfile?: { phone?; firstName?; lastName? }`, mounts inline `<GuestAccountActivationCard />` (`< 230`L) near the top of `BookingConfirmation.tsx` for guest trips (`!isSignedIn && !trip.customerId && Boolean(trip.id)`), and wires `customerId?: string | null` + `shouldRenderGuestSignupCta` across `renderBookingRequestReceivedEmail`, `renderBookingConfirmedEmail`, `renderStatusUpdateEmail` (non-cancelled/declined), and `renderTripReceiptEmail`.
- **Verification**: `scripts/test-hero-quote-rounding-and-guest-claim-phase75.ts < 350`L plus `test-call-hud-and-driver-prefs-phase74.ts`, `test-pricing-audit-trail.ts`, `npm run typecheck`, and `npm run build`.

## 76. Phase 76 (User Phase 77 — Wave 6 Finale): Dispatch Form Direct `CONFIRMED` Status, Reliable `Email Confirm` Delivery & Client Saved Payment Methods Vault
- **Dispatcher Bookings Never Downgraded to `UNCONFIRMED` (`useDispatchBookingSubmission.ts` & `firebase-booking.service.ts`)**:
  - Sets `status: 'CONFIRMED'` on all dispatcher-created trip payloads (`carPayload`, multi-car `sibPayload`, linked `returnPayload`, and recurring `occCreated`).
  - Updates `FirebaseBookingService.createBooking` to detect `isStaffCreated = meta.createdByRole === 'dispatcher' || meta.createdByRole === 'admin'`: continues enforcing `BLACKLIST_BLOCK` security checks so blacklisted riders/locations remain blocked, while never downgrading `initialStatus` to `'UNCONFIRMED'` on `evaluation.mode === 'REQUIRE_REVIEW'` when `isStaffCreated` is `true` (or `payload.status === 'CONFIRMED'`), recording `initialHistoryEntry.actorRole = bookedByRole`, `initialHistoryEntry.reason = 'Booked & confirmed directly via Dispatch Console'`, and `auditEvent.action = 'AUTO_CONFIRMED'`.
- **Reliable `Email Confirm` Recipient Resolution, `await`ed Delivery & Dispatcher Feedback (`useDispatchBookingSubmission.ts`, `DispatchBookingFooterBar.tsx`, `dispatch.tsx`)**:
  - Exports pure `resolveDispatchConfirmationRecipient({ email, isBookerDifferent, contactEmail, phone, lookupTrips })` resolving `email.trim()` -> `isBookerDifferent ? contactEmail.trim() : ''` -> `getContactService().getContactByPhone(phone)?.email?.trim()` -> latest matching non-empty `t.passenger?.email` from `lookupTrips` by normalized phone (`source: 'passenger' | 'booker' | 'crm_contact' | 'trip_history' | 'none'`).
  - Backfills `passengerEmail` onto `carPayload.passenger.email` and `returnPayload.passenger.email` when the form `email` input was left blank so guest trip claiming and future receipts inherit the client's known email.
  - When `sendEmailConfirmation` is `true`: `await`s `getEmailDispatchService().sendBookingConfirmation(...)` before form reset (passing `customerId`, `recipientEmailOverride` when `source === 'booker'`, `contactPerson`, `oversizedItemsSummary`, `customExtrasSummary`), inspects `EmailDispatchResult.success`, and surfaces explicit dispatcher toast feedback (`"Confirmation emailed to <email>"`, an explicit warning/error toast showing `res.error` when `!res.success`, or `"Trip confirmed — no email on file to send confirmation"` when `source === 'none'`).
  - Adds `hasResolvedRecipientEmail?: boolean` to `DispatchBookingFooterBar.tsx` and displays an amber `(no email)` indicator inside the `Email Confirm` label when checked without a resolved recipient email.
- **PCI-Safe Client Saved Payment Methods Vault (`contact.service.ts`, `saved-cards.server.ts`, `api.payments.ts`, `pay-token.util.ts`, `api.pay.ts`, `pay.$payToken.tsx`, `ClientSavedCardsCard.tsx`, `ClientProfileEditTab.tsx`, `DispatchPaymentAssignmentSection.tsx`, `DispatchCompleteTripModal.tsx`)**:
  - Defines `ClientSavedPaymentMethod` (`id`, `brand`, `last4`, `expMonth`, `expYear`, `cardholderName?`, `isDefault?`, `mode: 'stripe_pm' | 'reference_only'`, `stripeCustomerId?`, `addedAt`) — strictly tokenized `pm_...` or `ref_...` + last4/brand/expiry, zero raw PAN or CVC — and extends `ContactRecord` with `stripeCustomerId?: string` and `savedPaymentMethods?: ClientSavedPaymentMethod[]`.
  - Adds `ContactService` methods `upsertSavedPaymentMethod`, `removeSavedPaymentMethod`, `setDefaultSavedPaymentMethod`, and non-blocking Firestore `/contacts/{contactId}` persistence (`setDoc(..., { merge: true })` + `syncContactsFromFirestore()` when Firebase is configured and authenticated staff is active, falling back cleanly to `localStorage` + `WorkspaceBus`).
  - Creates server-isolated `app/core/services/payments/saved-cards.server.ts` (`0.00 kB` client bundle) wired into `/api/payments` (`create_setup_intent`, `list_saved_methods`, `charge_saved_method`, plus `saveCardForFuture` + `stripeCustomerId` on `create_intent`) and extends `pay-token.util.ts`, `pay-link.server.ts`, `pay-link.service.ts`, and `pay.$payToken.tsx` to support `targetType: 'card_setup'` so clients can save a card securely via `/pay/:payToken` without an immediate ride charge.
  - Builds `ClientSavedCardsCard.tsx` (`< 210`L) mounted inside `ClientProfileEditTab.tsx` (`< 285`L), upgrades `DispatchPaymentAssignmentSection.tsx` (`data-dispatch-saved-card-select="true"` searchable `<Select />` pre-selecting `isDefault` + `+ New Card Reference` with `Save reference to client profile`), and adds a `Charge Saved Card` toggle/action inside `DispatchCompleteTripModal.tsx` (`< 435`L) calling `charge_saved_method` when a `stripe_pm` method exists.
- **Verification**: `scripts/test-dispatch-confirm-email-and-saved-cards-phase76.ts < 350`L plus Phases 74–75 suites, `npm run typecheck`, and `npm run build` (`0.00 kB` API chunks).
