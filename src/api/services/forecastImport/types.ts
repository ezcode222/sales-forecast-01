import type { Prisma } from '@prisma/client';
import { CURRENT_FORECAST_VERSION } from './constants';

export type ForecastImportColumn = {
  col: string;
  index: number;
  header: string;
  month: string;
  period: string;
};

export type VersionedForecastColumn = ForecastImportColumn & {
  qtyIndex: number;
  priceIndex: number;
  amountIndex: number;
  priceHeader: string;
  amountHeader: string;
};

export type LegacyNormalizedImportRecord = {
  sourceRow: number;
  excelKeyForNoRegist: string;
  matchedRegistrationId: string;
  version: typeof CURRENT_FORECAST_VERSION;
  sourceColumn: string;
  sourceMonthHeader: string;
  forecastMonth: string;
  period: string;
  granularity: 'week';
  qtyFcst: number;
  priceFcst: number;
  amountFcst: number;
  action?: 'create' | 'overwrite';
  oldQtyFcst?: number | null;
  oldPriceFcst?: number | null;
  oldAmountFcst?: number | null;
};

export type VersionedNormalizedImportRecord = {
  sourceRow: number;
  excelKeyForNoRegist: string;
  matchedRegistrationId: string;
  version: string;
  sourceColumn: string;
  sourceMonthHeader: string;
  forecastMonth: string;
  period: string;
  granularity: 'month';
  qtyFcst: number;
  priceFcst: number;
  amountFcst: number;
  action?: 'create' | 'overwrite';
  oldQtyFcst?: number | null;
  oldPriceFcst?: number | null;
};

export type ConfirmLegacyImportRecord = Pick<
  LegacyNormalizedImportRecord,
  'excelKeyForNoRegist' | 'matchedRegistrationId' | 'period' | 'granularity' | 'qtyFcst' | 'priceFcst' | 'amountFcst'
>;

export type ConfirmVersionedImportRecord = Pick<
  VersionedNormalizedImportRecord,
  'excelKeyForNoRegist' | 'matchedRegistrationId' | 'period' | 'granularity' | 'qtyFcst' | 'priceFcst' | 'amountFcst'
>;

export type RegistrationMatch = {
  registrationId: string;
  keyForNoCRM: string;
  mainRegist: number;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
  businessUnit: string | null;
};

export type ActualSummary = {
  keyForRegist: string | null;
  keyForNoRegist: string;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  qtyActual: Prisma.Decimal | number | null;
};

export type UnifiedPreviewRow = {
  sourceRow: number | null;
  sourceRows: number[];
  status: 'matched' | 'actual_only' | 'registration_only' | 'proposed_registration';
  keyRegist: string | null;
  keyNoRegist: string;
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
  qtyActual: number;
  qtyFcst: number;
  businessUnit: string | null;
  dimensionSource: 'registration' | 'actual' | 'excel' | 'actual_with_excel_fallback' | 'registration_with_actual_fallback';
};

export type SourceSheetRow = {
  sourceSheet: string;
  sourceRow: number;
};

export type ExcelForecastGroup = {
  keyNoRegist: string;
  sourceRows: number[];
  sourceSheetRows: SourceSheetRow[];
  country: string | null;
  soldTo: string | null;
  shipTo: string | null;
  enduser: string | null;
  plant: string | null;
  materialCode: string | null;
  onOff: string | null;
  process: string | null;
  application: string | null;
  subApplication: string | null;
  owner: string | null;
  businessUnit: string | null;
  productName: string | null;
  gradeUfa: string | null;
  gradeSap: string | null;
  materialDescription: string | null;
  registrationTopic: string | null;
  forecastValues: number[];
  priceValues: number[];
  amountValues: number[];
  spread: string | null;
  pricingPolicy: string | null;
  hasInvalidNumber: boolean;
};

export type ImportHeaderError = {
  sourceSheet: string;
  column: string;
  expected: string;
  actual: string;
};

export type UnmatchedRowDiagnostic = {
  sourceSheet: string;
  sourceRow: number;
  excelKeyForNoRegist: string;
  reasonCode:
    | 'invalid_key_format'
    | 'has_actual_no_crm'
    | 'non_main_registration'
    | 'onoff_mismatch'
    | 'crm_not_found';
  reason: string;
  hint?: string;
  parsedKey?: {
    soldTo: string;
    shipTo: string;
    enduser: string;
    plant: string;
    material: string;
    onOff: string;
  };
};

export type AmountMismatchWarning = {
  sourceSheet: string;
  sourceRow: number;
  excelKeyForNoRegist: string;
  forecastMonth: string;
  qtyFcst: number;
  priceFcst: number;
  amountFcst: number;
  expectedAmount: number;
  difference: number;
};

export type ImportMode = 'current_forecast' | 'versioned';

export type PendingImportForecastRecord = {
  period: string;
  granularity: 'month' | 'week';
  qtyFcst: number;
  priceFcst: number;
  amountFcst: number;
};

export type AutoCreateRegistrationPackage = {
  excelKeyForNoRegist: string;
  sourceSheet: string;
  sourceRow: number;
  soldToCode: string;
  shipToCode: string;
  endUserCode: string;
  plantCode: string;
  materialCode: string;
  onOffSpec: string;
  ownerName: string | null;
  materialDescription: string | null;
  countryName: string | null;
  shipToName: string | null;
  soldToName: string | null;
  endUser: string | null;
  plantName: string | null;
  process: string | null;
  application: string | null;
  subApp: string | null;
  productName: string | null;
  gradeUfa: string | null;
  gradeSap: string | null;
  registrationTopic: string | null;
  spread: string | null;
  pricingPolicy: string | null;
  hasImportedPrice: boolean;
  pendingForecastRecords: PendingImportForecastRecord[];
};
