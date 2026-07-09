import prisma from '../src/db/prisma.ts';

for (const code of ['80002', '81062', '11787', '52285', '52528']) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT EndUserCode, End_user, ShipToCode, ShipTo_name, SoldToCode, SoldTo_name
    FROM dbo.DimRegistration
    WHERE SoldToCode = '${code}' OR ShipToCode = '${code}' OR EndUserCode = '${code}'
  `);
  const master = await prisma.$queryRawUnsafe(`
    SELECT custCode, customerName FROM dbo.customer_master_cache WHERE custCode = '${code}'
  `);
  console.log(`\n=== Code ${code} ===`);
  console.log('Dim:', JSON.stringify(rows, null, 2));
  console.log('Master:', JSON.stringify(master, null, 2));
}

const multi = await prisma.$queryRawUnsafe(`
  SELECT EndUserCode, End_user, COUNT(*) AS c
  FROM dbo.DimRegistration
  WHERE EndUserCode IN ('80002','81062')
  GROUP BY EndUserCode, End_user
  ORDER BY EndUserCode, End_user
`);
console.log('\n=== End user name variants ===', JSON.stringify(multi, null, 2));

await prisma.$disconnect();
