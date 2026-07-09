import prisma from '../src/db/prisma.ts';

const crmDoor = await prisma.$queryRawUnsafe(`
  SELECT TOP 8 Cat1Name, Cat2Name, Cat3Name, MaterialCode
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND Cat2Name = 'INJ_Door System'
`);

const crmCombo = await prisma.$queryRawUnsafe(`
  SELECT TOP 8 Cat1Name, Cat2Name, Cat3Name, MaterialCode
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND Cat2Name = 'INJ_Combination Switch'
`);

const crm2w = await prisma.$queryRawUnsafe(`
  SELECT TOP 8 Cat1Name, Cat2Name, Cat3Name, MaterialCode
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE MainRegist = 1 AND Cat2Name = 'INJ_2W' AND Cat3Name = 'INJ_2W'
`);

const importRows = await prisma.$queryRawUnsafe(`
  SELECT Cat1Name, Cat2Name, Cat3Name, COUNT(*) AS cnt
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND ISNULL(d.Cat1Name,'') <> ''
  GROUP BY Cat1Name, Cat2Name, Cat3Name
  ORDER BY cnt DESC
`);

const combos248 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(DISTINCT CONCAT(ISNULL(Cat1Name,''),'|',ISNULL(Cat2Name,''),'|',ISNULL(Cat3Name,''))) AS combos,
         COUNT(*) AS rows
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND ISNULL(d.Cat1Name,'') <> ''
`);

console.log('=== CRM when Cat2Name = INJ_Door System ===');
console.log(JSON.stringify(crmDoor, null, 2));
console.log('\n=== CRM when Cat2Name = INJ_Combination Switch ===');
console.log(JSON.stringify(crmCombo, null, 2));
console.log('\n=== CRM INJ_2W sample ===');
console.log(JSON.stringify(crm2w, null, 2));
console.log('\n=== Import distinct Cat combos (top) ===');
console.log(JSON.stringify(importRows.slice(0, 15), null, 2));
console.log('\n=== 248-style count ===', combos248);

await prisma.$disconnect();
