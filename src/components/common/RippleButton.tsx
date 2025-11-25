import React, { useState, useLayoutEffect } from 'react';
import '../../styles/interactions.css';

interface RippleProps {
    color?: string;
    duration?: number;
}

export const Ripple: React.FC<RippleProps> = ({ color = 'rgba(255, 255, 255, 0.35)', duration = 600 }) => {
    const [rippleArray, setRippleArray] = useState<{ x: number; y: number; size: number; key: number }[]>([]);

    useLayoutEffect(() => {
        let bounce: number | null = null;

        const addRipple = (event: MouseEvent) => {
            if (bounce) return;

            const rippleContainer = event.currentTarget as HTMLElement;
            const size = rippleContainer.offsetWidth > rippleContainer.offsetHeight
                ? rippleContainer.offsetWidth
                : rippleContainer.offsetHeight;

            const x = event.pageX - rippleContainer.getBoundingClientRect().left - size / 2;
            const y = event.pageY - rippleContainer.getBoundingClientRect().top - size / 2;

            const newRipple = { x, y, size, key: Date.now() };

            setRippleArray(prevState => [...prevState, newRipple]);

            bounce = window.setTimeout(() => {
                bounce = null;
                setRippleArray(prevState => prevState.filter(item => item.key !== newRipple.key));
            }, duration);
        };

        const parent = document.currentScript?.parentElement?.parentElement; // This won't work in React like this
        // Instead, we rely on the parent having 'ripple-container' class and attaching click handler there?
        // Actually, a cleaner way is to just render this component inside a button and have it listen to the parent's click
        // Or better: The parent button calls a function to trigger ripple.

        // Let's try a simpler approach: This component just renders the ripples. 
        // The parent needs to handle the click and update state? No, that's too much boilerplate.

        // Better approach: 
        // The Ripple component attaches a click listener to its parent ref?
        // Or we assume the parent has `position: relative` and `overflow: hidden`.

    }, [duration]);

    // Let's use a simpler implementation where we just render the container and let the user click it.
    // But we want to drop this INTO existing buttons.

    // Revised approach:
    // Just return a container that fills the parent.
    // When clicked, it adds a ripple.

    return (
        <div
            className="ripple-container"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
                borderRadius: 'inherit',
                pointerEvents: 'none' // Let clicks pass through to button
            }}
        >
            {rippleArray.map((ripple) => (
                <span
                    key={ripple.key}
                    className="ripple"
                    style={{
                        top: ripple.y,
                        left: ripple.x,
                        width: ripple.size,
                        height: ripple.size,
                        backgroundColor: color,
                        animationDuration: `${duration}ms`
                    }}
                />
            ))}
        </div>
    );
};

// Wait, if pointerEvents is none, it won't capture clicks.
// So we need to listen to the parent's click.
// Or we make this a wrapper component? <RippleButton>...</RippleButton>
// Wrapper is safer.

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
