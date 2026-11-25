import React, { useEffect, useRef } from 'react';
import { getAdminAuthService, type AdminUser } from '../../services/auth/admin-auth.service';
import { getAdminConfigService } from '../../services/config/admin-config.service';
import { getBookingService } from '../../services/booking';
import { getDispatchEmailService } from '../../services/email/dispatch-email.service';
import {
  formatDispatchNewRideAlert,
  pushNotificationService,
} from '../../services/notifications/push-notification.service';
import { soundNotificationService } from '../../services/sound-notification.service';
import { getWorkspaceBus } from '../../services/workspace-bus.service';
import { getZoneService } from '../../services/zones/zone.service';
import type { AppSettings } from '../../types/config';
import type { Trip } from '../../types/trip';
import type { ZoneGeofence } from '../../types/zone';
import {
  VALID_MOBILE_TABS,
  type DesktopDockTab,
  type DispatchMobileTab,
  type DraftTab,
} from './dispatch-workspace.util';

const DISPATCH_TABS_STORAGE_KEY = 'ct_dispatch_open_tabs_v1';
const MOBILE_TAB_STORAGE_KEY = 'ct_dispatch_mobile_tab_v1';
const MOBILE_GESTURE_PREF_KEY = 'ct_dispatch_mobile_gesture_v1';
const DISPATCH_WAKE_LOCK_STORAGE_KEY = 'ct_dispatch_wake_lock';

export interface UseDispatchWorkspaceSyncParams {
  navigate: (to: string, opts?: { replace?: boolean }) => void;
  urlTripId: string | null;
  maxDrafts: number;
  trips: Trip[];
  setTrips: React.Dispatch<React.SetStateAction<Trip[]>>;
  drafts: DraftTab[];
  setDrafts: React.Dispatch<React.SetStateAction<DraftTab[]>>;
  activeDraftId: string;
  setActiveDraftId: React.Dispatch<React.SetStateAction<string>>;
  nextDraftIdx: number;
  setNextDraftIdx: React.Dispatch<React.SetStateAction<number>>;
  hasHydratedClientTabsRef: React.MutableRefObject<boolean>;
  activeMobileTab: DispatchMobileTab;
  setActiveMobileTab: React.Dispatch<React.SetStateAction<DispatchMobileTab>>;
  setMobileFleetView: React.Dispatch<React.SetStateAction<'drivers' | 'map'>>;
  mobileCardGestureMode: 'action_sheet' | 'multi_select';
  setMobileCardGestureMode: React.Dispatch<React.SetStateAction<'action_sheet' | 'multi_select'>>;
  setUser: React.Dispatch<React.SetStateAction<AdminUser | null>>;
  setIsAuthChecking: React.Dispatch<React.SetStateAction<boolean>>;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  setDispatchZones: React.Dispatch<React.SetStateAction<ZoneGeofence[]>>;
  setIsSoundMuted: React.Dispatch<React.SetStateAction<boolean>>;
  setKeepScreenAwake: React.Dispatch<React.SetStateAction<boolean>>;
  setUnreadMessagesCount: React.Dispatch<React.SetStateAction<number>>;
  setMissedCallsCount: React.Dispatch<React.SetStateAction<number>>;
  setUnreadEmailCount: React.Dispatch<React.SetStateAction<number>>;
  setActiveDockTab: React.Dispatch<React.SetStateAction<DesktopDockTab>>;
  setCommsInitialTab: React.Dispatch<
    React.SetStateAction<'all' | 'phone' | 'messages' | 'voicemail'>
  >;
  setCommsActiveTab: React.Dispatch<
    React.SetStateAction<'all' | 'phone' | 'messages' | 'voicemail'>
  >;
  setIsMobileDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSearchExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isTabOverflowOpen: boolean;
  setIsTabOverflowOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tabOverflowRef: React.RefObject<HTMLDivElement | null>;
  isAddFilterOpen: boolean;
  setIsAddFilterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  addFilterRef: React.RefObject<HTMLDivElement | null>;
  isLayoutDropdownOpen: boolean;
  setIsLayoutDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  layoutDropdownRef: React.RefObject<HTMLDivElement | null>;
  showDeviceSettingsMenu: boolean;
  setShowDeviceSettingsMenu: React.Dispatch<React.SetStateAction<boolean>>;
  deviceSettingsMenuRef: React.RefObject<HTMLDivElement | null>;
  showAlertsDropdown: boolean;
  setShowAlertsDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  alertsDropdownRef: React.RefObject<HTMLDivElement | null>;
  setSelectedQueueTripId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedMapTrip: React.Dispatch<React.SetStateAction<Trip | null>>;
  setShouldZoomMap: React.Dispatch<React.SetStateAction<boolean>>;
  activeCallStatus: 'idle' | 'calling' | 'connected';
  setActiveCallStatus: React.Dispatch<React.SetStateAction<'idle' | 'calling' | 'connected'>>;
  setActiveCallMeta: React.Dispatch<
    React.SetStateAction<{ contactName: string; phoneNumber: string; duration: number } | null>
  >;
  setCallDuration: React.Dispatch<React.SetStateAction<number>>;
  setIncomingCallAlert: React.Dispatch<
    React.SetStateAction<{ from: string; callSid?: string } | null>
  >;
  populateActiveDraftFromPayload: (payload: any) => void;
  onOpenEditTrip: (trip: Trip) => void;
  autoOfferContextRef: React.MutableRefObject<{
    autoOfferOnConfirm: boolean;
    isEligibleForAutoPilot: (trip: Trip) => boolean;
    handleStartAutoOffer: (trip: Trip) => Promise<void>;
  }>;
  autoOfferStartedIdsRef: React.MutableRefObject<Set<string>>;
}

export function useDispatchWorkspaceSync({
  navigate,
  urlTripId,
  maxDrafts,
  trips,
  setTrips,
  drafts,
  setDrafts,
  activeDraftId,
  setActiveDraftId,
  nextDraftIdx,
  setNextDraftIdx,
  hasHydratedClientTabsRef,
  activeMobileTab,
  setActiveMobileTab,
  setMobileFleetView,
  mobileCardGestureMode,
  setMobileCardGestureMode,
  setUser,
  setIsAuthChecking,
  setSettings,
  setDispatchZones,
  setIsSoundMuted,
  setKeepScreenAwake,
  setUnreadMessagesCount,
  setMissedCallsCount,
  setUnreadEmailCount,
  setActiveDockTab,
  setCommsInitialTab,
  setCommsActiveTab,
  setIsMobileDrawerOpen,
  setIsSearchExpanded,
  searchInputRef,
  isTabOverflowOpen,
  setIsTabOverflowOpen,
  tabOverflowRef,
  isAddFilterOpen,
  setIsAddFilterOpen,
  addFilterRef,
  isLayoutDropdownOpen,
  setIsLayoutDropdownOpen,
  layoutDropdownRef,
  showDeviceSettingsMenu,
  setShowDeviceSettingsMenu,
  deviceSettingsMenuRef,
  showAlertsDropdown,
  setShowAlertsDropdown,
  alertsDropdownRef,
  setSelectedQueueTripId,
  setSelectedMapTrip,
  setShouldZoomMap,
  activeCallStatus,
  setActiveCallStatus,
  setActiveCallMeta,
  setCallDuration,
  setIncomingCallAlert,
  populateActiveDraftFromPayload,
  onOpenEditTrip,
  autoOfferContextRef,
  autoOfferStartedIdsRef,
}: UseDispatchWorkspaceSyncParams): void {
  const handledUrlTripIdRef = useRef<string | null>(null);
  const knownTripIdsRef = useRef<Set<string> | null>(null);
  const onOpenEditTripRef = useRef(onOpenEditTrip);
  onOpenEditTripRef.current = onOpenEditTrip;

  // 1. Client mount hydration for open tabs, mobile tab, audio/wake-lock, and unread badges
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsSoundMuted(soundNotificationService.isMuted());
    setUnreadEmailCount(getDispatchEmailService().getUnreadCount());

    try {
      setKeepScreenAwake(localStorage.getItem(DISPATCH_WAKE_LOCK_STORAGE_KEY) === 'true');
      const storedInteractions = localStorage.getItem('ct_interactions_database');
      if (storedInteractions) {
        const parsed = JSON.parse(storedInteractions);
        if (Array.isArray(parsed)) {
          setUnreadMessagesCount(
            parsed.filter((i: any) => i.type?.startsWith('sms_') && i.isUnread).length
          );
          setMissedCallsCount(
            parsed.filter((i: any) => i.type === 'call_missed' && i.isUnread).length
          );
        }
      }
      const savedGesture = localStorage.getItem(MOBILE_GESTURE_PREF_KEY);
      if (savedGesture === 'action_sheet' || savedGesture === 'multi_select') {
        setMobileCardGestureMode(savedGesture);
      }
      const rawTabs = localStorage.getItem(DISPATCH_TABS_STORAGE_KEY);
      if (rawTabs) {
        const parsed = JSON.parse(rawTabs);
        if (Array.isArray(parsed?.drafts) && parsed.drafts.length > 0) {
          const restored: DraftTab[] = parsed.drafts.slice(0, maxDrafts).map((item: any) => ({
            id: String(item.id),
            isNew: Boolean(item.isNew),
            tripId: item.tripId ? String(item.tripId) : undefined,
          }));
          const validActive = restored.some((d) => d.id === parsed.activeDraftId)
            ? parsed.activeDraftId
            : restored[0].id;
          const nextIdx =
            typeof parsed.nextDraftIdx === 'number' && parsed.nextDraftIdx >= 2
              ? parsed.nextDraftIdx
              : restored.length + 2;
          setDrafts(restored);
          setActiveDraftId(validActive);
          setNextDraftIdx(nextIdx);
        }
      }
      if (!urlTripId) {
        const savedMobileTab = localStorage.getItem(MOBILE_TAB_STORAGE_KEY);
        if (savedMobileTab && VALID_MOBILE_TABS.has(savedMobileTab)) {
          setActiveMobileTab(savedMobileTab as DispatchMobileTab);
        }
      }
    } catch {}
    hasHydratedClientTabsRef.current = true;
  }, [maxDrafts, urlTripId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      const serializable = {
        drafts: drafts.map((d) => ({
          id: d.id,
          isNew: d.isNew,
          tripId: d.trip?.id || d.tripId,
        })),
        activeDraftId,
        nextDraftIdx,
      };
      localStorage.setItem(DISPATCH_TABS_STORAGE_KEY, JSON.stringify(serializable));
    } catch {}
  }, [drafts, activeDraftId, nextDraftIdx, hasHydratedClientTabsRef]);

  useEffect(() => {
    if (trips.length === 0) return;
    setDrafts((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        if (!d.isNew && !d.trip && d.tripId) {
          const match = trips.find((t) => t.id === d.tripId);
          if (match) {
            changed = true;
            return { ...d, trip: match };
          }
        }
        return d;
      });
      return changed ? next : prev;
    });
  }, [trips, setDrafts]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      localStorage.setItem(MOBILE_TAB_STORAGE_KEY, activeMobileTab);
    } catch {}
  }, [activeMobileTab, hasHydratedClientTabsRef]);

  useEffect(() => {
    if (activeMobileTab === 'drivers' || activeMobileTab === 'map') {
      setMobileFleetView(activeMobileTab);
    }
  }, [activeMobileTab, setMobileFleetView]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasHydratedClientTabsRef.current) return;
    try {
      localStorage.setItem(MOBILE_GESTURE_PREF_KEY, mobileCardGestureMode);
    } catch {}
  }, [mobileCardGestureMode, hasHydratedClientTabsRef]);

  useEffect(() => {
    if (urlTripId && trips.length > 0 && handledUrlTripIdRef.current !== urlTripId) {
      const match = trips.find((t) => t.id === urlTripId);
      if (match) {
        handledUrlTripIdRef.current = urlTripId;
        onOpenEditTripRef.current(match);
        setActiveMobileTab('booking');
      }
    }
  }, [urlTripId, trips, setActiveMobileTab]);

  // 2. Outside click handlers for popovers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (target instanceof Element && target.closest('[data-ui-select-portal="true"]')) return;
      if (tabOverflowRef.current && !tabOverflowRef.current.contains(target)) {
        setIsTabOverflowOpen(false);
      }
      if (addFilterRef.current && !addFilterRef.current.contains(target)) {
        setIsAddFilterOpen(false);
      }
      if (layoutDropdownRef.current && !layoutDropdownRef.current.contains(target)) {
        setIsLayoutDropdownOpen(false);
      }
      if (deviceSettingsMenuRef.current && !deviceSettingsMenuRef.current.contains(target)) {
        setShowDeviceSettingsMenu(false);
      }
      if (alertsDropdownRef.current && !alertsDropdownRef.current.contains(target)) {
        setShowAlertsDropdown(false);
      }
    };
    if (
      isTabOverflowOpen ||
      isAddFilterOpen ||
      isLayoutDropdownOpen ||
      showDeviceSettingsMenu ||
      showAlertsDropdown
    ) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [
    isTabOverflowOpen,
    isAddFilterOpen,
    isLayoutDropdownOpen,
    showDeviceSettingsMenu,
    showAlertsDropdown,
  ]);

  // 3. Auth Guard & Settings Subscription
  useEffect(() => {
    const unsubscribe = getAdminAuthService().onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        navigate('/app/login?message=unauthenticated&redirect=/app/dispatch', { replace: true });
      } else if (
        !(
          currentUser.roles &&
          (currentUser.roles.includes('admin') || currentUser.roles.includes('dispatcher'))
        ) &&
        currentUser.role !== 'admin' &&
        currentUser.role !== 'dispatcher'
      ) {
        navigate('/app/login?message=unauthorized', { replace: true });
      } else {
        setUser(currentUser);
        setIsAuthChecking(false);
      }
    });
    return unsubscribe;
  }, [navigate, setUser, setIsAuthChecking]);

  useEffect(() => {
    const unsub = getAdminConfigService().subscribeToSettings(
      (updated) => setSettings(updated),
      () => {}
    );
    getZoneService()
      .getZones()
      .then((loadedZones) => {
        if (loadedZones && loadedZones.length > 0) setDispatchZones(loadedZones);
      })
      .catch(() => {});
    return unsub;
  }, [setSettings, setDispatchZones]);

  // 4. Dispatcher Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditableTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.getAttribute('role') === 'textbox')
      );

      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          setIsSearchExpanded(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return;
      }

      if (e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'p' || key === 'c') {
          e.preventDefault();
          setCommsInitialTab('all');
          setCommsActiveTab('all');
          setActiveDockTab((prev) => (prev === 'phone' || prev === 'comms' ? 'none' : 'phone'));
        } else if (key === 'e') {
          e.preventDefault();
          setActiveDockTab((prev) => (prev === 'email' ? 'none' : 'email'));
        } else if (key === 'd') {
          e.preventDefault();
          setActiveDockTab((prev) => (prev === 'drivers' ? 'none' : 'drivers'));
        } else if (key === 'a') {
          e.preventDefault();
          setShowAlertsDropdown((prev) => !prev);
        }
        return;
      }

      if (isEditableTarget) return;

      if (e.key === '/') {
        e.preventDefault();
        setIsSearchExpanded(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (e.key === 'Escape') {
        setActiveDockTab('none');
        setIsMobileDrawerOpen(false);
        setShowAlertsDropdown(false);
        setShowDeviceSettingsMenu(false);
        setIsSearchExpanded(false);
      } else if (e.key === 'm' || e.key === 'M') {
        setActiveDockTab('none');
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'c' || e.key === 'C') {
        setCommsInitialTab('all');
        setCommsActiveTab('all');
        setActiveDockTab((prev) => (prev === 'phone' || prev === 'comms' ? 'none' : 'phone'));
      } else if (e.key === 'e' || e.key === 'E') {
        setActiveDockTab((prev) => (prev === 'email' ? 'none' : 'email'));
      } else if (e.key === 'd' || e.key === 'D') {
        setActiveDockTab((prev) => (prev === 'drivers' ? 'none' : 'drivers'));
      } else if (e.key === 'a' || e.key === 'A') {
        setShowAlertsDropdown((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 5. Cross-Window WorkspaceBus Sync
  useEffect(() => {
    const bus = getWorkspaceBus();
    const unsub = bus.subscribe((msg) => {
      if (msg.type === 'POPULATE_BOOKING') {
        populateActiveDraftFromPayload(msg.payload);
      } else if (msg.type === 'OPEN_EDIT_TRIP') {
        const payload = msg.payload;
        let found = payload.tripId ? trips.find((t) => t.id === payload.tripId) : undefined;
        if (!found && payload.phone) {
          const cleanTarget = payload.phone.replace(/\D/g, '').slice(-10);
          if (cleanTarget) {
            found = trips.find((t) => {
              const tp = (t.passenger?.phone || (t as any).passengerPhone || '')
                .replace(/\D/g, '')
                .slice(-10);
              return tp === cleanTarget;
            });
          }
        }
        if (found) {
          setSelectedQueueTripId(found.id);
          setSelectedMapTrip(found);
          setShouldZoomMap(true);
          onOpenEditTripRef.current(found);
          setActiveMobileTab('booking');
        }
      } else if (msg.type === 'UNREAD_COUNTS_CHANGED') {
        const payload = msg.payload;
        if (typeof payload.unreadMessages === 'number') {
          setUnreadMessagesCount(payload.unreadMessages);
        }
        if (typeof payload.missedCalls === 'number') {
          setMissedCallsCount(payload.missedCalls);
        }
      } else if (msg.type === 'INCOMING_CALL') {
        const payload = msg.payload;
        setIncomingCallAlert({ from: payload.from, callSid: payload.callSid });
      } else if (msg.type === 'INCOMING_CALL_DISMISSED') {
        setIncomingCallAlert(null);
      } else if (msg.type === 'FOCUS_TRIP_ON_MAP') {
        const found = trips.find((t) => t.id === msg.payload.tripId);
        if (found) {
          setSelectedMapTrip(found);
          setSelectedQueueTripId(found.id);
          setActiveMobileTab('map');
        }
      } else if (msg.type === 'DRIVER_TELEMETRY_PING') {
        const payload = msg.payload;
        if (payload?.tripId) {
          const ping = {
            coordinates: payload.coordinates,
            speedMph: payload.speedMph,
            heading: payload.heading,
            accuracy: payload.accuracy,
            timestamp: payload.timestamp,
            status: payload.status,
            isOfflineBuffer: payload.isOfflineBuffer,
          };
          setTrips((prev) =>
            prev.map((t) =>
              t.id === payload.tripId ? { ...t, driverTelemetry: ping, currentLocation: ping } : t
            )
          );
        }
      } else if (msg.type === 'CALL_OUTBOUND_STARTED') {
        setActiveCallStatus('connected');
        setActiveCallMeta({
          contactName: msg.payload.contactName || msg.payload.targetNumber,
          phoneNumber: msg.payload.targetNumber,
          duration: 0,
        });
      } else if (msg.type === 'CALL_ANSWERED') {
        setActiveCallStatus('connected');
        if (msg.payload.callerNumber) {
          setActiveCallMeta((prev) => ({
            contactName: prev?.contactName || msg.payload.callerNumber,
            phoneNumber: msg.payload.callerNumber,
            duration: prev?.duration || 0,
          }));
        }
      } else if (msg.type === 'CALL_INCOMING') {
        setActiveCallStatus('calling');
        setActiveCallMeta({
          contactName: msg.payload.callerName || msg.payload.callerNumber,
          phoneNumber: msg.payload.callerNumber,
          duration: 0,
        });
      } else if (msg.type === 'CALL_ENDED') {
        setActiveCallStatus('idle');
        setActiveCallMeta(null);
        setCallDuration(0);
      } else if (msg.type === 'OPEN_COMMS_THREAD') {
        setActiveDockTab('comms');
        setCommsInitialTab('messages');
        setActiveMobileTab('comms');
      } else if (msg.type === 'OPEN_EMAIL_MESSAGE') {
        setActiveDockTab('email');
        setActiveMobileTab('email');
      } else if (msg.type === 'FOCUS_MODULE') {
        if (msg.payload?.moduleKey === 'email') {
          setActiveDockTab('email');
          setActiveMobileTab('email');
        } else if (msg.payload?.moduleKey === 'comms') {
          setActiveDockTab('comms');
          setActiveMobileTab('comms');
        }
      } else if (msg.type === 'EMAIL_STATE_CHANGED') {
        if (typeof msg.payload?.unreadCount === 'number') {
          setUnreadEmailCount(msg.payload.unreadCount);
        }
      }
    });
    return unsub;
  }, [trips, populateActiveDraftFromPayload]);

  // 6. Email service subscription, call duration timer & real-time trips subscription
  useEffect(() => {
    const emailSvc = getDispatchEmailService();
    const unsubEmails = emailSvc.subscribe((snap) => {
      setUnreadEmailCount(snap.counts.totalUnread);
    });
    void emailSvc.syncWithServer({ seedSamplesIfOfflineEmpty: true });
    return () => unsubEmails();
  }, [setUnreadEmailCount]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (activeCallStatus === 'connected') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
        setActiveCallMeta((prev) => (prev ? { ...prev, duration: prev.duration + 1 } : null));
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeCallStatus, setCallDuration, setActiveCallMeta]);

  useEffect(() => {
    const service = getBookingService();
    const handleTripsUpdate = (updatedTrips: Trip[]) => {
      if (knownTripIdsRef.current === null) {
        knownTripIdsRef.current = new Set(updatedTrips.map((t) => t.id));
        setTrips(updatedTrips);
        return;
      }

      const newTrips = updatedTrips.filter((t) => !knownTripIdsRef.current!.has(t.id));
      if (newTrips.length > 0) {
        const urgentNewTrips = newTrips.filter(
          (t) =>
            t.bookingType === 'asap' ||
            t.status === 'unconfirmed' ||
            t.status === 'UNCONFIRMED' ||
            t.status === 'pending'
        );
        if (urgentNewTrips.length > 0) {
          soundNotificationService.playAsapRideChime();
          const alertInput = formatDispatchNewRideAlert(urgentNewTrips);
          void pushNotificationService.notifyDispatchAlert(alertInput, { requireHidden: true });
        }
        newTrips.forEach((t) => knownTripIdsRef.current!.add(t.id));

        if (autoOfferContextRef.current.autoOfferOnConfirm) {
          for (const nt of newTrips) {
            if (
              !autoOfferStartedIdsRef.current.has(nt.id) &&
              autoOfferContextRef.current.isEligibleForAutoPilot(nt)
            ) {
              void autoOfferContextRef.current.handleStartAutoOffer(nt);
            }
          }
        }
      }

      setTrips(updatedTrips);
    };

    if (service.subscribeToAllTrips) {
      return service.subscribeToAllTrips(handleTripsUpdate, (err) =>
        console.error('[Dispatch] Trips subscription error:', err)
      );
    } else if (service.getAllTrips) {
      service.getAllTrips().then(handleTripsUpdate).catch(console.error);
    }
  }, [setTrips, autoOfferContextRef, autoOfferStartedIdsRef]);

  useEffect(() => {
    setSelectedMapTrip(null);
    setShouldZoomMap(false);
  }, [activeDraftId, setSelectedMapTrip, setShouldZoomMap]);
}
