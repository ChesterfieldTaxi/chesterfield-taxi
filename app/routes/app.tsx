import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import UnderConstruction from '../components/UnderConstruction';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import { getPassengerService } from '../core/services/passenger.service';
import type {
  PassengerAccount,
  SavedPlace,
  SavedPlaceCategory,
} from '../core/types/passenger';
import type { GeoPoint, Trip, TripStatus, VehicleTier } from '../core/types/trip';
import type { VehicleTierConfig } from '../core/types/config';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { formatLocalDateStr } from '../core/services/pricing/vehicle-matching';
import {
  MapPinIcon,
  CarIcon,
  PhoneIcon,
  ClockIcon,
  CheckIcon,
  PlusIcon,
  UserIcon,
  ShieldCheckIcon,
  PlaneLandingIcon,
  BuildingIcon,
  LuggageIcon,
  MailIcon,
  ExternalLinkIcon,
  SpinnerIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
  InfoIcon,
  ArrowLeftRightIcon,
  RadioIcon,
  HomeModernIcon,
  PlaneIcon,
  SparklesIcon,
} from '../components/ui/Icons';
import { BookingEngineV2, type BookingEngineV2InitialValues } from '../components/domain/BookingEngineV2';
import { PriceBreakdownPanel } from '../components/domain/booking/PriceBreakdownPanel';
import { DispatchLocationInput } from '../components/domain/dispatch/DispatchLocationInput';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import { formatVehicleTierDisplay } from '../core/services/email/email-templates';

export function meta() {
  return [
    { title: 'Passenger App & Saved Places – Chesterfield Taxi' },
    {
      name: 'description',
      content:
        'Manage your frequent pickup addresses, review past ride receipts, track live trips in real time, and rebook rides in two taps.',
    },
  ];
}

type TabKey = 'book' | 'trips' | 'places' | 'profile';

export default function PassengerAppRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get('preview') === 'true';

  const [constructionMode, setConstructionMode] = useState<boolean>(() => {
    try {
      const cached = getAdminConfigService().getCachedSettings();
      if (cached?.constructionMode !== undefined) {
        return cached.constructionMode;
      }
    } catch {}
    return COMPANY_CONFIG.constructionMode ?? false;
  });
  const [companySettings, setCompanySettings] = useState(() => getAdminConfigService().getCachedSettings().company);
  const [brandPrimary, setBrandPrimary] = useState<string>(
    () => getAdminConfigService().getCachedSettings().branding?.primaryColor || COMPANY_CONFIG.primaryColor || '#2563eb'
  );
  const [adminVehicles, setAdminVehicles] = useState<VehicleTierConfig[]>(
    () => (getAdminConfigService().getCachedSettings().vehicles || []).filter((v) => !v.isArchived)
  );

  useEffect(() => {
    const configService = getAdminConfigService();
    if (configService.subscribeToSettings) {
      const unsub = configService.subscribeToSettings((settings) => {
        if (settings?.constructionMode !== undefined) {
          setConstructionMode(settings.constructionMode);
        }
        if (settings?.company) setCompanySettings(settings.company);
        if (settings?.branding?.primaryColor) setBrandPrimary(settings.branding.primaryColor);
        if (settings?.vehicles?.length) {
          setAdminVehicles(settings.vehicles.filter((v) => !v.isArchived));
        }
      });
      return unsub;
    }
  }, []);

  const passengerService = getPassengerService();

  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [account, setAccount] = useState<PassengerAccount>(() =>
    passengerService.getCachedAccount()
  );
  const [activeTab, setActiveTab] = useState<TabKey>('book');
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>(['customer']);

  // Auth guard + bind real authenticated Firebase UID to PassengerService
  useEffect(() => {
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged((currentUser: any) => {
      if (!currentUser) {
        passengerService.bindToAuthUser(null);
        setAuthUserUid(null);
        navigate('/app/login?message=unauthenticated&redirect=/app/passenger', { replace: true });
      } else {
        const roles: string[] = currentUser.roles || (currentUser.role ? [currentUser.role] : ['customer']);
        if (!roles.includes('customer') && !roles.includes('admin')) {
          navigate('/app', { replace: true });
          return;
        }
        passengerService.bindToAuthUser({
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          phone: currentUser.phone,
        });
        setAuthUserUid(currentUser.uid);
        setUserRoles(roles);
        setIsAuthChecking(false);
      }
    });
    return unsubscribe;
  }, [navigate, passengerService]);

  // Trip History state
  const [historyFilter, setHistoryFilter] = useState<'all' | 'upcoming' | 'history'>('upcoming');
  const [selectedReceiptTrip, setSelectedReceiptTrip] = useState<Trip | null>(null);

  // Saved Places Modal state (now stores exact coordinates & placeId from Places Autocomplete!)
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [placeCategory, setPlaceCategory] = useState<SavedPlaceCategory>('home');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeCoordinates, setPlaceCoordinates] = useState<GeoPoint | undefined>(undefined);
  const [placeNotes, setPlaceNotes] = useState('');

  // Profile Form state
  const [profileFirstName, setProfileFirstName] = useState('');
  const [profileLastName, setProfileLastName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileNotes, setProfileNotes] = useState('');
  const [profileVehicleTier, setProfileVehicleTier] = useState<VehicleTier>('standard');
  const [profileSms, setProfileSms] = useState(true);
  const [profileEmailReceipts, setProfileEmailReceipts] = useState(true);
  const [profileCalls, setProfileCalls] = useState(true);

  // Floating Help & FAQ state
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const [isFaqModalOpen, setIsFaqModalOpen] = useState(false);

  // Feedback toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Subscribe to Account
  useEffect(() => {
    const unsub = passengerService.subscribeToAccount((updated) => {
      setAccount(updated);
      setProfileFirstName(updated.firstName);
      setProfileLastName(updated.lastName);
      setProfilePhone(updated.phone);
      setProfileEmail(updated.email);
      setProfileNotes(updated.passengerNotes || '');
      setProfileVehicleTier(updated.preferredVehicleTier || 'standard');
      setProfileSms(updated.communicationPreferences.smsUpdates);
      setProfileEmailReceipts(updated.communicationPreferences.emailReceipts);
      setProfileCalls(updated.communicationPreferences.phoneCalls);
    });
    return unsub;
  }, [passengerService]);

  // Close Receipt Modal on Escape key
  useEffect(() => {
    if (!selectedReceiptTrip) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedReceiptTrip(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedReceiptTrip]);

  // Real-time scoped Firestore subscriptions for Active Trip AND Full Trips History
  useEffect(() => {
    if (!authUserUid) return;
    setIsLoadingTrips(true);

    const unsubActive = passengerService.subscribeToActiveTrip((trip) => {
      setActiveTrip(trip);
    });

    const unsubAll = passengerService.subscribeToPassengerTrips((history: Trip[]) => {
      setTrips(history);
      setIsLoadingTrips(false);
    });

    return () => {
      unsubActive();
      unsubAll();
    };
  }, [passengerService, authUserUid, account.email]);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return trips.filter((t) => {
      const isHistory = t.status === 'completed' || t.status === 'cancelled' || t.status === 'DECLINED' || t.status === 'declined';
      if (historyFilter === 'upcoming') return !isHistory;
      if (historyFilter === 'history') return isHistory;
      return true;
    });
  }, [trips, historyFilter]);

  // Booking initial values synced cleanly whenever real passenger profile hydrates
  const [bookingInitialValues, setBookingInitialValues] = useState<BookingEngineV2InitialValues>(() => ({
    passengerName: `${account.firstName} ${account.lastName}`.trim(),
    passengerPhone: account.phone || '',
    passengerEmail: account.email || '',
    driverNotes: account.passengerNotes || '',
    vehicleChoice: account.preferredVehicleTier || 'any',
  }));

  useEffect(() => {
    if (!account.id) return;
    setBookingInitialValues((prev) => ({
      ...prev,
      passengerName: prev.passengerName || `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: prev.passengerPhone || account.phone || '',
      passengerEmail: prev.passengerEmail || account.email || '',
      driverNotes: prev.driverNotes || account.passengerNotes || '',
    }));
  }, [account.id, account.firstName, account.lastName, account.phone, account.email, account.passengerNotes]);

  const isStaff = userRoles.includes('admin') || userRoles.includes('dispatcher');
  const hasAnyStaffOrDriverRole = isStaff || userRoles.includes('driver');

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <SpinnerIcon className="w-9 h-9 text-blue-600 animate-spin mb-3" />
        <p className="text-sm font-bold text-slate-700">Loading your passenger portal...</p>
      </div>
    );
  }

  if (constructionMode && !(isPreview && isStaff)) {
    return <UnderConstruction />;
  }

  const resolveTripVehicleChoice = (trip: Trip): string => {
    const meta = (trip.metadata || {}) as Record<string, any>;
    if (typeof meta.vehicleTypeId === 'string' && meta.vehicleTypeId) return meta.vehicleTypeId;
    return trip.vehicleTier || 'any';
  };

  // Rebook an existing trip inside /app
  const handleRebookTrip = (trip: Trip) => {
    setEditingTripId(null);
    setBookingInitialValues({
      pickupAddress: trip.pickupLocation?.address || '',
      pickupCoordinates: trip.pickupLocation?.coordinates,
      dropoffAddress: trip.dropoffLocation?.address || '',
      dropoffCoordinates: trip.dropoffLocation?.coordinates,
      driverNotes: trip.driverNotes || trip.passenger?.specialRequests || account.passengerNotes || '',
      vehicleChoice: resolveTripVehicleChoice(trip),
      passengers: trip.passenger?.passengerCount || 1,
      passengerName: `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: account.phone || '',
      passengerEmail: account.email || '',
    });
    setActiveTab('book');
    showToast(`Loaded details from Trip #${trip.id} into booking form.`);
  };

  // Book return ride (swapping pickup and dropoff) inside /app
  const handleBookReturnTrip = (trip: Trip) => {
    setEditingTripId(null);
    setBookingInitialValues({
      pickupAddress: trip.dropoffLocation?.address || '',
      pickupCoordinates: trip.dropoffLocation?.coordinates,
      dropoffAddress: trip.pickupLocation?.address || '',
      dropoffCoordinates: trip.pickupLocation?.coordinates,
      driverNotes: trip.driverNotes || trip.passenger?.specialRequests || account.passengerNotes || '',
      vehicleChoice: resolveTripVehicleChoice(trip),
      passengers: trip.passenger?.passengerCount || 1,
      passengerName: `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: account.phone || '',
      passengerEmail: account.email || '',
    });
    setActiveTab('book');
    const returnFrom = trip.dropoffLocation?.address?.split(',')[0] || 'destination';
    const returnTo = trip.pickupLocation?.address?.split(',')[0] || 'pickup';
    showToast(`Loaded return ride: ${returnFrom} → ${returnTo}`);
  };

  // Edit upcoming pre-dispatch trip (fixes UTC date shift bug & locks active rides!)
  const handleEditTrip = (trip: Trip) => {
    if (['en_route', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(trip.status)) {
      showToast('This ride is already underway. Please call dispatch to make changes.');
      return;
    }
    const pickupDateObj = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime) : null;
    setEditingTripId(trip.id);
    setBookingInitialValues({
      pickupAddress: trip.pickupLocation?.address || '',
      pickupCoordinates: trip.pickupLocation?.coordinates,
      dropoffAddress: trip.dropoffLocation?.address || '',
      dropoffCoordinates: trip.dropoffLocation?.coordinates,
      driverNotes: trip.driverNotes || trip.passenger?.specialRequests || account.passengerNotes || '',
      vehicleChoice: resolveTripVehicleChoice(trip),
      passengers: trip.passenger?.passengerCount || 1,
      passengerName: `${trip.passenger?.firstName || account.firstName} ${trip.passenger?.lastName || account.lastName}`.trim(),
      passengerPhone: trip.passenger?.phone || account.phone || '',
      passengerEmail: trip.passenger?.email || account.email || '',
      timingType: trip.bookingType === 'asap' ? 'asap' : 'later',
      scheduledDate: pickupDateObj && !Number.isNaN(pickupDateObj.getTime()) ? formatLocalDateStr(pickupDateObj) : '',
      scheduledTime: pickupDateObj && !Number.isNaN(pickupDateObj.getTime()) ? pickupDateObj.toTimeString().slice(0, 5) : '',
    });
    setActiveTab('book');
    showToast(`Editing Trip #${trip.id} — save your changes below.`);
  };

  // Cancel reservation (blocks en_route/arrived/in_progress; warns on <2h policy)
  const handleCancelTrip = async (trip: Trip) => {
    if (['en_route', 'arrived', 'in_progress'].includes(trip.status)) {
      showToast('Your chauffeur is already on the way. Please call dispatch to cancel.');
      return;
    }
    const isWithinTwoHours =
      trip.scheduledPickupTime &&
      new Date(trip.scheduledPickupTime).getTime() - Date.now() < 2 * 60 * 60 * 1000 &&
      new Date(trip.scheduledPickupTime).getTime() > Date.now();
    const confirmMsg = isWithinTwoHours
      ? `Reservation #${trip.id} is within 2 hours of pickup (late cancellation policy may apply). Cancel anyway?`
      : `Are you sure you want to cancel reservation #${trip.id}?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    try {
      const bookingService = getBookingService();
      if (bookingService.cancelBooking) {
        await bookingService.cancelBooking(trip.id, 'Cancelled by passenger', 'passenger');
      }
      setTrips((prev) =>
        prev.map((t) => (t.id === trip.id ? { ...t, status: 'cancelled' as TripStatus } : t))
      );
      if (activeTrip?.id === trip.id) {
        setActiveTrip(null);
      }
      showToast(`Reservation #${trip.id} has been cancelled.`);
    } catch (err) {
      console.error('Error cancelling trip:', err);
      showToast('Could not cancel trip. Please contact dispatch.');
    }
  };

  const handleSignOut = async () => {
    try {
      passengerService.clearLocalSession();
      await getAdminAuthService().signOut();
    } catch {}
    showToast('Signed out of Passenger Portal.');
    setTimeout(() => navigate('/app/login?message=logged_out'), 500);
  };

  // Quick 1-tap chip destination select (passes coordinates too!)
  const handleSelectChip = (place: SavedPlace) => {
    setBookingInitialValues((prev) => ({
      ...prev,
      dropoffAddress: place.address,
      dropoffCoordinates: place.coordinates,
      driverNotes: place.notes || prev.driverNotes || account.passengerNotes || '',
      passengerName: `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: account.phone || '',
      passengerEmail: account.email || '',
    }));
    setActiveTab('book');
    showToast(`Destination set to ${place.label}`);
  };

  // Saved place: Ride to here
  const handleRideToPlace = (place: SavedPlace) => {
    setBookingInitialValues((prev) => ({
      ...prev,
      dropoffAddress: place.address,
      dropoffCoordinates: place.coordinates,
      driverNotes: place.notes || prev.driverNotes || account.passengerNotes || '',
      passengerName: `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: account.phone || '',
      passengerEmail: account.email || '',
    }));
    setActiveTab('book');
    showToast(`Destination set to ${place.label}`);
  };

  // Saved place: Ride from here
  const handleRideFromPlace = (place: SavedPlace) => {
    setBookingInitialValues((prev) => ({
      ...prev,
      pickupAddress: place.address,
      pickupCoordinates: place.coordinates,
      driverNotes: place.notes || prev.driverNotes || account.passengerNotes || '',
      passengerName: `${account.firstName} ${account.lastName}`.trim(),
      passengerPhone: account.phone || '',
      passengerEmail: account.email || '',
    }));
    setActiveTab('book');
    showToast(`Pickup origin set to ${place.label}`);
  };

  // Saved Places CRUD
  const handleOpenPlaceModal = (place?: SavedPlace) => {
    if (place) {
      setEditingPlaceId(place.id);
      setPlaceLabel(place.label);
      setPlaceCategory(place.category);
      setPlaceAddress(place.address);
      setPlaceCoordinates(place.coordinates);
      setPlaceNotes(place.notes || '');
    } else {
      setEditingPlaceId(null);
      setPlaceLabel('');
      setPlaceCategory('favorite');
      setPlaceAddress('');
      setPlaceCoordinates(undefined);
      setPlaceNotes('');
    }
    setIsPlaceModalOpen(true);
  };

  const handleSavePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeLabel.trim() || !placeAddress.trim()) {
      showToast('Please provide both a label and address.');
      return;
    }

    try {
      if (editingPlaceId) {
        await passengerService.updateSavedPlace(editingPlaceId, {
          label: placeLabel.trim(),
          category: placeCategory,
          address: placeAddress.trim(),
          coordinates: placeCoordinates,
          notes: placeNotes.trim() || undefined,
        });
        showToast('Saved place updated successfully.');
      } else {
        await passengerService.addSavedPlace({
          label: placeLabel.trim(),
          category: placeCategory,
          address: placeAddress.trim(),
          coordinates: placeCoordinates,
          notes: placeNotes.trim() || undefined,
        });
        showToast('New place added to your shortcuts.');
      }
      setIsPlaceModalOpen(false);
    } catch {
      showToast('Error saving location. Please try again.');
    }
  };

  const handleDeletePlace = async (id: string, label: string) => {
    if (confirm(`Remove "${label}" from your saved places?`)) {
      try {
        await passengerService.deleteSavedPlace(id);
        showToast(`"${label}" removed.`);
      } catch {
        showToast('Error removing place.');
      }
    }
  };

  // Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await passengerService.updateAccount({
        firstName: profileFirstName.trim(),
        lastName: profileLastName.trim(),
        phone: profilePhone.trim(),
        email: profileEmail.trim(),
        passengerNotes: profileNotes.trim(),
        preferredVehicleTier: profileVehicleTier,
        communicationPreferences: {
          smsUpdates: profileSms,
          emailReceipts: profileEmailReceipts,
          phoneCalls: profileCalls,
        },
      });
      showToast('Profile and preferences updated.');
    } catch {
      showToast('Failed to save profile changes.');
    }
  };

  // Helper: Format status
  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckIcon className="w-3 h-3" /> Completed
          </span>
        );
      case 'cancelled':
      case 'DECLINED':
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            Cancelled
          </span>
        );
      case 'UNCONFIRMED':
      case 'unconfirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
            Requested (Unconfirmed)
          </span>
        );
      case 'CONFIRMED':
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Confirmed
          </span>
        );
      case 'assigned':
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            Driver Assigned
          </span>
        );
      case 'en_route':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
            Driver En Route
          </span>
        );
      case 'arrived':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200 animate-bounce">
            Driver Arrived
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            On Trip
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  const getCategoryIcon = (category: SavedPlaceCategory) => {
    switch (category) {
      case 'home':
        return <HomeModernIcon className="w-4 h-4 text-blue-600" />;
      case 'work':
        return <BuildingIcon className="w-4 h-4 text-slate-600" />;
      case 'airport':
        return <PlaneIcon className="w-4 h-4 text-sky-600" />;
      case 'medical':
        return <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />;
      case 'favorite':
        return <SparklesIcon className="w-4 h-4 text-indigo-600" />;
      default:
        return <MapPinIcon className="w-4 h-4 text-slate-500" />;
    }
  };

  const displayCompanyName = companySettings?.name || COMPANY_CONFIG.name;
  const displayCompanyPhone = companySettings?.phone || COMPANY_CONFIG.phone.primary;
  const displayCompanyPhoneRaw = displayCompanyPhone.replace(/[^\d+]/g, '') || COMPANY_CONFIG.phone.primaryRaw;
  const displayCompanyEmail = companySettings?.email || COMPANY_CONFIG.email.dispatch;
  const displayCompanyAddress = companySettings?.address || `${COMPANY_CONFIG.address.street}, ${COMPANY_CONFIG.address.city}, ${COMPANY_CONFIG.address.state} ${COMPANY_CONFIG.address.zip}`;
  const fullName = `${account.firstName} ${account.lastName}`.trim();

  const resolveTripVehicleName = (trip: Trip): string => {
    const meta = (trip.metadata || {}) as Record<string, any>;
    const explicitName = typeof meta.vehicleDisplayName === 'string' ? meta.vehicleDisplayName : undefined;
    const tierOrId = typeof meta.vehicleTypeId === 'string' && meta.vehicleTypeId ? meta.vehicleTypeId : trip.vehicleTier;
    return formatVehicleTierDisplay(tierOrId, adminVehicles, explicitName);
  };

  const resolveTripDriverName = (trip: Trip): string => {
    const meta = (trip.metadata || {}) as Record<string, any>;
    return String(meta.assignedDriverName || meta.driverName || (trip.assignedDriverId ? 'Assigned Chauffeur' : 'Pending Assignment'));
  };

  return (
    <div
      className="min-h-screen bg-slate-100 text-slate-900 pb-24 md:pb-12 flex flex-col font-sans"
      style={{
        '--brand-primary': brandPrimary || '#2563eb',
        '--btn-primary-bg': brandPrimary || '#2563eb',
        '--btn-primary-text': '#ffffff',
        '--btn-radius': '12px',
      } as React.CSSProperties}
    >
      {/* Toast Notification (offset above mobile Help FAB) */}
      {toastMessage && (
        <div className="fixed bottom-36 md:bottom-20 right-4 left-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-5 print:hidden">
          <ShieldCheckIcon className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm font-semibold">{toastMessage}</p>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-3xl mx-auto px-4 pt-3 sm:pt-4 w-full flex-1">
        {/* Minimalist Top App Status Bar */}
        <div className="pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs"
              style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
            >
              <CarIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-slate-950 text-sm tracking-tight leading-none block">
                {displayCompanyName}
              </span>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-1">
                Hi, {fullName || 'Passenger'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <UserDropdown
              email={account.email}
              onSignOut={handleSignOut}
              variant="light"
              currentView="app"
              className="w-auto"
              triggerVariant="minimized"
            />
          </div>
        </div>

        {/* Active Trip Floating Banner (Visible only when driver is assigned or ride is active) */}
        {activeTrip && ['assigned', 'accepted', 'en_route', 'arrived', 'in_progress'].includes(activeTrip.status) && (
          <section className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-5 text-white shadow-xl mb-4 border border-blue-500/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-blue-200">
                  Active Live Ride
                </span>
              </div>
              <span className="text-xs font-mono font-bold bg-white/20 px-2 py-0.5 rounded-lg">
                #{activeTrip.id}
              </span>
            </div>

            <h3 className="text-lg font-extrabold leading-snug">
              {activeTrip.status === 'en_route'
                ? 'Chauffeur is en route to you'
                : activeTrip.status === 'arrived'
                ? 'Chauffeur arrived at pickup!'
                : activeTrip.status === 'in_progress'
                ? 'Your trip is in progress'
                : activeTrip.status === 'assigned' || activeTrip.status === 'accepted'
                ? 'Chauffeur Assigned to Your Ride'
                : activeTrip.status === 'CONFIRMED' || activeTrip.status === 'confirmed'
                ? 'Reservation Confirmed'
                : 'Booking Requested'}
            </h3>

            <div className="mt-3 text-xs text-blue-100 space-y-1">
              <p className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                <span className="truncate">{activeTrip.pickupLocation.address}</span>
              </p>
              <p className="flex items-center gap-1.5 truncate">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                <span className="truncate">{activeTrip.dropoffLocation.address}</span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-blue-200">Total: </span>
                <span className="font-bold text-white text-sm">
                  ${activeTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              </div>

              <Link
                to={`/track/${encodeURIComponent(activeTrip.trackingToken || activeTrip.id)}`}
                className="px-4 py-2 bg-white text-blue-900 font-extrabold text-xs rounded-xl shadow-md hover:bg-blue-50 transition-colors flex items-center gap-1.5"
              >
                <span>Track Live on Map</span>
                <ExternalLinkIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        )}

        {/* Tab 1: Self-Contained Booking Flow */}
        {activeTab === 'book' && (
          <div className="space-y-4">
            {/* 1-Tap Saved Destinations quick chips */}
            {account.savedPlaces.length > 0 && (
              <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/80">
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                    <MapPinIcon className="w-4 h-4 text-blue-600" />
                    <span>1-Tap Saved Destinations</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveTab('places')}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                  >
                    Manage Places →
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {account.savedPlaces.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => handleSelectChip(place)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800 text-xs font-bold border border-slate-200 transition-all active:scale-95 shadow-2xs"
                    >
                      <span className="text-base">{getCategoryIcon(place.category)}</span>
                      <span>{place.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleOpenPlaceModal()}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl bg-slate-50 hover:bg-slate-100 text-blue-600 text-xs font-bold border border-dashed border-blue-300 transition-colors"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Add Place</span>
                  </button>
                </div>
              </div>
            )}

            {/* Self-Contained Embedded Booking Engine */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
              <BookingEngineV2
                hideDispatchBanner={true}
                embeddedInApp={true}
                initialValues={bookingInitialValues}
                editingTripId={editingTripId || undefined}
                onCancelEdit={() => {
                  setEditingTripId(null);
                  showToast('Cancelled editing reservation.');
                }}
                onBookingSuccess={(savedTrip) => {
                  if (editingTripId) {
                    setTrips((prev) =>
                      prev.map((t) => (t.id === savedTrip.id ? savedTrip : t))
                    );
                    if (activeTrip?.id === savedTrip.id) {
                      setActiveTrip(savedTrip);
                    }
                    setEditingTripId(null);
                    showToast(`Reservation #${savedTrip.id} updated successfully!`);
                  } else {
                    setActiveTrip(savedTrip);
                    setTrips((prev) => [savedTrip, ...prev]);
                    showToast('Ride reservation confirmed and queued with dispatch!');
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Tab 2: My Trips (Ride History & Digital Receipts) */}
        {activeTab === 'trips' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-extrabold text-slate-900">
                  Trips
                </h2>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('upcoming')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      historyFilter === 'upcoming'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Upcoming
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('history')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      historyFilter === 'history'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      historyFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    All
                  </button>
                </div>
              </div>

              {isLoadingTrips ? (
                <div className="py-12 text-center">
                  <SpinnerIcon className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading trip history...</p>
                </div>
              ) : filteredTrips.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                  <ClockIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No trips recorded yet</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Book your first ride with Chesterfield Taxi today!
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('book')}
                    className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    Book Now
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTrips.map((trip, tripIndex) => {
                    const dateFormatted = new Date(
                      trip.scheduledPickupTime || trip.actualPickupTime || trip.createdAt
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={trip.id}
                        className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs transition-all space-y-3 overflow-hidden"
                      >
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className="font-mono text-xs font-bold text-slate-500 truncate"
                                title={trip.id}
                              >
                                #{trip.id.length > 16 ? `${trip.id.slice(0, 8)}...${trip.id.slice(-4)}` : trip.id}
                              </span>
                              {tripIndex === 0 && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                                  Most Recent
                                </span>
                              )}
                            </div>
                            <div className="pt-0.5">
                              {getStatusBadge(trip.status)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-extrabold text-slate-900 leading-tight">
                              ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-semibold uppercase">
                              {trip.payment?.method || 'card'}
                            </div>
                          </div>
                        </div>

                        {/* Date & Vehicle */}
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-between gap-2">
                          <span>{dateFormatted}</span>
                          <span className="font-bold text-slate-700 truncate">
                            {resolveTripVehicleName(trip)}
                          </span>
                        </div>

                        {/* Route Timeline */}
                        <div className="text-xs space-y-1.5 pl-1 border-l-2 border-slate-100 ml-1 py-0.5">
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                            <p className="text-slate-800 font-medium leading-tight truncate">
                              {trip.pickupLocation?.address || 'Pickup'}
                            </p>
                          </div>
                          {Array.isArray(trip.intermediateStops) && trip.intermediateStops.length > 0 && (
                            <div className="flex items-start gap-2">
                              <div className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                              <p className="text-slate-500 font-medium leading-tight truncate">
                                +{trip.intermediateStops.length} stop{trip.intermediateStops.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                            <p className="text-slate-800 font-medium leading-tight truncate">
                              {trip.dropoffLocation?.address || 'Dropoff'}
                            </p>
                          </div>
                        </div>

                        {/* Driver & Unit Details */}
                        {Boolean(trip.metadata?.assignedDriverName || trip.metadata?.driverName || trip.assignedDriverId) && (
                          <div className="text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl text-slate-600 flex items-center justify-between">
                            <span>Chauffeur: {resolveTripDriverName(trip)}</span>
                            <span className="font-semibold text-slate-700">
                              {String(trip.metadata?.vehicleUnit || 'Assigned Fleet Unit')}
                            </span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        {!(trip.status === 'completed' || trip.status === 'cancelled' || trip.status === 'DECLINED' || trip.status === 'declined') ? (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5 sm:gap-2 flex-wrap">
                            <Link
                              to={`/track/${encodeURIComponent(trip.trackingToken || trip.id)}`}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[11px] sm:text-xs font-extrabold transition-colors whitespace-nowrap flex items-center gap-1"
                            >
                              <span>Track Live</span>
                              <ExternalLinkIcon className="w-3 h-3" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptTrip(trip)}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                            >
                              View
                            </button>
                            {!['en_route', 'arrived', 'in_progress'].includes(trip.status) && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleEditTrip(trip)}
                                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[11px] sm:text-xs font-extrabold transition-all active:scale-95 whitespace-nowrap"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelTrip(trip)}
                                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-[11px] sm:text-xs font-extrabold transition-all active:scale-95 whitespace-nowrap"
                                >
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto">
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptTrip(trip)}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 text-[11px] sm:text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                            >
                              View Receipt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRebookTrip(trip)}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-[11px] sm:text-xs font-extrabold transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0"
                              title="Rebook the same pickup and dropoff"
                            >
                              <CarIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>Rebook</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBookReturnTrip(trip)}
                              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 text-[11px] sm:text-xs font-extrabold transition-all active:scale-95 flex items-center gap-1 whitespace-nowrap shrink-0"
                              title="Book return ride swapping pickup and dropoff"
                            >
                              <ArrowLeftRightIcon className="w-3.5 h-3.5 shrink-0" />
                              <span>Book Return</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Saved Places Manager */}
        {activeTab === 'places' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Saved Places &amp; Frequent Routes
                  </h2>
                  <p className="text-xs text-slate-500">
                    Add custom labels and pickup instructions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenPlaceModal()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>Add Place</span>
                </button>
              </div>

              <div className="space-y-3">
                {account.savedPlaces.map((place) => (
                  <div
                    key={place.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-start justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-slate-50 text-xl flex items-center justify-center shrink-0 border border-slate-100">
                        {getCategoryIcon(place.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-950">
                            {place.label}
                          </h4>
                          <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            {place.category}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 font-medium">
                          {place.address}
                        </p>
                        {place.notes && (
                          <p className="text-[11px] text-slate-500 mt-0.5 italic">
                            &quot;{place.notes}&quot;
                          </p>
                        )}

                        {/* Quick 1-Tap Actions */}
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRideToPlace(place)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
                          >
                            Ride To Here
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRideFromPlace(place)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors"
                          >
                            Ride From Here
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenPlaceModal(place)}
                        className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-xs font-bold"
                        title="Edit Place"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePlace(place.id, place.label)}
                        className="p-2 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors text-xs font-bold"
                        title="Remove Place"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Profile & Communication Preferences */}
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <form
              onSubmit={handleSaveProfile}
              className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200/80 space-y-4"
            >
              <div>
                <h2 className="text-base font-extrabold text-slate-900">
                  Customer Profile &amp; Preferences
                </h2>
                <p className="text-xs text-slate-500">
                  Manage contact info, driver notes, and dispatch notifications
                </p>
              </div>

              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={profileFirstName}
                    onChange={(e) => setProfileFirstName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={profileLastName}
                    onChange={(e) => setProfileLastName(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Contact Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Phone (for SMS updates)
                  </label>
                  <input
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Address (for receipts)
                  </label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Default Vehicle Tier */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Default Preferred Vehicle Class
                </label>
                <select
                  value={profileVehicleTier}
                  onChange={(e) => setProfileVehicleTier(e.target.value as VehicleTier)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {adminVehicles.length > 0 ? (
                    <>
                      <option value="any">Any Available Vehicle (Best Value)</option>
                      {adminVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} (Up to {v.maxPassengers} pax / {v.maxLuggage} bags)
                        </option>
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="any">Any Available Vehicle</option>
                      <option value="standard">Standard Sedan</option>
                      <option value="premium">Executive SUV</option>
                      <option value="xl">XL Group Transport</option>
                    </>
                  )}
                </select>
              </div>

              {/* Permanent Driver Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Permanent Pickup Instructions &amp; Gate Codes
                </label>
                <textarea
                  rows={2}
                  value={profileNotes}
                  onChange={(e) => setProfileNotes(e.target.value)}
                  placeholder="e.g. Side porch door; gate code #4421; please call upon arrival."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  These instructions are automatically attached to your bookings for the driver.
                </p>
              </div>

              {/* Communication Preferences */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  Communication Preferences
                </label>
                <div className="space-y-2.5">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profileSms}
                      onChange={(e) => setProfileSms(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      SMS text message dispatch &amp; arrival alerts
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profileEmailReceipts}
                      onChange={(e) => setProfileEmailReceipts(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Automated digital itemized receipts by email
                    </span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profileCalls}
                      onChange={(e) => setProfileCalls(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      Driver arrival courtesy phone calls
                    </span>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-md transition-colors"
                >
                  Save Profile &amp; Preferences
                </button>
              </div>
            </form>

            {/* Workspace Switcher (Restricted to Staff & Drivers) */}
            {hasAnyStaffOrDriverRole && (
              <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
                <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                  Switch Workspace
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(userRoles.includes('dispatcher') || userRoles.includes('admin')) && (
                    <Link
                      to="/app/dispatch"
                      className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <RadioIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 group-hover:text-blue-700 block">
                            Dispatch Console
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Operations &amp; Booking
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}

                  {(userRoles.includes('driver') || userRoles.includes('admin')) && (
                    <Link
                      to="/app/driver"
                      className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <CarIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 block">
                            Driver Portal
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Shifts &amp; Navigation
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}

                  {userRoles.includes('admin') && (
                    <Link
                      to="/app/admin"
                      className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:border-purple-400 hover:bg-purple-50/50 transition-all group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 group-hover:text-purple-700 block">
                            Admin Console
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            System Configuration
                          </span>
                        </div>
                      </div>
                      <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-purple-600 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Portal Account Actions */}
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
              <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                Account Actions
              </span>
              <div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-rose-200 bg-rose-50/60 hover:bg-rose-50 hover:border-rose-300 text-rose-800 transition-all group text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                      <XIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-rose-900 block">
                        Sign Out of Portal
                      </span>
                      <span className="text-[10px] text-rose-500 block">
                        Clear local session
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-rose-300 group-hover:text-rose-600 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Saved Place */}
      {isPlaceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsPlaceModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <button
              type="button"
              onClick={() => setIsPlaceModalOpen(false)}
              aria-label="Close modal"
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <XIcon className="w-4 h-4" />
            </button>
            <h3 className="text-base font-extrabold text-slate-950 mb-1 pr-8">
              {editingPlaceId ? 'Edit Saved Place' : 'Add New Saved Place'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Save your address for 1-tap booking shortcuts
            </p>

            <form onSubmit={handleSavePlace} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Place Label (e.g. Home, Work, Gym, Doctor)
                </label>
                <input
                  type="text"
                  value={placeLabel}
                  onChange={(e) => setPlaceLabel(e.target.value)}
                  placeholder="e.g. Home or Bayer West"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Category
                </label>
                <select
                  value={placeCategory}
                  onChange={(e) => setPlaceCategory(e.target.value as SavedPlaceCategory)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="home">Home</option>
                  <option value="work">Work / Office</option>
                  <option value="airport">Airport / Aviation</option>
                  <option value="medical">Hospital / Medical</option>
                  <option value="favorite">Favorite / Social</option>
                  <option value="other">Other Address</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Street Address
                </label>
                <DispatchLocationInput
                  name="savedPlaceAddress"
                  ariaLabel="Saved Place Street Address"
                  placeholder="Search street address or airport..."
                  value={placeAddress}
                  onChange={(val) => {
                    setPlaceAddress(val);
                    setPlaceCoordinates(undefined);
                  }}
                  onPlaceSelected={(details) => {
                    setPlaceAddress(details.formattedAddress || details.address);
                    setPlaceCoordinates(details.coordinates);
                  }}
                  variant="pickup"
                  size="compact"
                  required
                />
                {placeCoordinates && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                    ✓ GPS coordinates verified for accurate fare quoting
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pickup Instructions / Unit / Door Notes
                </label>
                <input
                  type="text"
                  value={placeNotes}
                  onChange={(e) => setPlaceNotes(e.target.value)}
                  placeholder="e.g. Front circle drive, Gate code #1234"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaceModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white font-extrabold text-xs rounded-xl hover:bg-blue-700 shadow-sm transition-colors"
                >
                  Save Place
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Itemized Printable Digital Receipt */}
      {selectedReceiptTrip && (() => {
        const tipAmount = selectedReceiptTrip.payment?.tipAmount || 0;
        const baseTripTotal = selectedReceiptTrip.pricing?.totalFare || 0;
        const grandTotal = baseTripTotal + tipAmount;
        const isCancelledTrip =
          selectedReceiptTrip.status === 'cancelled' ||
          selectedReceiptTrip.status === 'DECLINED' ||
          selectedReceiptTrip.status === 'declined';
        const isCorporateBill =
          selectedReceiptTrip.payment?.method === 'corporate' ||
          selectedReceiptTrip.payment?.method === 'account';
        const isSettled =
          selectedReceiptTrip.payment?.status === 'captured' ||
          selectedReceiptTrip.status === 'completed';
        const paymentStatusLabel = isCancelledTrip
          ? 'Cancelled'
          : isCorporateBill
          ? 'Corporate Direct Bill'
          : isSettled
          ? 'Paid'
          : selectedReceiptTrip.payment?.status === 'authorized'
          ? 'Authorized (Pending)'
          : 'Pay in Cab / Pending';
        const paymentStatusColor = isCancelledTrip
          ? 'text-rose-600'
          : isSettled || isCorporateBill
          ? 'text-emerald-600'
          : 'text-amber-600';
        const totalLabel = isCancelledTrip
          ? 'Quoted Total (Cancelled)'
          : isCorporateBill
          ? 'Corporate Billed Total'
          : isSettled
          ? 'Total Paid'
          : 'Estimated Total';

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Official Trip Receipt"
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedReceiptTrip(null);
            }}
          >
            <div className="printable-receipt my-auto bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative print:shadow-none print:border-none print:m-0 print:p-0">
              <button
                type="button"
                onClick={() => setSelectedReceiptTrip(null)}
                aria-label="Close receipt"
                className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors print:hidden"
              >
                <XIcon className="w-5 h-5" />
              </button>

              {/* Header / Brand */}
              <div className="text-center pb-4 border-b border-slate-200">
                <div
                  className="inline-flex items-center justify-center w-10 h-10 rounded-2xl text-white mb-2 shadow-sm"
                  style={{ backgroundColor: 'var(--brand-primary, #2563eb)' }}
                >
                  <CarIcon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-extrabold text-slate-950 tracking-tight">
                  {displayCompanyName}
                </h3>
                <p className="text-xs text-slate-500">
                  {displayCompanyAddress}
                </p>
                <p className="text-xs text-slate-500">
                  24/7 Dispatch Hotline: {displayCompanyPhone} • {displayCompanyEmail}
                </p>
              </div>

              {/* Receipt Meta */}
              <div className="py-4 border-b border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block">RECEIPT ID</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    #{selectedReceiptTrip.id}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 font-semibold block">DATE / TIME</span>
                  <span className="font-semibold text-slate-800">
                    {new Date(
                      selectedReceiptTrip.actualPickupTime ||
                        selectedReceiptTrip.scheduledPickupTime ||
                        selectedReceiptTrip.createdAt
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Passenger & Vehicle Info */}
              <div className="py-3 border-b border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 font-semibold block">PASSENGER</span>
                  <span className="font-bold text-slate-800">
                    {selectedReceiptTrip.passenger.firstName} {selectedReceiptTrip.passenger.lastName}
                  </span>
                  <span className="text-slate-500 block">{selectedReceiptTrip.passenger.phone}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 font-semibold block">VEHICLE &amp; CHAUFFEUR</span>
                  <span className="font-bold text-slate-800">
                    {resolveTripDriverName(selectedReceiptTrip)}
                  </span>
                  <span className="text-slate-500 block">
                    {selectedReceiptTrip.metadata?.vehicleUnit ? `${String(selectedReceiptTrip.metadata.vehicleUnit)} • ` : ''}
                    {resolveTripVehicleName(selectedReceiptTrip)}
                  </span>
                </div>
              </div>

              {/* Route Summary */}
              <div className="py-3 border-b border-slate-100 text-xs space-y-1.5">
                <span className="text-slate-400 font-semibold block">ROUTING</span>
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-slate-400 font-medium">From: </span>
                    <span className="font-semibold text-slate-900">
                      {selectedReceiptTrip.pickupLocation.address}
                    </span>
                  </div>
                </div>
                {Array.isArray(selectedReceiptTrip.intermediateStops) &&
                  selectedReceiptTrip.intermediateStops.map((stop, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
                      <div>
                        <span className="text-slate-400 font-medium">Stop {idx + 1}: </span>
                        <span className="font-semibold text-slate-800">{stop.address}</span>
                      </div>
                    </div>
                  ))}
                <div className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                  <div>
                    <span className="text-slate-400 font-medium">To: </span>
                    <span className="font-semibold text-slate-900">
                      {selectedReceiptTrip.dropoffLocation.address}
                    </span>
                  </div>
                </div>
                {Boolean(selectedReceiptTrip.pricing?.distanceMiles) && (
                  <div className="pt-1 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Distance: {selectedReceiptTrip.pricing.distanceMiles!.toFixed(1)} miles</span>
                    {Boolean(selectedReceiptTrip.pricing?.durationMinutes) && (
                      <span>Duration: ~{Math.round(selectedReceiptTrip.pricing.durationMinutes!)} mins</span>
                    )}
                  </div>
                )}
              </div>

              {/* Canonical Itemized Breakdown */}
              <div className="py-3 border-b border-slate-200 space-y-2.5">
                {selectedReceiptTrip.pricing && (
                  <PriceBreakdownPanel
                    outboundPricing={selectedReceiptTrip.pricing}
                    outboundDisplayFare={selectedReceiptTrip.pricing.totalFare}
                    returnDisplayFare={null}
                    totalDisplayFare={selectedReceiptTrip.pricing.totalFare}
                    isRoundTrip={false}
                    vehicleLabel={resolveTripVehicleName(selectedReceiptTrip)}
                  />
                )}

                {tipAmount > 0 && (
                  <div className="flex justify-between text-xs text-slate-700 px-1">
                    <span>Chauffeur Gratuity (Tip)</span>
                    <span className="font-bold tabular-nums">${tipAmount.toFixed(2)}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold text-slate-950">
                  <span>{totalLabel}</span>
                  <span className="text-base text-blue-700 tabular-nums">
                    ${grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="py-3 text-xs text-slate-500 flex items-center justify-between gap-2 flex-wrap">
                <span>
                  Payment:{' '}
                  <span className="font-bold uppercase text-slate-800">
                    {(selectedReceiptTrip.payment?.method || 'pay_in_cab').replace(/_/g, ' ')}
                    {selectedReceiptTrip.payment?.cardLast4 ? ` •••• ${selectedReceiptTrip.payment.cardLast4}` : ''}
                  </span>
                </span>
                <span>
                  Status:{' '}
                  <span className={`font-bold uppercase ${paymentStatusColor}`}>
                    {paymentStatusLabel}
                  </span>
                </span>
              </div>

              {/* Buttons (Hidden on Print) */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedReceiptTrip(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors"
                >
                  Print Official Receipt
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bottom Sticky / Dock Navigation Bar */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 md:bottom-3 inset-x-0 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[460px] z-40 bg-white/95 backdrop-blur-md border-t md:border border-slate-200/90 md:rounded-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:shadow-xl px-2 py-1.5 flex items-center justify-around print:hidden"
      >
        <button
          type="button"
          onClick={() => setActiveTab('book')}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
            activeTab === 'book'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'book' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <CarIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight leading-none">Book</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trips')}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all relative ${
            activeTab === 'trips'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors relative ${activeTab === 'trips' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <ClockIcon className="w-5 h-5" />
            {activeTrip && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white animate-ping" />
            )}
          </div>
          <span className="text-[10px] tracking-tight leading-none">Trips ({trips.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('places')}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
            activeTab === 'places'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'places' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <MapPinIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight leading-none">Places ({account.savedPlaces.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-1 rounded-xl transition-all ${
            activeTab === 'profile'
              ? 'text-blue-600 font-extrabold'
              : 'text-slate-500 hover:text-slate-800 font-medium'
          }`}
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'profile' ? 'bg-blue-50 text-blue-600' : ''}`}>
            <UserIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight leading-none">Profile</span>
        </button>
      </nav>

      {/* Floating Action Button (?) & Assistance Menu */}
      <div className="fixed bottom-20 md:bottom-5 right-4 sm:right-6 z-40 print:hidden flex flex-col items-end">
        {/* Floating Menu Popover */}
        {isHelpMenuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-2xs"
              onClick={() => setIsHelpMenuOpen(false)}
            />

            <div className="relative z-50 mb-3 w-72 sm:w-80 bg-white rounded-3xl shadow-2xl border border-slate-200/90 p-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs">
                    ?
                  </div>
                  <span className="font-extrabold text-slate-900 text-sm">
                    Passenger Assistance
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHelpMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  aria-label="Close menu"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="py-2 space-y-1.5">
                {/* 24/7 Dispatch Hotline */}
                <a
                  href={`tel:${displayCompanyPhoneRaw}`}
                  className="w-full p-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-900 flex items-center gap-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <PhoneIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-extrabold text-blue-950">Call 24/7 Dispatch Desk</p>
                    <p className="text-[11px] text-blue-700 font-semibold">{displayCompanyPhone}</p>
                  </div>
                </a>

                {/* Passenger FAQ & Help Guide */}
                <button
                  type="button"
                  onClick={() => {
                    setIsHelpMenuOpen(false);
                    setIsFaqModalOpen(true);
                  }}
                  className="w-full p-2.5 rounded-2xl hover:bg-slate-50 text-slate-700 flex items-center gap-3 transition-colors border border-slate-100"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <InfoIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-bold text-slate-900">Help Center & FAQ</p>
                    <p className="text-[11px] text-slate-500">Airports, Car Seats & Policies</p>
                  </div>
                </button>

                {/* Email Support */}
                <a
                  href={`mailto:${displayCompanyEmail}`}
                  className="w-full p-2.5 rounded-2xl hover:bg-slate-50 text-slate-700 flex items-center gap-3 transition-colors border border-slate-100"
                >
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-bold text-slate-900">Email Dispatch Support</p>
                    <p className="text-[11px] text-slate-500 truncate">{displayCompanyEmail}</p>
                  </div>
                </a>
              </div>
              <div className="pt-2 border-t border-slate-100">
                {/* Sign Out */}
                <button
                  type="button"
                  onClick={() => {
                    setIsHelpMenuOpen(false);
                    void handleSignOut();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-2 transition-colors"
                >
                  <XIcon className="w-3.5 h-3.5 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Floating Action Button (FAB) */}
        <button
          type="button"
          onClick={() => setIsHelpMenuOpen((prev) => !prev)}
          className="w-13 h-13 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-xl flex items-center justify-center transition-all active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300 group"
          aria-label="Help and Dispatch hotline"
          title="Assistance & 24/7 Dispatch Desk"
        >
          {isHelpMenuOpen ? (
            <XIcon className="w-6 h-6 group-hover:rotate-90 transition-transform" />
          ) : (
            <span className="text-xl font-black">?</span>
          )}
        </button>
      </div>

      {/* Help Center & Passenger FAQ Modal */}
      {isFaqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <InfoIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">Help &amp; Passenger FAQ</h3>
                  <p className="text-xs text-slate-500">Policies, Flight Tracking &amp; FAQs</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-100">
                <h4 className="font-extrabold text-blue-950 mb-1 flex items-center gap-1.5 text-xs">
                  <PlaneLandingIcon className="w-4 h-4 text-blue-600" />
                  <span>Airport Pickups &amp; Flight Monitoring (STL)</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  We monitor all scheduled domestic and international arrivals into St. Louis Lambert Airport in real time and automatically adjust pickup times for flight delays. As a general policy, we wait as long as it takes so your driver is ready when you land.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-extrabold text-slate-900 mb-1 flex items-center gap-1.5 text-xs">
                  <ShieldCheckIcon className="w-4 h-4 text-emerald-600" />
                  <span>Child Car Seats Available</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Safety is our priority. Rear-facing infant, forward-facing toddler, and booster seats can be requested in the booking engine notes for a nominal sanitized equipment fee.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-extrabold text-slate-900 mb-1 flex items-center gap-1.5 text-xs">
                  <LuggageIcon className="w-4 h-4 text-purple-600" />
                  <span>Luggage &amp; Vehicle Capacities</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Sedans comfortably accommodate up to 4 passengers with 3 standard checked suitcases. For groups or extra luggage, our Premium SUV and XL Vans accommodate up to 6 passengers with 6+ large bags.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <h4 className="font-extrabold text-slate-900 mb-1 flex items-center gap-1.5 text-xs">
                  <ClockIcon className="w-4 h-4 text-amber-600" />
                  <span>Cancellation &amp; Changes Policy</span>
                </h4>
                <p className="text-slate-600 leading-relaxed">
                  Reservations can be modified or cancelled free of penalty up to 2 hours prior to scheduled pickup. For immediate dispatch updates, please call the 24/7 desk directly.
                </p>
              </div>

              {/* Direct Dial Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
                <div>
                  <p className="font-extrabold text-sm">Need immediate assistance?</p>
                  <p className="text-blue-100 text-[11px]">Dispatch desk agents are standing by 24/7.</p>
                </div>
                <a
                  href={`tel:${displayCompanyPhoneRaw}`}
                  className="px-3.5 py-2 bg-white text-blue-900 font-extrabold text-xs rounded-xl shadow-md hover:bg-blue-50 transition-colors shrink-0"
                >
                  Call Now
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setIsFaqModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close Help Center
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
