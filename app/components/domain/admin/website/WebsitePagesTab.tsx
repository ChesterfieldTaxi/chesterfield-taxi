import React, { useState } from 'react';
import type { AppSettings } from '../../../../core/types/config';
import { COMPANY_CONFIG } from '../../../../config/companyConfig';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { CheckIcon, SparklesIcon, FileTextIcon, ShieldCheckIcon } from '../../../ui/Icons';

function EyeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export interface WebsitePagesTabProps {
  settings: AppSettings;
  onSave: (updates: Partial<AppSettings>) => Promise<void>;
  isLoading: boolean;
}

export interface WebsitePageConfig {
  id: string;
  slug: string;
  title: string;
  metaDescription: string;
  status: 'published' | 'draft' | 'maintenance';
  updatedAt: string;
  sectionsCount: number;
  featuredBanner?: boolean;
}

export const INITIAL_WEBSITE_PAGES: WebsitePageConfig[] = [
  {
    id: 'page-home',
    slug: '/',
    title: `${COMPANY_CONFIG.name} — Premium 24/7 Taxi & Chauffeur Services`,
    metaDescription: `Direct Chesterfield taxi dispatch, flat-rate airport transfers to St. Louis Lambert (STL), and executive corporate travel. Available 24 hours.`,
    status: 'published',
    updatedAt: '2026-09-14',
    sectionsCount: 8,
    featuredBanner: true,
  },
  {
    id: 'page-book',
    slug: '/book',
    title: `Book Online — Instant Taxi Reservation | ${COMPANY_CONFIG.name}`,
    metaDescription: `Calculate guaranteed upfront fares, select vehicle service class, and book your ride online with instantaneous driver dispatch.`,
    status: 'published',
    updatedAt: '2026-09-13',
    sectionsCount: 3,
    featuredBanner: false,
  },
  {
    id: 'page-services',
    slug: '/services',
    title: `Our Transportation Services & Flat Rates | ${COMPANY_CONFIG.name}`,
    metaDescription: `Airport transfers, point-to-point city trips, non-emergency medical transportation, and hourly corporate charters in Chesterfield & West County.`,
    status: 'published',
    updatedAt: '2026-09-12',
    sectionsCount: 5,
    featuredBanner: true,
  },
  {
    id: 'page-about',
    slug: '/about',
    title: `About Us & Licensed Fleet Standards | ${COMPANY_CONFIG.name}`,
    metaDescription: `Discover our 25+ year heritage of dependable, background-checked transportation in Chesterfield and Greater St. Louis.`,
    status: 'published',
    updatedAt: '2026-09-10',
    sectionsCount: 4,
    featuredBanner: false,
  },
  {
    id: 'page-contact',
    slug: '/contact',
    title: `Contact & 24/7 Dispatch Desk | ${COMPANY_CONFIG.name}`,
    metaDescription: `Call our local Chesterfield dispatch line at ${COMPANY_CONFIG.phone.dispatch} or send a corporate inquiry. Immediate dispatch available 24/7.`,
    status: 'published',
    updatedAt: '2026-09-14',
    sectionsCount: 3,
    featuredBanner: false,
  },
  {
    id: 'page-track',
    slug: '/track',
    title: `Live Ride Tracking & Status | ${COMPANY_CONFIG.name}`,
    metaDescription: `Real-time GPS tracking for your upcoming or en-route Chesterfield Taxi trip. Live ETA, driver details, and route telemetry.`,
    status: 'published',
    updatedAt: '2026-09-11',
    sectionsCount: 2,
    featuredBanner: false,
  },
  {
    id: 'page-app',
    slug: '/app',
    title: `Passenger Portal — Rides, Receipts & Places | ${COMPANY_CONFIG.name}`,
    metaDescription: `Manage your passenger profile, rebook frequent trips, download PDF receipts, and configure flight tracking.`,
    status: 'published',
    updatedAt: '2026-09-14',
    sectionsCount: 4,
    featuredBanner: false,
  },
];

export function WebsitePagesTab({ settings, onSave, isLoading }: WebsitePagesTabProps) {
  const [pages, setPages] = useState<WebsitePageConfig[]>(INITIAL_WEBSITE_PAGES);
  const [selectedPageId, setSelectedPageId] = useState<string>('page-home');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const selectedPage = pages.find((p) => p.id === selectedPageId) || pages[0];

  const handleUpdateSelected = (updates: Partial<WebsitePageConfig>) => {
    setPages((prev) =>
      prev.map((p) => (p.id === selectedPageId ? { ...p, ...updates, updatedAt: 'Just now' } : p))
    );
  };

  const handleSaveAllPages = async () => {
    // Save pages data under settings.cms if available
    const existingCms = (settings as any).cms || {};
    await onSave({
      cms: {
        ...existingCms,
        pagesConfig: pages,
      },
      updatedAt: new Date().toISOString(),
    } as any);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
            Content Management System (CMS)
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
            Website Pages &amp; Metadata Manager
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure SEO metadata, publication state, and section structures for all website routes.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleSaveAllPages}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm inline-flex items-center gap-2"
        >
          <SparklesIcon className="w-4 h-4" />
          <span>{isLoading ? 'Saving Changes...' : 'Save Pages Configuration'}</span>
        </Button>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span>Page metadata and route settings saved successfully!</span>
        </div>
      )}

      {/* Main Grid: Pages Sidebar + Details Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Page Directory List */}
        <div className="lg:col-span-5 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="px-2 py-1 flex items-center justify-between border-b border-slate-100 pb-3">
            <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              Published Site Routes ({pages.length})
            </span>
            <span className="text-[10px] font-mono text-slate-400">All Live</span>
          </div>

          <div className="space-y-2">
            {pages.map((page) => {
              const isSelected = page.id === selectedPageId;
              return (
                <div
                  key={page.id}
                  onClick={() => setSelectedPageId(page.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600 shadow-xs'
                      : 'border-slate-100 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-extrabold text-blue-700">
                      {page.slug}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        page.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : page.status === 'draft'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {page.status}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-slate-900 truncate">{page.title}</h4>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{page.sectionsCount} active sections</span>
                    <span>Updated {page.updatedAt}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Page Settings & Section Controls */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-mono font-bold text-blue-600 block">
                Editing: {selectedPage.slug}
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                {selectedPage.title}
              </h3>
            </div>

            <a
              href={selectedPage.slug}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-bold text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <EyeIcon className="w-3.5 h-3.5" />
              <span>Preview Route</span>
            </a>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Page Title Tag (SERP H1)
              </label>
              <Input
                value={selectedPage.title}
                onChange={(e) => handleUpdateSelected({ title: e.target.value })}
                className="text-xs"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Recommended 50–60 characters for optimal Google SERP ranking.
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Meta Description (Search Snippet)
              </label>
              <textarea
                value={selectedPage.metaDescription}
                onChange={(e) => handleUpdateSelected({ metaDescription: e.target.value })}
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Length: {selectedPage.metaDescription.length} / 160 characters.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="text-xs font-bold text-slate-800 block">Publication State</label>
                <select
                  value={selectedPage.status}
                  onChange={(e) =>
                    handleUpdateSelected({
                      status: e.target.value as 'published' | 'draft' | 'maintenance',
                    })
                  }
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-lg"
                >
                  <option value="published">Published (Live &amp; Indexed)</option>
                  <option value="draft">Draft (Admin Access Only)</option>
                  <option value="maintenance">Maintenance Mode (Public Shield)</option>
                </select>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 flex flex-col justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-800 block">Featured Header Banner</label>
                  <span className="text-[11px] text-slate-500">
                    Display high-contrast hero backdrop with quick booking CTA
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedPage.featuredBanner ?? false}
                    onChange={(e) => handleUpdateSelected({ featuredBanner: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">Enable Header Banner</span>
                </div>
              </div>
            </div>

            {/* Quick Layout Summary */}
            <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
              <h5 className="text-xs font-extrabold text-blue-900 flex items-center gap-2 mb-1.5">
                <ShieldCheckIcon className="w-4 h-4 text-blue-600" />
                <span>Dynamic Section Pipeline Active</span>
              </h5>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                This page utilizes modular component blocks. You can reorder sections, adjust headings, or inject custom HTML blocks using the layout canvas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
