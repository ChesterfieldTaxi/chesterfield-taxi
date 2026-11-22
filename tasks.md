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

## Phase 29B: Responsive Mobile Overhaul, Mobile Dispatch Console, Multi-Role View Switcher & Custom Layout Options
- [x] 29B.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md with Phase 29B scope.
- [x] 29B.2 Multi-Role View Switcher & App Shell Integration:
  - [x] 29B.2.1 Create `RoleViewSwitcher.tsx` with role resolution and 1-tap workspace switching (`/admin`, `/dispatch`, `/driver`, `/app`).
  - [x] 29B.2.2 Integrate View Switcher into `UserDropdown.tsx` and Admin/Dispatch headers.
  - [x] 29B.2.3 Update `/signin` and `/register` post-auth redirection logic for role-based landing.
- [x] 29B.3 Configurable Display Layout Engine (Cards vs. List/Table vs. Compact):
  - [x] 29B.3.1 Create `useDisplayLayout.ts` hook with `localStorage` persistence and automatic < 768px fallback.
  - [x] 29B.3.2 Create `LayoutToggle.tsx` 3-way segmented button group.
  - [x] 29B.3.3 Integrate layout toggles in `/admin` and `/dispatch` header toolbars.
- [x] 29B.4 Dispatch Console Mobile Overhaul (`/dispatch`):
  - [x] 29B.4.1 Build responsive slide-out navigation drawer for mobile screens (Drivers, Messages, Softphone, Settings).
  - [x] 29B.4.2 Implement 3-tab mobile view switcher (`[ 📝 New Booking ]`, `[ 🗺️ Live Map ]`, `[ 🚕 Trip Queue ]`).
  - [x] 29B.4.3 Support Card Grid, Dense Table, and Compact List views in the active Trip Queue.
  - [x] 29B.4.4 Preserve desktop 3-pane split layout with resizable splitters for >= 1024px.
- [x] 29B.5 Admin Console & Table Responsive Overhaul (`/admin`):
  - [x] 29B.5.1 Restore missing header actions ("Launch Dispatch", "Live Site", quick navigation) on desktop and mobile viewports.
  - [x] 29B.5.2 Wrap all high-density tables (Trips, Roster, Fleet, Audit Logs, Geo-Zones, Invoicing, Onboarding) in responsive `overflow-x-auto custom-scrollbar` containers.
  - [x] 29B.5.3 Integrate Card View and Compact View in Admin Trips and Operators/Roster.
- [x] 29B.7 Header, Sidenav, and Dispatch Queue Refinements (User Directives):
  - [x] 29B.7.1 Minimized User Button across the board (`triggerVariant="minimized"`, avatar initial + down arrow).
  - [x] 29B.7.2 Consolidated workspace switching into `UserDropdown` and removed redundant standalone header dropdowns to eliminate tab title truncation on mobile.
  - [x] 29B.7.3 Transformed mobile sidenav/drawer workspace selector into a space-saving compact dropdown.
  - [x] 29B.7.4 Redesigned Dispatch Queue toolbar with full-width expandable search via 🔍 magnifier button, hiding filters during typing.
  - [x] 29B.7.5 Merged unconfirmed bookings filter into the primary status dropdown with pending notification dot.
  - [x] 29B.7.6 Moved Queue Display Layout selector off main header directly into queue page toolbar as a compact dropdown.

## Phase 30: End-to-End Live Simulation & Production Infrastructure Hardening
- [x] 30.1 Documentation Updates (FIRST STEP): Update spec.md, plan.md, and tasks.md to reflect Phase 30 scope: Complete E2E multi-role simulation testing, Firestore security rule verification, bundle optimization, and production readiness checks.
- [x] 30.2 Full Lifecycle End-to-End Simulation Walkthrough:
  - [x] 30.2.1 Passenger Flow: Create ride request on /app; verify evaluation against the BookingRulesEngine (Mode A Auto-Confirm vs Mode B Review Required vs Mode C Blacklist Block).
  - [x] 30.2.2 Dispatcher Flow: Accept/review trip on /dispatch (testing Card, Table, and Compact list views), assign to active driver shift unit, and verify instant state broadcast.
  - [x] 30.2.3 Driver Flow: Accept trip offer on /driver PWA, cycle status transitions (EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED), verify vehicle snapshot freezing and automated auditLog array updates.
  - [x] 30.2.4 Tracking Flow: Verify live customer telemetry map (/track/$tripToken) updates in real time via Firestore snapshot listeners.
- [x] 30.3 Role-Based Access Control (RBAC) & Security Hardening:
  - [x] 30.3.1 Audit `firestore.rules` to enforce strict multi-tenant governance (Passengers profile & trips, Drivers assigned trips & shifts, Applicants queue lockdown, Admins/Dispatchers elevated read/write).
- [x] 30.4 Production Asset & Bundle Optimization:
  - [x] 30.4.1 Implement code splitting and dynamic lazy loading for heavy dependencies (Leaflet Maps, Monaco Editor, charting libraries).
  - [x] 30.4.2 Clean up unused imports, dead CSS modules, and redundant console logs.
- [x] 30.5 Build, Typecheck & Verification:
  - [x] 30.5.1 Run `npm run typecheck` to confirm 0 TypeScript compilation errors.
  - [x] 30.5.2 Run `npm run build` to confirm production client and SSR build stability.
  - [x] 30.5.3 Update tasks.md to mark Phase 30 complete upon verification.

## Phase 31: Enterprise External API Integrations (Payments, Invoicing, and Telephony)
- [x] 31.1 Documentation Updates (FIRST STEP):
  - [x] 31.1.1 Update `spec.md`, `plan.md`, and `tasks.md` to reflect Phase 31 scope: Payment processor integration (Stripe / Square), B2B Invoicing & Ledger Sync (QuickBooks / PDF generator), and Telephony Suite (Twilio masked SMS, call relay, and Dispatcher softphone).
- [x] 31.2 Payments & Card Vaulting Engine (Stripe / Square):
  - [x] 31.2.1 Create payment data contracts (`app/core/types/payment.ts`) for vaulted cards, payment intents, and driver payouts.
  - [x] 31.2.2 Implement payment service (`app/core/services/payment.service.ts`) with card vaulting, pre-authorization holds, and payment capture.
  - [x] 31.2.3 Implement tokenized card checkout and card-on-file vaulting on `/app` profile and `BookingEngineV2.tsx`.
  - [x] 31.2.4 Implement Driver PWA terminal integration (`/driver`) with tip selection presets (`15%`, `20%`, `25%`, `Custom`, `No Tip`) and card processing upon trip completion.
  - [x] 31.2.5 Implement driver payouts engine structure for automated fare splitting and ledger entries.
- [x] 31.3 B2B Corporate Invoicing & Accounting Sync:
  - [x] 31.3.1 Create invoicing data contracts (`app/core/types/invoicing.ts`) for financial ledger entries and accounting export formats.
  - [x] 31.3.2 Implement invoicing service (`app/core/services/invoicing.service.ts`) with automated corporate batch billing and printable PDF invoice generation.
  - [x] 31.3.3 Implement accounting sync interface for QuickBooks CSV, QuickBooks IIF, and General Ledger JSON export.
  - [x] 31.3.4 Update `/admin?tab=financials` (and `/admin?tab=invoicing`) with Invoicing & Financials console, PDF viewer/print modal, and accounting sync sub-tab.
- [x] 31.4 Telephony & Communication Suite (Twilio / WebRTC):
  - [x] 31.4.1 Create telephony data contracts (`app/core/types/telephony.ts`) for masked proxy sessions, SMS notifications, and WebRTC calls.
  - [x] 31.4.2 Implement communications service (`app/core/services/telephony.service.ts`) with masked phone relay and automated SMS telemetry alerts.
  - [x] 31.4.3 Wire automated SMS telemetry alerts to trip state lifecycle transitions (`en_route`, `arrived`, `in_progress`, `completed`).
  - [x] 31.4.4 Connect WebRTC Click-to-Call softphone widget inside `/dispatch` with driver roster and queue direct dialer.
- [x] 31.5 Build & Typecheck Verification:
  - [x] 31.5.1 Run `npm run typecheck` to confirm 0 TypeScript compilation errors.
  - [x] 31.5.2 Run `npm run build` to confirm production client and SSR build stability.
  - [x] 31.5.3 Update tasks.md to mark Phase 31 complete upon verification.
- [x] 31.6 Twilio Telephony Verification Endpoint & Admin Interface Hardening:
  - [x] 31.6.1 Implement dedicated verification endpoint `app/routes/api.telephony.verify.ts` validating Twilio credentials against Twilio REST Accounts API (`https://api.twilio.com/2010-04-01/Accounts/{AccountSid}.json`).
  - [x] 31.6.2 Ensure strict JSON responses and complete try/catch wrapping to prevent Vercel/SSR HTML error pages.
  - [x] 31.6.3 Register `api/telephony/verify`, `api/telephony`, and `api/payments` in `app/routes.ts`.
  - [x] 31.6.4 Update `AdminIntegrationsSubpage.tsx` with Content-Type validation safeguard before `response.json()`, live "Connected" (Green Badge) rendering, and local persistence.
  - [x] 31.6.5 Verify with `npm run typecheck` (0 errors) and `npm run build` (clean SSR build).

## Phase 32: Production Launch, Web Booking Stress Testing, Security Standards & UI/UX Hardening
- [x] 32.1 Production Cutover & Maintenance Mode Transition:
  - [x] 32.1.1 Update `app/config/companyConfig.ts` to default `constructionMode: false`.
  - [x] 32.1.2 Ensure `app/routes/layout.tsx` seamlessly synchronizes with live admin toggle without SSR hydration mismatch.
- [x] 32.2 Defensive Security Hardening:
  - [x] 32.2.1 Secure `app/routes/api.seed-stress-data.tsx` behind authorization / environment guards.
  - [x] 32.2.2 Secure `app/routes/api.send-email.ts` preventing open arbitrary HTML relay.
  - [x] 32.2.3 Secure `app/routes/api.payments.ts` by removing client credential overrides and enforcing server environment keys.
  - [x] 32.2.4 Harden `firestore.rules` against unauthenticated guest data exposure and unauthorized status transitions.
  - [x] 32.2.5 Implement invisible honeypot bot trap and XSS input sanitization in `BookingEngineV2.tsx`.
- [x] 32.3 Web Booking UI/UX Polish:
  - [x] 32.3.1 Add step indicators, inline phone formatting, capacity badges, and Missouri child seat rules.
  - [x] 32.3.2 Implement mobile-first sticky fare action bar for uninterrupted conversion.
  - [x] 32.3.3 Enhance `BookingConfirmation.tsx` with copyable booking ID, "What Happens Next?" timeline, calendar export (.ics), and print receipt.
- [x] 32.4 Automated Stress Testing Suite:
  - [x] 32.4.1 Create `scripts/stress-test-web-booking.ts` covering Concurrency (50+ parallel bookings), Fuzzing (XSS, extreme lengths, emojis), Anti-Tamper Pricing, and Bot Honeypots.
  - [x] 32.4.2 Add `"test:stress"` script to `package.json`.
  - [x] 32.4.3 Execute stress test suite, verify assertions pass, and confirm zero regressions.

## Phase 33: Codebase Modularization, Shared Hooks & Dead-Code Cleanup
- [x] 33.1 Documentation First (SDD Convention):
  - [x] 33.1.1 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 33 scope before modifying application code.
- [x] 33.2 Dead-Code Removal & Git Hygiene:
  - [x] 33.2.1 Verify zero active imports and remove legacy V1 `app/components/domain/BookingEngine.tsx` and `app/components/domain/BookingForm.tsx`, cleaning up `app/components/domain/index.ts`.
  - [x] 33.2.2 Add `.vercel/` to `.gitignore` and run `git rm --cached -r .vercel` so `.vercel/react-router-build-result.json` no longer dirties `git status`.
- [x] 33.3 Decompose `app/routes/dispatch.tsx`:
  - [x] 33.3.1 Extract `TripActionDropdown.tsx` and `MemoizedDraftBookingPane.tsx` under `app/components/domain/dispatch/`.
  - [x] 33.3.2 Extract `DispatchTripQueuePane.tsx` (table, card, and compact queue renderers + search/filter toolbar).
  - [x] 33.3.3 Extract `DispatchLiveMapPane.tsx` (Google Maps fleet telemetry, markers, zone overlays & route polylines).
  - [x] 33.3.4 Extract `DispatchDriverRosterPane.tsx` (driver shift list, driver picker sheet & touch-and-hold quick-action sheets).
  - [x] 33.3.5 Extract `DispatchTripDetailsDrawer.tsx` (trip details/inspection, unconfirmed review modal & audit triggers) and keep `app/routes/dispatch.tsx` as clean workspace orchestrator.
- [x] 33.4 Decompose `app/routes/driver.tsx`:
  - [x] 33.4.1 Extract pure helper functions (`formatCabUnitLabel`, `openMapNavigation`, `isTripQuotedLocked`, `splitDriverExtras`, `maskPhoneForDisplay`) into `app/core/utils/driver-ui.util.ts` and re-export from `driver.tsx`.
  - [x] 33.4.2 Extract `DriverShiftControls.tsx`, `DriverOfferSheet.tsx`, `DriverLiveMeterCard.tsx`, `DriverPaymentTerminalModal.tsx`, and `DriverEarningsHistoryPane.tsx` under `app/components/domain/driver/`.
- [x] 33.5 Modularize `CommsHub.tsx` & Shared Booking Hooks:
  - [x] 33.5.1 Split `app/components/domain/dispatch/CommsHub.tsx` into `app/components/domain/dispatch/comms/` (`CommsFilterToolbar.tsx`, `CommsBatchActionBar.tsx`, `SoftphoneDialerPane.tsx`, `SmsThreadPane.tsx`, `VoicemailCallLogPane.tsx`) and lazy-load `@twilio/voice-sdk` on softphone initialization.
  - [x] 33.5.2 Extract shared pure hooks/helpers between `DispatchBookingEngine.tsx` and `BookingEngineV2.tsx` into `app/core/hooks/booking/` (multi-stop waypoint manipulation, return-trip state sync, corporate PO verification helpers).
- [x] 33.6 Verification Gate & Summary:
  - [x] 33.6.1 Run `npm run typecheck` (0 errors).
  - [x] 33.6.2 Run `npm run build` (clean client + SSR bundles).
  - [x] 33.6.3 Run `npm run test:e2e` and `npm run test:stress` (all assertions pass).
  - [x] 33.6.4 Mark Phase 33 tasks complete in `tasks.md` and report before/after file sizes and line counts.

## Phase 34: Driver & Dispatch PWA Hardening (Service Worker, Web Push & Screen Wake Lock)
- [x] 34.0 Baseline Hygiene & Hook Referential Stability:
  - [x] 34.0.1 Commit Phase 33 refactor baseline cleanly before starting Phase 34 changes.
  - [x] 34.0.2 Memoize `sheetStyle` and `dragHandlers` in `app/core/hooks/useBottomSheetDragToClose.ts` for `React.memo` consumers.
- [x] 34.1 Documentation First (SDD Convention):
  - [x] 34.1.1 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 34 scope and architecture before writing feature code.
- [x] 34.2 Manifest & PWA Scope Alignment:
  - [x] 34.2.1 Update `public/manifest-driver.json` so `id`, `start_url`, and `scope` point to `"/app/driver"`.
  - [x] 34.2.2 Dynamically switch `<link rel="manifest">` in `app/root.tsx` using `useLocation()` for `/app/driver` (and `/driver`) vs `/manifest.json`.
- [x] 34.3 Root Service Worker & Background Notification Routing:
  - [x] 34.3.1 Create `public/sw.js` with network-first HTML navigation fallback, stale-while-revalidate icon/manifest caching (never caching `/api/*` or Firestore), `push` & `SHOW_LOCAL_NOTIFICATION` handlers, and `notificationclick` window focus/open routing.
  - [x] 34.3.2 Safely register `/sw.js` on the client in `app/root.tsx` via encapsulated notification/SW hook with SSR guards.
- [x] 34.4 Screen Wake Lock Hook:
  - [x] 34.4.1 Implement `app/core/hooks/useWakeLock.ts` (`isSupported`, `isActive`, `error`, `requestLock`, `releaseLock`) with `visibilitychange` auto-reacquisition and graceful unsupported fallback.
- [x] 34.5 Push Notification & Acoustic Alert Services:
  - [x] 34.5.1 Implement `app/core/services/notifications/push-notification.service.ts` (`ct_push_alerts_enabled`, permission state, optional FCM `/users/{uid}.fcmTokens` sync, `notifyIncomingDriverOffer`, `notifyDispatchAlert`, haptic vibration) and `app/core/hooks/usePushNotifications.ts`.
  - [x] 34.5.2 Implement authenticated `/api/push` server route (`app/routes/api.push.ts`) and register in `app/routes.ts`.
  - [x] 34.5.3 Extend `app/core/services/sound-notification.service.ts` with `playDriverOfferAlert()`, `stopDriverOfferAlert()`, and `playSlaWarningChime()`.
- [x] 34.6 Driver & Dispatch UI Integration:
  - [x] 34.6.1 Wire automatic `useWakeLock` (`dutyStatus === 'on_duty'`), incoming offer repeating alert + push notification, and `DriverShiftControls` **Screen Awake** status + 1-tap **Enable Push Alerts** UI in `app/routes/driver.tsx` and `app/components/domain/driver/DriverShiftControls.tsx`.
  - [x] 34.6.2 Wire **Keep Screen Awake** (`ct_dispatch_wake_lock`) and **Browser Push Alerts** controls + background `UNCONFIRMED`/`ASAP` ride push alerts in `app/routes/dispatch.tsx`.
- [x] 34.7 Verification Gate:
  - [x] 34.7.1 Create `scripts/test-pwa-notifications.ts` testing payload formatting, SW syntax & event handlers, manifest `/app/driver` scope, and SSR/unsupported fallbacks.
  - [x] 34.7.2 Run `npm run typecheck`, `npm run build`, `npx tsx scripts/test-pwa-notifications.ts`, and `npm run test:e2e`, then mark Phase 34 complete in `tasks.md`.

## Phase 35: Scheduled-Ride SLA Monitor & Auto-Dispatch / Offer Cascade
- [x] 35.0 Baseline Commit & Notification URL Guard:
  - [x] 35.0.1 Commit Phase 34 PWA baseline cleanly before Phase 35 changes.
  - [x] 35.0.2 Add same-origin relative-path guard (`rawUrl.startsWith('/') && !rawUrl.startsWith('//')`, else `'/app/driver'`) to notification `url` normalization in `public/sw.js` and `app/routes/api.push.ts` (`send_push`).
- [x] 35.1 Documentation First (SDD Convention):
  - [x] 35.1.1 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 35 scope and architecture before modifying application code.
- [x] 35.2 Config, Trip Schema & Firestore Security Rules:
  - [x] 35.2.1 Add `DispatchAutomationConfig` (`autoOfferOnConfirm: false`, `rankingStrategy`, `offerTimeoutSeconds`, `maxCascadeAttempts`, `slaWarningMinutes`, `slaCriticalMinutes`, `airportExtraLeadMinutes`) to `app/core/types/config.ts` and hydrate/persist in `app/core/services/config/admin-config.service.ts`.
  - [x] 35.2.2 Extend `Trip` in `app/core/types/trip.ts` with `offerCascade` and `slaStatus`, and update `TRIP_STATE_TRANSITIONS`.
  - [x] 35.2.3 Update `firestore.rules` offered-driver `affectedKeys().hasOnly(...)` to allow `'offerCascade'` (and `'slaStatus'`), and update `acceptDriverOffer` / `declineDriverOffer` in `firebase-booking.service.ts` and `mock-booking.service.ts`.
- [x] 35.3 Pure SLA Monitor & Auto-Dispatch Services (`app/core/services/dispatch/`):
  - [x] 35.3.1 Implement `app/core/services/dispatch/sla-monitor.service.ts` (`evaluateTripSlaUrgency`, `scanUpcomingUnassignedSlaTrips`) with STL/SUS/CPS airport extra lead buffer.
  - [x] 35.3.2 Implement `app/core/services/dispatch/auto-dispatch.service.ts` (`rankAutoDispatchCandidates`, `startOfferCascade`, `advanceOrExpireOfferCascade`, `cancelOfferCascade`) and barrel `app/core/services/dispatch/index.ts`.
- [x] 35.4 Serverless Scheduled SLA Cron:
  - [x] 35.4.1 Implement `app/routes/api.cron.sla-dispatch.ts` + `app/core/services/dispatch/sla-cron.server.ts` (`GET`/`POST`, secured via `CRON_SECRET` / `x-admin-secret` / Dispatcher-Admin auth, idempotent `criticalNotifiedAt` stamping, email/SMS alerts, cascade maintenance) and register in `app/routes.ts` + `vercel.json`.
- [x] 35.5 Dispatch, Driver & Admin UI Integration:
  - [x] 35.5.1 Wire periodic SLA & cascade coordinator tick, `autoOfferOnConfirm` hook, SLA Urgency Banner, SLA countdown badges, live cascade pills, and 1-tap Auto-Offer / Cancel Cascade actions across `app/routes/dispatch.tsx`, `DispatchTripQueuePane.tsx`, `TripActionDropdown.tsx`, and `DispatchTripDetailsDrawer.tsx`.
  - [x] 35.5.2 Add live 1-second cascade offer countdown progress bar / badge in `DriverOfferSheet.tsx` and `DriverLiveMeterCard.tsx`.
  - [x] 35.5.3 Add **Dispatch Automation & Scheduled SLA** settings card in `AdminRulesTab.tsx`.
- [x] 35.6 Verification Gate:
  - [x] 35.6.1 Create `scripts/test-auto-dispatch-sla.ts` covering all 3 ranking strategies, exclusion filters, multi-step cascade rollover & exhaustion, and SLA urgency math (including STL/SUS airport buffer).
  - [x] 35.6.2 Run `npm run typecheck`, `npm run build`, `npx tsx scripts/test-auto-dispatch-sla.ts`, `npm run test:e2e`, and `npm run test:stress`, then mark Phase 35 complete in `tasks.md`.

## Phase 36: Complete Payment & Invoicing Loop (Stripe Webhooks + 1-Tap Pay Links)
- [x] 36.0 Commit Phase 35 Baseline & Align Hobby Cron Schedule:
  - [x] 36.0.1 Commit Phase 35 SLA & Auto-Dispatch baseline cleanly before Phase 36 changes.
  - [x] 36.0.2 Update `vercel.json` `/api/cron/sla-dispatch` schedule to `"0 10 * * *"` and update `scripts/test-auto-dispatch-sla.ts` assertion.
- [x] 36.1 Documentation First (SDD Convention):
  - [x] 36.1.1 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 36 scope and architecture before modifying application code.
- [x] 36.2 Verified Stripe Webhook Engine:
  - [x] 36.2.1 Create server-isolated `app/core/services/payments/stripe-webhook.server.ts` implementing `verifyStripeWebhookSignature` (`HMAC-SHA256`, multi-`v1` rotation, `timingSafeEqual`, timestamp replay window), `/paymentWebhookEvents/{event.id}` idempotency, shared `pi_${paymentIntentId}` settlement deduplication, event reconciliation (`payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`), and staff diagnostics.
  - [x] 36.2.2 Create `app/routes/api.payments.webhook.ts` (`POST` raw body webhook handler + authenticated staff `GET` diagnostics loader) and register `api/payments/webhook` in `app/routes.ts`.
- [x] 36.3 Zero-PII Tokenized 1-Tap Pay Links:
  - [x] 36.3.1 Create `app/core/utils/pay-token.util.ts` (`pay_...` token generation, zero-PII `PayLinkProjection` builders/sanitizers, expiry evaluation, and server-authoritative `baseAmount + tip` anti-tamper math).
  - [x] 36.3.2 Update `firestore.rules` with `/payLinks/{payToken}` zero-PII rules and `/paymentWebhookEvents/{eventId}` staff lockdown, and extend `TripPayment` / `InvoiceRecord` / `PrintableInvoiceData` types with optional pay-link & settlement fields.
  - [x] 36.3.3 Create `app/core/services/payments/pay-link.server.ts`, `app/core/services/payments/pay-link.service.ts`, and `app/routes/api.pay.ts` (`GET` public lookup + auto-expiry, `POST` `create_link` with SMS/Email delivery, `create_checkout_intent`, and `confirm_payment` verified against Stripe REST API), registered as `api/pay` in `app/routes.ts`.
- [x] 36.4 Public Checkout Page & Staff Triggers:
  - [x] 36.4.1 Create `app/routes/pay.$payToken.tsx` (mobile-first Executive Clean standalone checkout page with itemized breakdown, tip presets, live Stripe Payment Element `js.stripe.com/v3/`, graceful fallback notice, instant Paid Receipt view, and Print Receipt button) and register `pay/:payToken` in `app/routes.ts`.
  - [x] 36.4.2 Add **Copy / Send Pay Link (SMS / Email)** controls and live `Open` / `Paid` status badge to `DispatchTripDetailsDrawer.tsx`.
  - [x] 36.4.3 Add **Text / Show Pay Link** fallback option in `DriverPaymentTerminalModal.tsx` (wired in `app/routes/driver.tsx`).
  - [x] 36.4.4 Add **Generate / Send Pay Link** action on open corporate invoices in `AdminInvoicingSubpage.tsx` and include the 1-tap Pay Link URL in printable PDF invoice remittance footers and statement emails.
  - [x] 36.4.5 Update `AdminIntegrationsSubpage.tsx` (`webhooks` sub-tab) with live Stripe Webhook configuration status, copyable `/api/payments/webhook` URL, subscribed event list, and recent processed webhook events log.
- [x] 36.5 Verification Gate:
  - [x] 36.5.1 Create `scripts/test-payment-webhooks-and-links.ts` testing HMAC signature validation/tamper/replay/multi-`v1` rotation, webhook idempotency, trip & corporate invoice reconciliation (`payment_intent.succeeded` & `charge.refunded`), zero-PII pay link sanitization, expiry, and anti-tamper fare calculation.
  - [x] 36.5.2 Run `npm run typecheck`, `npm run build` (confirming `api.payments.webhook` client chunk is `0.00 kB`), `npx tsx scripts/test-payment-webhooks-and-links.ts`, `npm run test:e2e`, and `npm run test:stress`, then mark Phase 36 complete in `tasks.md`.

## Phase 37: Corporate Client Self-Service Portal (`/app/corporate`)
- [x] 37.0 Baseline Hygiene & SDD Documentation:
  - [x] 37.0.1 Commit Phase 36 Stripe Webhooks & Pay Links baseline cleanly (`feat(phase-36): add verified Stripe webhooks, 1-tap zero-PII pay links, and Hobby cron schedule`).
  - [x] 37.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 37 scope and architecture before modifying application code.
- [x] 37.1 Multi-Tenant Security Rules & Server Auth Isolation:
  - [x] 37.1.1 Update `firestore.rules`: block `corporateAccountId` & `corporateAccountNumber` on `/users/{userId}` self-create and self-update; add `isCorporateManagerFor(accountId)`; scope `/corporateAccounts/{accountId}` (`get` + safe self-service `update` allowlist only), `/corporateLookup/{lookupKey}` (PO hash rotation only), `/trips/{tripId}` (`get`/`list`/`create`), `/invoices/{invoiceId}` (`get`/`list`), and `/payLinks/{payToken}` (invoice pay links).
  - [x] 37.1.2 Update `app/core/services/auth/server-auth.server.ts` (`verifyServerRequestAuth`) and `app/core/services/payments/pay-link.server.ts` (`POST /api/pay` `create_link`) so `corporate_manager` can generate/open 1-tap Pay Links strictly for invoices matching their `auth.corporateAccountId` (`403` on cross-tenant invoices).
- [x] 37.2 RBAC, Config Types & Multi-Workspace Routing:
  - [x] 37.2.1 Extend `UserRole` (`'corporate_manager'`) and `AdminUser` (`corporateAccountId`, `corporateAccountNumber`) in `app/core/services/auth/admin-auth.service.ts`; extend `CorporateAccountConfig` in `app/core/types/config.ts` and `Trip.corporateAccountId` in `app/core/types/trip.ts`.
  - [x] 37.2.2 Register `'corporate'` workspace (`/app/corporate` + legacy `/corporate` redirect) across `workspace-routing.util.ts`, `app.hub.tsx`, `RoleViewSwitcher.tsx`, `UserDropdown.tsx`, `legacy.redirect.tsx`, and `app/routes.ts`.
- [x] 37.3 Corporate Portal Domain Service (`app/core/services/corporate-portal.service.ts`):
  - [x] 37.3.1 Implement `getCorporateDashboardSummary`, `getCorporateTrips`, `exportCorporateTripsCsv`, `getCorporateInvoices`, `getCorporatePrintableInvoice`, `updateCorporateTeamAndSettings`, `rotateCorporatePoSelfService`, and `provisionCorporatePortalManager` (updating `corporate-account.service.ts` for non-dispatcher self-service PO rotation compatibility).
- [x] 37.4 Corporate Workspace UI & Admin Client Provisioning:
  - [x] 37.4.1 Enhance `BookingEngineV2.tsx` (plus `firebase-booking.service.ts` / `mock-booking.service.ts`) with `corporatePortalContext` pre-binding, locked/pre-verified corporate account fields, cost center metadata, and top-level `Trip.corporateAccountId` stamping.
  - [x] 37.4.2 Build `app/routes/corporate.tsx` (`/app/corporate`) with `corporate_manager` + `admin` guard, **Admin Account Preview Selector**, and 4-tab Executive Clean B2B interface (Overview & Live Rides, Book Company Ride, Team/Locations/PO Security, Statements & Billing with Printable PDF & 1-Tap Pay Invoice Now).
  - [x] 37.4.3 Add **Provision Corporate Portal Manager** action modal/drawer section in `AdminCustomersSubpage.tsx` assigning `roles: ['corporate_manager']`, `corporateAccountId`, and `corporateAccountNumber` onto `/users/{uid}`, recording `account.portalManagers`, and rendering copyable `/app/corporate` login instructions.
- [x] 37.5 Verification Gate:
  - [x] 37.5.1 Create `scripts/test-corporate-portal.ts` testing workspace routing, strict tenant isolation, `firestore.rules` invariants, credit-limit utilization math, CSV trip export, self-service PO rotation audit trail, and cross-tenant (`403`) vs own-tenant (`200`) invoice Pay Link generation.
  - [x] 37.5.2 Run `npm run typecheck`, `npm run build`, `npx tsx scripts/test-corporate-portal.ts`, `npx tsx scripts/test-payment-webhooks-and-links.ts`, and `npm run test:e2e`, then mark Phase 37 complete in `tasks.md`.

## Phase 38: Live Flight Status Tracking for STL & SUS Airport Pickups (Final Roadmap Phase)
- [x] 38.0 Baseline Hygiene & SDD Documentation:
  - [x] 38.0.1 Commit Phase 37 Corporate Portal baseline cleanly (`feat(phase-37): add corporate client self-service portal, multi-tenant RBAC, and manager provisioning`).
  - [x] 38.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 38 scope and architecture before modifying application code.
- [x] 38.1 Flight Telemetry Types, STL Terminal Intelligence & Data Model:
  - [x] 38.1.1 Create `app/core/types/flight.ts` (`FlightProviderId`, `FlightOperationalStatus`, `FlightTelemetrySnapshot`, `FlightLookupQuery`, `FlightPickupAlignment`, `IFlightStatusProvider`) and export from `app/core/types/index.ts`.
  - [x] 38.1.2 Enhance `app/core/config/airports.ts` with `resolveStlTerminalInfo`, `parseFlightIdent`, and `evaluateFlightPickupAlignment`.
  - [x] 38.1.3 Extend `Trip` in `app/core/types/trip.ts` with `flightTelemetry?: FlightTelemetrySnapshot` and update `firestore.rules` with `/flightStatusCache/{cacheKey}` (`allow get: if true; allow list: if false; allow write: if isDispatcher();`).
- [x] 38.2 Provider-Agnostic Flight Adapter Engine & Cached API Route:
  - [x] 38.2.1 Implement `app/core/services/flight/flight-status.server.ts` (`AeroDataBoxProvider`, `FlightAwareProvider`, `FallbackScheduleProvider`, 15-minute memory + `/flightStatusCache` TTL cache, IP rate limiting, staff-only `forceRefresh`, and diagnostics).
  - [x] 38.2.2 Create client service `app/core/services/flight/flight-status.service.ts` (plus barrel `app/core/services/flight/index.ts` and `app/core/services/index.ts` export).
  - [x] 38.2.3 Create `app/routes/api.flight-status.ts` (`GET` lookup/diagnostics + `POST` lookup/staff refresh) and register `api/flight-status` in `app/routes.ts`.
- [x] 38.3 Smart Booking Wizard Flight Check:
  - [x] 38.3.1 Upgrade `app/components/domain/booking/FlightAssistanceCard.tsx` with automatic STL Terminal & Exit Door guidance badge, **"Check Flight Status"** pill button, inline telemetry banner, blank `flightOrigin` auto-fill, pickup conflict/delay warning + 1-tap **"Use Recommended Pickup Time"**.
  - [x] 38.3.2 Wire live flight check, pickup time adjustment, and `Trip.flightTelemetry` persistence in `BookingEngineV2.tsx` and `DispatchBookingEngine.tsx`.
- [x] 38.4 Dispatch Queue, Trip Details, Driver Manifest & Admin Integrations:
  - [x] 38.4.1 Render compact color-coded **Flight Telemetry Pills** in `DispatchTripQueuePane.tsx` and `DispatchTripDetailsDrawer.tsx`, plus **"Refresh Flight"** and **1-Tap "Adjust Pickup Time to New ETA"** (updating `scheduledPickupTime`, appending `TripAuditEvent`, and notifying assigned driver) in `DispatchTripDetailsDrawer.tsx`.
  - [x] 38.4.2 Render live flight status badge, terminal/gate/baggage claim, and STL curbside exit door guidance inside `DriverTripManifest.tsx`.
  - [x] 38.4.3 Add **Flight Status Telemetry (`AeroDataBox` / `FlightAware`)** readiness & 15-minute cache card to `AdminIntegrationsSubpage.tsx`.
- [x] 38.5 Final Verification Gate (Full 6-Phase Suite):
  - [x] 38.5.1 Create `scripts/test-flight-status.ts` testing `parseFlightIdent`, `resolveStlTerminalInfo`, `AeroDataBoxProvider` & `FlightAwareProvider` mocked normalization, `FallbackScheduleProvider`, 15-minute cache deduplication + staff `forceRefresh`, and `evaluateFlightPickupAlignment` + 1-tap pickup ETA sync with `TripAuditEvent`.
  - [x] 38.5.2 Run `npm run typecheck` (0 errors) and `npm run build` (confirming `api.flight-status` client chunk is `0.00 kB`).
  - [x] 38.5.3 Run `npx tsx scripts/test-flight-status.ts` AND all prior verification suites (`test-corporate-portal`, `test-payment-webhooks-and-links`, `test-auto-dispatch-sla`, `test-pwa-notifications`, `npm run test:e2e`, `npm run test:stress`), then mark Phase 38 complete in `tasks.md`.

## Phase 38.B: Flight Status Quota & Operational Window Gates (Staff-Only, Confirmed-Only & 24-Hour Pickup Lock)
- [x] 38.B.0 SDD Documentation:
  - [x] 38.B.0.1 Update `spec.md`, `plan.md`, and `tasks.md` with Phase 38.B scope and architecture before modifying application code.
- [x] 38.B.1 Pure Eligibility Evaluator (`evaluateFlightCheckEligibility`):
  - [x] 38.B.1.1 Implement `evaluateFlightCheckEligibility` in `app/core/config/airports.ts` (`staff_only`, `unconfirmed`, `terminal_status`, `outside_24h_window` with `unlocksAtIso`, `past_window`) and re-export from `app/core/services/flight/flight-status.service.ts`.
- [x] 38.B.2 Server-Side Staff Auth & 24-Hour Window Guard:
  - [x] 38.B.2.1 Enforce Dispatcher/Admin authorization (`401`/`403`) across all `GET` and `POST /api/flight-status` endpoints in `flight-status.server.ts`, and use `authorizedFetch` for all `FlightStatusService.checkFlightStatus` calls.
  - [x] 38.B.2.2 Enforce `[-12h, +24h]` `scheduledPickupIso` window and `[-1, +1]` calendar-day `serviceDate` validation (`400` `OUTSIDE_24H_WINDOW`) inside `lookupFlightTelemetryServer` prior to any upstream provider call.
- [x] 38.B.3 Customer vs. Staff UI & Service Gate Updates:
  - [x] 38.B.3.1 Default `allowLiveCheck = false` on `FlightAssistanceCard` / `FlightTelemetryCheckPanel` (and `BookingEngineV2.tsx`) so customer/corporate forms render only free local STL Terminal & Exit Door guidance.
  - [x] 38.B.3.2 Pass `allowLiveCheck={true}`, `bookingType`, and computed `scheduledPickupIso` in `DispatchBookingEngine.tsx` (rendering disabled *"Unlocks 24h before pickup"* badge when > 24h out).
  - [x] 38.B.3.3 Guard `refreshTripFlightTelemetry` & `syncTripPickupToFlightEta` with `evaluateFlightCheckEligibility`, and disable `Refresh Flight` / `Adjust Pickup Time` in `DispatchTripDetailsDrawer.tsx` with clear inline lock-reason pills when ineligible.
- [x] 38.B.4 Verification Gate:
  - [x] 38.B.4.1 Expand `scripts/test-flight-status.ts` to verify `401`/`403` staff-only `/api/flight-status` rejection, `evaluateFlightCheckEligibility` (`UNCONFIRMED`, `completed`/`cancelled`, `> 24h` future `unlocksAtIso`, `> 12h` past, `CONFIRMED` <= 24h, `asap`), and `400` `OUTSIDE_24H_WINDOW` server rejection with 0 upstream `fetchImpl` calls.
  - [x] 38.B.4.2 Run `npm run typecheck`, `npm run build`, `npx tsx scripts/test-flight-status.ts`, and `npm run test:e2e` with 0 errors, then mark Phase 38.B complete in `tasks.md`.

## Phase 39 (Wave 2 Phase 1): Unified Multi-Channel Thread Engine, Serverless Telephony Persistence & Security Hardening
- [x] 39.1 Specification & Plan Sync:
  - [x] 39.1.1 Confirm clean git status at `c3c11b4` and update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 39 scope and architecture.
- [x] 39.2 Multi-Channel Domain Types, Unified Contact Resolution & WorkspaceBus Events:
  - [x] 39.2.1 Create `app/core/types/comms.ts` (`CommsChannel`, `CommsDirection`, `CommsEventType`, `CommsThread`, `CommsEvent`, deterministic ID builders) and export from `app/core/types/index.ts`.
  - [x] 39.2.2 Extend `app/core/services/customer/contact.service.ts` (and regional profiles) with `normalizeEmail`, `getContactByEmail`, `resolveUnifiedContact`, `resolveCanonicalThreadId`, and pure thread-merge support.
  - [x] 39.2.3 Extend `WorkspaceEventMap` in `app/core/services/workspace-bus.service.ts` with `COMMS_EVENT_RECORDED`, `OPEN_COMMS_THREAD`, and `OPEN_EMAIL_MESSAGE`.
- [x] 39.3 Client & Server Multi-Channel Thread Services:
  - [x] 39.3.1 Create `app/core/services/comms/comms-thread.service.ts` with Firestore `onSnapshot` (`sanitizePayload`), `localStorage` + `WorkspaceBus` sync, rollup/thread-merge operations (`recordCommsEvent`, `addInternalNote`, `markThreadRead`, `markThreadsUnread`, `archiveThreads`, `linkTripToThread`, `mergeThreadsForContact`), and `InteractionEvent` adapters.
  - [x] 39.3.2 Create `app/core/services/comms/comms-thread.server.ts` with idempotent Firestore REST persistence (`/commsThreads`, `/commsEvents`, `/telephonyWebhookEvents`) and bounded `commsServerStore` buffer flushed on `sync_comms`.
- [x] 39.4 Serverless Telephony Extraction, Firestore Persistence & Security Hardening:
  - [x] 39.4.1 Create `app/core/services/comms/telephony-gateway.server.ts` (`verifyTwilioWebhookSignature`, full `GET`/`POST` staff auth gates, HMAC-signed `audio_proxy` URLs, `comms-thread.server.ts` ingestion, and `sync_comms`) and refactor `app/routes/api.telephony.ts` into a `0.00 kB` client-chunk wrapper.
  - [x] 39.4.2 Update `comms-types.ts`, `CommsHub.tsx`, `SmsThreadPane.tsx`, `VoicemailCallLogPane.tsx`, `EmailDock.tsx`, `dispatch.tsx`, and `telephony.service.ts` to integrate `CommsThreadService`, `authorizedFetch`, signed audio playback, internal notes, email timeline cards, and `OPEN_COMMS_THREAD` / `OPEN_EMAIL_MESSAGE` cross-dock navigation.
- [x] 39.5 Firestore Security Rules:
  - [x] 39.5.1 Update `firestore.rules` with explicit staff-scoped blocks (`allow read, write: if isDispatcher();`) for `/commsThreads/{threadId}`, `/commsEvents/{eventId}`, and `/telephonyWebhookEvents/{eventId}`.
- [x] 39.6 Verification & Build Gates:
  - [x] 39.6.1 Create and run `scripts/test-comms-threads-telephony.ts` verifying unified contact/thread resolution & merging, `verifyTwilioWebhookSignature`, idempotent webhook ingestion, `GET`/`POST /api/telephony` auth + signed `audio_proxy` gates, and `firestore.rules`.
  - [x] 39.6.2 Run `npx tsx scripts/test-flight-status.ts`, `npm run test:e2e`, `npm run typecheck`, and `npm run build` (confirming `0.00 kB` client chunks for `api.telephony` and `api.flight-status`), then mark Phase 39 complete in `tasks.md`.

## Phase 40 (Wave 2 Phase 2): Single-Mailbox Dispatch Email Backend (`dispatch@chesterfieldtaxi.com`), Resend Inbound Webhook & Outbound Thread Sync
- [x] 40.0 Baseline Hygiene & Specification Sync:
  - [x] 40.0.1 Commit reviewed Phase 39 baseline cleanly (`feat(phase-39): add unified multi-channel thread engine, serverless telephony persistence, and webhook auth hardening`).
  - [x] 40.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 40 scope and architecture.
- [x] 40.1 Dispatch Email Schema, HTML Sanitizer & Deterministic Email-to-Booking Parser:
  - [x] 40.1.1 Create `app/core/types/dispatch-email.ts` (`DISPATCH_MAILBOX_ADDRESS = 'dispatch@chesterfieldtaxi.com'`, `DispatchEmailFolder`, `DispatchEmailDeliveryStatus`, `DispatchEmailCategory`, `DispatchEmailAttachmentMeta`, `DispatchEmailRecord`, `EmailWebhookEventRecord`, `DispatchEmailDiagnosticsSummary`) and re-export from `app/core/types/index.ts`.
  - [x] 40.1.2 Create pure `app/core/services/email/email-booking-parser.ts` (`normalizeEmailSubject`, `sanitizeDispatchEmailHtml`, `htmlToPlainText`, `extractSuggestedBookingFromEmail`) and re-export from `app/core/services/email/index.ts`.
- [x] 40.2 Server-Isolated Dispatch Email Store & Resend Svix Webhook:
  - [x] 40.2.1 Create `app/core/services/email/dispatch-email.server.ts` (`verifyResendWebhookSignature`, `dispatchEmailServerStore` + Firestore REST persistence, `email.received` single-mailbox ingestion + Resend Receiving API fetch + RFC/contact thread correlation + `ingestCommsEventServer`, delivery status reconciliation, `diagnostics=1`, and `sync_emails`).
  - [x] 40.2.2 Create thin `app/routes/api.email.webhook.ts` (`0.00 kB` client chunk) and register `api/email/webhook` in `app/routes.ts`.
- [x] 40.3 Outbound `/api/send-email` RFC Threading & Multi-Channel Sync:
  - [x] 40.3.1 Update `app/core/services/email/types.ts`, `app/core/services/email/resend-email.service.ts`, and `app/routes/api.send-email.ts` (delegating server persistence to `dispatch-email.server.ts` so `api.send-email` remains `0.00 kB` client chunk) to attach RFC `Message-ID`/`In-Reply-To`/`References` headers, record outbound customer/corporate emails + `email_outbound` `CommsEvent`s, record public `contact_inquiry` as inbound `inquiries`/`website_inquiry` + `email_inbound` `CommsEvent`, and keep `dispatcher_alert` off customer threads.
- [x] 40.4 Firestore Security Rules & Admin Integrations Diagnostics Card:
  - [x] 40.4.1 Add staff-only rules (`allow read, write: if isDispatcher();`) for `/dispatchEmails/{emailId}` and `/emailWebhookEvents/{eventId}` in `firestore.rules`.
  - [x] 40.4.2 Add **Dispatch Email (`dispatch@chesterfieldtaxi.com`) & Resend Inbound Webhook** readiness card to `app/components/domain/admin/subpages/AdminIntegrationsSubpage.tsx`.
- [x] 40.5 Verification & Build Gates:
  - [x] 40.5.1 Create and run `scripts/test-dispatch-email-webhook.ts` covering Svix signature verification, `email.received` + Receiving API fetch + XSS sanitization + booking extraction + multi-channel thread linkage + idempotency, RFC reply correlation + `email.delivered`/`email.bounced` reconciliation, outbound `/api/send-email` + `contact_inquiry` + `dispatcher_alert` thread rules, staff auth gates, and `firestore.rules`.
  - [x] 40.5.2 Run `npx tsx scripts/test-comms-threads-telephony.ts`, `npx tsx scripts/test-flight-status.ts`, `npm run test:e2e`, `npm run typecheck`, and `npm run build` (`0.00 kB` client chunks for `api.email.webhook`, `api.send-email`, `api.telephony`, and `api.flight-status`).

## Phase 41 (Wave 2 Phase 3): Dedicated `EmailDock` Client Overhaul (Live Folders, Threaded Composer & Cross-Channel Sender Timeline)
- [x] 41.0 Baseline Hygiene & Specification Sync:
  - [x] 41.0.1 Commit reviewed Phase 40 baseline cleanly (`feat(phase-40): add single-mailbox dispatch email backend, Svix Resend webhook, and outbound thread sync`).
  - [x] 41.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 41 scope and architecture.
- [x] 41.1 Client Dispatch Email Service, Drafts & Canned Templates:
  - [x] 41.1.1 Add `EMAIL_STATE_CHANGED` to `WorkspaceEventMap` in `app/core/services/workspace-bus.service.ts`.
  - [x] 41.1.2 Create `app/core/services/email/dispatch-email.service.ts` (Firestore `/dispatchEmails` `onSnapshot` + `/api/email/webhook?action=sync_emails` sync, `ct_dispatch_emails_v1` & `ct_dispatch_email_drafts_v1` storage, 9 smart folder views, `CommsThreadService` read/archive sync, `DispatchEmailDraft` lifecycle, zero-duplicate `sendComposerEmail`, `CANNED_DISPATCH_EMAIL_TEMPLATES` + `interpolateDispatchEmailTemplate`, `POPULATE_BOOKING` mapper, and cross-channel sender timeline resolver) and export from `app/core/services/email/index.ts`.
- [x] 41.2 Modular Dedicated `EmailDock` UI (`app/components/domain/dispatch/email/*` + `EmailDock.tsx`):
  - [x] 41.2.1 Create `EmailFolderToolbar.tsx` (`dispatch@chesterfieldtaxi.com` header, 9 folder pills + badges, `/` search shortcut, `Unread Only`, `Sync`, and multi-select Batch Action Bar).
  - [x] 41.2.2 Create `EmailMessageListPane.tsx` (high-density message/draft rows, thread count badge, delivery status pills, attachment & category/VIP/Corporate chips, star toggle, multi-select checkboxes, and `useBottomSheetDragToClose` mobile action sheet).
  - [x] 41.2.3 Create `EmailReaderPane.tsx` (chronological threaded conversation viewer with collapsible older messages, `sanitizeDispatchEmailHtml` rendering, bounce/failure banner, attachment chips, Extracted Booking Card + `POPULATE_BOOKING`, and Reply/Reply-All/Forward actions).
  - [x] 41.2.4 Create `EmailComposerPane.tsx` (inline Reply/Reply-All/Forward + New Email composer, `ContactService` autocomplete, collapsible `Cc`, Canned Template dropdown, 1-tap Tracking & Pay link insertion via `getPayLinkService()`, auto-saved draft indicator, and `Cmd/Ctrl + Enter` send).
  - [x] 41.2.5 Create `EmailCrossChannelRail.tsx` (Unified Customer Activity & Trips panel showing chronologically interleaved `Calls + SMS + Voicemails + Notes + Emails`, matched `Trip` cards with 1-tap Open/Rebook/Tracking/Pay actions, `Open in Comms Hub`, and `Call Customer`) and orchestrate in `EmailDock.tsx`.
- [x] 41.3 Workspace Integration (`dispatch.tsx` & `dispatch.popout.tsx`):
  - [x] 41.3.1 Pass `trips` and `onOpenEditTrip` into `<EmailDock />` in `app/routes/dispatch.tsx` and `app/routes/dispatch.popout.tsx` (plus `DispatchBookingEngine.tsx` airline/flight hydration on `POPULATE_BOOKING`), and surface live unread email count on Dispatch `Email` dock/mobile badges.
- [x] 41.4 Verification & Build Gates:
  - [x] 41.4.1 Create and run `scripts/test-email-dock-service.ts` verifying all 9 folder views & badges, `DispatchEmailService` <-> `CommsThreadService` (`unreadByChannel.email`) sync, auto-saved draft lifecycle & zero-duplicate `sendComposerEmail`, all 6 canned templates + `POPULATE_BOOKING` mapping, and cross-channel sender timeline resolution (`amanda.vance@bayer.com` + `+13145550199`).
  - [x] 41.4.2 Run `npx tsx scripts/test-dispatch-email-webhook.ts`, `npx tsx scripts/test-comms-threads-telephony.ts`, `npx tsx scripts/test-flight-status.ts`, `npm run test:e2e`, `npm run typecheck`, and `npm run build` (confirming `0.00 kB` `/api/*` client chunks), then mark Phase 41 complete in `tasks.md`.

## Phase 42 (Wave 2 Phase 4): `CommsHub` Multi-Channel Thread UI/UX, Canned SMS Templates & Live Caller CRM Context
- [x] 42.0 Baseline Hygiene & Specification Sync:
  - [x] 42.0.1 Commit reviewed Phase 41 baseline cleanly (`feat(phase-41): overhaul dedicated EmailDock client with live folders, drafts, canned templates, and cross-channel sender rail`).
  - [x] 42.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 42 scope and architecture.
- [x] 42.1 Pure Canned SMS Templates & CRM Context Domain Service (`comms-templates.service.ts`):
  - [x] 42.1.1 Create `app/core/services/comms/comms-templates.service.ts` with `CANNED_DISPATCH_SMS_TEMPLATES` (`driver_en_route`, `driver_arrived`, `airport_curbside`, `reservation_confirmed`, `payment_link`, `flight_checkin`), pure `interpolateCommsSmsTemplate` (with `resolveStlTerminalInfo` STL T1/T2 + SUS FBO guidance and zero leftover `{...}` placeholders), `resolveCommsCrmContext`, and pure multi-channel thread grouping/filtering helpers; export from `app/core/services/comms/index.ts`.
- [x] 42.2 Multi-Channel Thread List, Timeline & Composer Power Tools (`CommsHub.tsx` & `app/components/domain/dispatch/comms/*`):
  - [x] 42.2.1 Sync `DispatchEmailService` into `CommsHub.tsx` (`ensureCommsMirrorSynced` + `syncWithServer`), upgrade thread selection & `SmsThreadPane` (`mode === 'list'`) for phone, email, and unified phone+email threads with `SMS`/`Call`/`VM`/`Email`/`Note` badges & unread counts, and support `all`/`calls`/`voicemail`/`messages`/`emails`/`notes` filtering in `CommsFilterToolbar` / `VoicemailCallLogPane`.
  - [x] 42.2.2 Upgrade `SmsThreadPane` (`mode === 'thread'`) with Email delivery status pills (`Received`, `Sent`, `Delivered`, `Bounced`/`Failed`), linked trip badge, `Book`, and 1-tap **"Open in Email Dock"** (`OPEN_EMAIL_MESSAGE` + `FOCUS_MODULE: 'email'`), **1-Tap Retry** on failed/undelivered outbound SMS bubbles, `Call` | `Email` | `Book` header actions, and `SMS Reply` vs `Internal Note` composer mode toggle.
  - [x] 42.2.3 Replace hardcoded SMS chips in `SmsThreadPane.tsx` and `NewSmsMessageModal` with dynamic `CANNED_DISPATCH_SMS_TEMPLATES` interpolated from `CommsCrmContextSummary`, plus **1-Tap Insert Tracking Link** (`/track/...`) and **1-Tap Insert Pay Link** (`/pay/...` via `getPayLinkService()`) buttons.
- [x] 42.3 Live Caller / Thread CRM Context Banner & Keyboard Shortcuts:
  - [x] 42.3.1 Create `app/components/domain/dispatch/comms/CommsCrmContextBanner.tsx` and wire into `SmsThreadPane.tsx` and `SoftphoneDialerPane.tsx` (active/ringing calls AND live dialpad lookup) surfacing VIP badge, Blacklist alert banner, Corporate Account pill, Accessibility/Vehicle tags, Active/Upcoming Trip pill (`Car #`, flight delay badge, 1-tap **Open Trip**), and 1-tap **Rebook Last Ride** (`POPULATE_BOOKING`).
  - [x] 42.3.2 Add keyboard ergonomics in `CommsHub.tsx` + `SmsThreadPane.tsx` (`/` search focus, `Cmd/Ctrl + Enter` submit SMS or Internal Note, `Escape` close modal/sheet or exit thread back to list).
- [x] 42.4 Verification & Build Gates:
  - [x] 42.4.1 Create and run `scripts/test-comms-multichannel-ui.ts` verifying all 6 canned SMS templates + STL T1/T2/SUS FBO interpolation + zero raw `{...}` tokens, `resolveCommsCrmContext`, multi-channel thread list/timeline interleaving + filtering + `OPEN_EMAIL_MESSAGE` / `OPEN_COMMS_THREAD` routing, and `constitution.md` guardrails.
  - [x] 42.4.2 Run `npx tsx scripts/test-email-dock-service.ts`, `npx tsx scripts/test-dispatch-email-webhook.ts`, `npx tsx scripts/test-comms-threads-telephony.ts`, `npx tsx scripts/test-flight-status.ts`, `npm run test:e2e`, `npm run typecheck`, and `npm run build` (`0.00 kB` `/api/*` client chunks), then mark Phase 42 complete in `tasks.md`.

## Phase 43 (Wave 2 Phase 5): Production Cutover Readiness, Firestore Rules/Indexes Alignment & Headless Browser Smoke Suite
- [x] 43.0 Baseline Hygiene & Specification Sync:
  - [x] 43.0.1 Commit reviewed Phase 42 baseline cleanly (`feat(phase-42): upgrade CommsHub multi-channel threads, dynamic canned SMS templates, and live caller CRM context`).
  - [x] 43.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 43 scope and architecture.
- [x] 43.1 Firestore Rules Audit & Composite Indexes (`firestore.rules` + `firestore.indexes.json`):
  - [x] 43.1.1 Audit and harden CEL-safe map key checks (`'key' in map`) and strict role/tenant boundaries across `/users`, `/trips`, `/tripTracking`, `/tripTrackingLookup`, `/payLinks`, `/paymentWebhookEvents`, `/flightStatusCache`, `/commsThreads`, `/commsEvents`, `/telephonyWebhookEvents`, `/dispatchEmails`, `/emailWebhookEvents`, `/corporateAccounts`, `/corporateLookup`, and `/invoices` in `firestore.rules`.
  - [x] 43.1.2 Update `firestore.indexes.json` (preserving the 2 existing `trips` indexes) to add composite indexes for `trips` (`corporateAccountId` + `createdAt` DESC, `corporateAccountId` + `scheduledPickupTime` DESC), `invoices` (`corporateAccountId` + `issuedDate` DESC), `commsEvents` (`threadId` + `timestampMs` ASC/DESC), and `dispatchEmails` (`folder` + `timestampMs` DESC, `threadId` + `timestampMs` ASC).
- [x] 43.2 Production Build Server Runner & `puppeteer-core` Headless Browser Smoke Suite:
  - [x] 43.2.1 Create `scripts/serve-prod-build.ts` exporting `startProdBuildServer({ port?: number })` + direct CLI execution (locating `build/server/index.js` or `build/server/nodejs_*/index.js` via `pathToFileURL`, serving `build/client` + `public` assets with accurate `Content-Type` headers, and forwarding SSR/API requests to `@react-router/node`'s `createRequestListener`), and update `package.json` `"start"` and `"test:smoke"` scripts.
  - [x] 43.2.2 Create `scripts/test-browser-smoke.ts` using `puppeteer-core` verifying zero React hydration mismatches (`#418` / `#423` / `Hydration failed`) & zero `pageerror` exceptions across all 12 public/customer routes, PWA/manifest/SW integrity, `/api/*` JSON & `401`/`403` unauthenticated security checks, and all 7 `/app*` workspaces with clean `finally` teardown.
- [x] 43.3 Full Wave 1 + Wave 2 Master Verification Gate:
  - [x] 43.3.1 Fix returning-visitor SSR/client `localStorage` hydration mismatches (`#418`) uncovered by real Chromium rendering across `root.tsx`, `layout.tsx`, `Navbar.tsx`, `Footer.tsx`, `services.tsx`, `contact.tsx`, `BookingEngineV2.tsx`, `VehicleTierSelector.tsx`, `StripePaymentInput.tsx`, `pay.$payToken.tsx`, `dispatch.tsx`, and `admin.tsx`, then pass `npm run typecheck`, `npm run build` (confirming all 13 `/api/*` client chunks remain `0.00 kB`), `npm run test:smoke`, `npm run test:e2e`, `npm run test:stress`, and all 9 Wave 1 + Wave 2 test suites.

## Phase 44 (Wave 3 Phase 1): Server/Client Bundle Separation & Route-Level Lazy Chunking
- [x] 44.0 Specification & Plan Sync:
  - [x] 44.0.1 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 44 scope, architectural guardrails, and bundle budget targets.
- [x] 44.1 Zero-KB `/api/public-config` Client Chunk (`public-settings.server.ts`):
  - [x] 44.1.1 Move `loadPublicSettingsForServer()` from `app/routes/api.public-config.ts` into `app/core/services/config/public-settings.server.ts` and update `app/routes/api.public-config.ts` and `app/routes/book.tsx` imports so all 14 `/api/*` routes compile to `0.00 kB` client chunks.
- [x] 44.2 Eliminate `email-templates` Browser Bundle Leak (`vehicle-tier-format.util.ts`):
  - [x] 44.2.1 Extract `formatVehicleTier` and `formatVehicleTierDisplay` into `app/core/utils/vehicle-tier-format.util.ts` (re-exporting from `app/core/services/email/email-templates.ts`) and update all 12 client/UI callers to import from `vehicle-tier-format.util.ts`.
  - [x] 44.2.2 Remove static top-level client imports of `resend` and `./email-templates` in `app/core/services/email/resend-email.service.ts` and `app/core/services/email/index.ts`, loading `resend` and `./email-templates` dynamically strictly inside server-side (`typeof window === 'undefined'`) paths.
- [x] 44.3 Per-Tab Code Splitting in `app/routes/admin.tsx`:
  - [x] 44.3.1 Convert all 14 Admin tab/subpage imports (`AdminDashboardTab`, `AdminGeneralTab`, `AdminRatesTab`, `AdminVehiclesTab`, `AdminZonesTab`, `AdminOperatorsTab`, `AdminAdvancedTab`, `AdminTripsSubpage`, `AdminInvoicingSubpage`, `AdminCustomersSubpage`, `AdminWebsiteTab`, `AdminArchiveTab`, `AdminIntegrationsSubpage`, `AdminRulesTab`) in `app/routes/admin.tsx` to `React.lazy()` wrapped in `<Suspense>` so `admin-*.js` drops `< 120 KB`.
- [x] 44.4 Lazy-Load Detached Pop-Outs & Secondary Dispatch Docks:
  - [x] 44.4.1 Extract `getContextualEmailMeta` and `sendDispatchContextualTripEmail` into `app/core/services/dispatch/dispatch-trip-email.util.ts` (re-exporting from `DispatchTripDetailsDrawer.tsx`) and update `app/routes/dispatch.tsx`.
  - [x] 44.4.2 Convert `CommsHub`, `EmailDock`, `DispatchBookingEngine`, and `LiveFleetMap` to `React.lazy()` + `<Suspense>` in `app/routes/dispatch.popout.tsx`.
  - [x] 44.4.3 Convert `CommsHub`, `EmailDock`, `AppSuiteLauncher`, and `DispatchTripDetailsDrawer` to `React.lazy()` + `<Suspense>` in `app/routes/dispatch.tsx`.
- [x] 44.5 Automated Bundle Budget Assertions & Master Verification Gate:
  - [x] 44.5.1 Extend `verifyCutoverConfigInvariants` in `scripts/test-browser-smoke.ts` to assert every `api.*.js` chunk is `< 1024` bytes (`0.00 kB`) and `admin-*.js` is `< 153600` bytes (`< 150 KB`).
  - [x] 44.5.2 Pass `npm run typecheck`, `npm run build`, `npm run test:smoke`, `npm run test:e2e`, `npx tsx scripts/test-dispatch-email-webhook.ts`, and `npx tsx scripts/test-email-dock-service.ts` with `0` errors, and leave changes uncommitted for Control-Tower review.

## Phase 45 (Wave 3 Phase 2): Dual Booking Engine Decomposition (`BookingEngineV2.tsx` & `DispatchBookingEngine.tsx`)
- [x] 45.0 Baseline Hygiene & Specification Sync:
  - [x] 45.0.1 Commit reviewed Phase 44 + Dispatch UX baseline cleanly (`feat(phase-44): server/client bundle split, lazy route chunking, and unified dispatch comms/fleet UX`).
  - [x] 45.0.2 Update `spec.md`, `plan.md`, and `tasks.md` with Platform Phase 45 scope, architecture, and line-count guardrails before starting Phase 45 code edits.
- [x] 45.1 Customer `BookingEngineV2.tsx` Decomposition (`< 1,600` lines):
  - [x] 45.1.1 Create `app/core/hooks/booking/useCustomerBookingSubmission.ts` (and export from `app/core/hooks/booking/index.ts`) encapsulating customer form state types/defaults, debounced outbound/return quote calculation, validation, Stripe pre-auth, corporate PO verification, multi-car web splitting, linked return creation, and email dispatch.
  - [x] 45.1.2 Create `CustomerRouteTimingSection.tsx`, `CustomerVehicleExtrasSection.tsx`, `CustomerReturnTripSection.tsx`, `CustomerPassengerNotesSection.tsx`, and `CustomerPaymentSection.tsx` under `app/components/domain/booking/sections/`.
  - [x] 45.1.3 Refactor `app/components/domain/BookingEngineV2.tsx` (`< 1,600` lines) to compose the extracted section components and submission hook while preserving 100% of public props, exports (`formatUsPhone`, `formatTime12h`, `COMMON_FBO_FACILITIES`, etc.), and SSR hydration determinism.
- [x] 45.2 Operator `DispatchBookingEngine.tsx` Decomposition (`< 1,700` lines):
  - [x] 45.2.1 Create `app/components/domain/dispatch/booking/useDispatchBookingSubmission.ts` encapsulating draft/edit hydration & snapshot helpers, debounced outbound/return 4-pillar quote calculation, and single-car / multi-car convoy / edit-split / linked-return / recurring-schedule / confirmation-email submission workflow.
  - [x] 45.2.2 Create `DispatchConvoyBanners.tsx`, `DispatchRoutingTimingSection.tsx`, `DispatchPassengerCrmSection.tsx`, `DispatchExtrasVehicleSection.tsx`, `DispatchPaymentAssignmentSection.tsx`, `DispatchReturnRepeatSection.tsx`, and `DispatchBookingFooterBar.tsx` under `app/components/domain/dispatch/booking/`.
  - [x] 45.2.3 Refactor `app/components/domain/dispatch/DispatchBookingEngine.tsx` (`< 1,700` lines) to compose the extracted operator modules and submission hook while keeping `DispatchBookingEngine` (`React.memo`) and `DispatchFormValues` exports 100% intact.
- [x] 45.3 Monolith Prevention Guardrail & Master Verification Gate:
  - [x] 45.3.1 Extend `verifyCutoverConfigInvariants` in `scripts/test-browser-smoke.ts` to assert both `app/components/domain/BookingEngineV2.tsx` and `app/components/domain/dispatch/DispatchBookingEngine.tsx` remain `< 1800` lines.
  - [x] 45.3.2 Pass `npm run typecheck`, `npm run build`, `npm run test:smoke`, `npm run test:e2e`, and `npm run test:stress` with `0` errors, mark Phase 45 complete in `tasks.md`, and leave Phase 45 changes uncommitted for Control-Tower review.

