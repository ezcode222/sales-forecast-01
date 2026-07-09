import { EXCEL_IMPORT_CREATED_BY } from './forecastImport/autoCreateRegistrations';
import { detectEmptyKeySegments, parseExcelKey } from './forecastImport/keyDiagnostics';

export { EXCEL_IMPORT_CREATED_BY };

export function text(value: unknown) {
  return String(value ?? '').trim();
}

export function canonicalOnOffSpec(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (normalized === 'on') return 'On';
  if (normalized === 'off') return 'Off';
  if (normalized === 'unspecified') return 'Unspecified';
  return 'Unspecified';
}

const CODE_FIELDS = ['soldToCode', 'shipToCode', 'endUserCode', 'plantCode', 'materialCode'] as const;

export function hasZeroOrMissingCode(...codes: Array<string | null | undefined>) {
  return codes.some(code => !text(code) || text(code) === '0');
}

export function isIncompleteManagedRegistration(row: {
  createdBy?: string | null;
  newKey?: string | null;
  keyForNoCRM?: string | null;
  soldToCode?: string | null;
  shipToCode?: string | null;
  endUserCode?: string | null;
  plantCode?: string | null;
  materialCode?: string | null;
}) {
  if (text(row.createdBy) !== EXCEL_IMPORT_CREATED_BY) return false;
  if (text(row.newKey).startsWith('IMP_RAW/')) return true;

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

export function buildKeyForNoCrm(codes: {
  soldToCode: string;
  shipToCode: string;
  endUserCode: string;
  plantCode: string;
  materialCode: string;
  onOffSpec: string;
}) {
  return [
    text(codes.soldToCode) || '0',
    text(codes.shipToCode) || '0',
    text(codes.endUserCode) || '0',
    text(codes.plantCode) || '0',
    text(codes.materialCode) || '0',
    canonicalOnOffSpec(codes.onOffSpec),
  ].join('/');
}

export function isCompleteRegistrationCodes(codes: {
  soldToCode: string;
  shipToCode: string;
  endUserCode: string;
  plantCode: string;
  materialCode: string;
  onOffSpec: string;
}) {
  if (hasZeroOrMissingCode(...CODE_FIELDS.map(field => codes[field]))) return false;
  const keyForNoCRM = buildKeyForNoCrm(codes);
  const parsed = parseExcelKey(keyForNoCRM);
  return parsed.segmentCount === 6 && detectEmptyKeySegments(parsed).length === 0;
}

export function buildManagedNewKey(registrationTopic: string, keyForNoCRM: string, incomplete: boolean) {
  const topic = text(registrationTopic);
  const key = text(keyForNoCRM);
  if (incomplete) return `IMP_RAW/${key}`.slice(0, 1000);
  return `${topic}/${key}`.slice(0, 1000);
}
