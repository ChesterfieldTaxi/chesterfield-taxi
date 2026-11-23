import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { GeoPoint } from '../../../core/types';
import {
  DEFAULT_OVERSIZED_BAG_CATEGORIES,
  type NamedPricingRule,
  type CorporateAccountConfig,
  type VehicleTierConfig,
  type UniversalExtrasConfig,
} from '../../../core/types/config';
import { getPricingRulesService } from '../../../core/services/pricing';
import {
  DEFAULT_UNIVERSAL_EXTRAS,
  getUniversalExtrasService,
  getUniversalExtrasConfig,
} from '../../../core/services/pricing/extras.service';
import { getSurchargesService } from '../../../core/services/pricing/surcharges.service';
import { formatLocalDateStr } from '../../../core/services/pricing/vehicle-matching';
import { getAdminConfigService } from '../../../core/services/config/admin-config.service';
import { COMPANY_CONFIG } from '../../../config/companyConfig';
import type { FlightTelemetrySnapshot } from '../../../core/types/flight';
import { getOperatorService, type DriverRosterItem } from '../../../core/services/operator.service';
import {
  DISPATCH_FBO_FACILITIES as COMMON_FBO_FACILITIES,
  DEFAULT_DISPATCH_COMPANIES as DEFAULT_COMPANIES,
  DEFAULT_CORPORATE_ACCOUNTS,
  buildDispatchVehicleOptions,
  buildDispatchVehicleCapacities,
  sumSelectedVehicleCapacities,
  computeTotalCarSeats,
  computeCarSeatsToggleState,
  countTotalOversizedBags,
  cleanOversizedBagsPayload,
  formatOversizedItemsSummary,
  useBookingWaypoints,
  swapRouteEndpoints,
  swapReturnRouteEndpoints,
  buildReturnLegSeedFromOutbound,
  checkSymmetricRoundTrip,
  computeDispatchRoundTripFares,
  appendVehicleChoice,
  removeVehicleChoiceAt,
  updateVehicleChoiceAt,
  useBookingAirportDetection,
  findMatchingCorporateAccount,
  resolveEffectiveDiscountInputs,
  useCorporatePoVerification,
  type BookingAdditionalPassenger as AdditionalPassenger,
  type CarSeatsBreakdown,
  type BookingVehicleChoice as VehicleChoice,
} from '../../../core/hooks/booking';
import {
  useDispatchBookingSubmission,
  useDispatchDraftSync,
  DispatchConvoyBanners,
  DispatchRoutingTimingSection,
  DispatchPassengerCrmSection,
  DispatchExtrasVehicleSection,
  DispatchPaymentAssignmentSection,
  DispatchReturnRepeatSection,
  DispatchBookingFooterBar,
  DispatchInlineConflictBanner,
  DispatchBookingConflictModal,
  type ContactPersonDetails,
  type CardDetails,
  type CorporateAccountDetails,
  type ReturnTripDetails,
  type RepeatTripDetails,
  type DispatchFormValues,
  type DispatchBookingEngineProps,
} from './booking';

export {
  COMMON_FBO_FACILITIES,
  type AdditionalPassenger,
  type CarSeatsBreakdown,
  type VehicleChoice,
  type ContactPersonDetails,
  type CardDetails,
  type CorporateAccountDetails,
  type ReturnTripDetails,
  type RepeatTripDetails,
  type DispatchFormValues,
  type DispatchBookingEngineProps,
};

function DispatchBookingEngineComponent({
  draftId,
  isActiveDraft,
  isActive,
  initialTrip,
  allTrips,
  trips: propTrips,
  drivers: propsDrivers,
  onBookingSuccess,
  onValuesChange,
  onClearDraft,
  onCloneBooking,
  onCopyBooking,
  onOpenLinkedTrip,
}: DispatchBookingEngineProps) {
  const resolvedIsActiveDraft = isActiveDraft ?? isActive;
  const lookupTrips = allTrips ?? propTrips ?? [];

  // Deterministic initial state (never read localStorage inside useState initializers)
  const [driverOptions, setDriverOptions] = useState<DriverRosterItem[]>(() =>
    propsDrivers && propsDrivers.length > 0 ? propsDrivers : []
  );

  useEffect(() => {
    if (propsDrivers && propsDrivers.length > 0) {
      setDriverOptions(propsDrivers);
      return;
    }
    setDriverOptions(getOperatorService().getDriverRoster());
    const unsub = getOperatorService().subscribeToDrivers((roster) => {
      setDriverOptions(roster);
    });
    return () => unsub();
  }, [propsDrivers]);

  const isEditMode = Boolean(initialTrip?.id);
  const isCompleted = initialTrip?.status === 'completed';
  const isCancelled = initialTrip?.status === 'cancelled';
  const outboundTripId =
    initialTrip?.linkedTripId || (initialTrip?.metadata as any)?.linkedTripId;
  const explicitReturnTripId =
    initialTrip?.linkedReturnTripId ||
    (initialTrip?.metadata as any)?.linkedReturnTripId ||
    (initialTrip?.metadata as any)?.returnTripId;

  const discoveredReturnTripId = useMemo(() => {
    if (explicitReturnTripId) return explicitReturnTripId;
    if (!initialTrip?.id || !allTrips || allTrips.length === 0) return undefined;
    const paired = allTrips.find(
      (t) =>
        t.id !== initialTrip.id &&
        (t.linkedTripId === initialTrip.id ||
          (t.metadata as any)?.linkedTripId === initialTrip.id) &&
        (t.isReturnRide || (t.metadata as any)?.isReturnRide)
    );
    return paired?.id;
  }, [explicitReturnTripId, initialTrip?.id, allTrips]);

  const returnTripId = explicitReturnTripId || discoveredReturnTripId;
  const isReturnRide = Boolean(
    initialTrip?.isReturnRide || (initialTrip?.metadata as any)?.isReturnRide || outboundTripId
  );
  const linkedTripId = isReturnRide ? outboundTripId : returnTripId;
  const returnScheduledTime =
    initialTrip?.returnScheduledPickupTime ||
    (initialTrip?.metadata as any)?.returnScheduledPickupTime ||
    ((initialTrip?.metadata as any)?.returnDate && (initialTrip?.metadata as any)?.returnTime
      ? `${(initialTrip?.metadata as any)?.returnDate}T${
          (initialTrip?.metadata as any)?.returnTime
        }:00`
      : undefined);
  const hasLinkedTrip = Boolean(linkedTripId);
  const draftStorageKey = `chesterfield_dispatch_draft_${draftId}`;

  // Timing & Outbound Route
  const [timingType, setTimingType] = useState<'asap' | 'later'>('asap');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<GeoPoint | undefined>();
  const [pickupPlaceId, setPickupPlaceId] = useState<string | undefined>();
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoordinates, setDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [dropoffPlaceId, setDropoffPlaceId] = useState<string | undefined>();
  const [intermediateStops, setIntermediateStops] = useState<
    Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>
  >([]);

  // Flight & Aviation
  const [provideFlightInfo, setProvideFlightInfo] = useState(false);
  const [airline, setAirline] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [flightOrigin, setFlightOrigin] = useState('');
  const [tailNumber, setTailNumber] = useState('');
  const [fboFacility, setFboFacility] = useState('');
  const [hasCheckedLuggage, setHasCheckedLuggage] = useState(false);
  const [outboundFlightTelemetry, setOutboundFlightTelemetry] =
    useState<FlightTelemetrySnapshot | null>(null);
  const [returnFlightTelemetry, setReturnFlightTelemetry] =
    useState<FlightTelemetrySnapshot | null>(null);

  // Passenger & Contact Person
  const [passengerName, setPassengerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [additionalPassengers, setAdditionalPassengers] = useState<AdditionalPassenger[]>([]);
  const [isBookerDifferent, setIsBookerDifferent] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactRole, setContactRole] = useState('Hotel Front Desk / Concierge');

  // Capacity, Cargo, Car Seats & Extras
  const [passengers, setPassengers] = useState(1);
  const [carryOnBags, setCarryOnBags] = useState(0);
  const [checkedBags, setCheckedBags] = useState(0);
  const [bags, setBags] = useState(0);
  const [hasOversizedLuggage, setHasOversizedLuggage] = useState(false);
  const [oversizedBags, setOversizedBags] = useState<Record<string, number>>({});
  const [oversizedLuggageNotes, setOversizedLuggageNotes] = useState('');
  const [showSpecialRequests, setShowSpecialRequests] = useState(false);
  const [specialRequestFlags, setSpecialRequestFlags] = useState({
    petFriendly: false,
    quietRide: false,
    musicOk: false,
  });
  const [gateCode, setGateCode] = useState('');
  const [selectedCustomExtras, setSelectedCustomExtras] = useState<Record<string, number>>({});
  const [carSeats, setCarSeats] = useState(false);
  const [rearFacingCount, setRearFacingCount] = useState(0);
  const [frontFacingCount, setFrontFacingCount] = useState(0);
  const [boosterCount, setBoosterCount] = useState(0);
  const [selectedVehicles, setSelectedVehicles] = useState<Array<VehicleChoice>>(['any']);

  // Payment, Rules, Assignment & Notes
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'account'>('cash');
  const [cardPaymentType, setCardPaymentType] = useState<
    'terminal' | 'payment_link' | 'card_on_file' | 'manual'
  >('terminal');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExp, setCardExp] = useState('');
  const [, setCardCvc] = useState('');
  const [saveCardOnFile, setSaveCardOnFile] = useState(false);
  const [corporateAccount, setCorporateAccount] = useState(DEFAULT_CORPORATE_ACCOUNTS[0]);
  const [billingPo, setBillingPo] = useState('');
  const [allowPoOverride, setAllowPoOverride] = useState(false);
  const [authorizedBy, setAuthorizedBy] = useState('');
  const [invoicingTerms, setInvoicingTerms] = useState('Net 30 Direct Bill');
  const [sendEmailConfirmation, setSendEmailConfirmation] = useState(true);

  const [tariff, setTariff] = useState('Standard');
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [availableNamedRules, setAvailableNamedRules] = useState<NamedPricingRule[]>([]);
  const [universalExtrasConfig, setUniversalExtrasConfig] = useState<UniversalExtrasConfig>(
    DEFAULT_UNIVERSAL_EXTRAS
  );
  const [surchargesVersion, setSurchargesVersion] = useState(0);
  const [discount, setDiscount] = useState('None');
  const [manualDiscountDollars, setManualDiscountDollars] = useState('');
  const [waiveAirportFee, setWaiveAirportFee] = useState(false);
  const [waiveMultiStopFees, setWaiveMultiStopFees] = useState(false);
  const [bypassSurge, setBypassSurge] = useState(false);
  const [company, setCompany] = useState(DEFAULT_COMPANIES[0]);
  const [driverId, setDriverId] = useState('unassigned');
  const [driverAssignmentMode, setDriverAssignmentMode] = useState<
    'send_to_driver' | 'stage_hold'
  >('send_to_driver');
  const [hasManualDriverModeOverride, setHasManualDriverModeOverride] = useState(false);
  const driverExplicitlyChangedByUserRef = useRef<boolean>(false);
  const [notesForAll, setNotesForAll] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Return Leg & Repeat Schedule
  const [returnTrip, setReturnTrip] = useState(false);
  const [returnPickupAddress, setReturnPickupAddress] = useState('');
  const [returnPickupCoordinates, setReturnPickupCoordinates] = useState<GeoPoint | undefined>();
  const [returnPickupPlaceId, setReturnPickupPlaceId] = useState<string | undefined>();
  const [returnDropoffAddress, setReturnDropoffAddress] = useState('');
  const [returnDropoffCoordinates, setReturnDropoffCoordinates] = useState<GeoPoint | undefined>();
  const [returnDropoffPlaceId, setReturnDropoffPlaceId] = useState<string | undefined>();
  const [returnIntermediateStops, setReturnIntermediateStops] = useState<
    Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>
  >([]);
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('17:00');
  const [returnPassengers, setReturnPassengers] = useState(1);
  const [returnCarryOnBags, setReturnCarryOnBags] = useState(0);
  const [returnCheckedBags, setReturnCheckedBags] = useState(0);
  const [returnBags, setReturnBags] = useState(0);
  const [returnHasOversizedLuggage, setReturnHasOversizedLuggage] = useState(false);
  const [returnOversizedBags, setReturnOversizedBags] = useState<Record<string, number>>({});
  const [returnOversizedLuggageNotes, setReturnOversizedLuggageNotes] = useState('');
  const [returnCarSeats, setReturnCarSeats] = useState(false);
  const [returnRearFacing, setReturnRearFacing] = useState(0);
  const [returnFrontFacing, setReturnFrontFacing] = useState(0);
  const [returnBooster, setReturnBooster] = useState(0);
  const [returnVehicles, setReturnVehicles] = useState<Array<VehicleChoice>>(['any']);
  const [autoCreateReturnTrip, setAutoCreateReturnTrip] = useState(true);
  const [returnProvideFlightInfo, setReturnProvideFlightInfo] = useState(false);
  const [returnAirline, setReturnAirline] = useState('');
  const [returnFlightNumber, setReturnFlightNumber] = useState('');
  const [returnFlightOrigin, setReturnFlightOrigin] = useState('');
  const [returnTailNumber, setReturnTailNumber] = useState('');
  const [returnFboFacility, setReturnFboFacility] = useState('');
  const [returnHasCheckedLuggage, setReturnHasCheckedLuggage] = useState(false);

  const [repeat, setRepeat] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<
    'daily' | 'weekdays' | 'weekly' | 'custom'
  >('weekdays');
  const [repeatDays, setRepeatDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [repeatOccurrences, setRepeatOccurrences] = useState(5);
  const [repeatUntilDate, setRepeatUntilDate] = useState('');
  const [repeatWeeksPattern, setRepeatWeeksPattern] = useState<'all' | 'odd' | 'even'>('all');
  const [repeatSkipDates, setRepeatSkipDates] = useState<string[]>([]);

  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const [manualFare, setManualFare] = useState('');
  const [isFareOverridden, setIsFareOverridden] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const [corporateAccountList, setCorporateAccountList] = useState<CorporateAccountConfig[]>([]);
  const [vehicleTiers, setVehicleTiers] = useState<VehicleTierConfig[]>([]);

  useEffect(() => {
    const now = new Date();
    const todayStr = formatLocalDateStr(now);
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);
    const untilStr = formatLocalDateStr(in30Days);
    setScheduledDate((prev) => prev || todayStr);
    setReturnDate((prev) => prev || todayStr);
    setRepeatUntilDate((prev) => prev || untilStr);

    try {
      setUniversalExtrasConfig(getUniversalExtrasConfig());
    } catch {}
    const cachedSettings = getAdminConfigService().getCachedSettings();
    if (cachedSettings?.vehicles && cachedSettings.vehicles.length > 0) {
      setVehicleTiers(cachedSettings.vehicles.filter((v) => !v.isArchived));
    }

    const unsubRules = getPricingRulesService().subscribeToRules((rules) => {
      setAvailableNamedRules(rules.filter((r) => r.isActive));
    });
    const unsubExtras = getUniversalExtrasService().subscribeToExtras((cfg) => {
      if (cfg) setUniversalExtrasConfig(cfg);
    });
    const unsubSurcharges = getSurchargesService().subscribeToSurcharges(() => {
      setSurchargesVersion((v) => v + 1);
    });
    const unsubSettings = getAdminConfigService().subscribeToSettings((settings) => {
      if (settings?.corporateAccounts && settings.corporateAccounts.length > 0) {
        setCorporateAccountList(settings.corporateAccounts);
        setCorporateAccount((prev) => {
          const exists = Boolean(findMatchingCorporateAccount(settings.corporateAccounts!, prev));
          return exists ? prev : settings.corporateAccounts![0].companyName;
        });
      }
      if (settings?.vehicles && settings.vehicles.length > 0) {
        setVehicleTiers(settings.vehicles.filter((v) => !v.isArchived));
      }
    });

    return () => {
      unsubRules();
      unsubExtras();
      unsubSurcharges();
      unsubSettings();
    };
  }, []);

  const carSeatLimits = COMPANY_CONFIG.carSeatLimits || {
    maxRearFacing: 2,
    maxFrontFacing: 3,
    maxBooster: 3,
    maxTotalCarSeats: 4,
  };

  const dispatchVehicleOptions = useMemo(
    () => buildDispatchVehicleOptions(vehicleTiers),
    [vehicleTiers]
  );
  const vehicleCapacities = useMemo(
    () => buildDispatchVehicleCapacities(dispatchVehicleOptions),
    [dispatchVehicleOptions]
  );

  const { maxPassengers: totalMaxPassengers, maxBags: totalMaxBags } =
    sumSelectedVehicleCapacities(selectedVehicles, vehicleCapacities);
  const { maxPassengers: returnTotalMaxPassengers, maxBags: returnTotalMaxBags } =
    sumSelectedVehicleCapacities(returnVehicles, vehicleCapacities);
  const totalCarSeats = computeTotalCarSeats(
    carSeats,
    rearFacingCount,
    frontFacingCount,
    boosterCount
  );

  const { airportDetection, returnAirportDetection } = useBookingAirportDetection({
    pickupAddress,
    dropoffAddress,
    returnPickupAddress,
    returnDropoffAddress,
    returnTrip,
    clearWhenNoAirport: false,
    onSyncOutboundFlightInfo: (shouldEnable) => {
      if (shouldEnable) setProvideFlightInfo(true);
    },
    onSyncReturnFlightInfo: (shouldEnable) => {
      if (shouldEnable) setReturnProvideFlightInfo(true);
    },
  });

  const outboundWaypoints = useBookingWaypoints({
    stops: intermediateStops,
    onChange: setIntermediateStops,
  });
  const returnWaypoints = useBookingWaypoints({
    stops: returnIntermediateStops,
    onChange: setReturnIntermediateStops,
  });

  const {
    selectedCorporateAccount,
    matchedCorporateAccount,
    poValidation,
    validateDispatchAccount,
  } = useCorporatePoVerification({
    paymentMethod,
    corporateAccountList,
    corporateAccount,
    billingPo,
  });

  const effectiveDiscountInputs = useMemo(
    () =>
      resolveEffectiveDiscountInputs({
        discount,
        matchedCorporateAccount,
        manualDiscountDollars,
      }),
    [discount, matchedCorporateAccount, manualDiscountDollars]
  );

  const activeAdminVehicleIds = useMemo(() => {
    const ids = new Set<string>(['standard']);
    dispatchVehicleOptions.forEach((opt) => {
      if (opt.key && opt.key !== 'any') ids.add(String(opt.key));
    });
    return Array.from(ids);
  }, [dispatchVehicleOptions]);

  const oversizedCategories = useMemo(
    () =>
      universalExtrasConfig?.oversizedBagsConfig &&
      universalExtrasConfig.oversizedBagsConfig.length > 0
        ? universalExtrasConfig.oversizedBagsConfig
        : DEFAULT_OVERSIZED_BAG_CATEGORIES,
    [universalExtrasConfig]
  );

  const totalOversizedCount = useMemo(
    () => countTotalOversizedBags(oversizedBags),
    [oversizedBags]
  );
  const oversizedBagsPayload = useMemo(
    () => cleanOversizedBagsPayload(hasOversizedLuggage && totalOversizedCount > 0, oversizedBags),
    [hasOversizedLuggage, oversizedBags, totalOversizedCount]
  );
  const oversizedItemsSummary = useMemo(
    () =>
      formatOversizedItemsSummary(oversizedBags, oversizedCategories, {
        enabled: hasOversizedLuggage,
        notes: oversizedLuggageNotes,
        emptyAsUndefined: true,
      }),
    [hasOversizedLuggage, oversizedBags, oversizedCategories, oversizedLuggageNotes]
  );

  const returnTotalOversizedCount = useMemo(
    () => countTotalOversizedBags(returnOversizedBags),
    [returnOversizedBags]
  );
  const returnOversizedBagsPayload = useMemo(
    () =>
      cleanOversizedBagsPayload(
        returnHasOversizedLuggage && returnTotalOversizedCount > 0,
        returnOversizedBags
      ),
    [returnHasOversizedLuggage, returnOversizedBags, returnTotalOversizedCount]
  );
  const returnOversizedItemsSummary = useMemo(
    () =>
      formatOversizedItemsSummary(returnOversizedBags, oversizedCategories, {
        enabled: returnHasOversizedLuggage,
        notes: returnOversizedLuggageNotes,
        emptyAsUndefined: true,
      }),
    [
      returnHasOversizedLuggage,
      returnOversizedBags,
      oversizedCategories,
      returnOversizedLuggageNotes,
    ]
  );

  const isSymmetricRoundTrip = useMemo(
    () =>
      checkSymmetricRoundTrip({
        returnTrip,
        pickupAddress,
        dropoffAddress,
        returnPickupAddress,
        returnDropoffAddress,
        intermediateStops,
        returnIntermediateStops,
        passengers,
        returnPassengers,
        bags,
        returnBags,
        selectedVehicles,
        returnSelectedVehicles: returnVehicles,
        carSeats,
        returnCarSeats,
        rearFacingCount,
        returnRearFacing,
        frontFacingCount,
        returnFrontFacing,
        boosterCount,
        returnBooster,
        hasOversizedLuggage,
        returnHasOversizedLuggage,
        oversizedBags,
        returnOversizedBags,
      }),
    [
      returnTrip,
      pickupAddress,
      dropoffAddress,
      returnPickupAddress,
      returnDropoffAddress,
      intermediateStops,
      returnIntermediateStops,
      passengers,
      returnPassengers,
      bags,
      returnBags,
      selectedVehicles,
      returnVehicles,
      carSeats,
      returnCarSeats,
      rearFacingCount,
      returnRearFacing,
      frontFacingCount,
      returnFrontFacing,
      boosterCount,
      returnBooster,
      hasOversizedLuggage,
      returnHasOversizedLuggage,
      oversizedBags,
      returnOversizedBags,
    ]
  );

  // Auto-default Driver Delivery Mode: Stage (Hold) when booking a future scheduled trip outside the Pre-Pickup Lead Window,
  // or Send to Driver for ASAP and inside-window rides (unless manually overridden or hydrated in edit mode)
  useEffect(() => {
    if (isEditMode || hasManualDriverModeOverride) return;
    if (timingType !== 'later' || !scheduledDate || !scheduledTime) {
      setDriverAssignmentMode('send_to_driver');
      return;
    }
    const scheduledMs = Date.parse(`${scheduledDate}T${scheduledTime}:00`);
    if (!Number.isFinite(scheduledMs)) {
      setDriverAssignmentMode('send_to_driver');
      return;
    }
    const cachedAuto = getAdminConfigService().getCachedSettings()?.dispatchAutomation;
    const baseLead = Number(cachedAuto?.scheduledDispatchLeadMinutes || 45);
    const airportExtra = airportDetection.isAirportTrip
      ? Number(cachedAuto?.airportExtraLeadMinutes || 15)
      : 0;
    const minutesUntilPickup = (scheduledMs - Date.now()) / 60_000;
    setDriverAssignmentMode(
      minutesUntilPickup > baseLead + airportExtra ? 'stage_hold' : 'send_to_driver'
    );
  }, [
    isEditMode,
    hasManualDriverModeOverride,
    timingType,
    scheduledDate,
    scheduledTime,
    airportDetection.isAirportTrip,
  ]);

  const resetAfterCreateRef = useRef<(() => void) | null>(null);

  const {
    estimatedFare,
    setEstimatedFare,
    outboundPricing,
    setOutboundPricing,
    returnPricing,
    vehicleQuotes,
    returnVehicleQuotes,
    isQuoting,
    estimatedDurationMinutes,
    setEstimatedDurationMinutes,
    estimatedDistanceMiles,
    setEstimatedDistanceMiles,
    returnEstimatedDurationMinutes,
    setReturnEstimatedDurationMinutes,
    returnEstimatedDistanceMiles,
    setReturnEstimatedDistanceMiles,
    returnEstimatedFare,
    setReturnEstimatedFare,
    skipFirstEditQuoteRef,
    submitErrorRef,
    isSubmitting,
    submitError,
    setSubmitError,
    bookingConflictSummary,
    isConflictPromptOpen,
    confirmConflictOverrideAndSubmit,
    cancelConflictPrompt,
    handleSubmit,
  } = useDispatchBookingSubmission({
    isEditMode,
    isCompleted,
    isCancelled,
    initialTrip,
    draftStorageKey,
    timingType,
    scheduledDate,
    scheduledTime,
    pickupAddress,
    pickupCoordinates,
    pickupPlaceId,
    dropoffAddress,
    dropoffCoordinates,
    dropoffPlaceId,
    intermediateStops,
    passengerName,
    phone,
    email,
    additionalPassengers,
    isBookerDifferent,
    contactName,
    contactPhone,
    contactEmail,
    contactRole,
    passengers,
    carryOnBags,
    checkedBags,
    bags,
    hasOversizedLuggage,
    oversizedBagsPayload,
    totalOversizedCount,
    oversizedLuggageNotes,
    oversizedItemsSummary,
    specialRequestFlags,
    gateCode,
    selectedCustomExtras,
    carSeats,
    rearFacingCount,
    frontFacingCount,
    boosterCount,
    selectedVehicles,
    paymentMethod,
    cardPaymentType,
    cardholderName,
    cardNumber,
    cardExp,
    saveCardOnFile,
    corporateAccount,
    corporateAccountList,
    matchedCorporateAccount,
    billingPo,
    allowPoOverride,
    authorizedBy,
    invoicingTerms,
    sendEmailConfirmation,
    tariff,
    selectedRuleId,
    availableNamedRules,
    universalExtrasConfig,
    surchargesVersion,
    discount,
    manualDiscountDollars,
    effectiveDiscountInputs,
    waiveAirportFee,
    waiveMultiStopFees,
    bypassSurge,
    company,
    driverId,
    driverAssignmentMode,
    driverExplicitlyChangedByUserRef,
    driverOptions,
    notesForAll,
    internalNotes,
    returnTrip,
    returnPickupAddress,
    returnPickupCoordinates,
    returnPickupPlaceId,
    returnDropoffAddress,
    returnDropoffCoordinates,
    returnDropoffPlaceId,
    returnIntermediateStops,
    returnDate,
    returnTime,
    returnPassengers,
    returnCarryOnBags,
    returnCheckedBags,
    returnBags,
    returnHasOversizedLuggage,
    returnOversizedBagsPayload,
    returnTotalOversizedCount,
    returnOversizedLuggageNotes,
    returnOversizedItemsSummary,
    returnCarSeats,
    returnRearFacing,
    returnFrontFacing,
    returnBooster,
    returnVehicles,
    autoCreateReturnTrip,
    repeat,
    repeatFrequency,
    repeatDays,
    repeatOccurrences,
    repeatUntilDate,
    repeatWeeksPattern,
    repeatSkipDates,
    manualFare,
    isFareOverridden,
    isSymmetricRoundTrip,
    provideFlightInfo,
    airline,
    flightNumber,
    flightOrigin,
    tailNumber,
    fboFacility,
    hasCheckedLuggage,
    outboundFlightTelemetry,
    returnProvideFlightInfo,
    returnAirline,
    returnFlightNumber,
    returnFlightOrigin,
    returnTailNumber,
    returnFboFacility,
    returnHasCheckedLuggage,
    returnFlightTelemetry,
    airportDetection,
    returnAirportDetection,
    activeAdminVehicleIds,
    dispatchVehicleOptions,
    vehicleCapacities,
    validateDispatchAccount,
    allTrips: lookupTrips,
    onResetAfterCreate: () => resetAfterCreateRef.current?.(),
    onBookingSuccess,
  });

  const displayRoundTripFares = useMemo(
    () =>
      computeDispatchRoundTripFares({
        returnTrip,
        isSymmetric: isSymmetricRoundTrip,
        estimatedFare,
        returnEstimatedFare,
        isFareOverridden,
        manualFare,
      }),
    [returnTrip, isSymmetricRoundTrip, estimatedFare, returnEstimatedFare, isFareOverridden, manualFare]
  );

  const { draftSavedAt, handleClear, handleCopyBooking } = useDispatchDraftSync({
    draftId,
    draftStorageKey,
    resolvedIsActiveDraft,
    isEditMode,
    initialTrip,
    universalExtrasConfig,
    vehicleTiers,
    corporateAccountList,
    availableNamedRules,
    skipFirstEditQuoteRef,
    driverExplicitlyChangedByUserRef,
    setters: {
      setTimingType,
      setScheduledDate,
      setScheduledTime,
      setPickupAddress,
      setPickupCoordinates,
      setPickupPlaceId,
      setDropoffAddress,
      setDropoffCoordinates,
      setDropoffPlaceId,
      setIntermediateStops,
      setPassengerName,
      setPhone,
      setEmail,
      setAdditionalPassengers,
      setIsBookerDifferent,
      setContactName,
      setContactPhone,
      setContactEmail,
      setContactRole,
      setPassengers,
      setCarryOnBags,
      setCheckedBags,
      setBags,
      setHasOversizedLuggage,
      setOversizedBags,
      setOversizedLuggageNotes,
      setShowSpecialRequests,
      setSpecialRequestFlags,
      setGateCode,
      setSelectedCustomExtras,
      setCarSeats,
      setRearFacingCount,
      setFrontFacingCount,
      setBoosterCount,
      setSelectedVehicles,
      setPaymentMethod,
      setCardPaymentType,
      setCardholderName,
      setCardNumber,
      setCardExp,
      setCardCvc,
      setCorporateAccount,
      setBillingPo,
      setAuthorizedBy,
      setInvoicingTerms,
      setSendEmailConfirmation,
      setTariff,
      setSelectedRuleId,
      setDiscount,
      setManualDiscountDollars,
      setWaiveAirportFee,
      setWaiveMultiStopFees,
      setBypassSurge,
      setCompany,
      setDriverId,
      setDriverAssignmentMode: (m: 'send_to_driver' | 'stage_hold') => {
        setDriverAssignmentMode(m);
        setHasManualDriverModeOverride(true);
      },
      setNotesForAll,
      setInternalNotes,
      setInternalNotesUpdater: setInternalNotes,
      setReturnTrip,
      setReturnPickupAddress,
      setReturnPickupCoordinates,
      setReturnDropoffAddress,
      setReturnDropoffCoordinates,
      setReturnIntermediateStops,
      setReturnDate,
      setReturnTime,
      setReturnPassengers,
      setReturnCarryOnBags,
      setReturnCheckedBags,
      setReturnBags,
      setReturnHasOversizedLuggage,
      setReturnOversizedBags,
      setReturnOversizedLuggageNotes,
      setReturnCarSeats,
      setReturnRearFacing,
      setReturnFrontFacing,
      setReturnBooster,
      setReturnVehicles,
      setAutoCreateReturnTrip,
      setRepeat,
      setRepeatFrequency,
      setRepeatDays,
      setRepeatOccurrences,
      setRepeatUntilDate,
      setRepeatWeeksPattern,
      setRepeatSkipDates,
      setEstimatedFare,
      setReturnEstimatedFare,
      setReturnEstimatedDurationMinutes,
      setReturnEstimatedDistanceMiles,
      setManualFare,
      setIsFareOverridden,
      setOutboundPricing,
      setEstimatedDistanceMiles,
      setEstimatedDurationMinutes,
      setProvideFlightInfo,
      setAirline,
      setFlightNumber,
      setFlightOrigin,
      setTailNumber,
      setFboFacility,
      setHasCheckedLuggage,
      setOutboundFlightTelemetry,
      setReturnProvideFlightInfo,
      setReturnAirline,
      setReturnFlightNumber,
      setReturnFlightOrigin,
      setReturnTailNumber,
      setReturnFboFacility,
      setReturnHasCheckedLuggage,
      setReturnFlightTelemetry,
      setSubmitError,
    },
    values: {
      timingType,
      scheduledDate,
      scheduledTime,
      pickupAddress,
      pickupCoordinates,
      pickupPlaceId,
      dropoffAddress,
      dropoffCoordinates,
      dropoffPlaceId,
      intermediateStops,
      passengerName,
      phone,
      email,
      additionalPassengers,
      isBookerDifferent,
      contactName,
      contactPhone,
      contactEmail,
      contactRole,
      passengers,
      carryOnBags,
      checkedBags,
      bags,
      hasOversizedLuggage,
      oversizedBags,
      oversizedLuggageNotes,
      specialRequestFlags,
      gateCode,
      selectedCustomExtras,
      carSeats,
      rearFacingCount,
      frontFacingCount,
      boosterCount,
      selectedVehicles,
      paymentMethod,
      cardPaymentType,
      cardholderName,
      cardNumber,
      cardExp,
      saveCardOnFile,
      corporateAccount,
      billingPo,
      authorizedBy,
      invoicingTerms,
      sendEmailConfirmation,
      tariff,
      selectedRuleId,
      discount,
      manualDiscountDollars,
      waiveAirportFee,
      waiveMultiStopFees,
      bypassSurge,
      company,
      driverId,
      driverAssignmentMode,
      notesForAll,
      internalNotes,
      returnTrip,
      returnPickupAddress,
      returnPickupCoordinates,
      returnDropoffAddress,
      returnDropoffCoordinates,
      returnIntermediateStops,
      returnDate,
      returnTime,
      returnPassengers,
      returnCarryOnBags,
      returnCheckedBags,
      returnBags,
      returnHasOversizedLuggage,
      returnOversizedBags,
      returnOversizedLuggageNotes,
      returnCarSeats,
      returnRearFacing,
      returnFrontFacing,
      returnBooster,
      returnVehicles,
      autoCreateReturnTrip,
      returnEstimatedFare,
      returnEstimatedDurationMinutes,
      returnEstimatedDistanceMiles,
      returnProvideFlightInfo,
      returnAirline,
      returnFlightNumber,
      returnFlightOrigin,
      returnTailNumber,
      returnFboFacility,
      returnHasCheckedLuggage,
      repeat,
      repeatFrequency,
      repeatDays,
      repeatOccurrences,
      repeatUntilDate,
      repeatWeeksPattern,
      repeatSkipDates,
      estimatedFare,
      manualFare,
      isFareOverridden,
      estimatedDurationMinutes,
      estimatedDistanceMiles,
      provideFlightInfo,
      airline,
      flightNumber,
      flightOrigin,
      tailNumber,
      fboFacility,
      hasCheckedLuggage,
    },
    onValuesChange,
    onClearDraft,
    onCopyBooking,
    onCloneBooking,
  });

  resetAfterCreateRef.current = () => {
    handleClear();
    setHasManualDriverModeOverride(false);
  };

  // Seed return leg from outbound when enabled
  useEffect(() => {
    if (returnTrip) {
      const seeded = buildReturnLegSeedFromOutbound(
        {
          pickupAddress,
          pickupCoordinates,
          dropoffAddress,
          dropoffCoordinates,
          passengers,
          carryOnBags,
          checkedBags,
          bags,
          hasOversizedLuggage,
          oversizedBags,
          oversizedLuggageNotes,
          carSeats,
          rearFacingCount,
          frontFacingCount,
          boosterCount,
          selectedVehicles,
        },
        {
          returnPickupAddress,
          returnPickupCoordinates,
          returnDropoffAddress,
          returnDropoffCoordinates,
        },
        { preserveCoordsWhenAddressPresent: true }
      );
      if (!returnPickupAddress && dropoffAddress) {
        setReturnPickupAddress(seeded.returnPickupAddress);
        setReturnPickupCoordinates(seeded.returnPickupCoordinates);
      }
      if (!returnDropoffAddress && pickupAddress) {
        setReturnDropoffAddress(seeded.returnDropoffAddress);
        setReturnDropoffCoordinates(seeded.returnDropoffCoordinates);
      }
      setReturnPassengers(seeded.returnPassengers);
      setReturnCarryOnBags(seeded.returnCarryOnBags);
      setReturnCheckedBags(seeded.returnCheckedBags);
      setReturnBags(seeded.returnBags);
      setReturnHasOversizedLuggage(seeded.returnHasOversizedLuggage);
      setReturnOversizedBags(seeded.returnOversizedBags);
      setReturnOversizedLuggageNotes(seeded.returnOversizedLuggageNotes);
      setReturnCarSeats(seeded.returnCarSeats);
      setReturnRearFacing(seeded.returnRearFacing);
      setReturnFrontFacing(seeded.returnFrontFacing);
      setReturnBooster(seeded.returnBooster);
      setReturnVehicles(seeded.returnSelectedVehicles);
    }
  }, [returnTrip]);

  const handleSwapRoute = () => {
    const swapped = swapRouteEndpoints({
      pickupAddress,
      pickupCoordinates,
      pickupPlaceId,
      dropoffAddress,
      dropoffCoordinates,
      dropoffPlaceId,
    });
    setPickupAddress(swapped.pickupAddress);
    setPickupCoordinates(swapped.pickupCoordinates);
    setPickupPlaceId(swapped.pickupPlaceId);
    setDropoffAddress(swapped.dropoffAddress);
    setDropoffCoordinates(swapped.dropoffCoordinates);
    setDropoffPlaceId(swapped.dropoffPlaceId);
  };

  const handleSwapReturnRoute = () => {
    const swapped = swapReturnRouteEndpoints({
      returnPickupAddress,
      returnPickupCoordinates,
      returnPickupPlaceId,
      returnDropoffAddress,
      returnDropoffCoordinates,
      returnDropoffPlaceId,
      fallbackOutbound: {
        pickupAddress,
        pickupCoordinates,
        pickupPlaceId,
        dropoffAddress,
        dropoffCoordinates,
        dropoffPlaceId,
      },
    });
    setReturnPickupAddress(swapped.returnPickupAddress);
    setReturnPickupCoordinates(swapped.returnPickupCoordinates);
    setReturnPickupPlaceId(swapped.returnPickupPlaceId);
    setReturnDropoffAddress(swapped.returnDropoffAddress);
    setReturnDropoffCoordinates(swapped.returnDropoffCoordinates);
    setReturnDropoffPlaceId(swapped.returnDropoffPlaceId);
  };

  const handleIncrementPassengers = () => {
    const nextPax = passengers + 1;
    if (nextPax > totalMaxPassengers) {
      if (selectedVehicles.length === 1) {
        const nextFit = [...dispatchVehicleOptions]
          .filter((o) => o.key !== 'any' && o.maxPassengers >= nextPax)
          .sort((a, b) => a.maxPassengers - b.maxPassengers)[0];
        if (nextFit) {
          setSelectedVehicles([nextFit.key]);
        } else {
          setSelectedVehicles([...selectedVehicles, 'any']);
        }
      } else {
        setSelectedVehicles([...selectedVehicles, 'any']);
      }
    }
    setPassengers(nextPax);
  };

  const handleDecrementPassengers = () => setPassengers((p) => Math.max(1, p - 1));

  const handleAddPassenger = () => {
    setAdditionalPassengers([...additionalPassengers, { name: '', phone: '' }]);
    handleIncrementPassengers();
  };

  const handleRemovePassenger = (index: number) => {
    setAdditionalPassengers(additionalPassengers.filter((_, i) => i !== index));
    setPassengers((p) => Math.max(1, p - 1));
  };

  const handleAddVehicle = () => setSelectedVehicles((prev) => appendVehicleChoice(prev, 'any'));

  const handleRemoveVehicle = (index: number) => {
    if (selectedVehicles.length <= 1) return;
    setSelectedVehicles((prev) => removeVehicleChoiceAt(prev, index));
  };

  const handleUpdateVehicleChoice = (index: number, choice: VehicleChoice) => {
    const updated = updateVehicleChoiceAt(selectedVehicles, index, choice, {
      minRequiredPassengers: passengers,
      vehicleCapacities,
    });
    if (updated) setSelectedVehicles(updated);
  };

  const handleAddReturnVehicle = () =>
    setReturnVehicles((prev) => appendVehicleChoice(prev, 'any'));

  const handleRemoveReturnVehicle = (index: number) => {
    if (returnVehicles.length <= 1) return;
    setReturnVehicles((prev) => removeVehicleChoiceAt(prev, index));
  };

  const handleUpdateReturnVehicle = (index: number, choice: VehicleChoice) => {
    const updated = updateVehicleChoiceAt(returnVehicles, index, choice, {
      minRequiredPassengers: returnPassengers,
      vehicleCapacities,
    });
    if (updated) setReturnVehicles(updated);
  };

  const handleToggleCarSeats = (checked: boolean) => {
    const next = computeCarSeatsToggleState(checked, {
      rearFacing: rearFacingCount,
      frontFacing: frontFacingCount,
      booster: boosterCount,
    });
    setCarSeats(next.enabled);
    setRearFacingCount(next.rearFacing);
    setFrontFacingCount(next.frontFacing);
    setBoosterCount(next.booster);
  };

  const handleToggleReturnCarSeats = (checked: boolean) => {
    const next = computeCarSeatsToggleState(checked, {
      rearFacing: returnRearFacing,
      frontFacing: returnFrontFacing,
      booster: returnBooster,
    });
    setReturnCarSeats(next.enabled);
    setReturnRearFacing(next.rearFacing);
    setReturnFrontFacing(next.frontFacing);
    setReturnBooster(next.booster);
  };

  const handleToggleRepeatDay = (day: string) => {
    setRepeatDays(
      repeatDays.includes(day) ? repeatDays.filter((d) => d !== day) : [...repeatDays, day]
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isSubmitting) {
          e.preventDefault();
          (e.currentTarget as HTMLFormElement).requestSubmit();
        } else if (e.altKey && e.key.toLowerCase() === 's' && !isCompleted && !isCancelled) {
          e.preventDefault();
          handleSwapRoute();
        }
      }}
      className="flex flex-col h-full bg-slate-50 select-none text-xs"
    >
      {/* Scrollable Form Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        <DispatchConvoyBanners
          isEditMode={isEditMode}
          isCompleted={isCompleted}
          isCancelled={isCancelled}
          initialTrip={initialTrip}
          lookupTrips={lookupTrips}
          driverOptions={driverOptions}
          selectedVehicles={selectedVehicles}
          submitError={submitError}
          submitErrorRef={submitErrorRef}
          onOpenLinkedTrip={onOpenLinkedTrip}
        />

        <DispatchInlineConflictBanner
          summary={bookingConflictSummary}
          onOpenTrip={onOpenLinkedTrip}
        />

        <DispatchRoutingTimingSection
          isEditMode={isEditMode}
          isCompleted={isCompleted}
          isCancelled={isCancelled}
          draftSavedAt={draftSavedAt}
          timingType={timingType}
          setTimingType={setTimingType}
          scheduledDate={scheduledDate}
          setScheduledDate={setScheduledDate}
          scheduledTime={scheduledTime}
          setScheduledTime={setScheduledTime}
          pickupAddress={pickupAddress}
          setPickupAddress={setPickupAddress}
          setPickupCoordinates={setPickupCoordinates}
          setPickupPlaceId={setPickupPlaceId}
          dropoffAddress={dropoffAddress}
          setDropoffAddress={setDropoffAddress}
          setDropoffCoordinates={setDropoffCoordinates}
          setDropoffPlaceId={setDropoffPlaceId}
          intermediateStops={intermediateStops}
          outboundWaypoints={outboundWaypoints}
          estimatedDurationMinutes={estimatedDurationMinutes}
          estimatedDistanceMiles={estimatedDistanceMiles}
          airportDetection={airportDetection}
          provideFlightInfo={provideFlightInfo}
          setProvideFlightInfo={setProvideFlightInfo}
          airline={airline}
          setAirline={setAirline}
          flightNumber={flightNumber}
          setFlightNumber={setFlightNumber}
          flightOrigin={flightOrigin}
          setFlightOrigin={setFlightOrigin}
          tailNumber={tailNumber}
          setTailNumber={setTailNumber}
          fboFacility={fboFacility}
          setFboFacility={setFboFacility}
          hasCheckedLuggage={hasCheckedLuggage}
          setHasCheckedLuggage={setHasCheckedLuggage}
          outboundFlightTelemetry={outboundFlightTelemetry}
          setOutboundFlightTelemetry={setOutboundFlightTelemetry}
          onSwapRoute={handleSwapRoute}
        />

        <DispatchPassengerCrmSection
          passengerName={passengerName}
          setPassengerName={setPassengerName}
          phone={phone}
          setPhone={setPhone}
          email={email}
          setEmail={setEmail}
          additionalPassengers={additionalPassengers}
          setAdditionalPassengers={setAdditionalPassengers}
          isBookerDifferent={isBookerDifferent}
          setIsBookerDifferent={setIsBookerDifferent}
          contactName={contactName}
          setContactName={setContactName}
          contactPhone={contactPhone}
          setContactPhone={setContactPhone}
          contactEmail={contactEmail}
          setContactEmail={setContactEmail}
          contactRole={contactRole}
          setContactRole={setContactRole}
          lookupTrips={lookupTrips}
          corporateAccountList={corporateAccountList}
          setCorporateAccount={setCorporateAccount}
          setPaymentMethod={setPaymentMethod}
          setBillingPo={setBillingPo}
          pickupAddress={pickupAddress}
          dropoffAddress={dropoffAddress}
          setPickupAddress={setPickupAddress}
          setPickupCoordinates={setPickupCoordinates}
          setDropoffAddress={setDropoffAddress}
          setDropoffCoordinates={setDropoffCoordinates}
          onAddPassenger={handleAddPassenger}
          onRemovePassenger={handleRemovePassenger}
        />

        <DispatchExtrasVehicleSection
          isCompleted={isCompleted}
          isCancelled={isCancelled}
          passengers={passengers}
          carryOnBags={carryOnBags}
          setCarryOnBags={setCarryOnBags}
          checkedBags={checkedBags}
          setCheckedBags={setCheckedBags}
          setBags={setBags}
          totalMaxPassengers={totalMaxPassengers}
          totalMaxBags={totalMaxBags}
          hasOversizedLuggage={hasOversizedLuggage}
          setHasOversizedLuggage={setHasOversizedLuggage}
          oversizedBags={oversizedBags}
          setOversizedBags={setOversizedBags}
          oversizedLuggageNotes={oversizedLuggageNotes}
          setOversizedLuggageNotes={setOversizedLuggageNotes}
          oversizedCategories={oversizedCategories}
          totalOversizedCount={totalOversizedCount}
          carSeats={carSeats}
          rearFacingCount={rearFacingCount}
          setRearFacingCount={setRearFacingCount}
          frontFacingCount={frontFacingCount}
          setFrontFacingCount={setFrontFacingCount}
          boosterCount={boosterCount}
          setBoosterCount={setBoosterCount}
          totalCarSeats={totalCarSeats}
          carSeatLimits={carSeatLimits}
          universalExtrasConfig={universalExtrasConfig}
          selectedCustomExtras={selectedCustomExtras}
          setSelectedCustomExtras={setSelectedCustomExtras}
          showSpecialRequests={showSpecialRequests}
          setShowSpecialRequests={setShowSpecialRequests}
          specialRequestFlags={specialRequestFlags}
          setSpecialRequestFlags={setSpecialRequestFlags}
          gateCode={gateCode}
          setGateCode={setGateCode}
          selectedVehicles={selectedVehicles}
          dispatchVehicleOptions={dispatchVehicleOptions}
          vehicleCapacities={vehicleCapacities}
          activeAdminVehicleIds={activeAdminVehicleIds}
          vehicleQuotes={vehicleQuotes}
          onIncrementPassengers={handleIncrementPassengers}
          onDecrementPassengers={handleDecrementPassengers}
          onToggleCarSeats={handleToggleCarSeats}
          onAddVehicle={handleAddVehicle}
          onRemoveVehicle={handleRemoveVehicle}
          onUpdateVehicleChoice={handleUpdateVehicleChoice}
        />

        <DispatchPaymentAssignmentSection
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          cardPaymentType={cardPaymentType}
          setCardPaymentType={setCardPaymentType}
          cardholderName={cardholderName}
          setCardholderName={setCardholderName}
          cardNumber={cardNumber}
          setCardNumber={setCardNumber}
          cardExp={cardExp}
          setCardExp={setCardExp}
          corporateAccount={corporateAccount}
          setCorporateAccount={setCorporateAccount}
          corporateAccountList={corporateAccountList}
          selectedCorporateAccount={selectedCorporateAccount}
          matchedCorporateAccount={matchedCorporateAccount}
          billingPo={billingPo}
          setBillingPo={setBillingPo}
          poValidation={poValidation}
          allowPoOverride={allowPoOverride}
          setAllowPoOverride={setAllowPoOverride}
          authorizedBy={authorizedBy}
          setAuthorizedBy={setAuthorizedBy}
          invoicingTerms={invoicingTerms}
          setInvoicingTerms={setInvoicingTerms}
          selectedRuleId={selectedRuleId}
          setSelectedRuleId={setSelectedRuleId}
          setTariff={setTariff}
          availableNamedRules={availableNamedRules}
          discount={discount}
          setDiscount={setDiscount}
          manualDiscountDollars={manualDiscountDollars}
          setManualDiscountDollars={setManualDiscountDollars}
          waiveAirportFee={waiveAirportFee}
          setWaiveAirportFee={setWaiveAirportFee}
          waiveMultiStopFees={waiveMultiStopFees}
          setWaiveMultiStopFees={setWaiveMultiStopFees}
          bypassSurge={bypassSurge}
          setBypassSurge={setBypassSurge}
          company={company}
          setCompany={setCompany}
          driverId={driverId}
          setDriverId={(nextDriverId) => {
            driverExplicitlyChangedByUserRef.current = true;
            setDriverId(nextDriverId);
          }}
          driverAssignmentMode={driverAssignmentMode}
          onChangeDriverAssignmentMode={(mode) => {
            driverExplicitlyChangedByUserRef.current = true;
            setDriverAssignmentMode(mode);
            setHasManualDriverModeOverride(true);
          }}
          isDriverAssigned={Boolean(
            initialTrip?.assignedDriverId &&
              driverId === initialTrip.assignedDriverId &&
              driverAssignmentMode !== 'stage_hold'
          )}
          fallbackAssignedLabel={
            String(
              (initialTrip?.metadata as Record<string, unknown> | undefined)?.assignedDriverName ||
                initialTrip?.plannedDriverLabel ||
                ''
            ).trim() || null
          }
          driverOptions={driverOptions}
          notesForAll={notesForAll}
          setNotesForAll={setNotesForAll}
          internalNotes={internalNotes}
          setInternalNotes={setInternalNotes}
        />

        <DispatchReturnRepeatSection
          isCompleted={isCompleted}
          isCancelled={isCancelled}
          hasLinkedTrip={hasLinkedTrip}
          isReturnRide={isReturnRide}
          linkedTripId={linkedTripId}
          returnScheduledTime={returnScheduledTime}
          onOpenLinkedTrip={onOpenLinkedTrip}
          scheduledDate={scheduledDate}
          returnTrip={returnTrip}
          setReturnTrip={setReturnTrip}
          returnPickupAddress={returnPickupAddress}
          setReturnPickupAddress={setReturnPickupAddress}
          setReturnPickupCoordinates={setReturnPickupCoordinates}
          returnDropoffAddress={returnDropoffAddress}
          setReturnDropoffAddress={setReturnDropoffAddress}
          setReturnDropoffCoordinates={setReturnDropoffCoordinates}
          returnIntermediateStops={returnIntermediateStops}
          returnWaypoints={returnWaypoints}
          returnEstimatedDurationMinutes={returnEstimatedDurationMinutes}
          returnEstimatedDistanceMiles={returnEstimatedDistanceMiles}
          returnAirportDetection={returnAirportDetection}
          returnProvideFlightInfo={returnProvideFlightInfo}
          setReturnProvideFlightInfo={setReturnProvideFlightInfo}
          returnAirline={returnAirline}
          setReturnAirline={setReturnAirline}
          returnFlightNumber={returnFlightNumber}
          setReturnFlightNumber={setReturnFlightNumber}
          returnFlightOrigin={returnFlightOrigin}
          setReturnFlightOrigin={setReturnFlightOrigin}
          returnTailNumber={returnTailNumber}
          setReturnTailNumber={setReturnTailNumber}
          returnFboFacility={returnFboFacility}
          setReturnFboFacility={setReturnFboFacility}
          returnHasCheckedLuggage={returnHasCheckedLuggage}
          setReturnHasCheckedLuggage={setReturnHasCheckedLuggage}
          returnFlightTelemetry={returnFlightTelemetry}
          setReturnFlightTelemetry={setReturnFlightTelemetry}
          returnDate={returnDate}
          setReturnDate={setReturnDate}
          returnTime={returnTime}
          setReturnTime={setReturnTime}
          returnPassengers={returnPassengers}
          setReturnPassengers={setReturnPassengers}
          returnCarryOnBags={returnCarryOnBags}
          setReturnCarryOnBags={setReturnCarryOnBags}
          returnCheckedBags={returnCheckedBags}
          setReturnCheckedBags={setReturnCheckedBags}
          setReturnBags={setReturnBags}
          returnTotalMaxPassengers={returnTotalMaxPassengers}
          returnTotalMaxBags={returnTotalMaxBags}
          returnHasOversizedLuggage={returnHasOversizedLuggage}
          setReturnHasOversizedLuggage={setReturnHasOversizedLuggage}
          returnOversizedBags={returnOversizedBags}
          setReturnOversizedBags={setReturnOversizedBags}
          returnOversizedLuggageNotes={returnOversizedLuggageNotes}
          setReturnOversizedLuggageNotes={setReturnOversizedLuggageNotes}
          returnTotalOversizedCount={returnTotalOversizedCount}
          oversizedCategories={oversizedCategories}
          returnCarSeats={returnCarSeats}
          returnRearFacing={returnRearFacing}
          setReturnRearFacing={setReturnRearFacing}
          returnFrontFacing={returnFrontFacing}
          setReturnFrontFacing={setReturnFrontFacing}
          returnBooster={returnBooster}
          setReturnBooster={setReturnBooster}
          carSeatLimits={carSeatLimits}
          returnVehicles={returnVehicles}
          dispatchVehicleOptions={dispatchVehicleOptions}
          vehicleCapacities={vehicleCapacities}
          activeAdminVehicleIds={activeAdminVehicleIds}
          returnVehicleQuotes={returnVehicleQuotes}
          autoCreateReturnTrip={autoCreateReturnTrip}
          setAutoCreateReturnTrip={setAutoCreateReturnTrip}
          repeat={repeat}
          setRepeat={setRepeat}
          repeatFrequency={repeatFrequency}
          setRepeatFrequency={setRepeatFrequency}
          repeatDays={repeatDays}
          setRepeatDays={setRepeatDays}
          repeatOccurrences={repeatOccurrences}
          setRepeatOccurrences={setRepeatOccurrences}
          repeatUntilDate={repeatUntilDate}
          setRepeatUntilDate={setRepeatUntilDate}
          repeatWeeksPattern={repeatWeeksPattern}
          setRepeatWeeksPattern={setRepeatWeeksPattern}
          repeatSkipDates={repeatSkipDates}
          setRepeatSkipDates={setRepeatSkipDates}
          onSwapReturnRoute={handleSwapReturnRoute}
          onToggleReturnCarSeats={handleToggleReturnCarSeats}
          onAddReturnVehicle={handleAddReturnVehicle}
          onRemoveReturnVehicle={handleRemoveReturnVehicle}
          onUpdateReturnVehicle={handleUpdateReturnVehicle}
          onToggleRepeatDay={handleToggleRepeatDay}
        />
      </div>

      <DispatchBookingFooterBar
        isEditMode={isEditMode}
        isQuoting={isQuoting}
        isSubmitting={isSubmitting}
        showPriceBreakdown={showPriceBreakdown}
        setShowPriceBreakdown={setShowPriceBreakdown}
        outboundPricing={outboundPricing}
        returnPricing={returnPricing}
        displayRoundTripFares={displayRoundTripFares}
        returnTrip={returnTrip}
        repeat={repeat}
        repeatFrequency={repeatFrequency}
        repeatDays={repeatDays}
        selectedVehicles={selectedVehicles}
        returnVehicles={returnVehicles}
        dispatchVehicleOptions={dispatchVehicleOptions}
        isFareOverridden={isFareOverridden}
        setIsFareOverridden={setIsFareOverridden}
        manualFare={manualFare}
        setManualFare={setManualFare}
        email={email}
        sendEmailConfirmation={sendEmailConfirmation}
        setSendEmailConfirmation={setSendEmailConfirmation}
        isClearModalOpen={isClearModalOpen}
        setIsClearModalOpen={setIsClearModalOpen}
        onCopyBooking={handleCopyBooking}
        onConfirmClear={() => setIsClearModalOpen(true)}
        onClear={handleClear}
      />

      <DispatchBookingConflictModal
        isOpen={isConflictPromptOpen}
        isEditMode={isEditMode}
        isSubmitting={isSubmitting}
        conflicts={bookingConflictSummary.conflicts}
        onCancel={cancelConflictPrompt}
        onConfirmBookAnyway={confirmConflictOverrideAndSubmit}
        onOpenTrip={onOpenLinkedTrip}
      />
    </form>
  );
}

export const DispatchBookingEngine = React.memo(DispatchBookingEngineComponent);
