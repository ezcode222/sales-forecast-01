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
      return 'Invalid key format — registration will be created from the Excel key on confirm';
    case 'non_main_registration':
      return 'Non-main CRM registration — a new master registration will be created from the Excel key on confirm';
    case 'onoff_mismatch':
      return 'On/Off mismatch with CRM — a new registration will be created from the Excel key on confirm';
    case 'has_actual_no_crm':
      return 'Actual exists without CRM — registration will be created automatically on confirm';
    case 'crm_not_found':
      return 'Not in CRM — registration will be created automatically on confirm';
    default:
      return 'Review the key and CRM registration data';
  }
}

export function normalizeKeyForDiagnostics(value: unknown) {
  return normalizeKey(value);
}
