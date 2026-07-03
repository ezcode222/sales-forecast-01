import express, { Router } from 'express';
import {
  handleForecastConfirm,
  handleForecastPreview,
} from '../services/forecastImport/handlers';

const router = Router();

/**
 * POST /api/import/forecast/preview
 *
 * Unified preview for legacy (Current Forecast) and versioned Excel imports.
 */
router.post(
  '/forecast/preview',
  express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
    limit: '25mb',
  }),
  handleForecastPreview
);

/**
 * POST /api/import/forecast/confirm
 *
 * Legacy: { previewContractVersion: 8, records, stampPeriod }
 * Versioned: { previewContractVersion: 1, previewId, stampPeriod }
 */
router.post('/forecast/confirm', express.json({ limit: '5mb' }), handleForecastConfirm);

export default router;
