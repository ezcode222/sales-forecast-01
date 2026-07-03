import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import {
  actualPeriodExpression,
  actualRegistrationSourceSql,
  actualSalesSourceSql,
  nextMonthStart,
  type ActualGranularity,
} from '../routes/actuals';
import { getRegistrationSourceSql } from '../routes/registrations';
import { getActiveSnapshotVersion } from './dataSnapshot';
import { OVERPLAN_ACTUAL_SOURCE } from './overplanCompare';

export type OverplanRegistrationMeta = {
  registrationId: string;
  materialCode: string;
  materialDescription: string;
  plantCode: string;
  ownerName: string;
};

export type OverplanDetailQtyRow = OverplanRegistrationMeta & {
  period: string;
  leftQty: number;
  rightQty: number;
};

function monthPeriodsBetween(startMonth: string, endMonth: string) {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number);
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number);
  const periods: string[] = [];
  let year = startYear;
  let month = startMonthNumber;
  while (year < endYear || (year === endYear && month <= endMonthNumber)) {
    periods.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return periods;
}

export function resolveOverplanPeriods(startMonth: string, endMonth: string) {
  return monthPeriodsBetween(startMonth, endMonth);
}

export async function loadOverplanRegistrationMeta(registrationIds: string[]) {
  if (registrationIds.length === 0) return new Map<string, OverplanRegistrationMeta>();
  const registrationIdsJson = JSON.stringify(registrationIds);
  const registrationSourceSql = await getRegistrationSourceSql();
  const rows = await prisma.$queryRaw<Array<{
    registrationId: string;
    materialCode: string | null;
    materialDescription: string | null;
    plantCode: string | null;
    ownerName: string | null;
  }>>`
    WITH requested_ids AS (
      SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
      FROM OPENJSON(${registrationIdsJson})
    ),
    registration_source AS (${registrationSourceSql})
    SELECT
      CAST(source.RegistrationId AS NVARCHAR(200)) AS registrationId,
      CAST(ISNULL(source.MaterialCode, '') AS NVARCHAR(100)) AS materialCode,
      CAST(ISNULL(source.MaterialDescription, '') AS NVARCHAR(500)) AS materialDescription,
      CAST(ISNULL(source.PlantCode, '') AS NVARCHAR(100)) AS plantCode,
      CAST(ISNULL(source.OwnerName, '') AS NVARCHAR(500)) AS ownerName
    FROM registration_source source
    INNER JOIN requested_ids requested
      ON requested.registrationId = source.RegistrationId
  `;

  return new Map(rows.map(row => [
    row.registrationId,
    {
      registrationId: row.registrationId,
      materialCode: row.materialCode ?? '',
      materialDescription: row.materialDescription ?? '',
      plantCode: row.plantCode ?? '',
      ownerName: row.ownerName ?? '',
    },
  ]));
}

async function loadForecastQtyByRegistrationPeriod(
  registrationIds: string[],
  periods: string[],
  versionName: string,
  granularity: ActualGranularity
) {
  if (registrationIds.length === 0 || periods.length === 0) return new Map<string, number>();
  const registrationIdsJson = JSON.stringify(registrationIds);
  const periodsJson = JSON.stringify(periods);
  const keyFor = (registrationId: string, period: string) => `${registrationId}|${period}`;

  if (granularity === 'month') {
    const rows = await prisma.$queryRaw<Array<{ registrationId: string; period: string; qtyFcst: unknown }>>`
      WITH requested_ids AS (
        SELECT CAST([value] AS NVARCHAR(200)) AS registrationId
        FROM OPENJSON(${registrationIdsJson})
      ),
      requested_periods AS (
        SELECT CAST([value] AS NVARCHAR(15)) AS period
        FROM OPENJSON(${periodsJson})
      ),
      week_by_month AS (
        SELECT
          forecast.registrationId,
          FORMAT(forecast.period, 'yyyy-MM') AS period,
          SUM(forecast.qtyFcst) AS qtyFcst
        FROM dbo.forecast_values forecast
        INNER JOIN requested_ids requested
          ON requested.registrationId = forecast.registrationId
        INNER JOIN requested_periods requested_period
          ON requested_period.period = FORMAT(forecast.period, 'yyyy-MM')
        WHERE forecast.versionName = ${versionName}
          AND forecast.granularity = N'week'
        GROUP BY forecast.registrationId, FORMAT(forecast.period, 'yyyy-MM')
      ),
      monthly_rows AS (
        SELECT
          forecast.registrationId,
          FORMAT(forecast.period, 'yyyy-MM') AS period,
          forecast.qtyFcst
        FROM dbo.forecast_values forecast
        INNER JOIN requested_ids requested
          ON requested.registrationId = forecast.registrationId
        INNER JOIN requested_periods requested_period
          ON requested_period.period = FORMAT(forecast.period, 'yyyy-MM')
        WHERE forecast.versionName = ${versionName}
          AND forecast.granularity = N'month'
      )
      SELECT
        requested_ids.registrationId,
        requested_periods.period,
        CASE
          WHEN week_by_month.qtyFcst IS NOT NULL THEN week_by_month.qtyFcst
          ELSE ISNULL(monthly_rows.qtyFcst, 0)
        END AS qtyFcst
      FROM requested_periods
      CROSS JOIN requested_ids
      LEFT JOIN week_by_month
        ON week_by_month.registrationId = requested_ids.registrationId
       AND week_by_month.period = requested_periods.period
      LEFT JOIN monthly_rows
        ON monthly_rows.registrationId = requested_ids.registrationId
       AND monthly_rows.period = requested_periods.period
    `;
    return new Map(rows.map(row => [keyFor(row.registrationId, row.period), Number(row.qtyFcst ?? 0)]));
  }

  const rows = await prisma.$queryRaw<Array<{ registrationId: string; period: string; qtyFcst: unknown }>>`
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
      SELECT
        forecast.registrationId,
        CONVERT(CHAR(10), forecast.period, 23) AS period,
        forecast.qtyFcst
      FROM dbo.forecast_values forecast
      INNER JOIN requested_ids requested
        ON requested.registrationId = forecast.registrationId
      INNER JOIN requested_periods requested_period
        ON requested_period.period = CONVERT(CHAR(10), forecast.period, 23)
      WHERE forecast.versionName = ${versionName}
        AND forecast.granularity = N'week'
    ),
    monthly_rows AS (
      SELECT
        forecast.registrationId,
        FORMAT(forecast.period, 'yyyy-MM') AS period,
        forecast.qtyFcst
      FROM dbo.forecast_values forecast
      INNER JOIN requested_ids requested
        ON requested.registrationId = forecast.registrationId
      INNER JOIN requested_months requested_month
        ON requested_month.monthPeriod = FORMAT(forecast.period, 'yyyy-MM')
      WHERE forecast.versionName = ${versionName}
        AND forecast.granularity = N'month'
    )
    SELECT
      requested_ids.registrationId,
      requested_periods.period,
      CASE
        WHEN exact_week_rows.qtyFcst IS NOT NULL THEN exact_week_rows.qtyFcst
        WHEN requested_periods.period = requested_periods.firstWednesday THEN ISNULL(monthly_rows.qtyFcst, 0)
        ELSE 0
      END AS qtyFcst
    FROM requested_periods
    CROSS JOIN requested_ids
    LEFT JOIN exact_week_rows
      ON exact_week_rows.registrationId = requested_ids.registrationId
     AND exact_week_rows.period = requested_periods.period
    LEFT JOIN monthly_rows
      ON monthly_rows.registrationId = requested_ids.registrationId
     AND monthly_rows.period = LEFT(requested_periods.period, 7)
  `;
  return new Map(rows.map(row => [keyFor(row.registrationId, row.period), Number(row.qtyFcst ?? 0)]));
}

async function loadActualQtyByRegistrationPeriod(
  registrationIds: string[],
  periods: string[],
  startMonth: string,
  endMonth: string,
  granularity: ActualGranularity
) {
  if (registrationIds.length === 0 || periods.length === 0) return new Map<string, number>();
  const snapshotVersion = await getActiveSnapshotVersion();
  const registrationIdsJson = JSON.stringify(registrationIds);
  const periodsJson = JSON.stringify(periods);
  const registrationSource = actualRegistrationSourceSql(snapshotVersion);
  const actualSource = actualSalesSourceSql(snapshotVersion);
  const periodExpression = actualPeriodExpression(granularity);
  const rangeStart = `${startMonth}-01`;
  const rangeEnd = nextMonthStart(endMonth);
  const keyFor = (registrationId: string, period: string) => `${registrationId}|${period}`;

  const rows = await prisma.$queryRaw<Array<{ registrationId: string; period: string; qtyAct: unknown }>>`
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
        requested.registrationId,
        eventData.eventDate,
        eventData.qtyAct
      FROM actual_source actual
      INNER JOIN requested_registrations requested
        ON requested.keyForNoCRM = actual.[Key for no regist]
      CROSS APPLY (VALUES
        (actual.Deliverydate, CAST(ISNULL(actual.[Order Qty_TON], 0) AS DECIMAL(18, 4)))
      ) eventData(eventDate, qtyAct)
      WHERE eventData.eventDate IS NOT NULL
        AND eventData.eventDate >= ${rangeStart}
        AND eventData.eventDate < ${rangeEnd}
    ),
    actual_by_period AS (
      SELECT
        registrationId,
        ${periodExpression} AS period,
        SUM(qtyAct) AS qtyAct
      FROM actual_events
      GROUP BY registrationId, ${periodExpression}
    )
    SELECT actual_by_period.registrationId, actual_by_period.period, actual_by_period.qtyAct
    FROM actual_by_period
    INNER JOIN requested_periods requested_period
      ON requested_period.period = actual_by_period.period
  `;

  return new Map(rows.map(row => [keyFor(row.registrationId, row.period), Number(row.qtyAct ?? 0)]));
}

async function loadCompareQtyMap(
  source: string,
  registrationIds: string[],
  periods: string[],
  startMonth: string,
  endMonth: string,
  granularity: ActualGranularity
) {
  if (source === OVERPLAN_ACTUAL_SOURCE) {
    return loadActualQtyByRegistrationPeriod(
      registrationIds,
      periods,
      startMonth,
      endMonth,
      granularity
    );
  }
  return loadForecastQtyByRegistrationPeriod(registrationIds, periods, source, granularity);
}

export async function loadOverplanDetailRows(input: {
  registrationIds: string[];
  startMonth: string;
  endMonth: string;
  granularity?: ActualGranularity;
  compareLeft: string;
  compareRight: string;
}) {
  const granularity = input.granularity ?? 'month';
  const periods = resolveOverplanPeriods(input.startMonth, input.endMonth);
  const [metaById, leftQtyMap, rightQtyMap] = await Promise.all([
    loadOverplanRegistrationMeta(input.registrationIds),
    loadCompareQtyMap(
      input.compareLeft,
      input.registrationIds,
      periods,
      input.startMonth,
      input.endMonth,
      granularity
    ),
    loadCompareQtyMap(
      input.compareRight,
      input.registrationIds,
      periods,
      input.startMonth,
      input.endMonth,
      granularity
    ),
  ]);

  const rows: OverplanDetailQtyRow[] = [];
  for (const registrationId of input.registrationIds) {
    const meta = metaById.get(registrationId) ?? {
      registrationId,
      materialCode: '',
      materialDescription: '',
      plantCode: '',
      ownerName: '',
    };
    for (const period of periods) {
      const key = `${registrationId}|${period}`;
      rows.push({
        ...meta,
        period,
        leftQty: leftQtyMap.get(key) ?? 0,
        rightQty: rightQtyMap.get(key) ?? 0,
      });
    }
  }
  return rows;
}

export function aggregateOverplanRows(rows: OverplanDetailQtyRow[]) {
  const grouped = new Map<string, OverplanDetailQtyRow>();
  for (const row of rows) {
    const key = `${row.materialCode}|${row.plantCode}|${row.period}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        registrationId: key,
        materialCode: row.materialCode,
        materialDescription: row.materialDescription,
        plantCode: row.plantCode,
        ownerName: '',
        period: row.period,
        leftQty: row.leftQty,
        rightQty: row.rightQty,
      });
      continue;
    }
    existing.leftQty += row.leftQty;
    existing.rightQty += row.rightQty;
  }
  return [...grouped.values()];
}
