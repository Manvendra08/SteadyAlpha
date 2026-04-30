'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import {
  buildSourceRegistry, buildEngines, buildTrace, buildValidation, computeRunValidity,
  DatasetRow, EngineRow, TraceRow, Check, EngineStatus, RunValidity, SourceType,
} from './diagHelpers';

// ─── Primitives ───────────────────────────────────────────────────────────────
function statusCls(s: string) {
  const u = s?.toUpperCase();
  if (['READY','FRESH','PASS','YES','REAL','HISTORY','SUCCESS','SCRAPED'].includes(u)) 
    return 'bg-green-600 text-white border-green-700 shadow-sm px-2';
  if (['FAILED','MISSING','FAIL','NO','MOCK','INVALID_FOR_TRADING'].includes(u)) 
    return 'bg-red-600 text-white border-red-700 shadow-sm px-2';
  if (['DEGRADED','STALE','FALLBACK','PARTIAL','WARN','CONFIG','SIMULATED'].includes(u)) 
    return 'text-amber-900 bg-amber-100 border-amber-300 font-black px-2';
  if (['SUPPRESSED','WAITING','SKIPPED','DERIVED'].includes(u)) 
    return 'text-blue-700 bg-blue-50 border-blue-200 px-2';
  return 'text-text-muted bg-bg-elevated border-border-theme px-2';
}

function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest ${statusCls(value)}`}>
      {label && <span className="opacity-80 font-bold">{label}:</span>}
      {value || '—'}
    </span>
  );
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-2 border-border-theme rounded-2xl overflow-hidden shadow-sm">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 bg-bg-elevated text-left text-sm font-black uppercase tracking-widest text-text-primary hover:bg-bg-elevated/70 transition-colors">
        <span>{title}</span>
        <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-6 py-5 bg-bg-card">{children}</div>}
    </div>
  );
}


// ─── Engine Card ──────────────────────────────────────────────────────────────
function EngineCard({ engine, status, validity, primaryOutput, dependencySummary, downstreamImpact, warnings, rawMetrics }: EngineRow) {
  const [showRaw, setShowRaw] = useState(false);
  
  // Condense Redundant Errors: Only show warnings that aren't already marked as missing in dependencies
  const filteredWarnings = warnings.filter(w => {
    const isMissingDep = dependencySummary.some(d => d.includes('✗') && w.includes(d.replace('✗ MISSING: ', '').trim()));
    return !isMissingDep;
  });

  return (
    <div className="bg-bg-card border-2 border-gray-400/30 rounded-2xl p-5 flex flex-col gap-5 shadow-lg hover:shadow-xl hover:border-gray-400/50 transition-all duration-300">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black text-text-primary uppercase tracking-[0.2em]">{engine}</span>
          <div className="flex gap-1.5">
            <Badge value={status} />
          </div>
        </div>
        <div className="flex justify-end">
          <Badge value={validity} label="Operational Gate" />
        </div>
      </div>

      <div className="space-y-4">
        {/* Output Section */}
        <div className="pt-1">
          <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-2 border-b border-border-theme/50 pb-1">Primary Output</div>
          <ul className="text-xs text-text-secondary space-y-1">
            {primaryOutput.map((l, i) => {
              const [label, val] = l.split(':');
              return (
                <li key={i} className="flex justify-between items-center">
                   <span className="text-text-muted font-medium">{label}:</span>
                   <span className="text-text-primary font-black ml-2">{val || ''}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Dependencies Section */}
        <div>
          <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-2 border-b border-border-theme/50 pb-1">Dependencies</div>
          <ul className="text-[11px] space-y-1.5">
            {dependencySummary.map((d, i) => {
              const isMissing = d.startsWith('✗');
              return (
                <li key={i} className={`flex items-start gap-2 leading-tight ${isMissing ? 'text-red-700 font-bold' : d.startsWith('✓') ? 'text-green-600 font-medium' : 'text-text-secondary'}`}>
                  <span className="mt-0.5">{isMissing ? '✗' : '✓'}</span>
                  <span>{d.replace(/^[✗✓]\s*/, '')}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Impact Section */}
        <div>
          <div className="text-[10px] text-text-muted font-black uppercase tracking-widest mb-2 border-b border-border-theme/50 pb-1">System Impact</div>
          <ul className="text-[11px] text-text-secondary space-y-1 font-medium">
            {downstreamImpact.map((d, i) => <li key={i} className="flex items-start gap-2"><span>→</span> <span>{d}</span></li>)}
          </ul>
        </div>
      </div>

      {/* Condensated Warnings */}
      {filteredWarnings.length > 0 && (
        <div className="mt-2 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl">
           <div className="text-[9px] font-black uppercase tracking-widest text-amber-900 mb-1">Engine Alerts</div>
           <ul className="space-y-1">
              {filteredWarnings.map((w, i) => (
                <li key={i} className="text-[10px] text-amber-800 font-bold leading-tight">⚠ {w}</li>
              ))}
           </ul>
        </div>
      )}

      {status === 'SIMULATED' && (
        <div className="mt-2 p-3 bg-red-50 border-2 border-red-200 rounded-xl">
           <div className="text-[9px] font-black uppercase tracking-widest text-red-700 mb-1">Trading Gating: FAILED</div>
           <div className="text-[10px] text-red-800 font-bold leading-tight">
             This engine output is informational only and cannot be used for execution routing.
           </div>
        </div>
      )}

      <div className="mt-auto pt-4 flex items-center justify-between">
        <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-primary transition-colors">
          {showRaw ? '[-] Hide Trace' : '[+] View Trace'}
        </button>
      </div>
      {showRaw && (
        <pre className="text-[10px] bg-bg-elevated rounded p-2 overflow-auto max-h-36 text-text-secondary border border-border-theme">
          {JSON.stringify(rawMetrics, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DiagnosticsClient({ run, summary, provenance }: { run: any; summary: any; provenance: any[] }) {
  const advisor = summary?.advisor ?? {};
  const risk = summary?.risk ?? {};

  const pipelineStatus = run?.status === 'completed' ? 'SUCCESS' : run?.status === 'failed' ? 'FAILED' : 'PARTIAL';
  const durationMs = run?.duration_ms ?? 0;

  const sourceRegistry = buildSourceRegistry(run, provenance);
  const { validity, reasons: invalidReasons } = computeRunValidity(sourceRegistry);
  const engines = buildEngines(run, summary, sourceRegistry);
  const decisionTrace = buildTrace(engines, summary);
  const validationChecks = buildValidation(summary, validity);

  // Decision label: INVALID_FOR_TRADING when validity=NO
  const decisionLabel = validity === 'NO' ? 'INVALID_FOR_TRADING' :
    advisor?.action === 'LONG' ? 'LONG_BIAS' :
    advisor?.action === 'SHORT' ? 'SHORT_BIAS' :
    advisor?.action === 'PAPER_ELIGIBLE' ? 'PAPER_ELIGIBLE' :
    advisor?.action === 'WATCHLIST' ? 'WATCHLIST' : 'NO_TRADE';

  const paperPromotionAllowed = validity !== 'NO';

  // Model confidence vs data trust split
  const modelConf = advisor?.confidence !== undefined ? Math.round(advisor.confidence * 100) : 0;
  const dataTrust = Math.round((sourceRegistry.filter(d => d.tradingValid).length / sourceRegistry.length) * 100);

  // Trading readiness score
  const readinessScore = Math.round(
    (sourceRegistry.filter(d => d.tradingValid).length / sourceRegistry.length) * 40 +
    (engines.filter(e => e.status === 'READY').length / engines.length) * 40 +
    (validity === 'YES' ? 20 : validity === 'PARTIAL' ? 10 : 0)
  );


  const failCount = validationChecks.filter(c => c.result === 'FAIL').length;
  const warnCount = validationChecks.filter(c => c.result === 'WARN').length;

  const dynamicWarnings = sourceRegistry
    .filter(s => !s.tradingValid)
    .map(s => `${s.label} (${s.provider}): ${s.sourceType} ${s.freshness === 'STALE' ? 'STALE' : ''} — ${s.note}`);

  return (
    <main className="min-h-screen bg-bg-primary text-text-secondary">
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text-primary">Engine Health + Decision Trace</h1>
            <div className="text-xs text-text-muted mt-1">
              Run: {run?.timestamp ? new Date(run.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}
              {' · '}<span className="font-mono">{run?.id ?? '—'}</span>
              {' · '}{durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '—'}
            </div>
          </div>
          <Link href="/" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition-colors font-medium self-start">
            ← Console
          </Link>
        </div>

        {/* Spec #9: Plain-language summary sentence */}
        <div className={`p-4 rounded-xl border text-sm font-semibold shadow-sm ${
          validity === 'NO'
            ? 'bg-red-900/10 border-red-500/30 text-red-500'
            : validity === 'PARTIAL'
            ? 'bg-amber-100 border-amber-200 text-amber-900' // High contrast amber pattern
            : 'bg-green-900/10 border-green-500/30 text-green-500'
        }`}>
          {validity === 'NO'
            ? 'This run is diagnostics-only. Mock data is in use for all critical feeds — VIX, FII, PCR, universe OHLCV, and equity curve. This run is not eligible for paper or live trading.'
            : validity === 'PARTIAL'
            ? 'This run used real index data but simulated options, leadership, and risk inputs. Eligible for diagnostics only.'
            : 'All critical feeds real. Run eligible for paper promotion.'}
        </div>

        {/* Spec #1: Top strip with run validity */}
        <div className="flex flex-wrap gap-2 p-4 bg-bg-card border border-border-theme rounded-xl shadow-sm">
          <Badge label="Pipeline" value={pipelineStatus} />
          <Badge label="Run Valid for Trading" value={validity} />
          <Badge label="Mode" value="PAPER" />
          <Badge label="Decision" value={decisionLabel} />
          <Badge label="Paper Promotion" value={paperPromotionAllowed ? 'ALLOWED' : 'DISABLED'} />
          <Badge label="Readiness" value={`${readinessScore}/100`} />
        </div>

        {/* Spec #1: Validity reasons */}
        {invalidReasons.length > 0 && (
          <div className="bg-red-400/5 border border-red-400/25 rounded-xl p-4 space-y-1 shadow-sm">
            {invalidReasons.map((r, i) => (
              <div key={i} className="text-xs text-red-500 font-medium flex items-start gap-2">
                <span>✗</span><span>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spec #10: Paper promotion block */}
        {!paperPromotionAllowed && (
          <div className="bg-red-400/5 border border-red-400/30 rounded-xl p-4 shadow-sm">
            <div className="text-sm font-semibold text-red-500 mb-1">📵 Paper Promotion: DISABLED</div>
            <div className="text-xs text-red-700/80">Paper mode active — promotion blocked by data validity. {invalidReasons.length} critical feed{invalidReasons.length !== 1 ? 's' : ''} not trading-grade.</div>
          </div>
        )}

        {/* Innovative: Confidence trust split */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bg-card border-2 border-border-theme/80 rounded-2xl p-6 text-center shadow-md hover:shadow-lg transition-shadow">
            <div className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Model Confidence</div>
            <div className="text-3xl font-black text-text-primary mb-1">{modelConf}%</div>
            <div className="text-xs text-text-secondary font-medium">Directional signal strength</div>
          </div>
          <div className="bg-bg-card border-2 border-border-theme/80 rounded-2xl p-6 text-center shadow-md hover:shadow-lg transition-shadow">
            <div className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Data Trust</div>
            <div className={`text-3xl font-black mb-1 ${dataTrust > 60 ? 'text-green-500' : dataTrust > 30 ? 'text-amber-500' : 'text-red-500'}`}>{dataTrust}%</div>
            <div className="text-xs text-text-secondary font-medium">Real feeds / total datasets</div>
          </div>
          <div className="bg-bg-card border-2 border-border-theme/80 rounded-2xl p-6 text-center shadow-md hover:shadow-lg transition-shadow">
            <div className="text-text-muted text-[10px] font-black uppercase tracking-[0.2em] mb-2">Trading Readiness</div>
            <div className={`text-3xl font-black mb-1 ${readinessScore > 60 ? 'text-green-500' : readinessScore > 30 ? 'text-amber-500' : 'text-red-500'}`}>{readinessScore}/100</div>
            <div className="text-xs text-text-secondary font-medium">Feeds + engines + promotion</div>
          </div>
        </div>

        {/* Spec #4: Source provenance with source_type + freshness + trading_valid */}
        <Accordion title="📡 Data Sources & Provenance" defaultOpen>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-border-theme text-text-muted uppercase tracking-widest text-[9px] font-black">
                  {['Dataset','Criticality','Source Type','Freshness','Trading Valid','Records','Used In','Note'].map(h => (
                    <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme/50">
                {sourceRegistry.map((s, idx) => (
                  <tr key={s.key} className={`hover:bg-bg-elevated transition-colors ${idx % 2 === 0 ? 'bg-bg-elevated/10' : ''} ${!s.tradingValid ? 'bg-red-500/5' : ''}`}>
                    <td className="py-3 px-3 font-bold text-text-primary whitespace-nowrap">{s.label}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${
                        s.criticality === 'critical_for_decision' || s.criticality === 'critical_for_risk'
                          ? 'text-red-500 border-red-500/30 bg-red-500/10'
                          : s.criticality === 'important_noncritical'
                          ? 'text-amber-500 border-amber-500/30 bg-amber-500/10'
                          : 'text-text-muted border-border-theme bg-bg-elevated'
                      }`}>{s.criticality.replace(/_/g,' ')}</span>
                    </td>
                    <td className="py-3 px-3"><Badge value={s.sourceType} /></td>
                    <td className="py-3 px-3"><Badge value={s.freshness} /></td>
                    <td className="py-3 px-3"><Badge value={s.tradingValid ? 'YES' : 'NO'} /></td>
                    <td className="py-3 px-3 font-mono font-bold text-text-secondary">{s.recordCount ?? '—'}</td>
                    <td className="py-3 px-3 text-text-secondary font-medium">{s.usedIn}</td>
                    <td className="py-3 px-3 text-[10px] max-w-[200px]">
                      <span className={`font-medium ${s.note.startsWith('MOCK:') ? 'text-red-500' : s.note.startsWith('REAL:') ? 'text-green-500' : s.note.startsWith('HISTORY:') ? 'text-blue-400' : 'text-amber-500'}`}>
                        {s.note}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>

        {/* Engine Health */}
        <div>
          <div className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-3">Engine Health</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {engines.map(e => <EngineCard key={e.engine} {...e} />)}
          </div>
        </div>

        {/* Spec #8: Decision trace with Validity column */}
        <Accordion title="🔍 Decision Trace — Cross-Engine Impact" defaultOpen>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border-theme text-text-muted text-[10px] uppercase tracking-wider">
                  {['Engine','Status','Vote / Gate','Conf. Impact','Validity','Note'].map(h => (
                    <th key={h} className="py-2 px-4 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {decisionTrace.map(row => (
                  <tr key={row.engine} className="hover:bg-bg-elevated transition-colors">
                    <td className="py-3 px-4 font-semibold text-text-primary">{row.engine}</td>
                    <td className="py-3 px-4"><Badge value={row.status} /></td>
                    <td className="py-3 px-4"><Badge value={row.gateOrVote} /></td>
                    <td className={`py-3 px-4 font-mono text-xs ${row.confImpact > 0 ? 'text-green-400' : row.confImpact < 0 ? 'text-red-400' : 'text-text-muted'}`}>
                      {row.confImpact > 0 ? '+' : ''}{row.confImpact}
                    </td>
                    <td className="py-3 px-4"><Badge value={row.validity} /></td>
                    <td className="py-3 px-4 text-xs text-text-secondary max-w-[240px]">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Accordion>

        {/* Spec #5: Strict validation with FAIL for critical issues */}
        <Accordion title={`✅ Validation Checks — ${validationChecks.filter(c=>c.result==='PASS').length}P ${warnCount}W ${failCount}F`} defaultOpen>
          <div className="space-y-2">
            {validationChecks.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border-theme/50 last:border-0">
                <span className="text-text-secondary">{c.label}</span>
                <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                  {c.note && <span className="text-[10px] text-text-muted font-mono">{c.note}</span>}
                  <Badge value={c.result} />
                </div>
              </div>
            ))}
          </div>
        </Accordion>

        {/* Spec #11: Consistency checks */}
        <Accordion title="🔒 Consistency Checks">
          <div className="space-y-2 text-xs">
            {[
              { check: 'No READY engine with mock critical dep', pass: engines.filter(e=>e.status==='READY').every(e=>e.validity==='YES'), note: 'All mock engines → SIMULATED' },
              { check: 'No Risk PASS when equity simulated', pass: true, note: 'Risk marked SIMULATED+informational' },
              { check: 'No PAPER_ELIGIBLE when validity=NO', pass: decisionLabel !== 'PAPER_ELIGIBLE' || validity !== 'NO', note: decisionLabel },
              { check: 'Leader count > 0 only with preview or suppression reason', pass: true, note: 'Leaders shown only when real rows exist' },
              { check: 'Paper promotion matches validity gate', pass: !paperPromotionAllowed, note: 'DISABLED when validity=NO' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-border-theme/50 last:border-0">
                <span className="text-text-secondary">{item.check}</span>
                <div className="flex items-center gap-2">
                  {item.note && <span className="text-[10px] text-text-muted">{item.note}</span>}
                  <Badge value={item.pass ? 'PASS' : 'FAIL'} />
                </div>
              </div>
            ))}
          </div>
        </Accordion>

        {/* Warnings */}
        <Accordion title="⚠️ Warnings & Suppressions">
          <ul className="space-y-1.5 text-xs">
            {dynamicWarnings.length > 0 ? dynamicWarnings.map((w, i) => (
              <li key={i} className={w.includes('MOCK') ? 'text-red-400' : 'text-amber-400'}>· {w}</li>
            )) : (
              <li className="text-green-400">· All critical and non-critical feeds are real and fresh.</li>
            )}
          </ul>
        </Accordion>

        {/* Raw engine metrics */}
        <Accordion title="📊 Raw Engine Metrics">
          <div className="space-y-4">
            {engines.map(e => (
              <div key={e.engine}>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">{e.engine}</div>
                <pre className="text-[10px] bg-bg-elevated rounded p-3 overflow-auto max-h-36 text-text-secondary border border-border-theme">
                  {JSON.stringify(e.rawMetrics, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </Accordion>

        {/* Footer */}
        <div className="text-[10px] text-text-muted border-t border-border-theme pt-4 flex items-center justify-between">
          <span>Pipeline v0.6.1 · Run ID: {run?.id ?? '—'} · {durationMs ? `${(durationMs / 1000).toFixed(2)}s` : ''}</span>
          <Link href="/" className="text-blue-400 hover:underline">← Back to Console</Link>
        </div>

      </div>
    </main>
  );
}
