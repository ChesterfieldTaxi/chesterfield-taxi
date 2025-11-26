import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
    test('should display hero section with correct styling', async ({ page }) => {
        await page.goto('/');

        // Check hero section
        const hero = page.locator('.hero');
        await expect(hero).toBeVisible();

        // Check headline is white (not blue)
        const h1 = hero.locator('h1');
        await expect(h1).toBeVisible();
        const h1Color = await h1.evaluate(el => window.getComputedStyle(el).color);
        expect(h1Color).toMatch(/rgb\(255,\s*255,\s*255\)/); // white
    });

    test('should display booking bar with white text', async ({ page }) => {
        await page.goto('/');

        // Check "Where can we take you today?" section
        const bookingBar = page.locator('.booking-bar');
        await expect(bookingBar).toBeVisible();

        const h2 = bookingBar.locator('h2');
        await expect(h2).toHaveText('Where can we take you today?');

        // Verify h2 is white (not blue on blue)
        const h2Color = await h2.evaluate(el => window.getComputedStyle(el).color);
        expect(h2Color).toMatch(/rgb\(255,\s*255,\s*255\)/);
    });

    test('should display all 4 feature cards', async ({ page }) => {
        await page.goto('/');

        // Scroll to features section
        await page.locator('.features-grid').scrollIntoViewIfNeeded();

        const featureCards = page.locator('.feature-card');
        await expect(featureCards).toHaveCount(4);

        // Check feature titles
        await expect(page.locator('text=Punctuality Guaranteed')).toBeVisible();
        await expect(page.locator('text=Experienced Drivers')).toBeVisible();
        await expect(page.locator('text=Transparent Pricing')).toBeVisible();
        await expect(page.locator('text=Safety & Cleanliness')).toBeVisible();
    });

    test('should navigate to reservations when clicking Book a Ride', async ({ page }) => {
        await page.goto('/');

        await page.click('text=Book a Ride Online');
        await expect(page).toHaveURL('/reservations');
    });

    test('should display services section', async ({ page }) => {
        await page.goto('/');

        await page.locator('.services-grid').scrollIntoViewIfNeeded();
        const serviceCards = page.locator('.service-card');
        await expect(serviceCards).toHaveCount(3);
    });

    test('should display testimonial section', async ({ page }) => {
        await page.goto('/');

        await page.locator('.testimonial-card').scrollIntoViewIfNeeded();
        await expect(page.locator('.testimonial-card')).toBeVisible();
    });
});
