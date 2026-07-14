import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const envPath = path.resolve(process.argv[2] || '.env');

if (!fs.existsSync(envPath)) {
  console.error(`[deploy-env] Missing environment file: ${envPath}`);
  process.exit(1);
}

const env = dotenv.parse(fs.readFileSync(envPath));
const required = [
  'DATABASE_URL',
  'APP_BASE_PATH',
  'APP_BASE_URL',
  'DEV_AUTH_BYPASS',
  'SESSION_SECRET',
  'KEYCLOAK_ISSUER',
  'KEYCLOAK_CLIENT_ID',
];
const missing = required.filter(key => !env[key]?.trim());

if (missing.length > 0) {
  console.error(`[deploy-env] Missing required variables: ${missing.join(', ')}`);
  process.exit(1);
}

const errors = [];
if (!/^\/ugt-sales-forecast\/(nylon|ufa)$/.test(env.APP_BASE_PATH)) {
  errors.push('APP_BASE_PATH must be /ugt-sales-forecast/nylon or /ugt-sales-forecast/ufa');
}
if (env.APP_BASE_URL !== 'https://ugtweb.ube.co.th') {
  errors.push('APP_BASE_URL must be https://ugtweb.ube.co.th');
}
if (env.DEV_AUTH_BYPASS !== 'false') {
  errors.push('DEV_AUTH_BYPASS must be false in production');
}
if (env.SESSION_SECRET.length < 32) {
  errors.push('SESSION_SECRET must contain at least 32 characters');
}
if (/replace-with|your[_-]?password/i.test(env.SESSION_SECRET)) {
  errors.push('SESSION_SECRET still contains a placeholder value');
}
if (env.KEYCLOAK_CLIENT_ID !== 'ugt-sales-forecast') {
  errors.push('KEYCLOAK_CLIENT_ID must be ugt-sales-forecast');
}

for (const key of ['APP_BASE_URL', 'KEYCLOAK_ISSUER']) {
  try {
    const url = new URL(env[key]);
    if (url.protocol !== 'https:') errors.push(`${key} must use https in production`);
  } catch {
    errors.push(`${key} must be a valid absolute URL`);
  }
}

if (!env.DATABASE_URL.startsWith('sqlserver://')) {
  errors.push('DATABASE_URL must be a Prisma SQL Server connection string');
}
if (/YOUR_PASSWORD|DB_NAME|<[^>]+>/i.test(env.DATABASE_URL)) {
  errors.push('DATABASE_URL still contains a placeholder value');
}

if (errors.length > 0) {
  errors.forEach(error => console.error(`[deploy-env] ${error}`));
  process.exit(1);
}

console.log('[deploy-env] Production environment validation passed.');
