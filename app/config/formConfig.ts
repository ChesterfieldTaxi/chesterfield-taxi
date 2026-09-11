/**
 * Foundational Multi-Step Booking Form Configuration
 * 
 * Declares the schema for each booking step according to the config-driven
 * UI architecture specified in constitution.md, plan.md, and spec.md.
 * Utilizes FieldSchema definitions with dynamic visibility and requirement toggles.
 */

import type { FormSchema } from '../core/types';
import { AIRLINE_SELECT_OPTIONS } from '../core/config/airports';

export const bookingFormConfig: FormSchema = {
  id: 'chesterfield-taxi-booking-form',
  version: '1.0.0',
  title: 'Book a Taxi',
  description: 'Fast, dependable transportation in Chesterfield and surrounding areas.',
  steps: [
    {
      id: 'step-locations',
      stepNumber: 1,
      title: 'Pickup & Dropoff',
      subtitle: 'Where are we picking you up and heading?',
      description: 'Enter exact addresses, venues, or airport terminals for accurate route planning.',
      fields: [
        {
          id: 'pickupAddress',
          name: 'pickupAddress',
          type: 'location-autocomplete',
          presentation: {
            label: 'Pickup Address',
            placeholder: 'Enter pickup address, hotel, or landmark',
            helperText: 'Select from suggested addresses for exact GPS routing',
            colSpan: 12,
            order: 1,
            icon: 'map-pin',
            autoFocus: true,
          },
          validation: {
            required: true,
          },
        },
        {
          id: 'pickupNotes',
          name: 'pickupNotes',
          type: 'text',
          presentation: {
            label: 'Pickup Details (Optional)',
            placeholder: 'Apartment, suite, terminal, or gate code',
            colSpan: 12,
            order: 2,
          },
          validation: {
            maxLength: 120,
          },
        },
        {
          id: 'dropoffAddress',
          name: 'dropoffAddress',
          type: 'location-autocomplete',
          presentation: {
            label: 'Dropoff Destination',
            placeholder: 'Enter destination address or landmark',
            helperText: 'Where would you like to be dropped off?',
            colSpan: 12,
            order: 3,
            icon: 'flag',
          },
          validation: {
            required: true,
          },
        },
        {
          id: 'dropoffNotes',
          name: 'dropoffNotes',
          type: 'text',
          presentation: {
            label: 'Dropoff Details (Optional)',
            placeholder: 'Entrance, specific door, or dropoff note',
            colSpan: 12,
            order: 4,
          },
          validation: {
            maxLength: 120,
          },
        },
      ],
    },
    {
      id: 'step-timing',
      stepNumber: 2,
      title: 'Time Selection',
      subtitle: 'When do you need the ride?',
      description: 'Choose between an immediate dispatch or schedule in advance.',
      fields: [
        {
          id: 'bookingType',
          name: 'bookingType',
          type: 'radio',
          defaultValue: 'asap',
          presentation: {
            label: 'Ride Timing',
            colSpan: 12,
            order: 1,
          },
          validation: {
            required: true,
          },
          options: [
            {
              label: 'Ride Now (ASAP)',
              value: 'asap',
              description: 'Immediate broadcast to available drivers in the area.',
              badge: 'Fastest',
            },
            {
              label: 'Schedule for Later',
              value: 'scheduled',
              description: 'Reserve a ride for a future date and time.',
            },
          ],
        },
        {
          id: 'scheduledDate',
          name: 'scheduledDate',
          type: 'date',
          presentation: {
            label: 'Scheduled Date',
            colSpan: 6,
            order: 2,
            helperText: 'Select pickup date',
          },
          dependencies: ['bookingType'],
          visibility: {
            when: {
              field: 'bookingType',
              operator: 'equals',
              value: 'scheduled',
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'bookingType',
              operator: 'equals',
              value: 'scheduled',
            },
            action: 'require',
            message: 'Please select a date for your scheduled ride.',
          },
        },
        {
          id: 'scheduledTime',
          name: 'scheduledTime',
          type: 'time',
          presentation: {
            label: 'Scheduled Time',
            colSpan: 6,
            order: 3,
            helperText: 'Select pickup time',
          },
          dependencies: ['bookingType'],
          visibility: {
            when: {
              field: 'bookingType',
              operator: 'equals',
              value: 'scheduled',
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'bookingType',
              operator: 'equals',
              value: 'scheduled',
            },
            action: 'require',
            message: 'Please specify a pickup time.',
          },
        },
      ],
    },
    {
      id: 'step-vehicle',
      stepNumber: 3,
      title: 'Vehicle Selection',
      subtitle: 'Choose the right vehicle for your journey',
      description: 'Rates vary by vehicle tier and passenger capacity.',
      fields: [
        {
          id: 'vehicleTier',
          name: 'vehicleTier',
          type: 'vehicle-select',
          defaultValue: 'standard',
          presentation: {
            label: 'Vehicle Tier',
            colSpan: 12,
            order: 1,
          },
          validation: {
            required: true,
          },
          options: [
            {
              label: 'Standard Sedan',
              value: 'standard',
              description: 'Comfortable sedan for daily rides. Fits up to 4 passengers and 2 standard bags.',
              badge: 'Popular',
            },
            {
              label: 'Premium Executive',
              value: 'premium',
              description: 'Upgraded luxury ride for business travel or special events. Quiet, clean, executive comfort.',
            },
            {
              label: 'XL Minivan / SUV',
              value: 'xl',
              description: 'Spacious vehicle for families or groups. Accommodates up to 6 passengers and 5 luggage bags.',
            },
            {
              label: 'Wheelchair Accessible (WAV)',
              value: 'wheelchair',
              description: 'Equipped with wheelchair ramp, secure tie-downs, and trained drivers for accessibility needs.',
            },
          ],
        },
      ],
    },
    {
      id: 'step-details',
      stepNumber: 4,
      title: 'Passenger Details',
      subtitle: 'Who is traveling?',
      description: 'We need your contact information to send booking confirmations and driver arrival alerts.',
      fields: [
        {
          id: 'firstName',
          name: 'firstName',
          type: 'text',
          presentation: {
            label: 'First Name',
            placeholder: 'John',
            colSpan: 6,
            order: 1,
          },
          validation: {
            required: true,
            minLength: 2,
            maxLength: 50,
          },
        },
        {
          id: 'lastName',
          name: 'lastName',
          type: 'text',
          presentation: {
            label: 'Last Name',
            placeholder: 'Doe',
            colSpan: 6,
            order: 2,
          },
          validation: {
            required: true,
            minLength: 2,
            maxLength: 50,
          },
        },
        {
          id: 'email',
          name: 'email',
          type: 'email',
          presentation: {
            label: 'Email Address',
            placeholder: 'john.doe@example.com',
            helperText: 'Confirmation & Resend receipts will be delivered here',
            colSpan: 6,
            order: 3,
            icon: 'mail',
          },
          validation: {
            required: true,
            pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            patternMessage: 'Please enter a valid email address.',
          },
        },
        {
          id: 'phone',
          name: 'phone',
          type: 'tel',
          presentation: {
            label: 'Mobile Phone Number',
            placeholder: '(555) 000-0000',
            helperText: 'Driver will send dispatch & arrival updates via SMS/call',
            colSpan: 6,
            order: 4,
            icon: 'phone',
          },
          validation: {
            required: true,
            pattern: '^[+]?[0-9\\s()\\-\\.]+$',
            patternMessage: 'Please enter a valid phone number.',
          },
        },
        {
          id: 'passengerCount',
          name: 'passengerCount',
          type: 'counter',
          defaultValue: 1,
          presentation: {
            label: 'Number of Passengers',
            colSpan: 6,
            order: 5,
          },
          validation: {
            required: true,
            min: 1,
            max: 6,
          },
        },
        {
          id: 'luggageCount',
          name: 'luggageCount',
          type: 'counter',
          defaultValue: 0,
          presentation: {
            label: 'Luggage Count',
            colSpan: 6,
            order: 6,
          },
          validation: {
            min: 0,
            max: 6,
          },
        },
        {
          id: 'airlineCode',
          name: 'airlineCode',
          type: 'select',
          presentation: {
            label: 'Airline Carrier',
            placeholder: 'Select your airline...',
            helperText: 'Choose the commercial airline operating your flight',
            colSpan: 6,
            order: 7,
          },
          options: AIRLINE_SELECT_OPTIONS,
          dependencies: ['isAirportTrip'],
          visibility: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'require',
            message: 'Please select your airline carrier.',
          },
        },
        {
          id: 'flightNumber',
          name: 'flightNumber',
          type: 'text',
          presentation: {
            label: 'Flight Number',
            placeholder: 'e.g. 1234',
            helperText: 'Flight number (1-4 digits only, e.g. 1234 — do not enter confirmation code)',
            colSpan: 6,
            order: 8,
          },
          validation: {
            pattern: '^\\d{1,4}$',
            patternMessage: 'Please enter 1 to 4 digits only (not your booking/confirmation code).',
            maxLength: 4,
          },
          dependencies: ['isAirportTrip'],
          visibility: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'require',
            message: 'Please provide a valid flight number (1-4 digits).',
          },
        },
        {
          id: 'departureAirport',
          name: 'departureAirport',
          type: 'text',
          presentation: {
            label: 'Departure Airport / Origin City',
            placeholder: "e.g. Chicago O'Hare (ORD) or Dallas (DFW)",
            helperText: 'Where is your flight originating from?',
            colSpan: 6,
            order: 9,
          },
          validation: {
            maxLength: 80,
          },
          dependencies: ['isAirportTrip'],
          visibility: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'require',
            message: 'Please enter the departure airport or originating city.',
          },
        },
        {
          id: 'hasCheckedLuggage',
          name: 'hasCheckedLuggage',
          type: 'switch',
          defaultValue: false,
          presentation: {
            label: 'Do you have checked luggage?',
            helperText: 'Alerts driver to anticipate baggage carousel clearance time at baggage claim.',
            colSpan: 6,
            order: 10,
          },
          dependencies: ['isAirportTrip'],
          visibility: {
            when: {
              field: 'isAirportTrip',
              operator: 'equals',
              value: true,
            },
            action: 'show',
          },
        },
        {
          id: 'hasSpecialRequests',
          name: 'hasSpecialRequests',
          type: 'switch',
          defaultValue: false,
          presentation: {
            label: 'Do you have special requests or instructions?',
            colSpan: 12,
            order: 11,
          },
        },
        {
          id: 'specialRequests',
          name: 'specialRequests',
          type: 'textarea',
          presentation: {
            label: 'Special Requests / Notes for Driver',
            placeholder: 'Child seat requested, pet traveling in crate, assistance with heavy bags, etc.',
            colSpan: 12,
            order: 12,
          },
          dependencies: ['hasSpecialRequests'],
          visibility: {
            when: {
              field: 'hasSpecialRequests',
              operator: 'equals',
              value: true,
            },
            action: 'show',
          },
        },
      ],
    },
    {
      id: 'step-payment',
      stepNumber: 5,
      title: 'Payment & Confirmation',
      subtitle: 'Review details and select payment method',
      description: 'Your fare will be calculated using our pure functional pricing engine.',
      fields: [
        {
          id: 'paymentMethod',
          name: 'paymentMethod',
          type: 'radio',
          defaultValue: 'card',
          presentation: {
            label: 'Payment Method',
            colSpan: 12,
            order: 1,
          },
          validation: {
            required: true,
          },
          options: [
            {
              label: 'Pay by Credit / Debit Card',
              value: 'card',
              description: 'Secure card authorization. You will only be charged upon trip completion.',
            },
            {
              label: 'Pay in Vehicle (Cash / Card Terminal)',
              value: 'cash',
              description: 'Pay directly to your driver when you arrive at your destination.',
            },
            {
              label: 'Corporate Account Billing',
              value: 'corporate',
              description: 'Bill directly to an approved corporate business account.',
            },
          ],
        },
        {
          id: 'corporateAccountId',
          name: 'corporateAccountId',
          type: 'text',
          presentation: {
            label: 'Corporate Account ID / Code',
            placeholder: 'CORP-XXXXX',
            colSpan: 12,
            order: 2,
          },
          dependencies: ['paymentMethod'],
          visibility: {
            when: {
              field: 'paymentMethod',
              operator: 'equals',
              value: 'corporate',
            },
            action: 'show',
          },
          requirement: {
            when: {
              field: 'paymentMethod',
              operator: 'equals',
              value: 'corporate',
            },
            action: 'require',
            message: 'Corporate Account ID is required for corporate billing.',
          },
        },
        {
          id: 'promoCode',
          name: 'promoCode',
          type: 'text',
          presentation: {
            label: 'Promo or Voucher Code (Optional)',
            placeholder: 'SAVE10',
            colSpan: 12,
            order: 3,
          },
        },
        {
          id: 'termsAccepted',
          name: 'termsAccepted',
          type: 'checkbox',
          defaultValue: false,
          presentation: {
            label: 'I accept the Chesterfield Taxi Terms of Service and Cancellation Policy.',
            colSpan: 12,
            order: 4,
          },
          validation: {
            required: true,
          },
        },
      ],
    },
  ],
};

export default bookingFormConfig;
