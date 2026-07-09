import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const wb = XLSX.read(readFileSync('tmp-upload-fcst-nyl.xlsx'), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Polymer'], { header: 1, defval: '' });
const header = rows[0];
const row = rows[50];
console.log('Header cols 23-31:', header.slice(23, 32));
console.log('Row 51 cols 23-31:', row.slice(23, 32));
console.log('Key:', row[0]);
