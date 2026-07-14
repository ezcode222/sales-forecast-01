import { PrismaClient } from '@prisma/client';
import { firstWednesdayPeriod, formatForecastPeriodForApi } from '../src/lib/forecastPeriod.ts';

const prisma = new PrismaClient();
const version = 'Current Forecast';

const stats = await prisma.$queryRaw`
  SELECT granularity, COUNT_BIG(*) cnt, SUM(CAST(qtyFcst AS FLOAT)) qty
  FROM dbo.forecast_values
  WHERE versionName = ${version}
  GROUP BY granularity
`;
console.log('DB granularity stats', stats);

const sampleMonth = await prisma.$queryRaw`
  SELECT TOP 5 registrationId, period, granularity, CAST(qtyFcst AS FLOAT) qty
  FROM dbo.forecast_values
  WHERE versionName = ${version} AND granularity = N'month'
    AND period >= '2026-07-01' AND period < '2026-11-01'
    AND qtyFcst <> 0
  ORDER BY qtyFcst DESC
`;
console.log('Sample month rows', sampleMonth);

const sampleWeek = await prisma.$queryRaw`
  SELECT TOP 5 registrationId, period, granularity, CAST(qtyFcst AS FLOAT) qty
  FROM dbo.forecast_values
  WHERE versionName = ${version} AND granularity = N'week'
    AND period >= '2026-07-01' AND period < '2026-11-01'
    AND qtyFcst <> 0
  ORDER BY qtyFcst DESC
`;
console.log('Sample week rows', sampleWeek);

// Check if registration ids in forecast match registration list ids
const mismatch = await prisma.$queryRaw`
  WITH fv_regs AS (
    SELECT DISTINCT registrationId
    FROM dbo.forecast_values
    WHERE versionName = ${version}
      AND period >= '2026-07-01' AND period < '2026-11-01'
      AND qtyFcst <> 0
  ),
  dim_regs AS (
    SELECT CAST(NewKey AS NVARCHAR(200)) AS registrationId
    FROM dbo.DimRegistration
    WHERE MainRegist = 1
  )
  SELECT
    (SELECT COUNT(*) FROM fv_regs) AS forecastRegCount,
    (SELECT COUNT(*) FROM fv_regs f INNER JOIN dim_regs d ON d.registrationId = f.registrationId) AS matchedInDim,
    (SELECT COUNT(*) FROM fv_regs f LEFT JOIN dim_regs d ON d.registrationId = f.registrationId WHERE d.registrationId IS NULL) AS orphanForecastRegs
`;
console.log('Registration id match', mismatch);

const orphanSample = await prisma.$queryRaw`
  WITH fv_regs AS (
    SELECT DISTINCT registrationId
    FROM dbo.forecast_values
    WHERE versionName = ${version}
      AND period >= '2026-07-01' AND period < '2026-11-01'
      AND qtyFcst <> 0
  ),
  dim_regs AS (
    SELECT CAST(NewKey AS NVARCHAR(200)) AS registrationId
    FROM dbo.DimRegistration
    WHERE MainRegist = 1
  )
  SELECT TOP 10 f.registrationId
  FROM fv_regs f
  LEFT JOIN dim_regs d ON d.registrationId = f.registrationId
  WHERE d.registrationId IS NULL
`;
console.log('Orphan sample', orphanSample);

if (sampleMonth.length > 0) {
  const row = sampleMonth[0];
  const monthPeriod = formatForecastPeriodForApi(row.period, 'month');
  const weekPeriod = firstWednesdayPeriod(monthPeriod);
  console.log('Lookup keys for sample row:', {
    registrationId: row.registrationId,
    monthPeriod,
    weekPeriod,
  });
}

await prisma.$disconnect();
