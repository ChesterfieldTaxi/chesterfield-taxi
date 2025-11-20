import React from 'react';
import type { PassengerGroup } from '../../types/booking';

interface PassengerStepProps {
    passengerCount: number;
    setPassengerCount: (count: number) => void;
    bagCount: number;
    setBagCount: (count: number) => void;
    passengers: PassengerGroup[];
    setPassengers: (passengers: PassengerGroup[]) => void;
    hasCarSeats: boolean;
    setHasCarSeats: (has: boolean) => void;
    infantSeats: number;
    setInfantSeats: (count: number) => void;
    toddlerSeats: number;
    setToddlerSeats: (count: number) => void;
    boosterSeats: number;
    setBoosterSeats: (count: number) => void;
}

const PassengerStep: React.FC<PassengerStepProps> = ({
    passengerCount, setPassengerCount,
    bagCount, setBagCount,
    passengers, setPassengers,
    hasCarSeats, setHasCarSeats,
    infantSeats, setInfantSeats,
    toddlerSeats, setToddlerSeats,
    boosterSeats, setBoosterSeats
}) => {

    const updatePassenger = (id: string, field: keyof PassengerGroup, value: string) => {
        setPassengers(passengers.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const addPassenger = () => {
        const newPassenger: PassengerGroup = {
            id: Math.random().toString(36).substr(2, 9),
            name: '',
            phone: '',
            email: '',
            repeatDays: []
        };
        setPassengers([...passengers, newPassenger]);
        setPassengerCount(passengerCount + 1);
    };

    const removePassenger = (id: string) => {
        if (passengers.length > 1) {
            setPassengers(passengers.filter(p => p.id !== id));
            setPassengerCount(passengerCount - 1);
        }
    };

    const increment = (setter: (n: number) => void, val: number) => setter(val + 1);
    const decrement = (setter: (n: number) => void, val: number) => setter(Math.max(0, val - 1));

    return (
        <div className="form-section">
            <label className="form-section-header">Passenger Details</label>
            <div className="form-group-box">
                {passengers.map((p, index) => (
                    <div key={p.id} className={`space-y-2 ${index > 0 ? 'pt-3 border-t border-gray-200' : ''}`}>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Passenger Name"
                            value={p.name}
                            onChange={(e) => updatePassenger(p.id, 'name', e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="tel"
                                className="form-input"
                                placeholder="Phone Number"
                                value={p.phone}
                                onChange={(e) => updatePassenger(p.id, 'phone', e.target.value)}
                            />
                            <input
                                type="email"
                                className="form-input"
                                placeholder="Email"
                                value={p.email}
                                onChange={(e) => updatePassenger(p.id, 'email', e.target.value)}
                            />
                        </div>
                        {index > 0 && (
                            <button type="button" className="text-xs text-red-500" onClick={() => removePassenger(p.id)}>Remove Passenger</button>
                        )}
                    </div>
                ))}
                <button type="button" className="add-stop-btn" onClick={addPassenger}>+ Add passenger</button>
            </div>

            <label className="form-section-header mt-2">Trip Details</label>
            <div className="form-group-box">
                <div className="counter-group">
                    <span className="text-sm font-medium">Passengers</span>
                    <div className="counter-controls">
                        <button type="button" className="counter-btn" onClick={() => decrement(setPassengerCount, passengerCount)}>-</button>
                        <input type="text" className="counter-input" readOnly value={passengerCount} />
                        <button type="button" className="counter-btn" onClick={() => increment(setPassengerCount, passengerCount)}>+</button>
                    </div>
                </div>
                <div className="counter-group">
                    <span className="text-sm font-medium">Bags</span>
                    <div className="counter-controls">
                        <button type="button" className="counter-btn" onClick={() => decrement(setBagCount, bagCount)}>-</button>
                        <input type="text" className="counter-input" readOnly value={bagCount} />
                        <button type="button" className="counter-btn" onClick={() => increment(setBagCount, bagCount)}>+</button>
                    </div>
                </div>

                <div className="border-t border-gray-200 pt-2 mt-2">
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={hasCarSeats} onChange={(e) => setHasCarSeats(e.target.checked)} />
                        Car Seats
                    </label>

                    {hasCarSeats && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                            <div className="text-center">
                                <span className="text-xs block mb-1">Rear-facing</span>
                                <div className="counter-controls justify-center">
                                    <button type="button" className="counter-btn" onClick={() => decrement(setInfantSeats, infantSeats)}>-</button>
                                    <input type="text" className="counter-input" readOnly value={infantSeats} />
                                    <button type="button" className="counter-btn" onClick={() => increment(setInfantSeats, infantSeats)}>+</button>
                                </div>
                            </div>
                            <div className="text-center">
                                <span className="text-xs block mb-1">Front-facing</span>
                                <div className="counter-controls justify-center">
                                    <button type="button" className="counter-btn" onClick={() => decrement(setToddlerSeats, toddlerSeats)}>-</button>
                                    <input type="text" className="counter-input" readOnly value={toddlerSeats} />
                                    <button type="button" className="counter-btn" onClick={() => increment(setToddlerSeats, toddlerSeats)}>+</button>
                                </div>
                            </div>
                            <div className="text-center">
                                <span className="text-xs block mb-1">Booster</span>
                                <div className="counter-controls justify-center">
                                    <button type="button" className="counter-btn" onClick={() => decrement(setBoosterSeats, boosterSeats)}>-</button>
                                    <input type="text" className="counter-input" readOnly value={boosterSeats} />
                                    <button type="button" className="counter-btn" onClick={() => increment(setBoosterSeats, boosterSeats)}>+</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PassengerStep;
