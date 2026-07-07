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

const PLANT_CODE_PATTERN = /^\d{4}(-[A-Za-z0-9]+)?$/;
const REGISTRATION_CODE_PATTERN = /^\d+$/;

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

export function hasValidSixSegmentKey(rawKey: string) {
  const parsed = parseExcelKey(rawKey);
  return parsed.segmentCount === 6 && detectEmptyKeySegments(parsed).length === 0;
}

export function isLikelyPlantCode(value: unknown) {
  const normalized = text(value);
  return PLANT_CODE_PATTERN.test(normalized);
}

export function isLikelyRegistrationCode(value: unknown) {
  const normalized = text(value);
  if (!normalized || normalized === '0') return false;
  return REGISTRATION_CODE_PATTERN.test(normalized);
}

function registrationCodeOrZero(value: unknown) {
  const normalized = text(value);
  return normalized || '0';
}

export function parseRegistrationCodesFromKey(rawKey: string) {
  const parsed = parseExcelKey(rawKey);
  const emptySegments = detectEmptyKeySegments(parsed);
  const plantCode = isLikelyPlantCode(parsed.plant) ? parsed.plant : '0';
  const materialFromKey = registrationCodeOrZero(parsed.material);
  return {
    soldToCode: isLikelyRegistrationCode(parsed.soldTo) ? parsed.soldTo : '0',
    shipToCode: isLikelyRegistrationCode(parsed.shipTo) ? parsed.shipTo : '0',
    endUserCode: isLikelyRegistrationCode(parsed.enduser) ? parsed.enduser : '0',
    plantCode,
    materialCode: materialFromKey !== '0' ? materialFromKey : '0',
    onOffSpec: canonicalOnOff(parsed.onOff),
    hasValidSixSegments: emptySegments.length === 0,
  };
}

function isLikelyPlanningYear(value: unknown) {
  return /^20[2-3]\d$/.test(text(value));
}

function isProcessLabel(value: unknown) {
  const normalized = text(value).toLowerCase();
  return normalized === 'injection' || normalized === 'extrusion' || normalized === 'mb';
}

function resolveOwnerName(candidate: AutoCreateRegistrationPackage) {
  const ownerFromExcel = text(candidate.ownerName);
  if (ownerFromExcel && !isLikelyPlanningYear(ownerFromExcel)) {
    return ownerFromExcel;
  }
  const picFromMisplacedColumn = text(candidate.endUser);
  if (picFromMisplacedColumn && !isLikelyPlanningYear(picFromMisplacedColumn)) {
    return picFromMisplacedColumn;
  }
  return ownerFromExcel || 'IMPORT';
}

function resolveCountryAndPlantNames(candidate: AutoCreateRegistrationPackage) {
  let countryName = nullableText(candidate.countryName);
  let plantName = nullableText(candidate.plantName);

  if (isProcessLabel(countryName) && plantName && !isLikelyPlantCode(plantName) && !isProcessLabel(plantName)) {
    countryName = plantName;
    plantName = null;
  }

  return { countryName, plantName };
}

function resolvePlantCodeFromExcel(plantValue: string | null, keyPlantCode: string) {
  if (keyPlantCode !== '0') return keyPlantCode;
  const plantText = text(plantValue);
  return isLikelyPlantCode(plantText) ? plantText : '0';
}

function resolveExcelKeyForRepair(row: {
  keyForNoCRM: string;
  newKey: string;
}) {
  const keyForNoCRM = normalizeKey(row.keyForNoCRM);
  if (hasValidSixSegmentKey(keyForNoCRM)) return keyForNoCRM;
  if (keyForNoCRM && !keyForNoCRM.startsWith('IMP_RAW/')) return keyForNoCRM;

  const newKey = normalizeKey(row.newKey);
  if (newKey.startsWith('IMP_RAW/')) {
    return newKey.slice('IMP_RAW/'.length);
  }
  const slashIndex = newKey.indexOf('/');
  if (slashIndex >= 0) {
    return newKey.slice(slashIndex + 1);
  }
  return keyForNoCRM;
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
  const codesFromKey = parseRegistrationCodesFromKey(rawExcelKey);
  const { countryName, plantName } = resolveCountryAndPlantNames(candidate);
  const ownerName = resolveOwnerName(candidate);
  const soldToCode = isLikelyRegistrationCode(candidate.soldToCode)
    ? text(candidate.soldToCode)
    : codesFromKey.soldToCode;
  const shipToCode = isLikelyRegistrationCode(candidate.shipToCode)
    ? text(candidate.shipToCode)
    : codesFromKey.shipToCode;
  const endUserCode = isLikelyRegistrationCode(candidate.endUserCode)
    ? text(candidate.endUserCode)
    : codesFromKey.endUserCode;
  const plantCode = resolvePlantCodeFromExcel(candidate.plantCode, codesFromKey.plantCode);
  const materialCode = registrationCodeOrZero(candidate.materialCode) !== '0'
    ? registrationCodeOrZero(candidate.materialCode)
    : codesFromKey.materialCode;
  const materialDescription =
    text(candidate.materialDescription) || `Material ${materialCode}`;
  const onOffSpec = canonicalOnOff(
    candidate.onOffSpec !== 'Unspecified' ? candidate.onOffSpec : codesFromKey.onOffSpec
  );

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
      countryName,
      shipToName: nullableText(candidate.shipToName),
      soldToName: nullableText(candidate.soldToName)
        ?? (!isLikelyRegistrationCode(candidate.soldToCode) ? nullableText(candidate.soldToCode) : null),
      endUser: nullableText(candidate.endUser),
      plantName: plantName
        ?? (!isLikelyPlantCode(candidate.plantCode) && text(candidate.plantCode) !== '0'
          ? nullableText(candidate.plantCode)
          : null),
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
    countryName,
    shipToName: nullableText(candidate.shipToName),
    soldToName: nullableText(candidate.soldToName)
      ?? (!isLikelyRegistrationCode(candidate.soldToCode) ? nullableText(candidate.soldToCode) : null),
    endUser: nullableText(candidate.endUser),
    plantName: plantName
      ?? (!isLikelyPlantCode(candidate.plantCode) && text(candidate.plantCode) !== '0'
        ? nullableText(candidate.plantCode)
        : null),
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

export function buildRepairManagedRegistrationData(row: {
  keyForNoCRM: string;
  newKey: string;
  ownerName: string | null;
  materialDescription: string | null;
  countryName: string | null;
  shipToName: string | null;
  soldToName: string | null;
  endUser: string | null;
  plantName: string | null;
  soldToCode: string;
  shipToCode: string;
  endUserCode: string;
  plantCode: string;
  materialCode: string;
  onOffSpec: string;
  process: string | null;
  application: string | null;
  subApp: string | null;
  hasImportedPrice: boolean;
}) {
  const excelKey = resolveExcelKeyForRepair(row);
  const misplacedSoldToName = !isLikelyRegistrationCode(row.soldToCode) ? nullableText(row.soldToCode) : null;
  const misplacedShipToName = !isLikelyRegistrationCode(row.shipToCode) ? nullableText(row.shipToCode) : null;
  const misplacedEndUserCode = !isLikelyRegistrationCode(row.endUserCode) ? nullableText(row.endUserCode) : null;
  const misplacedPlantName = !isLikelyPlantCode(row.plantCode) ? nullableText(row.plantCode) : null;
  const misplacedCountryName = !isLikelyPlantCode(row.plantCode) && !row.plantName
    ? nullableText(row.plantCode)
    : null;

  return buildRegistrationCreateData({
    excelKeyForNoRegist: excelKey,
    sourceSheet: '',
    sourceRow: 0,
    soldToCode: isLikelyRegistrationCode(row.soldToCode) ? row.soldToCode : '0',
    shipToCode: isLikelyRegistrationCode(row.shipToCode) ? row.shipToCode : '0',
    endUserCode: isLikelyRegistrationCode(row.endUserCode) ? row.endUserCode : '0',
    plantCode: isLikelyPlantCode(row.plantCode) ? row.plantCode : '0',
    materialCode: row.materialCode,
    onOffSpec: row.onOffSpec,
    ownerName: row.ownerName,
    materialDescription: row.materialDescription,
    countryName: row.countryName ?? misplacedCountryName,
    shipToName: row.shipToName ?? misplacedShipToName,
    soldToName: row.soldToName ?? misplacedSoldToName,
    endUser: row.endUser ?? misplacedEndUserCode,
    plantName: row.plantName ?? misplacedPlantName,
    process: row.process,
    application: row.application,
    subApp: row.subApp,
    hasImportedPrice: row.hasImportedPrice,
    pendingForecastRecords: [],
  });
}

function buildPackageBase(
  group: ExcelForecastGroup,
  pendingForecastRecords: PendingImportForecastRecord[],
): Omit<AutoCreateRegistrationPackage, 'excelKeyForNoRegist' | 'sourceSheet' | 'sourceRow'> {
  const codes = parseRegistrationCodesFromKey(group.keyNoRegist);
  const hasImportedPrice = group.priceValues.some(value => value > 0);
  const materialFromExcel = text(group.materialCode);
  const plantFromExcel = text(group.plant);
  const plantCodeFromExcel = isLikelyPlantCode(plantFromExcel) ? plantFromExcel : null;
  const plantNameFromExcel = plantCodeFromExcel ? null : nullableText(group.plant);
  return {
    soldToCode: codes.soldToCode,
    shipToCode: codes.shipToCode,
    endUserCode: codes.endUserCode,
    plantCode: codes.plantCode !== '0' ? codes.plantCode : (plantCodeFromExcel ?? '0'),
    materialCode: codes.materialCode !== '0' ? codes.materialCode : (materialFromExcel || '0'),
    onOffSpec: codes.onOffSpec !== 'Unspecified'
      ? codes.onOffSpec
      : canonicalOnOff(group.onOff),
    ownerName: group.owner,
    materialDescription: materialFromExcel ? `Material ${materialFromExcel}` : null,
    countryName: group.country,
    shipToName: group.shipTo,
    soldToName: group.soldTo,
    endUser: group.enduser,
    plantName: plantNameFromExcel,
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
