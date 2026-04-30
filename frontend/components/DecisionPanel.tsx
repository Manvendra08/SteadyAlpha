import React from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

function GateCheck({ name, status }: { name: string; status: 'PASS' | 'FAIL' }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-2 rounded-xl border transition-all duration-300 ${
      status === 'PASS'
        ? 'bg-green-400/5 border-green-400/20 text-green-400'
        : 'bg-red-400/5 border-red-400/20 text-red-400'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{status === 'PASS' ? '✓' : '✕'}</span>
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">{name}</span>
      </div>
      <span className="text-[10px] font-mono font-bold opacity-60">{status}</span>
    </div>
  );
}

export default function DecisionPanel({
  label, confidencePct, regimeGate, flowGate, leadershipGate, riskGate, reasons, conflicts,
}: DashboardViewModel['decision']) {
  const isInvalid = label === 'INVALID_FOR_TRADING';
  
  const labelColor =
    label === 'LONG_BIAS' ? 'text-green-400' :
    label === 'SHORT_BIAS' ? 'text-red-400' :
    label === 'PAPER_ELIGIBLE' ? 'text-blue-400' :
    label === 'NO_TRADE' ? 'text-amber-400' :
    label === 'WATCHLIST' ? 'text-sky-400' :
    isInvalid ? 'text-red-500' :
    'text-text-muted';

  const confLow = confidencePct < 40;

  return (
    <div className={`relative overflow-hidden bg-bg-card border-2 rounded-3xl p-8 shadow-2xl transition-all duration-500 ${isInvalid ? 'border-red-500/30' : 'border-border-theme'}`}>
      {/* Background Glow */}
      <div className={`absolute -top-24 -right-24 w-64 h-64 blur-[120px] rounded-full opacity-20 pointer-events-none ${labelColor.replace('text', 'bg')}`}></div>
      
      <div className="relative z-10 flex flex-col lg:flex-row gap-8">
        {/* Decision Hero */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-text-muted text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-60">Master Decision Engine</div>
          <div className={`text-5xl lg:text-6xl font-black tracking-tighter mb-4 ${labelColor}`}>
            {label.replace(/_/g, ' ')}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Confidence</span>
              <div className="flex items-baseline gap-2">
                 <span className={`text-2xl font-mono font-black ${confLow ? 'text-amber-400' : 'text-text-primary'}`}>{confidencePct}%</span>
                 {confLow && <span className="text-[10px] text-amber-400 font-bold uppercase tracking-tighter animate-pulse">Below Threshold</span>}
              </div>
            </div>
            {isInvalid && (
              <div className="ml-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-red-600/20">
                Simulation Only
              </div>
            )}
          </div>
        </div>

        {/* Requirements Checklist */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          <div className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] mb-1">Pre-Flight Gates</div>
          <GateCheck name="Regime" status={regimeGate} />
          <GateCheck name="Flows" status={flowGate} />
          <GateCheck name="Leadership" status={leadershipGate} />
          <GateCheck name="Risk" status={riskGate} />
        </div>
      </div>

      {/* Rationale & Warnings */}
      <div className="mt-8 pt-6 border-t border-border-theme/50 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <div className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] mb-4">Decision Rationale</div>
          <div className="space-y-3">
            {reasons.length > 0 ? reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <div className={`w-1 h-1 rounded-full mt-2 transition-all group-hover:scale-150 ${labelColor.replace('text', 'bg')}`}></div>
                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{r}</span>
              </div>
            )) : (
              <div className="text-sm text-text-muted italic opacity-50">No decision logic data available for this run.</div>
            )}
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="bg-amber-400/5 border border-amber-400/20 rounded-2xl p-5">
            <div className="text-[10px] text-amber-400 font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <span className="text-sm">⚠</span> System Conflict Detected
            </div>
            <div className="space-y-2">
              {conflicts.map((c, i) => (
                <div key={i} className="text-xs text-amber-400/80 font-medium leading-relaxed">
                  {c}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
