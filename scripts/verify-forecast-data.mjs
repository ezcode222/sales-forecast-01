/**
 * Full forecast + registration data verification.
 * Run: npx tsx --env-file=.env scripts/verify-forecast-data.mjs [path/to/Upload_Fcst_NYL.xlsx]
 */
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import prisma from '../src/db/prisma.ts';
import { parseVersionedImportSheet } from '../src/api/services/forecastImport/versionedSheetParse.ts';
import { readExcelVersionLabel } from '../src/api/services/forecastImport/detectFormat.ts';
import { firstDayOfMonthPeriod } from '../src/api/services/forecastImport/excelUtils.ts';

const excelPath = process.argv[2]
  ?? 'C:/Users/Tapanawat/Downloads/Upload_Fcst_NYL.xlsx';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthPeriod(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function normalizeVersionLabel(label) {
  return String(label ?? '')
    .trim()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

async function buildRegistrationLookup() {
  const byKey = new Map();

  const managed = await prisma.masterDataCrmRegistration.findMany({
    where: { mainRegist: 1 },
    select: { id: true, keyForNoCRM: true, createdBy: true },
  });
  for (const row of managed) {
    const key = String(row.keyForNoCRM).trim().toLowerCase();
    if (key) byKey.set(key, { id: row.id, source: row.createdBy === 'excel-import' ? 'managed' : 'managed-manual' });
  }

  const crmRows = await prisma.$queryRaw`
    SELECT
      CAST(NewKey AS NVARCHAR(200)) AS id,
      CAST(KeyforNoCRM AS NVARCHAR(500)) AS keyForNoCRM
    FROM dbo.VW_CRM_RegistrationAll_1
    WHERE MainRegist = 1 AND NewKey IS NOT NULL AND KeyforNoCRM IS NOT NULL
  `;
  for (const row of crmRows) {
    const key = String(row.keyForNoCRM).trim().toLowerCase();
    if (key && !byKey.has(key)) {
      byKey.set(key, { id: String(row.id), source: 'crm' });
    }
  }

  return byKey;
}

const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
  console.error('FAIL', message);
}

function warn(message) {
  warnings.push(message);
  console.warn('WARN', message);
}

function pass(message) {
  console.log('OK', message);
}

console.log('=== Forecast & Registration Verification ===\n');

// ── 1. Registration quality (managed) ─────────────────────────────────────
const [managedStats] = await prisma.$queryRaw`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN ownerName LIKE '20[2-3][0-9]' THEN 1 ELSE 0 END) AS ownerYear,
    SUM(CASE WHEN plantCode NOT IN ('0','') AND plantCode NOT LIKE '[0-9][0-9][0-9][0-9]%' THEN 1 ELSE 0 END) AS badPlant,
    SUM(CASE WHEN soldToCode NOT IN ('0','') AND soldToCode NOT LIKE '%[0-9]%' THEN 1 ELSE 0 END) AS badSoldTo
  FROM dbo.master_data_crm_registrations
  WHERE mainRegist = 1
`;
const managedTotal = Number(managedStats?.total ?? 0);
if (Number(managedStats?.ownerYear ?? 0) > 0) fail(`managed owner year rows: ${managedStats.ownerYear}`);
else pass(`managed owner names — no planning years (${managedTotal} rows)`);
if (Number(managedStats?.badPlant ?? 0) > 0) fail(`managed bad plant codes: ${managedStats.badPlant}`);
else pass('managed plant codes — numeric or 0');
if (Number(managedStats?.badSoldTo ?? 0) > 0) fail(`managed bad soldTo codes: ${managedStats.badSoldTo}`);
else pass('managed soldTo codes — numeric or 0');

// ── 2. DimRegistration + join coverage ────────────────────────────────────
const [dimCount] = await prisma.$queryRaw`SELECT COUNT(*) AS c FROM dbo.DimRegistration`;
const [crmCount] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c FROM dbo.VW_CRM_RegistrationAll_1 WHERE NewKey IS NOT NULL AND MainRegist = 1
`;
const dimTotal = Number(dimCount?.c ?? 0);
const crmTotal = Number(crmCount?.c ?? 0);
if (dimTotal !== crmTotal + managedTotal) {
  fail(`DimRegistration count ${dimTotal} != CRM ${crmTotal} + managed ${managedTotal}`);
} else {
  pass(`DimRegistration count ${dimTotal} = CRM ${crmTotal} + managed ${managedTotal}`);
}

const [missingManagedInDim] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.master_data_crm_registrations m
  LEFT JOIN dbo.DimRegistration d ON d.NewKey = m.newKey
  WHERE m.mainRegist = 1 AND d.NewKey IS NULL
`;
if (Number(missingManagedInDim?.c ?? 0) > 0) {
  fail(`managed rows missing from DimRegistration: ${missingManagedInDim.c}`);
} else {
  pass('all managed rows in DimRegistration');
}

// ── 3. Forecast inventory ─────────────────────────────────────────────────
const versionRows = await prisma.$queryRaw`
  SELECT versionName, COUNT(*) AS [rowCount], COUNT(DISTINCT registrationId) AS [regCount]
  FROM dbo.forecast_values
  GROUP BY versionName
  ORDER BY versionName
`;
console.log('\nForecast rows by version:');
for (const row of versionRows) {
  console.log(`  ${row.versionName}: ${row.rowCount} rows, ${row.regCount} registrations`);
}
assert(versionRows.length > 0, 'forecast_values is empty');

const [orphanForecasts] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.forecast_values fv
  LEFT JOIN dbo.master_data_crm_registrations m ON m.id = fv.registrationId
  LEFT JOIN dbo.VW_CRM_RegistrationAll_1 c
    ON CAST(c.NewKey AS NVARCHAR(200)) = fv.registrationId
    OR CAST(c.KeyforNoCRM AS NVARCHAR(500)) = fv.registrationId
  WHERE m.id IS NULL AND c.NewKey IS NULL
`;
const orphanCount = Number(orphanForecasts?.c ?? 0);
if (orphanCount > 0) warn(`forecast rows with unknown registrationId: ${orphanCount}`);
else pass('all forecast registrationIds resolve to CRM or managed');

// ── 4. FactForecast view vs forecast_values ───────────────────────────────
const [mismatchRows] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.forecast_values fv
  INNER JOIN dbo.master_data_crm_registrations m ON m.id = fv.registrationId
  INNER JOIN dbo.FactForecast ff
    ON ff.[Registration Key] = m.newKey
    AND ff.[Forecast Version] = fv.versionName
    AND ff.[Fcst Period] = DATEFROMPARTS(YEAR(fv.period), MONTH(fv.period), 1)
  WHERE ABS(CAST(fv.qtyFcst AS FLOAT) - CAST(ff.[NewQty] AS FLOAT)) > 0.0001
`;
if (Number(mismatchRows?.c ?? 0) > 0) {
  fail(`FactForecast qty mismatch vs forecast_values: ${mismatchRows.c} rows`);
} else {
  pass('FactForecast NewQty matches forecast_values for managed rows');
}

const [unjoinedManaged] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.forecast_values fv
  INNER JOIN dbo.master_data_crm_registrations m ON m.id = fv.registrationId
  LEFT JOIN dbo.FactForecast ff
    ON ff.[Registration Key] = m.newKey
    AND ff.[Forecast Version] = fv.versionName
    AND ff.[Fcst Period] = DATEFROMPARTS(YEAR(fv.period), MONTH(fv.period), 1)
  WHERE ff.[Registration Key] IS NULL AND fv.qtyFcst <> 0
`;
if (Number(unjoinedManaged?.c ?? 0) > 0) {
  fail(`managed forecast rows not appearing in FactForecast: ${unjoinedManaged.c}`);
} else {
  pass('all non-zero managed forecasts appear in FactForecast');
}

const [dimJoinGaps] = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.FactForecast ff
  LEFT JOIN dbo.DimRegistration d ON d.NewKey = ff.[Registration Key]
  WHERE d.NewKey IS NULL
`;
if (Number(dimJoinGaps?.c ?? 0) > 0) {
  fail(`FactForecast rows not joining DimRegistration: ${dimJoinGaps.c}`);
} else {
  pass('all FactForecast rows join DimRegistration on NewKey');
}

// ── 5. Excel cross-check (if file available) ────────────────────────────
if (!existsSync(excelPath)) {
  warn(`Excel file not found (${excelPath}) — skipping Excel cross-check`);
} else {
  console.log(`\nExcel cross-check: ${excelPath}`);
  const workbook = XLSX.read(readFileSync(excelPath), { type: 'buffer', cellDates: false });
  const targetVersion = normalizeVersionLabel(readExcelVersionLabel(workbook) ?? 'BB FY26');
  pass(`Excel version label → DB version: ${targetVersion}`);

  const registrationByKey = await buildRegistrationLookup();

  let excelChecks = 0;
  let excelPasses = 0;
  let excelSkippedNoReg = 0;
  let excelMissingFcst = 0;
  let managedChecks = 0;
  let managedPasses = 0;
  const excelFailures = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === 'Fcst Version' || sheetName === 'Mapping') continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    let parsed;
    try {
      parsed = parseVersionedImportSheet(sheetName, sheet);
    } catch {
      continue;
    }
    if (parsed.forecastColumns.length === 0) continue;

    for (const [rawKey, group] of parsed.excelGroups) {
      const key = String(rawKey).trim().toLowerCase();
      const registration = registrationByKey.get(key);
      if (!registration) {
        if (group.forecastValues.some(qty => num(qty) > 0)) excelSkippedNoReg += 1;
        continue;
      }

      for (let i = 0; i < parsed.forecastColumns.length; i++) {
        const col = parsed.forecastColumns[i];
        const excelQty = num(group.forecastValues[i]);
        const excelPrice = num(group.priceValues[i]);
        const excelAmount = num(group.amountValues[i]);
        if (excelQty === 0 && excelPrice === 0 && excelAmount === 0) continue;

        excelChecks += 1;
        if (registration.source === 'managed') {
          managedChecks += 1;
        }
        const period = new Date(firstDayOfMonthPeriod(col.month));
        const dbRow = await prisma.forecastValue.findFirst({
          where: {
            registrationId: registration.id,
            versionName: targetVersion,
            period,
          },
          select: { qtyFcst: true, priceFcst: true, amountFcst: true },
        });

        if (!dbRow) {
          excelMissingFcst += 1;
          if (excelFailures.length < 8) {
            excelFailures.push({
              key: rawKey,
              source: registration.source,
              month: col.month,
              excel: { qty: excelQty, price: excelPrice, amount: excelAmount },
              db: null,
            });
          }
          continue;
        }

        const dbQty = num(dbRow.qtyFcst);
        const dbPrice = num(dbRow.priceFcst);
        const dbAmount = num(dbRow.amountFcst);
        const qtyOk = Math.abs(dbQty - excelQty) < 0.0001;
        const priceOk = Math.abs(dbPrice - excelPrice) < 0.01;
        const amountOk = Math.abs(dbAmount - excelAmount) < 0.01;

        if (qtyOk && priceOk && amountOk) {
          excelPasses += 1;
          if (registration.source === 'managed') managedPasses += 1;
        } else if (excelFailures.length < 8) {
          excelFailures.push({
            key: rawKey,
            source: registration.source,
            month: col.month,
            excel: { qty: excelQty, price: excelPrice, amount: excelAmount },
            db: { qty: dbQty, price: dbPrice, amount: dbAmount },
          });
        }
      }
    }
  }

  console.log(`  Excel cells checked (non-zero, registration exists): ${excelChecks}`);
  console.log(`  Exact matches (qty+price+amount): ${excelPasses}`);
  console.log(`  Managed import cells checked: ${managedChecks}, matched: ${managedPasses}`);
  console.log(`  Skipped (no registration in DB): ${excelSkippedNoReg} keys with non-zero forecast`);
  console.log(`  Missing forecast in DB: ${excelMissingFcst}`);
  if (excelFailures.length > 0) {
    console.log('  Sample mismatches:', JSON.stringify(excelFailures, null, 2));
  }

  const matchRate = excelChecks > 0 ? excelPasses / excelChecks : 1;
  const managedRate = managedChecks > 0 ? managedPasses / managedChecks : 1;
  if (excelChecks === 0) {
    warn('no non-zero Excel forecast cells to compare');
  } else if (matchRate < 0.99) {
    fail(`Excel vs DB match rate ${(matchRate * 100).toFixed(1)}% (${excelPasses}/${excelChecks})`);
  } else {
    pass(`Excel vs DB match rate ${(matchRate * 100).toFixed(1)}% (${excelPasses}/${excelChecks})`);
  }

  if (managedChecks > 0 && managedRate < 0.99) {
    fail(`Managed import Excel match rate ${(managedRate * 100).toFixed(1)}% (${managedPasses}/${managedChecks})`);
  } else if (managedChecks > 0) {
    pass(`Managed import Excel match rate ${(managedRate * 100).toFixed(1)}% (${managedPasses}/${managedChecks})`);
  }

  if (excelMissingFcst > 0) {
    warn(`${excelMissingFcst} non-zero Excel cells have no matching forecast_values row`);
  }
  if (excelSkippedNoReg > 0) {
    warn(`${excelSkippedNoReg} Excel keys with forecast not in DB (not imported or no CRM match)`);
  }
}

// ── 6. Spot checks ────────────────────────────────────────────────────────
console.log('\nSpot checks:');
const ferrero = await prisma.masterDataCrmRegistration.findFirst({
  where: { keyForNoCRM: '///1110/401098/On' },
  select: { id: true, ownerName: true, plantCode: true, countryName: true, soldToCode: true },
});
if (ferrero) {
  const fcst = await prisma.forecastValue.findMany({
    where: { registrationId: ferrero.id, qtyFcst: { gt: 0 } },
    select: { versionName: true, period: true, qtyFcst: true },
    take: 5,
  });
  console.log('  Ferrero 401098:', {
    owner: ferrero.ownerName,
    plant: ferrero.plantCode,
    country: ferrero.countryName,
    soldTo: ferrero.soldToCode,
    forecastSamples: fcst.map(r => ({
      version: r.versionName,
      period: monthPeriod(r.period),
      qty: num(r.qtyFcst),
    })),
  });
  pass('Ferrero 401098 registration exists with forecast samples');
} else {
  warn('Ferrero 401098 registration not found');
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log('\n=== Summary ===');
console.log(`Failures: ${failures.length}`);
console.log(`Warnings: ${warnings.length}`);
if (failures.length > 0) {
  console.error('\nFAILED CHECKS:');
  failures.forEach(item => console.error(' -', item));
  process.exitCode = 1;
} else {
  console.log('\nAll critical checks passed.');
}

await prisma.$disconnect();
