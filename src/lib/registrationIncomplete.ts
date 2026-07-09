import { detectEmptyKeySegments, parseExcelKey } from '../api/services/forecastImport/keyDiagnostics';
import type { Registration } from '../types/forecast';

export const EXCEL_IMPORT_CREATED_BY = 'excel-import';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function hasZeroOrMissingCode(...codes: Array<string | null | undefined>) {
  return codes.some(code => !text(code) || text(code) === '0');
}

export function isIncompleteManagedRegistration(row: {
  createdBy?: string | null;
  newKey?: string | null;
  keyForNoCRM?: string | null;
  column1?: string | null;
  soldToCode?: string | null;
  shipToCode?: string | null;
  endUserCode?: string | null;
  plantCode?: string | null;
  materialCode?: string | null;
}) {
  if (text(row.createdBy) !== EXCEL_IMPORT_CREATED_BY) return false;
  const newKey = text(row.newKey) || text(row.column1);
  if (newKey.startsWith('IMP_RAW/')) return true;

  const keyForNoCRM = text(row.keyForNoCRM);
  if (keyForNoCRM) {
    const parsed = parseExcelKey(keyForNoCRM);
    if (detectEmptyKeySegments(parsed).length > 0) return true;
    if (parsed.segmentCount !== 6) return true;
  }

  return hasZeroOrMissingCode(
    row.soldToCode,
    row.shipToCode,
    row.endUserCode,
    row.plantCode,
    row.materialCode,
  );
}

export function withRegistrationIncompleteFlag(registration: Registration): Registration {
  if (registration.isIncomplete !== undefined) return registration;
  return {
    ...registration,
    isIncomplete: isIncompleteManagedRegistration(registration),
  };
}
