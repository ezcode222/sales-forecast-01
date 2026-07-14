import prisma from '../src/db/prisma.ts';
import { findRegistrationMatches } from '../src/api/services/forecastImport/matching.ts';

const key = '12036/52649/81146/UBJ/400116/On';
const matches = await findRegistrationMatches([key]);
console.log('matches:', matches.get(key)?.map(m => ({
  id: m.registrationId,
  key: m.keyForNoCRM,
  plant: m.plant,
})));

const managed = await prisma.masterDataCrmRegistration.findMany({
  where: {
    OR: [
      { keyForNoCRM: key },
      { keyForNoCRM: { contains: '12036/52649/81146' } },
    ],
  },
  select: { id: true, newKey: true, keyForNoCRM: true, createdBy: true, plantCode: true },
});
console.log('managed:', managed);

const assertSrc = await import('node:fs').then(fs =>
  fs.readFileSync('src/api/services/forecastImport/confirmImport.ts', 'utf8')
);
console.log('assert uses matches[0] only:', assertSrc.includes('matches.length === 0 || matches[0].registrationId'));
console.log('assert still requires unique:', assertSrc.includes('matches.length !== 1'));

await prisma.$disconnect();
