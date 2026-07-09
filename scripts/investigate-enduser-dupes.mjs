import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import prisma from '../src/db/prisma.ts';

const codes = ['80443', '80481', '80431'];

for (const endUserCode of codes) {
  const dbRows = await prisma.$queryRaw`
    SELECT d.NewKey, d.EndUserCode, d.End_user, d.SoldToCode, d.SoldTo_name,
           d.PlantCode, d.PlantName, d.MaterialCode, m.createdBy, m.keyForNoCRM
    FROM dbo.DimRegistration d
    LEFT JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE d.EndUserCode = ${endUserCode}
    ORDER BY d.End_user
  `;
  console.log(`\n=== EndUserCode ${endUserCode} (${dbRows.length} rows) ===`);
  for (const row of dbRows) {
    console.log({
      End_user: row.End_user,
      source: row.createdBy === 'excel-import' ? 'excel-import' : 'CRM',
      key: row.keyForNoCRM ?? row.NewKey?.slice(0, 60),
      material: row.MaterialCode,
      plant: `${row.PlantCode}/${row.PlantName}`,
    });
  }
}

const excelPath = 'tmp-upload-fcst-nyl.xlsx';
if (existsSync(excelPath)) {
  const wb = XLSX.read(readFileSync(excelPath), { type: 'buffer' });
  for (const code of codes) {
    const hits = [];
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
      const header = rows[0] ?? [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const key = String(row[0] ?? '');
        if (!key.includes(`/${code}/`)) continue;
        hits.push({
          sheet: sheetName,
          row: i + 1,
          key,
          endUserCol27: row[27],
          soldToCol25: row[25],
          shipToCol26: row[26],
        });
      }
    }
    console.log(`\n=== Excel keys with EndUser ${code} ===`);
    console.log(JSON.stringify(hits, null, 2));
  }
}

const summary = await prisma.$queryRaw`
  SELECT TOP 15 d.EndUserCode, COUNT(DISTINCT d.End_user) AS nameCount, COUNT(*) AS regCount
  FROM dbo.DimRegistration d
  WHERE d.EndUserCode IS NOT NULL AND d.EndUserCode <> '0'
  GROUP BY d.EndUserCode
  HAVING COUNT(DISTINCT d.End_user) > 1
  ORDER BY nameCount DESC, regCount DESC
`;
console.log('\n=== Top EndUserCode with multiple names ===');
console.log(JSON.stringify(summary, null, 2));

const sut = await prisma.masterDataCrmRegistration.findFirst({
  where: { keyForNoCRM: '9116/50399/80443/1108/400139/On' },
  select: { endUser: true, endUserCode: true, ownerName: true, createdBy: true },
});
console.log('\nSutthichai row in master_data:', sut);

await prisma.$disconnect();