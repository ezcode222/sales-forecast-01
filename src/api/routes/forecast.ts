import { Prisma } from '@prisma/client';
import { Router } from 'express';
import prisma from '../../db/prisma';
import {
  actualPeriodExpression,
  actualRegistrationSourceSql,
  actualSalesSourceSql,
  nextMonthStart,
  type ActualGranularity,
} from './actuals';
import {
  getFilteredRegistrationIds,
  normalizeRegistrationFilters,
} from './registrations';
import { getActiveSnapshotVersion } from '../services/dataSnapshot';
import {
  formatForecastPeriodForApi,
  monthKeyToEndOfMonth,
  monthKeyToFirstOfMonth,
  parseForecastPeriodToDate,
} from '../../lib/forecastPeriod';

const router = Router();
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHANGED_BY = 'User (Admin)';
const DEFAULT_STAMP_PERIOD = 'No';
const ALLOWED_STAMP_PERIODS = new Set([
  DEFAULT_STAMP_PERIOD,
  'Weekly1',
  'Weekly2',
  'Weekly3',
  'Weekly4',
  'Weekly5',
  'Monthly1',
  'Monthly2',
]);
const STANDARD_VERSION_KEYS: Record<string, number> = {
  'Current Forecast': 1,
  'BB FY26': 2,
  'SepF FY26': 3,
  'DecF FY26': 4,
};

interface ForecastSummaryPeriod {
  period: string;
  qtyAct: number;
  qtyFcst: number;
  carryInETD: number;
  carryOutETD: number;
  carryInLoading: number;
  carryOutLoading: number;
}

interface ForecastSummaryResponse {
  generatedAt: string;
  periods: ForecastSummaryPeriod[];
}

interface NormalizedForecastUpdate {
  registrationId: string;
  versionName: string;
  period: Date;
  periodKey: string;
  granularity: string;
  qtyFcst: number;
  priceFcst: number;
}

const summaryCache = new Map<
  string,
  { expiresAt: number; promise: Promise<ForecastSummaryResponse> }
>();

export function clearForecastSummaryCache() {
  summaryCache.clear();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function numberMatchesFilter(value: number, selectedValues: string[]) {
  return selectedValues.some(selected => {
    const parsed = Number(selected);
    return Number.isFinite(parsed)
      ? Math.abs(value - parsed) < 0.0001
      : String(value) === selected;
  });
}

function normalizeForecastUpdates(updates: unknown[]) {
  const normalized = new Map<string, NormalizedForecastUpdate>();
  for (const value of updates) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const registrationId = String(item.registrationId ?? '').trim();
    const versionName = String(item.version ?? item.versionName ?? '').trim();
    const period = String(item.period ?? '').trim();
    if (!registrationId || !versionName || !period) continue;
    const periodKey = period;
    const granularity = String(item.granularity ?? 'month');
    const qtyFcst = Number(item.qtyFcst ?? 0);
    const priceFcst = Number(item.priceFcst ?? 0);
    normalized.set(`${registrationId}|${versionName}|${periodKey}`, {
      registrationId,
      versionName,
      period: parseForecastPeriodToDate(periodKey, granularity),
      periodKey,
      granularity,
      qtyFcst: Number.isFinite(qtyFcst) ? qtyFcst : 0,
      priceFcst: Number.isFinite(priceFcst) ? priceFcst : 0,
    });
  }
  return [...normalized.values()];
}

function normalizeStampPeriod(value: unknown) {
  const stampPeriod = String(value ?? DEFAULT_STAMP_PERIOD).trim();
  return ALLOWED_STAMP_PERIODS.has(stampPeriod) ? stampPeriod : DEFAULT_STAMP_PERIOD;
}

function hasForecastChanged(
  oldValue: { qtyFcst: unknown; priceFcst: unknown } | undefined,
  update: NormalizedForecastUpdate
) {
  if (!oldValue) return true;
  return (
    Math.abs(Number(oldValue.qtyFcst ?? 0) - update.qtyFcst) > 0.0001 ||
    Math.abs(Number(oldValue.priceFcst ?? 0) - update.priceFcst) > 0.0001
  );
}

function mapAuditRow(row: Prisma.ForecastChangeLogGetPayload<{ include: { batch: true } }>) {
  return {
    id: row.id,
    batchId: row.batchId,
    source: row.batch.source,
    changedBy: row.batch.changedBy,
    batchCreatedAt: row.batch.createdAt,
    registrationId: row.registrationId,
    versionName: row.versionName,
    period: formatForecastPeriodForApi(row.period, row.granularity),
    granularity: row.granularity,
    oldQtyFcst: row.oldQtyFcst === null ? null : Number(row.oldQtyFcst),
    newQtyFcst: Number(row.newQtyFcst),
    oldPriceFcst: row.oldPriceFcst === null ? null : Number(row.oldPriceFcst),
    newPriceFcst: Number(row.newPriceFcst),
    changedAt: row.changedAt,
  };
}

async function nextForecastVersionKey(transaction: Pick<typeof prisma, '$queryRaw'>) {
  const rows = await transaction.$queryRaw<Array<{ nextKey: unknown }>>`
    SELECT ISNULL(MAX([versionKey]), 0) + 1 AS nextKey
    FROM [dbo].[forecast_versions]
  `;
  return Number(rows[0]?.nextKey ?? 1);
}

async function ensureForecastVersion(
  transaction: Pick<typeof prisma, 'forecastVersion' | '$queryRaw'>,
  name: string,
  isStandard = false
) {
  const standardKey = STANDARD_VERSION_KEYS[name];
  const existing = await transaction.forecastVersion.findUnique({
    where: { name },
    select: { name: true },
  });
  if (existing) {
    if (standardKey !== undefined) {
      await transaction.forecastVersion.update({
        where: { name },
        data: { versionKey: standardKey, isStandard: true },
      });
    }
    return;
  }

  await transaction.forecastVersion.create({
    data: {
      name,
      isStandard: isStandard || standardKey !== undefined,
      versionKey: standardKey ?? await nextForecastVersionKey(transaction),
    },
  });
}

function createEmptySummary(period: string): ForecastSummaryPeriod {
  return {
    period,
    qtyAct: 0,
    qtyFcst: 0,
    carryInETD: 0,
    carryOutETD: 0,
    carryInLoading: 0,
    carryOutLoading: 0,
  };
}

async function loadCarryTotalsByRegistration(
  registrationIds: string[],
  startMonth: string,
  endMonth: string,
  snapshotVersion: string | null
) {
  if (registrationIds.length === 0) return new Map<string, {
    carryInETD: number;
    carryOutETD: number;
    carryInLoading: number;
    carryOutLoading: number;
  }>();
  const registrationIdsJson = JSON.stringify(registrationIds);
  const registrationSource = actualRegistrationSourceSql(snapshotVersion);
  const actualSource = actualSalesSourceSql(snapshotVersion);
  const rangeStart = `${startMonth}-01`;
  const rangeEnd = nextMonthStart(endMonth);

  const rows = await prisma.$queryRaw<Array<{
    registrationId: string;
    carryInETD: unknown;
    carryOutETD: unknown;
    carryInLoading: unknown;
    carryOutLoading: unknown;
  }>>`
    WITH requested_ids AS (
      SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
      FROM OPENJSON(${registrationIdsJson})
    ),
    registration_source AS (${registrationSource}),
    actual_source AS (${actualSource}),
    requested_registrations AS (
      SELECT DISTINCT source.registrationId, source.keyForNoCRM
      FROM registration_source source
      INNER JOIN requested_ids requested
        ON requested.registrationId = source.registrationId
    ),
    carry_events AS (
      SELECT
        requested.registrationId,
        eventData.eventDate,
        eventData.carryInETD,
        eventData.carryOutETD,
        eventData.carryInLoading,
        eventData.carryOutLoading
      FROM actual_source actual
      INNER JOIN requested_registrations requested
        ON requested.keyForNoCRM = actual.[Key for no regist]
      CROSS APPLY (VALUES
        (actual.[CarryIn_ETD], CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)), 0, 0, 0),
        (actual.[CarryOut_ETD], 0, CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)), 0, 0),
        (actual.[CarryIn_Loading], 0, 0, CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)), 0),
        (actual.[CarryOut_Loading], 0, 0, 0, CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)))
      ) eventData(eventDate, carryInETD, carryOutETD, carryInLoading, carryOutLoading)
      WHERE eventData.eventDate IS NOT NULL
        AND eventData.eventDate >= ${rangeStart}
        AND eventData.eventDate < ${rangeEnd}
    )
    SELECT
      registrationId,
      SUM(carryInETD) AS carryInETD,
      SUM(carryOutETD) AS carryOutETD,
      SUM(carryInLoading) AS carryInLoading,
      SUM(carryOutLoading) AS carryOutLoading
    FROM carry_events
    GROUP BY registrationId
  `;
  return new Map(rows.map(row => [
    String(row.registrationId),
    {
      carryInETD: Number(row.carryInETD ?? 0),
      carryOutETD: Number(row.carryOutETD ?? 0),
      carryInLoading: Number(row.carryInLoading ?? 0),
      carryOutLoading: Number(row.carryOutLoading ?? 0),
    },
  ]));
}

async function loadActualSummaryRows(
  registrationIds: string[],
  periods: string[],
  startMonth: string,
  endMonth: string,
  granularity: ActualGranularity,
  snapshotVersion: string | null
) {
  if (registrationIds.length === 0) return [];
  const registrationIdsJson = JSON.stringify(registrationIds);
  const periodsJson = JSON.stringify(periods);
  const registrationSource = actualRegistrationSourceSql(snapshotVersion);
  const actualSource = actualSalesSourceSql(snapshotVersion);
  const periodExpression = actualPeriodExpression(granularity);
  const rangeStart = `${startMonth}-01`;
  const rangeEnd = nextMonthStart(endMonth);

  return prisma.$queryRaw<Array<{
    period: string;
    qtyAct: unknown;
    carryInETD: unknown;
    carryOutETD: unknown;
    carryInLoading: unknown;
    carryOutLoading: unknown;
  }>>`
    WITH requested_ids AS (
      SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
      FROM OPENJSON(${registrationIdsJson})
    ),
    requested_periods AS (
      SELECT CAST([value] AS NVARCHAR(15)) AS period
      FROM OPENJSON(${periodsJson})
    ),
    registration_source AS (${registrationSource}),
    actual_source AS (${actualSource}),
    requested_registrations AS (
      SELECT DISTINCT source.registrationId, source.keyForNoCRM
      FROM registration_source source
      INNER JOIN requested_ids requested
        ON requested.registrationId = source.registrationId
    ),
    actual_events AS (
      SELECT
        eventData.eventDate,
        eventData.qtyAct,
        eventData.carryInETD,
        eventData.carryOutETD,
        eventData.carryInLoading,
        eventData.carryOutLoading
      FROM actual_source actual
      INNER JOIN requested_registrations requested
        ON requested.keyForNoCRM = actual.[Key for no regist]
      CROSS APPLY (VALUES
        (
          actual.Deliverydate,
          CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)),
          CAST(0 AS DECIMAL(18, 4)),
          CAST(0 AS DECIMAL(18, 4)),
          CAST(0 AS DECIMAL(18, 4)),
          CAST(0 AS DECIMAL(18, 4))
        ),
        (
          actual.[CarryIn_ETD],
          0,
          CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)),
          0,
          0,
          0
        ),
        (
          actual.[CarryOut_ETD],
          0,
          0,
          CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)),
          0,
          0
        ),
        (
          actual.[CarryIn_Loading],
          0,
          0,
          0,
          CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)),
          0
        ),
        (
          actual.[CarryOut_Loading],
          0,
          0,
          0,
          0,
          CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4))
        )
      ) eventData(
        eventDate,
        qtyAct,
        carryInETD,
        carryOutETD,
        carryInLoading,
        carryOutLoading
      )
      WHERE eventData.eventDate IS NOT NULL
        AND eventData.eventDate >= ${rangeStart}
        AND eventData.eventDate < ${rangeEnd}
    ),
    actual_by_period AS (
      SELECT
        ${periodExpression} AS period,
        SUM(qtyAct) AS qtyAct,
        SUM(carryInETD) AS carryInETD,
        SUM(carryOutETD) AS carryOutETD,
        SUM(carryInLoading) AS carryInLoading,
        SUM(carryOutLoading) AS carryOutLoading
      FROM actual_events
      GROUP BY ${periodExpression}
    )
    SELECT actual_by_period.*
    FROM actual_by_period
    INNER JOIN requested_periods
      ON requested_periods.period = actual_by_period.period
  `;
}

async function loadForecastSummaryRows(
  registrationIds: string[],
  periods: string[],
  version: string,
  granularity: ActualGranularity
) {
  if (registrationIds.length === 0) return [];
  const registrationIdsJson = JSON.stringify(registrationIds);
  const periodsJson = JSON.stringify(periods);

  if (granularity === 'month') {
    return prisma.$queryRaw<Array<{ period: string; qtyFcst: unknown }>>`
      WITH requested_ids AS (
        SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
        FROM OPENJSON(${registrationIdsJson})
      ),
      requested_periods AS (
        SELECT CAST([value] AS NVARCHAR(15)) AS period
        FROM OPENJSON(${periodsJson})
      ),
      dated_by_month AS (
        SELECT forecast.registrationId, FORMAT(forecast.period, 'yyyy-MM') AS period, SUM(forecast.qtyFcst) AS qtyFcst
        FROM dbo.forecast_values forecast
        INNER JOIN requested_ids requested
          ON requested.registrationId = forecast.registrationId
        INNER JOIN requested_periods requested_period
          ON requested_period.period = FORMAT(forecast.period, 'yyyy-MM')
        WHERE forecast.versionName = ${version}
          AND forecast.granularity = N'week'
        GROUP BY forecast.registrationId, FORMAT(forecast.period, 'yyyy-MM')
      ),
      monthly_rows AS (
        SELECT forecast.registrationId, FORMAT(forecast.period, 'yyyy-MM') AS period, forecast.qtyFcst
        FROM dbo.forecast_values forecast
        INNER JOIN requested_ids requested
          ON requested.registrationId = forecast.registrationId
        INNER JOIN requested_periods requested_period
          ON requested_period.period = FORMAT(forecast.period, 'yyyy-MM')
        WHERE forecast.versionName = ${version}
          AND forecast.granularity = N'month'
      )
      SELECT
        requested_periods.period,
        SUM(CASE
          WHEN dated_by_month.qtyFcst IS NOT NULL THEN dated_by_month.qtyFcst
          ELSE ISNULL(monthly_rows.qtyFcst, 0)
        END) AS qtyFcst
      FROM requested_periods
      CROSS JOIN requested_ids
      LEFT JOIN dated_by_month
        ON dated_by_month.registrationId = requested_ids.registrationId
       AND dated_by_month.period = requested_periods.period
      LEFT JOIN monthly_rows
        ON monthly_rows.registrationId = requested_ids.registrationId
       AND monthly_rows.period = requested_periods.period
      GROUP BY requested_periods.period
    `;
  }

  return prisma.$queryRaw<Array<{ period: string; qtyFcst: unknown }>>`
    WITH requested_ids AS (
      SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
      FROM OPENJSON(${registrationIdsJson})
    ),
    requested_periods AS (
      SELECT
        CAST([value] AS NVARCHAR(15)) AS period,
        LEFT(CAST([value] AS NVARCHAR(15)), 7) AS monthPeriod,
        CONVERT(CHAR(10), DATEADD(
          DAY,
          (7 - (DATEDIFF(DAY, '19000103', CAST(CONCAT(LEFT(CAST([value] AS NVARCHAR(15)), 7), '-01') AS DATE)) % 7)) % 7,
          CAST(CONCAT(LEFT(CAST([value] AS NVARCHAR(15)), 7), '-01') AS DATE)
        ), 126) AS firstWednesday
      FROM OPENJSON(${periodsJson})
    ),
    requested_months AS (
      SELECT DISTINCT monthPeriod
      FROM requested_periods
    ),
    exact_week_rows AS (
      SELECT forecast.registrationId, CONVERT(CHAR(10), forecast.period, 23) AS period, forecast.qtyFcst
      FROM dbo.forecast_values forecast
      INNER JOIN requested_ids requested
        ON requested.registrationId = forecast.registrationId
      INNER JOIN requested_periods requested_period
        ON requested_period.period = CONVERT(CHAR(10), forecast.period, 23)
      WHERE forecast.versionName = ${version}
        AND forecast.granularity = N'week'
    ),
    monthly_rows AS (
      SELECT forecast.registrationId, FORMAT(forecast.period, 'yyyy-MM') AS period, forecast.qtyFcst
      FROM dbo.forecast_values forecast
      INNER JOIN requested_ids requested
        ON requested.registrationId = forecast.registrationId
      INNER JOIN requested_months requested_month
        ON requested_month.monthPeriod = FORMAT(forecast.period, 'yyyy-MM')
      WHERE forecast.versionName = ${version}
        AND forecast.granularity = N'month'
    )
    SELECT
      requested_periods.period,
      SUM(CASE
        WHEN exact_week_rows.qtyFcst IS NOT NULL THEN exact_week_rows.qtyFcst
        WHEN requested_periods.period = requested_periods.firstWednesday THEN ISNULL(monthly_rows.qtyFcst, 0)
        ELSE 0
      END) AS qtyFcst
    FROM requested_periods
    CROSS JOIN requested_ids
    LEFT JOIN exact_week_rows
      ON exact_week_rows.registrationId = requested_ids.registrationId
     AND exact_week_rows.period = requested_periods.period
    LEFT JOIN monthly_rows
      ON monthly_rows.registrationId = requested_ids.registrationId
     AND monthly_rows.period = requested_periods.monthPeriod
    GROUP BY requested_periods.period
  `;
}

async function buildForecastSummary(
  body: Record<string, unknown>,
  snapshotVersion: string | null
): Promise<ForecastSummaryResponse> {
  const startMonth = String(body.startMonth ?? '');
  const endMonth = String(body.endMonth ?? '');
  const version = String(body.version ?? 'Current Forecast');
  const granularity: ActualGranularity = body.granularity === 'week' ? 'week' : 'month';
  const periods = Array.isArray(body.periods)
    ? [...new Set(body.periods.map(String).filter(Boolean))]
    : [];
  if (!/^\d{4}-\d{2}$/.test(startMonth) || !/^\d{4}-\d{2}$/.test(endMonth) || periods.length === 0) {
    throw new Error('Invalid summary date range or periods');
  }

  const filters = normalizeRegistrationFilters(body.filters);
  const formulaFilter = Array.isArray(body.formulaFilter)
    ? body.formulaFilter.map(String).filter(Boolean)
    : [];
  const formulaOverrides = body.formulaOverrides && typeof body.formulaOverrides === 'object'
    ? body.formulaOverrides as Record<string, string>
    : {};
  const carryFilters = body.carryFilters && typeof body.carryFilters === 'object'
    ? body.carryFilters as Record<string, unknown>
    : {};
  let registrationIds = await getFilteredRegistrationIds(filters);
  if (formulaFilter.length > 0) {
    registrationIds = registrationIds.filter(registrationId =>
      formulaFilter.includes(formulaOverrides[registrationId] ?? 'CPL')
    );
  }

  const carryFilterEntries = Object.entries(carryFilters)
    .filter(([, values]) => Array.isArray(values) && values.length > 0)
    .map(([key, values]) => [key, (values as unknown[]).map(String)] as const);
  if (carryFilterEntries.length > 0) {
    const carryTotalsByRegistration = await loadCarryTotalsByRegistration(
      registrationIds,
      startMonth,
      endMonth,
      snapshotVersion
    );
    registrationIds = registrationIds.filter(registrationId => {
      const totals = carryTotalsByRegistration.get(registrationId) ?? {
        carryInETD: 0,
        carryOutETD: 0,
        carryInLoading: 0,
        carryOutLoading: 0,
      };
      return carryFilterEntries.every(([key, values]) =>
        key in totals &&
        numberMatchesFilter(totals[key as keyof typeof totals], values)
      );
    });
  }

  const summaryByPeriod = new Map(
    periods.map(period => [period, createEmptySummary(period)])
  );

  const [actualRows, forecastRows] = await Promise.all([
    loadActualSummaryRows(registrationIds, periods, startMonth, endMonth, granularity, snapshotVersion),
    loadForecastSummaryRows(registrationIds, periods, version, granularity),
  ]);

  actualRows.forEach(row => {
    const summary = summaryByPeriod.get(String(row.period));
    if (!summary) return;
    summary.qtyAct = Number(row.qtyAct ?? 0);
    summary.carryInETD = Number(row.carryInETD ?? 0);
    summary.carryOutETD = Number(row.carryOutETD ?? 0);
    summary.carryInLoading = Number(row.carryInLoading ?? 0);
    summary.carryOutLoading = Number(row.carryOutLoading ?? 0);
  });

  forecastRows.forEach(row => {
    const summary = summaryByPeriod.get(String(row.period));
    if (summary) summary.qtyFcst = Number(row.qtyFcst ?? 0);
  });

  return {
    generatedAt: new Date().toISOString(),
    periods: periods.map(period => summaryByPeriod.get(period)!),
  };
}

router.post('/summary', async (req, res) => {
  const snapshotVersion = await getActiveSnapshotVersion();
  const cacheKey = `${snapshotVersion ?? 'legacy'}|${stableJson(req.body)}`;
  const cached = summaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    try {
      return res.json(await cached.promise);
    } catch {
      summaryCache.delete(cacheKey);
    }
  }

  const promise = buildForecastSummary(req.body as Record<string, unknown>, snapshotVersion).catch(error => {
    summaryCache.delete(cacheKey);
    throw error;
  });
  summaryCache.set(cacheKey, {
    expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS,
    promise,
  });

  try {
    res.json(await promise);
  } catch (err) {
    console.error('[forecast] POST summary error:', err);
    res.status(500).json({ error: 'Failed to calculate forecast summary' });
  }
});

router.get('/fact-forecast', async (req, res) => {
  const {
    version,
    startPeriod,
    endPeriod,
    registrationId,
    limit = '5000',
  } = req.query as Record<string, string>;
  const take = Math.min(Math.max(Number(limit) || 5000, 1), 50000);

  try {
    const rows = await prisma.$queryRaw<Array<{
      fcstRevKey: string;
      revision: string;
      forecastVersion: string;
      versionKey: number;
      registrationKey: string;
      fcstPeriod: string;
      newQty: unknown;
      price: unknown;
      amount: unknown;
      stampPeriod: string;
    }>>`
      SELECT TOP (${take})
        [Fcst Rev Key] AS fcstRevKey,
        [Revision] AS revision,
        [Forecast Version] AS forecastVersion,
        [Version Key] AS versionKey,
        [Registration Key] AS registrationKey,
        [Fcst Period] AS fcstPeriod,
        [NewQty] AS newQty,
        [Price] AS price,
        [Amount] AS amount,
        [Stamp Period] AS stampPeriod
      FROM [dbo].[FactForecast]
      WHERE (${version ?? null} IS NULL OR [Forecast Version] = ${version ?? null})
        AND (${registrationId ?? null} IS NULL OR [Registration Key] = ${registrationId ?? null})
        AND (${startPeriod ?? null} IS NULL OR [Fcst Period] >= TRY_CONVERT(DATE, CONCAT(${startPeriod ?? null}, N'-01'), 126))
        AND (${endPeriod ?? null} IS NULL OR [Fcst Period] <= EOMONTH(TRY_CONVERT(DATE, CONCAT(${endPeriod ?? null}, N'-01'), 126)))
      ORDER BY [Version Key], [Registration Key], [Fcst Period]
    `;
    res.json(rows.map(row => ({
      fcstRevKey: row.fcstRevKey,
      revision: row.revision,
      forecastVersion: row.forecastVersion,
      versionKey: Number(row.versionKey),
      registrationKey: row.registrationKey,
      fcstPeriod: row.fcstPeriod,
      newQty: Number(row.newQty ?? 0),
      price: Number(row.price ?? 0),
      amount: Number(row.amount ?? 0),
      stampPeriod: row.stampPeriod ?? 'No',
    })));
  } catch (err) {
    console.error('[forecast] GET fact forecast error:', err);
    res.status(500).json({ error: 'Failed to fetch FactForecast data' });
  }
});

router.get('/audit/cell', async (req, res) => {
  const { registrationId, version, period } = req.query as Record<string, string>;
  if (!registrationId || !version || !period) {
    return res.status(400).json({ error: 'registrationId, version and period are required' });
  }

  try {
    const periodDate = parseForecastPeriodToDate(
      period,
      /^\d{4}-\d{2}$/.test(period) ? 'month' : 'week'
    );
    const where = { registrationId, versionName: version, period: periodDate };
    const [totalChanges, latestRows] = await Promise.all([
      prisma.forecastChangeLog.count({ where }),
      prisma.forecastChangeLog.findMany({
        where,
        include: { batch: true },
        orderBy: [{ changedAt: 'desc' }],
        take: 3,
      }),
    ]);
    res.json({
      totalChanges,
      latestChanges: latestRows.map(mapAuditRow),
    });
  } catch (err) {
    console.error('[forecast] GET audit cell error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast cell audit history' });
  }
});

router.get('/audit', async (req, res) => {
  const { registrationId, version, start, end } = req.query as Record<string, string>;
  try {
    const rows = await prisma.forecastChangeLog.findMany({
      where: {
        ...(registrationId ? { registrationId } : {}),
        ...(version ? { versionName: version } : {}),
        ...(start || end ? {
          period: {
            ...(start ? { gte: monthKeyToFirstOfMonth(start) } : {}),
            ...(end ? { lte: monthKeyToEndOfMonth(end) } : {}),
          },
        } : {}),
      },
      include: { batch: true },
      orderBy: [{ changedAt: 'desc' }],
      take: 500,
    });
    res.json(rows.map(mapAuditRow));
  } catch (err) {
    console.error('[forecast] GET audit error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast audit history' });
  }
});

/**
 * GET /api/forecast?version=&startPeriod=&endPeriod=&granularity=
 * Returns ForecastValue rows for given filters.
 * period field is "YYYY-MM" (month) or "YYYY-MM-DD" (week) in API responses.
 */
router.get('/', async (req, res) => {
  const { version, startPeriod, endPeriod, granularity } = req.query as Record<string, string>;
  const registrationIds = Array.isArray(req.query.registrationId)
    ? req.query.registrationId.map(String)
    : req.query.registrationId
      ? [String(req.query.registrationId)]
      : [];
  try {
    const rows = await prisma.forecastValue.findMany({
      where: {
        ...(registrationIds.length > 0 ? { registrationId: { in: registrationIds } } : {}),
        ...(version     ? { versionName: version }                        : {}),
        ...(granularity ? { granularity }                                  : {}),
        ...(startPeriod || endPeriod ? {
          period: {
            ...(startPeriod ? { gte: monthKeyToFirstOfMonth(startPeriod) } : {}),
            ...(endPeriod   ? { lte: monthKeyToEndOfMonth(endPeriod) }   : {}),
          },
        } : {}),
      },
      orderBy: [{ registrationId: 'asc' }, { period: 'asc' }],
    });

    res.json(rows.map((r) => ({
      registrationId: r.registrationId,
      period:         formatForecastPeriodForApi(r.period, r.granularity),
      granularity:    r.granularity,
      version:        r.versionName,
      qtyFcst:        Number(r.qtyFcst),
      priceFcst:      Number(r.priceFcst),
    })));
  } catch (err) {
    console.error('[forecast] GET error:', err);
    res.status(500).json({ error: 'Failed to fetch forecast data' });
  }
});

/**
 * PATCH /api/forecast
 * Body: Array<{ registrationId, version, period, granularity, qtyFcst, priceFcst }>
 * Upserts all rows in a single transaction.
 */
router.patch('/', async (req, res) => {
  const updates = Array.isArray(req.body) ? req.body : req.body?.values;
  const sessionUser = (req as typeof req & { user?: { name?: string; email?: string } }).user;
  const changedBy = String(
    sessionUser?.name ??
    sessionUser?.email ??
    req.body?.changedBy ??
    req.header('x-changed-by') ??
    DEFAULT_CHANGED_BY
  ).trim() || DEFAULT_CHANGED_BY;
  const stampPeriod = normalizeStampPeriod(req.body?.stampPeriod);
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Body must be a non-empty array of forecast values' });
  }
  const normalizedUpdates = normalizeForecastUpdates(updates);
  if (normalizedUpdates.length === 0) {
    return res.status(400).json({ error: 'No valid forecast values were supplied' });
  }

  try {
    const result = await prisma.$transaction(async transaction => {
      for (const versionName of [...new Set(normalizedUpdates.map(update => update.versionName))]) {
        await ensureForecastVersion(
          transaction,
          versionName,
          STANDARD_VERSION_KEYS[versionName] !== undefined
        );
      }
      const existingRows = await transaction.forecastValue.findMany({
        where: {
          OR: normalizedUpdates.map(update => ({
            registrationId: update.registrationId,
            versionName: update.versionName,
            period: update.period,
          })),
        },
        select: {
          registrationId: true,
          versionName: true,
          period: true,
          granularity: true,
          qtyFcst: true,
          priceFcst: true,
        },
      });
      const existingMap = new Map(
        existingRows.map(row => [
          `${row.registrationId}|${row.versionName}|${formatForecastPeriodForApi(row.period, row.granularity)}`,
          row,
        ])
      );
      const changedUpdates = normalizedUpdates.filter(update =>
        hasForecastChanged(
          existingMap.get(`${update.registrationId}|${update.versionName}|${update.periodKey}`),
          update
        )
      );
      const changedKeys = new Set(
        changedUpdates.map(update => `${update.registrationId}|${update.versionName}|${update.periodKey}`)
      );
      const batch = await transaction.forecastCommitBatch.create({
        data: {
          source: 'manual_commit',
          changedBy,
          stampPeriod,
          recordCount: changedUpdates.length,
        },
      });

      for (const update of normalizedUpdates) {
        const key = `${update.registrationId}|${update.versionName}|${update.periodKey}`;
        const changed = changedKeys.has(key);
        await transaction.forecastValue.upsert({
          where: {
            registrationId_versionName_period: {
              registrationId: update.registrationId,
              versionName: update.versionName,
              period: update.period,
            },
          },
          update: {
            granularity: update.granularity,
            qtyFcst: update.qtyFcst,
            priceFcst: update.priceFcst,
            ...(changed ? { lastBatchId: batch.id } : {}),
          },
          create: {
            registrationId: update.registrationId,
            versionName: update.versionName,
            period: update.period,
            granularity: update.granularity,
            qtyFcst: update.qtyFcst,
            priceFcst: update.priceFcst,
            lastBatchId: batch.id,
          },
        });
      }

      if (changedUpdates.length > 0) {
        await transaction.forecastChangeLog.createMany({
          data: changedUpdates.map(update => {
            const oldValue = existingMap.get(`${update.registrationId}|${update.versionName}|${update.periodKey}`);
            return {
              batchId: batch.id,
              registrationId: update.registrationId,
              versionName: update.versionName,
              period: update.period,
              granularity: update.granularity,
              oldQtyFcst: oldValue?.qtyFcst ?? null,
              newQtyFcst: update.qtyFcst,
              oldPriceFcst: oldValue?.priceFcst ?? null,
              newPriceFcst: update.priceFcst,
            };
          }),
        });
      }
      return { batchId: batch.id, changed: changedUpdates.length };
    });
    clearForecastSummaryCache();

    res.json({
      ok: true,
      updated: normalizedUpdates.length,
      batchId: result.batchId,
      changed: result.changed,
    });
  } catch (err) {
    console.error('[forecast] PATCH error:', err);
    res.status(500).json({ error: 'Failed to save forecast data' });
  }
});

export default router;
