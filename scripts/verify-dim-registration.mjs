// Verify DimRegistration view after migration.
// Run: node --env-file=.env scripts/verify-dim-registration.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COUNTRY_LIKE_PLANT_CODES = new Set([
  'china', 'thailand', 'usa', 'india', 'japan', 'malaysia', 'indonesia', 'ubj', 'ubi',
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSuspiciousPlantCode(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '0') return false;
  if (/^\d{4}(-[A-Za-z0-9]+)?$/.test(text)) return false;
  return COUNTRY_LIKE_PLANT_CODES.has(text.toLowerCase()) || /[a-z]/i.test(text);
}

function isSuspiciousSoldToCode(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '0') return false;
  if (/^\d+$/.test(text)) return false;
  if (text.startsWith('#')) return true;
  return /\s/.test(text) || text.length > 12;
}

async function main() {
  const vwColumns = await prisma.$queryRaw`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'VW_CRM_RegistrationAll_1'
    ORDER BY ORDINAL_POSITION
  `;
  const dimColumns = await prisma.$queryRaw`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'DimRegistration'
    ORDER BY ORDINAL_POSITION
  `;

  const vwNames = vwColumns.map(row => row.COLUMN_NAME);
  const dimNames = dimColumns.map(row => row.COLUMN_NAME);
  assert(
    JSON.stringify(vwNames) === JSON.stringify(dimNames),
    `DimRegistration columns must match VW exactly.\nVW: ${vwNames.join(', ')}\nDim: ${dimNames.join(', ')}`
  );
  assert(
    !dimNames.includes('RegistrationId') && !dimNames.includes('IsManaged'),
    'DimRegistration must not expose RegistrationId or IsManaged'
  );
  console.log('OK column list matches VW_CRM_RegistrationAll_1');

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

  const dimTotal = Number(dimRow?.total ?? 0);
  const crmTotal = Number(crmRow?.total ?? 0);
  const managedTotal = Number(managedRow?.total ?? 0);

  console.log('DimRegistration total:', dimTotal);
  console.log('CRM source total:', crmTotal);
  console.log('Managed source total:', managedTotal);

  assert(dimTotal === crmTotal + managedTotal, `DimRegistration count mismatch: ${dimTotal} != ${crmTotal} + ${managedTotal}`);

  const managedKeys = await prisma.$queryRaw`
    SELECT m.newKey
    FROM dbo.master_data_crm_registrations m
    WHERE m.mainRegist = 1
  `;
  const dimKeys = await prisma.$queryRaw`
    SELECT d.NewKey
    FROM dbo.DimRegistration d
    INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE m.mainRegist = 1
  `;
  assert(
    managedKeys.length === dimKeys.length,
    `Managed rows missing from DimRegistration: ${dimKeys.length}/${managedKeys.length}`
  );
  console.log('OK all managed registrations appear in DimRegistration');

  const badPlantRows = await prisma.$queryRaw`
    SELECT TOP 10 d.NewKey, d.PlantCode, d.PlantName, d.SoldToCode, d.SoldTo_name
    FROM dbo.DimRegistration d
    INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE m.mainRegist = 1
  `;
  const suspicious = badPlantRows.filter(row =>
    isSuspiciousPlantCode(row.PlantCode) || isSuspiciousSoldToCode(row.SoldToCode)
  );
  console.log('Suspicious managed rows in DimRegistration:', suspicious.length);
  if (suspicious.length > 0) {
    console.log(JSON.stringify(suspicious.slice(0, 5), null, 2));
  }
  assert(suspicious.length === 0, `Found ${suspicious.length} managed rows with bad PlantCode/SoldToCode in DimRegistration`);

  const [factSample] = await prisma.$queryRaw`
    SELECT TOP 1 [Registration Key]
    FROM dbo.FactForecast
    WHERE [Registration Key] LIKE 'IMP_%' OR [Registration Key] LIKE 'WEB_%'
  `;
  if (factSample?.['Registration Key']) {
    const [joined] = await prisma.$queryRaw`
      SELECT TOP 1 d.NewKey
      FROM dbo.FactForecast f
      INNER JOIN dbo.DimRegistration d ON d.NewKey = f.[Registration Key]
      WHERE f.[Registration Key] = ${factSample['Registration Key']}
    `;
    assert(joined, 'FactForecast managed key should join DimRegistration on NewKey');
    console.log('OK FactForecast joins DimRegistration via NewKey');
  } else {
    console.log('SKIP FactForecast NewKey join check — no managed forecast sample found');
  }

  const sampleManaged = await prisma.$queryRaw`
    SELECT TOP 5 d.NewKey, d.RegistrationTopic, d.PlantCode, d.PlantName, d.SoldToCode, d.SoldTo_name
    FROM dbo.DimRegistration d
    INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE m.mainRegist = 1
    ORDER BY d.CreatedOn DESC
  `;
  console.log('\nSample managed rows in DimRegistration:');
  console.log(JSON.stringify(sampleManaged, null, 2));

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
