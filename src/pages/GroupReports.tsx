import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../store/auth';
import { BarChart2, Plus, Calendar, FileText, ArrowDownLeft, ArrowUpRight, X, Download, Edit2, Trash2, Search, MinusCircle, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getBDDateString, formatBDDateTime, formatBDDate, formatBDTime } from '../lib/timezone';

interface GroupBalance {
  id: number;
  chatId: string;
  chatName: string;
  balance: number;
}

interface DailyReport {
  chatId: string;
  chatName: string;
  count: number;
  totalAmount: number;
}

interface DailyDeductEntry {
  id: number;
  chatId: string;
  chatName: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId: string | null;
  operator: string | null;
  createdAt: number;
}

interface LedgerEntry {
  id: number;
  chatId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId: string | null;
  operator: string | null;
  createdAt: number;
}

export default function GroupReports() {
  const { token } = useAuth();
  const [balances, setBalances] = useState<GroupBalance[]>([]);
  const [report, setReport] = useState<DailyReport[]>([]);
  const [deductReport, setDeductReport] = useState<DailyReport[]>([]);
  const [deductEntries, setDeductEntries] = useState<DailyDeductEntry[]>([]);
  const [reportTab, setReportTab] = useState<'COMPLETED' | 'DEDUCT'>('COMPLETED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => getBDDateString());

  const [addBalanceForm, setAddBalanceForm] = useState({ chatId: '', chatName: '', amount: '' });
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');

  // Ledger Modal State
  const [selectedGroupLedger, setSelectedGroupLedger] = useState<{ group: GroupBalance; entries: LedgerEntry[] } | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickDeductOpen, setQuickDeductOpen] = useState(false);
  const [quickAddAmount, setQuickAddAmount] = useState('');
  const [quickAddNote, setQuickAddNote] = useState('');
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  const [quickDeductAmount, setQuickDeductAmount] = useState('');
  const [quickDeductNote, setQuickDeductNote] = useState('');
  const [quickDeductSubmitting, setQuickDeductSubmitting] = useState(false);

  // Edit Ledger Entry State
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState('DEPOSIT');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<number | null>(null);
  const [deletedEntry, setDeletedEntry] = useState<LedgerEntry | null>(null);
  const [undoTimeout, setUndoTimeout] = useState<NodeJS.Timeout | null>(null);

  // Ledger Date Range & Search Filter State
  const [ledgerStartDate, setLedgerStartDate] = useState('');
  const [ledgerEndDate, setLedgerEndDate] = useState('');
  const [ledgerSearchTerm, setLedgerSearchTerm] = useState('');

  const filteredLedgerEntries = selectedGroupLedger ? selectedGroupLedger.entries.filter(entry => {
    // Search Term Filter
    if (ledgerSearchTerm) {
      const term = ledgerSearchTerm.toLowerCase();
      const matchesRef = entry.referenceId?.toLowerCase().includes(term) || false;
      const matchesDesc = entry.description?.toLowerCase().includes(term) || false;
      const matchesOp = entry.operator?.toLowerCase().includes(term) || false;
      const matchesGroup = selectedGroupLedger.group.chatName?.toLowerCase().includes(term) || selectedGroupLedger.group.chatId?.toLowerCase().includes(term) || false;
      const matchesType = entry.type?.toLowerCase().includes(term) || false;
      
      if (!matchesRef && !matchesDesc && !matchesOp && !matchesGroup && !matchesType) {
        return false;
      }
    }

    // Date Range Filter
    if (!ledgerStartDate && !ledgerEndDate) return true;
    const entryDate = getBDDateString(entry.createdAt);
    if (ledgerStartDate && entryDate < ledgerStartDate) return false;
    if (ledgerEndDate && entryDate > ledgerEndDate) return false;
    return true;
  }) : [];

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const repUrl = `/api/reports/daily-groups?date=${date}${selectedGroupFilter ? `&chatId=${encodeURIComponent(selectedGroupFilter)}` : ''}`;
      const deductRepUrl = `/api/reports/daily-deduct?date=${date}${selectedGroupFilter ? `&chatId=${encodeURIComponent(selectedGroupFilter)}` : ''}`;
      const [balRes, repRes, deductRes] = await Promise.all([
        apiFetch('/api/group-balances', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch(repUrl, { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch(deductRepUrl, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      const balData = await balRes.json();
      const repData = await repRes.json();
      const deductData = await deductRes.json();

      if (balData.success) setBalances(balData.data);
      if (repData.success) setReport(repData.data);
      if (deductData.success) {
        setDeductReport(deductData.data || []);
        setDeductEntries(deductData.entries || []);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token, date, selectedGroupFilter]);

  const handleEditEntrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !selectedGroupLedger) return;
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/api/group-ledgers/entry/${editingEntry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amount: editAmount,
          description: editDescription,
          type: editType
        })
      });
      if (res.ok) {
        setEditingEntry(null);
        await openLedger(selectedGroupLedger.group.chatId);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update ledger entry');
      }
    } catch (err) {
      setError('An error occurred while updating entry');
    } finally {
      setEditSubmitting(false);
    }
  };

  const clearUndo = () => {
    if (undoTimeout) clearTimeout(undoTimeout);
    setDeletedEntry(null);
  };

  const handleDeleteEntry = (entryId: number) => {
    setEntryToDelete(entryId);
    setDeleteModalOpen(true);
  };

  const confirmDeleteEntry = async () => {
    if (!entryToDelete || !selectedGroupLedger) return;
    const entry = selectedGroupLedger.entries.find(e => e.id === entryToDelete);
    try {
      const res = await apiFetch(`/api/group-ledgers/entry/${entryToDelete}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDeletedEntry(entry || null);
        setUndoTimeout(setTimeout(clearUndo, 5000));
        await openLedger(selectedGroupLedger.group.chatId);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete ledger entry');
      }
    } catch (err) {
      setError('An error occurred while deleting entry');
    } finally {
      setDeleteModalOpen(false);
      setEntryToDelete(null);
    }
  };

  const handleUndoDelete = async () => {
    if (!deletedEntry || !selectedGroupLedger) return;
    try {
      const res = await apiFetch('/api/group-balances/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId: selectedGroupLedger.group.chatId,
          chatName: selectedGroupLedger.group.chatName,
          amount: deletedEntry.type === 'DEPOSIT' ? -deletedEntry.amount : deletedEntry.amount,
          note: `Undo delete: ${deletedEntry.description}`
        })
      });
      if (res.ok) {
        clearUndo();
        await openLedger(selectedGroupLedger.group.chatId);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to undo delete');
      }
    } catch (err) {
      setError('An error occurred while undoing delete');
    }
  };

  const handleAddBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addBalanceForm.chatId || !addBalanceForm.amount) return;
    
    setLoading(true);
    try {
      const res = await apiFetch('/api/group-balances/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(addBalanceForm)
      });
      if (res.ok) {
        setAddBalanceForm({ chatId: '', chatName: '', amount: '' });
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to add balance');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const openLedger = async (chatId: string) => {
    setLedgerLoading(true);
    try {
      const res = await apiFetch(`/api/group-ledgers/${encodeURIComponent(chatId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSelectedGroupLedger(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleQuickAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("handleQuickAddPayment called");
    console.log("Selected Group:", selectedGroupLedger);
    console.log("Amount:", quickAddAmount);
    
    if (!selectedGroupLedger || !quickAddAmount) {
      console.log("Missing group or amount");
      return;
    }
    setQuickAddSubmitting(true);
    try {
      console.log("Calling API...");
      const res = await apiFetch('/api/group-balances/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId: selectedGroupLedger.group.chatId,
          chatName: selectedGroupLedger.group.chatName,
          amount: quickAddAmount,
          note: quickAddNote
        })
      });
      console.log("API response:", res);
      if (res.ok) {
        setQuickAddOpen(false);
        setQuickAddAmount('');
        setQuickAddNote('');
        await openLedger(selectedGroupLedger.group.chatId);
        fetchData();
      } else {
        const data = await res.json();
        console.error("API error:", data);
        setError(data.error || 'Failed to credit balance');
      }
    } catch (err) {
      console.error("Catch error:", err);
      setError('An error occurred during quick add');
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  const handleQuickDeductPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupLedger || !quickDeductAmount) return;
    setQuickDeductSubmitting(true);
    try {
      const res = await apiFetch('/api/group-balances/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chatId: selectedGroupLedger.group.chatId,
          chatName: selectedGroupLedger.group.chatName,
          amount: quickDeductAmount,
          note: quickDeductNote
        })
      });
      if (res.ok) {
        setQuickDeductOpen(false);
        setQuickDeductAmount('');
        setQuickDeductNote('');
        await openLedger(selectedGroupLedger.group.chatId);
        fetchData();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to deduct balance');
      }
    } catch (err) {
      setError('An error occurred during quick deduct');
    } finally {
      setQuickDeductSubmitting(false);
    }
  };

  const exportToCSV = () => {
    if (!selectedGroupLedger) return;
    const groupName = selectedGroupLedger.group.chatName || selectedGroupLedger.group.chatId;
    const headers = ['Date & Time (BST)', 'Type', 'Description', 'Reference ID', 'Operator', 'Amount', 'Balance After'];
    const rows = filteredLedgerEntries.map(entry => [
      `"${formatBDDateTime(entry.createdAt)}"`,
      `"${entry.type}"`,
      `"${(entry.description || '').replace(/"/g, '""')}"`,
      `"${entry.referenceId || ''}"`,
      `"${entry.operator || ''}"`,
      entry.amount,
      entry.balanceAfter
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ledger_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = () => {
    if (!selectedGroupLedger) return;
    const doc = new jsPDF();
    const groupName = selectedGroupLedger.group.chatName || selectedGroupLedger.group.chatId;

    doc.setFontSize(16);
    doc.text(`Ledger Statement: ${groupName}`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Chat ID: ${selectedGroupLedger.group.chatId}`, 14, 26);
    doc.text(`Date Range: ${ledgerStartDate || 'Beginning'} to ${ledgerEndDate || 'Present'} (BD Time)`, 14, 32);
    doc.text(`Current Balance: ৳${selectedGroupLedger.group.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`, 14, 38);
    doc.text(`Exported At: ${formatBDDateTime(Date.now(), true)}`, 14, 44);

    const tableColumn = ["Date & Time (BST)", "Type", "Description", "Ref ID", "Operator", "Amount (৳)", "Balance (৳)"];
    const tableRows = filteredLedgerEntries.map(entry => [
      formatBDDateTime(entry.createdAt),
      entry.type,
      entry.description || '',
      entry.referenceId || '',
      entry.operator || '',
      entry.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 }),
      entry.balanceAfter.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 50,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });

    doc.save(`ledger_${groupName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`);
  };

  const exportDailyPDF = () => {
    const doc = new jsPDF();
    const groupFilterName = selectedGroupFilter 
      ? (balances.find(b => b.chatId === selectedGroupFilter)?.chatName || selectedGroupFilter)
      : 'All Groups';

    doc.setFontSize(16);
    doc.text(`Daily Completed Transactions Report (Bangladesh Time)`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${date} (Asia/Dhaka)`, 14, 26);
    doc.text(`Group Filter: ${groupFilterName}`, 14, 32);
    doc.text(`Exported At: ${formatBDDateTime(Date.now(), true)}`, 14, 38);

    const tableColumn = ["Group Name", "Group ID", "Transactions Count", "Total Amount (৳)"];
    const tableRows = report.map(r => [
      r.chatName,
      r.chatId,
      r.count.toString(),
      r.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    const totalOrders = report.reduce((acc, r) => acc + r.count, 0);
    const totalAmountSum = report.reduce((acc, r) => acc + r.totalAmount, 0);

    tableRows.push([
      'Total',
      '',
      `${totalOrders} orders`,
      totalAmountSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 44,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
      didParseCell: function(data: any) {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    doc.save(`daily_completed_report_${date}_${Date.now()}.pdf`);
  };

  const exportDailyDeductPDF = () => {
    const doc = new jsPDF();
    const groupFilterName = selectedGroupFilter 
      ? (balances.find(b => b.chatId === selectedGroupFilter)?.chatName || selectedGroupFilter)
      : 'All Groups';

    doc.setFontSize(16);
    doc.text(`Daily Deduct Transactions Report (Bangladesh Time)`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${date} (Asia/Dhaka)`, 14, 26);
    doc.text(`Group Filter: ${groupFilterName}`, 14, 32);
    doc.text(`Exported At: ${formatBDDateTime(Date.now(), true)}`, 14, 38);

    const tableColumn = ["Time (BST)", "Group Name", "Group ID", "Description", "Ref ID", "Operator", "Amount (৳)"];
    const tableRows = deductEntries.map(e => [
      formatBDTime(e.createdAt),
      e.chatName || e.chatId,
      e.chatId,
      e.description || 'Deduction',
      e.referenceId || '-',
      e.operator || 'Admin',
      e.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    const totalDeductSum = deductEntries.reduce((acc, e) => acc + e.amount, 0);

    tableRows.push([
      'Total',
      '',
      '',
      '',
      '',
      `${deductEntries.length} deductions`,
      totalDeductSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 44,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
      didParseCell: function(data: any) {
        if (data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    });

    doc.save(`daily_deduct_report_${date}_${Date.now()}.pdf`);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <BarChart2 size={24} className="text-blue-500" />
          Groups & Separate Ledgers
        </h1>
        <p className="text-neutral-400">
          Manage group balances, view daily transaction reports, and inspect individual group ledger statements.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Balances & Ledger triggers */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h3 className="text-lg font-bold text-white mb-4">Add Balance</h3>
            <form onSubmit={handleAddBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Telegram Group ID</label>
                <input
                  type="text"
                  required
                  value={addBalanceForm.chatId}
                  onChange={e => setAddBalanceForm({ ...addBalanceForm, chatId: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. -100545454646"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Group Name (Optional)</label>
                <input
                  type="text"
                  value={addBalanceForm.chatName}
                  onChange={e => setAddBalanceForm({ ...addBalanceForm, chatName: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Group A"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Amount (৳)</label>
                <input
                  type="number"
                  required
                  value={addBalanceForm.amount}
                  onChange={e => setAddBalanceForm({ ...addBalanceForm, amount: e.target.value })}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. 50000"
                />
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
              >
                <Plus size={16} />
                Add Balance
              </button>
            </form>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 bg-neutral-950 flex justify-between items-center">
              <h3 className="font-bold text-white">Groups & Balances</h3>
              <span className="text-xs text-neutral-400">Click to view ledger</span>
            </div>
            <div className="divide-y divide-neutral-800/50 max-h-[400px] overflow-y-auto">
              {balances.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 text-sm">No balances recorded.</div>
              ) : (
                balances.map(b => (
                  <div 
                    key={b.id} 
                    onClick={() => openLedger(b.chatId)}
                    className="p-4 flex items-center justify-between hover:bg-neutral-800/40 cursor-pointer transition"
                  >
                    <div>
                      <div className="font-medium text-white flex items-center gap-1.5">
                        {b.chatName || 'Unknown Group'}
                        <FileText size={14} className="text-blue-400" />
                      </div>
                      <div className="text-xs text-neutral-500 font-mono">{b.chatId}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold font-mono ${b.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ৳{b.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-blue-400 hover:underline">View Ledger &rarr;</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Daily Reports */}
        <div className="lg:col-span-2">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-full">
            {/* Header with Tabs & Controls */}
            <div className="p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              {/* Tab Selector */}
              <div className="flex items-center bg-neutral-900 p-1 rounded-lg border border-neutral-800">
                <button
                  type="button"
                  onClick={() => setReportTab('COMPLETED')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    reportTab === 'COMPLETED'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <CheckCircle size={14} />
                  <span>Completed Tx</span>
                  <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${reportTab === 'COMPLETED' ? 'bg-blue-700/80 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                    {report.reduce((acc, r) => acc + r.count, 0)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportTab('DEDUCT')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    reportTab === 'DEDUCT'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <MinusCircle size={14} />
                  <span>Daily Deduct Tx</span>
                  <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full ${reportTab === 'DEDUCT' ? 'bg-red-700/80 text-white' : 'bg-neutral-800 text-neutral-400'}`}>
                    {deductEntries.length}
                  </span>
                </button>
              </div>

              {/* Filters & Export */}
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-white text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Groups</option>
                  {balances.map(b => (
                    <option key={b.chatId} value={b.chatId}>{b.chatName || b.chatId}</option>
                  ))}
                </select>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-neutral-900 border border-neutral-800 rounded-md text-white text-xs sm:text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={reportTab === 'COMPLETED' ? exportDailyPDF : exportDailyDeductPDF}
                  disabled={reportTab === 'COMPLETED' ? report.length === 0 : deductEntries.length === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-white rounded-md text-xs sm:text-sm font-medium transition disabled:opacity-50 ${
                    reportTab === 'COMPLETED' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                  title={reportTab === 'COMPLETED' ? "Export Daily Completed Report as PDF" : "Export Daily Deduct Report as PDF"}
                >
                  <Download size={14} />
                  Export PDF
                </button>
              </div>
            </div>

            {/* Content: Completed Report View */}
            {reportTab === 'COMPLETED' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400">
                    <tr>
                      <th className="py-3 px-5 font-medium">Group Name</th>
                      <th className="py-3 px-5 font-medium">Group ID</th>
                      <th className="py-3 px-5 font-medium text-right">Transactions</th>
                      <th className="py-3 px-5 font-medium text-right">Total Amount (৳)</th>
                      <th className="py-3 px-5 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {report.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-neutral-500">
                          No completed transactions for this date.
                        </td>
                      </tr>
                    ) : (
                      report.map((r, i) => (
                        <tr key={i} className="hover:bg-neutral-800/20 transition-colors">
                          <td className="py-4 px-5 text-neutral-300 font-medium">
                            {r.chatName}
                          </td>
                          <td className="py-4 px-5 font-mono text-neutral-500 text-xs">
                            {r.chatId}
                          </td>
                          <td className="py-4 px-5 text-right text-white">
                            <span className="bg-neutral-800 text-neutral-300 py-1 px-2.5 rounded-full text-xs">
                              {r.count} orders
                            </span>
                          </td>
                          <td className="py-4 px-5 text-right text-green-400 font-bold font-mono">
                            {r.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-4 px-5 text-center">
                            <button
                              onClick={() => openLedger(r.chatId)}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs transition"
                            >
                              <FileText size={12} />
                              Ledger
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                    {report.length > 0 && (
                      <tr className="bg-neutral-950 border-t-2 border-neutral-800">
                        <td colSpan={2} className="py-4 px-5 font-bold text-white text-right">Total:</td>
                        <td className="py-4 px-5 text-right text-white font-bold">
                          {report.reduce((acc, r) => acc + r.count, 0)} orders
                        </td>
                        <td colSpan={2} className="py-4 px-5 text-right text-green-400 font-bold font-mono">
                          {report.reduce((acc, r) => acc + r.totalAmount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Content: Daily Deduct Transactions View */}
            {reportTab === 'DEDUCT' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400">
                    <tr>
                      <th className="py-3 px-4 font-medium">Time (BST)</th>
                      <th className="py-3 px-4 font-medium">Group Name</th>
                      <th className="py-3 px-4 font-medium">Description</th>
                      <th className="py-3 px-4 font-medium">Ref / Note</th>
                      <th className="py-3 px-4 font-medium">Operator</th>
                      <th className="py-3 px-4 font-medium text-right">Deducted (৳)</th>
                      <th className="py-3 px-4 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {deductEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-neutral-500">
                          No balance deductions recorded for this date.
                        </td>
                      </tr>
                    ) : (
                      deductEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-neutral-800/20 transition-colors">
                          <td className="py-3 px-4 text-xs font-mono text-neutral-400">
                            {formatBDTime(e.createdAt)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-neutral-200 text-xs sm:text-sm">{e.chatName || e.chatId}</div>
                            <div className="font-mono text-[10px] text-neutral-500">{e.chatId}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-neutral-300 max-w-[200px] truncate" title={e.description}>
                            {e.description || 'Deduction'}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-neutral-400">
                            {e.referenceId || '-'}
                          </td>
                          <td className="py-3 px-4 text-xs text-neutral-300">
                            <span className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-300 text-[11px]">
                              {e.operator || 'Admin'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-red-400 font-bold font-mono text-xs sm:text-sm">
                            -৳{e.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => openLedger(e.chatId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-white rounded text-xs transition"
                            >
                              <FileText size={12} />
                              Ledger
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                    {deductEntries.length > 0 && (
                      <tr className="bg-neutral-950 border-t-2 border-neutral-800 font-bold">
                        <td colSpan={5} className="py-4 px-4 text-white text-right">
                          Total Deductions ({deductEntries.length}):
                        </td>
                        <td colSpan={2} className="py-4 px-4 text-right text-red-400 font-mono text-sm">
                          -৳{deductEntries.reduce((acc, e) => acc + e.amount, 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ledger Modal */}
      {selectedGroupLedger && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-800 bg-neutral-950 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FileText className="text-blue-500" size={20} />
                  Ledger Statement: {selectedGroupLedger.group.chatName || selectedGroupLedger.group.chatId}
                </h2>
                <div className="text-xs text-neutral-400 font-mono mt-0.5">
                  Chat ID: {selectedGroupLedger.group.chatId}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuickAddOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition shadow"
                >
                  <Plus size={16} />
                  Add
                </button>
                <button
                  onClick={() => setQuickDeductOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition shadow"
                >
                  <Plus size={16} className="rotate-45" />
                  Deduct
                </button>
                <button
                  onClick={exportToCSV}
                  disabled={selectedGroupLedger.entries.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  title="Export transaction history as CSV"
                >
                  <Download size={16} />
                  Export CSV
                </button>
                <button
                  onClick={exportToPDF}
                  disabled={selectedGroupLedger.entries.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                  title="Export transaction history as PDF"
                >
                  <FileText size={16} />
                  Export PDF
                </button>
                <div className="text-right">
                  <div className="text-xs text-neutral-400">Current Balance</div>
                  <div className={`text-lg font-bold font-mono ${selectedGroupLedger.group.balance < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    ৳{selectedGroupLedger.group.balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedGroupLedger(null)}
                  className="p-2 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body / Ledger Entries */}
            <div className="flex-1 overflow-y-auto p-6">
              {ledgerLoading ? (
                <div className="py-16 text-center text-neutral-500">Loading ledger statement...</div>
              ) : selectedGroupLedger.entries.length === 0 ? (
                <div className="py-16 text-center text-neutral-500">
                  <FileText size={40} className="mx-auto mb-3 opacity-30" />
                  No ledger entries recorded for this group yet.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                    <div className="w-full sm:w-auto relative flex-1 max-w-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={14} className="text-neutral-500" />
                      </div>
                      <input
                        type="text"
                        placeholder="Search ID, tx id, wallet, group, or account..."
                        value={ledgerSearchTerm}
                        onChange={(e) => setLedgerSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-neutral-600"
                      />
                      {ledgerSearchTerm && (
                        <button
                          onClick={() => setLedgerSearchTerm('')}
                          className="absolute inset-y-0 right-0 pr-2 flex items-center text-neutral-500 hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-neutral-300">
                        <Calendar size={14} className="text-blue-500" />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <span>From:</span>
                          <input
                            type="date"
                            value={ledgerStartDate}
                            onChange={(e) => setLedgerStartDate(e.target.value)}
                            className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                          <span>To:</span>
                          <input
                            type="date"
                            value={ledgerEndDate}
                            onChange={(e) => setLedgerEndDate(e.target.value)}
                            className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        {(ledgerStartDate || ledgerEndDate) && (
                          <button
                            onClick={() => { setLedgerStartDate(''); setLedgerEndDate(''); }}
                            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs transition"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-neutral-800 rounded-xl">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-neutral-950 border-b border-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Description / Ref ID</th>
                          <th className="py-3 px-4">Operator</th>
                          <th className="py-3 px-4 text-right">Amount (৳)</th>
                          <th className="py-3 px-4 text-right">Balance After (৳)</th>
                          <th className="py-3 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/50 font-mono text-xs">
                        {filteredLedgerEntries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-neutral-500 font-sans">
                              No transactions found in the selected date range.
                            </td>
                          </tr>
                        ) : filteredLedgerEntries.map((entry) => (
                          <tr key={entry.id} className="hover:bg-neutral-800/20 transition-colors">
                            <td className="py-3 px-4 text-neutral-400">
                              {formatBDDateTime(entry.createdAt)}
                            </td>
                            <td className="py-3 px-4">
                              {entry.type === 'DEPOSIT' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded font-sans font-semibold">
                                  <ArrowDownLeft size={12} /> DEPOSIT
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded font-sans font-semibold">
                                  <ArrowUpRight size={12} /> PAYOUT
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-neutral-300 font-sans">
                              <div>{entry.description}</div>
                              {entry.referenceId && (
                                <div className="text-[10px] text-neutral-500 font-mono mt-0.5">Ref: {entry.referenceId}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-neutral-400 font-sans">
                              {entry.operator || 'System'}
                            </td>
                            <td className={`py-3 px-4 text-right font-bold ${entry.type === 'DEPOSIT' ? 'text-green-400' : 'text-red-400'}`}>
                              {entry.type === 'DEPOSIT' ? '+' : '-'}৳{entry.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-right text-white font-bold">
                              ৳{entry.balanceAfter.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 px-4 text-center space-x-1.5">
                              <button
                                onClick={() => {
                                  setEditingEntry(entry);
                                  setEditAmount(entry.amount.toString());
                                  setEditDescription(entry.description || '');
                                  setEditType(entry.type);
                                }}
                                className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-blue-400 rounded transition"
                                title="Edit Entry"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteEntry(entry.id)}
                                className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-red-400 rounded transition"
                                title="Delete Entry"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end">
              <button
                onClick={() => setSelectedGroupLedger(null)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Deduct Payment Modal */}
      {quickDeductOpen && selectedGroupLedger && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="text-red-500 rotate-45" size={20} />
                Quick Deduct Balance
              </h3>
              <button
                onClick={() => setQuickDeductOpen(false)}
                className="p-1 text-neutral-400 hover:text-white bg-neutral-800 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Deduct balance from <span className="text-white font-semibold">{selectedGroupLedger.group.chatName || selectedGroupLedger.group.chatId}</span>.
            </p>
            <form onSubmit={handleQuickDeductPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Amount (৳)</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={quickDeductAmount}
                  onChange={e => setQuickDeductAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-500 font-mono"
                  placeholder="e.g. 5000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Note / Description (Optional)</label>
                <input
                  type="text"
                  value={quickDeductNote}
                  onChange={e => setQuickDeductNote(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                  placeholder="e.g. Admin withdrawal..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickDeductOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickDeductSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {quickDeductSubmitting ? 'Deducting...' : 'Deduct Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Payment Modal */}
      {quickAddOpen && selectedGroupLedger && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="text-green-500" size={20} />
                Quick Add Payment
              </h3>
              <button
                onClick={() => setQuickAddOpen(false)}
                className="p-1 text-neutral-400 hover:text-white bg-neutral-800 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Credit balance to <span className="text-white font-semibold">{selectedGroupLedger.group.chatName || selectedGroupLedger.group.chatId}</span>.
            </p>
            <form onSubmit={handleQuickAddPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Amount (৳)</label>
                <input
                  type="number"
                  required
                  autoFocus
                  value={quickAddAmount}
                  onChange={e => setQuickAddAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500 font-mono"
                  placeholder="e.g. 10000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Note / Description (Optional)</label>
                <input
                  type="text"
                  value={quickAddNote}
                  onChange={e => setQuickAddNote(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  placeholder="e.g. Bank deposit reference..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {quickAddSubmitting ? 'Crediting...' : 'Credit Balance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Ledger Entry Confirmation Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-white mb-2">Delete Ledger Entry</h3>
            <p className="text-sm text-neutral-400 mb-6">
              Are you sure you want to delete this ledger entry? This will permanently remove the record, delete any associated <span className="text-red-400 font-semibold">Transaction & Order</span>, and recalculate the group balance.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteEntry}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Delete Snackbar */}
      {deletedEntry && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-neutral-800 border border-neutral-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <span className="text-sm">Entry deleted.</span>
          <button 
            onClick={handleUndoDelete}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition"
          >
            UNDO
          </button>
        </div>
      )}

      {/* Edit Ledger Entry Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit2 className="text-blue-500" size={20} />
                Edit Ledger Entry #{editingEntry.id}
              </h3>
              <button
                onClick={() => setEditingEntry(null)}
                className="p-1 text-neutral-400 hover:text-white bg-neutral-800 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleEditEntrySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Type</label>
                <select
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DEPOSIT">DEPOSIT</option>
                  <option value="PAYOUT">PAYOUT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Amount (৳)</label>
                <input
                  type="number"
                  required
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-sm rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
