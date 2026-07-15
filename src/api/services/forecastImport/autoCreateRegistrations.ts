import prisma from '../../../db/prisma';
import { clearActualCaches } from '../../routes/actuals';
import { clearForecastSummaryCache } from '../../routes/forecast';
import { businessUnitFromPlantCode } from '../businessUnit';
import { normalizeExcelImportCategoryFields } from '../registrationCategory';
import { applyCustomerMasterNames } from '../registrationNameResolver';
import { getActiveSnapshotVersion } from '../dataSnapshot';
import { normalizeKey, primarySourceEntry, unknownToDisplayString } from './excelUtils';
import { detectEmptyKeySegments, parseExcelKey } from './keyDiagnostics';
import { isExcludedImportPlantKey } from './matching';
import { isRegistrationInAppMode } from '../../../config/appMode';
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

const PLANT_CODE_PATTERN = /^\d+$/;
const PLANT_CODE_PREFIX_PATTERN = /^(\d{4})/;
const REGISTRATION_CODE_PATTERN = /^\d+$/;

const COUNTRY_LIKE_LABELS = new Set([
  'china', 'thailand', 'usa', 'india', 'japan', 'malaysia', 'indonesia',
  'vietnam', 'egypt', 'taiwan', 'philippines', 'korea', 'canada', 'brazil', 'mexico', 'spain',
  'philippine', 'pakistan', 'czech', 'belgium', 'bangladesh', 'zealand',
]);

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

function isCountryLikeLabel(value: unknown) {
  const normalized = text(value).toLowerCase();
  return COUNTRY_LIKE_LABELS.has(normalized);
}

export function resolvePlantCodeAndName(excelPlant: string | null, keyPlantSegment: string) {
  const plantNameFromExcel = nullableText(excelPlant);
  const keyPlant = text(keyPlantSegment);

  let plantCode = '0';
  if (isLikelyPlantCode(keyPlant)) {
    plantCode = keyPlant;
  } else if (plantNameFromExcel) {
    const excelText = text(excelPlant);
    if (isLikelyPlantCode(excelText)) {
      plantCode = excelText;
    } else {
      const match = PLANT_CODE_PREFIX_PATTERN.exec(excelText);
      if (match) plantCode = match[1];
    }
  }

  let plantName = plantNameFromExcel;
  // Excel "Plant (use)" is often a plant code, not a display name — never store codes as PlantName.
  if (plantName && (isCountryLikeLabel(plantName) || isLikelyPlantCode(plantName))) {
    plantName = null;
  }

  return { plantCode, plantName };
}

function sanitizeRepairPlantFields(plantCode: string, plantName: string | null) {
  let code = text(plantCode);
  let name = nullableText(plantName);

  if (code && code !== '0' && !isLikelyPlantCode(code)) {
    const prefix = PLANT_CODE_PREFIX_PATTERN.exec(code)?.[1];
    if (prefix) {
      if (!name) name = code;
      code = prefix;
    } else if (isCountryLikeLabel(code)) {
      code = '0';
    } else if (!name) {
      name = code;
      code = '0';
    } else {
      code = '0';
    }
  }

  if (name && (isCountryLikeLabel(name) || isLikelyPlantCode(name))) {
    name = null;
  }

  return {
    plantCode: isLikelyPlantCode(code) ? code : '0',
    plantName: name,
  };
}

function sanitizeRepairMaterialDescription(
  materialDescription: string | null,
  materialCode: string,
) {
  const description = nullableText(materialDescription);
  if (!description) return '';
  const materialPrefix = `Material ${materialCode}`;
  if (description === materialPrefix || description === `Material ${text(materialCode)}`) {
    return '';
  }
  return description;
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

function augmentRepairPlantFromKey(
  plantCode: string,
  plantName: string | null,
  keyPlantSegment: string,
) {
  if (plantName || !text(keyPlantSegment) || isLikelyPlantCode(keyPlantSegment)) {
    return { plantCode, plantName };
  }
  const segment = text(keyPlantSegment);
  if (isCountryLikeLabel(segment)) {
    return { plantCode, plantName };
  }
  return { plantCode: isLikelyPlantCode(plantCode) ? plantCode : '0', plantName: segment };
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
  const parsed = parseExcelKey(rawExcelKey);
  const codesFromKey = parseRegistrationCodesFromKey(rawExcelKey);
  const { countryName } = resolveCountryAndPlantNames(candidate);
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
  const excelPlantName = nullableText(candidate.plantName);
  let { plantCode, plantName } = resolvePlantCodeAndName(excelPlantName, parsed.plant);
  if (plantCode === '0' && isLikelyPlantCode(candidate.plantCode)) {
    plantCode = text(candidate.plantCode);
  }
  if (!excelPlantName) {
    plantName = null;
  }
  const materialCode = registrationCodeOrZero(candidate.materialCode) !== '0'
    ? registrationCodeOrZero(candidate.materialCode)
    : codesFromKey.materialCode;
  const materialDescription = nullableText(candidate.materialDescription) ?? '';
  const onOffSpec = canonicalOnOff(
    candidate.onOffSpec !== 'Unspecified' ? candidate.onOffSpec : codesFromKey.onOffSpec
  );
  const categories = normalizeExcelImportCategoryFields(
    candidate.process,
    candidate.application,
    candidate.subApp,
  );

  if (hasValidSixSegmentKey(rawExcelKey)) {
    const keyForNoCRM = [soldToCode, shipToCode, endUserCode, plantCode, materialCode, onOffSpec].join('/');
    const registrationTopic = truncate(
      nullableText(candidate.registrationTopic) ?? `IMP_${plantCode}_${materialCode}`,
      500,
    );
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
      shipToName: null,
      soldToName: null,
      endUser: null,
      endUserName: null,
      plantName,
      process: categories.process,
      application: categories.application,
      subApp: categories.subApp,
      productNamePud: nullableText(candidate.productName),
      gradeUfa: nullableText(candidate.gradeUfa),
      gradeSap: nullableText(candidate.gradeSap),
      commission: 0,
      commissionIndirect: 0,
      commissionFinancialDiscount: 0,
      priceFormula: candidate.hasImportedPrice && !candidate.pricingPolicy ? 'Fixed Price' : 'CPL',
      spread: candidate.spread ?? null,
      pricingPolicy: candidate.pricingPolicy ?? null,
      createdBy: EXCEL_IMPORT_CREATED_BY,
    };
  }

  const keyForNoCRM = rawExcelKey;
  const registrationTopic = truncate(
    nullableText(candidate.registrationTopic) ?? `IMP_RAW_${plantCode}_${materialCode}`,
    500,
  );
  return {
    newKey: truncate(`IMP_RAW/${keyForNoCRM}`, 1000),
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
    shipToName: null,
    soldToName: null,
    endUser: null,
    endUserName: null,
    plantName,
    process: categories.process,
    application: categories.application,
    subApp: categories.subApp,
    productNamePud: nullableText(candidate.productName),
    gradeUfa: nullableText(candidate.gradeUfa),
    gradeSap: nullableText(candidate.gradeSap),
    commission: 0,
    commissionIndirect: 0,
    commissionFinancialDiscount: 0,
    priceFormula: candidate.hasImportedPrice && !candidate.pricingPolicy ? 'Fixed Price' : 'CPL',
    spread: candidate.spread ?? null,
    pricingPolicy: candidate.pricingPolicy ?? null,
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
  const parsed = parseExcelKey(excelKey);
  const sanitizedPlant = sanitizeRepairPlantFields(row.plantCode, row.plantName);
  const repairedPlant = augmentRepairPlantFromKey(
    sanitizedPlant.plantCode,
    sanitizedPlant.plantName,
    parsed.plant,
  );

  return buildRegistrationCreateData({
    excelKeyForNoRegist: excelKey,
    sourceSheet: '',
    sourceRow: 0,
    soldToCode: isLikelyRegistrationCode(row.soldToCode) ? row.soldToCode : '0',
    shipToCode: isLikelyRegistrationCode(row.shipToCode) ? row.shipToCode : '0',
    endUserCode: isLikelyRegistrationCode(row.endUserCode) ? row.endUserCode : '0',
    plantCode: repairedPlant.plantCode,
    materialCode: row.materialCode,
    onOffSpec: row.onOffSpec,
    ownerName: row.ownerName,
    materialDescription: sanitizeRepairMaterialDescription(row.materialDescription, row.materialCode),
    countryName: row.countryName,
    shipToName: null,
    soldToName: null,
    endUser: null,
    plantName: repairedPlant.plantName,
    process: row.process,
    application: row.application,
    subApp: row.subApp,
    productName: null,
    gradeUfa: null,
    gradeSap: null,
    registrationTopic: null,
    spread: null,
    pricingPolicy: null,
    hasImportedPrice: row.hasImportedPrice,
    pendingForecastRecords: [],
  });
}

function buildPackageBase(
  group: ExcelForecastGroup,
  pendingForecastRecords: PendingImportForecastRecord[],
): Omit<AutoCreateRegistrationPackage, 'excelKeyForNoRegist' | 'sourceSheet' | 'sourceRow'> {
  const parsed = parseExcelKey(group.keyNoRegist);
  const codes = parseRegistrationCodesFromKey(group.keyNoRegist);
  const hasImportedPrice = group.priceValues.some(value => value > 0);
  const materialFromExcel = text(group.materialCode);
  const { plantCode, plantName } = resolvePlantCodeAndName(nullableText(group.plant), parsed.plant);
  return {
    soldToCode: codes.soldToCode,
    shipToCode: codes.shipToCode,
    endUserCode: codes.endUserCode,
    plantCode,
    materialCode: codes.materialCode !== '0' ? codes.materialCode : (materialFromExcel || '0'),
    onOffSpec: codes.onOffSpec !== 'Unspecified'
      ? codes.onOffSpec
      : canonicalOnOff(group.onOff),
    ownerName: group.owner,
    materialDescription: group.materialDescription ?? '',
    countryName: group.country,
    shipToName: group.shipTo,
    soldToName: group.soldTo,
    endUser: group.enduser,
    plantName,
    process: group.process,
    application: group.application,
    subApp: group.subApplication,
    productName: group.productName,
    gradeUfa: group.gradeUfa,
    gradeSap: group.gradeSap,
    registrationTopic: group.registrationTopic,
    spread: group.spread,
    pricingPolicy: group.pricingPolicy,
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
    .filter(group => keys.has(group.keyNoRegist) && !isExcludedImportPlantKey(group.keyNoRegist))
    .filter(group => {
      const plant = parseExcelKey(group.keyNoRegist).plant;
      const businessUnit = group.businessUnit ?? businessUnitFromPlantCode(plant);
      return isRegistrationInAppMode(
        typeof businessUnit === 'string' ? businessUnit : null,
        plant
      );
    })
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
    const data = await applyCustomerMasterNames(buildRegistrationCreateData(candidate));
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
