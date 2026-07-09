import prisma from '../src/db/prisma.ts';

const dimExcel = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
`);
const managedExcel = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c FROM dbo.master_data_crm_registrations WHERE createdBy = 'excel-import'
`);
const managedAll = await prisma.$queryRawUnsafe(`
  SELECT createdBy, COUNT(*) AS c FROM dbo.master_data_crm_registrations GROUP BY createdBy
`);
const fvExcel = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c
  FROM dbo.forecast_values fv
  INNER JOIN dbo.master_data_crm_registrations m ON m.id = fv.registrationId
  WHERE m.createdBy = 'excel-import'
`);

console.log('DimRegistration excel-import rows:', dimExcel);
console.log('managed excel-import rows:', managedExcel);
console.log('managed by createdBy:', managedAll);
console.log('forecast_values on excel-import:', fvExcel);

await prisma.$disconnect();
