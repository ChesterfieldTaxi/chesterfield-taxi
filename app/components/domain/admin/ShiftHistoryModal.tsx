import React, { useState, useEffect } from "react";
import type { VehicleAssignmentShift } from "../../../core/types/driver";
import { Button } from "../../ui/Button";
import { SpinnerIcon, HistoryIcon, SearchIcon, CarIcon, XIcon } from "../../ui/Icons";
import { useBottomSheetDragToClose } from "../../../core/hooks/useBottomSheetDragToClose";

export interface ShiftHistoryModalProps {
  vehicleId?: string; // Optional: If provided, pre-filter by this vehicle
  onClose: () => void;
}

export function ShiftHistoryModal({ vehicleId, onClose }: ShiftHistoryModalProps) {
  const [shifts, setShifts] = useState<VehicleAssignmentShift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search parameters
  const [searchVehicleId, setSearchVehicleId] = useState(vehicleId || "");
  const [searchDate, setSearchDate] = useState(new Date().toISOString().slice(0, 10));
  const sheetDrag = useBottomSheetDragToClose({ onClose });

  const fetchShifts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { getVehicleAssignmentService } = await import(
        "../../../core/services/fleet/vehicle-assignment.service"
      );
      const assignmentService = getVehicleAssignmentService();

      let fetchedShifts: VehicleAssignmentShift[] = [];
      if (searchVehicleId || searchDate) {
        fetchedShifts = await assignmentService.getShiftsForVehicle(
          searchVehicleId,
          searchDate ? `${searchDate}T00:00:00` : undefined,
          searchDate ? `${searchDate}T23:59:59` : undefined
        );
      } else {
        fetchedShifts = await assignmentService.getAllShifts(50);
      }

      setShifts(fetchedShifts);
    } catch (err: any) {
      setError(err.message || "Failed to fetch shift history.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  return (
    <div
      className="fixed inset-0 bg-surface-overlay/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={sheetDrag.sheetStyle}
        className="w-full max-w-4xl bg-surface-card rounded-t-3xl sm:rounded-2xl shadow-2xl border-t sm:border border-border-subtle overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0"
      >
        <div
          {...sheetDrag.dragHandlers}
          className="px-4 sm:px-5 pt-2.5 sm:pt-5 pb-3.5 sm:pb-5 border-b border-border-faint bg-surface-subtle shrink-0 touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-surface-strong mx-auto mb-2.5 sm:hidden" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-status-info-bg-strong text-status-info-fg flex items-center justify-center shadow-inner shrink-0">
                <HistoryIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-extrabold text-fg-primary truncate">
                  Vehicle Shift History
                </h3>
                <p className="text-xs text-fg-muted font-medium truncate">
                  Temporal mapping of driver vehicle assignments
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close shift history"
              className="w-8 h-8 rounded-xl bg-surface-emphasis hover:bg-surface-strong text-fg-secondary flex items-center justify-center shrink-0 cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-border-faint bg-surface-card flex flex-col sm:flex-row gap-3 sm:gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-xs font-bold text-fg-secondary mb-1">
              Vehicle ID or Unit Number
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CarIcon className="w-4 h-4 text-fg-subtle" />
              </div>
              <input
                type="text"
                placeholder="e.g. Unit #101"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-strong bg-surface-card text-sm focus:ring-2 focus:ring-blue-500"
                value={searchVehicleId}
                onChange={(e) => setSearchVehicleId(e.target.value)}
              />
            </div>
          </div>

          <div className="w-full sm:w-48">
            <label className="block text-xs font-bold text-fg-secondary mb-1">Date</label>
            <input
              type="date"
              className="w-full h-9 px-3 rounded-lg border border-border-strong bg-surface-card text-sm focus:ring-2 focus:ring-blue-500"
              value={searchDate}
              onChange={(e) => setSearchDate(e.target.value)}
            />
          </div>

          <Button
            type="button"
            variant="primary"
            onClick={fetchShifts}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 font-bold w-full sm:w-auto cursor-pointer"
          >
            <SearchIcon className="w-4 h-4" /> Search
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-0 bg-surface-subtle">
          {isLoading ? (
            <div className="p-16 flex flex-col items-center justify-center text-fg-muted">
              <SpinnerIcon className="w-8 h-8 animate-spin text-blue-600 mb-4" />
              <p className="font-medium text-sm">Querying shift timeline...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-rose-600 bg-status-danger-bg m-4 rounded-xl border border-status-danger-border">
              <p className="font-bold">{error}</p>
            </div>
          ) : shifts.length === 0 ? (
            <div className="p-16 text-center text-fg-muted">
              <HistoryIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-fg-strong text-lg">No Shift Records Found</p>
              <p className="text-sm mt-1">Try adjusting your search criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar min-w-full">
              <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]">
                <thead className="bg-surface-card sticky top-0 border-b border-border-subtle shadow-sm z-10">
                  <tr className="text-fg-muted font-bold uppercase tracking-wider text-[10px]">
                    <th className="px-6 py-3">Shift ID</th>
                    <th className="px-6 py-3">Vehicle</th>
                    <th className="px-6 py-3">Driver</th>
                    <th className="px-6 py-3">Timeline</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-faint bg-surface-card">
                  {shifts.map((shift) => (
                    <tr key={shift.id} className="hover:bg-surface-subtle transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-fg-muted" title={shift.id}>
                          {shift.id.substring(0, 8)}...
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-fg-primary">{shift.vehicleNumber}</div>
                        <div className="text-[10px] text-fg-muted font-mono">
                          ID: {shift.vehicleId.substring(0, 8)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-fg-strong flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-status-info-bg-strong text-status-info-fg flex items-center justify-center shrink-0">
                            <CarIcon className="w-3 h-3" />
                          </div>
                          <span>{shift.driverId}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-1.5 text-status-success-fg">
                            <span className="font-bold w-12">Start:</span>
                            <span>{new Date(shift.startedAt).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-fg-secondary">
                            <span className="font-bold w-12">End:</span>
                            <span>
                              {shift.endedAt ? new Date(shift.endedAt).toLocaleString() : "Ongoing"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {shift.status === "active" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-status-success-bg-strong text-status-success-fg uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-surface-muted text-fg-secondary uppercase tracking-wider">
                            Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
