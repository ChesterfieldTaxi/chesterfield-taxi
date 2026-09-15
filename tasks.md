# Sequential Execution Tasks

## Phase 1: Initialization
- [x] Initialize Vite project configured with React Router v7 (Framework Mode).
- [x] Install and configure Tailwind CSS v4.

## Phase 2: Scaffolding App Structure
- [x] Scaffold `app/config/` (for UI, field schemas, and pricing configs).
- [x] Scaffold `app/core/types/` (TypeScript interfaces, Domain Models).
- [x] Scaffold `app/core/services/` (Business logic, IBookingService, Firebase integrations).
- [x] Scaffold `app/components/ui/` (Reusable, presentational components).
- [x] Scaffold `app/components/domain/` (Business-aware components).

## Phase 3: Core Interfaces & Configuration
- [x] Define the `Universal Field Schema` interface in `app/core/types/`.
- [x] Define the `IBookingService` interface in `app/core/services/`.
- [x] Create the foundational JSON configs in `app/config/` for the booking form steps.

## Phase 4: State Machine & Data Models
- [x] Define the `Trip` type and its Firestore state machine constraints (`pending` -> `offered` -> `assigned` -> `completed`).
- [x] Define the targeting arrays structure specifically for `offeredToIds`.

## Phase 5: Logic Implementation
- [x] Implement the `Prioritized Pricing Pipeline` relying strictly on pure functions.
- [x] Set up Server-side Google Maps routing function utilities.

## Phase 6: External Integrations
- [x] Set up Firebase (Firestore/Auth) logic to implement the `IBookingService`.
- [x] Integrate Resend for transactional email dispatch.

## Phase 7: UI Assembly
- [x] Build and wire up the Multi-step config-driven booking form using the `app/config/` files.

## Phase 8: Deployment
- [x] Deploy the Phase 1 web application to Vercel and verify environment variables.

## Phase 9: Admin Configuration Panel & Dynamic Firestore Sync
- [x] 9.1 Define AppSettings Firestore schema & IAdminConfigService interfaces in `app/core/types/config.ts`.
- [x] 9.2 Implement `AdminConfigService` in `app/core/services/config/admin-config.service.ts` with Firestore `config/appSettings` sync and fallback.
- [x] 9.3 Refactor `getBookingService()` and `calculateQuote()` to dynamically hydrate pricing and vehicle multipliers from Firestore.
- [x] 9.4 Set up Firebase Auth route guards and tab navigation in `/admin` layout (`app/routes/admin.tsx`).
- [x] 9.5 Build Tab 1: General & Branding settings (Company contact info, hex color pickers, logo).
- [x] 9.6 Build Tab 2: Pricing & Rules controls (Base fare, per-mile rates, surge multiplier override).
- [x] 9.7 Build Tab 3: Fleet Management (Add, update, or remove vehicle specs and multipliers).
- [x] 9.8 Build Tab 4: Live Bookings monitor (Real-time Firestore trips stream and status transition actions).
- [x] 9.9 Implement `/admin/login` route (`app/routes/admin.login.tsx`) with Firebase Auth password authentication.
- [x] 9.10 Register admin routes in `app/routes.ts` and verify build with zero typecheck errors.

## Phase 10: Multi-Page Architecture & Site Navigation
- [x] 10.1 Add navigation SVG icons (`MenuIcon`, `XIcon`) to `app/components/ui/Icons.tsx`.
- [x] 10.2 Create persistent navigation component `app/components/layout/Navbar.tsx` with desktop & mobile drawer menu, dynamic admin link, and Book Now CTA.
- [x] 10.3 Create persistent footer component `app/components/layout/Footer.tsx` with contact info, service coverage directory, and quick links.
- [x] 10.4 Create public layout wrapper `app/routes/layout.tsx` to host universal navigation for all public routes.
- [x] 10.5 Implement Home landing page `app/routes/_index.tsx` with hero, value propositions, rate estimation CTA, and service spotlights.
- [x] 10.6 Implement dedicated booking route `app/routes/book.tsx` hosting the full interactive booking wizard.
- [x] 10.7 Implement Services page `app/routes/services.tsx`, About Us page `app/routes/about.tsx`, and Contact page `app/routes/contact.tsx`.
- [x] 10.8 Update `app/routes.ts` route definitions, remove obsolete `home.tsx`, and verify `npm run typecheck` and `npm run build`.

## Phase 11: Booking Wizard Enhancements & Airport Operations Logic
- [x] 11.1 Create `app/core/config/airports.ts` defining regional airport hubs (STL, SUS, CPS), major commercial airlines, vehicle luggage limits, and address detection helper.
- [x] 11.2 Add airport and aviation icons (`PlaneLandingIcon`, `PlaneTakeoffIcon`) to `app/components/ui/Icons.tsx`.
- [x] 11.3 Update Step 4 schema in `app/config/formConfig.ts` with airport operational fields (`airlineCode`, `flightNumber` validated to 1-4 digits, `departureAirport`, `hasCheckedLuggage`) with dynamic visibility DSL.
- [x] 11.4 Create `AirportDetectedBanner.tsx` and `LuggageCapacityWarning.tsx` domain components in `app/components/domain/`.
- [x] 11.5 Integrate airport auto-detection, dynamic field synchronization, luggage capacity warning banner, and flight metadata formatting into `app/components/domain/BookingForm.tsx`.
- [x] 11.6 Run `npm run typecheck` and `npm run build` to confirm zero TypeScript or bundling errors, and update documentation.

## Phase 12: Brand & Content Centralization Refactor
- [x] 12.1 Update specifications and task tracking (`spec.md`, `tasks.md`).
- [x] 12.2 Create `app/config/companyConfig.ts` with centralized brand constants and re-export in `app/config/index.ts`.
- [x] 12.3 Refactor `app/components/layout/Navbar.tsx` to pull phone number and brand metadata from `COMPANY_CONFIG`.
- [x] 12.4 Refactor `app/components/layout/Footer.tsx` to pull phone number, emails, service areas, and brand text from `COMPANY_CONFIG`.
- [x] 12.5 Refactor `app/components/domain/BookingConfirmation.tsx` to pull dispatch contact details from `COMPANY_CONFIG` and uppercase airport origin codes.
- [x] 12.6 Refactor public route pages (`app/routes/contact.tsx`, `app/routes/about.tsx`, `app/routes/_index.tsx`, `app/routes/services.tsx`, and `app/routes/book.tsx`) to reference `COMPANY_CONFIG`.
- [x] 12.7 Implement airport origin code auto-uppercasing in `app/components/domain/BookingForm.tsx` (`.toUpperCase()`).
- [x] 12.8 Update admin config fallback defaults in `app/core/services/config/admin-config.service.ts` and placeholders in `AdminGeneralTab.tsx`.
- [x] 12.9 Verify TypeScript typechecking and clean production build (`npm run typecheck`, `npm run build`).

## Phase 13: Live Resend Email Integration & Transactional Workflows
- [x] 13.1 Update specifications and task tracking (`spec.md`, `tasks.md`).
- [x] 13.2 Refactor & enhance `types.ts` in `app/core/services/email/` to support status update emails, flight metadata, and email dispatch status tracking.
- [x] 13.3 Design responsive, mobile-optimized transactional HTML email templates (`app/core/services/email/email-templates.ts`) with inline CSS, brand header/footer, and company contact details.
- [x] 13.4 Implement resilient `ResendEmailService` in `app/core/services/email/resend-email.service.ts` with API key detection, Resend REST/SDK dispatch, server-side API bridge, and graceful stub fallback.
- [x] 13.5 Create server resource route `app/routes/api.send-email.ts` and register in `app/routes.ts` to securely handle Resend email dispatch on serverless/SSR.
- [x] 13.6 Integrate email dispatch trigger in `BookingForm.tsx` upon trip creation, update `BookingConfirmation.tsx` with live email delivery status indicator, and wire status update notification in admin console (`AdminBookingsTab.tsx`).
- [x] 13.7 Verify with `npm run typecheck` and `npm run build`, ensuring zero TypeScript errors and clean SSR/client production bundles.

## Phase 14: Google Maps API & Distance Matrix Integration
- [x] 14.1 Update specifications (`spec.md` Section 10) and task tracking (`tasks.md`).
- [x] 14.2 Implement Google Maps API loader (`app/core/services/maps/google-maps-loader.ts`) with `VITE_GOOGLE_MAPS_API_KEY`, status tracking, and St. Louis metro bounding.
- [x] 14.3 Integrate Google Places Autocomplete in `LocationAutocomplete.tsx` with St. Louis regional biasing and clean fallback mode.
- [x] 14.4 Add Intermediate Stop support to Step 1 schema (`formConfig.ts`), data models (`trip.ts`, `booking-service.ts`), and booking form wizard.
- [x] 14.5 Implement live Directions & Distance Matrix calculation (`live-routing.service.ts` and `server-route.service.ts`), feeding real miles & minutes into the pricing engine.
- [x] 14.6 Verify with `npm run typecheck` and `npm run build`, and confirm clean SSR/client production bundling.

## Phase 15: Master Booking Engine Architecture & Single-Page UI Overhaul
- [x] 15.1 Update specifications (`spec.md` Section 11) and task tracking (`tasks.md`).
- [x] 15.2 Create centralized form configuration engine `app/config/roleFormConfig.ts` with role-based schemas (`customer`, `dispatcher`, `admin`), section ordering, capability flags, and Firestore fallback logic.
- [x] 15.3 Add supporting SVG icons (`SearchIcon`, `RepeatIcon`, `DollarSignIcon`, `SlidersIcon`, `InfoIcon`) to `app/components/ui/Icons.tsx`.
- [x] 15.4 Implement Passenger Lookup Service & React Hook (`app/core/services/booking/passenger-lookup.service.ts` & `app/core/hooks/usePassengerLookup.ts`) for phone/email auto-population.
- [x] 15.5 Build core master `<BookingEngine />` component (`app/components/domain/BookingEngine.tsx`) supporting customer, dispatcher, and admin modes.
- [x] 15.6 Implement Recurring Trip Generator UI (daily/weekly/custom batches with shared `recurringGroupId`) and Manual Price & Payment Overrides inside `<BookingEngine />`.
- [x] 15.7 Refactor Single-Page Customer Booking Portal (`app/routes/book.tsx`) with vertical card sections, Sticky Bottom Summary Footer with live fare updates, and interactive Contextual Help & Fare Breakdown Panel (`onFocus`).
- [x] 15.8 Wire Dispatcher Booking mode into Admin Console (`AdminBookingsTab.tsx`), verify `npm run typecheck` and `npm run build` with zero errors, and complete task checklist.

## Phase 16: Dispatcher & Admin Console (RBAC, Live Map, and Advanced Trip Management)
- [x] 16.1 Update spec.md with Section 12 (Phase 16: Dispatcher & Admin Console Specification).
- [x] 16.2 Update tasks.md to track Phase 16 sub-tasks and deliverables.
- [x] 16.3 Verify Auth context handles 'customer', 'dispatcher', and 'admin' roles properly in `admin-auth.service.ts`.
- [x] 16.4 Secure `/dispatch` (accessible to dispatchers & admins) and `/admin` (accessible exclusively to admins).
- [x] 16.5 Ensure unauthorized or unauthenticated users are gracefully redirected to `/admin/login` with contextual feedback.
- [x] 16.6 Enhance Live Trips Table with real-time Firestore listeners, status filters, vehicle/driver assignment modals, and manual status overrides.
- [x] 16.7 Integrate `<BookingEngine mode="dispatcher" />` featuring CRM lookup, manual overrides, payment bypass, and Recurring Trip Generator UI.
- [x] 16.8 Wire up site-wide dynamic branding variables so saved colors from Admin Settings update CSS variables across the booking portal.
- [x] 16.9 Run `npm run typecheck` to confirm zero TypeScript compilation errors.
- [x] 16.10 Run `npm run build` to confirm clean SSR and client production bundles.
- [x] 16.11 Execute Phase 16 Dual-View Architecture (Executive Admin Dashboard vs. Tactical Dispatch Console).

## Phase 17: Multi-Stop Routing, Dynamic Branding CSS Injection, & Advanced Pricing Rules
- [x] 17.1 Update `spec.md` with Section 13 and `tasks.md` with Phase 17 sub-tasks.
- [x] 17.2 Implement dynamic waypoint multi-stop UI (add up to 5 stops, address autocomplete, notes, move up, move down, and remove) in Customer Booking V2 (`BookingEngineV2.tsx`).
- [x] 17.3 Implement dynamic waypoint multi-stop UI (add up to 5 stops, address autocomplete, notes, move up, move down, and remove) in Single-Page V1 / Dispatcher Engine (`BookingEngine.tsx`).
- [x] 17.4 Integrate intermediate stops in Google Maps routing service and calculate accurate cumulative distance and duration across all intermediate waypoints.
- [x] 17.5 Define brand colors (`primaryColor`, `secondaryColor`) in `companyConfig.ts` and declare `--color-primary`, `--color-secondary`, `--brand-primary`, `--brand-secondary` root CSS variables in `app.css`.
- [x] 17.6 Inject dynamic CSS variables into `root.tsx` (SSR initial `<html style="...">`), `layout.tsx` (client-side dynamic updates), and `AdminGeneralTab.tsx` (live branding preview).
- [x] 17.7 Update UI components (`Button.tsx`, badges, highlights) to consume dynamic CSS variables with fallbacks.
- [x] 17.8 Implement advanced pricing pipeline rules (`rules.ts`, `pipeline.ts`): vehicle base tiers, mileage brackets, intermediate stop surcharges ($5/stop default), and highway tolls.
- [x] 17.9 Update Admin Pricing configuration (`AdminPricingTab.tsx`, `admin-config.service.ts`, `types/config.ts`) with `multiStopFee` and `defaultTolls` controls.
- [x] 17.10 Implement Dispatcher Price Overrides in `BookingEngine.tsx` with fee waivers (`waiveMultiStopFees`, `waiveAirportFee`), surge bypass (`bypassSurge`), custom tolls, and courtesy discounts.
- [x] 17.11 Add itemized fare breakdown lines for multi-stop surcharges, tolls, peak demand surge, airport fee, and courtesy discounts across both booking engines.
- [x] 17.12 Run `npm run typecheck` to confirm complete TypeScript compilation with zero errors.
- [x] 17.13 Run `npm run build` to confirm production SSR and client bundles compile cleanly.

## Phase 18: Admin Console Navigation & Management Restructure
- [x] 18.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md with Phase 18 specifications, schemas, and task tracking.
- [x] 18.2 Define Firestore schemas and TypeScript models for `/fleet` (`PhysicalFleetAsset`) and `/zones` (`ZoneGeofence`).
- [x] 18.3 Implement `FleetService` (`app/core/services/fleet/fleet.service.ts`) with Firestore `/fleet` collection CRUD, real-time listeners, and resilient offline fallback.
- [x] 18.4 Implement `ZoneService` (`app/core/services/zones/zone.service.ts`) with Firestore `/zones` collection CRUD, regional St. Louis presets, and offline fallback.
- [x] 18.5 Update `AdminAuthService` and `/users` data model to support RBAC roles (`driver`, `dispatcher`, `admin`, `customer`) and operational metadata.
- [x] 18.6 Refactor `/admin` layout (`app/routes/admin.tsx`) with 8 clean dedicated views/elements, sub-navigation routing, and prominent header Dispatch CTA button.
- [x] 18.7 Update `AdminDashboardTab.tsx` with KPI summary cards, revenue charts, active trip volume visualizer, and unassigned booking alert banner.
- [x] 18.8 Update `AdminGeneralTab.tsx` with full company profile, localization parameters (timezone, currency, date formatting), 24/7 operating hours, and live dynamic branding preview.
- [x] 18.9 Create `AdminRatesTab.tsx` with active dynamic pricing parameters + Phase 19 Named Pricing Rules and Step Increment Tables shells.
- [x] 18.10 Restructure `AdminVehiclesTab.tsx` with dual split sub-navigation: Section 1 (Vehicle Types) and Section 2 (Physical Fleet Asset Manager wired to `/fleet`).
- [x] 18.11 Create `AdminZonesTab.tsx` geofence map manager with interactive polygon/radius drawing tools, zone list drawer, and `/zones` Firestore sync.
- [x] 18.12 Create `AdminOperatorsTab.tsx` wired directly to `/users` with filtering for 'driver', 'dispatcher', and 'admin' roles, contact details, and status toggles.
- [x] 18.13 Create `AdminAdvancedTab.tsx` with sensitive system configurations, API key health monitors, Firestore rule parameters, and audit logging table.
- [x] 18.14 Run `npm run typecheck` to confirm 0 TypeScript compilation errors.
- [x] 18.15 Run `npm run build` to confirm production client and SSR build stability.
- [x] 18.16 Mark Phase 18 complete in tasks.md upon verification.

## Phase 19: Condition-Based Pricing Matrix & Dynamic Branding Studio
- [x] 19.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to reflect Phase 19 scope (Named Pricing Rules, Step Increments, Condition Surcharges, Dynamic Branding Studio).
- [x] 19.2 Define Firestore data models & types for `/pricingRules` (`NamedPricingRule`), Step Increments (`StepIncrementTier`), Delay Rates, Condition Surcharges, and expanded `BrandingConfig`.
- [x] 19.3 Update `companyConfig.ts` and `admin-config.service.ts` with expanded Branding tokens and default Pricing Rule parameters.
- [x] 19.4 Implement `PricingRulesService` (`app/core/services/pricing/pricing-rules.service.ts`) with `/pricingRules` Firestore CRUD, default regional seeded rules, and pure multi-condition evaluation logic.
- [x] 19.5 Extend Pure Functional Pricing Engine (`rules.ts` & `pipeline.ts`) to support Flag Drop initial distance, decaying bracket step increments, wait-time delay rates, condition surcharges (car seats & extra passengers), and named rules evaluation.
- [x] 19.6 Update Admin Rates Tab (`AdminRatesTab.tsx`) with 4 dedicated sub-tabs: Base Rates & Simulator, Named Pricing Rules Firestore manager, Step Increments & Brackets editor, and Condition Surcharges & Equipment.
- [x] 19.7 Update Dispatcher draft tabs (`DispatchBookingEngine.tsx`) with dynamic Named Rule Selector and flat fare overrides.
- [x] 19.8 Implement Driver App Console / Quick Action Interface in `dispatch.tsx` supporting driver-permitted named rules and manual flat fare overrides.
- [x] 19.9 Build Dynamic Branding Studio in Admin General Tab (`AdminGeneralTab.tsx`) with side-by-side controls, isolated live preview canvas, and decoupled "Publish Changes to Site-Wide".
- [x] 19.10 Universal Root CSS Variable Injection across `root.tsx`, `layout.tsx`, `admin.tsx`, and `app.css`.
- [x] 19.11 Run `npm run typecheck` to verify 0 TypeScript compiler errors.
- [x] 19.12 Run `npm run build` to verify clean SSR and client production builds.
- [x] 19.13 Mark Phase 19 complete in tasks.md upon verification.

## Phase 20: Advanced Condition Rules Engine, Rule Inheritance & Geographic Entity Manager
- [x] 20.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to reflect Phase 20 scope (Zone Groups, Named Location Collections, Rule Inheritance Cascades, Visual IF/THEN Pricing Rule Builder, Incremental Step Rate Engines).
- [x] 20.2 Define Firestore data models & types for `/zoneGroups` (`ZoneGroup`), `/locationCollections` (`LocationCollection`, `LocationPoint`), and extended `/pricingRules` (`parentRuleId`, `stopProcessingOnMatch`, triggers, delta overrides).
- [x] 20.3 Update `ZoneService` (`app/core/services/zones/zone.service.ts`) with `/zoneGroups` and `/locationCollections` Firestore CRUD, regional seed presets, and spatial containment functions.
- [x] 20.4 Enhance Geofence Manager in `AdminZonesTab.tsx` with dedicated sub-tabs for Zones, Zone Groups, and Location Collections with interactive map visualizer badges.
- [x] 20.5 Implement Rule Inheritance Resolver with recursive parent/child lookup and cycle detection in `PricingRulesService` (`app/core/services/pricing/pricing-rules.service.ts`).
- [x] 20.6 Enhance `evaluateApplicablePricingRules` to support Zone Groups, Location Collections, account tags, duration limits, equipment/passenger counts, and `stopProcessingOnMatch`.
- [x] 20.7 Refactor Named Rules sub-tab in `AdminRatesTab.tsx` into a drag-and-drop prioritized list with visual priority ranking controls.
- [x] 20.8 Build Visual IF/THEN Condition Rule Builder Drawer in `AdminRatesTab.tsx` with declarative trigger blocks, parent inheritance selectors, delta overrides, and execution controls.
- [x] 20.9 Extend Granular Step-Increment Fare Calculation Engine in `rules.ts` & `pipeline.ts` with decaying distance brackets and delay time step increments.
- [x] 20.10 Update Live Fare Matrix Simulator in `AdminRatesTab.tsx` with expanded inputs and audit trail trace showing rule inheritance cascades and step calculation breakdowns.
- [x] 20.11 Run `npm run typecheck` to confirm 0 TypeScript compilation errors.
- [x] 20.12 Run `npm run build` to confirm production build stability and mark Phase 20 complete in tasks.md.
- [x] 20.13 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to reflect open-ended step increments ("And Above / After"), inherited parent delta overrides, conflict warnings, and inline simulator test triggers.
- [x] 20.14 Open-Ended Step Increments ("And Above / After"): Add checkbox in embedded Step Increment editor, display open-ended bounds, and process remaining distance/time in `rules.ts`.
- [x] 20.15 Rule Editor UI & Inheritance Overrides: Render parent values in disabled state with individual "Override" toggles for Base Drop, Step Tiers, and Surcharges.
- [x] 20.16 Drawer Usability Enhancements: Add "Test Rule in Simulator" auto-fill action button and lightweight Priority Collision Detection warning.
- [x] 20.17 Universal Surcharges & Zone Pair Corridors: Consolidate Universal Surcharges dedicated sub-tab and support Origin Zone -> Destination Zone corridor flat fare overrides.
- [x] 20.18 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` to confirm 0 compilation errors.
## Phase 20.B: API Cost Optimization Protocol for Google Maps & Directions Services
- [x] 20.B.1 Documentation & Specification updates for API Cost Optimization Protocol.
- [x] 20.B.2 Developer & Offline Mock Mode in `companyConfig.ts` (`enableRealtimeRouting: false`).
- [x] 20.B.3 Client-Side Route Caching Module (`RouteCache` in `app/core/services/maps/route-cache.ts` using sessionStorage/memory fallback, keyed by `originPlaceId_destPlaceId_waypoints`).
- [x] 20.B.4 Pure Local Mock Routing Engine (`mock-routing.ts`) with Haversine distance Ã— 1.25x road curvature factor, duration estimation, and straight-line polyline encoder.
- [x] 20.B.5 Debounce & Trigger Guarding Hook/Helpers (`useDebounceRoute.ts`) enforcing 800ms quiet period and requiring valid Google `place_id`s or explicit Lat/Lng coordinates.
- [x] 20.B.6 Integrate cost optimization and offline mock mode into `live-routing.service.ts` and `server-route.service.ts`.
- [x] 20.B.7 Update booking engines (`BookingEngineV2.tsx`, `BookingEngine.tsx`, `DispatchBookingEngine.tsx`) with 800ms debounce and trigger guards.
- [x] 20.B.8 Update Tactical Dispatch Map in `dispatch.tsx` with 800ms debounce, trigger guards, and offline mock polyline rendering.
- [x] 20.B.9 Run `npm run typecheck` to confirm 0 TypeScript compilation errors.
- [x] 20.B.10 Run `npm run build` to confirm production build stability.

## Phase 21: Public Booking Engine Overhaul & Dispatcher Confirmation Workflow
- [x] 21.1 Documentation Updates: Update `spec.md`, `plan.md`, and `tasks.md` to define Phase 21 scope (Customer Booking Engine alignment with Phase 20 Pricing Engine, UNCONFIRMED trip status lifecycle, and Dispatcher Accept/Decline Email Workflows).
- [x] 21.2 Core Data Models & State Machine: Expand `TripStatus` in `app/core/types/trip.ts` with `'UNCONFIRMED'`, `'CONFIRMED'`, `'DECLINED'` and configure allowed transitions in `TRIP_STATE_TRANSITIONS`.
- [x] 21.3 Pricing Engine Configuration Bridge: Update `toPricingConfig` in `admin-config.service.ts` to map step increments, condition surcharges, delay rate, and named pricing rules.
- [x] 21.4 Spatial Entity Evaluation in Booking Services: Update `calculateQuote` in `firebase-booking.service.ts` and `mock-booking.service.ts` to match pickup/dropoff against zones, zone groups, and location collections.
- [x] 21.5 Public Booking Engine & Equipment UI: Connect `BookingEngineV2.tsx` to Phase 20 pricing pipeline, add infant/toddler/booster car seat selectors and luggage options, and force customer submissions to save with `status: 'UNCONFIRMED'`.
- [x] 21.6 Customer Booking Status Enforcement: Update `BookingEngine.tsx`, `firebase-booking.service.ts`, and `mock-booking.service.ts` to enforce `status: 'UNCONFIRMED'` for public customer submissions.
- [x] 21.7 Transactional Decline Email System: Add `BookingDeclinedEmailPayload`, `renderBookingDeclinedEmail`, `sendBookingDeclined`, and `/api/send-email` routing in email services.
- [x] 21.8 Dispatcher Review & Confirmation Workflow (`/dispatch`): Add interactive "Unconfirmed" filter pill/badge with pulsing alert animation, queue table row highlighting, and Dispatcher Review Action Modal (Accept & Decline workflows).

## Phase 21.B: Customer Booking Engine Redesign (Dispatch-Aligned UI & Restrictions)
- [x] 21.B.1 Redesign layout of `BookingEngineV2.tsx` to match the compact, professional card language of `DispatchBookingEngine.tsx` with slate-50 backdrop and rounded-xl bordered cards.
- [x] 21.B.2 Implement dispatch-style Timing Selector (segmented toggle between Now (ASAP) and Later (Scheduled) with side-by-side date/time pickers).
- [x] 21.B.3 Implement Route & Stops container with Route Swap button (`â†•`), `DispatchLocationInput` autocomplete, up to 5 intermediate stops with reordering, and live route stats.
- [x] 21.B.4 Implement Airport Transfer Assistance card for STL Lambert & SUS Spirit with flight details, checked baggage tracking, and curbside pickup terminal guidance.
- [x] 21.B.5 Implement Passenger & Booker drawer with primary passenger fields, `+ Add Passenger`, and expandable Booker/Contact Person details with role selector.
- [x] 21.B.6 Implement Trip Details with Pax & Bags steppers, Luggage classification, and 3-tier Child Safety Seat steppers (Rear-Facing, Front-Facing, Booster) enforcing Missouri child passenger safety law and company caps.
- [x] 21.B.7 Enforce Customer Restrictions: No manual fare override, no driver/company assignment, customer vehicle capacity locks (e.g. Sedan locked for >4 pax or >3 bags), 30-minute advance scheduling guard, and mandatory `UNCONFIRMED` trip status.
- [x] 21.B.8 Implement Return Trip (Round Trip) with pre-filled return leg, return schedule pickers, return equipment steppers, and combined round-trip fare calculation.
- [x] 21.B.9 Implement Payment Method selector (Cash in Cab, Credit Card with contactless in-cab terminal vs card on file, and Corporate Account direct billing).
- [x] 21.B.10 Build Right-Hand Sticky Summary Card with itemized price breakdown, Zero Surge Pricing Guarantee badge, 24/7 Dispatch Review notice, and direct dispatch hotline.
- [x] 21.B.11 Run `npm run typecheck` and `npm run build` to verify 0 errors.

## Phase 22: TaxiCaller-Style Unified Tariff Engine
- [x] 22.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to replace fragmented base rate forms with self-contained Tariff Profiles.
- [x] 22.2 Data Models & Tariff Service: Define `TariffProfile`, `TariffCorridor`, `TariffTaximeterRate`, `TariffExtras`, and create `TariffService` with default presets.
- [x] 22.3 Pure Pricing Pipeline Update: Implement unified tariff evaluation (Profile Match âž” Flat Corridor Check âž” Taximeter Step Brackets âž” Extras & Surcharges).
- [x] 22.4 TaxiCaller-Style UI in `/admin` Rates: Build tabbed tariff profile switcher, meta & triggers, flat corridor table, iconic taximeter block, and extras manager.
- [x] 22.5 Live Simulator & Audit Trace: Connect the Estimates & Live Simulator to display matched tariff profile badges, corridor/taximeter route, and full audit logs.
- [x] 22.6 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` to confirm 0 compilation errors.

## Phase 22.B: Tariff Engine Refinements (Intermediate Increments, Inheritance, Groups & UI Cleanliness)
- [x] 22.B.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to define Phase 22.B scope.
- [x] 22.B.2 Data Models & Engine: Add `TariffDistanceIncrement`, `TariffGroup`, and `TariffInheritanceConfig` to `tariff.ts` and `tariff.service.ts`.
- [x] 22.B.3 Intermediate Increments & Inheritance Pipeline: Update `evaluateTaximeterFare` and `applyUnifiedTariffEngine` to resolve parent inheritance and calculate multi-tier distance step brackets between primary and then.
- [x] 22.B.4 UI Refinements: Remove external labels/references, remove `Ã—` button on tabs, add big red delete button at bottom of each tariff page.
- [x] 22.B.5 Tariff Groups & Dynamic Admin Configuration: Implement Tariff Groups manager, inheritance picker with override toggles, and dynamically bind conditions/extras to admin-created vehicles (`settings.vehicles`), zones, and collections.
- [x] 22.B.6 Verification: Run `npm run typecheck` and `npm run build` to verify 0 errors.

## Phase 22.C: Tariff Layout & Subpage Refinements
- [x] 22.C.1 Move `+ Add Increment Tier` button from card header to be placed directly between the Primary tier (+ intermediate tiers) and the "Then" open-ended tier.
- [x] 22.C.2 Reorder cards in `UnifiedTariffManager.tsx` so the entire `Taximeter Step Brackets` section appears immediately after `Profile Configuration`, followed by `Flat Tariff Matrix` (Corridors), `Tariff Extras & Surcharges`, and the bottom delete button.
- [x] 22.C.3 Configure `Unified Tariffs` as the default subpage for `/admin?tab=rates` across `SUB_PAGES` in `app/routes/admin.tsx` and `AdminRatesTab.tsx`.
- [x] 22.C.4 Verify `npm run typecheck` and `npm run build` pass with 0 errors.

### Phase 23: Advanced System Audit, Code Maintainability & Stress Testing
- [x] 23.1 Documentation Updates: Update spec.md, plan.md, and tasks.md to reflect Phase 23 scope.
- [x] 23.2 UI Polish Fix: Fix the Live Fare Simulator sidebar sticky position in `/admin?tab=rates`.
- [x] 23.3 Maintainability & Design Pattern Audit: Ensure modular component decoupling, dynamic theme abstraction, pure pricing pipeline integrity, and schema/type hardening.
- [x] 23.4 Pricing Engine Determinism & Conflict Resolution Audit: Strict priority ranking, collision handling, and fallback behavior.
- [x] 23.5 Live Dispatch & Queue Stress Testing: Create developer seeding utility for 100+ concurrent mock trips, test `/dispatch` virtualized rendering under load.
- [x] 23.6 Firestore Security Rules & Composite Index Hardening: Audit `firestore.rules` for strict RBAC and `firestore.indexes.json` for compound query support.
- [x] 23.7 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` and mark Phase 23 complete.

## Phase 24: Driver Mobile App & Real-Time Sync
- [x] 24.1 Documentation Updates: Update spec.md, plan.md, and tasks.md with Phase 24 scope.
- [x] 24.2 Core Data Models & State Machine: Expand TripStatus with `accepted`, `en_route`, `arrived`, `in_progress`, configure transitions, and define DriverProfile / Shift types.
- [x] 24.3 Driver Service: Implement `driver.service.ts` for shift management (On-Duty / Off-Duty / On-Break), active trip subscription, step actions, and meter updates.
- [x] 24.4 Driver Mobile PWA Console (`/driver`): Build mobile-first, responsive driver interface with shift controls, assigned trip card, and sequential action flow.
- [x] 24.5 In-Vehicle Live Meter & Fare Extras: Build live meter interface for `in_progress` trips with distance/time calculation and manual extras adder (tolls, parking, luggage, cleaning fees).
- [x] 24.6 Multi-Party Real-Time Firestore Sync: Update Dispatch Console (`/dispatch`), Admin Dashboard (`/admin`), and Customer Booking Tracker (`/booking/status/:tripId`) to listen and render new statuses in real-time.
- [x] 24.7 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` to confirm 0 compilation errors.

## Phase 25: Passenger Mobile Web App (`/app`)
- [x] 25.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md with Phase 25 Passenger Web App scope.
- [x] 25.2 Data Models & Passenger Service: Create `passenger.ts` and `passenger.service.ts` for Saved Places CRUD, Customer Profile management, active trip tracking, and ride history resolution.
- [x] 25.3 Rebooking Handoff & Deep Linking: Update `BookingEngineV2.tsx` to parse URL query params (`pickup`, `dropoff`, `notes`, `vehicle`) and support 1-tap rebook prefill.
- [x] 25.4 Real-Time Tracking Deep Link: Register `/track/:tripToken` route alias and update `booking.status.tsx` to support both `tripId` and `tripToken`.
- [x] 25.5 Mobile-First Passenger PWA (`/app`): Build responsive portal with Quick Book Drawer, saved place chips ("Home", "Work", "Airport"), Active Trip floating banner, Profile manager, and Saved Places manager.
- [x] 25.6 Trip History & Itemized Digital Receipts: Implement past trips view, 1-tap rebook buttons, and printable/downloadable itemized receipt modal with complete fare breakdown.
- [x] 25.7 Navigation Integration: Add Passenger App link to main Navbar.
- [x] 25.8 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` and mark Phase 25 complete.
- [x] 25.9 Navigation Refinement (Pattern 2: Dedicated App Shell):
  - [x] 25.9.1 Decouple public header: Remove "Passenger App" from public menu, set menu strictly to Home, Services, Fleet & Rates, About, Contact, and add sleek "Sign In" button adjacent to "Book Now".
  - [x] 25.9.2 Route Decoupling: Move `/app` outside public layout in `routes.ts` to suppress public marketing headers and footers.
  - [x] 25.9.3 Dedicated App Shell Layout: Implement desktop header with brand logo, "Passenger Portal" badge, dynamic avatar dropdown `[ 👤 Sarah J. ▾ ]`, mobile sticky bottom bar `[ 🚖 Book ] [ 📜 Trips ] [ 📍 Places ] [ 👤 Profile ]`, and "Back to Main Website" escape link.
  - [x] 25.9.4 Verification: Verify `npm run typecheck` and `npm run build` with 0 errors.
- [x] 25.10 Passenger App Streamlining & Self-Contained Booking Flow:
  - [x] 25.10.1 Remove top sticky header and redundant top profile card with duplicate tabs from `/app`.
  - [x] 25.10.2 Add minimalist top status bar with compact logo, company name, passenger greeting, and live ride beacon.
  - [x] 25.10.3 Add `?` Floating Action Button (FAB) floating above sticky bottom navigation.
  - [x] 25.10.4 Add floating assistance popover with 24/7 Dispatch call buttons, direct desk line, FAQ trigger, email dispatch, website escape link, and sign out.
  - [x] 25.10.5 Add interactive Help Center & FAQ Modal covering airport pickup grace periods, child car seats, luggage guidelines, and cancellation terms.
  - [x] 25.10.6 Directly embed `BookingEngineV2` inside `/app` with reactive `initialValues` prefill, eliminating external redirects to `/book` for 1-tap chips, Saved Places actions, and trip rebooking.
  - [x] 25.10.7 Verify `npm run typecheck` and `npm run build` pass with 0 errors.
- [x] 25.11 Passenger App Direct Dispatch Banner & Action Streamlining:
  - [x] 25.11.1 Remove dark blue "Direct Dispatch Confirmation" banner in passenger app (`hideDispatchBanner={true}`).
  - [x] 25.11.2 Remove duplicate "Direct Desk Line" from `?` assistance popover menu.
  - [x] 25.11.3 Remove "Back to Main Website" buttons from both the assistance popover and Profile tab.
  - [x] 25.11.4 Add "Book Return" button for trips in Past Trips tab (automatically swaps pickup & dropoff in the embedded booking flow) and highlight the latest trip with a "Most Recent" badge.
  - [x] 25.11.5 Verify `npm run typecheck` and `npm run build` pass with 0 errors.


## Phase 26: Modular Website Builder & White-Label CMS Studio
- [x] 26.1 Documentation Updates: Update spec.md, plan.md, and tasks.md to reflect Phase 26 scope.
- [x] 26.2 Modular Section Registry & Dynamic Renderer: Create `SECTION_REGISTRY` in `app/components/cms/SectionRegistry.tsx` and pure UI components for sections.
- [x] 26.3 Admin Visual CMS Studio (`/admin?tab=website`): Layout Reordering Canvas, Live Section Property Inspector, Visual Theme & Asset Switcher.
- [x] 26.4 Advanced CMS & SEO Tools: Monaco / CodeMirror CSS Editor, Head / Footer Script Injector, SEO & Social Graph Manager.
- [x] 26.5 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` to confirm 0 compilation errors.

## Phase 27: Full-Stack Authentication, OAuth & Session Management
- [x] 27.1 Documentation Updates: Update spec.md, plan.md, and tasks.md to reflect Phase 27 scope.
- [x] 27.2 Unified Sign-In & Registration Views: Build `/signin` and `/register` with Email/Password and Social Auth (Google/Facebook) buttons, and Passenger/Driver registration toggle.
- [x] 27.3 Role-Based Session Router & Route Guards: Implement route guards for `/admin`, `/dispatch`, `/driver` redirecting to `/signin`. Handle role-based automatic routing post-login.
- [x] 27.4 Guest-to-User Account Linking: Add "Save Account & Claim Trips" option on `/track/$tripToken` to attach guest trips to passenger profile.
- [x] 27.5 Verification: Run `npm run typecheck` and `npm run build` to verify 0 errors, then mark Phase 27 complete.
## Phase 28: Admin Onboarding Center, Candidate Processing & Role Provisioning
- [x] 28.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to reflect Phase 28 scope.
- [x] 28.2 Admin Onboarding Queue: Build a structured candidate processing dashboard in `/admin?tab=operators&sub=onboarding` with table view and Candidate Dossier Card.
- [x] 28.3 Background & Compliance Verification Checklist: Add interactive compliance controls inside candidate drawer and audit log.
- [x] 28.4 One-Click Account Provisioning & Role Injection: Implement "Approve & Provision Account" action, link/create Driver Profile, and generate secure temporary credentials.
- [x] 28.5 Build & Typecheck Verification: Run `npm run typecheck` and `npm run build` to confirm 0 errors.

## Phase 29: Universal Governance, Shift Engine, Audit Log, Dual Scoring & Conditional Booking Rules
- [x] 29.1 Documentation Updates: Update spec.md, plan.md, and tasks.md with Phase 29 requirements.
- [x] 29.2 Universal Archive & Blacklist Engine (With Geo-Locations):
  - [x] 29.2.1 Extend models (Passenger, Driver, Staff Operator, Fleet Vehicle, Trip, Geo-Location) with isArchived, isBlacklisted, blacklistReason.
  - [x] 29.2.2 Passenger Blacklist guard on booking creation (halt and audit log).
  - [x] 29.2.3 Driver/Staff Blacklist guard in auth service (reject sign-in and shift activation).
  - [x] 29.2.4 Vehicle Grounding/Blacklist guard in driver shift selection and dispatch auto-assign.
  - [x] 29.2.5 Geo-Location Blacklist guard in booking rules engine.
- [x] 29.3 Dual-Scoring Engine (Driver Score & Customer Score):
  - [x] 29.3.1 Customer Score (0-100) tracking cancellations, no-shows, and payment reliability.
  - [x] 29.3.2 Driver Score (0-100) tracking acceptance rate, on-time rate, and ratings.
  - [x] 29.3.3 Visual score badges across admin customers, operators, dispatch candidate cards, and roster.
- [x] 29.4 3-Tier Conditional Booking Lifecycle Engine:
  - [x] 29.4.1 Mode A (AUTO_CONFIRM) direct pipeline.
  - [x] 29.4.2 Mode B (REQUIRE_REVIEW) with match tags ("Late-Night Policy", "Low Customer Score", "Congested Event Area").
  - [x] 29.4.3 Mode C (BLACKLIST_BLOCK) with error notice and security audit log.
- [x] 29.5 Temporal Vehicle Shifts (/vehicleAssignments) & Search Tool:
  - [x] 29.5.1 Shift tracking in Firestore on duty toggles and vehicle selections.
  - [x] 29.5.2 Bidirectional query helpers in vehicle-assignment.service.ts.
  - [x] 29.5.3 Admin Shift History Search UI with unit number + date window exploration.
- [x] 29.6 Immutable Trip Snapshots & Audit Log Inspector:
  - [x] 29.6.1 Freeze assignedVehicle metadata on trip assignment.
  - [x] 29.6.2 Complete auditLog timeline array with actor IDs and action metadata.
  - [x] 29.6.3 Interactive Audit Log Inspector Modal in /admin?tab=trips and /dispatch.
- [x] 29.7 Admin UI Governance Modules:
  - [x] 29.7.1 Admin Rules Manager in /admin?tab=trips&sub=rules.
  - [x] 29.7.2 Geo-Fence & Location Rules Manager in /admin?tab=zones.
  - [x] 29.7.3 Universal Archive/Blacklist drawer/actions across admin roster tables.
- [x] 29.8 Build & Typecheck Verification:
  - [x] 29.8.1 Run npm run typecheck with 0 errors.
  - [x] 29.8.2 Run npm run build with 0 errors.
