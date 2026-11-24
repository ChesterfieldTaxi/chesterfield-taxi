import type { InvoiceRecord } from '../../../../core/types/config';
import type { Trip } from '../../../../core/types/trip';
import { getContactService } from '../../../../core/services/customer/contact.service';
import { getUniversalGovernanceService } from '../../../../core/services/governance/universal-governance.service';
import type { CustomerProfile } from './types';

export function buildCustomerProfilesList(
  trips: ReadonlyArray<Trip>,
  invoices: ReadonlyArray<InvoiceRecord> = []
): CustomerProfile[] {
  const invoiceEmailsSet = new Set<string>();
  for (const inv of invoices) {
    if (inv.customerEmail) invoiceEmailsSet.add(inv.customerEmail.trim().toLowerCase());
    if (inv.customerName) invoiceEmailsSet.add(inv.customerName.trim().toLowerCase());
  }

  const customerMap = new Map<string, CustomerProfile>();

  for (const t of trips) {
    const emailKey = t.passenger?.email || t.passenger?.phone || t.id;
    const passengerName =
      [t.passenger?.firstName, t.passenger?.lastName].filter(Boolean).join(' ') ||
      'Guest Passenger';
    const phone = t.passenger?.phone || 'No phone';
    const fare = Number(t.pricing?.totalFare || t.payment?.amount || 0);
    const isCorpTrip =
      Boolean(t.corporateAccountId) ||
      t.payment?.method === 'account' ||
      t.payment?.method === 'corporate';

    if (customerMap.has(emailKey)) {
      const existing = customerMap.get(emailKey)!;
      existing.tripCount += 1;
      existing.totalSpend += fare;
      if (isCorpTrip) existing.hasInvoicesOrCorporate = true;
    } else {
      customerMap.set(emailKey, {
        id: `cust-${emailKey}`,
        name: passengerName,
        email: t.passenger?.email || 'N/A',
        phone,
        tripCount: 1,
        totalSpend: fare,
        lastRideDate: t.scheduledPickupTime || 'Recent',
        isVip: false,
        preferredVehicle: t.vehicleTier,
        hasInvoicesOrCorporate: isCorpTrip,
      });
    }
  }

  try {
    const savedContacts = getContactService().getAllContacts();
    for (const sc of savedContacts) {
      const key = sc.email && sc.email !== 'N/A' ? sc.email : sc.phone || sc.id;
      const existing = customerMap.get(key);
      customerMap.set(key, {
        id: sc.id,
        name: sc.name,
        email: sc.email || 'N/A',
        phone: sc.phone,
        tripCount: existing ? existing.tripCount : sc.tripCount || 1,
        totalSpend: existing ? existing.totalSpend : sc.totalSpend || 0,
        lastRideDate: existing ? existing.lastRideDate : 'Recent',
        isVip: sc.isVip ?? false,
        corporateAccountName: sc.corporateAccountName,
        hasInvoicesOrCorporate: Boolean(
          sc.corporateAccountName || existing?.hasInvoicesOrCorporate
        ),
        preferredVehicle: sc.preferredVehicleTier,
        notes: sc.notes,
        customerScore: sc.customerScore,
        isBlacklisted: sc.isBlacklisted,
        blacklistReason: sc.blacklistReason,
        isArchived: sc.isArchived,
      });
    }
  } catch {
    // Ignore offline contact read warnings
  }

  const govService = getUniversalGovernanceService();
  return Array.from(customerMap.values()).map((c) => {
    const gov = govService.isPassengerBlacklistedSync(c.phone, c.email);
    const score = govService.calculateCustomerScore({
      completedTrips: c.tripCount,
      cancelledTrips: 0,
      noShows: 0,
      totalSpend: c.totalSpend,
    });
    const hasInv =
      Boolean(c.hasInvoicesOrCorporate || c.corporateAccountName) ||
      (c.email !== 'N/A' && invoiceEmailsSet.has(c.email.toLowerCase())) ||
      invoiceEmailsSet.has(c.name.toLowerCase());

    return {
      ...c,
      hasInvoicesOrCorporate: hasInv,
      customerScore: score,
      isBlacklisted: gov.isBlacklisted,
      blacklistReason: gov.reason,
      isArchived: gov.isArchived,
    };
  });
}
