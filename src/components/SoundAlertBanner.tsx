import React from 'react';
import { Link } from 'react-router-dom';
import { useSound } from '../store/sound';
import { useTheme } from '../store/theme';
import { 
  Bell, 
  X, 
  ArrowRight, 
  Volume2, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  ExternalLink
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function SoundAlertBanner() {
  const { activeAlerts, dismissAlert, clearAllAlerts } = useSound();
  const { resolvedTheme } = useTheme();

  if (activeAlerts.length === 0) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
          title: 'নতুন পেন্ডিং অর্ডার (New Pending)',
          icon: Clock,
          color: 'text-amber-400'
        };
      case 'COMPLETED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          title: 'অর্ডার সম্পন্ন (Completed)',
          icon: CheckCircle2,
          color: 'text-emerald-400'
        };
      case 'CANCELLED':
        return {
          bg: 'bg-red-500/10 text-red-400 border-red-500/30',
          title: 'অর্ডার বাতিল (Cancelled)',
          icon: AlertCircle,
          color: 'text-red-400'
        };
      case 'PARSER_REVIEW_REQUIRED':
        return {
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
          title: 'ম্যানুয়াল রিভিউ (Review Needed)',
          icon: AlertCircle,
          color: 'text-purple-400'
        };
      default:
        return {
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
          title: 'নতুন অর্ডার (New Order)',
          icon: Bell,
          color: 'text-blue-400'
        };
    }
  };

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {activeAlerts.map((alert) => {
        const info = getStatusBadge(alert.status);
        const IconComponent = info.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              "pointer-events-auto rounded-xl p-4 shadow-2xl border transition-all duration-300 transform translate-y-0 backdrop-blur-md",
              resolvedTheme === 'dark'
                ? "bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-black/80"
                : "bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/80"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={cn("p-2 rounded-lg border shrink-0 mt-0.5", info.bg)}>
                  <IconComponent size={16} className={info.color} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border", info.bg)}>
                      {info.title}
                    </span>
                    <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-mono">
                      <Volume2 size={11} className="text-blue-400" />
                      Alert Sound
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-white dark:text-white text-slate-900 font-mono">
                      #{alert.requestId}
                    </span>
                    <span className="text-sm font-extrabold text-emerald-400 font-mono">
                      ৳{Number(alert.amount || 0).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400 dark:text-neutral-400 text-slate-500 flex items-center gap-1.5">
                    <span className="font-medium text-neutral-300 dark:text-neutral-300 text-slate-700">{alert.paymentMethod}</span>
                    {alert.walletNumber && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{alert.walletNumber}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissAlert(alert.id)}
                className="p-1 rounded-md text-neutral-400 hover:text-white dark:hover:text-white text-slate-400 hover:text-slate-700 hover:bg-neutral-800 dark:hover:bg-neutral-800 hover:bg-slate-100 transition shrink-0"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 pt-2.5 border-t border-neutral-800 dark:border-neutral-800 border-slate-200 flex items-center justify-between">
              <span className="text-[10px] text-neutral-500 font-mono">
                {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <Link
                to="/transactions"
                onClick={() => dismissAlert(alert.id)}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
              >
                View Transactions
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        );
      })}

      {activeAlerts.length > 1 && (
        <div className="pointer-events-auto flex justify-end">
          <button
            type="button"
            onClick={clearAllAlerts}
            className="text-[11px] font-medium text-neutral-400 hover:text-white bg-neutral-900/90 border border-neutral-800 px-3 py-1 rounded-lg transition shadow cursor-pointer"
          >
            Clear All Alerts ({activeAlerts.length})
          </button>
        </div>
      )}
    </div>
  );
}
