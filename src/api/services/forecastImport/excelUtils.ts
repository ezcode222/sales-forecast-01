import * as XLSX from 'xlsx';
import { KEY_HEADER, MONTH_INDEX_BY_ABBREVIATION } from './constants';
import type { ForecastImportColumn } from './types';

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

export function parseForecastMonthColumn(value: unknown, index: number): ForecastImportColumn | null {
  const header = normalizeHeader(value).toUpperCase();
  const match = /^([A-Z]{3})-(\d{2})$/.exec(header);
  if (!match) return null;
  const monthIndex = MONTH_INDEX_BY_ABBREVIATION[match[1]];
  if (monthIndex === undefined) return null;
  const year = 2000 + Number(match[2]);
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
  const match = /^[PA]_([A-Z]{3})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const monthAbbr = match[1].toUpperCase();
  const monthIndex = MONTH_INDEX_BY_ABBREVIATION[monthAbbr];
  if (monthIndex === undefined) return null;
  const year = 2000 + Number(match[2]);
  const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return { month, header: raw };
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

export function findHeaderIndex(header: unknown[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(alias => alias.trim().toUpperCase()));
  return header.findIndex(value => normalizedAliases.has(normalizeHeader(value).toUpperCase()));
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
    const normalized = normalizeHeader(value);
    if (/^P_/i.test(normalized)) {
      priceByMonth.set(parsed.month, { index, header: parsed.header });
    } else if (/^A_/i.test(normalized)) {
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
  if (normalizeHeader(header[0]) !== KEY_HEADER) return false;
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
