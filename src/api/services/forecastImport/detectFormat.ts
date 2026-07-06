import * as XLSX from 'xlsx';
import { FCST_VERSION_SHEET } from './constants';
import { normalizeHeader } from './excelUtils';
import type { ImportMode } from './types';

export function readExcelVersionLabel(workbook: XLSX.WorkBook): string | null {
  const sheet = workbook.Sheets[FCST_VERSION_SHEET];
  if (!sheet) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: true,
  });
  const label = normalizeHeader(rows[1]?.[0]);
  return label || null;
}

function isCurrentForecastVersionLabel(label: string) {
  const normalized = label.trim().toLowerCase().replaceAll(/\s+/g, ' ');
  return normalized === 'current' || normalized === 'current forecast';
}

export function detectImportFormat(workbook: XLSX.WorkBook): ImportMode {
  const versionLabel = readExcelVersionLabel(workbook);
  if (!versionLabel) return 'current_forecast';
  if (isCurrentForecastVersionLabel(versionLabel)) return 'current_forecast';
  return 'versioned';
}
