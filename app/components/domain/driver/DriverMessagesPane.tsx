import React from 'react';
import {
  isAlertReadByDriver,
  type DispatchAlertRecord,
} from '../../../core/services/dispatch/dispatch-alerts.service';
import {
  AlertTriangleIcon,
  BellIcon,
  CheckIcon,
  MailOpenIcon,
} from '../../ui/Icons';

export interface DriverMessagesPaneProps {
  alerts: DispatchAlertRecord[];
  driverUid: string | null;
  onMarkRead: (alertId: string) => void;
}

export const DriverMessagesPane = React.memo(function DriverMessagesPane({
  alerts,
  driverUid,
  onMarkRead,
}: DriverMessagesPaneProps) {
  const unreadCount = alerts.filter((a) => !isAlertReadByDriver(a, driverUid)).length;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-blue-400" />
            Dispatch Messages
          </h2>
          <p className="text-xs text-slate-400">
            Real-time fleet broadcasts and direct messages from dispatch.
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="px-2.5 py-1 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-black">
            {unreadCount} Unread
          </span>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
            <MailOpenIcon className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-white">No Dispatch Messages</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Fleet-wide advisories and direct dispatch alerts will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const isRead = isAlertReadByDriver(alert, driverUid);
            const isUrgent = alert.priority === 'urgent';
            const isDirect = Boolean(alert.targetDriverId);

            return (
              <article
                key={alert.id}
                className={`rounded-3xl border p-4 transition-all space-y-3 ${
                  isUrgent && !isRead
                    ? 'bg-rose-950/50 border-rose-500/60 shadow-lg shadow-rose-950/30'
                    : !isRead
                    ? 'bg-slate-900 border-blue-500/60 shadow-lg shadow-blue-950/20'
                    : isUrgent
                    ? 'bg-slate-900/80 border-rose-900/50'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isRead && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isUrgent ? 'bg-rose-400 animate-pulse' : 'bg-blue-400'
                        }`}
                        aria-label="Unread message"
                      />
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                        isDirect
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}
                    >
                      {isDirect ? 'Direct' : 'Broadcast'}
                    </span>
                    {isUrgent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        <AlertTriangleIcon className="w-3 h-3" />
                        Urgent
                      </span>
                    )}
                    {alert.isPinned && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Pinned
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {alert.timestamp}
                  </span>
                </div>

                <p
                  className={`text-sm leading-relaxed ${
                    !isRead ? 'text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  {alert.text}
                </p>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
                  <span className="text-[11px] text-slate-400 truncate">
                    {alert.createdByName ? `From: ${alert.createdByName}` : `To: ${alert.to}`}
                  </span>

                  {!isRead ? (
                    <button
                      type="button"
                      onClick={() => onMarkRead(alert.id)}
                      className="px-3.5 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                      <CheckIcon className="w-3.5 h-3.5" />
                      <span>Acknowledged</span>
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
});
