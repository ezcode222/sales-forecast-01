import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  api,
  ApiError,
  type AppRoleAssignment,
  type EmployeeContact,
} from '../../lib/api';

type ManageAdminPanelProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly sessionEmpCode: string | null;
  readonly onSaved?: () => void;
};

type DraftAssignment = {
  empCode: string;
  fullNameEng: string;
  currentEmail: string;
  role: 'admin' | 'super_user';
  source: string;
};

function Avatar({ name }: { readonly name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#007ABE] to-[#005a8c] text-[10px] font-bold text-white">
      {initials}
    </div>
  );
}

function RoleBadge({ role }: { readonly role: 'admin' | 'super_user' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold',
        role === 'admin' ? 'bg-[#007ABE]/10 text-[#007ABE]' : 'bg-indigo-50 text-indigo-600'
      )}
    >
      {role === 'admin' ? 'Admin' : 'Super user'}
    </span>
  );
}

function confirmAction(message: string) {
  return window.confirm(message);
}

export function ManageAdminPanel({
  open,
  onClose,
  sessionEmpCode,
  onSaved,
}: ManageAdminPanelProps) {
  const [assignments, setAssignments] = useState<DraftAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EmployeeContact[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.admin.listRoles();
        if (cancelled) return;
        setAssignments(
          response.assignments.map((item: AppRoleAssignment) => ({
            empCode: item.empCode,
            fullNameEng: item.fullNameEng,
            currentEmail: item.currentEmail,
            role: item.role,
            source: item.source,
          }))
        );
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof ApiError ? error.message : 'Failed to load role assignments');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.employees.search(query);
        if (!cancelled) setSearchResults(response.results);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, searchQuery]);

  const assignedEmpCodes = useMemo(
    () => new Set(assignments.map(item => item.empCode)),
    [assignments]
  );

  const admins = useMemo(
    () => assignments.filter(item => item.role === 'admin'),
    [assignments]
  );

  const superUsers = useMemo(
    () => assignments.filter(item => item.role === 'super_user'),
    [assignments]
  );

  const confirmRemoval = useCallback(
    (empCode: string, role: 'admin' | 'super_user') => {
      const isSelf = Boolean(sessionEmpCode && sessionEmpCode === empCode);
      const adminCount = assignments.filter(item => item.role === 'admin').length;
      if (role === 'admin' && adminCount <= 1) {
        if (!confirmAction('You are about to remove the last administrator. Continue?')) {
          return false;
        }
      }
      if (isSelf && role === 'admin') {
        if (!confirmAction('You will lose admin access. Continue?')) {
          return false;
        }
      }
      if (isSelf && role === 'super_user') {
        if (!confirmAction('You will lose Manage Email access. Continue?')) {
          return false;
        }
      }
      return true;
    },
    [assignments, sessionEmpCode]
  );

  const handleRemove = useCallback(
    (empCode: string, role: 'admin' | 'super_user') => {
      if (!confirmRemoval(empCode, role)) return;
      setAssignments(current => current.filter(item => item.empCode !== empCode));
    },
    [confirmRemoval]
  );

  const handleSetRole = useCallback(
    (empCode: string, nextRole: 'admin' | 'super_user', currentRole: 'admin' | 'super_user') => {
      if (currentRole === 'admin' && nextRole === 'super_user' && sessionEmpCode === empCode) {
        if (!confirmAction('You will lose admin access but keep Manage Email access. Continue?')) {
          return;
        }
      }
      setAssignments(current =>
        current.map(item => (item.empCode === empCode ? { ...item, role: nextRole } : item))
      );
    },
    [sessionEmpCode]
  );

  const handleAdd = useCallback((employee: EmployeeContact, role: 'admin' | 'super_user') => {
    setAssignments(current => {
      if (current.some(item => item.empCode === employee.empCode)) return current;
      return [
        ...current,
        {
          empCode: employee.empCode,
          fullNameEng: employee.fullNameEng,
          currentEmail: employee.currentEmail.toLowerCase(),
          role,
          source: 'manual',
        },
      ];
    });
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await api.admin.saveRoles(assignments);
      onSaved?.();
      onClose();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Failed to save role assignments');
    } finally {
      setSaving(false);
    }
  }, [assignments, onClose, onSaved]);

  const renderAssignmentRow = (
    item: DraftAssignment,
    options: { showPromoteToAdmin?: boolean; showDemoteToSuper?: boolean }
  ) => {
    const isSelf = Boolean(sessionEmpCode && sessionEmpCode === item.empCode);
    return (
      <div
        key={item.empCode}
        className="flex items-center gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2"
      >
        <Avatar name={item.fullNameEng || item.empCode} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-slate-800">
              {item.fullNameEng || '(No name)'}
              {isSelf && (
                <span className="ml-1.5 text-[10px] font-medium text-slate-400">(you)</span>
              )}
            </p>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
              {item.empCode}
            </span>
            {item.source.startsWith('seed_') && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                Seeded
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-slate-400">
            {item.currentEmail || 'No email'}
          </p>
        </div>
        <RoleBadge role={item.role} />
        {options.showDemoteToSuper && (
          <button
            type="button"
            title="Make super user"
            onClick={() => handleSetRole(item.empCode, 'super_user', 'admin')}
            className="flex h-7 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 text-[10px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50"
          >
            <ArrowDown size={12} />
            Super
          </button>
        )}
        {options.showPromoteToAdmin && (
          <button
            type="button"
            title="Make admin"
            onClick={() => handleSetRole(item.empCode, 'admin', 'super_user')}
            className="flex h-7 items-center gap-1 rounded-lg border border-[#007ABE]/30 bg-white px-2 text-[10px] font-semibold text-[#007ABE] transition-colors hover:bg-[#007ABE]/5"
          >
            <ArrowUp size={12} />
            Admin
          </button>
        )}
        <button
          type="button"
          title="Remove role (normal user)"
          onClick={() => handleRemove(item.empCode, item.role)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close manage admin dialog"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0.18 }}
            className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#007ABE]/[0.06] to-transparent px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#007ABE] text-white shadow-sm">
                  <Shield size={17} strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-slate-900">Manage Admin</h2>
                  <p className="text-[11px] text-slate-500">
                    Assign administrators and super users for email settings
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {error}
                </div>
              )}

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Shield size={13} className="text-[#007ABE]" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Administrators
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {admins.length}
                  </span>
                </div>
                <p className="mb-2 text-[11px] text-slate-400">
                  Administrators can open Manage Admin and Manage Email.
                </p>
                <div className="space-y-1.5">
                  {loading && admins.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-xs text-slate-400">
                      <Loader2 size={14} className="animate-spin" /> Loading…
                    </div>
                  ) : admins.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">
                      No administrators assigned — search and add below.
                    </div>
                  ) : (
                    admins.map(item => renderAssignmentRow(item, { showDemoteToSuper: true }))
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Shield size={13} className="text-indigo-500" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Super users
                  </h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {superUsers.length}
                  </span>
                </div>
                <p className="mb-2 text-[11px] text-slate-400">
                  Super users can open Manage Email only.
                </p>
                <div className="space-y-1.5">
                  {superUsers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-400">
                      No super users assigned.
                    </div>
                  ) : (
                    superUsers.map(item => renderAssignmentRow(item, { showPromoteToAdmin: true }))
                  )}
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center gap-2">
                  <Search size={13} className="text-slate-400" />
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Search employee
                  </h3>
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Type name or employee code (at least 2 characters)"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition-colors focus:border-[#007ABE] focus:ring-1 focus:ring-[#007ABE]/20"
                  />
                  {searching && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-300" />
                  )}
                </div>

                {searchQuery.trim().length >= 2 && (
                  <div className="mt-1.5 max-h-52 space-y-1 overflow-auto rounded-lg border border-slate-100 bg-slate-50/60 p-1.5">
                    {!searching && searchResults.length === 0 ? (
                      <p className="px-2 py-3 text-center text-[11px] text-slate-400">No employees found</p>
                    ) : (
                      searchResults.map(employee => {
                        const assigned = assignedEmpCodes.has(employee.empCode);
                        return (
                          <div
                            key={employee.empCode}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-2.5 py-2',
                              assigned ? 'opacity-50' : ''
                            )}
                          >
                            <Avatar name={employee.fullNameEng || employee.empCode} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-xs font-semibold text-slate-800">
                                  {employee.fullNameEng || '(No name)'}
                                </p>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                                  {employee.empCode}
                                </span>
                              </div>
                              <p className="truncate text-[11px] text-slate-400">
                                {employee.currentEmail || 'No email'}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                type="button"
                                disabled={assigned}
                                onClick={() => handleAdd(employee, 'admin')}
                                className="h-7 rounded-md border border-[#007ABE]/30 bg-white px-2 text-[10px] font-bold text-[#007ABE] transition-colors hover:bg-[#007ABE]/5 disabled:cursor-not-allowed"
                              >
                                Make admin
                              </button>
                              <button
                                type="button"
                                disabled={assigned}
                                onClick={() => handleAdd(employee, 'super_user')}
                                className="h-7 rounded-md border border-indigo-200 bg-white px-2 text-[10px] font-bold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed"
                              >
                                Make super user
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </section>
            </div>

            <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => { void handleSave(); }}
                disabled={saving || loading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#007ABE] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0069a3] disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
