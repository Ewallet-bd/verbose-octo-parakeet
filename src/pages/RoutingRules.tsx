import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../store/auth';
import { Plus, Trash2, Network, Check, Edit3, X, AlertTriangle, Loader2, Bot, Users, RefreshCw } from 'lucide-react';

interface RoutingRule {
  id: number;
  chatId: string;
  chatName: string;
  minAmount: number;
  maxAmount: number;
  paymentMethods?: string;
  isActive?: number;
  dailyLimit?: number;
}

interface ConnectedGroup {
  chatId: string;
  chatName: string;
  balance?: number;
  hasRule?: boolean;
  isActive?: boolean;
}

const AVAILABLE_METHODS = ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'];

export default function RoutingRules() {
  const { token } = useAuth();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [connectedGroups, setConnectedGroups] = useState<ConnectedGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [newRule, setNewRule] = useState({ 
    chatId: '', 
    chatName: '', 
    minAmount: '', 
    maxAmount: '',
    paymentMethods: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'] as string[],
    dailyLimit: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<RoutingRule | null>(null);

  const fetchRules = () => {
    setLoading(true);
    apiFetch('/api/routing-rules', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setRules(data.data);
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to fetch routing rules');
      })
      .finally(() => setLoading(false));
  };

  const fetchConnectedGroups = () => {
    setFetchingGroups(true);
    apiFetch('/api/connected-groups', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.data)) {
          setConnectedGroups(data.data);
        }
      })
      .catch(err => console.error('Failed to fetch connected groups', err))
      .finally(() => setFetchingGroups(false));
  };

  useEffect(() => {
    if (token) {
      fetchRules();
      fetchConnectedGroups();
    }
  }, [token]);

  const handleGroupDropdownChange = (chatId: string) => {
    setSelectedGroupId(chatId);
    if (!chatId || chatId === 'CUSTOM') {
      return;
    }
    const found = connectedGroups.find(g => g.chatId === chatId);
    if (found) {
      setNewRule(prev => ({
        ...prev,
        chatId: found.chatId,
        chatName: found.chatName && found.chatName !== 'Telegram Group' ? found.chatName : (prev.chatName || '')
      }));
    }
  };

  const handleEditRule = (rule: RoutingRule) => {
    setEditingRuleId(rule.id);
    setSelectedGroupId(rule.chatId);
    setError(null);
    setSuccessMsg(null);
    setNewRule({
      chatId: rule.chatId,
      chatName: rule.chatName || '',
      minAmount: rule.minAmount.toString(),
      maxAmount: rule.maxAmount.toString(),
      paymentMethods: (rule.paymentMethods || 'BKASH,NAGAD,ROCKET,UPAY').split(','),
      dailyLimit: rule.dailyLimit ? rule.dailyLimit.toString() : ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setSelectedGroupId('');
    setNewRule({
      chatId: '',
      chatName: '',
      minAmount: '',
      maxAmount: '',
      paymentMethods: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'],
      dailyLimit: ''
    });
    setError(null);
  };

  const toggleMethodSelection = (method: string) => {
    setNewRule(prev => {
      const isSelected = prev.paymentMethods.includes(method);
      const newMethods = isSelected
        ? prev.paymentMethods.filter(m => m !== method)
        : [...prev.paymentMethods, method];
      return { ...prev, paymentMethods: newMethods };
    });
  };

  const handleToggleActive = async (id: number, currentStatus: boolean) => {
    try {
      const nextStatus = !currentStatus;
      const res = await apiFetch(`/api/routing-rules/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: nextStatus })
      });
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === id ? { ...r, isActive: nextStatus ? 1 : 0 } : r));
      }
    } catch (err) {
      console.error("Failed to toggle rule active state:", err);
    }
  };

  const handleAddOrUpdateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.chatId || !newRule.minAmount || !newRule.maxAmount) return;
    if (newRule.paymentMethods.length === 0) {
      setError('Please select at least one payment method.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const url = editingRuleId ? `/api/routing-rules/${editingRuleId}` : '/api/routing-rules';
      const method = editingRuleId ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId: newRule.chatId,
          chatName: newRule.chatName,
          minAmount: newRule.minAmount,
          maxAmount: newRule.maxAmount,
          paymentMethods: newRule.paymentMethods.join(','),
          dailyLimit: newRule.dailyLimit
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(editingRuleId ? 'Rule updated successfully!' : 'Rule created successfully!');
        setNewRule({ 
          chatId: '', 
          chatName: '', 
          minAmount: '', 
          maxAmount: '', 
          paymentMethods: ['BKASH', 'NAGAD', 'ROCKET', 'UPAY'],
          dailyLimit: ''
        });
        setEditingRuleId(null);
        setSelectedGroupId('');
        fetchRules();
        fetchConnectedGroups();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to save rule');
      }
    } catch (err) {
      setError('An error occurred while saving the rule.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!ruleToDelete) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/routing-rules/${ruleToDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== ruleToDelete.id));
        setRuleToDelete(null);
        setSuccessMsg('Rule deleted successfully.');
        fetchConnectedGroups();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete rule');
      }
    } catch (err) {
      console.error('Failed to delete rule', err);
      setError('Network error while deleting rule.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Network size={24} className="text-blue-500" />
          Group Routing Rules
        </h1>
        <p className="text-neutral-400">
          Automatically route orders to specific Telegram groups based on the request amount and payment method.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white"><X size={16} /></button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 p-4 rounded-lg flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white"><X size={16} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {editingRuleId ? (
                  <>
                    <Edit3 size={18} className="text-blue-400" />
                    Edit Rule
                  </>
                ) : (
                  <>
                    <Plus size={18} className="text-blue-400" />
                    Add Rule
                  </>
                )}
              </h3>
              {editingRuleId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleAddOrUpdateRule} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Min Amount (৳)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newRule.minAmount}
                  onChange={e => setNewRule({ ...newRule, minAmount: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Max Amount (৳)</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newRule.maxAmount}
                  onChange={e => setNewRule({ ...newRule, maxAmount: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 1000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Daily Limit (৳) [0 = Unlimited]</label>
                <input
                  type="number"
                  min="0"
                  value={newRule.dailyLimit}
                  onChange={e => setNewRule({ ...newRule, dailyLimit: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  placeholder="e.g. 50000"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-2">Allowed Payment Methods</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_METHODS.map(method => {
                    const isChecked = newRule.paymentMethods.includes(method);
                    return (
                      <button
                        type="button"
                        key={method}
                        onClick={() => toggleMethodSelection(method)}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          isChecked
                            ? 'bg-blue-600/10 border-blue-500 text-blue-400'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                        }`}
                      >
                        <span>{method}</span>
                        {isChecked && <Check size={12} className="text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Connected Telegram Group Dropdown */}
              <div className="space-y-3 p-3.5 bg-neutral-950 border border-neutral-800/80 rounded-lg">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                    <Bot size={14} className="text-blue-400" />
                    Select Connected Group
                  </label>
                  <button
                    type="button"
                    onClick={fetchConnectedGroups}
                    title="Refresh connected groups"
                    className="text-neutral-500 hover:text-blue-400 transition"
                  >
                    <RefreshCw size={12} className={fetchingGroups ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => handleGroupDropdownChange(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-md text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Choose from Connected Groups --</option>
                    {connectedGroups.map((g) => (
                      <option key={g.chatId} value={g.chatId}>
                        {g.chatName || 'Group'} ({g.chatId})
                      </option>
                    ))}
                    <option value="CUSTOM">✍️ Enter Custom Group ID Manually</option>
                  </select>
                  {connectedGroups.length === 0 && !fetchingGroups && (
                    <p className="text-[10px] text-neutral-500 mt-1">
                      No groups detected yet. Type ID below or add bot to Telegram group.
                    </p>
                  )}
                </div>

                <div className="space-y-3 pt-2 border-t border-neutral-800">
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Telegram Group ID</label>
                    <input
                      type="text"
                      required
                      value={newRule.chatId}
                      onChange={e => {
                        setNewRule({ ...newRule, chatId: e.target.value });
                        if (selectedGroupId !== e.target.value) {
                          setSelectedGroupId('CUSTOM');
                        }
                      }}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-md text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. -1003881143013"
                    />
                    <p className="text-[10px] text-neutral-500 mt-1">Auto-filled from selection above or type manually.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-400 mb-1">Group Name (Optional)</label>
                    <input
                      type="text"
                      value={newRule.chatName}
                      onChange={e => setNewRule({ ...newRule, chatName: e.target.value })}
                      className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. Small Orders Group"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 flex justify-center items-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition cursor-pointer"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : editingRuleId ? (
                    <Edit3 size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {editingRuleId ? 'Update Group Rule' : 'Add Group Option'}
                </button>
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-neutral-950/50 text-neutral-400 text-xs uppercase font-medium border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4">Range (৳)</th>
                  <th className="py-3 px-4">Group Name</th>
                  <th className="py-3 px-4">Daily Limit</th>
                  <th className="py-3 px-4">Payment Methods</th>
                  <th className="py-3 px-4">Group ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500">
                      No routing rules found. Add one on the left.
                    </td>
                  </tr>
                ) : (
                  rules.map((r) => {
                    const isRuleActive = r.isActive !== 0;
                    const isCurrentlyEditing = editingRuleId === r.id;
                    return (
                      <tr 
                        key={r.id} 
                        className={`hover:bg-neutral-800/20 transition-colors ${!isRuleActive ? 'opacity-60' : ''} ${isCurrentlyEditing ? 'bg-blue-900/20 border-l-2 border-blue-500' : ''}`}
                      >
                        <td className="py-3 px-4 text-white font-mono font-medium">
                          {r.minAmount} - {r.maxAmount}
                        </td>
                        <td className="py-3 px-4 text-neutral-200">
                          {r.chatName || <span className="text-neutral-500 italic">No name</span>}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-neutral-300">
                          {r.dailyLimit && r.dailyLimit > 0 ? (
                            <span className="text-amber-400 font-semibold">৳{Number(r.dailyLimit).toLocaleString()}</span>
                          ) : (
                            <span className="text-neutral-500">Unlimited</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1">
                            {(r.paymentMethods ? r.paymentMethods.split(',') : AVAILABLE_METHODS).map((m: string) => {
                              const methodColors: Record<string, string> = {
                                BKASH: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
                                NAGAD: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                                ROCKET: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                                UPAY: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              };
                              return (
                                <span 
                                  key={m} 
                                  className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${methodColors[m] || 'bg-neutral-800 text-neutral-400 border-neutral-700'}`}
                                >
                                  {m}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-400 text-xs">
                          {r.chatId}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleActive(r.id, isRuleActive)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer focus:outline-none ${
                                isRuleActive ? 'bg-emerald-600' : 'bg-neutral-700'
                              }`}
                              title={isRuleActive ? "Active: Group receives routed orders" : "Offline: Group will NOT receive routed orders"}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  isRuleActive ? 'translate-x-4' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button 
                              onClick={() => handleEditRule(r)}
                              className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                                isCurrentlyEditing 
                                  ? 'bg-blue-600 text-white' 
                                  : 'text-neutral-400 hover:text-blue-400 hover:bg-blue-500/10 bg-neutral-800/50'
                              }`}
                              title="Edit rule"
                            >
                              <Edit3 size={13} />
                              <span>Edit</span>
                            </button>
                            <button 
                              onClick={() => setRuleToDelete(r)}
                              className="p-1.5 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 bg-neutral-800/50 rounded transition cursor-pointer"
                              title="Delete rule"
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
        </div>
      </div>

      {/* Delete Confirmation Modal (Iframe safe - replaces window.confirm) */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2 rounded-full bg-red-500/10 border border-red-500/20">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-bold text-white">Delete Routing Rule</h3>
            </div>
            
            <p className="text-sm text-neutral-300">
              Are you sure you want to delete the routing rule for{' '}
              <span className="font-semibold text-white">
                {ruleToDelete.chatName || ruleToDelete.chatId}
              </span>{' '}
              (Range: ৳{ruleToDelete.minAmount} - ৳{ruleToDelete.maxAmount})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRuleToDelete(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                Delete Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

