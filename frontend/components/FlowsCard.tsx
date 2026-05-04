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

export default function FlowsCard({
  bias, fii5dNet, dii5dNet, pcrOi, maxPain, spotVsMaxPainPct, sectorAlignment,
  freshness, biasDrivers, engineStatus, validityStatus, directionalVote, dependency, impact, warning,
  fiiNetDaily, diiNetDaily,
}: DashboardViewModel['flows']) {
  const isFailed = engineStatus === 'FAILED' || !bias;

  const biasColor = isFailed ? 'text-text-muted opacity-40' :
    bias === 'BULLISH' ? 'text-green-400' :
    bias === 'BEARISH' ? 'text-red-400' :
    'text-amber-400';

  return (
    <div className={`bg-bg-card border rounded-2xl p-5 flex flex-col gap-4 hover:shadow-2xl transition-all duration-300 group ${isFailed ? 'border-red-500/20 grayscale' : 'border-border-theme hover:border-border-theme/70'}`}>
      {/* Unified Header */}
      <div className="flex items-center justify-between border-b border-border-theme/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-bg-elevated text-purple-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <h2 className="text-text-primary text-[11px] font-black uppercase tracking-[0.1em]">Flows</h2>
        </div>
        <div className="flex items-center gap-2">
           <EngineStatusBadge status={engineStatus} />
           <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
             validityStatus === 'VALID' ? 'border-green-400/30 text-green-400' : 'border-amber-400/30 text-amber-400'
           }`}>{validityStatus}</span>
        </div>
      </div>

      {/* Bias hero - Visual Priority */}
      <div className="flex flex-col">
        <div className={`text-2xl font-black tracking-tighter leading-tight ${biasColor}`}>
          {isFailed ? 'NO DATA' : bias}
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-text-muted opacity-60 mt-0.5">
          Signal Vote: <span className={biasColor}>{directionalVote}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded ${
            freshness === 'FRESH' ? 'bg-green-400/10 text-green-400' : 'bg-amber-400/10 text-amber-400'
          }`}>
            {freshness}
          </span>
        </div>
      </div>

      {/* Metrics - High Density Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] text-text-secondary">
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">FII Net (Daily)</span>
          <span className="font-mono text-text-primary text-sm">{fiiNetDaily !== null && !isFailed ? `${fiiNetDaily > 0 ? '+' : ''}${fiiNetDaily.toLocaleString()}` : '—'}</span>
        </div>
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">FII Z-Score</span>
          <span className="font-mono text-text-primary text-sm">{fii5dNet !== null && !isFailed ? fii5dNet.toFixed(2) : '—'}</span>
        </div>
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">PCR OI</span>
          <span className="font-mono text-text-primary text-sm">{pcrOi !== null && !isFailed ? pcrOi.toFixed(2) : '—'}</span>
        </div>
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">Max Pain Level</span>
          <span className="font-mono text-text-primary text-sm">{maxPain !== null && !isFailed ? maxPain.toLocaleString() : '—'}</span>
        </div>
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">Spot vs Pain Δ</span>
          <span className={`font-mono text-sm ${spotVsMaxPainPct !== null && spotVsMaxPainPct > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {spotVsMaxPainPct !== null && !isFailed ? `${spotVsMaxPainPct > 0 ? '+' : ''}${spotVsMaxPainPct.toFixed(2)}%` : '—'}
          </span>
        </div>
        <div className="flex flex-col border-b border-border-theme/30 pb-1">
          <span className="text-text-muted font-medium text-[9px] uppercase tracking-wider">Sector Alignment</span>
          <span className={`font-mono text-sm ${
            sectorAlignment === 'ALIGNED' ? 'text-green-400' :
            sectorAlignment === 'CONFLICTED' ? 'text-red-400' : 'text-text-muted'
          }`}>{isFailed ? '—' : sectorAlignment}</span>
        </div>
      </div>

      {/* Drivers */}
      {biasDrivers.length > 0 && !isFailed && (
        <div className="bg-bg-elevated/30 rounded-lg p-2 space-y-1">
          {biasDrivers.slice(0, 2).map((d, i) => (
            <div key={i} className="text-[10px] text-text-muted flex items-start gap-2">
              <span className="text-purple-400 font-bold">»</span>
              <span className="opacity-80">{d}</span>
            </div>
          ))}
        </div>
      )}

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
