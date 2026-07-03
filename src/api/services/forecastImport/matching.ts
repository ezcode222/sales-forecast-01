import { Prisma } from '@prisma/client';
import prisma from '../../../db/prisma';
import { getActiveSnapshotVersion } from '../dataSnapshot';
import { crmBusinessUnitSelectSql } from '../businessUnit';
import {
  normalizeKey,
  normalizeNullableKey,
  nextMonthStart,
} from './excelUtils';
import {
  parseExcelKey,
  flipOnOffKey,
  formatParsedKeySummary,
  toParsedKeyFields,
  detectEmptyKeySegments,
  defaultUnmatchedHint,
} from './keyDiagnostics';
import type { ActualSummary, ForecastImportColumn, RegistrationMatch, UnmatchedRowDiagnostic } from './types';

export {
  parseExcelKey,
  flipOnOffKey,
  formatParsedKeySummary,
  toParsedKeyFields,
};

async function findNonMainRegistrationKeys(keys: string[]) {
  if (keys.length === 0) return new Set<string>();
  const keysJson = JSON.stringify(keys);
  const snapshotVersion = await getActiveSnapshotVersion();
  const legacyRows = snapshotVersion
    ? []
    : await prisma.$queryRaw<Array<{ keyForNoCRM: string }>>`
      WITH requested_keys AS (
        SELECT CAST([value] AS NVARCHAR(500)) AS keyForNoCRM
        FROM OPENJSON(${keysJson})
      )
      SELECT CAST(r.[KeyforNoCRM] AS NVARCHAR(500)) AS keyForNoCRM
      FROM dbo.VW_CRM_RegistrationAll_1 r
      INNER JOIN requested_keys requested ON requested.keyForNoCRM = r.KeyforNoCRM
      WHERE ISNULL(r.[MainRegist], 0) <> 1
    `;
  const managedRows = await prisma.masterDataCrmRegistration.findMany({
    where: {
      keyForNoCRM: { in: keys },
      mainRegist: { not: 1 },
    },
    select: { keyForNoCRM: true },
  });
  return new Set([
    ...legacyRows.map(row => normalizeKey(row.keyForNoCRM)),
    ...managedRows.map(row => normalizeKey(row.keyForNoCRM)),
  ]);
}

export async function findRegistrationMatches(keys: string[]) {
  if (keys.length === 0) return new Map<string, RegistrationMatch[]>();
  const snapshotVersion = await getActiveSnapshotVersion();
  const directCrmBusinessUnitSql = await crmBusinessUnitSelectSql('r', 'businessUnit');
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
        r.subApp AS subApplication, r.ownerName AS owner, r.businessUnit
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
        CAST(r.[OwnerName] AS NVARCHAR(500)) AS owner,
        ${directCrmBusinessUnitSql}
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
      businessUnit: row.businessUnit,
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

let actualOnlyCachePromise: Promise<ActualSummary[]> | null = null;
let actualOnlyCacheVersion: string | null = null;

export async function findActualSummaries(keys: string[], forecastColumns: ForecastImportColumn[]) {
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

export async function diagnoseUnmatchedRows(
  rows: Array<{ sourceSheet: string; sourceRow: number; excelKeyForNoRegist: string }>,
  actualSummaries: Map<string, ActualSummary>
): Promise<UnmatchedRowDiagnostic[]> {
  if (rows.length === 0) return [];

  const keys = rows.map(row => row.excelKeyForNoRegist);
  const flipMap = new Map<string, string>();
  const flippedKeys: string[] = [];
  for (const key of keys) {
    const flipped = flipOnOffKey(key);
    if (!flipped) continue;
    flipMap.set(key, flipped);
    flippedKeys.push(flipped);
  }

  const [nonMainKeys, onOffMatches] = await Promise.all([
    findNonMainRegistrationKeys(keys),
    flippedKeys.length > 0 ? findRegistrationMatches(flippedKeys) : Promise.resolve(new Map<string, RegistrationMatch[]>()),
  ]);

  return rows.map(row => {
    const key = row.excelKeyForNoRegist;
    const parsed = parseExcelKey(key);
    const parsedKey = toParsedKeyFields(parsed);
    const emptySegments = detectEmptyKeySegments(parsed);

    if (parsed.segmentCount !== 6 || emptySegments.length > 0) {
      return {
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        excelKeyForNoRegist: key,
        reasonCode: 'invalid_key_format',
        reason: emptySegments.length > 0
          ? `Invalid key format — empty segment(s): ${emptySegments.join(', ')} (${formatParsedKeySummary(parsed)})`
          : `Invalid key format — expected SoldTo/ShipTo/EndUser/Plant/Material/OnOff (found ${parsed.segmentCount} segments)`,
        hint: defaultUnmatchedHint('invalid_key_format'),
        parsedKey,
      };
    }

    if (nonMainKeys.has(key)) {
      return {
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        excelKeyForNoRegist: key,
        reasonCode: 'non_main_registration',
        reason: 'CRM registration exists but is not Main Registration (MainRegist ≠ 1)',
        hint: defaultUnmatchedHint('non_main_registration'),
        parsedKey,
      };
    }

    const flippedKey = flipMap.get(key);
    if (flippedKey && (onOffMatches.get(flippedKey)?.length ?? 0) > 0) {
      return {
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        excelKeyForNoRegist: key,
        reasonCode: 'onoff_mismatch',
        reason: `On/Off mismatch — CRM has similar key with different On/Off (${formatParsedKeySummary(parsed)})`,
        hint: `Try CRM key: ${flippedKey}`,
        parsedKey,
      };
    }

    const actual = actualSummaries.get(key);
    const hasActual = Boolean(actual && Number(actual.qtyActual ?? 0) !== 0);
    if (hasActual) {
      return {
        sourceSheet: row.sourceSheet,
        sourceRow: row.sourceRow,
        excelKeyForNoRegist: key,
        reasonCode: 'has_actual_no_crm',
        reason: 'Actual sales exist for this key but no CRM registration — forecast cannot be linked',
        hint: defaultUnmatchedHint('has_actual_no_crm'),
        parsedKey,
      };
    }

    return {
      sourceSheet: row.sourceSheet,
      sourceRow: row.sourceRow,
      excelKeyForNoRegist: key,
      reasonCode: 'crm_not_found',
      reason: `Key not found in CRM — checked ${formatParsedKeySummary(parsed)}`,
      hint: defaultUnmatchedHint('crm_not_found'),
      parsedKey,
    };
  });
}
