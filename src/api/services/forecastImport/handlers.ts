import type { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import {
  buildLegacyImportPreview,
  LegacyPreviewValidationError,
} from './buildLegacyPreview';
import { buildVersionedImportPreview } from './buildVersionedPreview';
import {
  buildLegacyConfirmRecordsFromPackages,
  buildVersionedConfirmRecordsFromPackages,
  resolveOrCreateImportRegistrations,
} from './autoCreateRegistrations';
import {
  confirmLegacyImport,
  confirmVersionedImport,
  ForecastImportConfirmError,
  LEGACY_PREVIEW_CONTRACT_VERSION,
  VERSIONED_PREVIEW_CONTRACT_VERSION,
} from './confirmImport';
import { detectImportFormat, readExcelVersionLabel } from './detectFormat';
import { deletePreviewCache, getPreviewCache } from './previewCache';
import type { CachedPreviewPayload } from './previewCache';
import { getRequestWorkbookBuffer } from './requestWorkbook';
import { normalizeStampPeriod } from './stampPeriod';
import type { ConfirmLegacyImportRecord } from './types';
import { resolveTargetVersion } from './versionNormalize';
import { isFirstWednesdayPeriod, normalizeKey } from './excelUtils';

function sessionChangedBy(req: Request) {
  const sessionUser = (req as Request & { user?: { name?: string; email?: string } }).user;
  return String(
    sessionUser?.name ??
    sessionUser?.email ??
    req.header('x-changed-by') ??
    'sales-forecast-web'
  ).trim() || 'sales-forecast-web';
}

export async function handleForecastPreview(req: Request, res: Response) {
  const workbookBuffer = getRequestWorkbookBuffer(req.body);
  if (!workbookBuffer || workbookBuffer.length === 0) {
    return res.status(400).json({
      error: 'Excel file is required. Send raw .xlsx bytes or JSON { fileBase64 }.',
    });
  }

  try {
    const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false });
    const importMode = detectImportFormat(workbook);

    if (importMode === 'versioned') {
      const excelVersionLabel = readExcelVersionLabel(workbook);
      if (!excelVersionLabel) {
        return res.status(400).json({
          error: 'Fcst Version sheet is present but version label in A2 is empty.',
        });
      }
      const { targetVersion, versionExists } = await resolveTargetVersion(excelVersionLabel);
      const preview = await buildVersionedImportPreview(
        workbook,
        targetVersion,
        excelVersionLabel,
        versionExists
      );
      return res.json({ ...preview, versionExists });
    }

    const preview = await buildLegacyImportPreview(workbook);
    return res.json(preview);
  } catch (error) {
    if (error instanceof LegacyPreviewValidationError) {
      return res.status(400).json({ error: error.message, ...error.details });
    }
    console.error('[forecast-import] preview error:', error);
    return res.status(500).json({ error: 'Failed to preview forecast import' });
  }
}

function parseLegacyConfirmRecords(body: Record<string, unknown>) {
  if (!Array.isArray(body.records) || body.records.length === 0) {
    throw new ForecastImportConfirmError(400, 'No importable forecast records were supplied.');
  }
  if (body.records.length > 20_000) {
    throw new ForecastImportConfirmError(413, 'Import contains too many records.');
  }

  const records: ConfirmLegacyImportRecord[] = [];
  for (const value of body.records) {
    if (!value || typeof value !== 'object') {
      throw new ForecastImportConfirmError(400, 'Invalid import record.');
    }
    const record = value as Record<string, unknown>;
    const excelKeyForNoRegist = normalizeKey(record.excelKeyForNoRegist);
    const matchedRegistrationId = normalizeKey(record.matchedRegistrationId);
    const period = normalizeKey(record.period);
    const qtyFcst = Number(record.qtyFcst);
    const priceFcst = Number(record.priceFcst ?? 0);
    const amountFcst = Number(record.amountFcst ?? 0);
    if (
      !excelKeyForNoRegist ||
      !matchedRegistrationId ||
      !isFirstWednesdayPeriod(period) ||
      record.granularity !== 'week' ||
      !Number.isFinite(qtyFcst) ||
      qtyFcst < 0 ||
      !Number.isFinite(priceFcst) ||
      priceFcst < 0 ||
      !Number.isFinite(amountFcst) ||
      amountFcst < 0
    ) {
      throw new ForecastImportConfirmError(400, 'Import contains an invalid forecast record.');
    }
    records.push({
      excelKeyForNoRegist,
      matchedRegistrationId,
      period,
      granularity: 'week',
      qtyFcst,
      priceFcst,
      amountFcst,
    });
  }
  return records;
}

async function prepareAutoCreatedImportRecords(cache: CachedPreviewPayload) {
  const candidates = cache.autoCreateCandidates ?? [];
  if (candidates.length === 0) {
    return {
      versionedRecords: cache.versionedRecords ?? [],
      legacyRecords: cache.legacyRecords ?? [],
      registrationsCreated: 0,
      createdRegistrationIds: [] as string[],
    };
  }

  const autoCreateResult = await resolveOrCreateImportRegistrations(candidates);
  return {
    versionedRecords: [
      ...(cache.versionedRecords ?? []),
      ...buildVersionedConfirmRecordsFromPackages(candidates, autoCreateResult.registrationIdByKey),
    ],
    legacyRecords: [
      ...(cache.legacyRecords ?? []),
      ...buildLegacyConfirmRecordsFromPackages(candidates, autoCreateResult.registrationIdByKey),
    ],
    registrationsCreated: autoCreateResult.registrationsCreated,
    createdRegistrationIds: autoCreateResult.createdRegistrationIds,
  };
}

export async function handleForecastConfirm(req: Request, res: Response) {
  const changedBy = sessionChangedBy(req);
  const body = req.body as {
    previewId?: unknown;
    previewContractVersion?: unknown;
    records?: unknown;
    stampPeriod?: unknown;
  };
  const stampPeriod = normalizeStampPeriod(body.stampPeriod);

  try {
    if (typeof body.previewId === 'string' && body.previewId.trim()) {
      const cache = getPreviewCache(body.previewId);
      if (!cache) {
        return res.status(409).json({
          error: 'Preview expired or not found. Run Preview again before importing.',
          code: 'STALE_PREVIEW',
        });
      }
      if (cache.importMode === 'versioned') {
        if (body.previewContractVersion !== VERSIONED_PREVIEW_CONTRACT_VERSION) {
          return res.status(409).json({
            error: 'Preview is outdated. Run Preview again before importing.',
            code: 'STALE_PREVIEW',
          });
        }
        if (!cache.versionedRecords) {
          return res.status(409).json({
            error: 'Preview expired or not found. Run Preview again before importing.',
            code: 'STALE_PREVIEW',
          });
        }
        const prepared = await prepareAutoCreatedImportRecords(cache);
        const result = await confirmVersionedImport(
          prepared.versionedRecords,
          cache.targetVersion,
          changedBy,
          stampPeriod,
          {
            hasPriceColumns: cache.versionedHasPriceColumns ?? true,
            hasAmountColumns: cache.versionedHasAmountColumns ?? true,
            spreadByRegistrationId: cache.spreadByRegistrationId,
            pricingPolicyByRegistrationId: cache.pricingPolicyByRegistrationId,
          }
        );
        deletePreviewCache(body.previewId);
        return res.json({
          ...result,
          registrationsCreated: prepared.registrationsCreated,
          createdRegistrationIds: prepared.createdRegistrationIds,
        });
      }

      if (body.previewContractVersion !== LEGACY_PREVIEW_CONTRACT_VERSION) {
        return res.status(409).json({
          error: 'Preview is outdated. Run Preview again before importing.',
          code: 'STALE_PREVIEW',
        });
      }
      if (!cache.legacyRecords) {
        return res.status(409).json({
          error: 'Preview expired or not found. Run Preview again before importing.',
          code: 'STALE_PREVIEW',
        });
      }
        const prepared = await prepareAutoCreatedImportRecords(cache);
        const result = await confirmLegacyImport(
          prepared.legacyRecords,
          changedBy,
          stampPeriod,
          {
            hasPriceColumns: cache.legacyHasPriceColumns ?? false,
            hasAmountColumns: cache.legacyHasAmountColumns ?? false,
            spreadByRegistrationId: cache.spreadByRegistrationId,
            pricingPolicyByRegistrationId: cache.pricingPolicyByRegistrationId,
          }
        );
        deletePreviewCache(body.previewId);
        return res.json({
          ...result,
          registrationsCreated: prepared.registrationsCreated,
          createdRegistrationIds: prepared.createdRegistrationIds,
        });
    }

    if (body.previewContractVersion !== LEGACY_PREVIEW_CONTRACT_VERSION) {
      return res.status(409).json({
        error: 'Preview is outdated. Run Preview again before importing.',
        code: 'STALE_PREVIEW',
      });
    }
    const records = parseLegacyConfirmRecords(body as Record<string, unknown>);
    const result = await confirmLegacyImport(records, changedBy, stampPeriod);
    return res.json(result);
  } catch (error) {
    if (error instanceof ForecastImportConfirmError) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    console.error('[forecast-import] confirm error:', error);
    return res.status(500).json({ error: 'Failed to import forecast records' });
  }
}
