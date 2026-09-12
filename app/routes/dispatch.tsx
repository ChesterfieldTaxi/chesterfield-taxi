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
import { loadGoogleMaps, isGoogleMapsReady, CHESTERFIELD_CENTER } from '../core/services/maps/google-maps-loader';
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

export default function DispatchLayout() {
  const navigate = useNavigate();

  // Auth & Config
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // Trips state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQueueTripId, setSelectedQueueTripId] = useState<string | null>(null);

  // Draft Tabs state
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const [drafts, setDrafts] = useState<DraftTab[]>([
    { id: 'new-1', isNew: true },
  ]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState(2);

  // Resizable layout dimensions
  const [sidebarWidth, setSidebarWidth] = useState(420); // 340px - 600px
  const [queueHeight, setQueueHeight] = useState(250); // 180px - 50%

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

  const handleSignOut = async () => {
    await getAdminAuthService().signOut();
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
      // If closing the only tab, reset it to new-1
      setDrafts([{ id: `new-${nextDraftIdx}`, isNew: true }]);
      setActiveDraftId(`new-${nextDraftIdx}`);
      setNextDraftIdx((n) => n + 1);
      return;
    }

    const filtered = drafts.filter((d) => d.id !== id);
    setDrafts(filtered);
    if (activeDraftId === id) {
      setActiveDraftId(filtered[filtered.length - 1].id);
    }
  };

  // Double click queue row to open/switch to edit tab
  const handleOpenEditTrip = (trip: Trip) => {
    const editTabId = `edit-${trip.id}`;
    const existing = drafts.find((d) => d.id === editTabId);

    if (existing) {
      setActiveDraftId(editTabId);
    } else {
      if (drafts.length >= maxDrafts) {
        alert(`Maximum of ${maxDrafts} tabs open. Please close a tab first.`);
        return;
      }
      const newEditTab: DraftTab = {
        id: editTabId,
        isNew: false,
        trip,
      };
      setDrafts([...drafts, newEditTab]);
      setActiveDraftId(editTabId);
    }
    setSelectedQueueTripId(trip.id);
  };

  // Handle live form values changes for a draft (for tab titles & map sync)
  const handleDraftValuesChange = (draftId: string, values: DispatchFormValues) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, formValues: values } : d))
    );
  };

  // Handle successful booking create or edit
  const handleBookingSuccess = (draftId: string, trip: Trip, isEdit: boolean) => {
    if (isEdit) {
      // Successfully updated existing trip
      alert(`Trip #${trip.id.slice(-6)} updated successfully!`);
    } else {
      // Successfully booked new trip
      alert(`Trip #${trip.id.slice(-6)} booked successfully!`);
      // Close the draft tab and open a fresh new tab
      const remaining = drafts.filter((d) => d.id !== draftId);
      if (remaining.length === 0) {
        const freshTab: DraftTab = { id: `new-${nextDraftIdx}`, isNew: true };
        setDrafts([freshTab]);
        setActiveDraftId(freshTab.id);
        setNextDraftIdx((n) => n + 1);
      } else {
        setDrafts(remaining);
        setActiveDraftId(remaining[remaining.length - 1].id);
      }
    }
  };

  // Clear draft
  const handleClearDraft = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, formValues: undefined } : d))
    );
  };

  // Compute smart dynamic title for tabs
  const getTabTitle = (draft: DraftTab): string => {
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
          1. TOP NAVIGATION BAR (Mockup Matching)
      ───────────────────────────────────────────────────────────── */}
      <header className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-30 shadow-sm">
        {/* Left: Navigation Buttons / Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
          >
            <span className="text-sm">⊞</span>
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className="px-3 py-1.5 rounded hover:bg-slate-100 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <span>🚗</span>
            <span>Drivers</span>
          </button>

          <button
            type="button"
            className="px-3 py-1.5 rounded hover:bg-slate-100 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <span>💬</span>
            <span>Messages</span>
          </button>

          <a
            href="tel:+13147380100"
            className="px-3 py-1.5 rounded hover:bg-slate-100 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors"
          >
            <span>📞</span>
            <span>Phone</span>
          </a>
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
          2. MAIN SPLIT-SCREEN WORKSPACE
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Left Sidebar (Tabs & Dedicated Dispatch Booking Engine) ─── */}
        <div
          className="flex flex-col bg-white border-r border-slate-200 relative shrink-0 shadow-sm"
          style={{ width: sidebarWidth, minWidth: 340, maxWidth: 600 }}
        >
          {/* Resize Handle X */}
          <div
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400/50 active:bg-blue-500 z-20"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startW = sidebarWidth;
              const onMove = (ev: MouseEvent) =>
                setSidebarWidth(Math.min(600, Math.max(340, startW + ev.clientX - startX)));
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />

          {/* Draft Tabs Bar */}
          <div className="h-10 bg-slate-200/90 border-b border-slate-300 flex items-end px-1 gap-1 overflow-hidden shrink-0 relative pr-20 pt-1">
            {drafts.map((draft) => {
              const isActive = activeDraftId === draft.id;
              const title = getTabTitle(draft);
              return (
                <div
                  key={draft.id}
                  onClick={() => setActiveDraftId(draft.id)}
                  className={`group flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-t-lg border text-xs font-semibold cursor-pointer flex-1 min-w-[50px] max-w-[150px] transition-colors ${
                    isActive
                      ? 'bg-white border-slate-300 border-b-white text-slate-900 shadow-sm z-10'
                      : 'bg-slate-100/90 border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <span className="truncate">{title}</span>
                  <button
                    type="button"
                    onClick={(e) => closeDraft(draft.id, e)}
                    className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 leading-none"
                    title="Close Tab"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {/* Overflow Dropdown & Add Button */}
            <div className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-slate-200 via-slate-200 to-transparent w-24 flex items-center justify-end px-2 gap-1 z-20">
              <select
                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full z-10"
                value={activeDraftId}
                onChange={(e) => setActiveDraftId(e.target.value)}
                title="All Open Tabs"
              >
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {getTabTitle(d)}
                  </option>
                ))}
              </select>

              <div className="pointer-events-none px-2 py-1 rounded hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-xs">
                ...
              </div>

              <button
                type="button"
                onClick={createDraft}
                className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-extrabold shadow-sm relative z-20 transition-all"
                title="Open New Booking Draft"
              >
                +
              </button>
            </div>
          </div>

          {/* Dedicated Dispatch Booking Engine Component */}
          <div className="flex-1 overflow-hidden bg-slate-50 relative">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className={`h-full ${activeDraftId === draft.id ? 'block' : 'hidden'}`}
              >
                <DispatchBookingEngine
                  draftId={draft.id}
                  initialTrip={draft.trip}
                  onValuesChange={(vals) => handleDraftValuesChange(draft.id, vals)}
                  onBookingSuccess={(savedTrip, isEdit) =>
                    handleBookingSuccess(draft.id, savedTrip, isEdit)
                  }
                  onClearDraft={() => handleClearDraft(draft.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ─── Right Area: Map Stage + Docked Trip Queue ─── */}
        <div className="flex-1 flex flex-col relative bg-slate-100 overflow-hidden">
          {/* Center Stage Live Google Map */}
          <div className="flex-1 relative flex items-stretch justify-stretch bg-slate-100 border-b border-slate-300 overflow-hidden">
            <LiveDispatchMap
              activeFormValues={activeDraft?.formValues}
              activeTrip={activeDraft?.trip || null}
            />
          </div>

          {/* Resize Handle Y */}
          <div
            className="h-1.5 w-full cursor-row-resize hover:bg-blue-400/50 active:bg-blue-500 absolute z-20"
            style={{ bottom: queueHeight - 3 }}
            onMouseDown={(e) => {
              const startY = e.clientY;
              const startH = queueHeight;
              const maxH = window.innerHeight * 0.7;
              const onMove = (ev: MouseEvent) =>
                setQueueHeight(Math.min(maxH, Math.max(180, startH - (ev.clientY - startY))));
              const onUp = () => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />

          {/* ─────────────────────────────────────────────────────────
              3. BOTTOM DOCKED TRIP QUEUE
          ───────────────────────────────────────────────────────── */}
          <div
            className="bg-white flex flex-col shadow-lg shrink-0 border-t border-slate-200"
            style={{ height: queueHeight }}
          >
            {/* Toolbar */}
            <div className="h-11 bg-slate-50 border-b border-slate-200 flex items-center px-3 justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 shadow-sm"
                >
                  Select date range
                </button>

                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-xs">
                  <span>Unconfirmed</span>
                  <span className="w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px]">
                    {unconfirmedCount}
                  </span>
                </div>

                <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
                  <span>Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="offered">Offered</option>
                    <option value="assigned">Assigned</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setSearchTerm('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1"
                >
                  + Add Filter
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Search trips..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-56 px-2.5 py-1 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
                />
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 sticky top-0 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 z-10">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Passenger</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Route</th>
                    <th className="px-3 py-2">Vehicle</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Fare</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTrips.map((trip) => {
                    const isSelected = selectedQueueTripId === trip.id;
                    return (
                      <tr
                        key={trip.id}
                        onDoubleClick={() => handleOpenEditTrip(trip)}
                        onClick={() => setSelectedQueueTripId(trip.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80 font-medium'
                            : 'hover:bg-slate-50'
                        }`}
                        title="Double-click to open and edit in left panel"
                      >
                        <td className="px-3 py-2 font-mono font-bold text-blue-600">
                          #{trip.id.slice(-6)}
                        </td>
                        <td className="px-3 py-2">{getStatusBadge(trip.status)}</td>
                        <td className="px-3 py-2 font-semibold">
                          {trip.passenger.firstName} {trip.passenger.lastName}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{trip.passenger.phone}</td>
                        <td className="px-3 py-2 truncate max-w-[220px]" title={`${trip.pickupLocation.address} → ${trip.dropoffLocation.address}`}>
                          <span className="text-emerald-600 font-bold">●</span> {trip.pickupLocation.address}
                          <span className="mx-1 text-slate-400">→</span>
                          <span className="text-rose-600 font-bold">●</span> {trip.dropoffLocation.address}
                        </td>
                        <td className="px-3 py-2 capitalize font-medium">{trip.vehicleTier}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {trip.assignedDriverId || 'Unassigned'}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-900">
                          ${trip.pricing.totalFare.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
}

function LiveDispatchMap({ activeFormValues, activeTrip }: LiveDispatchMapProps) {
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
            polylineOptions: {
              strokeColor: '#2563eb',
              strokeWeight: 5,
              strokeOpacity: 0.8,
            },
          });
        }
      })
      .catch((err) => {
        console.warn('[LiveDispatchMap] Initialization failed:', err);
      });
  }, []);

  // Update Route Polyline based on active draft or active trip
  useEffect(() => {
    if (!mapInstanceRef.current || !directionsRendererRef.current) return;
    if (typeof window.google?.maps?.DirectionsService !== 'function') return;

    let origin: any = null;
    let destination: any = null;
    let waypoints: any[] = [];

    if (activeFormValues?.pickupAddress && activeFormValues?.dropoffAddress) {
      origin = activeFormValues.pickupCoordinates || activeFormValues.pickupAddress;
      destination = activeFormValues.dropoffCoordinates || activeFormValues.dropoffAddress;
      waypoints = (activeFormValues.intermediateStops || [])
        .map((s) => s.coordinates || s.address)
        .filter(Boolean)
        .map((loc) => ({ location: loc, stopover: true }));
    } else if (activeTrip?.pickupLocation?.address && activeTrip?.dropoffLocation?.address) {
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
            directionsRendererRef.current.setDirections(result);
          }
        }
      );
    } else {
      // Clear route
      try {
        directionsRendererRef.current.setDirections({ routes: [] } as any);
      } catch {
        // ignore
      }
    }
  }, [activeFormValues, activeTrip]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
