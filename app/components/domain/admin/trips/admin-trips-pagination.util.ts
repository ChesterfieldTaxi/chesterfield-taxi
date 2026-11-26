import type { Trip } from '../../../../core/types/trip';

export const ADMIN_TRIPS_PAGE_SIZES = [25, 50, 100] as const;

export interface PaginatedTripsResult {
  items: Trip[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  startIndex: number;
  endIndex: number;
}

/**
 * Slices a trip list into a bounded page with 1-based display indices.
 */
export function paginateTrips(
  trips: ReadonlyArray<Trip>,
  page: number,
  pageSize: number
): PaginatedTripsResult {
  const safePageSize = pageSize > 0 ? pageSize : ADMIN_TRIPS_PAGE_SIZES[0];
  const totalItems = trips.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safePageSize;
  const end = Math.min(start + safePageSize, totalItems);

  return {
    items: trips.slice(start, end),
    totalItems,
    totalPages,
    currentPage,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: end,
  };
}
