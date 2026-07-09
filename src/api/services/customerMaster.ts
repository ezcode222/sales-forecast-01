import prisma from '../../db/prisma';

/// Fully-qualified SAP customer master view (linked server).
export const CUSTOMER_MASTER_VIEW =
  process.env.CUSTOMER_MASTER_VIEW?.trim()
  || 'thrygsd002.SAPStaging_Live.dbo.VW_Customer_master';

let customerSyncPromise: Promise<CustomerMasterSyncResult> | null = null;

export type CustomerMasterSyncResult = {
  ok: boolean;
  synced: number;
  error?: string;
};

function normalizeCode(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeName(value: unknown) {
  return String(value ?? '').trim();
}

/// Refresh local customer_master_cache from VW_Customer_master.
export async function syncCustomerMasterCache(): Promise<CustomerMasterSyncResult> {
  if (customerSyncPromise !== null) return customerSyncPromise;

  customerSyncPromise = (async () => {
    try {
      const sql = `
        SELECT
          CAST(c.[Cust_code] AS NVARCHAR(50)) AS custCode,
          CAST(c.[Customer name] AS NVARCHAR(500)) AS customerName
        FROM ${CUSTOMER_MASTER_VIEW} c
        WHERE c.[Cust_code] IS NOT NULL AND LTRIM(RTRIM(CAST(c.[Cust_code] AS NVARCHAR(50)))) <> ''
      `;
      const rows = await prisma.$queryRawUnsafe<Array<{
        custCode: string | null;
        customerName: string | null;
      }>>(sql);

      const byCode = new Map<string, { custCode: string; customerName: string }>();
      for (const row of rows) {
        const custCode = normalizeCode(row.custCode);
        if (!custCode) continue;
        byCode.set(custCode, {
          custCode,
          customerName: normalizeName(row.customerName),
        });
      }

      const records = [...byCode.values()];
      const CHUNK = 500;
      await prisma.$transaction(async tx => {
        await tx.customerMasterCache.deleteMany();
        for (let i = 0; i < records.length; i += CHUNK) {
          await tx.customerMasterCache.createMany({ data: records.slice(i, i + CHUNK) });
        }
      });

      return { ok: true, synced: records.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, synced: 0, error: message };
    }
  })();

  try {
    return await customerSyncPromise;
  } finally {
    customerSyncPromise = null;
  }
}

export async function getCustomerMasterCacheCount(): Promise<number> {
  return prisma.customerMasterCache.count();
}

/// Ensure cache has data; sync once if empty. Never throws.
export async function ensureCustomerMasterCache(): Promise<CustomerMasterSyncResult | null> {
  try {
    const count = await prisma.customerMasterCache.count();
    if (count > 0) return { ok: true, synced: count };
    return await syncCustomerMasterCache();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[customerMaster] ensureCustomerMasterCache failed:', message);
    return { ok: false, synced: 0, error: message };
  }
}

export async function lookupCustomerNames(codes: Iterable<string>): Promise<Map<string, string>> {
  const uniqueCodes = [...new Set(
    [...codes].map(code => normalizeCode(code)).filter(code => code && code !== '0')
  )];
  if (uniqueCodes.length === 0) return new Map();

  const rows = await prisma.customerMasterCache.findMany({
    where: { custCode: { in: uniqueCodes } },
    select: { custCode: true, customerName: true },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    const name = normalizeName(row.customerName);
    if (name) map.set(row.custCode, name);
  }
  return map;
}

export async function lookupCustomerName(code: string): Promise<string | null> {
  const normalized = normalizeCode(code);
  if (!normalized || normalized === '0') return null;
  const row = await prisma.customerMasterCache.findUnique({
    where: { custCode: normalized },
    select: { customerName: true },
  });
  const name = normalizeName(row?.customerName);
  return name || null;
}

export async function lookupCustomerNamesRaw(codes: string[]): Promise<Map<string, string>> {
  const uniqueCodes = [...new Set(codes.map(normalizeCode).filter(code => code && code !== '0'))];
  if (uniqueCodes.length === 0) return new Map();

  const keysJson = JSON.stringify(uniqueCodes);
  const rows = await prisma.$queryRaw<Array<{ custCode: string; customerName: string }>>`
    WITH requested AS (
      SELECT CAST([value] AS NVARCHAR(50)) AS custCode
      FROM OPENJSON(${keysJson})
    )
    SELECT c.custCode, c.customerName
    FROM dbo.customer_master_cache c
    INNER JOIN requested r ON r.custCode = c.custCode
  `;

  const map = new Map<string, string>();
  for (const row of rows) {
    const name = normalizeName(row.customerName);
    if (name) map.set(normalizeCode(row.custCode), name);
  }
  return map;
}
