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

function DrawdownBar({ current, limit }: { current: number; limit: number }) {
  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const barColor = pct > 80 ? 'bg-red-400' : pct > 50 ? 'bg-amber-400' : 'bg-green-400';
  return (
    <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function RiskCard({
  mode, baseRiskPct, drawdownPct, drawdownLimitPct, positionSize, triggerReason,
  consecutiveLossDays, engineStatus, dependency, impact, warning,
}: DashboardViewModel['risk']) {
  const modeColor =
    mode === 'ACTIVE' ? 'text-green-400' :
    mode === 'REDUCED' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4 flex flex-col gap-3 hover:border-border-theme/70 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Risk Engine</h2>
        <EngineStatusBadge status={engineStatus} />
      </div>

      {/* Mode hero */}
      <div className={`text-lg font-bold tracking-tight ${modeColor}`}>{mode}</div>

      {/* Drawdown progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-text-muted">
          <span>Drawdown vs limit</span>
          <span className="font-mono text-text-secondary">{drawdownPct.toFixed(2)}% / {drawdownLimitPct.toFixed(2)}%</span>
        </div>
        <DrawdownBar current={drawdownPct} limit={drawdownLimitPct} />
      </div>

      {/* Metrics */}
      <div className="space-y-1.5 text-xs text-text-secondary">
        <div className="flex justify-between">
          <span className="text-text-muted">Base Risk</span>
          <span className="font-mono">{baseRiskPct.toFixed(2)}%</span>
        </div>
        {positionSize !== null && positionSize !== undefined && (
          <div className="flex justify-between">
            <span className="text-text-muted">Size Multiplier</span>
            <span className="font-mono">{positionSize}×</span>
          </div>
        )}
        {consecutiveLossDays !== null && consecutiveLossDays !== undefined && (
          <div className="flex justify-between">
            <span className="text-text-muted">Consec. Loss Days</span>
            <span className={`font-mono ${consecutiveLossDays >= 3 ? 'text-red-400' : 'text-text-secondary'}`}>
              {consecutiveLossDays}
            </span>
          </div>
        )}
      </div>

      {/* Trigger */}
      {triggerReason && (
        <div className="text-[10px] text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded px-2 py-1">
          ⚠ {triggerReason}
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
