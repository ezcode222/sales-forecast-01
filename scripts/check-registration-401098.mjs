import prisma from '../src/db/prisma.ts';

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: {
    OR: [
      { materialCode: '401098' },
      { ownerName: '2026' },
      { plantName: { contains: 'India' } },
    ],
    createdBy: 'excel-import',
  },
  select: {
    id: true,
    ownerName: true,
    plantName: true,
    plantCode: true,
    soldToCode: true,
    shipToCode: true,
    endUserCode: true,
    countryName: true,
    soldToName: true,
    shipToName: true,
    endUser: true,
    keyForNoCRM: true,
    newKey: true,
    materialDescription: true,
    materialCode: true,
    createdAt: true,
  },
  take: 10,
  orderBy: { createdAt: 'desc' },
});

console.log(`Found ${rows.length} rows`);
for (const row of rows) {
  console.log('---');
  console.log(JSON.stringify(row, null, 2));
}

await prisma.$disconnect();
