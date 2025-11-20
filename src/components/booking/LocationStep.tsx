import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Location } from '../../types/booking';
import DateTimePicker from './DateTimePicker';

interface LocationStepProps {
    isNow: boolean;
    setIsNow: (isNow: boolean) => void;
    pickupDateTime: Date | null;
    setPickupDateTime: (date: Date) => void;
    locations: Location[];
    setLocations: (locations: Location[]) => void;

    // Return Trip Props
    isReturnTrip: boolean;
    setIsReturnTrip: (isReturn: boolean) => void;
    returnDateTime: Date | null;
    setReturnDateTime: (date: Date) => void;
    returnLocations: Location[];
    setReturnLocations: (locations: Location[]) => void;

    // Repeat Trip Props
    isRepeat: boolean;
    setIsRepeat: (isRepeat: boolean) => void;
    repeatFrequency: 'daily' | 'weekly' | 'monthly';
    setRepeatFrequency: (freq: 'daily' | 'weekly' | 'monthly') => void;
    repeatEnds: 'on_date' | 'after_occurrences' | 'never';
    setRepeatEnds: (ends: 'on_date' | 'after_occurrences' | 'never') => void;
    repeatEndDate: Date | null;
    setRepeatEndDate: (date: Date) => void;
}

// Sortable Item Component
interface SortableLocationItemProps {
    loc: Location;
    index: number;
    locationsLength: number;
    handleLocationChange: (id: string, field: string, value: any) => void;
    removeStop: (id: string) => void;
}

const SortableLocationItem = ({ loc, index, locationsLength, handleLocationChange, removeStop }: SortableLocationItemProps) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: loc.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const isPickup = index === 0;
    const isDropoff = index === locationsLength - 1;
    const isStop = !isPickup && !isDropoff;

    const iconColor = isPickup ? 'var(--color-success)' : isDropoff ? 'var(--color-error)' : '#9ca3af';
    const iconPath = isPickup || isDropoff
        ? <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></>
        : <circle cx="12" cy="12" r="1.5"></circle>;

    return (
        <div ref={setNodeRef} style={style} className="location-group">
            <div className="control-handle" {...attributes} {...listeners}>
                <span className="material-symbols-outlined drag-handle">drag_indicator</span>
            </div>
            <div className="location-icon-wrapper">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="location-icon" style={{ color: iconColor }}>
                    {iconPath}
                </svg>
                <input
                    type="text"
                    className="form-input location-input"
                    placeholder={isPickup ? 'Pickup Location' : isDropoff ? 'Dropoff Location' : `Stop ${index}`}
                    value={loc.address}
                    onChange={(e) => handleLocationChange(loc.id, 'address', e.target.value)}
                />
            </div>
            <button
                type="button"
                className={`remove-stop-btn ${isStop ? '' : 'invisible'}`}
                onClick={() => removeStop(loc.id)}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    );
};

const LocationStep: React.FC<LocationStepProps> = ({
    isNow, setIsNow, pickupDateTime, setPickupDateTime, locations, setLocations,
    isReturnTrip, setIsReturnTrip, returnDateTime, setReturnDateTime, returnLocations, setReturnLocations,
    isRepeat, setIsRepeat, repeatFrequency, setRepeatFrequency, repeatEnds, setRepeatEnds, repeatEndDate, setRepeatEndDate
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setLocations((items: Location[]) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over?.id);
                const newItems = arrayMove(items, oldIndex, newIndex);
                // Update types based on new positions
                return newItems.map((item, index) => ({
                    ...item,
                    type: index === 0 ? 'pickup' : index === newItems.length - 1 ? 'dropoff' : 'stop'
                }));
            });
        }
    };

    const handleLocationChange = (id: string, field: string, value: any) => {
        const newLocations = locations.map(loc => {
            if (loc.id === id) {
                const updates: any = { [field]: value };
                if (field === 'address') {
                    updates.isAirport = value.toLowerCase().includes('airport');
                }
                return { ...loc, ...updates };
            }
            return loc;
        });
        setLocations(newLocations);
    };

    const addStop = () => {
        const newStop: Location = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'stop',
            address: '',
            isAirport: false
        };
        const newLocations = [...locations];
        newLocations.splice(newLocations.length - 1, 0, newStop);
        setLocations(newLocations);
    };

    const removeStop = (id: string) => {
        setLocations(locations.filter(loc => loc.id !== id));
    };

    // Helper to render flight info if needed
    const renderFlightInfo = (locs: Location[], handler: (id: string, field: string, val: any) => void) => {
        const airportLoc = locs.find(l => l.isAirport);
        if (!airportLoc) return null;

        return (
            <div className="flight-info-section visible">
                <div className="form-section-header" style={{ color: 'var(--color-primary)', marginTop: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '4px' }}>flight</span>
                    Airport Details
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Airline"
                        value={airportLoc.airline || ''}
                        onChange={(e) => handler(airportLoc.id, 'airline', e.target.value)}
                    />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Flight Number"
                        value={airportLoc.flightNumber || ''}
                        onChange={(e) => handler(airportLoc.id, 'flightNumber', e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="form-section">
            {/* Time Selection */}
            <div className="time-toggle mb-2">
                <div className="toggle-switch" onClick={() => setIsNow(!isNow)}>
                    <div className={`toggle-track ${!isNow ? 'later' : ''}`}>
                        <div className="toggle-thumb"></div>
                        <span className="toggle-text now">Now</span>
                        <span className="toggle-text later">Later</span>
                    </div>
                </div>
                {!isNow && (
                    <div style={{ flexGrow: 1 }}>
                        <DateTimePicker value={pickupDateTime} onChange={setPickupDateTime} placeholder="Select pickup time" />
                    </div>
                )}
            </div>

            {/* Locations with DnD */}
            <div className="form-group-box">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={locations} strategy={verticalListSortingStrategy}>
                        {locations.map((loc, index) => (
                            <SortableLocationItem
                                key={loc.id}
                                loc={loc}
                                index={index}
                                locationsLength={locations.length}
                                handleLocationChange={handleLocationChange}
                                removeStop={removeStop}
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                <div className="flex justify-between items-center mt-1">
                    <div className="text-sm text-gray-500">
                        Estimate: <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>20</span> min, <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>15</span> mi
                    </div>
                    <button type="button" className="add-stop-btn" onClick={addStop}>+ Add stop</button>
                </div>

                {renderFlightInfo(locations, handleLocationChange)}
            </div>

            {/* Return Trip */}
            <div className="mt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={isReturnTrip} onChange={(e) => setIsReturnTrip(e.target.checked)} />
                    Book Return Trip
                </label>

                {isReturnTrip && (
                    <div className="form-group-box mt-2" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                        <div className="mb-2">
                            <DateTimePicker value={returnDateTime} onChange={setReturnDateTime} placeholder="Select return time" />
                        </div>
                        {returnLocations.map((loc, index) => (
                            <div key={loc.id} className="location-group">
                                <div className="location-icon-wrapper">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="location-icon" style={{
                                        color: index === 0 ? 'var(--color-success)' : index === returnLocations.length - 1 ? 'var(--color-error)' : '#9ca3af'
                                    }}>
                                        {index === 0 || index === returnLocations.length - 1
                                            ? <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></>
                                            : <circle cx="12" cy="12" r="1.5"></circle>
                                        }
                                    </svg>
                                    <input
                                        type="text"
                                        className="form-input location-input"
                                        value={loc.address}
                                        readOnly // Auto-filled from main trip
                                        style={{ backgroundColor: '#f3f4f6' }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Repeat Trip */}
            <div className="mt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input type="checkbox" checked={isRepeat} onChange={(e) => setIsRepeat(e.target.checked)} />
                    Repeat This Trip
                </label>

                {isRepeat && (
                    <div className="form-group-box mt-2">
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                className="form-input"
                                value={repeatFrequency}
                                onChange={(e) => setRepeatFrequency(e.target.value as any)}
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                            <select
                                className="form-input"
                                value={repeatEnds}
                                onChange={(e) => setRepeatEnds(e.target.value as any)}
                            >
                                <option value="on_date">Ends on date</option>
                                <option value="after_occurrences">Ends after...</option>
                                <option value="never">Never ends</option>
                            </select>
                        </div>
                        {repeatEnds === 'on_date' && (
                            <div className="mt-2">
                                <DateTimePicker value={repeatEndDate} onChange={setRepeatEndDate} placeholder="Select end date" showTimePicker={false} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LocationStep;
