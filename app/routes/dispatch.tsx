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
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Trips real-time state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQueueTripId, setSelectedQueueTripId] = useState<string | null>(null);
  const [selectedMapTrip, setSelectedMapTrip] = useState<Trip | null>(null);
  const [shouldZoomMap, setShouldZoomMap] = useState<boolean>(false);

  // Draft Tabs state
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const [drafts, setDrafts] = useState<DraftTab[]>([
    { id: 'new-1', isNew: true },
  ]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState(2);

  // Operational Right Dock Tools (Multi-tasking, non-blocking)
  const [isDriversOpen, setIsDriversOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isPhoneOpen, setIsPhoneOpen] = useState(false);

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

  // Phone Softphone State
  const [dialedNumber, setDialedNumber] = useState('');
  const [activeCallStatus, setActiveCallStatus] = useState<'idle' | 'calling' | 'connected'>('idle');
  const [callDuration, setCallDuration] = useState(0);

  // Resizable layout dimensions
  const [sidebarWidth, setSidebarWidth] = useState(430); // 340px - 620px
  const [queueHeight, setQueueHeight] = useState(240); // 160px - 50%
  const [operationsWidth, setOperationsWidth] = useState(400); // 320px - 750px
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>({
    drivers: 320,
    messages: 300,
    phone: 380,
  });
  const [isViewsDropdownOpen, setIsViewsDropdownOpen] = useState(false);
  const viewsDropdownRef = useRef<HTMLDivElement>(null);

  // Close views dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (viewsDropdownRef.current && !viewsDropdownRef.current.contains(e.target as Node)) {
        setIsViewsDropdownOpen(false);
      }
    };
    if (isViewsDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isViewsDropdownOpen]);

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

  // Immediate Sign Out without awaiting async promises
  const handleSignOut = () => {
    setIsProfileMenuOpen(false);
    try {
      getAdminAuthService().signOut().catch(() => {});
    } catch {}
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch {}
    }
    navigate('/admin/login', { replace: true });
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

  // Operations panels vertical resize between cards
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

  const handleVerticalResizeMove = useCallback((e: MouseEvent) => {
    if (!isDraggingVerticalKey.current) return;
    const key = isDraggingVerticalKey.current;
    const delta = e.clientY - startDragY.current;
    const nextHeight = Math.max(160, Math.min(650, startDragHeight.current + delta));
    setPanelHeights((prev) => ({
      ...prev,
      [key]: nextHeight,
    }));
  }, []);

  const handleVerticalResizeUp = useCallback(() => {
    isDraggingVerticalKey.current = null;
    document.removeEventListener('mousemove', handleVerticalResizeMove);
    document.removeEventListener('mouseup', handleVerticalResizeUp);
  }, [handleVerticalResizeMove]);

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

  // Filtered trips in queue
  const filteredTrips = trips.filter((trip) => {
    if (statusFilter !== 'all' && trip.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        trip.id.toLowerCase().includes(term) ||
        trip.passenger.firstName.toLowerCase().includes(term) ||
        trip.passenger.lastName.toLowerCase().includes(term) ||
        trip.passenger.phone.includes(term) ||
        trip.pickupLocation.address.toLowerCase().includes(term) ||
        trip.dropoffLocation.address.toLowerCase().includes(term)
      );
    }
    return true;
  });

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
  const activePanels: ('drivers' | 'messages' | 'phone')[] = [];
  if (isDriversOpen) activePanels.push('drivers');
  if (isMessagesOpen) activePanels.push('messages');
  if (isPhoneOpen) activePanels.push('phone');
  const activeOperationalCount = activePanels.length;

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
              to="/admin"
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

        {/* Right: Admin User Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center font-bold text-[11px]">
              {user?.email ? user.email[0].toUpperCase() : 'A'}
            </div>
            <span>{user?.email || 'Admin User'}</span>
            <span className="text-[10px] text-slate-400">▾</span>
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 text-xs font-medium">
              <div className="px-3 py-2 border-b border-slate-100 text-slate-500">
                Signed in as <strong className="text-slate-800 block truncate">{user?.email}</strong>
              </div>
              {user?.role === 'admin' && (
                <Link
                  to="/admin"
                  onClick={() => setIsProfileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-blue-600"
                >
                  <span>⚙️</span>
                  <span>Admin Settings</span>
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50"
              >
                <span>↪</span>
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
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
          <div className="h-9 bg-slate-100 border-b border-slate-200 flex items-center px-1 gap-1 overflow-x-auto shrink-0 select-none">
            {drafts.map((d) => {
              const isActive = d.id === activeDraftId;
              const label = getTabLabel(d);
              return (
                <div
                  key={d.id}
                  onClick={() => setActiveDraftId(d.id)}
                  title={d.formValues?.passengerName || d.id}
                  className={`group relative h-7 px-2.5 rounded-t-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer border-t border-x transition-colors ${
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

            {/* Add New Tab Button */}
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
            {/* Queue Header & Filters */}
            <div className="h-9 px-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-3">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📋 Trips Queue</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
                    {filteredTrips.length}
                  </span>
                </div>

                {unconfirmedCount > 0 && (
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                    ⚠ {unconfirmedCount} Unconfirmed
                  </span>
                )}
              </div>

              {/* Status Filter & Search */}
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs font-medium focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <input
                  type="text"
                  placeholder="Search passenger, address, ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-slate-700 text-xs w-48 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100/80 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                  <tr>
                    <th className="py-1.5 px-3">Trip ID</th>
                    <th className="py-1.5 px-3">Pickup Time</th>
                    <th className="py-1.5 px-3">Passenger</th>
                    <th className="py-1.5 px-3">Pickup</th>
                    <th className="py-1.5 px-3">Dropoff</th>
                    <th className="py-1.5 px-3">Driver</th>
                    <th className="py-1.5 px-3">Status</th>
                    <th className="py-1.5 px-3 text-right">Fare</th>
                    <th className="py-1.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredTrips.map((trip) => {
                    const isSelected = selectedQueueTripId === trip.id;
                    const pickupTimeStr = trip.scheduledPickupTime
                      ? new Date(trip.scheduledPickupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
                          isSelected ? 'bg-blue-50 font-medium' : ''
                        }`}
                        title="Click to view route on map. Double-click to edit trip & zoom in."
                      >
                        <td className="py-1.5 px-3 font-mono text-[11px] font-semibold text-slate-600">
                          #{trip.id.slice(-6)}
                        </td>
                        <td className="py-1.5 px-3 font-bold text-slate-700">
                          {pickupTimeStr}
                        </td>
                        <td className="py-1.5 px-3 font-medium">
                          {trip.passenger.firstName} {trip.passenger.lastName}
                          <div className="text-[10px] text-slate-400 font-mono">{trip.passenger.phone}</div>
                        </td>
                        <td className="py-1.5 px-3 truncate max-w-[160px]" title={trip.pickupLocation.address}>
                          {trip.pickupLocation.address}
                        </td>
                        <td className="py-1.5 px-3 truncate max-w-[160px]" title={trip.dropoffLocation.address}>
                          {trip.dropoffLocation.address}
                        </td>
                        <td className="py-1.5 px-3">
                          {trip.assignedDriverId ? (
                            <span className="font-semibold text-blue-600">{trip.assignedDriverId}</span>
                          ) : (
                            <span className="text-amber-600 font-bold">Unassigned</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3">{getStatusBadge(trip.status)}</td>
                        <td className="py-1.5 px-3 text-right font-bold text-slate-900">
                          ${trip.pricing?.totalFare?.toFixed(2) || '0.00'}
                        </td>
                        <td className="py-1.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedQueueTripId(trip.id);
                              setSelectedMapTrip(trip);
                              setShouldZoomMap(true);
                              handleOpenEditTrip(trip);
                            }}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-600 hover:text-white border border-slate-300 text-[11px] font-bold text-slate-700 transition-colors"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTrips.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        No trips found matching the criteria.
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

            {/* Stacked Panels (Scrollable or Vertically Shared) */}
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* 1. DRIVERS ROSTER CARD */}
              {isDriversOpen && (
                <>
                  <div
                    className={`flex flex-col bg-white overflow-hidden ${
                      activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'drivers'
                        ? 'flex-1 min-h-[160px]'
                        : 'shrink-0'
                    }`}
                    style={
                      activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'drivers'
                        ? { height: `${panelHeights.drivers}px` }
                        : undefined
                    }
                  >
                  <div className="h-8 px-3 bg-slate-800 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <span>🚗 Drivers Roster</span>
                      <span className="text-[10px] text-emerald-400">
                        ({drivers.filter((d) => d.status === 'available').length} Avail)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDriversOpen(false)}
                      className="text-slate-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Filter tabs */}
                  <div className="p-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-1 text-[11px]">
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
                </div>
                {activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'drivers' && (
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
                    className={`flex flex-col bg-white overflow-hidden ${
                      activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'messages'
                        ? 'flex-1 min-h-[160px]'
                        : 'shrink-0'
                    }`}
                    style={
                      activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'messages'
                        ? { height: `${panelHeights.messages}px` }
                        : undefined
                    }
                  >
                  <div className="h-8 px-3 bg-slate-800 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <span>💬 Driver Messaging &amp; SMS</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMessagesOpen(false)}
                      className="text-slate-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Quick Preset Message Buttons */}
                  <div className="p-2 bg-slate-50 border-b border-slate-200 space-y-1">
                    <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                      Tactical Presets (Click to insert)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        'Airport surge at Lambert T1/T2.',
                        'Traffic advisory: I-64 westbound heavy congestion.',
                        'Check in with dispatch if available.',
                        'Weather alert: rain/slick roads, slow down.',
                      ].map((preset, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setMsgText(preset)}
                          className="text-[10px] px-1.5 py-0.5 bg-white border border-slate-300 hover:border-blue-400 hover:text-blue-600 rounded text-slate-700 text-left transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Compose Alert Form */}
                  <form onSubmit={handleSendMessage} className="p-2 bg-white border-b border-slate-200 space-y-1.5">
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
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded transition-colors shrink-0"
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
                </div>
                {activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'messages' && (
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
                    className={`flex flex-col bg-slate-900 text-white overflow-y-auto p-3 space-y-2.5 ${
                      activePanels.length === 1
                        ? 'flex-1 h-full min-h-0'
                        : activePanels[activePanels.length - 1] === 'phone'
                        ? 'flex-1 min-h-[220px]'
                        : 'shrink-0'
                    }`}
                    style={
                      activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'phone'
                        ? { height: `${panelHeights.phone}px` }
                        : undefined
                    }
                  >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <span>📞 Tactical Softphone</span>
                      <span className="text-[10px] text-emerald-400 uppercase">({activeCallStatus})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPhoneOpen(false)}
                      className="text-slate-400 hover:text-white text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>

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
                    <div className="text-lg font-mono font-bold tracking-wider text-slate-100 min-h-[28px] truncate">
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
                          className="p-1 bg-slate-800/80 hover:bg-slate-800 rounded text-left border border-slate-700 transition-colors"
                        >
                          <div className="text-[10px] font-bold text-slate-200 truncate">{preset.name}</div>
                          <div className="text-[9px] font-mono text-emerald-400">{preset.num}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 12-Key Numeric Dialpad */}
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
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
                        className="h-8 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-sm flex flex-col items-center justify-center transition-all"
                      >
                        <span>{btn.digit}</span>
                        {btn.sub && <span className="text-[7px] text-slate-400 -mt-1">{btn.sub}</span>}
                      </button>
                    ))}
                  </div>

                  {/* Call Actions */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {activeCallStatus === 'idle' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartCall()}
                          className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                          <span>📞</span>
                          <span>Call</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialedNumber('')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                        >
                          Clear
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleEndCall}
                        className="w-full py-1.5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-xs text-white flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        <span>📵</span>
                        <span>End Call</span>
                      </button>
                    )}
                  </div>
                  </div>
                  {activePanels.length > 1 && activePanels[activePanels.length - 1] !== 'phone' && (
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
    loadGoogleMaps()
      .then((gMaps) => {
        if (!gMaps || !mapContainerRef.current) return;

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
