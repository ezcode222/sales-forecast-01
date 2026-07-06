import * as XLSX from 'xlsx';
import { parseLegacyImportSheet } from '../src/api/services/forecastImport/legacySheetParse.ts';
import { parseVersionedImportSheet } from '../src/api/services/forecastImport/versionedSheetParse.ts';
import { detectImportFormat } from '../src/api/services/forecastImport/detectFormat.ts';

function makeSheet(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  return ws;
}

const key = 'TH/ABC/DEF/GHI/JKL/MAT/On';
const header = [
  'Key for no regist',
  'JUL-26', 'P_JUL-26', 'A_JUL-26',
  'AUG-26', 'P_AUG-26', 'A_AUG-26',
];
const dataRow = [key, 100, 50, 4500, 200, 55, 9900];

// Legacy workbook (no Fcst Version)
const legacyWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(legacyWb, makeSheet([header, dataRow]), 'Polymer');
console.log('Legacy mode:', detectImportFormat(legacyWb));
const legacyParsed = parseLegacyImportSheet('Polymer', legacyWb.Sheets.Polymer);
const legacyGroup = [...legacyParsed.excelGroups.values()][0];
console.log('Legacy qty/price/amount:', legacyGroup.forecastValues, legacyGroup.priceValues, legacyGroup.amountValues);
console.log('Legacy hasPrice/hasAmount:', legacyParsed.hasPriceColumns, legacyParsed.hasAmountColumns);

// Versioned workbook
const versionedWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(versionedWb, makeSheet([header, dataRow]), 'Polymer');
XLSX.utils.book_append_sheet(versionedWb, makeSheet([['Version'], ['BB FY26']]), 'Fcst Version');
console.log('Versioned mode:', detectImportFormat(versionedWb));
const versionedParsed = parseVersionedImportSheet('Polymer', versionedWb.Sheets.Polymer);
const versionedGroup = [...versionedParsed.excelGroups.values()][0];
console.log('Versioned qty/price/amount:', versionedGroup.forecastValues, versionedGroup.priceValues, versionedGroup.amountValues);

// Current Forecast label should stay legacy
const currentWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(currentWb, makeSheet([header, dataRow]), 'Polymer');
XLSX.utils.book_append_sheet(currentWb, makeSheet([['Version'], ['Current Forecast']]), 'Fcst Version');
console.log('Current label mode:', detectImportFormat(currentWb));

console.log('OK');
