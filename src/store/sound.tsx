import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './auth';
import { apiFetch } from '../lib/api';

export type SoundType = 'chime' | 'bell' | 'melody' | 'beep' | 'pulse' | 'marimba';

export type TransactionStatusKey = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'PARSER_REVIEW_REQUIRED' | 'LIMIT';

export interface StatusSoundConfig {
  enabled: boolean;
  soundType: SoundType;
  title: string;
  bnTitle: string;
  description: string;
  defaultType: SoundType;
}

export interface SoundSettings {
  masterEnabled: boolean;
  volume: number; // 0.0 to 1.0
  browserNotifications: boolean;
  statuses: Record<TransactionStatusKey, StatusSoundConfig>;
}

export interface OrderAlert {
  id: string;
  requestId: string;
  amount: number;
  paymentMethod: string;
  status: string;
  timestamp: number;
  walletNumber?: string;
}

export const SOUND_OPTIONS: { id: SoundType; label: string; bnLabel: string; description: string }[] = [
  { id: 'chime', label: 'Crystal Chime', bnLabel: 'ক্রিস্টাল চাইম (ডিফল্ট)', description: 'উজ্জ্বল ও আকর্ষণীয় জোড়া চাইম টিউন' },
  { id: 'bell', label: 'Desk Bell', bnLabel: 'সার্ভিস বেল', description: 'রেজোনেন্ট মেটালিক বেল সাউন্ড' },
  { id: 'melody', label: 'Success Harmony', bnLabel: 'হারমোনি মেলোডি', description: '৪-নোটের আনন্দদায়ক আরোহী সুর' },
  { id: 'beep', label: 'Digital Beep', bnLabel: 'ডিজিটাল বিপ', description: 'ক্লিন টেক ডাবল বিপ সিগন্যাল' },
  { id: 'pulse', label: 'Warning Pulse', bnLabel: 'সতর্কতা পালস', description: 'দ্বৈত ওয়ার্নিং পালস অ্যালার্ট' },
  { id: 'marimba', label: 'Warm Marimba', bnLabel: 'মারিম্বা টোন', description: 'নরম পারকাসিভ উডেন টোন' },
];

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  masterEnabled: true,
  volume: 0.8,
  browserNotifications: false,
  statuses: {
    PENDING: {
      enabled: true,
      soundType: 'chime',
      defaultType: 'chime',
      title: 'New Pending Orders',
      bnTitle: 'নতুন পেন্ডিং অর্ডার',
      description: 'নতুন কোনো পেন্ডিং অর্ডার সিস্টেমে আসলে তাৎক্ষণিক অডিও অ্যালার্ট'
    },
    COMPLETED: {
      enabled: true,
      soundType: 'melody',
      defaultType: 'melody',
      title: 'Completed Orders',
      bnTitle: 'অর্ডার সম্পন্ন (Completed)',
      description: 'অর্ডার সফলভাবে কমপ্লিট হলে কনফার্মেশন সাউন্ড বাজবে'
    },
    CANCELLED: {
      enabled: false,
      soundType: 'pulse',
      defaultType: 'pulse',
      title: 'Cancelled / Rejected',
      bnTitle: 'বাতিল বা রিজেক্টেড অর্ডার',
      description: 'অর্ডার ক্যান্সেল বা রিজেক্ট করা হলে সতর্কবার্তা সাউন্ড'
    },
    PARSER_REVIEW_REQUIRED: {
      enabled: true,
      soundType: 'beep',
      defaultType: 'beep',
      title: 'Parser Review Required',
      bnTitle: 'ম্যানুয়াল রিভিউ প্রয়োজন',
      description: 'টেলিগ্রাম মেসেজ থেকে স্বয়ংক্রিয়ভাবে তথ্য উদ্ধার না হলে'
    },
    LIMIT: {
      enabled: false,
      soundType: 'pulse',
      defaultType: 'pulse',
      title: 'Limit Reached',
      bnTitle: 'লিমিট অতিক্রম (Limit)',
      description: 'এজেন্ট বা ওয়ালেটের লিমিট শেষ হলে নোটিফিকেশন'
    }
  }
};

const STORAGE_KEY = 'payadmin_sound_settings_v1';

interface SoundContextType {
  settings: SoundSettings;
  audioUnlocked: boolean;
  activeAlerts: OrderAlert[];
  unlockAudio: () => Promise<boolean>;
  playTestSound: (soundType: SoundType) => void;
  playSoundForStatus: (status: string, overrideType?: SoundType) => void;
  setMasterEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setStatusSoundEnabled: (status: TransactionStatusKey, enabled: boolean) => void;
  setStatusSoundType: (status: TransactionStatusKey, soundType: SoundType) => void;
  setBrowserNotifications: (enabled: boolean) => Promise<boolean>;
  resetToDefaults: () => void;
  dismissAlert: (id: string) => void;
  clearAllAlerts: () => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

// Web Audio API Synthesizer
class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public async unlock(): Promise<boolean> {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Play a silent 1ms buffer to prime iOS/Chrome autoplay policy
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  public isUnlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  public play(type: SoundType, masterVolume: number) {
    try {
      const ctx = this.getContext();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const vol = Math.max(0.01, Math.min(1.0, masterVolume));

      switch (type) {
        case 'chime':
          this.playCrystalChime(ctx, now, vol);
          break;
        case 'bell':
          this.playDeskBell(ctx, now, vol);
          break;
        case 'melody':
          this.playSuccessMelody(ctx, now, vol);
          break;
        case 'beep':
          this.playDigitalBeep(ctx, now, vol);
          break;
        case 'pulse':
          this.playWarningPulse(ctx, now, vol);
          break;
        case 'marimba':
          this.playWarmMarimba(ctx, now, vol);
          break;
        default:
          this.playCrystalChime(ctx, now, vol);
          break;
      }
    } catch (e) {
      console.warn('Audio playback not permitted yet or failed:', e);
    }
  }

  // 1. Crystal Chime: High-priority, bright attention-grabber (E5 -> A5 -> E6)
  private playCrystalChime(ctx: AudioContext, now: number, vol: number) {
    const notes = [
      { freq: 659.25, time: 0.00, dur: 0.45 },
      { freq: 880.00, time: 0.12, dur: 0.65 },
      { freq: 1318.51, time: 0.24, dur: 0.85 }
    ];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.time);

      gain.gain.setValueAtTime(0, now + note.time);
      gain.gain.linearRampToValueAtTime(0.35 * vol, now + note.time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.time + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + note.time);
      osc.stop(now + note.time + note.dur);
    });
  }

  // 2. Desk Bell: Resonant metallic Ding
  private playDeskBell(ctx: AudioContext, now: number, vol: number) {
    const fundamental = 587.33; // D5
    const partials = [
      { f: fundamental, gainRatio: 0.4, dur: 0.8 },
      { f: fundamental * 2.76, gainRatio: 0.2, dur: 0.5 },
      { f: fundamental * 4.07, gainRatio: 0.1, dur: 0.3 }
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.f, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(p.gainRatio * vol, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + p.dur);
    });
  }

  // 3. Success Melody: Ascending 4-note chord (C5, E5, G5, C6)
  private playSuccessMelody(ctx: AudioContext, now: number, vol: number) {
    const chord = [
      { freq: 523.25, time: 0.00, dur: 0.35 },
      { freq: 659.25, time: 0.08, dur: 0.35 },
      { freq: 783.99, time: 0.16, dur: 0.45 },
      { freq: 1046.50, time: 0.24, dur: 0.75 }
    ];

    chord.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.time);

      gain.gain.setValueAtTime(0, now + n.time);
      gain.gain.linearRampToValueAtTime(0.3 * vol, now + n.time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  }

  // 4. Digital Beep: Snappy tech double-ping
  private playDigitalBeep(ctx: AudioContext, now: number, vol: number) {
    const beeps = [
      { freq: 880, start: 0.00, dur: 0.08 },
      { freq: 1174.66, start: 0.12, dur: 0.12 }
    ];

    beeps.forEach(b => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(b.freq, now + b.start);

      gain.gain.setValueAtTime(0, now + b.start);
      gain.gain.linearRampToValueAtTime(0.35 * vol, now + b.start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + b.start + b.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + b.start);
      osc.stop(now + b.start + b.dur);
    });
  }

  // 5. Warning Pulse: 2 downward alert pulses
  private playWarningPulse(ctx: AudioContext, now: number, vol: number) {
    const pulses = [0.00, 0.18];

    pulses.forEach(start => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, now + start);
      osc.frequency.exponentialRampToValueAtTime(360, now + start + 0.14);

      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.35 * vol, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + 0.16);
    });
  }

  // 6. Warm Marimba
  private playWarmMarimba(ctx: AudioContext, now: number, vol: number) {
    const notes = [
      { freq: 440.00, time: 0.00, dur: 0.35 },
      { freq: 554.37, time: 0.10, dur: 0.40 }
    ];

    notes.forEach(n => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.time);

      gain.gain.setValueAtTime(0, now + n.time);
      gain.gain.linearRampToValueAtTime(0.4 * vol, now + n.time + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.time + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.time);
      osc.stop(now + n.time + n.dur);
    });
  }
}

const synth = new SoundSynthesizer();

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<SoundSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && saved !== 'undefined') {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SOUND_SETTINGS,
          ...parsed,
          statuses: {
            ...DEFAULT_SOUND_SETTINGS.statuses,
            ...(parsed.statuses || {})
          }
        };
      }
    } catch (e) {
      console.error("Failed to load sound settings from localStorage", e);
    }
    return DEFAULT_SOUND_SETTINGS;
  });

  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const [activeAlerts, setActiveAlerts] = useState<OrderAlert[]>([]);
  const knownTransactionIdsRef = useRef<Set<string | number>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  // Save settings changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error("Failed to save sound settings", e);
    }
  }, [settings]);

  // Handle unlocking Web Audio on any initial document click/touch
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    const success = await synth.unlock();
    setAudioUnlocked(success);
    return success;
  }, []);

  useEffect(() => {
    const handleFirstGesture = () => {
      unlockAudio();
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };

    window.addEventListener('click', handleFirstGesture, { once: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true });

    return () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
  }, [unlockAudio]);

  const playTestSound = useCallback((soundType: SoundType) => {
    synth.unlock().then(() => {
      synth.play(soundType, settings.volume);
    });
  }, [settings.volume]);

  const playSoundForStatus = useCallback((status: string, overrideType?: SoundType) => {
    if (!settings.masterEnabled) return;

    const normalizedStatus = (status || '').toUpperCase() as TransactionStatusKey;
    const config = settings.statuses[normalizedStatus];

    if (config && (config.enabled || overrideType)) {
      const typeToPlay = overrideType || config.soundType;
      synth.unlock().then(() => {
        synth.play(typeToPlay, settings.volume);
      });
    }
  }, [settings]);

  const setMasterEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, masterEnabled: enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    const safeVol = Math.max(0, Math.min(1, volume));
    setSettings(prev => ({ ...prev, volume: safeVol }));
  }, []);

  const setStatusSoundEnabled = useCallback((status: TransactionStatusKey, enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [status]: {
          ...prev.statuses[status],
          enabled
        }
      }
    }));
  }, []);

  const setStatusSoundType = useCallback((status: TransactionStatusKey, soundType: SoundType) => {
    setSettings(prev => ({
      ...prev,
      statuses: {
        ...prev.statuses,
        [status]: {
          ...prev.statuses[status],
          soundType
        }
      }
    }));
  }, []);

  const setBrowserNotifications = useCallback(async (enabled: boolean): Promise<boolean> => {
    if (enabled && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      const granted = perm === 'granted';
      setSettings(prev => ({ ...prev, browserNotifications: granted }));
      return granted;
    } else {
      setSettings(prev => ({ ...prev, browserNotifications: false }));
      return false;
    }
  }, []);

  const resetToDefaults = useCallback(() => {
    setSettings(DEFAULT_SOUND_SETTINGS);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setActiveAlerts([]);
  }, []);

  // Background Poller: Checks for newly arriving Pending & other transactions across the app
  useEffect(() => {
    if (!isAuthenticated || !token) {
      initialLoadDoneRef.current = false;
      knownTransactionIdsRef.current.clear();
      return;
    }

    let isMounted = true;

    const checkLatestTransactions = async () => {
      try {
        const res = await apiFetch('/api/transactions?page=1&limit=25', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const txList: any[] = data.data || [];

        if (!isMounted) return;

        if (!initialLoadDoneRef.current) {
          // Prime known set on first load without triggering alerts for historic data
          txList.forEach(tx => {
            if (tx.id) knownTransactionIdsRef.current.add(tx.id);
            if (tx.requestId) knownTransactionIdsRef.current.add(tx.requestId);
          });
          initialLoadDoneRef.current = true;
          return;
        }

        // Identify new transactions
        const newOrders: any[] = [];
        txList.forEach(tx => {
          const key = tx.id || tx.requestId;
          if (key && !knownTransactionIdsRef.current.has(key)) {
            knownTransactionIdsRef.current.add(key);
            newOrders.push(tx);
          }
        });

        if (newOrders.length > 0) {
          // Play sound for the most critical status (PENDING prioritized)
          const hasPending = newOrders.some(o => o.status === 'PENDING');
          const hasParserReview = newOrders.some(o => o.status === 'PARSER_REVIEW_REQUIRED');
          const hasCompleted = newOrders.some(o => o.status === 'COMPLETED');
          const hasCancelled = newOrders.some(o => o.status === 'CANCELLED');
          const hasLimit = newOrders.some(o => o.status === 'LIMIT');

          if (hasPending) {
            playSoundForStatus('PENDING');
          } else if (hasParserReview) {
            playSoundForStatus('PARSER_REVIEW_REQUIRED');
          } else if (hasCompleted) {
            playSoundForStatus('COMPLETED');
          } else if (hasLimit) {
            playSoundForStatus('LIMIT');
          } else if (hasCancelled) {
            playSoundForStatus('CANCELLED');
          }

          // Add to floating alerts
          const alertsToAdd: OrderAlert[] = newOrders.map(o => ({
            id: `${o.id || o.requestId}_${Date.now()}`,
            requestId: o.requestId || `REQ-${o.id}`,
            amount: Number(o.amount) || 0,
            paymentMethod: o.paymentMethod || 'Manual',
            status: o.status || 'PENDING',
            timestamp: o.createdAt || Date.now(),
            walletNumber: o.walletNumber || o.rawWalletNumber
          }));

          setActiveAlerts(prev => [...alertsToAdd, ...prev].slice(0, 5));

          // Native Browser Notification (if enabled)
          if (settings.browserNotifications && 'Notification' in window && Notification.permission === 'granted') {
            const first = newOrders[0];
            new Notification(`নতুন অর্ডার: #${first.requestId}`, {
              body: `অ্যামাউন্ট: ৳${Number(first.amount).toLocaleString()} (${first.paymentMethod || 'Pay'}) - স্ট্যাটাস: ${first.status}`,
              icon: '/favicon.ico'
            });
          }
        }
      } catch (err) {
        // Silent failure for polling
      }
    };

    // Run initial check
    checkLatestTransactions();

    // Poll every 6 seconds
    const interval = setInterval(checkLatestTransactions, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAuthenticated, token, playSoundForStatus, settings.browserNotifications]);

  return (
    <SoundContext.Provider
      value={{
        settings,
        audioUnlocked,
        activeAlerts,
        unlockAudio,
        playTestSound,
        playSoundForStatus,
        setMasterEnabled,
        setVolume,
        setStatusSoundEnabled,
        setStatusSoundType,
        setBrowserNotifications,
        resetToDefaults,
        dismissAlert,
        clearAllAlerts
      }}
    >
      {children}
    </SoundContext.Provider>
  );
};

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
}
