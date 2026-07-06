import * as XLSX from 'xlsx';
import {
  KEY_HEADER,
  SKIP_SHEET_NAMES,
  VERSIONED_PREFERRED_SHEET_NAMES,
} from './constants';
import {
  buildExtendedForecastColumns,
  buildSyntheticImportKey,
  findHeaderIndex,
  firstDayOfMonthPeriod,
  firstValue,
  forecastColumnSignature,
  forecastNumberInvalidReason,
  getOnOffFromKey,
  normalizeHeader,
  normalizeKey,
  parseForecastMonthColumn,
  parseForecastNumber,
} from './excelUtils';
import type {
  ExcelForecastGroup,
  ImportHeaderError,
  SourceSheetRow,
  VersionedForecastColumn,
} from './types';

function mergeExcelGroups(existing: ExcelForecastGroup, incoming: ExcelForecastGroup) {
  existing.sourceRows.push(...incoming.sourceRows);
  existing.sourceSheetRows.push(...incoming.sourceSheetRows);
  incoming.forecastValues.forEach((value, index) => {
    existing.forecastValues[index] += value;
  });
  incoming.priceValues.forEach((value, index) => {
    existing.priceValues[index] += value;
  });
  incoming.amountValues.forEach((value, index) => {
    existing.amountValues[index] += value;
  });
  existing.country = existing.country ?? incoming.country;
  existing.soldTo = existing.soldTo ?? incoming.soldTo;
  existing.shipTo = existing.shipTo ?? incoming.shipTo;
  existing.enduser = existing.enduser ?? incoming.enduser;
  existing.plant = existing.plant ?? incoming.plant;
  existing.materialCode = existing.materialCode ?? incoming.materialCode;
  existing.onOff = existing.onOff ?? incoming.onOff;
  existing.process = existing.process ?? incoming.process;
  existing.application = existing.application ?? incoming.application;
  existing.subApplication = existing.subApplication ?? incoming.subApplication;
  existing.owner = existing.owner ?? incoming.owner;
  existing.businessUnit = existing.businessUnit ?? incoming.businessUnit;
}

export type VersionedSheetParseResult = {
  sheetName: string;
  totalDataRows: number;
  forecastColumns: VersionedForecastColumn[];
  hasPriceColumns: boolean;
  hasAmountColumns: boolean;
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

export type VersionedCrossSheetDuplicateKey = {
  excelKeyForNoRegist: string;
  entries: SourceSheetRow[];
};

export type MergedVersionedSheetParseResult = {
  sheetNames: string[];
  totalDataRows: number;
  forecastColumns: VersionedForecastColumn[];
  hasPriceColumns: boolean;
  hasAmountColumns: boolean;
  headerErrors: ImportHeaderError[];
  detectedHeaders: Array<{ index: number; name: string }>;
  missingKeyRows: Array<{ sourceSheet: string; sourceRow: number }>;
  invalidNumericValues: VersionedSheetParseResult['invalidNumericValues'];
  excelGroups: Map<string, ExcelForecastGroup>;
  crossSheetDuplicateKeys: VersionedCrossSheetDuplicateKey[];
};

function sheetHasVersionedImportLayout(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });
  const header = rows[0] ?? [];
  if (normalizeHeader(header[0]) !== KEY_HEADER) return false;
  const qtyColumns = header.filter((value, index) => parseForecastMonthColumn(value, index) !== null);
  return qtyColumns.length > 0;
}

export function resolveVersionedImportSheets(workbook: XLSX.WorkBook) {
  const matched: Array<{ sheetName: string; sheet: XLSX.WorkSheet }> = [];
  const seen = new Set<string>();

  for (const name of VERSIONED_PREFERRED_SHEET_NAMES) {
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasVersionedImportLayout(sheet) && !seen.has(name)) {
      matched.push({ sheetName: name, sheet });
      seen.add(name);
    }
  }

  for (const name of workbook.SheetNames) {
    if (seen.has(name) || SKIP_SHEET_NAMES.has(name.trim().toLowerCase())) continue;
    const sheet = workbook.Sheets[name];
    if (sheet && sheetHasVersionedImportLayout(sheet)) {
      matched.push({ sheetName: name, sheet });
      seen.add(name);
    }
  }

  return matched;
}

function buildVersionedForecastColumns(header: unknown[]): {
  columns: VersionedForecastColumn[];
  hasPriceColumns: boolean;
  hasAmountColumns: boolean;
} {
  const { columns, hasPriceColumns, hasAmountColumns } = buildExtendedForecastColumns(
    header,
    firstDayOfMonthPeriod
  );
  return { columns, hasPriceColumns, hasAmountColumns };
}

export function parseVersionedImportSheet(sheetName: string, sheet: XLSX.WorkSheet): VersionedSheetParseResult {
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
  const { columns: forecastColumns, hasPriceColumns, hasAmountColumns } = buildVersionedForecastColumns(header);
  const businessUnitColumnIndex = findHeaderIndex(header, ['BU', 'Business Unit', 'BusinessUnit']);

  if (normalizeHeader(header[0]) !== KEY_HEADER) {
    headerErrors.push({
      sourceSheet: sheetName,
      column: 'A',
      expected: KEY_HEADER,
      actual: normalizeHeader(header[0]),
    });
  }

  if (forecastColumns.length === 0) {
    headerErrors.push({
      sourceSheet: sheetName,
      column: '-',
      expected: 'At least one forecast month header in MMM-YY format',
      actual: 'No forecast month columns found',
    });
  }

  forecastColumns.sort((left, right) => left.month.localeCompare(right.month));

  const excelGroups = new Map<string, ExcelForecastGroup>();
  const missingKeyRows: Array<{ sourceSheet: string; sourceRow: number }> = [];
  const invalidNumericValues: VersionedSheetParseResult['invalidNumericValues'] = [];

  const pushInvalid = (
    sourceRow: number,
    key: string,
    column: string,
    headerLabel: string,
    rawValue: unknown
  ) => {
    invalidNumericValues.push({
      sourceSheet: sheetName,
      sourceRow,
      excelKeyForNoRegist: key,
      column,
      header: headerLabel,
      value: rawValue,
      reason: forecastNumberInvalidReason(rawValue),
    });
  };

  dataRows.forEach((row, index) => {
    const sourceRow = index + 2;
    const rawKey = normalizeKey(row[0]);
    const keyMissing = !rawKey;
    const key = rawKey || buildSyntheticImportKey(sheetName, sourceRow);
    if (keyMissing) {
      missingKeyRows.push({ sourceSheet: sheetName, sourceRow });
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
      priceValues: forecastColumns.map(() => 0),
      amountValues: forecastColumns.map(() => 0),
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
      const qtyRaw = row[forecastColumn.qtyIndex];
      const qtyParsed = parseForecastNumber(qtyRaw);
      if (qtyParsed.ok) {
        group.forecastValues[forecastIndex] += qtyParsed.value;
      } else {
        pushInvalid(sourceRow, key, forecastColumn.col, forecastColumn.header, qtyRaw);
      }

      if (hasPriceColumns && forecastColumn.priceIndex >= 0) {
        const priceRaw = row[forecastColumn.priceIndex];
        const priceParsed = parseForecastNumber(priceRaw);
        if (priceParsed.ok) {
          group.priceValues[forecastIndex] += priceParsed.value;
        } else {
          pushInvalid(sourceRow, key, XLSX.utils.encode_col(forecastColumn.priceIndex), forecastColumn.priceHeader, priceRaw);
        }
      }

      if (hasAmountColumns && forecastColumn.amountIndex >= 0) {
        const amountRaw = row[forecastColumn.amountIndex];
        const amountParsed = parseForecastNumber(amountRaw);
        if (amountParsed.ok) {
          group.amountValues[forecastIndex] += amountParsed.value;
        } else {
          pushInvalid(sourceRow, key, XLSX.utils.encode_col(forecastColumn.amountIndex), forecastColumn.amountHeader, amountRaw);
        }
      }
    });

    excelGroups.set(key, group);
  });

  return {
    sheetName,
    totalDataRows: dataRows.length,
    forecastColumns,
    hasPriceColumns,
    hasAmountColumns,
    headerErrors,
    detectedHeaders,
    missingKeyRows,
    invalidNumericValues,
    excelGroups,
  };
}

export function mergeVersionedSheetResults(sheetResults: VersionedSheetParseResult[]): MergedVersionedSheetParseResult {
  if (sheetResults.length === 0) {
    return {
      sheetNames: [],
      totalDataRows: 0,
      forecastColumns: [],
      hasPriceColumns: false,
      hasAmountColumns: false,
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
  const crossSheetDuplicateKeys: VersionedCrossSheetDuplicateKey[] = [];

  for (const result of sheetResults) {
    for (const group of result.excelGroups.values()) {
      const existing = excelGroups.get(group.keyNoRegist);
      if (!existing) {
        excelGroups.set(group.keyNoRegist, {
          ...group,
          sourceRows: [...group.sourceRows],
          sourceSheetRows: [...group.sourceSheetRows],
          forecastValues: [...group.forecastValues],
          priceValues: [...group.priceValues],
          amountValues: [...group.amountValues],
        });
        continue;
      }

      const incomingSheet = result.sheetName;
      const existingSheets = new Set(existing.sourceSheetRows.map(entry => entry.sourceSheet));
      if (!existingSheets.has(incomingSheet)) {
        let crossEntry = crossSheetDuplicateKeys.find(item => item.excelKeyForNoRegist === group.keyNoRegist);
        if (!crossEntry) {
          crossEntry = {
            excelKeyForNoRegist: group.keyNoRegist,
            entries: [...existing.sourceSheetRows],
          };
          crossSheetDuplicateKeys.push(crossEntry);
        }
        crossEntry.entries.push(...group.sourceSheetRows);
      }

      mergeExcelGroups(existing, group);
    }
  }

  return {
    sheetNames,
    totalDataRows: sheetResults.reduce((sum, result) => sum + result.totalDataRows, 0),
    forecastColumns: canonical.forecastColumns,
    hasPriceColumns: sheetResults.some(result => result.hasPriceColumns),
    hasAmountColumns: sheetResults.some(result => result.hasAmountColumns),
    headerErrors,
    detectedHeaders: canonical.detectedHeaders,
    missingKeyRows,
    invalidNumericValues,
    excelGroups,
    crossSheetDuplicateKeys,
  };
}
