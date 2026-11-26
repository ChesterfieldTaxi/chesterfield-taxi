import {
  HELP_GUIDES,
  type HelpContentFilter,
  type HelpContext,
  type HelpGuide,
  type HelpPortalScope,
  type HelpRole,
  type HelpRoleInput,
} from '../config/help';

const PORTAL_SCOPES_BY_ROLE: Record<HelpRole, readonly HelpPortalScope[]> = {
  admin: ['admin', 'dispatch', 'client'],
  dispatch: ['dispatch'],
  passenger: ['client'],
  corporate: ['client'],
};

/**
 * Normalizes app auth role names (`dispatcher`, `customer`, `corporate_manager`)
 * and canonical help roles into a strict `HelpRole`.
 */
export function normalizeHelpRole(role?: HelpRoleInput | string | null): HelpRole {
  const normalized = String(role || '')
    .trim()
    .toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'dispatch' || normalized === 'dispatcher') return 'dispatch';
  if (normalized === 'corporate' || normalized === 'corporate_manager') return 'corporate';
  return 'passenger';
}

/**
 * Resolves the effective `HelpRole` for an authenticated portal user.
 * Admins retain multi-portal visibility (`admin`) across all portals; other users
 * receive the portal's default role (or their matching assigned role).
 */
export function resolveHelpRoleForUser(
  roles: readonly string[] | string | null | undefined,
  portalFallback: HelpRole
): HelpRole {
  const list = Array.isArray(roles)
    ? roles.map((r) => String(r || '').trim().toLowerCase())
    : typeof roles === 'string' && roles.trim()
    ? [roles.trim().toLowerCase()]
    : [];

  if (list.includes('admin')) {
    return 'admin';
  }
  return portalFallback;
}

/**
 * Returns all guides permitted for the given role in canonical registry order.
 */
export function getGuidesForRole(
  role: HelpRoleInput,
  registry: readonly HelpGuide[] = HELP_GUIDES
): HelpGuide[] {
  const normalizedRole = normalizeHelpRole(role);
  const allowedPortals = PORTAL_SCOPES_BY_ROLE[normalizedRole];
  return registry.filter((guide) => allowedPortals.includes(guide.portal));
}

export function matchesContentFilter(guide: HelpGuide, filter: HelpContentFilter): boolean {
  switch (filter) {
    case 'workflows':
      return Boolean(guide.steps && guide.steps.length > 0);
    case 'reference':
      return Boolean(guide.reference && guide.reference.length > 0);
    case 'faq':
      return Boolean(guide.faqs && guide.faqs.length > 0);
    case 'shortcuts':
      return Boolean(guide.shortcuts && guide.shortcuts.length > 0);
    case 'all':
    default:
      return true;
  }
}

function buildSearchCorpus(guide: HelpGuide): {
  primary: string;
  secondary: string;
} {
  const primaryParts = [guide.title, guide.category, ...(guide.tags || [])];
  const secondaryParts: string[] = [guide.summary];

  for (const step of guide.steps || []) {
    secondaryParts.push(step.title, step.description, step.tip || '');
  }
  for (const table of guide.reference || []) {
    secondaryParts.push(table.title, table.description || '');
    for (const row of table.rows) {
      secondaryParts.push(row.label, row.description, row.badge || '');
    }
  }
  for (const faq of guide.faqs || []) {
    secondaryParts.push(faq.question, faq.answer);
  }
  for (const sc of guide.shortcuts || []) {
    secondaryParts.push(sc.keys.join(' '), sc.keys.join('+'), sc.action, sc.scope || '');
  }

  return {
    primary: primaryParts.join(' ').toLowerCase(),
    secondary: secondaryParts.join(' ').toLowerCase(),
  };
}

/**
 * Client-side keyword search and content-type filtering over a role's permitted guides
 * (or an explicit guide array). Matches title, tags, summary, steps, reference rows, FAQs, and shortcuts.
 */
export function searchGuides(
  guidesOrRole: readonly HelpGuide[] | HelpRoleInput,
  query: string = '',
  filter: HelpContentFilter = 'all'
): HelpGuide[] {
  const sourceGuides =
    typeof guidesOrRole === 'string' ? getGuidesForRole(guidesOrRole) : [...guidesOrRole];

  const filteredByType = sourceGuides.filter((guide) => matchesContentFilter(guide, filter));
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return filteredByType;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const scored: Array<{ guide: HelpGuide; score: number; index: number }> = [];

  filteredByType.forEach((guide, index) => {
    const corpus = buildSearchCorpus(guide);
    const full = `${corpus.primary} ${corpus.secondary}`;
    const allMatch = tokens.every((token) => full.includes(token));
    if (!allMatch) return;

    let score = 0;
    if (guide.title.toLowerCase().includes(normalizedQuery)) score += 10;
    for (const token of tokens) {
      if (corpus.primary.includes(token)) score += 3;
      else score += 1;
    }
    scored.push({ guide, score, index });
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.guide);
}

function buildContextLookupCandidates(context: HelpContext): string[] {
  const portal = String(context.portal || '')
    .trim()
    .toLowerCase();
  const tab = String(context.tab || '')
    .trim()
    .toLowerCase();
  const sub = String(context.sub || '')
    .trim()
    .toLowerCase();
  const pane = String(context.pane || '')
    .trim()
    .toLowerCase();

  const keys: string[] = [];
  const pushUnique = (key: string) => {
    if (key && !keys.includes(key)) keys.push(key);
  };

  if (portal && tab && sub) pushUnique(`${portal}:${tab}:${sub}`);
  if (portal && pane && sub) pushUnique(`${portal}:${pane}:${sub}`);
  if (portal && pane) pushUnique(`${portal}:${pane}`);
  if (portal && tab) pushUnique(`${portal}:${tab}`);

  if (portal === 'passenger' || portal === 'corporate') {
    if (tab && sub) pushUnique(`client:${tab}:${sub}`);
    if (pane) pushUnique(`client:${pane}`);
    if (tab) pushUnique(`client:${tab}`);
  }

  if (portal) pushUnique(portal);
  if (portal === 'passenger' || portal === 'corporate') {
    pushUnique('client');
  }

  return keys;
}

/**
 * Resolves the best-matching `HelpGuide` for the active portal/tab/sub/pane context,
 * scoped to the caller's role when provided.
 */
export function resolveGuideForContext(
  context: HelpContext | null | undefined,
  role?: HelpRoleInput,
  registry: readonly HelpGuide[] = HELP_GUIDES
): HelpGuide | null {
  if (!context) return null;

  const permitted = role ? getGuidesForRole(role, registry) : [...registry];
  if (permitted.length === 0) return null;

  const candidateKeys = buildContextLookupCandidates(context);
  for (const candidateKey of candidateKeys) {
    const match = permitted.find((guide) =>
      guide.contextKeys.some((k) => k.trim().toLowerCase() === candidateKey)
    );
    if (match) return match;
  }

  return null;
}
