import React, { useMemo } from 'react';
import { Mail, Play, Save } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { OverplanConfig } from '../../lib/api';
import { SfSelect } from '../ui/SfSelect';

const inputClass = cn(
  'h-7 rounded-md border border-slate-200 bg-white px-2 text-xs font-mono tabular-nums text-slate-800',
  'focus:border-[#007ABE] focus:outline-none focus:ring-1 focus:ring-[#007ABE]/20',
  'disabled:bg-slate-50 disabled:text-slate-400'
);

const ACTUAL_SOURCE = 'Actual';

function ThresholdToggle({
  enabled,
  label,
  tone,
  onToggle,
}: {
  readonly enabled: boolean;
  readonly label: string;
  readonly tone: 'rose' | 'amber';
  onToggle: () => void;
}) {
  const activeRing = tone === 'rose' ? 'bg-rose-500' : 'bg-amber-500';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors duration-200',
        enabled ? activeRing : 'bg-slate-200'
      )}
      title={`${enabled ? 'Disable' : 'Enable'} ${label}`}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-3 w-3 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-3.5' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}

function Divider() {
  return <div className="mx-1 hidden h-5 w-px shrink-0 bg-slate-200 lg:block" />;
}

export function OverplanActionButtons({
  saving,
  running,
  notifying,
  compareInvalid,
  onSave,
  onRun,
  onPreviewEmail,
}: {
  readonly saving: boolean;
  readonly running: boolean;
  readonly notifying: boolean;
  readonly compareInvalid: boolean;
  readonly onSave: () => void;
  readonly onRun: () => void;
  readonly onPreviewEmail: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || compareInvalid}
        title="Save settings"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        <Save size={12} />
        <span>{saving ? 'Saving…' : 'Save'}</span>
      </button>
      <button
        type="button"
        onClick={onRun}
        disabled={running || compareInvalid}
        className="inline-flex h-7 items-center gap-1 rounded-md bg-[#007ABE] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#0069a3] disabled:opacity-50"
      >
        <Play size={12} className={running ? 'animate-pulse' : undefined} />
        {running ? 'Checking…' : 'Run check'}
      </button>
      <button
        type="button"
        onClick={onPreviewEmail}
        disabled={notifying || compareInvalid}
        title="Send diff plan email"
        className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
      >
        <Mail size={12} />
        <span>{notifying ? 'Loading…' : 'Send email'}</span>
      </button>
    </div>
  );
}

export function OverplanSettingsBar({
  config,
  forecastVersions,
  startMonth,
  endMonth,
  onConfigChange,
  onStartMonthChange,
  onEndMonthChange,
}: {
  readonly config: OverplanConfig;
  readonly forecastVersions: string[];
  readonly startMonth: string;
  readonly endMonth: string;
  readonly onConfigChange: (patch: Partial<OverplanConfig>) => void;
  readonly onStartMonthChange: (value: string) => void;
  readonly onEndMonthChange: (value: string) => void;
}) {
  const compareOptions = useMemo(
    () => [ACTUAL_SOURCE, ...forecastVersions.filter(version => version !== ACTUAL_SOURCE)],
    [forecastVersions]
  );

  return (
    <section className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400">From</span>
            <input
              type="month"
              value={startMonth}
              onChange={event => onStartMonthChange(event.target.value)}
              className={cn(inputClass, 'w-[118px]')}
            />
            <span className="text-slate-300">—</span>
            <span className="text-[10px] font-medium text-slate-400">To</span>
            <input
              type="month"
              value={endMonth}
              onChange={event => onEndMonthChange(event.target.value)}
              className={cn(inputClass, 'w-[118px]')}
            />
          </div>

          <Divider />

          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400">Compare</span>
            <SfSelect
              className="w-[8.5rem] max-w-[9.5rem]"
              value={config.compareLeft ?? 'Actual'}
              onChange={value => onConfigChange({ compareLeft: value })}
              options={compareOptions.map(option => ({
                value: option,
                label: option,
                disabled: option === config.compareRight,
              }))}
              aria-label="Compare left"
            />
            <span className="text-[10px] font-medium text-slate-400">vs</span>
            <SfSelect
              className="w-[8.5rem] max-w-[9.5rem]"
              value={config.compareRight ?? 'Current Forecast'}
              onChange={value => onConfigChange({ compareRight: value })}
              options={compareOptions.map(option => ({
                value: option,
                label: option,
                disabled: option === config.compareLeft,
              }))}
              aria-label="Compare right"
            />
          </div>

          <Divider />

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold text-rose-600">Above</span>
            <ThresholdToggle
              enabled={config.aboveEnabled}
              label="above forecast"
              tone="rose"
              onToggle={() => onConfigChange({ aboveEnabled: !config.aboveEnabled })}
            />
            <span className="text-[10px] text-slate-400">Ton</span>
            <input
              type="number"
              min={0}
              step="any"
              disabled={!config.aboveEnabled}
              value={config.aboveThresholdTon ?? ''}
              onChange={event => {
                const next = event.target.value.trim();
                onConfigChange({ aboveThresholdTon: next === '' ? null : Number(next) });
              }}
              className={cn(inputClass, 'w-14')}
            />
            <span className="text-[10px] text-slate-400">%</span>
            <input
              type="number"
              min={0}
              step="any"
              disabled={!config.aboveEnabled}
              value={config.aboveThresholdPercent ?? ''}
              onChange={event => {
                const next = event.target.value.trim();
                onConfigChange({ aboveThresholdPercent: next === '' ? null : Number(next) });
              }}
              className={cn(inputClass, 'w-14')}
            />
          </div>

          <Divider />

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold text-amber-700">Below</span>
            <ThresholdToggle
              enabled={config.belowEnabled}
              label="below forecast"
              tone="amber"
              onToggle={() => onConfigChange({ belowEnabled: !config.belowEnabled })}
            />
            <span className="text-[10px] text-slate-400">Ton</span>
            <input
              type="number"
              min={0}
              step="any"
              disabled={!config.belowEnabled}
              value={config.belowThresholdTon ?? ''}
              onChange={event => {
                const next = event.target.value.trim();
                onConfigChange({ belowThresholdTon: next === '' ? null : Number(next) });
              }}
              className={cn(inputClass, 'w-14')}
            />
            <span className="text-[10px] text-slate-400">%</span>
            <input
              type="number"
              min={0}
              step="any"
              disabled={!config.belowEnabled}
              value={config.belowThresholdPercent ?? ''}
              onChange={event => {
                const next = event.target.value.trim();
                onConfigChange({ belowThresholdPercent: next === '' ? null : Number(next) });
              }}
              className={cn(inputClass, 'w-14')}
            />
          </div>
        </div>
    </section>
  );
}
