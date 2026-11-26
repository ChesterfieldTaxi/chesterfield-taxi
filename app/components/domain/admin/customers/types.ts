import type React from 'react';
import type { AppSettings } from '../../../../core/types/config';

export type CustomersSubTab = 'directory' | 'corporate';
export type CustomersPageMode = 'passengers' | 'corporate';
export type CustomerArchiveFilter = 'active' | 'archived' | 'blacklist' | 'all';

export type DirectoryViewMode = 'cards' | 'table';
export type CustomerSortField = 'name' | 'tripCount' | 'customerScore';
export type CorporateSortField = 'companyName' | 'accountNumber' | 'poRequired' | 'ridersCount';
export type CorporatePoFilter = 'all' | 'po_enforced' | 'po_disabled';
export type SortDirection = 'asc' | 'desc';

export interface CustomerSortOption {
  id: string;
  field: CustomerSortField;
  direction: SortDirection;
  label: string;
}

export interface CorporateSortOption {
  id: string;
  field: CorporateSortField;
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

export interface CorporateTableColumn {
  id: string;
  label: string;
  sortField?: CorporateSortField;
  align?: 'left' | 'right' | 'center';
  hideOnMobile?: boolean;
}

export interface DirectoryToolbarFilterPill {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  activeClassName?: string;
  inactiveClassName?: string;
}

export interface DirectoryToolbarQuickToggle {
  id: string;
  label: string;
  active: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
}

export interface DirectoryToolbarSortOption {
  id: string;
  label: string;
}

export interface DirectoryToolbarAction {
  id: string;
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

export interface AdminCustomersSubpageProps {
  settings: AppSettings;
  mode?: CustomersPageMode;
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
