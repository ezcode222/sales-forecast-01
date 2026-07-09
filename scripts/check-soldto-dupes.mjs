import prisma from '../src/db/prisma.ts';

const dupes = await prisma.$queryRaw`
  SELECT TOP 20 d.SoldToCode, COUNT(DISTINCT d.SoldTo_name) AS nameCount, COUNT(*) AS regCount
  FROM dbo.DimRegistration d
  WHERE d.SoldToCode IS NOT NULL AND d.SoldToCode <> '0'
  GROUP BY d.SoldToCode
  HAVING COUNT(DISTINCT d.SoldTo_name) > 1
  ORDER BY nameCount DESC, regCount DESC
`;

console.log('SoldToCode with multiple names:', dupes.length);
console.log(JSON.stringify(dupes.slice(0, 15), null, 2));

const emptyPlant = await prisma.$queryRaw`
  SELECT COUNT(*) AS c FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND (d.PlantCode IS NULL OR d.PlantCode = '0' OR d.PlantCode = '')
`;
console.log('\nExcel-import rows with empty/zero PlantCode:', emptyPlant);

await prisma.$disconnect();
