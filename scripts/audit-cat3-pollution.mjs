import prisma from '../src/db/prisma.ts';

const cat3EqualsEndUser = await prisma.$queryRawUnsafe(`
  SELECT TOP 30 d.Cat3Name, d.End_user, d.Cat1Name, d.Cat2Name, m.createdBy
  FROM dbo.DimRegistration d
  LEFT JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE d.Cat3Name IS NOT NULL AND d.Cat3Name <> ''
    AND d.End_user IS NOT NULL AND d.End_user <> ''
    AND d.Cat3Name = d.End_user
`);

const cat3LikeCompany = await prisma.$queryRawUnsafe(`
  SELECT TOP 30 d.Cat3Name, COUNT(*) c
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import'
    AND d.Cat3Name IS NOT NULL
    AND (
      d.Cat3Name LIKE '%LIMITED%'
      OR d.Cat3Name LIKE '%LTD%'
      OR d.Cat3Name LIKE '%CO.,%'
      OR d.Cat3Name LIKE '%CO.%'
      OR d.Cat3Name LIKE '%(%'
    )
  GROUP BY d.Cat3Name
  ORDER BY c DESC
`);

const nullCat3Import = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS c
  FROM dbo.DimRegistration d
  INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE m.createdBy = 'excel-import' AND (d.Cat3Name IS NULL OR d.Cat3Name = '')
`);

console.log('Cat3 = End_user (same string):', JSON.stringify(cat3EqualsEndUser, null, 2));
console.log('Import Cat3 company-like:', JSON.stringify(cat3LikeCompany, null, 2));
console.log('Import null Cat3:', nullCat3Import);

await prisma.$disconnect();
