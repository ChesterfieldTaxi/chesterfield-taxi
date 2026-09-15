/**
 * Universal Governance Service (Phase 29)
 * 
 * Provides centralized management of:
 * - Universal Blacklist & Archive states for Passengers, Drivers, Staff, Fleet, Trips, and Geo-Locations.
 * - Dynamic Dual-Scoring Engine calculations for Customers (0-100) and Drivers (0-100).
 * - Security audit trail logging for blocked actions.
 */

import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { getFirebaseApp, isFirebaseConfigured } from '../firebase';

export type GovernanceEntityType =
  | 'passenger'
  | 'driver'
  | 'staff'
  | 'vehicle'
  | 'vehicle_type'
  | 'trip'
  | 'location'
  | 'zone'
  | 'zone_group'
  | 'collection'
  | 'tariff';

export interface EntityGovernanceRecord {
  entityId: string;
  entityType: GovernanceEntityType;
  isBlacklisted: boolean;
  blacklistReason?: string;
  isArchived: boolean;
  archivedAt?: string;
  archiveReason?: string;
  displayName?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface SecurityAuditEvent {
  id: string;
  action: 'BLACKLIST_BLOCK' | 'SECURITY_VIOLATION' | 'UNAUTHORIZED_DUTY_ATTEMPT' | 'GOVERNANCE_STATUS_CHANGED';
  entityType: GovernanceEntityType;
  entityId: string;
  actorRole: string;
  actorId?: string;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

const GOVERNANCE_LOCAL_STORAGE_KEY = 'chesterfield_universal_governance_v1';
const SECURITY_AUDIT_KEY = 'chesterfield_security_audits_v1';

export class UniversalGovernanceService {
  private cache: Map<string, EntityGovernanceRecord> = new Map();
  private auditLogs: SecurityAuditEvent[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.hydrateFromStorage();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('Listener error in UniversalGovernanceService:', err);
      }
    });
  }

  private getKey(type: GovernanceEntityType, id: string): string {
    return `${type}:${id.toLowerCase().trim()}`;
  }

  private hydrateFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(GOVERNANCE_LOCAL_STORAGE_KEY);
      if (raw) {
        const records: EntityGovernanceRecord[] = JSON.parse(raw);
        for (const r of records) {
          this.cache.set(this.getKey(r.entityType, r.entityId), r);
        }
      }
      const rawAudit = localStorage.getItem(SECURITY_AUDIT_KEY);
      if (rawAudit) {
        this.auditLogs = JSON.parse(rawAudit);
      }
    } catch (e) {
      console.warn('[UniversalGovernanceService] Failed to load local cache:', e);
    }
  }

  private persistToStorage() {
    if (typeof window === 'undefined') return;
    try {
      const records = Array.from(this.cache.values());
      localStorage.setItem(GOVERNANCE_LOCAL_STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem(SECURITY_AUDIT_KEY, JSON.stringify(this.auditLogs.slice(-100)));
      this.notifyListeners();
    } catch (e) {
      console.warn('[UniversalGovernanceService] Failed to persist local cache:', e);
    }
  }

  /**
   * Dual-Scoring Engine: Calculate Customer Score (0–100)
   * Formula:
   * - Baseline: 100 points
   * - Cancellations: -10 pts each
   * - No-Shows: -25 pts each
   * - Completed rides bonus: +2 pts per ride (up to max 100)
   * Minimum score floor: 0
   */
  public calculateCustomerScore(stats: {
    completedTrips: number;
    cancelledTrips: number;
    noShows: number;
    totalSpend?: number;
  }): number {
    let score = 90; // Default healthy baseline
    if (stats.completedTrips > 0) {
      score += Math.min(10, stats.completedTrips * 2);
    }
    score -= (stats.cancelledTrips * 10);
    score -= (stats.noShows * 25);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Dual-Scoring Engine: Calculate Driver Score (0–100)
   * Formula:
   * - Offer Acceptance Rate: 40% weight
   * - On-Time Arrival Rate: 30% weight
   * - Trip Completion Ratio: 20% weight
   * - Rider Feedback (0-5 stars converted to 0-100): 10% weight
   */
  public calculateDriverScore(stats: {
    offersAccepted: number;
    offersReceived: number;
    onTimePickups: number;
    totalAssignedPickups: number;
    completedTrips: number;
    cancelledTrips: number;
    ratingAverage?: number; // 1.0 - 5.0
  }): number {
    const acceptanceRate = stats.offersReceived > 0 
      ? (stats.offersAccepted / stats.offersReceived) * 100 
      : 100;

    const onTimeRate = stats.totalAssignedPickups > 0 
      ? (stats.onTimePickups / stats.totalAssignedPickups) * 100 
      : 100;

    const totalStarted = stats.completedTrips + stats.cancelledTrips;
    const completionRate = totalStarted > 0 
      ? (stats.completedTrips / totalStarted) * 100 
      : 100;

    const ratingScore = stats.ratingAverage !== undefined 
      ? (Math.max(1, Math.min(5, stats.ratingAverage)) / 5) * 100 
      : 95;

    const weightedScore = (
      (acceptanceRate * 0.40) +
      (onTimeRate * 0.30) +
      (completionRate * 0.20) +
      (ratingScore * 0.10)
    );

    return Math.round(Math.max(0, Math.min(100, weightedScore)));
  }

  /**
   * Check if a Passenger is blacklisted by phone or email
   */
  public async isPassengerBlacklisted(
    phone?: string,
    email?: string
  ): Promise<{ isBlacklisted: boolean; reason?: string; isArchived?: boolean }> {
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const rec = this.cache.get(this.getKey('passenger', normalizedPhone)) || this.cache.get(this.getKey('passenger', phone));
      if (rec?.isBlacklisted) {
        return { isBlacklisted: true, reason: rec.blacklistReason, isArchived: rec.isArchived };
      }
    }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const rec = this.cache.get(this.getKey('passenger', normalizedEmail));
      if (rec?.isBlacklisted) {
        return { isBlacklisted: true, reason: rec.blacklistReason, isArchived: rec.isArchived };
      }
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        if (email) {
          const docRef = doc(db, 'customerGovernance', email.toLowerCase().trim());
          const snap = await getDoc(docRef);
          if (snap.exists() && snap.data()?.isBlacklisted) {
            return {
              isBlacklisted: true,
              reason: snap.data()?.blacklistReason,
              isArchived: snap.data()?.isArchived
            };
          }
        }
      } catch (e) {
        console.warn('[UniversalGovernanceService] Error checking passenger blacklist in Firestore:', e);
      }
    }

    return { isBlacklisted: false };
  }

  public isPassengerBlacklistedSync(
    phone?: string,
    email?: string
  ): { isBlacklisted: boolean; reason?: string; isArchived?: boolean } {
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, '');
      const rec = this.cache.get(this.getKey('passenger', normalizedPhone)) || this.cache.get(this.getKey('passenger', phone));
      if (rec?.isBlacklisted || rec?.isArchived) {
        return { isBlacklisted: !!rec.isBlacklisted, reason: rec.blacklistReason, isArchived: !!rec.isArchived };
      }
    }
    if (email) {
      const normalizedEmail = email.toLowerCase().trim();
      const rec = this.cache.get(this.getKey('passenger', normalizedEmail));
      if (rec?.isBlacklisted || rec?.isArchived) {
        return { isBlacklisted: !!rec.isBlacklisted, reason: rec.blacklistReason, isArchived: !!rec.isArchived };
      }
    }
    return { isBlacklisted: false, isArchived: false };
  }

  public isDriverBlacklistedSync(
    driverId: string
  ): { isBlacklisted: boolean; reason?: string; isArchived?: boolean } {
    const rec = this.cache.get(this.getKey('driver', driverId));
    if (rec?.isBlacklisted || rec?.isArchived) {
      return { isBlacklisted: !!rec.isBlacklisted, reason: rec.blacklistReason, isArchived: !!rec.isArchived };
    }
    return { isBlacklisted: false, isArchived: false };
  }

  /**
   * Check if a Driver is blacklisted or archived
   */
  public async isDriverBlacklisted(
    driverId: string
  ): Promise<{ isBlacklisted: boolean; reason?: string; isArchived?: boolean }> {
    const rec = this.cache.get(this.getKey('driver', driverId));
    if (rec?.isBlacklisted) {
      return { isBlacklisted: true, reason: rec.blacklistReason, isArchived: rec.isArchived };
    }

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        const snap = await getDoc(doc(db, 'drivers', driverId));
        if (snap.exists()) {
          const data = snap.data();
          if (data?.isBlacklisted) {
            return { isBlacklisted: true, reason: data?.blacklistReason, isArchived: data?.isArchived };
          }
        }
      } catch (e) {
        console.warn('[UniversalGovernanceService] Error checking driver blacklist:', e);
      }
    }

    return { isBlacklisted: false };
  }

  /**
   * Check if a Vehicle is blacklisted or grounded
   */
  public async isVehicleBlacklisted(
    vehicleIdOrUnit: string
  ): Promise<{ isBlacklisted: boolean; reason?: string; isArchived?: boolean }> {
    const rec = this.cache.get(this.getKey('vehicle', vehicleIdOrUnit));
    if (rec?.isBlacklisted) {
      return { isBlacklisted: true, reason: rec.blacklistReason, isArchived: rec.isArchived };
    }
    return { isBlacklisted: false };
  }

  /**
   * Update Blacklist Status
   */
  public async setBlacklistStatus(
    entityType: GovernanceEntityType,
    entityId: string,
    isBlacklisted: boolean,
    reason?: string,
    actorRole = 'admin',
    actorId = 'admin'
  ): Promise<void> {
    const key = this.getKey(entityType, entityId);
    const existing = this.cache.get(key) || {
      entityId,
      entityType,
      isBlacklisted: false,
      isArchived: false,
      updatedAt: new Date().toISOString(),
    };

    const updated: EntityGovernanceRecord = {
      ...existing,
      isBlacklisted,
      blacklistReason: isBlacklisted ? reason || 'Administrative sanction' : undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    this.cache.set(key, updated);
    this.persistToStorage();

    // Log security audit event
    this.recordSecurityAudit({
      action: 'GOVERNANCE_STATUS_CHANGED',
      entityType,
      entityId,
      actorRole,
      actorId,
      reason: isBlacklisted ? `Blacklisted: ${reason || 'No reason provided'}` : 'Blacklist lifted / restored',
      metadata: { isBlacklisted, reason }
    });

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        if (entityType === 'passenger') {
          await setDoc(doc(db, 'customerGovernance', entityId.toLowerCase().trim()), updated, { merge: true });
        } else if (entityType === 'driver') {
          await setDoc(doc(db, 'drivers', entityId), {
            isBlacklisted,
            blacklistReason: updated.blacklistReason,
            updatedAt: updated.updatedAt,
          }, { merge: true });
        } else if (entityType === 'staff') {
          await setDoc(doc(db, 'users', entityId), {
            isBlacklisted,
            blacklistReason: updated.blacklistReason,
            status: isBlacklisted ? 'suspended' : 'active',
            updatedAt: updated.updatedAt,
          }, { merge: true });
        }
      } catch (e) {
        console.warn('[UniversalGovernanceService] Error persisting blacklist to Firestore:', e);
      }
    }
  }

  /**
   * Update Archive Status
   */
  public async setArchiveStatus(
    entityType: GovernanceEntityType,
    entityId: string,
    isArchived: boolean,
    actorRole = 'admin',
    actorId = 'admin'
  ): Promise<void> {
    const key = this.getKey(entityType, entityId);
    const existing = this.cache.get(key) || {
      entityId,
      entityType,
      isBlacklisted: false,
      isArchived: false,
      updatedAt: new Date().toISOString(),
    };

    const updated: EntityGovernanceRecord = {
      ...existing,
      isArchived,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };

    this.cache.set(key, updated);
    this.persistToStorage();

    this.recordSecurityAudit({
      action: 'GOVERNANCE_STATUS_CHANGED',
      entityType,
      entityId,
      actorRole,
      actorId,
      reason: isArchived ? 'Entity archived' : 'Entity restored from archive',
      metadata: { isArchived }
    });

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        if (entityType === 'driver') {
          await setDoc(doc(db, 'drivers', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'staff') {
          await setDoc(doc(db, 'users', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'trip') {
          await setDoc(doc(db, 'trips', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'passenger') {
          await setDoc(doc(db, 'customerGovernance', entityId.toLowerCase().trim()), { isArchived }, { merge: true });
        } else if (entityType === 'vehicle') {
          await setDoc(doc(db, 'fleetAssets', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'zone') {
          await setDoc(doc(db, 'zones', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'zone_group') {
          await setDoc(doc(db, 'zoneGroups', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'collection') {
          await setDoc(doc(db, 'locationCollections', entityId), { isArchived }, { merge: true });
        } else if (entityType === 'tariff') {
          await setDoc(doc(db, 'tariffs', entityId), { isArchived }, { merge: true });
        }
      } catch (e) {
        console.warn('[UniversalGovernanceService] Error persisting archive to Firestore:', e);
      }
    }
  }

  /**
   * Universal archive / restore shortcuts
   */
  public async archiveEntity(
    entityType: GovernanceEntityType,
    entityId: string,
    reason?: string,
    actorRole = 'admin',
    actorId = 'admin'
  ): Promise<void> {
    await this.setArchiveStatus(entityType, entityId, true, actorRole, actorId);
  }

  public async restoreEntity(
    entityType: GovernanceEntityType,
    entityId: string,
    actorRole = 'admin',
    actorId = 'admin'
  ): Promise<void> {
    await this.setArchiveStatus(entityType, entityId, false, actorRole, actorId);
  }

  public isEntityArchived(type: GovernanceEntityType, id: string): boolean {
    const rec = this.cache.get(this.getKey(type, id));
    return !!rec?.isArchived;
  }

  /**
   * Record a Security Audit Event
   */
  public recordSecurityAudit(event: Omit<SecurityAuditEvent, 'id' | 'timestamp'>): SecurityAuditEvent {
    const fullEvent: SecurityAuditEvent = {
      ...event,
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };

    this.auditLogs.unshift(fullEvent);
    this.persistToStorage();

    console.warn(`[SECURITY AUDIT] ${fullEvent.action}: ${fullEvent.entityType} ${fullEvent.entityId} - ${fullEvent.reason}`);

    if (isFirebaseConfigured()) {
      try {
        const db = getFirestore(getFirebaseApp());
        setDoc(doc(db, 'securityAudits', fullEvent.id), fullEvent).catch(() => {});
      } catch {}
    }

    return fullEvent;
  }

  /**
   * Get all security audit events
   */
  public getSecurityAudits(): SecurityAuditEvent[] {
    return [...this.auditLogs];
  }

  /**
   * Get a cached record
   */
  public getRecord(type: GovernanceEntityType, id: string): EntityGovernanceRecord | null {
    return this.cache.get(this.getKey(type, id)) || null;
  }

  /**
   * Check if a trip is marked as archived
   */
  public isTripArchived(tripId: string): boolean {
    const rec = this.cache.get(this.getKey('trip', tripId));
    return !!rec?.isArchived;
  }

  /**
   * Return all archived records across all entity types or filtered by type
   */
  public getArchivedEntities(type?: GovernanceEntityType): EntityGovernanceRecord[] {
    const records = Array.from(this.cache.values()).filter((r) => r.isArchived);
    if (type) {
      return records.filter((r) => r.entityType === type);
    }
    return records;
  }

  /**
   * Return all blacklisted records across all entity types or filtered by type
   */
  public getBlacklistedEntities(type?: GovernanceEntityType): EntityGovernanceRecord[] {
    const records = Array.from(this.cache.values()).filter((r) => r.isBlacklisted);
    if (type) {
      return records.filter((r) => r.entityType === type);
    }
    return records;
  }

  /**
   * Return all governance records
   */
  public getAllGovernanceRecords(): EntityGovernanceRecord[] {
    return Array.from(this.cache.values());
  }
}

let instance: UniversalGovernanceService | null = null;
export function getUniversalGovernanceService(): UniversalGovernanceService {
  if (!instance) {
    instance = new UniversalGovernanceService();
  }
  return instance;
}
