import React from 'react';
import type { Trip } from '../../core/types';
import { BookingEngine } from './BookingEngine';

export interface BookingFormProps {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
}

/**
 * BookingForm
 * 
 * Backwards-compatible wrapper delegating to the unified Master Booking Engine (<BookingEngine />)
 * in customer mode.
 */
export function BookingForm({ className = '', onBookingSuccess }: BookingFormProps) {
  return (
    <BookingEngine
      mode="customer"
      className={className}
      onBookingSuccess={(trips) => {
        if (trips.length > 0 && onBookingSuccess) {
          onBookingSuccess(trips[0]);
        }
      }}
    />
  );
}

export default BookingForm;
