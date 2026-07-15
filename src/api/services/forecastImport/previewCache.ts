import { randomUUID } from 'node:crypto';
import type {
  AutoCreateRegistrationPackage,
  ConfirmLegacyImportRecord,
  ConfirmVersionedImportRecord,
  ImportMode,
  VersionedNormalizedImportRecord,
} from './types';
import { PREVIEW_CACHE_TTL_MS } from './constants';

export type CachedPreviewPayload = {
  previewId: string;
  importMode: ImportMode;
  previewContractVersion: number;
  targetVersion: string;
  legacyRecords?: ConfirmLegacyImportRecord[];
  versionedRecords?: ConfirmVersionedImportRecord[];
  legacyHasPriceColumns?: boolean;
  legacyHasAmountColumns?: boolean;
  versionedHasPriceColumns?: boolean;
  versionedHasAmountColumns?: boolean;
  amountMismatchCount: number;
  autoCreateCandidates?: AutoCreateRegistrationPackage[];
  spreadByRegistrationId?: Record<string, string>;
  pricingPolicyByRegistrationId?: Record<string, string>;
  expiresAt: number;
};

const cache = new Map<string, CachedPreviewPayload>();

export function storePreviewCache(payload: Omit<CachedPreviewPayload, 'previewId' | 'expiresAt'>) {
  const previewId = randomUUID();
  const entry: CachedPreviewPayload = {
    ...payload,
    previewId,
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
  };
  cache.set(previewId, entry);
  return entry;
}

export function getPreviewCache(previewId: string) {
  const entry = cache.get(previewId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(previewId);
    return null;
  }
  return entry;
}

export function deletePreviewCache(previewId: string) {
  cache.delete(previewId);
}

export function sampleVersionedRecords(records: VersionedNormalizedImportRecord[], limit = 50) {
  return records.slice(0, limit);
}
