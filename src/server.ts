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
import { appModeContext, sendAppConfig } from './api/middleware/appModeContext';
import { DEFAULT_APP_BASE_PATH } from './config/appMode';

const app = express();
const PORT = process.env.API_PORT || 3001;
const basePath = normalizeBasePath(process.env.APP_BASE_PATH ?? DEFAULT_APP_BASE_PATH);
const distPath = path.resolve(process.cwd(), 'dist');

// Behind the reverse proxy at ugtweb.ube.co.th: honor X-Forwarded-Proto/Host
// so auth callback/redirect URLs use the real public host, not localhost.
app.set('trust proxy', true);

// Collapse accidental `//` from reverse proxies / mis-joined base paths
// (Express does not match `/ugt-sales-forecast//api/...` to `/ugt-sales-forecast/api/...`).
app.use((req, _res, next) => {
  if (req.url.includes('//')) {
    const qIndex = req.url.indexOf('?');
    const pathname = qIndex >= 0 ? req.url.slice(0, qIndex) : req.url;
    const query = qIndex >= 0 ? req.url.slice(qIndex) : '';
    const normalized = pathname.replace(/\/{2,}/g, '/');
    if (normalized !== pathname) req.url = `${normalized}${query}`;
  }
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(appModeContext);

const apiRouter = express.Router();

app.get(`${basePath}/healthz`, (_req, res) => res.json({ ok: true }));
apiRouter.get('/health', (_req, res) => res.json({ ok: true }));
apiRouter.get('/app-config', sendAppConfig);
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
app.get(`${basePath}/api/app-config`, sendAppConfig);
app.use(`${basePath}/api`, requireAuth, apiRouter);

if (process.env.NODE_ENV !== 'production') {
  app.use('/auth', createAuthRouter());
  app.get('/api/app-config', sendAppConfig);
  app.use('/api', requireAuth, apiRouter);
}

if (basePath) {
  app.use((req, res, next) => {
    // Prefer URL without trailing slash: /ugt-sales-forecast/ -> /ugt-sales-forecast
    if (req.path !== `${basePath}/`) return next();
    const queryIndex = req.originalUrl.indexOf('?');
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
    return res.redirect(308, `${basePath}${query}`);
  });
}
app.use(basePath || '/', express.static(distPath));
app.get('/', (req, res) => res.redirect(getAppPath(req)));
app.get([basePath, `${basePath}/*`], (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  const publicUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');
  const shownUrl = publicUrl
    ? `${publicUrl}${basePath || ''}`
    : `http://localhost:${PORT}${basePath || ''}`;
  console.log(`[server] listening on ${shownUrl}?mode=nylon|ufa (port ${PORT})`);
  startSnapshotScheduler();
  startOverplanScheduler();
  ensureHrEmployeeCache()
    .then(() => ensureCustomerMasterCache())
    .then(() => ensureCplActualPrices())
    .then(() => ensureRoleDefaults())
    .catch(() => undefined);
});
