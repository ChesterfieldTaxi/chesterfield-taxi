import React from 'react';
import BookingForm from '../components/BookingForm';

const Reservations: React.FC = () => {
    return (
        <div className="page-reservations">
            <div className="container">
                <div className="section">
                    <BookingForm />
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
