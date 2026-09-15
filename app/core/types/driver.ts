/**
 * Driver Domain Types & Mobile App Schemas
 * 
 * Defines Driver Profile, Shift Duty Status, Vehicle Assignment,
 * and live Taximeter Extra Fee adjustments.
 */

export type DriverDutyStatus = 'on_duty' | 'off_duty' | 'on_break';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface DriverShiftHours {
  enabled: boolean;
  startHour: string; // "07:00"
  endHour: string;   // "17:00"
}


export interface DriverTimeOff {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason?: string;
  createdAt: string;
}

export interface DriverScheduleConfig {
  weeklyHours: Record<DayOfWeek, DriverShiftHours>;
  timeOffList: DriverTimeOff[];
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  dutyStatus: DriverDutyStatus;
  vehicleUnit: string;
  vehicleTier: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  currentTripId?: string | null;
  zone?: string;
  avatarUrl?: string;
  lastActiveAt?: string;
  schedule?: DriverScheduleConfig;
}


export interface DriverShiftRecord {
  id: string;
  driverId: string;
  startedAt: string;
  endedAt?: string;
  status: DriverDutyStatus;
  vehicleUnit: string;
  tripsCompletedCount: number;
  totalEarnings: number;
}

export interface DriverMeterExtra {
  id: string;
  name: string;
  amount: number;
  category: 'toll' | 'parking' | 'luggage' | 'cleaning' | 'custom';
}
