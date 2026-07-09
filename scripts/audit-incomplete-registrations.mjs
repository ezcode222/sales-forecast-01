import prisma from '../src/db/prisma.ts';
import { isIncompleteManagedRegistration } from '../src/api/services/registrationIdentity.ts';

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: { createdBy: 'excel-import' },
  select: {
    id: true,
    newKey: true,
    keyForNoCRM: true,
    soldToCode: true,
    shipToCode: true,
    endUserCode: true,
    plantCode: true,
    materialCode: true,
    createdBy: true,
  },
});

let incomplete = 0;
const samples = [];
for (const row of rows) {
  if (isIncompleteManagedRegistration(row)) {
    incomplete += 1;
    if (samples.length < 5) samples.push(row);
  }
}

console.log('excel-import total:', rows.length);
console.log('still incomplete (keys unlockable):', incomplete);
console.log('samples:', JSON.stringify(samples, null, 2));

await prisma.$disconnect();
