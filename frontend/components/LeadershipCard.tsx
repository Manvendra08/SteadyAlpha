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

// Spec #3: if count > 0, render real rows, never "None"
// If suppressed, show explicit reason
const EMPTY_REASONS: Record<string, string> = {
  DATA_MISSING: 'No universe data available',
  COVERAGE_TOO_LOW: 'Coverage below threshold',
  WAITING_FOR_BATCH: 'Waiting for OHLCV batch',
  SUPPRESSED: 'Leaders suppressed — no-trade state',
};

export default function LeadershipCard({
  status, universeCoverage, qualifiedLeaderCount, qualifiedLaggardCount,
  leaders, laggards, statusReason, engineStatus, dependency, impact, warning,
}: DashboardViewModel['leadership']) {
  const hasLeaders = qualifiedLeaderCount > 0 && leaders.length > 0;
  const hasLaggards = qualifiedLaggardCount > 0 && laggards.length > 0;
  const emptyReason = EMPTY_REASONS[status] || statusReason || 'No qualified leaders after liquidity filter';

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4 flex flex-col gap-3 hover:border-border-theme/70 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Leadership Engine</h2>
        <EngineStatusBadge status={engineStatus} />
      </div>

      {/* Coverage */}
      <div className="flex items-baseline justify-between">
        <span className="text-text-muted text-xs">Universe coverage</span>
        <span className="font-mono text-sm font-semibold text-text-primary">
          {universeCoverage !== null ? `${(universeCoverage * 100).toFixed(0)}%` : '—'}
        </span>
      </div>

      {/* Counts */}
      <div className="flex gap-3 text-xs">
        <div className="flex-1 bg-green-400/5 border border-green-400/15 rounded-lg p-2 text-center">
          <div className="text-green-400 text-base font-bold">{qualifiedLeaderCount}</div>
          <div className="text-text-muted text-[10px] uppercase tracking-wide">Leaders</div>
        </div>
        <div className="flex-1 bg-red-400/5 border border-red-400/15 rounded-lg p-2 text-center">
          <div className="text-red-400 text-base font-bold">{qualifiedLaggardCount}</div>
          <div className="text-text-muted text-[10px] uppercase tracking-wide">Laggards</div>
        </div>
      </div>

      {/* Preview rows - spec #3: must show real rows if count > 0 */}
      {(hasLeaders || hasLaggards) ? (
        <div className="flex gap-3">
          {/* Leaders */}
          <div className="flex-1">
            <div className="text-[10px] text-green-400 border-b border-green-400/20 pb-0.5 mb-1 font-semibold">Top Leaders</div>
            {leaders.slice(0, 3).map((l, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono py-0.5">
                <span className="text-text-secondary">{l.symbol}</span>
                <span className="text-green-400">{l.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
          {/* Laggards */}
          <div className="flex-1">
            <div className="text-[10px] text-red-400 border-b border-red-400/20 pb-0.5 mb-1 font-semibold">Top Laggards</div>
            {laggards.slice(0, 3).map((l, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono py-0.5">
                <span className="text-text-secondary">{l.symbol}</span>
                <span className="text-red-400">{l.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Explicit reason — never just "None" */
        <div className="text-[10px] text-text-muted italic bg-bg-elevated rounded px-2 py-1.5 border border-border-theme">
          {emptyReason}
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
