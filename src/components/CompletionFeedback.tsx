import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles } from 'lucide-react';

export interface CompletionSuccessData {
  requestId: string | number;
  amount?: number;
  walletNumber?: string;
  transactionId?: string;
  paymentMethod?: string;
  message?: string;
}

interface CompletionSuccessOverlayProps {
  data: CompletionSuccessData | null;
  onClose: () => void;
}

export function CompletionSuccessOverlay({ data, onClose }: CompletionSuccessOverlayProps) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="completion-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs pointer-events-auto"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: -10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-neutral-900 border border-emerald-500/40 rounded-2xl p-6 w-full max-w-sm shadow-2xl shadow-emerald-950/50 text-center overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-12 -left-12 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-12 -right-12 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl pointer-events-none" />

            {/* Animated Checkmark Icon */}
            <div className="relative mx-auto mb-4 flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20"
              >
                <motion.div
                  initial={{ pathLength: 0, scale: 0.5 }}
                  animate={{ pathLength: 1, scale: 1 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" strokeWidth={2.5} />
                </motion.div>
              </motion.div>
            </div>

            {/* Title & Badge */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="space-y-1"
            >
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                <Sparkles size={12} />
                <span>অর্ডার সম্পন্ন হয়েছে</span>
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Transaction Completed!
              </h3>
            </motion.div>

            {/* Details Box */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              className="mt-4 bg-neutral-950/80 border border-neutral-800/90 rounded-xl p-3.5 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between text-neutral-400">
                <span>Request ID:</span>
                <span className="font-mono font-bold text-blue-400">#{data.requestId}</span>
              </div>

              {data.amount !== undefined && (
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Amount:</span>
                  <span className="font-mono font-extrabold text-emerald-400 text-sm">
                    ৳{Number(data.amount).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {data.walletNumber && (
                <div className="flex items-center justify-between text-neutral-400">
                  <span>Wallet:</span>
                  <span className="font-mono text-neutral-200">{data.walletNumber}</span>
                </div>
              )}

              {data.transactionId && (
                <div className="flex items-center justify-between text-neutral-400 pt-1 border-t border-neutral-800">
                  <span>Tx ID:</span>
                  <span className="font-mono font-bold text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/40">
                    {data.transactionId}
                  </span>
                </div>
              )}
            </motion.div>

            {/* Close Button / Auto-close progress */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-5"
            >
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-900/30 cursor-pointer"
              >
                ঠিক আছে (Dismiss)
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SuccessToastProps {
  message: string | null;
  subMessage?: string;
  onClose?: () => void;
}

export function SuccessToast({ message, subMessage, onClose }: SuccessToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          key="success-toast"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-neutral-900/95 border border-emerald-500/40 text-white px-4 py-3 rounded-xl shadow-2xl shadow-emerald-950/60 backdrop-blur-md max-w-sm"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 size={18} />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-400 truncate">{message}</p>
            {subMessage && (
              <p className="text-[11px] text-neutral-400 truncate font-mono mt-0.5">{subMessage}</p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-300 p-1 text-xs"
            >
              ✕
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
