import { randomUUID } from 'node:crypto';
import prisma from '../../db/prisma';
import { sendEmail } from './email';
import {
  buildOverplanAggregateEmail,
  buildOverplanDetailEmail,
} from './emailTemplates';
import { buildForecastChangeBatches } from './notificationPreview';
import type { OverplanResultRow } from './overplanEvaluation';

type OverplanNotificationInput = {
  detailRows: OverplanResultRow[];
  aggregateRows: OverplanResultRow[];
  compareLeft: string;
  compareRight: string;
};

async function loadActiveRecipients(reportType: string) {
  return prisma.overplanRecipient.findMany({
    where: { reportType, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { email: 'asc' }],
  });
}

export async function sendOverplanNotificationEmails(input: OverplanNotificationInput) {
  if (process.env.OVERPLAN_EMAIL_ENABLED !== 'true') {
    return { sent: 0, skipped: 'email_disabled' as const };
  }

  const [aggregateRecipients, nonAggregateRecipients] = await Promise.all([
    loadActiveRecipients('aggregate'),
    loadActiveRecipients('non_aggregate'),
  ]);

  const generatedAt = new Date().toLocaleString('en-GB', { hour12: false });
  let sent = 0;

  if (input.aggregateRows.length > 0 && aggregateRecipients.length > 0) {
    const email = buildOverplanAggregateEmail({
      rows: input.aggregateRows,
      compareLeft: input.compareLeft,
      compareRight: input.compareRight,
      periodLabel: 'Current period',
      generatedAt,
    });
    await sendEmail({
      to: aggregateRecipients.map(recipient => recipient.email),
      subject: email.subject,
      html: email.html,
    });
    sent += 1;
  }

  const nonAggregateTo = nonAggregateRecipients.map(recipient => recipient.email);

  if (input.detailRows.length > 0 && nonAggregateTo.length > 0) {
    const email = buildOverplanDetailEmail({
      rows: input.detailRows,
      compareLeft: input.compareLeft,
      compareRight: input.compareRight,
      periodLabel: 'Current period',
      generatedAt,
    });
    await sendEmail({
      to: nonAggregateTo,
      subject: email.subject,
      html: email.html,
    });
    sent += 1;
  }

  return { sent, skipped: sent === 0 ? 'no_recipients_or_rows' as const : null };
}

/// Send forecast change emails: one combined CC email to ticked recipients.
export async function sendForecastChangeEmails(input: {
  changedBy: string;
  changes: Array<{
    registrationId?: string;
    ownerName: string;
    materialCode: string;
    materialDescription: string;
    plantCode?: string;
    period: string;
    oldQtyFcst: number | null;
    newQtyFcst: number;
  }>;
  commitBatchId?: string;
}) {
  if (process.env.FORECAST_EMAIL_ENABLED !== 'true' || input.changes.length === 0) {
    return { sent: 0, skipped: 'email_disabled_or_empty' as const };
  }

  const batches = await buildForecastChangeBatches({
    changedBy: input.changedBy,
    changes: input.changes,
  });

  let sent = 0;
  const logs: Array<{
    id: string;
    email: string;
    recipientKind: string;
    ownerName: string | null;
    commitBatchId: string | null;
  }> = [];

  for (const batch of batches) {
    const to = batch.recipients.map(recipient => recipient.email).filter(Boolean);
    if (to.length === 0) continue;

    await sendEmail({ to, subject: batch.subject, html: batch.html });
    sent += 1;

    for (const recipient of batch.recipients) {
      logs.push({
        id: randomUUID(),
        email: recipient.email,
        recipientKind: recipient.source === 'owner' ? 'owner' : 'cc',
        ownerName: recipient.source === 'owner' ? recipient.displayName : null,
        commitBatchId: input.commitBatchId ?? null,
      });
    }
  }

  if (logs.length > 0) {
    try {
      await prisma.forecastNotificationSendLog.createMany({ data: logs });
    } catch (error) {
      console.warn('[forecast-email] send log write failed:', error instanceof Error ? error.message : error);
    }
  }

  return { sent, skipped: sent === 0 ? ('no_recipients' as const) : null };
}
