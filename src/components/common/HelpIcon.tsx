import React from 'react';

interface HelpIconProps {
    onClick: () => void;
    ariaLabel?: string;
}

/**
 * HelpIcon - Clickable help button with "?" icon
 * 
 * Displays a circular button that opens help modals
 */
export const HelpIcon: React.FC<HelpIconProps> = ({ onClick, ariaLabel = "Help" }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={ariaLabel}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: `2px solid ${isHovered ? '#2563eb' : '#6b7280'}`,
                backgroundColor: 'transparent',
                color: isHovered ? '#2563eb' : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontSize: '13px',
                fontWeight: 600,
                padding: 0,
                flexShrink: 0
            }}
        >
            ?
        </button>
    );
};
