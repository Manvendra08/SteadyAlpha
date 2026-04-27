import React from 'react';
import { DashboardViewModel, EngineStatus } from '../types/DashboardViewModel';

function EngineStatusBadge({ status }: { status: EngineStatus }) {
  const cls = {
    READY: 'text-green-400 bg-green-400/10 border-green-400/30',
    DEGRADED: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    SUPPRESSED: 'text-text-muted bg-bg-elevated border-border-theme',
    WAITING: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    FAILED: 'text-red-400 bg-red-400/10 border-red-400/30',
  }[status] ?? 'text-text-muted bg-bg-elevated border-border-theme';

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-bold tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function FreshnessDot({ f }: { f: string }) {
  const col = f === 'FRESH' ? 'bg-green-400' : f === 'FALLBACK' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${col} mr-1`} />;
}

export default function FlowsCard({
  bias, fii5dNet, dii5dNet, pcrOi, maxPain, spotVsMaxPainPct, sectorAlignment,
  freshness, biasDrivers, engineStatus, dependency, impact, warning,
}: DashboardViewModel['flows']) {
  const biasColor =
    bias === 'BULLISH' ? 'text-green-400' :
    bias === 'BEARISH' ? 'text-red-400' :
    'text-amber-400';

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4 flex flex-col gap-3 hover:border-border-theme/70 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Flows Engine</h2>
          <FreshnessDot f={freshness} />
        </div>
        <EngineStatusBadge status={engineStatus} />
      </div>

      {/* Bias hero */}
      <div className={`text-lg font-bold tracking-tight ${biasColor}`}>{bias}</div>

      {/* Metrics */}
      <div className="space-y-1.5 text-xs text-text-secondary">
        <div className="flex justify-between">
          <span className="text-text-muted">FII 5D Net</span>
          <span className="font-mono">{fii5dNet !== null ? fii5dNet.toFixed(2) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">DII 5D Net</span>
          <span className="font-mono">{dii5dNet !== null ? dii5dNet.toFixed(2) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">PCR OI</span>
          <span className="font-mono">{pcrOi !== null ? pcrOi.toFixed(2) : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Max Pain Δ</span>
          <span className="font-mono">{spotVsMaxPainPct !== null ? `${spotVsMaxPainPct.toFixed(1)}%` : '—'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-muted">Sector Align</span>
          <span className={`text-[10px] font-semibold ${
            sectorAlignment === 'ALIGNED' ? 'text-green-400' :
            sectorAlignment === 'CONFLICTED' ? 'text-red-400' : 'text-text-muted'
          }`}>{sectorAlignment}</span>
        </div>
      </div>

      {/* Drivers */}
      {biasDrivers.length > 0 && (
        <div className="text-[10px] text-text-muted space-y-0.5">
          {biasDrivers.slice(0, 3).map((d, i) => <div key={i}>· {d}</div>)}
        </div>
      )}

      {/* Dep + Impact */}
      <div className="border-t border-border-theme pt-2 space-y-1 text-[10px]">
        <div className="text-text-muted">
          <span className="font-semibold uppercase tracking-wider opacity-60">Dep · </span>
          {dependency}
        </div>
        <div className="text-text-muted">
          <span className="font-semibold uppercase tracking-wider opacity-60">Impact · </span>
          {impact}
        </div>
      </div>

      {warning && (
        <div className="text-[10px] text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
          ⚠ {warning}
        </div>
      )}
    </div>
  );
}
