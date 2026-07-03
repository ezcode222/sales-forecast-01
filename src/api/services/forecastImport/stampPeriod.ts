import { ALLOWED_STAMP_PERIODS, DEFAULT_STAMP_PERIOD } from './constants';

export function normalizeStampPeriod(value: unknown) {
  const stampPeriod = String(value ?? DEFAULT_STAMP_PERIOD).trim();
  return ALLOWED_STAMP_PERIODS.has(stampPeriod) ? stampPeriod : DEFAULT_STAMP_PERIOD;
}
