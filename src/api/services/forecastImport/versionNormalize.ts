import prisma from '../../../db/prisma';

export function normalizeVersionFromExcel(label: string) {
  const trimmed = label.trim();
  const fyMatch = /^(.+?)[\s-]+FY(\d{2})$/i.exec(trimmed);
  if (fyMatch) {
    return `${fyMatch[1].trim()} FY${fyMatch[2]}`;
  }
  return trimmed.replaceAll('-', ' ').split(/\s+/).join(' ').trim();
}

export async function resolveTargetVersion(excelLabel: string) {
  const targetVersion = normalizeVersionFromExcel(excelLabel);
  const existing = await prisma.forecastVersion.findUnique({
    where: { name: targetVersion },
    select: { name: true },
  });
  return {
    excelVersionLabel: excelLabel,
    targetVersion,
    versionExists: Boolean(existing),
  };
}
