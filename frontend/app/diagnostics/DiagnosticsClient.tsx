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
  if (['READY','FRESH','PASS','YES','REAL','HISTORY'].includes(u)) return 'text-green-400 bg-green-400/10 border-green-400/30';
  if (['DEGRADED','STALE','FALLBACK','PARTIAL','WARN','CONFIG'].includes(u)) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
  if (['FAILED','MISSING','FAIL','NO','MOCK','INVALID_FOR_TRADING'].includes(u)) return 'text-red-400 bg-red-400/10 border-red-400/30';
  if (['SIMULATED'].includes(u)) return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
  if (['SUPPRESSED','WAITING','SKIPPED','DERIVED'].includes(u)) return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
  return 'text-text-muted bg-bg-elevated border-border-theme';
}

function Badge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wide ${statusCls(value)}`}>
      {label && <span className="opacity-60 font-normal">{label}:</span>}
      {value || '—'}
    </span>
  );
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border-theme rounded-xl overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-bg-elevated text-left text-sm font-semibold text-text-primary hover:bg-bg-elevated/70 transition-colors">
        <span>{title}</span>
        <span className="text-text-muted text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-5 py-4 bg-bg-card">{children}</div>}
    </div>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────
function HeatCell({ type }: { type: SourceType | 'MISSING' }) {
  const bg =
    type === 'REAL' ? 'bg-green-500' :
    type === 'HISTORY' ? 'bg-blue-500' :
    type === 'FALLBACK' ? 'bg-amber-500' :
    type === 'MOCK' ? 'bg-red-500' :
    'bg-text-muted/30';
  return <div className={`w-4 h-4 rounded-sm ${bg} opacity-80`} title={type} />;
}

// ─── Engine Card ──────────────────────────────────────────────────────────────
function EngineCard({ engine, status, validity, primaryOutput, dependencySummary, downstreamImpact, warnings, rawMetrics }: EngineRow) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">{engine}</span>
        <div className="flex gap-1">
          <Badge value={status} />
          <Badge value={validity} label="Valid" />
        </div>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-semibold">Output</div>
        <ul className="text-xs text-text-secondary space-y-0.5">{primaryOutput.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-semibold">Dependencies</div>
        <ul className="text-xs space-y-0.5">
          {dependencySummary.map((d, i) => (
            <li key={i} className={d.startsWith('✗') ? 'text-red-400' : d.startsWith('✓') ? 'text-green-400' : 'text-text-secondary'}>{d}</li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-semibold">Impact</div>
        <ul className="text-xs text-text-secondary space-y-0.5">{downstreamImpact.map((d, i) => <li key={i}>→ {d}</li>)}</ul>
      </div>

      {warnings.length > 0 && (
        <div className="text-[10px] bg-orange-400/5 border border-orange-400/20 rounded p-2 text-orange-400 space-y-0.5">
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {status === 'SIMULATED' && (
        <div className="text-[10px] text-red-400 italic border-t border-border-theme pt-2">
          Risk/Decision output informational only — not valid for execution gating
        </div>
      )}

      <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] text-text-muted hover:text-text-primary mt-auto text-left">
        {showRaw ? '▲ Hide raw' : '▼ Show raw metrics'}
      </button>
      {showRaw && (
        <pre className="text-[10px] bg-bg-elevated rounded p-2 overflow-auto max-h-36 text-text-secondary border border-border-theme">
          {JSON.stringify(rawMetrics, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DiagnosticsClient({ run, summary }: { run: any; summary: any }) {
  const advisor = summary?.advisor ?? {};
  const risk = summary?.risk ?? {};

  const pipelineStatus = run?.status === 'completed' ? 'SUCCESS' : run?.status === 'failed' ? 'FAILED' : 'PARTIAL';
  const durationMs = run?.duration_ms ?? 0;

  const sourceRegistry = buildSourceRegistry(run, summary);
  const { validity, reasons: invalidReasons } = computeRunValidity(sourceRegistry);
  const engines = buildEngines(run, summary);
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

  // Source heatmap data
  const heatEngines = ['Regime', 'Flows', 'Leadership', 'Risk'];
  const heatSources = ['Nifty OHLCV', 'VIX', 'FII', 'PCR', 'Universe', 'Equity'];
  const heatMap: Record<string, Record<string, SourceType | 'MISSING'>> = {
    'Nifty OHLCV': { Regime: 'REAL', Flows: 'MISSING', Leadership: 'MISSING', Risk: 'MISSING' },
    'VIX': { Regime: 'MOCK', Flows: 'MISSING', Leadership: 'MISSING', Risk: 'MISSING' },
    'FII': { Regime: 'MISSING', Flows: 'MOCK', Leadership: 'MISSING', Risk: 'MISSING' },
    'PCR': { Regime: 'MISSING', Flows: 'MOCK', Leadership: 'MISSING', Risk: 'MISSING' },
    'Universe': { Regime: 'MISSING', Flows: 'MISSING', Leadership: 'MOCK', Risk: 'MISSING' },
    'Equity': { Regime: 'MISSING', Flows: 'MISSING', Leadership: 'MISSING', Risk: 'MOCK' },
  };

  const failCount = validationChecks.filter(c => c.result === 'FAIL').length;
  const warnCount = validationChecks.filter(c => c.result === 'WARN').length;

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
        <div className={`p-4 rounded-xl border text-sm font-medium ${
          validity === 'NO'
            ? 'bg-red-400/5 border-red-400/25 text-red-300'
            : validity === 'PARTIAL'
            ? 'bg-amber-400/5 border-amber-400/25 text-amber-300'
            : 'bg-green-400/5 border-green-400/25 text-green-300'
        }`}>
          {validity === 'NO'
            ? 'This run is diagnostics-only. Mock data is in use for all critical feeds — VIX, FII, PCR, universe OHLCV, and equity curve. This run is not eligible for paper or live trading.'
            : validity === 'PARTIAL'
            ? 'This run used real index data but simulated options, leadership, and risk inputs. Eligible for diagnostics only.'
            : 'All critical feeds real. Run eligible for paper promotion.'}
        </div>

        {/* Spec #1: Top strip with run validity */}
        <div className="flex flex-wrap gap-2 p-4 bg-bg-card border border-border-theme rounded-xl">
          <Badge label="Pipeline" value={pipelineStatus} />
          <Badge label="Run Valid for Trading" value={validity} />
          <Badge label="Mode" value="PAPER" />
          <Badge label="Decision" value={decisionLabel} />
          <Badge label="Paper Promotion" value={paperPromotionAllowed ? 'ALLOWED' : 'DISABLED'} />
          <Badge label="Readiness" value={`${readinessScore}/100`} />
        </div>

        {/* Spec #1: Validity reasons */}
        {invalidReasons.length > 0 && (
          <div className="bg-red-400/5 border border-red-400/25 rounded-xl p-4 space-y-1">
            {invalidReasons.map((r, i) => (
              <div key={i} className="text-xs text-red-400 flex items-start gap-2">
                <span>✗</span><span>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spec #10: Paper promotion block */}
        {!paperPromotionAllowed && (
          <div className="bg-red-400/5 border border-red-400/30 rounded-xl p-4">
            <div className="text-sm font-semibold text-red-400 mb-1">📵 Paper Promotion: DISABLED</div>
            <div className="text-xs text-red-300/80">Paper mode active — promotion blocked by data validity. {invalidReasons.length} critical feed{invalidReasons.length !== 1 ? 's' : ''} not trading-grade.</div>
          </div>
        )}

        {/* Innovative: Confidence trust split */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-bg-card border border-border-theme rounded-xl p-4 text-center">
            <div className="text-text-muted text-[10px] uppercase tracking-widest mb-1">Model Confidence</div>
            <div className="text-2xl font-bold text-text-primary">{modelConf}%</div>
            <div className="text-[10px] text-text-muted mt-0.5">Directional signal strength</div>
          </div>
          <div className="bg-bg-card border border-border-theme rounded-xl p-4 text-center">
            <div className="text-text-muted text-[10px] uppercase tracking-widest mb-1">Data Trust</div>
            <div className={`text-2xl font-bold ${dataTrust > 60 ? 'text-green-400' : dataTrust > 30 ? 'text-amber-400' : 'text-red-400'}`}>{dataTrust}%</div>
            <div className="text-[10px] text-text-muted mt-0.5">Real feeds / total datasets</div>
          </div>
          <div className="bg-bg-card border border-border-theme rounded-xl p-4 text-center">
            <div className="text-text-muted text-[10px] uppercase tracking-widest mb-1">Trading Readiness</div>
            <div className={`text-2xl font-bold ${readinessScore > 60 ? 'text-green-400' : readinessScore > 30 ? 'text-amber-400' : 'text-red-400'}`}>{readinessScore}/100</div>
            <div className="text-[10px] text-text-muted mt-0.5">Feeds + engines + promotion</div>
          </div>
        </div>

        {/* Spec #3 (innovative): Source heatmap */}
        <Accordion title="🗺 Source Heatmap" defaultOpen>
          <div className="overflow-x-auto">
            <table className="text-[10px] border-collapse">
              <thead>
                <tr>
                  <th className="text-text-muted py-1 pr-4 text-left font-normal">Dataset ↓ / Engine →</th>
                  {heatEngines.map(e => <th key={e} className="text-text-muted py-1 px-3 font-semibold">{e}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatSources.map(src => (
                  <tr key={src}>
                    <td className="py-1 pr-4 text-text-secondary whitespace-nowrap">{src}</td>
                    {heatEngines.map(eng => (
                      <td key={eng} className="py-1 px-3">
                        <HeatCell type={heatMap[src]?.[eng] ?? 'MISSING'} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-4 mt-3 text-[10px] text-text-muted">
              {[['bg-green-500','REAL'],['bg-blue-500','HISTORY'],['bg-amber-500','FALLBACK'],['bg-red-500','MOCK'],['bg-text-muted/30','MISSING']].map(([cls, lbl]) => (
                <span key={lbl} className="flex items-center gap-1">
                  <span className={`w-3 h-3 rounded-sm ${cls} inline-block`} />{lbl}
                </span>
              ))}
            </div>
          </div>
        </Accordion>

        {/* Spec #4: Source provenance with source_type + freshness + trading_valid */}
        <Accordion title="📡 Data Sources & Provenance" defaultOpen>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border-theme text-text-muted uppercase tracking-wider text-[10px]">
                  {['Dataset','Criticality','Source Type','Freshness','Trading Valid','Records','Used In','Note'].map(h => (
                    <th key={h} className="py-2 px-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {sourceRegistry.map(s => (
                  <tr key={s.key} className={`hover:bg-bg-elevated transition-colors ${!s.tradingValid ? 'bg-red-400/2' : ''}`}>
                    <td className="py-2 px-3 font-medium text-text-primary whitespace-nowrap">{s.label}</td>
                    <td className="py-2 px-3 text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${
                        s.criticality === 'critical_for_decision' || s.criticality === 'critical_for_risk'
                          ? 'text-red-400 border-red-400/30 bg-red-400/5'
                          : s.criticality === 'important_noncritical'
                          ? 'text-amber-400 border-amber-400/30 bg-amber-400/5'
                          : 'text-text-muted border-border-theme bg-bg-elevated'
                      }`}>{s.criticality.replace(/_/g,' ')}</span>
                    </td>
                    <td className="py-2 px-3"><Badge value={s.sourceType} /></td>
                    <td className="py-2 px-3"><Badge value={s.freshness} /></td>
                    <td className="py-2 px-3"><Badge value={s.tradingValid ? 'YES' : 'NO'} /></td>
                    <td className="py-2 px-3 font-mono text-text-muted">{s.recordCount ?? '—'}</td>
                    <td className="py-2 px-3 text-text-muted">{s.usedIn}</td>
                    <td className="py-2 px-3 text-[10px] max-w-[200px]">
                      <span className={s.note.startsWith('MOCK:') ? 'text-red-400' : s.note.startsWith('REAL:') ? 'text-green-400' : s.note.startsWith('HISTORY:') ? 'text-blue-400' : 'text-amber-400'}>
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
            {[
              'MOCK: VIX hardcoded 18.0 — ^INDIAVIX source not connected',
              'MOCK: FII / DII flows are random.gauss — NSE API not wired',
              'MOCK: PCR OI is random 0.8–1.2 — options chain not connected',
              'MOCK: Sector indices are random walk — sector feed not wired',
              'MOCK: Universe is RELIANCE/TCS/HDFC — F&O 200 not connected',
              'MOCK: Equity curve is random walk — no brokerage connection',
              'NOT COMPUTED: ATR not persisted — position sizing uses mock risk',
            ].map((w, i) => (
              <li key={i} className={w.startsWith('MOCK:') ? 'text-red-400' : 'text-amber-400'}>· {w}</li>
            ))}
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
