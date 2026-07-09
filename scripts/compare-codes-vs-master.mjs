import {
  getCustomerMasterCacheCount,
  lookupCustomerNamesRaw,
  syncCustomerMasterCache,
} from '../src/api/services/customerMaster.ts';
import prisma from '../src/db/prisma.ts';

const cacheCount = await getCustomerMasterCacheCount();
if (cacheCount === 0) {
  const sync = await syncCustomerMasterCache();
  if (!sync.ok) {
    console.error('Customer master cache empty and sync failed:', sync.error);
    process.exit(1);
  }
}

async function compareCodeColumn(columnCode, columnName, label) {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT
      d.${columnCode} AS code,
      d.${columnName} AS name,
      CASE WHEN m.createdBy = 'excel-import' THEN 'excel-import' ELSE 'CRM' END AS source
    FROM dbo.DimRegistration d
    LEFT JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE d.${columnCode} IS NOT NULL AND d.${columnCode} <> '0' AND d.${columnCode} <> ''
  `);

  const byCode = new Map();
  for (const row of rows) {
    const code = String(row.code ?? '').trim();
    const name = row.name ? String(row.name).trim() : null;
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push({ code, name, source: String(row.source ?? 'CRM') });
    byCode.set(code, list);
  }

  const multiNameCodes = [...byCode.entries()].filter(([, names]) => {
    const unique = new Set(names.map(n => n.name ?? ''));
    return unique.size > 1;
  });

  console.log(`\n=== ${label}: codes with multiple names (${multiNameCodes.length}) ===`);

  const codesToLookup = multiNameCodes.map(([code]) => code);
  const masterNames = await lookupCustomerNamesRaw(codesToLookup);

  let shown = 0;
  for (const [code, names] of multiNameCodes.sort((a, b) => b[1].length - a[1].length)) {
    if (shown >= 15) break;
    const master = masterNames.get(code) ?? '(not in master)';
    console.log(`\nCode ${code} → Master: ${master}`);
    for (const n of names) {
      const match = master !== '(not in master)' && n.name === master ? 'OK' : 'DIFF';
      console.log(`  [${match}] ${n.source}: ${n.name ?? '(null)'}`);
    }
    shown += 1;
  }

  return { totalCodes: byCode.size, multiName: multiNameCodes.length };
}

const soldTo = await compareCodeColumn('SoldToCode', 'SoldTo_name', 'SoldTo');
const shipTo = await compareCodeColumn('ShipToCode', 'ShipTo_name', 'ShipTo');
const endUser = await compareCodeColumn('EndUserCode', 'End_user', 'EndUser');

console.log('\n=== Summary ===');
console.log('SoldTo:', soldTo);
console.log('ShipTo:', shipTo);
console.log('EndUser:', endUser);
console.log('Master cache rows:', await getCustomerMasterCacheCount());

await prisma.$disconnect();
