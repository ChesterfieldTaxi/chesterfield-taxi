import { useCallback, useRef } from 'react';
import type { BookingStopPoint } from './booking-form.utils';

export function createWaypointId(prefix = 'stop', randomChars = 4): string {
  const rand = Math.random()
    .toString(36)
    .slice(2, 2 + Math.max(2, randomChars));
  return `${prefix}-${Date.now()}-${rand}`;
}

export function appendWaypoint<T extends BookingStopPoint>(
  stops: T[],
  options?: {
    maxStops?: number;
    idPrefix?: string;
    createStop?: () => T;
  }
): T[] {
  if (options?.maxStops !== undefined && stops.length >= options.maxStops) {
    return stops;
  }
  const nextItem: T = options?.createStop
    ? options.createStop()
    : options?.idPrefix
    ? ({ id: createWaypointId(options.idPrefix), address: '' } as unknown as T)
    : ({ address: '' } as unknown as T);
  return [...stops, nextItem];
}

export function updateWaypointAt<T extends BookingStopPoint>(
  stops: T[],
  index: number,
  patch: Partial<T>
): T[] {
  return stops.map((stop, idx) => (idx === index ? { ...stop, ...patch } : stop));
}

export function replaceWaypointAt<T extends BookingStopPoint>(
  stops: T[],
  index: number,
  replacement: T
): T[] {
  return stops.map((stop, idx) => (idx === index ? replacement : stop));
}

export function updateWaypointById<T extends BookingStopPoint>(
  stops: T[],
  id: string,
  patch: Partial<T>
): T[] {
  return stops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop));
}

export function removeWaypointAt<T>(stops: T[], index: number): T[] {
  return stops.filter((_, idx) => idx !== index);
}

export function removeWaypointById<T extends BookingStopPoint>(
  stops: T[],
  id: string
): T[] {
  return stops.filter((stop) => stop.id !== id);
}

export interface UseBookingWaypointsOptions<T extends BookingStopPoint> {
  stops: T[];
  onChange: (updater: (prev: T[]) => T[]) => void;
  maxStops?: number;
  idPrefix?: string;
  createStop?: () => T;
}

export interface UseBookingWaypointsResult<T extends BookingStopPoint> {
  stops: T[];
  canAddMore: boolean;
  addStop: () => void;
  updateStopAt: (index: number, patch: Partial<T>) => void;
  replaceStopAt: (index: number, replacement: T) => void;
  updateStopById: (id: string, patch: Partial<T>) => void;
  removeStopAt: (index: number) => void;
  removeStopById: (id: string) => void;
  reverseStops: () => void;
  clearStops: () => void;
}

export function useBookingWaypoints<T extends BookingStopPoint>(
  options: UseBookingWaypointsOptions<T>
): UseBookingWaypointsResult<T> {
  const { stops, onChange, maxStops, idPrefix, createStop } = options;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const createStopRef = useRef(createStop);
  createStopRef.current = createStop;

  const canAddMore = maxStops === undefined ? true : stops.length < maxStops;

  const addStop = useCallback(() => {
    onChangeRef.current((prev) =>
      appendWaypoint(prev, {
        maxStops,
        idPrefix,
        createStop: createStopRef.current,
      })
    );
  }, [maxStops, idPrefix]);

  const updateStopAt = useCallback((index: number, patch: Partial<T>) => {
    onChangeRef.current((prev) => updateWaypointAt(prev, index, patch));
  }, []);

  const replaceStopAt = useCallback((index: number, replacement: T) => {
    onChangeRef.current((prev) => replaceWaypointAt(prev, index, replacement));
  }, []);

  const updateStopById = useCallback((id: string, patch: Partial<T>) => {
    onChangeRef.current((prev) => updateWaypointById(prev, id, patch));
  }, []);

  const removeStopAt = useCallback((index: number) => {
    onChangeRef.current((prev) => removeWaypointAt(prev, index));
  }, []);

  const removeStopById = useCallback((id: string) => {
    onChangeRef.current((prev) => removeWaypointById(prev, id));
  }, []);

  const reverseStops = useCallback(() => {
    onChangeRef.current((prev) => [...prev].reverse());
  }, []);

  const clearStops = useCallback(() => {
    onChangeRef.current(() => []);
  }, []);

  return {
    stops,
    canAddMore,
    addStop,
    updateStopAt,
    replaceStopAt,
    updateStopById,
    removeStopAt,
    removeStopById,
    reverseStops,
    clearStops,
  };
}
