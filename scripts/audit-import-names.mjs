import { lookupCustomerNames } from '../src/api/services/customerMaster.ts';
import prisma from '../src/db/prisma.ts';

function text(value) {
  return String(value ?? '').trim();
}

function codeFields(row) {
  return [
    { field: 'soldToName', code: row.soldToCode, current: row.soldToName },
    { field: 'shipToName', code: row.shipToCode, current: row.shipToName },
    { field: 'endUser', code: row.endUserCode, current: row.endUser },
    { field: 'endUserName', code: row.endUserCode, current: row.endUserName },
  ];
}

const rows = await prisma.masterDataCrmRegistration.findMany({
  where: { createdBy: 'excel-import' },
  select: {
    id: true,
    mainRegist: true,
    soldToCode: true,
    soldToName: true,
    shipToCode: true,
    shipToName: true,
    endUserCode: true,
    endUser: true,
    endUserName: true,
  },
});

const allCodes = [...new Set(
  rows.flatMap(row => [row.soldToCode, row.shipToCode, row.endUserCode]
    .map(text)
    .filter(code => code && code !== '0'))
)];
const master = await lookupCustomerNames(allCodes);

let rowsWithMismatch = 0;
let fieldMismatches = 0;
const samples = [];

for (const row of rows) {
  let rowMismatch = false;
  for (const { field, code, current } of codeFields(row)) {
    const normalizedCode = text(code);
    if (!normalizedCode || normalizedCode === '0') continue;
    const expected = master.get(normalizedCode) ?? null;
    if (!expected) continue;
    const cur = text(current);
    if (cur !== expected) {
      fieldMismatches += 1;
      rowMismatch = true;
      if (samples.length < 12) {
        samples.push({ id: row.id, mainRegist: row.mainRegist, field, code: normalizedCode, current: cur || '(empty)', expected });
      }
    }
  }
  if (rowMismatch) rowsWithMismatch += 1;
}

console.log('excel-import rows:', rows.length);
console.log('mainRegist=1:', rows.filter(r => r.mainRegist === 1).length);
console.log('rows with any name != master:', rowsWithMismatch);
console.log('field-level mismatches:', fieldMismatches);
console.log('samples:', JSON.stringify(samples, null, 2));

await prisma.$disconnect();
