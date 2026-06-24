import express, { Router } from 'express';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '../../db/prisma';
import { clearForecastSummaryCache } from './forecast';
import { getActiveSnapshotVersion } from '../services/dataSnapshot';
import {
  formatForecastPeriodForApi,
  parseForecastPeriodToDate,
} from '../../lib/forecastPeriod';

const router = Router();

const CURRENT_FORECAST_VERSION = 'Current Forecast';
const SHEET_NAME = 'Sheet1';
const KEY_HEADER = 'Key for no regist';
const PREVIEW_CONTRACT_VERSION = 5;
const DEFAULT_STAMP_PERIOD = 'No';
const ALLOWED_STAMP_PERIODS = new Set([
  DEFAULT_STAMP_PERIOD,
  'Weekly1',
  'Weekly2',
  'Weekly3',
  'Weekly4',
  'Weekly5',
  'Monthly1',
  'Monthly2',
]);

const MONTH_INDEX_BY_ABBREVIATION: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

type ForecastImportColumn = {
  col: string;
  index: number;
  header: string;
  month: string;
  period: string;
};

type NormalizedImportRecord = {
  sourceRow: number;
  excelKeyForNoRegist: string;
  matchedRegistrationId: string;
  version: typeof CURRENT_FORECAST_VERSION;
  sourceColumn: string;
  sourceMonthHeader: string;
  forecastMonth: string;
  period: string;
  granularity: 'week';
  qtyFcst: number;
  action?: 'create' | 'overwrite';
  oldQtyFcst?: number | null;
};

type ConfirmImportRecord = Pick<
  NormalizedImportRecord,
  'excelKeyForNoRegist' | 'matchedRegistrationId' | 'period' | 'granularity' | 'qtyFcst'
>;

type RegistrationMatch = {
  registrationId: string;
  keyForNoCRM: string;
  mainRegist: number;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
};

type ActualSummary = {
  keyForRegist: string | null;
  keyForNoRegist: string;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  qtyActual: Prisma.Decimal | number | null;
};

type UnifiedPreviewRow = {
  sourceRow: number | null;
  sourceRows: number[];
  status: 'matched' | 'actual_only' | 'registration_only' | 'proposed_registration';
  keyRegist: string | null;
  keyNoRegist: string;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
  qtyActual: number;
  qtyFcst: number;
  dimensionSource: 'registration' | 'actual' | 'excel' | 'actual_with_excel_fallback' | 'registration_with_actual_fallback';
};

type ExcelForecastGroup = {
  keyNoRegist: string;
  sourceRows: number[];
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
  forecastValues: number[];
  hasInvalidNumber: boolean;
};

let actualOnlyCachePromise: Promise<ActualSummary[]> | null = null;
let actualOnlyCacheVersion: string | null = null;

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim();
}

function firstWednesdayPeriod(month: string) {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const daysUntilWednesday = (3 - firstDay.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + daysUntilWednesday))
    .toISOString()
    .slice(0, 10);
}

function parseForecastMonthColumn(value: unknown, index: number): ForecastImportColumn | null {
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

function isFirstWednesdayPeriod(period: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return false;
  const month = period.slice(0, 7);
  return firstWednesdayPeriod(month) === period;
}

function nextMonthStart(month: string) {
  const [yearText, monthText] = month.split('-');
  const next = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
  return next.toISOString().slice(0, 10);
}

function normalizeKey(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeNullableKey(value: unknown) {
  const key = normalizeKey(value);
  return !key || key.toLowerCase() === 'null' ? null : key;
}

function getOnOffFromKey(key: string) {
  const value = key.split('/').at(-1)?.trim();
  return value || null;
}

function nullableText(value: unknown) {
  const text = normalizeKey(value);
  return text ? text : null;
}

function firstValue(current: string | null, value: unknown) {
  return current ?? nullableText(value);
}

function parseForecastNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return { ok: true as const, value: 0 };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true as const, value } : { ok: false as const };
  }
  const text = String(value).trim();
  if (text === '') return { ok: true as const, value: 0 };
  const normalized = text.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? { ok: true as const, value: parsed } : { ok: false as const };
}

function normalizeStampPeriod(value: unknown) {
  const stampPeriod = String(value ?? DEFAULT_STAMP_PERIOD).trim();
  return ALLOWED_STAMP_PERIODS.has(stampPeriod) ? stampPeriod : DEFAULT_STAMP_PERIOD;
}

function getRequestWorkbookBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (body && typeof body === 'object' && 'fileBase64' in body) {
    const encoded = (body as { fileBase64?: unknown }).fileBase64;
    if (typeof encoded === 'string' && encoded.trim()) return Buffer.from(encoded, 'base64');
  }
  return null;
}

async function findRegistrationMatches(keys: string[]) {
  if (keys.length === 0) return new Map<string, RegistrationMatch[]>();
  const snapshotVersion = await getActiveSnapshotVersion();
  const keysJson = JSON.stringify(keys);
  const crmRowsPromise = snapshotVersion
    ? prisma.$queryRaw<RegistrationMatch[]>`
      WITH requested_keys AS (
        SELECT CAST([value] AS NVARCHAR(500)) AS keyForNoCRM
        FROM OPENJSON(${keysJson})
      )
      SELECT
        r.registrationId, r.keyForNoCRM, CAST(1 AS INT) AS mainRegist,
        r.countryName AS country, r.soldToName AS soldTo, r.shipToName AS shipTo,
        r.endUser AS enduser, COALESCE(r.plantName, r.plantCode) AS plant,
        r.materialCode, r.onOffSpec AS onOff, r.process, r.application,
        r.subApp AS subApplication, r.ownerName AS owner
      FROM dbo.crm_registration_snapshot r
      INNER JOIN requested_keys requested ON requested.keyForNoCRM = r.keyForNoCRM
      WHERE r.snapshotVersion = ${snapshotVersion}
    `
    : prisma.$queryRaw<RegistrationMatch[]>`
      WITH requested_keys AS (
        SELECT CAST([value] AS NVARCHAR(500)) AS keyForNoCRM
        FROM OPENJSON(${keysJson})
      )
      SELECT
        CAST(ISNULL(r.[NewKey], r.[KeyforNoCRM]) AS NVARCHAR(200)) AS registrationId,
        CAST(r.[KeyforNoCRM] AS NVARCHAR(500)) AS keyForNoCRM,
        CAST(r.[MainRegist] AS INT) AS mainRegist,
        CAST(r.[CountryName] AS NVARCHAR(500)) AS country,
        CAST(r.[SoldTo_name] AS NVARCHAR(500)) AS soldTo,
        CAST(r.[ShipTo_name] AS NVARCHAR(500)) AS shipTo,
        CAST(r.[End_user] AS NVARCHAR(500)) AS enduser,
        CAST(ISNULL(r.[PlantName], r.[PlantCode]) AS NVARCHAR(500)) AS plant,
        CAST(r.[MaterialCode] AS NVARCHAR(500)) AS materialCode,
        CAST(r.[OnOffSpec] AS NVARCHAR(100)) AS onOff,
        CAST(r.[Cat1Name] AS NVARCHAR(500)) AS process,
        CAST(r.[Cat2Name] AS NVARCHAR(500)) AS application,
        CAST(r.[Cat3Name] AS NVARCHAR(500)) AS subApplication,
        CAST(r.[OwnerName] AS NVARCHAR(500)) AS owner
      FROM dbo.VW_CRM_RegistrationAll_1 r
      INNER JOIN requested_keys requested ON requested.keyForNoCRM = r.KeyforNoCRM
      WHERE r.MainRegist = 1
    `;

  const [crmRows, managedRows] = await Promise.all([
    crmRowsPromise,
    prisma.masterDataCrmRegistration.findMany({
      where: { mainRegist: 1, keyForNoCRM: { in: keys } },
    }),
  ]);
  const rows: RegistrationMatch[] = [
    ...crmRows,
    ...managedRows.map(row => ({
      registrationId: row.id,
      keyForNoCRM: row.keyForNoCRM,
      mainRegist: row.mainRegist,
      country: row.countryName,
      soldTo: row.soldToName,
      shipTo: row.shipToName,
      enduser: row.endUser,
      plant: row.plantName || row.plantCode,
      materialCode: row.materialCode,
      onOff: row.onOffSpec,
      process: row.process,
      application: row.application,
      subApplication: row.subApp,
      owner: row.ownerName,
    })),
  ];

  const map = new Map<string, RegistrationMatch[]>();
  for (const row of rows) {
    const key = normalizeKey(row.keyForNoCRM);
    const existing = map.get(key) ?? [];
    if (!existing.some(match => match.registrationId === row.registrationId)) {
      map.set(key, [...existing, row]);
    }
  }
  return map;
}

async function findActualSummaries(keys: string[], forecastColumns: ForecastImportColumn[]) {
  const sortedMonths = forecastColumns.map(column => column.month).sort();
  const startDate = `${sortedMonths[0]}-01`;
  const endExclusive = nextMonthStart(sortedMonths.at(-1)!);
  const snapshotVersion = await getActiveSnapshotVersion();
  const actualCacheVersion = `${snapshotVersion ?? 'legacy'}|${startDate}|${endExclusive}`;
  const keysJson = JSON.stringify(keys);
  const actualSource = snapshotVersion
    ? Prisma.sql`
      SELECT
        a.keyForRegist, a.keyForNoRegist, a.country, a.soldTo, a.shipTo,
        a.endUser AS enduser, a.plant, a.materialCode, a.qty, a.deliveryDate
      FROM dbo.actual_sales_snapshot a
      WHERE a.snapshotVersion = ${snapshotVersion}
    `
    : Prisma.sql`
      SELECT
        CAST(a.[Key for regist] AS NVARCHAR(500)) AS keyForRegist,
        CAST(a.[Key for no regist] AS NVARCHAR(500)) AS keyForNoRegist,
        CAST(a.[Ship-to Country ] AS NVARCHAR(500)) AS country,
        CAST(a.[Sold-to pt ] AS NVARCHAR(500)) AS soldTo,
        CAST(a.[Ship-to pt ] AS NVARCHAR(500)) AS shipTo,
        CAST(a.Enduser AS NVARCHAR(500)) AS enduser,
        CAST(a.Plant AS NVARCHAR(500)) AS plant,
        CAST(a.Material AS NVARCHAR(500)) AS materialCode,
        CAST(ISNULL(a.[Order Qty_TON], 0) AS DECIMAL(18,4)) AS qty,
        a.Deliverydate AS deliveryDate
      FROM dbo.MKT_SALEReport_ZSDR001_UGT_CRM_NYL_1 a
    `;

  const selectActualSummary = Prisma.sql`
    SELECT
      MAX(a.keyForRegist) AS keyForRegist,
      a.keyForNoRegist,
      MAX(a.country) AS country,
      MAX(a.soldTo) AS soldTo,
      MAX(a.shipTo) AS shipTo,
      MAX(a.enduser) AS enduser,
      MAX(a.plant) AS plant,
      MAX(a.materialCode) AS materialCode,
      ISNULL(SUM(a.qty), 0) AS qtyActual
    FROM actual_source a
  `;

  const excelActualPromise = keys.length === 0
    ? Promise.resolve([] as ActualSummary[])
    : prisma.$queryRaw<ActualSummary[]>`
        WITH requested_keys AS (
          SELECT CAST([value] AS NVARCHAR(500)) AS keyForNoRegist
          FROM OPENJSON(${keysJson})
        ),
        actual_source AS (${actualSource})
        ${selectActualSummary}
        INNER JOIN requested_keys requested ON requested.keyForNoRegist = a.keyForNoRegist
        WHERE a.deliveryDate >= ${startDate}
          AND a.deliveryDate < ${endExclusive}
        GROUP BY a.keyForNoRegist
      `;
  if (!actualOnlyCachePromise || actualOnlyCacheVersion !== actualCacheVersion) {
    actualOnlyCacheVersion = actualCacheVersion;
    actualOnlyCachePromise = prisma.$queryRaw<ActualSummary[]>`
        WITH actual_source AS (${actualSource})
        ${selectActualSummary}
        WHERE a.keyForNoRegist IS NOT NULL
          AND a.keyForRegist IS NULL
          AND a.deliveryDate >= ${startDate}
          AND a.deliveryDate < ${endExclusive}
        GROUP BY a.keyForNoRegist
      `.catch(error => {
        actualOnlyCachePromise = null;
        actualOnlyCacheVersion = null;
        throw error;
      });
  }
  const [excelKeyRows, actualOnlyRows] = await Promise.all([
    excelActualPromise,
    actualOnlyCachePromise,
  ]);

  return new Map(
    [...excelKeyRows, ...actualOnlyRows].map(row => [
      normalizeKey(row.keyForNoRegist),
      {
        ...row,
        keyForRegist: normalizeNullableKey(row.keyForRegist),
        keyForNoRegist: normalizeKey(row.keyForNoRegist),
        qtyActual: Number(row.qtyActual ?? 0),
      },
    ])
  );
}

router.post('/current-forecast/confirm', async (req, res) => {
  const sessionUser = (req as typeof req & { user?: { name?: string; email?: string } }).user;
  const changedBy = String(
    sessionUser?.name ??
    sessionUser?.email ??
    req.header('x-changed-by') ??
    'sales-forecast-web'
  ).trim() || 'sales-forecast-web';
  const body = req.body as {
    previewContractVersion?: unknown;
    records?: unknown;
    stampPeriod?: unknown;
  };
  const stampPeriod = normalizeStampPeriod(body.stampPeriod);
  if (body.previewContractVersion !== PREVIEW_CONTRACT_VERSION) {
    return res.status(409).json({
      error: 'Preview is outdated. Run Preview again before importing.',
      code: 'STALE_PREVIEW',
    });
  }
  if (!Array.isArray(body.records) || body.records.length === 0) {
    return res.status(400).json({ error: 'No importable forecast records were supplied.' });
  }
  if (body.records.length > 20_000) {
    return res.status(413).json({ error: 'Import contains too many records.' });
  }

  const records: ConfirmImportRecord[] = [];
  for (const value of body.records) {
    if (!value || typeof value !== 'object') {
      return res.status(400).json({ error: 'Invalid import record.' });
    }
    const record = value as Record<string, unknown>;
    const excelKeyForNoRegist = normalizeKey(record.excelKeyForNoRegist);
    const matchedRegistrationId = normalizeKey(record.matchedRegistrationId);
    const period = normalizeKey(record.period);
    const qtyFcst = Number(record.qtyFcst);
    if (
      !excelKeyForNoRegist ||
      !matchedRegistrationId ||
      !isFirstWednesdayPeriod(period) ||
      record.granularity !== 'week' ||
      !Number.isFinite(qtyFcst)
    ) {
      return res.status(400).json({ error: 'Import contains an invalid forecast record.' });
    }
    records.push({
      excelKeyForNoRegist,
      matchedRegistrationId,
      period,
      granularity: 'week',
      qtyFcst,
    });
  }
  const allowedPeriods = new Set(records.map(record => record.period));

  const duplicateRecordKeys = new Set<string>();
  for (const record of records) {
    const key = `${record.matchedRegistrationId}|${record.period}`;
    if (duplicateRecordKeys.has(key)) {
      return res.status(400).json({
        error: `Import contains duplicate forecast destination ${key}.`,
      });
    }
    duplicateRecordKeys.add(key);
  }

  try {
    const registrationMatches = await findRegistrationMatches([
      ...new Set(records.map(record => record.excelKeyForNoRegist)),
    ]);
    for (const record of records) {
      const matches = registrationMatches.get(record.excelKeyForNoRegist) ?? [];
      if (
        matches.length !== 1 ||
        matches[0].registrationId !== record.matchedRegistrationId
      ) {
        return res.status(409).json({
          error: `Registration matching changed for ${record.excelKeyForNoRegist}. Run Preview again.`,
          code: 'REGISTRATION_MATCH_CHANGED',
        });
      }
    }

    const existingRows = await prisma.forecastValue.findMany({
      where: {
        versionName: CURRENT_FORECAST_VERSION,
        registrationId: { in: [...new Set(records.map(record => record.matchedRegistrationId))] },
        period: { in: [...allowedPeriods].map(period => parseForecastPeriodToDate(period, 'week')) },
      },
      select: {
        registrationId: true,
        period: true,
        granularity: true,
        qtyFcst: true,
        priceFcst: true,
      },
    });
    const existingKeys = new Set(
      existingRows.map(row => `${row.registrationId}|${formatForecastPeriodForApi(row.period, row.granularity)}`)
    );
    const existingMap = new Map(
      existingRows.map(row => [`${row.registrationId}|${formatForecastPeriodForApi(row.period, row.granularity)}`, row])
    );
    const changedRecords = records.filter(record => {
      const existing = existingMap.get(`${record.matchedRegistrationId}|${record.period}`);
      if (!existing) return true;
      return Math.abs(Number(existing.qtyFcst ?? 0) - record.qtyFcst) > 0.0001;
    });
    const changedKeys = new Set(
      changedRecords.map(record => `${record.matchedRegistrationId}|${record.period}`)
    );

    const mergePayload = JSON.stringify(records.map(record => ({
      registrationId: record.matchedRegistrationId,
      period: record.period,
      qtyFcst: record.qtyFcst,
      changed: changedKeys.has(`${record.matchedRegistrationId}|${record.period}`) ? 1 : 0,
    })));
    await prisma.$transaction(async transaction => {
      await transaction.forecastVersion.upsert({
        where: { name: CURRENT_FORECAST_VERSION },
        create: { name: CURRENT_FORECAST_VERSION, versionKey: 1, isStandard: true },
        update: { versionKey: 1, isStandard: true },
      });
      const batch = await transaction.forecastCommitBatch.create({
        data: {
          source: 'excel_import',
          changedBy,
          stampPeriod,
          recordCount: changedRecords.length,
        },
      });
      await transaction.$executeRaw`
        MERGE [dbo].[forecast_values] AS target
        USING (
          SELECT registrationId, period, qtyFcst
          FROM OPENJSON(${mergePayload})
          WITH (
            registrationId NVARCHAR(200) '$.registrationId',
            period DATE '$.period',
            qtyFcst DECIMAL(18,4) '$.qtyFcst',
            changed INT '$.changed'
          )
        ) AS source
        ON target.registrationId = source.registrationId
          AND target.versionName = ${CURRENT_FORECAST_VERSION}
          AND target.period = source.period
        WHEN MATCHED THEN
          UPDATE SET
            target.granularity = 'week',
            target.qtyFcst = source.qtyFcst,
            target.lastBatchId = CASE
              WHEN source.changed = 1 THEN ${batch.id}
              ELSE target.lastBatchId
            END,
            target.updatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            registrationId, versionName, period, granularity,
            qtyFcst, priceFcst, lastBatchId, updatedAt
          )
          VALUES (
            source.registrationId, ${CURRENT_FORECAST_VERSION}, source.period, 'week',
            source.qtyFcst, 0, ${batch.id}, SYSUTCDATETIME()
          );
      `;
      if (changedRecords.length > 0) {
        await transaction.forecastChangeLog.createMany({
          data: changedRecords.map(record => {
            const existing = existingMap.get(`${record.matchedRegistrationId}|${record.period}`);
            return {
              batchId: batch.id,
              registrationId: record.matchedRegistrationId,
              versionName: CURRENT_FORECAST_VERSION,
              period: parseForecastPeriodToDate(record.period, 'week'),
              granularity: 'week',
              oldQtyFcst: existing?.qtyFcst ?? null,
              newQtyFcst: record.qtyFcst,
              oldPriceFcst: existing?.priceFcst ?? null,
              newPriceFcst: 0,
            };
          }),
        });
      }
    }, { timeout: 120_000 });

    clearForecastSummaryCache();
    const overwritten = records.filter(record =>
      existingKeys.has(`${record.matchedRegistrationId}|${record.period}`)
    ).length;
    res.json({
      ok: true,
      imported: records.length,
      created: records.length - overwritten,
      overwritten,
      version: CURRENT_FORECAST_VERSION,
    });
  } catch (error) {
    console.error('[current-forecast-import] confirm error:', error);
    res.status(500).json({ error: 'Failed to import Current Forecast records' });
  }
});

/**
 * POST /api/import/current-forecast/preview
 *
 * Preview only. No database writes.
 *
 * Supported request bodies:
 * - raw .xlsx bytes with content-type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 * - raw .xlsx bytes with content-type application/octet-stream
 * - JSON { fileBase64: string }
 */
router.post(
  '/current-forecast/preview',
  express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
    limit: '25mb',
  }),
  async (req, res) => {
    const workbookBuffer = getRequestWorkbookBuffer(req.body);
    if (!workbookBuffer || workbookBuffer.length === 0) {
      return res.status(400).json({
        error: 'Excel file is required. Send raw .xlsx bytes or JSON { fileBase64 }.',
      });
    }

    try {
      const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false });
      const sheet = workbook.Sheets[SHEET_NAME];
      if (!sheet) {
        return res.status(400).json({
          error: `Required sheet "${SHEET_NAME}" was not found.`,
          sheets: workbook.SheetNames,
        });
      }

      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
        raw: true,
      });

      const header = rows[0] ?? [];
      const dataRows = rows.slice(1);
      const headerErrors: Array<{ column: string; expected: string; actual: string }> = [];
      const detectedHeaders = header.map((value, index) => ({
        index,
        name: normalizeHeader(value),
      }));
      const forecastColumns = header
        .map((value, index) => parseForecastMonthColumn(value, index))
        .filter((column): column is ForecastImportColumn => column !== null);

      if (normalizeHeader(header[0]) !== KEY_HEADER) {
        headerErrors.push({ column: 'A', expected: KEY_HEADER, actual: normalizeHeader(header[0]) });
      }
      header.forEach((value, index) => {
        const normalized = normalizeHeader(value).toUpperCase();
        if (/^[A-Z]{3}-\d{2}$/.test(normalized) && !parseForecastMonthColumn(value, index)) {
          headerErrors.push({
            column: XLSX.utils.encode_col(index),
            expected: 'Valid MMM-YY forecast month (for example JUL-26)',
            actual: normalized,
          });
        }
      });
      if (forecastColumns.length === 0) {
        headerErrors.push({
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
            column: forecastColumn.col,
            expected: `Unique forecast month ${forecastColumn.header}`,
            actual: `Duplicate of column ${existing.col}`,
          });
        } else {
          forecastColumnsByMonth.set(forecastColumn.month, forecastColumn);
        }
      }
      forecastColumns.sort((left, right) => left.month.localeCompare(right.month));

      if (forecastColumns.length === 0) {
        return res.status(400).json({
          error: 'No forecast month columns were found. Use headers such as JUN-26 or JUL-26.',
          detectedHeaders,
          headerErrors,
        });
      }

      const excelGroups = new Map<string, ExcelForecastGroup>();
      const missingKeyRows: Array<{ sourceRow: number }> = [];
      const invalidNumericValues: Array<{
        sourceRow: number;
        excelKeyForNoRegist: string;
        column: string;
        header: string;
        value: unknown;
      }> = [];

      dataRows.forEach((row, index) => {
        const sourceRow = index + 2;
        const key = normalizeKey(row[0]);
        if (!key) {
          missingKeyRows.push({ sourceRow });
          return;
        }

        const group = excelGroups.get(key) ?? {
          keyNoRegist: key,
          sourceRows: [],
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
          forecastValues: forecastColumns.map(() => 0),
          hasInvalidNumber: false,
        };

        group.sourceRows.push(sourceRow);
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

        forecastColumns.forEach((forecastColumn, forecastIndex) => {
          const rawValue = row[forecastColumn.index];
          const parsed = parseForecastNumber(rawValue);
          if (!parsed.ok) {
            group.hasInvalidNumber = true;
            invalidNumericValues.push({
              sourceRow,
              excelKeyForNoRegist: key,
              column: forecastColumn.col,
              header: forecastColumn.header,
              value: rawValue,
            });
            return;
          }
          group.forecastValues[forecastIndex] += parsed.value;
        });

        excelGroups.set(key, group);
      });

      const duplicateExcelKeys = [...excelGroups.values()]
        .filter(group => group.sourceRows.length > 1)
        .map(group => ({
          excelKeyForNoRegist: group.keyNoRegist,
          sourceRows: group.sourceRows,
        }));

      const [registrationMatches, actualSummaries] = await Promise.all([
        findRegistrationMatches([...excelGroups.keys()]),
        findActualSummaries([...excelGroups.keys()], forecastColumns),
      ]);

      const unmatchedRows: Array<{ sourceRow: number; excelKeyForNoRegist: string }> = [];
      const duplicateRegistrationMatches: Array<{
        sourceRow: number;
        excelKeyForNoRegist: string;
        matchedRegistrationIds: string[];
      }> = [];
      const candidateRecords: NormalizedImportRecord[] = [];

      for (const group of excelGroups.values()) {
        if (group.hasInvalidNumber) continue;
        const sourceRow = group.sourceRows[0];
        const excelKeyForNoRegist = group.keyNoRegist;
        const matches = registrationMatches.get(group.keyNoRegist) ?? [];
        if (matches.length === 0) {
          continue;
        }
        if (matches.length > 1) {
          duplicateRegistrationMatches.push({
            sourceRow,
            excelKeyForNoRegist,
            matchedRegistrationIds: matches.map(match => match.registrationId),
          });
          continue;
        }

        const rowRecords: NormalizedImportRecord[] = forecastColumns.map((forecastColumn, forecastIndex) => ({
            sourceRow,
            excelKeyForNoRegist,
            matchedRegistrationId: matches[0].registrationId,
            version: CURRENT_FORECAST_VERSION,
            sourceColumn: forecastColumn.col,
            sourceMonthHeader: forecastColumn.header,
            forecastMonth: forecastColumn.month,
            period: forecastColumn.period,
            granularity: 'week',
            qtyFcst: group.forecastValues[forecastIndex],
          }));

        candidateRecords.push(...rowRecords);
      }

      const hasBlockingHeaderErrors = headerErrors.length > 0;
      const matchedRegistrationIds = hasBlockingHeaderErrors
        ? []
        : [...new Set(candidateRecords.map(record => record.matchedRegistrationId))];
      const periods = forecastColumns.map(column => column.period);
      const existingRows = matchedRegistrationIds.length > 0
        ? await prisma.forecastValue.findMany({
            where: {
              versionName: CURRENT_FORECAST_VERSION,
              registrationId: { in: matchedRegistrationIds },
              period: { in: periods.map(period => parseForecastPeriodToDate(period, 'week')) },
            },
            select: {
              registrationId: true,
              period: true,
              qtyFcst: true,
              priceFcst: true,
              granularity: true,
            },
          })
        : [];

      const existingRowMap = new Map(
        existingRows.map(row => [
          `${row.registrationId}|${formatForecastPeriodForApi(row.period, row.granularity)}`,
          row,
        ])
      );
      const importableRecords = hasBlockingHeaderErrors
        ? []
        : candidateRecords.map(record => {
            const existing = existingRowMap.get(`${record.matchedRegistrationId}|${record.period}`);
            return {
              ...record,
              action: existing ? 'overwrite' as const : 'create' as const,
              oldQtyFcst: existing ? Number(existing.qtyFcst) : null,
            };
          });
      const overwriteRecords = importableRecords
        .filter(record => record.action === 'overwrite')
        .map(record => ({
          sourceRow: record.sourceRow,
          excelKeyForNoRegist: record.excelKeyForNoRegist,
          matchedRegistrationId: record.matchedRegistrationId,
          period: record.period,
          sourceMonthHeader: record.sourceMonthHeader,
          oldQtyFcst: record.oldQtyFcst ?? 0,
          newQtyFcst: record.qtyFcst,
        }));
      const createRecords = importableRecords.filter(record => record.action === 'create');

      const unifiedPreviewRows: UnifiedPreviewRow[] = [];
      const previewKeySet = new Set<string>();
      for (const group of excelGroups.values()) {
        if (group.hasInvalidNumber) continue;
        const registration = registrationMatches.get(group.keyNoRegist)?.[0];
        const actual = actualSummaries.get(group.keyNoRegist);
        const hasActual = Boolean(actual);
        previewKeySet.add(group.keyNoRegist);

        if (!registration) {
          unifiedPreviewRows.push({
            sourceRow: group.sourceRows[0],
            sourceRows: group.sourceRows,
            status: 'proposed_registration',
            keyRegist: null,
            keyNoRegist: group.keyNoRegist,
            country: actual?.country ?? group.country,
            soldTo: actual?.soldTo ?? group.soldTo,
            shipTo: actual?.shipTo ?? group.shipTo,
            enduser: actual?.enduser ?? group.enduser,
            plant: actual?.plant ?? group.plant,
            materialCode: actual?.materialCode ?? group.materialCode,
            onOff: group.onOff ?? getOnOffFromKey(group.keyNoRegist),
            process: group.process,
            application: group.application,
            subApplication: group.subApplication,
            owner: group.owner,
            qtyActual: Number(actual?.qtyActual ?? 0),
            qtyFcst: group.forecastValues.reduce((sum, value) => sum + value, 0),
            dimensionSource: actual ? 'actual_with_excel_fallback' : 'excel',
          });
          continue;
        }

        unifiedPreviewRows.push({
          sourceRow: group.sourceRows[0],
          sourceRows: group.sourceRows,
          status: hasActual ? 'matched' : 'registration_only',
          keyRegist: registration.registrationId,
          keyNoRegist: group.keyNoRegist,
          country: registration.country ?? actual?.country ?? null,
          soldTo: registration.soldTo ?? actual?.soldTo ?? null,
          shipTo: registration.shipTo ?? actual?.shipTo ?? null,
          enduser: registration.enduser ?? actual?.enduser ?? null,
          plant: registration.plant ?? actual?.plant ?? null,
          materialCode: registration.materialCode ?? actual?.materialCode ?? null,
          onOff: registration.onOff ?? getOnOffFromKey(group.keyNoRegist),
          process: registration.process,
          application: registration.application,
          subApplication: registration.subApplication,
          owner: registration.owner,
          qtyActual: Number(actual?.qtyActual ?? 0),
          qtyFcst: group.forecastValues.reduce((sum, value) => sum + value, 0),
          dimensionSource: hasActual ? 'registration_with_actual_fallback' : 'registration',
        });
      }

      for (const actual of actualSummaries.values()) {
        if (actual.keyForRegist || previewKeySet.has(actual.keyForNoRegist)) continue;
        unifiedPreviewRows.push({
          sourceRow: null,
          sourceRows: [],
          status: 'actual_only',
          keyRegist: null,
          keyNoRegist: actual.keyForNoRegist,
          country: actual.country,
          soldTo: actual.soldTo,
          shipTo: actual.shipTo,
          enduser: actual.enduser,
          plant: actual.plant,
          materialCode: actual.materialCode,
          onOff: getOnOffFromKey(actual.keyForNoRegist),
          process: null,
          application: null,
          subApplication: null,
          owner: null,
          qtyActual: Number(actual.qtyActual),
          qtyFcst: 0,
          dimensionSource: 'actual',
        });
      }

      unifiedPreviewRows.sort((a, b) => {
        const order = { matched: 0, registration_only: 1, proposed_registration: 2, actual_only: 3 };
        return order[a.status] - order[b.status] || a.keyNoRegist.localeCompare(b.keyNoRegist);
      });
      const matchedRows = unifiedPreviewRows.filter(row => row.status === 'matched').length;
      const actualOnlyRows = unifiedPreviewRows.filter(row => row.status === 'actual_only').length;
      const registrationOnlyRows = unifiedPreviewRows.filter(row => row.status === 'registration_only').length;
      const proposedRegistrationRows = unifiedPreviewRows.filter(row => row.status === 'proposed_registration').length;

      const blockedRows = new Set<number>([
        ...missingKeyRows.map(row => row.sourceRow),
        ...unmatchedRows.map(row => row.sourceRow),
        ...duplicateRegistrationMatches.map(row => row.sourceRow),
        ...invalidNumericValues.map(row => row.sourceRow),
      ]);

      res.json({
        previewContractVersion: PREVIEW_CONTRACT_VERSION,
        summary: {
          sheetName: SHEET_NAME,
          version: CURRENT_FORECAST_VERSION,
          totalRows: dataRows.length,
          validRows: hasBlockingHeaderErrors ? 0 : dataRows.length - blockedRows.size,
          importableRecords: importableRecords.length,
          candidateRecords: candidateRecords.length,
          headerErrors: headerErrors.length,
          missingKeyRows: missingKeyRows.length,
          unmatchedRows: unmatchedRows.length,
          duplicateExcelKeys: duplicateExcelKeys.length,
          duplicateRegistrationMatches: duplicateRegistrationMatches.length,
          invalidNumericValues: invalidNumericValues.length,
          existingDbConflicts: 0,
          createRecords: createRecords.length,
          overwriteRecords: overwriteRecords.length,
          matchedRows,
          actualOnlyRows,
          registrationOnlyRows,
          proposedRegistrationRows,
          uniqueExcelKeys: excelGroups.size,
          groupedDuplicateKeys: duplicateExcelKeys.length,
        },
        expectedForecastColumns: forecastColumns,
        detectedHeaders,
        headerErrors,
        missingKeyRows,
        duplicateExcelKeys,
        unmatchedRows,
        duplicateRegistrationMatches,
        invalidNumericValues,
        existingDbConflicts: [],
        overwriteRecords,
        unifiedPreviewRows,
        importableRecords,
      });
    } catch (err) {
      console.error('[current-forecast-import] preview error:', err);
      res.status(500).json({ error: 'Failed to preview Current Forecast import' });
    }
  }
);

export default router;
