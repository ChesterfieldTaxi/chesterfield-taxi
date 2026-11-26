import React, { useState, Suspense } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

const MonacoEditor = React.lazy(() => import('@monaco-editor/react'));
import { WebsiteThemesTab } from './WebsiteThemesTab';
import { WebsitePagesTab } from './WebsitePagesTab';
import { WebsiteFormControlsTab } from './WebsiteFormControlsTab';
import { WebsiteNavigationTab } from './WebsiteNavigationTab';
import { WebsiteLocalSeoPanel } from './WebsiteLocalSeoPanel';

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

export const AdminWebsiteTab: React.FC<AdminWebsiteTabProps> = ({
  settings,
  onSave,
  isLoading,
  initialSubTab = 'themes',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<WebsiteSubTab>(
    (initialSubTab as WebsiteSubTab) || 'themes'
  );

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab as WebsiteSubTab);
    }
  }, [initialSubTab]);

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

  const handleSaveCustomCss = async () => {
    await onSave({
      cms: {
        ...settings.cms,
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

      {/* 3. FORM CONTROLS & /TRACK SELF-SERVICE TAB */}
      {activeSubTab === 'form' && (
        <WebsiteFormControlsTab
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 4. HOMEPAGE SECTION CANVAS */}
      {activeSubTab === 'layout' && (
        <div className="bg-surface-card p-4 sm:p-6 rounded-2xl shadow-xs border border-border-subtle space-y-5 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-border-faint pb-4">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Visual Section Pipeline
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-fg-primary mt-0.5">
                Homepage Layout Reordering Canvas
              </h2>
              <p className="text-xs text-fg-muted mt-0.5">
                Drag and drop section blocks to restructure the flow of the homepage.
              </p>
            </div>

            <button
              onClick={handleSaveLayout}
              disabled={isLoading}
              className="w-full sm:w-auto justify-center shrink-0 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
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
                  className="space-y-2.5 sm:space-y-3"
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
                          className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl border transition-all ${
                            snapshot.isDragging
                              ? 'bg-status-info-bg border-blue-400 shadow-md ring-2 ring-blue-500'
                              : 'bg-surface-subtle/70 border-border-subtle hover:bg-surface-muted/70'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <span className="cursor-grab text-fg-subtle font-mono text-xs font-bold shrink-0">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-fg-primary text-sm block truncate">
                                {item.type}
                              </span>
                              <span className="text-[11px] text-fg-muted block leading-snug">
                                {item.type === 'HeroBanner' && 'High-impact value proposition & quick CTAs'}
                                {item.type === 'QuickBookingCard' && 'Instant quote calculation & pickup inputs'}
                                {item.type === 'FleetShowcase' && 'Vehicle service tiers, amenities & capacities'}
                                {item.type === 'FlatTariffMatrix' && 'Fixed-rate airport & regional transfer pricing'}
                                {item.type === 'ServiceAreaList' && 'Coverage map & neighborhood directory'}
                                {item.type === 'TestimonialCarousel' && 'Verified client reviews & ratings'}
                                {item.type === 'ContactBar' && '24/7 direct telephone dispatch badge'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleSectionEnable(item.id)}
                              className={`text-xs px-3 py-1 rounded-full font-bold transition-colors cursor-pointer ${
                                item.isEnabled
                                  ? 'bg-status-success-bg-strong text-status-success-fg border border-status-success-border'
                                  : 'bg-surface-emphasis text-fg-secondary'
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

      {/* 6. SERVICE AREAS, CORRIDORS & GLOBAL SEO TAB */}
      {activeSubTab === 'seo' && (
        <WebsiteLocalSeoPanel
          settings={settings}
          onSave={onSave}
          isLoading={isLoading}
        />
      )}

      {/* 7. MONACO CSS EDITOR */}
      {activeSubTab === 'css' && (
        <div className="bg-surface-card p-4 sm:p-6 rounded-2xl shadow-xs border border-border-subtle space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-border-faint pb-4">
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 block">
                Developer Customization
              </span>
              <h2 className="text-lg font-extrabold text-fg-primary mt-0.5">
                Monaco Custom CSS Style Editor
              </h2>
              <p className="text-xs text-fg-muted mt-0.5">
                Inject custom CSS rules and override styles directly into the live HTML head.
              </p>
            </div>

            <button
              onClick={handleSaveCustomCss}
              disabled={isLoading}
              className="w-full sm:w-auto shrink-0 bg-blue-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {isLoading ? 'Saving...' : 'Publish Custom CSS'}
            </button>
          </div>

          <div className="border border-border-subtle rounded-xl overflow-hidden h-[340px] sm:h-[540px]">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center bg-surface-header text-fg-subtle text-xs font-mono">
                  <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></span>
                  Loading Monaco CSS Editor...
                </div>
              }
            >
              <MonacoEditor
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
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
};
