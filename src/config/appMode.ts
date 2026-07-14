import { Prisma } from '@prisma/client';

export type AppMode = 'nyl' | 'ufa';

export const UFA_PLANT_CODES = ['1504', '1505', '1506'] as const;

const DEFAULT_ALLOWED_BY_MODE: Record<AppMode, string[]> = {
  nyl: ['Polymer', 'Composite'],
  ufa: ['UFA'],
};

function parseMode(value: string | undefined): AppMode {
  const normalized = String(value ?? 'nyl').trim().toLowerCase();
  return normalized === 'ufa' ? 'ufa' : 'nyl';
}

export function getAppMode(): AppMode {
  return parseMode(process.env.APP_MODE);
}

export function getAllowedBusinessUnits(): string[] {
  const raw = process.env.ALLOWED_BUSINESS_UNITS?.trim();
  if (raw) {
    const parsed = raw.split(',').map(part => part.trim()).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }
  return [...DEFAULT_ALLOWED_BY_MODE[getAppMode()]];
}

export function getAppDisplayName(): string {
  const fromEnv = process.env.APP_DISPLAY_NAME?.trim();
  if (fromEnv) return fromEnv;
  return getAppMode() === 'ufa' ? 'UFA Sales Forecast' : 'Nylon Sale Forecast';
}

export function getAppConfigPublic() {
  return {
    appMode: getAppMode(),
    allowedBusinessUnits: getAllowedBusinessUnits(),
    displayName: getAppDisplayName(),
    basePath: process.env.APP_BASE_PATH ?? '/ugt-sales-forecast/nylon',
  };
}

export function isUfaPlantCode(value: unknown) {
  const plant = String(value ?? '').trim();
  return (UFA_PLANT_CODES as readonly string[]).includes(plant);
}

export function isUfaRegistration(
  businessUnit: string | null | undefined,
  plantCode: string | null | undefined
) {
  const bu = String(businessUnit ?? '').trim().toUpperCase();
  return bu === 'UFA' || isUfaPlantCode(plantCode);
}

/** Whether a registration belongs in the current deploy mode (data is never deleted). */
export function isRegistrationInAppMode(
  businessUnit: string | null | undefined,
  plantCode: string | null | undefined
) {
  const isUfa = isUfaRegistration(businessUnit, plantCode);
  return getAppMode() === 'ufa' ? isUfa : !isUfa;
}

export function isBusinessUnitAllowed(businessUnit: string | null | undefined) {
  const value = String(businessUnit ?? '').trim().toLowerCase();
  if (!value) return false;
  return getAllowedBusinessUnits().some(allowed => allowed.toLowerCase() === value);
}

export function clampBusinessUnitFilterValues(values: string[]) {
  const allowed = new Set(getAllowedBusinessUnits().map(item => item.toLowerCase()));
  return values.filter(value => allowed.has(value.trim().toLowerCase()));
}

/**
 * Always-on scope so NYL never lists UFA rows and UFA never lists Polymer/Composite.
 * Does not delete data — only filters visibility per deploy.
 */
export function buildAppModeRegistrationScopeSql(alias = 'r') {
  const businessUnit = Prisma.raw(`${alias}.BusinessUnit`);
  const plantCode = Prisma.raw(`${alias}.PlantCode`);
  const ufaPlants = Prisma.join(UFA_PLANT_CODES.map(code => Prisma.sql`${code}`));

  if (getAppMode() === 'ufa') {
    return Prisma.sql`
      AND (
        UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), ${businessUnit}), N'')))) = N'UFA'
        OR LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(100), ${plantCode}), N''))) IN (${ufaPlants})
      )
    `;
  }

  return Prisma.sql`
    AND NOT (
      UPPER(LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(50), ${businessUnit}), N'')))) = N'UFA'
      OR LTRIM(RTRIM(ISNULL(CONVERT(NVARCHAR(100), ${plantCode}), N''))) IN (${ufaPlants})
    )
  `;
}

export function getPreferredLegacySheetNames() {
  return getAppMode() === 'ufa' ? ['UFA', 'Sheet1'] : ['Polymer', 'Sheet1'];
}

export function getPreferredVersionedSheetNames() {
  return getAppMode() === 'ufa' ? ['UFA'] : ['Polymer', 'CP'];
}

/** Excel key plant segment is outside this deploy mode (skip import; do not delete). */
export function isOutOfAppModeImportKey(excelKey: string, businessUnit?: string | null) {
  const parts = String(excelKey ?? '').split('/').map(part => part.trim());
  // 7-part NewKey: Topic/SoldTo/ShipTo/EndUser/Plant/Material/OnOff — plant at index 4
  // 6-part Key for no regist: plant at index 3
  const plant = parts.length === 7 ? (parts[4] ?? '') : (parts[3] ?? '');
  return !isRegistrationInAppMode(businessUnit, plant);
}
