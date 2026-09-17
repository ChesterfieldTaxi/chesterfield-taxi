import React, { useState, useEffect, useRef } from 'react';
import {
  CalendarIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckIcon,
  XIcon,
  SearchIcon,
  ExternalLinkIcon,
  TrashIcon,
} from '../../ui/Icons';

export type AppSuiteModule = 'calendar' | 'documents' | 'notes' | 'reminders' | 'tasks' | 'help' | null;

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'med' | 'low';
}

interface ReminderItem {
  id: string;
  title: string;
  time: string;
  category: 'flight' | 'driver' | 'payment';
  completed: boolean;
}

const INITIAL_TASKS: TaskItem[] = [
  { id: 't-1', text: 'Verify morning airport pre-bookings with RIC operations', completed: true, priority: 'high' },
  { id: 't-2', text: 'Audit daily card terminal settlement batches with Stripe vault', completed: true, priority: 'med' },
  { id: 't-3', text: 'Check driver medallion & inspection compliance logs', completed: false, priority: 'high' },
  { id: 't-4', text: 'Restock printed receipt paper rolls & fuel card vouchers', completed: false, priority: 'low' },
  { id: 't-5', text: 'Send weekly corporate accounts summary to Capital One & VCU', completed: false, priority: 'med' },
];

const INITIAL_REMINDERS: ReminderItem[] = [
  { id: 'r-1', title: 'Wake-up check for VIP pickup DL1492 (Amanda Vance)', time: '08:00 AM', category: 'flight', completed: false },
  { id: 'r-2', title: 'Driver shift transition: Night shift relief for Units #04 & #07', time: '06:00 PM', category: 'driver', completed: false },
  { id: 'r-3', title: 'Fuel surcharge index weekly review', time: 'Tomorrow 10:00 AM', category: 'payment', completed: false },
];

export interface AppSuiteLauncherProps {
  onOpenBookingModal?: () => void;
}

export function AppSuiteLauncher({ onOpenBookingModal }: AppSuiteLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModule, setActiveModule] = useState<AppSuiteModule>(null);
  const [notes, setNotes] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cf_dispatch_shift_notes') || 
`DISPATCH HANDOVER MEMO - ${new Date().toLocaleDateString()}
• Richmond Int'l Airport (RIC) construction on lower arrivals loop; tell drivers to use Door 3.
• Corporate account #CP-8821 (Capital One) has 2 executive sedans requested tomorrow.
• Gate code for Midlothian gated community (Tarrington): #4492.
• Cab #12 scheduled for oil change at 2:00 PM.`;
    }
    return '';
  });

  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [newTaskText, setNewTaskText] = useState('');
  const [reminders, setReminders] = useState<ReminderItem[]>(INITIAL_REMINDERS);
  const [newReminderTitle, setNewReminderTitle] = useState('');
  const [newReminderTime, setNewReminderTime] = useState('');

  const launcherRef = useRef<HTMLDivElement>(null);

  // Persist notes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('cf_dispatch_shift_notes', notes);
    }
  }, [notes]);

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

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;
    setTasks((prev) => [
      ...prev,
      { id: `t-${Date.now()}`, text: newTaskText.trim(), completed: false, priority: 'med' },
    ]);
    setNewTaskText('');
  };

  const toggleReminder = (id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  };

  const addReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminderTitle.trim()) return;
    setReminders((prev) => [
      ...prev,
      {
        id: `r-${Date.now()}`,
        title: newReminderTitle.trim(),
        time: newReminderTime.trim() || 'Today',
        category: 'driver',
        completed: false,
      },
    ]);
    setNewReminderTitle('');
    setNewReminderTime('');
  };

  const completedTasksCount = tasks.filter((t) => t.completed).length;

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
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-base">❖</span>
              <span className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                Dispatch App Suite
              </span>
            </div>
            {activeModule ? (
              <button
                type="button"
                onClick={() => setActiveModule(null)}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                ← All Apps
              </button>
            ) : (
              <span className="text-[10px] text-slate-400">Chesterfield Operations</span>
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
                <span className="text-[10px] text-slate-400">Shifts & Rides</span>
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
                <span className="text-[10px] text-slate-400">Permits & Rates</span>
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
                <span className="text-[10px] text-slate-400">Handover Pad</span>
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
                <span className="text-[10px] text-slate-400">Flight Alarms</span>
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
                <span className="text-[10px] text-slate-400">{completedTasksCount}/{tasks.length} Done</span>
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

          {/* ─── SUB-MODULE: CALENDAR ─── */}
          {activeModule === 'calendar' && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-blue-600" />
                  <span>Scheduled Rides & Shifts</span>
                </h4>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  Today & Tomorrow
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-blue-900">08:30 AM Tomorrow</span>
                    <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 rounded">Pre-booked</span>
                  </div>
                  <p className="font-bold text-slate-900">Amanda Vance (DL 1492)</p>
                  <p className="text-[11px] text-slate-600">RIC Airport → Capital One West Creek</p>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-slate-800">11:00 AM Tomorrow</span>
                    <span className="font-bold text-amber-700 bg-amber-100 px-1.5 rounded">Medical</span>
                  </div>
                  <p className="font-bold text-slate-900">Dr. Elena Rossi (Wheelchair)</p>
                  <p className="text-[11px] text-slate-600">VCU Health Gateway → Patterson Ave</p>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-slate-800">02:15 PM Tomorrow</span>
                    <span className="font-bold text-blue-700 bg-blue-100 px-1.5 rounded">Airport Outbound</span>
                  </div>
                  <p className="font-bold text-slate-900">The Jefferson Hotel → RIC Airport</p>
                  <p className="text-[11px] text-slate-600">Executive sedan requested</p>
                </div>
              </div>
            </div>
          )}

          {/* ─── SUB-MODULE: DOCUMENTS ─── */}
          {activeModule === 'documents' && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <DocumentTextIcon className="w-4 h-4 text-amber-600" />
                  <span>Fleet Permits & Compliance</span>
                </h4>
                <span className="text-[10px] text-slate-500">4 Active</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900">RIC Airport Ground Operator Permit</h5>
                    <p className="text-[10px] text-slate-500">Permit #RIC-TAXI-2026 • Valid through Dec 2026</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900">City Medallion Franchise Certificate</h5>
                    <p className="text-[10px] text-slate-500">Chesterfield & Henrico County Joint Operating</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900">Commercial Fleet Insurance ($1M)</h5>
                    <p className="text-[10px] text-slate-500">Policy #TRV-882910 • Travelers Commercial</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                </div>

                <div className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-900">Standard Taxi Meter Tariff Schedule</h5>
                    <p className="text-[10px] text-slate-500">Base $3.50 + $2.80/mi + $0.50/min wait</p>
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Rate Card</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── SUB-MODULE: NOTES ─── */}
          {activeModule === 'notes' && (
            <div className="p-4 space-y-2.5 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <span>📝 Dispatcher Shift Handover Notes</span>
                </h4>
                <span className="text-[10px] text-slate-400">Auto-saved to storage</span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={9}
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-300 bg-amber-50/30 text-slate-800 placeholder-slate-400 focus:outline-blue-500 resize-none leading-relaxed"
                placeholder="Type shift handover notes, gate codes, customer reminders..."
              />
              <p className="text-[10px] text-slate-500 italic">
                Notes persist across sessions and page refreshes.
              </p>
            </div>
          )}

          {/* ─── SUB-MODULE: REMINDERS ─── */}
          {activeModule === 'reminders' && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                  <ClockIcon className="w-4 h-4 text-rose-600" />
                  <span>Time-Sensitive Dispatch Alarms</span>
                </h4>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                  {reminders.filter((r) => !r.completed).length} Pending
                </span>
              </div>

              <div className="space-y-2">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    onClick={() => toggleReminder(reminder.id)}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      reminder.completed
                        ? 'bg-slate-50 border-slate-200 opacity-60 line-through'
                        : 'bg-white border-rose-200/90 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={reminder.completed}
                        onChange={() => {}}
                        className="w-4 h-4 rounded text-rose-600 cursor-pointer"
                      />
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{reminder.title}</span>
                        <span className="text-[10px] text-rose-600 font-mono font-medium">
                          ⏰ {reminder.time}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={addReminder} className="pt-2 border-t border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={newReminderTitle}
                  onChange={(e) => setNewReminderTitle(e.target.value)}
                  placeholder="New reminder (e.g. Call Driver #04)..."
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                >
                  Add
                </button>
              </form>
            </div>
          )}

          {/* ─── SUB-MODULE: TASKS ─── */}
          {activeModule === 'tasks' && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <CheckIcon className="w-4 h-4 text-emerald-600" />
                    <span>Shift Operations Checklist</span>
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    {completedTasksCount} of {tasks.length} completed
                  </p>
                </div>
                <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${tasks.length ? (completedTasksCount / tasks.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 ${
                      task.completed
                        ? 'bg-slate-50 border-slate-200 line-through text-slate-400'
                        : 'bg-white border-slate-200 text-slate-800'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                    />
                    <span className="text-xs flex-1 font-medium">{task.text}</span>
                    {task.priority === 'high' && (
                      <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                        High
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <form onSubmit={addTask} className="pt-2 border-t border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  placeholder="Add dispatch shift task..."
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  Add
                </button>
              </form>
            </div>
          )}

          {/* ─── SUB-MODULE: HELP & SOPS ─── */}
          {activeModule === 'help' && (
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
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
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">Alt + P</kbd> Toggle Phone Hub</div>
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">Alt + D</kbd> Toggle Drivers Console</div>
                    <div><kbd className="font-mono bg-slate-100 px-1 rounded border">Ctrl + B</kbd> New Booking Draft</div>
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
