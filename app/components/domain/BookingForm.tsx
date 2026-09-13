import React from 'react';
import type { Trip } from '../../core/types';
import { BookingEngineV2 } from './BookingEngineV2';

export interface BookingFormProps {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
}

/**
 * BookingForm
 * 
 * Backwards-compatible wrapper delegating to the unified Customer Booking Engine (<BookingEngineV2 />).
 */
export function BookingForm({ className = '', onBookingSuccess }: BookingFormProps) {
  return (
    <BookingEngineV2
      className={className}
      onBookingSuccess={onBookingSuccess}
    />
  );
}

export default BookingForm;
