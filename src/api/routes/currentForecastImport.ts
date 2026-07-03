import express, { Router } from 'express';
import {
  handleForecastConfirm,
  handleForecastPreview,
} from '../services/forecastImport/handlers';

const router = Router();

/** @deprecated Use /api/import/forecast/preview — kept for backward compatibility */
router.post(
  '/current-forecast/preview',
  express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ],
    limit: '25mb',
  }),
  handleForecastPreview
);

/** @deprecated Use /api/import/forecast/confirm — kept for backward compatibility */
router.post('/current-forecast/confirm', express.json({ limit: '5mb' }), handleForecastConfirm);

export default router;
