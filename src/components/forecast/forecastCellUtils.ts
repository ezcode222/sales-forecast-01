import { parseISO, endOfMonth, format } from 'date-fns';
import type { CPLPrice, Dimension, ForecastValue, Registration, ValueType } from '../../types/forecast';

const isDailyKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isWeekRangeKey = (value: string) => /^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(value);
const monthKey = (value: string) => {
  if (isDailyKey(value)) return value.slice(0, 7);
  if (isWeekRangeKey(value)) return value.split('|')[0].slice(0, 7);
  return value;
};

export function getForecastCellValue(
  reg: Registration,
  month: string,
  selectedVersion: string,
  selectedDimension: Dimension,
  selectedType: ValueType,
  forecastData: ForecastValue[],
  cplPrices: CPLPrice[],
  forecastMode: 'month' | 'week' | 'day',
  planningView: 'sale' | 'accounting' | 'production'
): { value: number; isEditable: boolean } {
  const directItem = forecastData.find(
    f => f.registrationId === reg.id && f.version === selectedVersion && f.month === month
  );

  const fallbackItem = isWeekRangeKey(month)
    ? forecastData.find(
        f => f.registrationId === reg.id && f.version === selectedVersion && f.month === monthKey(month)
      )
    : undefined;

  const activeItem = directItem ?? fallbackItem;
  let qtyAct = activeItem?.qtyAct;
  let qtyFcst = activeItem?.qtyFcst;
  const priceAct = activeItem?.priceAct ?? 1500;
  let hasAggregatedDailyData = false;

  if (forecastMode === 'month') {
    // Prefer aggregating from weekly entries if present (week is lowest editable level).
    const monthStartStr = format(parseISO(`${month}-01`), 'yyyy-MM-dd');
    const monthEndStr = format(endOfMonth(parseISO(`${month}-01`)), 'yyyy-MM-dd');

    const weeklyItems = forecastData.filter(
      f =>
        f.registrationId === reg.id &&
        f.version === selectedVersion &&
        isWeekRangeKey(f.month) &&
        // include week if it overlaps the month
        (() => {
          const [ws, we] = f.month.split('|');
          return ws <= monthEndStr && we >= monthStartStr;
        })()
    );

    if (weeklyItems.length > 0) {
      qtyAct = weeklyItems.reduce((sum, item) => sum + item.qtyAct, 0);
      qtyFcst = weeklyItems.reduce((sum, item) => sum + item.qtyFcst, 0);
      hasAggregatedDailyData = true;
    } else {
      const dailyItems = forecastData.filter(
        f =>
          f.registrationId === reg.id &&
          f.version === selectedVersion &&
          isDailyKey(f.month) &&
          f.month.startsWith(`${month}-`)
      );

      if (dailyItems.length > 0) {
        qtyAct = dailyItems.reduce((sum, item) => sum + item.qtyAct, 0);
        qtyFcst = dailyItems.reduce((sum, item) => sum + item.qtyFcst, 0);
        hasAggregatedDailyData = true;
      }
    }
  } else if (forecastMode === 'week' && isWeekRangeKey(month)) {
    const [rangeStart, rangeEnd] = month.split('|');
    const dailyItems = forecastData.filter(
      f =>
        f.registrationId === reg.id &&
        f.version === selectedVersion &&
        isDailyKey(f.month) &&
        f.month >= rangeStart &&
        f.month <= rangeEnd
    );

    if (dailyItems.length > 0) {
      qtyAct = dailyItems.reduce((sum, item) => sum + item.qtyAct, 0);
      qtyFcst = dailyItems.reduce((sum, item) => sum + item.qtyFcst, 0);
      hasAggregatedDailyData = true;
    }
  }

  const cpl = cplPrices.find(c => c.month === monthKey(month))?.price ?? 0;
  const priceFcst = cpl + reg.spread;

  const actValue = qtyAct ?? (directItem ? directItem.qtyAct : 200);
  const fcstValue = qtyFcst ?? (directItem ? directItem.qtyFcst : 0);

  let value = 0;
  let isEditable = false;

  if (selectedDimension === 'Qty') {
    if (selectedType === 'Act') value = actValue;
    else if (selectedType === 'Fcst') {
      value = fcstValue;
      if (planningView === 'sale') {
        // Week mode is the lowest editable level: allow editing weekly FCST
        isEditable = forecastMode === 'week' ? true : !hasAggregatedDailyData;
      } else {
        isEditable = false;
      }
    } else value = actValue - fcstValue;
  } else if (selectedDimension === 'Price') {
    if (selectedType === 'Act') value = priceAct;
    else if (selectedType === 'Fcst') value = priceFcst;
    else value = priceAct - priceFcst;
  } else {
    const amtAct = actValue * priceAct;
    const amtFcst = fcstValue * priceFcst;
    if (selectedType === 'Act') value = amtAct;
    else if (selectedType === 'Fcst') value = amtFcst;
    else value = amtAct - amtFcst;
  }

  return { value, isEditable };
}
