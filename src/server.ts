import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import registrationsRouter from './api/routes/registrations';
import forecastRouter from './api/routes/forecast';
import cplRouter from './api/routes/cpl';
import priceManagementRouter from './api/routes/priceManagement';
import versionsRouter from './api/routes/versions';
import actualsRouter from './api/routes/actuals';
import inventoryRouter from './api/routes/inventory';
import currentForecastImportRouter from './api/routes/currentForecastImport';
import forecastImportRouter from './api/routes/forecastImport';
import syncRouter from './api/routes/sync';
import overplanRouter from './api/routes/overplan';
import forecastEmailRouter, { createEmployeeRouter } from './api/routes/forecastEmail';
import appAdminRouter from './api/routes/appAdmin';
import customColumnsRouter from './api/routes/customColumns';
import { startSnapshotScheduler } from './api/services/dataSnapshot';
import { startOverplanScheduler } from './api/services/overplanWarmup';
import { ensureHrEmployeeCache } from './api/services/employeeEmail';
import { ensureCustomerMasterCache } from './api/services/customerMaster';
import { ensureCplActualPrices } from './api/services/cplActualSync';
import { ensureRoleDefaults } from './api/services/appRoles';
import { createAuthRouter, getAppPath, normalizeBasePath, requireAuth } from './api/auth';
import { getAppConfigPublic } from './config/appMode';

const app = express();
const PORT = process.env.API_PORT || 3001;
const basePath = normalizeBasePath();
const distPath = path.resolve(process.cwd(), 'dist');

// Behind the reverse proxy at ugtweb.ube.co.th: honor X-Forwarded-Proto/Host
// so auth callback/redirect URLs use the real public host, not localhost.
app.set('trust proxy', true);

app.use(express.json({ limit: '5mb' }));

const apiRouter = express.Router();

app.get(`${basePath}/healthz`, (_req, res) => res.json({ ok: true }));
apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.get('/app-config', (_req, res) => res.json(getAppConfigPublic()));
apiRouter.use('/registrations', registrationsRouter);
apiRouter.use('/forecast', forecastRouter);
apiRouter.use('/cpl-prices', cplRouter);
apiRouter.use('/price-management', priceManagementRouter);
apiRouter.use('/versions', versionsRouter);
apiRouter.use('/actuals', actualsRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/import', currentForecastImportRouter);
apiRouter.use('/import', forecastImportRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/overplan', overplanRouter);
apiRouter.use('/forecast-email', forecastEmailRouter);
apiRouter.use('/admin', appAdminRouter);
apiRouter.use('/custom-columns', customColumnsRouter);
apiRouter.use('/employees', createEmployeeRouter());

app.use(`${basePath}/auth`, createAuthRouter());
app.get(`${basePath}/api/app-config`, (_req, res) => res.json(getAppConfigPublic()));
app.use(`${basePath}/api`, requireAuth, apiRouter);

if (process.env.NODE_ENV !== 'production') {
  app.use('/auth', createAuthRouter());
  app.get('/api/app-config', (_req, res) => res.json(getAppConfigPublic()));
  app.use('/api', requireAuth, apiRouter);
}

if (basePath) {
  app.use((req, res, next) => {
    // Prefer URL without trailing slash: /ugt-sales-forecast/nylon/ -> /ugt-sales-forecast/nylon
    if (req.path !== `${basePath}/`) return next();
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    return res.redirect(308, `${basePath}${query}`);
  });
}
app.use(basePath || '/', express.static(distPath));
app.get('/', (_req, res) => res.redirect(getAppPath()));
app.get([basePath, `${basePath}/*`], (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  const publicUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  const shownUrl = publicUrl
    ? `${publicUrl}${basePath || ''}`
    : `http://localhost:${PORT}${basePath || ''}`;
  console.log(`[server] listening on ${shownUrl} (port ${PORT})`);
  startSnapshotScheduler();
  startOverplanScheduler();
  ensureHrEmployeeCache()
    .then(() => ensureCustomerMasterCache())
    .then(() => ensureCplActualPrices())
    .then(() => ensureRoleDefaults())
    .catch(() => undefined);
});
