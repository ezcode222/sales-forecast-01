import { normalizeKey } from './excelUtils';
import type { UnmatchedRowDiagnostic } from './types';

const KEY_SEGMENT_LABELS = ['SoldTo', 'ShipTo', 'EndUser', 'Plant', 'Material', 'OnOff'] as const;

export type ParsedExcelKey = {
  soldTo: string;
  shipTo: string;
  enduser: string;
  plant: string;
  material: string;
  onOff: string;
  segmentCount: number;
};

export function parseExcelKey(key: string): ParsedExcelKey {
  const segments = key.split('/').map(segment => segment.trim());
  return {
    soldTo: segments[0] ?? '',
    shipTo: segments[1] ?? '',
    enduser: segments[2] ?? '',
    plant: segments[3] ?? '',
    material: segments[4] ?? '',
    onOff: segments[5] ?? '',
    segmentCount: segments.length,
  };
}

export function flipOnOffKey(key: string): string | null {
  const parts = key.split('/');
  if (parts.length === 0) return null;
  const lastIndex = parts.length - 1;
  const last = parts[lastIndex].trim().toLowerCase();
  if (!last) return null;
  const flipped = last === 'off' ? 'On' : last === 'on' ? 'Off' : null;
  if (!flipped) return null;
  parts[lastIndex] = flipped;
  return parts.join('/');
}

export function formatParsedKeySummary(parsed: ParsedExcelKey) {
  return `SoldTo=${parsed.soldTo}, ShipTo=${parsed.shipTo}, EndUser=${parsed.enduser}, Plant=${parsed.plant}, Material=${parsed.material}, OnOff=${parsed.onOff}`;
}

export function toParsedKeyFields(parsed: ParsedExcelKey) {
  return {
    soldTo: parsed.soldTo,
    shipTo: parsed.shipTo,
    enduser: parsed.enduser,
    plant: parsed.plant,
    material: parsed.material,
    onOff: parsed.onOff,
  };
}

export function detectEmptyKeySegments(parsed: ParsedExcelKey): string[] {
  const values = [parsed.soldTo, parsed.shipTo, parsed.enduser, parsed.plant, parsed.material, parsed.onOff];
  return KEY_SEGMENT_LABELS.filter((_, index) => !values[index]);
}

export function defaultUnmatchedHint(reasonCode: UnmatchedRowDiagnostic['reasonCode']): string {
  switch (reasonCode) {
    case 'invalid_key_format':
      return 'Use format SoldTo/ShipTo/EndUser/Plant/Material/OnOff with all segments filled';
    case 'non_main_registration':
      return 'Use the Main Registration key from CRM (MainRegist = 1)';
    case 'onoff_mismatch':
      return 'Change On/Off in the Excel key to match CRM, or update CRM registration';
    case 'has_actual_no_crm':
      return 'Create or activate a CRM Main Registration for this key before importing forecast';
    case 'crm_not_found':
      return 'Verify SoldTo, ShipTo, EndUser, Plant, Material, and On/Off against CRM Main Registration';
    default:
      return 'Review the key and CRM registration data';
  }
}

export function normalizeKeyForDiagnostics(value: unknown) {
  return normalizeKey(value);
}
