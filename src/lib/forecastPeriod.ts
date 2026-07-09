const MONTH_KEY_RE = /^\d{4}-\d{2}$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isMonthPeriodKey(value: string): boolean {
  return MONTH_KEY_RE.test(value);
}

export function monthKeyFromDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatForecastPeriodForApi(date: Date, granularity: string): string {
  if (granularity === 'month') return monthKeyFromDate(date);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseForecastPeriodToDate(period: string, granularity = 'month'): Date {
  if (MONTH_KEY_RE.test(period) || granularity === 'month') {
    const [y, m] = period.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  }
  if (DATE_KEY_RE.test(period)) {
    const [y, m, d] = period.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  throw new Error(`Invalid forecast period: ${period}`);
}

export function monthKeyToFirstOfMonth(monthKey: string): Date {
  return parseForecastPeriodToDate(monthKey, 'month');
}

export function monthKeyToEndOfMonth(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0));
}

export const CURRENT_FORECAST_VERSION_NAME = 'Current Forecast';

/** First Wednesday on or after the 1st — matches legacy Excel import storage. */
export function firstWednesdayPeriod(month: string): string {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysUntilWednesday = (3 - firstDay.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + daysUntilWednesday))
    .toISOString()
    .slice(0, 10);
}

/** Granularity used when loading forecast_values rows from the API. */
export function resolveForecastListGranularity(
  versionName: string,
  forecastMode: 'month' | 'week' | 'day',
): 'month' | 'week' {
  // Current Forecast imports store first-Wednesday rows with granularity 'week'
  // even when the grid is in month view.
  if (versionName === CURRENT_FORECAST_VERSION_NAME) {
    return 'week';
  }
  return forecastMode === 'week' ? 'week' : 'month';
}

export function resolveForecastStoragePeriod(
  displayPeriod: string,
  forecastMode: 'month' | 'week' | 'day',
  versionName: string,
  currentForecastVersion = CURRENT_FORECAST_VERSION_NAME
): string {
  if (forecastMode !== 'month' || !MONTH_KEY_RE.test(displayPeriod)) {
    return displayPeriod;
  }
  if (versionName === currentForecastVersion) {
    return firstWednesdayPeriod(displayPeriod);
  }
  return displayPeriod;
}

export function toPeriodDate(value: Date | string, granularity = 'month'): Date {
  if (value instanceof Date) return value;
  return parseForecastPeriodToDate(value, granularity);
}
