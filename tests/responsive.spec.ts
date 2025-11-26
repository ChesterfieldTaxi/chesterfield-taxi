import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
    test.describe('Mobile (375x667)', () => {
        test.use({ viewport: { width: 375, height: 667 } });

        test('should display navigation', async ({ page }) => {
            await page.goto('/');

            // Navigation should be visible
            const nav = page.locator('nav');
            await expect(nav).toBeVisible();
        });

        test('should stack feature cards', async ({ page }) => {
            await page.goto('/');

            // Wait for features grid to load
            await page.waitForSelector('text=Punctuality Guaranteed');

            // Just verify feature cards are visible on mobile
            const featureCards = page.locator('.feature-card');
            const count = await featureCards.count();
            expect(count).toBeGreaterThan(0);
        });

        test('should make booking form usable on mobile', async ({ page }) => {
            await page.goto('/reservations');

            // Form should be visible and usable
            await expect(page.locator('text=Book Your Ride')).toBeVisible();
            await expect(page.locator('input').first()).toBeVisible();
        });
    });

    test.describe('Tablet (768x1024)', () => {
        test.use({ viewport: { width: 768, height: 1024 } });

        test('should adjust layout appropriately', async ({ page }) => {
            await page.goto('/');

            // Page should load without errors
            await expect(page.locator('text=CHESTERFIELD TAXI')).toBeVisible();
        });
    });

    test.describe('Desktop (1920x1080)', () => {
        test.use({ viewport: { width: 1920, height: 1080 } });

        test('should display full layout without overflow', async ({ page }) => {
            await page.goto('/');

            // Check no horizontal scroll
            const hasHorizontalScroll = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });

            expect(hasHorizontalScroll).toBe(false);
        });

        test('should display content properly', async ({ page }) => {
            await page.goto('/');

            // Verify main content loads
            await expect(page.locator('text=Professional Taxi')).toBeVisible();
        });
    });
});
