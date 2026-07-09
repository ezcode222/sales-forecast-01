// Force customer master names on every excel-import registration.
// Dry run: npx tsx --env-file=.env scripts/repair-import-names.mjs
// Apply:    npx tsx --env-file=.env scripts/repair-import-names.mjs --apply
import {
  auditExcelImportNameMismatches,
  repairExcelImportCustomerNamesOnly,
} from '../src/api/services/repairImportRegistrations.ts';
import { ensureCustomerMasterCache } from '../src/api/services/customerMaster.ts';
import prisma from '../src/db/prisma.ts';

const apply = process.argv.includes('--apply');

async function main() {
  const cache = await ensureCustomerMasterCache();
  if (!cache?.ok) {
    console.error('Customer master cache is empty. Run sync-customer-master.mjs first.');
    process.exit(1);
  }

  const before = await auditExcelImportNameMismatches();
  console.log('=== Repair import customer names ===');
  console.log(`excel-import rows: ${before.totalRows}`);
  console.log(`rows with name != master: ${before.rowsWithMismatch}`);
  console.log(`field mismatches: ${before.fieldMismatches}`);
  if (before.samples.length > 0) {
    console.log('samples:', JSON.stringify(before.samples, null, 2));
  }

  const stats = await repairExcelImportCustomerNamesOnly(apply);
  console.log(`\nMode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Rows updated: ${stats.rowsUpdated}`);
  console.log(`Name fields fixed: ${stats.nameFieldsFixed}`);

  if (apply) {
    const after = await auditExcelImportNameMismatches();
    console.log(`\nAfter: rows with name != master = ${after.rowsWithMismatch}`);
  } else if (stats.rowsUpdated > 0) {
    console.log('\nRe-run with --apply to persist.');
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
