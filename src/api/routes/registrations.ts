import { Prisma } from '@prisma/client';
import { Router } from 'express';
import prisma from '../../db/prisma';
import { clearActualCaches } from './actuals';
import { isIncompleteManagedRegistration } from '../services/registrationIdentity';
import { resolveManagedRegistrationUpdate } from '../services/registrationResolver';
import { upsertRegistrationSpread } from '../services/registrationPricing';
import { businessUnitFromPlantCode, crmBusinessUnitSelectSql } from '../services/businessUnit';
import { getActiveSnapshotVersion } from '../services/dataSnapshot';

const router = Router();
const DEFAULT_PAGE_SIZE = 80;
const MAX_PAGE_SIZE = 200;

function normalizedFilterColumnSql(column: Prisma.Sql) {
  return Prisma.sql`LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(CONVERT(NVARCHAR(4000), ${column}), CHAR(9), ''), CHAR(10), ''), CHAR(13), ''), CHAR(160), '')))`;
}

function hasMeaningfulFilterValueSql(column: Prisma.Sql) {
  const normalized = normalizedFilterColumnSql(column);
  return Prisma.sql`${column} IS NOT NULL AND NULLIF(${normalized}, '') IS NOT NULL`;
}

const managedRegistrationSourceSql = Prisma.sql`
  SELECT
    r.newKey AS NewKey, r.id AS RegistrationId, r.keyForNoCRM AS KeyforNoCRM,
    r.ownerName AS OwnerName, r.registrationTopic AS RegistrationTopic,
    r.onOffSpec AS OnOffSpec, r.plantCode AS PlantCode, r.countryName AS CountryName,
    r.materialDescription AS MaterialDescription, r.materialCode AS MaterialCode,
    r.shipToName AS ShipToName, r.soldToName AS SoldToName, r.endUser AS EndUser,
    r.soldToCode AS SoldToCode, r.shipToCode AS ShipToCode, r.groupName AS GroupName,
    r.materialNameOnCoa AS MaterialNameOnCoa, r.additionalRequirement AS AdditionalRequirement,
    r.pic AS Pic, CONVERT(NVARCHAR(50), r.commission) AS Commission,
    r.productDescription AS ProductDescription, r.classified AS Classified,
    CONVERT(NVARCHAR(50), r.commissionIndirect) AS CommissionIndirect,
    CONVERT(NVARCHAR(50), r.commissionFinancialDiscount) AS CommissionFinancialDiscount,
    r.newCoaName AS NewCoaName, r.newTier1 AS NewTier1, r.newOem AS NewOem,
    r.packing AS Packing, r.agreedSpecType AS AgreedSpecType, r.wasteScrap AS WasteScrap,
    r.forResaleNotApprove AS ForResaleNotApprove, r.imdsDate AS ImdsDate, r.model AS Model,
    CONVERT(NVARCHAR(30), r.createdAt, 120) AS CreatedOn, r.approve AS Approve,
    r.partName AS PartName, r.coaName AS CoaName, r.process AS Process,
    r.application AS Application, r.subApp AS SubApp, r.zoneName AS ZoneName,
    r.plantName AS PlantName, r.countryCode AS CountryCode, r.endUserCode AS EndUserCode,
    r.endUserExportControl AS EndUserExportControl, r.endUserName AS EndUserName,
    r.productName AS ProductName, r.priceFormula AS PriceFormula,
    COALESCE(rps.spread, r.spread, 0) AS Spread,
    r.businessUnit AS BusinessUnit, r.createdBy AS CreatedBy,
    CAST(1 AS BIT) AS IsManaged
  FROM dbo.master_data_crm_registrations r
  LEFT JOIN dbo.registration_price_settings rps
    ON rps.registrationId = r.id
  WHERE r.mainRegist = 1
`;

export async function getRegistrationSourceSql() {
  const snapshotVersion = await getActiveSnapshotVersion();
  const directCrmBusinessUnitSql = await crmBusinessUnitSelectSql('r', 'BusinessUnit');
  const crmSource = snapshotVersion
    ? Prisma.sql`
      SELECT
        r.newKey AS NewKey, r.registrationId AS RegistrationId,
        r.keyForNoCRM AS KeyforNoCRM, r.ownerName AS OwnerName,
        r.registrationTopic AS RegistrationTopic, r.onOffSpec AS OnOffSpec,
        r.plantCode AS PlantCode, r.countryName AS CountryName,
        r.materialDescription AS MaterialDescription, r.materialCode AS MaterialCode,
        r.shipToName AS ShipToName, r.soldToName AS SoldToName, r.endUser AS EndUser,
        r.soldToCode AS SoldToCode, r.shipToCode AS ShipToCode, r.groupName AS GroupName,
        r.materialNameOnCoa AS MaterialNameOnCoa, r.additionalRequirement AS AdditionalRequirement,
        r.pic AS Pic, r.commission AS Commission, r.productDescription AS ProductDescription,
        r.classified AS Classified, r.commissionIndirect AS CommissionIndirect,
        r.commissionFinancialDiscount AS CommissionFinancialDiscount,
        r.newCoaName AS NewCoaName, r.newTier1 AS NewTier1, r.newOem AS NewOem,
        r.packing AS Packing, r.agreedSpecType AS AgreedSpecType, r.wasteScrap AS WasteScrap,
        r.forResaleNotApprove AS ForResaleNotApprove, r.imdsDate AS ImdsDate, r.model AS Model,
        r.createdOn AS CreatedOn, r.approve AS Approve, r.partName AS PartName,
        r.coaName AS CoaName, r.process AS Process, r.application AS Application,
        r.subApp AS SubApp, r.zoneName AS ZoneName, r.plantName AS PlantName,
        r.countryCode AS CountryCode, r.endUserCode AS EndUserCode,
        r.endUserExportControl AS EndUserExportControl, r.endUserName AS EndUserName,
        r.productName AS ProductName, CAST('' AS NVARCHAR(50)) AS PriceFormula,
        COALESCE(rps.spread, 0) AS Spread, r.businessUnit AS BusinessUnit,
        CAST('' AS NVARCHAR(100)) AS CreatedBy,
        CAST(0 AS BIT) AS IsManaged
      FROM dbo.crm_registration_snapshot r
      LEFT JOIN dbo.registration_price_settings rps
        ON rps.registrationId = r.registrationId
      WHERE r.snapshotVersion = ${snapshotVersion}
    `
    : Prisma.sql`
  SELECT
    CAST(r.NewKey AS NVARCHAR(1000)) AS NewKey,
    CAST(r.NewKey AS NVARCHAR(200)) AS RegistrationId,
    CAST(r.KeyforNoCRM AS NVARCHAR(500)) AS KeyforNoCRM,
    r.OwnerName, r.RegistrationTopic, r.OnOffSpec, r.PlantCode,
    r.CountryName, r.MaterialDescription, r.MaterialCode,
    r.ShipTo_name AS ShipToName, r.SoldTo_name AS SoldToName, r.End_user AS EndUser,
    r.SoldToCode, r.ShipToCode, r.[Group] AS GroupName,
    r.MaterialNameOnCoa, r.AdditionalRequirement, r.Pic,
    CAST(r.Commission AS NVARCHAR(50)) AS Commission,
    r.ProductDescription, r.Classified,
    CAST(r.CommissionIndirect AS NVARCHAR(50)) AS CommissionIndirect,
    CAST(r.CommissionFinancialDiscount AS NVARCHAR(50)) AS CommissionFinancialDiscount,
    r.NewCoaName, r.NewTier1, r.NewOem, r.Packing, r.AgreedSpecType,
    r.WasteScrap, r.ForResaleNotApprove,
    CONVERT(NVARCHAR(100), r.ImdsDate, 120) AS ImdsDate,
    r.Model, CONVERT(NVARCHAR(30), r.CreatedOn, 120) AS CreatedOn,
    r.Approve, r.PartName, r.CoaName,
    ISNULL(r.Cat1Name, '') AS Process,
    ISNULL(r.Cat2Name, '') AS Application,
    ISNULL(r.Cat3Name, '') AS SubApp,
    r.ZoneName, r.PlantName, r.CountryCode, r.EndUserCode,
    r.EndUserExportControl, r.EndUserName, r.ProductName,
    CAST('' AS NVARCHAR(50)) AS PriceFormula,
    COALESCE(rps.spread, 0) AS Spread,
    ${directCrmBusinessUnitSql},
    CAST('' AS NVARCHAR(100)) AS CreatedBy,
    CAST(0 AS BIT) AS IsManaged
  FROM [dbo].[VW_CRM_RegistrationAll_1] r
  LEFT JOIN [dbo].[registration_price_settings] rps
    ON rps.registrationId = CAST(r.NewKey AS NVARCHAR(200))
  WHERE r.NewKey IS NOT NULL AND r.MainRegist = 1
    `;

  return Prisma.sql`${crmSource} UNION ALL ${managedRegistrationSourceSql}`;
}

const filterColumns: Record<string, Prisma.Sql> = {
  ownerName: Prisma.sql`r.OwnerName`,
  registrationTopic: Prisma.sql`r.RegistrationTopic`,
  onOffSpec: Prisma.sql`r.OnOffSpec`,
  plantCode: Prisma.sql`r.PlantCode`,
  countryName: Prisma.sql`r.CountryName`,
  materialDescription: Prisma.sql`r.MaterialDescription`,
  materialCode: Prisma.sql`r.MaterialCode`,
  businessUnit: Prisma.sql`r.BusinessUnit`,
  shipTo_name: Prisma.sql`r.ShipToName`,
  soldTo_name: Prisma.sql`r.SoldToName`,
  end_user: Prisma.sql`r.EndUser`,
  soldToCode: Prisma.sql`r.SoldToCode`,
  shipToCode: Prisma.sql`r.ShipToCode`,
  group: Prisma.sql`r.GroupName`,
  materialNameOnCoa: Prisma.sql`r.MaterialNameOnCoa`,
  additionalRequirement: Prisma.sql`r.AdditionalRequirement`,
  pic: Prisma.sql`r.Pic`,
  commission: Prisma.sql`r.Commission`,
  productDescription: Prisma.sql`r.ProductDescription`,
  classified: Prisma.sql`r.Classified`,
  commissionIndirect: Prisma.sql`r.CommissionIndirect`,
  commissionFinancialDiscount: Prisma.sql`r.CommissionFinancialDiscount`,
  newCoaName: Prisma.sql`r.NewCoaName`,
  newTier1: Prisma.sql`r.NewTier1`,
  newOem: Prisma.sql`r.NewOem`,
  packing: Prisma.sql`r.Packing`,
  agreedSpecType: Prisma.sql`r.AgreedSpecType`,
  wasteScrap: Prisma.sql`r.WasteScrap`,
  forResaleNotApprove: Prisma.sql`r.ForResaleNotApprove`,
  imdsDate: Prisma.sql`r.ImdsDate`,
  model: Prisma.sql`r.Model`,
  createdOn: Prisma.sql`r.CreatedOn`,
  approve: Prisma.sql`r.Approve`,
  partName: Prisma.sql`r.PartName`,
  coaName: Prisma.sql`r.CoaName`,
  process: Prisma.sql`r.Process`,
  application: Prisma.sql`r.Application`,
  subApp: Prisma.sql`r.SubApp`,
  zoneName: Prisma.sql`r.ZoneName`,
  plantName: Prisma.sql`r.PlantName`,
  countryCode: Prisma.sql`r.CountryCode`,
  endUserCode: Prisma.sql`r.EndUserCode`,
  endUserExportControl: Prisma.sql`r.EndUserExportControl`,
  endUserName: Prisma.sql`r.EndUserName`,
  productName: Prisma.sql`r.ProductName`,
  column1: Prisma.sql`r.NewKey`,
};

export type RegistrationFilters = Record<string, string[]>;

const requiredCreateFields = [
  'materialDescription',
  'materialCode',
  'plantCode',
  'ownerName',
] as const;

const keyFields = new Set([
  'registrationTopic',
  'soldToCode',
  'shipToCode',
  'endUserCode',
  'plantCode',
  'materialCode',
  'onOffSpec',
]);

const optionalTextFields = [
  'countryName', 'shipToName', 'soldToName', 'endUser', 'groupName',
  'materialNameOnCoa', 'additionalRequirement', 'pic', 'productDescription',
  'classified', 'newCoaName', 'newTier1', 'newOem', 'packing',
  'agreedSpecType', 'wasteScrap', 'forResaleNotApprove', 'imdsDate', 'model',
  'approve', 'partName', 'coaName', 'process', 'application', 'subApp',
  'zoneName', 'plantName', 'countryCode', 'endUserExportControl',
  'endUserName', 'productName',
] as const;

const optionalBodyKeys: Record<(typeof optionalTextFields)[number], string> = {
  countryName: 'countryName',
  shipToName: 'shipTo_name',
  soldToName: 'soldTo_name',
  endUser: 'end_user',
  groupName: 'group',
  materialNameOnCoa: 'materialNameOnCoa',
  additionalRequirement: 'additionalRequirement',
  pic: 'pic',
  productDescription: 'productDescription',
  classified: 'classified',
  newCoaName: 'newCoaName',
  newTier1: 'newTier1',
  newOem: 'newOem',
  packing: 'packing',
  agreedSpecType: 'agreedSpecType',
  wasteScrap: 'wasteScrap',
  forResaleNotApprove: 'forResaleNotApprove',
  imdsDate: 'imdsDate',
  model: 'model',
  approve: 'approve',
  partName: 'partName',
  coaName: 'coaName',
  process: 'process',
  application: 'application',
  subApp: 'subApp',
  zoneName: 'zoneName',
  plantName: 'plantName',
  countryCode: 'countryCode',
  endUserExportControl: 'endUserExportControl',
  endUserName: 'endUserName',
  productName: 'productName',
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function decimalValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalOnOff(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (normalized === 'on') return 'On';
  if (normalized === 'off') return 'Off';
  if (normalized === 'unspecified') return 'Unspecified';
  return 'Unspecified';
}

function clearRegistrationDependentCaches() {
  clearActualCaches();
  import('./forecast')
    .then(module => module.clearForecastSummaryCache())
    .catch(() => undefined);
}

function parsePageSize(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(10, Math.trunc(parsed)));
}

function parseFilters(value: unknown): RegistrationFilters {
  if (typeof value !== 'string' || value.length === 0) return {};
  try {
    return normalizeRegistrationFilters(JSON.parse(value));
  } catch {
    return {};
  }
}

export function buildRegistrationFilterSql(filters: RegistrationFilters, excludeColumn?: string) {
  const clauses = Object.entries(filters)
    .filter(([key, values]) => key !== excludeColumn && filterColumns[key] && values.length > 0)
    .map(([key, values]) => Prisma.sql`
      AND CONVERT(NVARCHAR(4000), ${filterColumns[key]}) IN (${Prisma.join(values)})
    `);
  return clauses.length > 0 ? Prisma.join(clauses, ' ') : Prisma.empty;
}

export function normalizeRegistrationFilters(value: unknown): RegistrationFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, values]) => filterColumns[key] && Array.isArray(values))
      .map(([key, values]) => [
        key,
        (values as unknown[]).map(item => scalarToString(item)).filter(Boolean).slice(0, 200),
      ])
      .filter(([, values]) => values.length > 0)
  );
}

function scalarToString(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function isStripCharacter(code: number) {
  return code <= 0x1f
    || code === 0x7f
    || (code >= 0x80 && code <= 0x9f)
    || code === 0xa0
    || code === 0x200b
    || code === 0x200c
    || code === 0x200d
    || code === 0xfeff;
}

function stripFormattingCharacters(text: string) {
  let result = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (!isStripCharacter(code)) {
      result += char;
    }
  }
  return result.trim();
}

function normalizeFilterOptionValue(value: unknown) {
  return stripFormattingCharacters(scalarToString(value));
}

function dedupeFilterOptionValues(values: string[]) {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const normalized = normalizeFilterOptionValue(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(normalized);
  }
  return items;
}

function mapRegistrationRow(row: Record<string, unknown>) {
  return {
    id: String(row.RegistrationId ?? row.id ?? ''),
    isManaged: Boolean(row.IsManaged ?? row.isManaged),
    keyForNoCRM: String(row.KeyforNoCRM ?? row.keyForNoCRM ?? ''),
    sourceStatus: 'registration_only',
    ownerName: String(row.OwnerName ?? row.ownerName ?? ''),
    businessUnit: scalarToString(row.BusinessUnit ?? row.businessUnit),
    registrationTopic: String(row.RegistrationTopic ?? row.registrationTopic ?? ''),
    onOffSpec: String(row.OnOffSpec ?? row.onOffSpec ?? ''),
    plantCode: String(row.PlantCode ?? row.plantCode ?? ''),
    countryName: String(row.CountryName ?? row.countryName ?? ''),
    materialDescription: String(row.MaterialDescription ?? row.materialDescription ?? ''),
    materialCode: String(row.MaterialCode ?? row.materialCode ?? ''),
    shipTo_name: String(row.ShipToName ?? row.shipToName ?? ''),
    soldTo_name: String(row.SoldToName ?? row.soldToName ?? ''),
    end_user: String(row.EndUser ?? row.endUser ?? ''),
    soldToCode: String(row.SoldToCode ?? row.soldToCode ?? ''),
    shipToCode: String(row.ShipToCode ?? row.shipToCode ?? ''),
    group: String(row.GroupName ?? row.groupName ?? ''),
    materialNameOnCoa: String(row.MaterialNameOnCoa ?? row.materialNameOnCoa ?? ''),
    additionalRequirement: String(row.AdditionalRequirement ?? row.additionalRequirement ?? ''),
    pic: String(row.Pic ?? row.pic ?? ''),
    commission: String(row.Commission ?? row.commission ?? '0'),
    productDescription: String(row.ProductDescription ?? row.productDescription ?? ''),
    classified: String(row.Classified ?? row.classified ?? ''),
    commissionIndirect: String(row.CommissionIndirect ?? row.commissionIndirect ?? '0'),
    commissionFinancialDiscount: String(row.CommissionFinancialDiscount ?? row.commissionFinancialDiscount ?? '0'),
    newCoaName: String(row.NewCoaName ?? row.newCoaName ?? ''),
    newTier1: String(row.NewTier1 ?? row.newTier1 ?? ''),
    newOem: String(row.NewOem ?? row.newOem ?? ''),
    packing: String(row.Packing ?? row.packing ?? ''),
    agreedSpecType: String(row.AgreedSpecType ?? row.agreedSpecType ?? ''),
    wasteScrap: String(row.WasteScrap ?? row.wasteScrap ?? ''),
    forResaleNotApprove: String(row.ForResaleNotApprove ?? row.forResaleNotApprove ?? ''),
    imdsDate: String(row.ImdsDate ?? row.imdsDate ?? ''),
    model: String(row.Model ?? row.model ?? ''),
    createdOn: String(row.CreatedOn ?? row.createdAt ?? ''),
    approve: String(row.Approve ?? row.approve ?? ''),
    partName: String(row.PartName ?? row.partName ?? ''),
    coaName: String(row.CoaName ?? row.coaName ?? ''),
    process: String(row.Process ?? row.process ?? ''),
    application: String(row.Application ?? row.application ?? ''),
    subApp: String(row.SubApp ?? row.subApp ?? ''),
    zoneName: String(row.ZoneName ?? row.zoneName ?? ''),
    plantName: String(row.PlantName ?? row.plantName ?? ''),
    countryCode: String(row.CountryCode ?? row.countryCode ?? ''),
    endUserCode: String(row.EndUserCode ?? row.endUserCode ?? ''),
    endUserExportControl: String(row.EndUserExportControl ?? row.endUserExportControl ?? ''),
    endUserName: String(row.EndUserName ?? row.endUserName ?? ''),
    productName: String(row.ProductName ?? row.productName ?? ''),
    column1: String(row.NewKey ?? row.newKey ?? ''),
    createdBy: scalarToString(row.CreatedBy ?? row.createdBy),
    isIncomplete: isIncompleteManagedRegistration({
      createdBy: scalarToString(row.CreatedBy ?? row.createdBy),
      newKey: String(row.NewKey ?? row.newKey ?? ''),
      keyForNoCRM: String(row.KeyforNoCRM ?? row.keyForNoCRM ?? ''),
      soldToCode: String(row.SoldToCode ?? row.soldToCode ?? ''),
      shipToCode: String(row.ShipToCode ?? row.shipToCode ?? ''),
      endUserCode: String(row.EndUserCode ?? row.endUserCode ?? ''),
      plantCode: String(row.PlantCode ?? row.plantCode ?? ''),
      materialCode: String(row.MaterialCode ?? row.materialCode ?? ''),
    }),
    carryInETD: 0,
    carryOutETD: 0,
    carryInLoading: 0,
    carryOutLoading: 0,
    priceFormula: String(row.PriceFormula ?? row.priceFormula ?? 'CPL'),
    spread: Number(row.Spread ?? row.spread ?? 0),
  };
}

function createData(body: Record<string, unknown>) {
  const onOffSpec = canonicalOnOff(body.onOffSpec);
  const missing = requiredCreateFields.filter(field =>
    !text(body[field])
  );
  if (missing.length > 0) {
    return { error: `Required fields are missing: ${missing.join(', ')}` } as const;
  }

  const ownerName = text(body.ownerName);
  const plantCode = text(body.plantCode);
  const materialCode = text(body.materialCode);
  const registrationTopic =
    text(body.registrationTopic) || `WEB_${plantCode}_${materialCode}_${ownerName}`.split(/\s+/).join('_');
  const soldToCode = text(body.soldToCode) || '0';
  const shipToCode = text(body.shipToCode) || '0';
  const endUserCode = text(body.endUserCode) || '0';
  const keyForNoCRM = [soldToCode, shipToCode, endUserCode, plantCode, materialCode, onOffSpec].join('/');
  const newKey = `${registrationTopic}/${keyForNoCRM}`;
  const optional = Object.fromEntries(
    optionalTextFields.map(field => [field, nullableText(body[optionalBodyKeys[field]])])
  );

  return {
    data: {
      newKey,
      keyForNoCRM,
      mainRegist: 1,
      registrationTopic,
      soldToCode,
      shipToCode,
      endUserCode,
      plantCode,
      materialCode,
      businessUnit: businessUnitFromPlantCode(plantCode),
      onOffSpec,
      materialDescription: text(body.materialDescription),
      ownerName,
      ...optional,
      commission: decimalValue(body.commission),
      commissionIndirect: decimalValue(body.commissionIndirect),
      commissionFinancialDiscount: decimalValue(body.commissionFinancialDiscount),
      priceFormula: text(body.priceFormula) || 'CPL',
      spread: decimalValue(body.spread),
      createdBy: 'sales-forecast-web',
    },
  } as const;
}

async function findDuplicate(newKey: string, keyForNoCRM: string) {
  const snapshotVersion = await getActiveSnapshotVersion();
  const crmDuplicatePromise = snapshotVersion
    ? prisma.$queryRaw<Array<{ id: unknown }>>`
      SELECT TOP (1) r.registrationId AS id
      FROM dbo.crm_registration_snapshot r
      WHERE r.snapshotVersion = ${snapshotVersion}
        AND (r.newKey = ${newKey} OR r.keyForNoCRM = ${keyForNoCRM})
    `
    : prisma.$queryRaw<Array<{ id: unknown }>>`
      SELECT TOP (1) CAST(r.NewKey AS NVARCHAR(1000)) AS id
      FROM dbo.VW_CRM_RegistrationAll_1 r
      WHERE r.MainRegist = 1
        AND (r.NewKey = ${newKey} OR r.KeyforNoCRM = ${keyForNoCRM})
    `;
  const [crmRows, managed] = await Promise.all([
    crmDuplicatePromise,
    prisma.masterDataCrmRegistration.findFirst({
      where: { OR: [{ newKey }, { keyForNoCRM }] },
      select: { id: true },
    }),
  ]);
  if (crmRows.length > 0) return { source: 'crm', id: String(crmRows[0].id) };
  if (managed) return { source: 'master_data', id: managed.id };
  return null;
}

export async function getFilteredRegistrationIds(filters: RegistrationFilters) {
  const filterSql = buildRegistrationFilterSql(filters);
  const registrationSourceSql = await getRegistrationSourceSql();
  const rows = await prisma.$queryRaw<Array<{ id: unknown }>>`
    WITH registration_source AS (${registrationSourceSql})
    SELECT DISTINCT r.RegistrationId AS id
    FROM registration_source r
    WHERE r.RegistrationId IS NOT NULL
      ${filterSql}
  `;
  return rows.map(row => String(row.id));
}

router.get('/managed', async (_req, res) => {
  try {
    const rows = await prisma.masterDataCrmRegistration.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows.map(row => mapRegistrationRow({ ...row, isManaged: true })));
  } catch (error) {
    console.error('[registrations] managed GET error:', error);
    res.status(500).json({ error: 'Failed to fetch new registrations' });
  }
});

router.get('/filter-options', async (req, res) => {
  const columnKey = typeof req.query.column === 'string' ? req.query.column : '';
  const column = filterColumns[columnKey];
  if (!column) return res.status(400).json({ error: 'Unsupported filter column' });

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
  const pageSize = parsePageSize(req.query.limit);
  const otherFilters = buildRegistrationFilterSql(parseFilters(req.query.filters), columnKey);
  const searchFilter = search
    ? Prisma.sql`AND CONVERT(NVARCHAR(4000), ${column}) LIKE ${`%${search}%`}`
    : Prisma.empty;
  const cursorFilter = cursor ? Prisma.sql`WHERE value > ${cursor}` : Prisma.empty;

  try {
    const registrationSourceSql = await getRegistrationSourceSql();
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      WITH registration_source AS (${registrationSourceSql}),
      filter_values AS (
        SELECT DISTINCT ${normalizedFilterColumnSql(column)} AS value
        FROM registration_source r
        WHERE ${hasMeaningfulFilterValueSql(column)}
          ${otherFilters}
          ${searchFilter}
      )
      SELECT TOP (${pageSize + 1}) value
      FROM filter_values
      ${cursorFilter}
      ORDER BY value
    `;
    const values = dedupeFilterOptionValues(rows.map(row => String(row.value)));
    const items = values.slice(0, pageSize);
    res.json({
      items,
      nextCursor: items.at(-1) ?? null,
      hasMore: values.length > pageSize,
    });
  } catch (error) {
    console.error('[registrations] filter options error:', error);
    res.status(500).json({ error: 'Failed to fetch filter options' });
  }
});

router.get('/', async (req, res) => {
  try {
    const registrationSourceSql = await getRegistrationSourceSql();
    const isPaged = req.query.limit !== undefined || req.query.cursor !== undefined;
    const pageSize = parsePageSize(req.query.limit);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
    const rawTake = pageSize * 4 + 1;
    const cursorFilter = cursor ? Prisma.sql`AND r.RegistrationId > ${cursor}` : Prisma.empty;
    const filterSql = buildRegistrationFilterSql(parseFilters(req.query.filters));
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      WITH registration_source AS (${registrationSourceSql})
      SELECT ${isPaged ? Prisma.sql`TOP (${rawTake})` : Prisma.empty} r.*
      FROM registration_source r
      WHERE r.RegistrationId IS NOT NULL
        ${cursorFilter}
        ${filterSql}
      ORDER BY r.RegistrationId
    `;

    const seen = new Set<string>();
    const deduped = rows.map(mapRegistrationRow).filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    if (!isPaged) return res.json(deduped);

    const items = deduped.slice(0, pageSize);
    res.json({
      items,
      nextCursor: items.at(-1)?.id ?? null,
      hasMore: deduped.length > pageSize || rows.length === rawTake,
    });
  } catch (error) {
    console.error('[registrations] GET error:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

router.post('/', async (req, res) => {
  const parsed = createData(req.body ?? {});
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  try {
    const duplicate = await findDuplicate(parsed.data.newKey, parsed.data.keyForNoCRM);
    if (duplicate) {
      return res.status(409).json({
        error: `Registration already exists in ${duplicate.source === 'crm' ? 'CRM' : 'Master Data'}`,
        code: 'DUPLICATE_REGISTRATION',
        source: duplicate.source,
        registrationId: duplicate.id,
      });
    }
    const row = await prisma.masterDataCrmRegistration.create({ data: parsed.data });
    clearRegistrationDependentCaches();
    res.status(201).json(mapRegistrationRow({ ...row, isManaged: true }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({
        error: 'Registration already exists in Master Data',
        code: 'DUPLICATE_REGISTRATION',
        source: 'master_data',
      });
    }
    console.error('[registrations] POST error:', error);
    res.status(500).json({ error: 'Failed to create registration' });
  }
});

router.patch('/:id/spread', async (req, res) => {
  try {
    const updatedBy = typeof req.body?.updatedBy === 'string' ? req.body.updatedBy : undefined;
    const result = await upsertRegistrationSpread(req.params.id, req.body?.spread, updatedBy);
    clearRegistrationDependentCaches();
    res.json(result);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined;
    const message = error instanceof Error ? error.message : 'Failed to update spread';
    if (code === 'VALIDATION') {
      return res.status(400).json({ error: message, code });
    }
    console.error('[registrations] spread PATCH error:', error);
    res.status(500).json({ error: 'Failed to update spread' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.masterDataCrmRegistration.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: 'New registration not found' });

    const result = await resolveManagedRegistrationUpdate(existing, req.body ?? {});
    clearRegistrationDependentCaches();

    if (result.action === 'merged_to_crm') {
      return res.json({
        action: 'merged_to_crm',
        crmRegistrationId: result.crmRegistrationId,
        forecastsMoved: result.forecastsMoved,
        removedManagedId: result.removedManagedId,
      });
    }

    res.json(mapRegistrationRow({ ...result.row, isManaged: true }));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : undefined;
    const message = error instanceof Error ? error.message : 'Failed to update registration';
    if (code === 'KEY_FIELDS_LOCKED' || code === 'INCOMPLETE_KEY_FIELDS' || code === 'DUPLICATE_REGISTRATION') {
      return res.status(400).json({ error: message, code });
    }
    if (code === 'VALIDATION') {
      return res.status(400).json({ error: message });
    }
    console.error('[registrations] PATCH error:', error);
    res.status(500).json({ error: 'Failed to update registration' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.masterDataCrmRegistration.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: 'New registration not found' });

    const referenceCount = await prisma.forecastValue.count({
      where: { registrationId: req.params.id },
    });
    if (referenceCount > 0) {
      return res.status(409).json({
        error: `Cannot delete because ${referenceCount} forecast record(s) reference this registration`,
        code: 'FORECAST_REFERENCES_EXIST',
        referenceCount,
      });
    }

    await prisma.masterDataCrmRegistration.delete({ where: { id: req.params.id } });
    clearRegistrationDependentCaches();
    res.json({ ok: true });
  } catch (error) {
    console.error('[registrations] DELETE error:', error);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
});

export default router;
