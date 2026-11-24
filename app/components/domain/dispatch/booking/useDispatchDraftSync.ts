import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoPoint, Trip } from '../../../../core/types';
import type {
  CorporateAccountConfig,
  NamedPricingRule,
  UniversalExtrasConfig,
  VehicleTierConfig,
} from '../../../../core/types/config';
import type { FlightTelemetrySnapshot } from '../../../../core/types/flight';
import { getAdminConfigService } from '../../../../core/services/config/admin-config.service';
import { getUniversalExtrasConfig } from '../../../../core/services/pricing/extras.service';
import { getWorkspaceBus } from '../../../../core/services/workspace-bus.service';
import { resolvePopulatePassengerMode } from '../../../../core/hooks/dispatch/dispatch-workspace.util';
import {
  DEFAULT_CORPORATE_ACCOUNTS,
  buildDispatchVehicleCapacities,
  buildDispatchVehicleOptions,
  findMatchingCorporateAccount,
  type BookingAdditionalPassenger as AdditionalPassenger,
  type BookingVehicleChoice as VehicleChoice,
} from '../../../../core/hooks/booking';
import {
  applySavedDraftOverlayToDispatchState,
  hydrateInitialTripIntoDispatchState,
  type DispatchFormValues,
  type DispatchHydrationSetters,
} from './useDispatchBookingSubmission';

export interface UseDispatchDraftSyncParams {
  draftId: string;
  draftStorageKey: string;
  resolvedIsActiveDraft: boolean | undefined;
  isEditMode: boolean;
  initialTrip?: Trip | null;
  universalExtrasConfig: UniversalExtrasConfig;
  vehicleTiers: VehicleTierConfig[];
  corporateAccountList: CorporateAccountConfig[];
  availableNamedRules: NamedPricingRule[];
  skipFirstEditQuoteRef: React.MutableRefObject<boolean>;
  driverExplicitlyChangedByUserRef?: React.MutableRefObject<boolean>;
  setters: DispatchHydrationSetters & {
    setCardCvc: (v: string) => void;
    setReturnEstimatedDurationMinutes: (v: number) => void;
    setReturnEstimatedDistanceMiles: (v: number) => void;
    setReturnFlightTelemetry: (v: FlightTelemetrySnapshot | null) => void;
    setSubmitError: (v: string | null) => void;
    setInternalNotesUpdater: React.Dispatch<React.SetStateAction<string>>;
  };
  values: {
    timingType: 'asap' | 'later';
    scheduledDate: string;
    scheduledTime: string;
    pickupAddress: string;
    pickupCoordinates?: GeoPoint;
    pickupPlaceId?: string;
    dropoffAddress: string;
    dropoffCoordinates?: GeoPoint;
    dropoffPlaceId?: string;
    intermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
    passengerName: string;
    phone: string;
    email: string;
    additionalPassengers: AdditionalPassenger[];
    isBookerDifferent: boolean;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    contactRole: string;
    passengers: number;
    carryOnBags: number;
    checkedBags: number;
    bags: number;
    hasOversizedLuggage: boolean;
    oversizedBags: Record<string, number>;
    oversizedLuggageNotes: string;
    specialRequestFlags: { petFriendly: boolean; quietRide: boolean; musicOk: boolean };
    gateCode: string;
    selectedCustomExtras: Record<string, number>;
    carSeats: boolean;
    rearFacingCount: number;
    frontFacingCount: number;
    boosterCount: number;
    selectedVehicles: Array<VehicleChoice>;
    paymentMethod: 'cash' | 'card' | 'account';
    cardPaymentType: 'terminal' | 'payment_link' | 'card_on_file' | 'manual';
    cardholderName: string;
    cardNumber: string;
    cardExp: string;
    saveCardOnFile: boolean;
    corporateAccount: string;
    billingPo: string;
    authorizedBy: string;
    invoicingTerms: string;
    sendEmailConfirmation: boolean;
    tariff: string;
    selectedRuleId: string;
    discount: string;
    manualDiscountDollars: string;
    waiveAirportFee: boolean;
    waiveMultiStopFees: boolean;
    bypassSurge: boolean;
    waivedSurchargeIds?: string[];
    waivedExtraKeys?: string[];
    company: string;
    driverId: string;
    driverAssignmentMode?: 'send_to_driver' | 'stage_hold';
    notesForAll: string;
    internalNotes: string;
    returnTrip: boolean;
    returnPickupAddress: string;
    returnPickupCoordinates?: GeoPoint;
    returnDropoffAddress: string;
    returnDropoffCoordinates?: GeoPoint;
    returnIntermediateStops: Array<{ address: string; coordinates?: GeoPoint; placeId?: string }>;
    returnDate: string;
    returnTime: string;
    returnPassengers: number;
    returnCarryOnBags: number;
    returnCheckedBags: number;
    returnBags: number;
    returnHasOversizedLuggage: boolean;
    returnOversizedBags: Record<string, number>;
    returnOversizedLuggageNotes: string;
    returnCarSeats: boolean;
    returnRearFacing: number;
    returnFrontFacing: number;
    returnBooster: number;
    returnVehicles: Array<VehicleChoice>;
    autoCreateReturnTrip: boolean;
    returnEstimatedFare: number;
    returnEstimatedDurationMinutes: number;
    returnEstimatedDistanceMiles: number;
    returnProvideFlightInfo: boolean;
    returnAirline: string;
    returnFlightNumber: string;
    returnFlightOrigin: string;
    returnTailNumber: string;
    returnFboFacility: string;
    returnHasCheckedLuggage: boolean;
    repeat: boolean;
    repeatFrequency: 'daily' | 'weekdays' | 'weekly' | 'custom';
    repeatDays: string[];
    repeatOccurrences: number;
    repeatUntilDate: string;
    repeatWeeksPattern: 'all' | 'odd' | 'even';
    repeatSkipDates?: string[];
    estimatedFare: number;
    manualFare: string;
    isFareOverridden: boolean;
    estimatedDurationMinutes: number;
    estimatedDistanceMiles: number;
    provideFlightInfo: boolean;
    airline: string;
    flightNumber: string;
    flightOrigin: string;
    tailNumber: string;
    fboFacility: string;
    hasCheckedLuggage: boolean;
  };
  onValuesChange?: (values: DispatchFormValues) => void;
  onClearDraft?: () => void;
  onCopyBooking?: (values: DispatchFormValues) => void;
  onCloneBooking?: (values: DispatchFormValues) => void;
}

export function useDispatchDraftSync({
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
  setters,
  values,
  onValuesChange,
  onClearDraft,
  onCopyBooking,
  onCloneBooking,
}: UseDispatchDraftSyncParams) {
  const hydratedIdentityRef = useRef<string | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState<boolean>(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);

  const settersRef = useRef(setters);
  settersRef.current = setters;
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // Hydrate ONCE per tab identity
  useEffect(() => {
    const hydrationIdentity = initialTrip?.id
      ? `edit:${initialTrip.id}`
      : `draft:${draftStorageKey}`;
    if (hydratedIdentityRef.current === hydrationIdentity) {
      return;
    }
    hydratedIdentityRef.current = hydrationIdentity;
    if (driverExplicitlyChangedByUserRef) {
      driverExplicitlyChangedByUserRef.current = false;
    }

    const liveExtrasCfg = (() => {
      try {
        return getUniversalExtrasConfig();
      } catch {
        return universalExtrasConfig;
      }
    })();
    const liveVehicles = (() => {
      try {
        const cached = getAdminConfigService().getCachedSettings();
        return cached?.vehicles ? cached.vehicles.filter((v) => !v.isArchived) : vehicleTiers;
      } catch {
        return vehicleTiers;
      }
    })();
    const liveDispOpts = buildDispatchVehicleOptions(liveVehicles);
    const liveVehCaps = buildDispatchVehicleCapacities(liveDispOpts);

    if (initialTrip) {
      skipFirstEditQuoteRef.current = true;
      hydrateInitialTripIntoDispatchState(initialTrip, settersRef.current, {
        universalExtrasConfig: liveExtrasCfg,
        vehicleCapacities: liveVehCaps,
        dispatchVehicleOptions: liveDispOpts,
      });

      try {
        const savedEdit = localStorage.getItem(draftStorageKey);
        if (savedEdit) {
          const parsed = JSON.parse(savedEdit);
          if (parsed && parsed._editTripId === initialTrip.id) {
            applySavedDraftOverlayToDispatchState(parsed, settersRef.current, liveExtrasCfg, {
              initialTrip,
              driverExplicitlyChangedByUserRef,
            });
            if (parsed._savedAt) setDraftSavedAt(parsed._savedAt);
          }
        }
      } catch {}
    } else {
      try {
        const saved = localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed) {
            applySavedDraftOverlayToDispatchState(parsed, settersRef.current, liveExtrasCfg);
            if (parsed._savedAt) setDraftSavedAt(parsed._savedAt);
          }
        }
      } catch {}
    }

    setHasHydratedDraft(true);
  }, [initialTrip?.id, draftStorageKey]);

  // Keep open Edit tabs synced with external Queue / Driver App assignment or acceptance
  // unless the operator explicitly modified Driver in the form dropdown.
  useEffect(() => {
    if (!hasHydratedDraft || !isEditMode || !initialTrip) return;
    if (driverExplicitlyChangedByUserRef?.current) return;

    const s = settersRef.current;
    if (initialTrip.assignedDriverId) {
      if (values.driverId !== initialTrip.assignedDriverId) {
        s.setDriverId(initialTrip.assignedDriverId);
      }
      if (values.driverAssignmentMode !== 'send_to_driver') {
        s.setDriverAssignmentMode?.('send_to_driver');
      }
    } else if (initialTrip.plannedDriverId) {
      if (values.driverId !== initialTrip.plannedDriverId) {
        s.setDriverId(initialTrip.plannedDriverId);
      }
      if (values.driverAssignmentMode !== 'stage_hold') {
        s.setDriverAssignmentMode?.('stage_hold');
      }
    } else if (
      values.driverId !== 'unassigned' &&
      ['pending', 'confirmed', 'CONFIRMED', 'UNCONFIRMED', 'unconfirmed', 'offered'].includes(
        initialTrip.status
      )
    ) {
      s.setDriverId('unassigned');
      s.setDriverAssignmentMode?.('send_to_driver');
    }
  }, [
    hasHydratedDraft,
    isEditMode,
    initialTrip?.id,
    initialTrip?.assignedDriverId,
    initialTrip?.plannedDriverId,
    initialTrip?.status,
  ]);

  // Listen for POPULATE_BOOKING on WorkspaceBus
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg) => {
      if (msg.type === 'POPULATE_BOOKING') {
        const payload = msg.payload as any;
        if (payload.targetDraftId && payload.targetDraftId !== draftId) {
          return;
        }
        if (resolvedIsActiveDraft === false && !payload.targetDraftId) {
          return;
        }

        const s = settersRef.current;
        const curPax = valuesRef.current;
        const paxMode = resolvePopulatePassengerMode(curPax, payload);
        const keepPax = paxMode === 'keep_current';
        const fillPax = paxMode === 'fill_empty';
        if (payload.passengerName && !keepPax && !(fillPax && curPax?.passengerName)) {
          s.setPassengerName(payload.passengerName);
        }
        const contactPh = payload.passengerPhone || payload.phone;
        if (contactPh && !keepPax && !(fillPax && curPax?.phone)) s.setPhone(contactPh);
        const contactEm = payload.passengerEmail || payload.email;
        if (contactEm && !keepPax && !(fillPax && curPax?.email)) s.setEmail(contactEm);

        if (payload.pickupAddress) {
          s.setPickupAddress(payload.pickupAddress);
          s.setPickupCoordinates(payload.pickupCoordinates);
          s.setPickupPlaceId(undefined);
        }
        if (payload.dropoffAddress) {
          s.setDropoffAddress(payload.dropoffAddress);
          s.setDropoffCoordinates(payload.dropoffCoordinates);
          s.setDropoffPlaceId(undefined);
        }
        if (payload.date) {
          s.setTimingType('later');
          s.setScheduledDate(payload.date);
        }
        if (payload.time) {
          s.setTimingType('later');
          s.setScheduledTime(payload.time);
        }
        if (payload.airline || payload.airlineCode) {
          s.setAirline(String(payload.airline || payload.airlineCode));
        }
        if (payload.flightNumber) {
          s.setFlightNumber(String(payload.flightNumber));
        }
        if (payload.vehicleTier || payload.vehicle) {
          const v = String(payload.vehicleTier || payload.vehicle).toLowerCase();
          s.setSelectedVehicles([v as VehicleChoice]);
        }

        const acct = keepPax
          ? undefined
          : payload.corporateAccount || payload.corporateAccountName || payload.accountNumber;
        if (acct) {
          const matchedCorp = findMatchingCorporateAccount(corporateAccountList, String(acct), {
            caseInsensitiveName: true,
          });
          s.setCorporateAccount(matchedCorp ? matchedCorp.companyName : acct);
          s.setPaymentMethod('account');
        }

        const po = keepPax ? undefined : payload.billingPo || payload.poNumber;
        if (po) {
          s.setBillingPo(po);
        }

        if (payload.notes) {
          s.setInternalNotesUpdater((prev) => {
            if (prev && prev.includes(payload.notes)) return prev;
            return prev ? `${prev}\n${payload.notes}` : payload.notes;
          });
        }

        if (payload.accessibilityNeeds) {
          let needsWheelchair = false;
          if (Array.isArray(payload.accessibilityNeeds)) {
            needsWheelchair = payload.accessibilityNeeds.some(
              (n: string) =>
                n.toLowerCase().includes('wheelchair') || n.toLowerCase().includes('ramp')
            );
          } else if (typeof payload.accessibilityNeeds === 'object') {
            needsWheelchair = !!(payload.accessibilityNeeds as any).wheelchair;
          }
          if (needsWheelchair) {
            s.setSelectedVehicles(['wheelchair']);
          }
        }
      }
    });
    return unsub;
  }, [draftId, resolvedIsActiveDraft, corporateAccountList]);

  const v = values;

  const currentFormValues = useMemo<DispatchFormValues>(() => {
    const balancedLeg = Math.max(
      Math.ceil(v.estimatedFare),
      Math.ceil(v.returnEstimatedFare || v.estimatedFare)
    );
    return {
      timingType: v.timingType,
      scheduledDate: v.scheduledDate,
      scheduledTime: v.scheduledTime,
      pickupAddress: v.pickupAddress,
      pickupCoordinates: v.pickupCoordinates,
      pickupPlaceId: v.pickupPlaceId,
      dropoffAddress: v.dropoffAddress,
      dropoffCoordinates: v.dropoffCoordinates,
      dropoffPlaceId: v.dropoffPlaceId,
      intermediateStops: v.intermediateStops,
      passengerName: v.passengerName,
      phone: v.phone,
      email: v.email,
      additionalPassengers: v.additionalPassengers,
      contactPerson: {
        isBookerDifferent: v.isBookerDifferent,
        contactName: v.contactName,
        contactPhone: v.contactPhone,
        contactEmail: v.contactEmail,
        contactRole: v.contactRole,
      },
      passengers: v.passengers,
      carryOnBags: v.carryOnBags,
      checkedBags: v.checkedBags,
      bags: v.bags,
      carSeats: v.carSeats,
      carSeatsBreakdown: {
        rearFacing: v.rearFacingCount,
        frontFacing: v.frontFacingCount,
        booster: v.boosterCount,
      },
      selectedVehicles: v.selectedVehicles,
      vehicle: v.selectedVehicles[0] || 'sedan',
      paymentMethod: v.paymentMethod,
      cardDetails: {
        cardPaymentType: v.cardPaymentType,
        cardholderName: v.cardholderName,
        cardNumber: v.cardNumber ? v.cardNumber.replace(/\D/g, '').slice(-4) : '',
        cardExp: v.cardExp,
        cardCvc: '',
        saveCardOnFile: v.saveCardOnFile,
      },
      corporateDetails: {
        corporateAccount: v.corporateAccount,
        billingPo: v.billingPo,
        authorizedBy: v.authorizedBy,
        invoicingTerms: v.invoicingTerms,
      },
      tariff: v.tariff,
      pricingRuleId: v.selectedRuleId || undefined,
      pricingRuleName: availableNamedRules.find((r) => r.id === v.selectedRuleId)?.name,
      discount: v.discount,
      company: v.company,
      driverId: v.driverId,
      driverAssignmentMode: v.driverAssignmentMode,
      notesForAll: v.notesForAll,
      internalNotes: v.internalNotes,
      returnDetails: {
        returnTrip: v.returnTrip,
        returnPickupAddress: v.returnPickupAddress,
        returnPickupCoordinates: v.returnPickupCoordinates,
        returnDropoffAddress: v.returnDropoffAddress,
        returnDropoffCoordinates: v.returnDropoffCoordinates,
        returnIntermediateStops: v.returnIntermediateStops,
        returnDate: v.returnDate,
        returnTime: v.returnTime,
        returnPassengers: v.returnPassengers,
        returnCarryOnBags: v.returnCarryOnBags,
        returnCheckedBags: v.returnCheckedBags,
        returnBags: v.returnBags,
        returnHasOversizedLuggage: v.returnHasOversizedLuggage,
        returnOversizedBags: v.returnOversizedBags,
        returnOversizedLuggageNotes: v.returnOversizedLuggageNotes,
        returnCarSeats: v.returnCarSeats,
        returnCarSeatsBreakdown: {
          rearFacing: v.returnRearFacing,
          frontFacing: v.returnFrontFacing,
          booster: v.returnBooster,
        },
        returnVehicles: v.returnVehicles,
        autoCreateReturnTrip: v.autoCreateReturnTrip,
        returnEstimatedFare: v.returnEstimatedFare,
        returnEstimatedDurationMinutes: v.returnEstimatedDurationMinutes,
        returnEstimatedDistanceMiles: v.returnEstimatedDistanceMiles,
        returnProvideFlightInfo: v.returnProvideFlightInfo,
        returnAirline: v.returnAirline,
        returnFlightNumber: v.returnFlightNumber,
        returnFlightOrigin: v.returnFlightOrigin,
        returnTailNumber: v.returnTailNumber,
        returnFboFacility: v.returnFboFacility,
        returnHasCheckedLuggage: v.returnHasCheckedLuggage,
      },
      repeatDetails: {
        repeat: v.repeat,
        repeatFrequency: v.repeatFrequency,
        repeatDays: v.repeatDays,
        repeatOccurrences: v.repeatOccurrences,
        repeatUntilDate: v.repeatUntilDate,
        repeatWeeksPattern: v.repeatWeeksPattern,
        repeatSkipDates: v.repeatSkipDates || [],
        repeatsRoundTrip: v.returnTrip,
      },
      estimatedFare: v.returnTrip ? balancedLeg : Math.ceil(v.estimatedFare),
      returnEstimatedFare: v.returnTrip ? balancedLeg : Math.ceil(v.returnEstimatedFare),
      totalCalculatedFare: v.returnTrip ? balancedLeg * 2 : Math.ceil(v.estimatedFare),
      manualFare: v.manualFare,
      isFareOverridden: v.isFareOverridden,
      estimatedDurationMinutes: v.estimatedDurationMinutes,
      estimatedDistanceMiles: v.estimatedDistanceMiles,
      provideFlightInfo: v.provideFlightInfo,
      airline: v.airline,
      flightNumber: v.flightNumber,
      flightOrigin: v.flightOrigin,
      tailNumber: v.tailNumber,
      fboFacility: v.fboFacility,
      hasCheckedLuggage: v.hasCheckedLuggage,
    };
  }, [v, availableNamedRules]);

  const draftPersistJson = useMemo(() => {
    return JSON.stringify({
      _editTripId: isEditMode ? initialTrip?.id : undefined,
      _explicitlyChangedDriver: Boolean(driverExplicitlyChangedByUserRef?.current),
      _explicitlyUnassigned: Boolean(
        driverExplicitlyChangedByUserRef?.current && v.driverId === 'unassigned'
      ),
      ...currentFormValues,
      pickupPlaceId: v.pickupPlaceId,
      dropoffPlaceId: v.dropoffPlaceId,
      isBookerDifferent: v.isBookerDifferent,
      contactName: v.contactName,
      contactPhone: v.contactPhone,
      contactEmail: v.contactEmail,
      contactRole: v.contactRole,
      hasOversizedLuggage: v.hasOversizedLuggage,
      oversizedBags: v.oversizedBags,
      oversizedLuggageNotes: v.oversizedLuggageNotes,
      specialRequestFlags: v.specialRequestFlags,
      gateCode: v.gateCode,
      selectedCustomExtras: v.selectedCustomExtras,
      rearFacingCount: v.rearFacingCount,
      frontFacingCount: v.frontFacingCount,
      boosterCount: v.boosterCount,
      cardPaymentType: v.cardPaymentType,
      cardholderName: v.cardholderName,
      corporateAccount: v.corporateAccount,
      billingPo: v.billingPo,
      authorizedBy: v.authorizedBy,
      invoicingTerms: v.invoicingTerms,
      sendEmailConfirmation: v.sendEmailConfirmation,
      manualDiscountDollars: v.manualDiscountDollars,
      waiveAirportFee: v.waiveAirportFee,
      waiveMultiStopFees: v.waiveMultiStopFees,
      bypassSurge: v.bypassSurge,
      waivedSurchargeIds: v.waivedSurchargeIds || [],
      waivedExtraKeys: v.waivedExtraKeys || [],
      returnTrip: v.returnTrip,
      returnPickupAddress: v.returnPickupAddress,
      returnPickupCoordinates: v.returnPickupCoordinates,
      returnDropoffAddress: v.returnDropoffAddress,
      returnDropoffCoordinates: v.returnDropoffCoordinates,
      returnIntermediateStops: v.returnIntermediateStops,
      returnDate: v.returnDate,
      returnTime: v.returnTime,
      returnPassengers: v.returnPassengers,
      returnCarryOnBags: v.returnCarryOnBags,
      returnCheckedBags: v.returnCheckedBags,
      returnBags: v.returnBags,
      returnHasOversizedLuggage: v.returnHasOversizedLuggage,
      returnOversizedBags: v.returnOversizedBags,
      returnOversizedLuggageNotes: v.returnOversizedLuggageNotes,
      returnCarSeats: v.returnCarSeats,
      returnRearFacing: v.returnRearFacing,
      returnFrontFacing: v.returnFrontFacing,
      returnBooster: v.returnBooster,
      returnVehicles: v.returnVehicles,
      autoCreateReturnTrip: v.autoCreateReturnTrip,
      repeat: v.repeat,
      repeatFrequency: v.repeatFrequency,
      repeatDays: v.repeatDays,
      repeatOccurrences: v.repeatOccurrences,
      repeatUntilDate: v.repeatUntilDate,
      repeatWeeksPattern: v.repeatWeeksPattern,
      repeatSkipDates: v.repeatSkipDates || [],
      returnProvideFlightInfo: v.returnProvideFlightInfo,
      returnAirline: v.returnAirline,
      returnFlightNumber: v.returnFlightNumber,
      returnFlightOrigin: v.returnFlightOrigin,
      returnTailNumber: v.returnTailNumber,
      returnFboFacility: v.returnFboFacility,
      returnHasCheckedLuggage: v.returnHasCheckedLuggage,
    });
  }, [isEditMode, initialTrip?.id, currentFormValues, v]);

  useEffect(() => {
    if (!hasHydratedDraft) return;

    try {
      const hasMeaningfulData = Boolean(
        isEditMode ||
          v.pickupAddress.trim() ||
          v.dropoffAddress.trim() ||
          v.passengerName.trim() ||
          v.phone.trim() ||
          v.email.trim() ||
          v.notesForAll.trim() ||
          v.internalNotes.trim() ||
          v.selectedVehicles.length > 1 ||
          v.intermediateStops.length > 0
      );
      if (hasMeaningfulData) {
        const savedTimestamp = Date.now();
        const payloadObj = JSON.parse(draftPersistJson);
        payloadObj._savedAt = savedTimestamp;
        localStorage.setItem(draftStorageKey, JSON.stringify(payloadObj));
        setDraftSavedAt(savedTimestamp);
      } else {
        localStorage.removeItem(draftStorageKey);
        setDraftSavedAt(null);
      }
    } catch {}

    onValuesChangeRef.current?.(currentFormValues);
  }, [hasHydratedDraft, draftStorageKey, isEditMode, draftPersistJson]);

  const handleClear = () => {
    if (driverExplicitlyChangedByUserRef) {
      driverExplicitlyChangedByUserRef.current = false;
    }
    const s = settersRef.current;
    s.setTimingType('asap');
    s.setPickupAddress('');
    s.setPickupCoordinates(undefined);
    s.setPickupPlaceId(undefined);
    s.setDropoffAddress('');
    s.setDropoffCoordinates(undefined);
    s.setDropoffPlaceId(undefined);
    s.setIntermediateStops([]);
    s.setPassengerName('');
    s.setPhone('');
    s.setEmail('');
    s.setAdditionalPassengers([]);
    s.setIsBookerDifferent(false);
    s.setContactName('');
    s.setContactPhone('');
    s.setContactEmail('');
    s.setPassengers(1);
    s.setCarryOnBags(0);
    s.setCheckedBags(0);
    s.setBags(0);
    s.setCarSeats(false);
    s.setRearFacingCount(0);
    s.setFrontFacingCount(0);
    s.setBoosterCount(0);
    s.setHasOversizedLuggage(false);
    s.setOversizedBags({});
    s.setOversizedLuggageNotes('');
    s.setSelectedCustomExtras({});
    s.setShowSpecialRequests(false);
    s.setSpecialRequestFlags({ petFriendly: false, quietRide: false, musicOk: false });
    s.setGateCode('');
    s.setSelectedVehicles(['any']);
    s.setPaymentMethod('cash');
    s.setCardPaymentType('terminal');
    s.setCardholderName('');
    s.setCardNumber('');
    s.setCardExp('');
    s.setCardCvc('');
    s.setCorporateAccount(DEFAULT_CORPORATE_ACCOUNTS[0]);
    s.setBillingPo('');
    s.setAuthorizedBy('');
    s.setTariff('Standard');
    s.setSelectedRuleId('');
    s.setDiscount('None');
    s.setManualDiscountDollars('');
    s.setWaiveAirportFee(false);
    s.setWaiveMultiStopFees(false);
    s.setBypassSurge(false);
    s.setWaivedSurchargeIds?.([]);
    s.setWaivedExtraKeys?.([]);
    s.setDriverId('unassigned');
    s.setDriverAssignmentMode?.('send_to_driver');
    s.setNotesForAll('');
    s.setInternalNotes('');
    s.setReturnTrip(false);
    s.setReturnPickupAddress('');
    s.setReturnPickupCoordinates(undefined);
    s.setReturnDropoffAddress('');
    s.setReturnDropoffCoordinates(undefined);
    s.setReturnIntermediateStops([]);
    s.setReturnPassengers(1);
    s.setReturnCarryOnBags(0);
    s.setReturnCheckedBags(0);
    s.setReturnBags(0);
    s.setReturnHasOversizedLuggage(false);
    s.setReturnOversizedBags({});
    s.setReturnOversizedLuggageNotes('');
    s.setReturnCarSeats(false);
    s.setReturnRearFacing(0);
    s.setReturnFrontFacing(0);
    s.setReturnBooster(0);
    s.setReturnVehicles(['any']);
    s.setRepeat(false);
    s.setRepeatSkipDates?.([]);
    s.setEstimatedFare(0);
    s.setOutboundPricing(null);
    s.setReturnEstimatedFare(0);
    s.setReturnEstimatedDurationMinutes(0);
    s.setReturnEstimatedDistanceMiles(0);
    s.setManualFare('');
    s.setIsFareOverridden(false);
    s.setEstimatedDurationMinutes(0);
    s.setEstimatedDistanceMiles(0);
    s.setProvideFlightInfo(false);
    s.setAirline('');
    s.setFlightNumber('');
    s.setFlightOrigin('');
    s.setTailNumber('');
    s.setFboFacility('');
    s.setHasCheckedLuggage(false);
    s.setReturnProvideFlightInfo(false);
    s.setReturnAirline('');
    s.setReturnFlightNumber('');
    s.setReturnFlightOrigin('');
    s.setReturnTailNumber('');
    s.setReturnFboFacility('');
    s.setReturnHasCheckedLuggage(false);
    s.setOutboundFlightTelemetry(null);
    s.setReturnFlightTelemetry(null);
    s.setSubmitError(null);
    setDraftSavedAt(null);

    try {
      localStorage.removeItem(draftStorageKey);
    } catch {}

    onClearDraft?.();
  };

  const handleCopyBooking = () => {
    const copiedValues: DispatchFormValues = {
      ...currentFormValues,
      pricingRuleName: undefined,
      driverId: 'unassigned',
      repeatDetails: {
        ...currentFormValues.repeatDetails,
        repeatWeeksPattern: 'all',
      },
    };
    if (onCopyBooking) {
      onCopyBooking(copiedValues);
    } else if (onCloneBooking) {
      onCloneBooking(copiedValues);
    }
  };

  return {
    draftSavedAt,
    handleClear,
    handleCopyBooking,
  };
}
