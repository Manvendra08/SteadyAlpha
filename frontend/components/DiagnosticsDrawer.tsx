'use client';
import React, { useState } from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

type Props = { diagnostics: DashboardViewModel['diagnostics'] };

function Badge({ v, small }: { v: string; small?: boolean }) {
  const cls =
    ['PASS','loaded','FRESH','SUCCESS'].includes(v) ? 'text-green-400 bg-green-400/10 border-green-400/30' :
    ['WARN','FALLBACK','fallback','STALE','cached'].includes(v) ? 'text-amber-400 bg-amber-400/10 border-amber-400/30' :
    ['FAIL','FAILED','MISSING','failed'].includes(v) ? 'text-red-400 bg-red-400/10 border-red-400/30' :
    ['skipped'].includes(v) ? 'text-text-muted bg-bg-elevated border-border-theme' :
    'text-blue-400 bg-blue-400/10 border-blue-400/30';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border font-bold ${small ? 'text-[9px]' : 'text-[10px]'} ${cls}`}>
      {v}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border-theme rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-bg-elevated text-left text-xs font-semibold text-text-secondary hover:bg-bg-elevated/80 transition-colors"
      >
        <span>{title}</span>
        <span className="text-text-muted text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-3 bg-bg-card">{children}</div>}
    </div>
  );
}

export default function DiagnosticsDrawer({ diagnostics }: Props) {
  const [open, setOpen] = useState(false);
  const { runId, durationMs, pipelineVersion, triggerType, sourceRegistry, validationChecks, engineWarnings, rawDataPreviews } = diagnostics;

  const passCount = validationChecks.filter(c => c.result === 'PASS').length;
  const failCount = validationChecks.filter(c => c.result === 'FAIL').length;
  const warnCount = validationChecks.filter(c => c.result === 'WARN').length;

  return (
    <div className="mt-4 border-t border-border-theme pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-text-muted text-xs font-semibold uppercase tracking-widest hover:text-text-secondary transition-colors"
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>Diagnostics Drawer</span>
        <div className="flex items-center gap-1 ml-2 normal-case tracking-normal">
          {failCount > 0 && <Badge v="FAIL" small />}
          {warnCount > 0 && <Badge v="WARN" small />}
          {failCount === 0 && warnCount === 0 && <Badge v="PASS" small />}
        </div>
      </button>

      {open && (
        <div className="mt-3 space-y-2">

          {/* 1. Run metadata */}
          <Section title="📋 Run Metadata">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div>
                <div className="text-text-muted text-[10px] mb-0.5">Run ID</div>
                <div className="text-text-secondary break-all text-[10px]">{runId}</div>
              </div>
              <div>
                <div className="text-text-muted text-[10px] mb-0.5">Duration</div>
                <div className="text-text-primary">{durationMs}ms</div>
              </div>
              <div>
                <div className="text-text-muted text-[10px] mb-0.5">Pipeline</div>
                <div className="text-text-primary">{pipelineVersion}</div>
              </div>
              <div>
                <div className="text-text-muted text-[10px] mb-0.5">Trigger</div>
                <div className="text-text-primary">{triggerType || 'SCHEDULED'}</div>
              </div>
            </div>
          </Section>

          {/* 2. Source provenance */}
          <Section title={`📡 Source Provenance (${sourceRegistry.length} datasets)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-theme text-text-muted uppercase tracking-wider">
                    {['Dataset','Provider','Scope','Market Date','Freshness','Records','Used In','Note'].map(h => (
                      <th key={h} className="py-1.5 px-2 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-theme">
                  {sourceRegistry.map(s => (
                    <tr key={s.datasetKey} className="hover:bg-bg-elevated transition-colors">
                      <td className="py-1.5 px-2 font-medium text-text-secondary whitespace-nowrap">{s.datasetLabel}</td>
                      <td className="py-1.5 px-2 text-text-muted font-mono">{s.provider}</td>
                      <td className="py-1.5 px-2 text-text-muted max-w-[120px] truncate" title={s.scope}>{s.scope}</td>
                      <td className="py-1.5 px-2 text-text-muted">{s.marketDate ?? '—'}</td>
                      <td className="py-1.5 px-2"><Badge v={s.freshness} small /></td>
                      <td className="py-1.5 px-2 text-text-muted font-mono">{s.recordCount ?? '—'}</td>
                      <td className="py-1.5 px-2 text-text-muted">{s.usedIn}</td>
                      <td className="py-1.5 px-2 text-amber-400 max-w-[160px] truncate" title={s.note ?? ''}>{s.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* 3. Validation checks */}
          <Section title={`✅ Validation Checks — ${passCount}P ${warnCount}W ${failCount}F`}>
            <div className="space-y-1.5">
              {validationChecks.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{c.label}</span>
                  <div className="flex items-center gap-2 ml-3">
                    {c.note && <span className="text-[10px] text-text-muted font-mono">{c.note}</span>}
                    <Badge v={c.result} small />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Engine warnings */}
          <Section title={`⚠️ Engine Warnings (${engineWarnings.length})`}>
            {engineWarnings.length === 0 ? (
              <div className="text-xs text-text-muted italic">No warnings this run</div>
            ) : (
              <ul className="space-y-1 text-xs text-amber-400">
                {engineWarnings.map((w, i) => <li key={i}>· {w}</li>)}
              </ul>
            )}
          </Section>

          {/* 5. Raw metric details */}
          <Section title="🔬 Raw Engine Metrics">
            <div className="text-[10px] text-text-muted italic">
              Detailed engine metrics available on the{' '}
              <a href="/diagnostics" className="text-blue-400 hover:underline">Diagnostics page →</a>
            </div>
          </Section>

        </div>
      )}
    </div>
  );
}
