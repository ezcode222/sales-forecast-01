import prisma from '../src/db/prisma.ts';

const withCode = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM dbo.master_data_crm_registrations m
  WHERE m.createdBy = 'excel-import'
    AND m.soldToCode IS NOT NULL AND m.soldToCode <> '0'
`);
const missingName = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM dbo.master_data_crm_registrations m
  WHERE m.createdBy = 'excel-import'
    AND m.soldToCode IS NOT NULL AND m.soldToCode <> '0'
    AND ISNULL(m.soldToName, '') = ''
`);
const mismatch = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS cnt
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.SoldToCode IS NOT NULL AND d.SoldToCode <> '0'
    AND ISNULL(d.SoldTo_name, '') <> ISNULL(m.soldToName, '')
`);
const samples = await prisma.$queryRawUnsafe(`
  SELECT TOP 5 d.SoldToCode, d.SoldTo_name AS dimName, m.soldToName AS managedName
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.SoldToCode IS NOT NULL AND d.SoldToCode <> '0'
    AND ISNULL(d.SoldTo_name, '') <> ISNULL(m.soldToName, '')
`);

console.log('excel-import with soldToCode:', Number(withCode[0]?.cnt ?? 0));
console.log('missing soldToName in managed:', Number(missingName[0]?.cnt ?? 0));
console.log('Dim vs managed soldTo name mismatch:', Number(mismatch[0]?.cnt ?? 0));
if (samples.length > 0) console.log('samples:', samples);

await prisma.$disconnect();
