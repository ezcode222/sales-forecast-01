import prisma from '../src/db/prisma.ts';

const crmIds = await prisma.$queryRaw`
  SELECT TOP 5 CAST(NewKey AS NVARCHAR(200)) AS newKey
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND NewKey IS NOT NULL
`;
const bbIds = await prisma.$queryRaw`
  SELECT TOP 10 registrationId, COUNT(*) AS cnt
  FROM dbo.forecast_values
  WHERE versionName = N'BB FY26'
  GROUP BY registrationId
  ORDER BY COUNT(*) DESC
`;
console.log('CRM NewKey samples:', crmIds);

const bbSampleIds = bbIds.map(r => String(r.registrationId));
const matchCrm = await prisma.$queryRawUnsafe(`
  SELECT CAST(NewKey AS NVARCHAR(200)) AS newKey, CAST(NewKey AS NVARCHAR(200)) AS registrationId
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE NewKey IN (${bbSampleIds.map(id => `N'${id.replace(/'/g, "''")}'`).join(',')})
`);
console.log('BB reg ids matching CRM NewKey:', matchCrm.length, 'of', bbSampleIds.length);

const matchManaged = await prisma.masterDataCrmRegistration.findMany({
  where: { id: { in: bbSampleIds } },
  select: { id: true, newKey: true },
  take: 10,
});
console.log('BB reg ids matching managed.id:', matchManaged);

const julByCrm = await prisma.$queryRaw`
  SELECT TOP 5 f.registrationId, f.qtyFcst, r.NewKey
  FROM dbo.forecast_values f
  INNER JOIN dbo.VW_CRM_RegistrationAll_1 r ON CAST(r.NewKey AS NVARCHAR(200)) = f.registrationId
  WHERE f.versionName = N'BB FY26'
    AND f.granularity = N'month'
    AND f.period >= '2026-07-01' AND f.period < '2026-08-01'
    AND f.qtyFcst > 0
`;
console.log('BB jul rows joined to CRM NewKey:', julByCrm);

const julByUuid = await prisma.$queryRaw`
  SELECT TOP 5 f.registrationId, f.qtyFcst
  FROM dbo.forecast_values f
  WHERE f.versionName = N'BB FY26'
    AND f.granularity = N'month'
    AND f.period >= '2026-07-01' AND f.period < '2026-08-01'
    AND f.qtyFcst > 0
`;
console.log('BB jul sample rows (raw ids):', julByUuid);

await prisma.$disconnect();
