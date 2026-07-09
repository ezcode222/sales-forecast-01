import type { MasterDataCrmRegistration } from '@prisma/client';
import prisma from '../../db/prisma';
import { EXCEL_IMPORT_CREATED_BY } from './forecastImport/autoCreateRegistrations';
import { buildRepairManagedRegistrationData } from './forecastImport/autoCreateRegistrations';
import { isLikelyCompanyName, normalizeCrmCategoryFields } from './registrationCategory';
import { applyCustomerMasterNames, resolveCustomerNamesFromMaster } from './registrationNameResolver';
import { isLikelyPlantCode, isLikelyRegistrationCode } from './forecastImport/autoCreateRegistrations';

export type ImportRepairStats = {
  totalRows: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  nameFieldsFixed: number;
  stillSuspicious: number;
};

const NAME_FIELDS = ['soldToName', 'shipToName', 'endUser', 'endUserName'] as const;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function namesDiffer(
  before: Pick<MasterDataCrmRegistration, typeof NAME_FIELDS[number]>,
  after: Pick<MasterDataCrmRegistration, typeof NAME_FIELDS[number]>,
) {
  return NAME_FIELDS.some(field => (before[field] ?? null) !== (after[field] ?? null));
}

function fullRepairChanged(
  before: MasterDataCrmRegistration,
  after: Record<string, unknown>,
) {
  const fields = [
    'newKey',
    'keyForNoCRM',
    'registrationTopic',
    'soldToCode',
    'shipToCode',
    'endUserCode',
    'plantCode',
    'materialCode',
    'onOffSpec',
    'ownerName',
    'soldToName',
    'shipToName',
    'endUser',
    'endUserName',
    'plantName',
    'countryName',
    'materialDescription',
    'businessUnit',
  ];
  return fields.some(field => (before[field as keyof MasterDataCrmRegistration] ?? null) !== (after[field] ?? null));
}

async function loadExcelImportRows() {
  return prisma.masterDataCrmRegistration.findMany({
    where: { createdBy: EXCEL_IMPORT_CREATED_BY },
    orderBy: { createdAt: 'asc' },
  });
}

export async function repairExcelImportCustomerNamesOnly(apply: boolean): Promise<ImportRepairStats> {
  const rows = await loadExcelImportRows();
  let rowsUpdated = 0;
  let rowsUnchanged = 0;
  let nameFieldsFixed = 0;

  for (const row of rows) {
    const names = await resolveCustomerNamesFromMaster({
      soldToCode: row.soldToCode,
      shipToCode: row.shipToCode,
      endUserCode: row.endUserCode,
    });
    const updateData = {
      soldToName: names.soldToName,
      shipToName: names.shipToName,
      endUser: names.endUser,
      endUserName: names.endUserName,
    };

    if (!namesDiffer(row, updateData)) {
      rowsUnchanged += 1;
      continue;
    }

    for (const field of NAME_FIELDS) {
      if ((row[field] ?? null) !== (updateData[field] ?? null)) {
        nameFieldsFixed += 1;
      }
    }
    rowsUpdated += 1;

    if (apply) {
      await prisma.masterDataCrmRegistration.update({
        where: { id: row.id },
        data: updateData,
      });
    }
  }

  return {
    totalRows: rows.length,
    rowsUpdated,
    rowsUnchanged,
    nameFieldsFixed,
    stillSuspicious: 0,
  };
}

export async function repairAllExcelImportRegistrations(apply: boolean): Promise<ImportRepairStats> {
  const rows = await loadExcelImportRows();
  let rowsUpdated = 0;
  let rowsUnchanged = 0;
  let nameFieldsFixed = 0;
  let stillSuspicious = 0;

  for (const row of rows) {
    const repaired = buildRepairManagedRegistrationData({
      keyForNoCRM: row.keyForNoCRM,
      newKey: row.newKey,
      ownerName: row.ownerName,
      materialDescription: row.materialDescription,
      countryName: row.countryName,
      shipToName: null,
      soldToName: null,
      endUser: null,
      plantName: row.plantName,
      soldToCode: row.soldToCode,
      shipToCode: row.shipToCode,
      endUserCode: row.endUserCode,
      plantCode: row.plantCode,
      materialCode: row.materialCode,
      onOffSpec: row.onOffSpec,
      process: row.process,
      application: row.application,
      subApp: row.subApp,
      hasImportedPrice: row.priceFormula === 'Fixed Price',
    });
    const withMasterNames = await applyCustomerMasterNames(repaired);
    const updateData = {
      newKey: withMasterNames.newKey,
      keyForNoCRM: withMasterNames.keyForNoCRM,
      registrationTopic: withMasterNames.registrationTopic,
      soldToCode: withMasterNames.soldToCode,
      shipToCode: withMasterNames.shipToCode,
      endUserCode: withMasterNames.endUserCode,
      plantCode: withMasterNames.plantCode,
      materialCode: withMasterNames.materialCode,
      onOffSpec: withMasterNames.onOffSpec,
      ownerName: withMasterNames.ownerName,
      soldToName: withMasterNames.soldToName,
      shipToName: withMasterNames.shipToName,
      endUser: withMasterNames.endUser,
      endUserName: withMasterNames.endUserName,
      plantName: withMasterNames.plantName,
      countryName: withMasterNames.countryName,
      materialDescription: withMasterNames.materialDescription,
      businessUnit: withMasterNames.businessUnit,
    };

    if (!fullRepairChanged(row, updateData)) {
      rowsUnchanged += 1;
      continue;
    }

    for (const field of NAME_FIELDS) {
      if ((row[field] ?? null) !== (updateData[field as keyof typeof updateData] ?? null)) {
        nameFieldsFixed += 1;
      }
    }

    const stillBad =
      !isLikelyPlantCode(updateData.plantCode) && updateData.plantCode !== '0'
      || (!isLikelyRegistrationCode(updateData.soldToCode) && updateData.soldToCode !== '0');
    if (stillBad) stillSuspicious += 1;

    rowsUpdated += 1;
    if (apply) {
      await prisma.masterDataCrmRegistration.update({
        where: { id: row.id },
        data: updateData,
      });
    }
  }

  return {
    totalRows: rows.length,
    rowsUpdated,
    rowsUnchanged,
    nameFieldsFixed,
    stillSuspicious,
  };
}

export async function auditExcelImportNameMismatches() {
  const rows = await loadExcelImportRows();
  let rowsWithMismatch = 0;
  let fieldMismatches = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const names = await resolveCustomerNamesFromMaster({
      soldToCode: row.soldToCode,
      shipToCode: row.shipToCode,
      endUserCode: row.endUserCode,
    });
    const checks = [
      { field: 'soldToName', code: row.soldToCode, current: row.soldToName, expected: names.soldToName },
      { field: 'shipToName', code: row.shipToCode, current: row.shipToName, expected: names.shipToName },
      { field: 'endUser', code: row.endUserCode, current: row.endUser, expected: names.endUser },
      { field: 'endUserName', code: row.endUserCode, current: row.endUserName, expected: names.endUserName },
    ];

    let rowMismatch = false;
    for (const check of checks) {
      const code = text(check.code);
      if (!code || code === '0' || !check.expected) continue;
      if (text(check.current) !== text(check.expected)) {
        fieldMismatches += 1;
        rowMismatch = true;
        if (samples.length < 15) {
          samples.push({
            id: row.id,
            field: check.field,
            code,
            current: text(check.current) || '(empty)',
            expected: check.expected,
          });
        }
      }
    }
    if (rowMismatch) rowsWithMismatch += 1;
  }

  return { totalRows: rows.length, rowsWithMismatch, fieldMismatches, samples };
}

export type CategoryRepairStats = {
  totalRows: number;
  rowsUpdated: number;
  rowsUnchanged: number;
  shiftedBefore: number;
  shiftedAfter: number;
};

export async function auditExcelImportShiftedCat1() {
  const rows = await prisma.$queryRawUnsafe<Array<{ rows: number }>>(`
    SELECT COUNT(*) AS rows
    FROM dbo.DimRegistration d
    INNER JOIN dbo.master_data_crm_registrations m ON m.newKey = d.NewKey
    WHERE m.createdBy = 'excel-import'
      AND (d.Cat1Name LIKE 'INJ[_]%' OR d.Cat1Name LIKE 'EXT[_]%')
  `);
  return Number(rows[0]?.rows ?? 0);
}

export async function repairExcelImportCategories(apply: boolean): Promise<CategoryRepairStats> {
  const rows = await loadExcelImportRows();
  const shiftedBefore = await auditExcelImportShiftedCat1();
  let rowsUpdated = 0;
  let rowsUnchanged = 0;

  for (const row of rows) {
    const categories = normalizeCrmCategoryFields(row.process, row.application, row.subApp);
    const updateData = {
      process: categories.process,
      application: categories.application,
      subApp: categories.subApp,
    };

    if (
      (row.process ?? null) === updateData.process
      && (row.application ?? null) === updateData.application
      && (row.subApp ?? null) === updateData.subApp
    ) {
      rowsUnchanged += 1;
      continue;
    }

    rowsUpdated += 1;
    if (apply) {
      await prisma.masterDataCrmRegistration.update({
        where: { id: row.id },
        data: updateData,
      });
    }
  }

  const shiftedAfter = apply ? await auditExcelImportShiftedCat1() : shiftedBefore;
  return {
    totalRows: rows.length,
    rowsUpdated,
    rowsUnchanged,
    shiftedBefore,
    shiftedAfter: apply ? shiftedAfter : shiftedBefore - rowsUpdated,
  };
}

export async function backfillImportSubAppFromCrm(apply: boolean) {
  const candidates = await prisma.$queryRawUnsafe<Array<{
    id: string;
    keyForNoCRM: string;
    subApp: string | null;
    crmCat3: string | null;
  }>>(`
    SELECT m.id, m.keyForNoCRM, m.subApp,
      CAST(c.Cat3Name AS NVARCHAR(500)) AS crmCat3
    FROM dbo.master_data_crm_registrations m
    INNER JOIN dbo.VW_CRM_RegistrationAll_1 c
      ON c.KeyforNoCRM = m.keyForNoCRM AND c.MainRegist = 1
    WHERE m.createdBy = 'excel-import'
      AND (m.subApp IS NULL OR LTRIM(RTRIM(m.subApp)) = '')
      AND c.Cat3Name IS NOT NULL AND LTRIM(RTRIM(c.Cat3Name)) <> ''
  `);

  let updated = 0;
  for (const row of candidates) {
    const subApp = text(row.crmCat3);
    if (!subApp || isLikelyCompanyName(subApp)) continue;
    updated += 1;
    if (apply) {
      await prisma.masterDataCrmRegistration.update({
        where: { id: row.id },
        data: { subApp },
      });
    }
  }

  return { candidates: candidates.length, updated };
}
