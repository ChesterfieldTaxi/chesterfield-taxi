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


