# Master Task List - Chesterfield Taxi Web App
**Last Updated:** November 23, 2025  
**Status:** Development Phase - Week 1 Complete

---

## ✅ Completed Tasks

### Week 1: Booking Form UX Refinements (Nov 22-23, 2025)
- [x] Add "Checked Luggage" toggle to flight information
- [x] Create `InstructionsV3` component (gate code + driver notes)
- [x] Make gate code collapsible with "+ Add Gate Code" toggle
- [x] Update button text consistency ("+ Add Car Seats")
- [x] Restructure form sections (Contact → Instructions → Payment)
- [x] Fix duplicate props in `ContactInfoV3`
- [x] Resolve JSX nesting errors in `BookingFlowV3`
- [x] Commit and push changes to GitHub
- [x] Comprehensive codebase analysis

---

## 🔄 In Progress

_No active tasks currently in progress_

---

## 📋 Planned Tasks (Priority Order)

### Phase 1: Foundation (Week 2)

#### Group 1: Company Config Site-Wide (HIGH PRIORITY)
**Estimated:** 2-3 days  
**Impact:** HIGH | **Complexity:** LOW

- [ ] Update `Footer.tsx` to use `useCompanyConfig`
  - [ ] Import hook  
  - [ ] Replace hard-coded phone (line 15)
  - [ ] Replace hard-coded email (line 16)
  - [ ] Add fallback values

- [ ] Update `Contact.tsx` to use `useCompanyConfig`
  - [ ] Import hook
  - [ ] Replace phone number (line 41)
  - [ ] Replace emails (lines 45-46)
  - [ ] Replace address (lines 50-53)
  - [ ] Update form submit email

- [ ] Update `HelpFAB.tsx` to use `useCompanyConfig`
  - [ ] Import hook
  - [ ] Replace phone number (line 84-85)
  - [ ] Replace email (line 90)

- [ ] Global search & replace
  - [ ] Find all `+13147380100` instances
  - [ ] Find all `info@chesterfield` instances
  - [ ] Find all hard-coded addresses
  - [ ] Replace with config values

- [ ] Testing
  - [ ] Verify footer displays correct info
  - [ ] Verify contact page displays correct info
  - [ ] Verify FAB displays correct info
  - [ ] Test config changes reflect site-wide

---

#### Group 2: Auto-Save Booking Progress (HIGH PRIORITY)
**Estimated:** 1-2 days  
**Impact:** VERY HIGH | **Complexity:** MEDIUM

- [ ] Create `hooks/usePersistedState.ts`
  - [ ] Generic localStorage wrapper
  - [ ] Auto-save on change (debounced)
  - [ ] Auto-restore on mount
  - [ ] Type-safe implementation

- [ ] Create `hooks/usePersistedBookingForm.ts`
  - [ ] Wrap `useBookingFormV3`
  - [ ] Save to `localStorage` key: `booking_draft`
  - [ ] Restore on page load
  - [ ] Clear after successful booking
  - [ ] Handle parse errors gracefully

- [ ] Add UI feedback
  - [ ] Create "Progress saved" toast/indicator
  - [ ] Show on debounced state changes
  - [ ] Style consistently with app

- [ ] Update `BookingFlowV3` to use persisted hook
  - [ ] Replace `useBookingFormV3` with `usePersistedBookingForm`
  - [ ] Call `clearSaved()` on successful submission
  - [ ] Test restore functionality

- [ ] Testing
  - [ ] Test save/restore works
  - [ ] Test clear after booking
  - [ ] Test with corrupted data
  - [ ] Performance test (no lag)

---

#### Group 3: Performance & Polish (MEDIUM PRIORITY)
**Estimated:** 2-3 days  
**Impact:** MEDIUM | **Complexity:** MEDIUM

- [ ] Fix Google Maps warnings
  - [ ] Verify API key loading
  - [ ] Ensure `&libraries=places` added only once
  - [ ] Add useEffect cleanup for listeners
  - [ ] Test in console (zero warnings)

- [ ] Add loading states to autocomplete
  - [ ] Add `isLoading` boolean to `AutocompleteDropdown`
  - [ ] Show spinner in input during fetch
  - [ ] Disable input while loading
  - [ ] Style loading indicator

- [ ] Optimize distance calculation
  - [ ] Install/import lodash.debounce
  - [ ] Wrap `calculateDistance` with 300ms debounce
  - [ ] Memoize with `useCallback`
  - [ ] Cancel pending requests on unmount

- [ ] Performance profiling
  - [ ] Use React DevTools Profiler
  - [ ] Identify expensive re-renders
  - [ ] Add `React.memo` to pure components
  - [ ] Optimize context providers

- [ ] Testing
  - [ ] Lighthouse audit (target: >90 score)
  - [ ] Test autocomplete smoothness
  - [ ] Verify no lag on typing

---

### Phase 2: Cleanup (Week 3)

#### Group 4: Legacy Code Removal (LOW PRIORITY)
**Estimated:** 1 day  
**Impact:** LOW | **Complexity:** LOW

- [ ] Create archive directory
  - [ ] Create `src/archive/` folder
  - [ ] Add README explaining archive

- [ ] Archive V1 booking components
  - [ ] Move `src/components/booking/` → `src/archive/booking_v1/`
  - [ ] Update any imports (should be none)

- [ ] Archive V2 booking components
  - [ ] Move `src/components/booking_v2/` → `src/archive/booking_v2/`
  - [ ] Update any imports (should be none)

- [ ] Archive old booking form
  - [ ] Move `BookingForm.tsx` → `archive/`
  - [ ] Update documentation

- [ ] Cleanup & commit
  - [ ] Remove empty directories
  - [ ] Update README with archive info
  - [ ] Commit with clear message: "Archive legacy booking components (V1, V2)"

---

#### Group 5: Confirmation Page Final Polish (MEDIUM PRIORITY)
**Estimated:** 1 day  
**Impact:** MEDIUM | **Complexity:** LOW

- [ ] Cross-browser print testing
  - [ ] Test Chrome print view
  - [ ] Test Firefox print view
  - [ ] Test Safari print view
  - [ ] Verify all data displays correctly

- [ ] Add receipt features
  - [ ] Add "Download Receipt" button
  - [ ] Generate PDF or formatted print view
  - [ ] Add "Share" option

- [ ] Responsive design validation
  - [ ] Test on mobile (320px width)
  - [ ] Test on tablet (768px width)
  - [ ] Test on desktop (1920px width)

- [ ] Accessibility check
  - [ ] Run Lighthouse accessibility audit
  - [ ] Add ARIA labels where needed
  - [ ] Ensure keyboard navigation works

---

### Phase 3: Production Prep (Weeks 4-5)

#### Group 6: Firebase Integration (CRITICAL PRIORITY)
**Estimated:** 5-7 days  
**Impact:** CRITICAL | **Complexity:** HIGH

- [ ] Firebase project setup
  - [ ] Create Firebase project
  - [ ] Enable Firestore
  - [ ] Configure security rules
  - [ ] Set up authentication (for admin)

- [ ] Firestore data migration
  - [ ] Create `company_config` collection
  - [ ] Migrate mock data to Firestore
  - [ ] Create `pricing_rules` collection
  - [ ] Migrate pricing rules to Firestore

- [ ] Update hooks for Firestore
  - [ ] Modify `useCompanyConfig` to use Firestore listener
  - [ ] Modify `usePricingRules` to use Firestore listener
  - [ ] Add error handling
  - [ ] Add loading states

- [ ] Booking submission API
  - [ ] Create `bookings` collection schema
  - [ ] Implement `submitBooking` function
  - [ ] Add booking reference generation
  - [ ] Store booking in Firestore

- [ ] Notification system
  - [ ] Set up Firebase Functions
  - [ ] Integrate SendGrid for emails
  - [ ] Integrate Twilio for SMS
  - [ ] Create email templates
  - [ ] Create SMS templates

- [ ] Environment configuration
  - [ ] Set up `.env` files (dev, staging, prod)
  - [ ] Add Firebase config to env vars
  - [ ] Add API keys to env vars
  - [ ] Document environment setup

- [ ] Testing
  - [ ] Test Firestore reads/writes
  - [ ] Test booking submission end-to-end
  - [ ] Test email delivery
  - [ ] Test SMS delivery

---

#### Group 7: Testing Suite (HIGH PRIORITY)
**Estimated:** 3-5 days  
**Impact:** HIGH | **Complexity:** MEDIUM

- [ ] Set up testing infrastructure
  - [ ] Install Jest
  - [ ] Install React Testing Library
  - [ ] Install Cypress or Playwright
  - [ ] Configure test runners

- [ ] Unit tests - Pricing engine
  - [ ] Test base fare calculation
  - [ ] Test distance calculation
  - [ ] Test surcharges (airport, time, etc.)
  - [ ] Test vehicle multipliers
  - [ ] Test car seat fees
  - [ ] Edge cases (zero distance, etc.)

- [ ] Unit tests - Hooks
  - [ ] Test `useBookingFormV3` state management
  - [ ] Test `usePersistedBookingForm` save/restore
  - [ ] Test `useCompanyConfig` memoization
  - [ ] Test `usePricingRules`

- [ ] Integration tests - Booking flow
  - [ ] Test location selection
  - [ ] Test time selection
  - [ ] Test passenger/luggage counter
  - [ ] Test vehicle selection
  - [ ] Test form validation
  - [ ] Test submission

- [ ] E2E tests
  - [ ] Complete booking flow (happy path)
  - [ ] Return trip booking
  - [ ] Airport pickup with flight info
  - [ ] Form validation errors
  - [ ] Navigation between pages

- [ ] Coverage goals
  - [ ] Achieve >80% code coverage
  - [ ] 100% coverage on pricing engine
  - [ ] Test all critical paths

---

#### Group 8: Deployment (HIGH PRIORITY)
**Estimated:** 2-3 days  
**Impact:** CRITICAL | **Complexity:** MEDIUM

- [ ] CI/CD pipeline setup
  - [ ] Configure GitHub Actions
  - [ ] Automate tests on PR
  - [ ] Automate builds on merge
  - [ ] Automate deployment

- [ ] Staging environment
  - [ ] Set up staging Firebase project
  - [ ] Deploy to staging (Vercel/Netlify)
  - [ ] Configure staging domain
  - [ ] Test staging deployment

- [ ] Production environment
  - [ ] Set up production Firebase project
  - [ ] Configure production domain
  - [ ] Set up SSL/HTTPS
  - [ ] Configure production env vars

- [ ] Deployment scripts
  - [ ] Create deploy script for staging
  - [ ] Create deploy script for production
  - [ ] Add rollback capability
  - [ ] Document deployment process

- [ ] Post-deployment validation
  - [ ] Smoke tests on staging
  - [ ] Smoke tests on production
  - [ ] Monitor error logs
  - [ ] Set up analytics (Google Analytics)

---

## 📊 Progress Summary

### Overall Progress
- **Completed:** 9 tasks (8 UX refinements + 1 analysis)
- **Remaining:** ~55 tasks across 8 groups
- **Estimated Time to MVP:** 4-5 weeks (full-time)

### Phase Breakdown
- **✅ Phase 1 (Week 1):** COMPLETE
- **🔄 Phase 2 (Week 2):** Foundation - 0/15 tasks
- **📋 Phase 3 (Week 3):** Cleanup - 0/10 tasks
- **📋 Phase 4 (Weeks 4-5):** Production - 0/30 tasks

### Priority Distribution
- **CRITICAL:** 2 groups (Firebase, Deployment)
- **HIGH:** 4 groups (Config, Auto-Save, Testing, Confirmation)
- **MEDIUM:** 1 group (Performance)
- **LOW:** 1 group (Legacy Cleanup)

---

## 🎯 Next Session Goals

When you return tomorrow, we'll start with:

1. **Company Config Site-Wide** (Group 1)
   - Update Footer component first (easiest)
   - Then update Contact page
   - Then update HelpFAB
   - Global search & replace

2. **Auto-Save Implementation** (Group 2)
   - Create persisted state hooks
   - Integrate with booking flow
   - Add UI feedback

**Estimated Duration:** 3-5 days for both groups
