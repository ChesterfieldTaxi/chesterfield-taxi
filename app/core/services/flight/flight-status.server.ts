/**
 * Server-Isolated Flight Status Adapter Engine & 15-Minute Cache (`flight-status.server.ts`)
 *
 * Strictly server-only (`*.server.ts`) consumed by `app/routes/api.flight-status.ts`
 * and server verification suites so external aviation credentials NEVER leak into
 * browser bundles (`api.flight-status` client chunk = 0.00 kB).
 *
 * Supported Pluggable Providers (`IFlightStatusProvider`):
 * 1. `AeroDataBoxProvider` — RapidAPI or direct AeroDataBox `/flights/number/{ident}/{date}`
 * 2. `FlightAwareProvider` — FlightAware AeroAPI v4 `/flights/{ident}`
 * 3. `FallbackScheduleProvider` — Deterministic STL/SUS/CPS terminal & curbside fallback
 */

import {
  FLIGHT_LOOKUP_PAST_WINDOW_MS,
  parseFlightIdent,
  resolveStlTerminalInfo,
} from '../../config/airports';
import {
  normalizeFlightTrackingPolicy,
  type FlightPreferredProvider,
  type FlightTrackingPolicyConfig,
} from '../../types/config';
import type {
  FlightDiagnosticsSummary,
  FlightLookupQuery,
  FlightOperationalStatus,
  FlightProviderId,
  FlightTelemetrySnapshot,
  IFlightStatusProvider,
} from '../../types/flight';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
  verifyServerRequestAuth,
  type VerifiedServerAuth,
} from '../auth/server-auth.server';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
  patchFirestoreDocumentRest,
} from '../payments/stripe-webhook.server';

export const FLIGHT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes (900,000 ms)
const FLIGHT_CACHE_MAX_ENTRIES = 500;
const SERVICE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CACHE_KEY_PATTERN = /^[A-Z0-9]{2}_\d{1,4}_\d{4}-\d{2}-\d{2}$/;

interface FlightMemoryCacheStore {
  entries: Map<string, FlightTelemetrySnapshot>;
}

const flightCacheStore: FlightMemoryCacheStore = ((globalThis as any).__ct_flight_status_cache ||= {
  entries: new Map<string, FlightTelemetrySnapshot>(),
});

export function resetFlightTelemetryCacheForTests(): void {
  flightCacheStore.entries.clear();
}

export function getFlightTelemetryCacheSize(): number {
  return flightCacheStore.entries.size;
}

export function isValidServiceDate(dateStr: string | undefined | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!SERVICE_DATE_PATTERN.test(trimmed)) return false;
  const [yStr, mStr, dStr] = trimmed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (year < 2020 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function buildFlightCacheKey(
  airlineCode: string,
  flightNumber: string,
  serviceDate: string
): string {
  return `${airlineCode.trim().toUpperCase()}_${flightNumber.trim()}_${serviceDate.trim()}`;
}

function normalizeIsoTimestamp(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  // Handle "YYYY-MM-DD HH:mmZ" or "YYYY-MM-DD HH:mm+00:00" returned by some aviation feeds
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed)
    ? trimmed.replace(/\s+/, 'T')
    : trimmed;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

function normalizeStlTerminalLabel(
  rawTerminal: unknown,
  airlineCodeOrName?: string,
  destinationIata?: string
): { terminal?: string; pickupDoorGuidance: string } {
  const baseInfo = resolveStlTerminalInfo(airlineCodeOrName, destinationIata || 'STL');
  const raw = typeof rawTerminal === 'string' || typeof rawTerminal === 'number'
    ? String(rawTerminal).trim()
    : '';

  if (baseInfo.isPrivateFbo) {
    return {
      terminal: raw || baseInfo.terminal,
      pickupDoorGuidance: baseInfo.pickupDoorGuidance,
    };
  }

  const dest = (destinationIata || 'STL').toUpperCase();
  if (dest === 'STL') {
    if (/^(2|t2|terminal\s*2|east)$/i.test(raw)) {
      return {
        terminal: 'Terminal 2',
        pickupDoorGuidance: 'Terminal 2 · Baggage Claim Exit Door 12',
      };
    }
    if (/^(1|t1|terminal\s*1|main)$/i.test(raw)) {
      return {
        terminal: 'Terminal 1',
        pickupDoorGuidance: 'Terminal 1 · Lower Level Exit Door 6 / Door 12',
      };
    }
    if (raw) {
      return {
        terminal: raw.toLowerCase().startsWith('terminal') ? raw : `Terminal ${raw}`,
        pickupDoorGuidance: baseInfo.pickupDoorGuidance,
      };
    }
  }

  return {
    terminal: raw || baseInfo.terminal,
    pickupDoorGuidance: baseInfo.pickupDoorGuidance,
  };
}

function computeDelayMinutes(
  explicitDelayMinutes: number | undefined,
  scheduledArrivalIso?: string,
  estimatedArrivalIso?: string
): number {
  if (typeof explicitDelayMinutes === 'number' && Number.isFinite(explicitDelayMinutes)) {
    return Math.round(explicitDelayMinutes);
  }
  if (scheduledArrivalIso && estimatedArrivalIso) {
    const schedMs = Date.parse(scheduledArrivalIso);
    const estMs = Date.parse(estimatedArrivalIso);
    if (Number.isFinite(schedMs) && Number.isFinite(estMs)) {
      return Math.round((estMs - schedMs) / 60_000);
    }
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. AeroDataBox Provider
// ─────────────────────────────────────────────────────────────────────────────

export interface AeroDataBoxProviderOptions {
  apiKey?: string;
  rapidApiHost?: string;
  directBaseUrl?: string;
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
}

export class AeroDataBoxProvider implements IFlightStatusProvider {
  public readonly id: FlightProviderId = 'aerodatabox';
  private readonly apiKey: string;
  private readonly rapidApiHost: string;
  private readonly directBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nowFn: () => number;

  constructor(options?: AeroDataBoxProviderOptions) {
    const providerHint = (process.env.FLIGHT_API_PROVIDER || '').trim().toLowerCase();
    const sharedKey =
      providerHint === '' || providerHint === 'aerodatabox'
        ? (process.env.FLIGHT_API_KEY || '').trim()
        : '';

    this.apiKey = (
      options?.apiKey ??
      process.env.AERODATABOX_API_KEY ??
      sharedKey
    ).trim();
    this.rapidApiHost = (
      options?.rapidApiHost ??
      process.env.AERODATABOX_RAPIDAPI_HOST ??
      'aerodatabox.p.rapidapi.com'
    ).trim();
    this.directBaseUrl = (
      options?.directBaseUrl ??
      process.env.AERODATABOX_BASE_URL ??
      ''
    ).trim();
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.nowFn = options?.nowFn ?? Date.now;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length >= 8);
  }

  public async lookupFlight(query: FlightLookupQuery): Promise<FlightTelemetrySnapshot | null> {
    if (!this.isConfigured()) return null;

    const encodedIdent = encodeURIComponent(query.flightIdent);
    const encodedDate = encodeURIComponent(query.serviceDate);

    const isDirect =
      Boolean(this.directBaseUrl) ||
      this.rapidApiHost.toLowerCase() === 'direct' ||
      this.rapidApiHost.includes('api.market');

    const baseUrl = isDirect
      ? (this.directBaseUrl || 'https://prod.api.market/api/v1/aedbx/aerodatabox').replace(/\/+$/, '')
      : `https://${this.rapidApiHost.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

    const url = `${baseUrl}/flights/number/${encodedIdent}/${encodedDate}?dateLocalRole=Both`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (isDirect) {
      headers['x-api-market-key'] = this.apiKey;
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    } else {
      headers['x-rapidapi-key'] = this.apiKey;
      headers['x-rapidapi-host'] = this.rapidApiHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }

    const resp = await this.fetchImpl(url, { method: 'GET', headers });
    if (resp.status === 204 || resp.status === 404) {
      return null;
    }
    if (!resp.ok) {
      throw new Error(`AeroDataBox HTTP ${resp.status}`);
    }

    const payload = (await resp.json()) as unknown;
    const legs: any[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as any)?.flights)
      ? (payload as any).flights
      : payload && typeof payload === 'object'
      ? [payload]
      : [];

    if (legs.length === 0) return null;

    const targetDest = (query.destinationIata || 'STL').toUpperCase();
    const leg =
      legs.find((item) => {
        const arrIata = String(item?.arrival?.airport?.iata || '').toUpperCase();
        return arrIata === targetDest || arrIata === 'STL' || arrIata === 'SUS';
      }) || legs[0];

    const dep = leg?.departure || {};
    const arr = leg?.arrival || {};

    const scheduledDepartureIso = normalizeIsoTimestamp(
      dep?.scheduledTime?.utc || dep?.scheduledTime?.local || dep?.scheduledTimeUtc
    );
    const estimatedDepartureIso = normalizeIsoTimestamp(
      dep?.revisedTime?.utc ||
        dep?.predictedTime?.utc ||
        dep?.runwayTime?.utc ||
        dep?.actualTime?.utc ||
        dep?.revisedTime?.local
    );
    const scheduledArrivalIso = normalizeIsoTimestamp(
      arr?.scheduledTime?.utc || arr?.scheduledTime?.local || arr?.scheduledTimeUtc
    );
    const estimatedArrivalIso = normalizeIsoTimestamp(
      arr?.revisedTime?.utc ||
        arr?.predictedTime?.utc ||
        arr?.runwayTime?.utc ||
        arr?.actualTime?.utc ||
        arr?.revisedTime?.local
    );

    const explicitDelay =
      typeof arr?.delay === 'number' && Number.isFinite(arr.delay) ? arr.delay : undefined;
    const delayMinutes = computeDelayMinutes(
      explicitDelay,
      scheduledArrivalIso,
      estimatedArrivalIso
    );

    const rawStatus = String(leg?.status || '').toLowerCase();
    let status: FlightOperationalStatus = 'scheduled';
    if (rawStatus.includes('cancel')) {
      status = 'cancelled';
    } else if (rawStatus.includes('divert')) {
      status = 'diverted';
    } else if (rawStatus.includes('arrived') || rawStatus.includes('landed')) {
      status = 'landed';
    } else if (rawStatus.includes('delay')) {
      status = 'delayed';
    } else if (
      rawStatus.includes('enroute') ||
      rawStatus.includes('en_route') ||
      rawStatus.includes('en route') ||
      rawStatus.includes('approaching') ||
      rawStatus.includes('departed')
    ) {
      status = delayMinutes >= 15 ? 'delayed' : 'en_route';
    } else if (delayMinutes >= 15) {
      status = 'delayed';
    } else if (rawStatus) {
      status = 'scheduled';
    }

    const originIata =
      typeof dep?.airport?.iata === 'string' && dep.airport.iata.trim()
        ? dep.airport.iata.trim().toUpperCase()
        : query.originIata;
    const originCity =
      typeof dep?.airport?.municipalityName === 'string' && dep.airport.municipalityName.trim()
        ? dep.airport.municipalityName.trim()
        : typeof dep?.airport?.shortName === 'string' && dep.airport.shortName.trim()
        ? dep.airport.shortName.trim()
        : undefined;
    const destinationIata =
      typeof arr?.airport?.iata === 'string' && arr.airport.iata.trim()
        ? arr.airport.iata.trim().toUpperCase()
        : targetDest;

    const airlineName =
      (typeof leg?.airline?.name === 'string' && leg.airline.name.trim()) ||
      query.airlineName ||
      resolveStlTerminalInfo(query.airlineCode, destinationIata).airlineName;

    const terminalInfo = normalizeStlTerminalLabel(
      arr?.terminal,
      query.airlineCode || airlineName,
      destinationIata
    );

    const gate =
      typeof arr?.gate === 'string' && arr.gate.trim() ? arr.gate.trim() : undefined;
    const baggageClaim =
      typeof (arr?.baggageBelt ?? arr?.baggageClaim) === 'string' &&
      String(arr?.baggageBelt ?? arr?.baggageClaim).trim()
        ? String(arr?.baggageBelt ?? arr?.baggageClaim).trim()
        : undefined;

    const nowMs = this.nowFn();
    return {
      flightIdent: query.flightIdent,
      airlineCode: query.airlineCode,
      airlineName,
      flightNumber: query.flightNumber,
      serviceDate: query.serviceDate,
      status,
      scheduledDepartureIso,
      estimatedDepartureIso,
      scheduledArrivalIso,
      estimatedArrivalIso: estimatedArrivalIso || scheduledArrivalIso,
      delayMinutes,
      originIata,
      originCity,
      destinationIata,
      terminal: terminalInfo.terminal,
      gate,
      baggageClaim,
      pickupDoorGuidance: terminalInfo.pickupDoorGuidance,
      provider: 'aerodatabox',
      isSimulatedFallback: false,
      checkedAt: new Date(nowMs).toISOString(),
      cacheExpiresAt: new Date(nowMs + FLIGHT_CACHE_TTL_MS).toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FlightAware AeroAPI v4 Provider
// ─────────────────────────────────────────────────────────────────────────────

export interface FlightAwareProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  nowFn?: () => number;
}

export class FlightAwareProvider implements IFlightStatusProvider {
  public readonly id: FlightProviderId = 'flightaware';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly nowFn: () => number;

  constructor(options?: FlightAwareProviderOptions) {
    const providerHint = (process.env.FLIGHT_API_PROVIDER || '').trim().toLowerCase();
    const sharedKey =
      providerHint === 'flightaware' ? (process.env.FLIGHT_API_KEY || '').trim() : '';

    this.apiKey = (
      options?.apiKey ??
      process.env.FLIGHTAWARE_API_KEY ??
      sharedKey
    ).trim();
    this.baseUrl = (
      options?.baseUrl ??
      process.env.FLIGHTAWARE_BASE_URL ??
      'https://aeroapi.flightaware.com/aeroapi'
    )
      .trim()
      .replace(/\/+$/, '');
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.nowFn = options?.nowFn ?? Date.now;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length >= 8);
  }

  public async lookupFlight(query: FlightLookupQuery): Promise<FlightTelemetrySnapshot | null> {
    if (!this.isConfigured()) return null;

    const url = `${this.baseUrl}/flights/${encodeURIComponent(query.flightIdent)}`;
    const resp = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-apikey': this.apiKey,
      },
    });

    if (resp.status === 404) return null;
    if (!resp.ok) {
      throw new Error(`FlightAware AeroAPI HTTP ${resp.status}`);
    }

    const payload = (await resp.json()) as { flights?: any[] };
    const flights = Array.isArray(payload?.flights) ? payload.flights : [];
    if (flights.length === 0) return null;

    const targetDest = (query.destinationIata || 'STL').toUpperCase();
    const matchesDate = (leg: any): boolean => {
      const candidates = [
        leg?.scheduled_in,
        leg?.estimated_in,
        leg?.scheduled_out,
        leg?.scheduled_on,
      ].filter((v): v is string => typeof v === 'string' && v.length >= 10);
      if (candidates.some((iso) => iso.slice(0, 10) === query.serviceDate)) return true;
      // Also check US Central calendar date (`UTC-6` / `UTC-5`) for evening arrivals crossing UTC midnight
      for (const iso of candidates) {
        const ms = Date.parse(iso);
        if (Number.isFinite(ms)) {
          const centralApprox = new Date(ms - 6 * 3600_000).toISOString().slice(0, 10);
          if (centralApprox === query.serviceDate) return true;
        }
      }
      return false;
    };

    const matchesDest = (leg: any): boolean => {
      const codeIata = String(leg?.destination?.code_iata || '').toUpperCase();
      const codeIcao = String(leg?.destination?.code || '').toUpperCase();
      return (
        codeIata === targetDest ||
        codeIcao === `K${targetDest}` ||
        codeIata === 'STL' ||
        codeIcao === 'KSTL' ||
        codeIata === 'SUS' ||
        codeIcao === 'KSUS'
      );
    };

    const leg =
      flights.find((f) => matchesDate(f) && matchesDest(f)) ||
      flights.find((f) => matchesDate(f)) ||
      flights.find((f) => matchesDest(f)) ||
      flights[0];

    const scheduledDepartureIso = normalizeIsoTimestamp(leg?.scheduled_out || leg?.scheduled_off);
    const estimatedDepartureIso = normalizeIsoTimestamp(
      leg?.actual_out || leg?.estimated_out || leg?.actual_off || leg?.estimated_off
    );
    const scheduledArrivalIso = normalizeIsoTimestamp(leg?.scheduled_in || leg?.scheduled_on);
    const estimatedArrivalIso = normalizeIsoTimestamp(
      leg?.actual_in || leg?.estimated_in || leg?.actual_on || leg?.estimated_on
    );

    // FlightAware AeroAPI v4 reports `arrival_delay` in seconds
    const explicitDelayMin =
      typeof leg?.arrival_delay === 'number' && Number.isFinite(leg.arrival_delay)
        ? Math.round(leg.arrival_delay / 60)
        : undefined;
    const delayMinutes = computeDelayMinutes(
      explicitDelayMin,
      scheduledArrivalIso,
      estimatedArrivalIso
    );

    const rawStatus = String(leg?.status || '').toLowerCase();
    let status: FlightOperationalStatus = 'scheduled';
    if (leg?.cancelled === true || rawStatus.includes('cancel')) {
      status = 'cancelled';
    } else if (leg?.diverted === true || rawStatus.includes('divert')) {
      status = 'diverted';
    } else if (
      Boolean(leg?.actual_in || leg?.actual_on) ||
      rawStatus.includes('arrived') ||
      rawStatus.includes('landed')
    ) {
      status = 'landed';
    } else if (rawStatus.includes('delay')) {
      status = 'delayed';
    } else if (rawStatus.includes('en route') || rawStatus.includes('in flight')) {
      status = delayMinutes >= 15 ? 'delayed' : 'en_route';
    } else if (delayMinutes >= 15) {
      status = 'delayed';
    } else {
      status = 'scheduled';
    }

    const extractIata = (airportObj: any, fallback?: string): string | undefined => {
      if (typeof airportObj?.code_iata === 'string' && airportObj.code_iata.trim()) {
        return airportObj.code_iata.trim().toUpperCase();
      }
      if (typeof airportObj?.code === 'string' && /^K[A-Z]{3}$/i.test(airportObj.code.trim())) {
        return airportObj.code.trim().slice(1).toUpperCase();
      }
      return fallback;
    };

    const originIata = extractIata(leg?.origin, query.originIata);
    const originCity =
      typeof leg?.origin?.city === 'string' && leg.origin.city.trim()
        ? leg.origin.city.trim()
        : undefined;
    const destinationIata = extractIata(leg?.destination, targetDest) || targetDest;

    const baseInfo = resolveStlTerminalInfo(query.airlineCode || query.airlineName, destinationIata);
    const terminalInfo = normalizeStlTerminalLabel(
      leg?.terminal_destination,
      query.airlineCode || query.airlineName,
      destinationIata
    );

    const gate =
      typeof leg?.gate_destination === 'string' && leg.gate_destination.trim()
        ? leg.gate_destination.trim()
        : undefined;
    const baggageClaim =
      typeof leg?.baggage_claim === 'string' && leg.baggage_claim.trim()
        ? leg.baggage_claim.trim()
        : undefined;

    const nowMs = this.nowFn();
    return {
      flightIdent: query.flightIdent,
      airlineCode: query.airlineCode,
      airlineName: query.airlineName || baseInfo.airlineName,
      flightNumber: query.flightNumber,
      serviceDate: query.serviceDate,
      status,
      scheduledDepartureIso,
      estimatedDepartureIso,
      scheduledArrivalIso,
      estimatedArrivalIso: estimatedArrivalIso || scheduledArrivalIso,
      delayMinutes,
      originIata,
      originCity,
      destinationIata,
      terminal: terminalInfo.terminal,
      gate,
      baggageClaim,
      pickupDoorGuidance: terminalInfo.pickupDoorGuidance,
      provider: 'flightaware',
      isSimulatedFallback: false,
      checkedAt: new Date(nowMs).toISOString(),
      cacheExpiresAt: new Date(nowMs + FLIGHT_CACHE_TTL_MS).toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Deterministic STL/SUS Fallback Schedule Provider
// ─────────────────────────────────────────────────────────────────────────────

export class FallbackScheduleProvider implements IFlightStatusProvider {
  public readonly id: FlightProviderId = 'fallback';
  private readonly nowFn: () => number;

  constructor(options?: { nowFn?: () => number }) {
    this.nowFn = options?.nowFn ?? Date.now;
  }

  public isConfigured(): boolean {
    return true;
  }

  public async lookupFlight(query: FlightLookupQuery): Promise<FlightTelemetrySnapshot> {
    const dest = (query.destinationIata || 'STL').toUpperCase();
    const terminalInfo = resolveStlTerminalInfo(
      query.airlineCode || query.airlineName,
      dest
    );
    const nowMs = this.nowFn();

    return {
      flightIdent: query.flightIdent,
      airlineCode: query.airlineCode,
      airlineName: query.airlineName || terminalInfo.airlineName,
      flightNumber: query.flightNumber,
      serviceDate: query.serviceDate,
      status: 'scheduled',
      delayMinutes: 0,
      originIata: query.originIata ? query.originIata.toUpperCase() : undefined,
      destinationIata: dest,
      terminal: terminalInfo.terminal,
      pickupDoorGuidance: terminalInfo.pickupDoorGuidance,
      provider: 'fallback',
      isSimulatedFallback: true,
      checkedAt: new Date(nowMs).toISOString(),
      cacheExpiresAt: new Date(nowMs + FLIGHT_CACHE_TTL_MS).toISOString(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator, 15-Minute Cache & Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

export interface LookupFlightServerInput {
  airline?: string;
  flightNumber?: string;
  serviceDate?: string;
  destinationIata?: string;
  originIata?: string;
  scheduledPickupIso?: string;
}

export interface LookupFlightServerOptions {
  forceRefresh?: boolean;
  isStaffAuthorized?: boolean;
  staffBearerToken?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  skipFirestoreCache?: boolean;
  policyOverride?: Partial<FlightTrackingPolicyConfig>;
}

export interface LookupFlightServerResult {
  success: boolean;
  status: number;
  code?: string;
  unlocksAtIso?: string;
  snapshot?: FlightTelemetrySnapshot;
  fromCache?: boolean;
  cacheKey?: string;
  error?: string;
}

async function resolveServerFlightTrackingPolicy(
  options?: Pick<LookupFlightServerOptions, 'policyOverride' | 'staffBearerToken' | 'skipFirestoreCache'>
): Promise<FlightTrackingPolicyConfig> {
  if (options?.policyOverride) {
    return normalizeFlightTrackingPolicy(options.policyOverride);
  }
  if (!options?.skipFirestoreCache && isFirebaseConfigured()) {
    try {
      const readToken =
        options?.staffBearerToken || (await getServiceAccountDatastoreToken()) || undefined;
      if (readToken) {
        const appSettingsDoc = await fetchFirestoreDocumentRest(
          'config',
          'appSettings',
          readToken
        );
        if (appSettingsDoc?.integrations?.flightTracking) {
          return normalizeFlightTrackingPolicy(appSettingsDoc.integrations.flightTracking);
        }
      }
    } catch {
      // Fallback to default policy
    }
  }
  return normalizeFlightTrackingPolicy();
}

function resolveProvidersFromEnv(
  envOverride?: Record<string, string | undefined>,
  fetchImpl?: typeof fetch,
  nowFn?: () => number,
  preferredProvider: FlightPreferredProvider = 'auto'
): {
  primaryProviders: IFlightStatusProvider[];
  fallbackProvider: FallbackScheduleProvider;
  aeroConfigured: boolean;
  flightAwareConfigured: boolean;
  activeProvider: FlightProviderId;
} {
  const readEnv = (key: string): string => {
    if (envOverride && key in envOverride) {
      return (envOverride[key] || '').trim();
    }
    return (process.env[key] || '').trim();
  };

  const envPref = readEnv('FLIGHT_API_PROVIDER').toLowerCase();
  const effectivePref =
    preferredProvider && preferredProvider !== 'auto' ? preferredProvider : envPref;
  const sharedKey = readEnv('FLIGHT_API_KEY');
  const aeroKey =
    readEnv('AERODATABOX_API_KEY') ||
    (envPref !== 'flightaware' ? sharedKey : '');
  const faKey =
    readEnv('FLIGHTAWARE_API_KEY') ||
    (envPref === 'flightaware' ? sharedKey : '');
  const rapidHost = readEnv('AERODATABOX_RAPIDAPI_HOST') || 'aerodatabox.p.rapidapi.com';
  const aeroDirectUrl = readEnv('AERODATABOX_BASE_URL');
  const faBaseUrl = readEnv('FLIGHTAWARE_BASE_URL') || 'https://aeroapi.flightaware.com/aeroapi';

  const aero = new AeroDataBoxProvider({
    apiKey: aeroKey,
    rapidApiHost: rapidHost,
    directBaseUrl: aeroDirectUrl,
    fetchImpl,
    nowFn,
  });
  const flightAware = new FlightAwareProvider({
    apiKey: faKey,
    baseUrl: faBaseUrl,
    fetchImpl,
    nowFn,
  });
  const fallback = new FallbackScheduleProvider({ nowFn });

  if (effectivePref === 'heuristic_only') {
    return {
      primaryProviders: [],
      fallbackProvider: fallback,
      aeroConfigured: aero.isConfigured(),
      flightAwareConfigured: flightAware.isConfigured(),
      activeProvider: 'fallback',
    };
  }

  const ordered =
    effectivePref === 'flightaware'
      ? [flightAware, aero]
      : [aero, flightAware];
  const configuredLive = ordered.filter((p) => p.isConfigured());
  const activeProvider: FlightProviderId = configuredLive[0]?.id ?? 'fallback';

  return {
    primaryProviders: configuredLive,
    fallbackProvider: fallback,
    aeroConfigured: aero.isConfigured(),
    flightAwareConfigured: flightAware.isConfigured(),
    activeProvider,
  };
}

export function getFlightIntegrationDiagnostics(
  envOverride?: Record<string, string | undefined>,
  policyOverride?: Partial<FlightTrackingPolicyConfig>
): FlightDiagnosticsSummary {
  const policy = normalizeFlightTrackingPolicy(policyOverride);
  const resolved = resolveProvidersFromEnv(
    envOverride,
    undefined,
    undefined,
    policy.preferredProvider
  );
  return {
    activeProvider: resolved.activeProvider,
    liveApiConfigured: resolved.aeroConfigured || resolved.flightAwareConfigured,
    aeroDataBoxConfigured: resolved.aeroConfigured,
    flightAwareConfigured: resolved.flightAwareConfigured,
    fallbackReady: true,
    cacheTtlMinutes: policy.cacheTtlMinutes,
    cachedEntriesCount: flightCacheStore.entries.size,
    supportedAirports: ['STL', 'SUS', 'CPS'],
    endpointPath: '/api/flight-status',
  };
}

function getMemoryCachedSnapshot(
  cacheKey: string,
  nowMs: number
): FlightTelemetrySnapshot | null {
  const hit = flightCacheStore.entries.get(cacheKey);
  if (!hit) return null;
  const expiresMs = Date.parse(hit.cacheExpiresAt);
  if (!Number.isFinite(expiresMs) || nowMs >= expiresMs) {
    flightCacheStore.entries.delete(cacheKey);
    return null;
  }
  return hit;
}

function setMemoryCachedSnapshot(cacheKey: string, snapshot: FlightTelemetrySnapshot): void {
  if (flightCacheStore.entries.size >= FLIGHT_CACHE_MAX_ENTRIES) {
    const oldestKey = flightCacheStore.entries.keys().next().value;
    if (oldestKey) flightCacheStore.entries.delete(oldestKey);
  }
  flightCacheStore.entries.set(cacheKey, snapshot);
}

function isValidCachedSnapshotDoc(doc: Record<string, any> | null): doc is FlightTelemetrySnapshot {
  return Boolean(
    doc &&
      typeof doc.flightIdent === 'string' &&
      typeof doc.airlineCode === 'string' &&
      typeof doc.flightNumber === 'string' &&
      typeof doc.serviceDate === 'string' &&
      typeof doc.status === 'string' &&
      typeof doc.cacheExpiresAt === 'string'
  );
}

export async function lookupFlightTelemetryServer(
  input: LookupFlightServerInput,
  options?: LookupFlightServerOptions
): Promise<LookupFlightServerResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const nowFn = () => nowMs;

  const parsed = parseFlightIdent(input.airline, input.flightNumber);
  if (!parsed.isValid || !parsed.airlineCode || !parsed.flightNumber) {
    return {
      success: false,
      status: 400,
      error: 'Valid IATA airline code and 1–4 digit flight number are required (e.g. WN 1425).',
    };
  }

  const serviceDate = (input.serviceDate || '').trim();
  if (!isValidServiceDate(serviceDate)) {
    return {
      success: false,
      status: 400,
      code: 'INVALID_SERVICE_DATE',
      error: 'Valid serviceDate in YYYY-MM-DD format is required.',
    };
  }

  const policy = await resolveServerFlightTrackingPolicy(options);
  const futureWindowMs = policy.flightLookupWindowHours * 3_600_000;
  const cacheTtlMs = policy.cacheTtlMinutes * 60_000;
  const maxFutureCalendarDays = Math.max(1, Math.ceil(policy.flightLookupWindowHours / 24));

  // Phase 38.B + Phase 62 Operational Window Guard (enforced before cache or upstream provider calls):
  // 1. If scheduledPickupIso is supplied, require [-12h, +flightLookupWindowHours] relative to nowMs.
  if (typeof input.scheduledPickupIso === 'string' && input.scheduledPickupIso.trim()) {
    const pickupMs = Date.parse(input.scheduledPickupIso.trim());
    if (!Number.isFinite(pickupMs)) {
      return {
        success: false,
        status: 400,
        code: 'INVALID_PICKUP_TIME',
        error: 'Valid scheduledPickupIso timestamp is required.',
      };
    }
    if (pickupMs - nowMs > futureWindowMs) {
      return {
        success: false,
        status: 400,
        code: 'OUTSIDE_24H_WINDOW',
        unlocksAtIso: new Date(pickupMs - futureWindowMs).toISOString(),
        error: `Live flight tracking unlocks within ${policy.flightLookupWindowHours} hours of scheduled pickup.`,
      };
    }
    if (nowMs - pickupMs > FLIGHT_LOOKUP_PAST_WINDOW_MS) {
      return {
        success: false,
        status: 400,
        code: 'OUTSIDE_24H_WINDOW',
        error: 'Pickup window has passed (>12h ago); live flight lookup locked.',
      };
    }
  }

  // 2. Always require serviceDate (YYYY-MM-DD) within [-1, +maxFutureCalendarDays] calendar days of nowMs
  const [yNum, mNum, dNum] = serviceDate.split('-').map(Number);
  const serviceDayIndex = Math.floor(Date.UTC(yNum, mNum - 1, dNum) / 86_400_000);
  const nowDayIndex = Math.floor(nowMs / 86_400_000);
  const calendarDayDelta = serviceDayIndex - nowDayIndex;
  if (calendarDayDelta > maxFutureCalendarDays || calendarDayDelta < -1) {
    return {
      success: false,
      status: 400,
      code: 'OUTSIDE_24H_WINDOW',
      error:
        calendarDayDelta > maxFutureCalendarDays
          ? `Live flight tracking unlocks within ${policy.flightLookupWindowHours} hours of scheduled pickup.`
          : 'Pickup window has passed; live flight lookup locked.',
    };
  }

  const cacheKey = buildFlightCacheKey(parsed.airlineCode, parsed.flightNumber, serviceDate);
  if (!CACHE_KEY_PATTERN.test(cacheKey)) {
    return {
      success: false,
      status: 400,
      error: 'Invalid flight cache identifier.',
    };
  }

  // Only authenticated Dispatchers/Admins may force-bypass the quota cache
  const allowForceRefresh = Boolean(options?.forceRefresh && options?.isStaffAuthorized);
  const useFirestoreCache = !options?.skipFirestoreCache && isFirebaseConfigured();

  if (!allowForceRefresh) {
    const memHit = getMemoryCachedSnapshot(cacheKey, nowMs);
    if (memHit) {
      return {
        success: true,
        status: 200,
        snapshot: memHit,
        fromCache: true,
        cacheKey,
      };
    }

    if (useFirestoreCache) {
      const fsDoc = await fetchFirestoreDocumentRest('flightStatusCache', cacheKey);
      if (isValidCachedSnapshotDoc(fsDoc)) {
        const expMs = Date.parse(fsDoc.cacheExpiresAt);
        if (Number.isFinite(expMs) && nowMs < expMs) {
          setMemoryCachedSnapshot(cacheKey, fsDoc);
          return {
            success: true,
            status: 200,
            snapshot: fsDoc,
            fromCache: true,
            cacheKey,
          };
        }
      }
    }
  }

  const { primaryProviders, fallbackProvider } = resolveProvidersFromEnv(
    options?.env,
    options?.fetchImpl,
    nowFn,
    policy.preferredProvider
  );

  const query: FlightLookupQuery = {
    flightIdent: parsed.flightIdent,
    airlineCode: parsed.airlineCode,
    airlineName: parsed.airlineName,
    flightNumber: parsed.flightNumber,
    serviceDate,
    destinationIata: input.destinationIata?.trim().toUpperCase() || 'STL',
    originIata: input.originIata?.trim().toUpperCase() || undefined,
    scheduledPickupIso: input.scheduledPickupIso,
  };

  let resolvedSnapshot: FlightTelemetrySnapshot | null = null;
  for (const provider of primaryProviders) {
    try {
      const candidate = await provider.lookupFlight(query);
      if (candidate) {
        resolvedSnapshot = candidate;
        break;
      }
    } catch (err) {
      console.warn(`[flight-status] Upstream provider ${provider.id} failed for ${query.flightIdent}:`, err);
    }
  }

  if (!resolvedSnapshot) {
    resolvedSnapshot = await fallbackProvider.lookupFlight(query);
  }

  resolvedSnapshot = {
    ...resolvedSnapshot,
    cacheExpiresAt: new Date(nowMs + cacheTtlMs).toISOString(),
  };

  setMemoryCachedSnapshot(cacheKey, resolvedSnapshot);

  // Best-effort Firestore cache persistence when service account or staff token is available
  if (useFirestoreCache) {
    const writeToken =
      options?.staffBearerToken || (await getServiceAccountDatastoreToken()) || undefined;
    if (writeToken) {
      patchFirestoreDocumentRest(
        'flightStatusCache',
        cacheKey,
        resolvedSnapshot as unknown as Record<string, unknown>,
        writeToken
      ).catch(() => {});
    }
  }

  return {
    success: true,
    status: 200,
    snapshot: resolvedSnapshot,
    fromCache: false,
    cacheKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Route Handlers (`GET / POST /api/flight-status`)
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export interface FlightStatusHttpHandlerOptions {
  enforceAuth?: boolean;
  authResolver?: (request: Request) => Promise<VerifiedServerAuth>;
  nowMs?: number;
}

function shouldEnforceStaffAuth(explicitFlag?: boolean): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  return isFirebaseConfigured() || process.env.NODE_ENV === 'production';
}

export async function handleFlightStatusGet(
  request: Request,
  options?: FlightStatusHttpHandlerOptions
): Promise<Response> {
  const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;
  const auth = await resolveAuth(request);

  if (shouldEnforceStaffAuth(options?.enforceAuth)) {
    if (!auth.authenticated) {
      return jsonResponse(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Dispatcher or Admin authentication required for flight telemetry.',
        },
        401
      );
    }
    if (!auth.isDispatcher) {
      return jsonResponse(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Dispatcher or Admin role required for flight telemetry.',
        },
        403
      );
    }
  }

  const url = new URL(request.url);
  const isDiagnostics =
    url.searchParams.get('diagnostics') === '1' ||
    url.searchParams.get('diagnostics') === 'true';

  if (isDiagnostics) {
    const serverPolicy = await resolveServerFlightTrackingPolicy({
      staffBearerToken: auth.isDispatcher ? auth.rawToken : undefined,
    });
    return jsonResponse({
      success: true,
      ...getFlightIntegrationDiagnostics(undefined, serverPolicy),
    });
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`flight-status:${clientIp}`, 30, 60_000)) {
    return jsonResponse(
      { success: false, error: 'Too many flight status checks. Please wait a moment and try again.' },
      429
    );
  }

  const airline = url.searchParams.get('airline') || '';
  const flightNumber = url.searchParams.get('flightNumber') || url.searchParams.get('flight') || '';
  const serviceDate = url.searchParams.get('serviceDate') || url.searchParams.get('date') || '';
  const destinationIata = url.searchParams.get('destinationIata') || 'STL';
  const originIata = url.searchParams.get('originIata') || '';
  const scheduledPickupIso = url.searchParams.get('scheduledPickupIso') || undefined;
  const forceRefresh =
    url.searchParams.get('forceRefresh') === '1' ||
    url.searchParams.get('forceRefresh') === 'true';

  const result = await lookupFlightTelemetryServer(
    {
      airline,
      flightNumber,
      serviceDate,
      destinationIata,
      originIata,
      scheduledPickupIso,
    },
    {
      forceRefresh,
      isStaffAuthorized: auth.isDispatcher || !shouldEnforceStaffAuth(options?.enforceAuth),
      staffBearerToken: auth.isDispatcher ? auth.rawToken : undefined,
      nowMs: options?.nowMs,
    }
  );

  if (!result.success || !result.snapshot) {
    return jsonResponse(
      {
        success: false,
        code: result.code,
        unlocksAtIso: result.unlocksAtIso,
        error: result.error || 'Unable to check flight status.',
      },
      result.status
    );
  }

  return jsonResponse({
    success: true,
    snapshot: result.snapshot,
    fromCache: Boolean(result.fromCache),
    cacheKey: result.cacheKey,
  });
}

export async function handleFlightStatusPost(
  request: Request,
  options?: FlightStatusHttpHandlerOptions
): Promise<Response> {
  const resolveAuth = options?.authResolver ?? verifyServerRequestAuth;
  const auth = await resolveAuth(request);

  if (shouldEnforceStaffAuth(options?.enforceAuth)) {
    if (!auth.authenticated) {
      return jsonResponse(
        {
          success: false,
          code: 'UNAUTHORIZED',
          error: 'Dispatcher or Admin authentication required for flight telemetry.',
        },
        401
      );
    }
    if (!auth.isDispatcher) {
      return jsonResponse(
        {
          success: false,
          code: 'FORBIDDEN',
          error: 'Dispatcher or Admin role required for flight telemetry.',
        },
        403
      );
    }
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`flight-status:${clientIp}`, 30, 60_000)) {
    return jsonResponse(
      { success: false, error: 'Too many flight status checks. Please wait a moment and try again.' },
      429
    );
  }

  let body: Record<string, any> = {};
  try {
    body = (await request.json()) as Record<string, any>;
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON request body.' }, 400);
  }

  const forceRefresh = Boolean(body.forceRefresh);
  const result = await lookupFlightTelemetryServer(
    {
      airline: typeof body.airline === 'string' ? body.airline : '',
      flightNumber: typeof body.flightNumber === 'string' ? body.flightNumber : '',
      serviceDate: typeof body.serviceDate === 'string' ? body.serviceDate : '',
      destinationIata: typeof body.destinationIata === 'string' ? body.destinationIata : 'STL',
      originIata: typeof body.originIata === 'string' ? body.originIata : '',
      scheduledPickupIso:
        typeof body.scheduledPickupIso === 'string' ? body.scheduledPickupIso : undefined,
    },
    {
      forceRefresh,
      isStaffAuthorized: auth.isDispatcher || !shouldEnforceStaffAuth(options?.enforceAuth),
      staffBearerToken: auth.isDispatcher ? auth.rawToken : undefined,
      nowMs: options?.nowMs,
    }
  );

  if (!result.success || !result.snapshot) {
    return jsonResponse(
      {
        success: false,
        code: result.code,
        unlocksAtIso: result.unlocksAtIso,
        error: result.error || 'Unable to check flight status.',
      },
      result.status
    );
  }

  return jsonResponse({
    success: true,
    snapshot: result.snapshot,
    fromCache: Boolean(result.fromCache),
    cacheKey: result.cacheKey,
  });
}
