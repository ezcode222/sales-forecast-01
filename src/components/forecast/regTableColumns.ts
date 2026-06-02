import type { RegColumnKey } from '../../types/forecast';
import { REG_COLUMN_KEYS } from '../../types/forecast';

export const REG_COLUMN_WIDTH = 120;
export const MONTH_COLUMN_WIDTH = 110;
export const REG_PANE_MIN_WIDTH = 200;
export const REG_PANE_MAX_RATIO = 0.75;

export interface RegColumnDef {
  key: RegColumnKey;
  label: string;
}

export const ALL_REG_COLUMNS: RegColumnDef[] = [
  { key: 'ownerName', label: 'Owner Name' },
  { key: 'registrationTopic', label: 'Registration Topic' },
  { key: 'onOffSpec', label: 'On/Off Spec' },
  { key: 'plantCode', label: 'Plant Code' },
  { key: 'countryName', label: 'Country Name' },
  { key: 'materialDescription', label: 'Material Description' },
  { key: 'materialCode', label: 'Material Code' },
  { key: 'carryInETD', label: 'Carry In ETD' },
  { key: 'carryOutETD', label: 'Carry Out ETD' },
  { key: 'carryInLoading', label: 'Carry In Loading' },
  { key: 'carryOutLoading', label: 'Carry Out Loading' },
  { key: 'shipTo_name', label: 'Ship To' },
  { key: 'soldTo_name', label: 'Sold To' },
  { key: 'end_user', label: 'End User' },
  { key: 'soldToCode', label: 'Sold To Code' },
  { key: 'shipToCode', label: 'Ship To Code' },
  { key: 'group', label: 'Group' },
  { key: 'materialNameOnCoa', label: 'Material Name on COA' },
  { key: 'additionalRequirement', label: 'Additional Requirement' },
  { key: 'pic', label: 'PIC' },
  { key: 'commission', label: 'Commission' },
  { key: 'productDescription', label: 'Product Description' },
  { key: 'classified', label: 'Classified' },
  { key: 'commissionIndirect', label: 'Commission Indirect' },
  { key: 'commissionFinancialDiscount', label: 'Commission Financial Discount' },
  { key: 'newCoaName', label: 'New COA Name' },
  { key: 'newTier1', label: 'New Tier 1' },
  { key: 'newOem', label: 'New OEM' },
  { key: 'packing', label: 'Packing' },
  { key: 'agreedSpecType', label: 'Agreed Spec Type' },
  { key: 'wasteScrap', label: 'Waste Scrap' },
  { key: 'forResaleNotApprove', label: 'For Resale Not Approve' },
  { key: 'imdsDate', label: 'IMDS Date' },
  { key: 'model', label: 'Model' },
  { key: 'createdOn', label: 'Created On' },
  { key: 'approve', label: 'Approve' },
  { key: 'partName', label: 'Part Name' },
  { key: 'coaName', label: 'COA Name' },
  { key: 'process', label: 'Process' },
  { key: 'application', label: 'Application' },
  { key: 'subApp', label: 'Sub App' },
  { key: 'zoneName', label: 'Zone Name' },
  { key: 'plantName', label: 'Plant Name' },
  { key: 'countryCode', label: 'Country Code' },
  { key: 'endUserCode', label: 'End User Code' },
  { key: 'endUserExportControl', label: 'End User Export Control' },
  { key: 'endUserName', label: 'End User Name' },
  { key: 'productName', label: 'Product Name' },
  { key: 'column1', label: 'Column 1' },
];

const columnDefMap = Object.fromEntries(
  ALL_REG_COLUMNS.map(col => [col.key, col])
) as Record<RegColumnKey, RegColumnDef>;

export const DEFAULT_COLUMN_ORDER: RegColumnKey[] = [...REG_COLUMN_KEYS];
// Limit default visible columns to an approved, sensible subset
export const DEFAULT_VISIBLE_COLUMN_KEYS: RegColumnKey[] = [
  'ownerName',
  'registrationTopic',
  'materialCode',
  'materialDescription',
  'carryInETD',
  'carryOutETD',
  'carryInLoading',
  'carryOutLoading',
  'plantName',
  'countryName',
  'shipTo_name',
  'soldTo_name',
  'partName',
  'productName',
];

export interface OrderedRegColumn extends RegColumnDef {
  width: number;
}

export function getOrderedColumns(columnOrder: RegColumnKey[]): OrderedRegColumn[] {
  return columnOrder
    .map(key => columnDefMap[key])
    .filter((col): col is RegColumnDef => Boolean(col))
    .map(col => ({ ...col, width: REG_COLUMN_WIDTH }));
}

export function getRegColumnsTotalWidth(columnCount: number): number {
  return columnCount * REG_COLUMN_WIDTH;
}

export function reorderColumns(
  order: RegColumnKey[],
  draggedKey: RegColumnKey,
  targetKey: RegColumnKey
): RegColumnKey[] {
  if (draggedKey === targetKey) return order;
  const next = order.filter(k => k !== draggedKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex === -1) return order;
  next.splice(targetIndex, 0, draggedKey);
  return next;
}
