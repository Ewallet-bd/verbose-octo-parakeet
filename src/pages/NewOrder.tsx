import { apiFetch } from "../lib/api";
import React, { useState, useEffect } from 'react';
import { useAuth } from '../store/auth';
import { useSound } from '../store/sound';
import { Send, AlertCircle, CheckCircle2, Download, Zap, MessageSquare, RefreshCw } from 'lucide-react';

export default function NewOrder() {
  const { token } = useAuth();
  const { playSoundForStatus } = useSound();
  const [rawText, setRawText] = useState('');
  const [selectedChat, setSelectedChat] = useState('');
  const [availableChats, setAvailableChats] = useState<{ chatId: string, chatTitle: string }[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'warning' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await apiFetch('/api/order', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          rawText
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        playSoundForStatus('PENDING');
        if (data.telegramSent) {
          setMessage({ 
            type: 'success', 
            text: `Order ${data.data.requestId} successfully created and sent to Telegram!` 
          });
        } else {
          setMessage({ 
            type: 'warning', 
            text: `Order ${data.data.requestId} saved to Database, but Telegram delivery failed: "${data.telegramError}".` 
          });
        }
        setRawText('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit order.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected network error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Manual Order Upload</h1>
        <p className="text-neutral-400">Paste raw transaction details below. The system will parse it and forward it to Telegram.</p>
      </div>

      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Automate with Chrome Extension!</h3>
            <p className="text-sm text-neutral-300">
              Stop copying and pasting! Install our Smart Order Forwarder. Just highlight any order text on WhatsApp, Telegram Web or any Panel, right-click, and send it directly in 1-click.
            </p>
          </div>
        </div>
        <a 
          href="/api/extension/download" 
          download
          className="flex-shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-md hover:shadow-blue-500/20"
        >
          <Download size={18} />
          Download Extension
        </a>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h3 className="text-sm font-bold text-white mb-3">Extension Setup Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">API URL</label>
            <input 
              readOnly 
              value={`${window.location.origin}/api/order`} 
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-300 text-xs font-mono focus:outline-none" 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">API Token (JWT)</label>
            <input 
              readOnly 
              value={token || ''} 
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-neutral-300 text-xs font-mono focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6">
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-start ${
            message.type === 'success' 
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
              : message.type === 'warning'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle2 className="mr-3 h-5 w-5 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="mr-3 h-5 w-5 mt-0.5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium leading-relaxed">{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Raw Request Text</label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full h-48 p-4 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none font-mono text-sm"
              placeholder="🔔🔔🔔 NEW REQUEST 🔔🔔🔔&#10;&#10;🆔 ID: 5206290885&#10;📱 Nagad Number: 01924347827&#10;💰 Amount: 7000&#10;👤 Assigned: KHAN"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !rawText.trim()}
              className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition shadow-md hover:shadow-blue-500/20"
            >
              {loading ? (
                <>
                  <RefreshCw size={18} className="mr-2 animate-spin" />
                  Processing & Forwarding...
                </>
              ) : (
                <>
                  <Send size={18} className="mr-2" />
                  Analyze & Upload to Telegram
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
