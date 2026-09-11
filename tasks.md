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

## Phase 16: Form Layout Versioning (v1 vs v2) & Admin Layout Switcher
- [x] 16.1 Update specifications (`spec.md` Section 12) and task tracking (`tasks.md`).
- [x] 16.2 Add `publicFormVersion: 'v1' | 'v2'` to system configuration models in `app/config/companyConfig.ts` (defaulting to 'v2'), `app/core/types/config.ts`, and `admin-config.service.ts`.
- [x] 16.3 Build `BookingEngineV2.tsx` recreating the user's mockup layout (pickup time, trip details, flight tracking, steppers, vehicle cards, special requests, return trip, passenger/booker info, instructions, payment cards, floating `?` FAB, sticky footer with emerald Book Ride CTA).
- [x] 16.4 Update `app/routes/book.tsx` with dynamic layout resolution (rendering V2 by default or V1 based on Firestore config, with `?layout=v1` / `?layout=v2` query preview support).
- [x] 16.5 Implement Admin Layout Switcher in `AdminGeneralTab.tsx` and register dedicated `/admin/settings` route in `app/routes.ts` (`app/routes/admin.settings.tsx`).
- [x] 16.6 Run `npm run typecheck` and `npm run build` to confirm zero errors, and generate walkthrough documentation.


