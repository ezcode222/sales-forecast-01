import prisma from '../src/db/prisma.ts';

const versions = await prisma.forecastVersion.findMany();
console.log('versions:', versions.map(v => v.name));

const crm = await prisma.$queryRaw`
  SELECT TOP 1 CAST(NewKey AS NVARCHAR(200)) AS nk, CAST(KeyforNoCRM AS NVARCHAR(500)) AS k
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE KeyforNoCRM = N'10976/10976/80537/1104/400212/Off' AND MainRegist = 1
`;
console.log('crm 400212:', crm[0]);

if (crm[0]?.nk) {
  const fc = await prisma.forecastValue.findFirst({
    where: {
      registrationId: String(crm[0].nk),
      versionName: 'BB FY26',
      period: new Date('2026-04-01'),
    },
  });
  console.log('forecast 400212 Apr:', fc ? {
    qty: Number(fc.qtyFcst),
    price: Number(fc.priceFcst),
    amount: Number(fc.amountFcst),
  } : null);
}

const managed = await prisma.masterDataCrmRegistration.findFirst({
  where: { keyForNoCRM: '///1110/401098/On' },
});
if (managed) {
  const fc = await prisma.forecastValue.findFirst({
    where: {
      registrationId: managed.id,
      versionName: 'BB FY26',
      period: new Date('2026-10-01'),
    },
  });
  console.log('ferrero Oct forecast:', fc ? Number(fc.qtyFcst) : null);
}

await prisma.$disconnect();
