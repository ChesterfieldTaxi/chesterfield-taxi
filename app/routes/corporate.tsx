import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { COMPANY_CONFIG } from '../config/companyConfig';
import {
  getAdminAuthService,
  type AdminUser,
} from '../core/services/auth/admin-auth.service';
import { getAdminConfigService } from '../core/services/config/admin-config.service';
import {
  getCorporatePortalService,
  type CorporateDashboardSummary,
} from '../core/services/corporate-portal.service';
import { getPayLinkService } from '../core/services/payments/pay-link.service';
import {
  normalizeCorporatePortalPolicy,
  type CorporateAccountConfig,
  type CorporateAuthorizedRider,
  type CorporatePortalGovernanceConfig,
  type CorporateSavedLocation,
  type InvoiceRecord,
} from '../core/types/config';
import type { PrintableInvoiceData } from '../core/types/invoicing';
import type { Trip } from '../core/types/trip';
import { getEffectiveRoles } from '../core/utils/workspace-routing.util';
import {
  BookingEngineV2,
  formatUsPhone,
  type BookingEngineV2InitialValues,
  type CorporatePortalBookingContext,
} from '../components/domain/BookingEngineV2';
import { DispatchLocationInput } from '../components/domain/dispatch/DispatchLocationInput';
import { RoleViewSwitcher } from '../components/domain/common/RoleViewSwitcher';
import { UserDropdown } from '../components/domain/common/UserDropdown';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import {
  AlertTriangleIcon,
  BuildingIcon,
  CarIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CreditCardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HistoryIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  PlaneIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from '../components/ui/Icons';

export function meta() {
  return [
    { title: `Corporate Portal – ${COMPANY_CONFIG.name}` },
    {
      name: 'description',
      content:
        'Executive B2B self-service portal for corporate rides, employee travel booking, PO security, and statements.',
    },
  ];
}

type CorporateTabKey = 'overview' | 'book' | 'team' | 'billing';
type RideFilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const DEFAULT_AIRPORT_SHORTCUTS: CorporateSavedLocation[] = [
  {
    id: 'default-stl-t1',
    label: 'Lambert STL (Terminal 1)',
    address: '10701 Lambert International Blvd, St. Louis, MO 63145',
    notes: 'Terminal 1 Commercial Ground Transport - Exit Door 12',
  },
  {
    id: 'default-stl-t2',
    label: 'Lambert STL (Terminal 2 / Southwest)',
    address: '10701 Lambert International Blvd Terminal 2, St. Louis, MO 63145',
    notes: 'Terminal 2 Baggage Claim Exit Door 12',
  },
  {
    id: 'default-sus-fbo',
    label: 'Spirit of St. Louis Airport (SUS)',
    address: '18270 Edison Ave, Chesterfield, MO 63005',
    notes: 'Main Terminal / FBO Ramp',
  },
];

function formatRideStatusBadge(status: string): {
  label: string;
  className: string;
} {
  const s = (status || '').toLowerCase();
  if (s === 'in_progress') {
    return {
      label: 'In Progress',
      className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
  }
  if (s === 'arrived') {
    return {
      label: 'Driver Arrived',
      className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }
  if (s === 'en_route') {
    return {
      label: 'En Route',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }
  if (s === 'assigned' || s === 'accepted' || s === 'offered') {
    return {
      label: 'Driver Assigned',
      className: 'bg-sky-100 text-sky-800 border-sky-200',
    };
  }
  if (s === 'confirmed') {
    return {
      label: 'Confirmed',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (s === 'unconfirmed' || s === 'pending') {
    return {
      label: 'Pending Dispatch',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (s === 'completed') {
    return {
      label: 'Completed',
      className: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }
  if (s === 'cancelled' || s === 'declined') {
    return {
      label: 'Cancelled',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  return {
    label: status || 'Scheduled',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function formatInvoiceStatusPill(status: InvoiceRecord['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'paid':
      return {
        label: 'Paid',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'overdue':
      return {
        label: 'Overdue',
        className: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    case 'draft':
      return {
        label: 'Draft',
        className: 'bg-slate-100 text-slate-600 border-slate-200',
      };
    case 'issued':
    default:
      return {
        label: 'Unpaid',
        className: 'bg-amber-100 text-amber-900 border-amber-200',
      };
  }
}

export default function CorporatePortalRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const portalService = getCorporatePortalService();
  const payLinkService = getPayLinkService();

  // Auth & Tenant Context
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAdminSuperuser, setIsAdminSuperuser] = useState(false);
  const [adminAccountsList, setAdminAccountsList] = useState<CorporateAccountConfig[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Portal Navigation & Data State
  const initialTab = (searchParams.get('tab') as CorporateTabKey) || 'overview';
  const [activeTab, setActiveTab] = useState<CorporateTabKey>(
    ['overview', 'book', 'team', 'billing'].includes(initialTab) ? initialTab : 'overview'
  );
  const [summary, setSummary] = useState<CorporateDashboardSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Overview Rides Filter & Search
  const [rideFilter, setRideFilter] = useState<RideFilterKey>('all');
  const [rideSearch, setRideSearch] = useState('');
  const [copiedPoBadge, setCopiedPoBadge] = useState(false);

  // Tab 2: Book Company Ride Prefill State
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>('');
  const [bookingInitialValues, setBookingInitialValues] = useState<BookingEngineV2InitialValues>({
    paymentMethod: 'account',
    timingType: 'later',
  });

  // Tab 3: Team, Locations & PO Security Form State
  const [poRotationReason, setPoRotationReason] = useState(
    'Scheduled anti-fraud PO rotation via Corporate Portal'
  );
  const [isRotatingPo, setIsRotatingPo] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderEmail, setNewRiderEmail] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderDept, setNewRiderDept] = useState('');
  const [newRiderVip, setNewRiderVip] = useState(false);

  const [newBookerEmail, setNewBookerEmail] = useState('');
  const [newCostCenterTag, setNewCostCenterTag] = useState('');

  const [newPlaceLabel, setNewPlaceLabel] = useState('');
  const [newPlaceAddress, setNewPlaceAddress] = useState('');
  const [newPlaceNotes, setNewPlaceNotes] = useState('');

  // Tab 4: Statements & Billing Modal / Pay Link State
  const [selectedStatement, setSelectedStatement] = useState<InvoiceRecord | null>(null);
  const [printableStatement, setPrintableStatement] = useState<PrintableInvoiceData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

  const companySettings = useMemo(
    () => getAdminConfigService().getCachedSettings().company,
    []
  );
  const [portalPolicy, setPortalPolicy] = useState<CorporatePortalGovernanceConfig>(() =>
    normalizeCorporatePortalPolicy(getAdminConfigService().getCachedSettings().corporatePortalPolicy)
  );

  useEffect(() => {
    const configSvc = getAdminConfigService();
    return configSvc.subscribeToSettings((nextSettings) => {
      setPortalPolicy(normalizeCorporatePortalPolicy(nextSettings.corporatePortalPolicy));
    });
  }, []);

  const canManageRiders = isAdminSuperuser || portalPolicy.allowSelfManageRiders;
  const canManageLocations = isAdminSuperuser || portalPolicy.allowSelfManageSavedLocations;

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const handleSelectTab = useCallback(
    (tab: CorporateTabKey) => {
      setActiveTab(tab);
      const next = new URLSearchParams(searchParams);
      if (tab === 'overview') {
        next.delete('tab');
      } else {
        next.set('tab', tab);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // 1. Strict Route Authentication & Tenant Guard
  useEffect(() => {
    const authService = getAdminAuthService();
    const unsub = authService.onAuthStateChanged(async (user) => {
      if (!user) {
        navigate('/app/login?message=unauthenticated&redirect=/app/corporate', {
          replace: true,
        });
        return;
      }

      const roles = getEffectiveRoles(user);
      const adminFlag = roles.includes('admin');
      const corpManagerFlag = roles.includes('corporate_manager');

      if (!adminFlag && !corpManagerFlag) {
        navigate('/app/login?message=unauthorized', { replace: true });
        return;
      }

      setCurrentUser(user);
      setIsAdminSuperuser(adminFlag);

      if (adminFlag) {
        const accounts = await portalService.listCorporateAccountsForAdmin().catch(() => []);
        setAdminAccountsList(accounts);
        const paramAcct = searchParams.get('accountId') || '';
        const resolvedDefault =
          (paramAcct && accounts.some((a) => a.id === paramAcct) ? paramAcct : '') ||
          user.corporateAccountId ||
          accounts.find((a) => a.isActive)?.id ||
          accounts[0]?.id ||
          '';
        setSelectedAccountId(resolvedDefault);
      } else {
        // Strictly lock non-admin corporate_manager to their own assigned corporateAccountId!
        setSelectedAccountId(user.corporateAccountId || '');
      }

      setIsAuthChecking(false);
    });

    return unsub;
  }, [navigate, portalService, searchParams]);

  // 2. Load Tenant-Scoped Dashboard Summary
  const refreshPortalData = useCallback(
    async (targetId?: string) => {
      const accountIdToLoad = (targetId ?? selectedAccountId).trim();
      if (!accountIdToLoad) {
        setSummary(null);
        setIsLoadingSummary(false);
        return;
      }

      setIsLoadingSummary(true);
      setLoadError(null);
      try {
        const data = await portalService.getCorporateDashboardSummary(accountIdToLoad);
        setSummary(data);
        setSelectedCostCenter((prev) => prev || data.account.costCenters?.[0] || '');
      } catch (err: any) {
        setLoadError(err?.message || 'Unable to load corporate account dashboard.');
      } finally {
        setIsLoadingSummary(false);
      }
    },
    [portalService, selectedAccountId]
  );

  useEffect(() => {
    if (!isAuthChecking && selectedAccountId) {
      refreshPortalData(selectedAccountId);
    } else if (!isAuthChecking && !selectedAccountId) {
      setIsLoadingSummary(false);
    }
  }, [isAuthChecking, selectedAccountId, refreshPortalData]);

  const handleSignOut = async () => {
    try {
      await getAdminAuthService().signOut();
    } catch {}
    navigate('/app/login?message=logged_out', { replace: true });
  };

  // Pre-verified corporate booking context for BookingEngineV2
  const corporateBookingContext = useMemo<CorporatePortalBookingContext | undefined>(() => {
    if (!summary?.account) return undefined;
    const acc = summary.account;
    return {
      corporateAccountId: acc.id,
      companyName: acc.companyName,
      accountNumber: acc.accountNumber,
      billingCycle: acc.billingCycle,
      discountPercent: acc.discountPercent,
      currentPoNumber: acc.currentPoNumber,
      poRequired: acc.poRequired,
      poFormatRegex: portalPolicy.poFormatRegex,
      creditLimit: acc.creditLimit,
      currentExposure: summary.totalExposure,
      creditLimitEnforcement: portalPolicy.creditLimitEnforcement,
      costCenter: selectedCostCenter || undefined,
      bookerName: currentUser?.displayName || acc.billingContactName || undefined,
      bookerEmail: currentUser?.email || acc.billingContactEmail || undefined,
    };
  }, [summary?.account, summary?.totalExposure, portalPolicy, selectedCostCenter, currentUser]);

  // Quick-fill Location Shortcuts (Saved Company Places + STL/SUS Airport defaults)
  const quickLocations = useMemo<CorporateSavedLocation[]>(() => {
    const custom = summary?.account.savedCompanyLocations || [];
    const existingAddresses = new Set(custom.map((c) => c.address.toLowerCase()));
    const extras = DEFAULT_AIRPORT_SHORTCUTS.filter(
      (d) => !existingAddresses.has(d.address.toLowerCase())
    );
    return [...custom, ...extras];
  }, [summary?.account.savedCompanyLocations]);

  // Filtered Company Rides
  const filteredRides = useMemo<Trip[]>(() => {
    const all = summary?.allTrips || [];
    const activeIds = new Set((summary?.activeRides || []).map((t) => t.id));
    return all.filter((trip) => {
      if (rideFilter === 'active' && !activeIds.has(trip.id)) return false;
      if (rideFilter === 'completed' && trip.status !== 'completed') return false;
      if (
        rideFilter === 'cancelled' &&
        trip.status !== 'cancelled' &&
        trip.status !== 'DECLINED' &&
        trip.status !== 'declined'
      ) {
        return false;
      }

      if (!rideSearch.trim()) return true;
      const q = rideSearch.toLowerCase();
      const meta = (trip.metadata || {}) as Record<string, any>;
      const paxName = `${trip.passenger?.firstName || ''} ${trip.passenger?.lastName || ''}`
        .trim()
        .toLowerCase();
      const po = String(meta.billingPo || meta.corporateDetails?.billingPo || '').toLowerCase();
      const cc = String(meta.costCenter || meta.department || '').toLowerCase();
      return (
        trip.id.toLowerCase().includes(q) ||
        paxName.includes(q) ||
        po.includes(q) ||
        cc.includes(q) ||
        (trip.pickupLocation?.address || '').toLowerCase().includes(q) ||
        (trip.dropoffLocation?.address || '').toLowerCase().includes(q)
      );
    });
  }, [summary?.allTrips, summary?.activeRides, rideFilter, rideSearch]);

  // ─── Actions: Rider / Location Quick-Fill for Tab 2 ───
  const handleSelectAuthorizedRider = (rider: CorporateAuthorizedRider | null) => {
    if (!rider) {
      setSelectedRiderId('');
      setBookingInitialValues((prev) => ({
        ...prev,
        passengerName: '',
        passengerEmail: '',
        passengerPhone: '',
        isBookerDifferent: false,
      }));
      return;
    }

    setSelectedRiderId(rider.id);
    if (rider.department) {
      setSelectedCostCenter(rider.department);
    }

    const bookerEmail = currentUser?.email || summary?.account.billingContactEmail || '';
    const isSomeoneElse = Boolean(
      rider.email && bookerEmail && rider.email.toLowerCase() !== bookerEmail.toLowerCase()
    );

    setBookingInitialValues((prev) => ({
      ...prev,
      paymentMethod: 'account',
      passengerName: rider.name,
      passengerEmail: rider.email || bookerEmail,
      passengerPhone: rider.phone || summary?.account.billingContactPhone || '',
      costCenter: rider.department || selectedCostCenter,
      isBookerDifferent: isSomeoneElse,
      contactName: isSomeoneElse
        ? currentUser?.displayName || summary?.account.billingContactName || 'Corporate Travel Desk'
        : '',
      contactEmail: isSomeoneElse ? bookerEmail : '',
      contactPhone: isSomeoneElse ? summary?.account.billingContactPhone || '' : '',
      contactRole: isSomeoneElse ? 'Corporate Travel Coordinator' : '',
    }));
  };

  const handleApplySavedLocation = (
    loc: CorporateSavedLocation,
    target: 'pickup' | 'dropoff'
  ) => {
    setBookingInitialValues((prev) => ({
      ...prev,
      ...(target === 'pickup'
        ? {
            pickupAddress: loc.address,
            driverNotes: loc.notes ? `[Pickup: ${loc.notes}]` : prev.driverNotes,
          }
        : {
            dropoffAddress: loc.address,
          }),
    }));
  };

  // ─── Actions: Team, Locations, Cost Centers & PO Rotation (Tab 3) ───
  const handleRotatePo = async () => {
    if (!summary?.account) return;
    setIsRotatingPo(true);
    try {
      const res = await portalService.rotateCorporatePoSelfService(
        summary.account.id,
        poRotationReason,
        currentUser?.email || summary.account.billingContactEmail
      );
      setSummary((prev) => (prev ? { ...prev, account: res.account } : null));
      showToast(
        'success',
        `Active PO rotated to ${res.newPo}${
          res.oldPo ? ` (previous PO ${res.oldPo} archived & blocked from reuse)` : ''
        }.`
      );
    } catch (err: any) {
      showToast('error', err?.message || 'Failed to rotate corporate PO number.');
    } finally {
      setIsRotatingPo(false);
    }
  };

  const handleAddRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary?.account || !newRiderName.trim()) return;
    setIsSavingSettings(true);
    try {
      const nextRider: CorporateAuthorizedRider = {
        id: `rider-${Date.now().toString(36)}`,
        name: newRiderName.trim(),
        email: newRiderEmail.trim() || undefined,
        phone: newRiderPhone.trim() || undefined,
        department: newRiderDept.trim() || undefined,
        isVip: newRiderVip,
      };
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          authorizedRiders: [...(summary.account.authorizedRiders || []), nextRider],
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      setNewRiderName('');
      setNewRiderEmail('');
      setNewRiderPhone('');
      setNewRiderDept('');
      setNewRiderVip(false);
      showToast('success', `Added ${nextRider.name} to Authorized Riders.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save authorized rider.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRemoveRider = async (riderId: string) => {
    if (!summary?.account) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          authorizedRiders: (summary.account.authorizedRiders || []).filter(
            (r) => r.id !== riderId
          ),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      showToast('success', 'Authorized rider removed.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to remove rider.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddBooker = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newBookerEmail.trim().toLowerCase();
    if (!summary?.account || !email) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          authorizedBookers: Array.from(
            new Set([...(summary.account.authorizedBookers || []), email])
          ),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      setNewBookerEmail('');
      showToast('success', `Added ${email} as an authorized travel booker.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update authorized bookers.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRemoveBooker = async (email: string) => {
    if (!summary?.account) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          authorizedBookers: (summary.account.authorizedBookers || []).filter(
            (b) => b.toLowerCase() !== email.toLowerCase()
          ),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      showToast('success', `Removed ${email} from authorized bookers.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to update authorized bookers.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newCostCenterTag.trim().toUpperCase();
    if (!summary?.account || !tag) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          costCenters: Array.from(new Set([...(summary.account.costCenters || []), tag])),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      setNewCostCenterTag('');
      if (!selectedCostCenter) setSelectedCostCenter(tag);
      showToast('success', `Cost center "${tag}" added.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save cost center.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRemoveCostCenter = async (tag: string) => {
    if (!summary?.account) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          costCenters: (summary.account.costCenters || []).filter((c) => c !== tag),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      showToast('success', `Cost center "${tag}" removed.`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to remove cost center.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAddSavedPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary?.account || !newPlaceLabel.trim() || !newPlaceAddress.trim()) return;
    setIsSavingSettings(true);
    try {
      const nextLoc: CorporateSavedLocation = {
        id: `loc-${Date.now().toString(36)}`,
        label: newPlaceLabel.trim(),
        address: newPlaceAddress.trim(),
        notes: newPlaceNotes.trim() || undefined,
      };
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          savedCompanyLocations: [
            ...(summary.account.savedCompanyLocations || []),
            nextLoc,
          ],
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      setNewPlaceLabel('');
      setNewPlaceAddress('');
      setNewPlaceNotes('');
      showToast('success', `Saved company location "${nextLoc.label}".`);
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to save company location.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleRemoveSavedPlace = async (locId: string) => {
    if (!summary?.account) return;
    setIsSavingSettings(true);
    try {
      const updated = await portalService.updateCorporateTeamAndSettings(
        summary.account.id,
        {
          savedCompanyLocations: (summary.account.savedCompanyLocations || []).filter(
            (l) => l.id !== locId
          ),
        },
        currentUser?.email || undefined
      );
      setSummary((prev) => (prev ? { ...prev, account: updated } : null));
      showToast('success', 'Company saved location removed.');
    } catch (err: any) {
      showToast('error', err?.message || 'Unable to remove company location.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ─── Actions: Statements, CSV Export & 1-Tap Pay Link (Tab 4) ───
  const handleExportRidesCsv = () => {
    if (!summary?.account) return;
    const res = portalService.downloadCorporateTripsCsv(summary.allTrips, summary.account);
    showToast(
      'success',
      `Exported ${res.rowCount} corporate trip record(s) (${res.fileName}).`
    );
  };

  const handleOpenStatementModal = async (invoice: InvoiceRecord) => {
    if (!summary?.account) return;
    setSelectedStatement(invoice);
    setIsLoadingStatement(true);
    try {
      const printable = await portalService.getCorporatePrintableInvoice(
        summary.account.id,
        invoice.id
      );
      setPrintableStatement(printable);
    } catch {
      setPrintableStatement(null);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  const handlePayInvoiceNow = async (invoice: InvoiceRecord) => {
    setPayingInvoiceId(invoice.id);
    try {
      const res = await payLinkService.createOrGetInvoicePayLink(invoice);
      if (!res.success || !res.payToken) {
        showToast('error', res.error || 'Unable to initialize secure payment link.');
        return;
      }

      // Update local state with cached payToken
      const payUrl = res.payUrl || payLinkService.buildPayUrl(res.payToken);
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              invoices: prev.invoices.map((i) =>
                i.id === invoice.id
                  ? { ...i, payToken: res.payToken, payLinkUrl: payUrl }
                  : i
              ),
            }
          : null
      );

      navigate(`/pay/${encodeURIComponent(res.payToken)}`);
    } catch (err: any) {
      showToast('error', err?.message || 'Network error generating invoice checkout link.');
    } finally {
      setPayingInvoiceId(null);
    }
  };

  // ─── Loading & Unbound Account States ───
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 gap-3">
        <SpinnerIcon className="w-8 h-8 animate-spin text-indigo-400" />
        <p className="text-xs font-semibold text-slate-400 tracking-wide">
          Verifying Corporate Portal credentials...
        </p>
      </div>
    );
  }

  if (!selectedAccountId && !isLoadingSummary) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Card className="max-w-md w-full border border-slate-200 shadow-lg rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mx-auto">
            <BuildingIcon className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-extrabold text-slate-900">
              Corporate Account Pending Assignment
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your profile ({currentUser?.email}) is enabled as a Corporate Manager, but has not yet
              been linked to a Corporate Account ID. Please contact Chesterfield Taxi Corporate
              Billing to finalize account binding.
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="font-bold text-slate-800">24/7 Corporate Support Desk</div>
            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="font-mono font-bold text-indigo-600 hover:underline block"
            >
              {COMPANY_CONFIG.phone.dispatch}
            </a>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="w-full font-bold">
            Sign Out
          </Button>
        </Card>
      </div>
    );
  }

  const account = summary?.account;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Executive Slate/Indigo Header ─── */}
      <header className="sticky top-0 z-40 bg-slate-950 text-white border-b border-slate-800 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/app/corporate" className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-500/30">
                <BuildingIcon className="w-5 h-5" />
              </div>
              <div className="hidden sm:block">
                <div className="text-sm font-extrabold tracking-tight leading-none text-white">
                  {companySettings?.name || COMPANY_CONFIG.name}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mt-0.5">
                  Corporate Travel Portal
                </div>
              </div>
            </Link>

            {account && (
              <div className="hidden md:flex items-center gap-2 pl-3 ml-1 border-l border-slate-800 min-w-0">
                <span className="text-xs font-bold text-slate-100 truncate max-w-[220px]">
                  {account.companyName}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-950/90 text-indigo-300 border border-indigo-800/80 shrink-0">
                  {account.accountNumber}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Superuser Admin Account Preview Selector */}
            {isAdminSuperuser && adminAccountsList.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-indigo-500/40 rounded-xl px-2.5 py-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 hidden lg:inline">
                  Admin Preview:
                </span>
                <select
                  aria-label="Admin Corporate Account Preview Selector"
                  value={selectedAccountId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedAccountId(nextId);
                    setSelectedRiderId('');
                    setSelectedCostCenter('');
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set('accountId', nextId);
                    setSearchParams(nextParams, { replace: true });
                  }}
                  className="bg-transparent text-xs font-bold text-white focus:outline-hidden max-w-[160px] sm:max-w-[230px] truncate cursor-pointer"
                >
                  {adminAccountsList.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                      {acc.companyName} ({acc.accountNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <a
              href={`tel:${COMPANY_CONFIG.phone.primaryRaw}`}
              className="hidden xl:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition-colors"
            >
              <PhoneIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>{COMPANY_CONFIG.phone.dispatch}</span>
            </a>

            <RoleViewSwitcher currentView="corporate" user={currentUser} variant="dark" />
            <UserDropdown
              email={currentUser?.email}
              onSignOut={handleSignOut}
              variant="dark"
              currentView="corporate"
            />
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="bg-slate-900/95 border-t border-slate-800/90">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto no-scrollbar py-1.5">
            {(
              [
                {
                  id: 'overview' as const,
                  label: 'Overview & Live Rides',
                  shortLabel: 'Overview',
                  icon: CarIcon,
                  badge: summary?.activeRides.length || undefined,
                },
                {
                  id: 'book' as const,
                  label: 'Book Company Ride',
                  shortLabel: 'Book Ride',
                  icon: PlusIcon,
                  badge: undefined,
                },
                {
                  id: 'team' as const,
                  label: 'Team, Locations & PO Security',
                  shortLabel: 'Team & PO',
                  icon: ShieldCheckIcon,
                  badge: undefined,
                },
                {
                  id: 'billing' as const,
                  label: 'Statements & Billing',
                  shortLabel: 'Statements',
                  icon: FileTextIcon,
                  badge: summary?.openInvoiceCount || undefined,
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  {tab.badge ? (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ─── Main Workspace Content ─── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 print:hidden">
        {feedbackBanner && (
          <div
            role="status"
            className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 shadow-xs ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackBanner.type === 'success' ? (
                <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedbackBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {loadError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between gap-3">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => refreshPortalData()}>
              Retry
            </Button>
          </div>
        )}

        {isLoadingSummary || !summary || !account ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-16 flex flex-col items-center justify-center gap-3">
            <SpinnerIcon className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold text-slate-500">
              Loading corporate account telemetry &amp; billing statements...
            </span>
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════════════════════
                TAB 1: OVERVIEW & LIVE RIDES
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Executive Summary Strip */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-lg sm:text-xl font-black text-slate-950">
                        {account.companyName}
                      </h1>
                      <Badge variant={account.isActive ? 'success' : 'warning'} size="sm">
                        {account.isActive ? 'Active Contract' : 'Account Paused'}
                      </Badge>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {account.accountNumber}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Terms: <strong className="text-slate-700">{account.billingCycle.toUpperCase()}</strong>
                      {account.discountPercent > 0 && (
                        <>
                          {' '}
                          • Corporate Contract Discount:{' '}
                          <strong className="text-emerald-700">{account.discountPercent}%</strong>
                        </>
                      )}{' '}
                      • Billing Contact: <span className="text-slate-700">{account.billingContactEmail}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refreshPortalData()}
                      leftIcon={<RefreshCwIcon className="w-3.5 h-3.5" />}
                      className="text-xs font-bold cursor-pointer"
                    >
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => handleSelectTab('book')}
                      leftIcon={<PlusIcon className="w-4 h-4" />}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Book Company Ride
                    </Button>
                  </div>
                </div>

                {/* Open Invoices Urgent Banner */}
                {summary.openInvoiceCount > 0 && (
                  <div
                    className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      summary.overdueInvoiceCount > 0
                        ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                        : 'bg-amber-50/90 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          summary.overdueInvoiceCount > 0
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        <CreditCardIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold uppercase tracking-wider">
                          {summary.overdueInvoiceCount > 0
                            ? `${summary.overdueInvoiceCount} Overdue Corporate Statement(s)`
                            : `${summary.openInvoiceCount} Open Corporate Statement(s) Ready for Settlement`}
                        </div>
                        <p className="text-xs mt-0.5 opacity-90">
                          Total open invoiced balance:{' '}
                          <strong className="font-mono">
                            ${summary.openInvoiceBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </strong>
                          . Settle online in 1 tap via Card, Apple Pay, or Google Pay.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      onClick={() => handleSelectTab('billing')}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      View &amp; Pay Statements &rarr;
                    </Button>
                  </div>
                )}

                {/* 4 KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* 1. Credit Limit Utilization Meter */}
                  <Card className="border border-slate-200/90 shadow-2xs">
                    <CardContent className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                          Credit Utilization
                        </span>
                        <span
                          className={`text-[11px] font-mono font-black px-2 py-0.5 rounded-full border ${
                            summary.utilizationLevel === 'critical'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : summary.utilizationLevel === 'warning'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {summary.creditUtilizationPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xl font-black text-slate-950 font-mono">
                        ${summary.totalExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        <span className="text-xs font-semibold text-slate-400">
                          {' '}
                          / ${summary.creditLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            summary.utilizationLevel === 'critical'
                              ? 'bg-rose-600'
                              : summary.utilizationLevel === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(2, summary.creditUtilizationPercent))}%`,
                          }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Available Credit:</span>
                        <span className="font-mono font-bold text-slate-800">
                          ${summary.availableCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 2. Unbilled Cycle Spend */}
                  <Card className="border border-slate-200/90 shadow-2xs">
                    <CardContent className="p-4 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                        Unbilled Cycle Spend
                      </span>
                      <div className="text-xl font-black text-slate-950 font-mono">
                        ${summary.unbilledSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        <strong className="text-slate-800">{summary.completedCycleRides.length}</strong>{' '}
                        completed ride(s) in current {account.billingCycle.toUpperCase()} window
                      </p>
                    </CardContent>
                  </Card>

                  {/* 3. Live & Upcoming Rides */}
                  <Card className="border border-slate-200/90 shadow-2xs">
                    <CardContent className="p-4 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                        Live &amp; Upcoming Rides
                      </span>
                      <div className="text-xl font-black text-indigo-700 font-mono">
                        {summary.activeRides.length}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Total historical company trips:{' '}
                        <strong className="text-slate-800">{summary.allTrips.length}</strong>
                      </p>
                    </CardContent>
                  </Card>

                  {/* 4. Active PO Authorization Badge */}
                  <Card className="border border-indigo-200/90 bg-indigo-50/40 shadow-2xs">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-900">
                          Active PO Code
                        </span>
                        <span
                          className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            account.poRequired
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {account.poRequired ? 'PO Enforced' : 'PO Optional'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-indigo-200">
                        <span className="font-mono font-black text-xs text-slate-900 truncate">
                          {account.currentPoNumber || 'Not Configured'}
                        </span>
                        {account.currentPoNumber && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(account.currentPoNumber!);
                              setCopiedPoBadge(true);
                              setTimeout(() => setCopiedPoBadge(false), 2000);
                            }}
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            {copiedPoBadge ? (
                              <>
                                <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700">Copied</span>
                              </>
                            ) : (
                              <>
                                <CopyIcon className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectTab('team')}
                        className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
                      >
                        Rotate PO or view audit log &rarr;
                      </button>
                    </CardContent>
                  </Card>
                </div>

                {/* Company Rides Table & Mobile Cards */}
                <Card className="border border-slate-200/90 shadow-2xs overflow-hidden">
                  <CardHeader className="border-b border-slate-100 pb-3">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-sm font-black text-slate-900">
                          Company Transportation Log &amp; Live Tracking
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Real-time status for employee &amp; guest reservations billed to{' '}
                          {account.accountNumber}
                        </CardDescription>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 sm:flex-initial sm:w-56">
                          <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={rideSearch}
                            onChange={(e) => setRideSearch(e.target.value)}
                            placeholder="Search traveler, PO#, route..."
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden focus:border-indigo-500"
                          />
                        </div>

                        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
                          {(
                            [
                              { id: 'all', label: 'All' },
                              { id: 'active', label: 'Live' },
                              { id: 'completed', label: 'Completed' },
                              { id: 'cancelled', label: 'Cancelled' },
                            ] as const
                          ).map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => setRideFilter(f.id)}
                              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                                rideFilter === f.id
                                  ? 'bg-white text-slate-900 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleExportRidesCsv}
                          leftIcon={<DownloadIcon className="w-3.5 h-3.5" />}
                          className="text-xs font-bold cursor-pointer"
                        >
                          Export CSV
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {filteredRides.length === 0 ? (
                      <div className="p-12 text-center space-y-3">
                        <CarIcon className="w-8 h-8 text-slate-300 mx-auto" />
                        <div>
                          <p className="text-sm font-bold text-slate-700">
                            No company rides match this view
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Book an executive airport transfer or employee shuttle directly onto{' '}
                            {account.accountNumber}.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => handleSelectTab('book')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Book Company Ride
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              <tr>
                                <th className="px-4 py-3">Pickup Schedule</th>
                                <th className="px-4 py-3">Traveler &amp; Cost Center</th>
                                <th className="px-4 py-3">Route</th>
                                <th className="px-4 py-3">PO #</th>
                                <th className="px-4 py-3 text-right">Fare</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Live Tracking</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredRides.map((trip) => {
                                const meta = (trip.metadata || {}) as Record<string, any>;
                                const statusBadge = formatRideStatusBadge(trip.status);
                                const traveler =
                                  [trip.passenger?.firstName, trip.passenger?.lastName]
                                    .filter(Boolean)
                                    .join(' ') || 'Corporate Traveler';
                                const costCenter =
                                  meta.costCenter ||
                                  meta.department ||
                                  meta.corporateDetails?.costCenter ||
                                  'General';
                                const poNum =
                                  meta.billingPo ||
                                  meta.corporateDetails?.billingPo ||
                                  (account.poRequired ? account.currentPoNumber : '—');
                                const trackHref = trip.trackingToken
                                  ? `/track/${encodeURIComponent(trip.trackingToken)}`
                                  : `/booking/status/${encodeURIComponent(trip.id)}`;
                                const dateRaw =
                                  trip.scheduledPickupTime || trip.actualPickupTime || trip.createdAt;

                                return (
                                  <tr key={trip.id} className="hover:bg-slate-50/70">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <div className="font-bold text-slate-900">
                                        {dateRaw ? new Date(dateRaw).toLocaleDateString() : 'ASAP'}
                                      </div>
                                      <div className="text-[11px] font-mono text-slate-500">
                                        #{trip.id.slice(-8).toUpperCase()}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="font-bold text-slate-900">{traveler}</div>
                                      <span className="inline-block text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 mt-0.5">
                                        {costCenter}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                      <div className="truncate font-medium text-slate-800">
                                        {trip.pickupLocation?.address}
                                      </div>
                                      <div className="truncate text-[11px] text-slate-500">
                                        &rarr; {trip.dropoffLocation?.address}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                                      {poNum || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                      ${Number(trip.pricing?.totalFare || 0).toFixed(2)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span
                                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.className}`}
                                      >
                                        {statusBadge.label}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right whitespace-nowrap">
                                      <Link
                                        to={trackHref}
                                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                                      >
                                        <span>Track</span>
                                        <ExternalLinkIcon className="w-3.5 h-3.5" />
                                      </Link>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="md:hidden divide-y divide-slate-100">
                          {filteredRides.map((trip) => {
                            const meta = (trip.metadata || {}) as Record<string, any>;
                            const statusBadge = formatRideStatusBadge(trip.status);
                            const traveler =
                              [trip.passenger?.firstName, trip.passenger?.lastName]
                                .filter(Boolean)
                                .join(' ') || 'Corporate Traveler';
                            const trackHref = trip.trackingToken
                              ? `/track/${encodeURIComponent(trip.trackingToken)}`
                              : `/booking/status/${encodeURIComponent(trip.id)}`;
                            return (
                              <div key={trip.id} className="p-4 space-y-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <span className="font-extrabold text-slate-900">{traveler}</span>
                                    <span className="ml-2 font-mono text-[10px] text-slate-500">
                                      #{trip.id.slice(-6).toUpperCase()}
                                    </span>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.className}`}
                                  >
                                    {statusBadge.label}
                                  </span>
                                </div>
                                <div className="text-slate-700 space-y-0.5">
                                  <div className="truncate">
                                    <strong>From:</strong> {trip.pickupLocation?.address}
                                  </div>
                                  <div className="truncate">
                                    <strong>To:</strong> {trip.dropoffLocation?.address}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between pt-1 text-[11px]">
                                  <span className="font-mono text-slate-500">
                                    PO: {meta.billingPo || account.currentPoNumber || '—'} • $
                                    {Number(trip.pricing?.totalFare || 0).toFixed(2)}
                                  </span>
                                  <Link
                                    to={trackHref}
                                    className="font-bold text-indigo-600 inline-flex items-center gap-1"
                                  >
                                    <span>Live Track</span>
                                    <ExternalLinkIcon className="w-3 h-3" />
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 2: BOOK COMPANY RIDE (PRE-BOUND B2B TRAVEL DESK)
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'book' && (
              <div className="space-y-5">
                {/* B2B Travel Coordinator Quick-Fill Toolbar */}
                <Card className="border border-indigo-200/90 bg-gradient-to-br from-white via-white to-indigo-50/40 shadow-xs">
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <BuildingIcon className="w-4 h-4 text-indigo-600" />
                          <h2 className="text-sm font-black text-slate-950">
                            Corporate Travel Coordinator Quick-Fill
                          </h2>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Pre-bound to <strong>{account.companyName}</strong> ({account.accountNumber}
                          {account.currentPoNumber ? ` • Active PO: ${account.currentPoNumber}` : ''})
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
                        <ShieldCheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                        Direct Corporate Billing Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* 1. Authorized Employee / Guest Picker */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">
                          1. Select Authorized Employee or Guest Traveler
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={selectedRiderId}
                            onChange={(e) => {
                              const id = e.target.value;
                              const found =
                                (account.authorizedRiders || []).find((r) => r.id === id) || null;
                              handleSelectAuthorizedRider(found);
                            }}
                            className="flex-1 h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                          >
                            <option value="">-- Custom Guest / Enter Traveler Manually --</option>
                            {(account.authorizedRiders || []).map((rider) => (
                              <option key={rider.id} value={rider.id}>
                                {rider.name}
                                {rider.department ? ` (${rider.department})` : ''}
                                {rider.isVip ? ' ★ VIP' : ''}
                              </option>
                            ))}
                          </select>
                          {selectedRiderId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleSelectAuthorizedRider(null)}
                              className="text-xs cursor-pointer"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* 2. Department / Cost Center Selector */}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">
                          2. Department / Cost Center Allocation
                        </label>
                        <select
                          value={selectedCostCenter}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCostCenter(val);
                            setBookingInitialValues((prev) => ({ ...prev, costCenter: val }));
                          }}
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500"
                        >
                          <option value="">General Corporate Account</option>
                          {(account.costCenters || []).map((cc) => (
                            <option key={cc} value={cc}>
                              {cc}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 3. 1-Tap Company Saved Locations Chips */}
                    <div>
                      <span className="text-xs font-bold text-slate-700 block mb-2">
                        3. 1-Tap Company Locations &amp; Regional Airport Hubs
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {quickLocations.map((loc) => (
                          <div
                            key={loc.id}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1">
                                {loc.label.toLowerCase().includes('airport') ||
                                loc.label.includes('STL') ||
                                loc.label.includes('SUS') ? (
                                  <PlaneIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                ) : (
                                  <MapPinIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )}
                                <span className="truncate">{loc.label}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">{loc.address}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleApplySavedLocation(loc, 'pickup')}
                                className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-extrabold cursor-pointer"
                              >
                                Pickup
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplySavedLocation(loc, 'dropoff')}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[10px] font-extrabold cursor-pointer"
                              >
                                Dropoff
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Credit Limit Policy Banner when over limit */}
                {summary.isOverLimit && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs font-semibold flex items-start gap-2.5 ${
                      portalPolicy.creditLimitEnforcement === 'hard_block'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold">
                        {portalPolicy.creditLimitEnforcement === 'hard_block'
                          ? 'Credit Limit Reached — Direct-Bill Checkout Blocked'
                          : 'Credit Limit Advisory Warning'}
                      </div>
                      <p className="text-[11px] mt-0.5">
                        Current account exposure (${summary.totalExposure.toFixed(2)}) exceeds your $
                        {summary.creditLimit.toLocaleString()} credit limit.{' '}
                        {portalPolicy.creditLimitEnforcement === 'hard_block'
                          ? 'Please settle an open statement in Statements & Billing or pay by card to book.'
                          : 'Bookings remain permitted under Soft Warning policy; please review open statements.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Embedded Pre-Bound BookingEngineV2 */}
                <BookingEngineV2
                  embeddedInApp
                  hideDispatchBanner
                  corporatePortalContext={corporateBookingContext}
                  initialValues={bookingInitialValues}
                  onBookingSuccess={(trip) => {
                    showToast(
                      'success',
                      `Corporate reservation #${trip.id} submitted onto ${account.accountNumber}.`
                    );
                    refreshPortalData();
                  }}
                />
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 3: TEAM, LOCATIONS & PO SECURITY
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'team' && (
              <div className="space-y-6">
                {/* 1. Anti-Fraud PO Rotation & Audit Trail */}
                <Card className="border border-indigo-200/90 shadow-2xs">
                  <CardHeader className="border-b border-slate-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-black text-slate-950 flex items-center gap-2">
                          <ShieldCheckIcon className="w-4 h-4 text-indigo-600" />
                          <span>1-Click Anti-Fraud Purchase Order (PO) Rotation</span>
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Rotating your PO immediately revokes the prior code so former employees or
                          unauthorized callers cannot bill rides to {account.accountNumber}.
                        </CardDescription>
                      </div>
                      <Badge variant={account.poRequired ? 'success' : 'default'}>
                        {account.poRequired ? 'PO Verification Enforced' : 'PO Optional'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-5 space-y-4 text-xs">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                      <div className="lg:col-span-4 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 block">
                          Current Active PO Number
                        </span>
                        <div className="text-lg font-mono font-black text-slate-950 mt-0.5">
                          {account.currentPoNumber || 'None Assigned'}
                        </div>
                        {account.poGeneratedAt && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Issued: {new Date(account.poGeneratedAt).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-5 space-y-1.5">
                        <label className="font-bold text-slate-700 block">
                          Audit Reason for PO Rotation
                        </label>
                        <input
                          type="text"
                          value={poRotationReason}
                          onChange={(e) => setPoRotationReason(e.target.value)}
                          placeholder="e.g. Monthly billing cycle rotation / Employee departure"
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-xl text-xs"
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <Button
                          type="button"
                          variant="primary"
                          size="md"
                          isLoading={isRotatingPo}
                          onClick={handleRotatePo}
                          leftIcon={<RefreshCwIcon className="w-4 h-4" />}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                        >
                          Rotate Active PO
                        </Button>
                      </div>
                    </div>

                    {/* PO History Audit Trail */}
                    {(account.poNumberHistory || []).length > 0 && (
                      <div className="pt-2">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                          <HistoryIcon className="w-3.5 h-3.5" />
                          <span>Revoked PO Audit Trail ({account.poNumberHistory!.length})</span>
                        </div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                              <tr>
                                <th className="px-3 py-2">Revoked PO #</th>
                                <th className="px-3 py-2">Rotated At</th>
                                <th className="px-3 py-2">Rotated By</th>
                                <th className="px-3 py-2">Reason</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {account.poNumberHistory!.map((item, idx) => (
                                <tr key={`${item.poNumber}-${idx}`}>
                                  <td className="px-3 py-2 font-mono font-bold text-rose-700 line-through">
                                    {item.poNumber}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                    {new Date(item.rotatedAt).toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-slate-600">
                                    {item.rotatedBy || 'Corporate Portal'}
                                  </td>
                                  <td className="px-3 py-2 text-slate-700">{item.reason || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 2. Authorized Riders Directory */}
                  <Card className="border border-slate-200/90 shadow-2xs">
                    <CardHeader className="border-b border-slate-100">
                      <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4 text-indigo-600" />
                        <span>Authorized Employees &amp; Guest Riders</span>
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        One-click traveler profiles available in the Book Company Ride tab.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4 text-xs">
                      {canManageRiders ? (
                        <form onSubmit={handleAddRider} className="space-y-2.5 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              value={newRiderName}
                              onChange={(e) => setNewRiderName(e.target.value)}
                              placeholder="Full Name *"
                              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <input
                              type="tel"
                              value={newRiderPhone}
                              onChange={(e) => setNewRiderPhone(formatUsPhone(e.target.value))}
                              placeholder="Mobile Phone"
                              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="email"
                              value={newRiderEmail}
                              onChange={(e) => setNewRiderEmail(e.target.value)}
                              placeholder="Work Email"
                              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <input
                              type="text"
                              value={newRiderDept}
                              onChange={(e) => setNewRiderDept(e.target.value)}
                              placeholder="Department / Cost Center"
                              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newRiderVip}
                                onChange={(e) => setNewRiderVip(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                              />
                              <span className="font-semibold text-slate-700">Executive / VIP Priority</span>
                            </label>
                            <Button
                              type="submit"
                              size="sm"
                              variant="primary"
                              disabled={isSavingSettings}
                              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                            >
                              + Add Rider
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                          <LockIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Authorized rider list is managed by Chesterfield Corporate Administration.</span>
                        </div>
                      )}

                      <div className="divide-y divide-slate-100">
                        {(account.authorizedRiders || []).map((r) => (
                          <div key={r.id} className="py-2.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span className="truncate">{r.name}</span>
                                {r.isVip && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    VIP
                                  </span>
                                )}
                                {r.department && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    {r.department}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {[r.email, r.phone].filter(Boolean).join(' • ') || 'No contact info'}
                              </div>
                            </div>
                            {canManageRiders && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRider(r.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Remove rider"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        {(!account.authorizedRiders || account.authorizedRiders.length === 0) && (
                          <p className="text-slate-400 text-center py-4">
                            No saved employee/guest profiles yet.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* 3. Saved Company Locations + Cost Centers & Bookers */}
                  <div className="space-y-6">
                    <Card className="border border-slate-200/90 shadow-2xs">
                      <CardHeader className="border-b border-slate-100">
                        <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <MapPinIcon className="w-4 h-4 text-indigo-600" />
                          <span>Saved Company Locations</span>
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          Offices, campuses, hotels, and pickup gates for 1-tap booking.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 space-y-3 text-xs">
                        {canManageLocations ? (
                          <form onSubmit={handleAddSavedPlace} className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                            <input
                              type="text"
                              required
                              value={newPlaceLabel}
                              onChange={(e) => setNewPlaceLabel(e.target.value)}
                              placeholder="Label (e.g. St. Louis HQ West Lobby) *"
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <DispatchLocationInput
                              value={newPlaceAddress}
                              onChange={(val) => setNewPlaceAddress(val)}
                              onPlaceSelected={(details) => setNewPlaceAddress(details.address)}
                              placeholder="Street Address *"
                              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={newPlaceNotes}
                                onChange={(e) => setNewPlaceNotes(e.target.value)}
                                placeholder="Pickup / Gate / Security Instructions"
                                className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="primary"
                                disabled={isSavingSettings}
                                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shrink-0 cursor-pointer"
                              >
                                + Save Place
                              </Button>
                            </div>
                          </form>
                        ) : (
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2">
                            <LockIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Saved company pickup/dropoff locations are managed by Chesterfield Corporate Administration.</span>
                          </div>
                        )}

                        <div className="divide-y divide-slate-100">
                          {(account.savedCompanyLocations || []).map((loc) => (
                            <div key={loc.id} className="py-2.5 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900">{loc.label}</div>
                                <div className="text-[11px] text-slate-600 truncate">{loc.address}</div>
                                {loc.notes && (
                                  <div className="text-[10px] text-indigo-700 mt-0.5">{loc.notes}</div>
                                )}
                              </div>
                              {canManageLocations && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSavedPlace(loc.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                  title="Remove location"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Cost Centers & Authorized Booker Emails */}
                    <Card className="border border-slate-200/90 shadow-2xs">
                      <CardHeader className="border-b border-slate-100">
                        <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2">
                          <TagIcon className="w-4 h-4 text-indigo-600" />
                          <span>Cost Centers &amp; Authorized Bookers</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 space-y-4 text-xs">
                        <div>
                          <span className="font-bold text-slate-700 block mb-1.5">
                            Department / Cost Center Codes
                          </span>
                          <form onSubmit={handleAddCostCenter} className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={newCostCenterTag}
                              onChange={(e) => setNewCostCenterTag(e.target.value)}
                              placeholder="e.g. EXEC-100 or R&D-STL"
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                            />
                            <Button type="submit" size="sm" variant="outline" className="font-bold cursor-pointer">
                              Add Tag
                            </Button>
                          </form>
                          <div className="flex flex-wrap gap-1.5">
                            {(account.costCenters || []).map((cc) => (
                              <span
                                key={cc}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 font-mono font-bold text-[11px]"
                              >
                                {cc}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCostCenter(cc)}
                                  className="text-indigo-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100">
                          <span className="font-bold text-slate-700 block mb-1.5">
                            Authorized Travel Booker Emails
                          </span>
                          <form onSubmit={handleAddBooker} className="flex gap-2 mb-2">
                            <input
                              type="email"
                              value={newBookerEmail}
                              onChange={(e) => setNewBookerEmail(e.target.value)}
                              placeholder="coordinator@company.com"
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <Button type="submit" size="sm" variant="outline" className="font-bold cursor-pointer">
                              Authorize
                            </Button>
                          </form>
                          <div className="flex flex-wrap gap-1.5">
                            {(account.authorizedBookers || []).map((email) => (
                              <span
                                key={email}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-medium"
                              >
                                {email}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBooker(email)}
                                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                TAB 4: STATEMENTS & BILLING
               ═══════════════════════════════════════════════════════════════════ */}
            {activeTab === 'billing' && (
              <div className="space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-black text-slate-950">
                      Corporate Statements &amp; 1-Tap Online Remittance
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Download itemized PDF invoices, export CSV expense logs for accounting, or pay
                      open statements online.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExportRidesCsv}
                    leftIcon={<DownloadIcon className="w-4 h-4" />}
                    className="font-bold text-xs shrink-0 cursor-pointer"
                  >
                    Export Rides CSV
                  </Button>
                </div>

                <Card className="border border-slate-200/90 shadow-2xs overflow-hidden">
                  <CardContent className="p-0">
                    {summary.invoices.length === 0 ? (
                      <div className="p-12 text-center space-y-2">
                        <FileTextIcon className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-bold text-slate-700">
                          No issued statements yet for {account.companyName}
                        </p>
                        <p className="text-xs text-slate-500">
                          Unbilled cycle spend (${summary.unbilledSpend.toFixed(2)}) will appear here
                          when consolidated at the close of your {account.billingCycle.toUpperCase()}{' '}
                          cycle.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {summary.invoices.map((inv) => {
                          const pill = formatInvoiceStatusPill(inv.status);
                          const isPayable = inv.status === 'issued' || inv.status === 'overdue';
                          return (
                            <div
                              key={inv.id}
                              className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/60"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono font-black text-sm text-slate-950">
                                    {inv.invoiceNumber}
                                  </span>
                                  <span
                                    className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${pill.className}`}
                                  >
                                    {pill.label}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    Issued: {inv.issuedDate} • Due:{' '}
                                    <strong className="text-slate-700">{inv.dueDate}</strong>
                                  </span>
                                </div>
                                <div className="text-xs text-slate-600">
                                  {inv.lineItems?.length || inv.tripIds?.length || 1} itemized
                                  line(s)
                                  {inv.paidDate ? ` • Settled on ${inv.paidDate}` : ''}
                                  {inv.receiptNumber ? ` • Receipt ${inv.receiptNumber}` : ''}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2.5">
                                <div className="text-right mr-2">
                                  <div className="text-[10px] font-bold uppercase text-slate-400">
                                    Statement Total
                                  </div>
                                  <div className="text-base font-mono font-black text-slate-950">
                                    ${Number(inv.totalAmount || 0).toFixed(2)}
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenStatementModal(inv)}
                                  leftIcon={<FileTextIcon className="w-3.5 h-3.5" />}
                                  className="text-xs font-bold cursor-pointer"
                                >
                                  View / Print PDF
                                </Button>

                                {isPayable && (
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    isLoading={payingInvoiceId === inv.id}
                                    onClick={() => handlePayInvoiceNow(inv)}
                                    leftIcon={<CreditCardIcon className="w-3.5 h-3.5" />}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                                  >
                                    Pay Invoice Now
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </main>

      {/* ─── Printable PDF Statement Modal ─── */}
      {selectedStatement && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-auto print:shadow-none print:border-0 print:max-w-none">
            {isLoadingStatement ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2">
                <SpinnerIcon className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-xs text-slate-500">Preparing printable statement...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <div className="text-lg font-black text-slate-950">
                      {companySettings?.name || COMPANY_CONFIG.legalName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {companySettings?.address || COMPANY_CONFIG.address.formatted}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Billing &amp; Dispatch: {companySettings?.phone || COMPANY_CONFIG.phone.dispatch}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-600 block">
                      Corporate B2B Statement
                    </span>
                    <div className="text-xl font-mono font-black text-slate-950">
                      {selectedStatement.invoiceNumber}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Issued: {selectedStatement.issuedDate} • Due: {selectedStatement.dueDate}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Bill To Corporate Account
                    </span>
                    <div className="font-extrabold text-slate-900 mt-0.5">
                      {account?.companyName || selectedStatement.customerName}
                    </div>
                    <div className="font-mono text-indigo-700 font-bold">
                      Account #: {account?.accountNumber || selectedStatement.accountNumber}
                    </div>
                    <div className="text-slate-600">
                      {printableStatement?.billingAddress || selectedStatement.customerEmail}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Settlement Status
                    </span>
                    <div className="mt-1">
                      <span
                        className={`inline-block text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                          formatInvoiceStatusPill(selectedStatement.status).className
                        }`}
                      >
                        {formatInvoiceStatusPill(selectedStatement.status).label}
                      </span>
                    </div>
                    {selectedStatement.paidDate && (
                      <div className="text-emerald-700 font-semibold mt-1">
                        Paid on {selectedStatement.paidDate}
                      </div>
                    )}
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Traveler / PO #</th>
                        <th className="px-4 py-2.5">Service Description</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(printableStatement?.lineItems || selectedStatement.lineItems || []).map(
                        (li, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                              {li.date || selectedStatement.issuedDate}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-bold text-slate-900">
                                {li.passengerName || selectedStatement.customerName}
                              </div>
                              {li.poNumber && (
                                <div className="text-[10px] font-mono text-slate-500">
                                  PO: {li.poNumber}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700">
                              <div>{li.description}</div>
                              {li.pickupDropoff && (
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  {li.pickupDropoff}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                              ${Number(li.amount || 0).toFixed(2)}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      {(printableStatement?.discountAmount ?? 0) > 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-2 text-right text-emerald-700 font-semibold">
                            Contract Discount:
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">
                            -${printableStatement!.discountAmount!.toFixed(2)}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td colSpan={3} className="px-4 py-1.5 text-right text-[11px] text-slate-500">
                          Sales &amp; Transit Tax (MO RS 144.030 Exempt):
                        </td>
                        <td className="px-4 py-1.5 text-right font-mono text-[11px] text-slate-500">
                          $0.00
                        </td>
                      </tr>
                      <tr className="border-t border-slate-200 bg-indigo-50/50">
                        <td colSpan={3} className="px-4 py-3 text-right font-black text-sm text-slate-950">
                          Total Statement Balance:
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black text-base text-indigo-700">
                          ${Number(selectedStatement.totalAmount || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Remittance & Print Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 print:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedStatement(null);
                      setPrintableStatement(null);
                    }}
                    className="cursor-pointer"
                  >
                    Close
                  </Button>
                  <div className="flex items-center gap-2">
                    {(selectedStatement.status === 'issued' ||
                      selectedStatement.status === 'overdue') && (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        isLoading={payingInvoiceId === selectedStatement.id}
                        onClick={() => handlePayInvoiceNow(selectedStatement)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                      >
                        Pay Invoice Online
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                      className="font-bold cursor-pointer"
                    >
                      Print / Save PDF
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
