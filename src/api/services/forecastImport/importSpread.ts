import type { ExcelForecastGroup, RegistrationMatch } from './types';

export function buildSpreadByRegistrationId(
  excelGroups: Map<string, ExcelForecastGroup>,
  registrationMatches: Map<string, RegistrationMatch[]>,
) {
  const spreadByRegistrationId: Record<string, string> = {};
  for (const group of excelGroups.values()) {
    if (group.spread === null) continue;
    const registrationId = registrationMatches.get(group.keyNoRegist)?.[0]?.registrationId;
    if (registrationId) {
      spreadByRegistrationId[registrationId] = group.spread;
    }
  }
  return spreadByRegistrationId;
}

export function buildPricingPolicyByRegistrationId(
  excelGroups: Map<string, ExcelForecastGroup>,
  registrationMatches: Map<string, RegistrationMatch[]>,
) {
  const pricingPolicyByRegistrationId: Record<string, string> = {};
  for (const group of excelGroups.values()) {
    if (group.pricingPolicy === null) continue;
    const registrationId = registrationMatches.get(group.keyNoRegist)?.[0]?.registrationId;
    if (registrationId) {
      pricingPolicyByRegistrationId[registrationId] = group.pricingPolicy;
    }
  }
  return pricingPolicyByRegistrationId;
}
