import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  blockingUnmatchedRows,
  buildRegistrationCreateData,
  buildVersionedConfirmRecordsFromPackages,
  EXCEL_IMPORT_CREATED_BY,
  resolveOrCreateImportRegistrations,
} from '../src/api/services/forecastImport/autoCreateRegistrations.ts';
import { normalizeCrmCategoryFields, isLikelyCompanyName } from '../src/api/services/registrationCategory.ts';
import { buildVersionedImportPreview } from '../src/api/services/forecastImport/buildVersionedPreview.ts';
import { confirmVersionedImport } from '../src/api/services/forecastImport/confirmImport.ts';
import { getPreviewCache } from '../src/api/services/forecastImport/previewCache.ts';
import prisma from '../src/db/prisma.ts';

const KEY_400212 = '10976/10976/80537/1104/400212/Off';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Unit checks (no Excel / DB required)
{
  const unmatched = [
    { reasonCode: 'crm_not_found', excelKeyForNoRegist: KEY_400212, sourceRow: 2, sourceSheet: 'Polymer' },
    { reasonCode: 'has_actual_no_crm', excelKeyForNoRegist: '1/2/3/4/5/Off', sourceRow: 4, sourceSheet: 'Polymer' },
    { reasonCode: 'invalid_key_format', excelKeyForNoRegist: 'bad/key', sourceRow: 5, sourceSheet: 'Polymer' },
    { reasonCode: 'onoff_mismatch', excelKeyForNoRegist: 'a/b/c/d/e/On', sourceRow: 3, sourceSheet: 'Polymer' },
  ];
  const blocking = blockingUnmatchedRows(unmatched);
  assert(blocking.length === 0, 'blockingUnmatchedRows should not block any unmatched reason');
  console.log('OK blockingUnmatchedRows');

  const invalidFormatData = buildRegistrationCreateData({
    excelKeyForNoRegist: 'bad/key/format',
    sourceSheet: 'Polymer',
    sourceRow: 9,
    soldToCode: '0',
    shipToCode: '0',
    endUserCode: '0',
    plantCode: '1104',
    materialCode: '400212',
    onOffSpec: 'Off',
    ownerName: 'IMPORT',
    materialDescription: 'Material 400212',
    countryName: null,
    shipToName: null,
    soldToName: null,
    endUser: null,
    plantName: null,
    process: null,
    application: null,
    subApp: null,
    hasImportedPrice: false,
    pendingForecastRecords: [],
  });
  assert(invalidFormatData.keyForNoCRM === 'bad/key/format', 'invalid format should keep raw Excel key');
  assert(invalidFormatData.newKey.startsWith('IMP_RAW/'), 'invalid format should use IMP_RAW newKey prefix');
  assert(invalidFormatData.soldToCode === '0', 'invalid format should not put company names into soldToCode');
  assert(invalidFormatData.plantCode === '1104', 'explicit plant code column should still be kept');
  console.log('OK buildRegistrationCreateData raw key');

  const validKeyData = buildRegistrationCreateData({
    excelKeyForNoRegist: KEY_400212,
    sourceSheet: 'Polymer',
    sourceRow: 2,
    soldToCode: 'Chuhatsu',
    shipToCode: 'Yazaki',
    endUserCode: 'Triumph',
    plantCode: 'China',
    materialCode: '400212',
    onOffSpec: 'Off',
    ownerName: 'IMPORT',
    materialDescription: 'Material 400212',
    countryName: null,
    shipToName: 'Ship Name',
    soldToName: 'Sold Name',
    endUser: 'End User',
    plantName: 'Plant Name',
    process: null,
    application: null,
    subApp: null,
    hasImportedPrice: false,
    pendingForecastRecords: [],
  });
  assert(validKeyData.soldToCode === '10976', 'valid key should use soldTo code from key not Excel name');
  assert(validKeyData.plantCode === '1104', 'valid key should use plant code from key not Excel country');
  assert(validKeyData.soldToName === null, 'valid key should not store Excel soldTo name at create');
  console.log('OK buildRegistrationCreateData separates codes and names');

  const comboCats = normalizeCrmCategoryFields(
    'INJ_Combination Switch',
    'Combination Switch',
    'TOYO DENSO',
  );
  assert(comboCats.process === 'Injection', 'INJ process should map to Injection Cat1');
  assert(comboCats.application === 'INJ_Combination Switch', 'INJ code should move to Cat2/application');
  assert(comboCats.subApp === 'TOYO DENSO', 'sub-app should stay in Cat3');
  const doorCats = normalizeCrmCategoryFields('INJ_Door System', 'Cap lock header', null);
  assert(doorCats.process === 'Injection' && doorCats.application === 'INJ_Door System', 'door system shift');
  assert(doorCats.subApp === 'Cap lock header', 'application fallback to Cat3 when no sub-app');
  const stableCats = normalizeCrmCategoryFields('Injection', 'MF', 'Fishing net');
  assert(stableCats.process === 'Injection' && stableCats.application === 'MF' && stableCats.subApp === 'Fishing net', 'already aligned rows unchanged');
  const comboImport = buildRegistrationCreateData({
    excelKeyForNoRegist: '1/2/3/1104/400212/Off',
    sourceSheet: 'Polymer',
    sourceRow: 3,
    soldToCode: '0',
    shipToCode: '0',
    endUserCode: '0',
    plantCode: '1104',
    materialCode: '400212',
    onOffSpec: 'Off',
    ownerName: 'IMPORT',
    materialDescription: 'Test',
    countryName: null,
    shipToName: null,
    soldToName: null,
    endUser: null,
    plantName: null,
    process: 'INJ_Combination Switch',
    application: 'Combination Switch',
    subApp: 'TOYO DENSO',
    hasImportedPrice: false,
    pendingForecastRecords: [],
  });
  assert(comboImport.process === 'Injection' && comboImport.application === 'INJ_Combination Switch', 'import create data category normalize');
  assert(comboImport.subApp === 'TOYO DENSO', 'import create data sub-app');
  assert(isLikelyCompanyName('AMCOR FLEXIBLES (NEW ZEALAND) LIMITED'), 'company detect');
  const noCompanySub = normalizeCrmCategoryFields('INJ_2W', 'AMCOR FLEXIBLES (NEW ZEALAND) LIMITED', null);
  assert(noCompanySub.subApp === null, 'company name must not fall into Cat3');
  console.log('OK normalizeCrmCategoryFields');

  const partialKeyData = buildRegistrationCreateData({
    excelKeyForNoRegist: '///1110/401098/On',
    sourceSheet: 'CP',
    sourceRow: 9,
    soldToCode: '0',
    shipToCode: '0',
    endUserCode: '0',
    plantCode: '0',
    materialCode: '401098',
    onOffSpec: 'On',
    ownerName: '2026',
    materialDescription: 'Material 401098',
    countryName: 'Injection',
    shipToName: 'Ferrero',
    soldToName: null,
    endUser: 'Nopparat',
    plantName: 'India',
    process: 'Injection',
    application: null,
    subApp: null,
    hasImportedPrice: false,
    pendingForecastRecords: [],
  });
  assert(partialKeyData.plantCode === '1110', 'partial key should still extract plant code');
  assert(partialKeyData.materialCode === '401098', 'partial key should still extract material code');
  assert(partialKeyData.soldToCode === '0', 'partial key without soldTo should stay 0');
  assert(partialKeyData.ownerName === 'Nopparat', 'planning year owner should fall back to PIC/end user');
  assert(partialKeyData.countryName === 'India', 'swapped country/process fields should be repaired');
  console.log('OK buildRegistrationCreateData partial CP key');
}

const excelPath = 'tmp-upload-fcst-nyl.xlsx';
if (!existsSync(excelPath)) {
  console.log(`SKIP integration test — ${excelPath} not found (unit checks passed)`);
  process.exit(0);
}

const workbook = XLSX.read(readFileSync(excelPath), { type: 'buffer', cellDates: false });
const preview = await buildVersionedImportPreview(workbook, 'BB FY26', 'BB-FY26', true);
const cache = getPreviewCache(preview.previewId);

assert(cache, 'preview cache missing');
assert((cache.autoCreateCandidates?.length ?? 0) > 0, 'expected autoCreateCandidates');
if (cache.autoCreateCandidates.some(candidate => candidate.excelKeyForNoRegist === KEY_400212)) {
  console.log('OK 400212 is an auto-create candidate');
} else {
  console.log('SKIP 400212 auto-create check — key may already exist in CRM or master_data');
}
assert(
  (preview.summary.registrationsToCreate ?? 0) > 0,
  'summary.registrationsToCreate should be > 0'
);

const candidate400212 = cache.autoCreateCandidates.find(
  candidate => candidate.excelKeyForNoRegist === KEY_400212
);
if (!candidate400212) {
  console.log('Integration checks passed (400212-specific DB assertions skipped).');
  process.exit(0);
}

console.log('400212 pending forecast months:', candidate400212.pendingForecastRecords.length);
const aprPending = candidate400212.pendingForecastRecords.find(record => record.period.startsWith('2026-04'));
console.log('400212 Apr pending:', aprPending);

const autoCreateResult = await resolveOrCreateImportRegistrations(cache.autoCreateCandidates);
console.log('Auto-create result:', {
  registrationsCreated: autoCreateResult.registrationsCreated,
  createdIds: autoCreateResult.createdRegistrationIds.length,
});

const mergedRecords = [
  ...(cache.versionedRecords ?? []),
  ...buildVersionedConfirmRecordsFromPackages(cache.autoCreateCandidates, autoCreateResult.registrationIdByKey),
];
const regId400212 = autoCreateResult.registrationIdByKey.get(KEY_400212.toLowerCase())
  ?? autoCreateResult.registrationIdByKey.get(KEY_400212);
assert(regId400212, '400212 registration id should be resolved');

const managed = await prisma.masterDataCrmRegistration.findFirst({
  where: { keyForNoCRM: KEY_400212 },
  select: { id: true, createdBy: true, materialCode: true },
});
assert(managed, '400212 should exist in master_data_crm_registrations');
assert(managed.createdBy === EXCEL_IMPORT_CREATED_BY, `createdBy should be ${EXCEL_IMPORT_CREATED_BY}`);

const importResult = await confirmVersionedImport(
  mergedRecords,
  'BB FY26',
  'verify-auto-create-script',
  'No',
  {
    hasPriceColumns: cache.versionedHasPriceColumns ?? true,
    hasAmountColumns: cache.versionedHasAmountColumns ?? true,
  }
);
console.log('Import result:', importResult);

const forecastRow = await prisma.forecastValue.findFirst({
  where: {
    registrationId: managed.id,
    versionName: 'BB FY26',
    period: new Date('2026-04-01'),
  },
  select: { qtyFcst: true, priceFcst: true, amountFcst: true },
});
console.log('400212 Apr-26 DB:', {
  qtyFcst: forecastRow ? Number(forecastRow.qtyFcst) : null,
  priceFcst: forecastRow ? Number(forecastRow.priceFcst) : null,
  amountFcst: forecastRow ? Number(forecastRow.amountFcst) : null,
});

if (aprPending) {
  assert(
    forecastRow && Math.abs(Number(forecastRow.qtyFcst) - aprPending.qtyFcst) < 0.0001,
    `qty mismatch: expected ${aprPending.qtyFcst}, got ${forecastRow?.qtyFcst}`
  );
  assert(
    forecastRow && Math.abs(Number(forecastRow.amountFcst) - aprPending.amountFcst) < 0.01,
    `amount mismatch: expected ${aprPending.amountFcst}, got ${forecastRow?.amountFcst}`
  );
}

console.log('All auto-create import checks passed.');
process.exit(0);
