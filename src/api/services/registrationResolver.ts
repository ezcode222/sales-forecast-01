import type { MasterDataCrmRegistration } from '@prisma/client';
import prisma from '../../db/prisma';
import { businessUnitFromPlantCode } from './businessUnit';
import { applyCustomerMasterNames, resolveCustomerNamesFromMaster } from './registrationNameResolver';
import {
  buildKeyForNoCrm,
  buildManagedNewKey,
  canonicalOnOffSpec,
  isCompleteRegistrationCodes,
  isIncompleteManagedRegistration,
  text,
} from './registrationIdentity';
import { findRegistrationMatches } from './forecastImport/matching';

export type ManagedRegistrationUpdateResult =
  | { action: 'updated'; row: MasterDataCrmRegistration }
  | {
    action: 'merged_to_crm';
    crmRegistrationId: string;
    forecastsMoved: number;
    removedManagedId: string;
  };

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function readCodesFromBody(body: Record<string, unknown>, existing: MasterDataCrmRegistration) {
  return {
    soldToCode: text(body.soldToCode ?? existing.soldToCode) || '0',
    shipToCode: text(body.shipToCode ?? existing.shipToCode) || '0',
    endUserCode: text(body.endUserCode ?? existing.endUserCode) || '0',
    plantCode: text(body.plantCode ?? existing.plantCode) || '0',
    materialCode: text(body.materialCode ?? existing.materialCode) || '0',
    onOffSpec: canonicalOnOffSpec(body.onOffSpec ?? existing.onOffSpec),
    registrationTopic: text(body.registrationTopic ?? existing.registrationTopic),
  };
}

async function findManagedDuplicate(
  keyForNoCRM: string,
  newKey: string,
  excludeId: string,
) {
  return prisma.masterDataCrmRegistration.findFirst({
    where: {
      id: { not: excludeId },
      OR: [{ keyForNoCRM }, { newKey }],
    },
    select: { id: true },
  });
}

async function mergeForecastsToCrm(managedId: string, crmRegistrationId: string) {
  const moved = await prisma.forecastValue.updateMany({
    where: { registrationId: managedId },
    data: { registrationId: crmRegistrationId },
  });
  return moved.count;
}

export async function resolveManagedRegistrationUpdate(
  existing: MasterDataCrmRegistration,
  body: Record<string, unknown>,
): Promise<ManagedRegistrationUpdateResult> {
  const incomplete = isIncompleteManagedRegistration(existing);
  const keyFieldsChanged = (
    ['registrationTopic', 'soldToCode', 'shipToCode', 'endUserCode', 'plantCode', 'materialCode', 'onOffSpec'] as const
  ).some(field =>
    body[field] !== undefined &&
    text(body[field]) !== text(existing[field])
  );

  if (keyFieldsChanged && !incomplete) {
    throw Object.assign(new Error('Key fields cannot be changed for complete registrations'), {
      code: 'KEY_FIELDS_LOCKED',
    });
  }

  if (keyFieldsChanged && incomplete) {
    const codes = readCodesFromBody(body, existing);
    if (!isCompleteRegistrationCodes(codes)) {
      throw Object.assign(new Error('Complete all key codes before saving this registration'), {
        code: 'INCOMPLETE_KEY_FIELDS',
      });
    }

    const keyForNoCRM = buildKeyForNoCrm(codes);
    const registrationTopic = codes.registrationTopic || `IMP_${codes.plantCode}_${codes.materialCode}`;
    const newKey = buildManagedNewKey(registrationTopic, keyForNoCRM, false);

    const crmMatches = await findRegistrationMatches([keyForNoCRM]);
    const crmMatch = crmMatches.get(keyForNoCRM)?.[0];
    if (crmMatch) {
      const forecastsMoved = await mergeForecastsToCrm(existing.id, crmMatch.registrationId);
      await prisma.masterDataCrmRegistration.delete({ where: { id: existing.id } });
      return {
        action: 'merged_to_crm',
        crmRegistrationId: crmMatch.registrationId,
        forecastsMoved,
        removedManagedId: existing.id,
      };
    }

    const duplicate = await findManagedDuplicate(keyForNoCRM, newKey, existing.id);
    if (duplicate) {
      throw Object.assign(new Error('Registration already exists in Master Data'), {
        code: 'DUPLICATE_REGISTRATION',
      });
    }

    let updateData = {
      ...existing,
      ...codes,
      keyForNoCRM,
      newKey: truncate(newKey, 1000),
      registrationTopic: truncate(registrationTopic, 500),
      businessUnit: businessUnitFromPlantCode(codes.plantCode),
      materialDescription: text(body.materialDescription ?? existing.materialDescription),
      ownerName: text(body.ownerName ?? existing.ownerName),
      countryName: nullableText(body.countryName ?? existing.countryName),
      plantName: nullableText(body.plantName ?? existing.plantName),
      process: nullableText(body.process ?? existing.process),
      application: nullableText(body.application ?? existing.application),
      subApp: nullableText(body.subApp ?? existing.subApp),
      priceFormula: text(body.priceFormula ?? existing.priceFormula) || 'CPL',
    };

    updateData = await applyCustomerMasterNames(updateData);

    const row = await prisma.masterDataCrmRegistration.update({
      where: { id: existing.id },
      data: {
        registrationTopic: updateData.registrationTopic,
        soldToCode: updateData.soldToCode,
        shipToCode: updateData.shipToCode,
        endUserCode: updateData.endUserCode,
        plantCode: updateData.plantCode,
        materialCode: updateData.materialCode,
        onOffSpec: updateData.onOffSpec,
        keyForNoCRM: updateData.keyForNoCRM,
        newKey: updateData.newKey,
        businessUnit: updateData.businessUnit,
        materialDescription: updateData.materialDescription,
        ownerName: updateData.ownerName,
        countryName: updateData.countryName,
        plantName: updateData.plantName,
        soldToName: updateData.soldToName,
        shipToName: updateData.shipToName,
        endUser: updateData.endUser,
        endUserName: updateData.endUserName,
        process: updateData.process,
        application: updateData.application,
        subApp: updateData.subApp,
        priceFormula: updateData.priceFormula,
      },
    });

    return { action: 'updated', row };
  }

  let patchData: Record<string, unknown> = {};
  if (body.materialDescription !== undefined) {
    const value = text(body.materialDescription);
    if (!value) throw Object.assign(new Error('Material Description is required'), { code: 'VALIDATION' });
    patchData.materialDescription = value;
  }
  if (body.ownerName !== undefined) {
    const value = text(body.ownerName);
    if (!value) throw Object.assign(new Error('Owner Name is required'), { code: 'VALIDATION' });
    patchData.ownerName = value;
  }

  const optionalMap: Record<string, string> = {
    countryName: 'countryName',
    shipTo_name: 'shipToName',
    soldTo_name: 'soldToName',
    end_user: 'endUser',
    plantName: 'plantName',
    process: 'process',
    application: 'application',
    subApp: 'subApp',
    endUserName: 'endUserName',
  };
  for (const [bodyKey, field] of Object.entries(optionalMap)) {
    if (body[bodyKey] !== undefined) patchData[field] = nullableText(body[bodyKey]);
  }
  if (body.priceFormula !== undefined) patchData.priceFormula = text(body.priceFormula) || 'CPL';
  if (body.spread !== undefined) {
    const spreadValue = Number(body.spread);
    if (!Number.isFinite(spreadValue) || spreadValue < 0) {
      throw Object.assign(new Error('Spread must be a non-negative number'), { code: 'VALIDATION' });
    }
    patchData.spread = spreadValue;
  }

  const codes = {
    soldToCode: existing.soldToCode,
    shipToCode: existing.shipToCode,
    endUserCode: existing.endUserCode,
  };
  const masterNames = await resolveCustomerNamesFromMaster(codes);
  patchData = {
    ...patchData,
    soldToName: masterNames.soldToName,
    shipToName: masterNames.shipToName,
    endUser: masterNames.endUser,
    endUserName: masterNames.endUserName,
  };

  const row = await prisma.masterDataCrmRegistration.update({
    where: { id: existing.id },
    data: patchData,
  });
  return { action: 'updated', row };
}
