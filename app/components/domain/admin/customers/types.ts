import type { AppSettings } from '../../../../core/types/config';

export type CustomersSubTab = 'directory' | 'corporate';
export type CustomerArchiveFilter = 'active' | 'archived' | 'all';

export interface AdminCustomersSubpageProps {
  settings: AppSettings;
  initialSubTab?: CustomersSubTab;
  onSave?: (updates: Partial<AppSettings>) => Promise<void>;
}

export interface CustomerProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  tripCount: number;
  totalSpend: number;
  lastRideDate: string;
  isVip: boolean;
  corporateAccountName?: string;
  hasInvoicesOrCorporate?: boolean;
  preferredVehicle?: string;
  customerScore?: number;
  notes?: string;
  isBlacklisted?: boolean;
  blacklistReason?: string;
  isArchived?: boolean;
}
