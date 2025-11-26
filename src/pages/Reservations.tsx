import React from 'react';
import { BookingFlowV3 } from '../components/booking_v3/BookingFlowV3';

const Reservations: React.FC = () => {
    return (
        <div className="page-reservations">
            <div className="container">
                <div className="section">
                    <BookingFlowV3 />
                </div>
            </div>
            <style>{`
                .page-reservations {
                    background-color: var(--color-background-alt);
                    min-height: 80vh;
                    padding-top: var(--spacing-lg);
                }
            `}</style>
        </div>
    );
};

export default Reservations;
