export interface FleetConfig {
    vehicles: Record<string, VehicleDisplayConfig>;
}

export interface VehicleDisplayConfig {
    id: string;
    name: string;
    description: string;
    features: string[];
    luggageCapacity: number;
    physicalCapacity: number;
    images: {
        default: string;
        highRes: string;
    };
    displayOrder: number;
}
