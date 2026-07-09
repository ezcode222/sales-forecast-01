import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import prisma from '../src/db/prisma.ts';

const soldToCode = '12036';

const dbRows = await prisma.$queryRaw`
  SELECT d.NewKey, d.SoldToCode, d.SoldTo_name, d.ShipTo_name, d.PlantName, d.PlantCode,
         d.MaterialCode, d.CountryName, m.createdBy, m.keyForNoCRM
  FROM dbo.DimRegistration d
  LEFT JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
  WHERE d.SoldToCode = ${soldToCode}
  ORDER BY d.SoldTo_name, d.MaterialCode
`;

console.log('=== DB rows with SoldToCode 12036 ===');
console.log(JSON.stringify(dbRows, null, 2));
console.log('Count:', dbRows.length);

const excelPath = process.env.EXCEL_PATH ?? 'tmp-upload-fcst-nyl.xlsx';
if (existsSync(excelPath)) {
  const wb = XLSX.read(readFileSync(excelPath), { type: 'buffer', cellDates: false });
  const hits = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowText = row.map(c => String(c ?? '')).join('|');
      if (rowText.includes('12036')) {
        hits.push({ sheet: sheetName, row: i + 1, cells: row.slice(0, 25) });
      }
    }
  }
  console.log('\n=== Excel rows mentioning 12036 ===');
  console.log(JSON.stringify(hits.slice(0, 20), null, 2));
  console.log('Total excel hits:', hits.length);
} else {
  console.log(`\nExcel not found at ${excelPath}`);
}

await prisma.$disconnect();
