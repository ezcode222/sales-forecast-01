import { clearOverplanEvaluateCache, scheduleOverplanWarmup } from '../routes/overplan';

export function startOverplanScheduler() {
  setTimeout(() => {
    scheduleOverplanWarmup();
  }, 8_000);

  const timer = setInterval(() => {
    scheduleOverplanWarmup();
  }, 30 * 60 * 1000);
  timer.unref();
}

export function invalidateOverplanCache() {
  clearOverplanEvaluateCache();
}
