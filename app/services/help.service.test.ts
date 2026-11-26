// @ts-expect-error vitest is executed via npx without a local devDependency
import { describe, it, expect } from 'vitest';
import {
  ADMIN_GUIDES,
  CLIENT_GUIDES,
  DISPATCH_GUIDES,
  HELP_GUIDES,
  type HelpContext,
} from '../config/help';
import { CANONICAL_ADMIN_TABS, SUB_PAGES } from '../core/utils/admin-nav.util';
import {
  getGuidesForRole,
  resolveGuideForContext,
  resolveHelpRoleForUser,
  searchGuides,
} from './help.service';

describe('Help Guide Registry Integrity (Phase 97)', () => {
  it('ensures every guide has a unique id, non-empty title/summary, and at least one content block', () => {
    expect(HELP_GUIDES.length).toBeGreaterThanOrEqual(24);

    const seenIds = new Set<string>();
    for (const guide of HELP_GUIDES) {
      expect(guide.id.trim().length, `guide id must be non-empty`).toBeGreaterThan(0);
      expect(seenIds.has(guide.id), `duplicate guide id: ${guide.id}`).toBe(false);
      seenIds.add(guide.id);

      expect(guide.title.trim().length, `${guide.id} must have a non-empty title`).toBeGreaterThan(0);
      expect(guide.summary.trim().length, `${guide.id} must have a non-empty summary`).toBeGreaterThan(0);
      expect(guide.contextKeys.length, `${guide.id} must declare contextKeys`).toBeGreaterThan(0);

      const hasContentBlock =
        (guide.steps?.length ?? 0) > 0 ||
        (guide.reference?.length ?? 0) > 0 ||
        (guide.faqs?.length ?? 0) > 0 ||
        (guide.shortcuts?.length ?? 0) > 0;
      expect(hasContentBlock, `${guide.id} must define at least one content block`).toBe(true);

      for (const shot of guide.screenshots ?? []) {
        expect(shot.src.startsWith('/images/help/')).toBe(true);
        expect(shot.alt.trim().length).toBeGreaterThan(0);
        expect(shot.caption.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('help.service — Role Scoping', () => {
  it('grants admin access to Admin + Dispatch + Client/Corporate guides', () => {
    const guides = getGuidesForRole('admin');
    expect(guides).toHaveLength(
      ADMIN_GUIDES.length + DISPATCH_GUIDES.length + CLIENT_GUIDES.length
    );
    expect(new Set(guides.map((g) => g.portal))).toEqual(
      new Set(['admin', 'dispatch', 'client'])
    );
  });

  it('scopes dispatch / dispatcher strictly to Dispatch guides', () => {
    const dispatchGuides = getGuidesForRole('dispatch');
    const dispatcherGuides = getGuidesForRole('dispatcher');
    expect(dispatchGuides).toHaveLength(DISPATCH_GUIDES.length);
    expect(dispatcherGuides).toEqual(dispatchGuides);
    expect(dispatchGuides.every((g) => g.portal === 'dispatch')).toBe(true);
  });

  it('scopes passenger / customer and corporate / corporate_manager strictly to Client guides', () => {
    const paxGuides = getGuidesForRole('passenger');
    const custGuides = getGuidesForRole('customer');
    const corpGuides = getGuidesForRole('corporate');
    const corpMgrGuides = getGuidesForRole('corporate_manager');

    expect(paxGuides).toHaveLength(CLIENT_GUIDES.length);
    expect(paxGuides.every((g) => g.portal === 'client')).toBe(true);
    expect(custGuides).toEqual(paxGuides);
    expect(corpGuides).toEqual(paxGuides);
    expect(corpMgrGuides).toEqual(paxGuides);
  });

  it('elevates multi-role admin users while keeping non-admins on portal fallback', () => {
    expect(resolveHelpRoleForUser(['dispatcher', 'admin'], 'dispatch')).toBe('admin');
    expect(resolveHelpRoleForUser(['dispatcher'], 'dispatch')).toBe('dispatch');
    expect(resolveHelpRoleForUser(['corporate_manager'], 'corporate')).toBe('corporate');
    expect(resolveHelpRoleForUser(['customer'], 'passenger')).toBe('passenger');
  });
});

describe('help.service — Search & Content Filters', () => {
  it('searches across title, tags, steps, FAQs, and shortcuts with role scoping', () => {
    // Title / tag match
    const tariffHits = searchGuides('admin', 'tariffs surcharges');
    expect(tariffHits.length).toBeGreaterThan(0);
    expect(tariffHits[0]?.id).toBe('admin-rates-tariffs');

    // Shortcut match
    const shortcutHits = searchGuides('dispatch', 'Alt+P');
    expect(shortcutHits.some((g) => g.id === 'dispatch-keyboard-shortcuts')).toBe(true);

    // Step / conflict resolution match
    const stagedHits = searchGuides('dispatch', 'Override Staged');
    expect(stagedHits[0]?.id).toBe('dispatch-driver-assignment-conflicts');

    // FAQ match in Client portal, isolated from Admin results
    const poHitsForPax = searchGuides('passenger', 'Revoked PO');
    expect(poHitsForPax.some((g) => g.id === 'client-corporate-team-cost-centers')).toBe(true);
    expect(searchGuides('passenger', 'QuickBooks')).toHaveLength(0);
  });

  it('filters guides by content block type (workflows, reference, faq, shortcuts)', () => {
    const shortcutOnly = searchGuides('admin', '', 'shortcuts');
    expect(shortcutOnly.length).toBeGreaterThan(0);
    expect(shortcutOnly.every((g) => (g.shortcuts?.length ?? 0) > 0)).toBe(true);

    const workflowOnly = searchGuides('dispatch', '', 'workflows');
    expect(workflowOnly.every((g) => (g.steps?.length ?? 0) > 0)).toBe(true);
    expect(workflowOnly.some((g) => g.id === 'dispatch-keyboard-shortcuts')).toBe(false);

    const referenceOnly = searchGuides('corporate', '', 'reference');
    expect(referenceOnly.length).toBeGreaterThan(0);
    expect(referenceOnly.every((g) => (g.reference?.length ?? 0) > 0)).toBe(true);

    const faqOnly = searchGuides('passenger', '', 'faq');
    expect(faqOnly.length).toBeGreaterThan(0);
    expect(faqOnly.every((g) => (g.faqs?.length ?? 0) > 0)).toBe(true);
  });
});

describe('help.service — Context Resolution', () => {
  it('resolves every declared contextKey across all guides to an existing guide', () => {
    for (const guide of HELP_GUIDES) {
      for (const key of guide.contextKeys) {
        const [portal, tab, sub] = key.split(':');
        const resolved = resolveGuideForContext({
          portal: portal as HelpContext['portal'],
          tab,
          sub,
        });
        expect(resolved, `expected contextKey "${key}" to resolve`).not.toBeNull();
        expect(HELP_GUIDES.some((g) => g.id === resolved!.id)).toBe(true);
      }
    }
  });

  it('resolves every canonical Admin tab and sub-page to an existing Admin guide', () => {
    for (const tab of CANONICAL_ADMIN_TABS) {
      const tabGuide = resolveGuideForContext({ portal: 'admin', tab }, 'admin');
      expect(tabGuide, `expected admin tab "${tab}" to resolve`).not.toBeNull();
      expect(tabGuide?.portal).toBe('admin');

      for (const sub of SUB_PAGES[tab] ?? []) {
        const subGuide = resolveGuideForContext(
          { portal: 'admin', tab, sub: sub.key },
          'admin'
        );
        expect(subGuide, `expected admin "${tab}:${sub.key}" to resolve`).not.toBeNull();
        expect(subGuide?.portal).toBe('admin');
      }
    }
  });

  it('resolves Dispatch docks/panes, Passenger tabs, and Corporate tabs accurately', () => {
    const dispatchTabs = [
      'main',
      'queue',
      'booking',
      'phone',
      'comms',
      'messages',
      'email',
      'drivers',
      'map',
      'alerts',
      'standing-orders',
      'shortcuts',
    ];
    for (const tab of dispatchTabs) {
      const resolved = resolveGuideForContext({ portal: 'dispatch', tab }, 'dispatch');
      expect(resolved, `expected dispatch:${tab} to resolve`).not.toBeNull();
      expect(resolved?.portal).toBe('dispatch');
    }

    const passengerTabs: Array<[string, string]> = [
      ['book', 'client-booking-saved-places'],
      ['places', 'client-booking-saved-places'],
      ['trips', 'client-live-tracking'],
      ['profile', 'client-profile-notifications'],
    ];
    for (const [tab, expectedId] of passengerTabs) {
      const resolved = resolveGuideForContext({ portal: 'passenger', tab }, 'passenger');
      expect(resolved?.id).toBe(expectedId);
    }

    const corporateTabs: Array<[string, string]> = [
      ['overview', 'client-live-tracking'],
      ['book', 'client-booking-saved-places'],
      ['team', 'client-corporate-team-cost-centers'],
      ['billing', 'client-corporate-invoicing-statements'],
    ];
    for (const [tab, expectedId] of corporateTabs) {
      const resolved = resolveGuideForContext({ portal: 'corporate', tab }, 'corporate');
      expect(resolved?.id).toBe(expectedId);
    }

    // Role isolation: non-admin roles cannot resolve admin contexts
    expect(
      resolveGuideForContext({ portal: 'admin', tab: 'rates', sub: 'tariffs' }, 'passenger')
    ).toBeNull();
    expect(
      resolveGuideForContext({ portal: 'admin', tab: 'dashboard' }, 'dispatch')
    ).toBeNull();
  });
});
