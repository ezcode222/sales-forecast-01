import prisma from '../src/db/prisma.ts';

const materials = ['400212', '400916'];
for (const material of materials) {
  const rows = await prisma.$queryRaw`
    SELECT TOP 5
      CAST(KeyforNoCRM AS NVARCHAR(500)) AS keyForNoCRM,
      CAST(MainRegist AS INT) AS mainRegist,
      CAST(MaterialCode AS NVARCHAR(100)) AS materialCode,
      CAST(ISNULL(PlantName, PlantCode) AS NVARCHAR(200)) AS plant,
      CAST(OnOffSpec AS NVARCHAR(100)) AS onOff
    FROM dbo.VW_CRM_RegistrationAll_1
    WHERE MaterialCode = ${material}
      AND (CAST(ShipTo_name AS NVARCHAR(200)) LIKE '%10976%'
        OR CAST(End_user AS NVARCHAR(200)) LIKE '%80537%')
  `;
  console.log(`CRM matches for ${material}:`, rows);
}

const exact = await prisma.$queryRaw`
  SELECT CAST(KeyforNoCRM AS NVARCHAR(500)) AS keyForNoCRM, CAST(MainRegist AS INT) AS mainRegist
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE KeyforNoCRM IN (
    N'10976/10976/80537/1104/400212/Off',
    N'10976/10976/80537/1104/400916/Off'
  )
`;
console.log('Exact key lookup:', exact);

process.exit(0);
