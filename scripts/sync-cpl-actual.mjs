import {
  ACTUAL_SALES_VIEW,
  getCplActualPriceCount,
  syncCplActualPrices,
} from '../src/api/services/cplActualSync.ts';
import prisma from '../src/db/prisma.ts';

console.log('=== CPL Actual Sync ===');
console.log('Source:', ACTUAL_SALES_VIEW);
console.log('Target: price_management_values (priceType=Actual, versionName=GLOBAL)');

const before = await getCplActualPriceCount().catch(() => -1);
console.log('Actual rows before:', before);

const result = await syncCplActualPrices();
console.log('\nSync result:', result);

if (!result.ok) {
  console.log('\n*** SYNC FAILED ***');
  console.log('Error:', result.error);
  process.exit(1);
}

const after = await getCplActualPriceCount();
console.log('Actual rows after:', after);

const sample = await prisma.$queryRawUnsafe(`
  SELECT TOP 8 month, cplPrice, naphthaPrice, benzenePrice
  FROM dbo.price_management_values
  WHERE priceType = N'Actual' AND versionName = N'GLOBAL'
  ORDER BY month DESC
`);
console.log('\nLatest Actual CPL rows:');
for (const row of sample) {
  console.log(`  ${row.month}: CPL ${row.cplPrice}`);
}

await prisma.$disconnect();
