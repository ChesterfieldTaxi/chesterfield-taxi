import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import Editor from '@monaco-editor/react';
import { WebsiteThemesTab } from './WebsiteThemesTab';
import { WebsitePagesTab } from './WebsitePagesTab';
import { WebsiteFormControlsTab } from './WebsiteFormControlsTab';
import { WebsiteNavigationTab } from './WebsiteNavigationTab';
import {
  FileTextIcon,
  PaletteIcon,
  SlidersIcon,
  LayersIcon,
  CompassIcon,
  SearchIcon,
  CodeIcon,
  SparklesIcon,
  SettingsIcon,
  ShieldCheckIcon,
  HistoryIcon,
  CarIcon,
} from '../../../ui/Icons';

export interface AdminWebsiteTabProps {
  settings: any;
  onSave: (updates: any) => Promise<void>;
  isLoading: boolean;
  initialSubTab?: string;
}

export type WebsiteSubTab =
  | 'pages'
  | 'themes'
  | 'form'
  | 'layout'
  | 'navigation'
  | 'seo'
  | 'css';

const WEBSITE_SUB_TABS: Array<{
  id: WebsiteSubTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'pages', label: 'Pages Directory', icon: FileTextIcon },
  { id: 'themes', label: 'Themes & Livery', icon: PaletteIcon },
  { id: 'form', label: 'Form Controls', icon: SlidersIcon },
  { id: 'layout', label: 'Section Canvas', icon: LayersIcon },
  { id: 'navigation', label: 'Header & Footer', icon: CompassIcon },
  { id: 'seo', label: 'SEO & Analytics', icon: SearchIcon },
  { id: 'css', label: 'Monaco CSS Editor', icon: CodeIcon },
];

export const AdminWebsiteTab: React.FC<AdminWebsiteTabProps> = ({
  settings,
  onSave,
  isLoading,
  initialSubTab = 'pages',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<WebsiteSubTab>(
    (initialSubTab as WebsiteSubTab) || 'pages'
  );

  // Layout Builder State
  const defaultLayout = settings.cms?.homepageLayout || [
    { id: '1', type: 'HeroBanner', isEnabled: true },
    { id: '2', type: 'QuickBookingCard', isEnabled: true },
    { id: '3', type: 'FleetShowcase', isEnabled: true },
    { id: '4', type: 'FlatTariffMatrix', isEnabled: true },
    { id: '5', type: 'ServiceAreaList', isEnabled: true },
    { id: '6', type: 'TestimonialCarousel', isEnabled: true },
    { id: '7', type: 'ContactBar', isEnabled: true },
  ];
  const [layout, setLayout] = useState(defaultLayout);

  // SEO State
  const [seo, setSeo] = useState(
    settings.cms?.seo || {
      defaultMetaTitle: '',
      defaultMetaDescription: '',
      defaultOpenGraphImage: '',
    }
  );

  // Scripts & CSS State
  const [scripts, setScripts] = useState(
    settings.cms?.scripts || { head: '', footer: '' }
  );
  const [customCss, setCustomCss] = useState(settings.cms?.customCss || '');

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(layout);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setLayout(items);
  };

  const handleSaveLayout = async () => {
    await onSave({
      cms: {
        ...settings.cms,
        homepageLayout: layout,
      },
    });
  };

  const handleSaveSeo = async () => {
    await onSave({
      cms: {
        ...settings.cms,
        seo,
        scripts,
        customCss,
      },
    });
  };

  const toggleSectionEnable = (id: string) => {
    setLayout((prev: any[]) =>
      prev.map((item) =>
        item.id === id ? { ...item, isEnabled: !item.isEnabled } : item
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Visual CMS Studio Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-1.5">
        {WEBSITE_SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. PAGES TAB */}
      {activeSubTab === 'pages' && (
        <WebsitePagesTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 2. THEMES & BRANDING TAB */}
      {activeSubTab === 'themes' && (
        <WebsiteThemesTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 3. FORM CONTROLS TAB */}
      {activeSubTab === 'form' && (
        <WebsiteFormControlsTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 4. HOMEPAGE SECTION CANVAS */}
      {activeSubTab === 'layout' && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Visual Section Pipeline
              </span>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                Homepage Layout Reordering Canvas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Drag and drop section blocks to restructure the flow of the homepage.
              </p>
            </div>

            <button
              onClick={handleSaveLayout}
              disabled={isLoading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'Saving...' : 'Save Section Order'}
            </button>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="layout-list">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-3"
                >
                  {layout.map((item: any, index: number) => (
                    <Draggable
                      key={item.id}
                      draggableId={item.id}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            snapshot.isDragging
                              ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-500'
                              : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="cursor-grab text-slate-400 text-base">
                              ☰
                            </span>
                            <span className="font-mono text-xs font-bold text-slate-400">
                              #{index + 1}
                            </span>
                            <div>
                              <span className="font-bold text-slate-900 text-sm block">
                                {item.type}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                {item.type === 'HeroBanner' && 'High-impact value proposition & quick CTAs'}
                                {item.type === 'QuickBookingCard' && 'Instant quote calculation & pickup inputs'}
                                {item.type === 'FleetShowcase' && 'Vehicle service tiers, amenities & capacities'}
                                {item.type === 'FlatTariffMatrix' && 'Fixed-rate airport & regional transfer pricing'}
                                {item.type === 'ServiceAreaList' && 'Coverage map & neighborhood directory'}
                                {item.type === 'TestimonialCarousel' && 'Verified customer reviews & passenger ratings'}
                                {item.type === 'ContactBar' && '24/7 direct telephone dispatch badge'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleSectionEnable(item.id)}
                              className={`text-xs px-3 py-1 rounded-full font-bold transition-colors ${
                                item.isEnabled
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {item.isEnabled ? 'Active' : 'Hidden'}
                            </button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {/* 5. NAVIGATION TAB */}
      {activeSubTab === 'navigation' && (
        <WebsiteNavigationTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 6. SEO & SCRIPTS TAB */}
      {activeSubTab === 'seo' && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Search Engine Optimization
              </span>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                Global SEO &amp; Analytics Script Injector
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage global OpenGraph metadata, Google Tag Manager, Meta Pixel, and tracking tags.
              </p>
            </div>

            <button
              onClick={handleSaveSeo}
              disabled={isLoading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'Saving...' : 'Save SEO & Scripts'}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Default Meta Title
              </label>
              <input
                type="text"
                value={seo.defaultMetaTitle}
                onChange={(e) => setSeo({ ...seo, defaultMetaTitle: e.target.value })}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Chesterfield Taxi & Car Service — 24/7 St. Louis Airport & Executive Travel"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Default Meta Description
              </label>
              <textarea
                value={seo.defaultMetaDescription}
                onChange={(e) =>
                  setSeo({ ...seo, defaultMetaDescription: e.target.value })
                }
                rows={3}
                className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Reliable 24-hour taxi and chauffeured car service in Chesterfield, Ballwin, and West County..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Head Scripts (GTM, Meta Pixel, Telemetry)
                </label>
                <textarea
                  value={scripts.head}
                  onChange={(e) =>
                    setScripts({ ...scripts, head: e.target.value })
                  }
                  rows={6}
                  className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-mono"
                  placeholder="<!-- <script async src='https://www.googletagmanager.com/gtag/js?id=G-XXXXX'></script> -->"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Footer Scripts (Chat Widgets, Conversion Tags)
                </label>
                <textarea
                  value={scripts.footer}
                  onChange={(e) =>
                    setScripts({ ...scripts, footer: e.target.value })
                  }
                  rows={6}
                  className="w-full text-xs p-3 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white font-mono"
                  placeholder="<!-- Live Chat SDK or conversion trackers -->"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MONACO CSS EDITOR */}
      {activeSubTab === 'css' && (
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Developer Customization
              </span>
              <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                Monaco Custom CSS Style Editor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inject custom CSS rules and override styles directly into the live HTML head.
              </p>
            </div>

            <button
              onClick={handleSaveSeo}
              disabled={isLoading}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
            >
              {isLoading ? 'Saving...' : 'Publish Custom CSS'}
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden h-[540px]">
            <Editor
              height="100%"
              defaultLanguage="css"
              value={customCss}
              onChange={(val) => setCustomCss(val || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
