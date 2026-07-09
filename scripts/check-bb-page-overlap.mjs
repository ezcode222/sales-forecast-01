import prisma from '../src/db/prisma.ts';

const julRows = await prisma.$queryRaw`
  SELECT registrationId, qtyFcst
  FROM dbo.forecast_values
  WHERE versionName = N'BB FY26'
    AND granularity = N'month'
    AND period >= '2026-07-01' AND period < '2026-08-01'
    AND qtyFcst > 0
`;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let uuidCount = 0;
let newKeyCount = 0;
for (const row of julRows) {
  const id = String(row.registrationId);
  if (uuidRe.test(id)) uuidCount++;
  else newKeyCount++;
}
console.log('jul BB rows with qty>0:', julRows.length, 'newKey:', newKeyCount, 'uuid:', uuidCount);

const pageIds = await prisma.$queryRaw`
  SELECT TOP 80 CAST(NewKey AS NVARCHAR(200)) AS id
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND NewKey IS NOT NULL
  ORDER BY NewKey ASC
`;
const pageIdSet = new Set(pageIds.map(r => String(r.id)));
const overlap = julRows.filter(r => pageIdSet.has(String(r.registrationId)));
console.log('jul BB qty>0 overlapping first 80 CRM page:', overlap.length);
if (overlap.length > 0) console.log('sample overlap:', overlap.slice(0, 3));

await prisma.$disconnect();
