import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import registrationsRouter from './api/routes/registrations';
import forecastRouter from './api/routes/forecast';
import cplRouter from './api/routes/cpl';
import versionsRouter from './api/routes/versions';
import actualsRouter from './api/routes/actuals';
import inventoryRouter from './api/routes/inventory';
import currentForecastImportRouter from './api/routes/currentForecastImport';
import syncRouter from './api/routes/sync';
import { startSnapshotScheduler } from './api/services/dataSnapshot';
import { createAuthRouter, getAppPath, normalizeBasePath, requireAuth } from './api/auth';

const app = express();
const PORT = process.env.API_PORT || 3001;
const basePath = normalizeBasePath();
const distPath = path.resolve(process.cwd(), 'dist');

app.use(express.json({ limit: '5mb' }));

const apiRouter = express.Router();

app.get(`${basePath}/healthz`, (_req, res) => res.json({ ok: true }));
apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.use('/registrations', registrationsRouter);
apiRouter.use('/forecast', forecastRouter);
apiRouter.use('/cpl-prices', cplRouter);
apiRouter.use('/versions', versionsRouter);
apiRouter.use('/actuals', actualsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/import', currentForecastImportRouter);
apiRouter.use('/sync', syncRouter);

app.use(`${basePath}/auth`, createAuthRouter());
app.use(`${basePath}/api`, requireAuth, apiRouter);

if (process.env.NODE_ENV !== 'production') {
  app.use('/auth', createAuthRouter());
  app.use('/api', requireAuth, apiRouter);
}

if (basePath) {
  app.use((req, res, next) => {
    if (req.path !== basePath) return next();
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    return res.redirect(308, `${getAppPath()}${query}`);
  });
}
app.use(basePath || '/', express.static(distPath));
app.get('/', (_req, res) => res.redirect(getAppPath()));
app.get(`${basePath}/*`, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}${basePath || ''}`);
  startSnapshotScheduler();
});
