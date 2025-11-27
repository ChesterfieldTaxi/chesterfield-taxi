import React, { useState } from 'react';
import '../../styles/interactions.css';

// RippleButton wrapper component that handles ripple effect on click
export const RippleButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { rippleColor?: string }> = ({
    children,
    className = '',
    onClick,
    rippleColor,
    ...props
}) => {
    const [ripples, setRipples] = useState<{ x: number; y: number; size: number; key: number }[]>([]);

    const createRipple = (event: React.MouseEvent<HTMLButtonElement>) => {
        const button = event.currentTarget;
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        const newRipple = { x, y, size, key: Date.now() };
        setRipples(prev => [...prev, newRipple]);

        if (onClick) onClick(event);
    };

    return (
        <button
            className={`ripple-container btn-transition ${className}`}
            onClick={createRipple}
            {...props}
        >
            {children}
            {ripples.map(ripple => (
                <span
                    key={ripple.key}
                    className="ripple"
                    onAnimationEnd={() => setRipples(prev => prev.filter(r => r.key !== ripple.key))}
                    style={{
                        top: ripple.y,
                        left: ripple.x,
                        width: ripple.size,
                        height: ripple.size,
                        backgroundColor: rippleColor
                    }}
                />
            ))}
        </button>
    );
};
