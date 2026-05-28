import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Columns3, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import type {
  ColumnFilterValue,
  ColumnFiltersState,
  CPLPrice,
  Dimension,
  ForecastValue,
  Registration,
  RegColumnKey,
  ValueType,
} from '../../types/forecast';
import { ColumnReorderPanel } from './ColumnReorderPanel';
import { FixedColumnsTable } from './FixedColumnsTable';
import { ResizablePaneLayout } from './ResizablePaneLayout';
import { ScrollableMonthGrid } from './ScrollableMonthGrid';
import {
  getRegColumnsTotalWidth,
  REG_PANE_MAX_RATIO,
  REG_PANE_MIN_WIDTH,
} from './regTableColumns';
import { usePaneResize } from './usePaneResize';
import { useRegTableLayout } from './useRegTableLayout';
import { useScrollSync } from './useScrollSync';

export interface ForecastInputTableProps {
  registrations: Registration[];
  allRegistrations: Registration[];
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  monthsToShow: string[];
  forecastData: ForecastValue[];
  cplPrices: CPLPrice[];
  selectedVersion: string;
  selectedDimension: Dimension;
  selectedType: ValueType;
  onForecastChange: (regId: string, month: string, value: number) => void;
  onExport: () => void;
  forecastMode: 'month' | 'day';
}

export function ForecastInputTable({
  registrations,
  allRegistrations,
  columnFilters,
  onColumnFiltersChange,
  monthsToShow,
  forecastData,
  cplPrices,
  selectedVersion,
  selectedDimension,
  selectedType,
  onForecastChange,
  onExport,
  forecastMode,
}: ForecastInputTableProps) {
  const {
    columnOrder,
    settingsOpen,
    setSettingsOpen,
    orderedColumns,
    draggedColumnKey,
    setDraggedColumnKey,
    resetColumnOrder,
    handleColumnDrop,
    handlePanelReorder,
    columnVisibility,
    toggleColumnVisibility,
  } = useRegTableLayout();

  const visibleOrderedColumns = orderedColumns.filter(c => {
    return columnVisibility ? columnVisibility[c.key] !== false : true;
  });


  const { regPaneRef, monthPaneRef, syncFromReg, syncFromMonth } = useScrollSync();
  const [dragOverColumnKey, setDragOverColumnKey] = useState<RegColumnKey | null>(null);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [splitContainerWidth, setSplitContainerWidth] = useState(900);

  useEffect(() => {
    const el = splitContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setSplitContainerWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paneMinWidth = REG_PANE_MIN_WIDTH;
  const regContentWidth = getRegColumnsTotalWidth(visibleOrderedColumns.length);
  const paneMaxWidth = Math.max(
    regContentWidth,
    Math.floor(splitContainerWidth * REG_PANE_MAX_RATIO)
  );
  const paneInitialWidth = Math.min(
    paneMaxWidth,
    Math.max(paneMinWidth, Math.min(regContentWidth, Math.floor(splitContainerWidth * 0.38)))
  );

  const { regPaneWidth, onDividerPointerDown, isDragging } = usePaneResize({
    initialWidth: paneInitialWidth,
    minWidth: paneMinWidth,
    maxWidth: paneMaxWidth,
  });

  const setColumnFilter = useCallback(
    (key: RegColumnKey, value: ColumnFilterValue) => {
      onColumnFiltersChange(prev => ({ ...prev, [key]: value }));
    },
    [onColumnFiltersChange]
  );

  const handleDragEnd = useCallback(() => {
    setDraggedColumnKey(null);
    setDragOverColumnKey(null);
  }, [setDraggedColumnKey]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 w-full">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-100 bg-slate-50/80">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">
          Business columns ↔ · Months ↔ · drag divider to resize
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={cn(
              'flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border transition-all duration-200',
              settingsOpen
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <Columns3 size={12} />
            Column Settings
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg border bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all duration-200"
          >
            <Download size={12} />
            Export
          </button>
        </div>
      </div>

      <ColumnReorderPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        columnOrder={columnOrder}
        onReorder={handlePanelReorder}
        onReset={resetColumnOrder}
        columnVisibility={columnVisibility}
        onToggleVisibility={toggleColumnVisibility}
      />

      <ResizablePaneLayout
        splitContainerRef={splitContainerRef}
        regPaneWidth={regPaneWidth}
        isDragging={isDragging}
        onDividerPointerDown={onDividerPointerDown}
        fixedPane={
          <FixedColumnsTable
            scrollRef={regPaneRef}
            onScroll={syncFromReg}
            tableWidth={regContentWidth}
            columns={visibleOrderedColumns}
            registrations={registrations}
            allRegistrations={allRegistrations}
            columnFilters={columnFilters}
            onColumnFilterChange={setColumnFilter}
            draggedColumnKey={draggedColumnKey}
            dragOverColumnKey={dragOverColumnKey}
            onDragStart={setDraggedColumnKey}
            onDragEnd={handleDragEnd}
            onDragOver={setDragOverColumnKey}
            onDragLeave={() => setDragOverColumnKey(null)}
            onColumnDrop={handleColumnDrop}
            selectedDimension={selectedDimension}
          />
        }
        monthPane={
          <ScrollableMonthGrid
            scrollRef={monthPaneRef}
            onScroll={syncFromMonth}
            monthsToShow={monthsToShow}
            registrations={registrations}
            forecastData={forecastData}
            cplPrices={cplPrices}
            selectedVersion={selectedVersion}
            selectedDimension={selectedDimension}
            selectedType={selectedType}
            onForecastChange={onForecastChange}
            forecastMode={forecastMode}
          />
        }
      />
    </div>
  );
}
