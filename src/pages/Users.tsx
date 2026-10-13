import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../store/auth';
import { 
  Users as UsersIcon, 
  UserPlus, 
  ShieldCheck, 
  UserCheck, 
  Eye, 
  KeyRound, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Search, 
  Lock, 
  X, 
  EyeOff,
  User,
  ShieldAlert,
  Shield
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SystemUser {
  id: number;
  username: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER' | string;
  status: 'ACTIVE' | 'INACTIVE' | string;
  createdAt: number | null;
}

export default function Users() {
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  
  // Notification messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);

  // Add user form state
  const [addForm, setAddForm] = useState({
    username: '',
    password: '',
    role: 'OPERATOR',
    status: 'ACTIVE',
  });
  const [showAddPassword, setShowAddPassword] = useState<boolean>(false);
  const [submittingAdd, setSubmittingAdd] = useState<boolean>(false);

  // Edit user form state
  const [editForm, setEditForm] = useState({
    role: 'OPERATOR',
    status: 'ACTIVE',
    newPassword: '',
  });
  const [showEditPassword, setShowEditPassword] = useState<boolean>(false);
  const [submittingEdit, setSubmittingEdit] = useState<boolean>(false);

  // Delete state
  const [submittingDelete, setSubmittingDelete] = useState<boolean>(false);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiFetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setUsers(data.data);
      } else {
        setErrorMessage(data.error || 'ইউজার তালিকা লোড করা যায়নি');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage('নেটওয়ার্ক সমস্যার কারণে ইউজার লোড করা যায়নি');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.username.trim() || !addForm.password) {
      setErrorMessage('ইউজারনেম এবং পাসওয়ার্ড উভয়ই আবশ্যক');
      return;
    }

    if (addForm.username.trim().length < 3) {
      setErrorMessage('ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে');
      return;
    }

    if (addForm.password.length < 4) {
      setErrorMessage('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে');
      return;
    }

    setSubmittingAdd(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: addForm.username.trim(),
          password: addForm.password,
          role: addForm.role,
          status: addForm.status,
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showSuccess(`নতুন ব্যবহারকারী '${addForm.username.trim()}' (${addForm.role}) সফলভাবে তৈরি হয়েছে।`);
        setIsAddModalOpen(false);
        setAddForm({
          username: '',
          password: '',
          role: 'OPERATOR',
          status: 'ACTIVE',
        });
        fetchUsers();
      } else {
        setErrorMessage(data.error || 'ব্যবহারকারী তৈরি ব্যর্থ হয়েছে');
      }
    } catch (err) {
      setErrorMessage('ব্যবহারকারী তৈরি করতে গিয়ে ত্রুটি ঘটেছে');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleOpenEdit = (user: SystemUser) => {
    setSelectedUser(user);
    setEditForm({
      role: user.role,
      status: user.status,
      newPassword: '',
    });
    setShowEditPassword(false);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSubmittingEdit(true);
    setErrorMessage(null);

    const payload: any = {
      role: editForm.role,
      status: editForm.status,
    };
    if (editForm.newPassword.trim()) {
      if (editForm.newPassword.length < 4) {
        setErrorMessage('নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে');
        setSubmittingEdit(false);
        return;
      }
      payload.password = editForm.newPassword;
    }

    try {
      const res = await apiFetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showSuccess(`ব্যবহারকারী '${selectedUser.username}' এর তথ্য আপডেট করা হয়েছে।`);
        setIsEditModalOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        setErrorMessage(data.error || 'আপডেট করা সম্ভব হয়নি');
      }
    } catch (err) {
      setErrorMessage('আপডেট করতে গিয়ে ত্রুটি ঘটেছে');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleOpenDelete = (user: SystemUser) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteSubmit = async () => {
    if (!selectedUser) return;

    setSubmittingDelete(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch(`/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showSuccess(`ব্যবহারকারী '${selectedUser.username}' কে ডিলিট করা হয়েছে।`);
        setIsDeleteModalOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        setErrorMessage(data.error || 'ডিলিট করা যায়নি');
      }
    } catch (err) {
      setErrorMessage('ডিলিট করতে গিয়ে ত্রুটি ঘটেছে');
    } finally {
      setSubmittingDelete(false);
    }
  };

  // Filtered list
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Stats calculation
  const totalCount = users.length;
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const operatorCount = users.filter(u => u.role === 'OPERATOR').length;
  const activeCount = users.filter(u => u.status === 'ACTIVE').length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <UsersIcon size={26} className="text-blue-500" />
            Admin & User Management (অ্যাডমিন ও ইউজার ব্যবস্থাপনা)
          </h1>
          <p className="text-neutral-400 text-sm mt-1">
            সিস্টেমে অ্যাডমিন ও অপারেটর অ্যাকাউন্ট তৈরি করুন, পাসওয়ার্ড রিসেট ও রোল নিয়ন্ত্রণ করুন।
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-neutral-700/60"
            title="Refresh Users"
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin text-blue-400")} />
            রিফ্রেশ
          </button>

          <button
            onClick={() => {
              setAddForm({
                username: '',
                password: '',
                role: 'OPERATOR',
                status: 'ACTIVE',
              });
              setShowAddPassword(false);
              setErrorMessage(null);
              setIsAddModalOpen(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition shadow-sm shadow-blue-500/20"
          >
            <UserPlus size={16} />
            নতুন ইউজার যোগ করুন
          </button>
        </div>
      </div>

      {/* Notifications */}
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

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">মোট একাউন্ট</span>
            <UsersIcon size={16} className="text-neutral-500" />
          </div>
          <p className="text-2xl font-bold text-white">{totalCount}</p>
          <p className="text-[11px] text-neutral-500">Total System Users</p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400">অ্যাডমিন (Admin)</span>
            <ShieldCheck size={16} className="text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-white">{adminCount}</p>
          <p className="text-[11px] text-neutral-500">Full System Authority</p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">অপারেটর (Operator)</span>
            <UserCheck size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-white">{operatorCount}</p>
          <p className="text-[11px] text-neutral-500">Standard Daily Access</p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-green-400">সক্রিয় ইউজার</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <p className="text-2xl font-bold text-white">{activeCount}</p>
          <p className="text-[11px] text-neutral-500">Active Status</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-xl flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="text"
            placeholder="ইউজারনেম দিয়ে খুঁজুন..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-neutral-400 shrink-0 font-medium">রোল ফিল্টার:</span>
          {(['ALL', 'ADMIN', 'OPERATOR', 'VIEWER'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-medium transition shrink-0 border",
                roleFilter === r
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
              )}
            >
              {r === 'ALL' ? 'সকল (All)' : r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-neutral-300">
            <thead className="bg-neutral-900/80 text-xs font-semibold text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-3.5 px-6">ইউজার / ইউজারনেম</th>
                <th className="py-3.5 px-6">রোল (Role)</th>
                <th className="py-3.5 px-6">স্ট্যাটাস</th>
                <th className="py-3.5 px-6">তৈরির তারিখ</th>
                <th className="py-3.5 px-6 text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-500">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw size={16} className="animate-spin text-blue-500" />
                      ইউজার তালিকা লোড হচ্ছে...
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-500">
                    কোনো ব্যবহারকারী পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = currentUser?.username === u.username;
                  return (
                    <tr key={u.id} className="hover:bg-neutral-900/40 transition">
                      {/* User Info */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs uppercase border",
                            u.role === 'ADMIN'
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                              : u.role === 'OPERATOR'
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                          )}>
                            {u.username.substring(0, 2)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white">{u.username}</span>
                              {isCurrent && (
                                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium">
                                  আপনি (You)
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-neutral-500">ID: #{u.id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-4 px-6">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border",
                          u.role === 'ADMIN'
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : u.role === 'OPERATOR'
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        )}>
                          {u.role === 'ADMIN' && <Shield size={12} />}
                          {u.role === 'OPERATOR' && <UserCheck size={12} />}
                          {u.role === 'VIEWER' && <Eye size={12} />}
                          {u.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
                          u.status === 'ACTIVE'
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            : "bg-neutral-800 text-neutral-400 border-neutral-700"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            u.status === 'ACTIVE' ? "bg-emerald-400" : "bg-neutral-500"
                          )} />
                          {u.status === 'ACTIVE' ? 'সক্রিয় (Active)' : 'নিষ্ক্রিয় (Inactive)'}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-6 text-xs text-neutral-400">
                        {u.createdAt ? (
                          <span>
                            {new Date(u.createdAt).toLocaleDateString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        ) : 'N/A'}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2 rounded-lg border border-neutral-800 hover:border-neutral-700 transition"
                            title="Edit Role or Reset Password"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            onClick={() => handleOpenDelete(u)}
                            disabled={isCurrent}
                            className={cn(
                              "p-2 rounded-lg border transition",
                              isCurrent
                                ? "bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed"
                                : "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20"
                            )}
                            title={isCurrent ? "নিজের একাউন্ট ডিলিট করা সম্ভব নয়" : "Delete User"}
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

      {/* MODAL 1: ADD NEW USER / ADMIN */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <UserPlus size={18} />
                </div>
                <h3 className="text-base font-semibold text-white">নতুন ইউজার যোগ করুন</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  ইউজারনেম (Username) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. operator1, shakil, admin2"
                    value={addForm.username}
                    onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">লগইনের জন্য ব্যবহার করা হবে (কমপক্ষে ৩ অক্ষর)</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  পাসওয়ার্ড (Password) <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type={showAddPassword ? "text" : "password"}
                    required
                    placeholder="কমপক্ষে ৪ অক্ষরের পাসওয়ার্ড"
                    value={addForm.password}
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAddPassword(!showAddPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                  >
                    {showAddPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  ব্যবহারকারীর রোল (Account Role) <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'ADMIN', label: 'Admin', desc: 'Full Access' },
                    { key: 'OPERATOR', label: 'Operator', desc: 'Orders & Work' },
                    { key: 'VIEWER', label: 'Viewer', desc: 'Read Only' },
                  ].map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setAddForm({ ...addForm, role: r.key })}
                      className={cn(
                        "p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition",
                        addForm.role === r.key
                          ? "bg-blue-600/20 border-blue-500 text-white ring-1 ring-blue-500"
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                      )}
                    >
                      <span className="text-xs font-bold text-white">{r.label}</span>
                      <span className="text-[10px] text-neutral-500">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  স্ট্যাটাস (Initial Status)
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="radio"
                      name="add_status"
                      checked={addForm.status === 'ACTIVE'}
                      onChange={() => setAddForm({ ...addForm, status: 'ACTIVE' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    সক্রিয় (Active)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="radio"
                      name="add_status"
                      checked={addForm.status === 'INACTIVE'}
                      onChange={() => setAddForm({ ...addForm, status: 'INACTIVE' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    নিষ্ক্রিয় (Inactive / Suspended)
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submittingAdd}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition shadow-sm disabled:opacity-50"
                >
                  {submittingAdd ? 'তৈরি হচ্ছে...' : 'ইউজার তৈরি করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT USER & RESET PASSWORD */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between p-5 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">ইউজার এডিট করুন</h3>
                  <p className="text-xs text-neutral-400">ব্যবহারকারী: <b>{selectedUser.username}</b></p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-900"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  রোল পরিবর্তন (Update Role)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'ADMIN', label: 'Admin', desc: 'Full Access' },
                    { key: 'OPERATOR', label: 'Operator', desc: 'Orders & Work' },
                    { key: 'VIEWER', label: 'Viewer', desc: 'Read Only' },
                  ].map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, role: r.key })}
                      className={cn(
                        "p-2.5 rounded-lg border text-left flex flex-col gap-0.5 transition",
                        editForm.role === r.key
                          ? "bg-blue-600/20 border-blue-500 text-white ring-1 ring-blue-500"
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                      )}
                    >
                      <span className="text-xs font-bold text-white">{r.label}</span>
                      <span className="text-[10px] text-neutral-500">{r.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  অ্যাকাউন্ট স্ট্যাটাস (Account Status)
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="radio"
                      name="edit_status"
                      checked={editForm.status === 'ACTIVE'}
                      onChange={() => setEditForm({ ...editForm, status: 'ACTIVE' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    সক্রিয় (Active)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                    <input
                      type="radio"
                      name="edit_status"
                      checked={editForm.status === 'INACTIVE'}
                      onChange={() => setEditForm({ ...editForm, status: 'INACTIVE' })}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    নিষ্ক্রিয় (Inactive / Suspended)
                  </label>
                </div>
              </div>

              {/* Optional Reset Password */}
              <div className="pt-2 border-t border-neutral-800/80">
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
                  <KeyRound size={14} className="text-amber-400" />
                  নতুন পাসওয়ার্ড সেট করুন (ঐচ্ছিক)
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type={showEditPassword ? "text" : "password"}
                    placeholder="পাসওয়ার্ড পরিবর্তন না করতে চাইলে খালি রাখুন"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-9 pr-10 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                  >
                    {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">পাসওয়ার্ড পরিবর্তন করতে চাইলে কমপক্ষে ৪ অক্ষর লিখুন</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 transition"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition shadow-sm disabled:opacity-50"
                >
                  {submittingEdit ? 'সংরক্ষণ হচ্ছে...' : 'আপডেট সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scaleUp p-5 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">ইউজার ডিলিট নিশ্চিতকরণ</h3>
                <p className="text-xs text-neutral-400">Delete user confirmation</p>
              </div>
            </div>

            <p className="text-sm text-neutral-300 leading-relaxed">
              আপনি কি নিশ্চিত যে <strong>'{selectedUser.username}'</strong> ({selectedUser.role}) একাউন্টটি স্থায়ীভাবে ডিলিট করতে চান?
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/60 transition"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={submittingDelete}
                onClick={handleDeleteSubmit}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition shadow-sm disabled:opacity-50"
              >
                {submittingDelete ? 'ডিলিট হচ্ছে...' : 'হ্যাঁ, ডিলিট করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
