// Repair ALL excel-import registrations (codes + names from customer master).
// Dry run: npx tsx --env-file=.env scripts/repair-managed-registrations.mjs
// Apply:    npx tsx --env-file=.env scripts/repair-managed-registrations.mjs --apply
// Names only: npx tsx --env-file=.env scripts/repair-managed-registrations.mjs --names-only [--apply]
import {
  auditExcelImportNameMismatches,
  repairAllExcelImportRegistrations,
  repairExcelImportCustomerNamesOnly,
} from '../src/api/services/repairImportRegistrations.ts';
import { ensureCustomerMasterCache } from '../src/api/services/customerMaster.ts';
import prisma from '../src/db/prisma.ts';

const apply = process.argv.includes('--apply');
const namesOnly = process.argv.includes('--names-only');

async function main() {
  const cache = await ensureCustomerMasterCache();
  if (!cache?.ok) {
    console.error('Customer master cache is empty. Sync first.');
    process.exit(1);
  }

  const before = await auditExcelImportNameMismatches();
  console.log('Before repair:');
  console.log(`  excel-import rows: ${before.totalRows}`);
  console.log(`  rows with name != master: ${before.rowsWithMismatch}`);
  console.log(`  field mismatches: ${before.fieldMismatches}`);
  if (before.samples.length > 0) {
    console.log('  samples:', JSON.stringify(before.samples, null, 2));
  }

  const stats = namesOnly
    ? await repairExcelImportCustomerNamesOnly(apply)
    : await repairAllExcelImportRegistrations(apply);

  console.log(`\nMode: ${apply ? 'APPLY' : 'DRY RUN'} (${namesOnly ? 'names-only' : 'full repair'})`);
  console.log(`Total excel-import rows: ${stats.totalRows}`);
  console.log(`Rows to update: ${stats.rowsUpdated}`);
  console.log(`Unchanged: ${stats.rowsUnchanged}`);
  console.log(`Customer name fields fixed: ${stats.nameFieldsFixed}`);
  if (!namesOnly) {
    console.log(`Still suspicious after repair: ${stats.stillSuspicious}`);
  }

  if (apply) {
    const after = await auditExcelImportNameMismatches();
    console.log('\nAfter repair:');
    console.log(`  rows with name != master: ${after.rowsWithMismatch}`);
    console.log(`  field mismatches: ${after.fieldMismatches}`);
  } else if (stats.rowsUpdated > 0) {
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
