# Phase 99: Client Directory Performance, Alphabet Pages, Sorting & Table View

## Goal
Optimize the Admin Client (Passenger) Directory to stay fast with 9,000+ entries by bounding DOM rendering via alphabet tabs and page-size pagination, memoizing derived lists, and debouncing search. Add config-driven sorting controls and a secondary Table view alongside the default Cards view.

## Design Decisions
- **Alphabet Pages + Pagination:** Provide `All` + `A`–`Z` + `#` (non-alphabetic/empty names) tabs with single-pass letter counts, paired with page-size pagination (`24`, `48`, `100`, default `24`) within the active tab. Empty letter tabs are visually dimmed/disabled.
- **Sorting Controls:** Config-driven sort options for Name (`A–Z` / `Z–A`), Rides / Trip Count (`High–Low` / `Low–High`), and Reliability Score (`High–Low` / `Low–High`), defaulting to Name `A–Z`. Changing sort, alphabet tab, search, archive filter, or VIP filter resets the current page to `1`.
- **Cards vs. Table View:** Cards remain the default view; a toolbar toggle switches to a secondary Table view (`PassengerDirectoryTable.tsx`) with config-driven columns, sortable headers synced to the sort state, and identical row actions (`Details`, `Edit`, `Archive`/`Restore`, `Purge`). View preference persists in `localStorage` (SSR-guarded).
- **Architecture (`constitution.md`):** Keep all bucketing, filtering, sorting, pagination, and sort/column configuration in pure utilities (`customer-directory.util.ts`) and types (`types.ts`); UI components remain strictly presentational.

## Files to Touch
- `app/components/domain/admin/customers/types.ts` — add `DirectoryViewMode`, `CustomerSortField`, `SortDirection`, `CustomerSortOption`, and `AlphabetBucket` types.
- `app/components/domain/admin/customers/customer-directory.util.ts` — add config constants (`DIRECTORY_SORT_OPTIONS`, `DIRECTORY_PAGE_SIZES`, `ALPHABET_BUCKETS`) and pure helpers (`getAlphabetBucket`, `computeAlphabetCounts`, `filterAndSortCustomers`, `paginateCustomers`).
- `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx` — memoize `blacklistedCustomers`, `nonBlacklistedCustomers`, `activeCustomers`, and `archivedCustomers` with `useMemo`.
- `app/components/domain/admin/customers/PassengerDirectoryTable.tsx` — create secondary Table view component with config-driven columns, synced sort headers, inline status badges, and row actions.
- `app/components/domain/admin/customers/PassengerDirectoryPanel.tsx` — integrate deferred/debounced search, sort selector, `Cards` / `Table` view toggle (`localStorage`-persisted), alphabet page bar, pagination footer, and conditional Cards/Table rendering of the paginated slice.
- `app/components/domain/admin/customers/index.ts` — export `PassengerDirectoryTable` and new directory types as needed.

## Tasks
- [x] Add directory view, sort, and alphabet bucket types to `app/components/domain/admin/customers/types.ts`.
- [x] Implement config constants and pure bucketing, counting, filtering, sorting, and pagination helpers in `app/components/domain/admin/customers/customer-directory.util.ts`.
- [x] Memoize derived customer status arrays in `app/components/domain/admin/subpages/AdminCustomersSubpage.tsx`.
- [x] Create `app/components/domain/admin/customers/PassengerDirectoryTable.tsx` for the secondary Table view with synced sorting and row actions.
- [x] Update `app/components/domain/admin/customers/PassengerDirectoryPanel.tsx` with debounced/deferred search, sort controls, `localStorage`-persisted Cards/Table toggle, `All` + `A–Z` + `#` alphabet bar, and page-size pagination footer.
- [x] Export new component/types in `app/components/domain/admin/customers/index.ts`.
- [x] Run `npm run typecheck` and `npm run build` to verify zero type or build errors.

## Verification
- `npm run typecheck`
- `npm run build`
