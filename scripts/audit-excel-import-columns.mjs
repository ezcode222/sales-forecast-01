import { readFileSync, existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { detectImportFormat } from '../src/api/services/forecastImport/detectFormat.ts';
import { resolveImportMetadataColumns } from '../src/api/services/forecastImport/excelUtils.ts';
import { SKIP_SHEET_NAMES } from '../src/api/services/forecastImport/constants.ts';

const candidates = [
  'c:/Users/Tapanawat/Downloads/Upload_Fcst_NYL.xlsx',
  'tmp-upload-fcst-nyl.xlsx',
];

const filePath = candidates.find(path => existsSync(path));
if (!filePath) {
  console.error('Excel file not found in:', candidates.join(', '));
  process.exit(1);
}

const wb = XLSX.read(readFileSync(filePath), { type: 'buffer', cellDates: false });
console.log('File:', filePath);
console.log('Import mode:', detectImportFormat(wb));
console.log('Sheets:', wb.SheetNames.join(', '));

const IMPORTED_METADATA = [
  'Key for no regist',
  'materialCode (col by layout)',
  'plantCode',
  'country',
  'onOff',
  'process (Cat1)',
  'application (Cat2)',
  'subApplication (Cat3)',
  'soldTo',
  'shipTo',
  'enduser',
  'owner (PIC)',
  'businessUnit (if BU column exists)',
];

const IGNORED_COMMON = [
  'Spread',
  'Formula / Price Formula',
  'PartName',
  'Grade',
  'Priority',
  'Group Part/ Customer',
  'Column3',
  'End user2',
  'H/C and other descriptor columns not in metadata map',
  'Fcst Version sheet (version label only)',
  'Mapping sheet',
];

const FORECAST_COLUMNS = [
  'JUL-26, AUG-26, ... (qty)',
  'P_JUL-26, ... (price per month, optional)',
  'A_JUL-26, ... (amount per month, optional)',
];

console.log('\n=== What import reads ===');
IMPORTED_METADATA.forEach(item => console.log('  +', item));
FORECAST_COLUMNS.forEach(item => console.log('  +', item));

console.log('\n=== What import ignores (not mapped) ===');
IGNORED_COMMON.forEach(item => console.log('  -', item));

for (const sheetName of wb.SheetNames) {
  if (SKIP_SHEET_NAMES.has(sheetName.trim().toLowerCase())) {
    console.log(`\n=== ${sheetName} (SKIPPED) ===`);
    continue;
  }

  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  const header = rows[0] ?? [];
  const metadata = resolveImportMetadataColumns(header);

  console.log(`\n=== ${sheetName} (layout: ${metadata.layout}) ===`);
  console.log('Header count:', header.length);

  const interesting = ['spread', 'formula', 'partname', 'grade', 'priority', 'pic', 'bu', 'h/c'];
  for (let index = 0; index < header.length; index += 1) {
    const name = String(header[index] ?? '').trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (interesting.some(token => lower.includes(token)) || /^(jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may|jun)-/i.test(name) || /^[pa]_/i.test(name)) {
      const mapped = (() => {
        if (/^(jul|aug|sep|oct|nov|dec|jan|feb|mar|apr|may|jun)-/i.test(name)) return 'FORECAST QTY';
        if (/^p_/i.test(name)) return 'FORECAST PRICE';
        if (/^a_/i.test(name)) return 'FORECAST AMOUNT';
        if (index === metadata.materialCode) return 'materialCode';
        if (index === metadata.plantCode) return 'plantCode';
        if (index === metadata.country) return 'country';
        if (index === metadata.onOff) return 'onOff';
        if (index === metadata.process) return 'process';
        if (index === metadata.application) return 'application';
        if (index === metadata.subApplication) return 'subApplication';
        if (index === metadata.soldTo) return 'soldTo';
        if (index === metadata.shipTo) return 'shipTo';
        if (index === metadata.enduser) return 'enduser';
        if (index === metadata.owner) return 'owner';
        return 'IGNORED';
      })();
      console.log(`  [${index}] ${name} -> ${mapped}`);
    }
  }

  const spreadIdx = header.findIndex(value => String(value).toLowerCase().includes('spread'));
  if (spreadIdx >= 0) {
    const sampleValues = rows.slice(1, 6).map(row => row[spreadIdx]).filter(value => value !== '' && value != null);
    console.log(`Spread column [${spreadIdx}] sample:`, sampleValues.slice(0, 5));
    console.log('Spread import status: IGNORED (web sets spread=0 on create; edit in Spread column after import)');
  } else {
    console.log('Spread column: NOT FOUND in this sheet');
  }
}
