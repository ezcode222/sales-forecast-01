import React, { RefObject, useLayoutEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { cn } from '../../lib/utils';
import type {
  CPLPrice,
  Dimension,
  ForecastValue,
  Registration,
  ValueType,
} from '../../types/forecast';

const isWeekRangeKey = (value: string) => /^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(value);

const formatWeekRangeLabel = (weekKey: string) => {
  const [start, end] = weekKey.split('|');
  return `${format(parseISO(start), 'dd MMM')} - ${format(parseISO(end), 'dd MMM')}`;
};
import { getForecastCellValue } from './forecastCellUtils';
import {
  forecastBodyCellClass,
  forecastFooterCellClass,
  forecastTbodyRowStyle,
  forecastTfootRowStyle,
  forecastTheadRowStyle,
} from './forecastTableMetrics';
import { MONTH_COLUMN_WIDTH } from './regTableColumns';

interface ScrollableMonthGridProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  monthsToShow: string[];
  registrations: Registration[];
  forecastData: ForecastValue[];
  cplPrices: CPLPrice[];
  selectedVersion: string;
  selectedDimension: Dimension;
  selectedType: ValueType;
  onForecastChange: (regId: string, month: string, value: number) => void;
  forecastMode: 'month' | 'week' | 'day';
}

export function ScrollableMonthGrid({
  scrollRef,
  onScroll,
  monthsToShow,
  registrations,
  forecastData,
  cplPrices,
  selectedVersion,
  selectedDimension,
  selectedType,
  onForecastChange,
  forecastMode,
}: ScrollableMonthGridProps) {
  const [availableWidth, setAvailableWidth] = useState(0);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    setAvailableWidth(container.offsetWidth);

    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setAvailableWidth(width);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollRef]);

  const monthCount = Math.max(1, monthsToShow.length);
  const effectiveMonthWidth = Math.max(
    MONTH_COLUMN_WIDTH,
    availableWidth > 0 ? Math.floor(availableWidth / monthCount) : MONTH_COLUMN_WIDTH
  );
  const tableContentWidth = monthCount * effectiveMonthWidth;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 w-full self-stretch bg-slate-50 border-l border-slate-100">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 w-full overflow-x-auto overflow-y-auto forecast-table-scroll forecast-month-pane"
      >
        {/* min-w-full fills pane width so no white gap when few month columns */}
        <div className="min-w-full inline-block align-top min-h-full">
          <table
            className="border-collapse table-fixed"
            style={{ width: tableContentWidth }}
          >
            <thead>
              <tr style={forecastTheadRowStyle}>
                {monthsToShow.map(m => (
                  <th
                    key={m}
                    style={{ width: MONTH_COLUMN_WIDTH, minWidth: MONTH_COLUMN_WIDTH }}
                    className="sticky top-0 z-20 p-0 bg-blue-50 border-l border-blue-200 align-middle overflow-hidden"
                  >
                    <div
                      className={cn(
                        forecastBodyCellClass,
                        'justify-center text-[10px] text-blue-800 uppercase font-black'
                      )}
                    >
                      {isWeekRangeKey(m)
                        ? formatWeekRangeLabel(m)
                        : m.length === 10
                          ? m
                          : format(parseISO(`${m}-01`), "MMM''yy")}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registrations.map(reg => (
                <tr key={reg.id} className="hover:bg-slate-50/80" style={forecastTbodyRowStyle}>
                  {monthsToShow.map(m => {
                    const { value, isEditable } = getForecastCellValue(
                      reg,
                      m,
                      selectedVersion,
                      selectedDimension,
                      selectedType,
                      forecastData,
                      cplPrices,
                      forecastMode
                    );
                    return (
                      <td
                        key={m}
                        style={{ width: MONTH_COLUMN_WIDTH, minWidth: MONTH_COLUMN_WIDTH }}
                        className={cn(
                          'p-0 border-l border-slate-100 align-middle overflow-hidden',
                          isEditable ? 'bg-blue-50/40' : 'bg-white'
                        )}
                      >
                        <div
                          className={cn(
                            forecastBodyCellClass,
                            'justify-end',
                            isEditable ? 'text-slate-700' : 'text-slate-400 font-medium'
                          )}
                        >
                          {isEditable ? (
                            <input
                              type="number"
                              value={value === 0 ? '' : value}
                              onChange={e =>
                                onForecastChange(reg.id, m, Number(e.target.value))
                              }
                              className="w-full h-6 text-right font-mono font-bold bg-white border border-blue-200 rounded px-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                            />
                          ) : (
                            <span className="font-mono pr-1">{value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
              <tr style={forecastTfootRowStyle}>
                {monthsToShow.map(m => {
                  const total = registrations.reduce((sum, reg) => {
                    const { value } = getForecastCellValue(
                      reg,
                      m,
                      selectedVersion,
                      selectedDimension,
                      selectedType,
                      forecastData,
                      cplPrices,
                      forecastMode
                    );
                    return sum + value;
                  }, 0);
                  return (
                    <td
                      key={m}
                      style={{ width: MONTH_COLUMN_WIDTH, minWidth: MONTH_COLUMN_WIDTH }}
                      className="sticky bottom-0 z-20 p-0 bg-slate-900 border-l border-slate-700 align-middle overflow-hidden"
                    >
                      <div
                        className={cn(
                          forecastFooterCellClass,
                          'justify-end text-blue-400 font-mono text-sm tracking-tighter normal-case'
                        )}
                      >
                        {total.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
