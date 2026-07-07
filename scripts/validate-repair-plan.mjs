import { buildRepairManagedRegistrationData } from '../src/api/services/forecastImport/autoCreateRegistrations.ts';
import prisma from '../src/db/prisma.ts';

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: { mainRegist: 1 },
  select: {
    id: true,
    newKey: true,
    keyForNoCRM: true,
    registrationTopic: true,
    soldToCode: true,
    shipToCode: true,
    endUserCode: true,
    plantCode: true,
    materialCode: true,
    onOffSpec: true,
    ownerName: true,
    materialDescription: true,
    countryName: true,
    shipToName: true,
    soldToName: true,
    endUser: true,
    plantName: true,
    process: true,
    application: true,
    subApp: true,
    priceFormula: true,
  },
});

const newKeys = new Map();
const keyForNoCrm = new Map();
let ownerYears = 0;
let ownerYearsAfter = 0;
let badPlantAfter = 0;
let badSoldToAfter = 0;
let newKeyChanges = 0;

for (const row of rows) {
  const repaired = buildRepairManagedRegistrationData({
    ...row,
    hasImportedPrice: row.priceFormula === 'Fixed Price',
  });

  if (/^20\d{2}$/.test(row.ownerName ?? '')) ownerYears += 1;
  if (/^20\d{2}$/.test(repaired.ownerName ?? '')) ownerYearsAfter += 1;

  const plant = String(repaired.plantCode ?? '').trim();
  if (plant && plant !== '0' && !/^\d{4}(-[A-Za-z0-9]+)?$/.test(plant)) badPlantAfter += 1;

  const soldTo = String(repaired.soldToCode ?? '').trim();
  if (soldTo && soldTo !== '0' && !/^\d+$/.test(soldTo)) badSoldToAfter += 1;

  if ((row.newKey ?? '') !== (repaired.newKey ?? '')) newKeyChanges += 1;

  const nk = repaired.newKey;
  if (newKeys.has(nk)) {
    console.error('DUPLICATE newKey after repair:', nk, newKeys.get(nk), row.id);
    process.exitCode = 1;
  }
  newKeys.set(nk, row.id);

  const k = repaired.keyForNoCRM;
  if (keyForNoCrm.has(k)) {
    console.error('DUPLICATE keyForNoCRM after repair:', k, keyForNoCrm.get(k), row.id);
    process.exitCode = 1;
  }
  keyForNoCrm.set(k, row.id);
}

console.log('Repair plan validation');
console.log('  Total rows:', rows.length);
console.log('  Owner is year (before):', ownerYears);
console.log('  Owner is year (after):', ownerYearsAfter);
console.log('  Bad plant codes after:', badPlantAfter);
console.log('  Bad soldTo codes after:', badSoldToAfter);
console.log('  newKey changes:', newKeyChanges);
console.log('  Unique newKeys:', newKeys.size);

if (ownerYearsAfter > 0 || badPlantAfter > 0 || badSoldToAfter > 0) {
  console.error('Repair plan still has quality issues — abort apply');
  process.exitCode = 1;
}

await prisma.$disconnect();
