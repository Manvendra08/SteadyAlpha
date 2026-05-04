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

export default function RiskCard({
  mode, baseRiskPct, drawdownPct, drawdownLimitPct, positionSize, triggerReason,
  consecutiveLossDays, engineStatus, validityStatus, directionalVote, dependency, impact, warning,
}: DashboardViewModel['risk']) {
  const isFailed = engineStatus === 'FAILED' || mode === 'HALTED';
  
  const modeColor = isFailed ? 'text-red-500' :
    mode === 'ACTIVE' ? 'text-green-400' :
    mode === 'REDUCED' ? 'text-amber-400' : 'text-red-400';

  const drawdownProgress = drawdownLimitPct > 0 ? Math.min((drawdownPct / drawdownLimitPct) * 100, 100) : 0;

  return (
    <div className={`bg-bg-card border rounded-2xl p-5 flex flex-col gap-4 hover:shadow-2xl transition-all duration-300 group ${isFailed ? 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-border-theme hover:border-border-theme/70'}`}>
      {/* Unified Header */}
      <div className="flex items-center justify-between border-b border-border-theme/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-bg-elevated text-red-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m12-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-text-primary text-[11px] font-black uppercase tracking-[0.1em]">Risk</h2>
        </div>
        <div className="flex items-center gap-2">
           <EngineStatusBadge status={engineStatus} />
           <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
             validityStatus === 'VALID' ? 'border-green-400/30 text-green-400' : 'border-amber-400/30 text-amber-400'
           }`}>{validityStatus}</span>
        </div>
      </div>

      {/* Mode hero - Visual Priority */}
      <div className="flex flex-col">
        <div className={`text-2xl font-black tracking-tighter leading-tight ${modeColor}`}>
          {isFailed && mode !== 'HALTED' ? 'NO DATA' : mode}
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60 mt-0.5">
          Signal Vote: <span className={modeColor}>{directionalVote}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1 flex-1 bg-bg-elevated rounded-full overflow-hidden">
             <div className={`h-full transition-all duration-1000 ${drawdownProgress > 80 ? 'bg-red-500' : drawdownProgress > 50 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${drawdownProgress}%` }}></div>
          </div>
          <span className="text-[10px] font-mono font-bold text-text-muted">{drawdownPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Metrics - Smaller Mono-spaced */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] text-text-secondary">
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">Base Risk</span>
          <span className="font-mono text-text-primary">{baseRiskPct.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">DD Limit</span>
          <span className="font-mono text-text-primary">{drawdownLimitPct.toFixed(2)}%</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">Multiplier</span>
          <span className="font-mono text-text-primary">{positionSize ?? 1}×</span>
        </div>
        <div className="flex justify-between border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium">Loss Streak</span>
          <span className={`font-mono ${consecutiveLossDays && consecutiveLossDays >= 3 ? 'text-red-400' : 'text-text-primary'}`}>
            {consecutiveLossDays ?? 0}d
          </span>
        </div>
      </div>

      {/* Trigger Reason */}
      {triggerReason && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
           <div className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-0.5">Constraint Trip</div>
           <div className="text-[10px] text-red-400/80 leading-relaxed font-medium">{triggerReason}</div>
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
