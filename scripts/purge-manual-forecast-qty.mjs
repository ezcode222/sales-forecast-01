/**
 * Revert / clear forecast qty values that came from manual grid commits (not Excel import).
 *
 * Dry run:  npx tsx --env-file=.env scripts/purge-manual-forecast-qty.mjs
 * Apply:    npx tsx --env-file=.env scripts/purge-manual-forecast-qty.mjs --apply
 */
import prisma from '../src/db/prisma.ts';

const apply = process.argv.includes('--apply');

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const batchesBySource = await prisma.$queryRaw`
    SELECT source, COUNT(*) AS cnt
    FROM dbo.forecast_commit_batches
    GROUP BY source
    ORDER BY source
  `;
  console.log('Commit batches by source:', batchesBySource);

  /** Earliest manual qty change per cell → restore qtyFcst to oldQtyFcst (or 0). */
  const restoreRows = await prisma.$queryRaw`
    WITH manual_qty_changes AS (
      SELECT
        cl.registrationId,
        cl.versionName,
        cl.period,
        cl.granularity,
        cl.oldQtyFcst,
        cl.newQtyFcst,
        cl.changedAt,
        ROW_NUMBER() OVER (
          PARTITION BY cl.registrationId, cl.versionName, cl.period
          ORDER BY cl.changedAt ASC
        ) AS rn
      FROM dbo.forecast_change_logs cl
      INNER JOIN dbo.forecast_commit_batches b ON b.id = cl.batchId
      WHERE b.source = N'manual_commit'
        AND ISNULL(cl.newQtyFcst, 0) <> ISNULL(cl.oldQtyFcst, 0)
    )
    SELECT
      registrationId,
      versionName,
      period,
      granularity,
      CAST(ISNULL(oldQtyFcst, 0) AS FLOAT) AS restoreQtyFcst,
      CAST(newQtyFcst AS FLOAT) AS currentManualQtyFcst
    FROM manual_qty_changes
    WHERE rn = 1
  `;

  console.log(`Cells with manual qty commits to restore: ${restoreRows.length}`);

  if (restoreRows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const samples = restoreRows.slice(0, 8).map(row => ({
    registrationId: String(row.registrationId).slice(0, 60),
    version: row.versionName,
    period: row.period,
    restoreQty: row.restoreQtyFcst,
    wasManualQty: row.currentManualQtyFcst,
  }));
  console.log('Sample restores:', JSON.stringify(samples, null, 2));

  const currentValues = await prisma.$queryRaw`
    SELECT
      CAST(SUM(CAST(f.qtyFcst AS FLOAT)) AS FLOAT) AS totalQtyBefore
    FROM dbo.forecast_values f
    INNER JOIN (
      SELECT DISTINCT cl.registrationId, cl.versionName, cl.period
      FROM dbo.forecast_change_logs cl
      INNER JOIN dbo.forecast_commit_batches b ON b.id = cl.batchId
      WHERE b.source = N'manual_commit'
        AND ISNULL(cl.newQtyFcst, 0) <> ISNULL(cl.oldQtyFcst, 0)
    ) touched
      ON touched.registrationId = f.registrationId
      AND touched.versionName = f.versionName
      AND touched.period = f.period
  `;
  console.log('Total qtyFcst on touched cells (before):', currentValues[0]?.totalQtyBefore);

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to restore manual qty cells.');
    return;
  }

  let updated = 0;
  const batchSize = 100;
  for (let offset = 0; offset < restoreRows.length; offset += batchSize) {
    const chunk = restoreRows.slice(offset, offset + batchSize);
    await prisma.$transaction(async tx => {
      for (const row of chunk) {
        const restoreQty = num(row.restoreQtyFcst);
        const result = await tx.$executeRaw`
          UPDATE dbo.forecast_values
          SET qtyFcst = ${restoreQty},
              updatedAt = SYSUTCDATETIME()
          WHERE registrationId = ${String(row.registrationId)}
            AND versionName = ${String(row.versionName)}
            AND period = ${row.period}
        `;
        updated += Number(result);
      }
    });
    console.log(`Updated ${Math.min(offset + batchSize, restoreRows.length)} / ${restoreRows.length}`);
  }

  const afterValues = await prisma.$queryRaw`
    SELECT
      CAST(SUM(CAST(f.qtyFcst AS FLOAT)) AS FLOAT) AS totalQtyAfter
    FROM dbo.forecast_values f
    INNER JOIN (
      SELECT DISTINCT cl.registrationId, cl.versionName, cl.period
      FROM dbo.forecast_change_logs cl
      INNER JOIN dbo.forecast_commit_batches b ON b.id = cl.batchId
      WHERE b.source = N'manual_commit'
        AND ISNULL(cl.newQtyFcst, 0) <> ISNULL(cl.oldQtyFcst, 0)
    ) touched
      ON touched.registrationId = f.registrationId
      AND touched.versionName = f.versionName
      AND touched.period = f.period
  `;

  console.log(`\nDone. Rows updated: ${updated}`);
  console.log('Total qtyFcst on touched cells (after):', afterValues[0]?.totalQtyAfter);
  console.log('Hard refresh the browser to see changes on the web.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
