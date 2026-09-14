import { type ActionFunctionArgs } from 'react-router';
import { getBookingService } from '../core/services/booking';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Use a background operation instead of blocking the response
  // so the UI doesn't hang.
  (async () => {
    try {
      const service = getBookingService();
      const statuses = ['UNCONFIRMED', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'] as const;
      
      const baseTrip = {
        pickupLocation: { address: '123 Test St', coordinates: { lat: 38.6, lng: -90.5 } },
        dropoffLocation: { address: '456 Dest Ave', coordinates: { lat: 38.7, lng: -90.4 } },
        bookingType: 'asap' as const,
        vehicleTier: 'standard' as const,
        passenger: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          phone: '555-0100',
          passengerCount: 1,
          luggageCount: 0,
        },
        pricing: {
          baseFare: 5.0,
          distanceMiles: 1,
          durationMinutes: 5,
          distanceRate: 15.0,
          timeRate: 0,
          totalFare: 20.0,
          vehicleMultiplier: 1,
          surgeMultiplier: 1,
          discountAmount: 0,
          subtotal: 20.0,
          currency: 'USD'
        },
        payment: {
          method: 'card' as const,
          status: 'pending' as const,
          amount: 20.0
        }
      };

      for (let i = 0; i < 120; i++) {
        const status = statuses[i % statuses.length];
        const trip = await service.createBooking({
          ...baseTrip,
          passenger: {
            ...baseTrip.passenger,
            firstName: `Test${i}`,
          }
        });
        
        if (trip && status !== 'UNCONFIRMED') {
          // Status strings mapped locally need cast if TS complains, but we mapped them exactly
          if (service.updateTripStatus) {
            await service.updateTripStatus(trip.id, status as any, { actorRole: 'system' });
          }
        }
      }
    } catch (e) {
      console.error('Failed to seed stress data:', e);
    }
  })();

  return new Response('Seeding started', { status: 200 });
}
