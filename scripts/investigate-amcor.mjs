import prisma from '../src/db/prisma.ts';

const dim = await prisma.$queryRawUnsafe(`
  SELECT TOP 30
    d.NewKey, d.Cat1Name, d.Cat2Name, d.Cat3Name,
    d.SoldToCode, d.SoldTo_name, d.ShipToCode, d.ShipTo_name,
    d.EndUserCode, d.End_user, d.PlantCode, d.PlantName,
    d.MaterialCode, d.MaterialDescription, d.OwnerName
  FROM dbo.DimRegistration d
  WHERE d.SoldTo_name LIKE '%AMCOR%'
     OR d.ShipTo_name LIKE '%AMCOR%'
     OR d.End_user LIKE '%AMCOR%'
     OR d.Cat1Name LIKE '%AMCOR%' OR d.Cat2Name LIKE '%AMCOR%' OR d.Cat3Name LIKE '%AMCOR%'
     OR d.PlantName LIKE '%AMCOR%'
     OR d.SoldToCode LIKE '%AMCOR%' OR d.ShipToCode LIKE '%AMCOR%' OR d.EndUserCode LIKE '%AMCOR%'
     OR d.PlantCode LIKE '%AMCOR%'
`);

const managed = await prisma.$queryRawUnsafe(`
  SELECT id, newKey, soldToCode, soldToName, shipToCode, shipToName,
    endUserCode, endUser, plantCode, plantName,
    process, application, subApp, materialCode, createdBy
  FROM dbo.master_data_crm_registrations
  WHERE soldToName LIKE '%AMCOR%' OR shipToName LIKE '%AMCOR%' OR endUser LIKE '%AMCOR%'
     OR soldToCode LIKE '%AMCOR%' OR shipToCode LIKE '%AMCOR%' OR endUserCode LIKE '%AMCOR%'
     OR plantCode LIKE '%AMCOR%' OR plantName LIKE '%AMCOR%'
     OR process LIKE '%AMCOR%' OR application LIKE '%AMCOR%' OR subApp LIKE '%AMCOR%'
`);

const crm = await prisma.$queryRawUnsafe(`
  SELECT TOP 20 NewKey, SoldToCode, SoldTo_name, ShipToCode, ShipTo_name,
    EndUserCode, End_user, PlantCode, Cat1Name, Cat2Name, Cat3Name
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE SoldTo_name LIKE '%AMCOR%' OR ShipTo_name LIKE '%AMCOR%' OR End_user LIKE '%AMCOR%'
     OR SoldToCode LIKE '%AMCOR%'
`);

const master = await prisma.$queryRawUnsafe(`
  SELECT custCode, customerName FROM dbo.customer_master_cache
  WHERE customerName LIKE '%AMCOR%' OR custCode LIKE '%AMCOR%'
`);

const wrongCode = await prisma.$queryRawUnsafe(`
  SELECT TOP 30 d.SoldToCode, d.SoldTo_name, d.ShipToCode, d.ShipTo_name, d.EndUserCode, d.End_user, m.createdBy
  FROM dbo.DimRegistration d
  LEFT JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE d.SoldTo_name LIKE '%LIMITED%'
     OR d.ShipTo_name LIKE '%LIMITED%'
     OR d.End_user LIKE '%LIMITED%'
     OR d.SoldToCode LIKE '%LIMITED%'
     OR d.ShipToCode LIKE '%LIMITED%'
     OR d.EndUserCode LIKE '%LIMITED%'
`);

console.log('=== DimRegistration AMCOR ===', JSON.stringify(dim, null, 2));
console.log('=== managed AMCOR ===', JSON.stringify(managed, null, 2));
console.log('=== CRM AMCOR ===', JSON.stringify(crm, null, 2));
console.log('=== customer_master AMCOR ===', JSON.stringify(master, null, 2));
console.log('=== LIMITED in code fields ===', JSON.stringify(wrongCode, null, 2));

await prisma.$disconnect();
