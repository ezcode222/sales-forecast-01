import prisma from '../src/db/prisma.ts';

const tables = await prisma.$queryRaw`
  SELECT TABLE_NAME, TABLE_TYPE
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'dbo'
    AND (TABLE_NAME LIKE '%customer%' OR TABLE_NAME LIKE '%DimRegistration%' OR TABLE_NAME LIKE '%hr_employee%')
  ORDER BY TABLE_NAME
`;

const views = await prisma.$queryRaw`
  SELECT TABLE_NAME AS viewName
  FROM INFORMATION_SCHEMA.VIEWS
  WHERE TABLE_SCHEMA = 'dbo'
    AND (TABLE_NAME LIKE '%customer%' OR TABLE_NAME LIKE '%DimRegistration%')
  ORDER BY TABLE_NAME
`;

const cacheCount = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM dbo.customer_master_cache`;
const sample = await prisma.$queryRaw`SELECT TOP 3 custCode, customerName FROM dbo.customer_master_cache`;

console.log('=== Local tables (customer/dim/hr) ===');
console.log(JSON.stringify(tables, null, 2));
console.log('\n=== Local views (customer/dim) ===');
console.log(JSON.stringify(views, null, 2));
console.log('\n=== customer_master_cache ===');
console.log('Rows:', cacheCount);
console.log('Sample:', JSON.stringify(sample, null, 2));

await prisma.$disconnect();
