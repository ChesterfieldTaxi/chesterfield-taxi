/**
 * Server-Isolated Dispatch Email Store, Env & Persistence Helpers (`dispatch-email-store.server.ts`)
 *
 * Shared internal server state and Firestore REST persistence helpers used by both
 * `dispatch-email-webhook.server.ts` (`/api/email/webhook`) and `dispatch-email.server.ts`
 * (`/api/send-email`).
 */

import {
  DISPATCH_MAILBOX_ADDRESS,
  normalizeRfcMessageId,
  type DispatchEmailRecord,
  type EmailWebhookEventRecord,
} from '../../types/dispatch-email';
import type { DispatchEmailPolicyConfig } from '../../types/config';
import type { VerifiedServerAuth } from '../auth/server-auth.server';
import { normalizeEmail } from '../customer/contact.service';
import { isFirebaseConfigured } from '../firebase';
import {
  getServiceAccountDatastoreToken,
  patchFirestoreDocumentRest,
} from '../payments/stripe-webhook.server';

export const MAX_SERVER_EMAILS = 1000;
export const MAX_SERVER_EMAIL_WEBHOOKS = 500;
export const DEFAULT_SVIX_TOLERANCE_SECONDS = 300;

export interface DispatchEmailServerStore {
  emails: Map<string, DispatchEmailRecord>;
  webhookEvents: Map<string, EmailWebhookEventRecord>;
  rfcMessageIndex: Map<string, string>; // normalized `<id@domain>` -> emailId
  resendIdIndex: Map<string, string>; // resendEmailId -> emailId
  dirtyEmailIds: Set<string>;
  dirtyWebhookEventIds: Set<string>;
}

const dispatchEmailServerStore: DispatchEmailServerStore = ((globalThis as any)
  .__ct_dispatch_email_server_store ||= {
  emails: new Map<string, DispatchEmailRecord>(),
  webhookEvents: new Map<string, EmailWebhookEventRecord>(),
  rfcMessageIndex: new Map<string, string>(),
  resendIdIndex: new Map<string, string>(),
  dirtyEmailIds: new Set<string>(),
  dirtyWebhookEventIds: new Set<string>(),
});

export function getDispatchEmailServerStore(): DispatchEmailServerStore {
  return dispatchEmailServerStore;
}

export function resetDispatchEmailServerStoreForTests(): void {
  dispatchEmailServerStore.emails.clear();
  dispatchEmailServerStore.webhookEvents.clear();
  dispatchEmailServerStore.rfcMessageIndex.clear();
  dispatchEmailServerStore.resendIdIndex.clear();
  dispatchEmailServerStore.dirtyEmailIds.clear();
  dispatchEmailServerStore.dirtyWebhookEventIds.clear();
}

export function enforceBoundedMap<V>(map: Map<string, V>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

export function indexDispatchEmailRecord(record: DispatchEmailRecord): void {
  dispatchEmailServerStore.emails.set(record.id, record);
  enforceBoundedMap(dispatchEmailServerStore.emails, MAX_SERVER_EMAILS);

  dispatchEmailServerStore.resendIdIndex.set(record.id, record.id);
  if (record.resendEmailId) {
    dispatchEmailServerStore.resendIdIndex.set(record.resendEmailId.trim(), record.id);
  }
  const normMsgId = normalizeRfcMessageId(record.rfcMessageId);
  if (normMsgId) {
    dispatchEmailServerStore.rfcMessageIndex.set(normMsgId, record.id);
  }
}

export interface EmailHttpHandlerOptions {
  enforceAuth?: boolean;
  enforceWebhookSignature?: boolean;
  enforceSingleMailbox?: boolean;
  authResolver?: (request: Request) => Promise<VerifiedServerAuth>;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
  toleranceSeconds?: number;
  skipFirestore?: boolean;
  emailPolicyOverride?: Partial<DispatchEmailPolicyConfig>;
}

export function makeEnvReader(envOverride?: Record<string, string | undefined>) {
  return (key: string): string => {
    const raw =
      envOverride && key in envOverride
        ? String(envOverride[key] ?? '')
        : String(process.env[key] ?? '');
    return raw.trim().replace(/^["']|["']$/g, '').trim();
  };
}

export function resolveConfiguredDispatchMailbox(readEnv: (key: string) => string): string {
  return normalizeEmail(readEnv('DISPATCH_MAILBOX_ADDRESS')) || DISPATCH_MAILBOX_ADDRESS;
}

export function shouldEnforceStaffAuth(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const flag = readEnv('EMAIL_ENFORCE_AUTH');
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return (
    readEnv('NODE_ENV') === 'production' ||
    Boolean(readEnv('ADMIN_API_SECRET')) ||
    isFirebaseConfigured()
  );
}

export function shouldEnforceResendWebhookSignature(
  explicitFlag: boolean | undefined,
  readEnv: (key: string) => string,
  webhookSecret: string
): boolean {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  const validateSetting = readEnv('RESEND_VALIDATE_WEBHOOK_SIGNATURE');
  if (validateSetting === 'false') return false;
  if (validateSetting === 'true') return true;
  return readEnv('NODE_ENV') === 'production' || Boolean(webhookSecret);
}

export async function resolveServerFirestoreToken(staffBearerToken?: string): Promise<string | null> {
  if (staffBearerToken && staffBearerToken.trim()) {
    return staffBearerToken.trim();
  }
  return getServiceAccountDatastoreToken();
}

export function findParentEmailByRfcHeaders(
  inReplyTo?: string | null,
  references?: string[]
): DispatchEmailRecord | undefined {
  const normReplyTo = normalizeRfcMessageId(inReplyTo);
  if (normReplyTo) {
    const hitId = dispatchEmailServerStore.rfcMessageIndex.get(normReplyTo);
    if (hitId && dispatchEmailServerStore.emails.has(hitId)) {
      return dispatchEmailServerStore.emails.get(hitId);
    }
  }

  if (Array.isArray(references) && references.length > 0) {
    // Check most immediate parent reference first
    for (let i = references.length - 1; i >= 0; i -= 1) {
      const normRef = normalizeRfcMessageId(references[i]);
      if (!normRef) continue;
      const hitId = dispatchEmailServerStore.rfcMessageIndex.get(normRef);
      if (hitId && dispatchEmailServerStore.emails.has(hitId)) {
        return dispatchEmailServerStore.emails.get(hitId);
      }
    }
  }

  if (normReplyTo) {
    for (const rec of dispatchEmailServerStore.emails.values()) {
      if (normalizeRfcMessageId(rec.rfcMessageId) === normReplyTo) {
        return rec;
      }
    }
  }

  return undefined;
}

export async function persistDispatchEmailAndWebhook(params: {
  emailRecord?: DispatchEmailRecord;
  webhookRecord?: EmailWebhookEventRecord;
  staffBearerToken?: string;
  skipFirestore?: boolean;
}): Promise<boolean> {
  if (params.emailRecord) {
    indexDispatchEmailRecord(params.emailRecord);
    dispatchEmailServerStore.dirtyEmailIds.add(params.emailRecord.id);
  }
  if (params.webhookRecord) {
    dispatchEmailServerStore.webhookEvents.set(params.webhookRecord.id, params.webhookRecord);
    enforceBoundedMap(dispatchEmailServerStore.webhookEvents, MAX_SERVER_EMAIL_WEBHOOKS);
    dispatchEmailServerStore.dirtyWebhookEventIds.add(params.webhookRecord.id);
  }

  if (params.skipFirestore || !isFirebaseConfigured()) {
    return false;
  }

  const token = await resolveServerFirestoreToken(params.staffBearerToken);
  if (!token) {
    return false;
  }

  let allPersisted = true;
  if (params.emailRecord) {
    const ok = await patchFirestoreDocumentRest(
      'dispatchEmails',
      params.emailRecord.id,
      params.emailRecord as unknown as Record<string, unknown>,
      token
    );
    if (ok) {
      dispatchEmailServerStore.dirtyEmailIds.delete(params.emailRecord.id);
    } else {
      allPersisted = false;
    }
  }

  if (params.webhookRecord) {
    const whOk = await patchFirestoreDocumentRest(
      'emailWebhookEvents',
      params.webhookRecord.id,
      params.webhookRecord as unknown as Record<string, unknown>,
      token
    );
    if (whOk) {
      dispatchEmailServerStore.dirtyWebhookEventIds.delete(params.webhookRecord.id);
    } else {
      allPersisted = false;
    }
  }

  return allPersisted;
}
