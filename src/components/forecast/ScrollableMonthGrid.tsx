import React, {
  RefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { format, parseISO } from 'date-fns';
import { cn } from '../../lib/utils';
import { api, type ForecastAuditChange, type ForecastCellAuditSummary } from '../../lib/api';
import type {
  CPLPrice,
  CarryDetailKey,
  CarryDetailVisibility,
  Dimension,
  ForecastValue,
  ForecastSummary,
  PriceFormula,
  Registration,
  ValueType,
} from '../../types/forecast';

const isWeekRangeKey = (value: string) => /^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(value);

const formatWeekRangeLabel = (weekKey: string) => {
  const [start, end] = weekKey.split('|');
  return `${format(parseISO(start), 'dd MMM')} - ${format(parseISO(end), 'dd MMM')}`;
};
const formatWednesdayLabel = (dateKey: string) => format(parseISO(dateKey), 'dd MMM').toUpperCase();
const formatEditableInputValue = (value: number) => (value === 0 ? '' : String(value));
const INPUT_COMMIT_DELAY_MS = 60;
const NON_NEGATIVE_NUMBER_DRAFT_RE = /^\d*\.?\d*$/;

function isAllowedEditableDraft(value: string) {
  if (value === '' || value === '.') return true;
  if (value.startsWith('-')) return false;
  if (!NON_NEGATIVE_NUMBER_DRAFT_RE.test(value)) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed >= 0 : true;
}

const parseEditableInputValue = (value: string) => {
  const parsed = value.trim() === '' ? 0 : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
};

function blockNegativeForecastKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') {
    event.preventDefault();
  }
}

type TimeoutHandle = ReturnType<typeof globalThis.setTimeout>;

function clearScheduledTimeout(timerRef: { current: TimeoutHandle | null }) {
  if (timerRef.current !== null) {
    globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function scheduleDelayedCommit(
  timerRef: { current: TimeoutHandle | null },
  nextValue: string,
  onCommit: (value: string) => void,
) {
  clearScheduledTimeout(timerRef);
  timerRef.current = globalThis.setTimeout(() => {
    timerRef.current = null;
    onCommit(nextValue);
  }, INPUT_COMMIT_DELAY_MS);
}

import { buildForecastIndex, getForecastCellValue, monthKey, resolveRegistrationPriceFormula } from './forecastCellUtils';
import {
  forecastBodyCellClass,
  forecastFooterCellClass,
  FORECAST_TABLE_METRICS,
  forecastTbodyRowStyle,
  forecastTfootRowStyle,
  forecastTheadRowStyle,
} from './forecastTableMetrics';
import { MONTH_COLUMN_WIDTH } from './regTableColumns';

interface LiveDraftValue {
  regId: string;
  month: string;
  value: number;
  baseValue: number;
}

interface LiveFooterTotalsHandle {
  setDraftValue: (draft: LiveDraftValue) => void;
}

interface ScrollableMonthGridProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollTop: number;
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
  planningView: 'sale' | 'accounting' | 'production';
  formulaMap: Map<string, PriceFormula>;
  spreadMap: Map<string, number>;
  naphthaprices: CPLPrice[];
  benzeneprices: CPLPrice[];
  fixedPriceMap: Map<string, Map<string, number>>;
  onFixedPriceChange: (regId: string, month: string, price: number) => void;
  onAmountChange: (regId: string, month: string, amount: number) => void;
  carryDetailVisibility: CarryDetailVisibility;
  forecastSummary: ForecastSummary | null;
  isForecastSummaryUpdating: boolean;
  isScopeDataLoading?: boolean;
  forecastAuditVersion: number;
}

interface CarryValues {
  carryIn: number;
  carryOut: number;
  carryTotal: number;
}

interface AuditTooltipState {
  key: string;
  registrationId: string;
  version: string;
  period: string;
  baseValue: number;
  rect: DOMRect;
  data?: ForecastCellAuditSummary;
  isLoading: boolean;
  error?: string;
  allChanges?: ForecastAuditChange[];
}

const CARRY_COLUMN_LABELS: Record<CarryDetailKey, string> = {
  carryIn: 'Carry In (TON)',
  carryOut: 'Carry Out (TON)',
  carryTotal: 'Carry Total (TON)',
};

function getCarryValues(
  registrationId: string,
  period: string,
  planningView: 'sale' | 'accounting' | 'production',
  forecastIndex: Map<string, ForecastValue>
): CarryValues {
  const actual = forecastIndex.get(`actual|${registrationId}|${period}`);
  const useLoading = planningView === 'production';
  const carryIn = useLoading
    ? actual?.carryInLoading ?? 0
    : actual?.carryInETD ?? 0;
  const carryOut = useLoading
    ? actual?.carryOutLoading ?? 0
    : actual?.carryOutETD ?? 0;
  return {
    carryIn,
    carryOut,
    carryTotal: carryIn - carryOut,
  };
}

export function ScrollableMonthGrid({
  scrollRef,
  scrollTop,
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
  planningView,
  formulaMap,
  spreadMap,
  naphthaprices,
  benzeneprices,
  fixedPriceMap,
  onFixedPriceChange,
  onAmountChange,
  carryDetailVisibility,
  forecastSummary,
  isForecastSummaryUpdating,
  isScopeDataLoading = false,
  forecastAuditVersion,
}: ScrollableMonthGridProps) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [auditTooltip, setAuditTooltip] = useState<AuditTooltipState | null>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const liveFooterTotalsRef = useRef<LiveFooterTotalsHandle>(null);
  const auditCacheRef = useRef(new Map<string, ForecastCellAuditSummary>());
  const auditHoverTimerRef = useRef<number | null>(null);
  const auditCloseTimerRef = useRef<number | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    setAvailableWidth(container.offsetWidth);
    setViewportHeight(container.clientHeight);

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.contentRect.width) setAvailableWidth(entry.contentRect.width);
      setViewportHeight(entry.target.clientHeight);
    });

    observer.observe(container);
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

  const closeAuditTooltip = useCallback(() => {
    if (auditHoverTimerRef.current !== null) {
      window.clearTimeout(auditHoverTimerRef.current);
      auditHoverTimerRef.current = null;
    }
    if (auditCloseTimerRef.current !== null) {
      window.clearTimeout(auditCloseTimerRef.current);
      auditCloseTimerRef.current = null;
    }
    auditAbortRef.current?.abort();
    auditAbortRef.current = null;
    setAuditTooltip(null);
  }, []);

  const cancelAuditTooltipClose = useCallback(() => {
    if (auditCloseTimerRef.current !== null) {
      window.clearTimeout(auditCloseTimerRef.current);
      auditCloseTimerRef.current = null;
    }
  }, []);

  const scheduleAuditTooltipClose = useCallback((delay = 90) => {
    if (auditHoverTimerRef.current !== null) {
      window.clearTimeout(auditHoverTimerRef.current);
      auditHoverTimerRef.current = null;
    }
    if (auditCloseTimerRef.current !== null) {
      window.clearTimeout(auditCloseTimerRef.current);
    }
    auditCloseTimerRef.current = window.setTimeout(() => {
      auditCloseTimerRef.current = null;
      closeAuditTooltip();
    }, delay);
  }, [closeAuditTooltip]);

  const openAuditTooltip = useCallback((
    event: React.MouseEvent,
    registrationId: string,
    period: string,
    value: number
  ) => {
    if (selectedType === 'Act' || selectedDimension !== 'Qty' || value === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const key = `${registrationId}|${selectedVersion}|${period}`;
    if (auditHoverTimerRef.current !== null) {
      window.clearTimeout(auditHoverTimerRef.current);
    }
    auditHoverTimerRef.current = window.setTimeout(() => {
      const cached = auditCacheRef.current.get(key);
      setAuditTooltip({
        key,
        registrationId,
        version: selectedVersion,
        period,
        baseValue: value,
        rect,
        data: cached,
        isLoading: !cached,
      });
      if (cached) return;

      auditAbortRef.current?.abort();
      const controller = new AbortController();
      auditAbortRef.current = controller;
      api.forecast.auditCell(registrationId, selectedVersion, period, controller.signal)
        .then(data => {
          auditCacheRef.current.set(key, data);
          if (controller.signal.aborted) return;
          setAuditTooltip(previous =>
            previous?.key === key
              ? { ...previous, data, isLoading: false }
              : previous
          );
        })
        .catch(error => {
          if (controller.signal.aborted) return;
          setAuditTooltip(previous =>
            previous?.key === key
              ? { ...previous, isLoading: false, error: 'Failed to load history' }
              : previous
          );
          console.error('[forecast audit tooltip] load failed:', error);
        });
    }, 300);
  }, [selectedDimension, selectedType, selectedVersion]);

  const showAllAuditHistory = useCallback(async () => {
    const current = auditTooltip;
    if (!current) return;
    const controller = new AbortController();
    auditAbortRef.current?.abort();
    auditAbortRef.current = controller;
    setAuditTooltip(previous => previous ? { ...previous, isLoading: true } : previous);
    try {
      const rows = await api.forecast.audit({
        registrationId: current.registrationId,
        version: current.version,
        start: current.period,
        end: current.period,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setAuditTooltip(previous =>
          previous?.key === current.key
            ? { ...previous, allChanges: rows, isLoading: false }
            : previous
        );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setAuditTooltip(previous =>
          previous?.key === current.key
            ? { ...previous, isLoading: false, error: 'Failed to load full history' }
            : previous
        );
        console.error('[forecast audit tooltip] full history failed:', error);
      }
    }
  }, [auditTooltip]);

  useEffect(() => () => {
    if (auditHoverTimerRef.current !== null) window.clearTimeout(auditHoverTimerRef.current);
    if (auditCloseTimerRef.current !== null) window.clearTimeout(auditCloseTimerRef.current);
    auditAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    auditCacheRef.current.clear();
    closeAuditTooltip();
  }, [closeAuditTooltip, forecastAuditVersion]);

  const forecastIndex = useMemo(() => buildForecastIndex(forecastData), [forecastData]);
  // Footer totals loop over every registration, so run that heavy work at a lower
  // priority. Row cells keep using the non-deferred data for instant feedback,
  // while LiveFooterTotals shows the correct value via draft deltas until the
  // deferred base recompute (below) catches up.
  const deferredForecastData = useDeferredValue(forecastData);
  const deferredForecastIndex = useMemo(
    () => buildForecastIndex(deferredForecastData),
    [deferredForecastData]
  );
  const cplPriceByMonth = useMemo(
    () => new Map(cplPrices.map(price => [price.month, price.price])),
    [cplPrices]
  );
  const naphthaPriceByMonth = useMemo(
    () => new Map(naphthaprices.map(price => [price.month, price.price])),
    [naphthaprices]
  );
  const benzenePriceByMonth = useMemo(
    () => new Map(benzeneprices.map(price => [price.month, price.price])),
    [benzeneprices]
  );

  /*
  const footerTotals = useMemo(
    () =>
      monthsToShow.map(m => {
        if (selectedDimension === 'Price') {
          // Weighted average price: sum(qty_i × price_i) / sum(qty_i)
          let totalQty = 0;
          let totalAmt = 0;
          registrations.forEach(reg => {
            const { value: qty } = getForecastCellValue(
              reg, m, selectedVersion, 'Qty', selectedType,
              deferredForecastData, cplPrices, forecastMode, planningView, deferredForecastIndex,
              resolveRegistrationPriceFormula(formulaMap, reg), naphthaprices, benzeneprices, fixedPriceMap
            );
            const { value: price } = getForecastCellValue(
              reg, m, selectedVersion, 'Price', selectedType,
              deferredForecastData, cplPrices, forecastMode, planningView, deferredForecastIndex,
              resolveRegistrationPriceFormula(formulaMap, reg), naphthaprices, benzeneprices, fixedPriceMap
            );
            totalQty += qty;
            totalAmt += qty * price;
          });
          return totalQty > 0 ? totalAmt / totalQty : 0;
        }
        return registrations.reduce((sum, reg) => {
          const { value } = getForecastCellValue(
            reg, m, selectedVersion, selectedDimension, selectedType,
            deferredForecastData, cplPrices, forecastMode, planningView, deferredForecastIndex,
            resolveRegistrationPriceFormula(formulaMap, reg), naphthaprices, benzeneprices, fixedPriceMap
          );
          return sum + value;
        }, 0);
      }),
    [registrations, deferredForecastData, deferredForecastIndex, monthsToShow, selectedVersion, selectedDimension, selectedType, cplPrices, forecastMode, planningView, formulaMap, naphthaprices, benzeneprices, fixedPriceMap]
  );
  */
  const summaryByPeriod = useMemo(
    () => new Map(forecastSummary?.periods.map(period => [period.period, period]) ?? []),
    [forecastSummary]
  );
  const localQtyFooterTotals = useMemo(
    () => monthsToShow.map(period =>
      registrations.reduce((sum, registration) => {
        const { value } = getForecastCellValue(
          registration,
          period,
          selectedVersion,
          'Qty',
          selectedType,
          deferredForecastData,
          cplPrices,
          forecastMode,
          planningView,
          deferredForecastIndex,
          resolveRegistrationPriceFormula(formulaMap, registration),
          naphthaprices,
          benzeneprices,
          fixedPriceMap,
          {
            cpl: cplPriceByMonth,
            naphtha: naphthaPriceByMonth,
            benzene: benzenePriceByMonth,
          },
          spreadMap,
        );
        return sum + value;
      }, 0)
    ),
    [
      benzenePriceByMonth,
      benzeneprices,
      cplPriceByMonth,
      cplPrices,
      fixedPriceMap,
      deferredForecastData,
      deferredForecastIndex,
      forecastMode,
      formulaMap,
      monthsToShow,
      naphthaPriceByMonth,
      naphthaprices,
      planningView,
      registrations,
      selectedType,
      selectedVersion,
      spreadMap,
    ]
  );
  const summaryFooterTotals = useMemo(
    () => monthsToShow.map((period, index) => {
      if (selectedDimension !== 'Qty') return null;
      const summary = summaryByPeriod.get(period);
      if (summary) {
        const carryNet = planningView === 'production'
          ? summary.carryInLoading - summary.carryOutLoading
          : planningView === 'accounting'
            ? summary.carryInETD - summary.carryOutETD
            : 0;
        const actual = summary.qtyAct + carryNet;
        const forecast = summary.qtyFcst + carryNet;
        if (selectedType === 'Act') return actual;
        if (selectedType === 'Act-Fcst') return actual - forecast;
        return forecast;
      }
      return localQtyFooterTotals[index] ?? 0;
    }),
    [localQtyFooterTotals, monthsToShow, planningView, selectedDimension, selectedType, summaryByPeriod]
  );
  const summaryAmountFooterTotals = useMemo(
    () => monthsToShow.map((period, index) => {
      if (selectedDimension !== 'Amount' || selectedType !== 'Fcst') return null;
      const summary = summaryByPeriod.get(period);
      if (summary) return summary.amountFcst ?? 0;
      return null;
    }),
    [monthsToShow, selectedDimension, selectedType, summaryByPeriod]
  );
  const summaryWeightedPriceFooterTotals = useMemo(
    () => monthsToShow.map(period => {
      if (selectedDimension !== 'Price' || selectedType !== 'Fcst') return null;
      const summary = summaryByPeriod.get(period);
      if (!summary || summary.qtyFcst <= 0) return null;
      return (summary.amountFcst ?? 0) / summary.qtyFcst;
    }),
    [monthsToShow, selectedDimension, selectedType, summaryByPeriod]
  );
  const calculatedFooterTotals = useMemo(
    () => monthsToShow.map((period, periodIndex) => {
      if (selectedDimension === 'Qty') {
        return summaryFooterTotals[periodIndex];
      }

      if (selectedDimension === 'Amount' && selectedType === 'Fcst') {
        const summaryAmount = summaryAmountFooterTotals[periodIndex];
        if (summaryAmount !== null) return summaryAmount;
      }

      if (selectedDimension === 'Price') {
        if (selectedType === 'Fcst') {
          const summaryWeightedPrice = summaryWeightedPriceFooterTotals[periodIndex];
          if (summaryWeightedPrice !== null) return summaryWeightedPrice;
        }

        const getWeightedAverage = (type: ValueType) => {
          let totalQty = 0;
          let weightedAmount = 0;

          registrations.forEach(registration => {
            const formula = resolveRegistrationPriceFormula(formulaMap, registration);
            const priceMaps = {
              cpl: cplPriceByMonth,
              naphtha: naphthaPriceByMonth,
              benzene: benzenePriceByMonth,
            };
            const qty = getForecastCellValue(
              registration,
              period,
              selectedVersion,
              'Qty',
              type,
              deferredForecastData,
              cplPrices,
              forecastMode,
              planningView,
              deferredForecastIndex,
              formula,
              naphthaprices,
              benzeneprices,
              fixedPriceMap,
              priceMaps,
              spreadMap,
            ).value;
            const price = getForecastCellValue(
              registration,
              period,
              selectedVersion,
              'Price',
              type,
              deferredForecastData,
              cplPrices,
              forecastMode,
              planningView,
              deferredForecastIndex,
              formula,
              naphthaprices,
              benzeneprices,
              fixedPriceMap,
              priceMaps,
              spreadMap,
            ).value;

            if (!Number.isFinite(qty) || !Number.isFinite(price) || qty === 0) return;
            totalQty += qty;
            weightedAmount += qty * price;
          });

          return totalQty === 0 ? 0 : weightedAmount / totalQty;
        };

        if (selectedType === 'Act-Fcst') {
          return getWeightedAverage('Act') - getWeightedAverage('Fcst');
        }
        return getWeightedAverage(selectedType);
      }

      return registrations.reduce((sum, registration) => {
        const formula = resolveRegistrationPriceFormula(formulaMap, registration);
        const { value } = getForecastCellValue(
          registration,
          period,
          selectedVersion,
          selectedDimension,
          selectedType,
          deferredForecastData,
          cplPrices,
          forecastMode,
          planningView,
          deferredForecastIndex,
          formula,
          naphthaprices,
          benzeneprices,
          fixedPriceMap,
          {
            cpl: cplPriceByMonth,
            naphtha: naphthaPriceByMonth,
            benzene: benzenePriceByMonth,
          },
          spreadMap,
        );
        return sum + value;
      }, 0);
    }),
    [
      benzenePriceByMonth,
      benzeneprices,
      cplPriceByMonth,
      cplPrices,
      fixedPriceMap,
      deferredForecastData,
      deferredForecastIndex,
      forecastMode,
      formulaMap,
      monthsToShow,
      naphthaPriceByMonth,
      naphthaprices,
      planningView,
      registrations,
      selectedDimension,
      selectedType,
      selectedVersion,
      spreadMap,
      summaryAmountFooterTotals,
      summaryFooterTotals,
      summaryWeightedPriceFooterTotals,
    ]
  );
  const displayFooterTotals = isScopeDataLoading
    ? monthsToShow.map(() => null)
    : calculatedFooterTotals;

  const handleLiveDraftValueChange = useCallback((draft: LiveDraftValue) => {
    liveFooterTotalsRef.current?.setDraftValue(draft);
  }, []);

  const visibleCarryColumns = useMemo(
    () => forecastMode === 'month'
      ? (Object.keys(carryDetailVisibility) as CarryDetailKey[])
          .filter(key => carryDetailVisibility[key])
      : [],
    [carryDetailVisibility, forecastMode]
  );
  const columnsPerPeriod = 1 + visibleCarryColumns.length;
  const totalColumnCount = Math.max(1, monthsToShow.length * columnsPerPeriod);
  const effectiveMonthWidth = Math.max(
    MONTH_COLUMN_WIDTH,
    availableWidth > 0 ? Math.floor(availableWidth / totalColumnCount) : MONTH_COLUMN_WIDTH
  );
  const tableContentWidth = totalColumnCount * effectiveMonthWidth;
  const carryFooterTotals = useMemo(() => {
    const totals = new Map<string, CarryValues>();
    if (visibleCarryColumns.length === 0) return totals;
    monthsToShow.forEach(period => {
      totals.set(
        period,
        registrations.reduce<CarryValues>((sum, registration) => {
          const values = getCarryValues(registration.id, period, planningView, deferredForecastIndex);
          return {
            carryIn: sum.carryIn + values.carryIn,
            carryOut: sum.carryOut + values.carryOut,
            carryTotal: sum.carryTotal + values.carryTotal,
          };
        }, { carryIn: 0, carryOut: 0, carryTotal: 0 })
      );
    });
    return totals;
  }, [deferredForecastIndex, monthsToShow, planningView, registrations, visibleCarryColumns.length]);
  const summaryCarryFooterTotals = useMemo(() => {
    const totals = new Map<string, CarryValues>();
    if (visibleCarryColumns.length === 0) return totals;
    monthsToShow.forEach(period => {
      const summary = summaryByPeriod.get(period);
      if (summary) {
        const carryIn = planningView === 'production'
          ? summary.carryInLoading
          : summary.carryInETD;
        const carryOut = planningView === 'production'
          ? summary.carryOutLoading
          : summary.carryOutETD;
        totals.set(period, {
          carryIn,
          carryOut,
          carryTotal: carryIn - carryOut,
        });
        return;
      }
      const local = carryFooterTotals.get(period);
      if (local) totals.set(period, local);
    });
    return totals;
  }, [carryFooterTotals, monthsToShow, planningView, summaryByPeriod, visibleCarryColumns.length]);

  const handleVerticalScroll = useCallback(() => {
    if (auditTooltip || auditHoverTimerRef.current !== null) closeAuditTooltip();
    onScroll();
  }, [auditTooltip, closeAuditTooltip, onScroll]);

  const handleHorizontalScroll = () => {
    if (auditTooltip || auditHoverTimerRef.current !== null) closeAuditTooltip();
    if (!scrollRef.current || !horizontalScrollRef.current) return;
    scrollRef.current.scrollLeft = horizontalScrollRef.current.scrollLeft;
  };

  const auditTooltipSyncedValue = useMemo(() => {
    if (!auditTooltip) return 0;
    const reg = registrations.find(item => item.id === auditTooltip.registrationId);
    if (!reg) return auditTooltip.baseValue;
    return getForecastCellValue(
      reg,
      auditTooltip.period,
      selectedVersion,
      selectedDimension,
      selectedType,
      forecastData,
      cplPrices,
      forecastMode,
      planningView,
      forecastIndex,
      resolveRegistrationPriceFormula(formulaMap, reg),
      naphthaprices,
      benzeneprices,
      fixedPriceMap,
      {
        cpl: cplPriceByMonth,
        naphtha: naphthaPriceByMonth,
        benzene: benzenePriceByMonth,
      },
      spreadMap,
    ).value;
  }, [
    auditTooltip,
    benzeneprices,
    cplPriceByMonth,
    cplPrices,
    fixedPriceMap,
    forecastData,
    forecastIndex,
    forecastMode,
    formulaMap,
    naphthaPriceByMonth,
    planningView,
    registrations,
    selectedDimension,
    selectedType,
    selectedVersion,
    spreadMap,
  ]);

  return (
    <div className="relative flex flex-1 flex-col min-h-0 min-w-0 w-full self-stretch bg-slate-50 border-l border-slate-100">
      {isForecastSummaryUpdating && forecastSummary && (
        <div className="pointer-events-none absolute right-3 top-2 z-40 rounded border border-blue-200 bg-white/95 px-2 py-1 text-[9px] font-bold uppercase text-blue-600 shadow-sm">
          Updating totals
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleVerticalScroll}
        className="flex-1 min-h-0 w-full forecast-table-scroll forecast-month-pane"
      >
        {/* min-w-full fills pane width so no white gap when few month columns */}
        <div className="min-w-full inline-block align-top min-h-full">
          <table
            className="border-collapse table-fixed"
            style={{ width: tableContentWidth }}
          >
            <thead>
              {visibleCarryColumns.length > 0 ? (
                <>
                  <tr style={{ height: FORECAST_TABLE_METRICS.headerHeight / 2 }}>
                    {monthsToShow.map(m => (
                      <th
                        key={m}
                        colSpan={columnsPerPeriod}
                        className="sticky top-0 z-20 border-l border-blue-200 bg-blue-50 p-0 align-middle"
                      >
                        <div className="flex h-full items-center justify-center text-[10px] font-black uppercase text-blue-800">
                          {format(parseISO(`${m}-01`), "MMM''yy")}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr style={{ height: FORECAST_TABLE_METRICS.headerHeight / 2 }}>
                    {monthsToShow.flatMap(m => [
                      <th
                        key={`${m}|value`}
                        style={{ width: effectiveMonthWidth, minWidth: effectiveMonthWidth }}
                        className="sticky top-[38px] z-20 border-l border-t border-blue-200 bg-blue-50 p-0"
                      >
                        <div className="flex h-full items-center justify-center text-[8px] font-black uppercase text-blue-700">
                          {selectedDimension} {selectedType}
                        </div>
                      </th>,
                      ...visibleCarryColumns.map(key => (
                        <th
                          key={`${m}|${key}`}
                          style={{ width: effectiveMonthWidth, minWidth: effectiveMonthWidth }}
                          className="sticky top-[38px] z-20 border-l border-t border-blue-200 bg-cyan-50 p-0"
                        >
                          <div className="flex h-full items-center justify-center px-1 text-center text-[8px] font-black uppercase text-cyan-800">
                            {CARRY_COLUMN_LABELS[key]}
                          </div>
                        </th>
                      )),
                    ])}
                  </tr>
                </>
              ) : (
                <tr style={forecastTheadRowStyle}>
                  {monthsToShow.map(m => (
                    <th
                      key={m}
                      style={{ width: effectiveMonthWidth, minWidth: effectiveMonthWidth }}
                      className="sticky top-0 z-20 p-0 bg-blue-50 border-l border-blue-200 align-middle overflow-hidden"
                    >
                      <div
                        className={cn(
                          forecastBodyCellClass,
                          'justify-center text-[10px] text-blue-800 uppercase font-black'
                        )}
                      >
                        {forecastMode === 'week' && m.length === 10
                          ? formatWednesdayLabel(m)
                          : isWeekRangeKey(m)
                            ? formatWeekRangeLabel(m)
                            : m.length === 10
                              ? m
                              : format(parseISO(`${m}-01`), "MMM''yy")}
                      </div>
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topSpacerHeight > 0 && (
                <tr style={{ height: topSpacerHeight }}>
                  <td colSpan={totalColumnCount} />
                </tr>
              )}
              {visibleRegistrations.map(reg => (
                <tr key={reg.id} style={forecastTbodyRowStyle}>
                  {monthsToShow.flatMap(m => {
                    const { value, isEditable } = getForecastCellValue(
                      reg,
                      m,
                      selectedVersion,
                      selectedDimension,
                      selectedType,
                      forecastData,
                      cplPrices,
                      forecastMode,
                      planningView,
                      forecastIndex,
                      resolveRegistrationPriceFormula(formulaMap, reg),
                      naphthaprices,
                      benzeneprices,
                      fixedPriceMap,
                      {
                        cpl: cplPriceByMonth,
                        naphtha: naphthaPriceByMonth,
                        benzene: benzenePriceByMonth,
                      },
                      spreadMap,
                    );
                    const carryValues = visibleCarryColumns.length > 0 && !isScopeDataLoading
                      ? getCarryValues(reg.id, m, planningView, forecastIndex)
                      : null;
                    const displayValue = isScopeDataLoading ? 0 : value;
                    const showCellValue = !isScopeDataLoading;
                    return [
                      <td
                        key={`${m}|value`}
                        style={{ width: effectiveMonthWidth, minWidth: effectiveMonthWidth }}
                        onMouseEnter={event => {
                          if (isScopeDataLoading) return;
                          cancelAuditTooltipClose();
                          openAuditTooltip(event, reg.id, m, displayValue);
                        }}
                        onMouseLeave={() => scheduleAuditTooltipClose()}
                        className={cn(
                          'p-0 border-l border-slate-100 align-middle overflow-hidden relative',
                          isScopeDataLoading
                            ? 'bg-slate-50/80'
                            : isEditable ? 'bg-blue-50/40' : 'bg-white'
                        )}
                      >
                        <div
                          className={cn(
                            forecastBodyCellClass,
                            'justify-end',
                            isScopeDataLoading
                              ? 'text-transparent'
                              : isEditable ? 'text-slate-700' : 'text-slate-400 font-medium'
                          )}
                        >
                          {showCellValue && isEditable ? (
                            <ForecastEditableCell
                              value={displayValue}
                              identityKey={`${reg.id}|${m}|${selectedVersion}|${selectedDimension}|${selectedType}|${planningView}`}
                              regId={reg.id}
                              month={m}
                              selectedDimension={selectedDimension}
                              onForecastChange={onForecastChange}
                              onFixedPriceChange={onFixedPriceChange}
                              onAmountChange={onAmountChange}
                              onLiveValueChange={handleLiveDraftValueChange}
                            />
                          ) : showCellValue ? (
                            <span className="font-mono pr-1">{displayValue.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                          ) : (
                            <span className="font-mono pr-1">&nbsp;</span>
                          )}
                          {showCellValue && selectedDimension === 'Qty' && selectedType !== 'Act' && displayValue !== 0 && (
                            <span className="pointer-events-none absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500/70" />
                          )}
                        </div>
                      </td>,
                      ...visibleCarryColumns.map(key => (
                        <td
                          key={`${m}|${key}`}
                          style={{ width: effectiveMonthWidth, minWidth: effectiveMonthWidth }}
                          className="border-l border-cyan-100 bg-cyan-50/30 p-0 align-middle overflow-hidden"
                        >
                          <div className={cn(forecastBodyCellClass, 'justify-end font-mono text-cyan-800')}>
                            {showCellValue
                              ? (carryValues?.[key] ?? 0).toLocaleString(undefined, {
                                  minimumFractionDigits: 3,
                                  maximumFractionDigits: 3,
                                })
                              : '\u00A0'}
                          </div>
                        </td>
                      )),
                    ];
                  })}
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
                <LiveFooterTotals
                  ref={liveFooterTotalsRef}
                  monthsToShow={monthsToShow}
                  baseTotals={displayFooterTotals}
                  liveEnabled={selectedDimension !== 'Price' && !isScopeDataLoading}
                  resetKey={`${selectedVersion}|${selectedDimension}|${selectedType}|${planningView}|${forecastMode}`}
                  visibleCarryColumns={visibleCarryColumns}
                  carryFooterTotals={summaryCarryFooterTotals}
                  columnWidth={effectiveMonthWidth}
                  isUpdating={isForecastSummaryUpdating || isScopeDataLoading}
                />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div
        ref={horizontalScrollRef}
        onScroll={handleHorizontalScroll}
        className="forecast-horizontal-scrollbar"
      >
        <div style={{ width: tableContentWidth, height: 1 }} />
      </div>
      {auditTooltip && createPortal(
        <ForecastAuditTooltip
          state={auditTooltip}
          syncedValue={auditTooltipSyncedValue}
          selectedDimension={selectedDimension}
          onForecastChange={onForecastChange}
          onLiveValueChange={handleLiveDraftValueChange}
          onClose={closeAuditTooltip}
          onCancelClose={cancelAuditTooltipClose}
          onShowAll={showAllAuditHistory}
        />,
        document.body
      )}
    </div>
  );
}

function formatAuditNumber(value: number | null) {
  return value === null
    ? '-'
    : value.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function AuditHistoryLoadingSkeleton({
  rowClassName = 'h-12 rounded-lg bg-slate-100',
  headerClassName = 'h-3 w-32 rounded bg-slate-200',
  rowCount = 3,
}: Readonly<{
  rowClassName?: string;
  headerClassName?: string;
  rowCount?: number;
}>) {
  return (
    <div className="space-y-2">
      <div className={`${headerClassName} animate-pulse`} />
      {Array.from({ length: rowCount }, (_, index) => (
        <div key={index} className={`${rowClassName} animate-pulse`} />
      ))}
    </div>
  );
}

function renderModalHistoryContent(
  isLoading: boolean,
  error: string | undefined,
  changes: ForecastAuditChange[],
) {
  if (isLoading && changes.length === 0) {
    return <AuditHistoryLoadingSkeleton />;
  }
  if (error) {
    return <div className="text-[11px] font-semibold text-rose-600">{error}</div>;
  }
  if (changes.length === 0) {
    return (
      <div className="text-[11px] font-semibold text-slate-500">
        No saved changes for this cell yet.
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {changes.map(change => (
        <div key={change.id}>
          <ForecastAuditChangeCard change={change} />
        </div>
      ))}
    </div>
  );
}

function renderTooltipPreviewSection(
  state: AuditTooltipState,
  previewChanges: ForecastAuditChange[],
  totalChanges: number,
  isFullHistoryOpen: boolean,
  onOpenFullHistory: () => void | Promise<void>,
) {
  if (state.isLoading && previewChanges.length === 0 && !state.data) {
    return (
      <AuditHistoryLoadingSkeleton
        headerClassName="h-3 w-28 rounded bg-slate-200"
        rowClassName="h-10 rounded bg-slate-100"
        rowCount={2}
      />
    );
  }
  if (state.error && !isFullHistoryOpen) {
    return <div className="text-[11px] font-semibold text-rose-600">{state.error}</div>;
  }
  if (totalChanges === 0) {
    return (
      <div className="text-[11px] font-semibold text-slate-500">
        No saved changes for this cell yet.
      </div>
    );
  }
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Total changes: <span className="text-blue-700">{totalChanges}</span>
        </div>
        <button
          type="button"
          onClick={onOpenFullHistory}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200/80 bg-white px-2.5 py-1 text-[9px] font-bold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
        >
          <span>All history</span>
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="space-y-2">
        {previewChanges.map(change => (
          <div key={change.id}>
            <ForecastAuditChangeCard change={change} />
          </div>
        ))}
      </div>
    </>
  );
}

function ForecastAuditChangeCard({ change }: Readonly<{ change: ForecastAuditChange }>) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-black text-slate-800">
          {formatAuditNumber(change.oldQtyFcst)} → {formatAuditNumber(change.newQtyFcst)}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-100">
          {change.source}
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[9px] font-semibold text-slate-400">
        <span className="truncate">{change.changedBy}</span>
        <span className="shrink-0">{formatAuditTime(change.changedAt)}</span>
      </div>
    </div>
  );
}

function ForecastAuditHistoryModal({
  state,
  changes,
  isLoading,
  error,
  onClose,
}: Readonly<{
  state: AuditTooltipState;
  changes: ForecastAuditChange[];
  isLoading: boolean;
  error?: string;
  onClose: () => void;
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const totalChanges = state.data?.totalChanges ?? changes.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-[120] m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-4 open:flex"
      aria-labelledby="forecast-audit-history-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={event => event.stopPropagation()}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-[1px]"
        aria-label="Close full forecast history"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(560px,78vh)] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/40 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                id="forecast-audit-history-title"
                className="text-[11px] font-black uppercase tracking-wider text-slate-700"
              >
                Full Forecast History
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                  {state.period}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {totalChanges} change{totalChanges === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
              aria-label="Close full forecast history"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {renderModalHistoryContent(isLoading, error, changes)}
        </div>
      </div>
    </dialog>,
    document.body
  );
}

function ForecastAuditTooltip({
  state,
  syncedValue,
  selectedDimension,
  onForecastChange,
  onLiveValueChange,
  onClose,
  onCancelClose,
  onShowAll,
}: Readonly<{
  state: AuditTooltipState;
  syncedValue: number;
  selectedDimension: Dimension;
  onForecastChange: (regId: string, month: string, value: number) => void;
  onLiveValueChange: (draft: LiveDraftValue) => void;
  onClose: () => void;
  onCancelClose: () => void;
  onShowAll: () => void | Promise<void>;
}>) {
  const [draftValue, setDraftValue] = useState(formatEditableInputValue(syncedValue));
  const [isFocused, setIsFocused] = useState(false);
  const [isFullHistoryOpen, setIsFullHistoryOpen] = useState(false);
  const commitTimerRef = useRef<TimeoutHandle | null>(null);
  const lastCommittedRef = useRef(syncedValue);

  const totalChanges = state.data?.totalChanges ?? 0;
  const previewChanges = state.data?.latestChanges ?? [];
  const fullHistoryChanges = state.allChanges ?? previewChanges;

  const handleOpenFullHistory = async () => {
    onCancelClose();
    setIsFullHistoryOpen(true);
    if (!state.allChanges) {
      await onShowAll();
    }
  };

  const handleCloseFullHistory = () => {
    setIsFullHistoryOpen(false);
  };

  useEffect(() => {
    if (!isFocused) {
      lastCommittedRef.current = syncedValue;
      setDraftValue(formatEditableInputValue(syncedValue));
    }
  }, [isFocused, syncedValue, state.key]);

  useEffect(() => () => clearScheduledTimeout(commitTimerRef), []);

  const commitValue = (nextValue: string) => {
    const parsed = parseEditableInputValue(nextValue);
    if (parsed === null || parsed === lastCommittedRef.current) return;
    lastCommittedRef.current = parsed;
    if (selectedDimension === 'Price') return;
    onForecastChange(state.registrationId, state.period, parsed);
  };

  const scheduleCommit = (nextValue: string) => {
    scheduleDelayedCommit(commitTimerRef, nextValue, commitValue);
  };

  const top = Math.min(globalThis.innerHeight - 260, Math.max(12, state.rect.top + 24));
  const left = Math.min(globalThis.innerWidth - 360, Math.max(12, state.rect.right - 340));

  return (
    <>
      <div
      className="fixed z-[90] w-[340px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      style={{ top, left }}
      onMouseEnter={onCancelClose}
      onMouseLeave={() => {
        if (!isFullHistoryOpen) onClose();
      }}
      onMouseDown={event => event.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
        <div className="min-w-0 shrink-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-700">
            Forecast History
          </div>
          <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
            {state.period}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end px-1">
          <input
            type="number"
            value={draftValue}
            onFocus={() => {
              onCancelClose();
              setIsFocused(true);
            }}
            onBlur={() => {
              clearScheduledTimeout(commitTimerRef);
              setIsFocused(false);
              commitValue(draftValue);
            }}
            onKeyDown={event => {
              blockNegativeForecastKey(event);
              if (event.key === 'Enter') {
                clearScheduledTimeout(commitTimerRef);
                commitValue(draftValue);
                event.currentTarget.blur();
              }
            }}
            onChange={event => {
              const nextValue = event.target.value;
              if (!isAllowedEditableDraft(nextValue)) return;
              setDraftValue(nextValue);
              const parsed = parseEditableInputValue(nextValue);
              if (parsed !== null) {
                onLiveValueChange({
                  regId: state.registrationId,
                  month: state.period,
                  value: parsed,
                  baseValue: state.baseValue,
                });
              }
              scheduleCommit(nextValue);
            }}
            min={0}
            className="h-7 w-full min-w-[72px] max-w-[108px] rounded border border-blue-200 bg-white px-2 text-right font-mono text-[11px] font-bold text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            aria-label={`Current forecast value for ${state.period}`}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Close forecast history"
        >
          ×
        </button>
      </div>

      <div className="max-h-[280px] overflow-auto p-3">
        {renderTooltipPreviewSection(
          state,
          previewChanges,
          totalChanges,
          isFullHistoryOpen,
          handleOpenFullHistory,
        )}
      </div>
    </div>
      {isFullHistoryOpen && (
        <ForecastAuditHistoryModal
          state={state}
          changes={fullHistoryChanges}
          isLoading={state.isLoading}
          error={state.error}
          onClose={handleCloseFullHistory}
        />
      )}
    </>
  );
}

const ForecastEditableCell = React.memo(function ForecastEditableCell({
  value,
  identityKey,
  regId,
  month,
  selectedDimension,
  onForecastChange,
  onFixedPriceChange,
  onAmountChange,
  onLiveValueChange,
}: Readonly<{
  value: number;
  identityKey: string;
  regId: string;
  month: string;
  selectedDimension: Dimension;
  onForecastChange: (regId: string, month: string, value: number) => void;
  onFixedPriceChange: (regId: string, month: string, price: number) => void;
  onAmountChange: (regId: string, month: string, amount: number) => void;
  onLiveValueChange: (draft: LiveDraftValue) => void;
}>) {
  const [draftValue, setDraftValue] = useState(formatEditableInputValue(value));
  const [isFocused, setIsFocused] = useState(false);
  const previousIdentityRef = useRef(identityKey);
  const commitTimerRef = useRef<TimeoutHandle | null>(null);
  const lastCommittedNumberRef = useRef(value);

  useEffect(() => {
    if (previousIdentityRef.current !== identityKey) {
      previousIdentityRef.current = identityKey;
      clearScheduledTimeout(commitTimerRef);
      lastCommittedNumberRef.current = value;
      setDraftValue(formatEditableInputValue(value));
      return;
    }
    if (!isFocused) {
      lastCommittedNumberRef.current = value;
      setDraftValue(formatEditableInputValue(value));
    }
  }, [identityKey, isFocused, value]);

  const commitValue = (nextValue: string) => {
    const parsed = parseEditableInputValue(nextValue);
    if (parsed === null) return;
    if (parsed === lastCommittedNumberRef.current) return;

    lastCommittedNumberRef.current = parsed;

    if (selectedDimension === 'Price') {
      onFixedPriceChange(regId, monthKey(month), parsed);
    } else if (selectedDimension === 'Amount') {
      onAmountChange(regId, month, parsed);
    } else {
      onForecastChange(regId, month, parsed);
    }
  };

  const scheduleCommit = (nextValue: string) => {
    scheduleDelayedCommit(commitTimerRef, nextValue, commitValue);
  };

  useEffect(() => () => clearScheduledTimeout(commitTimerRef), []);

  return (
    <input
      type="number"
      value={draftValue}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        clearScheduledTimeout(commitTimerRef);
        setIsFocused(false);
        commitValue(draftValue);
      }}
      onKeyDown={e => {
        blockNegativeForecastKey(e);
        if (e.key === 'Enter') {
          clearScheduledTimeout(commitTimerRef);
          commitValue(draftValue);
          e.currentTarget.blur();
        }
      }}
      onChange={e => {
        const nextValue = e.target.value;
        if (!isAllowedEditableDraft(nextValue)) return;
        setDraftValue(nextValue);
        const parsed = parseEditableInputValue(nextValue);
        if (parsed !== null) {
          onLiveValueChange({ regId, month, value: parsed, baseValue: value });
        }
        scheduleCommit(nextValue);
      }}
      min={0}
      className="w-full h-6 text-right font-mono font-bold bg-white border border-blue-200 rounded px-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
    />
  );
});

const LiveFooterTotals = React.memo(React.forwardRef<LiveFooterTotalsHandle, {
  monthsToShow: string[];
  baseTotals: Array<number | null>;
  liveEnabled: boolean;
  resetKey: string;
  visibleCarryColumns: CarryDetailKey[];
  carryFooterTotals: Map<string, CarryValues>;
  columnWidth: number;
  isUpdating: boolean;
}>(function LiveFooterTotals({
  monthsToShow,
  baseTotals,
  liveEnabled,
  resetKey,
  visibleCarryColumns,
  carryFooterTotals,
  columnWidth,
  isUpdating,
}, ref) {
  const [draftValues, setDraftValues] = useState<Record<string, LiveDraftValue>>({});

  useImperativeHandle(ref, () => ({
    setDraftValue: (draft: LiveDraftValue) => {
      if (!liveEnabled) return;
      const key = `${draft.regId}|${draft.month}`;
      setDraftValues(prev => ({
        ...prev,
        [key]: draft,
      }));
    },
  }), [liveEnabled]);

  useEffect(() => {
    setDraftValues({});
  }, [baseTotals, monthsToShow, resetKey]);

  const liveTotals = useMemo(() => {
    if (!liveEnabled) return baseTotals;

    const nextTotals = [...baseTotals];
    const monthIndex = new Map<string, number>(monthsToShow.map((month, idx) => [month, idx]));

    (Object.values(draftValues) as LiveDraftValue[]).forEach(draft => {
      const idx = monthIndex.get(draft.month);
      if (idx === undefined) return;
      if (nextTotals[idx] !== null) {
        nextTotals[idx] += draft.value - draft.baseValue;
      }
    });

    return nextTotals;
  }, [baseTotals, draftValues, liveEnabled, monthsToShow]);

  return (
    <>
      {monthsToShow.flatMap((m, idx) => [
        <td
          key={`${m}|value`}
          style={{ width: columnWidth, minWidth: columnWidth }}
          className="sticky bottom-0 z-20 p-0 bg-slate-50 border-t border-slate-200 border-l border-slate-200 align-middle overflow-hidden"
        >
          <div className={cn(forecastFooterCellClass, 'justify-end text-blue-700 font-mono text-sm tracking-tighter normal-case')}>
            {liveTotals[idx] === null ? (
              isUpdating ? (
                <span className="h-3 w-16 animate-pulse rounded bg-slate-200" />
              ) : (
                <span className="text-slate-400">N/A</span>
              )
            ) : (
              liveTotals[idx]!.toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })
            )}
          </div>
        </td>,
        ...visibleCarryColumns.map(key => (
          <td
            key={`${m}|${key}`}
            style={{ width: columnWidth, minWidth: columnWidth }}
            className="sticky bottom-0 z-20 border-l border-cyan-100 border-t border-slate-200 bg-cyan-50 p-0 align-middle overflow-hidden"
          >
            <div className={cn(forecastFooterCellClass, 'justify-end font-mono text-cyan-800 normal-case')}>
              {(carryFooterTotals.get(m)?.[key] ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}
            </div>
          </td>
        )),
      ])}
    </>
  );
}));
