import prisma from '../src/db/prisma.ts';

const cat1Bad = await prisma.$queryRawUnsafe(`
  SELECT TOP 30 Cat1Name, COUNT(*) c
  FROM dbo.DimRegistration
  WHERE Cat1Name NOT IN ('Injection','Extrusion')
    AND Cat1Name IS NOT NULL AND Cat1Name <> ''
    AND Cat1Name NOT LIKE 'INJ[_]%'
    AND Cat1Name NOT LIKE 'EXT[_]%'
  GROUP BY Cat1Name ORDER BY c DESC
`);

const cat3Company = await prisma.$queryRawUnsafe(`
  SELECT TOP 30 Cat3Name, COUNT(*) c
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND (Cat3Name LIKE '%LIMITED%' OR Cat3Name LIKE '%AMCOR%' OR Cat3Name LIKE '%LTD%')
  GROUP BY Cat3Name ORDER BY c DESC
`);

const importCats = await prisma.$queryRawUnsafe(`
  SELECT process, application, subApp, COUNT(*) c
  FROM dbo.master_data_crm_registrations
  WHERE createdBy='excel-import'
    AND (subApp LIKE '%AMCOR%' OR subApp LIKE '%LIMITED%' OR application LIKE '%AMCOR%')
  GROUP BY process, application, subApp
`);

console.log('Cat1 not Injection/Extrusion:', JSON.stringify(cat1Bad, null, 2));
console.log('Import Cat3 with company names:', JSON.stringify(cat3Company, null, 2));
console.log('Import rows company in cats:', JSON.stringify(importCats, null, 2));

await prisma.$disconnect();
