import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { getAdminAuthService } from '../core/services/auth/admin-auth.service';
import { getDriverService, DEFAULT_DRIVERS, DEFAULT_SCHEDULE } from '../core/services/driver.service';
import type { DriverProfile, DriverDutyStatus, DriverMeterExtra, DriverScheduleConfig, DayOfWeek, DriverTimeOff } from '../core/types/driver';
import type { Trip, TripStatus } from '../core/types/trip';
import { getBookingService } from '../core/services/booking';
import {
  DEFAULT_TARIFF_PROFILES,
  getTariffService,
  evaluateTaximeterFare,
  resolveTariffProfile,
} from '../core/services/pricing/tariff.service';
import type { TariffProfile } from '../core/types/tariff';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  PhoneIcon,
  CheckIcon,
  SpinnerIcon,
  XIcon,
  CalendarIcon,
  MapPinIcon,
  CarIcon,
  ClockIcon,
  UserIcon,
  LuggageIcon,
  MailIcon,
  FlagIcon,
  LogOutIcon,
} from '../components/ui/Icons';

export function meta() {
  return [
    { title: 'Driver Console – Chesterfield Taxi' },
    { name: 'description', content: 'Mobile-first driver console and taximeter app' },
  ];
}

type DriverTab = 'active' | 'offers' | 'messages' | 'scheduled' | 'schedule';

const PRESET_EXTRAS: Array<{ name: string; amount: number; category: DriverMeterExtra['category'] }> = [
  { name: 'Lambert STL Airport Toll / Surcharge', amount: 4.0, category: 'toll' },
  { name: 'Downtown Parking Garage Pass', amount: 10.0, category: 'parking' },
  { name: 'Extra Baggage / Luggage Assist', amount: 5.0, category: 'luggage' },
  { name: 'Vehicle Cleaning Surcharge', amount: 25.0, category: 'cleaning' },
  { name: 'Highway / Bridge Toll Pass-through', amount: 3.5, category: 'toll' },
];

export function openMapNavigation(address: string, app: 'google' | 'apple' | 'waze' = 'google') {
  if (!address) return;
  const encoded = encodeURIComponent(address);
  let url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
  if (app === 'apple') {
    url = `https://maps.apple.com/?q=${encoded}`;
  } else if (app === 'waze') {
    url = `https://waze.com/ul?q=${encoded}&navigate=yes`;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}


export default function DriverAppRoute() {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [assignedTrips, setAssignedTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<DriverTab>('active');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Auth guard
  const navigate = useNavigate();
  useEffect(() => {
    
    const authService = getAdminAuthService();
    const unsubscribe = authService.onAuthStateChanged((currentUser: any) => {
      if (!currentUser) {
        navigate('/signin?message=unauthenticated&redirect=/driver', { replace: true });
      } else if (currentUser.role !== 'driver' && currentUser.role !== 'admin' && currentUser.role !== 'dispatcher') {
        navigate('/signin?message=unauthorized', { replace: true });
      } else {
        setIsAuthChecking(false);
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Meter elapsed timer & distance state for IN_PROGRESS
  const [meterSeconds, setMeterSeconds] = useState(0);
  const [meterDistance, setMeterDistance] = useState(0);
  const [tariffs, setTariffs] = useState<TariffProfile[]>(DEFAULT_TARIFF_PROFILES);

  // Extras modal state
  const [showExtrasModal, setShowExtrasModal] = useState(false);
  const [customExtraName, setCustomExtraName] = useState('');
  const [customExtraAmount, setCustomExtraAmount] = useState('');
  const [customExtraCategory] = useState<DriverMeterExtra['category']>('toll');

  // Passenger SMS presets modal state
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [customSmsText, setCustomSmsText] = useState('');

  // Calendar / Availability editing state
  const [scheduleConfig, setScheduleConfig] = useState<DriverScheduleConfig>(DEFAULT_SCHEDULE);
  const [newTimeOffStart, setNewTimeOffStart] = useState('');
  const [newTimeOffEnd, setNewTimeOffEnd] = useState('');
  const [newTimeOffReason, setNewTimeOffReason] = useState('');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const driverService = getDriverService();
  const bookingService = getBookingService();

  // Load tariffs
  useEffect(() => {
    const tariffService = getTariffService();
    tariffService
      .getTariffs()
      .then((loaded) => {
        if (loaded && loaded.length > 0) setTariffs(loaded);
      })
      .catch(() => {});
  }, []);

  // Load Driver Profile & Subscribe
  useEffect(() => {
    let unsubDriver: (() => void) | undefined;

    async function init() {
      try {
        const profile = await driverService.getDriverProfile();
        setDriver(profile);
        if (profile.schedule) {
          setScheduleConfig(profile.schedule);
        }
        unsubDriver = driverService.subscribeToDriver(profile.id, (updated) => {
          setDriver(updated);
          if (updated.schedule) {
            setScheduleConfig(updated.schedule);
          }
        });
      } catch (err) {
        console.error('Failed to load driver profile:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      if (unsubDriver) unsubDriver();
    };
  }, []);

  // Subscribe to Trips to locate all trips assigned or offered to this driver
  useEffect(() => {
    if (!driver) return;

    let unsubTrips: (() => void) | undefined;

    if (bookingService.subscribeToAllTrips) {
      unsubTrips = bookingService.subscribeToAllTrips((trips) => {
        // Find all assigned/offered active trips for this driver
        const myTrips = trips.filter(
          (t) =>
            (t.assignedDriverId === driver.id || t.offeredToIds?.includes(driver.id)) &&
            t.status !== 'completed' &&
            t.status !== 'cancelled' &&
            t.status !== 'DECLINED' &&
            t.status !== 'declined'
        );

        // Sort by priority: in_progress first, then arrived, en_route, accepted, assigned, offered, unconfirmed
        const statusPriority: Record<string, number> = {
          in_progress: 1,
          arrived: 2,
          en_route: 3,
          accepted: 4,
          assigned: 5,
          offered: 6,
          confirmed: 7,
          CONFIRMED: 7,
          unconfirmed: 8,
          UNCONFIRMED: 8,
          pending: 9,
        };

        myTrips.sort((a, b) => {
          const pA = statusPriority[a.status] || 99;
          const pB = statusPriority[b.status] || 99;
          if (pA !== pB) return pA - pB;
          // Secondary sort: scheduledPickupTime
          const timeA = new Date(a.scheduledPickupTime || 0).getTime();
          const timeB = new Date(b.scheduledPickupTime || 0).getTime();
          return timeA - timeB;
        });

        setAssignedTrips(myTrips);

        // Default active trip selection
        setActiveTripId((prev) => {
          if (prev && myTrips.some((t) => t.id === prev)) {
            return prev;
          }
          return myTrips[0]?.id || null;
        });
      });
    }

    return () => {
      if (unsubTrips) unsubTrips();
    };
  }, [driver?.id]);

  // Derived categorized trips
  // Offers: status === 'offered' or unconfirmed/pending offers
  const offeredTrips = assignedTrips.filter(
    (t) => t.status === 'offered' || (t.offeredToIds?.includes(driver?.id || '') && t.assignedDriverId !== driver?.id)
  );

  // Accepted & Scheduled upcoming trips
  const scheduledTrips = assignedTrips.filter(
    (t) => t.status !== 'offered' && !(t.offeredToIds?.includes(driver?.id || '') && t.assignedDriverId !== driver?.id)
  );

  const activeTrip = assignedTrips.find((t) => t.id === activeTripId) || scheduledTrips[0] || assignedTrips[0] || null;

  // Handle Taximeter ticker when trip is in_progress
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    if (activeTrip?.status === 'in_progress') {
      interval = setInterval(() => {
        setMeterSeconds((prev) => prev + 1);
        setMeterDistance((prev) => Number((prev + 0.007).toFixed(2)));
      }, 1000);
    } else {
      if (activeTrip?.status === 'assigned' || activeTrip?.status === 'accepted') {
        setMeterSeconds(0);
        setMeterDistance(0);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTrip?.status]);

  // Calculate live taximeter fare based on current active tariff
  const calculateCurrentMeterFare = useCallback(() => {
    if (!activeTrip) return 0;
    const allTariffs = tariffs.length > 0 ? tariffs : DEFAULT_TARIFF_PROFILES;
    const matchedProfile = allTariffs.find((t: TariffProfile) => t.isActive) || allTariffs[0];
    const resolved = resolveTariffProfile(matchedProfile, allTariffs);

    const durationMin = Number((meterSeconds / 60).toFixed(1));
    const dist = meterDistance > 0 ? meterDistance : (activeTrip.pricing?.distanceMiles || 1.0);

    const meterCalc = evaluateTaximeterFare(resolved.taximeter, dist, durationMin);
    return meterCalc.subtotal;
  }, [activeTrip, meterSeconds, meterDistance, tariffs]);

  // Driver Duty Status Toggle
  const handleToggleDuty = async (newStatus: DriverDutyStatus) => {
    if (!driver) return;
    try {
      setActionLoading('duty');
      const updated = await driverService.setDutyStatus(newStatus, driver.id);
      setDriver(updated);
      setSuccessNotice('Shift status updated to ' + newStatus.replace('_', ' ').toUpperCase());
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch {
      setErrorNotice('Failed to update duty status');
      setTimeout(() => setErrorNotice(null), 3500);
    } finally {
      setActionLoading(null);
    }
  };

  // Step-by-Step Status Transitions
  const handleStepAction = async (targetTripId: string, targetStatus: TripStatus, reason?: string) => {
    if (!driver) return;
    try {
      setActionLoading(targetStatus);
      await driverService.transitionTrip(targetTripId, targetStatus, driver.id, reason);
      setSuccessNotice('Status updated to ' + targetStatus.toUpperCase().replace('_', ' '));
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      setErrorNotice(msg);
      setTimeout(() => setErrorNotice(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  // Append Extra Fee
  const handleAddExtra = async (extra: DriverMeterExtra) => {
    if (!activeTrip) return;
    try {
      setActionLoading('extra');
      await driverService.addMeterExtra(activeTrip.id, extra);
      setShowExtrasModal(false);
      setSuccessNotice('Added ' + extra.name + ' (+$' + extra.amount.toFixed(2) + ')');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add extra fee';
      setErrorNotice(msg);
      setTimeout(() => setErrorNotice(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  // Schedule / Calendar Handlers
  const handleToggleDay = (day: DayOfWeek) => {
    setScheduleConfig((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          enabled: !prev.weeklyHours[day].enabled,
        },
      },
    }));
  };

  const handleTimeChange = (day: DayOfWeek, field: 'startHour' | 'endHour', value: string) => {
    setScheduleConfig((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          [field]: value,
        },
      },
    }));
  };

  const handleAddTimeOff = () => {
    if (!newTimeOffStart || !newTimeOffEnd) {
      setErrorNotice('Please select both start and end dates for time off');
      setTimeout(() => setErrorNotice(null), 3000);
      return;
    }
    const newEntry: DriverTimeOff = {
      id: 'to-' + Date.now(),
      startDate: newTimeOffStart,
      endDate: newTimeOffEnd,
      reason: newTimeOffReason.trim() || 'Scheduled Time Off',
      createdAt: new Date().toISOString(),
    };
    setScheduleConfig((prev) => ({
      ...prev,
      timeOffList: [...(prev.timeOffList || []), newEntry],
    }));
    setNewTimeOffStart('');
    setNewTimeOffEnd('');
    setNewTimeOffReason('');
  };

  const handleRemoveTimeOff = (id: string) => {
    setScheduleConfig((prev) => ({
      ...prev,
      timeOffList: (prev.timeOffList || []).filter((to) => to.id !== id),
    }));
  };

  const handleSaveSchedule = async () => {
    if (!driver) return;
    try {
      setIsSavingSchedule(true);
      const updated = await driverService.updateSchedule(scheduleConfig, driver.id);
      setDriver(updated);
      setSuccessNotice('Working hours and advance time off saved!');
      setTimeout(() => setSuccessNotice(null), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save schedule';
      setErrorNotice(msg);
      setTimeout(() => setErrorNotice(null), 3500);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <SpinnerIcon className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <h2 className="text-xl font-bold tracking-wide">Chesterfield Driver App</h2>
        <p className="text-slate-400 text-sm mt-1">Connecting to dispatch server...</p>
      </div>
    );
  }

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
  };

  const DAYS_ORDER: { key: DayOfWeek; label: string }[] = [
    { key: 'mon', label: 'Monday' },
    { key: 'tue', label: 'Tuesday' },
    { key: 'wed', label: 'Wednesday' },
    { key: 'thu', label: 'Thursday' },
    { key: 'fri', label: 'Friday' },
    { key: 'sat', label: 'Saturday' },
    { key: 'sun', label: 'Sunday' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-24 select-none antialiased">
      {/* Top Mobile App Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-30 flex items-center justify-between shadow-md gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 relative w-full">
          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-3 text-left min-w-0 flex-1 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 rounded-xl"
          >
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-sm shrink-0 uppercase">
                {driver?.name ? driver.name.charAt(0) : 'CT'}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                driver?.dutyStatus === 'on_duty' ? 'bg-emerald-500' :
                driver?.dutyStatus === 'on_break' ? 'bg-blue-400' :
                'bg-rose-500'
              }`} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-sm text-white leading-tight truncate">
                {driver?.name || 'Driver Console'}
              </h1>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {driver?.vehicleUnit ? `Cab #${driver.vehicleUnit}` : 'No Vehicle Assigned'}
                {driver?.vehicleMake && driver?.vehicleModel ? ` - ${driver.vehicleColor || ''} ${driver.vehicleMake} ${driver.vehicleModel}` : ''}
              </p>
            </div>
            <div className="shrink-0 text-slate-400 pl-2">
              <svg className={`w-5 h-5 transition-transform ${showProfileMenu ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute top-full left-0 right-0 mt-4 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl overflow-hidden z-50 animate-fadeIn min-w-[280px]">
              <div className="p-3 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Duty Status</span>
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => { handleToggleDuty('on_duty'); setTimeout(() => setShowProfileMenu(false), 200); }} disabled={actionLoading === 'duty'} className={`flex items-center gap-2 p-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${driver?.dutyStatus === 'on_duty' ? 'bg-emerald-950/80 text-emerald-400 ring-1 ring-emerald-500/40' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${driver?.dutyStatus === 'on_duty' ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                    On-Duty
                  </button>
                  <button onClick={() => { handleToggleDuty('on_break'); setTimeout(() => setShowProfileMenu(false), 200); }} disabled={actionLoading === 'duty'} className={`flex items-center gap-2 p-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${driver?.dutyStatus === 'on_break' ? 'bg-blue-950/80 text-blue-400 ring-1 ring-blue-500/40' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${driver?.dutyStatus === 'on_break' ? 'bg-blue-400' : 'bg-slate-600'}`}></span>
                    On-Break
                  </button>
                  <button onClick={() => { handleToggleDuty('off_duty'); setTimeout(() => setShowProfileMenu(false), 200); }} disabled={actionLoading === 'duty'} className={`flex items-center gap-2 p-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${driver?.dutyStatus === 'off_duty' ? 'bg-rose-950/80 text-rose-400 ring-1 ring-rose-500/40' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${driver?.dutyStatus === 'off_duty' ? 'bg-rose-500' : 'bg-slate-600'}`}></span>
                    Off-Duty
                  </button>
                </div>
              </div>

              <div className="p-2 border-b border-slate-800">
                <button onClick={() => setShowProfileMenu(false)} className="w-full flex items-center justify-between p-2 rounded-xl text-sm font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                    Dark Mode
                  </div>
                  <div className="w-8 h-4 bg-blue-600 rounded-full relative">
                    <div className="absolute right-1 top-0.5 w-3 h-3 bg-white rounded-full"></div>
                  </div>
                </button>
              </div>

              <div className="p-2">
                <button
                  type="button"
                  onClick={() => {
                    setTimeout(() => {
                      import('../core/services/auth/admin-auth.service').then(({ getAdminAuthService }) => {
                        getAdminAuthService().signOut();
                      });
                    }, 200);
                  }}
                  className="w-full flex items-center gap-2 p-2 rounded-xl text-sm font-semibold text-rose-400 hover:bg-rose-950/30 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <LogOutIcon className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Notifications Toast */}
      {successNotice && (
        <div className="mx-4 mt-3 p-3 bg-emerald-500/20 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn max-w-lg sm:mx-auto w-full">
          <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}
      {errorNotice && (
        <div className="mx-4 mt-3 p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2 animate-fadeIn max-w-lg sm:mx-auto w-full">
          <XIcon className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="p-4 max-w-lg mx-auto w-full flex-1 flex flex-col gap-4 pb-28">

        {/* TAB 1: ACTIVE TRIP VIEW */}
        {currentTab === 'active' && (
          <>
            {/* Quick Multi-Trip Queue Strip if multiple trips exist */}
            {scheduledTrips.length > 1 && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-1.5 shadow-md">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    Trip Lineup ({scheduledTrips.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('scheduled')}
                    className="text-[11px] text-blue-400 hover:underline font-bold"
                  >
                    View All &rarr;
                  </button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  {scheduledTrips.map((trip, idx) => {
                    const isSelected = activeTrip?.id === trip.id;
                    const pickupTime = trip.scheduledPickupTime
                      ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : 'ASAP';
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => setActiveTripId(trip.id)}
                        className={`px-3 py-2 rounded-xl text-left border shrink-0 transition-all cursor-pointer flex flex-col gap-0.5 min-w-[130px] ${
                          isSelected
                            ? 'bg-blue-600/15 border-blue-600 text-blue-300 shadow-sm'
                            : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-bold uppercase tracking-wider">
                            #{idx + 1} {trip.bookingType === 'asap' ? 'ASAP' : pickupTime}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-black uppercase bg-slate-900/80">
                            {trip.status.slice(0, 8)}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                          {trip.passenger?.firstName} {trip.passenger?.lastName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ACTIVE ASSIGNED TRIP CARD */}
            {activeTrip ? (
              <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
                {/* Trip Status Header Badge */}
                <div className="flex items-center justify-between bg-slate-800/80 px-3.5 py-2.5 rounded-2xl border border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Trip Status</span>
                  </div>
                  <span className={'px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase ' +
                    (activeTrip.status === 'in_progress'
                      ? 'bg-emerald-500 text-slate-950 animate-pulse'
                      : activeTrip.status === 'en_route'
                      ? 'bg-blue-500 text-white'
                      : activeTrip.status === 'arrived'
                      ? 'bg-blue-400 text-slate-950'
                      : 'bg-purple-500 text-white')}>
                    {activeTrip.status.replace('_', ' ')}
                  </span>
                </div>

                {/* HIGH-VISIBILITY PROMINENT PICKUP TIME CARD */}
                <div className="bg-gradient-to-r from-blue-600/20 via-blue-600/10 to-transparent border-2 border-blue-600/50 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                      <ClockIcon className="w-6 h-6 text-slate-950" />
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-400 block">
                        {activeTrip.bookingType === 'asap' ? 'Immediate Pickup' : 'Scheduled Pickup Time'}
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                        {activeTrip.scheduledPickupTime
                          ? new Date(activeTrip.scheduledPickupTime).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                            })
                          : 'ASAP (Immediate)'}
                      </div>
                      {activeTrip.scheduledPickupTime && (
                        <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5 mt-0.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                          {new Date(activeTrip.scheduledPickupTime).toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-600/30">
                      {activeTrip.bookingType === 'asap' ? 'ASAP' : 'PRE-BOOKED'}
                    </span>
                  </div>
                </div>

                {/* Passenger Info Card */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-slate-400 block font-medium">Passenger</span>
                    <h4 className="text-base font-bold text-white truncate">
                      {activeTrip.passenger?.firstName} {activeTrip.passenger?.lastName}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                        {activeTrip.passenger?.passengerCount || 1} Pax
                      </span>
                      <span className="flex items-center gap-1">
                        <LuggageIcon className="w-3.5 h-3.5 text-slate-400" />
                        {activeTrip.passenger?.luggageCount || 0} Bags
                      </span>
                      {activeTrip.pricing?.carSeatFee && activeTrip.pricing.carSeatFee > 0 ? (
                        <span className="text-blue-400 font-semibold text-[11px] bg-blue-600/10 px-2 py-0.5 rounded-md border border-blue-600/30">
                          Car Seat Req.
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Contact Buttons (Call & Text SMS) */}
                  {activeTrip.passenger?.phone && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const presetDefault =
                            activeTrip.status === 'en_route'
                              ? 'Chesterfield Taxi: Your driver is en route to your pickup location.'
                              : activeTrip.status === 'arrived'
                              ? 'Chesterfield Taxi: Your driver has arrived outside at your pickup location.'
                              : activeTrip.status === 'assigned' || activeTrip.status === 'accepted'
                              ? 'Chesterfield Taxi: Your ride is confirmed with Chesterfield Taxi.'
                              : 'Chesterfield Taxi driver: I am waiting outside for you.';
                          setCustomSmsText(presetDefault);
                          setShowSmsModal(true);
                        }}
                        className="w-11 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 flex items-center justify-center shadow cursor-pointer transition-transform active:scale-95"
                        title="Send SMS / Text"
                      >
                        <MailIcon className="w-5 h-5" />
                      </button>

                      <a
                        href={'tel:' + activeTrip.passenger.phone}
                        className="w-11 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg cursor-pointer transition-transform active:scale-95"
                        title="Call Passenger"
                      >
                        <PhoneIcon className="w-5 h-5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Route Details with Direct Navigation Links */}
                <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
                  {/* Pickup with Navigation Button */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                        P
                      </div>
                      <div className="flex-1">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                          Pickup Location
                        </span>
                        <p className="text-sm font-semibold text-white leading-snug">
                          {activeTrip.pickupLocation?.address}
                        </p>
                        {activeTrip.pickupLocation?.driverNotes && (
                          <p className="text-xs text-blue-300 mt-1 italic">
                            Note: {activeTrip.pickupLocation.driverNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Navigation Direct Link */}
                    {activeTrip.pickupLocation?.address && (
                      <button
                        type="button"
                        onClick={() => openMapNavigation(activeTrip.pickupLocation.address)}
                        className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                        title="Navigate in Maps"
                      >
                        <MapPinIcon className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Navigate</span>
                      </button>
                    )}
                  </div>

                  {/* Intermediate Stops */}
                  {activeTrip.intermediateStops && activeTrip.intermediateStops.length > 0 && (
                    <div className="pl-9 space-y-2 border-l-2 border-dashed border-slate-700 ml-3.5">
                      {activeTrip.intermediateStops.map((stop, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-300">
                            <span className="text-blue-400 font-bold">Stop {idx + 1}:</span> {stop.address}
                          </div>
                          {stop.address && (
                            <button
                              type="button"
                              onClick={() => openMapNavigation(stop.address)}
                              className="px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/30 text-blue-300 rounded-lg text-[10px] font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                            >
                              <span>Nav</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Dropoff with Navigation Button */}
                  <div className="flex items-start justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                        D
                      </div>
                      <div className="flex-1">
                        <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider block">
                          Destination
                        </span>
                        <p className="text-sm font-semibold text-white leading-snug">
                          {activeTrip.dropoffLocation?.address}
                        </p>
                        {activeTrip.flightNotes && (
                          <p className="text-xs text-blue-300 mt-1 flex items-center gap-1.5">
                            <span className="font-semibold text-blue-400">Flight:</span> {activeTrip.flightNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Navigation Direct Link */}
                    {activeTrip.dropoffLocation?.address && (
                      <button
                        type="button"
                        onClick={() => openMapNavigation(activeTrip.dropoffLocation.address)}
                        className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
                        title="Navigate in Maps"
                      >
                        <MapPinIcon className="w-3.5 h-3.5 text-rose-400" />
                        <span>Navigate</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Convenient Estimated Fare Summary (Relocated after route) */}
                <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-3.5 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-[10px] font-mono tracking-wider text-slate-400 uppercase block">
                      Estimated Total Fare
                    </span>
                    <span className="text-xs text-slate-400">
                      {activeTrip.pricing?.distanceMiles ? `${activeTrip.pricing.distanceMiles.toFixed(1)} miles approx.` : 'Distance calculated'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-blue-400">
                      ${activeTrip.pricing?.totalFare?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>

                {/* IN-VEHICLE LIVE TAXIMETER (Displays when in_progress) */}
                {activeTrip.status === 'in_progress' && (
                  <div className="bg-slate-950 border-2 border-emerald-500/60 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          In-Vehicle Meter Active
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                        TARIFF: {activeTrip.pricing?.tariffProfileName || tariffs.find((t) => t.id === activeTrip.pricing?.tariffProfileId)?.name || 'Standard Taximeter'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">TIME</span>
                        <span className="text-lg font-black text-white font-mono">
                          {formatTimer(meterSeconds)}
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">DISTANCE</span>
                        <span className="text-lg font-black text-white font-mono">
                          {meterDistance.toFixed(2)} mi
                        </span>
                      </div>
                      <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-slate-400 block font-mono">CURRENT FARE</span>
                        <span className="text-lg font-black text-blue-400 font-mono">
                          ${calculateCurrentMeterFare().toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Add Extra Button */}
                    <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
                      <span className="text-xs text-slate-400">Tolls / Surcharges</span>
                      <button
                        type="button"
                        onClick={() => setShowExtrasModal(true)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-400 text-slate-950 font-bold text-xs rounded-xl shadow cursor-pointer transition-colors"
                      >
                        + Add Toll / Extra
                      </button>
                    </div>

                    {/* Appended Extras List */}
                    {activeTrip.pricing?.driverExtras && activeTrip.pricing.driverExtras.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                          Appended In-Cab Extras:
                        </span>
                        <div className="space-y-1">
                          {activeTrip.pricing.driverExtras.map((ex, i) => (
                            <div key={i} className="flex justify-between text-xs text-slate-300">
                              <span>{ex.name}</span>
                              <span className="font-bold text-blue-400">+${ex.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SEQUENTIAL STATUS ACTION BUTTONS */}
                <div className="pt-2">
                  {activeTrip.status === 'offered' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleStepAction(activeTrip.id, 'assigned')}
                        className="py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'assigned' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : null}
                        <span>ACCEPT TRIP</span>
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleStepAction(activeTrip.id, 'pending', 'Driver declined trip')}
                        className="py-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-2xl border border-slate-700 transition-all cursor-pointer"
                      >
                        DECLINE
                      </button>
                    </div>
                  ) : (activeTrip.status === 'assigned' || activeTrip.status === 'accepted' || activeTrip.status === 'UNCONFIRMED' || activeTrip.status === 'CONFIRMED' || activeTrip.status === 'unconfirmed' || activeTrip.status === 'confirmed') ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={Boolean(actionLoading)}
                        onClick={() => handleStepAction(activeTrip.id, 'en_route')}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-base rounded-2xl shadow-xl shadow-blue-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                      >
                        {actionLoading === 'en_route' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <CarIcon className="w-5 h-5" />}
                        <span>EN ROUTE TO PICKUP</span>
                      </button>
                      {/* Secondary Accept button if unconfirmed/assigned to lock in acceptance */}
                      {(activeTrip.status === 'assigned' || activeTrip.status === 'UNCONFIRMED' || activeTrip.status === 'unconfirmed') && (
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleStepAction(activeTrip.id, 'accepted')}
                          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors cursor-pointer"
                        >
                          {actionLoading === 'accepted' ? 'Accepting...' : 'Mark Accepted'}
                        </button>
                      )}
                    </div>
                  ) : activeTrip.status === 'en_route' ? (
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => handleStepAction(activeTrip.id, 'arrived')}
                      className="w-full py-4 bg-blue-600 hover:bg-blue-400 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-blue-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'arrived' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <MapPinIcon className="w-5 h-5" />}
                      <span>ARRIVED AT PICKUP</span>
                    </button>
                  ) : activeTrip.status === 'arrived' ? (
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => handleStepAction(activeTrip.id, 'in_progress')}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-base rounded-2xl shadow-xl shadow-emerald-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 animate-pulse"
                    >
                      {actionLoading === 'in_progress' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <ClockIcon className="w-5 h-5" />}
                      <span>START TRIP / IN_PROGRESS</span>
                    </button>
                  ) : activeTrip.status === 'in_progress' ? (
                    <button
                      type="button"
                      disabled={Boolean(actionLoading)}
                      onClick={() => handleStepAction(activeTrip.id, 'completed')}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-emerald-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      {actionLoading === 'completed' ? <SpinnerIcon className="w-5 h-5 animate-spin" /> : <FlagIcon className="w-5 h-5" />}
                      <span>COMPLETE TRIP</span>
                    </button>
                  ) : null}
                </div>
              </section>
            ) : (
              /* NO ACTIVE TRIP - STANDBY STATE */
              <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl text-center flex flex-col items-center justify-center min-h-[300px]">
                <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4 text-blue-400 shadow-inner">
                  <CarIcon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">Standby for Next Trip</h3>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  You are currently <strong className="text-emerald-400">{driver?.dutyStatus?.replace('_', ' ').toUpperCase()}</strong>. Keep this screen open to receive instant ride dispatches from Chesterfield control desk.
                </p>

                <div className="mt-6 pt-6 border-t border-slate-800/80 w-full flex items-center justify-around text-xs text-slate-400">
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Service Unit</span>
                    <span className="font-bold text-white">{driver?.vehicleUnit}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Tier Class</span>
                    <span className="font-bold text-blue-400 uppercase">{driver?.vehicleTier}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-mono text-slate-500">Area</span>
                    <span className="font-bold text-white">{driver?.zone}</span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* TAB 2: OFFERS VIEW */}
        {currentTab === 'offers' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Trip Offers ({offeredTrips.length})</h2>
                <p className="text-xs text-slate-400">Incoming dispatch dispatches awaiting your acceptance</p>
              </div>
            </div>

            {offeredTrips.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Pending Trip Offers</h3>
                <p className="text-xs max-w-xs">When dispatch broadcasts or offers you an ASAP or scheduled booking, it will appear here instantly.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {offeredTrips.map((offer) => {
                  const pickupTime = offer.scheduledPickupTime
                    ? new Date(offer.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : 'ASAP';
                  return (
                    <div
                      key={offer.id}
                      className="bg-slate-900 border-2 border-blue-600/60 rounded-3xl p-4 shadow-xl space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                          <span className="text-xs font-black text-blue-400 uppercase tracking-wide">
                            {offer.bookingType === 'asap' ? 'ASAP Dispatch Offer' : 'Scheduled Trip Offer'}
                          </span>
                        </div>
                        <span className="text-base font-black text-white">
                          ${offer.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                      </div>

                      <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-bold text-white block">
                            {offer.passenger?.firstName} {offer.passenger?.lastName}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {offer.passenger?.passengerCount || 1} Pax · {offer.bookingType === 'asap' ? 'Immediate' : pickupTime}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-blue-400 font-mono block">EST. DISTANCE</span>
                          <span className="text-xs font-bold text-white">{offer.pricing?.distanceMiles?.toFixed(1) || '—'} mi</span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold shrink-0">Pickup:</span>
                          <span className="text-slate-200">{offer.pickupLocation?.address}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-rose-400 font-bold shrink-0">Dest:</span>
                          <span className="text-slate-200">{offer.dropoffLocation?.address}</span>
                        </div>
                      </div>

                      {/* Accept & Decline Buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => {
                            handleStepAction(offer.id, 'assigned');
                            setActiveTripId(offer.id);
                            setCurrentTab('active');
                          }}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          {actionLoading === 'assigned' ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
                          <span>ACCEPT OFFER</span>
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleStepAction(offer.id, 'pending', 'Driver declined trip offer')}
                          className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                        >
                          DECLINE
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: SCHEDULED / ACCEPTED TRIPS QUEUE */}
        {currentTab === 'scheduled' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Scheduled Trips ({scheduledTrips.length})</h2>
                <p className="text-xs text-slate-400">Accepted and upcoming trips in your assignment queue</p>
              </div>
            </div>

            {scheduledTrips.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-slate-400 flex flex-col items-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-3 text-blue-400">
                  <ClockIcon className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Scheduled Trips</h3>
                <p className="text-xs max-w-xs">Trips assigned or confirmed by dispatch will be listed here chronologically.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scheduledTrips.map((trip, idx) => {
                  const isCurrentActive = activeTrip?.id === trip.id;
                  const pickupTimeFormatted = trip.scheduledPickupTime
                    ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : 'ASAP';
                  const pickupDateFormatted = trip.scheduledPickupTime
                    ? new Date(trip.scheduledPickupTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
                    : 'Today';

                  return (
                    <div
                      key={trip.id}
                      className={`bg-slate-900 rounded-3xl p-4 border transition-all ${
                        isCurrentActive ? 'border-blue-600 shadow-xl' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-600/30">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <ClockIcon className="w-3.5 h-3.5 text-blue-400" />
                            {trip.bookingType === 'asap' ? 'ASAP' : `${pickupTimeFormatted} · ${pickupDateFormatted}`}
                          </span>
                        </div>
                        <span className="text-xs font-black text-blue-400">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-bold text-white">
                            {trip.passenger?.firstName} {trip.passenger?.lastName}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <UserIcon className="w-3 h-3 text-slate-400" />
                              {trip.passenger?.passengerCount || 1} Pax
                            </span>
                            <span>·</span>
                            <span>Status: <strong className="uppercase text-blue-300">{trip.status}</strong></span>
                          </div>
                        </div>
                        {trip.passenger?.phone && (
                          <a
                            href={'tel:' + trip.passenger.phone}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center border border-slate-700"
                            title="Call Passenger"
                          >
                            <PhoneIcon className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      <div className="space-y-2 text-xs bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 mb-3">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1">
                            <span className="text-emerald-400 font-bold block text-[10px] uppercase">Pickup:</span>
                            <span className="text-slate-200">{trip.pickupLocation?.address}</span>
                          </div>
                          {trip.pickupLocation?.address && (
                            <button
                              type="button"
                              onClick={() => openMapNavigation(trip.pickupLocation.address)}
                              className="px-2 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold shrink-0"
                            >
                              Maps
                            </button>
                          )}
                        </div>
                        <div className="flex items-start justify-between gap-1 pt-1.5 border-t border-slate-800">
                          <div className="flex-1">
                            <span className="text-rose-400 font-bold block text-[10px] uppercase">Destination:</span>
                            <span className="text-slate-200">{trip.dropoffLocation?.address}</span>
                          </div>
                          {trip.dropoffLocation?.address && (
                            <button
                              type="button"
                              onClick={() => openMapNavigation(trip.dropoffLocation.address)}
                              className="px-2 py-1 bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-lg text-[10px] font-bold shrink-0"
                            >
                              Maps
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTripId(trip.id);
                            setCurrentTab('active');
                          }}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isCurrentActive
                              ? 'bg-blue-600 text-white font-black'
                              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                          }`}
                        >
                          {isCurrentActive ? '✓ Active in Meter' : 'Set as Active Ride'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB: MESSAGES (Placeholder) */}
        {currentTab === 'messages' && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              <h2 className="text-base font-bold text-white leading-tight">Messages</h2>
            </div>
            
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col items-center justify-center text-center space-y-3 min-h-[300px]">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mb-2">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h3 className="font-bold text-white text-sm">No Messages</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                You have no active messages with dispatch or passengers.
              </p>
            </div>
          </section>
        )}

        {/* TAB 4: CALENDAR & WORKING HOURS */}
        {currentTab === 'schedule' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-400" />
                Driver Availability & Working Hours
              </h2>
              <p className="text-xs text-slate-400">
                Configure your regular shift hours and request advance notice days off for dispatch scheduling.
              </p>
            </div>

            {/* Weekly Working Hours Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                Regular Weekly Shift Hours
              </span>

              <div className="space-y-2">
                {DAYS_ORDER.map(({ key, label }) => {
                  const dayConfig = scheduleConfig.weeklyHours?.[key] || { enabled: false, startHour: '08:00', endHour: '17:00' };
                  return (
                    <div
                      key={key}
                      className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                        dayConfig.enabled
                          ? 'bg-slate-950/80 border-slate-700/80'
                          : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between sm:justify-start gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={dayConfig.enabled}
                            onChange={() => handleToggleDay(key)}
                            id={`day-${key}`}
                            className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                          />
                          <label htmlFor={`day-${key}`} className="text-xs font-bold text-white cursor-pointer select-none">
                            {label}
                          </label>
                        </div>
                        {!dayConfig.enabled && (
                          <span className="text-[11px] text-slate-500 font-semibold italic sm:hidden">Off-duty / Closed</span>
                        )}
                      </div>

                      {dayConfig.enabled ? (
                        <div className="flex items-center gap-2 text-xs w-full sm:w-auto">
                          <div className="flex-1 sm:flex-initial min-w-0">
                            <input
                              type="time"
                              value={dayConfig.startHour}
                              onChange={(e) => handleTimeChange(key, 'startHour', e.target.value)}
                              className="w-full sm:w-auto bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 outline-none text-xs text-center"
                            />
                          </div>
                          <span className="text-slate-400 text-xs px-1 shrink-0">to</span>
                          <div className="flex-1 sm:flex-initial min-w-0">
                            <input
                              type="time"
                              value={dayConfig.endHour}
                              onChange={(e) => handleTimeChange(key, 'endHour', e.target.value)}
                              className="w-full sm:w-auto bg-slate-800 border border-slate-700 text-white rounded-lg px-2.5 py-1.5 outline-none text-xs text-center"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-semibold italic hidden sm:inline">Off-duty / Closed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Advance Notice Days Off / Vacation Calendar */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                Advance Notice Days Off / Time Off
              </span>
              <p className="text-xs text-slate-400">
                Register planned days off so dispatch does not assign bookings to your unit.
              </p>

              {/* Add New Time Off Entry */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-300 block">Schedule Upcoming Time Off:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">From Date</label>
                    <input
                      type="date"
                      value={newTimeOffStart}
                      onChange={(e) => setNewTimeOffStart(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">To Date</label>
                    <input
                      type="date"
                      value={newTimeOffEnd}
                      onChange={(e) => setNewTimeOffEnd(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Reason / Note (e.g. Doctor appt, Vacation)"
                  value={newTimeOffReason}
                  onChange={(e) => setNewTimeOffReason(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-blue-600"
                />

                <button
                  type="button"
                  onClick={handleAddTimeOff}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  + Add Advance Notice Days Off
                </button>
              </div>

              {/* Registered Time Off List */}
              {scheduleConfig.timeOffList && scheduleConfig.timeOffList.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Approved / Scheduled Days Off:
                  </span>
                  {scheduleConfig.timeOffList.map((to) => (
                    <div
                      key={to.id}
                      className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>📅</span>
                          <span>{to.startDate} to {to.endDate}</span>
                        </div>
                        {to.reason && <p className="text-[11px] text-slate-400 mt-0.5">{to.reason}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTimeOff(to.id)}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg cursor-pointer transition-colors"
                        title="Remove time off"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No scheduled days off currently registered.</p>
              )}

              {/* Save Schedule Button */}
              <div className="pt-3 border-t border-slate-800">
                <button
                  type="button"
                  disabled={isSavingSchedule}
                  onClick={handleSaveSchedule}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-blue-950 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSavingSchedule ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : null}
                  <span>SAVE AVAILABILITY & CALENDAR</span>
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* STICKY BOTTOM TAB NAVIGATION BAR */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md px-3 py-2 shadow-2xl">
        <div className="grid grid-cols-5 gap-1.5 max-w-lg mx-auto">
          {/* Active Trip Tab */}
          <button
            type="button"
            onClick={() => setCurrentTab('active')}
            className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'active'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CarIcon className="w-5 h-5" />
            <span className="truncate">Active Trip</span>
            {activeTrip && (
              <span className={`w-2 h-2 rounded-full absolute top-1.5 right-2 ${
                currentTab === 'active' ? 'bg-slate-950' : 'bg-blue-400 animate-ping'
              }`} />
            )}
          </button>

          {/* Offers Tab */}
          <button
            type="button"
            onClick={() => setCurrentTab('offers')}
            className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'offers'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="truncate">Offers</span>
            {offeredTrips.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-black absolute top-1 right-2 ${
                currentTab === 'offers' ? 'bg-slate-950 text-blue-400' : 'bg-blue-600 text-white animate-bounce'
              }`}>
                {offeredTrips.length}
              </span>
            )}
          </button>

          {/* Messages Tab */}
          <button
            type="button"
            onClick={() => setCurrentTab('messages')}
            className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'messages'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span className="truncate">Messages</span>
          </button>

          {/* Scheduled Trips Tab */}
          <button
            type="button"
            onClick={() => setCurrentTab('scheduled')}
            className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative ${
              currentTab === 'scheduled'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ClockIcon className="w-5 h-5" />
            <span className="truncate">Scheduled</span>
            {scheduledTrips.length > 0 && (
              <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-black absolute top-1 right-2 ${
                currentTab === 'scheduled' ? 'bg-slate-950 text-blue-400' : 'bg-slate-700 text-white'
              }`}>
                {scheduledTrips.length}
              </span>
            )}
          </button>

          {/* Calendar / Availability Tab */}
          <button
            type="button"
            onClick={() => setCurrentTab('schedule')}
            className={`py-2 px-1 rounded-2xl text-[11px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
              currentTab === 'schedule'
                ? 'bg-blue-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <CalendarIcon className="w-5 h-5" />
            <span className="truncate">Calendar</span>
          </button>
        </div>
      </nav>

      {/* PASSENGER SMS QUICK-TEXT MODAL */}
      {showSmsModal && activeTrip?.passenger?.phone && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <MailIcon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Text Passenger</h4>
                  <span className="text-[11px] text-slate-400">{activeTrip.passenger?.firstName} ({activeTrip.passenger.phone})</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSmsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick-tap Status Presets */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Quick Status Presets:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  {
                    title: 'En Route to Pickup',
                    text: 'Chesterfield Taxi: Your driver is en route to your pickup location.',
                  },
                  {
                    title: 'Arrived Outside',
                    text: 'Chesterfield Taxi: Your driver has arrived outside at your pickup location.',
                  },
                  {
                    title: 'Ride Confirmed',
                    text: 'Chesterfield Taxi: Your ride is confirmed with Chesterfield Taxi.',
                  },
                  {
                    title: 'Waiting Outside',
                    text: 'Chesterfield Taxi driver: I am waiting outside for you.',
                  },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCustomSmsText(preset.text)}
                    className="p-2.5 bg-slate-800/80 hover:bg-slate-800 rounded-xl text-left border border-slate-700/80 flex flex-col gap-0.5 cursor-pointer transition-all active:scale-98"
                  >
                    <span className="text-[11px] font-bold text-blue-400">{preset.title}</span>
                    <span className="text-xs text-slate-300">{preset.text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editable SMS Body */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Message Preview:
              </span>
              <textarea
                rows={3}
                value={customSmsText}
                onChange={(e) => setCustomSmsText(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white outline-none focus:border-blue-600"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSmsModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <a
                href={`sms:${activeTrip.passenger.phone}?body=${encodeURIComponent(customSmsText)}`}
                onClick={() => setShowSmsModal(false)}
                className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <MailIcon className="w-4 h-4" />
                <span>Open in SMS App</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL METER EXTRAS MODAL */}
      {showExtrasModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-base text-white">Add Toll / Extras to Fare</h4>
              <button
                type="button"
                onClick={() => setShowExtrasModal(false)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Quick Selection Presets:
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_EXTRAS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={actionLoading === 'extra'}
                    onClick={() =>
                      handleAddExtra({
                        id: 'extra-' + Date.now() + '-' + idx,
                        name: preset.name,
                        amount: preset.amount,
                        category: preset.category,
                      })
                    }
                    className="p-3 bg-slate-800 hover:bg-slate-700/80 rounded-xl text-left flex items-center justify-between text-xs font-semibold text-slate-200 cursor-pointer transition-colors"
                  >
                    <span>{preset.name}</span>
                    <span className="font-bold text-blue-400">+${preset.amount.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Extra Inputs */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Custom Surcharge Amount:
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Reason / Description"
                  value={customExtraName}
                  onChange={(e) => setCustomExtraName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-600"
                />
                <input
                  type="number"
                  step="0.50"
                  placeholder="$0.00"
                  value={customExtraAmount}
                  onChange={(e) => setCustomExtraAmount(e.target.value)}
                  className="w-24 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-blue-400 font-bold outline-none focus:border-blue-600 text-right"
                />
              </div>

              <button
                type="button"
                disabled={!customExtraName || !customExtraAmount || actionLoading === 'extra'}
                onClick={() => {
                  const amt = parseFloat(customExtraAmount);
                  if (isNaN(amt) || amt <= 0) return;
                  handleAddExtra({
                    id: 'extra-custom-' + Date.now(),
                    name: customExtraName,
                    amount: amt,
                    category: customExtraCategory,
                  });
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow cursor-pointer transition-colors"
              >
                Attach Custom Extra Fee
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
