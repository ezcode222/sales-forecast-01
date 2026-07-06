import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildVersionedImportPreview } from '../src/api/services/forecastImport/buildVersionedPreview.ts';
import { confirmVersionedImport } from '../src/api/services/forecastImport/confirmImport.ts';
import { getPreviewCache } from '../src/api/services/forecastImport/previewCache.ts';
import prisma from '../src/db/prisma.ts';

const workbook = XLSX.read(readFileSync('tmp-upload-fcst-nyl.xlsx'), { type: 'buffer', cellDates: false });
const preview = await buildVersionedImportPreview(workbook, 'BB FY26', 'BB-FY26', true);
const cache = getPreviewCache(preview.previewId);
if (!cache?.versionedRecords?.length) {
  throw new Error('Preview cache missing versioned records');
}

console.log('Confirming', cache.versionedRecords.length, 'records...');
const result = await confirmVersionedImport(
  cache.versionedRecords,
  'BB FY26',
  'import-test-script',
  'No',
  {
    hasPriceColumns: cache.versionedHasPriceColumns ?? true,
    hasAmountColumns: cache.versionedHasAmountColumns ?? true,
  }
);
console.log('Import result:', result);

const reg916 = await prisma.$queryRaw`
  SELECT TOP 1 CAST(ISNULL(NewKey, KeyforNoCRM) AS NVARCHAR(200)) AS registrationId
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE KeyforNoCRM = N'10976/10976/80537/1104/400916/Off' AND MainRegist = 1
`;
const registrationId = reg916[0]?.registrationId;
if (registrationId) {
  const row = await prisma.forecastValue.findFirst({
    where: {
      registrationId,
      versionName: 'BB FY26',
      period: new Date('2026-04-01'),
    },
    select: { qtyFcst: true, priceFcst: true, amountFcst: true },
  });
  console.log('400916 Apr-26 DB values:', {
    qtyFcst: row ? Number(row.qtyFcst) : null,
    priceFcst: row ? Number(row.priceFcst) : null,
    amountFcst: row ? Number(row.amountFcst) : null,
  });
}

process.exit(0);
