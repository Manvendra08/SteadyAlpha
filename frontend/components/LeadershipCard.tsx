import React from 'react';
import { DashboardViewModel, EngineStatus } from '../types/DashboardViewModel';

function EngineStatusBadge({ status }: { status: EngineStatus }) {
  const cls = {
    READY: 'text-green-400 bg-green-400/10 border-green-400/30',
    DEGRADED: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    SIMULATED: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
    SUPPRESSED: 'text-text-muted bg-bg-elevated border-border-theme',
    WAITING: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
    FAILED: 'text-red-400 bg-red-400/10 border-red-400/30',
  }[status] ?? 'text-text-muted bg-bg-elevated border-border-theme';

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-black tracking-tighter ${cls}`}>
      {status === 'READY' ? 'PASS' : status}
    </span>
  );
}

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
  const isFailed = engineStatus === 'FAILED';
  const hasLeaders = qualifiedLeaderCount > 0 && leaders.length > 0;
  const hasLaggards = qualifiedLaggardCount > 0 && laggards.length > 0;
  const emptyReason = EMPTY_REASONS[status] || statusReason || 'No qualified leaders after liquidity filter';

  return (
    <div className={`bg-bg-card border rounded-2xl p-5 flex flex-col gap-4 hover:shadow-2xl transition-all duration-300 group ${isFailed ? 'border-red-500/20 grayscale' : 'border-border-theme hover:border-border-theme/70'}`}>
      {/* Unified Header */}
      <div className="flex items-center justify-between border-b border-border-theme/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-bg-elevated text-green-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <h2 className="text-text-primary text-[11px] font-black uppercase tracking-[0.1em]">Leadership</h2>
        </div>
        <EngineStatusBadge status={engineStatus} />
      </div>

      {/* Hero Counts - Visual Priority */}
      <div className="flex gap-4">
        <div className="flex-1 flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Leaders</span>
          <div className="text-2xl font-black tracking-tighter text-green-400 leading-none">
            {isFailed ? '—' : qualifiedLeaderCount}
          </div>
        </div>
        <div className="flex-1 flex flex-col border-l border-border-theme/30 pl-4">
          <span className="text-[9px] font-black uppercase tracking-widest text-text-muted mb-1">Laggards</span>
          <div className="text-2xl font-black tracking-tighter text-red-400 leading-none">
            {isFailed ? '—' : qualifiedLaggardCount}
          </div>
        </div>
      </div>

      {/* Coverage Bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight text-text-muted">
          <span>Universe Coverage</span>
          <span className="font-mono text-text-primary">{universeCoverage !== null ? `${(universeCoverage * 100).toFixed(0)}%` : '—'}</span>
        </div>
        <div className="h-1 w-full bg-bg-elevated rounded-full overflow-hidden">
           <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${(universeCoverage ?? 0) * 100}%` }}></div>
        </div>
      </div>

      {/* Preview Rows */}
      {(hasLeaders || hasLaggards) && !isFailed ? (
        <div className="grid grid-cols-2 gap-3 bg-bg-elevated/20 rounded-xl p-3 border border-border-theme/30">
          <div className="space-y-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-green-400/60 mb-1.5">Strengths</div>
            {leaders.slice(0, 3).map((l, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono group/item">
                <span className="text-text-secondary group-hover/item:text-text-primary transition-colors">{l.symbol}</span>
                <span className="text-green-400 font-bold">{l.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-red-400/60 mb-1.5">Weaknesses</div>
            {laggards.slice(0, 3).map((l, i) => (
              <div key={i} className="flex justify-between text-[10px] font-mono group/item">
                <span className="text-text-secondary group-hover/item:text-text-primary transition-colors">{l.symbol}</span>
                <span className="text-red-400 font-bold">{l.score.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-4 bg-bg-elevated/30 rounded-xl border border-dashed border-border-theme/50">
          <span className="text-[10px] text-text-muted font-medium italic opacity-60 uppercase tracking-wider">{emptyReason}</span>
        </div>
      )}

      {/* Dep + Impact - Neutralized Labels */}
      <div className="pt-1 space-y-1 text-[10px]">
        <div className="text-text-muted leading-relaxed">
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">DEP · </span>
          <span className="text-text-secondary opacity-80">{dependency}</span>
        </div>
        <div className="text-text-muted leading-relaxed">
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-40">IMPACT · </span>
          <span className="text-text-secondary opacity-80">{impact}</span>
        </div>
      </div>

      {/* Warning */}
      {warning && (
        <div className="text-[9px] font-medium text-amber-400/90 bg-amber-400/5 border border-amber-400/20 rounded-lg px-2 py-1.5 flex items-start gap-2">
          <span>⚠</span> {warning}
        </div>
      )}
    </div>
  );
}
