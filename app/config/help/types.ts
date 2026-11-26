export type HelpPortalScope = 'admin' | 'dispatch' | 'client';

export type HelpRole = 'admin' | 'dispatch' | 'passenger' | 'corporate';

export type HelpRoleInput =
  | HelpRole
  | 'dispatcher'
  | 'customer'
  | 'corporate_manager';

export type HelpContentFilter = 'all' | 'workflows' | 'reference' | 'faq' | 'shortcuts';

export type HelpContextPortal =
  | HelpPortalScope
  | 'passenger'
  | 'corporate';

export interface HelpContext {
  portal: HelpContextPortal;
  /** Active top-level tab or dock key (e.g. Admin `normalizedTab`, Dispatch `activeDockTab`, App/Corporate `activeTab`). */
  tab?: string;
  /** Active sub-page key (e.g. Admin `effectiveSub`). */
  sub?: string;
  /** Optional active pane or mobile view key (e.g. Dispatch `activeMobileTab` or `'standing-orders'`). */
  pane?: string;
}

export interface HelpStep {
  title: string;
  description: string;
  tip?: string;
}

export interface HelpReferenceRow {
  label: string;
  description: string;
  badge?: string;
  badgeVariant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export interface HelpReferenceTable {
  title: string;
  description?: string;
  rows: HelpReferenceRow[];
}

export interface HelpFaq {
  question: string;
  answer: string;
}

export interface HelpShortcut {
  keys: string[];
  action: string;
  scope?: string;
}

export interface HelpScreenshot {
  src: string;
  alt: string;
  caption: string;
}

export interface HelpGuide {
  id: string;
  portal: HelpPortalScope;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  /**
   * Deterministic context keys (`<portal>`, `<portal>:<tab>`, `<portal>:<tab>:<sub>`)
   * mapped by `resolveGuideForContext` when opening Help from a specific screen.
   */
  contextKeys: string[];
  steps?: HelpStep[];
  reference?: HelpReferenceTable[];
  faqs?: HelpFaq[];
  shortcuts?: HelpShortcut[];
  screenshots?: HelpScreenshot[];
}
