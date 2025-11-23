import React, { useState, useEffect, useRef } from 'react';
import '../../styles/DateTimePicker.css';

interface DateTimePickerProps {
    value: Date | null;
    onChange: (date: Date) => void;
    showTimePicker?: boolean;
    placeholder?: string;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DateTimePicker: React.FC<DateTimePickerProps> = ({ value, onChange, showTimePicker = true, placeholder = 'Select date' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date()); // For navigation
    const [selectedDate, setSelectedDate] = useState<Date | null>(value);
    const containerRef = useRef<HTMLDivElement>(null);

    // Time state - no defaults, must be explicitly selected
    const [hour, setHour] = useState<number | null>(null);
    const [minute, setMinute] = useState<number | null>(null);
    const [ampm, setAmpm] = useState<'AM' | 'PM' | null>(null);

    // 🔥 NEW: Determine which field should be highlighted next
    const getNextFieldHint = (): 'hour' | 'minute' | 'ampm' | null => {
        if (!selectedDate) return null; // Date must be selected first
        if (hour === null) return 'hour';
        if (minute === null) return 'minute';
        if (ampm === null) return 'ampm';
        return null; // All fields complete
    };

    const nextHint = getNextFieldHint();

    useEffect(() => {
        if (value) {
            setSelectedDate(value);
            setCurrentDate(value);

            // 🔥 FIX: Extract time from restored Date (e.g., from localStorage)
            // If value already has time set, restore hour/minute/ampm
            const hours = value.getHours();
            const minutes = value.getMinutes();

            // Only restore time if it's not midnight (0:00) - which indicates "unset"
            if (hours !== 0 || minutes !== 0) {
                // Convert 24h to 12h format
                let hour12 = hours % 12;
                if (hour12 === 0) hour12 = 12; // Midnight/Noon = 12

                setHour(hour12);
                setMinute(minutes);
                setAmpm(hours >= 12 ? 'PM' : 'AM');
            }
        }
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDateClick = (date: Date) => {
        const newDate = new Date(date);
        // Don't auto-populate time - let user explicitly select it
        // Only preserve time if already selected
        if (showTimePicker && hour !== null && minute !== null && ampm !== null) {
            let h = hour;
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            newDate.setHours(h, minute);
        }
        setSelectedDate(newDate);
        if (!showTimePicker) {
            onChange(newDate);
            setIsVisible(false);
        }
    };

    const handleApply = () => {
        if (selectedDate && hour !== null && minute !== null && ampm !== null) {
            const finalDate = new Date(selectedDate);
            let h = hour;
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            finalDate.setHours(h, minute);
            onChange(finalDate);
            setIsVisible(false);
        }
    };

    const navigateMonth = (direction: number) => {
        const newDate = new Date(currentDate);
        newDate.setMonth(newDate.getMonth() + direction);
        setCurrentDate(newDate);
    };

    const renderCalendar = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time for accurate comparison

        const days = [];
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="dtp-datepicker-cell"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            date.setHours(0, 0, 0, 0); // Reset time for accurate comparison

            const isSelected = selectedDate &&
                date.getDate() === selectedDate.getDate() &&
                date.getMonth() === selectedDate.getMonth() &&
                date.getFullYear() === selectedDate.getFullYear();

            const isToday = new Date().toDateString() === date.toDateString();
            const isPast = date < today; // Disable past dates

            days.push(
                <div
                    key={day}
                    className={`dtp-datepicker-cell ${isSelected ? 'selected' : ''
                        } ${isToday ? 'today' : ''
                        } ${isPast ? 'disabled' : ''
                        }`}
                    onClick={() => !isPast && handleDateClick(date)}
                    style={{
                        cursor: isPast ? 'not-allowed' : 'pointer',
                        opacity: isPast ? 0.3 : 1
                    }}
                >
                    {day}
                </div>
            );
        }
        return days;
    };

    const formatDisplayDate = (date: Date | null) => {
        if (!date) return '';

        // Format date: Friday, Nov 21, 2025
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        };
        const dateStr = date.toLocaleDateString('en-US', options);

        if (!showTimePicker) return dateStr;

        // Only show time if user has explicitly selected hour, minute, and AM/PM
        const hasCompleteTime = hour !== null && minute !== null && ampm !== null;
        if (!hasCompleteTime) {
            // Show only date until time is selected
            return dateStr;
        }

        // Show full date + time: Friday, Nov 21, 2025 at 9:35 AM
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        return `${dateStr} at ${timeStr}`;
    };

    return (
        <div className="dtp-input-wrapper" ref={containerRef}>
            <input
                type="text"
                className="dtp-input"
                readOnly
                placeholder={placeholder}
                value={formatDisplayDate(selectedDate)}
                onClick={() => setIsVisible(!isVisible)}
            />

            <div className={`dtp-container ${isVisible ? 'visible' : ''}`}>
                <div className="dtp-header">
                    <button className="dtp-nav-button" onClick={() => navigateMonth(-1)}>&lt;</button>
                    <div className="dtp-month-year">
                        {MONTH_NAMES[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </div>
                    <button className="dtp-nav-button" onClick={() => navigateMonth(1)}>&gt;</button>
                </div>

                <div className="dtp-datepicker-grid">
                    {DAY_NAMES_SHORT.map(day => (
                        <div key={day} className="dtp-datepicker-cell day-name">{day}</div>
                    ))}
                    {renderCalendar()}
                </div>

                {showTimePicker && (
                    <div className="dtp-time-footer">
                        <div className="dtp-time-select-group">
                            <select
                                className={`dtp-time-select ${nextHint === 'hour' ? 'next-field-hint' : ''}`}
                                value={hour ?? ''}
                                onChange={(e) => {
                                    setHour(Number(e.target.value));
                                }}
                            >
                                <option value="" disabled>HH</option>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                    <option key={h} value={h}>{h}</option>
                                ))}
                            </select>
                            <span>:</span>
                            <select
                                className={`dtp-time-select ${nextHint === 'minute' ? 'next-field-hint' : ''}`}
                                value={minute ?? ''}
                                onChange={(e) => {
                                    setMinute(Number(e.target.value));
                                }}
                            >
                                <option value="" disabled>MM</option>
                                {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                                    <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                                ))}
                            </select>
                            <button
                                className={`dtp-ampm-toggle ${nextHint === 'ampm' ? 'next-field-hint' : ''}`}
                                onClick={() => {
                                    const newAmpm = ampm === 'AM' ? 'PM' : ampm === 'PM' ? 'AM' : 'AM';
                                    setAmpm(newAmpm);
                                }}
                            >
                                {ampm ?? 'AM'}
                            </button>
                        </div>
                        <button className="dtp-apply-button" onClick={handleApply}>Apply</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DateTimePicker;
