import React, { useState, useEffect, useRef } from 'react';
import {
  CalendarIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  SearchIcon,
  TrashIcon,
} from '../../ui/Icons';
import {
  dispatchAppSuiteService,
  type DispatchNote,
  type DispatchDocument,
  type DispatchCalendarEvent,
  type DispatchTaskItem,
  type DispatchAppSuiteState,
  type AuthorMeta,
} from '../../../core/services/dispatch/dispatch-app-suite.service';

export type AppSuiteModule = 'calendar' | 'documents' | 'notes' | 'reminders' | 'tasks' | 'help' | null;

function formatTimeAgo(isoDate: string): string {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return 'just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'recently';
  }
}

function getInitials(name?: string): string {
  if (!name) return 'DP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AppSuiteLauncherProps {
  onOpenBookingModal?: () => void;
}

export function AppSuiteLauncher({ onOpenBookingModal }: AppSuiteLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<AppSuiteModule>(null);

  // Shared synchronized state from dispatchAppSuiteService
  const [suiteState, setSuiteState] = useState<DispatchAppSuiteState>(() =>
    dispatchAppSuiteService.getState()
  );

  // Active note selection
  const [activeNoteId, setActiveNoteId] = useState<string>(() =>
    suiteState.notes[0]?.id || 'note-shift-handover'
  );
  const [isEditingNoteTitle, setIsEditingNoteTitle] = useState(false);
  const [noteSaveStatus, setNoteSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // New item inputs
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<DispatchTaskItem['priority']>('med');
  const [showAddDocForm, setShowAddDocForm] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocSummary, setNewDocSummary] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<DispatchDocument['category']>('sop');
  const [showAddCalForm, setShowAddCalForm] = useState(false);
  const [newCalTitle, setNewCalTitle] = useState('');
  const [newCalTime, setNewCalTime] = useState('');
  const [newCalCategory, setNewCalCategory] = useState<DispatchCalendarEvent['category']>('airport');

  const [isEditingNote, setIsEditingNote] = useState(false);
  const launcherRef = useRef<HTMLDivElement>(null);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to real-time shared state across all dispatch staff
  useEffect(() => {
    const unsubscribe = dispatchAppSuiteService.subscribe((newState) => {
      setSuiteState(newState);
      if (!newState.notes.some((n) => n.id === activeNoteId) && newState.notes.length > 0) {
        setActiveNoteId(newState.notes[0].id);
      }
    });
    return () => unsubscribe();
  }, [activeNoteId]);

  // Presence heartbeat for Dispatch Notes
  useEffect(() => {
    if (!isOpen || activeModule !== 'notes') return;
    const sendHeartbeat = () => {
      dispatchAppSuiteService.updatePresence(activeNoteId, isEditingNote);
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [isOpen, activeModule, activeNoteId, isEditingNote]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (launcherRef.current && !launcherRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentAuthor = dispatchAppSuiteService.getCurrentAuthor();
  const activeNote = suiteState.notes.find((n) => n.id === activeNoteId) || suiteState.notes[0];
  const completedTasksCount = suiteState.tasks.filter((t) => t.completed).length;
  const activePresences = dispatchAppSuiteService.getActivePresences(activeNote?.id);
  const peerPresences = activePresences.filter((p) => p.uid !== currentAuthor.uid);

  // ─── NOTE EDIT HANDLER WITH DEBOUNCED AUTO-SAVE ───
  const handleNoteContentChange = (content: string) => {
    if (!activeNote) return;
    setNoteSaveStatus('saving');

    // Optimistically update local view
    setSuiteState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === activeNote.id ? { ...n, content } : n)),
    }));

    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      await dispatchAppSuiteService.updateNote(activeNote.id, { content });
      setNoteSaveStatus('saved');
      setTimeout(() => setNoteSaveStatus('idle'), 2000);
    }, 400);
  };

  const handleCreateNewNote = async () => {
    const newNote = await dispatchAppSuiteService.createNote(
      'New Shift Note',
      `• Created by ${currentAuthor.name} on ${new Date().toLocaleTimeString()}\n• `,
      'general'
    );
    setActiveNoteId(newNote.id);
  };

  // ─── TASK ACTIONS ───
  const handleToggleTask = async (id: string) => {
    await dispatchAppSuiteService.toggleTask(id);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    await dispatchAppSuiteService.addTask(newTaskText.trim(), newTaskPriority);
    setNewTaskText('');
  };

  const handleDeleteTask = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await dispatchAppSuiteService.deleteTask(id);
  };

  // ─── DOCUMENT ACTIONS ───
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;
    await dispatchAppSuiteService.addDocument({
      title: newDocTitle.trim(),
      summary: newDocSummary.trim() || 'Internal standard operating procedure document',
      category: newDocCategory,
      status: 'active',
      version: '1.0',
      validThrough: 'Dec 31, 2026',
    });
    setNewDocTitle('');
    setNewDocSummary('');
    setShowAddDocForm(false);
  };

  // ─── CALENDAR ACTIONS ───
  const handleAddCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCalTitle.trim()) return;
    await dispatchAppSuiteService.addCalendarEvent({
      title: newCalTitle.trim(),
      time: newCalTime.trim() || 'Today 04:00 PM',
      category: newCalCategory,
      tag: newCalCategory === 'airport' ? 'Airport Outbound' : 'Scheduled Ride',
      completed: false,
    });
    setNewCalTitle('');
    setNewCalTime('');
    setShowAddCalForm(false);
  };

  return (
    <div className="relative inline-block" ref={launcherRef}>
      {/* 9-Dot Launcher Button (Waffle) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
          isOpen
            ? 'bg-blue-600 text-white shadow-md'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-white border border-slate-200 shadow-2xs'
        }`}
        title="App Suite: Calendar, Documents, Notes, Reminders, Tasks, Help"
        aria-label="App Suite Launcher"
      >
        <svg
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="4.5" cy="4.5" r="2" />
          <circle cx="12" cy="4.5" r="2" />
          <circle cx="19.5" cy="4.5" r="2" />
          <circle cx="4.5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19.5" cy="12" r="2" />
          <circle cx="4.5" cy="19.5" r="2" />
          <circle cx="12" cy="19.5" r="2" />
          <circle cx="19.5" cy="19.5" r="2" />
        </svg>
      </button>

      {/* Launcher Popover Modal */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 sm:w-104 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-base text-blue-400">❖</span>
              <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                Dispatch App Suite
              </span>
              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Shared Sync
              </span>
            </div>
            {activeModule ? (
              <button
                type="button"
                onClick={() => setActiveModule(null)}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                ← All Apps
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 font-medium">
                Author: <strong className="text-slate-200">{currentAuthor.name}</strong>
              </span>
            )}
          </div>

          {/* ─── GRID OF APPS (when no active sub-module) ─── */}
          {!activeModule && (
            <div className="p-4 grid grid-cols-3 gap-3 bg-slate-50/60">
              {/* Calendar */}
              <button
                type="button"
                onClick={() => setActiveModule('calendar')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-blue-700">Calendar</span>
                <span className="text-[10px] text-slate-400">{suiteState.calendar.length} Scheduled</span>
              </button>

              {/* Documents */}
              <button
                type="button"
                onClick={() => setActiveModule('documents')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <DocumentTextIcon className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-amber-800">Documents</span>
                <span className="text-[10px] text-slate-400">{suiteState.documents.length} Shared</span>
              </button>

              {/* Notes */}
              <button
                type="button"
                onClick={() => setActiveModule('notes')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <span className="text-lg">📝</span>
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-purple-800">Notes</span>
                <span className="text-[10px] text-slate-400">{suiteState.notes.length} Pads</span>
              </button>

              {/* Reminders */}
              <button
                type="button"
                onClick={() => setActiveModule('reminders')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <ClockIcon className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-rose-700">Reminders</span>
                <span className="text-[10px] text-slate-400">Flight & Alarms</span>
              </button>

              {/* Tasks */}
              <button
                type="button"
                onClick={() => setActiveModule('tasks')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <CheckIcon className="w-5 h-5" />
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-emerald-800">Tasks</span>
                <span className="text-[10px] text-slate-400">{completedTasksCount}/{suiteState.tasks.length} Done</span>
              </button>

              {/* Help & SOPs */}
              <button
                type="button"
                onClick={() => setActiveModule('help')}
                className="flex flex-col items-center justify-center p-3 rounded-xl bg-white hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center group-hover:scale-110 transition-transform mb-1.5 shadow-2xs">
                  <span className="text-lg">❓</span>
                </div>
                <span className="font-extrabold text-xs text-slate-800 group-hover:text-cyan-800">Help & SOPs</span>
                <span className="text-[10px] text-slate-400">Radio Codes</span>
              </button>
            </div>
          )}

          {/* ─── SUB-MODULE: NOTES (Google Docs-style Multi-Author Tracking) ─── */}
          {activeModule === 'notes' && (
            <div className="p-3.5 space-y-2.5 max-h-[460px] overflow-y-auto">
              {/* Note Tabs & Add Button */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pr-1">
                  {suiteState.notes.map((note) => {
                    const isActive = note.id === activeNoteId;
                    return (
                      <button
                        key={note.id}
                        type="button"
                        onClick={() => setActiveNoteId(note.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                          isActive
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                      >
                        <span>{note.title}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleCreateNewNote}
                  className="px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs shrink-0 cursor-pointer border border-purple-200"
                  title="Create new shared note pad"
                >
                  + New Note
                </button>
              </div>

              {activeNote && (
                <>
                  {/* Google Docs-Style Author Attribution Chip + Live Collaborator Avatars */}
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-purple-600 text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-2xs">
                        {getInitials(activeNote.lastModifiedBy?.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-slate-900 truncate">
                            {activeNote.lastModifiedBy?.name || 'Dispatcher'}
                          </span>
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-semibold capitalize">
                            {activeNote.lastModifiedBy?.role || 'staff'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Last edited {formatTimeAgo(activeNote.updatedAt)}
                        </div>
                      </div>
                    </div>

                    {/* Google Docs-Style Live Presence Avatar Stack */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Active Presence Avatars */}
                      <div className="flex items-center -space-x-2 overflow-hidden" title="Live dispatchers currently active on this pad">
                        {activePresences.map((p) => {
                          const isSelf = p.uid === currentAuthor.uid;
                          return (
                            <div
                              key={p.uid}
                              className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-[10px] font-black ring-2 ring-white shadow-2xs cursor-help ${
                                p.avatarColor || (isSelf ? 'bg-purple-600' : 'bg-emerald-600')
                              }`}
                              title={`${p.name} (${p.role || 'dispatcher'})${isSelf ? ' (You)' : ''}${
                                p.isEditing ? ' • ✍️ Typing now' : ' • 👁️ Viewing'
                              }`}
                            >
                              <span>{getInitials(p.name)}</span>
                              {p.isEditing ? (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white animate-pulse" />
                              ) : (
                                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {noteSaveStatus === 'saving' && (
                        <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1 animate-pulse">
                          <span>●</span> Saving...
                        </span>
                      )}
                      {noteSaveStatus === 'saved' && (
                        <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <span>✓</span> Saved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Teammate Live Viewing / Editing Banner */}
                  {peerPresences.length > 0 && (
                    <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50/90 border border-emerald-200 text-[11px] text-emerald-800 animate-in fade-in duration-200">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping shrink-0" />
                        <span className="font-semibold truncate">
                          <strong>{peerPresences.map((p) => p.name).join(', ')}</strong>{' '}
                          {peerPresences.some((p) => p.isEditing) ? 'is currently editing this pad...' : 'is viewing this note'}
                        </span>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-200/60 px-1.5 py-0.2 rounded text-emerald-900 shrink-0">
                        Live Sync
                      </span>
                    </div>
                  )}

                  {/* Note Title Input */}
                  <input
                    type="text"
                    value={activeNote.title}
                    onFocus={() => setIsEditingNote(true)}
                    onBlur={() => setIsEditingNote(false)}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      dispatchAppSuiteService.updateNote(activeNote.id, { title: newTitle });
                    }}
                    className="w-full text-xs font-bold px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-purple-500"
                    placeholder="Note Title..."
                  />

                  {/* Note Content Textarea */}
                  <textarea
                    value={activeNote.content}
                    onFocus={() => setIsEditingNote(true)}
                    onBlur={() => setIsEditingNote(false)}
                    onChange={(e) => handleNoteContentChange(e.target.value)}
                    rows={8}
                    className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 bg-amber-50/20 text-slate-900 placeholder-slate-400 focus:outline-purple-500 resize-none leading-relaxed"
                    placeholder="Type shared shift handover notes, gate codes, airport advisories..."
                  />

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>
                      Created by {activeNote.createdBy?.name || 'Admin'} • Synced live to all dispatchers
                    </span>
                    {suiteState.notes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => dispatchAppSuiteService.deleteNote(activeNote.id)}
                        className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Delete Pad
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─── SUB-MODULE: DOCUMENTS (Shared Compliance & Rates) ─── */}
          {activeModule === 'documents' && (
            <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <DocumentTextIcon className="w-4 h-4 text-amber-600" />
                    <span>Shared Operating Documents</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">Official permits, franchise tariffs & SOPs</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddDocForm(!showAddDocForm)}
                  className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs cursor-pointer"
                >
                  {showAddDocForm ? 'Cancel' : '+ Add SOP'}
                </button>
              </div>

              {showAddDocForm && (
                <form onSubmit={handleAddDocument} className="p-2.5 bg-amber-50/50 rounded-xl border border-amber-200 space-y-2 text-xs animate-in fade-in duration-100">
                  <input
                    type="text"
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    placeholder="Document Title (e.g. VCU Discharge Protocol)..."
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-amber-300 bg-white"
                    required
                  />
                  <input
                    type="text"
                    value={newDocSummary}
                    onChange={(e) => setNewDocSummary(e.target.value)}
                    placeholder="Summary / Instructions..."
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-amber-300 bg-white"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={newDocCategory}
                      onChange={(e) => setNewDocCategory(e.target.value as any)}
                      className="text-xs bg-white border border-amber-300 rounded-lg px-2 py-1"
                    >
                      <option value="sop">SOP Manual</option>
                      <option value="permit">Permit</option>
                      <option value="tariff">Tariff Card</option>
                      <option value="policy">Company Policy</option>
                    </select>
                    <button
                      type="submit"
                      className="px-3 py-1 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-lg"
                    >
                      Publish Document
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2 text-xs">
                {suiteState.documents.map((doc) => (
                  <div key={doc.id} className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-colors space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-bold text-slate-900">{doc.title}</h5>
                        <p className="text-[11px] text-slate-600 leading-tight mt-0.5">{doc.summary}</p>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded shrink-0 border border-emerald-200">
                        {doc.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                      <span>Valid: <strong className="text-slate-700">{doc.validThrough || 'Permanent'}</strong> • v{doc.version}</span>
                      <span className="text-slate-400">
                        Author: {doc.lastModifiedBy?.name || 'Admin'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── SUB-MODULE: CALENDAR (Scheduled Rides & Shifts) ─── */}
          {activeModule === 'calendar' && (
            <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-blue-600" />
                    <span>Scheduled Rides & Airport Shifts</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">Shared forward reservations</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddCalForm(!showAddCalForm)}
                  className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs cursor-pointer"
                >
                  {showAddCalForm ? 'Cancel' : '+ Add Event'}
                </button>
              </div>

              {showAddCalForm && (
                <form onSubmit={handleAddCalendarEvent} className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-2 text-xs animate-in fade-in duration-100">
                  <input
                    type="text"
                    value={newCalTitle}
                    onChange={(e) => setNewCalTitle(e.target.value)}
                    placeholder="Passenger / Event Name (e.g. John Doe DL881)..."
                    className="w-full text-xs px-2 py-1.5 rounded-lg border border-blue-300 bg-white"
                    required
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newCalTime}
                      onChange={(e) => setNewCalTime(e.target.value)}
                      placeholder="Time (e.g. Tomorrow 08:30 AM)..."
                      className="flex-1 text-xs px-2 py-1.5 rounded-lg border border-blue-300 bg-white"
                      required
                    />
                    <select
                      value={newCalCategory}
                      onChange={(e) => setNewCalCategory(e.target.value as any)}
                      className="text-xs bg-white border border-blue-300 rounded-lg px-2 py-1.5"
                    >
                      <option value="airport">Airport</option>
                      <option value="flight">Flight</option>
                      <option value="medical">Medical</option>
                      <option value="driver">Driver Shift</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs"
                  >
                    Schedule Shared Ride
                  </button>
                </form>
              )}

              <div className="space-y-2 text-xs">
                {suiteState.calendar.map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => dispatchAppSuiteService.toggleCalendarEvent(ev.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer space-y-1 ${
                      ev.completed
                        ? 'bg-slate-50 border-slate-200 opacity-60 line-through'
                        : 'bg-white border-blue-100 shadow-2xs hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-extrabold text-blue-900">{ev.time}</span>
                      <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded text-[10px]">
                        {ev.tag}
                      </span>
                    </div>
                    <p className="font-bold text-slate-900">{ev.title}</p>
                    {ev.routeSummary && (
                      <p className="text-[11px] text-slate-600">{ev.routeSummary}</p>
                    )}
                    {ev.specialRequests && (
                      <p className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                        Note: {ev.specialRequests}
                      </p>
                    )}
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                      <span>Scheduled by: <strong className="text-slate-600">{ev.createdBy?.name || 'Dispatcher'}</strong></span>
                      <span>{ev.completed ? '✓ Completed' : 'Pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── SUB-MODULE: REMINDERS (Operational Alarms) ─── */}
          {activeModule === 'reminders' && (
            <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <ClockIcon className="w-4 h-4 text-rose-600" />
                    <span>Time-Sensitive Dispatch Alarms</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">Live alarms shared across dispatch shift</p>
                </div>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  {suiteState.calendar.filter((c) => !c.completed).length + suiteState.tasks.filter((t) => !t.completed && t.priority === 'high').length} Active
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {suiteState.calendar.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-rose-100 bg-white shadow-2xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">⏰</span>
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{item.title}</span>
                        <span className="text-[10px] text-rose-600 font-mono font-medium">
                          {item.time} • {item.tag}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      by {item.createdBy?.name || 'Staff'}
                    </span>
                  </div>
                ))}

                {suiteState.tasks.filter((t) => t.priority === 'high' && !t.completed).map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/40 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">⚠️</span>
                      <span className="font-bold text-xs text-slate-800">{task.text}</span>
                    </div>
                    <span className="text-[9px] font-black uppercase text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                      High Priority
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── SUB-MODULE: TASKS (Shared Operations Checklist with Author Tracking) ─── */}
          {activeModule === 'tasks' && (
            <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    <span>Shift Operations Checklist</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    {completedTasksCount} of {suiteState.tasks.length} completed
                  </p>
                </div>
                <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${suiteState.tasks.length ? (completedTasksCount / suiteState.tasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                {suiteState.tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleToggleTask(task.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      task.completed
                        ? 'bg-slate-50 border-slate-200 line-through text-slate-400'
                        : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-emerald-600 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium block truncate">{task.text}</span>
                        <div className="text-[9px] text-slate-400 flex items-center gap-1">
                          <span>Added by {task.createdBy?.name || 'Staff'}</span>
                          {task.completedBy && (
                            <span>• ✓ Done by {task.completedBy.name}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.priority === 'high' && (
                        <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                          High
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        className="text-slate-300 hover:text-rose-500 p-0.5 rounded cursor-pointer"
                        title="Delete task"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Task Form */}
              <form onSubmit={handleAddTask} className="pt-2 border-t border-slate-200 flex gap-1.5">
                <input
                  type="text"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="Add shared task..."
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  required
                />
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as any)}
                  className="text-xs px-1.5 py-1 rounded-lg border border-slate-300 bg-slate-50 font-bold"
                >
                  <option value="high">High</option>
                  <option value="med">Med</option>
                  <option value="low">Low</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer shadow-2xs"
                >
                  Add
                </button>
              </form>
            </div>
          )}

          {/* ─── SUB-MODULE: HELP & SOPS ─── */}
          {activeModule === 'help' && (
            <div className="p-3.5 space-y-3 max-h-[460px] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <span className="text-sm">❓</span>
                  <span>Dispatch Codes & Emergency SOPs</span>
                </h4>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1">
                  <h5 className="font-bold text-slate-900">Radio 10-Codes Reference</h5>
                  <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                    <div><span className="font-mono font-bold text-slate-900">10-4</span>: Acknowledged</div>
                    <div><span className="font-mono font-bold text-slate-900">10-7</span>: Out of Service</div>
                    <div><span className="font-mono font-bold text-slate-900">10-8</span>: In Service / Available</div>
                    <div><span className="font-mono font-bold text-slate-900">10-20</span>: Current Location</div>
                    <div><span className="font-mono font-bold text-slate-900">10-33</span>: Emergency Traffic</div>
                    <div><span className="font-mono font-bold text-slate-900">10-76</span>: En Route</div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/40 space-y-1">
                  <h5 className="font-bold text-rose-900">Emergency & Key Contacts</h5>
                  <div className="space-y-0.5 text-[11px] text-slate-700">
                    <div>Chesterfield Police Non-Emergency: <span className="font-mono font-bold">(804) 748-1251</span></div>
                    <div>RIC Airport Ground Dispatch: <span className="font-mono font-bold">(804) 226-3000</span></div>
                    <div>Fleet Towing & Roadside: <span className="font-mono font-bold">(804) 555-0191</span></div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1">
                  <h5 className="font-bold text-slate-900">Keyboard Shortcuts</h5>
                  <div className="space-y-0.5 text-[11px] text-slate-600">
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">/ or Ctrl+K</kbd> Search Trips Queue</div>
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">Alt + P</kbd> Toggle Phone Hub</div>
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">Alt + D</kbd> Toggle Drivers Console</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
