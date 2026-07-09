import prisma from '../../db/prisma';

function normalizeSpread(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error('Spread must be a non-negative number'), { code: 'VALIDATION' });
  }
  return parsed;
}

export async function upsertRegistrationSpread(
  registrationId: string,
  spreadInput: unknown,
  updatedBy?: string,
) {
  const spread = normalizeSpread(spreadInput);
  const id = String(registrationId ?? '').trim();
  if (!id) {
    throw Object.assign(new Error('Registration id is required'), { code: 'VALIDATION' });
  }

  const managed = await prisma.masterDataCrmRegistration.findFirst({
    where: { OR: [{ id }, { newKey: id }] },
    select: { id: true },
  });

  if (managed) {
    await prisma.masterDataCrmRegistration.update({
      where: { id: managed.id },
      data: { spread },
    });
  } else {
    await prisma.$executeRaw`
      MERGE [dbo].[registration_price_settings] AS target
      USING (SELECT ${id} AS registrationId, ${spread} AS spread, ${updatedBy ?? null} AS updatedBy) AS source
      ON target.[registrationId] = source.registrationId
      WHEN MATCHED THEN
        UPDATE SET
          [spread] = source.spread,
          [updatedBy] = source.updatedBy,
          [updatedAt] = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT ([registrationId], [spread], [updatedBy], [updatedAt])
        VALUES (source.registrationId, source.spread, source.updatedBy, GETUTCDATE());
    `;
  }

  return { registrationId: id, spread };
}
