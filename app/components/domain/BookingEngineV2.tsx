import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router';
import type { Trip } from '../../core/types';
import {
  getAdminConfigService,
  DEFAULT_CUSTOMER_BOOKING_CONFIG,
} from '../../core/services/config/admin-config.service';
import {
  DEFAULT_OVERSIZED_BAG_CATEGORIES,
  type AppSettings,
  type CustomerBookingConfig,
  type VehicleTierConfig,
  type OversizedBagCategory,
  type UniversalExtrasConfig,
} from '../../core/types/config';
import {
  getUniversalExtrasService,
  DEFAULT_UNIVERSAL_EXTRAS,
} from '../../core/services/pricing/extras.service';
import { getSurchargesService } from '../../core/services/pricing/surcharges.service';
import { COMPANY_CONFIG } from '../../config/companyConfig';
import type { FlightTelemetrySnapshot } from '../../core/types/flight';
import {
  CUSTOMER_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  formatUsPhone,
  formatTime12h,
  computeDefaultLeadDateTime,
  isVehicleChoiceSelected,
  buildCustomerActiveVehicleTiers,
  buildCustomerVehicleCapacities,
  resolveFriendlyVehicleName,
  computeCustomerFleetCapacity,
  findCapableCustomerTiers,
  computeTotalCarSeats,
  computeCarSeatsToggleState,
  countTotalOversizedBags,
  doesOversizedRequireUpgrade,
  formatOversizedItemsSummary,
  formatCustomExtrasSummary,
  useBookingWaypoints,
  swapRouteEndpoints,
  swapReturnRouteEndpoints,
  buildReturnLegSeedFromOutbound,
  checkSymmetricRoundTrip,
  appendVehicleChoice,
  removeVehicleChoiceAt,
  updateVehicleChoiceAt,
  useReturnTripBlankAddressSync,
  useBookingAirportDetection,
  useCustomerBookingSubmission,
  createInitialCustomerBookingFormState,
  buildBookAnotherCustomerResetState,
  type CorporatePortalBookingContext,
  type BookingEngineV2InitialValues,
  type CustomerBookingFormState,
  type SpecialRequestKey,
  type BookingVehicleChoice as CustomerVehicleChoice,
  type BookingWaypointItem as WaypointItem,
  type BookingAdditionalPassenger as AdditionalPassengerItem,
} from '../../core/hooks/booking';
import { BookingConfirmation } from './BookingConfirmation';
import { AlertTriangleIcon } from '../ui/Icons';
import {
  CustomerRouteTimingSection,
  CustomerVehicleExtrasSection,
  CustomerReturnTripSection,
  CustomerPassengerNotesSection,
  CustomerPaymentSection,
  CustomerTripSummaryCard,
  CustomerMobileSubmitBar,
} from './booking/sections';

export {
  COMMON_FBO_FACILITIES,
  formatUsPhone,
  formatTime12h,
  type SpecialRequestKey,
  type CustomerVehicleChoice,
  type WaypointItem,
  type AdditionalPassengerItem,
  type CorporatePortalBookingContext,
  type BookingEngineV2InitialValues,
};

export interface BookingEngineV2Props {
  className?: string;
  onBookingSuccess?: (trip: Trip) => void;
  onConfirmedChange?: (isConfirmed: boolean) => void;
  initialValues?: BookingEngineV2InitialValues;
  initialSettings?: Partial<AppSettings>;
  editingTripId?: string;
  onCancelEdit?: () => void;
  hideDispatchBanner?: boolean;
  embeddedInApp?: boolean;
  corporatePortalContext?: CorporatePortalBookingContext;
}

export function BookingEngineV2({
  className = '',
  onBookingSuccess,
  onConfirmedChange,
  initialValues,
  initialSettings,
  editingTripId,
  onCancelEdit,
  hideDispatchBanner = false,
  embeddedInApp = false,
  corporatePortalContext,
}: BookingEngineV2Props) {
  const location = useLocation();

  // Defer local-timezone default date/time computation to client mount so SSR (UTC)
  // and browser hydration always match without React Hydration Error #418.
  const [todayLocalDate, setTodayLocalDate] = useState<string>('');
  const [outboundFlightTelemetry, setOutboundFlightTelemetry] =
    useState<FlightTelemetrySnapshot | null>(null);
  const [returnFlightTelemetry, setReturnFlightTelemetry] =
    useState<FlightTelemetrySnapshot | null>(null);

  const [form, setForm] = useState<CustomerBookingFormState>(() =>
    createInitialCustomerBookingFormState(initialValues, corporatePortalContext)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [showChauffeurNotes, setShowChauffeurNotes] = useState(false);
  const [stripeOnlineEnabled, setStripeOnlineEnabled] = useState(false);
  const [stripePublishableKey, setStripePublishableKey] = useState<string>('');

  // Check if server-side Stripe online payments are active with a valid publishable key
  useEffect(() => {
    fetch('/api/payments')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const localPk =
          typeof window !== 'undefined' ? localStorage.getItem('ct_stripe_pk') || '' : '';
        const resolvedPk = data?.stripePublishableKey || localPk;
        if (data?.stripeConfigured && resolvedPk && resolvedPk.startsWith('pk_')) {
          setStripePublishableKey(resolvedPk);
          setStripeOnlineEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  // Customer Booking Form Config and Active Vehicle Classes from Admin Settings
  // Deterministic SSR + Hydration initialization: use only `initialSettings` or static defaults on
  // first render, then hydrate cached/live `localStorage` & Firestore settings inside `useEffect`.
  const [bookingConfig, setBookingConfig] = useState<CustomerBookingConfig>(() => {
    if (initialSettings?.customerBookingConfig) {
      return { ...DEFAULT_CUSTOMER_BOOKING_CONFIG, ...initialSettings.customerBookingConfig };
    }
    return DEFAULT_CUSTOMER_BOOKING_CONFIG;
  });

  const [companyConfig, setCompanyConfig] = useState(() => {
    if (initialSettings?.company) {
      return initialSettings.company;
    }
    return {
      name: COMPANY_CONFIG.name,
      phone: COMPANY_CONFIG.phone.dispatch,
      email: COMPANY_CONFIG.email.dispatch,
      address: COMPANY_CONFIG.address.formatted,
    };
  });

  const [vehicleTiers, setVehicleTiers] = useState<VehicleTierConfig[]>(() => {
    if (initialSettings?.vehicles && initialSettings.vehicles.length > 0) {
      return initialSettings.vehicles.filter((v) => !v.isArchived);
    }
    return [];
  });

  const [universalExtras, setUniversalExtras] = useState<UniversalExtrasConfig>(
    DEFAULT_UNIVERSAL_EXTRAS
  );
  const [surchargesVersion, setSurchargesVersion] = useState(0);

  useEffect(() => {
    try {
      setUniversalExtras(getUniversalExtrasService().getCached());
    } catch {}
    const unsubExtras = getUniversalExtrasService().subscribeToExtras((liveExtras) => {
      setUniversalExtras(liveExtras);
    });
    const unsubSurcharges = getSurchargesService().subscribeToSurcharges(() => {
      setSurchargesVersion((v) => v + 1);
    });
    return () => {
      if (typeof unsubExtras === 'function') unsubExtras();
      if (typeof unsubSurcharges === 'function') unsubSurcharges();
    };
  }, []);

  useEffect(() => {
    const configService = getAdminConfigService();
    const applySettings = (s: Partial<AppSettings>) => {
      if (s.customerBookingConfig) {
        setBookingConfig({ ...DEFAULT_CUSTOMER_BOOKING_CONFIG, ...s.customerBookingConfig });
      }
      if (s.company) {
        setCompanyConfig(s.company);
      }
      if (s.vehicles && s.vehicles.length > 0) {
        setVehicleTiers(s.vehicles.filter((v) => !v.isArchived));
      }
    };
    if (!initialSettings) {
      applySettings(configService.getCachedSettings());
    }
    const unsubscribe = configService.subscribeToSettings(applySettings);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [initialSettings]);

  const activeVehicleTiers: VehicleTierConfig[] = useMemo(
    () => buildCustomerActiveVehicleTiers(vehicleTiers),
    [vehicleTiers]
  );

  const vehicleCapacities = useMemo(
    () => buildCustomerVehicleCapacities(activeVehicleTiers),
    [activeVehicleTiers]
  );

  const getFriendlyVehicleName = useCallback(
    (choice: string): string =>
      resolveFriendlyVehicleName(choice, vehicleCapacities, activeVehicleTiers),
    [activeVehicleTiers, vehicleCapacities]
  );

  const { maxPassengers: totalMaxPassengers, maxBags: totalMaxBags } = useMemo(
    () =>
      computeCustomerFleetCapacity(
        bookingConfig.allowMultiVehicle,
        form.selectedVehicles,
        vehicleCapacities
      ),
    [bookingConfig.allowMultiVehicle, form.selectedVehicles, vehicleCapacities]
  );

  const { maxPassengers: returnTotalMaxPassengers, maxBags: returnTotalMaxBags } = useMemo(
    () =>
      computeCustomerFleetCapacity(
        bookingConfig.allowMultiVehicle,
        form.returnSelectedVehicles,
        vehicleCapacities
      ),
    [bookingConfig.allowMultiVehicle, form.returnSelectedVehicles, vehicleCapacities]
  );

  const totalCarSeats = computeTotalCarSeats(
    form.carSeats,
    form.rearFacingCount,
    form.frontFacingCount,
    form.boosterCount
  );
  const returnTotalCarSeats = computeTotalCarSeats(
    form.returnCarSeats,
    form.returnRearFacing,
    form.returnFrontFacing,
    form.returnBooster
  );

  const oversizedCategories: OversizedBagCategory[] = useMemo(() => {
    if (universalExtras.oversizedBagsConfig && universalExtras.oversizedBagsConfig.length > 0) {
      return universalExtras.oversizedBagsConfig;
    }
    return bookingConfig.oversizedBags && bookingConfig.oversizedBags.length > 0
      ? bookingConfig.oversizedBags
      : DEFAULT_OVERSIZED_BAG_CATEGORIES;
  }, [universalExtras.oversizedBagsConfig, bookingConfig.oversizedBags]);

  const bookableCustomExtras = useMemo(() => {
    return (universalExtras.customExtras || []).filter(
      (ce) => ce.isActive !== false && ce.showOnBookingForm !== false && ce.fee >= 0
    );
  }, [universalExtras.customExtras]);

  const selectedCustomExtrasSummary = useMemo(
    () => formatCustomExtrasSummary(form.selectedCustomExtras, bookableCustomExtras),
    [form.selectedCustomExtras, bookableCustomExtras]
  );

  const totalOversizedCount = useMemo(
    () => countTotalOversizedBags(form.oversizedBags),
    [form.oversizedBags]
  );

  const oversizedRequiresUpgrade = useMemo(
    () =>
      doesOversizedRequireUpgrade(
        form.hasOversizedLuggage,
        form.oversizedBags,
        oversizedCategories
      ),
    [form.hasOversizedLuggage, form.oversizedBags, oversizedCategories]
  );

  const oversizedItemsSummary = useMemo(
    () => formatOversizedItemsSummary(form.oversizedBags, oversizedCategories),
    [form.oversizedBags, oversizedCategories]
  );

  const returnTotalOversizedCount = useMemo(
    () => countTotalOversizedBags(form.returnOversizedBags),
    [form.returnOversizedBags]
  );

  const returnOversizedRequiresUpgrade = useMemo(
    () =>
      doesOversizedRequireUpgrade(
        form.returnHasOversizedLuggage,
        form.returnOversizedBags,
        oversizedCategories
      ),
    [form.returnHasOversizedLuggage, form.returnOversizedBags, oversizedCategories]
  );

  const returnOversizedItemsSummary = useMemo(
    () => formatOversizedItemsSummary(form.returnOversizedBags, oversizedCategories),
    [form.returnOversizedBags, oversizedCategories]
  );

  const returnSelectedCustomExtrasSummary = useMemo(
    () => formatCustomExtrasSummary(form.returnSelectedCustomExtras, bookableCustomExtras),
    [form.returnSelectedCustomExtras, bookableCustomExtras]
  );

  const isSymmetricRoundTrip = useMemo(
    () =>
      checkSymmetricRoundTrip({
        returnTrip: form.returnTrip,
        pickupAddress: form.pickupAddress,
        dropoffAddress: form.dropoffAddress,
        returnPickupAddress: form.returnPickupAddress,
        returnDropoffAddress: form.returnDropoffAddress,
        intermediateStops: form.intermediateStops,
        returnIntermediateStops: form.returnIntermediateStops,
        passengers: form.passengers,
        returnPassengers: form.returnPassengers,
        bags: form.bags,
        returnBags: form.returnBags,
        vehicleChoice: form.vehicleChoice,
        returnVehicleChoice: form.returnVehicleChoice,
        selectedVehicles: form.selectedVehicles,
        returnSelectedVehicles: form.returnSelectedVehicles,
        carSeats: form.carSeats,
        returnCarSeats: form.returnCarSeats,
        rearFacingCount: form.rearFacingCount,
        returnRearFacing: form.returnRearFacing,
        frontFacingCount: form.frontFacingCount,
        returnFrontFacing: form.returnFrontFacing,
        boosterCount: form.boosterCount,
        returnBooster: form.returnBooster,
        hasOversizedLuggage: form.hasOversizedLuggage,
        returnHasOversizedLuggage: form.returnHasOversizedLuggage,
        oversizedBags: form.oversizedBags,
        returnOversizedBags: form.returnOversizedBags,
        selectedCustomExtras: form.selectedCustomExtras,
        returnSelectedCustomExtras: form.returnSelectedCustomExtras,
        requireNonEmptyEndpoints: true,
        ignoreBlankStops: true,
      }),
    [
      form.returnTrip,
      form.pickupAddress,
      form.dropoffAddress,
      form.returnPickupAddress,
      form.returnDropoffAddress,
      form.intermediateStops,
      form.returnIntermediateStops,
      form.passengers,
      form.returnPassengers,
      form.bags,
      form.returnBags,
      form.vehicleChoice,
      form.returnVehicleChoice,
      form.selectedVehicles,
      form.returnSelectedVehicles,
      form.carSeats,
      form.returnCarSeats,
      form.rearFacingCount,
      form.returnRearFacing,
      form.frontFacingCount,
      form.returnFrontFacing,
      form.boosterCount,
      form.returnBooster,
      form.hasOversizedLuggage,
      form.returnHasOversizedLuggage,
      form.oversizedBags,
      form.returnOversizedBags,
      form.selectedCustomExtras,
      form.returnSelectedCustomExtras,
    ]
  );

  const { airportDetection, returnAirportDetection } = useBookingAirportDetection({
    pickupAddress: form.pickupAddress,
    dropoffAddress: form.dropoffAddress,
    returnPickupAddress: form.returnPickupAddress,
    returnDropoffAddress: form.returnDropoffAddress,
    returnTrip: form.returnTrip,
    clearWhenNoAirport: true,
    onSyncOutboundFlightInfo: (shouldEnable) => {
      setForm((prev) =>
        prev.provideFlightInfo === shouldEnable
          ? prev
          : { ...prev, provideFlightInfo: shouldEnable }
      );
    },
    onSyncReturnFlightInfo: (shouldEnable) => {
      setForm((prev) =>
        prev.returnProvideFlightInfo === shouldEnable
          ? prev
          : { ...prev, returnProvideFlightInfo: shouldEnable }
      );
    },
  });

  const {
    quote,
    setQuote,
    isQuoteLoading,
    quoteError,
    returnQuote,
    setReturnQuote,
    isReturnQuoteLoading,
    isSubmitting,
    submitError,
    confirmedTrip,
    setConfirmedTrip,
    emailDelivery,
    handleBookRide,
  } = useCustomerBookingSubmission({
    form,
    bookingConfig,
    companyConfig,
    activeVehicleTiers,
    vehicleCapacities,
    totalMaxPassengers,
    totalMaxBags,
    returnTotalMaxPassengers,
    returnTotalMaxBags,
    totalCarSeats,
    returnTotalCarSeats,
    oversizedItemsSummary,
    returnOversizedItemsSummary,
    selectedCustomExtrasSummary,
    returnSelectedCustomExtrasSummary,
    isSymmetricRoundTrip,
    airportDetection,
    returnAirportDetection,
    outboundFlightTelemetry,
    returnFlightTelemetry,
    stripeOnlineEnabled,
    surchargesVersion,
    editingTripId,
    corporatePortalContext,
    onBookingSuccess,
    setErrors,
  });

  // Reset confirmedTrip when user navigates or re-clicks Book Now
  useEffect(() => {
    setConfirmedTrip(null);
  }, [location.key, setConfirmedTrip]);

  // Notify parent of confirmedTrip changes
  useEffect(() => {
    onConfirmedChange?.(Boolean(confirmedTrip));
  }, [confirmedTrip, onConfirmedChange]);

  // Listen for navbar/custom 'reset-booking-form' event
  useEffect(() => {
    const handleReset = () => {
      setConfirmedTrip(null);
      setForm((prev) => ({
        ...prev,
        pickupAddress: '',
        dropoffAddress: '',
        intermediateStops: [],
        returnTrip: false,
        driverNotes: '',
        gateCode: '',
      }));
      setQuote(null);
      setReturnQuote(null);
    };
    window.addEventListener('reset-booking-form', handleReset);
    return () => window.removeEventListener('reset-booking-form', handleReset);
  }, [setConfirmedTrip, setQuote, setReturnQuote]);

  // Pre-fill from URL Search Parameters
  useEffect(() => {
    if (!location.search) return;
    try {
      const params = new URLSearchParams(location.search);
      const pickupParam = params.get('pickup');
      const dropoffParam = params.get('dropoff');
      const notesParam = params.get('notes');
      const vehicleParam = params.get('vehicle') as CustomerVehicleChoice | null;
      const passengersParam = params.get('passengers');
      const timingParam = params.get('timing');
      const pickupLat = params.get('pickupLat');
      const pickupLng = params.get('pickupLng');
      const dropoffLat = params.get('dropoffLat');
      const dropoffLng = params.get('dropoffLng');

      if (
        pickupParam ||
        dropoffParam ||
        notesParam ||
        vehicleParam ||
        passengersParam ||
        timingParam
      ) {
        setForm((prev) => ({
          ...prev,
          timingType:
            timingParam === 'asap' || timingParam === 'later' ? timingParam : prev.timingType,
          pickupAddress: pickupParam !== null ? pickupParam : prev.pickupAddress,
          pickupCoordinates:
            pickupLat && pickupLng
              ? { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) }
              : prev.pickupCoordinates,
          dropoffAddress: dropoffParam !== null ? dropoffParam : prev.dropoffAddress,
          dropoffCoordinates:
            dropoffLat && dropoffLng
              ? { lat: parseFloat(dropoffLat), lng: parseFloat(dropoffLng) }
              : prev.dropoffCoordinates,
          driverNotes: notesParam !== null ? notesParam : prev.driverNotes,
          vehicleChoice:
            vehicleParam && ['any', 'sedan', 'suv', 'van'].includes(vehicleParam)
              ? vehicleParam
              : prev.vehicleChoice,
          selectedVehicles:
            vehicleParam && ['any', 'sedan', 'suv', 'van'].includes(vehicleParam)
              ? [vehicleParam]
              : prev.selectedVehicles,
          passengers: passengersParam
            ? Math.max(1, parseInt(passengersParam, 10) || 1)
            : prev.passengers,
        }));
      }
    } catch (err) {
      console.warn('[BookingEngineV2] Error parsing search params:', err);
    }
  }, [location.search]);

  // Pre-fill from initialValues prop
  useEffect(() => {
    if (!initialValues && !editingTripId) return;
    setConfirmedTrip(null);
    if (!initialValues) return;
    setForm((prev) => ({
      ...prev,
      ...(initialValues.pickupAddress !== undefined && initialValues.pickupAddress !== ''
        ? { pickupAddress: initialValues.pickupAddress }
        : {}),
      ...(initialValues.pickupCoordinates
        ? { pickupCoordinates: initialValues.pickupCoordinates }
        : {}),
      ...(initialValues.dropoffAddress !== undefined && initialValues.dropoffAddress !== ''
        ? { dropoffAddress: initialValues.dropoffAddress }
        : {}),
      ...(initialValues.dropoffCoordinates
        ? { dropoffCoordinates: initialValues.dropoffCoordinates }
        : {}),
      ...(initialValues.driverNotes !== undefined && initialValues.driverNotes !== ''
        ? { driverNotes: initialValues.driverNotes }
        : {}),
      ...(initialValues.vehicleChoice
        ? {
            vehicleChoice: initialValues.vehicleChoice,
            selectedVehicles: [initialValues.vehicleChoice],
          }
        : {}),
      ...(initialValues.passengers ? { passengers: initialValues.passengers } : {}),
      ...(initialValues.timingType ? { timingType: initialValues.timingType } : {}),
      ...(initialValues.scheduledDate ? { scheduledDate: initialValues.scheduledDate } : {}),
      ...(initialValues.scheduledTime ? { scheduledTime: initialValues.scheduledTime } : {}),
      ...(initialValues.passengerName !== undefined
        ? { passengerName: initialValues.passengerName }
        : {}),
      ...(initialValues.passengerPhone !== undefined
        ? { passengerPhone: initialValues.passengerPhone }
        : {}),
      ...(initialValues.passengerEmail !== undefined
        ? { passengerEmail: initialValues.passengerEmail }
        : {}),
      ...(initialValues.paymentMethod ? { paymentMethod: initialValues.paymentMethod } : {}),
      ...(initialValues.corporateOrgName !== undefined
        ? { corporateOrgName: initialValues.corporateOrgName }
        : {}),
      ...(initialValues.corporateAccountNumber !== undefined
        ? { corporateAccountNumber: initialValues.corporateAccountNumber }
        : {}),
      ...(initialValues.billingPo !== undefined ? { billingPo: initialValues.billingPo } : {}),
      ...(initialValues.authorizedBy !== undefined
        ? { authorizedBy: initialValues.authorizedBy }
        : {}),
      ...(initialValues.costCenter !== undefined ? { costCenter: initialValues.costCenter } : {}),
      ...(initialValues.isBookerDifferent !== undefined
        ? { isBookerDifferent: initialValues.isBookerDifferent }
        : {}),
      ...(initialValues.contactName !== undefined
        ? { contactName: initialValues.contactName }
        : {}),
      ...(initialValues.contactPhone !== undefined
        ? { contactPhone: initialValues.contactPhone }
        : {}),
      ...(initialValues.contactEmail !== undefined
        ? { contactEmail: initialValues.contactEmail }
        : {}),
      ...(initialValues.contactRole !== undefined
        ? { contactRole: initialValues.contactRole }
        : {}),
    }));
  }, [initialValues, editingTripId, setConfirmedTrip]);

  // Sync pre-bound Corporate Portal billing fields
  useEffect(() => {
    if (!corporatePortalContext) return;
    setForm((prev) => ({
      ...prev,
      paymentMethod: 'account',
      corporateOrgName: corporatePortalContext.companyName,
      corporateAccountNumber: corporatePortalContext.accountNumber,
      billingPo: corporatePortalContext.currentPoNumber || prev.billingPo,
      authorizedBy:
        corporatePortalContext.bookerName ||
        corporatePortalContext.bookerEmail ||
        prev.authorizedBy,
      costCenter:
        corporatePortalContext.costCenter !== undefined
          ? corporatePortalContext.costCenter
          : prev.costCenter,
      invoicingTerms: corporatePortalContext.billingCycle
        ? `${corporatePortalContext.billingCycle.toUpperCase()} Direct Bill`
        : prev.invoicingTerms,
    }));
  }, [corporatePortalContext]);

  // Populate client-local default date & time (+45 min rounded up to next 5-min step) after hydration
  useEffect(() => {
    const { todayLocalDate: todayStr, defaultDate, defaultTime } = computeDefaultLeadDateTime();
    setTodayLocalDate(todayStr);

    setForm((prev) => ({
      ...prev,
      scheduledDate: prev.scheduledDate || defaultDate,
      scheduledTime: prev.scheduledTime || defaultTime,
      returnDate: prev.returnDate || defaultDate,
      returnTime: prev.returnTime || defaultTime,
    }));
  }, []);

  // Enforce customer vehicle auto-selection and capacity restrictions (single-vehicle mode)
  useEffect(() => {
    if (!bookingConfig.allowMultiVehicle && activeVehicleTiers.length > 0) {
      const totalLuggage = form.carryOnBags + form.checkedBags;
      const requiresUpgradedVehicle = totalCarSeats > 0 || oversizedRequiresUpgrade;

      const capableTiers = findCapableCustomerTiers({
        activeVehicleTiers,
        passengers: form.passengers,
        totalLuggage,
        requiresUpgradedVehicle,
      });

      const bestTier = capableTiers[0] || activeVehicleTiers[0];
      const minVehicle = (bestTier?.id || 'any') as CustomerVehicleChoice;

      const currentCap = vehicleCapacities[form.vehicleChoice] || { maxPassengers: 4, maxBags: 3 };
      const hasCarSeatConstraint =
        requiresUpgradedVehicle &&
        (form.vehicleChoice === 'sedan' || form.vehicleChoice === 'standard');
      const canFitCurrent =
        form.passengers <= currentCap.maxPassengers &&
        totalLuggage <= currentCap.maxBags &&
        !hasCarSeatConstraint;

      if (!canFitCurrent) {
        setForm((prev) => ({
          ...prev,
          vehicleChoice: minVehicle,
          selectedVehicles: [minVehicle],
          isVehicleAutoAssigned: true,
        }));
      } else if (
        form.isVehicleAutoAssigned &&
        form.vehicleChoice !== minVehicle &&
        form.vehicleChoice !== 'any'
      ) {
        setForm((prev) => ({
          ...prev,
          vehicleChoice: minVehicle,
          selectedVehicles: [minVehicle],
        }));
      }
    }
  }, [
    bookingConfig.allowMultiVehicle,
    form.passengers,
    form.carryOnBags,
    form.checkedBags,
    form.isVehicleAutoAssigned,
    form.vehicleChoice,
    totalCarSeats,
    returnTotalCarSeats,
    oversizedRequiresUpgrade,
    vehicleCapacities,
    activeVehicleTiers,
  ]);

  // Ensure selected payment method is allowed by admin configuration
  useEffect(() => {
    if (
      bookingConfig.acceptedPaymentMethods &&
      bookingConfig.acceptedPaymentMethods.length > 0 &&
      !bookingConfig.acceptedPaymentMethods.includes(form.paymentMethod)
    ) {
      setForm((prev) => ({
        ...prev,
        paymentMethod: bookingConfig.acceptedPaymentMethods[0] as CustomerBookingFormState['paymentMethod'],
      }));
    }
  }, [bookingConfig.acceptedPaymentMethods, form.paymentMethod]);

  // Auto-upgrade return vehicle tier if return passengers, bags, car seats, or oversized cargo exceed capacity
  useEffect(() => {
    if (!form.returnTrip || bookingConfig.allowMultiVehicle || activeVehicleTiers.length === 0) {
      return;
    }
    const retLuggage = form.returnCarryOnBags + form.returnCheckedBags;
    const requiresUpgradedReturn = returnTotalCarSeats > 0 || returnOversizedRequiresUpgrade;

    const currentTier = activeVehicleTiers.find((t) =>
      isVehicleChoiceSelected(form.returnVehicleChoice, t.id, 'xl')
    );

    const isCurrentInvalid =
      !currentTier ||
      form.returnPassengers > currentTier.maxPassengers ||
      retLuggage > currentTier.maxLuggage ||
      (requiresUpgradedReturn &&
        (currentTier.id === 'sedan' ||
          currentTier.id === 'standard' ||
          currentTier.id === 'any' ||
          currentTier.maxPassengers <= 4));

    if (isCurrentInvalid) {
      const capableReturnTiers = findCapableCustomerTiers({
        activeVehicleTiers,
        passengers: form.returnPassengers,
        totalLuggage: retLuggage,
        requiresUpgradedVehicle: requiresUpgradedReturn,
      });

      if (capableReturnTiers.length > 0 && capableReturnTiers[0].id !== form.returnVehicleChoice) {
        setForm((prev) => ({
          ...prev,
          returnVehicleChoice: capableReturnTiers[0].id as CustomerVehicleChoice,
          returnSelectedVehicles: [capableReturnTiers[0].id as CustomerVehicleChoice],
        }));
      }
    }
  }, [
    form.returnTrip,
    form.returnPassengers,
    form.returnCarryOnBags,
    form.returnCheckedBags,
    form.returnVehicleChoice,
    returnTotalCarSeats,
    returnOversizedRequiresUpgrade,
    bookingConfig.allowMultiVehicle,
    activeVehicleTiers,
  ]);

  useReturnTripBlankAddressSync({
    returnTrip: form.returnTrip,
    pickupAddress: form.pickupAddress,
    pickupCoordinates: form.pickupCoordinates,
    dropoffAddress: form.dropoffAddress,
    dropoffCoordinates: form.dropoffCoordinates,
    returnPickupAddress: form.returnPickupAddress,
    returnDropoffAddress: form.returnDropoffAddress,
    onSeedBlankAddresses: () => {
      setForm((prev) => ({
        ...prev,
        returnPickupAddress: prev.returnPickupAddress || prev.dropoffAddress,
        returnPickupCoordinates: prev.returnPickupCoordinates || prev.dropoffCoordinates,
        returnDropoffAddress: prev.returnDropoffAddress || prev.pickupAddress,
        returnDropoffCoordinates: prev.returnDropoffCoordinates || prev.pickupCoordinates,
      }));
    },
  });

  const outboundWaypoints = useBookingWaypoints<WaypointItem>({
    stops: form.intermediateStops,
    onChange: (updater) =>
      setForm((prev) => ({ ...prev, intermediateStops: updater(prev.intermediateStops) })),
    maxStops: 5,
    idPrefix: 'stop',
  });

  const returnWaypoints = useBookingWaypoints({
    stops: form.returnIntermediateStops,
    onChange: (updater) =>
      setForm((prev) => ({
        ...prev,
        returnIntermediateStops: updater(prev.returnIntermediateStops),
      })),
    maxStops: 5,
    idPrefix: 'ret-stop',
  });

  const handleAddReturnVehicle = () => {
    const maxAllowed = bookingConfig.maxVehiclesAllowed || 3;
    setForm((prev) => ({
      ...prev,
      returnSelectedVehicles: appendVehicleChoice(prev.returnSelectedVehicles, 'sedan', maxAllowed),
    }));
  };

  const handleRemoveReturnVehicle = (index: number) => {
    if (form.returnSelectedVehicles.length <= 1) return;
    setForm((prev) => {
      const updated = removeVehicleChoiceAt(prev.returnSelectedVehicles, index);
      return {
        ...prev,
        returnSelectedVehicles: updated,
        returnVehicleChoice: updated[0] || 'sedan',
      };
    });
  };

  const handleUpdateReturnVehicleChoice = (index: number, choice: CustomerVehicleChoice) => {
    setForm((prev) => {
      const updated =
        updateVehicleChoiceAt(prev.returnSelectedVehicles, index, choice) ||
        prev.returnSelectedVehicles;
      return {
        ...prev,
        returnSelectedVehicles: updated,
        returnVehicleChoice: updated[0] || choice,
      };
    });
  };

  const handleToggleReturnCarSeats = (checked: boolean) => {
    setForm((prev) => {
      const next = computeCarSeatsToggleState(checked, {
        rearFacing: prev.returnRearFacing,
        frontFacing: prev.returnFrontFacing,
        booster: prev.returnBooster,
      });
      return {
        ...prev,
        returnCarSeats: next.enabled,
        returnRearFacing: next.rearFacing,
        returnFrontFacing: next.frontFacing,
        returnBooster: next.booster,
      };
    });
  };

  const handleToggleReturnTrip = () => {
    setForm((prev) => {
      const nextEnabled = !prev.returnTrip;
      if (!nextEnabled) {
        return { ...prev, returnTrip: false };
      }
      return {
        ...prev,
        returnTrip: true,
        ...buildReturnLegSeedFromOutbound(prev, prev),
      };
    });
  };

  const handleToggleCarSeats = (checked: boolean) => {
    setForm((prev) => {
      const next = computeCarSeatsToggleState(checked, {
        rearFacing: prev.rearFacingCount,
        frontFacing: prev.frontFacingCount,
        booster: prev.boosterCount,
      });
      return {
        ...prev,
        carSeats: next.enabled,
        rearFacingCount: next.rearFacing,
        frontFacingCount: next.frontFacing,
        boosterCount: next.booster,
      };
    });
  };

  const handleAddVehicle = () => {
    const maxAllowed = bookingConfig.maxVehiclesAllowed || 3;
    setForm((prev) => ({
      ...prev,
      selectedVehicles: appendVehicleChoice(prev.selectedVehicles, 'sedan', maxAllowed),
    }));
  };

  const handleRemoveVehicle = (index: number) => {
    if (form.selectedVehicles.length <= 1) return;
    setForm((prev) => {
      const updated = removeVehicleChoiceAt(prev.selectedVehicles, index);
      return {
        ...prev,
        selectedVehicles: updated,
        vehicleChoice: updated[0] || 'sedan',
      };
    });
  };

  const handleUpdateVehicleChoice = (index: number, choice: CustomerVehicleChoice) => {
    setForm((prev) => {
      const updated =
        updateVehicleChoiceAt(prev.selectedVehicles, index, choice) || prev.selectedVehicles;
      return {
        ...prev,
        selectedVehicles: updated,
        vehicleChoice: updated[0] || choice,
        isVehicleAutoAssigned: false,
      };
    });
  };

  const handleSwapRoute = () => {
    setForm((prev) => ({
      ...prev,
      ...swapRouteEndpoints(prev),
    }));
  };

  const handleSwapReturnRoute = () => {
    setForm((prev) => {
      const swapped = swapReturnRouteEndpoints({
        returnPickupAddress: prev.returnPickupAddress,
        returnPickupCoordinates: prev.returnPickupCoordinates,
        returnDropoffAddress: prev.returnDropoffAddress,
        returnDropoffCoordinates: prev.returnDropoffCoordinates,
        returnIntermediateStops: prev.returnIntermediateStops,
        reverseStops: true,
      });
      return {
        ...prev,
        returnPickupAddress: swapped.returnPickupAddress,
        returnPickupCoordinates: swapped.returnPickupCoordinates,
        returnDropoffAddress: swapped.returnDropoffAddress,
        returnDropoffCoordinates: swapped.returnDropoffCoordinates,
        returnIntermediateStops: swapped.returnIntermediateStops || [],
      };
    });
  };

  const handleAddPassenger = () => {
    if (form.additionalPassengers.length >= 6) return;
    setForm((prev) => ({
      ...prev,
      additionalPassengers: [...prev.additionalPassengers, { name: '', phone: '' }],
    }));
  };

  const handleRemovePassenger = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      additionalPassengers: prev.additionalPassengers.filter((_, i) => i !== idx),
    }));
  };

  const handleToggleSpecialRequest = (key: SpecialRequestKey) => {
    setForm((prev) => ({
      ...prev,
      specialRequests: {
        ...prev.specialRequests,
        [key]: !prev.specialRequests[key],
      },
    }));
  };

  if (confirmedTrip) {
    return (
      <div className="max-w-3xl mx-auto py-6">
        <BookingConfirmation
          trip={confirmedTrip}
          emailDelivery={emailDelivery}
          onBookAnother={() => {
            setConfirmedTrip(null);
            setForm(buildBookAnotherCustomerResetState);
            setQuote(null);
            setReturnQuote(null);
            setOutboundFlightTelemetry(null);
            setReturnFlightTelemetry(null);
          }}
        />
      </div>
    );
  }

  const activeOutboundPricing =
    (!bookingConfig.allowMultiVehicle && quote?.vehicleQuotes?.[form.vehicleChoice]) ||
    quote?.pricing ||
    null;

  const activeReturnPricing =
    (!bookingConfig.allowMultiVehicle && returnQuote?.vehicleQuotes?.[form.returnVehicleChoice]) ||
    returnQuote?.pricing ||
    null;

  const outboundRawFare = activeOutboundPricing?.totalFare ?? null;
  const returnRawFare = activeReturnPricing?.totalFare ?? null;

  let outboundFare: number | null = outboundRawFare !== null ? Math.ceil(outboundRawFare) : null;
  let returnFare: number | null = returnRawFare !== null ? Math.ceil(returnRawFare) : null;

  if (form.returnTrip && isSymmetricRoundTrip && outboundFare !== null && returnFare !== null) {
    const balancedLegFare = Math.max(outboundFare, returnFare);
    outboundFare = balancedLegFare;
    returnFare = balancedLegFare;
  }

  const totalDisplayFare =
    outboundFare !== null
      ? form.returnTrip && returnFare !== null
        ? outboundFare + returnFare
        : outboundFare
      : null;

  const estimateTierDisplayFare = (tier: VehicleTierConfig): number | null => {
    const exactTierQuote = quote?.vehicleQuotes?.[tier.id];
    if (exactTierQuote && typeof exactTierQuote.totalFare === 'number') {
      return Math.ceil(exactTierQuote.totalFare);
    }
    return null;
  };

  const estimateReturnTierDisplayFare = (tier: VehicleTierConfig): number | null => {
    const exactTierQuote = returnQuote?.vehicleQuotes?.[tier.id];
    if (exactTierQuote && typeof exactTierQuote.totalFare === 'number') {
      return Math.ceil(exactTierQuote.totalFare);
    }
    return null;
  };

  const validationErrorCount = Object.keys(errors).length;

  const handleOpenBreakdownFromMobile = () => {
    setShowPriceBreakdown(true);
    setTimeout(() => {
      const el =
        document.getElementById('trip-price-breakdown') ||
        document.getElementById('trip-summary-card');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  return (
    <div className={`relative max-w-6xl mx-auto ${className}`}>
      <form onSubmit={handleBookRide} noValidate>
        {/* Invisible Honeypot Anti-Bot Trap */}
        <div
          style={{ display: 'none', position: 'absolute', left: '-9999px', opacity: 0 }}
          aria-hidden="true"
          tabIndex={-1}
        >
          <label htmlFor="hp_company_sec_field">Leave this field blank</label>
          <input
            id="hp_company_sec_field"
            type="text"
            name="hp_company_sec_field"
            value={form.botTrapField || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, botTrapField: e.target.value }))}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Optional Live Dispatch Banner (honors hideDispatchBanner) */}
        {!hideDispatchBanner && (
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xs text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-bold tracking-wide">24/7 Live Chesterfield Dispatch</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-300">
                <span>No Surprise Surge</span>
                <span className="hidden sm:inline text-slate-600">&bull;</span>
                <span className="hidden sm:inline">Live STL Flight Tracking</span>
                <span className="hidden sm:inline text-slate-600">&bull;</span>
                <span className="hidden md:inline">Free Cancellation (2h+)</span>
              </div>
            </div>
          </div>
        )}

        {/* Grid: Left Main Stack (Col 8), Right Sticky Summary (Col 4) */}
        <div
          className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-6 items-start ${
            embeddedInApp ? 'pb-36 md:pb-24' : 'pb-24 lg:pb-8'
          }`}
        >
          {/* Left Column: Reordered 4-Section Single-Page Progression */}
          <div className="lg:col-span-8 space-y-3 sm:space-y-4">
            {editingTripId && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs font-semibold flex items-center justify-between gap-2">
                <span>Editing Existing Reservation #{editingTripId}</span>
                {onCancelEdit && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            )}
            {submitError && (
              <div
                role="alert"
                className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-2"
              >
                <AlertTriangleIcon className="w-4 h-4 text-red-600 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <CustomerRouteTimingSection
              form={form}
              setForm={setForm}
              errors={errors}
              setErrors={setErrors}
              bookingConfig={bookingConfig}
              todayLocalDate={todayLocalDate}
              quote={quote}
              isQuoteLoading={isQuoteLoading}
              quoteError={quoteError}
              airportDetection={airportDetection}
              outboundFlightTelemetry={outboundFlightTelemetry}
              setOutboundFlightTelemetry={setOutboundFlightTelemetry}
              onSwapRoute={handleSwapRoute}
              onAddStop={outboundWaypoints.addStop}
              onUpdateStop={outboundWaypoints.updateStopById}
              onRemoveStop={outboundWaypoints.removeStopById}
            />

            <CustomerVehicleExtrasSection
              form={form}
              setForm={setForm}
              errors={errors}
              bookingConfig={bookingConfig}
              activeVehicleTiers={activeVehicleTiers}
              oversizedCategories={oversizedCategories}
              bookableCustomExtras={bookableCustomExtras}
              totalMaxPassengers={totalMaxPassengers}
              totalMaxBags={totalMaxBags}
              totalCarSeats={totalCarSeats}
              totalOversizedCount={totalOversizedCount}
              oversizedRequiresUpgrade={oversizedRequiresUpgrade}
              onToggleCarSeats={handleToggleCarSeats}
              onAddVehicle={handleAddVehicle}
              onRemoveVehicle={handleRemoveVehicle}
              onUpdateVehicleChoice={handleUpdateVehicleChoice}
              estimateTierDisplayFare={estimateTierDisplayFare}
            />

            <CustomerReturnTripSection
              form={form}
              setForm={setForm}
              errors={errors}
              setErrors={setErrors}
              bookingConfig={bookingConfig}
              todayLocalDate={todayLocalDate}
              activeVehicleTiers={activeVehicleTiers}
              oversizedCategories={oversizedCategories}
              bookableCustomExtras={bookableCustomExtras}
              returnTotalMaxPassengers={returnTotalMaxPassengers}
              returnTotalMaxBags={returnTotalMaxBags}
              returnTotalCarSeats={returnTotalCarSeats}
              returnTotalOversizedCount={returnTotalOversizedCount}
              returnOversizedRequiresUpgrade={returnOversizedRequiresUpgrade}
              returnAirportDetection={returnAirportDetection}
              returnFlightTelemetry={returnFlightTelemetry}
              setReturnFlightTelemetry={setReturnFlightTelemetry}
              returnQuote={returnQuote}
              isReturnQuoteLoading={isReturnQuoteLoading}
              returnFare={returnFare}
              onToggleReturnTrip={handleToggleReturnTrip}
              onSwapReturnRoute={handleSwapReturnRoute}
              onAddReturnStop={returnWaypoints.addStop}
              onUpdateReturnStop={returnWaypoints.updateStopAt}
              onRemoveReturnStop={returnWaypoints.removeStopAt}
              onToggleReturnCarSeats={handleToggleReturnCarSeats}
              onAddReturnVehicle={handleAddReturnVehicle}
              onRemoveReturnVehicle={handleRemoveReturnVehicle}
              onUpdateReturnVehicleChoice={handleUpdateReturnVehicleChoice}
              estimateReturnTierDisplayFare={estimateReturnTierDisplayFare}
            />

            <CustomerPassengerNotesSection
              form={form}
              setForm={setForm}
              errors={errors}
              setErrors={setErrors}
              showChauffeurNotes={showChauffeurNotes}
              setShowChauffeurNotes={setShowChauffeurNotes}
              onAddPassenger={handleAddPassenger}
              onRemovePassenger={handleRemovePassenger}
              onToggleSpecialRequest={handleToggleSpecialRequest}
            />

            <CustomerPaymentSection
              form={form}
              setForm={setForm}
              errors={errors}
              setErrors={setErrors}
              bookingConfig={bookingConfig}
              stripeOnlineEnabled={stripeOnlineEnabled}
              stripePublishableKey={stripePublishableKey}
              totalDisplayFare={totalDisplayFare}
              corporatePortalContext={corporatePortalContext}
            />
          </div>

          {/* Right Column: Sticky Summary & Estimated Fare Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <CustomerTripSummaryCard
              form={form}
              setForm={setForm}
              bookingConfig={bookingConfig}
              editingTripId={editingTripId}
              quote={quote}
              isQuoteLoading={isQuoteLoading}
              activeOutboundPricing={activeOutboundPricing}
              activeReturnPricing={activeReturnPricing}
              outboundFare={outboundFare}
              returnFare={returnFare}
              totalDisplayFare={totalDisplayFare}
              showPriceBreakdown={showPriceBreakdown}
              setShowPriceBreakdown={setShowPriceBreakdown}
              totalCarSeats={totalCarSeats}
              returnTotalCarSeats={returnTotalCarSeats}
              totalOversizedCount={totalOversizedCount}
              returnTotalOversizedCount={returnTotalOversizedCount}
              oversizedItemsSummary={oversizedItemsSummary}
              returnOversizedItemsSummary={returnOversizedItemsSummary}
              validationErrorCount={validationErrorCount}
              isSubmitting={isSubmitting}
              getFriendlyVehicleName={getFriendlyVehicleName}
            />
          </div>
        </div>

        <CustomerMobileSubmitBar
          embeddedInApp={embeddedInApp}
          returnTrip={form.returnTrip}
          totalDisplayFare={totalDisplayFare}
          isQuoteLoading={isQuoteLoading}
          isSubmitting={isSubmitting}
          editingTripId={editingTripId}
          onOpenBreakdownFromMobile={handleOpenBreakdownFromMobile}
        />
      </form>
    </div>
  );
}
