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
