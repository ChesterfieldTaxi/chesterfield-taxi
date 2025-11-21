import React from 'react';

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
    const requests = [
        { id: 'petFriendly', label: 'Pet-friendly' },
        { id: 'wheelchair', label: 'Wheelchair accessible' },
        { id: 'quietRide', label: 'Quiet ride' },
        { id: 'musicOk', label: 'Music OK' }
    ];

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

            {/* Gate Code Input */}
            <div>
                <label style={{
                    display: 'block',
                    marginBottom: '0.5rem',
                    fontWeight: 500,
                    fontSize: '14px'
                }}>
                    Gate Code (if applicable)
                </label>
                <input
                    type="text"
                    value={gateCode}
                    onChange={(e) => onGateCodeChange(e.target.value)}
                    placeholder="Enter gate code"
                    style={{
                        width: '100%',
                        padding: '0.625rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '14px'
                    }}
                />
            </div>
        </div>
    );
};
