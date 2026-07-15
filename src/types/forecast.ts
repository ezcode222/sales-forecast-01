export type Dimension = 'Qty' | 'Price' | 'Amount';
export type ValueType = 'Act' | 'Fcst' | 'Act-Fcst';
export type PriceFormula = 'CPL' | 'Naphtha' | 'Benzene' | 'CPL (Tecnon)' | 'CPL (PCI)' | 'Fixed Price';
export const PRICE_FORMULA_OPTIONS: PriceFormula[] = ['CPL', 'Naphtha', 'Benzene', 'CPL (Tecnon)', 'CPL (PCI)', 'Fixed Price'];
export type CarryDetailKey = 'carryIn' | 'carryOut' | 'carryTotal';
export type CarryDetailVisibility = Record<CarryDetailKey, boolean>;

export const REG_COLUMN_KEYS = [
  'ownerName',
  'businessUnit',
  'registrationTopic',
  'onOffSpec',
  'plantCode',
  'countryName',
  'materialDescription',
  'materialCode',
  'inventoryA0Qty',
  'inventoryNonA0Qty',
  'inventoryWaitJudgeQty',
  'inventoryOgQty',
  'inventoryYoQty',
  'carryInETD',
  'carryOutETD',
  'carryInLoading',
  'carryOutLoading',
  'shipTo_name',
  'soldTo_name',
  'end_user',
  'soldToCode',
  'shipToCode',
  'group',
  'materialNameOnCoa',
  'additionalRequirement',
  'pic',
  'commission',
  'productDescription',
  'classified',
  'commissionIndirect',
  'commissionFinancialDiscount',
  'newCoaName',
  'newTier1',
  'newOem',
  'packing',
  'agreedSpecType',
  'wasteScrap',
  'forResaleNotApprove',
  'imdsDate',
  'model',
  'createdOn',
  'approve',
  'partName',
  'coaName',
  'process',
  'application',
  'subApp',
  'zoneName',
  'plantName',
  'countryCode',
  'endUserCode',
  'endUserExportControl',
  'endUserName',
  'productName',
  'productNamePud',
  'gradeUfa',
  'gradeSap',
  'column1',
  'priceFormula',
  'spread',
] as const;

export type RegColumnKey = (typeof REG_COLUMN_KEYS)[number];

export interface Registration {
  id: string;
  isDraft?: boolean;
  isManaged?: boolean;
  isIncomplete?: boolean;
  sourceStatus?: 'matched' | 'registration_only' | 'actual_only';
  keyForNoCRM?: string;
  businessUnit: string;
  ownerName: string;
  registrationTopic: string;
  onOffSpec: string;
  plantCode: string;
  countryName: string;
  materialDescription: string;
  materialCode: string;
  shipTo_name: string;
  soldTo_name: string;
  end_user: string;
  soldToCode: string;
  shipToCode: string;
  group: string;
  materialNameOnCoa: string;
  additionalRequirement: string;
  pic: string;
  commission: string;
  productDescription: string;
  classified: string;
  commissionIndirect: string;
  commissionFinancialDiscount: string;
  newCoaName: string;
  newTier1: string;
  newOem: string;
  packing: string;
  agreedSpecType: string;
  wasteScrap: string;
  forResaleNotApprove: string;
  imdsDate: string;
  model: string;
  createdOn: string;
  approve: string;
  partName: string;
  coaName: string;
  process: string;
  application: string;
  subApp: string;
  zoneName: string;
  plantName: string;
  countryCode: string;
  endUserCode: string;
  endUserExportControl: string;
  endUserName: string;
  productName: string;
  productNamePud: string;
  gradeUfa: string;
  gradeSap: string;
  column1: string;
  carryInETD: number;
  carryOutETD: number;
  carryInLoading: number;
  carryOutLoading: number;
  priceFormula: string;
  spread: string | null;
  pricingPolicy?: string | null;
  createdBy?: string;
  inventoryA0Qty?: number;
  inventoryNonA0Qty?: number;
  inventoryWaitJudgeQty?: number;
  inventoryOgQty?: number;
  inventoryYoQty?: number;
  inventoryDate?: string | null;
}

export interface ManagedRegistrationMergeResult {
  action: 'merged_to_crm';
  crmRegistrationId: string;
  forecastsMoved: number;
  removedManagedId: string;
}

export type ManagedRegistrationUpdateResponse = Registration | ManagedRegistrationMergeResult;

export function isManagedRegistrationMerge(
  result: ManagedRegistrationUpdateResponse,
): result is ManagedRegistrationMergeResult {
  return 'action' in result && result.action === 'merged_to_crm';
}

export interface CPLPrice {
  month: string;
  price: number;
}

export type PriceManagementType = 'Actual' | 'Fcst';

export interface PriceManagementRow {
  month: string;
  cplPrice: number;
  naphthaPrice: number;
  benzenePrice: number;
  jpyUsdRate: number;
  thbUsdRate: number;
  cplTecnonPrice: number;
  cplPciPrice: number;
}

export interface ActualValue {
  registrationId: string;
  sourceStatus?: 'matched' | 'actual_only';
  registration?: Registration;
  month: string;
  qtyAct: number;
  priceAct: number;
  amountAct: number;
  carryInETD: number;
  carryOutETD: number;
  carryInLoading: number;
  carryOutLoading: number;
}

export interface ForecastValue {
  registrationId: string;
  month: string;
  version: string;
  qtyAct: number;
  qtyFcst: number;
  priceFcst?: number;
  amountFcst?: number;
  priceAct: number;
  amountAct?: number;
  carryInETD?: number;
  carryOutETD?: number;
  carryInLoading?: number;
  carryOutLoading?: number;
}

export interface ForecastSummaryPeriod {
  period: string;
  qtyAct: number;
  qtyFcst: number;
  amountFcst: number;
  carryInETD: number;
  carryOutETD: number;
  carryInLoading: number;
  carryOutLoading: number;
}

export interface ForecastSummary {
  generatedAt: string;
  periods: ForecastSummaryPeriod[];
}

export interface ForecastSummaryRequest {
  startMonth: string;
  endMonth: string;
  periods: string[];
  granularity: 'month' | 'week';
  version: string;
  filters: Record<string, string[]>;
  formulaFilter: string[];
  formulaOverrides: Record<string, string>;
  carryFilters: Record<string, string[]>;
  registrationIds?: string[];
}

export interface ForecastLoadProgress {
  active: boolean;
  completedChunks: number;
  totalChunks: number;
  version: string;
}

export interface InventoryRow {
  registrationId: string;
  ownerName: string;
  registrationTopic: string;
  plantCode: string;
  materialCode: string;
  materialDescription: string;
  inventoryMaterialDescription: string;
  a0Qty: number;
  nonA0Qty: number;
  waitJudgeQty: number;
  ogQty: number;
  yoQty: number;
  totalQty: number;
  inventoryDate: string | null;
}

export interface ColumnFilterValue {
  searchText: string;
  selectedValues: string[];
}

export type ColumnFiltersState = Record<string, ColumnFilterValue>;

export const EMPTY_COLUMN_FILTER: ColumnFilterValue = {
  searchText: '',
  selectedValues: [],
};

export type CustomColumnType = 'text' | 'number' | 'dropdown';

export interface CustomColumnDef {
  id: string;
  name: string;
  type: CustomColumnType;
  dropdownOptions?: string[];
  defaultValue?: string;
  displayOrder: number;
}

export interface CustomColumnValue {
  columnId: string;
  registrationId: string;
  value: string | null;
}

export type CustomColumnValuesMap = Map<string, Record<string, string | null>>;

export function customColumnFilterKey(columnId: string): string {
  return `customCol_${columnId}`;
}

export function isCustomColumnFilterKey(key: string): boolean {
  return key.startsWith('customCol_');
}

export function customColumnIdFromFilterKey(key: string): string {
  return key.replace(/^customCol_/, '');
}

/** @deprecated Layout is column order only; kept for compatibility if referenced elsewhere. */
export interface RegTableLayoutState {
  columnOrder: RegColumnKey[];
}
