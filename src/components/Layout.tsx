import React from 'react';
import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { useTheme } from '../store/theme';
import { useSound } from '../store/sound';
import { 
  LayoutDashboard, 
  ListOrdered, 
  LogOut, 
  Shield, 
  FilePlus, 
  Network, 
  BarChart2, 
  Users as UsersIcon, 
  Settings as SettingsIcon,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Bell,
  Menu,
  X,
  Bot
} from 'lucide-react';
import { cn } from '../lib/utils';
import { apiFetch } from '../lib/api';

export default function Layout() {
  const { isAuthenticated, logout, user } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { settings, setMasterEnabled, playTestSound, audioUnlocked, unlockAudio } = useSound();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [hasAwaitingOtp, setHasAwaitingOtp] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    const checkOtp = async () => {
      try {
        const res = await apiFetch('/api/automation/status');
        const data = await res.json();
        if (data.success && data.data?.awaitingOtp) {
          setHasAwaitingOtp(true);
        } else {
          setHasAwaitingOtp(false);
        }
      } catch {}
    };
    checkOtp();
    const timer = setInterval(checkOtp, 5000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  React.useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Transactions', href: '/transactions', icon: ListOrdered },
    { name: 'Manual Order', href: '/new-order', icon: FilePlus },
    { name: 'Group Routing', href: '/routing', icon: Network },
    { name: 'Reports & Balances', href: '/reports', icon: BarChart2 },
    { name: 'Automation', href: '/automation', icon: Bot, badge: hasAwaitingOtp ? 'OTP!' : undefined },
    { name: 'Users & Admins', href: '/users', icon: UsersIcon },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-neutral-900 flex overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-neutral-950 border-r border-neutral-800 flex flex-col transition-transform duration-300 ease-in-out lg:hidden",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-neutral-800">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center mr-3 shrink-0">
              <Shield className="text-white" size={16} />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">PayAdmin</span>
          </div>
          <button 
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent"
                )}
              >
                <item.icon className={cn("mr-3 h-5 w-5", isActive ? "text-indigo-400" : "text-neutral-500")} />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500 text-neutral-950 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-950">
          <div className="flex items-center px-4 mb-4">
            <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-white font-bold text-xs uppercase mr-3 shrink-0">
              {user?.username?.[0] || 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-neutral-500 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsSidebarOpen(false);
              logout();
            }}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-neutral-400 rounded-lg hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-neutral-500" />
            Sign out
          </button>
        </div>
      </div>

      {/* Desktop Persistent Sidebar */}
      <div className="hidden lg:flex w-64 bg-neutral-950 border-r border-neutral-800 flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-neutral-800">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center mr-3 shrink-0">
              <Shield className="text-white" size={16} />
            </div>
            <h1 className="text-white font-bold text-lg tracking-tight">PayAdmin</h1>
          </div>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "bg-indigo-600/10 text-indigo-400 border border-indigo-500/20" 
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800 border border-transparent"
                )}
              >
                <item.icon className={cn("mr-3 h-5 w-5", isActive ? "text-indigo-400" : "text-neutral-500")} />
                <span className="flex-1">{item.name}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500 text-neutral-950 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="p-4 border-t border-neutral-800">
          <div className="flex items-center px-4 mb-4">
            <div className="w-8 h-8 rounded-full brand-gradient flex items-center justify-center text-white font-bold text-xs uppercase mr-3">
              {user?.username?.[0] || 'A'}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.username}</p>
              <p className="text-xs text-neutral-500">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-neutral-400 rounded-lg hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 text-neutral-500" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        <header className="h-16 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0">
          <div className="flex items-center">
            {/* Hamburger Button for mobile */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 mr-3 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white lg:hidden transition cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <h2 className="text-white font-medium text-base sm:text-lg truncate">
              {navigation.find(n => n.href === location.pathname)?.name || 'Admin Panel'}
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Quick Audio Notifications Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !settings.masterEnabled;
                setMasterEnabled(next);
                if (next) {
                  playTestSound('chime');
                }
              }}
              className={cn(
                "p-2 rounded-lg border transition flex items-center gap-2 text-xs font-medium cursor-pointer",
                settings.masterEnabled
                  ? "bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20"
                  : "bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300"
              )}
              title={settings.masterEnabled ? `Sound Alerts ON (${Math.round(settings.volume * 100)}%) - Click to Mute` : 'Sound Alerts Muted - Click to Unmute'}
            >
              {settings.masterEnabled ? (
                <>
                  <Volume2 size={16} className="text-indigo-400" />
                  <span className="hidden md:inline">Sound ON</span>
                </>
              ) : (
                <>
                  <VolumeX size={16} className="text-neutral-500" />
                  <span className="hidden md:inline">Sound OFF</span>
                </>
              )}
            </button>

            {/* Theme Mode Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700 transition flex items-center gap-2 text-xs font-medium cursor-pointer"
              title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode`}
            >
              {resolvedTheme === 'dark' ? (
                <>
                  <Sun size={16} className="text-amber-400" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon size={16} className="text-indigo-400" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-neutral-900 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
