import prisma from '../src/db/prisma.ts';
import { getCachedScopedActualRange } from '../src/api/routes/actuals.ts';
import { getActiveSnapshotVersion } from '../src/api/services/dataSnapshot.ts';

const snapshotVersion = await getActiveSnapshotVersion();
const qtyCol = snapshotVersion ? 'a.qty' : 'a.[Order Qty_TON]';
const amountCol = snapshotVersion ? 'a.amount' : 'a.[Net Amount USD (new)]';
const dateCol = snapshotVersion ? 'a.deliveryDate' : 'a.Deliverydate';
const keyCol = snapshotVersion ? 'a.keyForNoRegist' : 'a.[Key for no regist]';
const salesFrom = snapshotVersion
  ? `dbo.actual_sales_snapshot a`
  : `dbo.MKT_SALEReport_ZSDR001_UGT_CRM_NYL_1 a`;
const snapshotFilter = snapshotVersion
  ? `AND a.snapshotVersion = N'${snapshotVersion.replace(/'/g, "''")}'`
  : '';

const multiLineSamples = await prisma.$queryRawUnsafe(`
  SELECT TOP 5
    CAST(r.NewKey AS NVARCHAR(200)) AS registrationId,
    CONVERT(CHAR(7), ${dateCol}, 126) AS [month],
    COUNT(*) AS lineCount
  FROM dbo.VW_CRM_RegistrationAll_1 r
  INNER JOIN ${salesFrom}
    ON ${keyCol} = r.KeyforNoCRM
  WHERE r.MainRegist = 1
    AND r.NewKey IS NOT NULL
    AND ${dateCol} IS NOT NULL
    AND ISNULL(${qtyCol}, 0) > 0
    ${snapshotFilter}
  GROUP BY CAST(r.NewKey AS NVARCHAR(200)), CONVERT(CHAR(7), ${dateCol}, 126)
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
`);

if (multiLineSamples.length === 0) {
  console.log('No multi-line registration/month samples found.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log('=== Verify Actual Price Formula ===');
console.log('Expected: priceAct = SUM(amount) / SUM(qty)\n');

let mismatches = 0;
for (const sample of multiLineSamples) {
  const registrationId = String(sample.registrationId);
  const month = String(sample.month);
  const [raw] = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CAST(ISNULL(${qtyCol}, 0) AS DECIMAL(18, 4))) AS totalQty,
      SUM(CAST(ISNULL(${amountCol}, 0) AS DECIMAL(18, 4))) AS totalAmount
    FROM ${salesFrom}
    INNER JOIN dbo.VW_CRM_RegistrationAll_1 r ON ${keyCol} = r.KeyforNoCRM
    WHERE r.NewKey = N'${registrationId.replace(/'/g, "''")}'
      AND CONVERT(CHAR(7), ${dateCol}, 126) = N'${month}'
      ${snapshotFilter}
  `);

  const totalQty = Number(raw?.totalQty ?? 0);
  const totalAmount = Number(raw?.totalAmount ?? 0);
  const expectedPrice = totalQty > 0 ? totalAmount / totalQty : 0;

  const apiRows = await getCachedScopedActualRange(month, month, [registrationId], 'month');
  const apiRow = apiRows.find(row => row.registrationId === registrationId && row.month === month);
  const apiPrice = Number(apiRow?.priceAct ?? 0);
  const apiQty = Number(apiRow?.qtyAct ?? 0);
  const apiAmount = Number(apiRow?.amountAct ?? 0);
  const diff = Math.abs(expectedPrice - apiPrice);

  const ok = diff < 0.0001 && Math.abs(apiQty - totalQty) < 0.0001 && Math.abs(apiAmount - totalAmount) < 0.0001;
  if (!ok) mismatches += 1;

  console.log(`${ok ? 'OK' : 'FAIL'} ${registrationId} @ ${month} (${sample.lineCount} lines)`);
  console.log(`  raw:  qty=${totalQty} amount=${totalAmount} price=${expectedPrice.toFixed(4)}`);
  console.log(`  api:  qty=${apiQty} amount=${apiAmount} price=${apiPrice.toFixed(4)} diff=${diff.toFixed(6)}`);
}

console.log(`\n${mismatches === 0 ? 'All samples passed.' : `${mismatches} mismatch(es).`}`);
await prisma.$disconnect();
process.exit(mismatches > 0 ? 1 : 0);
