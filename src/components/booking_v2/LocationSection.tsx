import React from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Location } from '../../types/booking';
import SortableLocationItemV2 from './SortableLocationItemV2';
import '../../styles/BookingFormV2.css';

interface LocationSectionProps {
    locations: Location[];
    setLocations: (locations: Location[]) => void;
}

const LocationSection: React.FC<LocationSectionProps> = ({ locations, setLocations }) => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = locations.findIndex((loc) => loc.id === active.id);
            const newIndex = locations.findIndex((loc) => loc.id === over?.id);
            const newLocations = arrayMove(locations, oldIndex, newIndex);

            // Update types based on new order
            const updatedLocations = newLocations.map((loc, index) => ({
                ...loc,
                type: (index === 0 ? 'pickup' : index === newLocations.length - 1 ? 'dropoff' : 'stop') as 'pickup' | 'dropoff' | 'stop'
            }));

            setLocations(updatedLocations);
        }
    };

    const handleLocationChange = (id: string, field: keyof Location, value: any) => {
        const newLocations = locations.map(loc => {
            if (loc.id === id) {
                const updatedLoc = { ...loc, [field]: value };
                if (field === 'address' && updatedLoc.type === 'pickup') {
                    updatedLoc.isAirport = value.toLowerCase().includes('airport') || value.includes('(STL)') || value.includes('(SUS)');
                }
                return updatedLoc;
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
        const newLocations = locations.filter(loc => loc.id !== id);
        // Re-assign types
        const updatedLocations = newLocations.map((loc, index) => ({
            ...loc,
            type: (index === 0 ? 'pickup' : index === newLocations.length - 1 ? 'dropoff' : 'stop') as 'pickup' | 'dropoff' | 'stop'
        }));
        setLocations(updatedLocations);
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

    const showFlightInfo = locations[0]?.isAirport;

    return (
        <div className="location-section space-y-2">
            <div className="form-group-box relative">
                <div style={{ position: 'relative' }}>
                    {/* Swap Button - Only visible when 2 locations */}
                    {locations.length === 2 && (
                        <button
                            type="button"
                            className="swap-btn"
                            onClick={handleSwap}
                            style={{
                                position: 'absolute',
                                left: '-12px',
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
                                color: '#9ca3af'
                            }}
                            title="Swap locations"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>swap_vert</span>
                        </button>
                    )}

                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={locations} strategy={verticalListSortingStrategy}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                {locations.map((loc, index) => (
                                    <SortableLocationItemV2
                                        key={loc.id}
                                        loc={loc}
                                        index={index}
                                        locationsLength={locations.length}
                                        handleLocationChange={handleLocationChange}
                                        removeStop={removeStop}
                                        showDragHandle={locations.length > 2}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        Estimate: <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>20</span> min, <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>15</span> mi
                    </div>
                    <button
                        type="button"
                        onClick={addStop}
                        style={{
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            color: 'var(--color-primary)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        + Add stop
                    </button>
                </div>

                {/* Flight Info Slide-out */}
                <div
                    className={`collapsible-section ${showFlightInfo ? 'visible' : ''}`}
                    style={{
                        display: 'grid',
                        gridTemplateRows: showFlightInfo ? '1fr' : '0fr',
                        transition: 'grid-template-rows 0.2s ease-in-out',
                        marginTop: showFlightInfo ? '0.5rem' : '0'
                    }}
                >
                    <div style={{ overflow: 'hidden' }}>
                        <div style={{
                            padding: '0.75rem',
                            backgroundColor: 'var(--color-primary-light)',
                            border: '1px solid var(--color-primary-border)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-primary-hover)', margin: 0 }}>Flight Info</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                <input
                                    type="text"
                                    placeholder="Airline"
                                    value={locations[0].airline || ''}
                                    onChange={(e) => handleLocationChange(locations[0].id, 'airline', e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Flight #"
                                    value={locations[0].flightNumber || ''}
                                    onChange={(e) => handleLocationChange(locations[0].id, 'flightNumber', e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                                />
                                <input
                                    type="text"
                                    placeholder="Origin"
                                    style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LocationSection;
