import type { CPLPrice, Dimension, ForecastValue, PriceFormula, Registration, ValueType } from '../../types/forecast';
import {
  CURRENT_FORECAST_VERSION_NAME,
  firstWednesdayPeriod,
  isMonthPeriodKey,
} from '../../lib/forecastPeriod';
import { PRICE_FORMULA_OPTIONS } from '../../types/forecast';

const isDailyKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isWeekRangeKey = (value: string) => /^\d{4}-\d{2}-\d{2}\|\d{4}-\d{2}-\d{2}$/.test(value);
export const monthKey = (value: string) => {
  if (isDailyKey(value)) return value.slice(0, 7);
  if (isWeekRangeKey(value)) return value.split('|')[0].slice(0, 7);
  return value;
};

/// Builds a lookup Map so getForecastCellValue can resolve cells in O(1) instead
/// of scanning the whole forecastData array per cell. Shared by the grid and the
/// Excel export.
export function buildForecastIndex(forecastData: ForecastValue[]) {
  const index = new Map<string, ForecastValue>();
  const addAggregate = (key: string, item: ForecastValue) => {
    const current = index.get(key);
    index.set(key, {
      ...item,
      qtyAct: (current?.qtyAct ?? 0) + (item.qtyAct ?? 0),
      qtyFcst: (current?.qtyFcst ?? 0) + (item.qtyFcst ?? 0),
      amountAct: (current?.amountAct ?? 0) + (item.amountAct ?? 0),
    });
  };

  forecastData.forEach(item => {
    index.set(`${item.registrationId}|${item.version}|${item.month}`, item);
    const actualKey = `actual|${item.registrationId}|${item.month}`;
    const currentActual = index.get(actualKey);
    const hasActualData =
      item.qtyAct !== 0 ||
      (item.amountAct ?? 0) !== 0 ||
      (item.carryInETD ?? 0) !== 0 ||
      (item.carryOutETD ?? 0) !== 0 ||
      (item.carryInLoading ?? 0) !== 0 ||
      (item.carryOutLoading ?? 0) !== 0;
    if (!currentActual || hasActualData) index.set(actualKey, item);

    if (isDailyKey(item.month)) {
      addAggregate(
        `dailyMonth|${item.registrationId}|${item.version}|${item.month.slice(0, 7)}`,
        item
      );
      const monthPeriod = item.month.slice(0, 7);
      const monthMapKey = `${item.registrationId}|${item.version}|${monthPeriod}`;
      const existingMonth = index.get(monthMapKey);
      if (!existingMonth || (existingMonth.qtyFcst ?? 0) === 0) {
        index.set(monthMapKey, item);
      }
    } else if (isWeekRangeKey(item.month)) {
      const [start, end] = item.month.split('|');
      const months = new Set<string>();
      const cursor = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      let guard = 0;
      while (cursor <= endDate && guard < 366) {
        months.add(cursor.toISOString().slice(0, 7));
        // Map every day the week range covers back to this item so week-mode
        // daily cells can resolve their containing range in O(1) instead of
        // scanning the whole forecastData array per empty cell (issue #6).
        index.set(
          `weekCover|${item.registrationId}|${item.version}|${cursor.toISOString().slice(0, 10)}`,
          item
        );
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        guard += 1;
      }
      months.forEach(month => addAggregate(
        `weeklyMonth|${item.registrationId}|${item.version}|${month}`,
        item
      ));
    }
  });
  return index;
}

export function resolveRegistrationPriceFormula(
  formulaMap: Map<string, PriceFormula>,
  registration: Registration
): PriceFormula {
  const mapped = formulaMap.get(registration.id);
  if (mapped) return mapped;
  const fromRegistration = registration.priceFormula as PriceFormula;
  return PRICE_FORMULA_OPTIONS.includes(fromRegistration) ? fromRegistration : 'CPL';
}

export function resolveRegistrationSpread(
  spreadMap: Map<string, number>,
  registration: Registration,
): number {
  const mapped = spreadMap.get(registration.id);
  if (mapped !== undefined) return mapped;
  return Number(registration.spread ?? 0);
}

export function getForecastStoragePeriod(
  displayPeriod: string,
  forecastMode: 'month' | 'week' | 'day',
  versionName: string
) {
  if (forecastMode !== 'month' || !isMonthPeriodKey(displayPeriod)) {
    return displayPeriod;
  }
  if (versionName === CURRENT_FORECAST_VERSION_NAME) {
    return firstWednesdayPeriod(displayPeriod);
  }
  return displayPeriod;
}

export function getForecastCellValue(
  reg: Registration,
  month: string,
  selectedVersion: string,
  selectedDimension: Dimension,
  selectedType: ValueType,
  forecastData: ForecastValue[],
  cplPrices: CPLPrice[],
  forecastMode: 'month' | 'week' | 'day',
  planningView: 'sale' | 'accounting' | 'production',
  forecastIndex?: Map<string, ForecastValue>,
  formula?: PriceFormula,
  naphthaprices?: CPLPrice[],
  benzeneprices?: CPLPrice[],
  fixedPriceMap?: Map<string, Map<string, number>>,
  priceMaps?: {
    cpl: Map<string, number>;
    naphtha: Map<string, number>;
    benzene: Map<string, number>;
  },
  spreadMap?: Map<string, number>,
): { value: number; isEditable: boolean } {
  const directItem = forecastIndex
    ? forecastIndex.get(`${reg.id}|${selectedVersion}|${month}`)
    : forecastData.find(
        f => f.registrationId === reg.id && f.version === selectedVersion && f.month === month
      );

  const fallbackItem = isWeekRangeKey(month)
    ? (forecastIndex
        ? forecastIndex.get(`${reg.id}|${selectedVersion}|${monthKey(month)}`)
        : forecastData.find(
            f => f.registrationId === reg.id && f.version === selectedVersion && f.month === monthKey(month)
          ))
    : forecastMode === 'week' && isDailyKey(month)
      ? (forecastIndex
          ? forecastIndex.get(`weekCover|${reg.id}|${selectedVersion}|${month}`)
          : forecastData.find(f => {
              if (f.registrationId !== reg.id || f.version !== selectedVersion || !isWeekRangeKey(f.month)) return false;
              const [rangeStart, rangeEnd] = f.month.split('|');
              return month >= rangeStart && month <= rangeEnd;
            })) ?? (
          month === firstWednesdayPeriod(monthKey(month))
            ? (forecastIndex
                ? forecastIndex.get(`${reg.id}|${selectedVersion}|${monthKey(month)}`)
                : forecastData.find(
                    f =>
                      f.registrationId === reg.id &&
                      f.version === selectedVersion &&
                      f.month === monthKey(month)
                  ))
            : undefined
        )
      : undefined;

  const activeItem = directItem ?? fallbackItem;
  const actualItem = forecastIndex
    ? forecastIndex.get(`actual|${reg.id}|${month}`) ?? activeItem
    : forecastData.find(
        f =>
          f.registrationId === reg.id &&
          f.month === month &&
          (
            f.qtyAct !== 0 ||
            (f.amountAct ?? 0) !== 0 ||
            (f.carryInETD ?? 0) !== 0 ||
            (f.carryOutETD ?? 0) !== 0 ||
            (f.carryInLoading ?? 0) !== 0 ||
            (f.carryOutLoading ?? 0) !== 0
          )
      ) ?? forecastData.find(
        f => f.registrationId === reg.id && f.month === month
      ) ?? activeItem;
  let qtyAct = actualItem?.qtyAct;
  let qtyFcst = activeItem?.qtyFcst;
  const priceAct = actualItem?.priceAct ?? 0;
  let hasAggregatedDailyData = false;

  let storedPriceFcst: number | undefined;
  let storedAmountFcst: number | undefined;
  if (forecastMode === 'month' && isMonthPeriodKey(month)) {
    const storagePeriod = getForecastStoragePeriod(month, forecastMode, selectedVersion);
    const storedItem = forecastIndex
      ? forecastIndex.get(`${reg.id}|${selectedVersion}|${storagePeriod}`)
      : forecastData.find(
          f => f.registrationId === reg.id && f.version === selectedVersion && f.month === storagePeriod
        );
    if (storedItem) {
      qtyFcst = storedItem.qtyFcst;
      storedPriceFcst = storedItem.priceFcst;
      storedAmountFcst = storedItem.amountFcst;
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

  const pricingMonth = monthKey(month);
  const cpl = priceMaps?.cpl.get(pricingMonth) ?? cplPrices.find(c => c.month === pricingMonth)?.price ?? 0;
  const naphtha = priceMaps?.naphtha.get(pricingMonth) ?? (naphthaprices ?? []).find(c => c.month === pricingMonth)?.price ?? 0;
  const benzene = priceMaps?.benzene.get(pricingMonth) ?? (benzeneprices ?? []).find(c => c.month === pricingMonth)?.price ?? 0;

  const pendingFixedPrice = fixedPriceMap?.get(reg.id)?.get(pricingMonth);
  const storedFixedPrice =
    pendingFixedPrice ??
    (storedPriceFcst != null && storedPriceFcst > 0 ? storedPriceFcst : undefined) ??
    (activeItem?.priceFcst != null && activeItem.priceFcst > 0 ? activeItem.priceFcst : undefined);

  const spread = spreadMap
    ? resolveRegistrationSpread(spreadMap, reg)
    : Number(reg.spread ?? 0);

  let priceFcst: number;
  const resolvedFormula = formula ?? 'CPL';
  if (storedFixedPrice != null) {
    priceFcst = storedFixedPrice;
  } else if (resolvedFormula === 'Naphtha') {
    priceFcst = naphtha;
  } else if (resolvedFormula === 'Benzene') {
    priceFcst = benzene;
  } else if (resolvedFormula === 'Fixed Price') {
    priceFcst = cpl + spread;
  } else {
    priceFcst = cpl + spread;
  }

  const baseActValue = qtyAct ?? 0;
  const baseAmountAct = actualItem?.amountAct ?? baseActValue * priceAct;
  const baseFcstValue = qtyFcst ?? (directItem ? directItem.qtyFcst : 0);
  const carryInETD = actualItem?.carryInETD ?? 0;
  const carryOutETD = actualItem?.carryOutETD ?? 0;
  const carryInLoading = actualItem?.carryInLoading ?? 0;
  const carryOutLoading = actualItem?.carryOutLoading ?? 0;
  const actValue = (() => {
    if (planningView === 'accounting') {
      return baseActValue + carryInETD - carryOutETD;
    }
    if (planningView === 'production') {
      return baseActValue + carryInLoading - carryOutLoading;
    }
    return baseActValue;
  })();
  const fcstValue = (() => {
    if (planningView === 'accounting') {
      return baseFcstValue + carryInETD - carryOutETD;
    }
    if (planningView === 'production') {
      return baseFcstValue + carryInLoading - carryOutLoading;
    }
    return baseFcstValue;
  })();

  let value = 0;
  let isEditable = false;

  if (selectedDimension === 'Qty') {
    if (selectedType === 'Act') value = actValue;
    else if (selectedType === 'Fcst') {
      value = fcstValue;
      if (forecastMode === 'month') {
        isEditable = true;
      } else if (planningView === 'sale' && reg.sourceStatus !== 'actual_only') {
        isEditable = forecastMode === 'week' ? true : !hasAggregatedDailyData;
      } else {
        isEditable = false;
      }
    } else value = actValue - fcstValue;
  } else if (selectedDimension === 'Price') {
    if (selectedType === 'Act') value = priceAct;
    else if (selectedType === 'Fcst') {
      value = priceFcst;
      if (forecastMode === 'month') isEditable = true;
    }
    else value = priceAct - priceFcst;
  } else {
    const amtAct = planningView === 'sale'
      ? baseAmountAct
      : baseAmountAct + (actValue - baseActValue) * priceAct;
    const calculatedAmtFcst = fcstValue * priceFcst;
    const storedAmtFcst =
      storedAmountFcst != null && storedAmountFcst > 0
        ? storedAmountFcst
        : (activeItem?.amountFcst != null && activeItem.amountFcst > 0 ? activeItem.amountFcst : undefined);
    const amtFcst = storedAmtFcst ?? calculatedAmtFcst;
    if (selectedType === 'Act') value = amtAct;
    else if (selectedType === 'Fcst') {
      value = amtFcst;
      if (forecastMode === 'month') isEditable = true;
    }
    else value = amtAct - amtFcst;
  }

  return { value, isEditable };
}
