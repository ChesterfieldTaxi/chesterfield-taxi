import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import Editor from '@monaco-editor/react';

export interface AdminWebsiteTabProps {
  settings: any;
  onSave: (updates: any) => Promise<void>;
  isLoading: boolean;
  initialSubTab?: string;
}

export const AdminWebsiteTab: React.FC<AdminWebsiteTabProps> = ({
  settings,
  onSave,
  isLoading,
  initialSubTab = 'layout'
}) => {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);

  // Layout Builder State
  const defaultLayout = settings.cms?.homepageLayout || [];
  const [layout, setLayout] = useState(defaultLayout);

  // SEO State
  const [seo, setSeo] = useState(settings.cms?.seo || {
    defaultMetaTitle: '',
    defaultMetaDescription: '',
    defaultOpenGraphImage: ''
  });

  // Scripts & CSS State
  const [scripts, setScripts] = useState(settings.cms?.scripts || { head: '', footer: '' });
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
        homepageLayout: layout
      }
    });
  };

  const handleSaveSeo = async () => {
    await onSave({
      cms: {
        ...settings.cms,
        seo,
        scripts,
        customCss
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveSubTab('layout')}
          className={`py-3 px-4 font-semibold ${activeSubTab === 'layout' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
        >
          Layout Builder
        </button>
        <button
          onClick={() => setActiveSubTab('seo')}
          className={`py-3 px-4 font-semibold ${activeSubTab === 'seo' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
        >
          SEO & Scripts
        </button>
        <button
          onClick={() => setActiveSubTab('css')}
          className={`py-3 px-4 font-semibold ${activeSubTab === 'css' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
        >
          Monaco CSS Editor
        </button>
      </div>

      {activeSubTab === 'layout' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Homepage Layout Builder</h2>
          <p className="text-sm text-slate-500 mb-4">Drag and drop sections to reorder the homepage layout.</p>
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="layout-list">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
                  {layout.map((item: any, index: number) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-slate-400">☰</span>
                            <span className="font-semibold text-slate-800">{item.type}</span>
                          </div>
                          <div>
                            <span className={`text-xs px-2 py-1 rounded-full ${item.isEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                              {item.isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
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
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveLayout}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'seo' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4">SEO & Scripts Manager</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Meta Title</label>
              <input 
                type="text" 
                value={seo.defaultMetaTitle}
                onChange={e => setSeo({ ...seo, defaultMetaTitle: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Meta Description</label>
              <textarea 
                value={seo.defaultMetaDescription}
                onChange={e => setSeo({ ...seo, defaultMetaDescription: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg h-24"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Head Scripts</label>
              <textarea 
                value={scripts.head}
                onChange={e => setScripts({ ...scripts, head: e.target.value })}
                className="w-full p-2 border border-slate-300 rounded-lg h-24 font-mono text-sm"
                placeholder="<!-- Google Analytics, Facebook Pixel, etc. -->"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveSeo}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save SEO'}
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'css' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[600px] flex flex-col">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Monaco Custom CSS Editor</h2>
          <p className="text-sm text-slate-500 mb-4">Inject custom styles site-wide.</p>
          <div className="flex-1 border border-slate-300 rounded-lg overflow-hidden">
            <Editor
              height="100%"
              defaultLanguage="css"
              value={customCss}
              onChange={(val) => setCustomCss(val || '')}
              theme="vs-dark"
              options={{ minimap: { enabled: false } }}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveSeo}
              disabled={isLoading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : 'Save CSS'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
