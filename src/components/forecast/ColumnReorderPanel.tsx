import React, { useEffect, useMemo, useState } from 'react';
import { Columns3, GripVertical, RotateCcw, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type {
  CarryDetailKey,
  CarryDetailVisibility,
  RegColumnKey,
} from '../../types/forecast';
import { ALL_REG_COLUMNS } from './regTableColumns';

const CARRY_DETAIL_OPTIONS: Array<{ key: CarryDetailKey; label: string }> = [
  { key: 'carryIn', label: 'Carry In (TON)' },
  { key: 'carryOut', label: 'Carry Out (TON)' },
  { key: 'carryTotal', label: 'Carry Total (In - Out)' },
];

const checkboxClass =
  'h-4 w-4 shrink-0 cursor-pointer rounded-md border-slate-300 text-[#007ABE] accent-[#007ABE] focus:ring-2 focus:ring-[#007ABE]/20';

export function ColumnReorderPanel({
  open,
  onClose,
  columnOrder,
  onReorder,
  onReset,
  columnVisibility,
  onToggleVisibility,
  carryDetailVisibility,
  onToggleCarryDetail,
}: {
  open: boolean;
  onClose: () => void;
  columnOrder: RegColumnKey[];
  onReorder: (dragged: RegColumnKey, target: RegColumnKey) => void;
  onReset: () => void;
  columnVisibility?: Record<RegColumnKey, boolean>;
  onToggleVisibility?: (key: RegColumnKey) => void;
  carryDetailVisibility: CarryDetailVisibility;
  onToggleCarryDetail: (key: CarryDetailKey) => void;
}) {
  const [draggedKey, setDraggedKey] = useState<RegColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<RegColumnKey | null>(null);
  const [columnSearch, setColumnSearch] = useState('');

  const orderedDefs = columnOrder
    .map(key => ALL_REG_COLUMNS.find(c => c.key === key))
    .filter(Boolean) as typeof ALL_REG_COLUMNS;
  const filteredDefs = useMemo(() => {
    const query = columnSearch.trim().toLowerCase();
    if (!query) return orderedDefs;
    return orderedDefs.filter(col =>
      col.label.toLowerCase().includes(query) ||
      col.key.toLowerCase().includes(query)
    );
  }, [columnSearch, orderedDefs]);

  useEffect(() => {
    if (!open) setColumnSearch('');
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close column settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0.12 }}
            className="absolute right-0 top-0 bottom-0 z-50 flex w-80 max-w-[92vw] flex-col overflow-hidden rounded-l-2xl border border-slate-200/80 bg-white shadow-[-8px_0_40px_rgba(15,23,42,0.12)]"
          >
            <header className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-[#007ABE]/[0.07] to-transparent px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#007ABE] text-white shadow-sm">
                    <Columns3 size={16} strokeWidth={2.25} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-slate-900">Column Settings</h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Drag to reorder · check to show
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="search"
                  value={columnSearch}
                  onChange={event => setColumnSearch(event.target.value)}
                  placeholder="Search columns..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-9 text-xs font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#007ABE]/40 focus:bg-white focus:ring-2 focus:ring-[#007ABE]/15"
                  autoFocus
                />
                {columnSearch && (
                  <button
                    type="button"
                    onClick={() => setColumnSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Clear column search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <section className="border-b border-slate-100 px-4 py-4">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Monthly carry details
                </p>
                <div className="space-y-1.5">
                  {CARRY_DETAIL_OPTIONS.map(option => (
                    <label
                      key={option.key}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all',
                        carryDetailVisibility[option.key]
                          ? 'border-[#007ABE]/25 bg-[#007ABE]/[0.06] text-slate-800'
                          : 'border-slate-200/80 bg-slate-50/50 text-slate-600 hover:border-slate-300 hover:bg-white'
                      )}
                    >
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={carryDetailVisibility[option.key]}
                        onChange={() => onToggleCarryDetail(option.key)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2.5 text-[10px] text-slate-400">Available in Month mode only</p>
              </section>

              <section className="space-y-1.5 p-3">
                {filteredDefs.map(col => {
                  const isVisible = columnVisibility ? !!columnVisibility[col.key] : true;
                  return (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={() => setDraggedKey(col.key)}
                      onDragEnd={() => {
                        setDraggedKey(null);
                        setDragOverKey(null);
                      }}
                      onDragOver={e => {
                        e.preventDefault();
                        setDragOverKey(col.key);
                      }}
                      onDrop={e => {
                        e.preventDefault();
                        if (draggedKey) onReorder(draggedKey, col.key);
                        setDraggedKey(null);
                        setDragOverKey(null);
                      }}
                      className={cn(
                        'flex cursor-grab items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-all duration-150 active:cursor-grabbing',
                        dragOverKey === col.key
                          ? 'border-[#007ABE]/40 bg-[#007ABE]/[0.08] shadow-sm'
                          : isVisible
                            ? 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                            : 'border-slate-100 bg-slate-50/60 opacity-75 hover:border-slate-200',
                        draggedKey === col.key && 'scale-[0.98] opacity-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => onToggleVisibility && onToggleVisibility(col.key)}
                        className={checkboxClass}
                        draggable={false}
                        onPointerDown={e => e.stopPropagation()}
                        aria-label={`Toggle ${col.label}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">
                        {col.label}
                      </span>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100/80 text-slate-400">
                        <GripVertical size={13} />
                      </div>
                    </div>
                  );
                })}
                {filteredDefs.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-xs text-slate-400">
                    No matching columns
                  </div>
                )}
              </section>
            </div>

            <footer className="shrink-0 border-t border-slate-100 bg-slate-50/80 p-4">
              <button
                type="button"
                onClick={onReset}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold uppercase tracking-wide text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
              >
                <RotateCcw size={12} />
                Reset column order
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
