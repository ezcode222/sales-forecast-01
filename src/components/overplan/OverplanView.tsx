import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  Loader2,
  ShieldAlert,
  Table2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  api,
  ApiError,
  formatApiError,
  type OverplanConfig,
  type OverplanEvaluateResponse,
  type OverplanResultRow,
} from '../../lib/api';
import { OverplanActionButtons, OverplanSettingsBar } from './OverplanSettingsBar';
import { OverplanResultsTable } from './OverplanResultsTable';
import {
  readOverplanSession,
  writeOverplanSession,
  normalizeOverplanConfig,
  normalizeOverplanResultRow,
  type OverplanSessionSnapshot,
} from './overplanSessionCache';
import {
  NotificationEmailPreviewModal,
  type EmailBatchPreview,
} from '../notifications/NotificationEmailPreviewModal';

function ignorePromise(promise: Promise<unknown>) {
  promise.catch(() => undefined);
}

const DEFAULT_CONFIG: OverplanConfig = {
  id: 'default',
  planVersionName: 'BB FY26',
  actualVsPlanEnabled: true,
  forecastVsPlanEnabled: false,
  compareLeft: 'Actual',
  compareRight: 'Current Forecast',
  aboveEnabled: true,
  belowEnabled: true,
  aboveThresholdTon: 100,
  aboveThresholdPercent: 5,
  belowThresholdTon: 100,
  belowThresholdPercent: 5,
  updatedBy: 'system',
  updatedAt: new Date().toISOString(),
};

const PAGE_SIZE = 50;

type BreachPage = 'over' | 'under';

type OverplanSummary = {
  overCount: number;
  underCount: number;
};

function MetricTile({
  icon,
  label,
  value,
  hint,
  accent,
  dimmed,
}: Readonly<{
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
  readonly accent?: 'brand' | 'rose' | 'amber' | 'slate';
  readonly dimmed?: boolean;
}>) {
  const accentStyles = {
    brand: 'text-[#007ABE] bg-[#007ABE]/8 ring-[#007ABE]/15',
    rose: 'text-rose-600 bg-rose-50 ring-rose-100',
    amber: 'text-amber-700 bg-amber-50 ring-amber-100',
    slate: 'text-slate-600 bg-slate-50 ring-slate-100',
  }[accent ?? 'slate'];

  return (
    <div className={cn('rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition-opacity', dimmed && 'opacity-75')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-500">{label}</p>
          <p className="mt-0.5 font-mono text-xl font-semibold tracking-tight text-slate-900 tabular-nums">
            {value.toLocaleString()}
          </p>
          {hint && <p className="mt-0.5 text-[10px] leading-snug text-slate-400 line-clamp-2">{hint}</p>}
        </div>
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', accentStyles)}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm animate-pulse">
      <div className="h-3 w-24 rounded bg-slate-100" />
      <div className="mt-2 h-7 w-16 rounded bg-slate-100" />
      <div className="mt-2 h-3 w-full rounded bg-slate-50" />
    </div>
  );
}

function AlertBanner({
  tone,
  children,
}: Readonly<{
  readonly tone: 'error' | 'success';
  readonly children: React.ReactNode;
}>) {
  const styles = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', styles)}>
      {tone === 'error' ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
      <p className="font-medium leading-relaxed">{children}</p>
    </div>
  );
}

const DEFAULT_START_MONTH = '2026-04';
const DEFAULT_END_MONTH = '2027-03';

function restoreSession(snapshot: OverplanSessionSnapshot) {
  return {
    config: normalizeOverplanConfig(snapshot.config),
    summary: snapshot.summary,
    generatedAt: snapshot.generatedAt,
    displayRows: snapshot.displayRows,
    totalRows: snapshot.totalRows,
    hasMoreRows: snapshot.hasMoreRows,
    page: snapshot.page,
  };
}

export function OverplanView() {
  const initialKey = {
    startMonth: DEFAULT_START_MONTH,
    endMonth: DEFAULT_END_MONTH,
    view: 'aggregate' as const,
    breachPage: 'over' as const,
  };
  const cachedSession = readOverplanSession(initialKey);
  const restored = cachedSession ? restoreSession(cachedSession) : null;

  const [config, setConfig] = useState<OverplanConfig>(restored?.config ?? DEFAULT_CONFIG);
  const [startMonth, setStartMonth] = useState(DEFAULT_START_MONTH);
  const [endMonth, setEndMonth] = useState(DEFAULT_END_MONTH);
  const [view, setView] = useState<'aggregate' | 'detail'>('aggregate');
  const [breachPage, setBreachPage] = useState<BreachPage>('over');
  const [summary, setSummary] = useState<OverplanSummary | null>(restored?.summary ?? null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(restored?.generatedAt ?? null);
  const [displayRows, setDisplayRows] = useState<OverplanResultRow[]>(restored?.displayRows ?? []);
  const [totalRows, setTotalRows] = useState(restored?.totalRows ?? 0);
  const [hasMoreRows, setHasMoreRows] = useState(restored?.hasMoreRows ?? false);
  const [page, setPage] = useState(restored?.page ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedSession);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewBatches, setEmailPreviewBatches] = useState<EmailBatchPreview[]>([]);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailSendMessage, setEmailSendMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [forecastVersions, setForecastVersions] = useState<string[]>(['Current Forecast']);
  const [activeCompareLeft, setActiveCompareLeft] = useState(restored?.config.compareLeft ?? 'Actual');
  const [activeCompareRight, setActiveCompareRight] = useState(restored?.config.compareRight ?? 'Current Forecast');

  const evaluateGenRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const pageRef = useRef(restored?.page ?? 1);
  const hasMoreRowsRef = useRef(restored?.hasMoreRows ?? false);
  const breachPageRef = useRef<BreachPage>('over');
  const prevBreachPageRef = useRef<BreachPage>('over');
  const bootstrappedRef = useRef(false);
  const configRef = useRef(config);
  const startMonthRef = useRef(startMonth);
  const endMonthRef = useRef(endMonth);
  const viewRef = useRef(view);

  useEffect(() => {
    breachPageRef.current = breachPage;
  }, [breachPage]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    hasMoreRowsRef.current = hasMoreRows;
  }, [hasMoreRows]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    startMonthRef.current = startMonth;
  }, [startMonth]);

  useEffect(() => {
    endMonthRef.current = endMonth;
  }, [endMonth]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const displayRowsRef = useRef<OverplanResultRow[]>(displayRows);

  useEffect(() => {
    displayRowsRef.current = displayRows;
  }, [displayRows]);

  const persistSession = useCallback((
    status: BreachPage,
    nextSummary: OverplanSummary,
    nextGeneratedAt: string,
    nextRows: OverplanResultRow[],
    nextTotalRows: number,
    nextHasMoreRows: boolean,
    nextPage: number
  ) => {
    writeOverplanSession({
      config: configRef.current,
      startMonth: startMonthRef.current,
      endMonth: endMonthRef.current,
      view: viewRef.current,
      breachPage: status,
      summary: nextSummary,
      generatedAt: nextGeneratedAt,
      displayRows: nextRows,
      totalRows: nextTotalRows,
      hasMoreRows: nextHasMoreRows,
      page: nextPage,
      savedAt: Date.now(),
    });
  }, []);

  const applyEvaluateResponse = useCallback((
    response: OverplanEvaluateResponse,
    status: BreachPage,
    options: { append: boolean }
  ) => {
    const expectedTotal = status === 'over'
      ? response.summary.overCount
      : response.summary.underCount;
    const filteredRows = response.rows
      .map(row => normalizeOverplanResultRow(row as OverplanResultRow & {
        actualQty?: number;
        forecastQty?: number;
        diffActForecast?: number;
        pctActForecast?: number | null;
      }))
      .filter((row): row is OverplanResultRow => row !== null && row.status === status);
    const previousRows = options.append ? displayRowsRef.current : [];
    const nextRows = options.append
      ? [
        ...previousRows,
        ...filteredRows.filter(row => !previousRows.some(existing =>
          existing.materialCode === row.materialCode
          && existing.plantCode === row.plantCode
          && existing.period === row.period
          && (existing.registrationId ?? '') === (row.registrationId ?? '')
        )),
      ]
      : filteredRows;
    const hasMore = nextRows.length < expectedTotal
      && (!options.append || nextRows.length > previousRows.length);

    setSummary(response.summary);
    setGeneratedAt(response.generatedAt);
    setActiveCompareLeft(response.compareLeft ?? configRef.current.compareLeft ?? 'Actual');
    setActiveCompareRight(response.compareRight ?? configRef.current.compareRight ?? 'Current Forecast');
    setTotalRows(expectedTotal);
    setPage(response.page);
    setHasMoreRows(hasMore);
    pageRef.current = response.page;
    hasMoreRowsRef.current = hasMore;
    setDisplayRows(nextRows);
    persistSession(
      status,
      response.summary,
      response.generatedAt,
      nextRows,
      expectedTotal,
      hasMore,
      response.page
    );
  }, [persistSession]);

  const fetchEvaluatePage = useCallback(async (
    pageNum: number,
    status: BreachPage,
    options: { append: boolean; generation: number }
  ) => {
    const response = await api.overplan.evaluate({
      startMonth,
      endMonth,
      granularity: 'month',
      compareLeft: configRef.current.compareLeft,
      compareRight: configRef.current.compareRight,
      view,
      breachOnly: true,
      status,
      page: pageNum,
      pageSize: PAGE_SIZE,
    });
    if (options.generation !== evaluateGenRef.current) return null;
    applyEvaluateResponse(response, status, { append: options.append });
    return response;
  }, [applyEvaluateResponse, endMonth, startMonth, view]);

  const refreshEvaluate = useCallback(async (options: {
    status: BreachPage;
    hardReset?: boolean;
    generation?: number;
  }) => {
    const generation = options.generation ?? evaluateGenRef.current;
    const status = options.status;
    const hardReset = options.hardReset ?? false;

    if (hardReset) {
      setDisplayRows([]);
      setHasMoreRows(false);
      setPage(1);
      pageRef.current = 1;
      hasMoreRowsRef.current = false;
    }

    // Do not reload getConfig here — it overwrites unsaved compareLeft/Right
    // (e.g. BB FY26 vs Current Forecast) with DB defaults (Actual vs Current Forecast).
    const response = await api.overplan.evaluate({
      startMonth: startMonthRef.current,
      endMonth: endMonthRef.current,
      granularity: 'month',
      compareLeft: configRef.current.compareLeft,
      compareRight: configRef.current.compareRight,
      view: viewRef.current,
      breachOnly: true,
      status,
      page: 1,
      pageSize: PAGE_SIZE,
    });

    if (generation !== evaluateGenRef.current) return null;
    applyEvaluateResponse(response, status, { append: false });
    return response;
  }, [applyEvaluateResponse]);

  const runEvaluate = useCallback(async () => {
    evaluateGenRef.current += 1;
    const generation = evaluateGenRef.current;
    const status = breachPageRef.current;
    isLoadingMoreRef.current = false;
    setRunning(true);
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      await refreshEvaluate({ status, hardReset: true, generation });
    } catch (error) {
      if (generation === evaluateGenRef.current) {
        setError(error instanceof ApiError ? error.message : 'Failed to run overplan check');
      }
    } finally {
      if (generation === evaluateGenRef.current) {
        setRunning(false);
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [refreshEvaluate]);

  const loadMoreRows = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMoreRowsRef.current || running || refreshing) return;

    const generation = evaluateGenRef.current;
    const status = breachPageRef.current;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      await fetchEvaluatePage(pageRef.current + 1, status, {
        append: true,
        generation,
      });
    } catch (error) {
      if (generation === evaluateGenRef.current && !isLoadingMoreRef.current) {
        setError(error instanceof ApiError ? error.message : 'Failed to load more rows');
      }
    } finally {
      isLoadingMoreRef.current = false;
      if (generation === evaluateGenRef.current) {
        setIsLoadingMore(false);
      }
    }
  }, [fetchEvaluatePage, refreshing, running]);

  const reloadBreachPage = useCallback(async (status: BreachPage) => {
    const cached = readOverplanSession({
      startMonth: startMonthRef.current,
      endMonth: endMonthRef.current,
      view: viewRef.current,
      breachPage: status,
    });
    if (cached) {
      const restoredPage = restoreSession(cached);
      setSummary(restoredPage.summary);
      setGeneratedAt(restoredPage.generatedAt);
      setDisplayRows(restoredPage.displayRows);
      setTotalRows(restoredPage.totalRows);
      setHasMoreRows(restoredPage.hasMoreRows);
      setPage(restoredPage.page);
      pageRef.current = restoredPage.page;
      hasMoreRowsRef.current = restoredPage.hasMoreRows;
    }

    evaluateGenRef.current += 1;
    const generation = evaluateGenRef.current;
    isLoadingMoreRef.current = false;
    setRefreshing(true);
    try {
      await refreshEvaluate({ status, hardReset: !cached, generation });
    } catch (error) {
      if (generation === evaluateGenRef.current) {
        setError(error instanceof ApiError ? error.message : 'Failed to load breach rows');
      }
    } finally {
      if (generation === evaluateGenRef.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [refreshEvaluate]);

  const prevViewRef = useRef(view);

  useEffect(() => {
    let cancelled = false;
    ignorePromise(api.versions.list().then(versions => {
      if (!cancelled && versions.length > 0) setForecastVersions(versions);
    }).catch(() => {
      // Keep fallback list when versions API is unavailable.
    }));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      evaluateGenRef.current += 1;
      const generation = evaluateGenRef.current;
      if (!cachedSession) setLoading(true);
      setRefreshing(Boolean(cachedSession));
      try {
        // Load saved settings once on mount only (not on every refresh/run).
        if (!cachedSession) {
          const loadedConfig = await api.overplan.getConfig();
          if (cancelled || generation !== evaluateGenRef.current) return;
          const normalized = normalizeOverplanConfig(loadedConfig);
          setConfig(normalized);
          configRef.current = normalized;
          setActiveCompareLeft(normalized.compareLeft ?? 'Actual');
          setActiveCompareRight(normalized.compareRight ?? 'Current Forecast');
        }
        await refreshEvaluate({
          status: breachPageRef.current,
          hardReset: !cachedSession,
          generation,
        });
      } catch (error) {
        if (!cancelled && generation === evaluateGenRef.current) {
          setError(formatApiError(error, 'Failed to load overplan data'));
        }
      } finally {
        if (!cancelled && generation === evaluateGenRef.current) {
          setLoading(false);
          setRefreshing(false);
          bootstrappedRef.current = true;
          prevBreachPageRef.current = breachPageRef.current;
          prevViewRef.current = viewRef.current;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount once — component stays mounted across tab switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (prevBreachPageRef.current === breachPage) return;
    prevBreachPageRef.current = breachPage;
    ignorePromise(reloadBreachPage(breachPage));
  }, [breachPage, reloadBreachPage]);

  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    ignorePromise(runEvaluate());
  }, [view, runEvaluate]);

  const handleSaveConfig = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      const saved = await api.overplan.saveConfig({
        compareLeft: config.compareLeft,
        compareRight: config.compareRight,
        aboveEnabled: config.aboveEnabled,
        belowEnabled: config.belowEnabled,
        aboveThresholdTon: config.aboveThresholdTon,
        aboveThresholdPercent: config.aboveThresholdPercent,
        belowThresholdTon: config.belowThresholdTon,
        belowThresholdPercent: config.belowThresholdPercent,
      });
      setConfig(saved);
      setNotice('Diff plan settings saved successfully.');
      await runEvaluate();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Failed to save overplan settings');
    } finally {
      setSaving(false);
    }
  }, [config, runEvaluate]);

  const handlePreviewOverplanEmail = useCallback(async () => {
    try {
      setNotifying(true);
      setEmailPreviewLoading(true);
      setEmailPreviewOpen(true);
      setError(null);
      const response = await api.overplan.previewNotify({
        startMonth,
        endMonth,
        granularity: 'month',
        compareLeft: config.compareLeft,
        compareRight: config.compareRight,
      });
      setEmailPreviewBatches(response.batches);
    } catch (error) {
      setEmailPreviewOpen(false);
      setError(formatApiError(error, 'Failed to preview overplan email'));
    } finally {
      setNotifying(false);
      setEmailPreviewLoading(false);
    }
  }, [config.compareLeft, config.compareRight, endMonth, startMonth]);

  const handleSendOverplanEmail = useCallback(async () => {
    try {
      setEmailSending(true);
      setEmailSendMessage(null);
      const result = await api.overplan.notify({
        startMonth,
        endMonth,
        granularity: 'month',
        compareLeft: config.compareLeft,
        compareRight: config.compareRight,
      });
      if (result.sent > 0) {
        const message = `Sent ${result.sent} email${result.sent === 1 ? '' : 's'} successfully.`;
        setEmailSendMessage({ tone: 'success', text: message });
        setNotice(message);
      } else if (result.skipped === 'email_disabled') {
        setEmailSendMessage({
          tone: 'error',
          text: 'Email sending is disabled on the server (OVERPLAN_EMAIL_ENABLED).',
        });
      } else {
        setEmailSendMessage({
          tone: 'error',
          text: 'No emails sent — check Manage Email recipients and breach data.',
        });
      }
    } catch (error) {
      setEmailSendMessage({
        tone: 'error',
        text: formatApiError(error, 'Failed to send email'),
      });
    } finally {
      setEmailSending(false);
    }
  }, [config.compareLeft, config.compareRight, endMonth, startMonth]);

  const overCount = summary?.overCount ?? 0;
  const underCount = summary?.underCount ?? 0;
  const periodLabel = `${startMonth} → ${endMonth}`;
  const comparePairLabel = `${activeCompareLeft} vs ${activeCompareRight}`;
  const showSummary = summary !== null;
  const tableLoading = (loading || running) && displayRows.length === 0;
  const metricsDimmed = refreshing && !tableLoading;
  const recordsLoading = running || refreshing || tableLoading;
  const compareInvalid = config.compareLeft === config.compareRight;

  const breachRowsStatus = (() => {
    if (recordsLoading && displayRows.length === 0) {
      return {
        label: 'Loading breach rows',
        detail: 'Fetching results from server…',
        spinning: true,
      };
    }
    if (isLoadingMore) {
      return {
        label: 'Breach rows loaded',
        detail: `${displayRows.length.toLocaleString()} / ${totalRows.toLocaleString()} shown — loading more…`,
        spinning: true,
      };
    }
    if (hasMoreRows) {
      return {
        label: 'Breach rows loaded',
        detail: `${displayRows.length.toLocaleString()} / ${totalRows.toLocaleString()} shown — scroll table for more`,
        spinning: false,
      };
    }
    return {
      label: 'Breach rows loaded',
      detail: totalRows > 0
        ? `${displayRows.length.toLocaleString()} / ${totalRows.toLocaleString()} breach rows`
        : 'No breach rows for this check',
      spinning: false,
    };
  })();

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f4f7fb]">
      <header className="relative shrink-0 overflow-hidden border-b border-slate-200/80 bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-[#007ABE]/[0.06] via-transparent to-slate-50" />
        <div className="relative flex flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#007ABE] text-white shadow-sm">
            <ShieldAlert size={16} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold tracking-tight text-slate-900">
              Diff Plan Monitor
            </h1>
            <p className="text-[11px] text-slate-500">
              Compare Actual or any forecast version — threshold breach review
            </p>
            <p className="text-[10px] text-slate-400">
              Current pair: <span className="font-medium text-slate-500">{comparePairLabel}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <OverplanActionButtons
              saving={saving}
              running={running}
              notifying={notifying}
              compareInvalid={compareInvalid}
              onSave={() => { ignorePromise(handleSaveConfig()); }}
              onRun={() => { ignorePromise(runEvaluate()); }}
              onPreviewEmail={() => { ignorePromise(handlePreviewOverplanEmail()); }}
            />
            {generatedAt && (
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
                <Activity size={13} className={cn(refreshing ? 'animate-pulse text-amber-500' : 'text-emerald-500')} />
                {refreshing ? 'Refreshing…' : `Last checked ${new Date(generatedAt).toLocaleString()}`}
              </div>
            )}
          </div>
        </div>
      </header>

      <OverplanSettingsBar
        config={config}
        forecastVersions={forecastVersions}
        startMonth={startMonth}
        endMonth={endMonth}
        onConfigChange={patch => {
          setConfig(current => {
            const next = { ...current, ...patch };
            configRef.current = next;
            return next;
          });
          // Prefetch so Run hits warm qty/eval cache after switching versions.
          if (patch.compareLeft !== undefined || patch.compareRight !== undefined) {
            window.setTimeout(() => {
              evaluateGenRef.current += 1;
              const generation = evaluateGenRef.current;
              setRefreshing(true);
              ignorePromise(
                refreshEvaluate({
                  status: breachPageRef.current,
                  hardReset: false,
                  generation,
                }).finally(() => {
                  if (generation === evaluateGenRef.current) {
                    setRefreshing(false);
                    setLoading(false);
                  }
                })
              );
            }, 150);
          }
        }}
        onStartMonthChange={setStartMonth}
        onEndMonthChange={setEndMonth}
      />

      <NotificationEmailPreviewModal
        open={emailPreviewOpen}
        batches={emailPreviewBatches}
        loading={emailPreviewLoading}
        sending={emailSending}
        sendMessage={emailSendMessage}
        onSend={() => { ignorePromise(handleSendOverplanEmail()); }}
        onClose={() => {
          setEmailPreviewOpen(false);
          setEmailSendMessage(null);
        }}
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
        {error && <AlertBanner tone="error">{error}</AlertBanner>}
        {notice && <AlertBanner tone="success">{notice}</AlertBanner>}

        {!showSummary && tableLoading && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)}
          </div>
        )}

        {showSummary && (
          <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', metricsDimmed && 'opacity-90')}>
            <MetricTile
              icon={<TrendingUp size={18} />}
              label="Over forecast breaches"
              value={overCount}
              hint={`${activeCompareLeft} exceeds ${activeCompareRight} beyond threshold`}
              accent="rose"
              dimmed={metricsDimmed}
            />
            <MetricTile
              icon={<TrendingDown size={18} />}
              label="Under forecast breaches"
              value={underCount}
              hint={`${activeCompareLeft} falls below ${activeCompareRight} beyond threshold`}
              accent="amber"
              dimmed={metricsDimmed}
            />
            <MetricTile
              icon={<Table2 size={18} />}
              label="Rows loaded"
              value={displayRows.length}
              hint={hasMoreRows
                ? `${displayRows.length.toLocaleString()} of ${totalRows.toLocaleString()} shown — scroll for more`
                : `All ${totalRows.toLocaleString()} ${breachPage} breach rows loaded`}
              accent="brand"
              dimmed={metricsDimmed}
            />
            <MetricTile
              icon={<LayoutGrid size={18} />}
              label="Total breaches"
              value={overCount + underCount}
              hint={`${periodLabel} · ${view === 'aggregate' ? 'Aggregate view' : 'By registration'}`}
              accent="slate"
              dimmed={metricsDimmed}
            />
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="inline-flex rounded-lg bg-slate-100/80 p-1">
              <button
                type="button"
                onClick={() => setBreachPage('over')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all',
                  breachPage === 'over'
                    ? 'bg-white text-rose-700 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <TrendingUp size={14} />
                Over forecast
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                  breachPage === 'over' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200/80 text-slate-600'
                )}>
                  {overCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setBreachPage('under')}
                className={cn(
                  'inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-xs font-semibold transition-all',
                  breachPage === 'under'
                    ? 'bg-white text-amber-800 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <TrendingDown size={14} />
                Under forecast
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                  breachPage === 'under' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200/80 text-slate-600'
                )}>
                  {underCount}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setView('aggregate')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    view === 'aggregate'
                      ? 'bg-[#007ABE] text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  Aggregate
                </button>
                <button
                  type="button"
                  onClick={() => setView('detail')}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    view === 'detail'
                      ? 'bg-[#007ABE] text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  By registration
                </button>
              </div>
              <div className="text-right text-xs">
                <p className="font-medium text-slate-500">{breachRowsStatus.label}</p>
                <p className="mt-0.5 inline-flex items-center justify-end gap-1.5 text-slate-400">
                  {breachRowsStatus.spinning ? (
                    <Loader2 size={12} className="shrink-0 animate-spin text-[#007ABE]" />
                  ) : null}
                  <span>{breachRowsStatus.detail}</span>
                </p>
              </div>
            </div>
          </div>

          <div key={`${view}-${breachPage}`} className="p-3 pt-2">
            <OverplanResultsTable
              rows={displayRows}
              view={view}
              breachPage={breachPage}
              compareLeft={activeCompareLeft}
              compareRight={activeCompareRight}
              loading={tableLoading}
              isLoadingMore={isLoadingMore}
              hasMoreRows={hasMoreRows}
              totalRows={totalRows}
              onLoadMore={() => { ignorePromise(loadMoreRows()); }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
