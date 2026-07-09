import prisma from '../src/db/prisma.ts';

const sut = await prisma.masterDataCrmRegistration.findFirst({
  where: { keyForNoCRM: '9116/50399/80443/1108/400139/On' },
  select: { endUser: true, endUserCode: true, ownerName: true, createdBy: true },
});
console.log(sut);
await prisma.$disconnect();
