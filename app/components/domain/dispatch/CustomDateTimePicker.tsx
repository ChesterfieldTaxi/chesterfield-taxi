import React, { useState, useEffect, useRef } from 'react';

export interface DateTimeRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: { hour: string; minute: string; period: 'AM' | 'PM' };
  endTime: { hour: string; minute: string; period: 'AM' | 'PM' };
  presetKey?: string;
}

export interface CustomDateTimePickerProps {
  value: DateTimeRange;
  onChange: (range: DateTimeRange) => void;
  isOpen: boolean;
  onClose: () => void;
}

const PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_7_days', label: 'Last 7 Days' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'next_7_days', label: 'Next 7 Days' },
  { key: 'next_week', label: 'Next Week' },
  { key: 'next_month', label: 'Next Month' },
  { key: 'year_to_date', label: 'Year to Date' },
  { key: 'rest_of_the_year', label: 'Rest of the Year' },
  { key: 'all_time', label: 'All Time' },
];

function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CustomDateTimePicker({
  value,
  onChange,
  isOpen,
  onClose,
}: CustomDateTimePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Internal draft state while picker is open
  const [draftStart, setDraftStart] = useState<string>(value.startDate);
  const [draftEnd, setDraftEnd] = useState<string>(value.endDate);
  const [activePreset, setActivePreset] = useState<string>(value.presetKey || '');
  const [startTime, setStartTime] = useState(value.startTime || { hour: '12', minute: '00', period: 'AM' });
  const [endTime, setEndTime] = useState(value.endTime || { hour: '11', minute: '59', period: 'PM' });

  // Navigation base month (Left calendar month)
  const [baseDate, setBaseDate] = useState<Date>(() => {
    if (value.startDate) {
      const parts = value.startDate.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
      }
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Sync draft with incoming value when opened
  useEffect(() => {
    if (isOpen) {
      setDraftStart(value.startDate);
      setDraftEnd(value.endDate);
      setActivePreset(value.presetKey || '');
      setStartTime(value.startTime || { hour: '12', minute: '00', period: 'AM' });
      setEndTime(value.endTime || { hour: '11', minute: '59', period: 'PM' });
    }
  }, [isOpen, value]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Month navigation
  const handlePrevMonth = () => {
    setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setBaseDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1));
  };

  const nextMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);

  // Preset Selection
  const handleSelectPreset = (key: string) => {
    setActivePreset(key);
    const now = new Date();
    const todayYMD = formatDateYMD(now);

    let sDate = '';
    let eDate = '';

    switch (key) {
      case 'today':
        sDate = todayYMD;
        eDate = todayYMD;
        break;
      case 'tomorrow': {
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        sDate = formatDateYMD(tomorrow);
        eDate = sDate;
        break;
      }
      case 'yesterday': {
        const yest = new Date(now);
        yest.setDate(now.getDate() - 1);
        sDate = formatDateYMD(yest);
        eDate = sDate;
        break;
      }
      case 'this_week': {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diff);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        sDate = formatDateYMD(mon);
        eDate = formatDateYMD(sun);
        break;
      }
      case 'last_week': {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day - 7;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diff);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        sDate = formatDateYMD(mon);
        eDate = formatDateYMD(sun);
        break;
      }
      case 'next_week': {
        const day = now.getDay();
        const diff = (day === 0 ? -6 : 1) - day + 7;
        const mon = new Date(now);
        mon.setDate(now.getDate() + diff);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        sDate = formatDateYMD(mon);
        eDate = formatDateYMD(sun);
        break;
      }
      case 'this_month': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        sDate = formatDateYMD(first);
        eDate = formatDateYMD(last);
        break;
      }
      case 'last_month': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        sDate = formatDateYMD(first);
        eDate = formatDateYMD(last);
        break;
      }
      case 'next_month': {
        const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        sDate = formatDateYMD(first);
        eDate = formatDateYMD(last);
        break;
      }
      case 'last_7_days': {
        const past = new Date(now);
        past.setDate(now.getDate() - 6);
        sDate = formatDateYMD(past);
        eDate = todayYMD;
        break;
      }
      case 'next_7_days': {
        const future = new Date(now);
        future.setDate(now.getDate() + 6);
        sDate = todayYMD;
        eDate = formatDateYMD(future);
        break;
      }
      case 'year_to_date': {
        const first = new Date(now.getFullYear(), 0, 1);
        sDate = formatDateYMD(first);
        eDate = todayYMD;
        break;
      }
      case 'rest_of_the_year': {
        const last = new Date(now.getFullYear(), 11, 31);
        sDate = todayYMD;
        eDate = formatDateYMD(last);
        break;
      }
      case 'all_time':
      default:
        sDate = '';
        eDate = '';
        break;
    }

    setDraftStart(sDate);
    setDraftEnd(eDate);

    if (sDate) {
      const parts = sDate.split('-');
      setBaseDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1));
    }
  };

  // Date click handler
  const handleDateClick = (ymd: string) => {
    setActivePreset('custom');
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(ymd);
      setDraftEnd('');
    } else if (draftStart && !draftEnd) {
      if (ymd < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(ymd);
      } else {
        setDraftEnd(ymd);
      }
    }
  };

  // Apply Action
  const handleApply = () => {
    onChange({
      startDate: draftStart,
      endDate: draftEnd || draftStart,
      startTime,
      endTime,
      presetKey: activePreset,
    });
    onClose();
  };

  // Clear Action
  const handleClear = () => {
    setDraftStart('');
    setDraftEnd('');
    setActivePreset('all_time');
    setStartTime({ hour: '12', minute: '00', period: 'AM' });
    setEndTime({ hour: '11', minute: '59', period: 'PM' });
    onChange({
      startDate: '',
      endDate: '',
      startTime: { hour: '12', minute: '00', period: 'AM' },
      endTime: { hour: '11', minute: '59', period: 'PM' },
      presetKey: 'all_time',
    });
    onClose();
  };

  // Calendar Month Renderer
  const renderCalendarMonth = (year: number, monthIndex: number) => {
    const monthName = new Date(year, monthIndex, 1).toLocaleString('default', { month: 'long' });
    const firstDayIndex = new Date(year, monthIndex, 1).getDay(); // 0 is Sun
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }

    const todayYMD = formatDateYMD(new Date());

    return (
      <div className="flex-1 min-w-[210px]">
        <div className="text-center font-bold text-xs text-slate-800 mb-2">
          {monthName} {year}
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-0.5">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-y-1 text-xs">
          {days.map((dayNum, idx) => {
            if (dayNum === null) {
              return <div key={`empty-${idx}`} className="h-7" />;
            }

            const ymd = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const isStart = draftStart === ymd;
            const isEnd = draftEnd === ymd;
            const isRange =
              draftStart && draftEnd && ymd > draftStart && ymd < draftEnd;
            const isToday = ymd === todayYMD;

            let cellClass = 'h-7 w-7 mx-auto flex items-center justify-center text-xs font-semibold rounded-full transition-colors cursor-pointer ';

            if (isStart || isEnd) {
              cellClass += 'bg-blue-600 text-white font-bold shadow-xs';
            } else if (isRange) {
              cellClass += 'bg-blue-100 text-blue-900 rounded-none w-full';
            } else if (isToday) {
              cellClass += 'border border-blue-500 text-blue-600 font-bold hover:bg-slate-100';
            } else {
              cellClass += 'text-slate-700 hover:bg-slate-100';
            }

            return (
              <div
                key={ymd}
                onClick={() => handleDateClick(ymd)}
                className={`flex items-center justify-center ${isRange ? 'bg-blue-100' : ''}`}
              >
                <button type="button" className={cellClass}>
                  {dayNum}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hoursList = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutesList = ['00', '15', '30', '45', '59'];

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 flex flex-col md:flex-row text-xs text-slate-800 animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
      style={{ minWidth: '640px' }}
    >
      {/* ─── 1. Left Sidebar of Presets ─── */}
      <div className="w-38 border-r border-slate-100 bg-slate-50/70 p-2 space-y-0.5 max-h-[380px] overflow-y-auto shrink-0 select-none">
        {PRESETS.map((preset) => {
          const isSelected = activePreset === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => handleSelectPreset(preset.key)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* ─── 2. Right Area: Dual Calendar & Time Range ─── */}
      <div className="flex-1 p-4 flex flex-col justify-between">
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold transition-colors"
            title="Previous month"
          >
            ‹
          </button>
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Dual Month Range Picker
          </div>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 font-bold transition-colors"
            title="Next month"
          >
            ›
          </button>
        </div>

        {/* Dual Month Calendar Grids */}
        <div className="flex flex-col sm:flex-row gap-6 mb-4">
          {renderCalendarMonth(baseDate.getFullYear(), baseDate.getMonth())}
          {renderCalendarMonth(nextMonthDate.getFullYear(), nextMonthDate.getMonth())}
        </div>

        {/* ─── 3. Time Range Selectors & Actions ─── */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            {/* Start time */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Start time:</span>
              <select
                value={startTime.hour}
                onChange={(e) => setStartTime({ ...startTime, hour: e.target.value })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {hoursList.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span>:</span>
              <select
                value={startTime.minute}
                onChange={(e) => setStartTime({ ...startTime, minute: e.target.value })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {minutesList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={startTime.period}
                onChange={(e) => setStartTime({ ...startTime, period: e.target.value as any })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>

            {/* End time */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">End time:</span>
              <select
                value={endTime.hour}
                onChange={(e) => setEndTime({ ...endTime, hour: e.target.value })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {hoursList.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span>:</span>
              <select
                value={endTime.minute}
                onChange={(e) => setEndTime({ ...endTime, minute: e.target.value })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
              >
                {minutesList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <select
                value={endTime.period}
                onChange={(e) => setEndTime({ ...endTime, period: e.target.value as any })}
                className="h-7 px-1.5 rounded-lg border border-slate-300 text-xs font-bold bg-white"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
