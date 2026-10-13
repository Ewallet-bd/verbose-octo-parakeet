import React, { useEffect, useState, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { 
  Bot, 
  Play, 
  Square, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Send, 
  Key, 
  Trash2, 
  Sliders, 
  Eye, 
  EyeOff, 
  Save, 
  CheckCircle2, 
  Terminal, 
  Database, 
  Bell, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Cpu,
  Power,
  Copy,
  Check,
  Search,
  Filter,
  Activity,
  RotateCcw,
  Lock
} from 'lucide-react';
import { cn } from '../lib/utils';

interface AutomationStatus {
  status: 'IDLE' | 'LOGGING_IN' | 'AWAITING_OTP' | 'ACTIVE_POLLING' | 'PAUSED' | 'ERROR';
  isRunning: boolean;
  isLoggedIn: boolean;
  hasStoredSession: boolean;
  awaitingOtp: boolean;
  otpPromptMessage?: string;
  otpRequestedAt?: number;
  otpExpiresAt?: number;
  lastPollAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  totalOrdersFetched: number;
  totalOrdersImported: number;
  totalOrdersDuplicates: number;
  config: {
    portalUrl: string;
    username: string;
    password?: string;
    pollIntervalSeconds: number;
    enabled: boolean;
    headless: boolean;
    autoLogin: boolean;
    notifyTelegramOnNewOrders: boolean;
    ordersUrl?: string;
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
    otpSelector?: string;
    otpSubmitSelector?: string;
    tableSelector?: string;
  };
}

interface AutomationLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  details?: any;
}

export default function Automation() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // OTP Form State
  const [otpInput, setOtpInput] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSuccess, setOtpSuccess] = useState('');

  // Log Console Controls
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR'>('ALL');
  const [logSearch, setLogSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  
  // Configuration Form State
  const [portalUrl, setPortalUrl] = useState('');
  const [ordersUrl, setOrdersUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pollInterval, setPollInterval] = useState(20);
  const [autoLogin, setAutoLogin] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);
  const [notifyLoginLogout, setNotifyLoginLogout] = useState(true);
  const [headless, setHeadless] = useState(true);
  const [autoReloadCaptcha, setAutoReloadCaptcha] = useState(true);
  const [captchaSelector, setCaptchaSelector] = useState('');
  const [showAdvancedSelectors, setShowAdvancedSelectors] = useState(false);
  const [usernameSelector, setUsernameSelector] = useState('');
  const [passwordSelector, setPasswordSelector] = useState('');
  const [submitSelector, setSubmitSelector] = useState('');
  const [otpSelector, setOtpSelector] = useState('');
  const [tableSelector, setTableSelector] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Simulation test state
  const [simOrderId, setSimOrderId] = useState(`ORD-${Math.floor(100000 + Math.random() * 900000)}`);
  const [simAmount, setSimAmount] = useState('2500');
  const [simPhone, setSimPhone] = useState('01712345678');
  const [simMethod, setSimMethod] = useState<'BKASH' | 'NAGAD' | 'ROCKET'>('BKASH');
  const [simSuccessMsg, setSimSuccessMsg] = useState('');

  // Track if initial server configuration has been loaded into form fields
  const hasInitializedConfigRef = useRef(false);

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/automation/status');
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
        // Only initialize form fields ONCE on initial page load
        // Never overwrite user inputs during background 3-second polling!
        if (!hasInitializedConfigRef.current && data.data.config) {
          hasInitializedConfigRef.current = true;
          setPortalUrl(data.data.config.portalUrl || '');
          setOrdersUrl(data.data.config.ordersUrl || '');
          setUsername(data.data.config.username || '');
          setPollInterval(data.data.config.pollIntervalSeconds || 20);
          setAutoLogin(data.data.config.autoLogin !== false);
          setNotifyTelegram(data.data.config.notifyTelegramOnNewOrders !== false);
          setNotifyLoginLogout(data.data.config.notifyTelegramOnLoginLogout !== false);
          setHeadless(data.data.config.headless !== false);
          setAutoReloadCaptcha(data.data.config.autoReloadOnCaptcha !== false);
          setCaptchaSelector(data.data.config.captchaSelector || '');
          setUsernameSelector(data.data.config.usernameSelector || '');
          setPasswordSelector(data.data.config.passwordSelector || '');
          setSubmitSelector(data.data.config.submitSelector || '');
          setOtpSelector(data.data.config.otpSelector || '');
          setTableSelector(data.data.config.tableSelector || '');
        }
      }
    } catch (err) {
      console.error('Failed to fetch automation status:', err);
    }
  };

  const handleReloadConfig = () => {
    if (status?.config) {
      setPortalUrl(status.config.portalUrl || '');
      setOrdersUrl(status.config.ordersUrl || '');
      setUsername(status.config.username || '');
      setPollInterval(status.config.pollIntervalSeconds || 20);
      setAutoLogin(status.config.autoLogin !== false);
      setNotifyTelegram(status.config.notifyTelegramOnNewOrders !== false);
      setNotifyLoginLogout(status.config.notifyTelegramOnLoginLogout !== false);
      setHeadless(status.config.headless !== false);
      setAutoReloadCaptcha(status.config.autoReloadOnCaptcha !== false);
      setCaptchaSelector(status.config.captchaSelector || '');
      setUsernameSelector(status.config.usernameSelector || '');
      setPasswordSelector(status.config.passwordSelector || '');
      setSubmitSelector(status.config.submitSelector || '');
      setOtpSelector(status.config.otpSelector || '');
      setTableSelector(status.config.tableSelector || '');
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/api/automation/logs?limit=80');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setLogs(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch automation logs:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchStatus(), fetchLogs()]).finally(() => setLoading(false));
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll log console
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await apiFetch('/api/automation/start', { method: 'POST' });
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Error starting automation: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await apiFetch('/api/automation/stop', { method: 'POST' });
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Error stopping automation: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReloadBrowser = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/automation/reload', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Page reloaded');
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Error reloading browser: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/automation/sync-now', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Sync completed');
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Sync error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearSession = async () => {
    if (!confirm('Are you sure you want to clear stored cookies and session state? You will need to log in again.')) return;
    setActionLoading(true);
    try {
      await apiFetch('/api/automation/clear-session', { method: 'POST' });
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Error clearing session: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!otpInput.trim()) {
      setOtpError('দয়া করে OTP কোড লিখুন');
      return;
    }
    setOtpSubmitting(true);
    setOtpError('');
    setOtpSuccess('');
    try {
      const res = await apiFetch('/api/automation/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otpInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setOtpSuccess(data.message || 'OTP সফলভাবে সাবমিট হয়েছে!');
        setOtpInput('');
        setTimeout(() => setOtpSuccess(''), 4000);
        await fetchStatus();
        await fetchLogs();
      } else {
        setOtpError(data.message || 'OTP সাবমিট ব্যর্থ হয়েছে');
      }
    } catch (err: any) {
      setOtpError(err.message || 'নেটওয়ার্ক এরর');
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await apiFetch('/api/automation/logs/clear', { method: 'POST' });
      setLogs([]);
      await fetchLogs();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map(l => `[${new Date(l.timestamp).toLocaleTimeString()}] [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload: any = {
        portalUrl: portalUrl.trim(),
        ordersUrl: ordersUrl.trim(),
        username: username.trim(),
        pollIntervalSeconds: Number(pollInterval),
        autoLogin,
        notifyTelegramOnNewOrders: notifyTelegram,
        notifyTelegramOnLoginLogout: notifyLoginLogout,
        headless,
        autoReloadOnCaptcha: autoReloadCaptcha,
        captchaSelector: captchaSelector.trim() || undefined,
        usernameSelector: usernameSelector.trim() || undefined,
        passwordSelector: passwordSelector.trim() || undefined,
        submitSelector: submitSelector.trim() || undefined,
        otpSelector: otpSelector.trim() || undefined,
        tableSelector: tableSelector.trim() || undefined,
      };
      if (password) {
        payload.password = password;
      }
      await apiFetch('/api/automation/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      setPassword('');
      await fetchStatus();
    } catch (err: any) {
      alert('Error saving config: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSimulateOrder = async () => {
    try {
      const res = await apiFetch('/api/automation/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            order_id: simOrderId,
            amount: parseFloat(simAmount),
            wallet_number: simPhone,
            payment_method: simMethod,
          }]
        }),
      });
      const data = await res.json();
      setSimSuccessMsg(data.message || 'Order simulated successfully!');
      setSimOrderId(`ORD-${Math.floor(100000 + Math.random() * 900000)}`);
      setTimeout(() => setSimSuccessMsg(''), 4000);
      await fetchStatus();
      await fetchLogs();
    } catch (err: any) {
      alert('Simulation error: ' + err.message);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (logFilter !== 'ALL' && log.level !== logFilter) return false;
    if (logSearch.trim()) {
      const q = logSearch.toLowerCase();
      return log.message.toLowerCase().includes(q) || log.level.toLowerCase().includes(q);
    }
    return true;
  });

  const getStatusBadge = (st?: string) => {
    switch (st) {
      case 'ACTIVE_POLLING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            ACTIVE POLLING
          </span>
        );
      case 'AWAITING_OTP':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            AWAITING OTP
          </span>
        );
      case 'LOGGING_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            LOGGING IN
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            ERROR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-neutral-800 text-neutral-400 border border-neutral-700">
            <span className="w-2 h-2 rounded-full bg-neutral-500" />
            IDLE / STOPPED
          </span>
        );
    }
  };

  const formatLastPoll = (timestamp?: number) => {
    if (!timestamp) return 'Not yet polled';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 5) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Bot size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Playwright Automation & Scraper</h1>
              <p className="text-xs text-neutral-400">
                হেডলেস ব্রাউজার দিয়ে সাইটে অটোমেটিক লগিন, টেলিগ্রাম ও ওয়েব ডুয়াল OTP, এবং ডাটাবেজ সংরক্ষণ
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {status?.isRunning ? (
            <button
              onClick={handleStop}
              disabled={actionLoading}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center gap-1.5"
            >
              <Square size={14} />
              Stop Scraper
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={actionLoading}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition flex items-center gap-1.5"
            >
              <Play size={14} />
              Start Scraper
            </button>
          )}

          <button
            onClick={handleSyncNow}
            disabled={actionLoading || !status?.isRunning}
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-neutral-800 text-neutral-200 hover:bg-neutral-700 border border-neutral-700 transition flex items-center gap-1.5 disabled:opacity-50"
            title="Force immediate orders poll"
          >
            <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
            Sync Now
          </button>

          <button
            onClick={handleClearSession}
            disabled={actionLoading}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-neutral-800 text-neutral-400 hover:text-rose-400 hover:bg-neutral-700 border border-neutral-700 transition flex items-center gap-1.5"
            title="Clear stored session cookies"
          >
            <Trash2 size={14} />
            Clear Session
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* NEW SECTION: SCRAPER MANAGEMENT & WORKER CONSOLE          */}
      {/* ======================================================== */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-neutral-800/80 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Cpu size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Scraper Manager & Worker Console
                </h2>
                {getStatusBadge(status?.status)}
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                হেডলেস ওয়ার্কার কন্ট্রোল, রিয়েল-টাইম স্ট্যাটাস মনিটর, অপারেটর OTP ইনপুট ও লাইভ কনসোল লগ
              </p>
            </div>
          </div>

          {/* Master Start / Stop Toggle Switch */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReloadBrowser}
              disabled={actionLoading || !status?.isRunning}
              className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-neutral-800 disabled:opacity-50 cursor-pointer shadow"
              title="Manually reload browser page (e.g. to bypass captcha)"
            >
              <RotateCcw size={14} className={actionLoading ? "animate-spin" : ""} />
              Reload Page
            </button>

            <div className="flex items-center gap-3 bg-neutral-900/80 border border-neutral-800 rounded-xl p-2 shrink-0">
              <div className="flex flex-col text-right pr-2">
                <span className="text-[11px] font-semibold text-neutral-300">Worker Status</span>
                <span className={cn(
                  "text-[10px] font-mono",
                  status?.isRunning ? "text-emerald-400" : "text-neutral-500"
                )}>
                  {status?.isRunning ? "RUNNING" : "STOPPED"}
                </span>
              </div>

              <button
                type="button"
                onClick={status?.isRunning ? handleStop : handleStart}
                disabled={actionLoading}
                className={cn(
                  "relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-neutral-900 cursor-pointer disabled:opacity-50",
                  status?.isRunning ? "bg-emerald-600 shadow-lg shadow-emerald-600/20" : "bg-neutral-800"
                )}
                title={status?.isRunning ? "Click to Stop Worker" : "Click to Start Worker"}
              >
                <span
                  className={cn(
                    "inline-block h-6 w-6 transform rounded-full bg-white transition duration-200 ease-in-out shadow flex items-center justify-center",
                    status?.isRunning ? "translate-x-9 text-emerald-600" : "translate-x-1 text-neutral-400"
                  )}
                >
                  <Power size={13} strokeWidth={2.5} />
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Real-time Status Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-neutral-900/40 rounded-xl border border-neutral-800/80 mb-6 text-xs">
          <div>
            <span className="text-[11px] text-neutral-400 block mb-0.5">Active Engine</span>
            <span className="font-semibold text-white flex items-center gap-1.5">
              <span className={cn(
                "w-2 h-2 rounded-full",
                status?.isRunning ? "bg-emerald-400 animate-pulse" : "bg-neutral-600"
              )} />
              {status?.isRunning ? 'Playwright Chromium' : 'Worker Offline'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-neutral-400 block mb-0.5">Session Cookies</span>
            <span className={cn(
              "font-medium flex items-center gap-1",
              status?.hasStoredSession ? "text-emerald-400" : "text-neutral-500"
            )}>
              <ShieldCheck size={14} />
              {status?.hasStoredSession ? 'Saved & Persistent' : 'No Active Session'}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-neutral-400 block mb-0.5">Last Checked</span>
            <span className="font-mono text-neutral-300 flex items-center gap-1 tabular-nums">
              <Clock size={13} className="text-neutral-400" />
              {formatLastPoll(status?.lastPollAt)}
            </span>
          </div>

          <div>
            <span className="text-[11px] text-neutral-400 block mb-0.5">Polling Cadence</span>
            <span className="font-mono text-indigo-400 font-semibold tabular-nums">
              Every {status?.config.pollIntervalSeconds || 20}s
            </span>
          </div>
        </div>

        {/* Sub-grid: Column 1 (Manual OTP Input) + Column 2 (Live Worker Log Console) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ======================================================== */}
          {/* COLUMN 1: MANUAL OTP INPUT FORM (5 COLS)                  */}
          {/* ======================================================== */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Key size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Operator Manual OTP Input</h3>
                    <p className="text-[11px] text-neutral-400">লগিন ও ভেরিফিকেশনের জন্য ম্যানুয়াল কোড ইনপুট</p>
                  </div>
                </div>
                {status?.awaitingOtp && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-neutral-950 animate-pulse uppercase tracking-wider">
                    Needs OTP Now
                  </span>
                )}
              </div>

              {/* CAPTCHA Intervention Alert Banner */}
              {status?.status === 'AWAITING_CAPTCHA' || status?.hasCaptcha ? (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs mb-4 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-rose-200">
                    <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                    <span>🚨 CAPTCHA ভেরিফিকেশন ডিটেক্ট হয়েছে!</span>
                  </div>
                  <p className="text-[11px] text-rose-200/90 leading-relaxed">
                    পোর্টাল লগইন বা সাবমিশনের সময় ক্যাপচা চলে এসেছে ({status?.captchaDetails || 'Captcha element'})। অটোমেটিক রিলোড বন্ধ রাখা হয়েছে। অনুগ্রহ করে লাইভ স্ক্রিন প্রিভিউ দেখে ব্রাউজারে ম্যানুয়ালি ক্যাপচা সমাধান করুন।
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleReloadBrowser}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition shadow flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      Reload Browser Now
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Status Context Banner */}
              {status?.awaitingOtp ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs mb-4 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle size={15} />
                    <span>⚠️ পোর্টাল থেকে ২-স্টেপ OTP চাওয়া হয়েছে!</span>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed">
                    হেডলেস ব্রাউজার বর্তমানে লগিন পেজে OTP কোডের অপেক্ষায় রয়েছে। নিচে কোডটি লিখে সাবমিট করুন।
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs mb-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
                    <ShieldCheck size={14} className="text-indigo-400" />
                    <span>স্ট্যান্ডবাই মোড (Standby)</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    সাইট লগিনের সময় OTP চাওয়া মাত্র এটি স্বয়ংক্রিয়ভাবে একটিভ হবে। আপনি চাইলে যেকোনো সময় অগ্রিম কোড সাবমিট করতে পারেন।
                  </p>
                </div>
              )}

              {/* Input Form */}
              <form onSubmit={handleSubmitOtp} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Security / OTP Code (৬-৮ ডিজিটের কোড)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={8}
                      placeholder="e.g. 123456"
                      value={otpInput}
                      onChange={(e) => setOtpInput(e.target.value)}
                      className={cn(
                        "w-full px-4 py-3 bg-neutral-950 border rounded-xl text-white font-mono text-center tracking-[0.3em] text-lg font-bold placeholder:tracking-normal placeholder:font-sans placeholder:text-neutral-600 focus:outline-none transition-all",
                        status?.awaitingOtp 
                          ? "border-amber-500/70 focus:ring-2 focus:ring-amber-400 bg-amber-500/5 shadow-lg shadow-amber-500/10" 
                          : "border-neutral-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      )}
                    />
                    <div className="absolute right-3.5 top-3.5 text-neutral-500 pointer-events-none">
                      <Lock size={16} />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={otpSubmitting || !otpInput.trim()}
                  className={cn(
                    "w-full py-2.5 px-4 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50",
                    status?.awaitingOtp
                      ? "bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/20"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white"
                  )}
                >
                  <Send size={14} className={otpSubmitting ? "animate-spin" : ""} />
                  {otpSubmitting ? 'ব্রাউজারে সাবমিট হচ্ছে...' : 'Submit OTP to Browser'}
                </button>

                {otpError && (
                  <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                    {otpError}
                  </div>
                )}

                {otpSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    {otpSuccess}
                  </div>
                )}
              </form>
            </div>

            {/* Live Headless Browser Screen Preview Card */}
            <div className="pt-3 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Eye size={13} className="text-indigo-400" />
                  Live Browser View (লাইভ স্ক্রিন)
                </span>
                <span className="text-[10px] font-mono text-neutral-400 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800 truncate max-w-[160px]">
                  {status?.currentUrl || 'Browser Offline'}
                </span>
              </div>
              <div className="relative w-full h-36 bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden flex items-center justify-center">
                {status?.screenshot ? (
                  <img 
                    src={status.screenshot} 
                    alt="Live Browser View" 
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <div className="text-center p-3">
                    <Cpu size={22} className="mx-auto text-neutral-600 mb-1.5 animate-pulse" />
                    <p className="text-[11px] text-neutral-500">
                      {status?.isRunning ? 'ব্রাউজার পেজ লোড হচ্ছে...' : 'ওয়ার্কার বন্ধ আছে (Start করে লাইভ দেখুন)'}
                    </p>
                  </div>
                )}
                <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-neutral-900/80 backdrop-blur border border-neutral-800 text-[9px] font-mono text-neutral-400">
                  Auto-refresh (2s)
                </div>
              </div>
            </div>

            {/* Telegram Bot Helper Note */}
            <div className="pt-3 border-t border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
              <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                <Send size={12} className="text-blue-400" />
                <span>টেলিগ্রাম বটের সরাসরি সুবিধা:</span>
              </div>
              <p className="text-neutral-500 leading-relaxed">
                ড্যাশবোর্ডের পাশাপাশি আপনি অনুমোদিত Telegram Bot চ্যাটে যেকোনো সময় কোডটি টাইপ করে পাঠিয়ে দিলেও স্ক্রিপ্ট গ্রহণ করবে।
              </p>
            </div>
          </div>

          {/* ======================================================== */}
          {/* COLUMN 2: WORKER ACTIVITY LOG CONSOLE (7 COLS)             */}
          {/* ======================================================== */}
          <div className="lg:col-span-7 flex flex-col bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-3">
            {/* Console Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Terminal size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Worker Activity Log Console</h3>
                    <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400">হেডলেস ব্রাউজার ও স্ক্র্যাপারের লাইভ কার্যক্রম স্ট্রিম</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  disabled={logs.length === 0}
                  className="px-2.5 py-1 text-[11px] rounded bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition flex items-center gap-1 border border-neutral-700/60 disabled:opacity-40"
                  title="Copy logs to clipboard"
                >
                  {copiedLogs ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedLogs ? 'Copied' : 'Copy'}
                </button>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={logs.length === 0}
                  className="px-2.5 py-1 text-[11px] rounded bg-neutral-800 text-neutral-300 hover:text-rose-400 hover:bg-neutral-700 transition flex items-center gap-1 border border-neutral-700/60 disabled:opacity-40"
                  title="Clear console"
                >
                  <Trash2 size={12} />
                  Clear
                </button>

                <button
                  type="button"
                  onClick={fetchLogs}
                  className="p-1 text-neutral-400 hover:text-white transition rounded hover:bg-neutral-800"
                  title="Refresh logs"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
              {/* Level Filter Buttons */}
              <div className="flex items-center gap-1 p-0.5 bg-neutral-950 rounded-lg border border-neutral-800">
                {(['ALL', 'INFO', 'SUCCESS', 'WARN', 'ERROR'] as const).map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLogFilter(lvl)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-semibold transition-colors",
                      logFilter === lvl 
                        ? "bg-neutral-800 text-white shadow-sm" 
                        : "text-neutral-400 hover:text-neutral-200"
                    )}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative flex-1 sm:max-w-xs">
                <input
                  type="text"
                  placeholder="Filter logs by keyword..."
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  className="w-full px-2.5 py-1 pl-7 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Search size={12} className="absolute left-2.5 top-2 text-neutral-500" />
                {logSearch && (
                  <button
                    onClick={() => setLogSearch('')}
                    className="absolute right-2 top-1 text-[11px] text-neutral-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Monospace Terminal */}
            <div 
              ref={logsContainerRef}
              className="h-[300px] overflow-y-auto rounded-xl bg-neutral-950 border border-neutral-850 p-3 font-mono text-[11px] space-y-1.5 shadow-inner"
            >
              {filteredLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-neutral-500 text-xs font-sans gap-2">
                  <Terminal size={24} className="opacity-40" />
                  <span>কোনো লগ রেকর্ড পাওয়া যায়নি</span>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  let badge = 'text-neutral-400 bg-neutral-800/80';
                  let textColor = 'text-neutral-300';
                  if (log.level === 'SUCCESS') {
                    badge = 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
                    textColor = 'text-emerald-200';
                  } else if (log.level === 'WARN') {
                    badge = 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
                    textColor = 'text-amber-200';
                  } else if (log.level === 'ERROR') {
                    badge = 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
                    textColor = 'text-rose-200';
                  } else if (log.level === 'INFO') {
                    badge = 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/20';
                    textColor = 'text-neutral-300';
                  }

                  return (
                    <div 
                      key={log.id} 
                      className="flex items-start gap-2 py-0.5 hover:bg-neutral-900/60 rounded px-1 transition-colors leading-relaxed"
                    >
                      <span className="text-[10px] text-neutral-500 tabular-nums shrink-0 pt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={cn("px-1.5 py-0.2 rounded font-bold uppercase text-[9px] shrink-0 tracking-wider", badge)}>
                        {log.level}
                      </span>
                      <span className={cn("break-all flex-1", textColor)}>
                        {log.message}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Console Footer */}
            <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1">
              <span className="font-mono">
                Showing {filteredLogs.length} of {logs.length} logs
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-neutral-400 hover:text-white transition">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-indigo-600 focus:ring-0 w-3 h-3"
                />
                Auto-scroll on update
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Engine Status</span>
            <Cpu size={16} className="text-indigo-400" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            {getStatusBadge(status?.status)}
            <span className="text-xs text-neutral-500 font-mono">
              {status?.isRunning ? 'DAEMON_RUNNING' : 'DAEMON_STOPPED'}
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Browser Session</span>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <div className="mt-1">
            <div className="text-lg font-bold text-white flex items-center gap-2">
              {status?.hasStoredSession ? (
                <span className="text-emerald-400 flex items-center gap-1 text-sm font-semibold">
                  <CheckCircle2 size={16} /> Saved & Active
                </span>
              ) : (
                <span className="text-neutral-500 text-sm">No Cookies Saved</span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {status?.hasStoredSession ? 'লগিন সেশন ক্যাশে সংরক্ষিত রয়েছে' : 'প্রথমবার লগিনে সেশন সেভ হবে'}
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Orders Imported</span>
            <Database size={16} className="text-blue-400" />
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-white font-mono tabular-nums">
              {status?.totalOrdersImported || 0}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              ডাটাবেজে ইউনিক সংরক্ষণ সম্পন্ন
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Duplicates Filtered</span>
            <Clock size={16} className="text-purple-400" />
          </div>
          <div className="mt-1">
            <div className="text-2xl font-bold text-neutral-400 font-mono tabular-nums">
              {status?.totalOrdersDuplicates || 0}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              ডুপ্লিকেট রিকোয়েস্ট স্বয়ংক্রিয় ফিল্টার
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Configuration Form (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Scraper Configuration Form */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-4">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-indigo-400" />
                <h2 className="text-sm font-semibold text-white">Scraper Portal Configuration</h2>
              </div>
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={14} /> Saved!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleReloadConfig}
                  title="সেভ করা কনফিগারেশন রিলোড করুন"
                  className="px-2.5 py-1 text-[11px] text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg border border-neutral-800 flex items-center gap-1 transition cursor-pointer"
                >
                  <RotateCcw size={12} /> Reload Saved
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Portal Login URL (লগিন পেজ লিংক)
                  </label>
                  <input
                    type="text"
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                    placeholder="https://example.com/login"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Withdrawal Orders URL (উইথড্রল তালিকা পেজ লিংক - অপশনাল)
                  </label>
                  <input
                    type="text"
                    value={ordersUrl}
                    onChange={(e) => setOrdersUrl(e.target.value)}
                    placeholder="https://example.com/admin/withdrawals"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    লগিনের পর যদি সরাসরি উইথড্রল পেজে যেতে হয় তবে এখানে লিংক দিন।
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Username / ID (ইউজার আইডি)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin_agent"
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Password (পাসওয়ার্ড)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={status?.config.password ? '•••••••• (সংরক্ষিত আছে)' : 'পাসওয়ার্ড দিন'}
                      className="w-full px-3 py-2 pr-9 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-neutral-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Polling Interval (সেকেন্ড)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={pollInterval}
                    onChange={(e) => setPollInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">কত সেকেন্ড পর পর পেজ চেক করবে (১০-৬০ সেকেন্ড আদর্শ)</p>
                </div>

                <div className="flex flex-col justify-end space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={autoReloadCaptcha}
                      onChange={(e) => setAutoReloadCaptcha(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-indigo-600 focus:ring-0"
                    />
                    <span className="flex items-center gap-1.5">
                      লগিনে ক্যাপচা এলে পেজ রিলোড দিয়ে বাইপাস করুন
                      <span className="text-[10px] text-emerald-400 font-mono">(Captcha Reload)</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={notifyTelegram}
                      onChange={(e) => setNotifyTelegram(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-indigo-600 focus:ring-0"
                    />
                    নতুন অর্ডার পেলে Telegram এ অ্যালার্ট পাঠান
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={notifyLoginLogout}
                      onChange={(e) => setNotifyLoginLogout(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-indigo-600 focus:ring-0"
                    />
                    লগইন বা লগআউট (সেশন এক্সপায়ার) হলে টেলিগ্রামে অ্যালার্ট পাঠান
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-300">
                    <input
                      type="checkbox"
                      checked={headless}
                      onChange={(e) => setHeadless(e.target.checked)}
                      className="rounded bg-neutral-800 border-neutral-700 text-indigo-600 focus:ring-0"
                    />
                    Headless Mode (ব্যাকগ্রাউন্ড ব্রাউজার)
                  </label>
                </div>
              </div>

              {/* Advanced Custom Selectors Toggle */}
              <div className="pt-2 border-t border-neutral-900">
                <button
                  type="button"
                  onClick={() => setShowAdvancedSelectors(!showAdvancedSelectors)}
                  className="text-xs text-neutral-400 hover:text-indigo-400 flex items-center gap-1 transition"
                >
                  {showAdvancedSelectors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  কাস্টম CSS সিলেক্টর সেটিংস (এডভান্সড)
                </button>

                {showAdvancedSelectors && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-neutral-900/60 rounded-lg border border-neutral-800">
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Username Input Selector</label>
                      <input
                        type="text"
                        value={usernameSelector}
                        onChange={(e) => setUsernameSelector(e.target.value)}
                        placeholder="input[name='username']"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Password Input Selector</label>
                      <input
                        type="text"
                        value={passwordSelector}
                        onChange={(e) => setPasswordSelector(e.target.value)}
                        placeholder="input[name='password']"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">Submit Button Selector</label>
                      <input
                        type="text"
                        value={submitSelector}
                        onChange={(e) => setSubmitSelector(e.target.value)}
                        placeholder="button[type='submit']"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-400 mb-1">OTP Input Selector</label>
                      <input
                        type="text"
                        value={otpSelector}
                        onChange={(e) => setOtpSelector(e.target.value)}
                        placeholder="input[name='otp']"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] text-neutral-400 mb-1">Captcha Selector (ক্যাপচা শনাক্তকরণ সিলেক্টর - অপশনাল)</label>
                      <input
                        type="text"
                        value={captchaSelector}
                        onChange={(e) => setCaptchaSelector(e.target.value)}
                        placeholder="input[name*='captcha'], img[src*='captcha'], .captcha"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                      <p className="text-[10px] text-neutral-500 mt-0.5">ডিফল্টভাবে সাধারণ সব ক্যাপচা ইনপুট ও ইমেজ নিজে থেকেই শনাক্ত করে পেজ রিলোড করা হবে।</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[11px] text-neutral-400 mb-1">Orders Table / Container Selector</label>
                      <input
                        type="text"
                        value={tableSelector}
                        onChange={(e) => setTableSelector(e.target.value)}
                        placeholder="table, .withdrawal-table, .order-list"
                        className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-300 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                >
                  <Save size={14} />
                  Save Configuration
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Simulation Sandbox & Telegram Guide (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Test Order Injection / Simulation */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white text-sm font-semibold">
                <RefreshCw size={16} className="text-emerald-400" />
                <span>টেস্ট উইথড্রল ইনজেকশন (Simulation)</span>
              </div>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                Sandbox
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              পোর্টাল বন্ধ থাকলেও স্ক্র্যাপারের ডাটাবেজ ডুপ্লিকেশন ও টেলিগ্রাম অ্যালার্ট যাচাই করার জন্য টেস্ট অর্ডার পাঠান:
            </p>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] text-neutral-400">Order ID</label>
                <input
                  type="text"
                  value={simOrderId}
                  onChange={(e) => setSimOrderId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400">Amount (৳)</label>
                <input
                  type="number"
                  value={simAmount}
                  onChange={(e) => setSimAmount(e.target.value)}
                  className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-white font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-neutral-400">Method</label>
                <select
                  value={simMethod}
                  onChange={(e: any) => setSimMethod(e.target.value)}
                  className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-white text-xs"
                >
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="ROCKET">Rocket</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-neutral-400">Phone</label>
                <input
                  type="text"
                  value={simPhone}
                  onChange={(e) => setSimPhone(e.target.value)}
                  className="w-full px-2 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-white font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleSimulateOrder}
              className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs rounded-lg transition border border-neutral-700 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send size={13} />
              Inject Test Order to Database & Telegram
            </button>

            {simSuccessMsg && (
              <p className="text-xs text-emerald-400 font-medium text-center">{simSuccessMsg}</p>
            )}
          </div>

          {/* Dual OTP & Telegram Command Guide */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-white text-sm font-semibold">
              <Send size={16} className="text-blue-400" />
              <span>টেলিগ্রাম বটের কমান্ড ও OTP গাইড</span>
            </div>
            
            <div className="p-3 bg-neutral-900 rounded-lg border border-neutral-800 space-y-1.5 text-xs text-neutral-300">
              <p className="text-neutral-400 leading-relaxed text-[11px]">
                বট চালু থাকলে সরাসরি Telegram চ্যাটে <code className="text-indigo-400 font-mono">/automation</code> পাঠিয়ে যে কোনো সময় মোবাইল থেকে স্ক্র্যাপারের স্ট্যাটাস জানা যাবে।
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
