import React, { RefObject, useLayoutEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type {
  ColumnFilterValue,
  ColumnFiltersState,
  CustomColumnDef,
  CustomColumnValuesMap,
  Dimension,
  PriceFormula,
  Registration,
  RegColumnKey,
} from '../../types/forecast';
import { customColumnFilterKey, PRICE_FORMULA_OPTIONS } from '../../types/forecast';
import { POLYMER_PRICING_POLICIES, normalizePricingPolicy } from '../../lib/pricingPolicy';
import { CustomColumnHeader } from './CustomColumnHeader';
import { DraggableRegColumnHeader } from './DraggableRegColumnHeader';
import {
  forecastBodyCellClass,
  forecastFooterCellClass,
  forecastHeaderCellClass,
  FORECAST_TABLE_METRICS,
  forecastTbodyRowStyle,
  forecastTfootRowStyle,
  forecastTheadRowStyle,
} from './forecastTableMetrics';
import { RegTableCell } from './RegTableCell';
import type { OrderedRegColumn } from './regTableColumns';
import { CUSTOM_COLUMN_ADD_BUTTON_WIDTH, CUSTOM_COLUMN_WIDTH } from './regTableColumns';
import type { FilterOptionsPage } from '../../lib/api';
import { getUniqueCustomColumnValues, normalizeColumnFilter } from './forecastFilterUtils';

interface FixedColumnsTableProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTop: number;
  onScroll: () => void;
  tableWidth: number;
  columns: OrderedRegColumn[];
  customColumns?: CustomColumnDef[];
  customColumnValues?: CustomColumnValuesMap;
  canManageCustomColumns?: boolean;
  onAddCustomColumn?: () => void;
  onCustomColumnValueChange?: (columnId: string, registrationId: string, value: string | null) => void;
  registrations: Registration[];
  allRegistrations: Registration[];
  columnFilters: ColumnFiltersState;
  onColumnFilterChange: (key: string, value: ColumnFilterValue) => void;
  draggedColumnKey: RegColumnKey | null;
  dragOverColumnKey: RegColumnKey | null;
  onDragStart: (key: RegColumnKey) => void;
  onDragEnd: () => void;
  onDragOver: (key: RegColumnKey) => void;
  onDragLeave: () => void;
  onColumnDrop: (key: RegColumnKey) => void;
  selectedDimension: Dimension;
  formulaMap: Map<string, PriceFormula>;
  onFormulaChange: (regId: string, formula: PriceFormula) => void;
  pricingPolicyMap?: Map<string, string | null>;
  onPricingPolicyChange?: (regId: string, pricingPolicy: string | null) => void;
  spreadMap: Map<string, string>;
  onSpreadChange: (regId: string, spread: string | null) => void;
  onSpreadCommit: (regId: string, spread: string | null) => void;
  formulaFilter: ColumnFilterValue;
  onFormulaFilterChange: (v: ColumnFilterValue) => void;
  loadFilterOptions: (
    columnKey: string,
    search: string,
    cursor?: string | null
  ) => Promise<FilterOptionsPage>;
}

export function FixedColumnsTable({
  scrollRef,
  scrollTop,
  onScroll,
  tableWidth,
  columns,
  customColumns = [],
  customColumnValues,
  canManageCustomColumns = false,
  onAddCustomColumn,
  onCustomColumnValueChange,
  registrations,
  allRegistrations,
  columnFilters,
  onColumnFilterChange,
  draggedColumnKey,
  dragOverColumnKey,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onColumnDrop,
  selectedDimension,
  formulaMap,
  onFormulaChange,
  pricingPolicyMap,
  onPricingPolicyChange,
  spreadMap,
  onSpreadChange,
  onSpreadCommit,
  formulaFilter,
  onFormulaFilterChange,
  loadFilterOptions,
}: FixedColumnsTableProps) {
  const [viewportHeight, setViewportHeight] = useState(600);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef]);

  const ROW_HEIGHT = FORECAST_TABLE_METRICS.bodyRowHeight;
  const OVERSCAN = 2;
  const maxScrollTop = Math.max(0, registrations.length * ROW_HEIGHT - viewportHeight);
  const clampedScrollTop = Math.min(scrollTop, maxScrollTop);
  const visibleStart = Math.max(0, Math.floor(clampedScrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleEnd = Math.min(registrations.length, Math.ceil((clampedScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRegistrations = registrations.slice(visibleStart, visibleEnd);
  const topSpacerHeight = visibleStart * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (registrations.length - visibleEnd) * ROW_HEIGHT);
  const totalColumnCount = columns.length + customColumns.length + (canManageCustomColumns ? 1 : 0);
  const handleHorizontalScroll = () => {
    if (!scrollRef.current || !horizontalScrollRef.current) return;
    scrollRef.current.scrollLeft = horizontalScrollRef.current.scrollLeft;
  };

  return (
    <div className="relative flex flex-1 min-h-0 min-w-0 w-full flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 min-w-0 w-full forecast-reg-pane forecast-table-scroll"
      >
        <table
          className="border-collapse table-fixed"
          style={{ width: tableWidth, minWidth: tableWidth }}
        >
          <thead>
            <tr className="divide-x divide-slate-200" style={forecastTheadRowStyle}>
              {columns.map(col => (
                <React.Fragment key={col.key}>
                  <DraggableRegColumnHeader
                    column={col}
                    allRegistrations={allRegistrations}
                    columnFilters={columnFilters}
                    onColumnFilterChange={(key, value) => onColumnFilterChange(key, value)}
                    isDragging={draggedColumnKey === col.key}
                    isDragOver={dragOverColumnKey === col.key && draggedColumnKey !== col.key}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragOver={(_e, key) => onDragOver(key)}
                    onDragLeave={onDragLeave}
                    onDrop={onColumnDrop}
                    staticOptions={col.key === 'priceFormula' ? (PRICE_FORMULA_OPTIONS as unknown as string[]) : undefined}
                    overrideValue={col.key === 'priceFormula' ? formulaFilter : undefined}
                    overrideOnChange={col.key === 'priceFormula' ? onFormulaFilterChange : undefined}
                    loadFilterOptions={
                      col.key.startsWith('carry') ||
                      col.key.startsWith('inventory') ||
                      col.key === 'spread'
                        ? undefined
                        : loadFilterOptions
                    }
                  />
                </React.Fragment>
              ))}
              {customColumns.map(column => (
                <React.Fragment key={column.id}>
                  <CustomColumnHeader
                    column={column}
                    filterValue={normalizeColumnFilter(columnFilters[customColumnFilterKey(column.id)])}
                    onFilterChange={value => onColumnFilterChange(customColumnFilterKey(column.id), value)}
                    staticOptions={getUniqueCustomColumnValues(
                      allRegistrations,
                      column.id,
                      customColumnValues ?? new Map(),
                    )}
                  />
                </React.Fragment>
              ))}
              {canManageCustomColumns && (
                <th
                  style={{
                    width: CUSTOM_COLUMN_ADD_BUTTON_WIDTH,
                    minWidth: CUSTOM_COLUMN_ADD_BUTTON_WIDTH,
                    maxWidth: CUSTOM_COLUMN_ADD_BUTTON_WIDTH,
                  }}
                  className="sticky top-0 z-20 border-r border-slate-200 bg-slate-100 p-0 align-middle"
                >
                  <div className={cn(forecastHeaderCellClass, 'justify-center px-0')}>
                    <button
                      type="button"
                      onClick={onAddCustomColumn}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                      aria-label="Add custom column"
                      title="Add Column"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topSpacerHeight > 0 && (
              <tr style={{ height: topSpacerHeight }}>
                <td colSpan={totalColumnCount} />
              </tr>
            )}
            {visibleRegistrations.map(reg => (
              <tr key={reg.id} className="group" style={forecastTbodyRowStyle}>
                {columns.map(col =>
                  col.key === 'priceFormula' ? (
                    <td
                      key={col.key}
                      style={{ width: col.width, minWidth: col.width }}
                      className="p-0 border-r border-slate-100 bg-white align-middle overflow-hidden"
                    >
                      <div className={cn(forecastBodyCellClass, 'px-1.5')}>
                        {String(reg.businessUnit ?? '').toLowerCase() === 'polymer' && onPricingPolicyChange ? (
                          <select
                            value={
                              normalizePricingPolicy(
                                pricingPolicyMap?.has(reg.id)
                                  ? pricingPolicyMap.get(reg.id)
                                  : reg.pricingPolicy
                              ) ?? ''
                            }
                            onChange={e => onPricingPolicyChange(reg.id, e.target.value || null)}
                            className="sf-select w-full text-[10px] border rounded px-1 py-0.5 outline-none cursor-pointer appearance-none leading-tight"
                            title="Polymer Pricing Policy"
                          >
                            <option value="">(none)</option>
                            {POLYMER_PRICING_POLICIES.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={formulaMap.get(reg.id) ?? (PRICE_FORMULA_OPTIONS.includes(reg.priceFormula as PriceFormula) ? reg.priceFormula : 'CPL')}
                            onChange={e => onFormulaChange(reg.id, e.target.value as PriceFormula)}
                            className="sf-select w-full text-[10px] border rounded px-1 py-0.5 outline-none cursor-pointer appearance-none leading-tight"
                          >
                            {PRICE_FORMULA_OPTIONS.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                  ) : col.key === 'spread' ? (
                    <React.Fragment key={col.key}>
                      <SpreadCell
                        regId={reg.id}
                        width={col.width}
                        value={spreadMap.get(reg.id) ?? reg.spread ?? null}
                        onSpreadChange={onSpreadChange}
                        onSpreadCommit={onSpreadCommit}
                      />
                    </React.Fragment>
                  ) : (
                    <React.Fragment key={col.key}>
                      <RegTableCell reg={reg} columnKey={col.key} width={col.width} />
                    </React.Fragment>
                  )
                )}
                {customColumns.map(column =>
                  React.createElement(CustomColumnCell, {
                    key: `${reg.id}-${column.id}`,
                    column,
                    registrationId: reg.id,
                    value: customColumnValues?.get(reg.id)?.[column.id] ?? null,
                    onValueChange: onCustomColumnValueChange,
                  })
                )}
                {canManageCustomColumns && (
                  <td
                    style={{ width: CUSTOM_COLUMN_ADD_BUTTON_WIDTH, minWidth: CUSTOM_COLUMN_ADD_BUTTON_WIDTH }}
                    className="border-r border-slate-100 bg-white"
                  />
                )}
              </tr>
            ))}
            {bottomSpacerHeight > 0 && (
              <tr style={{ height: bottomSpacerHeight }}>
                <td colSpan={totalColumnCount} />
              </tr>
            )}
          </tbody>
          <tfoot className="shadow-[0_-1px_0_rgba(148,163,184,0.35)]">
            <tr style={forecastTfootRowStyle}>
              <td
                colSpan={totalColumnCount}
                className="sticky bottom-0 z-20 p-0 bg-slate-50 border-t border-slate-200 border-r border-slate-200 align-middle overflow-hidden"
              >
                <div className={forecastFooterCellClass} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="pointer-events-none absolute left-0 right-0 bottom-3 z-30 h-11 border-t border-slate-200 bg-slate-50/95 shadow-[0_-1px_0_rgba(148,163,184,0.25)]">
        <div
          className={cn(
            forecastFooterCellClass,
            'justify-center px-3 text-[11px] text-slate-700 tracking-widest'
          )}
        >
          {selectedDimension === 'Price' ? 'Weighted Avg Price' : `Monthly Aggregated ${selectedDimension}`}
        </div>
      </div>
      <div
        ref={horizontalScrollRef}
        onScroll={handleHorizontalScroll}
        className="forecast-horizontal-scrollbar"
      >
        <div style={{ width: tableWidth, height: 1 }} />
      </div>
    </div>
  );
}

function CustomColumnCell({
  column,
  registrationId,
  value,
  onValueChange,
}: {
  column: CustomColumnDef;
  registrationId: string;
  value: string | null;
  onValueChange?: (columnId: string, registrationId: string, value: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(value ?? '');
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) setDraft(value ?? '');
  }, [isFocused, value]);

  const commit = (nextValue: string | null) => {
    onValueChange?.(column.id, registrationId, nextValue);
  };

  if (column.type === 'dropdown') {
    return (
      <td
        style={{ width: CUSTOM_COLUMN_WIDTH, minWidth: CUSTOM_COLUMN_WIDTH }}
        className="border-r border-slate-100 bg-white p-0 align-middle overflow-hidden"
      >
        <div className={cn(forecastBodyCellClass, 'px-1.5')}>
          <select
            value={value ?? ''}
            onChange={event => {
              const nextValue = event.target.value.trim() || null;
              commit(nextValue);
            }}
            className="sf-select w-full cursor-pointer appearance-none rounded border px-1 py-0.5 text-[10px] leading-tight outline-none"
          >
            <option value="">—</option>
            {(column.dropdownOptions ?? []).map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </td>
    );
  }

  if (column.type === 'number') {
    return (
      <td
        style={{ width: CUSTOM_COLUMN_WIDTH, minWidth: CUSTOM_COLUMN_WIDTH }}
        className="border-r border-slate-100 bg-white p-0 align-middle overflow-hidden"
      >
        <div className={cn(forecastBodyCellClass, 'px-1.5')}>
          <input
            type="number"
            step="any"
            value={draft}
            placeholder="—"
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false);
              const trimmed = draft.trim();
              if (!trimmed) {
                setDraft('');
                commit(null);
                return;
              }
              const parsed = Number(trimmed);
              if (!Number.isFinite(parsed)) {
                setDraft(value ?? '');
                return;
              }
              commit(String(parsed));
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onChange={event => setDraft(event.target.value)}
            className="w-full rounded border border-slate-200 px-1 py-0.5 text-right font-mono text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
      </td>
    );
  }

  return (
    <td
      style={{ width: CUSTOM_COLUMN_WIDTH, minWidth: CUSTOM_COLUMN_WIDTH }}
      className="border-r border-slate-100 bg-white p-0 align-middle overflow-hidden"
    >
      <div className={cn(forecastBodyCellClass, 'px-1.5')}>
        <input
          type="text"
          value={draft}
          placeholder="—"
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            const trimmed = draft.trim();
            setDraft(trimmed);
            commit(trimmed || null);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          onChange={event => setDraft(event.target.value)}
          className="w-full rounded border border-slate-200 px-1 py-0.5 text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
      </div>
    </td>
  );
}

function SpreadCell({
  regId,
  width,
  value,
  onSpreadChange,
  onSpreadCommit,
}: Readonly<{
  regId: string;
  width: number;
  value: string | null;
  onSpreadChange: (regId: string, spread: string | null) => void;
  onSpreadCommit: (regId: string, spread: string | null) => void;
}>) {
  const displayValue = value ?? '';
  const [draft, setDraft] = React.useState(displayValue);
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) setDraft(displayValue);
  }, [displayValue, isFocused]);

  const commit = () => {
    const next = draft.trim() === '' ? null : draft.trim();
    onSpreadChange(regId, next);
    onSpreadCommit(regId, next);
  };

  return (
    <td
      style={{ width, minWidth: width }}
      className="p-0 border-r border-slate-100 bg-white align-middle overflow-hidden"
    >
      <div className={cn(forecastBodyCellClass, 'px-1.5')}>
        <input
          type="text"
          value={draft}
          title={draft}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            commit();
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
          onChange={event => setDraft(event.target.value)}
          className="w-full rounded border border-slate-200 px-1 py-0.5 text-left font-mono text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        />
      </div>
    </td>
  );
}
