import * as XLSX from 'xlsx';
import {
  KEY_HEADER,
  LEGACY_PREFERRED_SHEET_NAMES,
  SKIP_SHEET_NAMES,
} from './constants';
import {
  findHeaderIndex,
  firstValue,
  forecastColumnSignature,
  forecastNumberInvalidReason,
  getOnOffFromKey,
  normalizeHeader,
  normalizeKey,
  parseForecastMonthColumn,
  parseForecastNumber,
  sheetHasLegacyImportLayout,
} from './excelUtils';
import type {
  ExcelForecastGroup,
  ForecastImportColumn,
  ImportHeaderError,
  SourceSheetRow,
} from './types';

export type SheetParseResult = {
  sheetName: string;
  totalDataRows: number;
  forecastColumns: ForecastImportColumn[];
  headerErrors: ImportHeaderError[];
  detectedHeaders: Array<{ index: number; name: string }>;
  missingKeyRows: Array<{ sourceSheet: string; sourceRow: number }>;
  invalidNumericValues: Array<{
    sourceSheet: string;
    sourceRow: number;
    excelKeyForNoRegist: string;
    column: string;
    header: string;
    value: unknown;
    reason: string;
  }>;
  excelGroups: Map<string, ExcelForecastGroup>;
};

export type CrossSheetDuplicateKey = {
  excelKeyForNoRegist: string;
  entries: SourceSheetRow[];
};

export type MergedSheetParseResult = {
  sheetNames: string[];
  totalDataRows: number;
  forecastColumns: ForecastImportColumn[];
  headerErrors: ImportHeaderError[];
  detectedHeaders: Array<{ index: number; name: string }>;
  missingKeyRows: Array<{ sourceSheet: string; sourceRow: number }>;
  invalidNumericValues: SheetParseResult['invalidNumericValues'];
  excelGroups: Map<string, ExcelForecastGroup>;
  crossSheetDuplicateKeys: CrossSheetDuplicateKey[];
};

export function resolveLegacyImportSheets(workbook: XLSX.WorkBook) {
  const matched: Array<{ sheetName: string; sheet: XLSX.WorkSheet }> = [];
  const seen = new Set<string>();

  for (const name of LEGACY_PREFERRED_SHEET_NAMES) {
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasLegacyImportLayout(sheet) && !seen.has(name)) {
      matched.push({ sheetName: name, sheet });
      seen.add(name);
    }
  }

  for (const name of workbook.SheetNames) {
    if (seen.has(name) || SKIP_SHEET_NAMES.has(name.trim().toLowerCase())) continue;
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasLegacyImportLayout(sheet)) {
      matched.push({ sheetName: name, sheet });
      seen.add(name);
    }
  }

  return matched;
}

export function parseLegacyImportSheet(sheetName: string, sheet: XLSX.WorkSheet): SheetParseResult {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });

  const header = rows[0] ?? [];
  const dataRows = rows.slice(1);
  const headerErrors: ImportHeaderError[] = [];
  const detectedHeaders = header.map((value, index) => ({
    index,
    name: normalizeHeader(value),
  }));
  const forecastColumns = header
    .map((value, index) => parseForecastMonthColumn(value, index))
    .filter((column): column is ForecastImportColumn => column !== null);
  const businessUnitColumnIndex = findHeaderIndex(header, ['BU', 'Business Unit', 'BusinessUnit']);

  if (normalizeHeader(header[0]) !== KEY_HEADER) {
    headerErrors.push({
      sourceSheet: sheetName,
      column: 'A',
      expected: KEY_HEADER,
      actual: normalizeHeader(header[0]),
    });
  }
  header.forEach((value, index) => {
    const normalized = normalizeHeader(value).toUpperCase();
    if (/^[A-Z]{3}-\d{2}$/.test(normalized) && !parseForecastMonthColumn(value, index)) {
      headerErrors.push({
        sourceSheet: sheetName,
        column: XLSX.utils.encode_col(index),
        expected: 'Valid MMM-YY forecast month (for example JUL-26)',
        actual: normalized,
      });
    }
  });
  if (forecastColumns.length === 0) {
    headerErrors.push({
      sourceSheet: sheetName,
      column: '-',
      expected: 'At least one forecast month header in MMM-YY format',
      actual: 'No forecast month columns found',
    });
  }
  const forecastColumnsByMonth = new Map<string, ForecastImportColumn>();
  for (const forecastColumn of forecastColumns) {
    const existing = forecastColumnsByMonth.get(forecastColumn.month);
    if (existing) {
      headerErrors.push({
        sourceSheet: sheetName,
        column: forecastColumn.col,
        expected: `Unique forecast month ${forecastColumn.header}`,
        actual: `Duplicate of column ${existing.col}`,
      });
    } else {
      forecastColumnsByMonth.set(forecastColumn.month, forecastColumn);
    }
  }
  forecastColumns.sort((left, right) => left.month.localeCompare(right.month));

  const excelGroups = new Map<string, ExcelForecastGroup>();
  const missingKeyRows: Array<{ sourceSheet: string; sourceRow: number }> = [];
  const invalidNumericValues: SheetParseResult['invalidNumericValues'] = [];

  dataRows.forEach((row, index) => {
    const sourceRow = index + 2;
    const key = normalizeKey(row[0]);
    if (!key) {
      missingKeyRows.push({ sourceSheet: sheetName, sourceRow });
      return;
    }

    const group = excelGroups.get(key) ?? {
      keyNoRegist: key,
      sourceRows: [],
      sourceSheetRows: [],
      country: null,
      soldTo: null,
      shipTo: null,
      enduser: null,
      plant: null,
      materialCode: null,
      onOff: null,
      process: null,
      application: null,
      subApplication: null,
      owner: null,
      businessUnit: null,
      forecastValues: forecastColumns.map(() => 0),
      hasInvalidNumber: false,
    };

    group.sourceRows.push(sourceRow);
    group.sourceSheetRows.push({ sourceSheet: sheetName, sourceRow });
    group.country = firstValue(group.country, row[19]);
    group.soldTo = firstValue(group.soldTo, row[25]);
    group.shipTo = firstValue(group.shipTo, row[26]);
    group.enduser = firstValue(group.enduser, row[27]);
    group.plant = firstValue(group.plant, row[17]);
    group.materialCode = firstValue(group.materialCode, row[6]);
    group.onOff = firstValue(group.onOff, row[20]) ?? getOnOffFromKey(key);
    group.process = firstValue(group.process, row[21]);
    group.application = firstValue(group.application, row[22]);
    group.subApplication = firstValue(group.subApplication, row[23]);
    group.owner = firstValue(group.owner, row[30]);
    group.businessUnit = firstValue(
      group.businessUnit,
      businessUnitColumnIndex >= 0 ? row[businessUnitColumnIndex] : null
    );

    forecastColumns.forEach((forecastColumn, forecastIndex) => {
      const rawValue = row[forecastColumn.index];
      const parsed = parseForecastNumber(rawValue);
      if (!parsed.ok) {
        group.hasInvalidNumber = true;
        invalidNumericValues.push({
          sourceSheet: sheetName,
          sourceRow,
          excelKeyForNoRegist: key,
          column: forecastColumn.col,
          header: forecastColumn.header,
          value: rawValue,
          reason: forecastNumberInvalidReason(rawValue),
        });
        return;
      }
      group.forecastValues[forecastIndex] += parsed.value;
    });

    excelGroups.set(key, group);
  });

  return {
    sheetName,
    totalDataRows: dataRows.length,
    forecastColumns,
    headerErrors,
    detectedHeaders,
    missingKeyRows,
    invalidNumericValues,
    excelGroups,
  };
}

export function mergeLegacySheetResults(sheetResults: SheetParseResult[]): MergedSheetParseResult {
  if (sheetResults.length === 0) {
    return {
      sheetNames: [],
      totalDataRows: 0,
      forecastColumns: [],
      headerErrors: [],
      detectedHeaders: [],
      missingKeyRows: [],
      invalidNumericValues: [],
      excelGroups: new Map(),
      crossSheetDuplicateKeys: [],
    };
  }

  const sheetNames = sheetResults.map(result => result.sheetName);
  const canonical = sheetResults[0];
  const canonicalSignature = forecastColumnSignature(canonical.forecastColumns);
  const headerErrors: ImportHeaderError[] = sheetResults.flatMap(result => result.headerErrors);

  for (const result of sheetResults.slice(1)) {
    const signature = forecastColumnSignature(result.forecastColumns);
    if (signature !== canonicalSignature) {
      headerErrors.push({
        sourceSheet: result.sheetName,
        column: '-',
        expected: `Forecast month columns must match sheet "${canonical.sheetName}"`,
        actual: `Found different month set on sheet "${result.sheetName}"`,
      });
    }
  }

  const missingKeyRows = sheetResults.flatMap(result => result.missingKeyRows);
  const invalidNumericValues = sheetResults.flatMap(result => result.invalidNumericValues);
  const excelGroups = new Map<string, ExcelForecastGroup>();
  const crossSheetDuplicateKeys: CrossSheetDuplicateKey[] = [];
  const crossSheetBlockedKeys = new Set<string>();

  for (const result of sheetResults) {
    for (const group of result.excelGroups.values()) {
      const existing = excelGroups.get(group.keyNoRegist);
      if (!existing) {
        excelGroups.set(group.keyNoRegist, {
          ...group,
          sourceRows: [...group.sourceRows],
          sourceSheetRows: [...group.sourceSheetRows],
          forecastValues: [...group.forecastValues],
        });
        continue;
      }

      const incomingSheet = result.sheetName;
      const existingSheets = new Set(existing.sourceSheetRows.map(entry => entry.sourceSheet));
      if (!existingSheets.has(incomingSheet)) {
        if (!crossSheetBlockedKeys.has(group.keyNoRegist)) {
          crossSheetBlockedKeys.add(group.keyNoRegist);
          crossSheetDuplicateKeys.push({
            excelKeyForNoRegist: group.keyNoRegist,
            entries: [...existing.sourceSheetRows, ...group.sourceSheetRows],
          });
        } else {
          const crossEntry = crossSheetDuplicateKeys.find(item => item.excelKeyForNoRegist === group.keyNoRegist);
          crossEntry?.entries.push(...group.sourceSheetRows);
        }
        excelGroups.delete(group.keyNoRegist);
        continue;
      }

      existing.sourceRows.push(...group.sourceRows);
      existing.sourceSheetRows.push(...group.sourceSheetRows);
      group.forecastValues.forEach((value, index) => {
        existing.forecastValues[index] += value;
      });
      existing.hasInvalidNumber = existing.hasInvalidNumber || group.hasInvalidNumber;
      existing.country = existing.country ?? group.country;
      existing.soldTo = existing.soldTo ?? group.soldTo;
      existing.shipTo = existing.shipTo ?? group.shipTo;
      existing.enduser = existing.enduser ?? group.enduser;
      existing.plant = existing.plant ?? group.plant;
      existing.materialCode = existing.materialCode ?? group.materialCode;
      existing.onOff = existing.onOff ?? group.onOff;
      existing.process = existing.process ?? group.process;
      existing.application = existing.application ?? group.application;
      existing.subApplication = existing.subApplication ?? group.subApplication;
      existing.owner = existing.owner ?? group.owner;
      existing.businessUnit = existing.businessUnit ?? group.businessUnit;
    }
  }

  for (const key of crossSheetBlockedKeys) {
    excelGroups.delete(key);
  }

  return {
    sheetNames,
    totalDataRows: sheetResults.reduce((sum, result) => sum + result.totalDataRows, 0),
    forecastColumns: canonical.forecastColumns,
    headerErrors,
    detectedHeaders: canonical.detectedHeaders,
    missingKeyRows,
    invalidNumericValues,
    excelGroups,
    crossSheetDuplicateKeys,
  };
}
