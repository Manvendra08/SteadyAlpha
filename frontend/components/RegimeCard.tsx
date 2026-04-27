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

export default function RegimeCard({
  state, confidencePct, trendScore, adx, vix, vixPercentile, breadthPct,
  hysteresisState, engineStatus, dependency, impact, warning,
}: DashboardViewModel['regime']) {
  const stateColor =
    state === 'BULLISH' || state === 'TREND_UP' ? 'text-green-400' :
    state === 'BEARISH' || state === 'TREND_DOWN' ? 'text-red-400' :
    state === 'HIGH_VIX' ? 'text-red-400' :
    'text-amber-400';

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4 flex flex-col gap-3 hover:border-border-theme/70 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Regime Engine</h2>
        <EngineStatusBadge status={engineStatus} />
      </div>

      {/* State hero */}
      <div className={`text-lg font-bold tracking-tight ${stateColor}`}>{state}</div>

      {/* Metrics */}
      <div className="space-y-1.5 text-xs text-text-secondary">
        <div className="flex justify-between">
          <span className="text-text-muted">Confidence</span>
          <span className="font-mono font-semibold text-text-primary">{confidencePct}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Trend Score</span>
          <span className="font-mono">{trendScore.toFixed(3)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">ADX</span>
          <span className="font-mono">{adx.toFixed(1)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">VIX (pct)</span>
          <span className="font-mono">{vix.toFixed(1)} · {vixPercentile.toFixed(0)}%ile</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">Breadth</span>
          <span className="font-mono">{(breadthPct * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-muted">Hysteresis</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
            hysteresisState === 'CONFIRMED' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
          }`}>{hysteresisState}</span>
        </div>
      </div>

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

      {/* Warning */}
      {warning && (
        <div className="text-[10px] text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
          ⚠ {warning}
        </div>
      )}
    </div>
  );
}
