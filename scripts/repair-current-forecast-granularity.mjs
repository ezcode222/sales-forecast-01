import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const before = await prisma.$queryRaw`
  SELECT granularity, COUNT(*) cnt
  FROM dbo.forecast_values
  WHERE versionName = N'Current Forecast'
  GROUP BY granularity
`;
console.log('Before:', before);

const updated = await prisma.$executeRaw`
  UPDATE fv
  SET
    fv.period = DATEADD(
      DAY,
      (7 - (DATEDIFF(DAY, '19000103', CAST(DATEFROMPARTS(YEAR(fv.period), MONTH(fv.period), 1) AS DATE)) % 7)) % 7,
      CAST(DATEFROMPARTS(YEAR(fv.period), MONTH(fv.period), 1) AS DATE)
    ),
    fv.granularity = N'week',
    fv.updatedAt = SYSUTCDATETIME()
  FROM dbo.forecast_values fv
  WHERE fv.versionName = N'Current Forecast'
    AND fv.granularity = N'month'
`;

const after = await prisma.$queryRaw`
  SELECT granularity, COUNT(*) cnt
  FROM dbo.forecast_values
  WHERE versionName = N'Current Forecast'
  GROUP BY granularity
`;

const sample = await prisma.$queryRaw`
  SELECT TOP 3 registrationId, period, granularity, qtyFcst
  FROM dbo.forecast_values
  WHERE versionName = N'Current Forecast' AND period >= '2026-07-01' AND period < '2026-08-01'
  ORDER BY qtyFcst DESC
`;

console.log('Updated rows:', updated);
console.log('After:', after);
console.log('Sample Jul rows:', sample);

await prisma.$disconnect();
