import React from 'react';

interface StickyPriceFooterProps {
    total: number;
    isLoading?: boolean;
    onBreakdownClick?: () => void;
    onBookClick?: () => void;
}

export const StickyPriceFooter: React.FC<StickyPriceFooterProps> = ({
    total,
    isLoading = false,
    onBreakdownClick,
    onBookClick
}) => {
    return (
        <div className="sticky-price-footer">
            <div className="price-container">
                <div className="price-label">Estimated Total</div>
                <div className="price-amount">
                    {isLoading ? (
                        <span className="price-loading">Calculating...</span>
                    ) : (
                        <>${total.toFixed(0)}</>
                    )}
                </div>
                {onBreakdownClick && (
                    <button
                        type="button"
                        className="breakdown-link"
                        onClick={onBreakdownClick}
                    >
                        View breakdown →
                    </button>
                )}
            </div>

            {onBookClick && (
                <button
                    type="button"
                    className="btn-book-ride"
                    onClick={onBookClick}
                    disabled={isLoading || total === 0}
                >
                    Book Ride
                </button>
            )}
        </div>
    );
};
