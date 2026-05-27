export type Dimension = 'Qty' | 'Price' | 'Amount';
export type ValueType = 'Act' | 'Fcst' | 'Act-Fcst';

export const REG_COLUMN_KEYS = [
  'ownerName',
  'registrationTopic',
  'onOffSpec',
  'plantCode',
  'countryName',
  'materialDescription',
  'materialCode',
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
  'column1',
] as const;

export type RegColumnKey = (typeof REG_COLUMN_KEYS)[number];

export interface Registration {
  id: string;
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
  column1: string;
  priceFormula: string;
  spread: number;
}

export interface CPLPrice {
  month: string;
  price: number;
}

export interface ForecastValue {
  registrationId: string;
  month: string;
  version: string;
  qtyAct: number;
  qtyFcst: number;
  priceAct: number;
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

/** @deprecated Layout is column order only; kept for compatibility if referenced elsewhere. */
export interface RegTableLayoutState {
  columnOrder: RegColumnKey[];
}
