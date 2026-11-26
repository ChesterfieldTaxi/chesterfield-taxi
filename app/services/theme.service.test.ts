// @ts-expect-error vitest is executed via npx without a local devDependency
import { describe, it, expect } from 'vitest';
import { isDarkModeRoutePath } from '../config/theme-tokens';
import { resolveEffectiveBranding } from './theme.service';
import { THEME_PRESETS } from '../components/domain/admin/website/theme-presets';
import type { BrandingConfig } from '../core/types/config';

describe('isDarkModeRoutePath (Phase 96 live site routes)', () => {
  it('enables dark mode on all public live-site routes', () => {
    const publicPaths = [
      '/',
      '/about',
      '/book',
      '/booking/abc-123',
      '/construction',
      '/contact',
      '/pay/tok-123',
      '/privacy',
      '/register',
      '/service-areas',
      '/service-areas/chesterfield-to-stl-airport',
      '/services',
      '/signin',
      '/terms',
      '/track',
    ];
    for (const p of publicPaths) {
      expect(isDarkModeRoutePath(p), `expected ${p} to be enabled`).toBe(true);
    }
  });

  it('keeps /driver routes excluded from dark mode', () => {
    expect(isDarkModeRoutePath('/driver')).toBe(false);
    expect(isDarkModeRoutePath('/driver/trips')).toBe(false);
    expect(isDarkModeRoutePath('/app/driver')).toBe(false);
    expect(isDarkModeRoutePath('')).toBe(false);
  });

  it('preserves existing portal routes', () => {
    expect(isDarkModeRoutePath('/app/dispatch')).toBe(true);
    expect(isDarkModeRoutePath('/admin')).toBe(true);
    expect(isDarkModeRoutePath('/app/corporate')).toBe(true);
  });
});

describe('resolveEffectiveBranding', () => {
  it('returns original branding unchanged when resolvedTheme is light', () => {
    const royal = THEME_PRESETS.find((p) => p.id === 'chesterfield_royal_blue')!;
    const result = resolveEffectiveBranding(royal.tokens, 'light');
    expect(result).toEqual(royal.tokens);
    expect(result.cardBg).toBe('#ffffff');
    expect(result.headingColor).toBe('#0f172a');
  });

  it('merges preset darkTokens when resolvedTheme is dark', () => {
    for (const preset of THEME_PRESETS) {
      expect(preset.darkTokens, `preset ${preset.id} should define darkTokens`).toBeDefined();
      const branding: BrandingConfig = { ...preset.tokens, darkTokens: preset.darkTokens };
      const resolved = resolveEffectiveBranding(branding, 'dark');

      expect(resolved.cardBg).toBe(preset.darkTokens!.cardBg);
      expect(resolved.headingColor).toBe(preset.darkTokens!.headingColor);
      expect(resolved.bodyTextColor).toBe(preset.darkTokens!.bodyTextColor);
      expect(resolved.navbarBg).toBe(preset.darkTokens!.navbarBg);
      expect(resolved.headingFont).toBe(preset.tokens.headingFont);
      expect(resolved.bodyFont).toBe(preset.tokens.bodyFont);
      expect(resolved.btnBorderRadius).toBe(preset.tokens.btnBorderRadius);
    }
  });

  it('computes safe dark surface/text fallbacks for custom brands without darkTokens', () => {
    const customBrand: BrandingConfig = {
      primaryColor: '#7c3aed',
      secondaryColor: '#1e1b4b',
      headingFont: 'Outfit',
      bodyFont: 'Plus Jakarta Sans',
      headingColor: '#1e1b4b',
      bodyTextColor: '#334155',
      mutedTextColor: '#64748b',
      btnPrimaryBg: '#7c3aed',
      btnPrimaryText: '#ffffff',
      btnSecondaryBg: '#1e1b4b',
      btnSecondaryText: '#ffffff',
      btnBorderRadius: '16px',
      navbarBg: '#1e1b4b',
      cardBg: '#ffffff',
    };

    const resolved = resolveEffectiveBranding(customBrand, 'dark');
    expect(resolved.primaryColor).toBe('#7c3aed');
    expect(resolved.headingFont).toBe('Outfit');
    expect(resolved.bodyFont).toBe('Plus Jakarta Sans');
    expect(resolved.btnBorderRadius).toBe('16px');
    expect(resolved.cardBg).toBe('#0f172a');
    expect(resolved.navbarBg).toBe('#020617');
    expect(resolved.headingColor).toBe('#f8fafc');
    expect(resolved.bodyTextColor).toBe('#cbd5e1');
    expect(resolved.mutedTextColor).toBe('#94a3b8');
  });
});
