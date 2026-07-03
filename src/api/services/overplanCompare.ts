import prisma from '../../db/prisma';

export const OVERPLAN_ACTUAL_SOURCE = 'Actual';
export const OVERPLAN_DEFAULT_COMPARE_RIGHT = 'Current Forecast';

export function normalizeCompareSource(value: unknown): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || OVERPLAN_ACTUAL_SOURCE;
}

export async function validateCompareSource(source: string): Promise<string> {
  const normalized = normalizeCompareSource(source);
  if (normalized === OVERPLAN_ACTUAL_SOURCE) return normalized;

  const version = await prisma.forecastVersion.findUnique({
    where: { name: normalized },
    select: { name: true },
  });
  if (!version) {
    throw new Error(`Unknown forecast version: ${normalized}`);
  }
  return normalized;
}

export async function resolveComparePair(input: {
  compareLeft?: unknown;
  compareRight?: unknown;
  fallbackLeft?: string;
  fallbackRight?: string;
}) {
  const left = normalizeCompareSource(input.compareLeft ?? input.fallbackLeft ?? OVERPLAN_ACTUAL_SOURCE);
  const right = normalizeCompareSource(
    input.compareRight ?? input.fallbackRight ?? OVERPLAN_DEFAULT_COMPARE_RIGHT
  );
  if (left === right) {
    throw new Error('Compare left and right must be different');
  }

  const [compareLeft, compareRight] = await Promise.all([
    validateCompareSource(left),
    validateCompareSource(right),
  ]);
  return { compareLeft, compareRight };
}
