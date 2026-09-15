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
- **Temporal Shift Mapping (/vehicleAssignments)**:
  - Record a shift session (driverId, ehicleId, ehicleNumber, startedAt, endedAt, status) when a driver toggles ON-DUTY or selects a vehicle.
  - Temporal query helpers for looking up driver/vehicle combinations at historical timestamps.
- **Immutable Trip Snapshots & Comprehensive Audit Trail**:
  - Freeze vehicle metadata on assignment (ssignedVehicle) to prevent historical confusion.
  - uditLog event array on every trip for capturing timestamped actions, actor IDs, rules matched, and context.
- **Dual Scoring System (Customer & Driver)**:
  - Customer Score (0-100): tracks cancellation rates, no-shows, ratings.
  - Driver Score (0-100): tracks acceptance %, on-time rate, completion ratio, rider ratings.
- **Conditional Booking Lifecycle Engine**:
  - Evaluates rules against Customer Score, Driver Score threshold, etc.
  - Mode A (AUTO_CONFIRM), Mode B (REQUIRE_REVIEW), Mode C (BLACKLIST_BLOCK).
- **Universal Archive, Blacklist & Admin Governance UI**:
  - Status fields (isArchived, isBlacklisted, lacklistReason) across core entities.
  - Governance UI for Conditional Booking Policies, Geo-Fence exclusion, and Score thresholds in /admin?tab=dispatch&sub=rules.
