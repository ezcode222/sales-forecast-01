import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  blockingUnmatchedRows,
  buildRegistrationCreateData,
  buildVersionedConfirmRecordsFromPackages,
  EXCEL_IMPORT_CREATED_BY,
  resolveOrCreateImportRegistrations,
} from '../src/api/services/forecastImport/autoCreateRegistrations.ts';
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
  console.log('OK buildRegistrationCreateData raw key');
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
