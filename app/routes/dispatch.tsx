import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { getAdminAuthService, type AdminUser } from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import { getBookingService } from '../core/services/booking';
import { isFirebaseConfigured } from '../core/services/firebase';
import type { AppSettings } from '../core/types/config';
import type { Trip, TripStatus } from '../core/types/trip';
import { COMPANY_CONFIG } from '../config/companyConfig';
import { BookingEngine } from '../components/domain/BookingEngine';
import { CarIcon, SpinnerIcon, MapPinIcon } from '../components/ui/Icons';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

export function meta() {
  return [
    { title: 'Dispatch Console – Chesterfield Taxi' },
    { name: 'description', content: 'Tactical split-screen dispatch dashboard' },
  ];
}

interface DraftTab {
  id: string;
  title: string;
  isNew: boolean;
}

export default function DispatchLayout() {
  const navigate = useNavigate();

  // Auth & Config state
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(() => getAdminConfigService().getCachedSettings());
  const [isLiveFirebase, setIsLiveFirebase] = useState(false);

  // Trips state
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Draft Tabs state
  const maxDrafts = COMPANY_CONFIG.maxDispatchDrafts || 10;
  const [drafts, setDrafts] = useState<DraftTab[]>([{ id: 'new-1', title: 'New Booking', isNew: true }]);
  const [activeDraftId, setActiveDraftId] = useState<string>('new-1');
  const [nextDraftIdx, setNextDraftIdx] = useState(2);

  // Resizable state
  const [sidebarWidth, setSidebarWidth] = useState(450); // 320px - 600px
  const [queueHeight, setQueueHeight] = useState(250); // 180px - 50%

  // Auth Guard
  useEffect(() => {
    setIsLiveFirebase(isFirebaseConfigured());
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

  // Trips subscription
  useEffect(() => {
    const service = getBookingService();
    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(setTrips, (err) => console.error(err));
    }
  }, []);

  const handleSignOut = async () => {
    await getAdminAuthService().signOut();
    navigate('/admin/login', { replace: true });
  };

  const createDraft = () => {
    if (drafts.length >= maxDrafts) {
      alert(`Maximum of ${maxDrafts} drafts allowed.`);
      return;
    }
    const newDraft = { id: `new-${nextDraftIdx}`, title: `New Booking ${nextDraftIdx}`, isNew: true };
    setDrafts([...drafts, newDraft]);
    setActiveDraftId(newDraft.id);
    setNextDraftIdx(n => n + 1);
  };

  const closeDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (drafts.length === 1) return; // Keep at least one
    const newDrafts = drafts.filter(d => d.id !== id);
    setDrafts(newDrafts);
    if (activeDraftId === id) {
      setActiveDraftId(newDrafts[newDrafts.length - 1].id);
    }
  };

  const filteredTrips = trips.filter(trip => {
    if (statusFilter !== 'all' && trip.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        trip.passenger.firstName.toLowerCase().includes(term) ||
        trip.passenger.lastName.toLowerCase().includes(term) ||
        trip.passenger.phone.includes(term)
      );
    }
    return true;
  });

  const getStatusBadge = (status: TripStatus) => {
    switch (status) {
      case 'pending': return <Badge variant="warning">Pending</Badge>;
      case 'offered': return <Badge variant="info">Offered</Badge>;
      case 'assigned': return <Badge variant="primary">Assigned</Badge>;
      case 'completed': return <Badge variant="success">Completed</Badge>;
      default: return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <SpinnerIcon className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-100 flex flex-col overflow-hidden text-slate-900">
      {/* ─── Top Header ─── */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-900">
            <CarIcon className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold leading-none">{settings.company.name}</h1>
            <span className="text-[10px] text-amber-400 uppercase tracking-wider font-bold">Dispatch Console</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === 'admin' && (
            <Link to="/admin" className="text-xs text-emerald-400 hover:text-emerald-300 font-bold px-3 py-1.5 bg-slate-800 rounded-lg">
              &larr; Return to Admin Settings
            </Link>
          )}
          <span className="text-xs text-slate-400 font-semibold">{user?.email}</span>
          <Button type="button" variant="outline" size="sm" onClick={handleSignOut} className="text-slate-300 border-slate-700">
            Sign Out
          </Button>
        </div>
      </header>

      {/* ─── Split Screen Workspace ─── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Drafts) */}
        <div 
          className="flex flex-col bg-white border-r border-slate-200 relative shrink-0"
          style={{ width: sidebarWidth, minWidth: 320, maxWidth: 600 }}
        >
          {/* Resize Handle X */}
          <div 
            className="absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-amber-400/50 active:bg-amber-500 z-10"
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startW = sidebarWidth;
              const onMove = (ev: MouseEvent) => setSidebarWidth(Math.min(600, Math.max(320, startW + ev.clientX - startX)));
              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />

          {/* Draft Tabs Bar */}
          <div className="h-12 bg-slate-100 border-b border-slate-200 flex items-center px-2 gap-1 overflow-hidden shrink-0 relative pr-20">
            {drafts.map(draft => (
              <div 
                key={draft.id}
                onClick={() => setActiveDraftId(draft.id)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 max-w-xs ${activeDraftId === draft.id ? 'bg-white border-amber-500 text-slate-900' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-200'}`}
              >
                <span className="truncate">{draft.title}</span>
                {drafts.length > 1 && (
                  <button type="button" onClick={(e) => closeDraft(draft.id, e)} className="text-slate-400 hover:text-red-500 px-1 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✕</button>
                )}
              </div>
            ))}
            
            {/* Overflow Dropdown / Create Controls */}
            <div className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-slate-100 via-slate-100 to-transparent w-24 flex items-center justify-end px-2 gap-1">
               <select
                 className="opacity-0 absolute inset-0 cursor-pointer w-full h-full z-10"
                 value={activeDraftId}
                 onChange={(e) => setActiveDraftId(e.target.value)}
                 title="All Tabs"
               >
                 {drafts.map(d => (
                   <option key={d.id} value={d.id}>{d.title}</option>
                 ))}
               </select>
               <div className="pointer-events-none px-2 py-1 rounded hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold">
                 ...
               </div>
               <button type="button" onClick={createDraft} className="px-2 py-1 rounded bg-slate-200 text-slate-600 hover:bg-slate-300 text-xs font-bold shadow-sm relative z-20">
                 +
               </button>
            </div>
          </div>

          {/* Active Draft Content */}
          <div className="flex-1 overflow-y-auto bg-slate-50 relative">
            {drafts.map(draft => (
              <div key={draft.id} className={activeDraftId === draft.id ? 'block h-full p-4' : 'hidden'}>
                <BookingEngine mode="dispatcher" onBookingSuccess={() => {
                  setDrafts(drafts.filter(d => d.id !== draft.id));
                  if (drafts.length === 1) createDraft();
                  else setActiveDraftId(drafts.find(d => d.id !== draft.id)!.id);
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Right Side (Map + Queue) */}
        <div className="flex-1 flex flex-col relative bg-slate-200/50">
          
          {/* Center Stage Map (Mock) */}
          <div className="flex-1 relative flex items-center justify-center bg-blue-50/50 border-b border-slate-300 overflow-hidden">
             {/* Map Placeholder */}
             <div className="absolute inset-0" style={{ backgroundSize: '40px 40px', backgroundImage: 'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)' }} />
             <div className="relative z-10 flex flex-col items-center p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-blue-100/50">
                <MapPinIcon className="w-12 h-12 text-blue-500 mb-2 animate-bounce" />
                <h3 className="text-lg font-bold text-slate-800">Live Google Map Sync</h3>
                <p className="text-xs text-slate-500">Route polylines synced to active tab.</p>
             </div>
          </div>

          {/* Resize Handle Y */}
          <div 
            className="h-1.5 w-full cursor-row-resize hover:bg-amber-400/50 active:bg-amber-500 absolute z-20"
            style={{ bottom: queueHeight - 3 }}
            onMouseDown={(e) => {
              const startY = e.clientY;
              const startH = queueHeight;
              const maxH = window.innerHeight * 0.7;
              const onMove = (ev: MouseEvent) => setQueueHeight(Math.min(maxH, Math.max(180, startH - (ev.clientY - startY))));
              const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />

          {/* Bottom Docked Queue */}
          <div className="bg-white flex flex-col shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)] shrink-0" style={{ height: queueHeight }}>
            {/* Toolbar */}
            <div className="h-12 bg-slate-50 border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
               <div className="flex gap-2">
                 {['all', 'pending', 'offered', 'assigned', 'completed'].map(f => (
                   <button type="button" key={f} onClick={() => setStatusFilter(f)} className={`px-3 py-1 text-xs font-bold rounded-full capitalize ${statusFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                     {f}
                   </button>
                 ))}
               </div>
               <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-48 h-8 text-xs" />
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
               <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-white sticky top-0 shadow-sm text-[10px] uppercase font-bold text-slate-400">
                    <tr>
                      <th className="px-4 py-2">ID</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Passenger</th>
                      <th className="px-4 py-2">Route</th>
                      <th className="px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTrips.map(trip => (
                      <tr key={trip.id} className="hover:bg-amber-50 cursor-pointer" onDoubleClick={() => {
                          const newDraft = { id: `edit-${trip.id}`, title: `Edit #${trip.id.slice(-4)}`, isNew: false };
                          if (!drafts.find(d => d.id === newDraft.id)) {
                             if (drafts.length >= maxDrafts) {
                               alert(`Maximum of ${maxDrafts} drafts allowed.`);
                               return;
                             }
                             setDrafts([...drafts, newDraft]);
                          }
                          setActiveDraftId(newDraft.id);
                      }}>
                        <td className="px-4 py-3 font-mono font-bold">#{trip.id.slice(-6)}</td>
                        <td className="px-4 py-3">{getStatusBadge(trip.status)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{trip.passenger.firstName} {trip.passenger.lastName}</td>
                        <td className="px-4 py-3 truncate max-w-[200px]">{trip.pickupLocation.address} &rarr; {trip.dropoffLocation.address}</td>
                        <td className="px-4 py-3 font-bold text-slate-900">${trip.pricing.totalFare.toFixed(2)}</td>
                      </tr>
                    ))}
                    {filteredTrips.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-400">No trips found in queue.</td></tr>
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
