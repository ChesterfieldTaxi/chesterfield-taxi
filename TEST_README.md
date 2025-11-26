# Automated Test Suite

This directory contains comprehensive Playwright tests for the Chesterfield Taxi application.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Install Playwright browsers:**
   ```bash
   npx playwright install
   ```

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run tests in UI mode (interactive)
```bash
npx playwright test --ui
```

### Run specific test file
```bash
npx playwright test tests/home.spec.ts
```

### Run tests in headed mode (see browser)
```bash
npx playwright test --headed
```

### View test report
```bash
npx playwright show-report
```

## Test Coverage

### 1. Home Page (`tests/home.spec.ts`)
- ✅ Hero section styling (white text)
- ✅ Booking bar text color (white, not blue on blue)
- ✅ Feature cards (all 4 display)
- ✅ Services section
- ✅ Testimonial section
- ✅ Navigation to reservations

### 2. Static Pages (`tests/pages.spec.ts`)
- ✅ Page headers have white text (About, Services, Contact, Careers, Fleet)
- ✅ Contact page business hours contrast
- ✅ Contact page FAQ section
- ✅ Fleet page vehicle data (Ford Taurus, Toyota Sienna, Ford Explorer)
- ✅ Careers page role selection

### 3. Booking Flow (`tests/booking-flow.spec.ts`)
- ✅ Passenger counter capped at 7
- ✅ Luggage counter capped at 7
- ✅ Auto-select Minivan when passengers > 4
- ✅ Flight info fields for airports
- ✅ Inline DateTime picker layout
- ✅ Return trip toggle
- ✅ Pricing calculation

### 4. Responsive Design (`tests/responsive.spec.ts`)
- ✅ Mobile (375x667): Navigation, stacked cards, usable forms
- ✅ Tablet (768x1024): Adjusted layouts
- ✅ Desktop (1920x1080): No overflow, centered content

## Continuous Integration

Tests are configured to run in CI environments with:
- 2 retries on failure
- HTML reporter
- Screenshots on failure
- Trace on first retry

## Troubleshooting

### Dev server not starting
Make sure `npm run dev` works independently before running tests.

### Tests timing out
Increase timeout in `playwright.config.ts`:
```ts
timeout: 30000, // 30 seconds
```

### Flaky tests
Tests include appropriate waits, but if you encounter flaky tests:
- Check network conditions
- Increase `waitForTimeout` values
- Use `test.slow()` for slow tests
