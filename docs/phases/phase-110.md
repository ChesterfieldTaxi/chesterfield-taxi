# Phase 110: Driver Flight Tracker Redesign

## Goal
Redesign the commercial flight section inside `DriverTripManifest` to eliminate the 3x duplication of flight information and replace it with a clean, structured flight tracker. The redesigned component displays scheduled vs. updated departure and arrival times, color-coded delay/on-time status, arrival terminal, inline luggage/gate/baggage details, and a "Check Flight" external browser link.

## Design Decisions
- **Eliminate Duplication:**
  - Show the airline + flight number once in the card header alongside a single color-coded status pill (`On Time`, `Delayed +Xm`, `Landed`, `Cancelled`, `Diverted`, or `Scheduled`).
  - Suppress redundant legacy `[Flight: ...]` strings in `trip.flightNotes` whenever structured flight metadata or `flightTelemetry` is present; render only non-flight notes if any remain.
  - Display the arrival terminal in the Arrival section and avoid repeating it inside the Curbside Door guidance bar when already shown.
  - Render `Checked Luggage` as a compact inline pill alongside `Gate` and `Baggage Belt` rather than a separate sentence.
- **Responsive Full vs. Compact Layout:**
  - **Full (`compact={false}` — Active Trip HUD):** Two-column Departure → Arrival grid (`Origin` ✈ `Destination · Terminal`) showing `Scheduled` and `Updated` times for both legs, plus a logistics pills row and Curbside Door footer. When `trip.flightTelemetry` times are unavailable, show the route + terminal cleanly with a muted fallback note.
  - **Compact (`compact={true}` — Offers & Scheduled Cards):** Condensed single-row summary with Flight #, Route (`SLC → STL`), color-coded status/delay badge, estimated arrival time + terminal (`T1`/`T2`), and a compact `Check Flight ↗` link.
- **Color-Coding Rules:**
  - **On Time / Early / Landed:** Emerald (`emerald-300`) for updated times and status pill.
  - **Delayed:** Amber (`amber-300`) for moderate delays (`< 45m`), Rose (`rose-300`) for severe delays (`>= 45m`), with scheduled time struck through (`line-through text-slate-400`) and updated time highlighted.
  - **Cancelled / Diverted:** Rose (`rose-300`) status pill and muted/struck-through times.
- **External "Check Flight" Browser Link:**
  - Include a `Check Flight ↗` link (`target="_blank" rel="noopener noreferrer"`) built by a pure service helper so drivers can open live flight status in their device browser even when `trip.flightTelemetry` is missing or stale.
- **Constitution Alignment (`constitution.md`):**
  - Keep all flight view-model formatting, time/delay tone resolution, `flightNotes` deduplication, and external URL generation in `app/core/services/flight/flight-status.service.ts`. `DriverTripManifest.tsx` strictly consumes the resolved view-model.

## Files to Touch
- `app/core/services/flight/flight-status.service.ts` — Add `DriverFlightTrackerModel` type and pure `resolveDriverFlightTrackerModel(trip)` helper (scheduled/updated departure & arrival formatting, delay/status tone, terminal & curbside guidance normalization, redundant `flightNotes` filtering, and external flight tracker URL builder).
- `app/components/domain/driver/DriverTripManifest.tsx` — Replace the commercial flight JSX block with the redesigned Full (`compact=false`) and Compact (`compact=true`) flight tracker UI consuming `resolveDriverFlightTrackerModel(trip)`, while keeping Private Aviation (`FBO / Tail #`) intact.

## Tasks
- [x] Add `DriverFlightTrackerModel` and `resolveDriverFlightTrackerModel(trip)` to `app/core/services/flight/flight-status.service.ts` to compute airline/flight display, route (`originIata` → `destinationIata`), scheduled & updated departure/arrival times, color-coded status/delay tone (`emerald` | `amber` | `rose` | `blue` | `slate`), arrival terminal, non-redundant curbside guidance, filtered `remainingFlightNotes`, and `externalFlightUrl`.
- [x] Update the commercial aviation section in `app/components/domain/driver/DriverTripManifest.tsx` to consume `resolveDriverFlightTrackerModel(trip)` and render the full 2-column Departure → Arrival tracker when `compact={false}` and the condensed 1-row summary when `compact={true}`.
- [x] Ensure `Check Flight ↗` opens in a new browser tab (`target="_blank" rel="noopener noreferrer"`, `e.stopPropagation()` so parent card click handlers don't misfire).
- [x] Verify `Checked Luggage`, `Gate`, and `Baggage Belt` render as clean inline pills, and legacy `[Flight: ...]` notes are suppressed when structured flight data is present.
- [x] Run `npm run typecheck` and `npm run build` to verify zero TypeScript or Vite/React Router build errors.

## Verification
- `npm run typecheck`
- `npm run build`
