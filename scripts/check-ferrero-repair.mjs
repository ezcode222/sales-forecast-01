import {
  buildRepairManagedRegistrationData,
} from '../src/api/services/forecastImport/autoCreateRegistrations.ts';
import prisma from '../src/db/prisma.ts';

const row = await prisma.masterDataCrmRegistration.findFirst({
  where: { materialCode: '401098', keyForNoCRM: '///1110/401098/On' },
});
if (!row) {
  console.log('401098 Ferrero row not found');
  process.exit(0);
}
const repaired = buildRepairManagedRegistrationData({
  ...row,
  hasImportedPrice: row.priceFormula === 'Fixed Price',
});
console.log('BEFORE', {
  ownerName: row.ownerName,
  plantCode: row.plantCode,
  plantName: row.plantName,
  countryName: row.countryName,
  soldToCode: row.soldToCode,
  shipToCode: row.shipToCode,
  endUser: row.endUser,
  shipToName: row.shipToName,
});
console.log('AFTER', {
  ownerName: repaired.ownerName,
  plantCode: repaired.plantCode,
  plantName: repaired.plantName,
  countryName: repaired.countryName,
  soldToCode: repaired.soldToCode,
  shipToCode: repaired.shipToCode,
  endUser: repaired.endUser,
  shipToName: repaired.shipToName,
});
await prisma.$disconnect();
