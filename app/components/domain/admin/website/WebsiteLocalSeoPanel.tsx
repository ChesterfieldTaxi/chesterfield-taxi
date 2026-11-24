import React, { useEffect, useMemo, useState } from 'react';
import {
  normalizeLocalSeoConfig,
  type AppSettings,
  type LocalSeoAdminConfig,
  type LocalSeoCorridorOverride,
  type LocalSeoFaqOverrideItem,
} from '../../../../core/types/config';
import {
  buildPrepopulatedBookUrl,
  getCorridorBySlug,
  getResolvedLocalSeoCorridors,
  type LocalSeoCorridorCategory,
} from '../../../../core/services/seo/local-corridor-seo.service';
import { Badge } from '../../../ui/Badge';
import { CheckIcon, EditIcon, ExternalLinkIcon, GlobeIcon, PlusIcon, RefreshCwIcon, SearchIcon, StarIcon, TrashIcon } from '../../../ui/Icons';

export interface WebsiteLocalSeoPanelProps {
  settings: Partial<AppSettings>;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

const CATEGORY_LABELS: Record<LocalSeoCorridorCategory, { label: string; badgeClass: string }> = {
  airport: { label: 'Airport', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  fbo: { label: 'FBO', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  corporate: { label: 'Corporate', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suburban: { label: 'Suburban', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200' },
};

export const WebsiteLocalSeoPanel: React.FC<WebsiteLocalSeoPanelProps> = ({
  settings,
  onSave,
  isLoading,
}) => {
  const [localSeo, setLocalSeo] = useState<LocalSeoAdminConfig>(() =>
    normalizeLocalSeoConfig(settings.localSeoConfig)
  );
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [seo, setSeo] = useState(
    settings.cms?.seo || { defaultMetaTitle: '', defaultMetaDescription: '', defaultOpenGraphImage: '' }
  );
  const [scripts, setScripts] = useState(settings.cms?.scripts || { head: '', footer: '' });
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    setLocalSeo(normalizeLocalSeoConfig(settings.localSeoConfig));
  }, [settings.localSeoConfig]);

  useEffect(() => {
    if (settings.cms?.seo) setSeo(settings.cms.seo);
    if (settings.cms?.scripts) setScripts(settings.cms.scripts);
  }, [settings.cms]);

  const resolvedCorridors = useMemo(
    () => getResolvedLocalSeoCorridors({ ...settings, localSeoConfig: localSeo }, { includeDisabled: true }),
    [settings, localSeo]
  );

  const canonicalOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://chesterfieldtaxi.com';

  const updateOverride = (
    slug: string,
    updater: (prev: LocalSeoCorridorOverride) => LocalSeoCorridorOverride
  ) => {
    setLocalSeo((prev) => ({
      corridorOverrides: {
        ...prev.corridorOverrides,
        [slug]: updater(prev.corridorOverrides[slug] || {}),
      },
    }));
  };

  const resetCorridorOverride = (slug: string) => {
    setLocalSeo((prev) => {
      const next = { ...prev.corridorOverrides };
      delete next[slug];
      return { corridorOverrides: next };
    });
  };

  const handleSaveAll = async () => {
    const normalizedSeoConfig = normalizeLocalSeoConfig(localSeo);
    await onSave({
      localSeoConfig: normalizedSeoConfig,
      cms: { ...settings.cms, seo, scripts },
    });
    setLocalSeo(normalizedSeoConfig);
    setSavedNotice('Service Area Corridors, Sitemap visibility, and Global SEO settings saved.');
    setTimeout(() => setSavedNotice(null), 3500);
  };

  const enabledCount = resolvedCorridors.filter((c) => c.enabled).length;
  const featuredCount = resolvedCorridors.filter((c) => c.featured && c.enabled).length;

  return (
    <div className="space-y-6">
      {savedNotice && (
        <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* CARD 1: PHASE 58 SERVICE AREA CORRIDORS MANAGER */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
              Local Airport &amp; West County SEO Engine
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">
              Service Area Corridors Manager ({enabledCount}/{resolvedCorridors.length} Active)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Control public indexability, featured hub ordering, `/book` prefill deep-links, and custom headlines/FAQs across all 8 Greater St. Louis corridors.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="info">{featuredCount} Featured</Badge>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isLoading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {isLoading ? 'Saving...' : 'Save Corridors & SEO'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {resolvedCorridors.map((corridor) => {
            const catMeta = CATEGORY_LABELS[corridor.category];
            const ov = localSeo.corridorOverrides[corridor.slug] || {};
            const baseCorridor = getCorridorBySlug(corridor.slug) || corridor;
            const isExpanded = expandedSlug === corridor.slug;
            const faqDrafts: LocalSeoFaqOverrideItem[] =
              ov.customFaqs && ov.customFaqs.length > 0
                ? ov.customFaqs
                : baseCorridor.faqs.map((f) => ({ question: f.question, answer: f.answer }));
            const bookPrefillUrl = buildPrepopulatedBookUrl({
              pickupAddress: corridor.outboundOrigin.address,
              pickupCoordinates: corridor.outboundOrigin.coordinates,
              dropoffAddress: corridor.outboundDestination.address,
              dropoffCoordinates: corridor.outboundDestination.coordinates,
              passengers: 1,
              timingType: 'later',
            });

            return (
              <div
                key={corridor.slug}
                className={`rounded-xl border transition-all ${
                  corridor.enabled ? 'border-slate-200 bg-slate-50/40' : 'border-slate-200 bg-slate-100/70 opacity-80'
                }`}
              >
                <div className="p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${catMeta.badgeClass}`}>
                        {catMeta.label}
                      </span>
                      <span className="text-sm font-extrabold text-slate-900">{corridor.shortTitle}</span>
                      {corridor.featured && corridor.enabled && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          <StarIcon className="w-3 h-3" /> Featured
                        </span>
                      )}
                      {corridor.hasCustomOverrides && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">
                          Custom Copy
                        </span>
                      )}
                      {!corridor.enabled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                          Hidden (404 + Excluded from Sitemap)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1">{corridor.heroHeadline}</p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      <a href={`/service-areas/${corridor.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 font-semibold hover:underline">
                        <span>/service-areas/{corridor.slug}</span>
                        <ExternalLinkIcon className="w-3 h-3" />
                      </a>
                      <a href={bookPrefillUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 font-semibold hover:underline">
                        <span>Test /book Prefill ({corridor.distanceMiles} mi)</span>
                        <ExternalLinkIcon className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={corridor.enabled}
                        onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, enabled: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-blue-600"
                      />
                      <span>Enabled</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={corridor.featured}
                        onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, featured: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-amber-500"
                      />
                      <span>Featured</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setExpandedSlug(isExpanded ? null : corridor.slug)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                    >
                      <EditIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>{isExpanded ? 'Close Editor' : 'Customize Copy & FAQs'}</span>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 bg-white p-4 sm:p-5 rounded-b-xl space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                        Corridor SEO &amp; FAQ Overrides ({corridor.slug})
                      </span>
                      <button
                        type="button"
                        onClick={() => resetCorridorOverride(corridor.slug)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        <RefreshCwIcon className="w-3 h-3" /> Reset to Default
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Hero Headline</label>
                        <input
                          type="text"
                          value={ov.customHeroHeadline ?? ''}
                          onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, customHeroHeadline: e.target.value }))}
                          placeholder={baseCorridor.heroHeadline}
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Meta Title</label>
                        <input
                          type="text"
                          value={ov.customMetaTitle ?? ''}
                          onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, customMetaTitle: e.target.value }))}
                          placeholder={baseCorridor.metaTitle}
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Hero Subheadline</label>
                        <textarea
                          rows={2}
                          value={ov.customHeroSubheadline ?? ''}
                          onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, customHeroSubheadline: e.target.value }))}
                          placeholder={baseCorridor.heroSubheadline}
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Custom Meta Description</label>
                        <textarea
                          rows={2}
                          value={ov.customMetaDescription ?? ''}
                          onChange={(e) => updateOverride(corridor.slug, (p) => ({ ...p, customMetaDescription: e.target.value }))}
                          placeholder={baseCorridor.metaDescription}
                          className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700">
                          Structured Schema.org FAQ Items ({faqDrafts.length})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateOverride(corridor.slug, (p) => ({
                              ...p,
                              customFaqs: [...faqDrafts, { question: 'New corridor question?', answer: 'Enter answer details...' }],
                            }))
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                        >
                          <PlusIcon className="w-3.5 h-3.5" /> Add FAQ
                        </button>
                      </div>

                      {faqDrafts.map((faq, idx) => (
                        <div key={`${corridor.slug}-faq-${idx}`} className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={faq.question}
                              onChange={(e) => {
                                const updated = faqDrafts.map((item, i) => (i === idx ? { ...item, question: e.target.value } : item));
                                updateOverride(corridor.slug, (p) => ({ ...p, customFaqs: updated }));
                              }}
                              placeholder="FAQ Question"
                              className="flex-1 text-xs font-semibold p-2 border border-slate-200 rounded-lg bg-white"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = faqDrafts.filter((_, i) => i !== idx);
                                updateOverride(corridor.slug, (p) => ({ ...p, customFaqs: updated }));
                              }}
                              className="p-2 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Remove FAQ"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={faq.answer}
                            onChange={(e) => {
                              const updated = faqDrafts.map((item, i) => (i === idx ? { ...item, answer: e.target.value } : item));
                              updateOverride(corridor.slug, (p) => ({ ...p, customFaqs: updated }));
                            }}
                            placeholder="FAQ Answer"
                            className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CARD 2: CRAWLABILITY, SITEMAP & GLOBAL META/SCRIPTS */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
              <GlobeIcon className="w-3.5 h-3.5" /> Crawlability, Sitemap &amp; Global Analytics
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 mt-0.5">
              Canonical Origin, Sitemap Endpoints &amp; Script Injector
            </h2>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isLoading}
            className="w-full sm:w-auto bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {isLoading ? 'Saving...' : 'Save SEO & Scripts'}
          </button>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs">
            <span className="font-bold text-slate-700">Active Canonical Origin: </span>
            <code className="font-mono text-slate-900 font-semibold">{canonicalOrigin}</code>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="/robots.txt" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50">
              <span>/robots.txt</span> <ExternalLinkIcon className="w-3 h-3" />
            </a>
            <a href="/sitemap.xml" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50">
              <span>/sitemap.xml</span> <ExternalLinkIcon className="w-3 h-3" />
            </a>
            <a href="/service-areas" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 hover:bg-blue-100">
              <SearchIcon className="w-3 h-3" /> <span>/service-areas Hub</span> <ExternalLinkIcon className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Global Default Meta Title</label>
            <input
              type="text"
              value={seo.defaultMetaTitle}
              onChange={(e) => setSeo({ ...seo, defaultMetaTitle: e.target.value })}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Chesterfield Taxi & Car Service — 24/7 St. Louis Airport & Executive Travel"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Global Default Meta Description</label>
            <textarea
              value={seo.defaultMetaDescription}
              onChange={(e) => setSeo({ ...seo, defaultMetaDescription: e.target.value })}
              rows={2}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Reliable 24-hour taxi and airport car service in Chesterfield, Ballwin, and West County..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Head Scripts (Google Tag Manager, Meta Pixel, Analytics)</label>
              <textarea
                value={scripts.head}
                onChange={(e) => setScripts({ ...scripts, head: e.target.value })}
                rows={4}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-mono"
                placeholder="<!-- <script async src='https://www.googletagmanager.com/gtag/js?id=G-XXXXX'></script> -->"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Footer Scripts (Chat Widgets, Conversion Tags)</label>
              <textarea
                value={scripts.footer}
                onChange={(e) => setScripts({ ...scripts, footer: e.target.value })}
                rows={4}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-mono"
                placeholder="<!-- Live Chat SDK or conversion trackers -->"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
