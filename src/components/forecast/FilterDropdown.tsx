import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Filter, ListFilter, LoaderCircle, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import type { ColumnFilterValue, Registration } from '../../types/forecast';
import type { FilterOptionsPage } from '../../lib/api';
import { EMPTY_COLUMN_FILTER } from '../../types/forecast';
import { dedupeFilterOptions, formatFilterOptionLabel, getUniqueColumnValues, isColumnFilterActive, normalizeFilterOptionValue } from './forecastFilterUtils';

export interface FilterDropdownProps {
  columnKey: string;
  label: string;
  registrations: Registration[];
  value: ColumnFilterValue;
  onChange: (value: ColumnFilterValue) => void;
  staticOptions?: string[];
  loadOptions?: (
    columnKey: string,
    search: string,
    cursor?: string | null
  ) => Promise<FilterOptionsPage>;
}

function stopDragPropagation(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function formatSelectionSummary(selected: string[]): string {
  const labels = selected.map(value => formatFilterOptionLabel(normalizeFilterOptionValue(value)));
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
}

export function FilterDropdown({
  columnKey,
  label,
  registrations,
  value,
  onChange,
  staticOptions,
  loadOptions,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 220 });
  const [remoteOptions, setRemoteOptions] = useState<string[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filter = value ?? EMPTY_COLUMN_FILTER;
  const active = isColumnFilterActive(filter);
  const selectedSet = useMemo(
    () => new Set(filter.selectedValues.map(normalizeFilterOptionValue)),
    [filter.selectedValues]
  );

  const allOptions = useMemo(
    () => {
      if (staticOptions) return dedupeFilterOptions(staticOptions);
      if (!loadOptions) return getUniqueColumnValues(registrations, columnKey);
      return dedupeFilterOptions([...filter.selectedValues, ...remoteOptions]);
    },
    [staticOptions, loadOptions, remoteOptions, registrations, columnKey, filter.selectedValues]
  );

  const filteredOptions = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    if (!query) return allOptions;
    return allOptions.filter(opt => opt.toLowerCase().includes(query));
  }, [allOptions, listSearch]);

  useEffect(() => {
    if (!open || staticOptions || !loadOptions) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoadingOptions(true);
      setRemoteOptions([]);
      try {
        let cursor: string | null = null;
        let hasMore = true;

        while (!cancelled && hasMore) {
          const page = await loadOptions(columnKey, listSearch.trim(), cursor);
          if (cancelled) return;

          setRemoteOptions(previous =>
            dedupeFilterOptions([...previous, ...page.items])
          );
          cursor = page.nextCursor;
          hasMore = page.hasMore && Boolean(cursor);
          if (hasMore) {
            await new Promise(resolve => window.setTimeout(resolve, 50));
          }
        }
      } catch {
        if (!cancelled) setRemoteOptions([]);
      } finally {
        if (!cancelled) setIsLoadingOptions(false);
      }
    }, listSearch ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [columnKey, listSearch, loadOptions, open, staticOptions]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.max(220, Math.min(280, rect.width));
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
      }
      setPanelPos({ top: rect.bottom + 4, left: Math.max(8, left), width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setListSearch('');
      return;
    }
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    const t = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.clearTimeout(t);
    };
  }, [open]);

  const toggleValue = (option: string) => {
    const normalized = normalizeFilterOptionValue(option);
    const next = new Set(filter.selectedValues.map(normalizeFilterOptionValue));
    if (next.has(normalized)) next.delete(normalized);
    else next.add(normalized);
    onChange({ selectedValues: Array.from(next), searchText: '' });
  };

  const selectAllVisible = () => {
    const next = new Set(filter.selectedValues.map(normalizeFilterOptionValue));
    filteredOptions.forEach(opt => next.add(normalizeFilterOptionValue(opt)));
    onChange({ selectedValues: Array.from(next), searchText: '' });
  };

  const clearFilter = () => {
    onChange({ ...EMPTY_COLUMN_FILTER });
    setListSearch('');
  };

  const summary = formatSelectionSummary(filter.selectedValues);

  const panel = open && (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      role="dialog"
      aria-label={`Filter ${label}`}
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: panelPos.width,
        zIndex: 9999,
      }}
      className="bg-white border border-slate-200 rounded-md shadow-2xl overflow-hidden"
      onPointerDown={stopDragPropagation}
      onDragStart={stopDragPropagation}
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListFilter size={11} className="text-blue-600 shrink-0" />
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 truncate">
            Filter values
          </span>
        </div>
        {active && (
          <button
            type="button"
            onClick={clearFilter}
            className="text-[8px] font-bold uppercase text-blue-600 hover:text-blue-800 shrink-0"
          >
            Reset
          </button>
        )}
      </div>
      <div className="p-2 border-b border-slate-50">
        <div className="relative">
          <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            placeholder="Search in list..."
            className="w-full pl-6 pr-7 py-1.5 text-[10px] border border-slate-200 rounded bg-white text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            onKeyDown={e => e.stopPropagation()}
          />
          {listSearch && (
            <button
              type="button"
              onClick={() => setListSearch('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded"
              aria-label="Clear search"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <div className="mt-1 flex min-h-3 items-center gap-1 text-[8px] text-slate-400">
          {isLoadingOptions && <LoaderCircle size={9} className="animate-spin text-blue-500" />}
          <span>
            {isLoadingOptions
              ? `Loading values... ${filteredOptions.length} found`
              : `${filteredOptions.length} values`}
          </span>
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto py-0.5" role="listbox" aria-multiselectable="true">
        {isLoadingOptions && filteredOptions.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-4 text-[10px] text-slate-400">
            <LoaderCircle size={12} className="animate-spin text-blue-500" />
            Searching...
          </div>
        ) : filteredOptions.length === 0 ? (
          <p className="px-3 py-3 text-[10px] text-slate-400 text-center italic">No matching values</p>
        ) : (
          filteredOptions.map((option, index) => {
            const checked = selectedSet.has(option);
            return (
              <button
                key={option ? option : `__blank__-${index}`}
                type="button"
                role="option"
                aria-selected={checked}
                onClick={() => toggleValue(option)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-left text-[10px] transition-colors duration-100',
                  checked ? 'bg-blue-50/90 text-blue-900' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span
                  className={cn(
                    'w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 transition-colors',
                    checked ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'
                  )}
                >
                  {checked && <Check size={9} className="text-white" strokeWidth={3} />}
                </span>
                <span className="truncate font-medium">{formatFilterOptionLabel(option)}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-1.5 p-2 border-t border-slate-100 bg-slate-50">
        <button
          type="button"
          onClick={selectAllVisible}
          disabled={filteredOptions.length === 0}
          className="flex-1 text-[9px] font-bold uppercase py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
        >
          Select visible
        </button>
        <button
          type="button"
          onClick={clearFilter}
          className="flex-1 text-[9px] font-bold uppercase py-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Clear all
        </button>
      </div>
    </motion.div>
  );

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col gap-0.5 min-w-0 flex-1"
      onPointerDown={stopDragPropagation}
      onDragStart={stopDragPropagation}
    >
      <span className="truncate text-[9px] font-black leading-tight text-slate-500 uppercase tracking-tight">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'w-full flex items-center gap-1 min-h-[22px] px-1.5 py-0.5 rounded border text-left transition-all duration-150',
          active
            ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-sm'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
          open && 'ring-2 ring-blue-100 border-blue-400'
        )}
      >
        <Filter size={10} className={cn('shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
        <span className="flex-1 min-w-0 truncate text-[9px] font-bold normal-case">
          {active ? (
            <span title={filter.selectedValues.join(', ')}>{summary}</span>
          ) : (
            <span className="text-slate-400 font-medium">All values</span>
          )}
        </span>
        {active && (
          <span className="shrink-0 text-[8px] font-black tabular-nums text-blue-600 bg-blue-100/80 px-1 rounded">
            {filter.selectedValues.length}
          </span>
        )}
        <ChevronDown
          size={10}
          className={cn('shrink-0 text-slate-400 transition-transform duration-150', open && 'rotate-180')}
        />
      </button>
      {globalThis.document !== undefined &&
        createPortal(
          <AnimatePresence>{panel}</AnimatePresence>,
          document.body
        )}
    </div>
  );
}
