import { Router } from 'express';
import prisma from '../../db/prisma';

const router = Router();

// GET /api/cpl-prices?fy=2026  (FY runs Apr fy → Mar fy+1)
router.get('/', async (req, res) => {
  const { fy } = req.query as Record<string, string>;
  try {
    let rows;
    if (fy) {
      const year = Number(fy);
      const fyStart = `${year}-04`;
      const fyEnd   = `${year + 1}-03`;
      rows = await prisma.cplPrice.findMany({
        where: { month: { gte: fyStart, lte: fyEnd } },
        orderBy: { month: 'asc' },
      });
    } else {
      rows = await prisma.cplPrice.findMany({ orderBy: { month: 'asc' } });
    }
    res.json(rows.map((r) => ({ month: r.month, price: Number(r.price) })));
  } catch (error) {
    console.error('[cpl] GET error:', error);
    res.status(500).json({ error: 'Failed to fetch CPL prices' });
  }
});

// POST /api/cpl-prices  { month: "YYYY-MM", price: number }
router.post('/', async (req, res) => {
  const { month, price } = req.body as { month?: string; price?: unknown };
  if (!month || price === undefined) {
    return res.status(400).json({ error: 'month and price are required' });
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0) {
    return res.status(400).json({ error: 'price must be a non-negative number' });
  }
  try {
    await prisma.cplPrice.upsert({
      where: { month },
      update: {},
      create: { month, price: numPrice },
    });
    res.status(201).json({ ok: true, month, price: numPrice });
  } catch (error) {
    console.error('[cpl] POST error:', error);
    res.status(500).json({ error: 'Failed to create CPL price' });
  }
});

// PATCH /api/cpl-prices/:month  { price: number }
router.patch('/:month', async (req, res) => {
  const { month } = req.params;
  const { price } = req.body as { price?: unknown };
  if (price === undefined) {
    return res.status(400).json({ error: 'price is required' });
  }
  const numPrice = Number(price);
  if (!Number.isFinite(numPrice) || numPrice < 0) {
    return res.status(400).json({ error: 'price must be a non-negative number' });
  }
  try {
    const updated = await prisma.cplPrice.updateMany({
      where: { month },
      data: { price: numPrice },
    });
    if (updated.count === 0) {
      return res.status(404).json({ error: `No CPL price found for month ${month}` });
    }
    res.json({ ok: true, month, price: numPrice });
  } catch (error) {
    console.error('[cpl] PATCH error:', error);
    res.status(500).json({ error: 'Failed to update CPL price' });
  }
});

// DELETE /api/cpl-prices/:month
router.delete('/:month', async (req, res) => {
  const { month } = req.params;
  try {
    await prisma.cplPrice.deleteMany({ where: { month } });
    res.json({ ok: true });
  } catch (error) {
    console.error('[cpl] DELETE error:', error);
    res.status(500).json({ error: 'Failed to delete CPL price' });
  }
});

export default router;
