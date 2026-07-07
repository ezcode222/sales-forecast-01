// Repair master_data_crm_registrations codes/names from Excel keys.
// Dry run: node --env-file=.env scripts/repair-managed-registrations.mjs
// Apply:    node --env-file=.env scripts/repair-managed-registrations.mjs --apply
import {
  buildRepairManagedRegistrationData,
  isLikelyPlantCode,
  isLikelyRegistrationCode,
} from '../src/api/services/forecastImport/autoCreateRegistrations.ts';
import prisma from '../src/db/prisma.ts';

const apply = process.argv.includes('--apply');

function rowChanged(before, after) {
  const fields = [
    'newKey',
    'keyForNoCRM',
    'registrationTopic',
    'soldToCode',
    'shipToCode',
    'endUserCode',
    'plantCode',
    'materialCode',
    'onOffSpec',
    'ownerName',
    'soldToName',
    'shipToName',
    'endUser',
    'plantName',
    'countryName',
    'businessUnit',
  ];
  return fields.some(field => (before[field] ?? null) !== (after[field] ?? null));
}

async function main() {
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

  let changed = 0;
  let unchanged = 0;
  let invalidAfterRepair = 0;
  const samples = [];

  for (const row of rows) {
    const repaired = buildRepairManagedRegistrationData({
      ...row,
      hasImportedPrice: row.priceFormula === 'Fixed Price',
    });
    const updateData = {
      newKey: repaired.newKey,
      keyForNoCRM: repaired.keyForNoCRM,
      registrationTopic: repaired.registrationTopic,
      soldToCode: repaired.soldToCode,
      shipToCode: repaired.shipToCode,
      endUserCode: repaired.endUserCode,
      plantCode: repaired.plantCode,
      materialCode: repaired.materialCode,
      onOffSpec: repaired.onOffSpec,
      ownerName: repaired.ownerName,
      soldToName: repaired.soldToName,
      shipToName: repaired.shipToName,
      endUser: repaired.endUser,
      plantName: repaired.plantName,
      countryName: repaired.countryName,
      businessUnit: repaired.businessUnit,
    };

    if (!rowChanged(row, updateData)) {
      unchanged += 1;
      continue;
    }

    const stillBad =
      !isLikelyPlantCode(updateData.plantCode) && updateData.plantCode !== '0'
      || (!isLikelyRegistrationCode(updateData.soldToCode) && updateData.soldToCode !== '0');
    if (stillBad) invalidAfterRepair += 1;

    changed += 1;
    if (samples.length < 5) {
      samples.push({
        id: row.id,
        before: {
          ownerName: row.ownerName,
          soldToCode: row.soldToCode,
          plantCode: row.plantCode,
          soldToName: row.soldToName,
          plantName: row.plantName,
          countryName: row.countryName,
        },
        after: {
          ownerName: updateData.ownerName,
          soldToCode: updateData.soldToCode,
          plantCode: updateData.plantCode,
          soldToName: updateData.soldToName,
          plantName: updateData.plantName,
          countryName: updateData.countryName,
          registrationTopic: updateData.registrationTopic,
        },
      });
    }

    if (apply) {
      await prisma.masterDataCrmRegistration.update({
        where: { id: row.id },
        data: updateData,
      });
    }
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Total managed rows: ${rows.length}`);
  console.log(`Rows to update: ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Still suspicious after repair: ${invalidAfterRepair}`);
  console.log('Sample changes:', JSON.stringify(samples, null, 2));

  if (!apply && changed > 0) {
    console.log('\nRe-run with --apply to persist fixes.');
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
