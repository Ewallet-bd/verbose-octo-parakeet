import { apiFetch } from "../lib/api";
import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../store/auth';
import { useSound } from '../store/sound';
import { 
  Search, 
  Filter, 
  Download, 
  Edit2, 
  Trash2, 
  X, 
  RefreshCw, 
  ArrowUpDown, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Sliders, 
  Layers, 
  ChevronLeft, 
  ChevronRight,
  Info,
  Calendar,
  Wallet,
  Copy,
  Check,
  Send
} from 'lucide-react';
import { cn } from '../lib/utils';
import { formatBDDateTime, getBDDateString } from '../lib/timezone';
import StatusBadge, { getStatusMeta, TransactionStatus } from '../components/StatusBadge';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import { CompletionSuccessOverlay, CompletionSuccessData, SuccessToast } from '../components/CompletionFeedback';

type StatusFilterType = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'LIMIT' | 'PARSER_REVIEW_REQUIRED';

export default function Transactions() {
  const { token } = useAuth();
  const { playSoundForStatus } = useSound();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filters & Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<StatusFilterType>('ALL');
  const [selectedMethodFilter, setSelectedMethodFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // History & Server Metadata
  const [historyLimit, setHistoryLimit] = useState<number>(1000);
  const [totalDatabaseCount, setTotalDatabaseCount] = useState<number>(0);
  const [serverCounts, setServerCounts] = useState<{
    ALL: number;
    PENDING: number;
    COMPLETED: number;
    CANCELLED: number;
    LIMIT: number;
    PARSER_REVIEW_REQUIRED: number;
    pendingAlerts: number;
  } | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);

  // Modals & Feedback
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [completionSuccess, setCompletionSuccess] = useState<CompletionSuccessData | null>(null);
  const [statusToast, setStatusToast] = useState<{ message: string; sub?: string } | null>(null);
  const [dispatchingTx, setDispatchingTx] = useState<any>(null);
  const [connectedGroups, setConnectedGroups] = useState<any[]>([]);
  const [dispatchChatId, setDispatchChatId] = useState('');
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  
  const { copy: copyTxId, copiedText: copiedTxId, toastMessage } = useCopyToClipboard();

  const fetchConnectedGroupsForDispatch = async () => {
    try {
      const res = await apiFetch('/api/routing-rules', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConnectedGroups(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch routing rules for dispatch:", err);
    }
  };

  useEffect(() => {
    fetchConnectedGroupsForDispatch();
  }, [token]);

  const handleManualDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchingTx || !dispatchChatId) return;
    setDispatchLoading(true);
    setDispatchError(null);
    try {
      const res = await apiFetch(`/api/transactions/${dispatchingTx.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId: dispatchChatId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusToast({ message: 'Order dispatched successfully to group!' });
        setDispatchingTx(null);
        setDispatchChatId('');
        fetchTransactions(true);
      } else {
        setDispatchError(data.error || 'Failed to dispatch order');
      }
    } catch (err) {
      setDispatchError('An error occurred during dispatch.');
    } finally {
      setDispatchLoading(false);
    }
  };

  const fetchTransactions = (silent = false, customLimit?: number, serverSearchQuery?: string) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    
    const limitToFetch = customLimit !== undefined ? customLimit : historyLimit;
    const params = new URLSearchParams();
    params.set('limit', String(limitToFetch));
    if (serverSearchQuery) {
      params.set('search', serverSearchQuery);
    }
    
    apiFetch(`/api/transactions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(res => {
        if (res.error) {
          console.error(res.error);
          setData([]);
        } else {
          setData(res.data || []);
          if (res.total !== undefined) {
            setTotalDatabaseCount(res.total);
          }
          if (res.counts) {
            setServerCounts(res.counts);
          }
        }
      })
      .catch(err => {
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
        setIsSearchingServer(false);
      });
  };

  const handleHistoryLimitChange = (newLimit: number) => {
    setHistoryLimit(newLimit);
    fetchTransactions(false, newLimit);
  };

  const handleSearchEntireDatabase = () => {
    if (!searchTerm.trim()) return;
    setIsSearchingServer(true);
    fetchTransactions(false, 5000, searchTerm.trim());
  };

  useEffect(() => {
    fetchTransactions();
    // Realtime polling every 6 seconds for fresh statuses
    const interval = setInterval(() => {
      fetchTransactions(true);
    }, 6000);
    return () => clearInterval(interval);
  }, [token, historyLimit]);

  const handleDelete = async () => {
    if (!deletingTx) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/transactions/${deletingTx.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchTransactions(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
      setDeletingTx(null);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setEditError(null);

    const rawTxId = editingTx.transactionId ? String(editingTx.transactionId).trim() : '';
    const amountVal = Number(editingTx.amount);

    if (isNaN(amountVal) || Math.abs(amountVal % 1) > 0.001) {
      setEditError('❌ খুচরা পয়সা (দশমিক সংখ্যা) দিয়ে অ্যামাউন্ট এন্ট্রি বা এডিট করা যাবে না। শুধুমাত্র পূর্ণ সংখ্যায় অ্যামাউন্ট গ্রহণযোগ্য।');
      return;
    }

    // If status is COMPLETED, transaction ID is strictly required
    if (editingTx.status === 'COMPLETED') {
      if (!rawTxId) {
        setEditError('❌ অর্ডার কমপ্লিট করার জন্য ট্রানজেকশন আইডি প্রদান করা আবশ্যক।');
        return;
      }
    }

    // If transaction ID is entered, validate:
    // Rule: সব বড় হাতের হবে, ছোট হাতের দিলে কমপ্লিট হবে না
    if (rawTxId) {
      if (/[a-z]/.test(rawTxId)) {
        setEditError('❌ ছোট হাতের অক্ষর দিলে কমপ্লিট হবে না। ট্রানজেকশন আইডি অবশ্যই সব বড় হাতের (UPPERCASE) হতে হবে (যেমন: DIC2EXGJ5U, 75X91WLR)।');
        return;
      }
      if (/\s/.test(rawTxId)) {
        setEditError('❌ ট্রানজেকশন আইডিতে কোনো স্পেস থাকতে পারবে না।');
        return;
      }
      if (!/^[A-Z0-9]{6,20}$/.test(rawTxId)) {
        setEditError('❌ ট্রানজেকশন আইডি শুধুমাত্র বড় হাতের ইংরেজি অক্ষর (A-Z) ও সংখ্যা (0-9) হতে হবে (যেমন: DIC2EXGJ5U, 75X91WLR)।');
        return;
      }
    }

    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/transactions/${editingTx.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({
          amount: Number(editingTx.amount),
          walletNumber: editingTx.walletNumber,
          status: editingTx.status,
          transactionId: rawTxId ? rawTxId.toUpperCase() : null,
          paymentMethod: editingTx.paymentMethod
        })
      });
      if (res.ok) {
        if (editingTx.status) {
          playSoundForStatus(editingTx.status);
        }

        const isMarkedCompleted = editingTx.status === 'COMPLETED';
        const updatedReqId = editingTx.requestId;
        const updatedAmount = Number(editingTx.amount);
        const updatedWallet = editingTx.walletNumber;
        const updatedTxId = rawTxId ? rawTxId.toUpperCase() : undefined;
        const updatedMethod = editingTx.paymentMethod;

        fetchTransactions(true);
        setEditingTx(null);
        setEditError(null);

        if (isMarkedCompleted) {
          setCompletionSuccess({
            requestId: updatedReqId,
            amount: updatedAmount,
            walletNumber: updatedWallet,
            transactionId: updatedTxId,
            paymentMethod: updatedMethod,
          });
          // Auto close the overlay after 3.2 seconds if not manually dismissed
          setTimeout(() => {
            setCompletionSuccess((prev) => (prev && prev.requestId === updatedReqId ? null : prev));
          }, 3200);
        } else {
          setStatusToast({
            message: `Order #${updatedReqId} updated to ${editingTx.status}`,
            sub: `৳${updatedAmount.toLocaleString()} • ${updatedWallet}`
          });
          setTimeout(() => setStatusToast(null), 3000);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || 'Failed to update transaction.');
      }
    } catch (err: any) {
      console.error(err);
      setEditError(err.message || 'An unexpected error occurred.');
    } finally {
      setActionLoading(false);
    }
  };

  // Status Counts for Tabs
  const statusCounts = useMemo(() => {
    // If we have server counts and no specific search term or date filter is applied, use global server counts
    if (serverCounts && !searchTerm.trim() && !startDate && !endDate && selectedMethodFilter === 'ALL') {
      return serverCounts;
    }

    const counts = {
      ALL: data.length,
      PENDING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      LIMIT: 0,
      PARSER_REVIEW_REQUIRED: 0,
      pendingAlerts: 0
    };

    data.forEach((tx: any) => {
      const st = (tx.status || '').toUpperCase();
      if (st === 'PENDING') {
        counts.PENDING++;
        if (tx.reminderSent === 1) counts.pendingAlerts++;
      } else if (st === 'COMPLETED') {
        counts.COMPLETED++;
      } else if (st === 'CANCELLED') {
        counts.CANCELLED++;
      } else if (st === 'LIMIT') {
        counts.LIMIT++;
      } else if (st === 'PARSER_REVIEW_REQUIRED') {
        counts.PARSER_REVIEW_REQUIRED++;
      }
    });

    return counts;
  }, [data, serverCounts, searchTerm, startDate, endDate, selectedMethodFilter]);

  // Filtered & Sorted Transactions
  const filteredData = useMemo(() => {
    return data.filter((tx: any) => {
      // 1. Status Filter
      if (selectedStatusFilter !== 'ALL') {
        if ((tx.status || '').toUpperCase() !== selectedStatusFilter) {
          return false;
        }
      }

      // 2. Method Filter
      if (selectedMethodFilter !== 'ALL') {
        if ((tx.paymentMethod || '').toUpperCase() !== selectedMethodFilter.toUpperCase()) {
          return false;
        }
      }
      
      // 3. Date Range Filter
      if (startDate || endDate) {
        const txDate = getBDDateString(tx.createdAt || Date.now());
        if (startDate && txDate < startDate) return false;
        if (endDate && txDate > endDate) return false;
      }

      // 4. Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const reqId = (tx.requestId || '').toLowerCase();
        const txId = (tx.transactionId || '').toLowerCase();
        const group = (tx.assignedUser || '').toLowerCase();
        const wallet = (tx.walletNumber || '').toLowerCase();
        const method = (tx.paymentMethod || '').toLowerCase();
        const completedBy = (tx.completedBy || '').toLowerCase();
        const amountStr = String(tx.amount || '');

        const match = 
          reqId.includes(term) || 
          txId.includes(term) || 
          group.includes(term) || 
          wallet.includes(term) || 
          method.includes(term) ||
          completedBy.includes(term) ||
          amountStr.includes(term);

        if (!match) return false;
      }

      return true;
    }).sort((a: any, b: any) => {
      if (sortBy === 'date_desc') {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (sortBy === 'date_asc') {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      if (sortBy === 'amount_desc') {
        return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      }
      if (sortBy === 'amount_asc') {
        return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      }
      return 0;
    });
  }, [data, selectedStatusFilter, selectedMethodFilter, searchTerm, sortBy, startDate, endDate]);

  // Pagination slicing
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatusFilter, selectedMethodFilter, searchTerm, pageSize, sortBy, startDate, endDate]);

  // CSV Export Handler
  const handleExportCSV = () => {
    if (filteredData.length === 0) return;
    
    const headers = ["Request ID", "Date", "Payment Method", "Wallet Number", "Amount (BDT)", "Status", "Transaction ID", "Completed By", "Telegram Group"];
    
    const rows = filteredData.map(tx => [
      `"${tx.requestId || ''}"`,
      `"${formatBDDateTime(tx.createdAt || Date.now())}"`,
      `"${tx.paymentMethod || ''}"`,
      `"${tx.walletNumber || ''}"`,
      tx.amount || 0,
      `"${tx.status || ''}"`,
      `"${tx.transactionId || ''}"`,
      `"${tx.completedBy || ''}"`,
      `"${tx.assignedUser || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `transactions_${selectedStatusFilter.toLowerCase()}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Payment Method Badge Helper
  const renderMethodBadge = (method: string) => {
    const upper = (method || '').toUpperCase();
    let style = "bg-neutral-800 text-neutral-300 border-neutral-700";
    
    if (upper === 'BKASH') {
      style = "bg-pink-500/15 text-pink-400 border-pink-500/30";
    } else if (upper === 'NAGAD') {
      style = "bg-amber-500/15 text-amber-400 border-amber-500/30";
    } else if (upper === 'ROCKET') {
      style = "bg-purple-500/15 text-purple-400 border-purple-500/30";
    } else if (upper === 'UPAY') {
      style = "bg-sky-500/15 text-sky-400 border-sky-500/30";
    }

    return (
      <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold font-mono tracking-wider border shadow-2xs uppercase", style)}>
        {method || 'N/A'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-white tracking-tight">Transactions & Orders</h1>
            <span className="bg-neutral-800 text-neutral-300 text-xs px-2.5 py-0.5 rounded-full font-mono border border-neutral-700">
              {data.length} Loaded {totalDatabaseCount > data.length ? `(of ${totalDatabaseCount} Total)` : 'Orders'}
            </span>
            {totalDatabaseCount > data.length && (
              <button
                type="button"
                onClick={() => handleHistoryLimitChange(10000)}
                className="text-[11px] bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-medium transition cursor-pointer flex items-center gap-1"
                title="Load all historical orders from database"
              >
                <span>Load All ({totalDatabaseCount})</span>
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time status monitoring, complete order history, and manual overrides
          </p>
        </div>
        
        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
          {/* History Limit Selector */}
          <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs">
            <Clock size={13} className="text-neutral-400" />
            <span className="text-[11px] text-neutral-500 hidden sm:inline">Depth:</span>
            <select
              value={historyLimit}
              onChange={(e) => handleHistoryLimitChange(Number(e.target.value))}
              className="bg-transparent text-neutral-300 text-xs focus:outline-none cursor-pointer font-medium"
              title="Select how many past transactions to load"
            >
              <option value={250} className="bg-neutral-900 text-neutral-200">250 Orders</option>
              <option value={500} className="bg-neutral-900 text-neutral-200">500 Orders</option>
              <option value={1000} className="bg-neutral-900 text-neutral-200">1,000 Orders (Default)</option>
              <option value={2500} className="bg-neutral-900 text-neutral-200">2,500 Orders</option>
              <option value={5000} className="bg-neutral-900 text-neutral-200">5,000 Orders</option>
              <option value={10000} className="bg-neutral-900 text-neutral-200">All History (সব হিস্ট্রি)</option>
            </select>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => fetchTransactions(true)}
            disabled={isRefreshing}
            className="flex items-center justify-center px-3 py-2 border border-neutral-700 rounded-lg bg-neutral-950 text-neutral-300 hover:bg-neutral-800 transition cursor-pointer text-xs font-medium"
            title="Refresh transactions"
          >
            <RefreshCw size={14} className={cn("mr-1.5", isRefreshing && "animate-spin text-blue-400")} />
            <span>Refresh</span>
          </button>

          {/* Export CSV Button */}
          <button 
            type="button"
            onClick={handleExportCSV}
            disabled={filteredData.length === 0}
            className="flex items-center justify-center px-3 py-2 border border-neutral-700 rounded-lg bg-neutral-950 text-neutral-300 hover:bg-neutral-800 hover:text-white transition cursor-pointer text-xs font-medium disabled:opacity-50"
            title="Export filtered transactions to CSV"
          >
            <Download size={14} className="mr-1.5 text-emerald-400" />
            <span>Export CSV ({filteredData.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COLOR-CODED STATUS FILTER TABS BAR */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2 px-1">
          <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={13} className="text-blue-400" />
            Quick Status Filter (Color-Coded)
          </span>
          <span className="text-[11px] text-neutral-500 font-mono">
            Showing {filteredData.length} of {data.length}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {/* TAB 1: ALL */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('ALL')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'ALL'
                ? "bg-neutral-800 text-white border-neutral-600 shadow-md ring-1 ring-neutral-500/50"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-neutral-800/80 hover:text-neutral-200"
            )}
          >
            <span>All Orders</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold",
              selectedStatusFilter === 'ALL' ? "bg-white text-black" : "bg-neutral-800 text-neutral-400"
            )}>
              {statusCounts.ALL}
            </span>
          </button>

          {/* TAB 2: PENDING (YELLOW / AMBER) */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('PENDING')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'PENDING'
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-950/40 ring-1 ring-amber-500"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-amber-950/20 hover:text-amber-300 hover:border-amber-500/30"
            )}
          >
            <span className="relative flex h-2 w-2 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400" />
            </span>
            <Clock size={13} className="text-amber-400" />
            <span>PENDING (Yellow)</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border",
              selectedStatusFilter === 'PENDING'
                ? "bg-amber-400 text-neutral-950 border-amber-300"
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            )}>
              {statusCounts.PENDING}
            </span>
            {statusCounts.pendingAlerts > 0 && (
              <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-mono font-extrabold animate-pulse">
                {statusCounts.pendingAlerts} ALERTS
              </span>
            )}
          </button>

          {/* TAB 3: COMPLETED (GREEN / EMERALD) */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('COMPLETED')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'COMPLETED'
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-emerald-950/20 hover:text-emerald-300 hover:border-emerald-500/30"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>COMPLETED (Green)</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border",
              selectedStatusFilter === 'COMPLETED'
                ? "bg-emerald-400 text-neutral-950 border-emerald-300"
                : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
            )}>
              {statusCounts.COMPLETED}
            </span>
          </button>

          {/* TAB 4: CANCELLED (RED / ROSE) */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('CANCELLED')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'CANCELLED'
                ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-md shadow-rose-950/40 ring-1 ring-rose-500"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-rose-950/20 hover:text-rose-300 hover:border-rose-500/30"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            <XCircle size={13} className="text-rose-400" />
            <span>CANCELLED (Red)</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border",
              selectedStatusFilter === 'CANCELLED'
                ? "bg-rose-400 text-neutral-950 border-rose-300"
                : "bg-rose-500/15 text-rose-300 border-rose-500/30"
            )}>
              {statusCounts.CANCELLED}
            </span>
          </button>

          {/* TAB 5: PARSER REVIEW REQUIRED (PURPLE) */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('PARSER_REVIEW_REQUIRED')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'PARSER_REVIEW_REQUIRED'
                ? "bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md shadow-purple-950/40 ring-1 ring-purple-500"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-purple-950/20 hover:text-purple-300 hover:border-purple-500/30"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <Sliders size={13} className="text-purple-400" />
            <span>REVIEW (Purple)</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border",
              selectedStatusFilter === 'PARSER_REVIEW_REQUIRED'
                ? "bg-purple-400 text-neutral-950 border-purple-300"
                : "bg-purple-500/15 text-purple-300 border-purple-500/30"
            )}>
              {statusCounts.PARSER_REVIEW_REQUIRED}
            </span>
          </button>

          {/* TAB 6: LIMIT (ORANGE) */}
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('LIMIT')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 shrink-0 transition-all cursor-pointer",
              selectedStatusFilter === 'LIMIT'
                ? "bg-orange-500/20 text-orange-300 border-orange-500/50 shadow-md shadow-orange-950/40 ring-1 ring-orange-500"
                : "bg-neutral-900/60 text-neutral-400 border-neutral-800 hover:bg-orange-950/20 hover:text-orange-300 hover:border-orange-500/30"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <AlertTriangle size={13} className="text-orange-400" />
            <span>LIMIT (Orange)</span>
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border",
              selectedStatusFilter === 'LIMIT'
                ? "bg-orange-400 text-neutral-950 border-orange-300"
                : "bg-orange-500/15 text-orange-300 border-orange-500/30"
            )}>
              {statusCounts.LIMIT}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SEARCH AND EXTENDED CONTROLS BAR */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
        {/* Search Input */}
        <div className="sm:col-span-4 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
            <Search size={15} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Request ID, Tx ID, Wallet, Group, or Amount..."
            className="block w-full pl-9 pr-8 py-2 text-xs font-medium border border-neutral-800 rounded-lg bg-neutral-950 text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-neutral-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Date Filters */}
        <div className="sm:col-span-4 flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-2 py-2 text-xs font-medium border border-neutral-800 rounded-lg bg-neutral-950 text-neutral-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          />
          <span className="text-neutral-500">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-2 py-2 text-xs font-medium border border-neutral-800 rounded-lg bg-neutral-950 text-neutral-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          />
          {(startDate || endDate) && (
            <button onClick={() => { setStartDate(''); setEndDate(''); }} className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Payment Method Filter */}
        <div className="sm:col-span-2">
          <select
            value={selectedMethodFilter}
            onChange={(e) => setSelectedMethodFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium border border-neutral-800 rounded-lg bg-neutral-950 text-neutral-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="ALL">All Payment Methods</option>
            <option value="NAGAD">NAGAD (নগদ)</option>
            <option value="BKASH">BKASH (বিকাশ)</option>
            <option value="ROCKET">ROCKET (রকেট)</option>
            <option value="UPAY">UPAY (উপায়)</option>
          </select>
        </div>

        {/* Sort Dropdown */}
        <div className="sm:col-span-2">
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="w-full px-3 py-2 text-xs font-medium border border-neutral-800 rounded-lg bg-neutral-950 text-neutral-300 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="date_desc">Newest First (Date ↓)</option>
            <option value="date_asc">Oldest First (Date ↑)</option>
            <option value="amount_desc">Amount: High to Low (৳ ↓)</option>
            <option value="amount_asc">Amount: Low to High (৳ ↑)</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MAIN TRANSACTIONS TABLE WITH COLOR CODED STATUS BADGES */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-400">
            <thead className="text-[11px] uppercase bg-neutral-900/90 border-b border-neutral-800 text-neutral-400 font-semibold tracking-wider">
              <tr>
                <th scope="col" className="px-5 py-3.5">Status & Indicator</th>
                <th scope="col" className="px-4 py-3.5">Request ID</th>
                <th scope="col" className="px-4 py-3.5">Date & Time</th>
                <th scope="col" className="px-4 py-3.5">Method</th>
                <th scope="col" className="px-4 py-3.5">Wallet Number</th>
                <th scope="col" className="px-4 py-3.5">Amount</th>
                <th scope="col" className="px-4 py-3.5">Transaction ID</th>
                <th scope="col" className="px-4 py-3.5">Assigned Group</th>
                <th scope="col" className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/40 font-mono text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-neutral-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="animate-spin text-blue-500" size={22} />
                      <span className="font-sans text-sm">Loading transactions...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-neutral-500">
                    <div className="flex flex-col items-center justify-center gap-2 font-sans">
                      <Info size={24} className="text-neutral-600" />
                      <span className="text-sm text-neutral-400 font-medium">No matching transactions found</span>
                      <p className="text-xs text-neutral-500">
                        {searchTerm || selectedStatusFilter !== 'ALL' || selectedMethodFilter !== 'ALL'
                          ? 'Try resetting the search terms or status filters above.'
                          : 'Orders received via bot or manual entry will appear here instantly.'}
                      </p>
                      {searchTerm.trim() && (
                        <button
                          type="button"
                          onClick={handleSearchEntireDatabase}
                          disabled={isSearchingServer}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-medium transition cursor-pointer"
                        >
                          <Search size={13} className={cn(isSearchingServer && "animate-spin")} />
                          <span>{isSearchingServer ? 'Searching Database...' : `Search Entire Database for "${searchTerm}"`}</span>
                        </button>
                      )}
                      {data.length < totalDatabaseCount && !searchTerm.trim() && (
                        <button
                          type="button"
                          onClick={() => handleHistoryLimitChange(10000)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 text-xs font-medium transition cursor-pointer"
                        >
                          <Layers size={13} />
                          <span>Load All {totalDatabaseCount} Orders from Database</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((tx: any) => {
                  const upperStatus = (tx.status || '').toUpperCase();
                  const statusMeta = getStatusMeta(upperStatus);
                  const isPending = upperStatus === 'PENDING';
                  const isCompleted = upperStatus === 'COMPLETED';
                  const isCancelled = upperStatus === 'CANCELLED';

                  return (
                    <tr 
                      key={tx.id} 
                      className={cn(
                        "transition-colors duration-150 border-l-4 group",
                        statusMeta.leftBorderClass,
                        statusMeta.rowHoverClass,
                        isPending && tx.reminderSent === 1 && "bg-amber-950/15 ring-1 ring-amber-500/20"
                      )}
                    >
                      {/* STATUS BADGE COLUMN */}
                      <td className="px-5 py-3.5 font-sans whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <StatusBadge 
                            status={tx.status} 
                            reminderSent={tx.reminderSent} 
                            size="sm"
                            showBengali={false}
                          />
                        </div>
                      </td>

                      {/* REQUEST ID */}
                      <td className="px-4 py-3.5 font-sans font-bold text-white whitespace-nowrap">
                        <span className="font-mono text-xs text-blue-400 group-hover:text-blue-300">
                          #{tx.requestId}
                        </span>
                      </td>

                      {/* DATE */}
                      <td className="px-4 py-3.5 text-neutral-300 font-mono text-[11px] whitespace-nowrap">
                        {formatBDDateTime(tx.createdAt)}
                      </td>

                      {/* METHOD */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-sans">
                        {renderMethodBadge(tx.paymentMethod)}
                      </td>

                      {/* WALLET NUMBER */}
                      <td className="px-4 py-3.5 font-mono text-neutral-200 text-xs font-semibold whitespace-nowrap">
                        {tx.walletNumber}
                      </td>

                      {/* AMOUNT WITH DYNAMIC COLORING */}
                      <td className="px-4 py-3.5 font-mono whitespace-nowrap">
                        <span className={cn(
                          "text-sm font-bold",
                          isCompleted && "text-emerald-400 font-extrabold",
                          isPending && "text-amber-300 font-extrabold",
                          isCancelled && "text-neutral-400 line-through opacity-75",
                          upperStatus === 'LIMIT' && "text-orange-400 font-extrabold",
                          upperStatus === 'PARSER_REVIEW_REQUIRED' && "text-purple-400 font-extrabold"
                        )}>
                          ৳{Number(tx.amount || 0).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* TRANSACTION ID */}
                      <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap">
                        {tx.transactionId ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-emerald-300 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                              {tx.transactionId}
                            </span>
                            <button
                              onClick={(e) => copyTxId(tx.transactionId, e)}
                              className="text-neutral-500 hover:text-emerald-400 transition-colors p-1 rounded hover:bg-emerald-400/10"
                              title="Copy Transaction ID"
                            >
                              {copiedTxId === tx.transactionId ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-neutral-600">-</span>
                        )}
                        {tx.completedBy && (
                          <div className="text-[10px] text-neutral-500 font-sans flex items-center gap-1 mt-0.5">
                            <span>op:</span>
                            <span className="text-neutral-400 font-medium">{tx.completedBy}</span>
                          </div>
                        )}
                      </td>

                      {/* TELEGRAM GROUP */}
                      <td className="px-4 py-3.5 text-neutral-300 font-sans text-xs max-w-[140px] truncate" title={tx.assignedUser || '-'}>
                        {tx.assignedUser ? (
                          <span className="bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded text-[11px] font-medium text-neutral-300 block truncate">
                            {tx.assignedUser}
                          </span>
                        ) : (
                          <span className="text-neutral-600">-</span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td className="px-4 py-3.5 text-right font-sans whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            type="button"
                            onClick={() => { setEditingTx({...tx}); setEditError(null); }} 
                            className="p-1.5 rounded-lg text-blue-400 hover:text-white hover:bg-blue-600/20 border border-transparent hover:border-blue-500/30 transition cursor-pointer" 
                            title="Edit transaction / status"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => { setDispatchingTx(tx); setDispatchChatId(''); setDispatchError(null); }} 
                            className="p-1.5 rounded-lg text-emerald-400 hover:text-white hover:bg-emerald-600/20 border border-transparent hover:border-emerald-500/30 transition cursor-pointer" 
                            title="Send to Specific Group"
                          >
                            <Send size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setDeletingTx(tx)} 
                            className="p-1.5 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600/20 border border-transparent hover:border-rose-500/30 transition cursor-pointer" 
                            title="Delete transaction"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* ========================================================================= */}
        {/* PAGINATION & SUMMARY FOOTER */}
        {/* ========================================================================= */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3.5 border-t border-neutral-800 bg-neutral-900/70 gap-3">
          <div className="flex items-center gap-3 text-xs text-neutral-400">
            <span>
              Showing <strong className="text-white">{filteredData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to <strong className="text-white">{Math.min(currentPage * pageSize, filteredData.length)}</strong> of <strong className="text-white">{filteredData.length}</strong> entries
            </span>

            {/* Page Size Selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-neutral-500 text-[11px]">Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-neutral-950 border border-neutral-700 text-neutral-300 text-xs rounded px-2 py-0.5 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button 
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 border border-neutral-700 rounded-md bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft size={13} />
              <span>Prev</span>
            </button>

            <span className="text-xs text-neutral-400 px-2 font-mono">
              Page <strong className="text-white">{currentPage}</strong> of <strong className="text-white">{totalPages}</strong>
            </span>

            <button 
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 border border-neutral-700 rounded-md bg-neutral-950 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs font-medium transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* STATUS BADGE COLOR KEY / SCANNABILITY LEGEND */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-neutral-300 block">
            স্ট্যাটাস ব্যাজ কালার গাইড (Color-Coded Status Legend)
          </span>
          <span className="text-[11px] text-neutral-500 block">
            দ্রুত চোখের পলকে অর্ডার স্ট্যাটাস শনাক্ত করতে নিচের কালার কোড ব্যবহৃত হয়েছে
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status="COMPLETED" size="xs" showBengali={true} />
          <StatusBadge status="PENDING" size="xs" showBengali={true} />
          <StatusBadge status="CANCELLED" size="xs" showBengali={true} />
          <StatusBadge status="PARSER_REVIEW_REQUIRED" size="xs" showBengali={true} />
          <StatusBadge status="LIMIT" size="xs" showBengali={true} />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DELETE MODAL */}
      {/* ========================================================================= */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                <Trash2 size={20} />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Transaction?</h3>
            </div>
            <p className="text-neutral-400 text-xs leading-relaxed mb-5">
              Are you sure you want to delete order <strong className="text-white font-mono">#{deletingTx.requestId}</strong> (৳{Number(deletingTx.amount).toLocaleString()})? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button 
                type="button"
                onClick={() => setDeletingTx(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleDelete}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT MODAL WITH LIVE COLOR-CODED BADGE PREVIEW */}
      {/* ========================================================================= */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center mb-5 border-b border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">Edit Transaction & Status</h3>
                <span className="text-xs text-neutral-400 font-mono">Request #{editingTx.requestId}</span>
              </div>
              <button 
                type="button"
                onClick={() => { setEditingTx(null); setEditError(null); }} 
                className="text-neutral-400 hover:text-white p-1 rounded-md hover:bg-neutral-800"
              >
                <X size={18} />
              </button>
            </div>
            
            {editError && (
              <div className="mb-4 p-3 bg-red-950/70 border border-red-500/50 rounded-lg flex items-start gap-2.5 text-red-200 text-xs shadow-inner">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed font-medium">{editError}</div>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Payment Method</label>
                <select 
                  value={editingTx.paymentMethod}
                  onChange={(e) => setEditingTx({...editingTx, paymentMethod: e.target.value})}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-xs font-medium focus:outline-none focus:border-blue-500"
                >
                  <option value="NAGAD">NAGAD (নগদ)</option>
                  <option value="BKASH">BKASH (বিকাশ)</option>
                  <option value="ROCKET">ROCKET (রকেট)</option>
                  <option value="UPAY">UPAY (উপায়)</option>
                </select>
              </div>

              {/* Wallet Number */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Wallet Number</label>
                <input 
                  type="text"
                  value={editingTx.walletNumber}
                  onChange={(e) => setEditingTx({...editingTx, walletNumber: e.target.value})}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">Amount (৳)</label>
                <input 
                  type="number"
                  step="1"
                  value={editingTx.amount}
                  onChange={(e) => setEditingTx({...editingTx, amount: e.target.value})}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              {/* Status Selector & Live Color Preview */}
              <div className="bg-neutral-950 border border-neutral-800 p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-300">Order Status</label>
                  <span className="text-[10px] text-neutral-500">Live Preview</span>
                </div>
                
                <select 
                  value={editingTx.status}
                  onChange={(e) => {
                    setEditingTx({...editingTx, status: e.target.value});
                    if (editError) setEditError(null);
                  }}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="PENDING">🟡 PENDING (Yellow - Waiting/Alert)</option>
                  <option value="COMPLETED">🟢 COMPLETED (Green - Successful)</option>
                  <option value="CANCELLED">🔴 CANCELLED (Red - Rejected/Cancelled)</option>
                  <option value="LIMIT">🟠 LIMIT (Orange - Limit Reached)</option>
                  <option value="PARSER_REVIEW_REQUIRED">🟣 PARSER REVIEW REQUIRED (Purple)</option>
                </select>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400">Preview Badge:</span>
                  <StatusBadge status={editingTx.status} size="sm" showBengali={true} />
                </div>
              </div>

              {/* Transaction ID */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-neutral-300">
                    Transaction ID {editingTx.status === 'COMPLETED' ? (
                      <span className="text-red-400 font-bold">* (Required for Completed)</span>
                    ) : (
                      <span className="text-neutral-500">(Optional)</span>
                    )}
                  </label>
                  <span className="text-[10px] text-neutral-400 font-mono tracking-wider">UPPERCASE ONLY</span>
                </div>
                <input 
                  type="text"
                  value={editingTx.transactionId || ''}
                  onChange={(e) => {
                    setEditingTx({...editingTx, transactionId: e.target.value});
                    if (editError) setEditError(null);
                  }}
                  className={cn(
                    "w-full px-3 py-2 bg-neutral-950 border rounded-lg text-white text-xs focus:outline-none font-mono tracking-wider transition-colors",
                    /[a-z]/.test(editingTx.transactionId || '')
                      ? "border-red-500 bg-red-950/20 text-red-200 focus:border-red-500"
                      : "border-neutral-800 focus:border-blue-500"
                  )}
                  placeholder="e.g. DIC2EXGJ5U, 75X91WLR"
                />

                {/* Real-time Validation Note */}
                {/[a-z]/.test(editingTx.transactionId || '') && (
                  <p className="mt-1.5 text-[11px] text-red-400 flex items-center gap-1 font-medium">
                    <AlertTriangle size={12} className="shrink-0" />
                    ছোট হাতের অক্ষর দেওয়া যাবে না। সব বড় হাতের (UPPERCASE) হতে হবে।
                  </p>
                )}

                <div className="mt-1.5 text-[11px] text-neutral-400 space-y-0.5">
                  <p><span className="text-neutral-300 font-medium">উদাহরণ:</span> <code className="text-emerald-400">DIC2EXGJ5U</code>, <code className="text-emerald-400">DIC1EXAIG5</code>, <code className="text-emerald-400">75X91WLR</code>, <code className="text-emerald-400">75X90BL3</code></p>
                  <p className="text-amber-400/90 text-[10px] font-medium">⚠️ একটি ট্রানজেকশন আইডি দিয়ে দুইবার কমপ্লিট করা যাবে না।</p>
                </div>
              </div>
              
              <div className="pt-3 border-t border-neutral-800 flex justify-end space-x-3">
                <button 
                  type="button"
                  onClick={() => { setEditingTx(null); setEditError(null); }}
                  className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANUAL DISPATCH TO SPECIFIC GROUP MODAL */}
      {/* ========================================================================= */}
      {dispatchingTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2 font-sans">
                <Send className="text-emerald-400" size={18} />
                গ্রুপে অর্ডার সেন্ড করুন (Send to Group)
              </h3>
              <button 
                onClick={() => setDispatchingTx(null)}
                className="text-neutral-500 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800/80 space-y-1.5 font-sans">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Request ID:</span>
                <span className="text-blue-400 font-mono font-bold">#{dispatchingTx.requestId}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Amount:</span>
                <span className="text-white font-mono font-bold">৳{dispatchingTx.amount}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Wallet:</span>
                <span className="text-neutral-200 font-mono">{dispatchingTx.walletNumber}</span>
              </div>
            </div>

            {dispatchError && (
              <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2 font-sans">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{dispatchError}</span>
              </div>
            )}

            <form onSubmit={handleManualDispatch} className="space-y-4 font-sans">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Select Target Telegram Group
                </label>
                <select
                  required
                  value={dispatchChatId}
                  onChange={(e) => setDispatchChatId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="">-- Choose Telegram Group --</option>
                  {connectedGroups.map((g) => (
                    <option key={g.chatId} value={g.chatId}>
                      {g.chatName || 'Group'} ({g.chatId}) {g.dailyLimit ? `[Limit: ৳${g.dailyLimit}]` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-500 mt-1">
                  Admin can force-dispatch this transaction to any group instantly, bypassing daily limits.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDispatchingTx(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchLoading || !dispatchChatId}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/20"
                >
                  {dispatchLoading ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  Dispatch Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completion Subtle Success Animation Overlay */}
      <CompletionSuccessOverlay
        data={completionSuccess}
        onClose={() => setCompletionSuccess(null)}
      />

      {/* Subtle Status Update Toast Notification */}
      <SuccessToast
        message={statusToast?.message || null}
        subMessage={statusToast?.sub}
        onClose={() => setStatusToast(null)}
      />

      {/* Copy Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-all">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
