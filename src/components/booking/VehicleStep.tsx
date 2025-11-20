import React from 'react';
import type { VehicleType } from '../../types/booking';

interface VehicleStepProps {
    vehicleType: VehicleType;
    setVehicleType: (type: VehicleType) => void;
}

const VehicleStep: React.FC<VehicleStepProps> = ({ vehicleType, setVehicleType }) => {
    const types: VehicleType[] = ['Any', 'Sedan', 'SUV', 'Van'];

    return (
        <div className="form-section">
            <label className="form-section-header">Vehicle</label>
            <div className="form-group-box">
                <div className="vehicle-grid">
                    {types.map(type => (
                        <button
                            key={type}
                            className={`vehicle-btn ${vehicleType === type ? 'active' : ''}`}
                            onClick={() => setVehicleType(type)}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VehicleStep;
