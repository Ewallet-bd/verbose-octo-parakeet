import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../store/auth';
import { useTheme, ThemeMode } from '../store/theme';
import { 
  useSound, 
  SOUND_OPTIONS, 
  SoundType, 
  TransactionStatusKey 
} from '../store/sound';
import { 
  Settings as SettingsIcon, 
  Bell, 
  BellOff, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Zap, 
  Clock, 
  Send,
  Sliders,
  Timer,
  Save,
  MessageSquare,
  Users as UsersIcon,
  UserPlus,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Palette,
  Check,
  Volume2,
  VolumeX,
  Volume1,
  Play,
  RotateCcw,
  Sparkles,
  Music,
  CheckCircle,
  Radio,
  ExternalLink,
  Bot,
  Key,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Terminal,
  HelpCircle,
  Server,
  ShieldCheck,
  Info,
  Activity,
  Wallet,
  Database,
  Download,
  Layers,
  HardDrive
} from 'lucide-react';
import { cn } from '../lib/utils';

interface PresetOption {
  label: string;
  bnLabel: string;
  seconds: number;
}

const PRESET_OPTIONS: PresetOption[] = [
  { label: '30s', bnLabel: '৩০ সেকেন্ড', seconds: 30 },
  { label: '1 min', bnLabel: '১ মিনিট (ডিফল্ট)', seconds: 60 },
  { label: '2 min', bnLabel: '২ মিনিট', seconds: 120 },
  { label: '3 min', bnLabel: '৩ মিনিট', seconds: 180 },
  { label: '5 min', bnLabel: '৫ মিনিট', seconds: 300 },
  { label: '10 min', bnLabel: '১০ মিনিট', seconds: 600 },
];

function formatDurationHuman(seconds: number): { en: string; bn: string } {
  const banglaDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  const toBn = (n: number | string) => String(n).replace(/\d/g, (d) => banglaDigits[parseInt(d, 10)] || d);

  if (seconds % 60 === 0) {
    const mins = seconds / 60;
    return {
      en: `${mins} minute${mins > 1 ? 's' : ''}`,
      bn: `${toBn(mins)} মিনিট`
    };
  }
  if (seconds < 60) {
    return {
      en: `${seconds} seconds`,
      bn: `${toBn(seconds)} সেকেন্ড`
    };
  }
  const mins = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return {
    en: `${mins}m ${remSec}s`,
    bn: `${toBn(mins)} মিনিট ${toBn(remSec)} সেকেন্ড`
  };
}

export default function Settings() {
  const { token, user } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  
  // Sound Notification Store
  const {
    settings: soundSettings,
    setMasterEnabled: setSoundMasterEnabled,
    setVolume: setSoundVolume,
    setStatusSoundEnabled,
    setStatusSoundType,
    setBrowserNotifications,
    resetToDefaults: resetSoundDefaults,
    playTestSound,
    playSoundForStatus,
    audioUnlocked,
    unlockAudio
  } = useSound();

  const [activeTestingSound, setActiveTestingSound] = useState<string | null>(null);
  const [soundFeedback, setSoundFeedback] = useState<string | null>(null);

  const handlePlayStatusPreview = (statusKey: TransactionStatusKey, soundType: SoundType) => {
    setActiveTestingSound(`${statusKey}_${soundType}`);
    playTestSound(soundType);
    const soundObj = SOUND_OPTIONS.find(s => s.id === soundType);
    setSoundFeedback(`'${soundObj?.bnLabel || soundType}' সাউন্ড প্লে করা হয়েছে।`);
    setTimeout(() => {
      setActiveTestingSound(null);
    }, 1000);
    setTimeout(() => {
      setSoundFeedback(null);
    }, 3500);
  };

  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(true);
    const [timeoutSeconds, setTimeoutSeconds] = useState<number>(60);
  const [reminderMessageTemplate, setReminderMessageTemplate] = useState<string>('');
  const [customValue, setCustomValue] = useState<string>('2');
  const [customUnit, setCustomUnit] = useState<'minutes' | 'seconds'>('minutes');
  const [botRunning, setBotRunning] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Telegram Bot Live State
  const [telegramTokenInput, setTelegramTokenInput] = useState<string>('');
  const [showTelegramToken, setShowTelegramToken] = useState<boolean>(false);
  const [telegramChatIdInput, setTelegramChatIdInput] = useState<string>('');
  const [telegramStatus, setTelegramStatus] = useState<{
    isRunning: boolean;
    username: string | null;
    tokenMasked: string | null;
    hasConfiguredToken: boolean;
    lastError: string | null;
    authorizedChatId: string | null;
  } | null>(null);
  const [savingTelegram, setSavingTelegram] = useState<boolean>(false);
  const [telegramSuccess, setTelegramSuccess] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  // Test Ping State
  const [testChatIdInput, setTestChatIdInput] = useState<string>('');
  const [testingPing, setTestingPing] = useState<boolean>(false);
  const [pingSuccess, setPingSuccess] = useState<string | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  // Security / JWT Secret State
  const [jwtSecretInput, setJwtSecretInput] = useState<string>('');
  const [showJwtSecret, setShowJwtSecret] = useState<boolean>(false);
  const [jwtStatus, setJwtStatus] = useState<{
    hasCustomJwt: boolean;
    jwtSecretMasked: string;
    port: string;
    environment: string;
  } | null>(null);
  const [savingJwt, setSavingJwt] = useState<boolean>(false);
  const [jwtSuccess, setJwtSuccess] = useState<string | null>(null);
  const [jwtError, setJwtError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // System Services Health State (PaddleOCR & Telegram Bot)
  const [servicesHealth, setServicesHealth] = useState<{
    paddle?: {
      status: 'healthy' | 'attention_required' | 'not_configured';
      isHealthy: boolean;
      message: string;
      url?: string | null;
      lastChecked?: number;
    };
    telegram: {
      status: 'healthy' | 'attention_required';
      isHealthy: boolean;
      message: string;
      username?: string | null;
      isRunning?: boolean;
      hasConfiguredToken?: boolean;
      lastError?: string | null;
      lastChecked?: number;
    };
    database?: {
      engine: 'mysql' | 'sqlite';
      configuredEngine: 'mysql' | 'sqlite';
      isOnline: boolean;
      activeEngineLabel: string;
      host?: string;
      port?: number;
      database?: string;
      user?: string;
      tables: string[];
      counts: {
        users: number;
        paymentRequests: number;
        auditLogs: number;
        routingRules: number;
        groupBalances: number;
        groupLedgerEntries: number;
      };
      phpMyAdminReady: boolean;
      message: string;
      lastError?: string;
    };
  } | null>(null);
  const [checkingHealth, setCheckingHealth] = useState<boolean>(false);

  // CloudPanel MySQL & phpMyAdmin Dual-Mode Database State
  const [dbStatus, setDbStatus] = useState<{
    engine: 'mysql' | 'sqlite';
    configuredEngine: 'mysql' | 'sqlite';
    isOnline: boolean;
    activeEngineLabel: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    tables: string[];
    counts: {
      users: number;
      paymentRequests: number;
      auditLogs: number;
      routingRules: number;
      groupBalances: number;
      groupLedgerEntries: number;
    };
    phpMyAdminReady: boolean;
    message: string;
    lastError?: string;
  } | null>(null);
  const [loadingDb, setLoadingDb] = useState<boolean>(false);
  const [migratingDb, setMigratingDb] = useState<boolean>(false);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string; migrated?: Record<string, number> } | null>(null);
  const [showMysqlTester, setShowMysqlTester] = useState<boolean>(false);
  const [testingMysql, setTestingMysql] = useState<boolean>(false);
  const [mysqlTestResult, setMysqlTestResult] = useState<{ success: boolean; message: string; tableCount?: number } | null>(null);
  const [mysqlTestForm, setMysqlTestForm] = useState({
    host: '127.0.0.1',
    port: '3306',
    database: 'payment_gateway',
    user: 'payment_user',
    password: ''
  });
  const [showDbGuide, setShowDbGuide] = useState<boolean>(false);
  const [exportingDump, setExportingDump] = useState<boolean>(false);

  // Daily Auto Balance State
  const [autoBalStatus, setAutoBalStatus] = useState<{
    enabled: boolean;
    scheduledTime: string;
    scheduledTimeBD: string;
    currentBDTime: string;
    lastTriggeredDateStr: string | null;
    isRunning: boolean;
  } | null>(null);
  const [autoBalTimeInput, setAutoBalTimeInput] = useState<string>('23:58');
  const [savingAutoBalTime, setSavingAutoBalTime] = useState<boolean>(false);
  const [triggeringAutoBal, setTriggeringAutoBal] = useState<boolean>(false);
  const [autoBalFeedback, setAutoBalFeedback] = useState<{ success?: string; error?: string } | null>(null);

  const fetchAutoBalStatus = async () => {
    try {
      const res = await apiFetch('/api/settings/auto-bal', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAutoBalStatus(data.data);
        if (data.data.scheduledTime) {
          setAutoBalTimeInput(data.data.scheduledTime);
        }
      }
    } catch (e) {
      console.error('Error fetching auto-bal status:', e);
    }
  };

  const handleSaveAutoBalTime = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAutoBalTime(true);
    setAutoBalFeedback(null);
    try {
      const res = await apiFetch('/api/settings/auto-bal/time', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ time: autoBalTimeInput })
      });
      const data = await res.json();
      if (data.success) {
        setAutoBalFeedback({ success: data.message });
        if (data.data) {
          setAutoBalStatus(data.data);
          if (data.data.scheduledTime) {
            setAutoBalTimeInput(data.data.scheduledTime);
          }
        }
      } else {
        setAutoBalFeedback({ error: data.error || 'Failed to update schedule time' });
      }
    } catch (err: any) {
      setAutoBalFeedback({ error: err?.message || 'Error saving time' });
    } finally {
      setSavingAutoBalTime(false);
    }
  };

  const handleTriggerAutoBalNow = async () => {
    setTriggeringAutoBal(true);
    setAutoBalFeedback(null);
    try {
      const res = await apiFetch('/api/settings/auto-bal/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAutoBalFeedback({ success: data.message });
        fetchAutoBalStatus();
      } else {
        setAutoBalFeedback({ error: data.error || 'Failed to trigger balance check' });
      }
    } catch (err: any) {
      setAutoBalFeedback({ error: err?.message || 'Error executing request' });
    } finally {
      setTriggeringAutoBal(false);
    }
  };

  const fetchServicesHealth = async (forceRefresh = false) => {
    setCheckingHealth(true);
    try {
      const url = forceRefresh ? '/api/settings/services-health?refresh=true' : '/api/settings/services-health';
      const res = await apiFetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setServicesHealth(data.data);
        if (data.data.database) {
          setDbStatus(data.data.database);
        }
      }
    } catch (e) {
      console.error('Error fetching services health:', e);
    } finally {
      setCheckingHealth(false);
    }
  };

  const fetchDbStatus = async () => {
    setLoadingDb(true);
    try {
      const res = await apiFetch('/api/database/status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setDbStatus(data.data);
      }
    } catch (e) {
      console.error('Error fetching database status:', e);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleMigrateToMysql = async () => {
    if (!window.confirm("আপনি কি নিশ্চিত যে SQLite-এর সমস্ত রিকোয়েস্ট, ইউজার ও সেটিংস CloudPanel MySQL-এ স্থানান্তর (Migrate) করতে চান?")) return;
    setMigratingDb(true);
    setMigrationResult(null);
    try {
      const res = await apiFetch('/api/database/migrate-to-mysql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMigrationResult(data);
      await fetchDbStatus();
      await fetchServicesHealth(true);
    } catch (e: any) {
      setMigrationResult({ success: false, message: e.message || 'Migration request failed' });
    } finally {
      setMigratingDb(false);
    }
  };

  const handleExportSqlDump = async () => {
    setExportingDump(true);
    try {
      const res = await apiFetch('/api/database/export-sql', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phpmyadmin_dump_${Date.now()}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error('Export SQL dump failed:', e);
    } finally {
      setExportingDump(false);
    }
  };

  const handleTestMysql = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingMysql(true);
    setMysqlTestResult(null);
    try {
      const res = await apiFetch('/api/database/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(mysqlTestForm)
      });
      const data = await res.json();
      setMysqlTestResult(data);
    } catch (e: any) {
      setMysqlTestResult({ success: false, message: e.message || 'Test connection request failed' });
    } finally {
      setTestingMysql(false);
    }
  };

  const fetchTelegramSettings = async () => {
    try {
      const res = await apiFetch('/api/settings/telegram', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setTelegramStatus(data.data);
        if (data.data.authorizedChatId && !telegramChatIdInput) {
          setTelegramChatIdInput(data.data.authorizedChatId);
        }
      }
    } catch (e) {
      console.error('Error fetching telegram status:', e);
    }
  };

  const fetchSecuritySettings = async () => {
    try {
      const res = await apiFetch('/api/settings/security', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setJwtStatus(data.data);
      }
    } catch (e) {
      console.error('Error fetching security settings:', e);
    }
  };

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch('/api/settings', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAutoReminderEnabled(data.data.autoReminderEnabled);
        const sec = data.data.reminderTimeoutSeconds || 60;
        setTimeoutSeconds(sec);
        if (sec % 60 === 0) {
          setCustomValue(String(sec / 60));
          setCustomUnit('minutes');
        } else {
          setCustomValue(String(sec));
          setCustomUnit('seconds');
        }
        setBotRunning(data.data.botRunning);
      }
      await Promise.all([fetchTelegramSettings(), fetchSecuritySettings(), fetchServicesHealth(), fetchAutoBalStatus()]);
    } catch (err: any) {
      console.error(err);
      setErrorMessage('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSettings();
    }
  }, [token]);

  const handleSaveTelegramBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telegramTokenInput || telegramTokenInput.trim().length < 20) {
      setTelegramError('অনুগ্রহ করে একটি সঠিক টেলিগ্রাম বট টোকেন দিন (Telegram Bot Token is required)');
      return;
    }

    setSavingTelegram(true);
    setTelegramSuccess(null);
    setTelegramError(null);

    try {
      const res = await apiFetch('/api/settings/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          token: telegramTokenInput.trim(),
          authorizedChatId: telegramChatIdInput.trim() || undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramSuccess(data.message || 'বট সফলভাবে কানেক্ট হয়েছে!');
        setTelegramTokenInput('');
        await fetchTelegramSettings();
        await fetchSettings();
        setTimeout(() => setTelegramSuccess(null), 6000);
      } else {
        setTelegramError(data.error || 'বট কানেক্ট করতে ব্যর্থ হয়েছে। টোকেনটি সঠিক কিনা যাচাই করুন।');
      }
    } catch (err: any) {
      setTelegramError('সার্ভারে যোগাযোগ করতে ব্যর্থ হয়েছে। নেটওয়ার্ক চেক করুন।');
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleSendTestPing = async () => {
    setTestingPing(true);
    setPingSuccess(null);
    setPingError(null);
    try {
      const targetChat = testChatIdInput.trim() || telegramChatIdInput.trim() || undefined;
      const res = await apiFetch('/api/settings/telegram/test-ping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ targetChatId: targetChat })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPingSuccess(data.message || 'টেস্ট মেসেজ পাঠানো হয়েছে!');
        setTimeout(() => setPingSuccess(null), 5000);
      } else {
        setPingError(data.error || 'মেসেজ পাঠানো ব্যর্থ হয়েছে');
      }
    } catch (err) {
      setPingError('সার্ভার এরর: টেস্ট পিং পাঠানো যায়নি।');
    } finally {
      setTestingPing(false);
    }
  };

  const handleGenerateRandomJwt = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~';
    let generated = '';
    for (let i = 0; i < 32; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setJwtSecretInput(generated);
  };

  const handleSaveJwtSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jwtSecretInput || jwtSecretInput.trim().length < 8) {
      setJwtError('JWT Secret কমপক্ষে ৮ অক্ষরের হতে হবে (Minimum 8 characters)');
      return;
    }

    setSavingJwt(true);
    setJwtSuccess(null);
    setJwtError(null);

    try {
      const res = await apiFetch('/api/settings/security', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ jwtSecret: jwtSecretInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setJwtSuccess(data.message || 'JWT Secret সফলভাবে আপডেট হয়েছে!');
        setJwtSecretInput('');
        await fetchSecuritySettings();
        setTimeout(() => setJwtSuccess(null), 5000);
      } else {
        setJwtError(data.error || 'JWT Secret আপডেট করতে ব্যর্থ হয়েছে');
      }
    } catch (err) {
      setJwtError('সার্ভার এরর: সিক্রেট আপডেট করা যায়নি');
    } finally {
      setSavingJwt(false);
    }
  };


  const saveSettingsPayload = async (payload: { autoReminderEnabled?: boolean; reminderTimeoutSeconds?: number, reminderMessageTemplate?: string }) => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (typeof data.data.autoReminderEnabled === 'boolean') {
          setAutoReminderEnabled(data.data.autoReminderEnabled);
        }
        if (typeof data.data.reminderTimeoutSeconds === 'number') {
          setTimeoutSeconds(data.data.reminderTimeoutSeconds);
        }
        const human = formatDurationHuman(data.data.reminderTimeoutSeconds || timeoutSeconds);
        setSuccessMessage(
          payload.autoReminderEnabled !== undefined
            ? (payload.autoReminderEnabled 
                ? `পেন্ডিং অর্ডারের টেলিগ্রাম মেনশন অ্যালার্ট (${human.bn}) চালু (Enable) করা হয়েছে।`
                : 'পেন্ডিং অর্ডারের টেলিগ্রাম মেনশন অ্যালার্ট বন্ধ (Disable) করা হয়েছে।')
            : `অ্যালার্টের সময়সীমা সফলভাবে ${human.bn} (${human.en}) নির্ধারণ করা হয়েছে।`
        );
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setErrorMessage(data.error || 'Failed to update settings');
      }
    } catch (err: any) {
      setErrorMessage('Network error while updating settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoReminder = async (newValue: boolean) => {
    setAutoReminderEnabled(newValue);
    await saveSettingsPayload({ autoReminderEnabled: newValue });
  };

  const handleSelectPreset = async (seconds: number) => {
    setTimeoutSeconds(seconds);
    if (seconds % 60 === 0) {
      setCustomValue(String(seconds / 60));
      setCustomUnit('minutes');
    } else {
      setCustomValue(String(seconds));
      setCustomUnit('seconds');
    }
    await saveSettingsPayload({ reminderTimeoutSeconds: seconds });
  };

  const handleSaveCustomThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customValue);
    if (isNaN(val) || val <= 0) {
      setErrorMessage('অনুগ্রহ করে একটি সঠিক সময়সীমা লিখুন (যেমন: 1, 2, 5)');
      return;
    }

    let calculatedSeconds = customUnit === 'minutes' ? Math.round(val * 60) : Math.round(val);
    if (calculatedSeconds < 15) {
      calculatedSeconds = 15;
      setErrorMessage('নূন্যতম সময়সীমা ১৫ সেকেন্ড হতে হবে।');
      return;
    }
    if (calculatedSeconds > 3600) {
      calculatedSeconds = 3600;
      setErrorMessage('সর্বোচ্চ সময়সীমা ৬০ মিনিট (৩৬০০ সেকেন্ড) হতে পারে।');
      return;
    }

    setTimeoutSeconds(calculatedSeconds);
    await saveSettingsPayload({ reminderTimeoutSeconds: calculatedSeconds });
  };

  const activeHuman = formatDurationHuman(timeoutSeconds);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <SettingsIcon size={24} className="text-blue-500" />
          Admin & Automation Settings
        </h1>
        <p className="text-neutral-400">
          টেলিগ্রাম বটের অটো-নোটিফিকেশন, মেনশন ও পেন্ডিং অর্ডারের সময়সীমা (Time Threshold) কনফিগার করুন।
        </p>
      </div>

      {/* Services Connection Health Status Indicator (Gemini OCR & Telegram Bot API) */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-neutral-800/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Activity size={15} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">সার্ভিস কানেকশন স্ট্যাটাস (Service Connection Health)</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60">Live</span>
              </div>
              <p className="text-xs text-neutral-400">PaddleOCR ওপেন-সোর্স ইঞ্জিন এবং Telegram Bot API কানেকশনের বর্তমান লাইভ অবস্থা।</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchServicesHealth(true)}
            disabled={checkingHealth}
            className="self-start sm:self-auto text-xs px-3 py-1.5 rounded-lg font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="সার্ভিস স্ট্যাটাস পুনরায় যাচাই করুন"
          >
            <RefreshCw size={12} className={checkingHealth ? "animate-spin text-blue-400" : "text-neutral-400"} />
            <span>{checkingHealth ? 'যাচাই হচ্ছে...' : 'রিফ্রেশ করুন'}</span>
          </button>
        </div>

        {/* Status Indicators Grid (PaddleOCR, Telegram Bot, CloudPanel Database) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Open-Source PaddleOCR Service Status Card */}
          <div className={cn(
            "p-3.5 rounded-xl border transition-all flex items-start gap-3",
            servicesHealth?.paddle?.status === 'healthy'
              ? "bg-emerald-500/[0.04] border-emerald-500/20"
              : servicesHealth?.paddle?.status === 'attention_required'
                ? "bg-amber-500/[0.04] border-amber-500/20"
                : "bg-neutral-900/60 border-neutral-800"
          )}>
            <div className="mt-0.5 shrink-0">
              {servicesHealth?.paddle?.status === 'healthy' ? (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
              ) : servicesHealth?.paddle?.status === 'attention_required' ? (
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={16} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700/60 flex items-center justify-center text-neutral-400">
                  <Terminal size={16} />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">PaddleOCR Engine</span>
                  <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/40 px-1 py-0.2 rounded border border-cyan-800/40">Unlimited</span>
                </div>
                <span className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap border",
                  servicesHealth?.paddle?.status === 'healthy'
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : servicesHealth?.paddle?.status === 'attention_required'
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : "bg-neutral-800 text-neutral-400 border-neutral-700"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    servicesHealth?.paddle?.status === 'healthy'
                      ? "bg-emerald-400 animate-pulse"
                      : servicesHealth?.paddle?.status === 'attention_required'
                        ? "bg-amber-400"
                        : "bg-neutral-500"
                  )} />
                  <span>
                    {servicesHealth?.paddle?.status === 'healthy'
                      ? 'Online'
                      : servicesHealth?.paddle?.status === 'attention_required'
                        ? 'Check'
                        : 'Standby'}
                  </span>
                </span>
              </div>

              <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed truncate">
                {servicesHealth?.paddle ? servicesHealth.paddle.message : 'PaddleOCR স্ট্যাটাস যাচাই হচ্ছে...'}
              </p>

              <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400">
                <span className="flex items-center gap-1 truncate">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    servicesHealth?.paddle?.url ? "bg-emerald-400" : "bg-neutral-500"
                  )} />
                  {servicesHealth?.paddle?.url ? `Port: ${servicesHealth.paddle.url}` : 'Port 5000'}
                </span>
              </div>
            </div>
          </div>

          {/* Telegram Bot API Status Card */}
          <div className={cn(
            "p-3.5 rounded-xl border transition-all flex items-start gap-3",
            servicesHealth?.telegram.status === 'healthy'
              ? "bg-emerald-500/[0.04] border-emerald-500/20"
              : "bg-amber-500/[0.04] border-amber-500/20"
          )}>
            <div className="mt-0.5 shrink-0">
              {servicesHealth?.telegram.status === 'healthy' ? (
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                  <Bot size={16} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400">
                  <AlertTriangle size={16} />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">Telegram Bot API</span>
                  {servicesHealth?.telegram.username && (
                    <span className="text-[10px] text-blue-400 font-mono">@{servicesHealth.telegram.username}</span>
                  )}
                </div>
                <span className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap border",
                  servicesHealth?.telegram.status === 'healthy'
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    servicesHealth?.telegram.status === 'healthy' ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                  )} />
                  <span>{servicesHealth?.telegram.status === 'healthy' ? 'Healthy' : 'Attention'}</span>
                </span>
              </div>

              <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed truncate">
                {servicesHealth ? servicesHealth.telegram.message : 'কানেকশন স্ট্যাটাস যাচাই হচ্ছে...'}
              </p>

              <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400">
                <span className="flex items-center gap-1">
                  <span className={cn("w-1.5 h-1.5 rounded-full", servicesHealth?.telegram.isRunning ? "bg-emerald-400" : "bg-amber-400")} />
                  {servicesHealth?.telegram.isRunning ? 'Bot Polling Active' : 'Bot Idle'}
                </span>
              </div>
            </div>
          </div>

          {/* Database Engine Status Card (CloudPanel MySQL / SQLite Fallback) */}
          <div className={cn(
            "p-3.5 rounded-xl border transition-all flex items-start gap-3",
            dbStatus?.engine === 'mysql'
              ? "bg-emerald-500/[0.04] border-emerald-500/20"
              : "bg-blue-500/[0.04] border-blue-500/20"
          )}>
            <div className="mt-0.5 shrink-0">
              <div className={cn(
                "w-8 h-8 rounded-lg border flex items-center justify-center",
                dbStatus?.engine === 'mysql'
                  ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                  : "bg-blue-500/10 border-blue-500/25 text-blue-400"
              )}>
                <Database size={16} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white">Database Engine</span>
                  <span className="text-[10px] text-purple-400 font-mono bg-purple-950/40 px-1 py-0.2 rounded border border-purple-800/40">Dual-Mode</span>
                </div>
                <span className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 whitespace-nowrap border",
                  dbStatus?.engine === 'mysql'
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                )}>
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    dbStatus?.engine === 'mysql' ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
                  )} />
                  <span>{dbStatus?.engine === 'mysql' ? 'MySQL (phpMyAdmin)' : 'SQLite (Fallback)'}</span>
                </span>
              </div>

              <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed truncate" title={dbStatus?.activeEngineLabel}>
                {dbStatus?.activeEngineLabel || 'Database স্ট্যাটাস লোড হচ্ছে...'}
              </p>

              <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-400">
                <span className="flex items-center gap-1 truncate">
                  <HardDrive size={10} className="text-neutral-500" />
                  <span>{dbStatus?.database || 'sqlite.db'} ({dbStatus?.counts?.paymentRequests || 0} orders)</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {successMessage && (
        <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-4 rounded-xl flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0 text-red-400" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CLOUDPANEL MYSQL & PHPMYADMIN DUAL-MODE DATABASE MANAGEMENT CARD */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
        {/* Header & Engine Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Database size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">CloudPanel MySQL ও phpMyAdmin ডেটাবেজ</h2>
                <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">
                  Dual-Mode Architecture
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                সরাসরি CloudPanel phpMyAdmin থেকে সমস্ত পেমেন্ট অর্ডার, অপারেটর ও ট্রানজ্যাকশন ডাটা ব্রাউজ, সার্চ ও ব্যাকআপ নিন।
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={cn(
              "text-xs px-3 py-1.5 rounded-full font-medium border flex items-center gap-1.5",
              dbStatus?.engine === 'mysql'
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-blue-500/10 text-blue-400 border-blue-500/30"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                dbStatus?.engine === 'mysql' ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
              )} />
              <span>{dbStatus?.engine === 'mysql' ? 'CloudPanel MySQL Active (phpMyAdmin Ready)' : 'SQLite Local Fallback Active'}</span>
            </span>

            <button
              type="button"
              onClick={fetchDbStatus}
              disabled={loadingDb}
              className="text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 p-2 rounded-lg transition disabled:opacity-50"
              title="রিফ্রেশ করুন"
            >
              <RefreshCw size={13} className={loadingDb ? "animate-spin text-purple-400" : ""} />
            </button>
          </div>
        </div>

        {/* Database Overview & Live Counters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-neutral-900/60 border border-neutral-800/80 p-3.5 rounded-xl">
            <span className="text-[11px] text-neutral-400 block font-medium">সক্রিয় ইঞ্জিন (Active Engine)</span>
            <div className="text-sm font-bold text-white mt-1 flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", dbStatus?.engine === 'mysql' ? "bg-emerald-400" : "bg-blue-400")} />
              {dbStatus?.engine === 'mysql' ? 'MySQL / MariaDB' : 'SQLite (Fallback)'}
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">
              {dbStatus?.engine === 'mysql' ? 'Host: ' + (dbStatus?.host || '127.0.0.1') : 'Local: sqlite.db'}
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 p-3.5 rounded-xl">
            <span className="text-[11px] text-neutral-400 block font-medium">পেমেন্ট রিকোয়েস্ট (Orders)</span>
            <div className="text-sm font-bold text-emerald-400 mt-1">
              {dbStatus?.counts?.paymentRequests || 0} টি অর্ডার
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">Table: payment_requests</span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 p-3.5 rounded-xl">
            <span className="text-[11px] text-neutral-400 block font-medium">ইউজার ও অপারেটর (Users)</span>
            <div className="text-sm font-bold text-blue-400 mt-1">
              {dbStatus?.counts?.users || 0} জন ইউজার
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">Table: users</span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 p-3.5 rounded-xl">
            <span className="text-[11px] text-neutral-400 block font-medium">অডিট ও অ্যাক্টিভিটি লগ</span>
            <div className="text-sm font-bold text-purple-400 mt-1">
              {dbStatus?.counts?.auditLogs || 0} টি লগ
            </div>
            <span className="text-[10px] text-neutral-500 mt-1 block">Table: audit_logs</span>
          </div>
        </div>

        {/* Database Status Message */}
        <div className={cn(
          "p-3.5 rounded-lg border text-xs flex items-start gap-2.5",
          dbStatus?.engine === 'mysql'
            ? "bg-emerald-500/[0.06] border-emerald-500/25 text-emerald-300"
            : "bg-blue-500/[0.06] border-blue-500/25 text-blue-300"
        )}>
          <Info size={16} className="shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">{dbStatus?.engine === 'mysql' ? 'CloudPanel phpMyAdmin সিঙ্ক সম্পন্ন:' : 'SQLite ডুয়াল-মোড তথ্য:'}</span>
            <p className="text-neutral-300">{dbStatus?.message || 'তথ্য লোড হচ্ছে...'}</p>
          </div>
        </div>

        {/* Migration Result Feedback */}
        {migrationResult && (
          <div className={cn(
            "p-4 rounded-xl border flex items-start gap-3 text-xs animate-fadeIn",
            migrationResult.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          )}>
            {migrationResult.success ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />}
            <div className="space-y-1.5 flex-1">
              <span className="font-semibold text-sm">{migrationResult.message}</span>
              {migrationResult.migrated && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-neutral-300">
                  <span className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">Orders: {migrationResult.migrated.payment_requests || 0}</span>
                  <span className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">Users: {migrationResult.migrated.users || 0}</span>
                  <span className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">Logs: {migrationResult.migrated.audit_logs || 0}</span>
                  <span className="bg-neutral-900/80 px-2 py-1 rounded border border-neutral-800">Rules: {migrationResult.migrated.routing_rules || 0}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons Toolbar */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleExportSqlDump}
            disabled={exportingDump}
            className="bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-700/80 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
            title="Download SQL file for phpMyAdmin import"
          >
            <Download size={14} className={exportingDump ? "animate-bounce text-purple-400" : "text-purple-400"} />
            <span>{exportingDump ? 'এক্সপোর্ট তৈরি হচ্ছে...' : 'phpMyAdmin SQL ডাম্প ডাউনলোড'}</span>
          </button>

          <button
            type="button"
            onClick={handleMigrateToMysql}
            disabled={migratingDb}
            className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
            title="Copy SQLite data to MySQL"
          >
            <RefreshCw size={14} className={migratingDb ? "animate-spin text-white" : ""} />
            <span>{migratingDb ? 'স্থানান্তর হচ্ছে...' : 'SQLite থেকে MySQL-এ ডাটা মাইগ্রেট'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMysqlTester(!showMysqlTester)}
            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/80 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
          >
            <Key size={14} className="text-blue-400" />
            <span>{showMysqlTester ? 'টেস্টার বন্ধ করুন' : 'MySQL কানেকশন টেস্ট'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDbGuide(!showDbGuide)}
            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700/80 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition ml-auto"
          >
            <HelpCircle size={14} className="text-amber-400" />
            <span>{showDbGuide ? 'গাইড বন্ধ করুন' : 'CloudPanel সেটআপ গাইড'}</span>
          </button>
        </div>

        {/* Live MySQL Connection Tester Drawer */}
        {showMysqlTester && (
          <div className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4.5 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-blue-400" />
                <span className="text-xs font-bold text-white">CloudPanel MySQL কানেকশন টেস্ট (Live Test Tool)</span>
              </div>
              <span className="text-[10px] text-neutral-400">আপনার ডাটাবেজ তথ্য লিখে টেস্ট বাটনে চাপুন</span>
            </div>

            <form onSubmit={handleTestMysql} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-neutral-400 block font-medium mb-1">Host</label>
                <input
                  type="text"
                  value={mysqlTestForm.host}
                  onChange={(e) => setMysqlTestForm({ ...mysqlTestForm, host: e.target.value })}
                  placeholder="127.0.0.1"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block font-medium mb-1">Port</label>
                <input
                  type="text"
                  value={mysqlTestForm.port}
                  onChange={(e) => setMysqlTestForm({ ...mysqlTestForm, port: e.target.value })}
                  placeholder="3306"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block font-medium mb-1">Database Name</label>
                <input
                  type="text"
                  value={mysqlTestForm.database}
                  onChange={(e) => setMysqlTestForm({ ...mysqlTestForm, database: e.target.value })}
                  placeholder="payment_gateway"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block font-medium mb-1">Database User</label>
                <input
                  type="text"
                  value={mysqlTestForm.user}
                  onChange={(e) => setMysqlTestForm({ ...mysqlTestForm, user: e.target.value })}
                  placeholder="payment_user"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block font-medium mb-1">Database Password</label>
                <input
                  type="password"
                  value={mysqlTestForm.password}
                  onChange={(e) => setMysqlTestForm({ ...mysqlTestForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={testingMysql}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs py-2 px-4 rounded-lg flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <RefreshCw size={13} className={testingMysql ? "animate-spin" : ""} />
                  <span>{testingMysql ? 'টেস্ট চলছে...' : 'কানেকশন টেস্ট করুন'}</span>
                </button>
              </div>
            </form>

            {mysqlTestResult && (
              <div className={cn(
                "p-3 rounded-lg text-xs font-mono border",
                mysqlTestResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-red-500/10 border-red-500/30 text-red-300"
              )}>
                {mysqlTestResult.message}
              </div>
            )}
          </div>
        )}

        {/* Expandable CloudPanel & phpMyAdmin Setup Guide */}
        {showDbGuide && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5 space-y-4 animate-fadeIn text-xs text-neutral-300 leading-relaxed">
            <div className="flex items-center gap-2 text-sm font-bold text-white border-b border-neutral-800 pb-2">
              <HelpCircle size={16} className="text-amber-400" />
              <span>CloudPanel ও phpMyAdmin এ ব্যবহারের ৩টি সহজ ধাপ:</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/80 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px]">১</span>
                  CloudPanel-এ Database তৈরি
                </div>
                <p className="text-neutral-400 text-[11px]">
                  CloudPanel ড্যাশবোর্ডে গিয়ে <b>Databases</b> &gt; <b>Add Database</b> দিন। Database Name: <code className="text-emerald-400">payment_gateway</code> এবং একটি User তৈরি করুন।
                </p>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/80 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px]">২</span>
                  .env ফাইলে তথ্য বসান
                </div>
                <p className="text-neutral-400 text-[11px]">
                  সার্ভারের <code className="text-yellow-400">.env</code> ফাইলে <code className="text-neutral-200">DB_TYPE=mysql</code> এবং আপনার CloudPanel MySQL ইউজার ও পাসওয়ার্ড লিখে দিন।
                </p>
              </div>

              <div className="bg-neutral-950 p-3.5 rounded-lg border border-neutral-800/80 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 flex items-center justify-center text-[10px]">৩</span>
                  phpMyAdmin এ লাইভ দেখুন
                </div>
                <p className="text-neutral-400 text-[11px]">
                  CloudPanel থেকে <b>Manage phpMyAdmin</b> ওপেন করলেই <code className="text-emerald-400">payment_requests</code>, <code className="text-emerald-400">users</code> সহ সমস্ত টেবিল সরাসরি পেয়ে যাবেন!
                </p>
              </div>
            </div>

            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
              <span>বিস্তারিত নির্দেশিকা পেতে প্রজেক্টের <code className="text-yellow-400">CLOUDPANEL_DB_SETUP.md</code> ও <code className="text-yellow-400">database/schema.sql</code> ফাইল দেখতে পারেন।</span>
              <a
                href="/CLOUDPANEL_DB_SETUP.md"
                target="_blank"
                rel="noreferrer"
                className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
              >
                <span>সম্পূর্ণ ডক</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Telegram Bot Token & Credentials Configuration Card */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
        {/* Header & Live Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Bot size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">টেলিগ্রাম বট কনফিগারেশন (Telegram Bot Settings)</h2>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">Live Sync</span>
              </div>
              <p className="text-xs text-neutral-400">ড্যাশবোর্ড থেকেই সরাসরি আপনার টেলিগ্রাম বট টোকেন বসান ও তাৎক্ষণিক কানেক্ট করুন।</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {telegramStatus?.isRunning && telegramStatus?.username ? (
              <a 
                href={`https://t.me/${telegramStatus.username}`} 
                target="_blank" 
                rel="noreferrer"
                className="text-xs px-3 py-1.5 rounded-full font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 hover:bg-emerald-500/20 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>@{telegramStatus.username} (Active)</span>
                <ExternalLink size={12} />
              </a>
            ) : (
              <div className="text-xs px-3 py-1.5 rounded-full font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>বট সংযুক্ত নেই (Not Connected)</span>
              </div>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {telegramSuccess && (
          <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-3.5 rounded-lg flex items-center gap-2.5 text-sm">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{telegramSuccess}</span>
          </div>
        )}

        {telegramError && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3.5 rounded-lg flex items-center gap-2.5 text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{telegramError}</span>
          </div>
        )}

        {/* Current Active Info Banner */}
        {telegramStatus?.hasConfiguredToken && (
          <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="text-neutral-400">বর্তমান সক্রিয় বট টোকেন:</div>
              <div className="font-mono text-neutral-200 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 inline-block">
                {telegramStatus.tokenMasked || '••••••••••••••••••••'}
              </div>
            </div>
            {telegramStatus.authorizedChatId && (
              <div className="space-y-1 sm:text-right">
                <div className="text-neutral-400">ডিফল্ট অথোরাইজড চ্যাট/গ্রুপ আইডি:</div>
                <div className="font-mono text-neutral-200 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 inline-block">
                  {telegramStatus.authorizedChatId}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bot Token Form */}
        <form onSubmit={handleSaveTelegramBot} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Token Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key size={14} className="text-blue-400" />
                  টেলিগ্রাম বট টোকেন (Telegram Bot Token) <span className="text-red-400">*</span>
                </span>
                <span className="text-[11px] text-neutral-400">@BotFather থেকে প্রাপ্ত</span>
              </label>
              <div className="relative">
                <input
                  type={showTelegramToken ? 'text' : 'password'}
                  value={telegramTokenInput}
                  onChange={(e) => setTelegramTokenInput(e.target.value)}
                  placeholder={telegramStatus?.hasConfiguredToken ? 'নতুন টোকেন বসাতে এখানে লিখুন (উদা: 8123456789:AA...)' : '8123456789:AAH...'}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowTelegramToken(!showTelegramToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                >
                  {showTelegramToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Chat ID Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-blue-400" />
                  টেলিগ্রাম গ্রুপ চ্যাট আইডি (Authorized Chat ID)
                </span>
                <span className="text-[11px] text-neutral-400">ঐচ্ছিক (উদা: -100xxxxxxxxxx)</span>
              </label>
              <input
                type="text"
                value={telegramChatIdInput}
                onChange={(e) => setTelegramChatIdInput(e.target.value)}
                placeholder="-1001234567890"
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle size={14} />
              <span>{showGuide ? 'গাইড বন্ধ করুন' : 'টোকেন ও চ্যাট আইডি কিভাবে পাবেন?'}</span>
            </button>

            <button
              type="submit"
              disabled={savingTelegram || !telegramTokenInput.trim()}
              className={cn(
                "px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm",
                savingTelegram || !telegramTokenInput.trim()
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
              )}
            >
              {savingTelegram ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>কানেক্ট ও পরীক্ষা করা হচ্ছে...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>টোকেন সেভ ও বট চালু করুন</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Step-by-step Bangla Helper Accordion */}
        {showGuide && (
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-lg p-4 space-y-3 text-xs text-neutral-300 animate-fadeIn">
            <div className="font-semibold text-white flex items-center gap-1.5">
              <Info size={14} className="text-blue-400" />
              টেলিগ্রাম বট ও গ্রুপ সেটআপ করার সহজ নিয়ম:
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-neutral-300 leading-relaxed">
              <li>টেলিগ্রামে <b>@BotFather</b> সার্চ করে <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-blue-300">/newbot</code> কমান্ড দিন।</li>
              <li>বটের নাম ও ইউজারনেম দিন (যেমন: <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-blue-300">my_deposit_bot</code>)।</li>
              <li>BotFather আপনাকে একটি <b>API Token</b> দিবে (যেমন: <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-blue-300">8123456789:AAH...</code>)। সেটি কপি করে উপরের বক্সে পেস্ট করে সেভ করুন।</li>
              <li>বটটিকে আপনার ডিপোজিট টেলিগ্রাম গ্রুপে <b>অ্যাড করুন</b> এবং বটকে <b>Admin Permission</b> দিন।</li>
              <li>গ্রুপ আইডি পাওয়ার জন্য টেলিগ্রামে <b>@userinfobot</b> বা <b>@raw_data_bot</b> কে গ্রুপে সাময়িক অ্যাড করে <code className="bg-neutral-800 px-1.5 py-0.5 rounded text-blue-300">-100...</code> আইডিটি সংগ্রহ করুন।</li>
            </ol>
          </div>
        )}

        {/* Telegram Test Ping Subsection */}
        {telegramStatus?.isRunning && (
          <div className="border-t border-neutral-800/80 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Send size={14} className="text-emerald-400" />
                  বট মেসেজ টেস্ট পিং (Live Test Ping)
                </h4>
                <p className="text-[11px] text-neutral-400">গ্রুপে টেস্ট মেসেজ পাঠিয়ে বট সক্রিয়ভাবে কাজ করছে কিনা নিশ্চিত হন।</p>
              </div>
            </div>

            {pingSuccess && (
              <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-2.5 rounded-lg flex items-center gap-2 text-xs">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{pingSuccess}</span>
              </div>
            )}

            {pingError && (
              <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-2.5 rounded-lg flex items-center gap-2 text-xs">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{pingError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <input
                type="text"
                value={testChatIdInput}
                onChange={(e) => setTestChatIdInput(e.target.value)}
                placeholder={telegramStatus?.authorizedChatId ? `ডিফল্ট গ্রুপ: ${telegramStatus.authorizedChatId}` : 'গ্রুপ বা চ্যাট আইডি (-100...)'}
                className="w-full sm:flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <button
                type="button"
                onClick={handleSendTestPing}
                disabled={testingPing}
                className={cn(
                  "w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 shrink-0",
                  testingPing
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                )}
              >
                {testingPing ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>পাঠানো হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Send size={12} />
                    <span>টেস্ট মেসেজ পাঠান</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Daily Automatic Balance Check Card */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Wallet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">দৈনিক অটোমেটিক ব্যালেন্স চেক (Daily Auto Balance Schedule)</h2>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                  {autoBalStatus?.scheduledTimeBD || 'BST 11:58 PM'}
                </span>
              </div>
              <p className="text-xs text-neutral-400">প্রতিদিন নির্ধারিত সময়ে (বাংলাদেশ সময়) স্বয়ংক্রিয়ভাবে সকল গ্রুপে ব্যালেন্স রিপোর্ট পাঠানো হয়।</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>সক্রিয় (Active)</span>
            </span>
          </div>
        </div>

        {autoBalFeedback?.success && (
          <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-3 rounded-lg flex items-center gap-2.5 text-xs">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{autoBalFeedback.success}</span>
          </div>
        )}

        {autoBalFeedback?.error && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg flex items-center gap-2.5 text-xs">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{autoBalFeedback.error}</span>
          </div>
        )}

        {/* Schedule Time Edit Form */}
        <form onSubmit={handleSaveAutoBalTime} className="bg-neutral-900/70 border border-neutral-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Clock size={14} className="text-emerald-400" />
                অটো ব্যালেন্স পাঠানোর সময় নির্ধারণ (Set Schedule Time)
              </label>
              <p className="text-[11px] text-neutral-400">বাংলাদেশ সময় (BST) অনুযায়ী সময় দিন। যেমন: রাত ১১:৫৮ হলে <code className="bg-neutral-800 px-1 py-0.5 rounded text-emerald-400">23:58</code> অথবা সকাল ১০:০০ হলে <code className="bg-neutral-800 px-1 py-0.5 rounded text-emerald-400">10:00</code></p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="time"
                value={autoBalTimeInput}
                onChange={(e) => setAutoBalTimeInput(e.target.value)}
                required
                className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={savingAutoBalTime}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shrink-0",
                  savingAutoBalTime
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white shadow"
                )}
              >
                {savingAutoBalTime ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    <span>সেভ হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Save size={12} />
                    <span>সময় সেভ করুন</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 space-y-1">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <Clock size={13} className="text-neutral-400" />
              বর্তমান নির্ধারিত সময় (Schedule)
            </span>
            <div className="text-sm font-semibold text-white font-mono">
              {autoBalStatus?.scheduledTimeBD || '11:58 PM BST'}
            </div>
            <p className="text-[10px] text-neutral-500">Asia/Dhaka টাইমজোন অনুযায়ী</p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 space-y-1">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <Activity size={13} className="text-emerald-400" />
              বর্তমান বাংলাদেশ সময় (Now)
            </span>
            <div className="text-sm font-semibold text-emerald-400 font-mono">
              {autoBalStatus?.currentBDTime ? `${autoBalStatus.currentBDTime} BST` : '--:--'}
            </div>
            <p className="text-[10px] text-neutral-500">বটের স্বয়ংক্রিয় ঘড়ি</p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 space-y-1">
            <span className="text-[11px] text-neutral-400 flex items-center gap-1.5">
              <CheckCircle size={13} className="text-blue-400" />
              সর্বশেষ পাঠানো হয়েছে
            </span>
            <div className="text-sm font-semibold text-neutral-200 font-mono">
              {autoBalStatus?.lastTriggeredDateStr || 'আজকের জন্য অপেক্ষমাণ'}
            </div>
            <p className="text-[10px] text-neutral-500">প্রতিদিন ১ বার কার্যকর হয়</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-neutral-400">
            বট চালু থাকলে নির্ধারিত সময়ে স্বয়ংক্রিয়ভাবে ব্যালেন্স, টুডে কমপ্লিট ও অর্ডার হিস্টোরি রিপোর্ট সব গ্রুপে পোস্ট হবে। এখনই পরীক্ষা করতে ডানপাশের বাটনে ক্লিক করতে পারেন।
          </p>
          <button
            type="button"
            onClick={handleTriggerAutoBalNow}
            disabled={triggeringAutoBal || !telegramStatus?.isRunning}
            className={cn(
              "w-full sm:w-auto px-4 py-2.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 shrink-0 border",
              triggeringAutoBal || !telegramStatus?.isRunning
                ? "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed"
                : "bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40"
            )}
          >
            {triggeringAutoBal ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>ব্যালেন্স চেক পাঠানো হচ্ছে...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>এখনই ব্যালেন্স চেক পাঠান (Trigger Now)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Security & JWT_SECRET Configuration Card (Admin Only) */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">সার্ভার সিকিউরিটি ও JWT সিক্রেট (JWT Secret Key)</h2>
                {user?.role === 'ADMIN' && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">Admin Only</span>
                )}
              </div>
              <p className="text-xs text-neutral-400">লগইন টোকেন এবং সার্ভার অথেনটিকেশন এনক্রিপশন কি (JWT_SECRET) পরিচালনা করুন।</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5",
              jwtStatus?.hasCustomJwt
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-neutral-800 text-neutral-400 border-neutral-700"
            )}>
              {jwtStatus?.hasCustomJwt ? 'Custom Secret Active' : 'Default Key'}
            </span>
          </div>
        </div>

        {jwtSuccess && (
          <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-3.5 rounded-lg flex items-center gap-2.5 text-sm">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>{jwtSuccess}</span>
          </div>
        )}

        {jwtError && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3.5 rounded-lg flex items-center gap-2.5 text-sm">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{jwtError}</span>
          </div>
        )}

        {/* Current masked value display */}
        <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <div className="text-neutral-400">বর্তমান সক্রিয় JWT Secret:</div>
            <div className="font-mono text-neutral-200 bg-neutral-950 px-2.5 py-1 rounded border border-neutral-800 inline-block mt-1">
              {jwtStatus?.jwtSecretMasked || 'fallback-secret-for-dev'}
            </div>
          </div>
          <div className="text-neutral-400 text-[11px] max-w-sm">
            নোট: JWT Secret পরিবর্তন করলে পূর্বের সব ইউজার সেশন রিনিউ হবে।
          </div>
        </div>

        {user?.role === 'ADMIN' ? (
          <form onSubmit={handleSaveJwtSecret} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock size={14} className="text-amber-400" />
                  নতুন JWT Secret কি (New JWT Secret)
                </span>
                <span className="text-[11px] text-neutral-400">নূন্যতম ৮ ক্যারেক্টার</span>
              </label>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative w-full sm:flex-1">
                  <input
                    type={showJwtSecret ? 'text' : 'password'}
                    value={jwtSecretInput}
                    onChange={(e) => setJwtSecretInput(e.target.value)}
                    placeholder="আপনার গোপন শক্তিশালী পাসওয়ার্ড কি লিখুন (যেমন: MySecretKey_2026!#)"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 font-mono pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJwtSecret(!showJwtSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                  >
                    {showJwtSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateRandomJwt}
                  className="w-full sm:w-auto px-3.5 py-2.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs font-medium text-neutral-200 transition-colors flex items-center justify-center gap-1.5 shrink-0"
                >
                  <Sparkles size={14} className="text-amber-400" />
                  <span>র্যান্ডম জেনারেট</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingJwt || !jwtSecretInput.trim()}
                className={cn(
                  "px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 shadow-sm",
                  savingJwt || !jwtSecretInput.trim()
                    ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                    : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20"
                )}
              >
                {savingJwt ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>সংরক্ষণ করা হচ্ছে...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>JWT Secret সেভ করুন</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-neutral-900/40 border border-neutral-800 p-3 rounded-lg text-xs text-neutral-400">
            🔒 শুধুমাত্র অ্যাডমিন (Admin) ইউজার সিকিউরিটি কি পরিবর্তন করতে পারবেন।
          </div>
        )}
      </div>

      {/* Global Theme & Appearance Toggle Card */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Palette size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">গ্লোবাল থিম মোড (Global Theme & Appearance)</h2>
              <p className="text-xs text-neutral-400">ডার্ক এবং লাইট মোডের মধ্যে তাৎক্ষণিক পরিবর্তন করুন (Switch between Light & Dark modes)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-400 hidden sm:inline">সক্রিয় থিম:</span>
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5",
              resolvedTheme === 'dark'
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
            )}>
              {resolvedTheme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
              {resolvedTheme === 'dark' ? 'Dark Mode Active' : 'Light Mode Active'}
            </span>
          </div>
        </div>

        {/* 3 Theme Mode Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Light Mode Card */}
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              "relative p-4 rounded-xl border text-left transition-all flex flex-col justify-between group cursor-pointer",
              theme === 'light'
                ? "bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-500/20 shadow-sm"
                : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
            )}
          >
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border transition-colors",
                theme === 'light'
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-500"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 group-hover:text-amber-400"
              )}>
                <Sun size={20} />
              </div>
              {theme === 'light' && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs shadow">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white">Light Mode</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-600 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">Day</span>
              </div>
              <p className="text-xs text-neutral-300 font-medium mt-0.5">পরিষ্কার ও উজ্জ্বল ইন্টারফেস</p>
              <p className="text-[11px] text-neutral-400 mt-1">High-contrast, crisp day theme for bright environments.</p>
            </div>
          </button>

          {/* Dark Mode Card */}
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              "relative p-4 rounded-xl border text-left transition-all flex flex-col justify-between group cursor-pointer",
              theme === 'dark'
                ? "bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/20 shadow-sm"
                : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
            )}
          >
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border transition-colors",
                theme === 'dark'
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-400"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 group-hover:text-blue-400"
              )}>
                <Moon size={20} />
              </div>
              {theme === 'dark' && (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs shadow">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white">Dark Mode</h3>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded font-mono">Night</span>
              </div>
              <p className="text-xs text-neutral-300 font-medium mt-0.5">চোখের জন্য আরামদায়ক ডার্ক থিম</p>
              <p className="text-[11px] text-neutral-400 mt-1">Deep neutral twilight theme for low-light comfort.</p>
            </div>
          </button>

          {/* System Sync Card */}
          <button
            type="button"
            onClick={() => setTheme('system')}
            className={cn(
              "relative p-4 rounded-xl border text-left transition-all flex flex-col justify-between group cursor-pointer",
              theme === 'system'
                ? "bg-purple-600/10 border-purple-500 ring-2 ring-purple-500/20 shadow-sm"
                : "bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
            )}
          >
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border transition-colors",
                theme === 'system'
                  ? "bg-purple-600/20 border-purple-500/40 text-purple-400"
                  : "bg-neutral-800 border-neutral-700 text-neutral-400 group-hover:text-purple-400"
              )}>
                <Monitor size={20} />
              </div>
              {theme === 'system' && (
                <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs shadow">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-white">System Preference</h3>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono">Auto</span>
              </div>
              <p className="text-xs text-neutral-300 font-medium mt-0.5">ডিভাইস সেটিংস অনুযায়ী অটো</p>
              <p className="text-[11px] text-neutral-400 mt-1">Automatically matches your operating system preference.</p>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* BROWSER SOUND NOTIFICATIONS & STATUS AUDIO ALERTS CARD */}
      {/* ========================================================================= */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-6">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Volume2 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">সাউন্ড নোটিফিকেশন সেটিংস (Sound & Audio Alerts)</h2>
                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
                  Real-time Audio
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                নতুন পেন্ডিং অর্ডার এবং বিভিন্ন ট্রানজ্যাকশন স্ট্যাটাসের জন্য নির্দিষ্ট ব্রাউজার সাউন্ড চালু/বন্ধ ও কাস্টমাইজ করুন
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium border flex items-center gap-1.5",
              soundSettings.masterEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-neutral-800 text-neutral-400 border-neutral-700"
            )}>
              {soundSettings.masterEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {soundSettings.masterEnabled ? `সাউন্ড চালু (${Math.round(soundSettings.volume * 100)}%)` : 'সাউন্ড বন্ধ'}
            </span>

            <button
              type="button"
              onClick={resetSoundDefaults}
              className="text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 px-3 py-1 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
              title="Reset sound settings to defaults"
            >
              <RotateCcw size={13} />
              রিসেট
            </button>
          </div>
        </div>

        {/* Live Audio Feedback Notice */}
        {soundFeedback && (
          <div className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-4 py-2.5 rounded-lg text-xs font-medium flex items-center justify-between animate-fadeIn">
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="animate-pulse" />
              {soundFeedback}
            </span>
            <span className="text-[11px] text-blue-300 font-mono">Web Audio API Active</span>
          </div>
        )}

        {/* Master Sound Controls Bar */}
        <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            
            {/* Master Toggle */}
            <div className="md:col-span-4 flex items-center justify-between md:justify-start gap-4 border-b md:border-b-0 md:border-r border-neutral-800/80 pb-3 md:pb-0 md:pr-4">
              <div>
                <span className="text-sm font-semibold text-white block">মাস্টার সাউন্ড (Master Sound)</span>
                <span className="text-xs text-neutral-400 block">সকল ব্রাউজার অডিও সতর্কতা</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={soundSettings.masterEnabled}
                onClick={() => {
                  const next = !soundSettings.masterEnabled;
                  setSoundMasterEnabled(next);
                  if (next) playTestSound('chime');
                }}
                className={cn(
                  "relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  soundSettings.masterEnabled ? "bg-emerald-600" : "bg-neutral-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    soundSettings.masterEnabled ? "translate-x-6" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Master Volume Slider */}
            <div className="md:col-span-5 flex items-center gap-3">
              <div className="text-neutral-400 shrink-0">
                {soundSettings.volume === 0 ? (
                  <VolumeX size={18} />
                ) : soundSettings.volume < 0.5 ? (
                  <Volume1 size={18} />
                ) : (
                  <Volume2 size={18} className="text-emerald-400" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-300 font-medium">ভলিউম (Volume):</span>
                  <span className="text-emerald-400 font-mono font-bold">{Math.round(soundSettings.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundSettings.volume}
                  onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                  disabled={!soundSettings.masterEnabled}
                  className="w-full h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-40"
                />
              </div>
            </div>

            {/* Quick Test Master Button */}
            <div className="md:col-span-3 flex justify-end">
              <button
                type="button"
                onClick={() => playTestSound('chime')}
                disabled={!soundSettings.masterEnabled}
                className="w-full md:w-auto bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold px-3.5 py-2 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-40 cursor-pointer shadow-sm"
              >
                <Play size={13} className="text-emerald-400 fill-emerald-400" />
                টেস্ট মাস্টার সাউন্ড
              </button>
            </div>
          </div>
        </div>

        {/* Status Specific Sound Alert Configuration */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Music size={15} className="text-blue-400" />
              ট্রানজ্যাকশন স্ট্যাটাস অনুযায়ী অডিও রুলস (Status-specific Sound Alerts)
            </h3>
            <span className="text-xs text-neutral-400">ব্যক্তিগতভাবে প্রতিটি স্ট্যাটাসের সাউন্ড কাস্টমাইজ করুন</span>
          </div>

          <div className="grid grid-cols-1 gap-3.5">
            {/* Status 1: PENDING (Primary Request Feature) */}
            {(() => {
              const cfg = soundSettings.statuses.PENDING;
              const isPlaying = activeTestingSound === `PENDING_${cfg.soundType}`;
              return (
                <div className={cn(
                  "p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                  cfg.enabled && soundSettings.masterEnabled
                    ? "bg-amber-950/20 border-amber-500/40 ring-1 ring-amber-500/20"
                    : "bg-neutral-900/40 border-neutral-800 opacity-80"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      cfg.enabled && soundSettings.masterEnabled
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500"
                    )}>
                      <Bell size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {cfg.bnTitle} ({cfg.title})
                        </span>
                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          PENDING
                        </span>
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] px-1.5 py-0.2 rounded font-mono">
                          Primary Alert
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {cfg.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                    {/* Sound Selector Dropdown */}
                    <div className="relative">
                      <select
                        value={cfg.soundType}
                        onChange={(e) => setStatusSoundType('PENDING', e.target.value as SoundType)}
                        disabled={!cfg.enabled || !soundSettings.masterEnabled}
                        className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium cursor-pointer disabled:opacity-50"
                      >
                        {SOUND_OPTIONS.map(opt => (
                          <option key={opt.id} value={opt.id}>
                            🎵 {opt.bnLabel} ({opt.label})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Test Sound Button */}
                    <button
                      type="button"
                      onClick={() => handlePlayStatusPreview('PENDING', cfg.soundType)}
                      disabled={!soundSettings.masterEnabled}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer shadow-sm",
                        isPlaying
                          ? "bg-amber-500 text-black border-amber-400"
                          : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700"
                      )}
                      title="Play Sound Preview"
                    >
                      <Play size={12} className={cn(isPlaying ? "fill-black" : "text-amber-400 fill-amber-400")} />
                      {isPlaying ? 'বাজছে...' : 'টেস্ট সাউন্ড'}
                    </button>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      disabled={!soundSettings.masterEnabled}
                      onClick={() => setStatusSoundEnabled('PENDING', !cfg.enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40",
                        cfg.enabled && soundSettings.masterEnabled ? "bg-amber-500" : "bg-neutral-700"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          cfg.enabled && soundSettings.masterEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Status 2: COMPLETED */}
            {(() => {
              const cfg = soundSettings.statuses.COMPLETED;
              const isPlaying = activeTestingSound === `COMPLETED_${cfg.soundType}`;
              return (
                <div className={cn(
                  "p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                  cfg.enabled && soundSettings.masterEnabled
                    ? "bg-emerald-950/20 border-emerald-500/40 ring-1 ring-emerald-500/20"
                    : "bg-neutral-900/40 border-neutral-800 opacity-80"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      cfg.enabled && soundSettings.masterEnabled
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500"
                    )}>
                      <CheckCircle2 size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {cfg.bnTitle} ({cfg.title})
                        </span>
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          COMPLETED
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {cfg.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                    <select
                      value={cfg.soundType}
                      onChange={(e) => setStatusSoundType('COMPLETED', e.target.value as SoundType)}
                      disabled={!cfg.enabled || !soundSettings.masterEnabled}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {SOUND_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          🎵 {opt.bnLabel} ({opt.label})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handlePlayStatusPreview('COMPLETED', cfg.soundType)}
                      disabled={!soundSettings.masterEnabled}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer shadow-sm",
                        isPlaying
                          ? "bg-emerald-500 text-black border-emerald-400"
                          : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700"
                      )}
                      title="Play Sound Preview"
                    >
                      <Play size={12} className={cn(isPlaying ? "fill-black" : "text-emerald-400 fill-emerald-400")} />
                      {isPlaying ? 'বাজছে...' : 'টেস্ট সাউন্ড'}
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      disabled={!soundSettings.masterEnabled}
                      onClick={() => setStatusSoundEnabled('COMPLETED', !cfg.enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40",
                        cfg.enabled && soundSettings.masterEnabled ? "bg-emerald-600" : "bg-neutral-700"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          cfg.enabled && soundSettings.masterEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Status 3: CANCELLED */}
            {(() => {
              const cfg = soundSettings.statuses.CANCELLED;
              const isPlaying = activeTestingSound === `CANCELLED_${cfg.soundType}`;
              return (
                <div className={cn(
                  "p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                  cfg.enabled && soundSettings.masterEnabled
                    ? "bg-red-950/20 border-red-500/40 ring-1 ring-red-500/20"
                    : "bg-neutral-900/40 border-neutral-800 opacity-80"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      cfg.enabled && soundSettings.masterEnabled
                        ? "bg-red-500/20 border-red-500/40 text-red-400"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500"
                    )}>
                      <AlertTriangle size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {cfg.bnTitle} ({cfg.title})
                        </span>
                        <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          CANCELLED
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {cfg.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                    <select
                      value={cfg.soundType}
                      onChange={(e) => setStatusSoundType('CANCELLED', e.target.value as SoundType)}
                      disabled={!cfg.enabled || !soundSettings.masterEnabled}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-red-500 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {SOUND_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          🎵 {opt.bnLabel} ({opt.label})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handlePlayStatusPreview('CANCELLED', cfg.soundType)}
                      disabled={!soundSettings.masterEnabled}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer shadow-sm",
                        isPlaying
                          ? "bg-red-500 text-white border-red-400"
                          : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700"
                      )}
                      title="Play Sound Preview"
                    >
                      <Play size={12} className={cn(isPlaying ? "fill-white" : "text-red-400 fill-red-400")} />
                      {isPlaying ? 'বাজছে...' : 'টেস্ট সাউন্ড'}
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      disabled={!soundSettings.masterEnabled}
                      onClick={() => setStatusSoundEnabled('CANCELLED', !cfg.enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40",
                        cfg.enabled && soundSettings.masterEnabled ? "bg-red-600" : "bg-neutral-700"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          cfg.enabled && soundSettings.masterEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Status 4: PARSER_REVIEW_REQUIRED */}
            {(() => {
              const cfg = soundSettings.statuses.PARSER_REVIEW_REQUIRED;
              const isPlaying = activeTestingSound === `PARSER_REVIEW_REQUIRED_${cfg.soundType}`;
              return (
                <div className={cn(
                  "p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                  cfg.enabled && soundSettings.masterEnabled
                    ? "bg-purple-950/20 border-purple-500/40 ring-1 ring-purple-500/20"
                    : "bg-neutral-900/40 border-neutral-800 opacity-80"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      cfg.enabled && soundSettings.masterEnabled
                        ? "bg-purple-500/20 border-purple-500/40 text-purple-400"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500"
                    )}>
                      <Sliders size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {cfg.bnTitle} ({cfg.title})
                        </span>
                        <span className="bg-purple-500/10 text-purple-400 border border-purple-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          REVIEW REQUIRED
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {cfg.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                    <select
                      value={cfg.soundType}
                      onChange={(e) => setStatusSoundType('PARSER_REVIEW_REQUIRED', e.target.value as SoundType)}
                      disabled={!cfg.enabled || !soundSettings.masterEnabled}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {SOUND_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          🎵 {opt.bnLabel} ({opt.label})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handlePlayStatusPreview('PARSER_REVIEW_REQUIRED', cfg.soundType)}
                      disabled={!soundSettings.masterEnabled}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer shadow-sm",
                        isPlaying
                          ? "bg-purple-500 text-white border-purple-400"
                          : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700"
                      )}
                      title="Play Sound Preview"
                    >
                      <Play size={12} className={cn(isPlaying ? "fill-white" : "text-purple-400 fill-purple-400")} />
                      {isPlaying ? 'বাজছে...' : 'টেস্ট সাউন্ড'}
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      disabled={!soundSettings.masterEnabled}
                      onClick={() => setStatusSoundEnabled('PARSER_REVIEW_REQUIRED', !cfg.enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40",
                        cfg.enabled && soundSettings.masterEnabled ? "bg-purple-600" : "bg-neutral-700"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          cfg.enabled && soundSettings.masterEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Status 5: LIMIT */}
            {(() => {
              const cfg = soundSettings.statuses.LIMIT;
              const isPlaying = activeTestingSound === `LIMIT_${cfg.soundType}`;
              return (
                <div className={cn(
                  "p-4 rounded-xl border transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4",
                  cfg.enabled && soundSettings.masterEnabled
                    ? "bg-orange-950/20 border-orange-500/40 ring-1 ring-orange-500/20"
                    : "bg-neutral-900/40 border-neutral-800 opacity-80"
                )}>
                  <div className="flex items-start sm:items-center gap-3.5 flex-1">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                      cfg.enabled && soundSettings.masterEnabled
                        ? "bg-orange-500/20 border-orange-500/40 text-orange-400"
                        : "bg-neutral-800 border-neutral-700 text-neutral-500"
                    )}>
                      <Radio size={20} />
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">
                          {cfg.bnTitle} ({cfg.title})
                        </span>
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/30 text-[10px] px-2 py-0.5 rounded font-mono font-bold">
                          LIMIT
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">
                        {cfg.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                    <select
                      value={cfg.soundType}
                      onChange={(e) => setStatusSoundType('LIMIT', e.target.value as SoundType)}
                      disabled={!cfg.enabled || !soundSettings.masterEnabled}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500 font-medium cursor-pointer disabled:opacity-50"
                    >
                      {SOUND_OPTIONS.map(opt => (
                        <option key={opt.id} value={opt.id}>
                          🎵 {opt.bnLabel} ({opt.label})
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handlePlayStatusPreview('LIMIT', cfg.soundType)}
                      disabled={!soundSettings.masterEnabled}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer shadow-sm",
                        isPlaying
                          ? "bg-orange-500 text-white border-orange-400"
                          : "bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-700"
                      )}
                      title="Play Sound Preview"
                    >
                      <Play size={12} className={cn(isPlaying ? "fill-white" : "text-orange-400 fill-orange-400")} />
                      {isPlaying ? 'বাজছে...' : 'টেস্ট সাউন্ড'}
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={cfg.enabled}
                      disabled={!soundSettings.masterEnabled}
                      onClick={() => setStatusSoundEnabled('LIMIT', !cfg.enabled)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40",
                        cfg.enabled && soundSettings.masterEnabled ? "bg-orange-600" : "bg-neutral-700"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                          cfg.enabled && soundSettings.masterEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Live Audio Test & Browser Push Notification Integration */}
        <div className="pt-4 border-t border-neutral-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Sparkles size={15} className="text-amber-400" />
                লাইভ পেন্ডিং অর্ডার টেস্ট অ্যালার্ট (Live Simulated Order Test)
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                বাস্তবে নতুন পেন্ডিং অর্ডার আসার পর সাউন্ড ও ব্যানার যেভাবে আসবে তা এখনই ব্রাউজারে টেস্ট করুন।
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                playSoundForStatus('PENDING');
                setSoundFeedback('🔔 টেস্ট পেন্ডিং অর্ডার সাউন্ড প্লে হয়েছে!');
                setTimeout(() => setSoundFeedback(null), 3000);
              }}
              className="mt-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Bell size={14} />
              টেস্ট পেন্ডিং সাউন্ড অ্যালার্ট বাজান
            </button>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Radio size={15} className="text-blue-400" />
                ব্রাউজার পুশ নোটিফিকেশন (Browser Native Push)
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                ট্যাব ব্যাকগ্রাউন্ডে থাকলেও অপারেটিং সিস্টেমের মাধ্যমে নতুন অর্ডারের পপআপ অ্যালার্ট পাবেন।
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const granted = await setBrowserNotifications(!soundSettings.browserNotifications);
                setSoundFeedback(granted ? '✅ ব্রাউজার নোটিফিকেশন পারমিশন অন করা হয়েছে!' : 'ℹ️ ব্রাউজার নোটিফিকেশন পারমিশন বন্ধ আছে।');
                setTimeout(() => setSoundFeedback(null), 3000);
              }}
              className={cn(
                "mt-2 text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition cursor-pointer border",
                soundSettings.browserNotifications
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                  : "bg-blue-600/10 text-blue-400 border-blue-500/30 hover:bg-blue-600/20"
              )}
            >
              {soundSettings.browserNotifications ? <CheckCircle size={14} /> : <ExternalLink size={14} />}
              {soundSettings.browserNotifications ? 'ব্রাউজার পুশ সক্রিয় (Enabled)' : 'ব্রাউজার পুশ পারমিশন দিন'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Settings Panel */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 shadow-sm space-y-8">
        
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Zap size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">অর্ডার পেন্ডিং মেনশন ও অ্যালার্ট রুলস</h2>
              <p className="text-xs text-neutral-400">Uncompleted Order Notification & Operator Mention Escalation</p>
            </div>
          </div>
          <button
            onClick={fetchSettings}
            disabled={loading || saving}
            className="text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
            title="Refresh Settings"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin text-blue-400")} />
            রিফ্রেশ
          </button>
        </div>

        {/* Feature 1: Master Enable / Disable Toggle */}
        <div className={cn(
          "p-5 rounded-xl border transition-all duration-200",
          autoReminderEnabled
            ? "bg-blue-950/20 border-blue-500/30"
            : "bg-neutral-900/50 border-neutral-800"
        )}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                autoReminderEnabled 
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-400" 
                  : "bg-neutral-800 border-neutral-700 text-neutral-500"
              )}>
                {autoReminderEnabled ? <Bell size={24} /> : <BellOff size={24} />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-white">
                    পেন্ডিং অর্ডার অটো-মেনশন (Automatic Mention on Uncompleted Orders)
                  </h3>
                  <span className={cn(
                    "px-2.5 py-0.5 text-xs font-medium rounded-full border",
                    autoReminderEnabled
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-neutral-800 text-neutral-400 border-neutral-700"
                  )}>
                    {autoReminderEnabled ? 'সক্রিয় (Active)' : 'বন্ধ (Disabled)'}
                  </span>
                </div>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  কোনো অর্ডার আসার পর নির্দিষ্ট সময়সীমার (বর্তমানে <strong>{activeHuman.bn}</strong>) মধ্যে সম্পন্ন না হলে, Telegram গ্রুপে আগের অর্ডারটি যিনি কমপ্লিট করেছিলেন তাকে স্বয়ংক্রিয়ভাবে মেনশন (@username) করে সতর্কবার্তা পাঠানো হবে।
                </p>
              </div>
            </div>

            {/* Toggle Switch */}
            <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
              <button
                type="button"
                role="switch"
                aria-checked={autoReminderEnabled}
                disabled={saving || loading}
                onClick={() => handleToggleAutoReminder(!autoReminderEnabled)}
                className={cn(
                  "relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed",
                  autoReminderEnabled ? "bg-blue-600" : "bg-neutral-700"
                )}
              >
                <span className="sr-only">Toggle Automatic Mentions</span>
                <span
                  className={cn(
                    "pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    autoReminderEnabled ? "translate-x-7" : "translate-x-0"
                  )}
                />
              </button>
              <span className="text-[11px] font-medium text-neutral-400">
                {saving ? 'Saving...' : (autoReminderEnabled ? 'ON' : 'OFF')}
              </span>
            </div>
          </div>
        </div>

        {/* Feature 2: Configurable Time Threshold */}
        <div className="space-y-4 border-t border-neutral-800/80 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Timer size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  মেনশন ট্রিগার সময়সীমা (Mention Time Threshold)
                </h3>
                <p className="text-xs text-neutral-400">
                  অর্ডার কত সময় আনকমপ্লিট / পেন্ডিং থাকলে অপারেটরকে টেলিগ্রামে ট্যাগ করা হবে।
                </p>
              </div>
            </div>

            {/* Currently Active Badge */}
            <div className="bg-neutral-900 border border-neutral-700/80 px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="text-xs text-neutral-400">বর্তমান সীমা:</span>
              <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                {activeHuman.bn} ({timeoutSeconds}s)
              </span>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-neutral-300">
              কুইক সিলেক্ট (Quick Presets):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {PRESET_OPTIONS.map((preset) => {
                const isSelected = timeoutSeconds === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    disabled={saving || loading}
                    onClick={() => handleSelectPreset(preset.seconds)}
                    className={cn(
                      "py-2.5 px-3 rounded-xl text-center border transition-all flex flex-col items-center justify-center gap-1",
                      isSelected
                        ? "bg-blue-600/20 border-blue-500 text-white font-semibold shadow-sm ring-1 ring-blue-500/50"
                        : "bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-700"
                    )}
                  >
                    <span className="text-sm font-semibold">{preset.label}</span>
                    <span className={cn(
                      "text-[10px]",
                      isSelected ? "text-blue-300" : "text-neutral-500"
                    )}>
                      {preset.bnLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Time Form */}
          <form onSubmit={handleSaveCustomThreshold} className="bg-neutral-900/40 border border-neutral-800 p-4 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
              <Sliders size={14} className="text-blue-400" />
              কাস্টম সময়সীমা সেট করুন (Custom Duration):
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="60"
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  placeholder="e.g. 2, 5, 10"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                />
              </div>

              <div className="flex rounded-lg bg-neutral-900 border border-neutral-700 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setCustomUnit('minutes')}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition",
                    customUnit === 'minutes'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  মিনিট (Minutes)
                </button>
                <button
                  type="button"
                  onClick={() => setCustomUnit('seconds')}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-md transition",
                    customUnit === 'seconds'
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  সেকেন্ড (Seconds)
                </button>
              </div>

              <button
                type="submit"
                disabled={saving || loading}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shrink-0 shadow-sm"
              >
                <Save size={14} />
                {saving ? 'সেভ হচ্ছে...' : 'কাস্টম সময় সেভ করুন'}
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              💡 উদাহরণ: ২ মিনিট, ৫ মিনিট বা ৯০ সেকেন্ড যে কোনো মান কনফিগার করতে পারেন (১৫ সেকেন্ড থেকে ৬০ মিনিট পর্যন্ত)।
            </p>
          </form>

          {/* Interactive Telegram Alert Live Preview */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span className="font-medium flex items-center gap-1.5 text-neutral-300">
                <MessageSquare size={14} className="text-blue-400" />
                Telegram Alert Preview (টেলিগ্রাম গ্রুপে মেসেজ যেভাবে দেখা যাবে):
              </span>
              <span className="text-[11px] text-neutral-500">Variables: {"{requestId}"}, {"{amount}"}, {"{paymentMethod}"}, {"{wallet}"}, {"{time}"}, {"{mention}"}</span>
            </div>

            
            <textarea
              value={reminderMessageTemplate}
              onChange={(e) => setReminderMessageTemplate(e.target.value)}
              placeholder="Enter your custom alert template here..."
              className="w-full h-32 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-xs text-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono mb-2"
            />
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <button
                type="button"
                onClick={() => setReminderMessageTemplate('⚠️ <b>{time} পেন্ডিং অ্যালার্ট (Pending Order Alert)!</b>\n\n📌 রিকোয়েস্ট আইডি: <code>{requestId}</code>\n💰 অ্যামাউন্ট: <b>৳{amount}</b> ({paymentMethod})\n📱 ওয়ালেট: <code>{wallet}</code>\n⏱️ অবস্থা: <b>{time} ধরে পেন্ডিং রয়েছে!</b>\n\n🔔 {mention} — আগের অর্ডারটি আপনি কমপ্লিট করেছিলেন। অনুগ্রহ করে এই নতুন অর্ডারটি দ্রুত চেক ও কমপ্লিট করুন!')}
                className="w-full sm:w-auto bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition shadow-sm"
              >
                <RefreshCw size={14} />
                ডিফল্ট টেমপ্লেট লোড করুন
              </button>
              <button
                onClick={() => saveSettingsPayload({ reminderMessageTemplate })}
                disabled={saving}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
              >
                <Save size={14} />
                {saving ? 'সেভ হচ্ছে...' : 'টেমপ্লেট সেভ করুন'}
              </button>
            </div>
            <div className="bg-neutral-950 border border-neutral-800/90 rounded-lg p-3.5 font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap selection:bg-blue-500/30">
              {reminderMessageTemplate
                ? reminderMessageTemplate
                    .replace(/\{time\}/g, activeHuman.bn)
                    .replace(/\{requestId\}/g, 'REQ-84920')
                    .replace(/\{amount\}/g, '1,500.00')
                    .replace(/\{paymentMethod\}/g, 'Bkash')
                    .replace(/\{wallet\}/g, '017XXXXXXXX')
                    .replace(/\{mention\}/g, '@last_completed_user')
                : 'Loading template...'}
            </div>
          </div>
        </div>

        {/* Automation Status Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-neutral-800/80">
          <div className="bg-neutral-900/60 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <Clock size={14} className="text-blue-400" />
              সক্রিয় ট্রিগার সময়সীমা
            </div>
            <p className="text-base font-bold text-white">{activeHuman.bn} ({timeoutSeconds}s)</p>
            <p className="text-xs text-neutral-500">Pending wait time before mentioning</p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <Send size={14} className="text-emerald-400" />
              টার্গেট ইউজার
            </div>
            <p className="text-base font-bold text-white">আগের অর্ডার কমপ্লিটকারী</p>
            <p className="text-xs text-neutral-500">Last active operator in group</p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 p-4 rounded-xl space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              <Shield size={14} className="text-purple-400" />
              Telegram Bot স্ট্যাটাস
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                botRunning ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              )} />
              <p className="text-base font-bold text-white">
                {botRunning ? 'Connected' : 'Offline'}
              </p>
            </div>
            <p className="text-xs text-neutral-500">Asia/Dhaka (BST) timezone enabled</p>
          </div>
        </div>

        {/* User & Admin Management Quick Card */}
        <div className="bg-gradient-to-r from-blue-950/40 via-neutral-900/50 to-neutral-950 border border-blue-500/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <UsersIcon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Admin & User Management (ইউজার ও অ্যাডমিন তৈরি)
                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                  New Feature
                </span>
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                সিস্টেমে নতুন অ্যাডমিন, অপারেটর ও ইউজার যোগ করুন, রোল এবং পাসওয়ার্ড ম্যানেজ করুন।
              </p>
            </div>
          </div>

          <Link
            to="/users"
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 transition shadow-sm shrink-0"
          >
            <UserPlus size={15} />
            ইউজার পরিচালনা করুন
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
