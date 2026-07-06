import prisma from '../../../db/prisma';
import { clearActualCaches } from '../../routes/actuals';
import { clearForecastSummaryCache } from '../../routes/forecast';
import { businessUnitFromPlantCode } from '../businessUnit';
import { getActiveSnapshotVersion } from '../dataSnapshot';
import { normalizeKey, primarySourceEntry, unknownToDisplayString } from './excelUtils';
import { detectEmptyKeySegments, parseExcelKey } from './keyDiagnostics';
import type {
  AutoCreateRegistrationPackage,
  ConfirmLegacyImportRecord,
  ConfirmVersionedImportRecord,
  ExcelForecastGroup,
  PendingImportForecastRecord,
  UnmatchedRowDiagnostic,
  VersionedForecastColumn,
} from './types';
import type { ExtendedForecastColumn } from './excelUtils';

export const EXCEL_IMPORT_CREATED_BY = 'excel-import';

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function hasValidSixSegmentKey(rawKey: string) {
  const parsed = parseExcelKey(rawKey);
  return parsed.segmentCount === 6 && detectEmptyKeySegments(parsed).length === 0;
}

function text(value: unknown) {
  return unknownToDisplayString(value).trim();
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function canonicalOnOff(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (normalized === 'on') return 'On';
  if (normalized === 'off') return 'Off';
  if (normalized === 'unspecified') return 'Unspecified';
  return 'Unspecified';
}

export function buildRegistrationCreateData(candidate: AutoCreateRegistrationPackage) {
  const rawExcelKey = truncate(normalizeKey(candidate.excelKeyForNoRegist), 500);
  const parsed = parseExcelKey(rawExcelKey);
  const ownerName = text(candidate.ownerName) || 'IMPORT';
  const plantCode = text(candidate.plantCode) || text(parsed.plant) || '0';
  const materialCode = text(candidate.materialCode) || text(parsed.material) || '0';
  const materialDescription =
    text(candidate.materialDescription) || `Material ${materialCode}`;
  const onOffSpec = canonicalOnOff(candidate.onOffSpec || parsed.onOff);
  const soldToCode = text(candidate.soldToCode) || text(parsed.soldTo) || '0';
  const shipToCode = text(candidate.shipToCode) || text(parsed.shipTo) || '0';
  const endUserCode = text(candidate.endUserCode) || text(parsed.enduser) || '0';

  if (hasValidSixSegmentKey(rawExcelKey)) {
    const keyForNoCRM = [soldToCode, shipToCode, endUserCode, plantCode, materialCode, onOffSpec].join('/');
    const registrationTopic = `IMP_${plantCode}_${materialCode}`;
    return {
      newKey: truncate(`${registrationTopic}/${keyForNoCRM}`, 1000),
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
      materialDescription,
      ownerName,
      countryName: nullableText(candidate.countryName),
      shipToName: nullableText(candidate.shipToName),
      soldToName: nullableText(candidate.soldToName),
      endUser: nullableText(candidate.endUser),
      plantName: nullableText(candidate.plantName),
      process: nullableText(candidate.process),
      application: nullableText(candidate.application),
      subApp: nullableText(candidate.subApp),
      commission: 0,
      commissionIndirect: 0,
      commissionFinancialDiscount: 0,
      priceFormula: candidate.hasImportedPrice ? 'Fixed Price' : 'CPL',
      spread: 0,
      createdBy: EXCEL_IMPORT_CREATED_BY,
    };
  }

  const keyForNoCRM = rawExcelKey;
  const registrationTopic = `IMP_RAW_${plantCode}_${materialCode}`;
  return {
    newKey: truncate(`IMP_RAW/${keyForNoCRM}`, 1000),
    keyForNoCRM,
    mainRegist: 1,
    registrationTopic: truncate(registrationTopic, 500),
    soldToCode,
    shipToCode,
    endUserCode,
    plantCode,
    materialCode,
    businessUnit: businessUnitFromPlantCode(plantCode),
    onOffSpec,
    materialDescription,
    ownerName,
    countryName: nullableText(candidate.countryName),
    shipToName: nullableText(candidate.shipToName),
    soldToName: nullableText(candidate.soldToName),
    endUser: nullableText(candidate.endUser),
    plantName: nullableText(candidate.plantName),
    process: nullableText(candidate.process),
    application: nullableText(candidate.application),
    subApp: nullableText(candidate.subApp),
    commission: 0,
    commissionIndirect: 0,
    commissionFinancialDiscount: 0,
    priceFormula: candidate.hasImportedPrice ? 'Fixed Price' : 'CPL',
    spread: 0,
    createdBy: EXCEL_IMPORT_CREATED_BY,
  };
}

async function findDuplicateRegistration(rawExcelKey: string, newKey: string, keyForNoCRM: string) {
  const normalizedRaw = normalizeKey(rawExcelKey);
  const [managedByRaw, crmRows, managed] = await Promise.all([
    prisma.masterDataCrmRegistration.findFirst({
      where: { keyForNoCRM: normalizedRaw },
      select: { id: true },
    }),
    (async () => {
      const snapshotVersion = await getActiveSnapshotVersion();
      return snapshotVersion
        ? prisma.$queryRaw<Array<{ id: unknown }>>`
          SELECT TOP (1) r.registrationId AS id
          FROM dbo.crm_registration_snapshot r
          WHERE r.snapshotVersion = ${snapshotVersion}
            AND (r.newKey = ${newKey} OR r.keyForNoCRM = ${keyForNoCRM} OR r.keyForNoCRM = ${normalizedRaw})
        `
        : prisma.$queryRaw<Array<{ id: unknown }>>`
          SELECT TOP (1) CAST(r.NewKey AS NVARCHAR(1000)) AS id
          FROM dbo.VW_CRM_RegistrationAll_1 r
          WHERE r.MainRegist = 1
            AND (r.NewKey = ${newKey} OR r.KeyforNoCRM = ${keyForNoCRM} OR r.KeyforNoCRM = ${normalizedRaw})
        `;
    })(),
    prisma.masterDataCrmRegistration.findFirst({
      where: { OR: [{ newKey }, { keyForNoCRM }] },
      select: { id: true },
    }),
  ]);
  if (managedByRaw) return { source: 'master_data' as const, id: managedByRaw.id };
  if (crmRows.length > 0) return { source: 'crm' as const, id: unknownToDisplayString(crmRows[0].id) };
  if (managed) return { source: 'master_data' as const, id: managed.id };
  return null;
}

function buildPackageBase(
  group: ExcelForecastGroup,
  pendingForecastRecords: PendingImportForecastRecord[]
): Omit<AutoCreateRegistrationPackage, 'excelKeyForNoRegist' | 'sourceSheet' | 'sourceRow'> {
  const parsed = parseExcelKey(group.keyNoRegist);
  const hasImportedPrice = group.priceValues.some(value => value > 0);
  return {
    soldToCode: parsed.soldTo || text(group.soldTo) || '0',
    shipToCode: parsed.shipTo || text(group.shipTo) || '0',
    endUserCode: parsed.enduser || text(group.enduser) || '0',
    plantCode: parsed.plant || text(group.plant) || '0',
    materialCode: parsed.material || text(group.materialCode) || '0',
    onOffSpec: canonicalOnOff(parsed.onOff || group.onOff),
    ownerName: group.owner,
    materialDescription: group.materialCode ? `Material ${group.materialCode}` : null,
    countryName: group.country,
    shipToName: group.shipTo,
    soldToName: group.soldTo,
    endUser: group.enduser,
    plantName: group.plant,
    process: group.process,
    application: group.application,
    subApp: group.subApplication,
    hasImportedPrice,
    pendingForecastRecords,
  };
}

export function buildVersionedAutoCreatePackage(
  group: ExcelForecastGroup,
  forecastColumns: VersionedForecastColumn[]
): AutoCreateRegistrationPackage {
  const primary = primarySourceEntry(group);
  const pendingForecastRecords = forecastColumns.map((forecastColumn, forecastIndex) => ({
    period: forecastColumn.period,
    granularity: 'month' as const,
    qtyFcst: group.forecastValues[forecastIndex],
    priceFcst: group.priceValues[forecastIndex],
    amountFcst: group.amountValues[forecastIndex],
  }));

  return {
    excelKeyForNoRegist: group.keyNoRegist,
    sourceSheet: primary.sourceSheet,
    sourceRow: primary.sourceRow,
    ...buildPackageBase(group, pendingForecastRecords),
  };
}

export function buildLegacyAutoCreatePackage(
  group: ExcelForecastGroup,
  extendedColumns: ExtendedForecastColumn[],
  hasPriceColumns: boolean,
  hasAmountColumns: boolean
): AutoCreateRegistrationPackage {
  const primary = primarySourceEntry(group);
  const pendingForecastRecords = extendedColumns.map((forecastColumn, forecastIndex) => ({
    period: forecastColumn.period,
    granularity: 'week' as const,
    qtyFcst: group.forecastValues[forecastIndex],
    priceFcst: hasPriceColumns ? group.priceValues[forecastIndex] : 0,
    amountFcst: hasAmountColumns ? group.amountValues[forecastIndex] : 0,
  }));

  return {
    excelKeyForNoRegist: group.keyNoRegist,
    sourceSheet: primary.sourceSheet,
    sourceRow: primary.sourceRow,
    ...buildPackageBase(group, pendingForecastRecords),
  };
}

export function collectAutoCreateCandidates(
  excelGroups: Map<string, ExcelForecastGroup>,
  unmatchedKeys: Iterable<string>,
  buildPackage: (group: ExcelForecastGroup) => AutoCreateRegistrationPackage
): AutoCreateRegistrationPackage[] {
  const keys = new Set(unmatchedKeys);

  return [...excelGroups.values()]
    .filter(group => keys.has(group.keyNoRegist))
    .map(group => buildPackage(group));
}

export function blockingUnmatchedRows(_unmatchedRows: UnmatchedRowDiagnostic[]) {
  return [];
}

export type AutoCreateRegistrationResult = {
  registrationIdByKey: Map<string, string>;
  createdRegistrationIds: string[];
  registrationsCreated: number;
};

export async function resolveOrCreateImportRegistrations(
  candidates: AutoCreateRegistrationPackage[]
): Promise<AutoCreateRegistrationResult> {
  const registrationIdByKey = new Map<string, string>();
  const createdRegistrationIds: string[] = [];

  for (const candidate of candidates) {
    const key = normalizeKey(candidate.excelKeyForNoRegist);
    const data = buildRegistrationCreateData(candidate);
    const duplicate = await findDuplicateRegistration(
      candidate.excelKeyForNoRegist,
      data.newKey,
      data.keyForNoCRM
    );

    if (duplicate) {
      registrationIdByKey.set(key, duplicate.id);
      continue;
    }

    const row = await prisma.masterDataCrmRegistration.create({ data });
    registrationIdByKey.set(key, row.id);
    createdRegistrationIds.push(row.id);
  }

  if (createdRegistrationIds.length > 0) {
    clearActualCaches();
    clearForecastSummaryCache();
  }

  return {
    registrationIdByKey,
    createdRegistrationIds,
    registrationsCreated: createdRegistrationIds.length,
  };
}

export function buildVersionedConfirmRecordsFromPackages(
  candidates: AutoCreateRegistrationPackage[],
  registrationIdByKey: Map<string, string>
): ConfirmVersionedImportRecord[] {
  const records: ConfirmVersionedImportRecord[] = [];
  for (const candidate of candidates) {
    const registrationId = registrationIdByKey.get(normalizeKey(candidate.excelKeyForNoRegist));
    if (!registrationId) continue;
    for (const pending of candidate.pendingForecastRecords) {
      records.push({
        excelKeyForNoRegist: candidate.excelKeyForNoRegist,
        matchedRegistrationId: registrationId,
        period: pending.period,
        granularity: 'month',
        qtyFcst: pending.qtyFcst,
        priceFcst: pending.priceFcst,
        amountFcst: pending.amountFcst,
      });
    }
  }
  return records;
}

export function buildLegacyConfirmRecordsFromPackages(
  candidates: AutoCreateRegistrationPackage[],
  registrationIdByKey: Map<string, string>
): ConfirmLegacyImportRecord[] {
  const records: ConfirmLegacyImportRecord[] = [];
  for (const candidate of candidates) {
    const registrationId = registrationIdByKey.get(normalizeKey(candidate.excelKeyForNoRegist));
    if (!registrationId) continue;
    for (const pending of candidate.pendingForecastRecords) {
      records.push({
        excelKeyForNoRegist: candidate.excelKeyForNoRegist,
        matchedRegistrationId: registrationId,
        period: pending.period,
        granularity: 'week',
        qtyFcst: pending.qtyFcst,
        priceFcst: pending.priceFcst,
        amountFcst: pending.amountFcst,
      });
    }
  }
  return records;
}
