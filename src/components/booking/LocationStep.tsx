import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Location } from '../../types/booking';
import DateTimePicker from './DateTimePicker';

const PREDEFINED_LOCATIONS = [
    "St. Louis Lambert International Airport (STL)",
    "Spirit of St. Louis Airport (SUS)",
    "Chesterfield Mall",
    "Downtown St. Louis",
    "West County Center",
    "Missouri Botanical Garden"
];

interface LocationStepProps {
    isNow: boolean;
    setIsNow: (isNow: boolean) => void;
    pickupDateTime: Date | null;
    setPickupDateTime: (date: Date) => void;
    locations: Location[];
    setLocations: (locations: Location[]) => void;
}

// Sortable Item Component
interface SortableLocationItemProps {
    loc: Location;
    index: number;
    locationsLength: number;
    handleLocationChange: (id: string, field: string, value: any) => void;
    removeStop: (id: string) => void;
    showDragHandle: boolean;
}

const SortableLocationItem = ({ loc, index, locationsLength, handleLocationChange, removeStop, showDragHandle }: SortableLocationItemProps) => {
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
            <div className="control-handle" {...attributes} {...listeners} style={{ visibility: showDragHandle ? 'visible' : 'hidden' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="drag-handle-icon" style={{ color: '#9ca3af', cursor: 'grab' }}>
                    <circle cx="9" cy="12" r="1" />
                    <circle cx="9" cy="5" r="1" />
                    <circle cx="9" cy="19" r="1" />
                    <circle cx="15" cy="12" r="1" />
                    <circle cx="15" cy="5" r="1" />
                    <circle cx="15" cy="19" r="1" />
                </svg>
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
                    list="predefined-locations"
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
    isNow, setIsNow, pickupDateTime, setPickupDateTime, locations, setLocations
}) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const newItems = arrayMove(locations,
                locations.findIndex((item) => item.id === active.id),
                locations.findIndex((item) => item.id === over?.id)
            );

            const updatedItems = newItems.map((item, index) => ({
                ...item,
                type: (index === 0 ? 'pickup' : index === newItems.length - 1 ? 'dropoff' : 'stop') as 'pickup' | 'dropoff' | 'stop'
            }));

            setLocations(updatedItems);
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

    const handleSwap = () => {
        if (locations.length === 2) {
            const newLocations = [
                { ...locations[1], type: 'pickup' as const },
                { ...locations[0], type: 'dropoff' as const }
            ];
            setLocations(newLocations);
        }
    };

    // Helper to render flight info if needed
    const renderFlightInfo = (locs: Location[], handler: (id: string, field: string, val: any) => void) => {
        // Only show flight info if PICKUP is an airport
        const pickupLoc = locs[0];
        if (!pickupLoc || !pickupLoc.isAirport) return null;

        return (
            <div className="flight-info-section visible slide-out">
                <div className="form-section-header" style={{ color: 'var(--color-primary)', marginTop: '0.5rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.2em', verticalAlign: 'middle', marginRight: '4px' }}>flight</span>
                    Airport Details
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Airline"
                        value={pickupLoc.airline || ''}
                        onChange={(e) => handler(pickupLoc.id, 'airline', e.target.value)}
                    />
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Flight Number"
                        value={pickupLoc.flightNumber || ''}
                        onChange={(e) => handler(pickupLoc.id, 'flightNumber', e.target.value)}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="form-section">
            <datalist id="predefined-locations">
                {PREDEFINED_LOCATIONS.map((loc, i) => <option key={i} value={loc} />)}
            </datalist>

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
                <div className="relative">
                    {/* Swap Button - Only visible when 2 locations */}
                    {locations.length === 2 && (
                        <button
                            type="button"
                            className="swap-btn"
                            onClick={handleSwap}
                            style={{
                                position: 'absolute',
                                left: '-10px', // Position to the left of the inputs
                                top: '50%',
                                transform: 'translateY(-50%)',
                                zIndex: 10,
                                background: 'transparent',
                                border: 'none',
                                width: '24px',
                                height: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#9ca3af' // Match placeholder/icon color
                            }}
                            title="Swap locations"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>swap_vert</span>
                        </button>
                    )}

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
                                    showDragHandle={locations.length > 2}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                <div className="flex justify-between items-center mt-1">
                    <div className="text-sm text-gray-500">
                        Estimate: <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>20</span> min, <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>15</span> mi
                    </div>
                    <button type="button" className="add-stop-btn" onClick={addStop}>+ Add stop</button>
                </div>

                {renderFlightInfo(locations, handleLocationChange)}
            </div>
        </div>
    );
};

export default LocationStep;

