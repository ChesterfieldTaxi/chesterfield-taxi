import { FleetConfig } from '../types/fleet';

export const mockFleetConfig: FleetConfig = {
    vehicles: {
        Sedan: {
            id: 'Sedan',
            name: 'Comfort Sedan',
            description: 'Ford Taurus or similar. Best For: Corporate travel, airport transfers, couples.',
            features: [
                'Plush leather seating',
                'Extra legroom',
                'Quiet, smooth ride',
                'Climate control'
            ],
            luggageCapacity: 4,
            physicalCapacity: 4,
            images: {
                default: '/vehicles/sedan.png',
                highRes: '/vehicles/sedan@2x.png'
            },
            displayOrder: 1
        },
        Minivan: {
            id: 'Minivan',
            name: 'Spacious Minivan',
            description: 'Toyota Sienna or similar. Best For: Families, airport runs with extra luggage, small groups.',
            features: [
                'Easy entry and exit sliding doors',
                'Ample rear cargo space',
                'Child car seat compatible'
            ],
            luggageCapacity: 5,
            physicalCapacity: 6,
            images: {
                default: '/vehicles/minivan.png',
                highRes: '/vehicles/minivan@2x.png'
            },
            displayOrder: 2
        },
        SUV: {
            id: 'SUV',
            name: 'Full-Size SUV',
            description: 'Ford Explorer or similar. Best For: VIP transport, severe weather safety, executive groups.',
            features: [
                'High clearance and 4WD safety',
                'Premium sound and interior finishes',
                'Maximum luggage capacity'
            ],
            luggageCapacity: 4,
            physicalCapacity: 4,
            images: {
                default: '/vehicles/suv.png',
                highRes: '/vehicles/suv@2x.png'
            },
            displayOrder: 3
        }
    }
};
