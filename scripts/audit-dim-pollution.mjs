import prisma from '../src/db/prisma.ts';

const badPlantNames = await prisma.$queryRaw`
  SELECT d.PlantName, d.PlantCode, COUNT(*) AS c
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
  GROUP BY d.PlantName, d.PlantCode
  ORDER BY c DESC
`;

const countryLike = await prisma.$queryRaw`
  SELECT TOP 20 d.PlantName, d.PlantCode, d.CountryName, d.MaterialDescription, d.SoldToCode
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND (d.PlantName IN ('China','India','Thailand','UBJ','0') OR d.PlantName LIKE '%-N' OR d.PlantCode LIKE '%-N')
`;

const materialPrefix = await prisma.$queryRaw`
  SELECT COUNT(*) AS c FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND d.MaterialDescription LIKE 'Material %'
`;

const totalManaged = await prisma.masterDataCrmRegistration.count({
  where: { createdBy: 'excel-import', mainRegist: 1 },
});

console.log('Total excel-import managed:', totalManaged);
console.log('PlantName/PlantCode distribution:', JSON.stringify(badPlantNames, null, 2));
console.log('Bad samples:', JSON.stringify(countryLike, null, 2));
console.log('Material prefix count:', materialPrefix);

await prisma.$disconnect();
