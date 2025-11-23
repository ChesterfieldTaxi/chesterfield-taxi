import React, { useRef, useState } from 'react';

interface SpecialRequestsV3Props {
    selectedRequests: string[];
    onToggleRequest: (requestId: string) => void;
    gateCode: string;
    onGateCodeChange: (code: string) => void;
}

export const SpecialRequestsV3: React.FC<SpecialRequestsV3Props> = ({
    selectedRequests,
    onToggleRequest,
    gateCode,
    onGateCodeChange
}) => {
    const gateCodeInputRef = useRef<HTMLInputElement>(null);
    const [isFocused, setIsFocused] = useState(false);

    const requests = [
        { id: 'petFriendly', label: 'Pet-friendly' },
        { id: 'wheelchair', label: 'Wheelchair accessible' },
        { id: 'quietRide', label: 'Quiet ride' },
        { id: 'musicOk', label: 'Music OK' }
    ];

    const borderColor = isFocused ? '#3b82f6' : '#d1d5db';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Request Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {requests.map(request => {
                    const isSelected = selectedRequests.includes(request.id);
                    return (
                        <button
                            key={request.id}
                            type="button"
                            onClick={() => onToggleRequest(request.id)}
                            style={{
                                padding: '0.625rem 1rem',
                                border: `2px solid ${isSelected ? '#2563eb' : '#e5e7eb'}`,
                                borderRadius: '4px',
                                backgroundColor: isSelected ? '#eff6ff' : 'white',
                                color: isSelected ? '#2563eb' : '#6b7280',
                                fontWeight: 500,
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {request.label}
                        </button>
                    );
                })}
            </div>

            {/* Gate Code Input - Unified Styling */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                    fontSize: '14px',
                    color: '#374151'
                }}>
                    Gate Code (if applicable)
                </label>
                <div
                    onClick={() => gateCodeInputRef.current?.focus()}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        padding: '0.625rem 0.75rem',
                        transition: 'border-color 0.2s',
                        cursor: 'text'
                    }}
                >
                    <div style={{ marginRight: '0.5rem', display: 'flex', alignItems: 'center', color: '#9ca3af' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <input
                        ref={gateCodeInputRef}
                        type="text"
                        value={gateCode}
                        onChange={(e) => onGateCodeChange(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="Enter gate code"
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            fontSize: '16px',
                            padding: 0,
                            backgroundColor: 'transparent',
                            boxShadow: 'none'
                        }}
                    />
                </div>
            </div>
        </div>
    );
};
