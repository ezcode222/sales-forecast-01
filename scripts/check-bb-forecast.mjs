import prisma from '../src/db/prisma.ts';

const samples = await prisma.forecastValue.findMany({
  where: { versionName: 'BB FY26', granularity: 'month' },
  take: 8,
  orderBy: [{ period: 'asc' }, { registrationId: 'asc' }],
  select: { registrationId: true, period: true, qtyFcst: true },
});
console.log('BB FY26 samples:', samples);

const count = await prisma.forecastValue.count({ where: { versionName: 'BB FY26' } });
console.log('total BB rows:', count);

const julTotal = await prisma.$queryRaw`
  SELECT SUM(CAST(qtyFcst AS FLOAT)) AS total
  FROM dbo.forecast_values
  WHERE versionName = N'BB FY26'
    AND granularity = N'month'
    AND period >= '2026-07-01'
    AND period < '2026-08-01'
`;
console.log('jul 2026 total qty:', julTotal);

const regPage = await prisma.$queryRaw`
  SELECT TOP 3 CAST(NewKey AS NVARCHAR(200)) AS id
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND NewKey IS NOT NULL
`;
const regIds = regPage.map(r => r.id);
if (regIds.length > 0) {
  const match = await prisma.forecastValue.findMany({
    where: {
      versionName: 'BB FY26',
      registrationId: { in: regIds },
      period: { gte: new Date('2026-07-01'), lt: new Date('2026-08-01') },
    },
    take: 5,
  });
  console.log('BB for first 3 regs jul:', match);
}

await prisma.$disconnect();
