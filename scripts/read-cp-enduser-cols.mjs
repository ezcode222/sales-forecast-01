import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const wb = XLSX.read(readFileSync('tmp-upload-fcst-nyl.xlsx'), { type: 'buffer' });
const cpRows = XLSX.utils.sheet_to_json(wb.Sheets['CP'], { header: 1, defval: '' });
const header = cpRows[0];
console.log('CP header 24-29:', header.slice(24, 30));

for (const rowNum of [4, 5, 676]) {
  const row = cpRows[rowNum - 1];
  console.log(`\nCP row ${rowNum}:`);
  console.log('  key:', row[0]);
  console.log('  col24 soldTo:', row[24]);
  console.log('  col25 shipTo:', row[25]);
  console.log('  col26 enduser:', row[26]);
  console.log('  col27 owner/PIC:', row[27]);
}
