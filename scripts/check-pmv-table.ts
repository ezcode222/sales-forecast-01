import prisma from '../src/db/prisma';

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME IN ('price_management_values', 'cpl_prices', 'overplan_config', 'forecast_cc_recipients')
    ORDER BY TABLE_NAME
  `);

  const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date }>>(`
    SELECT TOP 15 migration_name, finished_at
    FROM dbo._prisma_migrations
    ORDER BY finished_at DESC
  `);

  const pmvCount = await prisma.$queryRawUnsafe<Array<{ cnt: number }>>(`
    SELECT COUNT(*) AS cnt FROM dbo.price_management_values
  `);

  const sample = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
    SELECT TOP 5 month, priceType, versionName, cplPrice, naphthaPrice, benzenePrice
    FROM dbo.price_management_values
    ORDER BY month
  `);

  console.log('Tables found:', tables.map(t => t.TABLE_NAME));
  console.log('price_management_values rows:', pmvCount[0]?.cnt ?? 0);
  console.log('Sample rows:', sample);
  console.log('Recent migrations:', migrations.map(m => m.migration_name));
}

main()
  .catch(error => {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
