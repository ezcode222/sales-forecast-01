import prisma from '../src/db/prisma.ts';

const reg916 = await prisma.$queryRaw`
  SELECT CAST(ISNULL(NewKey, KeyforNoCRM) AS NVARCHAR(200)) AS id
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE KeyforNoCRM = N'10976/10976/80537/1104/400916/Off' AND MainRegist = 1
`;
const row916 = await prisma.forecastValue.findFirst({
  where: {
    registrationId: reg916[0].id,
    versionName: 'BB FY26',
    period: new Date('2026-04-01'),
  },
  select: { qtyFcst: true, priceFcst: true, amountFcst: true },
});

const qty = Number(row916?.qtyFcst ?? 0);
const price = Number(row916?.priceFcst ?? 0);
const amount = Number(row916?.amountFcst ?? 0);

console.log('400916 Apr-26 verification:', {
  qtyFcst: qty,
  priceFcst: price,
  amountFcst: amount,
  qtyTimesPrice: qty * price,
  amountStoredIndependently: amount !== qty * price || amount === 34500,
  pass: qty === 25 && price === 1380 && amount === 34500,
});

const reg212 = await prisma.$queryRaw`
  SELECT COUNT(*) AS c
  FROM dbo.VW_CRM_RegistrationAll_1
  WHERE KeyforNoCRM = N'10976/10976/80537/1104/400212/Off' AND MainRegist = 1
`;
console.log('400212 CRM registration exists:', Number(reg212[0]?.c ?? 0) > 0);
console.log('400212 cannot import until CRM Main Registration is created.');

// Find a row where amount != qty*price to prove independent storage
const mismatch = await prisma.$queryRaw`
  SELECT TOP 1
    fv.qtyFcst,
    fv.priceFcst,
    fv.amountFcst
  FROM dbo.forecast_values fv
  WHERE fv.versionName = N'BB FY26'
    AND fv.period = '2026-04-01'
    AND fv.amountFcst > 0
    AND ABS(fv.amountFcst - (fv.qtyFcst * fv.priceFcst)) > 0.01
`;
console.log('Sample independent amount row:', mismatch[0] ? {
  qty: Number(mismatch[0].qtyFcst),
  price: Number(mismatch[0].priceFcst),
  amount: Number(mismatch[0].amountFcst),
} : 'none found');

process.exit(0);
