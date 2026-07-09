import prisma from '../src/db/prisma.ts';

const crmSample = await prisma.$queryRawUnsafe(`
  SELECT TOP 15
    Cat1Name, Cat2Name, Cat3Name,
    MaterialCode, PlantCode, OwnerName
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1
    AND (Cat1Name LIKE 'INJ_%' OR Cat2Name LIKE '%Door%' OR Cat3Name = 'TOYO DENSO')
  ORDER BY Cat1Name, Cat2Name
`);

const importSample = await prisma.$queryRawUnsafe(`
  SELECT TOP 15
    process, application, subApp,
    materialCode, plantCode, ownerName, createdBy
  FROM dbo.master_data_crm_registrations
  WHERE createdBy = 'excel-import'
    AND (process LIKE 'INJ_%' OR application LIKE '%Door%' OR subApp = 'TOYO DENSO')
  ORDER BY process, application
`);

const dimImportCats = await prisma.$queryRawUnsafe(`
  SELECT TOP 20
    d.Cat1Name, d.Cat2Name, d.Cat3Name,
    m.process AS managedProcess,
    m.application AS managedApp,
    m.subApp AS managedSubApp
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.Cat1Name IS NOT NULL AND d.Cat1Name <> ''
  ORDER BY d.Cat1Name
`);

const distinctImportCat1 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(DISTINCT Cat1Name) AS distinctCat1, COUNT(*) AS rows
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND d.Cat1Name IS NOT NULL AND d.Cat1Name <> ''
`);

const distinctCrmCat1 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(DISTINCT Cat1Name) AS distinctCat1, COUNT(*) AS rows
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND Cat1Name IS NOT NULL AND Cat1Name <> ''
`);

const inBoth = await prisma.$queryRawUnsafe(`
  SELECT
    d.Cat1Name AS dimCat1,
    d.Cat2Name AS dimCat2,
    d.Cat3Name AS dimCat3,
    c.Cat1Name AS crmCat1,
    c.Cat2Name AS crmCat2,
    c.Cat3Name AS crmCat3
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  INNER JOIN dbo.VW_CRM_RegistrationAll_1 c ON c.KeyforNoCRM = d.KeyforNoCRM AND c.MainRegist = 1
  WHERE m.createdBy = 'excel-import'
    AND (
      ISNULL(d.Cat1Name,'') <> ISNULL(c.Cat1Name,'')
      OR ISNULL(d.Cat2Name,'') <> ISNULL(c.Cat2Name,'')
      OR ISNULL(d.Cat3Name,'') <> ISNULL(c.Cat3Name,'')
    )
`);

console.log('=== CRM sample (VW_CRM_RegistrationAll_1) ===');
console.log(JSON.stringify(crmSample, null, 2));
console.log('\n=== excel-import managed (process/application/subApp) ===');
console.log(JSON.stringify(importSample, null, 2));
console.log('\n=== DimRegistration vs managed fields ===');
console.log(JSON.stringify(dimImportCats.slice(0, 8), null, 2));
console.log('\n=== Distinct Cat1 counts ===');
console.log('import via Dim:', distinctImportCat1);
console.log('CRM:', distinctCrmCat1);
console.log('\n=== Same key, different Cat values (import vs CRM):', inBoth.length);
console.log(JSON.stringify(inBoth.slice(0, 8), null, 2));

await prisma.$disconnect();
