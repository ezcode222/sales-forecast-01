import { Router } from 'express';
import {
  getSnapshotStatus,
  triggerSnapshotRefresh,
} from '../services/dataSnapshot';
import {
  getCustomerMasterCacheCount,
  syncCustomerMasterCache,
  CUSTOMER_MASTER_VIEW,
} from '../services/customerMaster';
import {
  ACTUAL_SALES_VIEW,
  getCplActualPriceCount,
  syncCplActualPrices,
} from '../services/cplActualSync';

const router = Router();

router.get('/status', async (_req, res) => {
  try {
    res.json(await getSnapshotStatus());
  } catch (error) {
    console.error('[sync] status error:', error);
    res.status(500).json({ error: 'Failed to read data sync status' });
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    res.json(await triggerSnapshotRefresh());
  } catch (error) {
    console.error('[sync] refresh error:', error);
    res.status(502).json({
      error: 'Source refresh failed. The latest local data is still available.',
    });
  }
});

router.get('/customer-master/status', async (_req, res) => {
  try {
    const count = await getCustomerMasterCacheCount();
    res.json({ view: CUSTOMER_MASTER_VIEW, cachedRows: count });
  } catch (error) {
    console.error('[sync] customer-master status error:', error);
    res.status(500).json({ error: 'Failed to read customer master cache status' });
  }
});

router.post('/customer-master/sync', async (_req, res) => {
  try {
    const result = await syncCustomerMasterCache();
    if (!result.ok) {
      return res.status(502).json({
        error: result.error ?? 'Customer master sync failed',
        view: CUSTOMER_MASTER_VIEW,
        synced: 0,
      });
    }
    res.json({ ok: true, view: CUSTOMER_MASTER_VIEW, synced: result.synced });
  } catch (error) {
    console.error('[sync] customer-master sync error:', error);
    res.status(500).json({ error: 'Failed to sync customer master cache' });
  }
});

router.get('/cpl-actual/status', async (_req, res) => {
  try {
    const count = await getCplActualPriceCount();
    res.json({ source: ACTUAL_SALES_VIEW, actualRows: count });
  } catch (error) {
    console.error('[sync] cpl-actual status error:', error);
    res.status(500).json({ error: 'Failed to read CPL Actual status' });
  }
});

router.post('/cpl-actual/sync', async (_req, res) => {
  try {
    const result = await syncCplActualPrices();
    if (!result.ok) {
      return res.status(502).json({
        error: result.error ?? 'CPL Actual sync failed',
        source: result.source,
        synced: 0,
      });
    }
    res.json({ ok: true, source: result.source, synced: result.synced });
  } catch (error) {
    console.error('[sync] cpl-actual sync error:', error);
    res.status(500).json({ error: 'Failed to sync CPL Actual prices' });
  }
});

export default router;
