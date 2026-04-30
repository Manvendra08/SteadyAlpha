'use client';
import React, { useState } from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

type Props = { diagnostics: DashboardViewModel['diagnostics'] };

function Badge({ v, small }: { v: string; small?: boolean }) {
  const cls =
    ['PASS','loaded','FRESH','SUCCESS','REAL','HISTORY','SCRAPED','YES'].includes(v) ? 'bg-green-600 text-white border-green-700 shadow-sm' :
    ['WARN','FALLBACK','fallback','STALE','cached','MOCK','PARTIAL'].includes(v) ? 'text-amber-900 bg-amber-100 border-amber-300 font-black' :
    ['FAIL','FAILED','MISSING','failed','NO'].includes(v) ? 'bg-red-600 text-white border-red-700 shadow-sm' :
    ['skipped','N/A'].includes(v) ? 'text-text-muted bg-bg-elevated border-border-theme' :
    'text-blue-700 bg-blue-50 border-blue-200 font-black';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border uppercase tracking-tighter ${small ? 'text-[8px]' : 'text-[9px]'} ${cls} font-black`}>
      {v}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border-theme rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-elevated text-left text-xs font-black uppercase tracking-widest text-text-primary hover:bg-bg-elevated/80 transition-colors"
      >
        <span>{title}</span>
        <span className="text-text-muted text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-4 py-4 bg-bg-card">{children}</div>}
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
    <div className="mt-6 border-t border-border-theme pt-6">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-text-muted text-[10px] font-black uppercase tracking-[0.2em] hover:text-text-primary transition-colors group"
      >
        <span className="group-hover:translate-x-1 transition-transform">{open ? '▼' : '▶'}</span>
        <span>Advanced Diagnostics</span>
        <div className="flex items-center gap-1 ml-4 normal-case tracking-normal">
          {failCount > 0 && <Badge v="FAIL" small />}
          {warnCount > 0 && <Badge v="WARN" small />}
          {failCount === 0 && warnCount === 0 && <Badge v="PASS" small />}
        </div>
      </button>

      {open && (
        <div className="mt-4 space-y-4">

          {/* 1. Run metadata */}
          <Section title="📋 Execution Metadata">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div className="bg-bg-elevated/50 p-2 rounded-lg border border-border-theme/50">
                <div className="text-text-muted text-[9px] font-black uppercase tracking-widest mb-1">Run ID</div>
                <div className="text-text-secondary break-all text-[9px] font-bold">{runId}</div>
              </div>
              <div className="bg-bg-elevated/50 p-2 rounded-lg border border-border-theme/50">
                <div className="text-text-muted text-[9px] font-black uppercase tracking-widest mb-1">Duration</div>
                <div className="text-text-primary font-black">{durationMs}ms</div>
              </div>
              <div className="bg-bg-elevated/50 p-2 rounded-lg border border-border-theme/50">
                <div className="text-text-muted text-[9px] font-black uppercase tracking-widest mb-1">Engine Version</div>
                <div className="text-text-primary font-black">{pipelineVersion}</div>
              </div>
              <div className="bg-bg-elevated/50 p-2 rounded-lg border border-border-theme/50">
                <div className="text-text-muted text-[9px] font-black uppercase tracking-widest mb-1">Trigger Path</div>
                <div className="text-text-primary font-black">{triggerType || 'SCHEDULED'}</div>
              </div>
            </div>
          </Section>

          {/* 2. Source provenance */}
          <Section title={`📡 Source Provenance Matrix (${sourceRegistry.length} datasets)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-border-theme text-text-muted uppercase tracking-widest font-black">
                    {['Dataset','Criticality','Source / Freshness','Trading Valid','Records','Used In','Note'].map(h => (
                      <th key={h} className="py-2.5 px-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-theme/30">
                  {sourceRegistry.map((s, idx) => {
                    const isCritical = s.usedIn === 'Regime' || s.usedIn === 'Risk' || s.usedIn === 'Leadership';
                    const tradingValid = s.sourceType === 'REAL' || s.sourceType === 'SCRAPED';
                    const noteText =
                      s.note ? s.note :
                      s.sourceType === 'REAL' ? `REAL: ${s.provider} loaded` :
                      s.sourceType === 'MISSING' ? 'MISSING: all sources failed' :
                      s.sourceType === 'CACHED' ? `CACHED: stale data from prior run` :
                      '';
                    const noteCls =
                      s.sourceType === 'MISSING' ? 'text-red-500' :
                      s.sourceType === 'REAL'    ? 'text-green-500' :
                      s.sourceType === 'SCRAPED' ? 'text-green-500' :
                      'text-amber-600';
                    return (
                      <tr key={s.datasetKey} className={`hover:bg-bg-elevated transition-colors ${idx % 2 === 0 ? 'bg-bg-elevated/20' : ''}`}>
                        <td className="py-2.5 px-3 font-bold text-text-primary whitespace-nowrap">{s.datasetLabel}</td>
                        <td className="py-2.5 px-3">
                          <span className={`inline-block px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${
                            isCritical
                              ? 'text-red-500 bg-red-500/10 border-red-500/30'
                              : 'text-amber-600 bg-amber-600/10 border-amber-600/30'
                          }`}>
                            {isCritical ? 'critical path' : 'non-critical'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex gap-1 items-center">
                            <Badge v={s.sourceType} small />
                            <span className="text-text-muted opacity-50">/</span>
                            <Badge v={s.freshness} small />
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge v={tradingValid ? 'YES' : 'NO'} small />
                        </td>
                        <td className="py-2.5 px-3 text-text-secondary font-mono font-bold">{s.recordCount ?? '—'}</td>
                        <td className="py-2.5 px-3 text-text-secondary font-medium uppercase tracking-tighter">{s.usedIn}</td>
                        <td className={`py-2.5 px-3 max-w-[200px] truncate text-[9px] font-medium ${noteCls}`} title={noteText}>{noteText}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[10px] text-text-muted flex flex-wrap gap-4">
              <span className="font-semibold uppercase tracking-wider">Legend:</span>
              <span className="flex items-center gap-1"><Badge v="REAL" small /> <Badge v="FRESH" small /> <span className="opacity-70">Production ready</span></span>
              <span className="flex items-center gap-1"><Badge v="SCRAPED" small /> <span className="opacity-70">Validated scrape (tradeable)</span></span>
              <span className="flex items-center gap-1"><Badge v="MOCK" small /> <Badge v="N/A" small /> <span className="opacity-70">Simulation only</span></span>
              <span className="flex items-center gap-1"><Badge v="MISSING" small /> <span className="opacity-70">Data fault</span></span>
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
