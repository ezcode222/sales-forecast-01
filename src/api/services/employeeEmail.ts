import prisma from '../../db/prisma';

export const NYLON_COST_CENTER = 'UCHA Nylon Sales & Marketing';

/// When an owner has no HR email (or has left), route their notifications here.
export const OWNER_NOTIFY_FALLBACK = {
  email: 'taksaporn@ube.co.th',
  fullName: 'Taksaporn Poldongnok',
} as const;

export function isDefaultCcNotifyEmail(email: string) {
  return email.trim().toLowerCase() === OWNER_NOTIFY_FALLBACK.email;
}

export type OwnerNotifyRecipient = {
  email: string;
  displayName: string;
  routedToFallback: boolean;
  originalOwnerName: string;
};

export function resolveOwnerNotifyRecipient(
  ownerName: string,
  contact?: { email: string; fullName: string }
): OwnerNotifyRecipient {
  const trimmedOwner = ownerName.trim();
  if (contact?.email) {
    return {
      email: contact.email,
      displayName: contact.fullName || trimmedOwner,
      routedToFallback: false,
      originalOwnerName: trimmedOwner,
    };
  }
  return {
    email: OWNER_NOTIFY_FALLBACK.email,
    displayName: OWNER_NOTIFY_FALLBACK.fullName,
    routedToFallback: true,
    originalOwnerName: trimmedOwner,
  };
}

/// Fully-qualified HR view. Configurable because it lives on a linked server
/// (default points at the cross-server ICTPortal view).
const HR_EMPLOYEE_VIEW =
  process.env.HR_EMPLOYEE_VIEW?.trim() || 'thrygsd002.ICTPortal_PRD.dbo.vwHR_SC_Employee';

export type EmployeeContact = {
  empCode: string;
  fullNameEng: string;
  currentEmail: string;
  costCenterEng: string;
};

const ownerEmailCache = new Map<string, { email: string | null; fullName: string | null }>();

function normalizeOwnerKey(ownerName: string) {
  return ownerName.trim().toLowerCase();
}

async function lookupContactFromCacheTable(key: string) {
  const rows = await prisma.$queryRaw<Array<{
    currentEmail: string | null;
    fullNameEng: string | null;
  }>>`
    SELECT TOP 1 c.currentEmail, c.fullNameEng
    FROM dbo.hr_employee_cache c
    WHERE LOWER(LTRIM(RTRIM(c.fullNameEng))) = ${key}
       OR LOWER(LTRIM(RTRIM(c.adLoginName))) = ${key}
       OR LOWER(LTRIM(RTRIM(c.currentEmail))) = ${key}
  `;
  const row = rows[0];
  if (!row || !row.currentEmail?.trim()) return null;
  return {
    email: row.currentEmail.trim().toLowerCase(),
    fullName: row.fullNameEng?.trim() || null,
  };
}

async function lookupEmployeeContact(ownerName: string): Promise<{ email: string | null; fullName: string | null }> {
  const key = normalizeOwnerKey(ownerName);
  if (!key) return { email: null, fullName: null };
  if (ownerEmailCache.has(key)) return ownerEmailCache.get(key)!;

  try {
    const fromCache = await lookupContactFromCacheTable(key);
    if (fromCache) {
      const contact = { email: fromCache.email, fullName: fromCache.fullName ?? ownerName.trim() };
      ownerEmailCache.set(key, contact);
      return contact;
    }
  } catch (error) {
    console.warn('[employeeEmail] cache lookup unavailable:', error instanceof Error ? error.message : error);
  }

  try {
    const sql = `
      SELECT TOP (1)
        CAST(e.CurrentEmail AS NVARCHAR(320)) AS CurrentEmail,
        CAST(e.FullNameEng AS NVARCHAR(200)) AS FullNameEng
      FROM ${HR_EMPLOYEE_VIEW} e
      WHERE LOWER(LTRIM(RTRIM(e.FullNameEng))) = @P1
         OR LOWER(LTRIM(RTRIM(e.ADLoginName))) = @P2
         OR LOWER(LTRIM(RTRIM(e.CurrentEmail))) = @P3
         OR LOWER(LTRIM(RTRIM(e.DisplayName))) = @P4
    `;
    const rows = await prisma.$queryRawUnsafe<Array<{
      CurrentEmail: string | null;
      FullNameEng: string | null;
    }>>(sql, key, key, key, key);
    const contact = {
      email: rows[0]?.CurrentEmail?.trim().toLowerCase() ?? null,
      fullName: rows[0]?.FullNameEng?.trim() ?? ownerName.trim(),
    };
    ownerEmailCache.set(key, contact);
    return contact;
  } catch (error) {
    console.warn('[employeeEmail] HR lookup unavailable:', error instanceof Error ? error.message : error);
    const fallback = { email: null, fullName: ownerName.trim() || null };
    ownerEmailCache.set(key, fallback);
    return fallback;
  }
}


export async function resolveOwnerEmails(ownerNames: string[]) {
  const emails = new Set<string>();
  for (const ownerName of ownerNames) {
    const contact = await lookupEmployeeContact(ownerName);
    const recipient = resolveOwnerNotifyRecipient(
      ownerName,
      contact.email
        ? { email: contact.email, fullName: contact.fullName || ownerName.trim() }
        : undefined
    );
    emails.add(recipient.email);
  }
  return [...emails];
}

export async function resolveOwnerContacts(ownerNames: string[]) {
  const contacts = new Map<string, { email: string; fullName: string }>();
  for (const ownerName of ownerNames) {
    const key = normalizeOwnerKey(ownerName);
    if (!key || contacts.has(key)) continue;
    const contact = await lookupEmployeeContact(ownerName);
    if (contact.email) {
      contacts.set(key, {
        email: contact.email,
        fullName: contact.fullName || ownerName.trim(),
      });
    }
  }
  return contacts;
}

export function clearOwnerEmailCache() {
  ownerEmailCache.clear();
}

export async function queryEmployeeByLogin(login: string) {
  const normalized = login.trim();
  if (!normalized) return null;
  const sql = `
    SELECT TOP (1)
      CAST(e.ADLoginName AS NVARCHAR(200)) AS adLoginName,
      CAST(e.FullNameEng AS NVARCHAR(200)) AS fullNameEng,
      CAST(e.CurrentEmail AS NVARCHAR(320)) AS currentEmail
    FROM ${HR_EMPLOYEE_VIEW} e
    WHERE e.ADLoginName = @P1
  `;
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, normalized);
  return rows[0] ?? null;
}

function normalizeContact(row: {
  empCode: unknown;
  fullNameEng: unknown;
  currentEmail: unknown;
  costCenterEng: unknown;
}): EmployeeContact | null {
  const empCode = String(row.empCode ?? '').trim();
  if (!empCode) return null;
  return {
    empCode,
    fullNameEng: String(row.fullNameEng ?? '').trim(),
    currentEmail: String(row.currentEmail ?? '').trim(),
    costCenterEng: String(row.costCenterEng ?? '').trim(),
  };
}

let hrSyncPromise: Promise<{ synced: number }> | null = null;

/// Refresh the local hr_employee_cache snapshot from dbo.vwHR_SC_Employee.
export async function syncHrEmployeeCache(): Promise<{ synced: number }> {
  if (hrSyncPromise) return hrSyncPromise;

  hrSyncPromise = (async () => {
    const sql = `
      SELECT
        CAST(e.EmpCode AS NVARCHAR(50)) AS empCode,
        CAST(e.FullNameEng AS NVARCHAR(200)) AS fullNameEng,
        CAST(e.CurrentEmail AS NVARCHAR(320)) AS currentEmail,
        CAST(e.CostCenterEng AS NVARCHAR(300)) AS costCenterEng,
        CAST(e.ADLoginName AS NVARCHAR(200)) AS adLoginName
      FROM ${HR_EMPLOYEE_VIEW} e
      WHERE e.EmpCode IS NOT NULL AND LTRIM(RTRIM(e.EmpCode)) <> ''
    `;
    const rows = await prisma.$queryRawUnsafe<Array<{
      empCode: string | null;
      fullNameEng: string | null;
      currentEmail: string | null;
      costCenterEng: string | null;
      adLoginName: string | null;
    }>>(sql);

    const byEmpCode = new Map<string, {
      empCode: string;
      fullNameEng: string;
      currentEmail: string;
      costCenterEng: string;
      adLoginName: string;
    }>();
    for (const row of rows) {
      const empCode = String(row.empCode ?? '').trim();
      if (!empCode) continue;
      byEmpCode.set(empCode, {
        empCode,
        fullNameEng: String(row.fullNameEng ?? '').trim(),
        currentEmail: String(row.currentEmail ?? '').trim().toLowerCase(),
        costCenterEng: String(row.costCenterEng ?? '').trim(),
        adLoginName: String(row.adLoginName ?? '').trim(),
      });
    }

    const records = [...byEmpCode.values()];
    const CHUNK = 500;
    await prisma.$transaction(async tx => {
      await tx.hrEmployeeCache.deleteMany();
      for (let i = 0; i < records.length; i += CHUNK) {
        await tx.hrEmployeeCache.createMany({ data: records.slice(i, i + CHUNK) });
      }
    });

    ownerEmailCache.clear();
    return { synced: records.length };
  })();

  try {
    return await hrSyncPromise;
  } finally {
    hrSyncPromise = null;
  }
}

export async function getHrCacheCount(): Promise<number> {
  return prisma.hrEmployeeCache.count();
}

/// Ensure the cache has data; sync once if empty. Never throws.
export async function ensureHrEmployeeCache(): Promise<void> {
  try {
    const count = await prisma.hrEmployeeCache.count();
    if (count === 0) await syncHrEmployeeCache();
  } catch (error) {
    console.warn('[employeeEmail] ensureHrEmployeeCache failed:', error instanceof Error ? error.message : error);
  }
}

export async function searchEmployees(query: string, limit = 20): Promise<EmployeeContact[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const like = `%${q.toLowerCase()}%`;
  const prefix = `${q.toLowerCase()}%`;
  const top = Math.min(Math.max(1, limit), 50);

  const sql = `
    SELECT TOP (${top})
      c.empCode, c.fullNameEng, c.currentEmail, c.costCenterEng
    FROM dbo.hr_employee_cache c
    WHERE LOWER(c.fullNameEng) LIKE @P1
       OR LOWER(c.empCode) LIKE @P2
    ORDER BY
      CASE WHEN LOWER(c.empCode) LIKE @P3 THEN 0 ELSE 1 END,
      c.fullNameEng ASC
  `;
  const rows = await prisma.$queryRawUnsafe<Array<{
    empCode: string;
    fullNameEng: string;
    currentEmail: string;
    costCenterEng: string;
  }>>(sql, like, prefix, prefix);

  return rows
    .map(normalizeContact)
    .filter((row): row is EmployeeContact => row !== null);
}

export async function getNylonDefaultEmployees(): Promise<EmployeeContact[]> {
  const rows = await prisma.hrEmployeeCache.findMany({
    where: { costCenterEng: NYLON_COST_CENTER },
    orderBy: { fullNameEng: 'asc' },
    select: { empCode: true, fullNameEng: true, currentEmail: true, costCenterEng: true },
  });
  return rows;
}

export async function getEmployeesByEmpCodes(empCodes: string[]): Promise<Map<string, EmployeeContact>> {
  const unique = [...new Set(empCodes.map(code => code.trim()).filter(Boolean))];
  const result = new Map<string, EmployeeContact>();
  if (unique.length === 0) return result;
  const rows = await prisma.hrEmployeeCache.findMany({
    where: { empCode: { in: unique } },
    select: { empCode: true, fullNameEng: true, currentEmail: true, costCenterEng: true },
  });
  for (const row of rows) result.set(row.empCode, row);
  return result;
}