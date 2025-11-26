import { test, expect } from '@playwright/test';

test.describe('Page Headers', () => {
    const pages = [
        { path: '/about', title: 'About Chesterfield Taxi' },
        { path: '/services', title: 'Transportation Services' },
        { path: '/contact', title: 'Contact Us' },
        { path: '/careers', title: 'Join the Chesterfield Taxi Team' },
        { path: '/fleet', title: 'Our Vehicle Fleet' },
    ];

    for (const { path, title } of pages) {
        test(`${path} should have white header text`, async ({ page }) => {
            await page.goto(path);

            const pageHeader = page.locator('.page-header');
            await expect(pageHeader).toBeVisible();

            const h1 = pageHeader.locator('h1');
            await expect(h1).toHaveText(title);

            // Verify h1 is white
            const h1Color = await h1.evaluate(el => window.getComputedStyle(el).color);
            expect(h1Color).toMatch(/rgb\(255,\s*255,\s*255\)/);
        });
    }
});

test.describe('Contact Page', () => {
    test('should display contact info and form', async ({ page }) => {
        await page.goto('/contact');

        // Check contact info card
        await expect(page.locator('.info-card')).toBeVisible();
        await expect(page.locator('text=Get in Touch')).toBeVisible();

        // Check business hours with white text
        const hoursCard = page.locator('.hours-card');
        await expect(hoursCard).toBeVisible();

        const dayLabels = hoursCard.locator('.hours-item .day');
        const firstDay = dayLabels.first();
        const dayColor = await firstDay.evaluate(el => window.getComputedStyle(el).color);
        expect(dayColor).toMatch(/rgb\(255,\s*255,\s*255\)/); // Should be white

        // Check form
        await expect(page.locator('.form-container')).toBeVisible();
        await expect(page.locator('text=Send us a Message')).toBeVisible();
    });

    test('should display FAQ section', async ({ page }) => {
        await page.goto('/contact');

        await page.locator('.faq-grid').scrollIntoViewIfNeeded();
        const faqItems = page.locator('.faq-item');
        await expect(faqItems).toHaveCount(4);
    });
});

test.describe('Fleet Page', () => {
    test('should display all 3 vehicles with correct data', async ({ page }) => {
        await page.goto('/fleet');

        // Check Sedan
        await expect(page.locator('text=Comfort Sedan')).toBeVisible();
        await expect(page.locator('text=Ford Taurus')).toBeVisible();
        await expect(page.locator('text=👤 4 Passengers')).toBeVisible();
        await expect(page.locator('text=🧳 4 Suitcases')).toBeVisible();

        // Check Minivan
        await expect(page.locator('text=Family Minivan')).toBeVisible();
        await expect(page.locator('text=Toyota Sienna')).toBeVisible();
        await expect(page.locator('text=👤 6 Passengers')).toBeVisible();
        await expect(page.locator('text=🧳 5 Suitcases')).toBeVisible();

        // Check SUV
        await expect(page.locator('text=Premium SUV')).toBeVisible();
        await expect(page.locator('text=Ford Explorer')).toBeVisible();
        await expect(page.locator('text=👤 4 Passengers').nth(1)).toBeVisible();
        await expect(page.locator('text=🧳 4 Suitcases').nth(1)).toBeVisible();
    });
});

test.describe('Careers Page', () => {
    test('should display application form with role selection', async ({ page }) => {
        await page.goto('/careers');

        // Check role selection
        await expect(page.locator('text=Driver')).toBeVisible();
        await expect(page.locator('text=Dispatcher')).toBeVisible();

        // Select Driver role
        await page.click('input[value="driver"]');
        await expect(page.locator('text=License Number')).toBeVisible();

        // Select Dispatcher role
        await page.click('input[value="dispatcher"]');
        await expect(page.locator('text=Customer Service Experience')).toBeVisible();
    });
});
