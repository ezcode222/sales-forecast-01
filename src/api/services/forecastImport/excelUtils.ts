import * as XLSX from 'xlsx';
import { KEY_HEADER_ALIASES, MONTH_INDEX_BY_ABBREVIATION } from './constants';
import type { ExcelForecastGroup, ForecastImportColumn } from './types';

/**
 * After duplicate Excel keys are aggregated, price must be amount/qty
 * (not sum of unit prices). Single-row groups keep Excel price as-is.
 */
export function recomputeAggregatedPrices(group: ExcelForecastGroup) {
  if (group.sourceSheetRows.length <= 1) return;
  for (let index = 0; index < group.forecastValues.length; index += 1) {
    const qty = group.forecastValues[index];
    const amount = group.amountValues[index];
    group.priceValues[index] = qty > 0 ? amount / qty : 0;
  }
}

export function unknownToDisplayString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

export function normalizeHeader(value: unknown) {
  return unknownToDisplayString(value).trim();
}

export function normalizeKey(value: unknown) {
  return unknownToDisplayString(value).trim();
}

/** UFA NewKey may be Topic/SoldTo/ShipTo/EndUser/Plant/Material/OnOff (7 parts). */
export function toImportKeyForNoRegist(rawKey: string) {
  const key = normalizeKey(rawKey);
  const parts = key.split('/');
  if (parts.length === 7 && /^(on|off)$/i.test(parts[6].trim())) {
    return parts.slice(1).map(part => part.trim()).join('/');
  }
  return key;
}

export function registrationTopicFromImportKey(rawKey: string) {
  const key = normalizeKey(rawKey);
  const parts = key.split('/');
  if (parts.length === 7 && /^(on|off)$/i.test(parts[6].trim())) {
    return parts[0].trim() || null;
  }
  return null;
}

export function isImportKeyHeader(value: unknown) {
  const header = normalizeHeader(value).toUpperCase();
  return KEY_HEADER_ALIASES.some(alias => alias.toUpperCase() === header);
}

export const SYNTHETIC_IMPORT_KEY_PREFIX = '__IMPORT__';

export function buildSyntheticImportKey(sheetName: string, sourceRow: number) {
  return `${SYNTHETIC_IMPORT_KEY_PREFIX}/${sheetName}/${sourceRow}`;
}

export function isSyntheticImportKey(key: string) {
  return normalizeKey(key).startsWith(`${SYNTHETIC_IMPORT_KEY_PREFIX}/`);
}

export function normalizeNullableKey(value: unknown) {
  const key = normalizeKey(value);
  return !key || key.toLowerCase() === 'null' ? null : key;
}

export function firstWednesdayPeriod(month: string) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysUntilWednesday = (3 - firstDay.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + daysUntilWednesday))
    .toISOString()
    .slice(0, 10);
}

export function firstDayOfMonthPeriod(month: string) {
  return `${month}-01`;
}

function parseMonthYearToken(header: string): { monthAbbr: string; year2: string } | null {
  const normalized = header.trim().toUpperCase().replaceAll(/\s+/g, '');
  const dash = /^([A-Z]{3})-(\d{2})$/.exec(normalized);
  if (dash) return { monthAbbr: dash[1], year2: dash[2] };
  const apostrophe = /^([A-Z]{3})'(\d{2})$/.exec(normalized);
  if (apostrophe) return { monthAbbr: apostrophe[1], year2: apostrophe[2] };
  return null;
}

export function parseForecastMonthColumn(value: unknown, index: number): ForecastImportColumn | null {
  const header = normalizeHeader(value).toUpperCase();
  // Qty month headers only — skip price/amount suffixes.
  if (/_(PRICE|AMT|AMOUNT)$/i.test(header)) return null;
  const match = parseMonthYearToken(header);
  if (!match) return null;
  const monthIndex = MONTH_INDEX_BY_ABBREVIATION[match.monthAbbr];
  if (monthIndex === undefined) return null;
  const year = 2000 + Number(match.year2);
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return {
    col: XLSX.utils.encode_col(index),
    index,
    header,
    month,
    period: firstWednesdayPeriod(month),
  };
}

export function parseMonthTokenFromPrefixedHeader(value: unknown): { month: string; header: string } | null {
  const raw = normalizeHeader(value).toUpperCase();
  const prefixed = /^[PA]_([A-Z]{3})-(\d{2})$/.exec(raw);
  if (prefixed) {
    const monthAbbr = prefixed[1];
    const monthIndex = MONTH_INDEX_BY_ABBREVIATION[monthAbbr];
    if (monthIndex === undefined) return null;
    const year = 2000 + Number(prefixed[2]);
    const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return { month, header: raw };
  }

  const suffix = /^([A-Z]{3})[-'](\d{2})_(PRICE|AMT|AMOUNT)$/.exec(raw.replaceAll(/\s+/g, ''));
  if (suffix) {
    const monthAbbr = suffix[1];
    const monthIndex = MONTH_INDEX_BY_ABBREVIATION[monthAbbr];
    if (monthIndex === undefined) return null;
    const year = 2000 + Number(suffix[2]);
    const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    return { month, header: raw };
  }
  return null;
}

export function isFirstWednesdayPeriod(period: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return false;
  const month = period.slice(0, 7);
  return firstWednesdayPeriod(month) === period;
}

export function isFirstDayOfMonthPeriod(period: string) {
  return /^\d{4}-\d{2}-01$/.test(period);
}

export function nextMonthStart(month: string) {
  const [yearText, monthText] = month.split('-');
  const next = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
  return next.toISOString().slice(0, 10);
}

export function getOnOffFromKey(key: string) {
  const value = key.split('/').at(-1)?.trim();
  return value || null;
}

export function nullableText(value: unknown) {
  const text = normalizeKey(value);
  return text ? text : null;
}

export function firstValue(current: string | null, value: unknown) {
  return current ?? nullableText(value);
}

export function findSpreadColumnIndex(header: unknown[]) {
  const normalized = header.map(value => normalizeHeader(value));
  const exactCustomer5 = normalized.findIndex(
    value => value.toLowerCase() === 'spread to customer5',
  );
  if (exactCustomer5 >= 0) return exactCustomer5;

  const customerSpread = normalized.findIndex(value => {
    const lower = value.toLowerCase();
    return lower === 'spread to customer' || lower.startsWith('spread to customer');
  });
  if (customerSpread >= 0) return customerSpread;

  return normalized.findIndex(value => /^spread/i.test(value));
}

export function findPricingPolicyColumnIndex(header: unknown[]) {
  const normalized = header.map(value => normalizeHeader(value));
  const exact = normalized.findIndex(value => {
    const lower = value.toLowerCase();
    return lower === 'pricing policy' || lower === 'pricingpolicy' || lower === 'price policy';
  });
  if (exact >= 0) return exact;
  return normalized.findIndex(value => value.toLowerCase().startsWith('pricing policy'));
}

export function parsePricingPolicyCell(value: unknown) {
  if (value === null || value === undefined) {
    return { ok: true as const, value: null as string | null };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false as const };
    return { ok: true as const, value: String(value) };
  }
  const text = unknownToDisplayString(value).trim();
  if (text === '') return { ok: true as const, value: null as string | null };
  return { ok: true as const, value: text };
}

export function parseSpreadCell(value: unknown) {
  if (value === null || value === undefined) {
    return { ok: true as const, value: null as string | null };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { ok: false as const };
    return { ok: true as const, value: String(value) };
  }
  const text = unknownToDisplayString(value).trim();
  if (text === '') return { ok: true as const, value: null as string | null };
  return { ok: true as const, value: text };
}

export function firstSpreadValue(current: string | null, value: unknown) {
  if (current !== null) return current;
  const parsed = parseSpreadCell(value);
  return parsed.ok ? parsed.value : current;
}

export function findHeaderIndex(header: unknown[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(alias => alias.trim().toUpperCase()));
  return header.findIndex(value => normalizedAliases.has(normalizeHeader(value).toUpperCase()));
}

export type ImportSheetLayout = 'polymer' | 'cp' | 'ufa';

export interface ImportMetadataColumns {
  layout: ImportSheetLayout;
  materialCode: number;
  plantCode: number;
  country: number;
  onOff: number;
  process: number;
  application: number;
  subApplication: number;
  soldTo: number;
  shipTo: number;
  enduser: number;
  owner: number;
  productName: number;
  gradeUfa: number;
  gradeSap: number;
  materialDescription: number;
  registrationTopic: number;
  plantName: number;
  soldToCode: number;
  shipToCode: number;
  endUserCode: number;
  pic: number;
}

const EMPTY_NAMED_METADATA = {
  productName: -1,
  gradeUfa: -1,
  gradeSap: -1,
  materialDescription: -1,
  registrationTopic: -1,
  plantName: -1,
  soldToCode: -1,
  shipToCode: -1,
  endUserCode: -1,
  pic: -1,
} as const;

const POLYMER_METADATA_COLUMNS: ImportMetadataColumns = {
  layout: 'polymer',
  materialCode: 6,
  plantCode: 17,
  country: 19,
  onOff: 20,
  process: 21,
  application: 22,
  subApplication: 23,
  soldTo: 25,
  shipTo: 26,
  enduser: 27,
  owner: 30,
  ...EMPTY_NAMED_METADATA,
};

const CP_METADATA_COLUMNS: ImportMetadataColumns = {
  layout: 'cp',
  materialCode: 5,
  plantCode: 15,
  country: 17,
  onOff: 18,
  process: 19,
  application: 20,
  subApplication: 21,
  soldTo: 24,
  shipTo: 25,
  enduser: 26,
  owner: 27,
  ...EMPTY_NAMED_METADATA,
};

function isUfaImportHeader(header: unknown[]) {
  return (
    findHeaderIndex(header, [
      'Product Name (PUD)',
      'Product Name (PUD/PCD)',
      'Grade(UFA)',
      'Grade (UFA)',
      'Grade(SAP)',
      'Grade (SAP)',
    ]) >= 0
  );
}

function resolveUfaMetadataColumns(header: unknown[]): ImportMetadataColumns {
  const idx = (aliases: string[]) => findHeaderIndex(header, aliases);
  return {
    layout: 'ufa',
    materialCode: idx(['MaterialCode', 'Material Code']),
    plantCode: idx(['PlantCode', 'Plant Code']),
    country: idx(['CountryName', 'Country Name', 'Country']),
    onOff: idx(['On/Off Spec', 'OnOff', 'On/Off']),
    process: idx(['Process']),
    application: idx(['Application']),
    subApplication: idx(['Sub-App', 'SubApp', 'Sub App']),
    soldTo: idx(['SoldTo_name', 'Sold To', 'SoldTo']),
    shipTo: idx(['ShipTo_name', 'Ship To', 'ShipTo']),
    enduser: idx(['End_user', 'End User', 'EndUser']),
    owner: idx(['OwnerName', 'Owner Name']),
    productName: idx(['Product Name (PUD)', 'Product Name (PUD/PCD)', 'Product Name']),
    gradeUfa: idx(['Grade(UFA)', 'Grade (UFA)']),
    gradeSap: idx(['Grade(SAP)', 'Grade (SAP)']),
    materialDescription: idx(['MaterialDescription', 'Material Description']),
    registrationTopic: idx(['RegistrationTopic', 'Registration Topic']),
    plantName: idx(['PlantName', 'Plant Name']),
    soldToCode: idx(['SoldToCode', 'Sold To Code']),
    shipToCode: idx(['ShipToCode', 'Ship To Code']),
    endUserCode: idx(['EndUserCode', 'End User Code']),
    pic: idx(['Pic', 'PIC']),
  };
}

export function resolveImportMetadataColumns(header: unknown[]): ImportMetadataColumns {
  if (isUfaImportHeader(header)) return resolveUfaMetadataColumns(header);
  const secondColumn = normalizeHeader(header[1]).toUpperCase();
  if (secondColumn === 'H/C') return POLYMER_METADATA_COLUMNS;
  if (secondColumn === 'CODE') return CP_METADATA_COLUMNS;
  if (findHeaderIndex(header, ['PIC']) >= 0) return CP_METADATA_COLUMNS;
  if (findHeaderIndex(header, ['H/C']) >= 0) return POLYMER_METADATA_COLUMNS;
  return POLYMER_METADATA_COLUMNS;
}

export function parseForecastNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return { ok: true as const, value: 0 };
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? { ok: true as const, value } : { ok: false as const };
  }
  if (typeof value !== 'string') return { ok: false as const };
  const text = value.trim();
  if (text === '') return { ok: true as const, value: 0 };
  const normalized = text.replaceAll(',', '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? { ok: true as const, value: parsed } : { ok: false as const };
}

export function forecastNumberInvalidReason(value: unknown) {
  const text = unknownToDisplayString(value).trim().replaceAll(',', '');
  if (text === '') return 'Not a valid number';
  const parsed = Number(text);
  if (Number.isFinite(parsed) && parsed < 0) return 'Negative numbers are not allowed';
  return 'Not a valid number';
}

export function getRequestWorkbookBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (body && typeof body === 'object' && 'fileBase64' in body) {
    const encoded = (body as { fileBase64?: unknown }).fileBase64;
    if (typeof encoded === 'string' && encoded.trim()) return Buffer.from(encoded, 'base64');
  }
  return null;
}

export type ExtendedForecastColumn = ForecastImportColumn & {
  qtyIndex: number;
  priceIndex: number;
  amountIndex: number;
  priceHeader: string;
  amountHeader: string;
};

export function buildExtendedForecastColumns(
  header: unknown[],
  periodForMonth: (month: string) => string
): { columns: ExtendedForecastColumn[]; hasPriceColumns: boolean; hasAmountColumns: boolean } {
  const qtyColumns = header
    .map((value, index) => parseForecastMonthColumn(value, index))
    .filter((column): column is ForecastImportColumn => column !== null);

  const priceByMonth = new Map<string, { index: number; header: string }>();
  const amountByMonth = new Map<string, { index: number; header: string }>();

  header.forEach((value, index) => {
    const parsed = parseMonthTokenFromPrefixedHeader(value);
    if (!parsed) return;
    const normalized = normalizeHeader(value).replaceAll(/\s+/g, '');
    if (/^P_/i.test(normalized) || /_PRICE$/i.test(normalized)) {
      priceByMonth.set(parsed.month, { index, header: parsed.header });
    } else if (/^A_/i.test(normalized) || /_(AMT|AMOUNT)$/i.test(normalized)) {
      amountByMonth.set(parsed.month, { index, header: parsed.header });
    }
  });

  const columns = qtyColumns.map(qtyColumn => {
    const price = priceByMonth.get(qtyColumn.month);
    const amount = amountByMonth.get(qtyColumn.month);
    return {
      ...qtyColumn,
      period: periodForMonth(qtyColumn.month),
      qtyIndex: qtyColumn.index,
      priceIndex: price?.index ?? -1,
      amountIndex: amount?.index ?? -1,
      priceHeader: price?.header ?? '',
      amountHeader: amount?.header ?? '',
    };
  });

  return {
    columns,
    hasPriceColumns: priceByMonth.size > 0,
    hasAmountColumns: amountByMonth.size > 0,
  };
}

export function sheetHasLegacyImportLayout(sheet: XLSX.WorkSheet) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  });
  const header = rows[0] ?? [];
  if (!isImportKeyHeader(header[0])) return false;
  return header.some((value, index) => parseForecastMonthColumn(value, index) !== null);
}

export function forecastColumnSignature(columns: Array<{ month: string }>) {
  return columns.map(column => column.month).sort((left, right) => left.localeCompare(right)).join('|');
}

export function primarySourceEntry(group: { sourceSheetRows: Array<{ sourceSheet: string; sourceRow: number }>; sourceRows: number[] }) {
  return group.sourceSheetRows[0] ?? { sourceSheet: '', sourceRow: group.sourceRows[0] ?? 0 };
}

export function blockedRowKey(sourceSheet: string, sourceRow: number) {
  return `${sourceSheet}|${sourceRow}`;
}

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
