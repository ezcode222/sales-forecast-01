import prisma from '../../db/prisma';
import type { OverplanResultRow } from './overplanEvaluation';
import {
  buildForecastChangeEmail,
  buildOverplanAggregateEmail,
  buildOverplanDetailEmail,
  EMAIL_PREVIEW_MAX_ROWS,
} from './emailTemplates';
export type EmailRecipientPreview = {
  email: string;
  displayName: string;
  source: 'owner' | 'distribution';
};

export type EmailBatchPreview = {
  id: string;
  reportType: 'aggregate' | 'non_aggregate' | 'forecast_change';
  title: string;
  subject: string;
  html: string;
  recipients: EmailRecipientPreview[];
  rowCount: number;
  previewOnly: true;
};

async function loadActiveRecipients(reportType: string) {
  return prisma.overplanRecipient.findMany({
    where: { reportType, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { email: 'asc' }],
  });
}

function periodLabel(startMonth: string, endMonth: string) {
  return `${startMonth} → ${endMonth}`;
}

export async function buildOverplanNotificationPreviews(input: {
  startMonth: string;
  endMonth: string;
  compareLeft: string;
  compareRight: string;
  detailRows: OverplanResultRow[];
  aggregateRows: OverplanResultRow[];
}): Promise<EmailBatchPreview[]> {
  const generatedAt = new Date().toLocaleString('en-GB', { hour12: false });
  const period = periodLabel(input.startMonth, input.endMonth);
  const previews: EmailBatchPreview[] = [];

  const [aggregateRecipients, nonAggregateRecipients] = await Promise.all([
    loadActiveRecipients('aggregate'),
    loadActiveRecipients('non_aggregate'),
  ]);

  if (input.aggregateRows.length > 0) {
    const email = buildOverplanAggregateEmail({
      rows: input.aggregateRows,
      compareLeft: input.compareLeft,
      compareRight: input.compareRight,
      previewMaxRows: EMAIL_PREVIEW_MAX_ROWS,
      periodLabel: period,
      generatedAt,
    });
    previews.push({
      id: 'overplan-aggregate',
      reportType: 'aggregate',
      title: 'Aggregate — Diff plan breach',
      subject: email.subject,
      html: email.html,
      rowCount: input.aggregateRows.length,
      previewOnly: true,
      recipients: aggregateRecipients.map(recipient => ({
        email: recipient.email,
        displayName: recipient.displayName || recipient.email,
        source: 'distribution',
      })),
    });
  }

  if (input.detailRows.length > 0) {
    const email = buildOverplanDetailEmail({
      rows: input.detailRows,
      compareLeft: input.compareLeft,
      compareRight: input.compareRight,
      previewMaxRows: EMAIL_PREVIEW_MAX_ROWS,
      periodLabel: period,
      generatedAt,
    });

    previews.push({
      id: 'overplan-detail',
      reportType: 'non_aggregate',
      title: 'By registration — Diff plan breach',
      subject: email.subject,
      html: email.html,
      rowCount: input.detailRows.length,
      previewOnly: true,
      recipients: nonAggregateRecipients.map(recipient => ({
        email: recipient.email,
        displayName: recipient.displayName || recipient.email,
        source: 'distribution',
      })),
    });
  }
  return previews;
}

export type ForecastChangeItem = {
  ownerName: string;
  materialCode: string;
  materialDescription: string;
  plantCode?: string;
  period: string;
  oldQtyFcst: number | null;
  newQtyFcst: number;
};

async function loadActiveCcRecipients() {
  return prisma.forecastCcRecipient.findMany({
    where: { notifyEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { fullNameEng: 'asc' }],
  });
}

/// Build forecast change email: one combined CC batch (all rows) to ticked recipients.
export async function buildForecastChangeBatches(input: {
  changedBy: string;
  changes: ForecastChangeItem[];
}): Promise<EmailBatchPreview[]> {
  const generatedAt = new Date().toLocaleString('en-GB', { hour12: false });
  if (input.changes.length === 0) return [];

  const ccConfig = await loadActiveCcRecipients();
  const ccRecipients: EmailRecipientPreview[] = [];
  for (const recipient of ccConfig) {
    const email = recipient.currentEmail.trim().toLowerCase();
    if (!email) continue;
    if (ccRecipients.some(item => item.email === email)) continue;
    ccRecipients.push({
      email,
      displayName: recipient.fullNameEng || email,
      source: 'distribution',
    });
  }

  const ccEmail = buildForecastChangeEmail({
    changedBy: input.changedBy,
    changes: input.changes,
    generatedAt,
  });

  return [{
    id: 'forecast-change-cc',
    reportType: 'forecast_change',
    title: 'CC — All changes combined',
    subject: ccEmail.subject,
    html: ccEmail.html,
    rowCount: input.changes.length,
    previewOnly: true,
    recipients: ccRecipients,
  }];
}
export function sampleForecastChangePreview() {
  return {
    changedBy: 'Pakorn Worakarn',
    changes: [
      {
        ownerName: 'Pakorn Worakarn',
        materialCode: '400677',
        materialDescription: '1015GNKF(TKA) UT25 PLASTIC',
        plantCode: '1104',
        period: '2026-05',
        oldQtyFcst: 120,
        newQtyFcst: 180,
      },
      {
        ownerName: 'Taksaporn Poldongnok',
        materialCode: '400116',
        materialDescription: '1013B UT25 PLASTIC',
        plantCode: '1104',
        period: '2026-05',
        oldQtyFcst: 0,
        newQtyFcst: 250,
      },
    ],
  };
}
