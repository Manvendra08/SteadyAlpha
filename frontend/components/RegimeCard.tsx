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

export default function RegimeCard({
  state, confidencePct, trendScore, adx, vix, vixPercentile, breadthPct,
  hysteresisState, engineStatus, validityStatus, directionalVote, dependency, impact, warning,
}: DashboardViewModel['regime']) {
  const isFailed = engineStatus === 'FAILED' || !state;
  
  const stateColor = isFailed ? 'text-text-muted opacity-40' :
    state === 'BULLISH' || state === 'TREND_UP' ? 'text-green-400' :
    state === 'BEARISH' || state === 'TREND_DOWN' ? 'text-red-400' :
    state === 'HIGH_VIX' ? 'text-red-400' :
    'text-amber-400';

  return (
    <div className={`bg-bg-card border rounded-2xl p-5 flex flex-col gap-4 hover:shadow-2xl transition-all duration-300 group ${isFailed ? 'border-red-500/20 grayscale' : 'border-border-theme hover:border-border-theme/70'}`}>
      {/* Unified Header */}
      <div className="flex items-center justify-between border-b border-border-theme/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-bg-elevated text-blue-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-text-primary text-[11px] font-black uppercase tracking-[0.1em]">Regime</h2>
        </div>
        <div className="flex items-center gap-2">
           <EngineStatusBadge status={engineStatus} />
           <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
             validityStatus === 'VALID' ? 'border-green-400/30 text-green-400' : 'border-amber-400/30 text-amber-400'
           }`}>{validityStatus}</span>
        </div>
      </div>

      {/* State hero - Visual Priority */}
      <div className="flex flex-col">
        <div className={`text-2xl font-black tracking-tighter leading-tight ${stateColor}`}>
          {isFailed ? 'NO DATA' : state}
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60 mt-0.5">
          Signal Vote: <span className={stateColor}>{directionalVote}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1 flex-1 bg-bg-elevated rounded-full overflow-hidden">
             <div className={`h-full transition-all duration-1000 ${stateColor.replace('text', 'bg')}`} style={{ width: `${isFailed ? 0 : confidencePct}%` }}></div>
          </div>
          <span className="text-[10px] font-mono font-bold text-text-muted">{isFailed ? '—' : `${confidencePct}%`}</span>
        </div>
      </div>

      {/* Metrics - Smaller Mono-spaced */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-text-secondary">
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">Trend Score</span>
          <span className="font-mono text-text-primary">{isFailed ? '—' : trendScore.toFixed(3)}</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">ADX</span>
          <span className="font-mono text-text-primary">{isFailed ? '—' : adx.toFixed(1)}</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">VIX</span>
          <span className="font-mono text-text-primary">{isFailed ? '—' : vix.toFixed(1)}</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">Breadth</span>
          <span className="font-mono text-text-primary">{isFailed ? '—' : `${(breadthPct * 100).toFixed(0)}%`}</span>
        </div>
      </div>

      {/* Hysteresis */}
      <div className="flex justify-between items-center bg-bg-elevated/30 rounded-lg px-3 py-2">
        <span className="text-[10px] text-text-muted font-black uppercase tracking-widest">Hysteresis</span>
        <span className={`text-[10px] font-black tracking-tighter ${
          isFailed ? 'text-text-muted' : hysteresisState === 'CONFIRMED' ? 'text-green-400' : 'text-amber-400'
        }`}>{isFailed ? '—' : hysteresisState}</span>
      </div>

      {/* Dep + Impact - Neutralized Labels */}
      <div className="pt-2 space-y-1 text-[10px]">
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
