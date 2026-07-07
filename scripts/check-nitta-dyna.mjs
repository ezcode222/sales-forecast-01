import prisma from '../src/db/prisma.ts';

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: {
    OR: [
      { keyForNoCRM: { contains: '1106' } },
      { soldToName: { contains: 'Dyna' } },
      { shipToName: { contains: 'Nitta' } },
      { endUser: { contains: 'UBJ Transfer' } },
    ],
  },
  select: {
    id: true,
    keyForNoCRM: true,
    newKey: true,
    registrationTopic: true,
    soldToCode: true,
    shipToCode: true,
    endUserCode: true,
    soldToName: true,
    shipToName: true,
    endUser: true,
    plantCode: true,
    materialCode: true,
    countryName: true,
    ownerName: true,
  },
  take: 20,
});

for (const row of rows) {
  if (
    String(row.shipToName).includes('Nitta') ||
    String(row.soldToName).includes('Dyna') ||
    String(row.keyForNoCRM).includes('///1106')
  ) {
    console.log(JSON.stringify(row, null, 2));
  }
}

await prisma.$disconnect();
