import type { AppSettings } from '../../../../core/types/config';

export type CustomersSubTab = 'directory' | 'corporate';
export type CustomerArchiveFilter = 'active' | 'archived' | 'blacklist' | 'all';

export type DirectoryViewMode = 'cards' | 'table';
export type CustomerSortField = 'name' | 'tripCount' | 'customerScore';
export type SortDirection = 'asc' | 'desc';

export interface CustomerSortOption {
  id: string;
  field: CustomerSortField;
  direction: SortDirection;
  label: string;
}

export type AlphabetLetter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type AlphabetBucket = 'All' | AlphabetLetter | '#';

export interface DirectoryTableColumn {
  id: string;
  label: string;
  sortField?: CustomerSortField;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

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
