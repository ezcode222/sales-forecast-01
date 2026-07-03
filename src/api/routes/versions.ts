import { Router } from 'express';
import prisma from '../../db/prisma';

const router = Router();
const STANDARD_VERSION_KEYS: Record<string, number> = {
  'Current Forecast': 1,
  'BB FY26': 2,
  'SepF FY26': 3,
  'DecF FY26': 4,
};

async function nextForecastVersionKey() {
  const rows = await prisma.$queryRaw<Array<{ nextKey: unknown }>>`
    SELECT ISNULL(MAX([versionKey]), 0) + 1 AS nextKey
    FROM [dbo].[forecast_versions]
  `;
  return Number(rows[0]?.nextKey ?? 1);
}

// GET /api/versions — returns string[]
router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.forecastVersion.findMany({
      orderBy: { createdAt: 'asc' },
      select: { name: true },
    });
    res.json(rows.map((r) => r.name));
  } catch (error) {
    console.error('[versions] GET error:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// POST /api/versions  { name: string }
router.post('/', async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  const trimmedName = name.trim();
  try {
    await prisma.forecastVersion.upsert({
      where: { name: trimmedName },
      update: STANDARD_VERSION_KEYS[trimmedName] !== undefined
        ? { versionKey: STANDARD_VERSION_KEYS[trimmedName], isStandard: true }
        : {},
      create: {
        name: trimmedName,
        isStandard: STANDARD_VERSION_KEYS[trimmedName] !== undefined,
        versionKey: STANDARD_VERSION_KEYS[trimmedName] ?? await nextForecastVersionKey(),
      },
    });
    res.status(201).json({ ok: true, name: trimmedName });
  } catch (error) {
    console.error('[versions] POST error:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

export default router;
