// Verify DimRegistration view after migration.
// Run: node --env-file=.env scripts/verify-dim-registration.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const [dimRow] = await prisma.$queryRaw`
    SELECT COUNT(*) AS total FROM dbo.DimRegistration
  `;
  const [crmRow] = await prisma.$queryRaw`
    SELECT COUNT(*) AS total
    FROM dbo.VW_CRM_RegistrationAll_1
    WHERE NewKey IS NOT NULL AND MainRegist = 1
  `;
  const [managedRow] = await prisma.$queryRaw`
    SELECT COUNT(*) AS total
    FROM dbo.master_data_crm_registrations
    WHERE mainRegist = 1
  `;
  const [managedInViewRow] = await prisma.$queryRaw`
    SELECT COUNT(*) AS total
    FROM dbo.DimRegistration
    WHERE IsManaged = 1
  `;

  const dimTotal = Number(dimRow?.total ?? 0);
  const crmTotal = Number(crmRow?.total ?? 0);
  const managedTotal = Number(managedRow?.total ?? 0);
  const managedInView = Number(managedInViewRow?.total ?? 0);

  console.log('DimRegistration total:', dimTotal);
  console.log('CRM source total:', crmTotal);
  console.log('Managed source total:', managedTotal);
  console.log('Managed rows in view:', managedInView);

  assert(dimTotal === crmTotal + managedTotal, `DimRegistration count mismatch: ${dimTotal} != ${crmTotal} + ${managedTotal}`);
  assert(managedInView === managedTotal, `Managed rows in view mismatch: ${managedInView} != ${managedTotal}`);

  const sampleManaged = await prisma.$queryRaw`
    SELECT TOP 5 RegistrationId, NewKey, IsManaged, OwnerName, MaterialCode
    FROM dbo.DimRegistration
    WHERE IsManaged = 1
    ORDER BY CreatedOn DESC
  `;
  console.log('\nSample managed rows in DimRegistration:');
  console.log(JSON.stringify(sampleManaged, null, 2));

  const sampleCrm = await prisma.$queryRaw`
    SELECT TOP 3 RegistrationId, NewKey, IsManaged, OwnerName, BU
    FROM dbo.DimRegistration
    WHERE IsManaged = 0
    ORDER BY CreatedOn DESC
  `;
  console.log('\nSample CRM rows in DimRegistration:');
  console.log(JSON.stringify(sampleCrm, null, 2));

  console.log('\nDimRegistration verification passed.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
