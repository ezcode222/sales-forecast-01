import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import prisma from '../../db/prisma';
import {
  ensureHrEmployeeCache,
  getNylonDefaultEmployees,
  isDefaultCcNotifyEmail,
  resolveOwnerContacts,
  resolveOwnerNotifyRecipient,
  searchEmployees,
  syncHrEmployeeCache,
} from '../services/employeeEmail';
import { requireManageEmail } from '../services/appRoles';

const router = Router();

type CcRecipientDto = {
  id: string;
  empCode: string;
  fullNameEng: string;
  currentEmail: string;
  notifyEnabled: boolean;
  source: string;
  sortOrder: number;
};

function serializeCc(row: {
  id: string;
  empCode: string;
  fullNameEng: string;
  currentEmail: string;
  notifyEnabled: boolean;
  source: string;
  sortOrder: number;
}): CcRecipientDto {
  return {
    id: row.id,
    empCode: row.empCode,
    fullNameEng: row.fullNameEng,
    currentEmail: row.currentEmail,
    notifyEnabled: row.notifyEnabled,
    source: row.source,
    sortOrder: row.sortOrder,
  };
}

/// Seed the CC list once from the nylon cost-center default if it is empty.
async function seedNylonDefaultsIfEmpty() {
  const count = await prisma.forecastCcRecipient.count();
  if (count > 0) return;

  await ensureHrEmployeeCache();
  const defaults = await getNylonDefaultEmployees();
  if (defaults.length === 0) return;

  await prisma.forecastCcRecipient.createMany({
    data: defaults.map((employee, index) => ({
      id: randomUUID(),
      empCode: employee.empCode,
      fullNameEng: employee.fullNameEng,
      currentEmail: employee.currentEmail.toLowerCase(),
      notifyEnabled: isDefaultCcNotifyEmail(employee.currentEmail),
      source: 'nylon_default',
      sortOrder: index,
    })),
  });
}

router.get('/cc-recipients', requireManageEmail, async (_req, res) => {
  try {
    await seedNylonDefaultsIfEmpty();
    const rows = await prisma.forecastCcRecipient.findMany({
      orderBy: [{ sortOrder: 'asc' }, { fullNameEng: 'asc' }],
    });
    res.json(rows.map(serializeCc));
  } catch (error) {
    console.error('[forecast-email] get cc-recipients error:', error);
    res.status(500).json({ error: 'Failed to load CC recipients' });
  }
});

router.put('/cc-recipients', requireManageEmail, async (req, res) => {
  try {
    const body = req.body as { recipients?: unknown };
    if (!Array.isArray(body.recipients)) {
      return res.status(400).json({ error: 'recipients array is required' });
    }

    const seen = new Set<string>();
    const normalized = body.recipients
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object')
      .map((value, index) => {
        const empCode = String(value.empCode ?? '').trim();
        if (!empCode || seen.has(empCode)) return null;
        seen.add(empCode);
        const source = String(value.source ?? 'manual').trim() || 'manual';
        return {
          id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : randomUUID(),
          empCode,
          fullNameEng: String(value.fullNameEng ?? '').trim(),
          currentEmail: String(value.currentEmail ?? '').trim().toLowerCase(),
          notifyEnabled: value.notifyEnabled === true,
          source,
          sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    await prisma.$transaction([
      prisma.forecastCcRecipient.deleteMany(),
      prisma.forecastCcRecipient.createMany({ data: normalized }),
    ]);

    const rows = await prisma.forecastCcRecipient.findMany({
      orderBy: [{ sortOrder: 'asc' }, { fullNameEng: 'asc' }],
    });
    res.json(rows.map(serializeCc));
  } catch (error) {
    console.error('[forecast-email] put cc-recipients error:', error);
    res.status(500).json({ error: 'Failed to save CC recipients' });
  }
});

/// Resolve HR contacts (empCode + email) for the given owner display names.
router.post('/resolve-owners', requireManageEmail, async (req, res) => {
  try {
    const body = req.body as { ownerNames?: unknown };
    const ownerNames = Array.isArray(body.ownerNames)
      ? [...new Set(body.ownerNames.map(name => String(name ?? '').trim()).filter(Boolean))]
      : [];

    if (ownerNames.length === 0) {
      return res.json({ owners: [] });
    }

    await ensureHrEmployeeCache();
    const contacts = await resolveOwnerContacts(ownerNames);

    const owners = ownerNames.map(ownerName => {
      const contact = contacts.get(ownerName.trim().toLowerCase());
      const recipient = resolveOwnerNotifyRecipient(
        ownerName,
        contact ? { email: contact.email, fullName: contact.fullName } : undefined
      );
      return {
        ownerName,
        fullNameEng: contact?.fullName ?? ownerName,
        currentEmail: recipient.email,
        hasEmail: Boolean(contact?.email),
        routedToFallback: recipient.routedToFallback,
        notifyDisplayName: recipient.displayName,
      };
    });

    res.json({ owners });
  } catch (error) {
    console.error('[forecast-email] resolve-owners error:', error);
    res.status(500).json({ error: 'Failed to resolve owner contacts' });
  }
});

export default router;

export function createEmployeeRouter() {
  const employeeRouter = Router();

  employeeRouter.get('/search', async (req, res) => {
    try {
      const q = String(req.query.q ?? '').trim();
      if (q.length < 2) return res.json({ results: [] });
      await ensureHrEmployeeCache();
      const results = await searchEmployees(q, 20);
      res.json({ results });
    } catch (error) {
      console.error('[employees] search error:', error);
      res.status(500).json({ error: 'Failed to search employees' });
    }
  });

  employeeRouter.post('/sync', async (_req, res) => {
    try {
      const result = await syncHrEmployeeCache();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[employees] sync error:', error);
      res.status(500).json({ error: 'Failed to sync employee cache' });
    }
  });

  return employeeRouter;
}
