import prisma from '../src/db/prisma.ts';

const rows = await prisma.$queryRaw`
  SELECT TOP 30 d.MaterialDescription, d.MaterialCode, m.materialDescription AS managedDesc
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND d.MaterialDescription LIKE 'Material %'
`;

console.log(JSON.stringify(rows, null, 2));
await prisma.$disconnect();
