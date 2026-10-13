import { apiFetch } from "../lib/api";
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useTheme } from '../store/theme';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Legend,
  LineChart,
  Line
} from 'recharts';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Users, 
  Wallet, 
  Clock, 
  TrendingUp, 
  ArrowUpRight, 
  RefreshCw,
  Layers,
  ChevronRight,
  ShieldCheck,
  Zap,
  BarChart3,
  Calendar
} from 'lucide-react';
import { formatBDTime, formatBDDate } from '../lib/timezone';
import { cn } from '../lib/utils';

export default function Dashboard() {
  const { token } = useAuth();
  const { resolvedTheme } = useTheme();
  const [stats, setStats] = useState<any>(null);
  const [groupBalances, setGroupBalances] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hourlyMetricMode, setHourlyMetricMode] = useState<'volume' | 'count'>('volume');

  const fetchData = async () => {
    if (!token) return;
    try {
      const [statsRes, balancesRes] = await Promise.all([
        apiFetch('/api/stats', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/group-balances', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const statsData = await statsRes.json();
      const balancesData = await balancesRes.json();

      if (!statsData.error) {
        setStats(statsData);
      }
      if (balancesData.success) {
        setGroupBalances(balancesData.data || []);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setIsRefreshing(false);
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState<{chatId: string | null}>({chatId: null});

  const handleDeleteGroup = async (chatId: string) => {
    setDeleteConfirmation({ chatId });
  };

  const confirmDelete = async () => {
    const chatId = deleteConfirmation.chatId;
    if (!chatId) return;
    setDeleteConfirmation({ chatId: null });
    
    try {
      console.log('Deleting group:', chatId, 'Encoded:', encodeURIComponent(chatId));
      const response = await apiFetch(`/api/group-balances/${encodeURIComponent(chatId)}`, { 
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` } 
      });
      const text = await response.text();
      console.log('Delete response status:', response.status, 'Body:', text);
      
      if (!response.ok) {
        throw new Error(`Failed to delete (Status: ${response.status}): ${text}`);
      }
      
      fetchData();
    } catch (err: any) {
      console.error('Delete error:', err);
      alert('Failed to delete group: ' + err.message);
    }
  };

  useEffect(() => {
    fetchData();
    // Real-time polling every 5 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center p-12 text-neutral-400">
        <div className="flex items-center gap-3">
          <RefreshCw className="animate-spin text-blue-500" size={20} />
          <span>Loading live dashboard data...</span>
        </div>
      </div>
    );
  }

  if (stats.error || !stats.stats) {
    return (
      <div className="bg-red-950/40 border border-red-800 text-red-300 p-6 rounded-xl">
        <h3 className="font-bold text-base mb-1">Error Loading Dashboard</h3>
        <p className="text-sm">{stats.error || 'Unable to retrieve statistics from the server.'}</p>
        <button
          onClick={handleManualRefresh}
          className="mt-4 px-4 py-2 bg-red-800 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const chartData = stats.chartData || [];

  // Summary Metrics calculations
  const pendingOrdersCount = stats.pendingOrdersToday?.count ?? (stats.stats?.PENDING?.count || 0);
  const pendingOrdersAmount = stats.pendingOrdersToday?.amount ?? (stats.stats?.PENDING?.amount || 0);
  
  const activeGroupsCount = stats.activeGroups ?? (groupBalances.length || 0);
  const totalPoolBalance = stats.totalGroupBalance ?? groupBalances.reduce((acc: number, gb: any) => acc + (gb.balance || 0), 0);

  const currentTotalRevenue = stats.currentTotalRevenue ?? (stats.allTimeStats?.completedRevenue ?? stats.stats?.COMPLETED?.amount ?? 0);
  const todayRevenue = stats.todayRevenue ?? (stats.stats?.COMPLETED?.amount || 0);
  const todayCompletedCount = stats.stats?.COMPLETED?.count || 0;

  const hourlyData: any[] = stats.hourlyData || [];
  const peakHour = hourlyData.length > 0 
    ? hourlyData.reduce((prev, curr) => (curr.volume > prev.volume ? curr : prev), hourlyData[0])
    : null;
  const totalHourlyVolume = hourlyData.reduce((acc, h) => acc + (h.volume || 0), 0);
  const totalHourlyCompleted = hourlyData.reduce((acc, h) => acc + (h.completedVolume || 0), 0);
  const totalHourlyCount = hourlyData.reduce((acc, h) => acc + (h.count || 0), 0);
  const totalHourlyCompletedCount = hourlyData.reduce((acc, h) => acc + (h.completedCount || 0), 0);
  const activeHoursCount = hourlyData.filter(h => (h.volume || 0) > 0 || (h.count || 0) > 0).length;

  const gridStroke = resolvedTheme === 'dark' ? '#262626' : '#e2e8f0';
  const axisStroke = resolvedTheme === 'dark' ? '#525252' : '#64748b';
  const tooltipStyle = {
    backgroundColor: resolvedTheme === 'dark' ? '#171717' : '#ffffff',
    border: `1px solid ${resolvedTheme === 'dark' ? '#262626' : '#e2e8f0'}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: resolvedTheme === 'dark' ? '#e5e5e5' : '#0f172a',
    boxShadow: resolvedTheme === 'dark' ? 'none' : '0 4px 6px -1px rgb(0 0 0 / 0.1)'
  };
  const tooltipItemStyle = {
    color: resolvedTheme === 'dark' ? '#e5e5e5' : '#0f172a'
  };

  const CustomHourlyTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className={cn(
          "p-3.5 rounded-xl shadow-xl border text-xs font-sans space-y-2 min-w-[210px]",
          resolvedTheme === 'dark' 
            ? "bg-neutral-900 border-neutral-800 text-neutral-200" 
            : "bg-white border-slate-200 text-slate-800"
        )}>
          <div className="flex items-center justify-between border-b pb-2 border-neutral-800 dark:border-neutral-800 border-slate-200">
            <span className="font-bold text-neutral-100 dark:text-white text-slate-900 flex items-center gap-1.5">
              <Clock size={13} className="text-blue-400" />
              {data.time} ({data.label})
            </span>
            <span className="text-[10px] text-neutral-400 uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800/80">Today</span>
          </div>
          
          <div className="space-y-1.5 font-mono">
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                Total Volume:
              </span>
              <span className="font-bold text-sky-400">৳{Number(data.volume || 0).toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Completed:
              </span>
              <span className="font-bold text-emerald-400">৳{Number(data.completedVolume || 0).toLocaleString()}</span>
            </div>

            <div className="pt-2 border-t border-neutral-800 dark:border-neutral-800 border-slate-200 flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">Total Requests:</span>
              <span className="font-semibold text-neutral-200 dark:text-neutral-100 text-slate-800">{data.count || 0} req ({data.completedCount || 0} done)</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Live System Status Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-neutral-900 border border-neutral-800 px-4 py-3 rounded-xl gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-300 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Sync Active (BD Timezone: UTC+6)</span>
          </div>
          <span className="hidden md:inline text-neutral-700">•</span>
          <div className="hidden md:flex items-center gap-1.5 text-xs text-neutral-400">
            <Zap size={13} className="text-amber-400" />
            <span>Auto-refreshing every 5s</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono w-full sm:w-auto justify-between sm:justify-end">
          <span>📅 Today: <b className="text-neutral-200">{stats.todayDate ? formatBDDate(new Date(stats.todayDate + 'T12:00:00+06:00')) : formatBDDate(new Date())}</b></span>
          <span className="text-neutral-700">|</span>
          <span>{formatBDTime(lastUpdated)}</span>
          <button
            onClick={handleManualRefresh}
            title="Refresh dashboard"
            className="p-1 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-blue-400" : ""} />
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PRIMARY SUMMARY CARDS: Pending Orders Today | Active Groups | Total Revenue */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Application State Overview
          </h2>
          <span className="text-[11px] text-neutral-500">Real-time Snapshot</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {/* Card 1: Pending Orders Today */}
          <div className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Pending Orders Today
                  </p>
                  {pendingOrdersCount > 0 ? (
                    <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                      Action Required
                    </span>
                  ) : (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                      All Clear
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <h3 className="text-2xl lg:text-3xl font-bold font-mono text-white">
                    {pendingOrdersCount}
                  </h3>
                  <span className="text-sm font-medium text-neutral-400">
                    {pendingOrdersCount === 1 ? 'Order' : 'Orders'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <Clock size={22} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="text-neutral-400">
                Queued Volume: <span className="font-mono font-semibold text-amber-300">৳{pendingOrdersAmount.toLocaleString('en-IN')}</span>
              </div>
              <Link 
                to="/" 
                className="text-neutral-400 hover:text-white flex items-center gap-1 transition text-[11px] font-medium"
              >
                View Orders <ChevronRight size={12} />
              </Link>
            </div>
          </div>

          {/* Card 2: Active Groups */}
          <div className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Active Groups
                  </p>
                  <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Auto-Routed
                  </span>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <h3 className="text-2xl lg:text-3xl font-bold font-mono text-white">
                    {activeGroupsCount}
                  </h3>
                  <span className="text-sm font-medium text-neutral-400">
                    {activeGroupsCount === 1 ? 'Channel' : 'Channels'}
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                <Users size={22} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="text-neutral-400 truncate">
                Reserve Pool: <span className={`font-mono font-semibold ${totalPoolBalance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>৳{totalPoolBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <Link 
                to="/routing" 
                className="text-neutral-400 hover:text-white flex items-center gap-1 transition text-[11px] font-medium shrink-0 ml-2"
              >
                Manage <ChevronRight size={12} />
              </Link>
            </div>
          </div>

          {/* Card 3: Offline Groups Alert */}
          <div className="bg-neutral-950 border border-neutral-800 hover:border-red-900/30 transition rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Offline Groups
                  </p>
                  {stats.offlineGroups > 0 ? (
                    <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <AlertTriangle size={10} />
                      Attention
                    </span>
                  ) : (
                    <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                      Healthy
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <h3 className={`text-2xl lg:text-3xl font-bold font-mono ${stats.offlineGroups > 0 ? 'text-red-400' : 'text-white'}`}>
                    {stats.offlineGroups || 0}
                  </h3>
                  <span className="text-sm font-medium text-neutral-400">
                    {stats.offlineGroups === 1 ? 'Group' : 'Groups'}
                  </span>
                </div>
              </div>
              <div className={`p-2.5 rounded-xl border shrink-0 ${stats.offlineGroups > 0 ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-neutral-800 border-neutral-700 text-neutral-500'}`}>
                <XCircle size={22} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="text-neutral-400">
                Action: {stats.offlineGroups > 0 ? 'Check Routing Rules' : 'All groups active'}
              </div>
              <Link 
                to="/routing" 
                className="text-neutral-400 hover:text-white flex items-center gap-1 transition text-[11px] font-medium"
              >
                Fix Issues <ChevronRight size={12} />
              </Link>
            </div>
          </div>

          {/* Card 4: Current Total Revenue */}
          <div className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 transition rounded-xl p-5 flex flex-col justify-between relative overflow-hidden group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Current Total Revenue
                  </p>
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                    <TrendingUp size={10} />
                    All Time
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl lg:text-3xl font-bold font-mono text-white tracking-tight">
                    ৳{currentTotalRevenue.toLocaleString('en-IN')}
                  </h3>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                <Wallet size={22} />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="text-neutral-400">
                Today: <span className="font-mono font-semibold text-emerald-400">+৳{todayRevenue.toLocaleString('en-IN')}</span>
                <span className="text-neutral-500 text-[11px] ml-1">({todayCompletedCount} done)</span>
              </div>
              <Link 
                to="/reports" 
                className="text-neutral-400 hover:text-white flex items-center gap-1 transition text-[11px] font-medium"
              >
                Reports <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECONDARY OPERATIONAL STATS: Today Breakdown (Requests, Completed, Cancelled) */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Today's Transaction Metrics
          </h2>
          <span className="text-[11px] text-neutral-500 font-mono">
            Total Today: {stats.totalRequests || 0} Req / ৳{(stats.totalAmount || 0).toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Requests Today" 
            value={stats.totalRequests || 0}
            subValue={`Volume: ৳${(stats.totalAmount || 0).toLocaleString()}`}
            icon={Activity} 
            color="text-blue-400 bg-blue-500/10 border-blue-500/20" 
          />
          <StatCard 
            title="Completed Amount Today" 
            value={`৳${(stats.stats.COMPLETED?.amount || 0).toLocaleString()}`}
            subValue={`${stats.stats.COMPLETED?.count || 0} Successful Transactions`}
            icon={CheckCircle2} 
            color="text-emerald-400 bg-emerald-500/10 border-emerald-500/20" 
          />
          <StatCard 
            title="Cancelled Amount Today" 
            value={`৳${(stats.stats.CANCELLED?.amount || 0).toLocaleString()}`}
            subValue={`${stats.stats.CANCELLED?.count || 0} Orders Cancelled`}
            icon={XCircle} 
            color="text-red-400 bg-red-500/10 border-red-500/20" 
          />
          <StatCard 
            title="Pending Amount Today" 
            value={`৳${(stats.stats.PENDING?.amount || 0).toLocaleString()}`}
            subValue={`${stats.stats.PENDING?.count || 0} Orders in Pending`}
            icon={AlertTriangle} 
            color="text-yellow-400 bg-yellow-500/10 border-yellow-500/20" 
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TODAY'S HOURLY TRANSACTION VOLUME LINE CHART (RECHARTS) */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-white text-base font-bold flex items-center gap-2">
                <TrendingUp className="text-blue-400" size={18} />
                আজকের ঘণ্টার ভিত্তিতে লেনদেন (Hourly Transaction Volume - Today)
              </h3>
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
                24h Real-time
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Live hourly transaction volume and order distribution for {stats.todayDate ? formatBDDate(new Date(stats.todayDate + 'T12:00:00+06:00')) : 'today'} (Asia/Dhaka UTC+6)
            </p>
          </div>

          {/* Metric Mode Toggle Button */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-1 rounded-lg self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setHourlyMetricMode('volume')}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition cursor-pointer flex items-center gap-1.5",
                hourlyMetricMode === 'volume'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Wallet size={12} />
              Volume (৳)
            </button>
            <button
              type="button"
              onClick={() => setHourlyMetricMode('count')}
              className={cn(
                "px-3 py-1 text-xs rounded-md font-medium transition cursor-pointer flex items-center gap-1.5",
                hourlyMetricMode === 'count'
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Activity size={12} />
              Orders Count (#)
            </button>
          </div>
        </div>

        {/* Metric Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 block font-medium">Peak Hour Today</span>
            <span className="text-sm font-bold text-white font-mono mt-0.5 block">
              {peakHour && peakHour.volume > 0 ? `${peakHour.time} (${peakHour.label})` : 'N/A'}
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {peakHour && peakHour.volume > 0 ? `৳${peakHour.volume.toLocaleString()}` : '৳0'}
            </span>
          </div>

          <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 block font-medium">Total Hourly Volume</span>
            <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5 block">
              ৳{totalHourlyVolume.toLocaleString()}
            </span>
            <span className="text-[10px] text-neutral-400">
              Completed: ৳{totalHourlyCompleted.toLocaleString()}
            </span>
          </div>

          <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 block font-medium">Today's Transactions</span>
            <span className="text-sm font-bold text-white font-mono mt-0.5 block">
              {totalHourlyCount} requests
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {totalHourlyCompletedCount} completed
            </span>
          </div>

          <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-lg p-3">
            <span className="text-[11px] text-neutral-400 block font-medium">Active Hours</span>
            <span className="text-sm font-bold text-blue-400 font-mono mt-0.5 block">
              {activeHoursCount} of 24 Hours
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">
              {activeHoursCount > 0 ? `${Math.round((activeHoursCount / 24) * 100)}% active span` : 'No volume yet'}
            </span>
          </div>
        </div>

        {/* Recharts Line Chart */}
        <div className="h-72 w-full pt-2">
          {hourlyData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
              No hourly transaction records available for today.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} opacity={0.6} />
                <XAxis 
                  dataKey="time" 
                  stroke={axisStroke} 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false}
                  interval={1}
                  tickFormatter={(val: string) => {
                    const h = parseInt(val.split(':')[0], 10);
                    return h % 2 === 0 ? val : '';
                  }}
                />
                <YAxis 
                  stroke={axisStroke} 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(val) => hourlyMetricMode === 'volume' 
                    ? `৳${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`
                    : `${val}`
                  } 
                />
                <Tooltip content={<CustomHourlyTooltip />} />
                <Legend 
                  iconType="plainline" 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: resolvedTheme === 'dark' ? '#a3a3a3' : '#64748b' }} 
                />
                {hourlyMetricMode === 'volume' ? (
                  <>
                    <Line 
                      type="monotone" 
                      name="Total Volume (৳)" 
                      dataKey="volume" 
                      stroke="#0284c7" 
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0284c7', strokeWidth: 1 }}
                      activeDot={{ r: 6, stroke: '#0284c7', strokeWidth: 2 }}
                    />
                    <Line 
                      type="monotone" 
                      name="Completed Volume (৳)" 
                      dataKey="completedVolume" 
                      stroke="#10b981" 
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 1 }}
                      activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                    />
                  </>
                ) : (
                  <>
                    <Line 
                      type="monotone" 
                      name="Total Orders (Count)" 
                      dataKey="count" 
                      stroke="#818cf8" 
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#818cf8', strokeWidth: 1 }}
                      activeDot={{ r: 6, stroke: '#818cf8', strokeWidth: 2 }}
                    />
                    <Line 
                      type="monotone" 
                      name="Completed Orders" 
                      dataKey="completedCount" 
                      stroke="#10b981" 
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#10b981', strokeWidth: 1 }}
                      activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Group Balances Real-time Widget */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-5">
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <Users size={18} className="text-blue-400" />
              Live Group Balances & Liquidity Pools
            </h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Real-time balance tracked across all Telegram routing groups
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-neutral-900 border border-neutral-800 text-neutral-300 px-3 py-1 rounded-lg font-mono">
              {groupBalances.length} Active {groupBalances.length === 1 ? 'Group' : 'Groups'}
            </span>
            <Link
              to="/reports"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
            >
              Deposit / Ledger <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>

        {groupBalances.length === 0 ? (
          <div className="text-neutral-500 text-sm py-8 text-center bg-neutral-900/40 border border-neutral-900 rounded-lg">
            No group balances initialized yet. Connect groups in Routing Rules or deposit funds in Reports.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {groupBalances.map((gb) => (
              <div key={gb.id} className="bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 transition rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate max-w-[170px]" title={gb.chatName || gb.chatId}>
                      {gb.chatName || 'Telegram Group'}
                    </span>
                    <button 
                      onClick={() => {
                        console.log('Delete button clicked for:', gb.chatId);
                        handleDeleteGroup(gb.chatId);
                      }}
                      className="text-red-500 hover:text-red-700 transition p-1 border border-red-900 rounded-full"
                      title="Delete Group"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono mt-1 truncate">
                    ID: {gb.chatId}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-neutral-800 flex items-baseline justify-between">
                  <span className="text-[11px] text-neutral-400">Available:</span>
                  <span className={`text-base font-bold font-mono ${gb.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ৳{gb.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.chatId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Delete Group?</h3>
            <p className="text-neutral-400 text-sm mb-6">
              Are you sure you want to permanently delete this group and all its ledger entries? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteConfirmation({ chatId: null })}
                className="px-4 py-2 text-sm text-neutral-300 hover:text-white transition"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Analytics Charts */}
      {/* ========================================================================= */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white text-sm font-semibold">Transaction Volume (Last 7 Days)</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Completed payout volume over time</p>
              </div>
              <span className="text-xs text-emerald-400 font-mono font-medium">BDT (৳)</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" stroke={axisStroke} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={axisStroke} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `৳${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                  <Tooltip 
                    contentStyle={tooltipStyle}
                    itemStyle={tooltipItemStyle}
                    formatter={(val: any) => [`৳${Number(val).toLocaleString()}`, 'Completed']}
                  />
                  <Area type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorCompleted)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white text-sm font-semibold">Status Distribution</h3>
                <p className="text-xs text-neutral-400 mt-0.5">Completed vs Cancelled vs Limits</p>
              </div>
              <span className="text-xs text-neutral-400 font-mono">Volume breakdown</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" stroke={axisStroke} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={axisStroke} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `৳${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                  <Tooltip 
                    contentStyle={tooltipStyle}
                    cursor={{ fill: resolvedTheme === 'dark' ? '#262626' : '#f1f5f9' }}
                    formatter={(val: any, name: string) => [`৳${Number(val).toLocaleString()}`, name.toUpperCase()]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: resolvedTheme === 'dark' ? '#a3a3a3' : '#64748b' }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="limit" name="Limit" stackId="a" fill="#eab308" />
                  <Bar dataKey="cancelled" name="Cancelled" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, subValue, icon: Icon, color = "text-blue-500 bg-neutral-900 border-neutral-800" }: any) {
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex justify-between items-start mb-3">
        <p className="text-xs font-medium text-neutral-400 truncate mr-2">{title}</p>
        <div className={`p-2 rounded-lg border ${color} shrink-0`}>
          <Icon size={16} />
        </div>
      </div>
      <div>
        <h3 className="text-xl font-bold font-mono text-white mb-0.5">{value}</h3>
        {subValue && (
          <p className="text-[11px] text-neutral-500 font-mono truncate">{subValue}</p>
        )}
      </div>
    </div>
  );
}


