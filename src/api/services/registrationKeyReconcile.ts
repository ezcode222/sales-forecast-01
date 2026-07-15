import prisma from '../../db/prisma';

/**
 * Re-point forecast rows whose registration key no longer exists in
 * DimRegistration (e.g. CRM renamed the topic or moved MainRegist to another
 * row). Matching uses KeyforNoCRM — the last 6 segments of the NewKey
 * (SoldTo/ShipTo/EndUser/Plant/Material/OnOff) — which survives topic renames.
 * Keeps FactForecast ↔ DimRegistration joins (Power BI) consistent.
 */

const KEY_SEGMENT_COUNT = 6;

function keyForNoCrmFromRegistrationId(registrationId: string): string | null {
  const parts = registrationId.split('/');
  // Need at least a topic segment plus the 6 key segments.
  if (parts.length < KEY_SEGMENT_COUNT + 1) return null;
  const key = parts.slice(-KEY_SEGMENT_COUNT);
  if (key.some(segment => segment.trim() === '')) return null;
  return key.join('/');
}

export type ReconcileResult = {
  orphans: number;
  remapped: Array<{ from: string; to: string }>;
  skipped: Array<{ registrationId: string; reason: string }>;
};

export async function reconcileForecastRegistrationKeys(): Promise<ReconcileResult> {
  // Forecast ids with no matching DimRegistration source row.
  const orphanRows = await prisma.$queryRawUnsafe<Array<{ registrationId: string }>>(`
    SELECT DISTINCT f.registrationId
    FROM dbo.forecast_values f
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.master_data_crm_registrations m
        WHERE m.id = f.registrationId OR m.newKey = f.registrationId
      )
      AND NOT EXISTS (
        SELECT 1 FROM dbo.VW_CRM_RegistrationAll_1 r
        WHERE r.MainRegist = 1
          AND r.NewKey IS NOT NULL
          AND CAST(r.NewKey AS NVARCHAR(1000)) = f.registrationId
      )
  `);

  const result: ReconcileResult = {
    orphans: orphanRows.length,
    remapped: [],
    skipped: [],
  };

  for (const { registrationId } of orphanRows) {
    const keyForNoCrm = keyForNoCrmFromRegistrationId(registrationId);
    if (!keyForNoCrm) {
      result.skipped.push({ registrationId, reason: 'unparseable key' });
      continue;
    }

    const candidates = await prisma.$queryRaw<Array<{ newKey: string }>>`
      SELECT CAST(r.NewKey AS NVARCHAR(1000)) AS newKey
      FROM dbo.VW_CRM_RegistrationAll_1 r
      WHERE r.MainRegist = 1
        AND r.NewKey IS NOT NULL
        AND CAST(r.KeyforNoCRM AS NVARCHAR(500)) = ${keyForNoCrm}
      UNION
      SELECT m.newKey
      FROM dbo.master_data_crm_registrations m
      WHERE m.mainRegist = 1 AND m.keyForNoCRM = ${keyForNoCrm}
    `;

    if (candidates.length !== 1) {
      result.skipped.push({
        registrationId,
        reason: candidates.length === 0
          ? 'no main registration for key'
          : `ambiguous: ${candidates.length} main registrations for key`,
      });
      continue;
    }

    const targetId = candidates[0].newKey;
    if (targetId === registrationId) {
      result.skipped.push({ registrationId, reason: 'already matches target' });
      continue;
    }

    const conflicts = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*) AS n
      FROM dbo.forecast_values old
      INNER JOIN dbo.forecast_values target
        ON target.registrationId = ${targetId}
        AND target.versionName = old.versionName
        AND target.period = old.period
      WHERE old.registrationId = ${registrationId}
    `;
    if (Number(conflicts[0]?.n ?? 0) > 0) {
      result.skipped.push({
        registrationId,
        reason: `target ${targetId} already has forecast rows for the same version/period`,
      });
      continue;
    }

    await prisma.$transaction([
      prisma.$executeRaw`
        UPDATE dbo.forecast_values
        SET registrationId = ${targetId}
        WHERE registrationId = ${registrationId}
      `,
      // Price settings: move over unless target already has its own row.
      prisma.$executeRaw`
        UPDATE dbo.registration_price_settings
        SET registrationId = ${targetId}
        WHERE registrationId = ${registrationId}
          AND NOT EXISTS (
            SELECT 1 FROM dbo.registration_price_settings t
            WHERE t.registrationId = ${targetId}
          )
      `,
      prisma.$executeRaw`
        DELETE FROM dbo.registration_price_settings
        WHERE registrationId = ${registrationId}
      `,
      prisma.$executeRaw`
        UPDATE v
        SET v.registrationId = ${targetId}
        FROM dbo.custom_column_values v
        WHERE v.registrationId = ${registrationId}
          AND NOT EXISTS (
            SELECT 1 FROM dbo.custom_column_values t
            WHERE t.registrationId = ${targetId} AND t.columnId = v.columnId
          )
      `,
      prisma.$executeRaw`
        DELETE FROM dbo.custom_column_values
        WHERE registrationId = ${registrationId}
      `,
    ]);

    result.remapped.push({ from: registrationId, to: targetId });
  }

  if (result.remapped.length > 0 || result.skipped.length > 0) {
    console.log(
      `[registration-reconcile] orphans=${result.orphans} remapped=${result.remapped.length} skipped=${result.skipped.length}`,
      result.remapped.length > 0 ? result.remapped : '',
      result.skipped.length > 0 ? result.skipped : '',
    );
  }
  return result;
}
