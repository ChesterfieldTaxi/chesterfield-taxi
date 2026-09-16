import React, { useState, useEffect } from "react";
import type { VehicleAssignmentShift } from "../../../core/types/driver";
import { Card } from "../../ui/Card";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { SpinnerIcon, HistoryIcon, SearchIcon, CarIcon, ClockIcon } from "../../ui/Icons";
import { getFirestore, collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { getFirebaseApp, isFirebaseConfigured } from "../../../core/services/firebase";

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

  const fetchShifts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { getVehicleAssignmentService } = await import("../../../core/services/fleet/vehicle-assignment.service");
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <Card className="w-full max-w-4xl bg-white shadow-2xl border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-inner">
               <HistoryIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                Vehicle Shift History
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Temporal mapping of driver vehicle assignments
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold"
          >
            &#x2715;
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 bg-white flex flex-col sm:flex-row gap-4 items-end">
             <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle ID or Unit Number</label>
                <div className="relative">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <CarIcon className="w-4 h-4 text-slate-400" />
                   </div>
                   <input 
                      type="text" 
                      placeholder="e.g. Unit #101"
                      className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                      value={searchVehicleId}
                      onChange={e => setSearchVehicleId(e.target.value)}
                   />
                </div>
             </div>
             
             <div className="w-full sm:w-48">
                <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                <input 
                   type="date"
                   className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-sm focus:ring-2 focus:ring-blue-500"
                   value={searchDate}
                   onChange={e => setSearchDate(e.target.value)}
                />
             </div>
             
             <Button 
                type="button" 
                variant="primary" 
                onClick={fetchShifts}
                className="h-9 px-4 bg-blue-600 hover:bg-blue-700 flex items-center gap-2 font-bold w-full sm:w-auto"
             >
                <SearchIcon className="w-4 h-4" /> Search
             </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
           {isLoading ? (
              <div className="p-16 flex flex-col items-center justify-center text-slate-500">
                 <SpinnerIcon className="w-8 h-8 animate-spin text-blue-600 mb-4" />
                 <p className="font-medium text-sm">Querying shift timeline...</p>
              </div>
           ) : error ? (
              <div className="p-8 text-center text-rose-600 bg-rose-50 m-4 rounded-xl border border-rose-200">
                 <p className="font-bold">{error}</p>
              </div>
           ) : shifts.length === 0 ? (
              <div className="p-16 text-center text-slate-500">
                 <HistoryIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                 <p className="font-bold text-slate-800 text-lg">No Shift Records Found</p>
                 <p className="text-sm mt-1">Try adjusting your search criteria.</p>
              </div>
           ) : (
              <div className="overflow-x-auto custom-scrollbar min-w-full">
                  <table className="w-full text-left text-sm whitespace-nowrap min-w-[650px]">
                     <thead className="bg-white sticky top-0 border-b border-slate-200 shadow-sm z-10">
                    <tr className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                       <th className="px-6 py-3">Shift ID</th>
                       <th className="px-6 py-3">Vehicle</th>
                       <th className="px-6 py-3">Driver</th>
                       <th className="px-6 py-3">Timeline</th>
                       <th className="px-6 py-3">Status</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                    {shifts.map(shift => (
                       <tr key={shift.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                             <span className="font-mono text-xs text-slate-500" title={shift.id}>
                                {shift.id.substring(0,8)}...
                             </span>
                          </td>
                          <td className="px-6 py-4">
                             <div className="font-bold text-slate-900">{shift.vehicleNumber}</div>
                             <div className="text-[10px] text-slate-500 font-mono">ID: {shift.vehicleId.substring(0,8)}</div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                                   &#x1F697;
                                </div>
                                {shift.driverId}
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             <div className="flex flex-col gap-1 text-xs">
                                <div className="flex items-center gap-1.5 text-emerald-700">
                                   <span className="font-bold w-12">Start:</span>
                                   <span>{new Date(shift.startedAt).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600">
                                   <span className="font-bold w-12">End:</span>
                                   <span>{shift.endedAt ? new Date(shift.endedAt).toLocaleString() : "Ongoing"}</span>
                                </div>
                             </div>
                          </td>
                          <td className="px-6 py-4">
                             {shift.status === "active" ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                                   <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                   Active
                                </span>
                             ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 uppercase tracking-wider">
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
      </Card>
    </div>
  );
}
