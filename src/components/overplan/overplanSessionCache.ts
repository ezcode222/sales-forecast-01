import type { OverplanConfig, OverplanResultRow } from '../../lib/api';

export const OVERPLAN_SESSION_SCHEMA_VERSION = 2;

export type OverplanSessionSnapshot = {
  schemaVersion?: number;
  config: OverplanConfig;
  startMonth: string;
  endMonth: string;
  view: 'aggregate' | 'detail';
  breachPage: 'over' | 'under';
  summary: { overCount: number; underCount: number };
  generatedAt: string;
  displayRows: OverplanResultRow[];
  totalRows: number;
  hasMoreRows: boolean;
  page: number;
  savedAt: number;
};

const DEFAULT_COMPARE_LEFT = 'Actual';
const DEFAULT_COMPARE_RIGHT = 'Current Forecast';

let snapshot: OverplanSessionSnapshot | null = null;

export function normalizeOverplanConfig(config: Partial<OverplanConfig> & Pick<OverplanConfig, 'id'>): OverplanConfig {
  return {
    id: config.id,
    planVersionName: config.planVersionName ?? 'BB FY26',
    actualVsPlanEnabled: config.actualVsPlanEnabled ?? true,
    forecastVsPlanEnabled: config.forecastVsPlanEnabled ?? false,
    compareLeft: config.compareLeft?.trim() || DEFAULT_COMPARE_LEFT,
    compareRight: config.compareRight?.trim() || DEFAULT_COMPARE_RIGHT,
    aboveEnabled: config.aboveEnabled ?? true,
    belowEnabled: config.belowEnabled ?? true,
    aboveThresholdTon: config.aboveThresholdTon ?? null,
    aboveThresholdPercent: config.aboveThresholdPercent ?? null,
    belowThresholdTon: config.belowThresholdTon ?? null,
    belowThresholdPercent: config.belowThresholdPercent ?? null,
    updatedBy: config.updatedBy ?? 'system',
    updatedAt: config.updatedAt ?? new Date().toISOString(),
  };
}

export function normalizeOverplanResultRow(row: OverplanResultRow & {
  actualQty?: number;
  forecastQty?: number;
  diffActForecast?: number;
  pctActForecast?: number | null;
}): OverplanResultRow | null {
  if (typeof row.leftQty === 'number' && typeof row.rightQty === 'number') {
    return {
      ...row,
      leftQty: row.leftQty,
      rightQty: row.rightQty,
      diffQty: typeof row.diffQty === 'number'
        ? row.diffQty
        : row.leftQty - row.rightQty,
      pctVsRight: row.pctVsRight ?? null,
    };
  }

  if (typeof row.actualQty === 'number' && typeof row.forecastQty === 'number') {
    const leftQty = row.actualQty;
    const rightQty = row.forecastQty;
    return {
      materialCode: row.materialCode,
      materialDescription: row.materialDescription,
      plantCode: row.plantCode,
      period: row.period,
      leftQty,
      rightQty,
      diffQty: typeof row.diffActForecast === 'number' ? row.diffActForecast : leftQty - rightQty,
      pctVsRight: row.pctActForecast ?? null,
      status: row.status,
      breachReasons: row.breachReasons ?? [],
      ownerName: row.ownerName,
      registrationId: row.registrationId,
    };
  }

  return null;
}

function normalizeSnapshot(next: OverplanSessionSnapshot): OverplanSessionSnapshot | null {
  const displayRows = next.displayRows
    .map(row => normalizeOverplanResultRow(row as OverplanResultRow & {
      actualQty?: number;
      forecastQty?: number;
      diffActForecast?: number;
      pctActForecast?: number | null;
    }))
    .filter((row): row is OverplanResultRow => row !== null);

  if (next.displayRows.length > 0 && displayRows.length === 0) {
    return null;
  }

  return {
    ...next,
    schemaVersion: OVERPLAN_SESSION_SCHEMA_VERSION,
    config: normalizeOverplanConfig(next.config),
    displayRows,
  };
}

export function readOverplanSession(
  key: Pick<OverplanSessionSnapshot, 'startMonth' | 'endMonth' | 'view' | 'breachPage'>
): OverplanSessionSnapshot | null {
  if (!snapshot) return null;
  if (
    snapshot.startMonth !== key.startMonth
    || snapshot.endMonth !== key.endMonth
    || snapshot.view !== key.view
    || snapshot.breachPage !== key.breachPage
  ) {
    return null;
  }

  if ((snapshot.schemaVersion ?? 1) < OVERPLAN_SESSION_SCHEMA_VERSION) {
    const normalized = normalizeSnapshot(snapshot);
    if (!normalized) {
      snapshot = null;
      return null;
    }
    snapshot = normalized;
  }

  return snapshot;
}

export function writeOverplanSession(next: OverplanSessionSnapshot) {
  snapshot = normalizeSnapshot({
    ...next,
    schemaVersion: OVERPLAN_SESSION_SCHEMA_VERSION,
    config: normalizeOverplanConfig(next.config),
  });
}

export function clearOverplanSession() {
  snapshot = null;
}
