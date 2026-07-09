export type CrmCategoryFields = {
  process: string | null;
  application: string | null;
  subApp: string | null;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function nullableText(value: unknown) {
  const valueText = text(value);
  return valueText || null;
}

function canonicalProcessLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === 'injection') return 'Injection';
  if (normalized === 'extrusion') return 'Extrusion';
  return value;
}

function isTopLevelProcess(value: string) {
  const normalized = value.toLowerCase();
  return normalized === 'injection' || normalized === 'extrusion';
}

function deriveTopLevelFromCode(value: string) {
  if (value.startsWith('INJ_')) return 'Injection';
  if (value.startsWith('EXT_')) return 'Extrusion';
  return null;
}

export function isLikelyCompanyName(value: string | null | undefined) {
  const normalized = text(value);
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.startsWith('INJ_') || normalized.startsWith('EXT_')) return false;
  return (
    /\b(LIMITED|LTD\.?|CO\.|COMPANY|PUBLIC|PCL\.?|PVT\.?|INC\.?|CORP\.?)\b/i.test(normalized)
    || (normalized.includes('(') && normalized.includes(')'))
  );
}

function pickSubAppFallback(
  shiftedProcessCode: string,
  application: string | null,
  subApp: string | null,
) {
  if (subApp) return subApp;
  if (!application) return null;
  if (application === shiftedProcessCode) return null;
  if (isLikelyCompanyName(application)) return null;
  return application;
}

export function normalizeCrmCategoryFields(
  process: string | null | undefined,
  application: string | null | undefined,
  subApp: string | null | undefined,
): CrmCategoryFields {
  const rawProcess = text(process);
  const rawApplication = nullableText(application);
  const rawSubApp = nullableText(subApp);

  if (!rawProcess) {
    return { process: null, application: rawApplication, subApp: rawSubApp };
  }

  if (isTopLevelProcess(rawProcess)) {
    return {
      process: canonicalProcessLabel(rawProcess),
      application: rawApplication,
      subApp: rawSubApp,
    };
  }

  const topLevel = deriveTopLevelFromCode(rawProcess);
  if (topLevel) {
    return {
      process: topLevel,
      application: rawProcess,
      subApp: pickSubAppFallback(rawProcess, rawApplication, rawSubApp),
    };
  }

  return { process: rawProcess, application: rawApplication, subApp: rawSubApp };
}
