import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Location } from '../../types/booking';
import '../../styles/BookingFormV2.css';

interface SortableLocationItemV2Props {
    loc: Location;
    index: number;
    locationsLength: number;
    handleLocationChange: (id: string, field: keyof Location, value: any) => void;
    removeStop: (id: string) => void;
    showDragHandle: boolean;
}

const PREDEFINED_LOCATIONS = [
    "St. Louis Lambert International Airport (STL)",
    "Spirit of St. Louis Airport (SUS)",
    "Busch Stadium",
    "Enterprise Center",
    "The Gateway Arch",
    "St. Louis Union Station",
    "Chesterfield Mall",
    "Downtown St. Louis",
    "West County Center",
    "Missouri Botanical Garden"
];

const SortableLocationItemV2: React.FC<SortableLocationItemV2Props> = ({
    loc,
    index,
    locationsLength,
    handleLocationChange,
    removeStop,
    showDragHandle
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: loc.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative' as const,
        zIndex: isDragging ? 10 : 1,
    };

    const isPickup = index === 0;
    const isDropoff = index === locationsLength - 1;
    const isStop = !isPickup && !isDropoff;

    let placeholder = "Stop";
    if (isPickup) placeholder = "Pickup Location";
    if (isDropoff) placeholder = "Dropoff Location";

    // Icon logic based on type
    let iconColor = 'var(--color-text-light)';
    if (isPickup) iconColor = 'var(--color-success)';
    if (isDropoff) iconColor = 'var(--color-danger)';

    return (
        <div ref={setNodeRef} style={style} className="location-input-group" data-type={isPickup ? 'pickup' : isDropoff ? 'dropoff' : 'stop'}>
            {/* Drag Handle */}
            <div
                className={`control-handle ${!showDragHandle ? 'hidden' : ''}`}
                {...attributes}
                {...listeners}
                style={{
                    width: '20px',
                    height: '20px',
                    flexShrink: 0,
                    cursor: 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <span className="material-symbols-outlined" style={{ color: 'var(--color-text-light)', fontSize: '20px' }}>drag_indicator</span>
            </div>

            {/* Input Container */}
            <div style={{ position: 'relative', width: '100%' }}>
                {/* Icon */}
                <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                    {isStop ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                    )}
                </div>

                <input
                    type="text"
                    placeholder={placeholder}
                    value={loc.address}
                    onChange={(e) => handleLocationChange(loc.id, 'address', e.target.value)}
                    list="predefined-locations-v2"
                    style={{
                        width: '100%',
                        padding: '0.5rem 0.5rem 0.5rem 2rem', // pl-8
                        border: '1px solid var(--color-border-strong)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '1rem',
                        outline: 'none'
                    }}
                    className="location-input"
                />
            </div>

            {/* Remove Button */}
            <button
                type="button"
                onClick={() => removeStop(loc.id)}
                style={{
                    visibility: isStop ? 'visible' : 'hidden',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--color-text-light)'
                }}
                className="remove-stop-btn"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <datalist id="predefined-locations-v2">
                {PREDEFINED_LOCATIONS.map((loc, i) => <option key={i} value={loc} />)}
            </datalist>
        </div>
    );
};

export default SortableLocationItemV2;
