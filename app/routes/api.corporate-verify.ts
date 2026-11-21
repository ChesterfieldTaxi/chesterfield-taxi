/**
 * Serverless Resource Route: Rate-Limited Corporate Account & PO Verification (/api/corporate/verify)
 *
 * Allows public web checkout (`BookingEngineV2`) to validate a corporate Account #
 * and Purchase Order (PO) against zero-PII hashed `/corporateLookup/{sha256(acctNum)}`
 * without exposing the staff-only `/corporateAccounts` directory.
 */

import type { ActionFunctionArgs } from 'react-router';
import {
  checkRateLimit,
  fetchFirestoreDocumentRest,
  getRequestClientIp,
} from '../core/services/auth/server-auth.server';
import { hashCorporateLookupValue } from '../core/services/corporate-account.service';
import { isFirebaseConfigured } from '../core/services/firebase';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json(
      { verified: false, error: 'Method Not Allowed. Use POST.' },
      { status: 405 }
    );
  }

  const clientIp = getRequestClientIp(request);
  if (!checkRateLimit(`corp_verify:${clientIp}`, 12, 5 * 60_000)) {
    return Response.json(
      {
        verified: false,
        poStatus: 'rate_limited',
        error: 'Too many corporate verification attempts. Please wait a few minutes or call dispatch.',
      },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as {
      accountNumber?: string;
      poNumber?: string;
      estimatedFare?: number;
    };

    const accountNumber = String(body?.accountNumber || '').trim();
    const poNumber = String(body?.poNumber || '').trim();
    const estimatedFare = Number(body?.estimatedFare || 0);

    if (!accountNumber) {
      return Response.json(
        {
          verified: false,
          poStatus: 'missing_account',
          error: 'Please enter a valid Corporate Account Number.',
        },
        { status: 400 }
      );
    }

    if (!isFirebaseConfigured()) {
      return Response.json({
        verified: true,
        unverifiedFallback: true,
        poStatus: 'not_required',
        message: 'Corporate account details recorded for dispatch verification.',
      });
    }

    const acctHash = await hashCorporateLookupValue(accountNumber);
    const lookupDoc = await fetchFirestoreDocumentRest('corporateLookup', acctHash);

    if (!lookupDoc) {
      return Response.json(
        {
          verified: false,
          poStatus: 'not_found',
          error:
            'Corporate Account Number not recognized. Please double-check your Account # or contact dispatch to verify.',
        },
        { status: 404 }
      );
    }

    if (lookupDoc.isActive === false) {
      return Response.json(
        {
          verified: false,
          poStatus: 'inactive',
          error: 'This corporate billing account is currently paused or inactive. Please contact dispatch.',
        },
        { status: 403 }
      );
    }

    const creditLimit = Number(lookupDoc.creditLimit || 0);
    if (creditLimit > 0 && estimatedFare > creditLimit) {
      return Response.json(
        {
          verified: false,
          poStatus: 'credit_limit_exceeded',
          error: `Estimated trip fare ($${estimatedFare.toFixed(2)}) exceeds the account credit limit ($${creditLimit.toLocaleString()}). Please contact dispatch.`,
        },
        { status: 403 }
      );
    }

    const poRequired = Boolean(lookupDoc.poRequired);
    const currentPoHash = typeof lookupDoc.currentPoHash === 'string' ? lookupDoc.currentPoHash : '';
    const revokedHashes: string[] = Array.isArray(lookupDoc.revokedPoHashes)
      ? lookupDoc.revokedPoHashes.map(String)
      : [];

    if (poNumber) {
      const candidateHash = await hashCorporateLookupValue(poNumber);
      if (revokedHashes.includes(candidateHash)) {
        return Response.json(
          {
            verified: false,
            poStatus: 'expired_revoked',
            error:
              'This PO number is no longer active. Please check with your company administrator for a current PO number.',
          },
          { status: 403 }
        );
      }

      if (poRequired && currentPoHash && candidateHash !== currentPoHash) {
        return Response.json(
          {
            verified: false,
            poStatus: 'mismatch',
            error:
              'The PO number entered does not match the active PO number on file for this corporate account.',
          },
          { status: 403 }
        );
      }
    } else if (poRequired) {
      return Response.json(
        {
          verified: false,
          poStatus: 'missing_po',
          error: 'A valid Purchase Order (PO) number is required for this corporate account.',
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        verified: true,
        corporateAccountId: String(lookupDoc.corporateAccountId || ''),
        billingCycle: String(lookupDoc.billingCycle || 'net30'),
        discountPercent: Number(lookupDoc.discountPercent || 0),
        poRequired,
        poStatus: poRequired ? 'valid' : 'not_required',
        message: 'Corporate billing account verified.',
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api.corporate-verify] Error:', msg);
    return Response.json(
      { verified: false, error: 'Unable to verify corporate account right now. Please try again.' },
      { status: 500 }
    );
  }
}
