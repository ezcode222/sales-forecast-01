import prisma from '../src/db/prisma.ts';

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: { createdBy: 'excel-import' },
  select: { countryName: true, plantName: true, ownerName: true },
});
const plantNames = new Set();
const countryNames = new Set();
let ownerYears = 0;
for (const row of rows) {
  if (row.plantName) plantNames.add(row.plantName);
  if (row.countryName) countryNames.add(row.countryName);
  if (/^20\d{2}$/.test(row.ownerName ?? '')) ownerYears += 1;
}
console.log('plantName values:', [...plantNames].sort().join(', '));
console.log('countryName values:', [...countryNames].sort().join(', '));
console.log('owner is year:', ownerYears, '/', rows.length);
await prisma.$disconnect();
