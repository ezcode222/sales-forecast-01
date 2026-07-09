import prisma from '../src/db/prisma.ts';

const wrongCat1Prefix = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS rows
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND (d.Cat1Name LIKE 'INJ[_]%' OR d.Cat1Name LIKE 'EXT[_]%')
`);

const correctCat1 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS rows
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.Cat1Name IN ('Injection', 'Extrusion')
`);

const totalWithCat = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS rows
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND ISNULL(d.Cat1Name,'') <> ''
`);

const samplesWrong = await prisma.$queryRawUnsafe(`
  SELECT TOP 12 d.Cat1Name, d.Cat2Name, d.Cat3Name
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND (d.Cat1Name LIKE 'INJ[_]%' OR d.Cat1Name LIKE 'EXT[_]%')
  ORDER BY d.Cat1Name
`);

const samplesRight = await prisma.$queryRawUnsafe(`
  SELECT TOP 8 d.Cat1Name, d.Cat2Name, d.Cat3Name
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.Cat1Name IN ('Injection', 'Extrusion')
`);

const dupCombos = await prisma.$queryRawUnsafe(`
  SELECT d.Cat1Name, d.Cat2Name, d.Cat3Name, COUNT(*) AS cnt
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND (d.Cat1Name LIKE 'INJ[_]%' OR d.Cat1Name LIKE 'EXT[_]%')
  GROUP BY d.Cat1Name, d.Cat2Name, d.Cat3Name
  HAVING COUNT(*) > 1
  ORDER BY cnt DESC
`);

console.log('Import rows with Cat1 filled:', totalWithCat);
console.log('Cat1 = Injection/Extrusion (CRM-style):', correctCat1);
console.log('Cat1 = INJ_/EXT_ prefix (shifted/wrong for PBI):', wrongCat1Prefix);
console.log('\nWrong samples (Sureeporn table):');
console.log(JSON.stringify(samplesWrong, null, 2));
console.log('\nCorrect-style samples:');
console.log(JSON.stringify(samplesRight, null, 2));
console.log('\nDuplicate combos (wrong pattern):', dupCombos.length);
console.log(JSON.stringify(dupCombos.slice(0, 8), null, 2));

await prisma.$disconnect();
