import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Trip, GeoPoint, CreateTripInput, VehicleTier, PaymentMethod } from '../../../core/types';
import { getBookingService } from '../../../core/services/booking';
import { calculateLiveRoute } from '../../../core/services/maps/live-routing.service';
import { calculateTripPricing } from '../../../core/services/pricing';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { DispatchLocationInput } from './DispatchLocationInput';
import { SpinnerIcon } from '../../ui/Icons';

export interface DispatchFormValues {
  timingType: 'asap' | 'later';
  scheduledDate: string;
  scheduledTime: string;
  pickupAddress: string;
  pickupCoordinates?: GeoPoint;
  dropoffAddress: string;
  dropoffCoordinates?: GeoPoint;
  intermediateStops: Array<{ address: string; coordinates?: GeoPoint }>;
  passengerName: string;
  phone: string;
  email: string;
  passengers: number;
  bags: number;
  carSeats: boolean;
  vehicle: 'any' | 'sedan' | 'suv' | 'van';
  paymentMethod: 'cash' | 'card' | 'account';
  tariff: string;
  discount: string;
  company: string;
  driverId: string;
  notesForAll: string;
  internalNotes: string;
  returnTrip: boolean;
  repeat: boolean;
  estimatedFare: number;
  manualFare: string;
  isFareOverridden: boolean;
  estimatedDurationMinutes: number;
  estimatedDistanceMiles: number;
}

export interface DispatchBookingEngineProps {
  draftId: string;
  initialTrip?: Trip | null;
  onBookingSuccess?: (trip: Trip, isEdit: boolean) => void;
  onValuesChange?: (values: DispatchFormValues) => void;
  onClearDraft?: () => void;
}

const DEFAULT_COMPANIES = ['Chesterfield Taxi', 'St. Louis Taxi', 'West County Express'];
const DEFAULT_DRIVERS = [
  { id: 'unassigned', name: 'Unassigned' },
  { id: 'drv-101', name: 'Driver 101 (Mike T.)' },
  { id: 'drv-104', name: 'Driver 104 (Sarah K.)' },
  { id: 'drv-108', name: 'Driver 108 (David R.)' },
  { id: 'drv-112', name: 'Driver 112 (James W.)' },
];

export function DispatchBookingEngine({
  draftId,
  initialTrip,
  onBookingSuccess,
  onValuesChange,
  onClearDraft,
}: DispatchBookingEngineProps) {
  const isEditMode = Boolean(initialTrip?.id);
  const draftStorageKey = `chesterfield_dispatch_draft_${draftId}`;

  // Form State
  const [timingType, setTimingType] = useState<'asap' | 'later'>('asap');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('12:00');
  
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>();
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [intermediateStops, setIntermediateStops] = useState<Array<{ address: string; coordinates?: GeoPoint }>>([]);

  const [passengerName, setPassengerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [bags, setBags] = useState(0);
  const [carSeats, setCarSeats] = useState(false);

  const [vehicle, setVehicle] = useState<'any' | 'sedan' | 'suv' | 'van'>('any');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'account'>('cash');
  const [tariff, setTariff] = useState('Standard');
  const [discount, setDiscount] = useState('None');
  const [company, setCompany] = useState(DEFAULT_COMPANIES[0]);
  const [driverId, setDriverId] = useState('unassigned');

  const [notesForAll, setNotesForAll] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [returnTrip, setReturnTrip] = useState(false);
  const [repeat, setRepeat] = useState(false);

  const [estimatedFare, setEstimatedFare] = useState(0);
  const [manualFare, setManualFare] = useState('');
  const [isFareOverridden, setIsFareOverridden] = useState(false);
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState(0);
  const [estimatedDistanceMiles, setEstimatedDistanceMiles] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Hydrate from initialTrip if provided
  useEffect(() => {
    if (initialTrip) {
      setTimingType(initialTrip.bookingType === 'scheduled' ? 'later' : 'asap');
      if (initialTrip.scheduledPickupTime) {
        try {
          const d = new Date(initialTrip.scheduledPickupTime);
          if (!isNaN(d.getTime())) {
            setScheduledDate(d.toISOString().split('T')[0]);
            setScheduledTime(d.toTimeString().slice(0, 5));
          }
        } catch {
          // keep defaults
        }
      }
      setPickupAddress(initialTrip.pickupLocation?.address || '');
      setPickupCoordinates(initialTrip.pickupLocation?.coordinates);
      setDropoffAddress(initialTrip.dropoffLocation?.address || '');
      setDropoffCoordinates(initialTrip.dropoffLocation?.coordinates);
      if (initialTrip.intermediateStops) {
        setIntermediateStops(
          initialTrip.intermediateStops.map(s => ({ address: s.address, coordinates: s.coordinates }))
        );
      }
      const pName = `${initialTrip.passenger?.firstName || ''} ${initialTrip.passenger?.lastName || ''}`.trim();
      setPassengerName(pName);
      setPhone(initialTrip.passenger?.phone || '');
      setEmail(initialTrip.passenger?.email || '');
      setPassengers(initialTrip.passenger?.passengerCount || 1);
      setBags(initialTrip.passenger?.luggageCount || 0);
      setCarSeats(Boolean(initialTrip.passenger?.specialRequests?.toLowerCase().includes('car seat')));

      const tier = initialTrip.vehicleTier;
      if (tier === 'xl') setVehicle('suv');
      else if (tier === 'wheelchair') setVehicle('van');
      else if (tier === 'premium') setVehicle('sedan');
      else setVehicle('any');

      if (initialTrip.payment?.method === 'card') setPaymentMethod('card');
      else if (initialTrip.payment?.method === 'corporate') setPaymentMethod('account');
      else setPaymentMethod('cash');

      setCompany((initialTrip.metadata?.company as string) || DEFAULT_COMPANIES[0]);
      setDriverId(initialTrip.assignedDriverId || 'unassigned');
      setNotesForAll(initialTrip.driverNotes || initialTrip.pickupLocation?.notes || '');
      setInternalNotes((initialTrip.metadata?.internalNotes as string) || '');

      const fare = initialTrip.pricing?.totalFare || 0;
      setEstimatedFare(fare);
      setManualFare(fare > 0 ? fare.toFixed(2) : '');
      setIsFareOverridden(fare > 0);
      setEstimatedDistanceMiles(initialTrip.pricing?.distanceMiles || 0);
      setEstimatedDurationMinutes(initialTrip.pricing?.durationMinutes || 0);
    } else {
      // Try restore from localStorage for drafts
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.pickupAddress) setPickupAddress(parsed.pickupAddress);
          if (parsed.pickupCoordinates) setPickupCoordinates(parsed.pickupCoordinates);
          if (parsed.dropoffAddress) setDropoffAddress(parsed.dropoffAddress);
          if (parsed.dropoffCoordinates) setDropoffCoordinates(parsed.dropoffCoordinates);
          if (parsed.passengerName) setPassengerName(parsed.passengerName);
          if (parsed.phone) setPhone(parsed.phone);
          if (parsed.email) setEmail(parsed.email);
          if (parsed.passengers) setPassengers(parsed.passengers);
          if (parsed.bags !== undefined) setBags(parsed.bags);
          if (parsed.vehicle) setVehicle(parsed.vehicle);
          if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
          if (parsed.notesForAll) setNotesForAll(parsed.notesForAll);
          if (parsed.internalNotes) setInternalNotes(parsed.internalNotes);
          if (parsed.company) setCompany(parsed.company);
          if (parsed.driverId) setDriverId(parsed.driverId);
          if (parsed.estimatedFare) setEstimatedFare(parsed.estimatedFare);
          if (parsed.manualFare) {
            setManualFare(parsed.manualFare);
            setIsFareOverridden(true);
          }
        }
      } catch (e) {
        // ignore storage parse error
      }
    }
  }, [initialTrip, draftStorageKey]);

  // Persist draft to local storage on changes (only if not editing live trip)
  useEffect(() => {
    if (isEditMode) return;
    try {
      const stateToSave = {
        pickupAddress,
        pickupCoordinates,
        dropoffAddress,
        dropoffCoordinates,
        passengerName,
        phone,
        email,
        passengers,
        bags,
        vehicle,
        paymentMethod,
        notesForAll,
        internalNotes,
        company,
        driverId,
        estimatedFare,
        manualFare,
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(stateToSave));
    } catch {
      // ignore storage write errors
    }
  }, [
    isEditMode,
    draftStorageKey,
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    passengerName,
    phone,
    email,
    passengers,
    bags,
    vehicle,
    paymentMethod,
    notesForAll,
    internalNotes,
    company,
    driverId,
    estimatedFare,
    manualFare,
  ]);

  // Notify parent of values change (for map sync, etc.)
  useEffect(() => {
    onValuesChange?.({
      timingType,
      scheduledDate,
      scheduledTime,
      pickupAddress,
      pickupCoordinates,
      dropoffAddress,
      dropoffCoordinates,
      intermediateStops,
      passengerName,
      phone,
      email,
      passengers,
      bags,
      carSeats,
      vehicle,
      paymentMethod,
      tariff,
      discount,
      company,
      driverId,
      notesForAll,
      internalNotes,
      returnTrip,
      repeat,
      estimatedFare: isFareOverridden && manualFare ? parseFloat(manualFare) || 0 : estimatedFare,
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
    });
  }, [
    timingType,
    scheduledDate,
    scheduledTime,
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    intermediateStops,
    passengerName,
    phone,
    email,
    passengers,
    bags,
    carSeats,
    vehicle,
    paymentMethod,
    tariff,
    discount,
    company,
    driverId,
    notesForAll,
    internalNotes,
    returnTrip,
    repeat,
    estimatedFare,
    manualFare,
    isFareOverridden,
    estimatedDurationMinutes,
    estimatedDistanceMiles,
    onValuesChange,
  ]);

  // Live route calculation & pricing
  useEffect(() => {
    if (!pickupAddress || !dropoffAddress) {
      if (!isFareOverridden) {
        setEstimatedFare(0);
        setEstimatedDistanceMiles(0);
        setEstimatedDurationMinutes(0);
      }
      return;
    }

    let isMounted = true;
    const origin = pickupCoordinates || pickupAddress;
    const destination = dropoffCoordinates || dropoffAddress;
    const waypoints = intermediateStops.map(s => s.coordinates || s.address).filter(Boolean);

    calculateLiveRoute({ origin, destination, waypoints })
      .then((res) => {
        if (!isMounted || !res) return;
        setEstimatedDistanceMiles(res.distanceMiles);
        setEstimatedDurationMinutes(res.durationMinutes);

        if (!isFareOverridden) {
          const config = getAdminConfigService().getCachedSettings().pricing;
          let tier: VehicleTier = 'standard';
          if (vehicle === 'suv') tier = 'xl';
          if (vehicle === 'van') tier = 'wheelchair';
          if (vehicle === 'sedan') tier = 'premium';

          const quote = calculateTripPricing(
            {
              distanceMiles: res.distanceMiles,
              durationMinutes: res.durationMinutes,
              vehicleTier: tier,
              pickupDateTime: timingType === 'later' && scheduledDate && scheduledTime
                ? new Date(`${scheduledDate}T${scheduledTime}:00`)
                : new Date(),
              intermediateStopsCount: intermediateStops.length,
            },
            config
          );
          setEstimatedFare(quote.pricing.totalFare);
        }
      })
      .catch((e) => {
        console.warn('[DispatchBookingEngine] Route calculation failed:', e);
      });

    return () => {
      isMounted = false;
    };
  }, [
    pickupAddress,
    pickupCoordinates,
    dropoffAddress,
    dropoffCoordinates,
    intermediateStops,
    vehicle,
    timingType,
    isFareOverridden,
  ]);

  // Swap pickup & dropoff
  const handleSwapRoute = () => {
    const tmpAddr = pickupAddress;
    const tmpCoords = pickupCoordinates;
    setPickupAddress(dropoffAddress);
    setPickupCoordinates(dropoffCoordinates);
    setDropoffAddress(tmpAddr);
    setDropoffCoordinates(tmpCoords);
  };

  // Clear Form
  const handleClear = () => {
    setPickupAddress('');
    setPickupCoordinates(undefined);
    setDropoffAddress('');
    setDropoffCoordinates(undefined);
    setIntermediateStops([]);
    setPassengerName('');
    setPhone('');
    setEmail('');
    setPassengers(1);
    setBags(0);
    setCarSeats(false);
    setVehicle('any');
    setPaymentMethod('cash');
    setTariff('Standard');
    setDiscount('None');
    setDriverId('unassigned');
    setNotesForAll('');
    setInternalNotes('');
    setEstimatedFare(0);
    setManualFare('');
    setIsFareOverridden(false);
    setEstimatedDurationMinutes(0);
    setEstimatedDistanceMiles(0);
    setSubmitError(null);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }

    onClearDraft?.();
  };

  // Submit Booking (Create or Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!pickupAddress.trim()) {
      setSubmitError('Please enter a pickup address.');
      return;
    }
    if (!dropoffAddress.trim()) {
      setSubmitError('Please enter a dropoff address.');
      return;
    }
    if (!passengerName.trim()) {
      setSubmitError('Please enter passenger name.');
      return;
    }
    if (!phone.trim()) {
      setSubmitError('Please enter passenger phone number.');
      return;
    }

    setIsSubmitting(true);
    const service = getBookingService();

    let tier: VehicleTier = 'standard';
    if (vehicle === 'suv') tier = 'xl';
    else if (vehicle === 'van') tier = 'wheelchair';
    else if (vehicle === 'sedan') tier = 'premium';

    let method: PaymentMethod = 'cash';
    if (paymentMethod === 'card') method = 'card';
    if (paymentMethod === 'account') method = 'corporate';

    const finalFare = isFareOverridden && manualFare ? parseFloat(manualFare) || 0 : estimatedFare;

    const names = passengerName.trim().split(/\s+/);
    const firstName = names[0] || 'Guest';
    const lastName = names.slice(1).join(' ') || 'Passenger';

    let scheduledPickupTime: string | undefined = undefined;
    if (timingType === 'later' && scheduledDate && scheduledTime) {
      scheduledPickupTime = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
    }

    try {
      if (isEditMode && initialTrip) {
        // Update existing trip
        const updates: Partial<Trip> = {
          pickupLocation: {
            ...initialTrip.pickupLocation,
            address: pickupAddress,
            coordinates: pickupCoordinates,
            notes: notesForAll || undefined,
          },
          dropoffLocation: {
            ...initialTrip.dropoffLocation,
            address: dropoffAddress,
            coordinates: dropoffCoordinates,
          },
          intermediateStops: intermediateStops.length > 0
            ? intermediateStops.map(s => ({ address: s.address, coordinates: s.coordinates }))
            : undefined,
          passenger: {
            ...initialTrip.passenger,
            firstName,
            lastName,
            phone,
            email,
            passengerCount: passengers,
            luggageCount: bags,
            specialRequests: carSeats ? 'Car Seats Required' : undefined,
          },
          vehicleTier: tier,
          bookingType: timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          driverNotes: notesForAll,
          assignedDriverId: driverId === 'unassigned' ? null : driverId,
          status: driverId !== 'unassigned' && initialTrip.status === 'pending' ? 'assigned' : initialTrip.status,
          pricing: {
            ...initialTrip.pricing,
            totalFare: finalFare,
            distanceMiles: estimatedDistanceMiles,
            durationMinutes: estimatedDurationMinutes,
          },
          payment: {
            ...initialTrip.payment,
            method,
            amount: finalFare,
          },
          metadata: {
            ...initialTrip.metadata,
            company,
            internalNotes,
            tariff,
            discount,
            returnTrip,
            repeat,
          },
        };

        let updatedTrip: Trip;
        if (service.updateTrip) {
          updatedTrip = await service.updateTrip(initialTrip.id, updates);
        } else {
          // Fallback if not directly implemented
          updatedTrip = { ...initialTrip, ...updates } as Trip;
        }

        onBookingSuccess?.(updatedTrip, true);
      } else {
        // Create new trip
        const payload: CreateTripInput = {
          bookingType: timingType === 'later' ? 'scheduled' : 'asap',
          scheduledPickupTime,
          pickupLocation: {
            address: pickupAddress,
            coordinates: pickupCoordinates,
            notes: notesForAll || undefined,
          },
          dropoffLocation: {
            address: dropoffAddress,
            coordinates: dropoffCoordinates,
          },
          intermediateStops: intermediateStops.length > 0
            ? intermediateStops.map(s => ({ address: s.address, coordinates: s.coordinates }))
            : undefined,
          passenger: {
            firstName,
            lastName,
            phone,
            email,
            passengerCount: passengers,
            luggageCount: bags,
            specialRequests: carSeats ? 'Car Seats Required' : undefined,
          },
          vehicleTier: tier,
          driverNotes: notesForAll,
          pricing: {
            baseFare: 5.0,
            distanceMiles: estimatedDistanceMiles,
            durationMinutes: estimatedDurationMinutes,
            distanceRate: 2.5,
            timeRate: 0.5,
            vehicleMultiplier: 1.0,
            surgeMultiplier: 1.0,
            discountAmount: 0,
            subtotal: finalFare,
            totalFare: finalFare,
            currency: 'USD',
          },
          payment: {
            method,
            status: 'pending',
            amount: finalFare,
          },
          metadata: {
            company,
            internalNotes,
            tariff,
            discount,
            returnTrip,
            repeat,
            createdByRole: 'dispatcher',
          },
        };

        const createdTrip = await service.createBooking(payload);

        // If driver was selected upon creation, assign it
        if (driverId !== 'unassigned' && service.updateTripStatus) {
          try {
            await service.updateTripStatus(createdTrip.id, 'assigned', {
              assignedDriverId: driverId,
              reason: `Directly assigned to ${driverId} by dispatcher`,
            });
          } catch {
            // ignore transition error
          }
        }

        try {
          localStorage.removeItem(draftStorageKey);
        } catch {
          // ignore
        }

        onBookingSuccess?.(createdTrip, false);
      }
    } catch (err: any) {
      console.error('[DispatchBookingEngine] Submit failed:', err);
      setSubmitError(err.message || 'Failed to submit booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayFare = isFareOverridden && manualFare
    ? `$${parseFloat(manualFare) || 0}`
    : estimatedFare > 0
    ? `~$${Math.round(estimatedFare)}`
    : '~$0';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full text-slate-800 text-xs">
      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {submitError && (
          <div className="p-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded font-medium">
            {submitError}
          </div>
        )}

        {/* ─── Timing Toggle & Date/Time ─── */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer shrink-0 select-none font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={timingType === 'later'}
              onChange={(e) => setTimingType(e.target.checked ? 'later' : 'asap')}
              className="sr-only"
            />
            <div className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${timingType === 'later' ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${timingType === 'later' ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
            <span>Later</span>
          </label>

          {timingType === 'later' ? (
            <div className="flex items-center gap-1 flex-1">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-1/2 px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="flex-1 px-3 py-1 bg-slate-100 border border-slate-200 rounded text-slate-500 text-center font-medium">
              ASAP (Immediate Ride)
            </div>
          )}
        </div>

        {/* ─── Route Section ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Route</label>
          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                title="Swap Pickup and Dropoff"
                onClick={handleSwapRoute}
                className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
              >
                ↕
              </button>
              <div className="flex-1 space-y-1.5">
                <DispatchLocationInput
                  placeholder="Pickup Location"
                  value={pickupAddress}
                  variant="pickup"
                  onChange={setPickupAddress}
                  onPlaceSelected={(p) => {
                    setPickupAddress(p.address);
                    setPickupCoordinates(p.coordinates);
                  }}
                  required
                />
                
                {intermediateStops.map((stop, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <DispatchLocationInput
                      placeholder={`Stop #${idx + 1}`}
                      value={stop.address}
                      variant="stop"
                      onChange={(val) => {
                        const updated = [...intermediateStops];
                        updated[idx].address = val;
                        setIntermediateStops(updated);
                      }}
                      onPlaceSelected={(p) => {
                        const updated = [...intermediateStops];
                        updated[idx] = { address: p.address, coordinates: p.coordinates };
                        setIntermediateStops(updated);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setIntermediateStops(intermediateStops.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-red-500 px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <DispatchLocationInput
                  placeholder="Dropoff Location"
                  value={dropoffAddress}
                  variant="dropoff"
                  onChange={setDropoffAddress}
                  onPlaceSelected={(p) => {
                    setDropoffAddress(p.address);
                    setDropoffCoordinates(p.coordinates);
                  }}
                  required
                />
              </div>
            </div>

            {/* Estimate & Add Stop */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-500 font-medium">
              <div>
                Estimate: <span className="font-bold text-slate-700">{estimatedDurationMinutes} min</span>,{' '}
                <span className="font-bold text-slate-700">{estimatedDistanceMiles} mi</span>
              </div>
              <button
                type="button"
                onClick={() => setIntermediateStops([...intermediateStops, { address: '' }])}
                className="text-blue-600 hover:text-blue-700 font-semibold"
              >
                + Add stop
              </button>
            </div>
          </div>
        </div>

        {/* ─── Passengers Section ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Passengers</label>
          <div className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-slate-400">👤</span>
              <input
                type="text"
                placeholder="Passenger Name"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                required
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">📞</span>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">✉️</span>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Trip Details (Pax, Bags, Car Seats) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Trip Details</label>
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span>👤</span>
                <span>Passengers</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPassengers(Math.max(1, passengers - 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{passengers}</span>
                <button
                  type="button"
                  onClick={() => setPassengers(Math.min(14, passengers + 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                <span>🧳</span>
                <span>Bags</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBags(Math.max(0, bags - 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  -
                </button>
                <span className="w-5 text-center font-bold">{bags}</span>
                <button
                  type="button"
                  onClick={() => setBags(Math.min(10, bags + 1))}
                  className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold flex items-center justify-center text-slate-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                <input
                  type="checkbox"
                  checked={carSeats}
                  onChange={(e) => setCarSeats(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-medium">Car Seats</span>
              </label>
            </div>
          </div>
        </div>

        {/* ─── Vehicles (Segmented) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Vehicles</label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/70 border border-slate-300 rounded-lg">
            {(['any', 'sedan', 'suv', 'van'] as const).map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setVehicle(v)}
                className={`py-1.5 text-center rounded font-semibold capitalize transition-all ${
                  vehicle === v
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Payment (Segmented) & Tariff / Discount ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Payment</label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 border border-slate-300 rounded-lg mb-2">
            {(['cash', 'card', 'account'] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setPaymentMethod(m)}
                className={`py-1.5 text-center rounded font-semibold capitalize transition-all ${
                  paymentMethod === m
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                {m === 'card' ? 'Credit Card' : m}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Tariff</span>
              <select
                value={tariff}
                onChange={(e) => setTariff(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="Standard">Standard</option>
                <option value="Flat Rate">Flat Rate</option>
                <option value="Hourly">Hourly</option>
                <option value="Corporate">Corporate</option>
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Discount</span>
              <select
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="None">None</option>
                <option value="5%">5% Off</option>
                <option value="10%">10% Off</option>
                <option value="15%">15% Off</option>
                <option value="20%">20% Off</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── Assignment (Company & Driver) ─── */}
        <div>
          <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">Assignment</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Company</span>
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                {DEFAULT_COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Driver</span>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500"
              >
                {DEFAULT_DRIVERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ─── Notes (All & Internal) ─── */}
        <div className="space-y-2">
          <div>
            <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Notes for All</label>
            <textarea
              rows={2}
              placeholder="e.g., Gate code is #1234, come to the side door..."
              value={notesForAll}
              onChange={(e) => setNotesForAll(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">
              Internal Notes (for dispatch only)
            </label>
            <textarea
              rows={2}
              placeholder="e.g., VIP client, handle with care..."
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded text-slate-800 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-4 text-slate-700">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={returnTrip}
                onChange={(e) => setReturnTrip(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Return Trip</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Repeat</span>
            </label>
          </div>
        </div>
      </div>

      {/* ─── Sticky Action Bar (Pinned Bottom) ─── */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-3 py-2 flex items-center justify-between shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-1.5">
          {isFareOverridden ? (
            <div className="flex items-center gap-1">
              <span className="font-bold text-blue-600">$</span>
              <input
                type="number"
                step="0.01"
                value={manualFare}
                onChange={(e) => setManualFare(e.target.value)}
                className="w-16 px-1.5 py-0.5 border border-blue-400 rounded text-blue-600 font-bold text-sm focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setIsFareOverridden(false);
                  setManualFare('');
                }}
                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
              >
                Auto
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsFareOverridden(true);
                setManualFare(estimatedFare.toFixed(2));
              }}
              title="Click to manually override fare"
              className="text-base font-extrabold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {displayFare}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1 disabled:opacity-50 transition-colors"
          >
            {isSubmitting && <SpinnerIcon className="w-3 h-3 animate-spin text-white" />}
            {isEditMode ? 'Save Changes' : 'Book'}
          </button>

          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100 text-slate-600 font-semibold text-xs transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </form>
  );
}
