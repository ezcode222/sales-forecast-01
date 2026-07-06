import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildVersionedImportPreview } from '../src/api/services/forecastImport/buildVersionedPreview.ts';
import { parseVersionedImportSheet } from '../src/api/services/forecastImport/versionedSheetParse.ts';

const workbook = XLSX.read(readFileSync('tmp-upload-fcst-nyl.xlsx'), { type: 'buffer', cellDates: false });
const parsed = parseVersionedImportSheet('Polymer', workbook.Sheets.Polymer);
console.log('Parse flags:', {
  hasPriceColumns: parsed.hasPriceColumns,
  hasAmountColumns: parsed.hasAmountColumns,
  headerErrors: parsed.headerErrors.length,
});

for (const material of ['400212', '400916']) {
  const key = [...parsed.excelGroups.keys()].find(k => k.includes(`/${material}/`));
  if (!key) {
    console.log(`Material ${material}: NOT FOUND in parse`);
    continue;
  }
  const g = parsed.excelGroups.get(key);
  console.log(`Material ${material} Apr-26:`, {
    qty: g.forecastValues[0],
    price: g.priceValues[0],
    amount: g.amountValues[0],
    key,
  });
}

const preview = await buildVersionedImportPreview(workbook, 'BB FY26', 'BB-FY26', true);
const keys = ['400212', '400916'];
for (const material of keys) {
  const unmatched = preview.unmatchedRows.filter(r => r.excelKeyForNoRegist?.includes(`/${material}/`));
  const importable = preview.importableRecords.filter(r => r.excelKeyForNoRegist?.includes(`/${material}/`) && r.forecastMonth === '2026-04');
  console.log(`\nPreview ${material}:`);
  console.log('  unmatched:', unmatched.length, unmatched[0]?.reasonCode ?? '-');
  if (importable[0]) {
    console.log('  Apr importable:', {
      qtyFcst: importable[0].qtyFcst,
      priceFcst: importable[0].priceFcst,
      amountFcst: importable[0].amountFcst,
      action: importable[0].action,
    });
  } else {
    console.log('  Apr importable: NONE');
  }
}

console.log('\nSummary:', {
  importableRecords: preview.summary.importableRecords,
  unmatchedRows: preview.summary.unmatchedRows,
  amountMismatchWarnings: preview.summary.amountMismatchWarnings,
});

process.exit(0);
