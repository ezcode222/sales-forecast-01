import type { OverplanResultRow } from './overplanEvaluation';

const BRAND = '#007ABE';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatQty(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function formatPct(value: number | null) {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

function emailShell(options: {
  eyebrow: string;
  title: string;
  intro: string;
  meta: Array<{ label: string; value: string }>;
  tableHtml: string;
  footerNote?: string;
}) {
  const metaHtml = options.meta.map(item => `
    <tr>
      <td style="padding:6px 0;font-size:12px;color:#64748b;width:38%;vertical-align:top;">${escapeHtml(item.label)}</td>
      <td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:500;vertical-align:top;">${escapeHtml(item.value)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:Segoe UI,Inter,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
    <div style="background:${BRAND};padding:20px 24px;color:#ffffff;">
      <div style="font-size:11px;opacity:0.85;font-weight:500;">UGT Sales Forecast</div>
      <div style="font-size:18px;font-weight:600;margin-top:4px;line-height:1.35;">${escapeHtml(options.title)}</div>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#475569;">${escapeHtml(options.intro)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:20px;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;padding:4px 0;">
        ${metaHtml}
      </table>
      ${options.tableHtml}
      <p style="margin:20px 0 0;font-size:11px;line-height:1.55;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:16px;">${escapeHtml(options.footerNote ?? 'Automated notification from UGT Sales Forecast. Please do not reply.')}</p>
    </div>
  </div>
</body>
</html>`;
}

function dataTable(headers: string[], rows: string[][]) {
  const head = headers.map(header => `
    <th style="padding:10px 12px;background:#f8fafc;color:#64748b;font-size:11px;font-weight:600;text-align:left;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(header)}</th>
  `).join('');
  const body = rows.map(cells => {
    const tds = cells.map(cell => `
      <td style="padding:10px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:top;">${cell}</td>
    `).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `
    <div style="overflow:auto;border:1px solid #e2e8f0;border-radius:8px;">
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;min-width:600px;">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export const EMAIL_PREVIEW_MAX_ROWS = 100;

function sortBreachRows(rows: OverplanResultRow[]) {
  return [...rows].sort((left, right) =>
    left.period.localeCompare(right.period)
    || left.materialCode.localeCompare(right.materialCode)
    || left.plantCode.localeCompare(right.plantCode)
    || (left.ownerName ?? '').localeCompare(right.ownerName ?? '')
  );
}

function partitionBreachRows(rows: OverplanResultRow[]) {
  const over = sortBreachRows(rows.filter(row => row.status === 'over'));
  const under = sortBreachRows(rows.filter(row => row.status === 'under'));
  return { over, under, total: over.length + under.length };
}

function selectBreachRowsForDisplay(rows: OverplanResultRow[], previewMaxRows?: number) {
  const { over, under, total } = partitionBreachRows(rows);
  if (previewMaxRows === undefined || total <= previewMaxRows) {
    return { over, under, overTotal: over.length, underTotal: under.length, total, truncatedOver: 0 };
  }

  const overBudget = Math.max(0, previewMaxRows - under.length);
  return {
    over: over.slice(0, overBudget),
    under,
    overTotal: over.length,
    underTotal: under.length,
    total,
    truncatedOver: over.length - overBudget,
  };
}

function sectionTruncationNote(shown: number, total: number, label: string) {
  if (shown >= total) return '';
  return `<p style="margin:8px 0 0;font-size:12px;color:#64748b;">Showing ${shown.toLocaleString()} of ${total.toLocaleString()} ${label} rows.</p>`;
}

function breachSectionHtml(options: {
  title: string;
  accent: string;
  headers: string[];
  rows: OverplanResultRow[];
  mapRow: (row: OverplanResultRow) => string[];
  totalCount: number;
  truncatedCount?: number;
}) {
  if (options.totalCount === 0) return '';

  const tableHtml = dataTable(options.headers, options.rows.map(options.mapRow));
  const truncationNote = options.truncatedCount && options.truncatedCount > 0
    ? sectionTruncationNote(options.rows.length, options.totalCount, options.title.toLowerCase())
    : '';

  return `
    <div style="margin-bottom:24px;">
      <h3 style="margin:0 0 10px;font-size:14px;font-weight:600;color:${options.accent};">${escapeHtml(options.title)} (${options.totalCount.toLocaleString()})</h3>
      ${tableHtml}
      ${truncationNote}
    </div>
  `;
}

function buildOverplanBreachTablesHtml(options: {
  rows: OverplanResultRow[];
  compareLeft: string;
  compareRight: string;
  previewMaxRows?: number;
  includeOwner: boolean;
}) {
  const { over, under, overTotal, underTotal, total, truncatedOver } = selectBreachRowsForDisplay(
    options.rows,
    options.previewMaxRows
  );
  const pctLabel = `% vs ${options.compareRight}`;
  const headers = options.includeOwner
    ? ['Owner', 'Material code', 'Material description', 'Plant', 'Period', options.compareLeft, options.compareRight, 'Variance', pctLabel]
    : ['Material code', 'Material description', 'Plant', 'Period', options.compareLeft, options.compareRight, 'Variance', pctLabel];

  const mapRow = (row: OverplanResultRow) => {
    const cells = options.includeOwner
      ? [escapeHtml(row.ownerName || '—')]
      : [];
    cells.push(
      escapeHtml(row.materialCode || '—'),
      escapeHtml(row.materialDescription || '—'),
      escapeHtml(row.plantCode || '—'),
      escapeHtml(row.period),
      formatQty(row.leftQty),
      formatQty(row.rightQty),
      formatQty(row.diffQty),
      formatPct(row.pctVsRight)
    );
    return cells;
  };

  const overSection = breachSectionHtml({
    title: 'Over forecast',
    accent: '#be123c',
    headers,
    rows: over,
    mapRow,
    totalCount: overTotal,
    truncatedCount: truncatedOver,
  });
  const underSection = breachSectionHtml({
    title: 'Under forecast',
    accent: '#b45309',
    headers,
    rows: under,
    mapRow,
    totalCount: underTotal,
  });

  if (total === 0) {
    return '<p style="margin:0;font-size:13px;color:#64748b;">No breach rows.</p>';
  }

  return `${overSection}${underSection}`;
}

export function buildOverplanAggregateEmail(options: {
  rows: OverplanResultRow[];
  compareLeft: string;
  compareRight: string;
  previewMaxRows?: number;
  periodLabel: string;
  generatedAt: string;
}) {
  const { over, under, total } = partitionBreachRows(options.rows);
  const compareLabel = `${options.compareLeft} vs ${options.compareRight}`;
  const tableHtml = buildOverplanBreachTablesHtml({
    rows: options.rows,
    compareLeft: options.compareLeft,
    compareRight: options.compareRight,
    previewMaxRows: options.previewMaxRows,
    includeOwner: false,
  });

  return {
    subject: `[UGT Sales Forecast] Diff plan alert — aggregate (${total} breaches)`,
    html: emailShell({
      eyebrow: 'Aggregate report · Material / Plant / Period',
      title: 'Diff Plan Monitor — Aggregate Breach Alert',
      intro: `${compareLabel} has breached the configured threshold. This aggregate view is grouped by material, plant, and period.`,
      meta: [
        { label: 'Comparison', value: compareLabel },
        { label: 'Report type', value: 'Aggregate (no owner)' },
        { label: 'Period', value: options.periodLabel },
        { label: 'Over forecast', value: over.length.toLocaleString() },
        { label: 'Under forecast', value: under.length.toLocaleString() },
        { label: 'Total breaches', value: total.toLocaleString() },
        { label: 'Generated', value: options.generatedAt },
      ],
      tableHtml,
      footerNote: 'Recipients: configured aggregate distribution list (e.g. sales control). Owner is not included because rows are aggregated.',
    }),
  };
}

export function buildOverplanDetailEmail(options: {
  rows: OverplanResultRow[];
  compareLeft: string;
  compareRight: string;
  previewMaxRows?: number;
  periodLabel: string;
  generatedAt: string;
}) {
  const { over, under, total } = partitionBreachRows(options.rows);
  const compareLabel = `${options.compareLeft} vs ${options.compareRight}`;
  const tableHtml = buildOverplanBreachTablesHtml({
    rows: options.rows,
    compareLeft: options.compareLeft,
    compareRight: options.compareRight,
    previewMaxRows: options.previewMaxRows,
    includeOwner: true,
  });

  return {
    subject: `[UGT Sales Forecast] Diff plan alert — by registration (${total} breaches)`,
    html: emailShell({
      eyebrow: 'By registration report',
      title: 'Diff Plan Monitor — Registration Breach Alert',
      intro: `The following registration-level rows breached the configured ${compareLabel} threshold. One combined email is sent to the configured distribution list.`,
      meta: [
        { label: 'Comparison', value: compareLabel },
        { label: 'Report type', value: 'By registration' },
        { label: 'Period', value: options.periodLabel },
        { label: 'Over forecast', value: over.length.toLocaleString() },
        { label: 'Under forecast', value: under.length.toLocaleString() },
        { label: 'Total breaches', value: total.toLocaleString() },
        { label: 'Generated', value: options.generatedAt },
      ],
      tableHtml,
      footerNote: 'Recipients: configured distribution list only (no per-owner emails).',
    }),
  };
}

export function buildForecastChangeEmail(options: {
  changedBy: string;
  changes: Array<{
    ownerName: string;
    materialCode: string;
    materialDescription: string;
    plantCode?: string;
    period: string;
    oldQtyFcst: number | null;
    newQtyFcst: number;
  }>;
  generatedAt: string;
}) {
  const tableHtml = dataTable(
    ['Owner', 'Material code', 'Material description', 'Plant', 'Period', 'Previous forecast', 'New forecast', 'Change'],
    options.changes.map(change => {
      const delta = change.newQtyFcst - (change.oldQtyFcst ?? 0);
      const deltaLabel = `${delta >= 0 ? '+' : ''}${formatQty(delta)}`;
      return [
        escapeHtml(change.ownerName || '—'),
        escapeHtml(change.materialCode || '—'),
        escapeHtml(change.materialDescription || '—'),
        escapeHtml(change.plantCode || '—'),
        escapeHtml(change.period),
        formatQty(change.oldQtyFcst ?? 0),
        formatQty(change.newQtyFcst),
        deltaLabel,
      ];
    })
  );

  return {
    subject: `[UGT Sales Forecast] Forecast change report (${options.changes.length} cells)`,
    html: emailShell({
      eyebrow: 'Forecast change · By registration',
      title: 'Sales Forecast — Change Notification',
      intro: `Current Forecast values were updated by ${options.changedBy}. One combined email is sent to the ticked CC list below.`,
      meta: [
        { label: 'Report type', value: 'Forecast change (combined CC)' },
        { label: 'Changed by', value: options.changedBy },
        { label: 'Changed cells', value: String(options.changes.length) },
        { label: 'Generated', value: options.generatedAt },
      ],
      tableHtml,
      footerNote: 'Triggered after forecast commit or confirmed Excel import. Recipients: ticked CC list in Manage Email (no per-owner emails).',
    }),
  };
}
