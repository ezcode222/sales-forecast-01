import React, { RefObject, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import type {
  ColumnFilterValue,
  ColumnFiltersState,
  Dimension,
  PriceFormula,
  Registration,
  RegColumnKey,
} from '../../types/forecast';
import { PRICE_FORMULA_OPTIONS } from '../../types/forecast';
import { DraggableRegColumnHeader } from './DraggableRegColumnHeader';
import {
  forecastBodyCellClass,
  forecastFooterCellClass,
  FORECAST_TABLE_METRICS,
  forecastTbodyRowStyle,
  forecastTfootRowStyle,
  forecastTheadRowStyle,
} from './forecastTableMetrics';
import { RegTableCell } from './RegTableCell';
import type { OrderedRegColumn } from './regTableColumns';
import type { FilterOptionsPage } from '../../lib/api';

interface FixedColumnsTableProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTop: number;
  onScroll: () => void;
  tableWidth: number;
  columns: OrderedRegColumn[];
  registrations: Registration[];
  allRegistrations: Registration[];
  columnFilters: ColumnFiltersState;
  onColumnFilterChange: (key: RegColumnKey, value: ColumnFilterValue) => void;
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
  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleEnd = Math.min(registrations.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRegistrations = registrations.slice(visibleStart, visibleEnd);
  const topSpacerHeight = visibleStart * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (registrations.length - visibleEnd) * ROW_HEIGHT);
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
                    onColumnFilterChange={onColumnFilterChange}
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
                    loadFilterOptions={col.key.startsWith('carry') || col.key.startsWith('inventory') ? undefined : loadFilterOptions}
                  />
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {topSpacerHeight > 0 && (
              <tr style={{ height: topSpacerHeight }}>
                <td colSpan={columns.length} />
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
                        <select
                          value={formulaMap.get(reg.id) ?? (PRICE_FORMULA_OPTIONS.includes(reg.priceFormula as PriceFormula) ? reg.priceFormula : 'CPL')}
                          onChange={e => onFormulaChange(reg.id, e.target.value as PriceFormula)}
                          className="sf-select w-full text-[10px] border rounded px-1 py-0.5 outline-none cursor-pointer appearance-none leading-tight"
                        >
                          {PRICE_FORMULA_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  ) : (
                    <React.Fragment key={col.key}>
                      <RegTableCell reg={reg} columnKey={col.key} width={col.width} />
                    </React.Fragment>
                  )
                )}
              </tr>
            ))}
            {bottomSpacerHeight > 0 && (
              <tr style={{ height: bottomSpacerHeight }}>
                <td colSpan={columns.length} />
              </tr>
            )}
          </tbody>
          <tfoot className="shadow-[0_-1px_0_rgba(148,163,184,0.35)]">
            <tr style={forecastTfootRowStyle}>
              <td
                colSpan={columns.length}
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
