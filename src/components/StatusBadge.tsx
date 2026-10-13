import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertTriangle, 
  Sliders, 
  RotateCw,
  HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';

export type TransactionStatus = 
  | 'COMPLETED' 
  | 'PENDING' 
  | 'CANCELLED' 
  | 'LIMIT' 
  | 'PARSER_REVIEW_REQUIRED' 
  | 'PROCESSING'
  | string;

interface StatusBadgeProps {
  status: TransactionStatus;
  reminderSent?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showDot?: boolean;
  showBengali?: boolean;
  className?: string;
}

export const STATUS_CONFIG: Record<string, {
  label: string;
  bnLabel: string;
  bgDark: string;
  textDark: string;
  borderDark: string;
  bgLight: string;
  textLight: string;
  borderLight: string;
  dotColor: string;
  dotRingColor?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentColor: string;
  leftBorderClass: string;
  rowHoverClass: string;
}> = {
  COMPLETED: {
    label: 'COMPLETED',
    bnLabel: 'সম্পন্ন',
    bgDark: 'bg-emerald-500/15',
    textDark: 'text-emerald-400',
    borderDark: 'border-emerald-500/35',
    bgLight: 'bg-emerald-50',
    textLight: 'text-emerald-800',
    borderLight: 'border-emerald-300',
    dotColor: 'bg-emerald-400',
    dotRingColor: 'ring-emerald-400/30',
    icon: CheckCircle2,
    accentColor: '#10b981',
    leftBorderClass: 'border-l-emerald-500',
    rowHoverClass: 'hover:bg-emerald-950/10 dark:hover:bg-emerald-950/20'
  },
  PENDING: {
    label: 'PENDING',
    bnLabel: 'অপেক্ষারত',
    bgDark: 'bg-amber-500/15',
    textDark: 'text-amber-300',
    borderDark: 'border-amber-500/40',
    bgLight: 'bg-amber-50',
    textLight: 'text-amber-800',
    borderLight: 'border-amber-300',
    dotColor: 'bg-amber-400',
    dotRingColor: 'ring-amber-400/40',
    icon: Clock,
    accentColor: '#f59e0b',
    leftBorderClass: 'border-l-amber-500',
    rowHoverClass: 'hover:bg-amber-950/10 dark:hover:bg-amber-950/20'
  },
  CANCELLED: {
    label: 'CANCELLED',
    bnLabel: 'বাতিল',
    bgDark: 'bg-rose-500/15',
    textDark: 'text-rose-400',
    borderDark: 'border-rose-500/35',
    bgLight: 'bg-rose-50',
    textLight: 'text-rose-800',
    borderLight: 'border-rose-300',
    dotColor: 'bg-rose-400',
    dotRingColor: 'ring-rose-400/30',
    icon: XCircle,
    accentColor: '#f43f5e',
    leftBorderClass: 'border-l-rose-500',
    rowHoverClass: 'hover:bg-rose-950/10 dark:hover:bg-rose-950/20'
  },
  LIMIT: {
    label: 'LIMIT',
    bnLabel: 'লিমিট অতিক্রম',
    bgDark: 'bg-orange-500/15',
    textDark: 'text-orange-400',
    borderDark: 'border-orange-500/35',
    bgLight: 'bg-orange-50',
    textLight: 'text-orange-800',
    borderLight: 'border-orange-300',
    dotColor: 'bg-orange-400',
    dotRingColor: 'ring-orange-400/30',
    icon: AlertTriangle,
    accentColor: '#f97316',
    leftBorderClass: 'border-l-orange-500',
    rowHoverClass: 'hover:bg-orange-950/10 dark:hover:bg-orange-950/20'
  },
  PARSER_REVIEW_REQUIRED: {
    label: 'REVIEW REQUIRED',
    bnLabel: 'রিভিউ প্রয়োজন',
    bgDark: 'bg-purple-500/15',
    textDark: 'text-purple-300',
    borderDark: 'border-purple-500/35',
    bgLight: 'bg-purple-50',
    textLight: 'text-purple-800',
    borderLight: 'border-purple-300',
    dotColor: 'bg-purple-400',
    dotRingColor: 'ring-purple-400/30',
    icon: Sliders,
    accentColor: '#a855f7',
    leftBorderClass: 'border-l-purple-500',
    rowHoverClass: 'hover:bg-purple-950/10 dark:hover:bg-purple-950/20'
  },
  PROCESSING: {
    label: 'PROCESSING',
    bnLabel: 'প্রক্রিয়াকরণ',
    bgDark: 'bg-sky-500/15',
    textDark: 'text-sky-300',
    borderDark: 'border-sky-500/35',
    bgLight: 'bg-sky-50',
    textLight: 'text-sky-800',
    borderLight: 'border-sky-300',
    dotColor: 'bg-sky-400',
    dotRingColor: 'ring-sky-400/30',
    icon: RotateCw,
    accentColor: '#0ea5e9',
    leftBorderClass: 'border-l-sky-500',
    rowHoverClass: 'hover:bg-sky-950/10 dark:hover:bg-sky-950/20'
  }
};

const DEFAULT_STATUS_CONFIG = {
  label: 'UNKNOWN',
  bnLabel: 'অজানা',
  bgDark: 'bg-neutral-800',
  textDark: 'text-neutral-300',
  borderDark: 'border-neutral-700',
  bgLight: 'bg-neutral-100',
  textLight: 'text-neutral-700',
  borderLight: 'border-neutral-300',
  dotColor: 'bg-neutral-400',
  dotRingColor: 'ring-neutral-400/30',
  icon: HelpCircle,
  accentColor: '#737373',
  leftBorderClass: 'border-l-neutral-600',
  rowHoverClass: 'hover:bg-neutral-900/50'
};

export function getStatusMeta(status: string) {
  const upper = (status || '').toUpperCase().trim();
  return STATUS_CONFIG[upper] || {
    ...DEFAULT_STATUS_CONFIG,
    label: status ? status.replace(/_/g, ' ') : 'UNKNOWN'
  };
}

export default function StatusBadge({
  status,
  reminderSent,
  size = 'sm',
  showIcon = true,
  showDot = true,
  showBengali = false,
  className
}: StatusBadgeProps) {
  const upperStatus = (status || '').toUpperCase().trim();
  const config = getStatusMeta(upperStatus);
  const Icon = config.icon;
  const isPendingAlert = upperStatus === 'PENDING' && reminderSent === 1;

  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[10px] gap-1',
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-xs font-semibold gap-2',
    lg: 'px-3.5 py-2 text-sm font-semibold gap-2'
  };

  const iconSizes = {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-medium rounded-full border shadow-xs select-none transition-all duration-200 tracking-wide",
        sizeClasses[size],
        config.bgDark,
        config.textDark,
        config.borderDark,
        // Light mode variants
        "light:bg-opacity-100",
        isPendingAlert && "animate-pulse ring-2 ring-amber-500/50 shadow-amber-500/20 font-bold",
        className
      )}
      title={`${config.label} - ${config.bnLabel}`}
    >
      {/* Live Pulsing Dot / Indicator */}
      {showDot && (
        <span className="relative flex h-2 w-2 items-center justify-center shrink-0">
          {upperStatus === 'PENDING' && (
            <span
              className={cn(
                "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                config.dotColor
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-1.5 w-1.5",
              config.dotColor
            )}
          />
        </span>
      )}

      {/* Status Icon */}
      {showIcon && (
        <Icon
          size={iconSizes[size]}
          className={cn(
            "shrink-0",
            upperStatus === 'PROCESSING' && "animate-spin"
          )}
        />
      )}

      {/* Text Label */}
      <span className="whitespace-nowrap font-sans font-semibold">
        {isPendingAlert ? 'PENDING (ALERT)' : config.label}
        {showBengali && (
          <span className="ml-1 text-[10px] opacity-80 font-normal">
            ({config.bnLabel})
          </span>
        )}
      </span>
    </span>
  );
}
