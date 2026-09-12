import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings } from '../core/types/config';
import type { Trip, TripStatus } from '../core/types/trip';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { DispatchBookingEngine, type DispatchFormValues } from '../components/domain/dispatch/DispatchBookingEngine';
import { CustomDateTimePicker, type DateTimeRange } from '../components/domain/dispatch/CustomDateTimePicker';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import { loadGoogleMaps, CHESTERFIELD_CENTER } from '../core/services/maps/google-maps-loader';
import { SpinnerIcon } from '../components/ui/Icons';
import { Badge } from '../components/ui/Badge';

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Tactical split-screen dispatch dashboard' },
  ];
}

interface DraftTab {
  id: string;
  isNew: boolean;
  trip?: Trip;
  formValues?: DispatchFormValues;
}

interface DriverRosterItem {
  id: string;
  name: string;
  status: 'available' | 'on_trip' | 'offline';
  vehicle: string;
  tier: string;
  phone: string;
  zone: string;
  currentTripId?: string;
}

interface DispatchMessageItem {
  id: string;
  to: string;
  text: string;
  timestamp: string;
  priority: 'normal' | 'urgent';
}

const INITIAL_DRIVERS: DriverRosterItem[] = [
  {
    id: 'drv-101',
    name: 'Driver 101 (Mike T.)',
    status: 'available',
    vehicle: 'Toyota Camry (#204)',
    tier: 'Sedan',
    phone: '(314) 555-0101',
    zone: 'Chesterfield Valley',
  },
  {
    id: 'drv-104',
    name: 'Driver 104 (Sarah K.)',
    status: 'on_trip',
    vehicle: 'Chevy Suburban (#301)',
    tier: 'SUV',
    phone: '(314) 555-0104',
    zone: 'Lambert Airport (STL)',
    currentTripId: 'tr-8831',
  },
  {
    id: 'drv-108',
    name: 'Driver 108 (David R.)',
    status: 'available',
    vehicle: 'Ford Transit (#102)',
    tier: 'Van',
    phone: '(314) 555-0108',
    zone: 'Town and Country',
  },
  {
    id: 'drv-112',
    name: 'Driver 112 (James W.)',
    status: 'available',
    vehicle: 'Lincoln Continental (#208)',
    tier: 'Sedan',
    phone: '(314) 555-0112',
    zone: 'Ballwin / Manchester',
  },
  {
    id: 'drv-115',
    name: 'Driver 115 (Alex M.)',
    status: 'offline',
    vehicle: 'Toyota Sienna (#105)',
    tier: 'Van',
    phone: '(314) 555-0115',
    zone: 'Off Duty',
  },
];

export default function DispatchRoute() {
  const navigate = useNavigate();

  // Auth & Settings state
  const [user, setUser] = useState<AdminUser | null>(() => getAdminAuthService().getCurrentUser());
  const [isAuthChecking, setIsAuthChecking] = useState(() => !getAdminAuthService().getCurrentUser());
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());

  // Trips real-time state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [filterPreset, setFilterPreset] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [pillFilter, setPillFilter] = useState<'all' | 'pending' | 'assigned' | 'completed' | 'cancelled' | 'unassigned'>('all');
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQueueTripId, setSelectedQueueTripId] = useState<string | null>(null);
  const [selectedMapTrip, setSelectedMapTrip] = useState<Trip | null>(null);
  const [shouldZoomMap, setShouldZoomMap] = useState<boolean>(false);

  // Custom DateTime Range Picker State
  const [dateTimeRange, setDateTimeRange] = useState<DateTimeRange>({
    startDate: '',
    endDate: '',
    startTime: { hour: '12', minute: '00', period: 'AM' },
    endTime: { hour: '11', minute: '59', period: 'PM' },
    presetKey: 'all_time',
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerTriggerRef = useRef<HTMLDivElement>(null);

  // Filter Pills & Dropdown System (Driver, Vehicle, Company, Payment Type, Tariff, Has Car Seat)
  type FilterType = 'driver' | 'vehicle' | 'company' | 'payment_type' | 'tariff' | 'has_car_seat';
  const [isAddFilterOpen, setIsAddFilterOpen] = useState(false);
  const addFilterRef = useRef<HTMLDivElement>(null);
  const [activeFilterKeys, setActiveFilterKeys] = useState<FilterType[]>(['driver', 'has_car_seat', 'vehicle']);
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<string>('all');
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('all');
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<string>('all');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('all');
  const [selectedTariffFilter, setSelectedTariffFilter] = useState<string>('all');

  // Draft Tabs state
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const [drafts, setDrafts] = useState<DraftTab[]>([
    { id: 'new-1', isNew: true },
  ]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState(2);
  const [isTabOverflowOpen, setIsTabOverflowOpen] = useState(false);
  const tabOverflowRef = useRef<HTMLDivElement>(null);

  // Operational Right Dock Tools (Multi-tasking, non-blocking)
  const [isDriversOpen, setIsDriversOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isPhoneOpen, setIsPhoneOpen] = useState(false);
  const [minimizedPanels, setMinimizedPanels] = useState<Record<string, boolean>>({});
  const operationsContainerRef = useRef<HTMLDivElement>(null);

  // Drivers Data State
  const [drivers, setDrivers] = useState<DriverRosterItem[]>(INITIAL_DRIVERS);
  const [driverFilter, setDriverFilter] = useState<'all' | 'available' | 'on_trip' | 'offline'>('all');

  // Messages Data State
  const [messages, setMessages] = useState<DispatchMessageItem[]>([
    {
      id: 'msg-1',
      to: 'All Drivers',
      text: 'Morning briefing: Lambert Airport terminal arrivals surge active until 11:30 AM.',
      timestamp: '08:15 AM',
      priority: 'normal',
    },
    {
      id: 'msg-2',
      to: 'Driver 104 (Sarah K.)',
      text: 'Terminal 1 pickup confirmed for passenger Johnson.',
      timestamp: '08:32 AM',
      priority: 'normal',
    },
  ]);
  const [msgRecipient, setMsgRecipient] = useState('All Drivers');
  const [msgText, setMsgText] = useState('');
  const [msgPriority, setMsgPriority] = useState<'normal' | 'urgent'>('normal');

  // Tactical Presets State (Persisted)
  const [tacticalPresets, setTacticalPresets] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('chesterfield_tactical_presets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      'Airport surge at Lambert T1/T2.',
      'Traffic advisory: I-64 westbound heavy congestion.',
      'Check in with dispatch if available.',
      'Weather alert: slick roads, maintain safe following distance.',
      'Terminal 2 pickup queue backed up.',
      'Priority VIP pickup waiting at Lambert Main.',
    ];
  });
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetText, setNewPresetText] = useState('');

  // Phone Softphone State
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeCallStatus, setActiveCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);

  // Resizable layout dimensions - Default to balanced heights so Softphone never overflows
  const [sidebarWidth, setSidebarWidth] = useState(430); // 340px - 620px
  const [queueHeight, setQueueHeight] = useState(240); // 160px - 50%
  const [operationsWidth, setOperationsWidth] = useState(400); // 320px - 750px
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>({
    drivers: 180,
    messages: 180,
    phone: 220,
  });
  const [isViewsDropdownOpen, setIsViewsDropdownOpen] = useState(false);
  const viewsDropdownRef = useRef<HTMLDivElement>(null);

  // Dynamic height balance when panels change or keyboard toggles to guarantee NO sidebar container overflow
  const activePanels = [
    isDriversOpen && 'drivers',
    isMessagesOpen && 'messages',
    isPhoneOpen && 'phone',
  ].filter(Boolean) as ('drivers' | 'messages' | 'phone')[];
  const activeOperationalCount = activePanels.length;

  useEffect(() => {
    if (!operationsContainerRef.current) return;
    const containerH = operationsContainerRef.current.clientHeight || 620;
    const activeCount = activePanels.filter((p) => !minimizedPanels[p]).length;
    if (activeCount <= 1) return;

    // Minimum required height for phone if active
    const requiredPhone = showKeypad ? 270 : 190;
    const isPhoneActive = isPhoneOpen && !minimizedPanels.phone;
    const phoneReserve = isPhoneActive ? requiredPhone : (isPhoneOpen ? 32 : 0);

    const availableForUpper = containerH - phoneReserve - (activePanels.length * 8);

    if (isDriversOpen && !minimizedPanels.drivers && isMessagesOpen && !minimizedPanels.messages) {
      const half = Math.max(110, Math.floor(availableForUpper / 2));
      setPanelHeights((prev) => {
        if (prev.drivers + prev.messages > availableForUpper) {
          return {
            ...prev,
            drivers: half,
            messages: half,
            phone: requiredPhone,
          };
        }
        return prev;
      });
    }
  }, [activePanels.length, isDriversOpen, isMessagesOpen, isPhoneOpen, showKeypad, minimizedPanels]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (viewsDropdownRef.current && !viewsDropdownRef.current.contains(target)) {
        setIsViewsDropdownOpen(false);
      }
      if (tabOverflowRef.current && !tabOverflowRef.current.contains(target)) {
        setIsTabOverflowOpen(false);
      }
      if (addFilterRef.current && !addFilterRef.current.contains(target)) {
        setIsAddFilterOpen(false);
      }
    };
    if (isViewsDropdownOpen || isTabOverflowOpen || isAddFilterOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isViewsDropdownOpen, isTabOverflowOpen, isAddFilterOpen]);

  // Auth Guard
  useEffect(() => {
    const unsubscribe = getAdminAuthService().onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/admin/login?message=unauthenticated', { replace: true });
      } else if (currentUser.role !== 'admin' && currentUser.role !== 'dispatcher') {
        navigate('/admin/login?message=unauthorized', { replace: true });
      } else {
        setUser(currentUser);
        setIsAuthChecking(false);
      }
    });
    return unsubscribe;
  }, [navigate]);

  // Settings
  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings((updated) => setSettings(updated), () => {});
    return unsub;
  }, []);

  // Trips real-time subscription
  useEffect(() => {
    const service = getBookingService();
    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(
        (updatedTrips) => setTrips(updatedTrips),
        (err) => console.error('[Dispatch] Trips subscription error:', err)
      );
    } else if (service.getAllTrips) {
      service.getAllTrips().then(setTrips).catch(console.error);
    }
  }, []);

  // When active draft tab changes, clear selected map trip so route defaults to active draft
  useEffect(() => {
    setSelectedMapTrip(null);
    setShouldZoomMap(false);
  }, [activeDraftId]);

  // Softphone call timer
  useEffect(() => {
    let interval: any;
    if (activeCallStatus === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [activeCallStatus]);

  // Immediate Sign Out with clean window redirect
  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
        localStorage.removeItem('chesterfield_taxi_admin_session');
      } catch {}
    }
    try {
      getAdminAuthService().signOut().catch(() => {});
    } catch {}
    window.location.href = '/admin/login?message=logged_out';
  };

  // Create new draft
  const createDraft = () => {
    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} drafts allowed.`);
      return;
    }
    const newDraft: DraftTab = {
      id: `new-${nextDraftIdx}`,
      isNew: true,
    };
    setDrafts([...drafts, newDraft]);
    setActiveDraftId(newDraft.id);
    setNextDraftIdx((n) => n + 1);
  };

  // Clone an existing booking into a new draft reservation
  const handleCloneBookingToNewDraft = (clonedValues: DispatchFormValues) => {
    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} tabs open. Please close a tab before cloning.`);
      return;
    }
    const newId = `new-${nextDraftIdx}`;
    setNextDraftIdx((n) => n + 1);

    try {
      localStorage.setItem(`chesterfield_dispatch_draft_${newId}`, JSON.stringify(clonedValues));
    } catch {}

    const newDraft: DraftTab = {
      id: newId,
      isNew: true,
      formValues: clonedValues,
    };
    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftId(newId);
  };

  // Close draft
  const closeDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (drafts.length === 1) {
      const resetDraft: DraftTab = { id: `new-${nextDraftIdx}`, isNew: true };
      setDrafts([resetDraft]);
      setActiveDraftId(resetDraft.id);
      setNextDraftIdx((n) => n + 1);
      return;
    }

    const filtered = drafts.filter((d) => d.id !== id);
    setDrafts(filtered);
    if (activeDraftId === id) {
      setActiveDraftId(filtered[filtered.length - 1].id);
    }
  };

  // Double-click to open edit tab for a trip
  const handleOpenEditTrip = (trip: Trip) => {
    const existingEdit = drafts.find((d) => !d.isNew && d.trip?.id === trip.id);
    if (existingEdit) {
      setActiveDraftId(existingEdit.id);
      return;
    }

    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} tabs open. Please close a tab before editing.`);
      return;
    }

    const editDraft: DraftTab = {
      id: `edit-${trip.id}`,
      isNew: false,
      trip,
    };
    setDrafts([...drafts, editDraft]);
    setActiveDraftId(editDraft.id);
  };

  // Clone an existing trip into a new booking draft tab
  const handleCloneBooking = (trip: Trip) => {
    const pickupDate = trip.scheduledPickupTime ? new Date(trip.scheduledPickupTime) : new Date();
    const clonedValues: DispatchFormValues = {
      timingType: trip.scheduledPickupTime ? 'later' : 'asap',
      scheduledDate: pickupDate.toISOString().split('T')[0],
      scheduledTime: pickupDate.toTimeString().slice(0, 5),
      pickupAddress: trip.pickupLocation.address,
      pickupCoordinates: trip.pickupLocation.coordinates,
      dropoffAddress: trip.dropoffLocation.address,
      dropoffCoordinates: trip.dropoffLocation.coordinates,
      intermediateStops: [],
      passengerName: `${trip.passenger.firstName} ${trip.passenger.lastName}`.trim(),
      phone: trip.passenger.phone || '',
      email: trip.passenger.email || '',
      additionalPassengers: [],
      contactPerson: {
        isBookerDifferent: false,
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        contactRole: '',
      },
      passengers: trip.passenger.passengerCount || 1,
      bags: trip.passenger.luggageCount || 0,
      carSeats: false,
      carSeatsBreakdown: {
        rearFacing: 0,
        frontFacing: 0,
        booster: 0,
      },
      selectedVehicles: ['any'],
      vehicle: 'any',
      paymentMethod: trip.payment?.method === 'card' ? 'card' : trip.payment?.method === 'corporate' ? 'account' : 'cash',
      cardDetails: {
        cardPaymentType: 'manual',
        cardholderName: '',
        cardNumber: '',
        cardExp: '',
        cardCvc: '',
        saveCardOnFile: false,
      },
      corporateDetails: {
        corporateAccount: '',
        billingPo: '',
        authorizedBy: '',
        invoicingTerms: 'NET30',
      },
      tariff: 'Standard Rates',
      discount: '',
      company: '',
      driverId: trip.assignedDriverId || 'unassigned',
      notesForAll: trip.passenger.specialRequests || '',
      internalNotes: trip.pickupLocation.driverNotes || '',
      returnDetails: {
        returnTrip: false,
        returnPickupAddress: '',
        returnDropoffAddress: '',
        returnIntermediateStops: [],
        returnDate: '',
        returnTime: '',
        returnPassengers: 1,
        returnBags: 0,
        returnCarSeats: false,
        returnCarSeatsBreakdown: {
          rearFacing: 0,
          frontFacing: 0,
          booster: 0,
        },
        returnVehicles: ['any'],
        autoCreateReturnTrip: false,
        returnEstimatedFare: 0,
        returnEstimatedDurationMinutes: 0,
        returnEstimatedDistanceMiles: 0,
      },
      repeatDetails: {
        repeat: false,
        repeatFrequency: 'daily',
        repeatDays: [],
        repeatOccurrences: 1,
        repeatUntilDate: '',
        repeatWeeksPattern: 'all',
      },
      estimatedFare: trip.pricing?.totalFare || 0,
      returnEstimatedFare: 0,
      totalCalculatedFare: trip.pricing?.totalFare || 0,
      manualFare: '',
      isFareOverridden: false,
      estimatedDurationMinutes: trip.pricing?.durationMinutes || 0,
      estimatedDistanceMiles: trip.pricing?.distanceMiles || 0,
    };
    handleCloneBookingToNewDraft(clonedValues);
  };

  // Assign driver to current active draft
  const handleAssignDriverToDraft = (driver: DriverRosterItem) => {
    setDrivers((prev) =>
      prev.map((d) => {
        if (d.id === driver.id) return { ...d, status: 'on_trip' };
        return d;
      })
    );
  };

  // Send dispatch message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim()) return;

    const newMsg: DispatchMessageItem = {
      id: `msg-${Date.now()}`,
      to: msgRecipient,
      text: msgText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      priority: msgPriority,
    };
    setMessages([newMsg, ...messages]);
    setMsgText('');
  };

  // Softphone dialpad helpers
  const handleDialDigit = (digit: string) => {
    setDialedNumber((prev) => prev + digit);
  };

  const handleStartCall = (targetNum?: string) => {
    const numToCall = targetNum || dialedNumber;
    if (!numToCall) return;
    setDialedNumber(numToCall);
    setActiveCallStatus('calling');
    setTimeout(() => {
      setActiveCallStatus('connected');
    }, 1200);
  };

  const handleEndCall = () => {
    setActiveCallStatus('idle');
    setCallDuration(0);
  };

  // Resizable sidebar handlers
  const isDraggingSidebar = useRef(false);
  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingSidebar.current = true;
    document.addEventListener('mousemove', handleSidebarMouseMove);
    document.addEventListener('mouseup', handleSidebarMouseUp);
  };

  const handleSidebarMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingSidebar.current) return;
    const newWidth = Math.min(Math.max(e.clientX, 340), 620);
    setSidebarWidth(newWidth);
  }, []);

  const handleSidebarMouseUp = useCallback(() => {
    isDraggingSidebar.current = false;
    document.removeEventListener('mousemove', handleSidebarMouseMove);
    document.removeEventListener('mouseup', handleSidebarMouseUp);
  }, [handleSidebarMouseMove]);

  // Resizable queue handlers
  const isDraggingQueue = useRef(false);
  const handleQueueMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingQueue.current = true;
    document.addEventListener('mousemove', handleQueueMouseMove);
    document.addEventListener('mouseup', handleQueueMouseUp);
  };

  const handleQueueMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingQueue.current) return;
    const windowHeight = window.innerHeight;
    const newHeight = Math.min(Math.max(windowHeight - e.clientY, 150), windowHeight * 0.6);
    setQueueHeight(newHeight);
  }, []);

  const handleQueueMouseUp = useCallback(() => {
    isDraggingQueue.current = false;
    document.removeEventListener('mousemove', handleQueueMouseMove);
    document.removeEventListener('mouseup', handleQueueMouseUp);
  }, [handleQueueMouseMove]);

  // Operations panel horizontal resize
  const isDraggingOperations = useRef(false);
  const handleOperationsMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingOperations.current = true;
    document.addEventListener('mousemove', handleOperationsMouseMove);
    document.addEventListener('mouseup', handleOperationsMouseUp);
  };

  const handleOperationsMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingOperations.current) return;
    const windowWidth = window.innerWidth;
    const newWidth = Math.min(Math.max(windowWidth - e.clientX, 320), 750);
    setOperationsWidth(newWidth);
  }, []);

  const handleOperationsMouseUp = useCallback(() => {
    isDraggingOperations.current = false;
    document.removeEventListener('mousemove', handleOperationsMouseMove);
    document.removeEventListener('mouseup', handleOperationsMouseUp);
  }, [handleOperationsMouseMove]);

  // Panel Minimization Toggle
  const toggleMinimizePanel = (panelKey: string) => {
    setMinimizedPanels((prev) => ({
      ...prev,
      [panelKey]: !prev[panelKey],
    }));
  };

  // Operations panels vertical resize between cards with strict clamping
  const isDraggingVerticalKey = useRef<string | null>(null);
  const startDragY = useRef(0);
  const startDragHeight = useRef(0);

  const handleVerticalResizeStart = (e: React.MouseEvent, panelKey: string) => {
    e.preventDefault();
    isDraggingVerticalKey.current = panelKey;
    startDragY.current = e.clientY;
    startDragHeight.current = panelHeights[panelKey] || 300;
    document.addEventListener('mousemove', handleVerticalResizeMove);
    document.addEventListener('mouseup', handleVerticalResizeUp);
  };

  // Keypad Toggle: opens numeric dialpad and ensures panel has sufficient height
  const toggleKeypad = () => {
    setShowKeypad((prev) => {
      const willShow = !prev;
      if (willShow) {
        const containerHeight = operationsContainerRef.current?.clientHeight || 650;
        const requiredPhoneHeight = 270;
        const availableForUpper = containerHeight - requiredPhoneHeight - 30;

        setPanelHeights((curr) => {
          const upperPanels = activePanels.filter((p) => p !== 'phone' && !minimizedPanels[p]);
          const updated = { ...curr };
          if (upperPanels.length > 0) {
            const totalUpper = upperPanels.reduce((sum, p) => sum + (curr[p] || 250), 0);
            if (totalUpper > availableForUpper) {
              const scale = Math.max(0.35, availableForUpper / totalUpper);
              upperPanels.forEach((p) => {
                updated[p] = Math.max(120, Math.floor((curr[p] || 250) * scale));
              });
            }
          }
          updated.phone = Math.max(updated.phone || 0, requiredPhoneHeight);
          return updated;
        });
      }
      return willShow;
    });
  };

  const handleVerticalResizeMove = useCallback((e: MouseEvent) => {
    if (!isDraggingVerticalKey.current) return;
    const key = isDraggingVerticalKey.current;
    const delta = e.clientY - startDragY.current;

    const containerHeight = operationsContainerRef.current?.clientHeight || 650;
    
    // Find index of the panel being resized
    const panelIdx = activePanels.indexOf(key as any);
    if (panelIdx === -1) return;

    // Calculate height consumed by all panels ABOVE this panel
    let heightAbove = 0;
    for (let i = 0; i < panelIdx; i++) {
      const p = activePanels[i];
      heightAbove += minimizedPanels[p] ? 32 : (panelHeights[p] || 160);
      heightAbove += 8; // resize divider
    }

    // Calculate minimum height required for all panels BELOW this panel
    let minBelow = 0;
    for (let i = panelIdx + 1; i < activePanels.length; i++) {
      const p = activePanels[i];
      if (minimizedPanels[p]) {
        minBelow += 32;
      } else if (p === 'phone') {
        minBelow += showKeypad ? 270 : 180;
      } else {
        minBelow += 120;
      }
      minBelow += 8; // resize divider
    }

    // Stop resizing when it reaches the lower panel's min height
    const maxAllowedHeight = Math.max(120, containerHeight - heightAbove - minBelow - 16);
    const minAllowedHeight = minimizedPanels[key] ? 32 : 120;

    const nextHeight = Math.max(minAllowedHeight, Math.min(maxAllowedHeight, startDragHeight.current + delta));
    setPanelHeights((prev) => ({
      ...prev,
      [key]: nextHeight,
    }));
  }, [activePanels, minimizedPanels, panelHeights, showKeypad]);

  const handleVerticalResizeUp = useCallback(() => {
    isDraggingVerticalKey.current = null;
    document.removeEventListener('mousemove', handleVerticalResizeMove);
    document.removeEventListener('mouseup', handleVerticalResizeUp);
  }, [handleVerticalResizeMove]);

  // Tactical Presets Admin Management
  const handleSaveNewPreset = () => {
    if (!newPresetText.trim()) return;
    const updated = [...tacticalPresets, newPresetText.trim()];
    setTacticalPresets(updated);
    try {
      localStorage.setItem('chesterfield_tactical_presets', JSON.stringify(updated));
    } catch {}
    setMsgText(newPresetText.trim());
    setNewPresetText('');
    setIsAddingPreset(false);
  };

  // Date Formatting & Presets
  const formatDateYMD = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleApplyDatePreset = (preset: string) => {
    setFilterPreset(preset);
    const now = new Date();

    if (preset === 'today') {
      const ymd = formatDateYMD(now);
      setFilterStartDate(ymd);
      setFilterEndDate(ymd);
    } else if (preset === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      const ymd = formatDateYMD(tomorrow);
      setFilterStartDate(ymd);
      setFilterEndDate(ymd);
    } else if (preset === 'this_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setFilterStartDate(formatDateYMD(monday));
      setFilterEndDate(formatDateYMD(sunday));
    } else if (preset === 'last_week') {
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day - 7;
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() + diffToMonday);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      setFilterStartDate(formatDateYMD(lastMonday));
      setFilterEndDate(formatDateYMD(lastSunday));
    } else if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else if (preset === 'last_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else if (preset === 'next_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setFilterStartDate(formatDateYMD(firstDay));
      setFilterEndDate(formatDateYMD(lastDay));
    } else {
      // 'all'
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  // Dynamic tab titles based on tab count
  const getTabLabel = (draft: DraftTab) => {
    const isCompact = drafts.length > 3;
    if (draft.isNew) {
      if (draft.formValues?.passengerName?.trim()) {
        const name = draft.formValues.passengerName.trim();
        return isCompact ? name.split(' ')[0] : name;
      }
      const num = draft.id.replace('new-', '');
      return isCompact ? `#${num}` : `New Booking ${num}`;
    } else {
      const shortId = draft.trip?.id.slice(-4) || draft.id.replace('edit-', '').slice(-4);
      return isCompact ? `#${shortId}` : `Edit #${shortId}`;
    }
  };

  const getDateRangeButtonLabel = () => {
    if (dateTimeRange.presetKey && dateTimeRange.presetKey !== 'all_time' && dateTimeRange.presetKey !== 'custom') {
      const labels: Record<string, string> = {
        today: 'Today',
        tomorrow: 'Tomorrow',
        this_week: 'This Week',
        this_month: 'This Month',
        yesterday: 'Yesterday',
        last_7_days: 'Last 7 Days',
        last_week: 'Last Week',
        last_month: 'Last Month',
        next_7_days: 'Next 7 Days',
        next_week: 'Next Week',
        next_month: 'Next Month',
        year_to_date: 'Year to Date',
        rest_of_the_year: 'Rest of the Year',
      };
      if (labels[dateTimeRange.presetKey]) return labels[dateTimeRange.presetKey];
    }
    if (dateTimeRange.startDate && dateTimeRange.endDate) {
      if (dateTimeRange.startDate === dateTimeRange.endDate) {
        return dateTimeRange.startDate;
      }
      return `${dateTimeRange.startDate} - ${dateTimeRange.endDate}`;
    }
    return 'Select date range';
  };

  // Comprehensive filtered trips in queue
  const filteredTrips = trips.filter((trip) => {
    // Status filter from dropdown
    if (statusFilter !== 'all' && trip.status !== statusFilter) return false;

    // Filter pills
    if (pillFilter === 'pending' && trip.status !== 'pending') return false;
    if (pillFilter === 'assigned' && trip.status !== 'assigned') return false;
    if (pillFilter === 'completed' && trip.status !== 'completed') return false;
    if (pillFilter === 'cancelled' && trip.status !== 'cancelled') return false;
    if (pillFilter === 'unassigned' && trip.assignedDriverId) return false;

    // Date Range (against scheduledPickupTime or createdAt)
    if (dateTimeRange.startDate || dateTimeRange.endDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const tripDate = tripDateStr.slice(0, 10);
        if (dateTimeRange.startDate && tripDate < dateTimeRange.startDate) return false;
        if (dateTimeRange.endDate && tripDate > dateTimeRange.endDate) return false;
      }
    } else if (filterStartDate || filterEndDate) {
      const tripDateStr = trip.scheduledPickupTime || trip.createdAt;
      if (tripDateStr) {
        const tripDate = tripDateStr.slice(0, 10);
        if (filterStartDate && tripDate < filterStartDate) return false;
        if (filterEndDate && tripDate > filterEndDate) return false;
      }
    }

    // Active Filter: Driver
    if (activeFilterKeys.includes('driver') && selectedDriverFilter !== 'all') {
      if (trip.assignedDriverId !== selectedDriverFilter) return false;
    }

    // Active Filter: Vehicle
    if (activeFilterKeys.includes('vehicle') && selectedVehicleFilter !== 'all') {
      if (trip.vehicleTier !== selectedVehicleFilter) return false;
    }

    // Active Filter: Has Car Seat
    if (activeFilterKeys.includes('has_car_seat')) {
      const notesLower = (
        (trip.passenger.specialRequests || '') + ' ' +
        (trip.pickupLocation.notes || '') + ' ' +
        (trip.pickupLocation.driverNotes || '')
      ).toLowerCase();
      const hasSeat = notesLower.includes('car seat') || notesLower.includes('carseat') || notesLower.includes('booster');
      if (!hasSeat) return false;
    }

    // Active Filter: Company
    if (activeFilterKeys.includes('company') && selectedCompanyFilter !== 'all') {
      const company = ((trip as any).company || (trip.passenger as any).company || '').toLowerCase();
      if (!company.includes(selectedCompanyFilter.toLowerCase())) return false;
    }

    // Active Filter: Payment Type
    if (activeFilterKeys.includes('payment_type') && selectedPaymentFilter !== 'all') {
      const method = trip.payment?.method || 'cash';
      if (method !== selectedPaymentFilter) return false;
    }

    // Search query
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchId = trip.id.toLowerCase().includes(term);
      const matchPassenger = `${trip.passenger.firstName} ${trip.passenger.lastName}`
        .toLowerCase()
        .includes(term);
      const matchPhone = trip.passenger.phone.includes(term);
      const matchPickup = trip.pickupLocation.address.toLowerCase().includes(term);
      const matchDropoff = trip.dropoffLocation.address.toLowerCase().includes(term);
      const matchDriver = trip.assignedDriverId?.toLowerCase().includes(term);
      if (!matchId && !matchPassenger && !matchPhone && !matchPickup && !matchDropoff && !matchDriver) {
        return false;
      }
    }
    return true;
  });

  // Table Selection Handlers
  const allFilteredSelected =
    filteredTrips.length > 0 && filteredTrips.every((t) => selectedTripIds.includes(t.id));
  const someFilteredSelected =
    filteredTrips.some((t) => selectedTripIds.includes(t.id)) && !allFilteredSelected;

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredTrips.map((t) => t.id));
      setSelectedTripIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const filteredIds = filteredTrips.map((t) => t.id);
      setSelectedTripIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleToggleSelectTrip = (tripId: string) => {
    setSelectedTripIds((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId]
    );
  };

  const unconfirmedCount = trips.filter(
    (t) => t.status === 'pending' || !t.assignedDriverId
  ).length;

  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="warning">Pending</Badge>;
      case 'offered':
        return <Badge variant="info">Offered</Badge>;
      case 'assigned':
        return <Badge variant="primary">Assigned</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Active Draft object for map route display
  const activeDraft = drafts.find((d) => d.id === activeDraftId);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <SpinnerIcon className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden text-slate-900 select-none">
      {/* ─────────────────────────────────────────────────────────────
          1. TOP NAVIGATION BAR (Functional & Rerouted)
      ───────────────────────────────────────────────────────────── */}
      <header className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-30 shadow-sm">
        {/* Left: View Rerouting & Action Tools */}
        <div className="flex items-center gap-1.5">
          {/* Active View: Dispatch */}
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span>🚕</span>
            <span>Dispatch</span>
          </button>

          {/* Admin Dashboard Switcher */}
          {user?.role === 'admin' && (
            <Link
              to="/admin?tab=dashboard"
              reloadDocument
              className="px-3 py-1.5 rounded-lg text-slate-700 hover:text-slate-950 hover:bg-slate-100 font-semibold text-xs flex items-center gap-1.5 transition-colors"
              title="Go to Admin Management Dashboard with KPIs, Stats, and Settings"
            >
              <span>📊</span>
              <span>Dashboard</span>
            </Link>
          )}

          <div className="w-[1px] h-5 bg-slate-200 mx-1" />

          {/* Drivers Dock Trigger (Toggles non-blocking side panel) */}
          <button
            type="button"
            onClick={() => setIsDriversOpen(!isDriversOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isDriversOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🚗</span>
            <span>Drivers</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isDriversOpen ? 'bg-white' : 'bg-emerald-500 animate-pulse'
              }`}
            />
          </button>

          {/* Messages Dock Trigger (Toggles non-blocking side panel) */}
          <button
            type="button"
            onClick={() => setIsMessagesOpen(!isMessagesOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isMessagesOpen
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>💬</span>
            <span>Messages</span>
            {messages.length > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  isMessagesOpen ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {messages.length}
              </span>
            )}
          </button>

          {/* Phone Softphone Dock Trigger (Toggles non-blocking side panel) */}
          <button
            type="button"
            onClick={() => setIsPhoneOpen(!isPhoneOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isPhoneOpen
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>📞</span>
            <span>Phone</span>
          </button>
        </div>

        {/* Center: Brand Badge */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-slate-950 flex items-center justify-center text-amber-400 font-black text-xs tracking-tighter">
            CT
          </div>
          <span className="font-extrabold text-sm tracking-tight text-slate-900">
            {settings.company.name}
          </span>
        </div>

        {/* Right: Unified Admin User Dropdown */}
        <UserDropdown
          email={user?.email}
          onSignOut={handleSignOut}
          variant="light"
        />
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. WORKSPACE: LEFT PERSISTENT SIDEBAR + CENTER MAP & QUEUE + RIGHT DOCKED PANEL
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ─── A. LEFT SIDEBAR: TABBED DRAFT / EDIT ENGINE ─── */}
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="h-full bg-white border-r border-slate-200 flex flex-col shrink-0 relative z-20 shadow-xs"
        >
          {/* Browser-style Tab Bar */}
          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-center px-1 shrink-0 select-none relative">
            <div className="flex-1 flex items-center gap-1 overflow-x-auto h-full scrollbar-none py-1">
              {drafts.map((d) => {
                const isActive = d.id === activeDraftId;
                const label = getTabLabel(d);
                return (
                  <div
                    key={d.id}
                    onClick={() => setActiveDraftId(d.id)}
                    title={d.formValues?.passengerName || d.id}
                    className={`group relative h-7 px-2.5 rounded-t-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer border-t border-x transition-colors shrink-0 ${
                      isActive
                        ? 'bg-white text-blue-600 border-slate-300 shadow-xs'
                        : 'bg-slate-200/60 text-slate-600 hover:bg-slate-200 border-transparent'
                    }`}
                  >
                    <span className="truncate max-w-[110px]">{label}</span>
                    <button
                      type="button"
                      onClick={(e) => closeDraft(d.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              {/* Add New Tab Button (Inline) */}
              {drafts.length < maxDrafts && (
                <button
                  type="button"
                  onClick={createDraft}
                  className="h-7 px-2 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 font-bold text-sm flex items-center justify-center transition-colors shrink-0"
                  title="Open new draft booking tab"
                >
                  +
                </button>
              )}
            </div>

            {/* Tab Overflow Chevron Menu (Pinned to right) */}
            <div className="relative shrink-0 flex items-center pl-1 border-l border-slate-200" ref={tabOverflowRef}>
              <button
                type="button"
                onClick={() => setIsTabOverflowOpen(!isTabOverflowOpen)}
                className={`h-7 px-1.5 rounded flex items-center justify-center text-xs font-bold transition-colors ${
                  isTabOverflowOpen
                    ? 'bg-blue-100 text-blue-700'
                    : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                }`}
                title="All Open Draft Tabs"
              >
                <span>▾</span>
              </button>

              {isTabOverflowOpen && (
                <div className="absolute right-0 top-8 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <span>Open Tabs ({drafts.length}/{maxDrafts})</span>
                    {drafts.length < maxDrafts && (
                      <button
                        type="button"
                        onClick={() => {
                          createDraft();
                          setIsTabOverflowOpen(false);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-bold text-xs capitalize"
                      >
                        + New Tab
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 py-1">
                    {drafts.map((d) => {
                      const isActive = d.id === activeDraftId;
                      const label = getTabLabel(d);
                      const subtitle = d.formValues?.phone || (d.isNew ? 'New Draft Reservation' : 'Existing Trip Edit');
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                            isActive ? 'bg-blue-50/80 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                          onClick={() => {
                            setActiveDraftId(d.id);
                            setIsTabOverflowOpen(false);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">{d.isNew ? '📝' : '✎'}</span>
                            <div className="min-w-0">
                              <div className="font-semibold truncate text-xs flex items-center gap-1.5">
                                <span>{label}</span>
                                {isActive && (
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              closeDraft(d.id, e);
                            }}
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500 transition-colors ml-2"
                            title="Close tab"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Persistent Draft / Edit Form Container */}
          <div className="flex-1 overflow-hidden relative">
            {drafts.map((d) => (
              <div
                key={d.id}
                className={`h-full w-full ${d.id === activeDraftId ? 'block' : 'hidden'}`}
              >
                <DispatchBookingEngine
                  draftId={d.id}
                  initialTrip={d.trip}
                  onValuesChange={(vals) => {
                    setDrafts((prev) =>
                      prev.map((item) => (item.id === d.id ? { ...item, formValues: vals } : item))
                    );
                  }}
                  onBookingSuccess={(savedTrip, isEdit) => {
                    if (isEdit) {
                      closeDraft(d.id, { stopPropagation: () => {} } as any);
                    }
                  }}
                  onClearDraft={() => {
                    setDrafts((prev) =>
                      prev.map((item) => (item.id === d.id ? { ...item, formValues: undefined } : item))
                    );
                  }}
                  onCloneBooking={handleCloneBookingToNewDraft}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* Resizer Handle (Left Sidebar) */}
        <div
          onMouseDown={handleSidebarMouseDown}
          className="w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors z-20 shrink-0"
        />

        {/* ─── B. CENTER COLUMN: MAP VIEW STAGE + BOTTOM DOCKED QUEUE ─── */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
          {/* Live Google Map Stage */}
          <div className="flex-1 w-full h-full relative z-0">
            <LiveDispatchMap
              activeFormValues={activeDraft?.formValues}
              activeTrip={activeDraft?.trip}
              selectedTrip={selectedMapTrip}
              shouldZoom={shouldZoomMap}
            />
          </div>

          {/* Resizer Handle (Bottom Queue) */}
          <div
            onMouseDown={handleQueueMouseDown}
            className="h-1.5 w-full cursor-row-resize hover:bg-blue-500/50 transition-colors z-10 shrink-0"
          />

          {/* Bottom Docked Queue */}
          <div
            style={{ height: `${queueHeight}px` }}
            className="w-full bg-white border-t border-slate-200 flex flex-col shrink-0 z-10 shadow-md"
          >
            {/* ─── Modern Filter & Trips Control Bar (Matching user specification) ─── */}
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
              {/* Left Side: Date Range button, Unconfirmed Badge, Status Dropdown, + Add Filter, Filter Pills, Display Count */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Select Date Range Popover Button */}
                <div className="relative" ref={datePickerTriggerRef}>
                  <button
                    type="button"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>📅</span>
                    <span>{getDateRangeButtonLabel()}</span>
                    <span className="text-[10px] text-slate-400">▾</span>
                  </button>

                  <CustomDateTimePicker
                    isOpen={isDatePickerOpen}
                    onClose={() => setIsDatePickerOpen(false)}
                    value={dateTimeRange}
                    onChange={(newRange) => {
                      setDateTimeRange(newRange);
                      setFilterStartDate(newRange.startDate);
                      setFilterEndDate(newRange.endDate);
                    }}
                  />
                </div>

                {/* 2. Unconfirmed Count Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 text-xs font-bold shadow-2xs">
                  <span>Unconfirmed</span>
                  <span className="min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {unconfirmedCount}
                  </span>
                </div>

                {/* 3. Status Dropdown */}
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
                  >
                    <option value="all">Status: None ▾</option>
                    <option value="pending">Status: Pending ▾</option>
                    <option value="assigned">Status: Assigned ▾</option>
                    <option value="completed">Status: Completed ▾</option>
                    <option value="cancelled">Status: Cancelled ▾</option>
                  </select>
                </div>

                {/* 4. + Add Filter Dropdown */}
                <div className="relative" ref={addFilterRef}>
                  <button
                    type="button"
                    onClick={() => setIsAddFilterOpen(!isAddFilterOpen)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-2xs transition-colors cursor-pointer"
                  >
                    <span>+ Add Filter</span>
                    <span className="text-[10px] text-slate-400">▾</span>
                  </button>

                  {isAddFilterOpen && (
                    <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-xs font-semibold text-slate-700 animate-in fade-in zoom-in-95 duration-100">
                      {[
                        { key: 'driver', label: 'Driver' },
                        { key: 'vehicle', label: 'Vehicle' },
                        { key: 'company', label: 'Company' },
                        { key: 'payment_type', label: 'Payment Type' },
                        { key: 'tariff', label: 'Tariff' },
                        { key: 'has_car_seat', label: 'Has Car Seat' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            if (!activeFilterKeys.includes(item.key as FilterType)) {
                              setActiveFilterKeys([...activeFilterKeys, item.key as FilterType]);
                            }
                            setIsAddFilterOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-between transition-colors cursor-pointer ${
                            activeFilterKeys.includes(item.key as FilterType) ? 'text-blue-600 font-bold bg-blue-50/50' : ''
                          }`}
                        >
                          <span>{item.label}</span>
                          {activeFilterKeys.includes(item.key as FilterType) && <span>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Active Filter Pills */}
                {/* Pill: Driver */}
                {activeFilterKeys.includes('driver') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2.5 py-0.5 text-xs text-slate-700 shadow-2xs">
                    <span className="font-semibold text-slate-500">Driver:</span>
                    <select
                      value={selectedDriverFilter}
                      onChange={(e) => setSelectedDriverFilter(e.target.value)}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Drivers ▾</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'driver'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Driver filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Pill: Has Car Seat */}
                {activeFilterKeys.includes('has_car_seat') && (
                  <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-bold text-blue-800 shadow-2xs">
                    <span>Has Car Seat</span>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'has_car_seat'))}
                      className="text-blue-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Car Seat filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Pill: Vehicle */}
                {activeFilterKeys.includes('vehicle') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2.5 py-0.5 text-xs text-slate-700 shadow-2xs">
                    <span className="font-semibold text-slate-500">Vehicle:</span>
                    <select
                      value={selectedVehicleFilter}
                      onChange={(e) => setSelectedVehicleFilter(e.target.value)}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Vehicles ▾</option>
                      {settings.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'vehicle'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Vehicle filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Pill: Company */}
                {activeFilterKeys.includes('company') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2.5 py-0.5 text-xs text-slate-700 shadow-2xs">
                    <span className="font-semibold text-slate-500">Company:</span>
                    <select
                      value={selectedCompanyFilter}
                      onChange={(e) => setSelectedCompanyFilter(e.target.value)}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Companies ▾</option>
                      <option value="Chesterfield">Chesterfield Corporate</option>
                      <option value="Medical">Medical Express</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'company'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Company filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Pill: Payment Type */}
                {activeFilterKeys.includes('payment_type') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2.5 py-0.5 text-xs text-slate-700 shadow-2xs">
                    <span className="font-semibold text-slate-500">Payment:</span>
                    <select
                      value={selectedPaymentFilter}
                      onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">All Methods ▾</option>
                      <option value="card">Credit Card</option>
                      <option value="cash">Cash in Cab</option>
                      <option value="account">Corporate Account</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'payment_type'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Payment filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Pill: Tariff */}
                {activeFilterKeys.includes('tariff') && (
                  <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-full px-2.5 py-0.5 text-xs text-slate-700 shadow-2xs">
                    <span className="font-semibold text-slate-500">Tariff:</span>
                    <select
                      value={selectedTariffFilter}
                      onChange={(e) => setSelectedTariffFilter(e.target.value)}
                      className="text-xs font-bold text-slate-800 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="all">Standard Tariff ▾</option>
                      <option value="surge">Surge Rate</option>
                      <option value="airport">Flat Airport Rate</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setActiveFilterKeys(activeFilterKeys.filter((k) => k !== 'tariff'))}
                      className="ml-1 text-slate-400 hover:text-red-600 font-bold text-xs cursor-pointer"
                      title="Remove Tariff filter"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* 6. Displaying X trips text */}
                <span className="text-xs text-slate-500 font-medium ml-1">
                  Displaying {filteredTrips.length} {filteredTrips.length === 1 ? 'trip' : 'trips'}
                </span>
              </div>

              {/* Right Side: Search Bar & Selection Badge */}
              <div className="flex items-center gap-2">
                {selectedTripIds.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-blue-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-2xs">
                    <span>✓ {selectedTripIds.length} Selected</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTripIds([])}
                      className="text-[10px] text-blue-200 hover:text-white underline cursor-pointer ml-1"
                    >
                      Deselect
                    </button>
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    placeholder="🔍 Search trips..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs w-48 sm:w-56 focus:ring-1 focus:ring-blue-500 shadow-2xs focus:outline-hidden"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold text-[11px] z-10">
                  <tr>
                    <th className="py-2 px-3 w-8 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someFilteredSelected;
                        }}
                        onChange={handleToggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select/Deselect All Filtered Trips"
                      />
                    </th>
                    <th className="py-2 px-3">DATE/TIME ▲</th>
                    <th className="py-2 px-3">PASSENGER</th>
                    <th className="py-2 px-3">PICKUP</th>
                    <th className="py-2 px-3">DROPOFF</th>
                    <th className="py-2 px-3">DRIVER</th>
                    <th className="py-2 px-3">VEHICLE</th>
                    <th className="py-2 px-3">PRICE</th>
                    <th className="py-2 px-3">STATUS</th>
                    <th className="py-2 px-3 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredTrips.map((trip) => {
                    const isSelected = selectedQueueTripId === trip.id;
                    const isChecked = selectedTripIds.includes(trip.id);
                    const pickupTimeStr = trip.scheduledPickupTime
                      ? `${new Date(trip.scheduledPickupTime).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}, ${new Date(trip.scheduledPickupTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'ASAP';

                    return (
                      <tr
                        key={trip.id}
                        onClick={() => {
                          // Single click: show route without zooming in
                          setSelectedQueueTripId(trip.id);
                          setSelectedMapTrip(trip);
                          setShouldZoomMap(false);
                        }}
                        onDoubleClick={() => {
                          // Double click: open edit tab and zoom in on map route
                          setSelectedQueueTripId(trip.id);
                          setSelectedMapTrip(trip);
                          setShouldZoomMap(true);
                          handleOpenEditTrip(trip);
                        }}
                        className={`cursor-pointer hover:bg-blue-50/70 transition-colors ${
                          isSelected ? 'bg-blue-50 font-medium' : isChecked ? 'bg-blue-50/40' : ''
                        }`}
                        title="Click to view route on map. Double-click to edit trip & zoom in."
                      >
                        <td className="py-2 px-3 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleSelectTrip(trip.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700">
                          {pickupTimeStr}
                        </td>
                        <td className="py-2 px-3 font-medium">
                          {trip.passenger.firstName} {trip.passenger.lastName}
                          <div className="text-[10px] text-slate-400 font-mono">{trip.passenger.phone}</div>
                        </td>
                        <td className="py-2 px-3 truncate max-w-[160px]" title={trip.pickupLocation.address}>
                          {trip.pickupLocation.address}
                        </td>
                        <td className="py-2 px-3 truncate max-w-[160px]" title={trip.dropoffLocation.address}>
                          {trip.dropoffLocation.address}
                        </td>
                        <td className="py-2 px-3">
                          {trip.assignedDriverId ? (
                            <span className="font-semibold text-blue-600">{trip.assignedDriverId}</span>
                          ) : (
                            <span className="text-amber-600 font-bold">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {trip.vehicleTier || 'Standard'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </td>
                        <td className="py-2 px-3">{getStatusBadge(trip.status)}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedQueueTripId(trip.id);
                                setSelectedMapTrip(trip);
                                setShouldZoomMap(true);
                                handleOpenEditTrip(trip);
                              }}
                              className="px-2.5 py-0.5 rounded bg-slate-100 hover:bg-blue-600 hover:text-white border border-slate-300 text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                              title="Edit trip"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCloneBooking(trip);
                              }}
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-600 hover:text-white border border-slate-300 text-[11px] font-bold text-slate-700 transition-colors cursor-pointer"
                              title="Clone trip details into a new booking draft"
                            >
                              Clone
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTrips.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500 font-semibold text-xs">
                        No trips found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ─── C. RIGHT DOCKED OPERATIONAL PANEL (MULTI-TASKING STACK) ─── */}
        {activeOperationalCount > 0 && (
          <aside
            className="relative bg-slate-100 border-l border-slate-200 flex flex-col shrink-0 h-full overflow-hidden z-20 shadow-lg"
            style={{ width: `${operationsWidth}px` }}
          >
            {/* Horizontal Resize Drag Handle on Left Edge */}
            <div
              onMouseDown={handleOperationsMouseDown}
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 transition-colors z-30 group select-none"
              title="Drag to resize Operations Panel width"
            >
              <div className="w-[1px] h-full bg-slate-300 group-hover:bg-blue-500 mx-auto" />
            </div>

            {/* Master Header with Views Dropdown */}
            <div className="h-9 px-3 bg-slate-900 text-white flex items-center justify-between shrink-0 text-xs pl-4">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight">Tactical Operations</span>
                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-amber-400 font-bold text-[10px]">
                  {activeOperationalCount} Active
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Views Dropdown */}
                <div className="relative" ref={viewsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsViewsDropdownOpen(!isViewsDropdownOpen)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1 transition-colors border border-slate-700"
                    title="Select/deselect operational views"
                  >
                    <span>👁️ Views</span>
                    <span className="text-[9px]">▾</span>
                  </button>

                  {isViewsDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        Operational Views
                      </div>

                      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isDriversOpen}
                          onChange={(e) => setIsDriversOpen(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-700">🚗 Drivers Roster</span>
                      </label>

                      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isMessagesOpen}
                          onChange={(e) => setIsMessagesOpen(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-700">💬 Messages</span>
                      </label>

                      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isPhoneOpen}
                          onChange={(e) => setIsPhoneOpen(e.target.checked)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-medium text-slate-700">📞 Softphone</span>
                      </label>

                      <div className="border-t border-slate-100 mt-1 pt-1 px-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setIsDriversOpen(true);
                            setIsMessagesOpen(true);
                            setIsPhoneOpen(true);
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-semibold"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsDriversOpen(false);
                            setIsMessagesOpen(false);
                            setIsPhoneOpen(false);
                            setIsViewsDropdownOpen(false);
                          }}
                          className="text-[10px] text-red-500 hover:underline font-semibold"
                        >
                          Close All
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsDriversOpen(false);
                    setIsMessagesOpen(false);
                    setIsPhoneOpen(false);
                  }}
                  className="text-[11px] text-slate-400 hover:text-white transition-colors"
                  title="Close all operational panels"
                >
                  ✕ Close All
                </button>
              </div>
            </div>

            {/* Stacked Panels (Vertically Shared without Container Scrollbar) */}
            <div ref={operationsContainerRef} className="flex-1 overflow-hidden flex flex-col min-h-0">
              {/* 1. DRIVERS ROSTER CARD */}
              {isDriversOpen && (
                <>
                  <div
                    className={`flex flex-col bg-white overflow-hidden transition-all ${
                      minimizedPanels.drivers
                        ? 'h-8 shrink-0'
                        : activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'drivers'
                        ? 'flex-1 min-h-[160px]'
                        : 'shrink-0'
                    }`}
                    style={
                      !minimizedPanels.drivers &&
                      activePanels.length > 1 &&
                      activePanels[activePanels.length - 1] !== 'drivers'
                        ? { height: `${panelHeights.drivers}px` }
                        : undefined
                    }
                  >
                    {/* Header: Clickable to minimize/expand */}
                    <div
                      onClick={() => toggleMinimizePanel('drivers')}
                      className="h-8 px-3 bg-slate-800 text-white flex items-center justify-between shrink-0 cursor-pointer select-none hover:bg-slate-750 transition-colors"
                      title={minimizedPanels.drivers ? 'Click to expand' : 'Click to minimize'}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>🚗 Drivers Roster</span>
                        <span className="text-[10px] text-emerald-400">
                          ({drivers.filter((d) => d.status === 'available').length} Avail)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMinimizePanel('drivers');
                          }}
                          className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title={minimizedPanels.drivers ? 'Expand Drivers Roster' : 'Minimize Drivers Roster'}
                        >
                          {minimizedPanels.drivers ? '▾' : '—'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsDriversOpen(false);
                          }}
                          className="text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title="Close panel"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {!minimizedPanels.drivers && (
                      <>
                        {/* Filter tabs */}
                        <div className="p-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1 text-[11px] shrink-0">
                          {(['all', 'available', 'on_trip', 'offline'] as const).map((filterKey) => (
                            <button
                              key={filterKey}
                              type="button"
                              onClick={() => setDriverFilter(filterKey)}
                              className={`flex-1 py-0.5 text-center rounded font-semibold capitalize transition-all ${
                                driverFilter === filterKey ? 'bg-white text-blue-600 shadow-2xs' : 'text-slate-600'
                              }`}
                            >
                              {filterKey.replace('_', ' ')}
                            </button>
                          ))}
                        </div>

                        {/* Drivers List */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs">
                          {drivers
                            .filter((d) => (driverFilter === 'all' ? true : d.status === driverFilter))
                            .map((driver) => {
                              let badge = <Badge variant="success">Available</Badge>;
                              if (driver.status === 'on_trip') badge = <Badge variant="info">On Trip</Badge>;
                              if (driver.status === 'offline') badge = <Badge variant="neutral">Offline</Badge>;

                              return (
                                <div
                                  key={driver.id}
                                  className="p-2 rounded-lg border border-slate-200 bg-white hover:border-blue-300 transition-all space-y-1.5 shadow-2xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="font-bold text-slate-900 text-xs">{driver.name}</span>
                                      <span className="text-[10px] text-slate-500 ml-1.5">
                                        {driver.vehicle} ({driver.tier})
                                      </span>
                                    </div>
                                    {badge}
                                  </div>

                                  <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-100">
                                    <div>📍 {driver.zone}</div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsPhoneOpen(true);
                                        handleStartCall(driver.phone);
                                      }}
                                      className="font-mono text-blue-600 hover:underline font-bold"
                                    >
                                      📞 {driver.phone}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleAssignDriverToDraft(driver)}
                                      className="flex-1 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] rounded border border-blue-200 transition-colors"
                                    >
                                      Assign to Active Draft
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDrivers((prev) =>
                                          prev.map((d) =>
                                            d.id === driver.id
                                              ? {
                                                  ...d,
                                                  status:
                                                    d.status === 'available'
                                                      ? 'offline'
                                                      : d.status === 'offline'
                                                      ? 'available'
                                                      : 'available',
                                                }
                                              : d
                                          )
                                        );
                                      }}
                                      className="px-1.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[10px] rounded border border-slate-300"
                                    >
                                      Toggle
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>

                  {!minimizedPanels.drivers &&
                    activePanels.length > 1 &&
                    activePanels[activePanels.length - 1] !== 'drivers' && (
                      <div
                        onMouseDown={(e) => handleVerticalResizeStart(e, 'drivers')}
                        className="h-2 w-full cursor-row-resize bg-slate-200 hover:bg-blue-500 transition-colors flex items-center justify-center shrink-0 z-10 group select-none"
                        title="Drag to resize Drivers Roster height"
                      >
                        <div className="w-8 h-1 bg-slate-400 group-hover:bg-white rounded-full" />
                      </div>
                    )}
                </>
              )}

              {/* 2. MESSAGES CARD */}
              {isMessagesOpen && (
                <>
                  <div
                    className={`flex flex-col bg-white overflow-hidden transition-all ${
                      minimizedPanels.messages
                        ? 'h-8 shrink-0'
                        : activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'messages'
                        ? 'flex-1 min-h-[160px]'
                        : 'shrink-0'
                    }`}
                    style={
                      !minimizedPanels.messages &&
                      activePanels.length > 1 &&
                      activePanels[activePanels.length - 1] !== 'messages'
                        ? { height: `${panelHeights.messages}px` }
                        : undefined
                    }
                  >
                    {/* Header: Clickable to minimize/expand */}
                    <div
                      onClick={() => toggleMinimizePanel('messages')}
                      className="h-8 px-3 bg-slate-800 text-white flex items-center justify-between shrink-0 cursor-pointer select-none hover:bg-slate-750 transition-colors"
                      title={minimizedPanels.messages ? 'Click to expand' : 'Click to minimize'}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>💬 Driver Messaging &amp; SMS</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMinimizePanel('messages');
                          }}
                          className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title={minimizedPanels.messages ? 'Expand Messages' : 'Minimize Messages'}
                        >
                          {minimizedPanels.messages ? '▾' : '—'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMessagesOpen(false);
                          }}
                          className="text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title="Close panel"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {!minimizedPanels.messages && (
                      <>
                        {/* Space-Saving Tactical Presets Dropdown */}
                        <div className="p-1.5 bg-slate-50 border-b border-slate-200 space-y-1 shrink-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                              ⚡ Tactical Presets
                            </span>
                            {user?.role === 'admin' && !isAddingPreset && (
                              <button
                                type="button"
                                onClick={() => setIsAddingPreset(true)}
                                className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer"
                              >
                                + Add Preset
                              </button>
                            )}
                          </div>

                          <select
                            value=""
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) return;
                              if (val === '__add_custom__') {
                                setIsAddingPreset(true);
                              } else {
                                setMsgText(val);
                              }
                            }}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] text-slate-700 font-medium focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">Select a preset to insert...</option>
                            {tacticalPresets.map((preset, i) => (
                              <option key={i} value={preset}>
                                {preset}
                              </option>
                            ))}
                            {user?.role === 'admin' && (
                              <option value="__add_custom__">➕ Create New Preset (Admin)...</option>
                            )}
                          </select>

                          {isAddingPreset && (
                            <div className="flex items-center gap-1 mt-1 p-1 bg-blue-50 border border-blue-200 rounded">
                              <input
                                type="text"
                                placeholder="Enter new preset message..."
                                value={newPresetText}
                                onChange={(e) => setNewPresetText(e.target.value)}
                                className="flex-1 px-2 py-0.5 bg-white border border-blue-300 rounded text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSaveNewPreset();
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={handleSaveNewPreset}
                                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] rounded cursor-pointer"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAddingPreset(false);
                                  setNewPresetText('');
                                }}
                                className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-[10px] rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Compose Alert Form */}
                        <form onSubmit={handleSendMessage} className="p-2 bg-white border-b border-slate-200 space-y-1.5 shrink-0">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <span className="block text-[9px] font-bold text-slate-500 uppercase">Send To</span>
                              <select
                                value={msgRecipient}
                                onChange={(e) => setMsgRecipient(e.target.value)}
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-[11px] text-slate-800"
                              >
                                <option value="All Drivers">📢 All Drivers</option>
                                {drivers.map((d) => (
                                  <option key={d.id} value={d.name}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <span className="block text-[9px] font-bold text-slate-500 uppercase">Priority</span>
                              <select
                                value={msgPriority}
                                onChange={(e) => setMsgPriority(e.target.value as any)}
                                className="w-full px-1.5 py-1 bg-white border border-slate-300 rounded text-[11px] text-slate-800"
                              >
                                <option value="normal">Normal</option>
                                <option value="urgent">🚨 Urgent</option>
                              </select>
                            </div>
                          </div>

                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Type dispatch message or note..."
                              value={msgText}
                              onChange={(e) => setMsgText(e.target.value)}
                              className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              type="submit"
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded transition-colors shrink-0 cursor-pointer"
                            >
                              Send
                            </button>
                          </div>
                        </form>

                        {/* Message History */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-xs">
                          {messages.map((m) => (
                            <div
                              key={m.id}
                              className={`p-2 rounded-lg border text-xs space-y-0.5 ${
                                m.priority === 'urgent'
                                  ? 'bg-red-50 border-red-300 text-red-900'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              <div className="flex items-center justify-between font-bold text-[10px]">
                                <span>To: {m.to}</span>
                                <span className="text-slate-400">{m.timestamp}</span>
                              </div>
                              <p className="text-[11px] leading-snug">{m.text}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {!minimizedPanels.messages &&
                    activePanels.length > 1 &&
                    activePanels[activePanels.length - 1] !== 'messages' && (
                      <div
                        onMouseDown={(e) => handleVerticalResizeStart(e, 'messages')}
                        className="h-2 w-full cursor-row-resize bg-slate-200 hover:bg-blue-500 transition-colors flex items-center justify-center shrink-0 z-10 group select-none"
                        title="Drag to resize Messages height"
                      >
                        <div className="w-8 h-1 bg-slate-400 group-hover:bg-white rounded-full" />
                      </div>
                    )}
                </>
              )}

              {/* 3. SOFTPHONE CARD */}
              {isPhoneOpen && (
                <>
                  <div
                    className={`flex flex-col bg-slate-900 text-white overflow-hidden transition-all ${
                      minimizedPanels.phone
                        ? 'h-8 shrink-0'
                        : activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'phone'
                        ? 'flex-1 min-h-0'
                        : 'shrink-0'
                    }`}
                    style={
                      !minimizedPanels.phone &&
                      activePanels.length > 1 &&
                      activePanels[activePanels.length - 1] !== 'phone'
                        ? { height: `${panelHeights.phone}px` }
                        : undefined
                    }
                  >
                    {/* Header: Clickable to minimize/expand */}
                    <div
                      onClick={() => toggleMinimizePanel('phone')}
                      className="h-8 px-3 bg-slate-800 text-white flex items-center justify-between shrink-0 cursor-pointer select-none hover:bg-slate-750 transition-colors"
                      title={minimizedPanels.phone ? 'Click to expand' : 'Click to minimize'}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        <span>📞 Tactical Softphone</span>
                        <span className="text-[10px] text-emerald-400 uppercase">({activeCallStatus})</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMinimizePanel('phone');
                          }}
                          className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title={minimizedPanels.phone ? 'Expand Softphone' : 'Minimize Softphone'}
                        >
                          {minimizedPanels.phone ? '▾' : '—'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsPhoneOpen(false);
                          }}
                          className="text-slate-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded hover:bg-slate-700/60 transition-colors"
                          title="Close panel"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {!minimizedPanels.phone && (
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                        {/* Softphone Display */}
                        <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center">
                          <div className="text-[10px] text-slate-500 font-mono">
                            {activeCallStatus === 'connected' ? (
                              <span className="text-emerald-400 animate-pulse">
                                ● IN CALL ({Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')})
                              </span>
                            ) : activeCallStatus === 'calling' ? (
                              <span className="text-amber-400 animate-pulse">CONNECTING...</span>
                            ) : (
                              'READY TO DIAL'
                            )}
                          </div>
                          <div className="text-base font-mono font-bold tracking-wider text-slate-100 min-h-[22px] truncate">
                            {dialedNumber || '(Ready)'}
                          </div>
                        </div>

                        {/* Speed Dial Presets */}
                        <div className="space-y-1">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Speed Dial</div>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { name: 'Dispatch Desk', num: '(314) 738-0100' },
                              { name: 'Lambert STL', num: '(314) 890-1333' },
                              { name: 'Mike T.', num: '(314) 555-0101' },
                              { name: 'Sarah K.', num: '(314) 555-0104' },
                            ].map((preset, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => handleStartCall(preset.num)}
                                className="p-1 bg-slate-800/80 hover:bg-slate-800 rounded text-left border border-slate-700 transition-colors cursor-pointer"
                              >
                                <div className="text-[10px] font-bold text-slate-200 truncate">{preset.name}</div>
                                <div className="text-[9px] font-mono text-emerald-400">{preset.num}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Call Actions & Keypad Toggle */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          {activeCallStatus === 'idle' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartCall()}
                                className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              >
                                <span>📞</span>
                                <span>Call</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDialedNumber('')}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer"
                                title="Clear number"
                              >
                                Clear
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={handleEndCall}
                              className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <span>📵</span>
                              <span>End Call</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={toggleKeypad}
                            className={`px-2.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 border transition-colors cursor-pointer ${
                              showKeypad
                                ? 'bg-blue-600 border-blue-400 text-white shadow-xs'
                                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                            }`}
                            title={showKeypad ? 'Hide Dialpad' : 'Show Dialpad'}
                          >
                            <span>🔢</span>
                            <span>{showKeypad ? 'Hide' : 'Keypad'}</span>
                          </button>
                        </div>

                        {/* 12-Key Numeric Dialpad (collapsible) */}
                        {showKeypad && (
                          <div className="grid grid-cols-3 gap-1 pt-1 border-t border-slate-800">
                            {[
                              { digit: '1', sub: '' },
                              { digit: '2', sub: 'ABC' },
                              { digit: '3', sub: 'DEF' },
                              { digit: '4', sub: 'GHI' },
                              { digit: '5', sub: 'JKL' },
                              { digit: '6', sub: 'MNO' },
                              { digit: '7', sub: 'PQRS' },
                              { digit: '8', sub: 'TUV' },
                              { digit: '9', sub: 'WXYZ' },
                              { digit: '*', sub: '' },
                              { digit: '0', sub: '+' },
                              { digit: '#', sub: '' },
                            ].map((btn) => (
                              <button
                                key={btn.digit}
                                type="button"
                                onClick={() => handleDialDigit(btn.digit)}
                                className="h-7 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs flex flex-col items-center justify-center transition-all cursor-pointer"
                              >
                                <span>{btn.digit}</span>
                                {btn.sub && <span className="text-[7px] text-slate-400 -mt-1">{btn.sub}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!minimizedPanels.phone &&
                    activePanels.length > 1 &&
                    activePanels[activePanels.length - 1] !== 'phone' && (
                      <div
                        onMouseDown={(e) => handleVerticalResizeStart(e, 'phone')}
                        className="h-2 w-full cursor-row-resize bg-slate-800 hover:bg-emerald-500 transition-colors flex items-center justify-center shrink-0 z-10 group select-none"
                        title="Drag to resize Softphone height"
                      >
                        <div className="w-8 h-1 bg-slate-500 group-hover:bg-white rounded-full" />
                      </div>
                    )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Live Google Map Stage
// ─────────────────────────────────────────────────────────────
interface LiveDispatchMapProps {
  activeFormValues?: DispatchFormValues;
  activeTrip?: Trip | null;
  selectedTrip?: Trip | null;
  shouldZoom?: boolean;
}

function LiveDispatchMap({
  activeFormValues,
  activeTrip,
  selectedTrip,
  shouldZoom = false,
}: LiveDispatchMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  // Initialize Map
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((gMaps) => {
        if (!isMounted || !gMaps || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new gMaps.maps.Map(mapContainerRef.current, {
            center: { lat: CHESTERFIELD_CENTER.lat, lng: CHESTERFIELD_CENTER.lng },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            streetViewControl: false,
          });

          directionsRendererRef.current = new gMaps.maps.DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: false,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: '#2563eb',
              strokeWeight: 5,
              strokeOpacity: 0.85,
            },
          });
        }
      })
      .catch((err) => {
        console.warn('[LiveDispatchMap] Initialization failed:', err);
      });

    return () => {
      isMounted = false;
      if (directionsRendererRef.current) {
        try {
          directionsRendererRef.current.setMap(null);
        } catch {}
      }
    };
  }, []);

  // Update Route Polyline based on selected queue trip or active draft
  useEffect(() => {
    if (!mapInstanceRef.current || !directionsRendererRef.current) return;
    if (typeof window.google?.maps?.DirectionsService !== 'function') return;

    let origin: any = null;
    let destination: any = null;
    let waypoints: any[] = [];

    // Priority 1: User explicitly clicked or double-clicked a trip in queue table
    if (selectedTrip?.pickupLocation?.address && selectedTrip?.dropoffLocation?.address) {
      origin = selectedTrip.pickupLocation.coordinates || selectedTrip.pickupLocation.address;
      destination = selectedTrip.dropoffLocation.coordinates || selectedTrip.dropoffLocation.address;
      waypoints = (selectedTrip.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }
    // Priority 2: Active form values in active draft tab
    else if (activeFormValues?.pickupAddress && activeFormValues?.dropoffAddress) {
      origin = activeFormValues.pickupCoordinates || activeFormValues.pickupAddress;
      destination = activeFormValues.dropoffCoordinates || activeFormValues.dropoffAddress;
      waypoints = (activeFormValues.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }
    // Priority 3: Active trip from edit draft
    else if (activeTrip?.pickupLocation?.address && activeTrip?.dropoffLocation?.address) {
      origin = activeTrip.pickupLocation.coordinates || activeTrip.pickupLocation.address;
      destination = activeTrip.dropoffLocation.coordinates || activeTrip.dropoffLocation.address;
      waypoints = (activeTrip.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    }

    if (origin && destination) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK && directionsRendererRef.current) {
            // If shouldZoom is false: preserveViewport keeps map view without zooming in!
            // If shouldZoom is true: fit bounds tightly to the route
            directionsRendererRef.current.setOptions({
              preserveViewport: !shouldZoom,
            });
            directionsRendererRef.current.setDirections(result);

            if (shouldZoom && result?.routes?.[0]?.bounds && mapInstanceRef.current) {
              mapInstanceRef.current.fitBounds(result.routes[0].bounds);
            }
          }
        }
      );
    } else {
      // Clear route
      try {
        directionsRendererRef.current.setDirections({ routes: [] } as any);
      } catch {}
    }
  }, [activeFormValues, activeTrip, selectedTrip, shouldZoom]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
