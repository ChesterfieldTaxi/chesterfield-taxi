import React, { useState, useRef } from 'react';

interface InstructionsV3Props {
    driverNotes: string;
    onDriverNotesChange: (notes: string) => void;
    gateCode: string;
    onGateCodeChange: (code: string) => void;
}

/**
 * Reusable input with icon component (copied for consistency, or could be shared)
 * For now, defining locally to keep component self-contained as we might move InputWithIcon to a shared file later.
 */
const InputWithIcon: React.FC<{
    icon: React.ReactNode;
    type: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}> = ({ icon, type, value, onChange, placeholder }) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const borderColor = isFocused ? '#3b82f6' : '#d1d5db';

    return (
        <div
            onClick={() => inputRef.current?.focus()}
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
                {icon}
            </div>
            <input
                ref={inputRef}
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder}
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
    );
};

export const InstructionsV3: React.FC<InstructionsV3Props> = ({
    driverNotes,
    onDriverNotesChange,
    gateCode,
    onGateCodeChange
}) => {
    const [showGateCode, setShowGateCode] = useState(!!gateCode);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Driver Notes */}
            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '16px', color: '#374151' }}>
                    Notes for Driver <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '14px' }}>(optional)</span>
                </label>
                <textarea
                    value={driverNotes}
                    onChange={e => onDriverNotesChange(e.target.value)}
                    placeholder="Any special instructions? (e.g. 'Call upon arrival', 'Look for red house')"
                    rows={3}
                    style={{
                        width: '100%',
                        padding: '0.625rem 0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '16px',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                        boxShadow: 'none'
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#3b82f6')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                />
            </div>

            {/* Gate Code Toggle */}
            <div>
                {!showGateCode && !gateCode ? (
                    <button
                        type="button"
                        onClick={() => setShowGateCode(true)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '14px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem'
                        }}
                    >
                        <span>+</span> Add Gate Code
                    </button>
                ) : (
                    <div style={{
                        maxHeight: (showGateCode || gateCode) ? '150px' : '0',
                        opacity: (showGateCode || gateCode) ? 1 : 0,
                        overflow: 'hidden',
                        transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <label style={{ fontWeight: 500, fontSize: '14px', color: '#374151' }}>
                                    Gate Code
                                </label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowGateCode(false);
                                        onGateCodeChange('');
                                    }}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#6b7280',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        padding: 0
                                    }}
                                >
                                    Remove
                                </button>
                            </div>
                            <InputWithIcon
                                icon={
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                }
                                type="text"
                                value={gateCode}
                                onChange={onGateCodeChange}
                                placeholder="Enter gate code"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
