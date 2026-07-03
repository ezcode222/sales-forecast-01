import React, { useEffect, useRef } from 'react';
import { Inbox, Loader2, LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { OverplanResultRow } from '../../lib/api';

const SCROLL_LOAD_THRESHOLD_PX = 280;
const ROW_HEIGHT_PX = 40;
const HEADER_BG = 'bg-slate-50';
const HEADER_CELL = cn(
  'sticky top-0 z-20 px-4 py-3',
  HEADER_BG,
  'border-b border-slate-200'
);
const HEADER_LEADING = cn(
  HEADER_CELL,
  'border-l-[3px] border-l-slate-50'
);

function rowAccentClass(status: OverplanResultRow['status']) {
  if (status === 'over') return 'border-l-rose-400';
  if (status === 'under') return 'border-l-amber-400';
  return 'border-l-transparent';
}

function leadingBodyCell(status: OverplanResultRow['status']) {
  return cn('border-l-[3px] px-4 py-2.5', rowAccentClass(status));
}

function formatQty(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatPct(value: number | null | undefined) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

function TableSkeleton({ colSpan }: { readonly colSpan: number }) {
  return (
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <tr key={index} className="animate-pulse">
          <td colSpan={colSpan} className="px-4 py-2.5">
            <div className="h-5 rounded bg-slate-100" style={{ width: `${68 + (index % 3) * 10}%` }} />
          </td>
        </tr>
      ))}
    </>
  );
}

export function OverplanResultsTable({
  rows,
  view,
  breachPage,
  compareLeft,
  compareRight,
  loading,
  isLoadingMore,
  hasMoreRows,
  totalRows,
  onLoadMore,
}: {
  readonly rows: OverplanResultRow[];
  readonly view: 'aggregate' | 'detail';
  readonly breachPage: 'over' | 'under';
  readonly compareLeft: string;
  readonly compareRight: string;
  readonly loading: boolean;
  readonly isLoadingMore: boolean;
  readonly hasMoreRows: boolean;
  readonly totalRows: number;
  readonly onLoadMore: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const colSpan = view === 'detail' ? 9 : 8;
  const emptyMessage = breachPage === 'over'
    ? 'No over-forecast breaches found for the selected period and thresholds.'
    : 'No under-forecast breaches found for the selected period and thresholds.';
  const showInitialSkeleton = loading && rows.length === 0;

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || loading || isLoadingMore || !hasMoreRows) return;

    const checkLoadMore = () => {
      if (pane.scrollTop <= 0) return;
      const remaining = pane.scrollHeight - pane.scrollTop - pane.clientHeight;
      if (remaining < SCROLL_LOAD_THRESHOLD_PX) {
        onLoadMore();
      }
    };

    pane.addEventListener('scroll', checkLoadMore, { passive: true });
    return () => pane.removeEventListener('scroll', checkLoadMore);
  }, [hasMoreRows, isLoadingMore, loading, onLoadMore, rows.length]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div ref={scrollRef} className="max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="min-w-[920px] w-full border-collapse text-sm">
          <thead className={HEADER_BG}>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {view === 'detail' && (
                <th className={HEADER_LEADING}>Owner</th>
              )}
              <th className={view === 'detail' ? HEADER_CELL : HEADER_LEADING}>Material</th>
              <th className={HEADER_CELL}>Description</th>
              <th className={HEADER_CELL}>Plant</th>
              <th className={HEADER_CELL}>Period</th>
              <th className={cn(HEADER_CELL, 'text-right')}>{compareLeft}</th>
              <th className={cn(HEADER_CELL, 'text-right')}>{compareRight}</th>
              <th className={cn(HEADER_CELL, 'text-right')}>Variance</th>
              <th className={cn(HEADER_CELL, 'text-right')}>% vs {compareRight}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {showInitialSkeleton && <TableSkeleton colSpan={colSpan} />}
            {!showInitialSkeleton && rows.map((row, index) => (
              <tr
                key={`${row.registrationId ?? row.materialCode}-${row.plantCode}-${row.period}-${index}`}
                className="group transition-colors hover:bg-slate-50/80"
                style={{ minHeight: ROW_HEIGHT_PX }}
              >
                {view === 'detail' && (
                  <td className={cn(leadingBodyCell(row.status), 'text-slate-700')}>
                    {row.ownerName ?? '—'}
                  </td>
                )}
                <td
                  className={cn(
                    view === 'detail'
                      ? 'px-4 py-2.5 font-mono text-xs font-semibold text-slate-800'
                      : cn(leadingBodyCell(row.status), 'font-mono text-xs font-semibold text-slate-800')
                  )}
                >
                  {row.materialCode || '—'}
                </td>
                <td
                  className="max-w-[320px] truncate px-4 py-2.5 text-slate-600"
                  title={row.materialDescription}
                >
                  {row.materialDescription || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{row.plantCode || '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{row.period}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-800">
                  {formatQty(row.leftQty)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">
                  {formatQty(row.rightQty)}
                </td>
                <td
                  className={cn(
                    'px-4 py-2.5 text-right font-mono text-xs font-semibold tabular-nums',
                    row.status === 'over' ? 'text-rose-600' : row.status === 'under' ? 'text-amber-700' : 'text-slate-700'
                  )}
                >
                  {(row.diffQty ?? 0) > 0 ? '+' : ''}{formatQty(row.diffQty)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-600">
                  {formatPct(row.pctVsRight)}
                </td>
              </tr>
            ))}
            {!showInitialSkeleton && rows.length === 0 && !loading && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center">
                  <div className="inline-flex flex-col items-center gap-2 text-slate-400">
                    <Inbox size={32} strokeWidth={1.5} />
                    <p className="max-w-md text-sm text-slate-500">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-[11px] font-medium text-slate-500">
            <LoaderCircle size={14} className="animate-spin text-[#007ABE]" />
            Loading more rows…
          </div>
        )}

        {!isLoadingMore && hasMoreRows && rows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-center text-[10px] text-slate-400">
            Showing {rows.length.toLocaleString()} of {totalRows.toLocaleString()} — scroll for more
          </div>
        )}
      </div>

      {loading && rows.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm">
            <Loader2 size={13} className="animate-spin text-[#007ABE]" />
            Refreshing…
          </div>
        </div>
      )}
    </div>
  );
}
