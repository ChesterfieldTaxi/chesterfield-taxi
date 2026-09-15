import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import {
  getPassengerService,
  DEFAULT_PASSENGER_ACCOUNT,
} from '../core/services/passenger.service';
import type {
  PassengerAccount,
  SavedPlace,
  SavedPlaceCategory,
} from '../core/types/passenger';
import type { Trip, TripStatus, VehicleTier } from '../core/types/trip';
import { COMPANY_CONFIG } from '../config/companyConfig';
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
} from '../components/ui/Icons';
import { BookingEngineV2, type BookingEngineV2InitialValues } from '../components/domain/BookingEngineV2';

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
  const passengerService = getPassengerService();

  const [account, setAccount] = useState<PassengerAccount>(() =>
    passengerService.getCachedAccount()
  );
  const [activeTab, setActiveTab] = useState<TabKey>('book');
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);

  // Auth guard
  useEffect(() => {
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged((currentUser: any) => {
      if (!currentUser) {
        navigate('/signin?message=unauthenticated&redirect=/app', { replace: true });
      } else {
        const roles = currentUser.roles || [currentUser.role];
        // If they are strictly a dispatcher or driver (and not a customer), boot them out of customer app
        // However, if they have customer AND driver roles, let them stay.
        // Usually, default redirect goes to highest privilege, but if they explicitly navigate to /app, we let them if they have the customer role or if we don't strictly ban admins.
        // For now, allow anyone into the customer portal, as multi-role drivers might want to book a ride.
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Quick Book Drawer state
  const [quickOrigin, setQuickOrigin] = useState<string>('');
  const [quickDestination, setQuickDestination] = useState<string>('');
  const [quickNotes, setQuickNotes] = useState<string>('');
  const [selectedVehicleTier, setSelectedVehicleTier] = useState<VehicleTier>('standard');

  // Trip History state
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [selectedReceiptTrip, setSelectedReceiptTrip] = useState<Trip | null>(null);

  // Saved Places Modal state
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [placeCategory, setPlaceCategory] = useState<SavedPlaceCategory>('home');
  const [placeAddress, setPlaceAddress] = useState('');
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

  // Subscribe to Active Trip
  useEffect(() => {
    const unsub = passengerService.subscribeToActiveTrip((trip) => {
      setActiveTrip(trip);
    });
    return unsub;
  }, [passengerService]);

  // Load Trips History
  useEffect(() => {
    let mounted = true;
    setIsLoadingTrips(true);
    passengerService
      .getPassengerTrips()
      .then((history: Trip[]) => {
        if (mounted) {
          setTrips(history);
          setIsLoadingTrips(false);
        }
      })
      .catch((err: unknown) => {
        console.error('[PassengerApp] Failed to load history:', err);
        if (mounted) setIsLoadingTrips(false);
      });

    return () => {
      mounted = false;
    };
  }, [passengerService]);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    if (historyFilter === 'completed') {
      return trips.filter((t) => (t.status as string) === 'COMPLETED' || (t.status as string) === 'completed');
    }
    if (historyFilter === 'cancelled') {
      return trips.filter(
        (t) =>
          (t.status as string) === 'cancelled' ||
          (t.status as string) === 'DECLINED' ||
          (t.status as string) === 'declined'
      );
    }
    return trips;
  }, [trips, historyFilter]);

  // Booking initial values for embedded self-contained BookingEngineV2
  const [bookingInitialValues, setBookingInitialValues] = useState<BookingEngineV2InitialValues>(() => ({
    passengerName: `${account.firstName} ${account.lastName}`.trim(),
    passengerPhone: account.phone || '',
    passengerEmail: account.email || '',
    driverNotes: account.passengerNotes || '',
    vehicleChoice: 'sedan',
  }));

  // Rebook an existing trip inside /app
  const handleRebookTrip = (trip: Trip) => {
    setBookingInitialValues({
      pickupAddress: trip.pickupLocation?.address || '',
      dropoffAddress: trip.dropoffLocation?.address || '',
      driverNotes: trip.passenger?.specialRequests || trip.driverNotes || account.passengerNotes || '',
      vehicleChoice: trip.vehicleTier === 'xl' ? 'suv' : trip.vehicleTier === 'wheelchair' ? 'van' : 'sedan',
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
    setBookingInitialValues({
      pickupAddress: trip.dropoffLocation?.address || '',
      dropoffAddress: trip.pickupLocation?.address || '',
      driverNotes: trip.passenger?.specialRequests || trip.driverNotes || account.passengerNotes || '',
      vehicleChoice: trip.vehicleTier === 'xl' ? 'suv' : trip.vehicleTier === 'wheelchair' ? 'van' : 'sedan',
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

  // Quick 1-tap chip destination select
  const handleSelectChip = (place: SavedPlace) => {
    setBookingInitialValues((prev) => ({
      ...prev,
      dropoffAddress: place.address,
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
      setPlaceNotes(place.notes || '');
    } else {
      setEditingPlaceId(null);
      setPlaceLabel('');
      setPlaceCategory('favorite');
      setPlaceAddress('');
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
          notes: placeNotes.trim() || undefined,
        });
        showToast('Saved place updated successfully.');
      } else {
        await passengerService.addSavedPlace({
          label: placeLabel.trim(),
          category: placeCategory,
          address: placeAddress.trim(),
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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckIcon className="w-3 h-3" /> Completed
          </span>
        );
      case 'cancelled':
      case 'DECLINED':
      case 'declined':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            Cancelled
          </span>
        );
      case 'UNCONFIRMED':
      case 'unconfirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
            Requested (Unconfirmed)
          </span>
        );
      case 'CONFIRMED':
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
            Confirmed
          </span>
        );
      case 'assigned':
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            Driver Assigned
          </span>
        );
      case 'en_route':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">
            Driver En Route
          </span>
        );
      case 'arrived':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-200 animate-bounce">
            Driver Arrived
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            On Trip
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  const getCategoryIcon = (category: SavedPlaceCategory) => {
    switch (category) {
      case 'home':
        return '🏠';
      case 'work':
        return '💼';
      case 'airport':
        return '✈️';
      case 'medical':
        return '🏥';
      case 'favorite':
        return '⭐';
      default:
        return '📍';
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-100 text-slate-900 pb-24 md:pb-12 flex flex-col font-sans"
      style={{
        '--brand-primary': COMPANY_CONFIG.primaryColor || '#2563eb',
        '--btn-primary-bg': COMPANY_CONFIG.primaryColor || '#2563eb',
        '--btn-primary-text': '#ffffff',
        '--btn-radius': '12px',
      } as React.CSSProperties}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-4 left-4 sm:left-auto sm:right-6 sm:w-96 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
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
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-950 text-sm tracking-tight leading-none">
                  {COMPANY_CONFIG.name}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-wider border border-blue-200">
                  Passenger Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-1">
                Hi, {account.firstName} • 24/7 Priority
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeTrip && (
              <button
                type="button"
                onClick={() => setActiveTab('trips')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shadow-2xs hover:bg-emerald-100 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Ride #{activeTrip.id} Live</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Trip Floating Banner (Visible whenever live ride is active) */}
        {activeTrip && (
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
                ? 'Driver is en route to you'
                : activeTrip.status === 'arrived'
                ? 'Driver arrived at pickup!'
                : activeTrip.status === 'in_progress'
                ? 'Your trip is in progress'
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
                to={`/track/${activeTrip.id}`}
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
                initialValues={bookingInitialValues}
                onBookingSuccess={(createdTrip) => {
                  setActiveTrip(createdTrip);
                  setTrips((prev) => [createdTrip, ...prev]);
                  showToast('Ride reservation confirmed and queued with dispatch!');
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
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Past Trips &amp; Digital Receipts
                  </h2>
                  <p className="text-xs text-slate-500">
                    Review itemized receipts or rebook rides in two taps
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl text-xs">
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
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('completed')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      historyFilter === 'completed'
                        ? 'bg-white text-emerald-700 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('cancelled')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      historyFilter === 'cancelled'
                        ? 'bg-white text-rose-700 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Cancelled
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
                        className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 shadow-2xs transition-all space-y-3"
                      >
                        {/* Top row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-500">
                              #{trip.id}
                            </span>
                            {tripIndex === 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                                Most Recent
                              </span>
                            )}
                            {getStatusBadge(trip.status)}
                          </div>
                          <div className="text-right">
                            <div className="text-base font-extrabold text-slate-900">
                              ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-semibold uppercase">
                              {trip.payment?.method || 'card'}
                            </div>
                          </div>
                        </div>

                        {/* Date & Vehicle */}
                        <div className="text-xs font-semibold text-slate-500 flex items-center justify-between">
                          <span>{dateFormatted}</span>
                          <span className="capitalize font-bold text-slate-700">
                            {trip.vehicleTier || 'standard'} class
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
                          <div className="flex items-start gap-2">
                            <div className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                            <p className="text-slate-800 font-medium leading-tight truncate">
                              {trip.dropoffLocation?.address || 'Dropoff'}
                            </p>
                          </div>
                        </div>

                        {/* Driver & Unit Details */}
                        {Boolean(trip.metadata?.driverName || trip.assignedDriverId) && (
                          <div className="text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl text-slate-600 flex items-center justify-between">
                            <span>Driver: {String(trip.metadata?.driverName || 'Mike T.')}</span>
                            <span className="font-semibold text-slate-700">
                              {String(trip.metadata?.vehicleUnit || 'Cab #204')}
                            </span>
                          </div>
                        )}

                        {/* Action Buttons (Strictly Inline & Compact) */}
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
                  <option value="standard">Standard Sedan (Toyota Camry / Fusion)</option>
                  <option value="premium">Executive SUV (Chevy Suburban / Lincoln)</option>
                  <option value="xl">XL Group Transport (7 Passengers)</option>
                  <option value="wheelchair">Transit WAV Wheelchair Accessible</option>
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

            {/* Portal Account Actions */}
            <div className="mt-6 pt-5 border-t border-slate-100 space-y-3">
              <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                Account Actions
              </span>
              <div>
                <button
                  type="button"
                    onClick={async () => {
                      try {
                        
                        await getAdminAuthService().signOut();
                      } catch {}
                      showToast('Signed out of Passenger Portal.');
                      setTimeout(() => navigate('/signin'), 600);
                    }}
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-base font-extrabold text-slate-950 mb-1">
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
                  <option value="home">🏠 Home</option>
                  <option value="work">💼 Work / Office</option>
                  <option value="airport">✈️ Airport / Aviation</option>
                  <option value="medical">🏥 Hospital / Medical</option>
                  <option value="favorite">⭐ Favorite / Social</option>
                  <option value="other">📍 Other Address</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Street Address
                </label>
                <input
                  type="text"
                  value={placeAddress}
                  onChange={(e) => setPlaceAddress(e.target.value)}
                  placeholder="e.g. 14848 Conway Rd, Chesterfield, MO"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
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
      {selectedReceiptTrip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 print:shadow-none print:border-none print:m-0 print:p-0">
            {/* Header / Brand */}
            <div className="text-center pb-4 border-b border-slate-200">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-blue-600 text-white mb-2 shadow-sm">
                <CarIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-950 tracking-tight">
                {COMPANY_CONFIG.legalName}
              </h3>
              <p className="text-xs text-slate-500">
                {COMPANY_CONFIG.address.street}, {COMPANY_CONFIG.address.city},{' '}
                {COMPANY_CONFIG.address.state} {COMPANY_CONFIG.address.zip}
              </p>
              <p className="text-xs text-slate-500">
                24/7 Dispatch Hotline: {COMPANY_CONFIG.phone.dispatch} • {COMPANY_CONFIG.email.dispatch}
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
                <span className="text-slate-400 font-semibold block">VEHICLE &amp; DRIVER</span>
                <span className="font-bold text-slate-800">
                  {String(selectedReceiptTrip.metadata?.driverName || 'Mike T.')}
                </span>
                <span className="text-slate-500 block">
                  {String(selectedReceiptTrip.metadata?.vehicleUnit || 'Cab #204')} (
                  <span className="capitalize">{selectedReceiptTrip.vehicleTier}</span>)
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
              <div className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                <div>
                  <span className="text-slate-400 font-medium">To: </span>
                  <span className="font-semibold text-slate-900">
                    {selectedReceiptTrip.dropoffLocation.address}
                  </span>
                </div>
              </div>
              {selectedReceiptTrip.pricing?.distanceMiles && (
                <div className="pt-1 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Distance: {selectedReceiptTrip.pricing.distanceMiles.toFixed(1)} miles</span>
                  <span>Duration: ~{selectedReceiptTrip.pricing.durationMinutes || 25} mins</span>
                </div>
              )}
            </div>

            {/* Itemized Breakdown Table */}
            <div className="py-3 border-b border-slate-200 text-xs space-y-2">
              <span className="text-slate-400 font-semibold block uppercase tracking-wider text-[10px]">
                Itemized Fare Breakdown
              </span>

              <div className="flex justify-between text-slate-600">
                <span>Base Flag Drop Fare</span>
                <span>${selectedReceiptTrip.pricing?.baseFare?.toFixed(2) || '4.50'}</span>
              </div>

              {Boolean(selectedReceiptTrip.pricing?.distanceRate) && (
                <div className="flex justify-between text-slate-600">
                  <span>
                    Distance Mileage ({selectedReceiptTrip.pricing.distanceMiles?.toFixed(1) || 0} mi)
                  </span>
                  <span>
                    $
                    {(
                      (selectedReceiptTrip.pricing.distanceMiles || 0) *
                      (selectedReceiptTrip.pricing.distanceRate || 2.8)
                    ).toFixed(2)}
                  </span>
                </div>
              )}

              {Boolean(selectedReceiptTrip.pricing?.airportSurcharge) && (
                <div className="flex justify-between text-slate-600">
                  <span>Airport Aviation Access Fee</span>
                  <span>${selectedReceiptTrip.pricing.airportSurcharge?.toFixed(2)}</span>
                </div>
              )}

              {Boolean(selectedReceiptTrip.pricing?.carSeatFee) && (
                <div className="flex justify-between text-slate-600">
                  <span>Child Safety Seat Equipment</span>
                  <span>${selectedReceiptTrip.pricing.carSeatFee?.toFixed(2)}</span>
                </div>
              )}

              {Boolean(selectedReceiptTrip.pricing?.tollsFee) && (
                <div className="flex justify-between text-slate-600">
                  <span>Highway / Bridge Tolls</span>
                  <span>${selectedReceiptTrip.pricing.tollsFee?.toFixed(2)}</span>
                </div>
              )}

              {Boolean(selectedReceiptTrip.pricing?.driverExtrasTotal) && (
                <div className="flex justify-between text-slate-600">
                  <span>Driver In-Cab Meter Extras</span>
                  <span>${selectedReceiptTrip.pricing.driverExtrasTotal?.toFixed(2)}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold text-slate-950">
                <span>Total Paid</span>
                <span className="text-base text-blue-700">
                  ${selectedReceiptTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            {/* Payment Details */}
            <div className="py-3 text-xs text-slate-500 flex items-center justify-between">
              <span>
                Payment Method: <span className="font-bold uppercase text-slate-800">{selectedReceiptTrip.payment?.method || 'Card'}</span>
              </span>
              <span>
                Status: <span className="font-bold text-emerald-600 uppercase">{selectedReceiptTrip.payment?.status || 'Captured'}</span>
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
      )}

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
                  href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
                  className="w-full p-2.5 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-900 flex items-center gap-3 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <PhoneIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-extrabold text-blue-950">Call 24/7 Dispatch Desk</p>
                    <p className="text-[11px] text-blue-700 font-semibold">{COMPANY_CONFIG.phone.primary}</p>
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
                  href={`mailto:${COMPANY_CONFIG.email.dispatch}`}
                  className="w-full p-2.5 rounded-2xl hover:bg-slate-50 text-slate-700 flex items-center gap-3 transition-colors border border-slate-100"
                >
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-xs font-bold text-slate-900">Email Dispatch Support</p>
                    <p className="text-[11px] text-slate-500 truncate">{COMPANY_CONFIG.email.dispatch}</p>
                  </div>
                </a>
              </div>
              <div className="pt-2 border-t border-slate-100">
                {/* Sign Out */}
                <button
                  type="button"
                    onClick={async () => {
                      setIsHelpMenuOpen(false);
                      try {
                        
                        await getAdminAuthService().signOut();
                      } catch {}
                      showToast('Signed out of Passenger Portal.');
                      setTimeout(() => navigate('/signin'), 800);
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
                  We monitor all scheduled domestic and international arrivals into St. Louis Lambert Airport in real time. We automatically adjust pickup times for delays with a complimentary 45-minute grace period after flight wheel-stop.
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
                  href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
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
