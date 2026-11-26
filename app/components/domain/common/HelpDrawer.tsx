import React, { useEffect, useMemo, useState } from 'react';
import type {
  HelpContentFilter,
  HelpContext,
  HelpGuide,
  HelpPortalScope,
  HelpRole,
  HelpRoleInput,
  HelpScreenshot,
} from '../../../config/help/types';
import {
  getGuidesForRole,
  normalizeHelpRole,
  resolveGuideForContext,
  resolveHelpRoleForUser,
  searchGuides,
} from '../../../services/help.service';
import {
  Badge,
  Button,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CollapsibleSection,
  FileTextIcon,
  InfoIcon,
  Input,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from '../../ui';

export interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  role: HelpRoleInput;
  /** Optional user roles list so multi-role admins retain cross-portal visibility in every workspace. */
  userRoles?: readonly string[] | null;
  context?: HelpContext;
}

const CONTENT_FILTERS: ReadonlyArray<{ key: HelpContentFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'workflows', label: 'Workflows' },
  { key: 'reference', label: 'Reference' },
  { key: 'faq', label: 'Troubleshooting & FAQ' },
  { key: 'shortcuts', label: 'Shortcuts' },
];

const PORTAL_LABELS: Record<HelpPortalScope, string> = {
  admin: 'Admin',
  dispatch: 'Dispatch',
  client: 'Client & Corporate',
};

const PORTAL_BADGE_VARIANTS: Record<HelpPortalScope, 'info' | 'primary' | 'success'> = {
  admin: 'primary',
  dispatch: 'info',
  client: 'success',
};

function HelpScreenshotFrame({ screenshot }: { screenshot: HelpScreenshot }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [screenshot.src]);

  return (
    <figure className="rounded-2xl border border-border-subtle bg-surface-subtle overflow-hidden">
      {!hasError ? (
        <img
          src={screenshot.src}
          alt={screenshot.alt}
          loading="lazy"
          ref={(el) => {
            if (el && el.complete && el.naturalWidth === 0) {
              setHasError(true);
            }
          }}
          onError={() => setHasError(true)}
          className="w-full h-auto max-h-64 object-cover bg-surface-muted"
        />
      ) : (
        <div
          role="img"
          aria-label={screenshot.alt}
          className="px-4 py-6 bg-surface-muted/70 border-b border-dashed border-border-strong flex flex-col items-center justify-center text-center gap-1.5"
        >
          <div className="w-9 h-9 rounded-xl bg-surface-card border border-border-subtle text-fg-muted flex items-center justify-center shadow-2xs">
            <FileTextIcon className="w-4 h-4" />
          </div>
          <p className="text-xs font-bold text-fg-secondary">{screenshot.alt}</p>
          <p className="text-[11px] font-mono text-fg-subtle break-all">{screenshot.src}</p>
        </div>
      )}
      <figcaption className="px-3.5 py-2 text-[11px] text-fg-muted leading-snug">
        {screenshot.caption}
      </figcaption>
    </figure>
  );
}

export function HelpDrawer({
  isOpen,
  onClose,
  role,
  userRoles,
  context,
}: HelpDrawerProps) {
  const effectiveRole: HelpRole = useMemo(() => {
    const baseRole = normalizeHelpRole(role);
    return userRoles ? resolveHelpRoleForUser(userRoles, baseRole) : baseRole;
  }, [role, userRoles]);

  const roleGuides = useMemo(() => getGuidesForRole(effectiveRole), [effectiveRole]);

  const contextualGuide = useMemo(
    () => resolveGuideForContext(context, effectiveRole),
    [context, effectiveRole]
  );

  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [openedFromContext, setOpenedFromContext] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [contentFilter, setContentFilter] = useState<HelpContentFilter>('all');
  const [portalFilter, setPortalFilter] = useState<HelpPortalScope | 'all'>('all');
  const [openFaqKeys, setOpenFaqKeys] = useState<Record<string, boolean>>({});

  // Sync contextual guide whenever the drawer opens
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery('');
    setContentFilter('all');
    setPortalFilter('all');
    if (contextualGuide) {
      setSelectedGuideId(contextualGuide.id);
      setOpenedFromContext(true);
    } else {
      setSelectedGuideId(null);
      setOpenedFromContext(false);
    }
  }, [isOpen, contextualGuide?.id]);

  // Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const scopedGuides = useMemo(() => {
    if (portalFilter === 'all') return roleGuides;
    return roleGuides.filter((g) => g.portal === portalFilter);
  }, [roleGuides, portalFilter]);

  const filteredGuides = useMemo(
    () => searchGuides(scopedGuides, searchQuery, contentFilter),
    [scopedGuides, searchQuery, contentFilter]
  );

  const selectedGuide: HelpGuide | null = useMemo(() => {
    if (!selectedGuideId) return null;
    return roleGuides.find((g) => g.id === selectedGuideId) || null;
  }, [roleGuides, selectedGuideId]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (value.trim() && selectedGuideId) {
      setSelectedGuideId(null);
      setOpenedFromContext(false);
    }
  };

  const handleContentFilterSelect = (nextFilter: HelpContentFilter) => {
    setContentFilter(nextFilter);
    if (selectedGuideId) {
      setSelectedGuideId(null);
      setOpenedFromContext(false);
    }
  };

  const toggleFaq = (faqKey: string) => {
    setOpenFaqKeys((prev) => ({ ...prev, [faqKey]: !prev[faqKey] }));
  };

  if (!isOpen) return null;

  const showPortalScopeTabs = effectiveRole === 'admin';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help & Guides"
      className="fixed inset-0 z-50 flex justify-end print:hidden"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-surface-overlay/60 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Slide-Over Panel */}
      <aside className="relative z-10 w-full max-w-xl h-full bg-surface-card text-fg-primary border-l border-border-subtle shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-surface-subtle border-b border-border-subtle shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-xs">
                ?
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-extrabold text-fg-primary tracking-tight truncate">
                  Help &amp; Guides
                </h2>
                <p className="text-[11px] text-fg-muted truncate">
                  {effectiveRole === 'admin'
                    ? 'Admin, Dispatch & Client documentation'
                    : effectiveRole === 'dispatch'
                    ? 'Dispatch Console workflows & shortcuts'
                    : 'Booking, tracking, corporate & account guides'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Help drawer"
              title="Close (Esc)"
              className="p-1.5 rounded-xl text-fg-muted hover:text-fg-primary hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search guides, workflows, FAQs, or shortcuts..."
              aria-label="Search help guides"
              prefixIcon={<SearchIcon className="w-4 h-4" />}
              className="!py-2 !text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-fg-muted hover:text-fg-primary hover:bg-surface-muted cursor-pointer"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content-Type Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {CONTENT_FILTERS.map((f) => {
              const active = contentFilter === f.key && !selectedGuide;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => handleContentFilterSelect(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-surface-card text-fg-secondary hover:text-fg-primary border-border-subtle hover:bg-surface-muted'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-Bar: Back to All Guides (when in detail) OR Admin Portal Scope Filter (when browsing) */}
        {selectedGuide ? (
          <div className="px-4 sm:px-5 py-2 bg-surface-card border-b border-border-faint flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedGuideId(null);
                setOpenedFromContext(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              <span>All Guides ({roleGuides.length})</span>
            </button>

            {openedFromContext && contextualGuide?.id === selectedGuide.id && (
              <Badge variant="info" size="sm">
                Matched to current view
              </Badge>
            )}
          </div>
        ) : showPortalScopeTabs ? (
          <div className="px-4 sm:px-5 py-2 bg-surface-card border-b border-border-faint flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {(
              [
                { key: 'all' as const, label: 'All Portals' },
                { key: 'admin' as const, label: 'Admin' },
                { key: 'dispatch' as const, label: 'Dispatch' },
                { key: 'client' as const, label: 'Client & Corporate' },
              ] as const
            ).map((scope) => {
              const active = portalFilter === scope.key;
              return (
                <button
                  key={scope.key}
                  type="button"
                  onClick={() => setPortalFilter(scope.key)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-surface-emphasis text-fg-primary'
                      : 'text-fg-muted hover:text-fg-primary hover:bg-surface-subtle'
                  }`}
                >
                  {scope.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {selectedGuide ? (
            /* ─── GUIDE DETAIL VIEW ─── */
            <article className="space-y-5">
              {/* Title & Summary */}
              <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={PORTAL_BADGE_VARIANTS[selectedGuide.portal]} size="sm">
                    {PORTAL_LABELS[selectedGuide.portal]}
                  </Badge>
                  <Badge variant="neutral" size="sm">
                    {selectedGuide.category}
                  </Badge>
                </div>
                <h3 className="text-lg font-extrabold text-fg-primary leading-snug">
                  {selectedGuide.title}
                </h3>
                <p className="text-xs sm:text-sm text-fg-secondary leading-relaxed">
                  {selectedGuide.summary}
                </p>
              </header>

              {/* Screenshots */}
              {selectedGuide.screenshots && selectedGuide.screenshots.length > 0 && (
                <section aria-label="Visual preview" className="space-y-2.5">
                  {selectedGuide.screenshots.map((shot) => (
                    <HelpScreenshotFrame key={shot.src} screenshot={shot} />
                  ))}
                </section>
              )}

              {/* Numbered Workflow Steps */}
              {selectedGuide.steps && selectedGuide.steps.length > 0 && (
                <section aria-label="Step-by-step workflow" className="space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">
                    Workflow Steps
                  </h4>
                  <ol className="space-y-2.5">
                    {selectedGuide.steps.map((step, idx) => (
                      <li
                        key={step.title}
                        className="p-3.5 rounded-2xl border border-border-subtle bg-surface-subtle/70 flex items-start gap-3"
                      >
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-xs sm:text-sm font-bold text-fg-primary leading-snug">
                            {step.title}
                          </p>
                          <p className="text-xs text-fg-secondary leading-relaxed">
                            {step.description}
                          </p>
                          {step.tip && (
                            <div className="mt-2 p-2.5 rounded-xl bg-status-info-bg border border-status-info-border text-status-info-fg text-[11px] leading-snug flex items-start gap-2">
                              <SparklesIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{step.tip}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {/* Feature Reference Tables */}
              {selectedGuide.reference && selectedGuide.reference.length > 0 && (
                <section aria-label="Feature reference" className="space-y-3">
                  {selectedGuide.reference.map((table) => (
                    <div
                      key={table.title}
                      className="rounded-2xl border border-border-subtle bg-surface-card overflow-hidden"
                    >
                      <div className="px-3.5 py-2.5 bg-surface-subtle border-b border-border-subtle">
                        <h4 className="text-xs font-extrabold text-fg-primary">{table.title}</h4>
                        {table.description && (
                          <p className="text-[11px] text-fg-muted mt-0.5">{table.description}</p>
                        )}
                      </div>
                      <div className="divide-y divide-border-faint">
                        {table.rows.map((row) => (
                          <div
                            key={row.label}
                            className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 text-xs"
                          >
                            <div className="sm:w-44 shrink-0 flex items-center flex-wrap gap-1.5">
                              <span className="font-bold text-fg-strong">{row.label}</span>
                              {row.badge && (
                                <Badge variant={row.badgeVariant || 'default'} size="sm">
                                  {row.badge}
                                </Badge>
                              )}
                            </div>
                            <p className="text-fg-secondary leading-relaxed flex-1">
                              {row.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Keyboard Shortcuts Table */}
              {selectedGuide.shortcuts && selectedGuide.shortcuts.length > 0 && (
                <section aria-label="Keyboard shortcuts" className="space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">
                    Keyboard Shortcuts
                  </h4>
                  <div className="rounded-2xl border border-border-subtle bg-surface-card divide-y divide-border-faint overflow-hidden">
                    {selectedGuide.shortcuts.map((sc) => (
                      <div
                        key={`${sc.keys.join('+')}-${sc.action}`}
                        className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center flex-wrap gap-1 shrink-0">
                          {sc.keys.map((keyLabel, i) => (
                            <React.Fragment key={`${keyLabel}-${i}`}>
                              {i > 0 && <span className="text-fg-subtle text-[10px]">+</span>}
                              <kbd className="px-2 py-0.5 rounded-md bg-surface-muted border border-border-strong font-mono text-[11px] font-bold text-fg-primary shadow-2xs">
                                {keyLabel}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                        <div className="flex-1 sm:text-right space-y-0.5">
                          <p className="text-fg-secondary font-medium leading-snug">{sc.action}</p>
                          {sc.scope && (
                            <p className="text-[10px] font-semibold text-fg-muted">{sc.scope}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Troubleshooting & FAQ Accordions */}
              {selectedGuide.faqs && selectedGuide.faqs.length > 0 && (
                <section aria-label="Troubleshooting and FAQ" className="space-y-2.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">
                    Troubleshooting &amp; FAQ
                  </h4>
                  <div className="space-y-2">
                    {selectedGuide.faqs.map((faq, idx) => {
                      const faqKey = `${selectedGuide.id}-faq-${idx}`;
                      const isExpanded = Boolean(openFaqKeys[faqKey]);
                      return (
                        <div
                          key={faqKey}
                          className="rounded-2xl border border-border-subtle bg-surface-subtle/60 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => toggleFaq(faqKey)}
                            aria-expanded={isExpanded}
                            className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-surface-muted/60 transition-colors"
                          >
                            <span className="text-xs font-bold text-fg-primary leading-snug">
                              {faq.question}
                            </span>
                            <ChevronDownIcon
                              className={`w-4 h-4 text-fg-muted shrink-0 transition-transform duration-200 ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                          <CollapsibleSection isOpen={isExpanded}>
                            <div className="px-3.5 pb-3 pt-0.5 text-xs text-fg-secondary leading-relaxed border-t border-border-faint">
                              {faq.answer}
                            </div>
                          </CollapsibleSection>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </article>
          ) : (
            /* ─── BROWSE & SEARCH LIST VIEW ─── */
            <div className="space-y-3">
              {contextualGuide && !searchQuery.trim() && contentFilter === 'all' && (
                <div className="p-3 rounded-2xl bg-status-info-bg border border-status-info-border flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-status-info-fg">
                      Recommended for current screen
                    </p>
                    <p className="text-xs font-bold text-fg-primary truncate mt-0.5">
                      {contextualGuide.title}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setSelectedGuideId(contextualGuide.id);
                      setOpenedFromContext(true);
                    }}
                  >
                    Open
                  </Button>
                </div>
              )}

              {filteredGuides.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2 rounded-2xl border border-dashed border-border-subtle bg-surface-subtle/50">
                  <div className="w-10 h-10 rounded-2xl bg-surface-muted text-fg-muted flex items-center justify-center mx-auto">
                    <InfoIcon className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-fg-primary">No matching guides found</p>
                  <p className="text-xs text-fg-muted">
                    Try another keyword or reset your search and content filters.
                  </p>
                  {(searchQuery || contentFilter !== 'all' || portalFilter !== 'all') && (
                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSearchQuery('');
                          setContentFilter('all');
                          setPortalFilter('all');
                        }}
                      >
                        Reset Filters
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredGuides.map((guide) => (
                    <button
                      key={guide.id}
                      type="button"
                      onClick={() => {
                        setSelectedGuideId(guide.id);
                        setOpenedFromContext(false);
                      }}
                      className="w-full p-3.5 rounded-2xl border border-border-subtle bg-surface-card hover:bg-surface-subtle hover:border-border-strong transition-all text-left flex items-start justify-between gap-3 cursor-pointer group shadow-2xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {showPortalScopeTabs && (
                            <Badge variant={PORTAL_BADGE_VARIANTS[guide.portal]} size="sm">
                              {PORTAL_LABELS[guide.portal]}
                            </Badge>
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            {guide.category}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-extrabold text-fg-primary group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {guide.title}
                        </p>
                        <p className="text-xs text-fg-secondary line-clamp-2 leading-relaxed">
                          {guide.summary}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-semibold text-fg-muted">
                          {guide.steps && guide.steps.length > 0 && (
                            <span>{guide.steps.length} steps</span>
                          )}
                          {guide.reference && guide.reference.length > 0 && (
                            <span>· Reference</span>
                          )}
                          {guide.shortcuts && guide.shortcuts.length > 0 && (
                            <span>· {guide.shortcuts.length} shortcuts</span>
                          )}
                          {guide.faqs && guide.faqs.length > 0 && (
                            <span>· {guide.faqs.length} FAQs</span>
                          )}
                        </div>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-fg-subtle group-hover:text-blue-600 shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
