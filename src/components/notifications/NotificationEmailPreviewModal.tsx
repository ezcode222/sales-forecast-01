import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Mail, Send, Users, X } from 'lucide-react';
import { cn } from '../../lib/utils';

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

function shortTabLabel(batch: EmailBatchPreview) {
  if (batch.id === 'forecast-change-cc') return 'CC combined';
  if (batch.id === 'overplan-aggregate') return 'Aggregate';
  if (batch.id === 'overplan-detail') return 'By registration';
  if (batch.reportType === 'forecast_change') {
    const recipient = batch.recipients[0];
    const forMatch = recipient?.displayName.match(/\(for (.+)\)$/);
    if (forMatch) return forMatch[1];
    const viaMatch = batch.title.match(/^Owner — (.+?) \(via /);
    if (viaMatch) return viaMatch[1];
    const ownerMatch = batch.title.match(/^Owner — (.+)$/);
    if (ownerMatch) return ownerMatch[1];
  }
  return batch.title.length > 32 ? `${batch.title.slice(0, 29)}…` : batch.title;
}

function batchKindLabel(batch: EmailBatchPreview) {
  if (batch.reportType === 'forecast_change') {
    return batch.id === 'forecast-change-cc' ? 'Combined CC' : 'Owner notification';
  }
  if (batch.reportType === 'aggregate') return 'Diff plan aggregate';
  return 'Diff plan by registration';
}

function RecipientAvatar({ name }: { readonly name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#007ABE]/10 text-[10px] font-semibold text-[#007ABE]">
      {initials}
    </div>
  );
}

export function NotificationEmailPreviewModal({
  open,
  batches,
  loading,
  sending = false,
  sendMessage,
  onSend,
  onClose,
}: {
  readonly open: boolean;
  readonly batches: EmailBatchPreview[];
  readonly loading: boolean;
  readonly sending?: boolean;
  readonly sendMessage?: { tone: 'success' | 'error'; text: string } | null;
  readonly onSend?: () => void;
  readonly onClose: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setActiveId(null);
  }, [open]);

  const activeBatch = useMemo(
    () => batches.find(batch => batch.id === (activeId ?? batches[0]?.id)) ?? batches[0] ?? null,
    [activeId, batches]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#007ABE]/10 text-[#007ABE]">
              <Mail size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">Email preview</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Review recipients and content before sending.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-16 text-sm text-slate-500">
            <Loader2 size={22} className="animate-spin text-[#007ABE]" />
            Building preview…
          </div>
        )}

        {!loading && batches.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-16 text-sm text-slate-500">
            No emails to preview for the current changes.
          </div>
        )}

        {!loading && batches.length > 0 && activeBatch && (
          <>
            {batches.length > 1 && (
              <div className="flex shrink-0 gap-1 border-b border-slate-100 bg-slate-50/60 px-4 py-2">
                {batches.map(batch => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => setActiveId(batch.id)}
                    title={batch.title}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      activeBatch.id === batch.id
                        ? 'bg-white text-[#007ABE] shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:bg-white/80 hover:text-slate-700'
                    )}
                  >
                    {shortTabLabel(batch)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
              <aside className="flex shrink-0 flex-col gap-4 overflow-auto border-b border-slate-100 bg-slate-50/40 p-4 lg:border-b-0 lg:border-r">
                <div>
                  <p className="text-[10px] font-medium text-slate-400">Type</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{batchKindLabel(activeBatch)}</p>
                </div>

                <div>
                  <p className="text-[10px] font-medium text-slate-400">Subject</p>
                  <p className="mt-0.5 text-sm leading-snug text-slate-700">{activeBatch.subject}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
                    <p className="text-[10px] text-slate-400">Rows</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-800">
                      {activeBatch.rowCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
                    <p className="text-[10px] text-slate-400">Recipients</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-800">
                      {activeBatch.recipients.length.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-1.5">
                    <Users size={12} className="text-slate-400" />
                    <p className="text-[10px] font-medium text-slate-400">Send to</p>
                  </div>
                  <div className="space-y-1.5">
                    {activeBatch.recipients.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-400">
                        No recipients configured.
                      </p>
                    ) : (
                      activeBatch.recipients.map(recipient => (
                        <div
                          key={`${recipient.email}-${recipient.source}`}
                          className="flex items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2"
                        >
                          <RecipientAvatar name={recipient.displayName} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-800">
                              {recipient.displayName}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">{recipient.email}</p>
                            <span className={cn(
                              'mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium',
                              recipient.source === 'owner'
                                ? 'bg-[#007ABE]/8 text-[#007ABE]'
                                : 'bg-slate-100 text-slate-500'
                            )}>
                              {recipient.source === 'owner' ? (
                                <><Bell size={9} /> Owner</>
                              ) : (
                                <><Users size={9} /> CC</>
                              )}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </aside>

              <div className="min-h-0 overflow-auto bg-slate-100/70 p-4">
                <iframe
                  title={activeBatch.subject}
                  srcDoc={activeBatch.html}
                  className="h-[min(68vh,760px)] w-full rounded-lg border border-slate-200/80 bg-white shadow-sm"
                />
              </div>
            </div>
          </>
        )}

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 px-5 py-3">
          <div className="min-w-0 flex-1">
            {sendMessage && (
              <p className={cn(
                'text-[11px] leading-relaxed',
                sendMessage.tone === 'error' ? 'text-rose-600' : 'text-emerald-600'
              )}>
                {sendMessage.text}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onSend && (
              <button
                type="button"
                onClick={onSend}
                disabled={sending || loading || batches.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#007ABE] px-4 text-xs font-semibold text-white transition-colors hover:bg-[#0069a3] disabled:opacity-50"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : 'Send'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
