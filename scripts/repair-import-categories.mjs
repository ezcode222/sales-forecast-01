import {
  auditExcelImportShiftedCat1,
  backfillImportSubAppFromCrm,
  repairExcelImportCategories,
} from '../src/api/services/repairImportRegistrations.ts';
import prisma from '../src/db/prisma.ts';

const apply = process.argv.includes('--apply');

const shifted = await auditExcelImportShiftedCat1();
console.log(`Shifted Cat1 rows: ${shifted}`);

const catStats = await repairExcelImportCategories(apply);
console.log(`Category repair: ${apply ? 'APPLY' : 'DRY'} updated=${catStats.rowsUpdated}`);

const backfill = await backfillImportSubAppFromCrm(apply);
console.log(`SubApp backfill from CRM: candidates=${backfill.candidates} updated=${backfill.updated}`);

if (apply) {
  const after = await auditExcelImportShiftedCat1();
  console.log(`Shifted Cat1 after: ${after}`);
}

await prisma.$disconnect();
