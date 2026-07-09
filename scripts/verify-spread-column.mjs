import prisma from '../src/db/prisma.ts';

const managed = await prisma.masterDataCrmRegistration.findFirst({
  select: { id: true, spread: true },
});
const crmRows = await prisma.$queryRaw`
  SELECT TOP (1) CAST(r.NewKey AS NVARCHAR(200)) AS id
  FROM dbo.VW_CRM_RegistrationAll_1 r
  WHERE r.NewKey IS NOT NULL AND r.MainRegist = 1
`;
const crmId = crmRows[0]?.id;
if (!managed || !crmId) {
  console.error('Missing test rows', { managed: !!managed, crmId });
  process.exit(1);
}

const base = 'http://localhost:3001/ugt-sales-forecast/api/registrations';

async function patchSpread(id, spread) {
  const response = await fetch(`${base}/${encodeURIComponent(id)}/spread`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ spread }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

console.log('managed before', managed.id, Number(managed.spread));
const managedResult = await patchSpread(managed.id, 12.5);
console.log('managed saved', managedResult);

const managedAfter = await prisma.masterDataCrmRegistration.findUnique({
  where: { id: managed.id },
  select: { spread: true },
});
console.log('managed db', Number(managedAfter?.spread));

console.log('crm id', crmId);
const crmResult = await patchSpread(crmId, 7.25);
console.log('crm saved', crmResult);

const settings = await prisma.$queryRaw`
  SELECT spread FROM dbo.registration_price_settings WHERE registrationId = ${crmId}
`;
console.log('crm settings db', Number(settings[0]?.spread ?? 0));

const fact = await prisma.$queryRaw`
  SELECT TOP (1) [Price]
  FROM dbo.FactForecast
  WHERE [Registration Key] = ${crmId}
`;
console.log('fact price sample', fact[0]?.Price ?? 'none');

await prisma.$disconnect();
