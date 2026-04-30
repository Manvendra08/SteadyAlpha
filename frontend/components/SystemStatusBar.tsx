'use client';

import React from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';
import { usePipelineHeartbeat } from '../hooks/usePipelineHeartbeat';

type Props = {
  pipelineStatus: DashboardViewModel['pipelineStatus'];
  tradingValidity: DashboardViewModel['tradingValidity'];
  mode: DashboardViewModel['operatingMode'];
  riskMode: DashboardViewModel['riskMode'];
  lastSuccessTs: string;
  dataTrustScore?: number;
  tradingReadinessScore?: number;
  invalidReasons?: string[];
};

function statusChip(s: string) {
  switch (s) {
    case 'SUCCESS': case 'YES': case 'ACTIVE': case 'ALLOWED': return 'text-green-500 border-green-500/40 bg-green-500/10 shadow-[0_0_5px_rgba(34,197,94,0.1)]';
    case 'PARTIAL': case 'PAPER': case 'DEGRADED': return 'text-amber-600 border-amber-600/40 bg-amber-600/10 shadow-[0_0_5px_rgba(217,119,6,0.1)]';
    case 'FAILED': case 'NO': case 'HALTED': case 'DISABLED': return 'text-red-500 border-red-500/40 bg-red-500/10 shadow-[0_0_5px_rgba(239,68,68,0.1)]';
    case 'RUNNING': return 'text-blue-500 border-blue-500/40 bg-blue-500/20 animate-pulse';
    case 'SIGNAL_ONLY': return 'text-text-secondary border-border-theme bg-bg-elevated';
    case 'ASSISTED_LIVE': return 'text-blue-500 border-blue-500/40 bg-blue-500/10';
    case 'LIVE_AUTO': return 'text-orange-500 border-orange-500/40 bg-orange-500/10';
    default: return 'text-text-muted border-border-theme bg-bg-elevated';
  }
}

function Badge({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-black tracking-tight ${statusChip(value)} transition-all duration-300 hover:scale-105`} title={tooltip}>
      <span className="opacity-70 font-bold uppercase tracking-widest text-[8px]">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RadialGauge({ score, label, colorClass }: { score: number; label: string; colorClass: string }) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-bg-elevated/50 border border-border-theme/80 shadow-inner" title={label}>
      <div className="relative w-8 h-8 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="16" cy="16" r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="3.5"
            className="text-bg-elevated"
          />
          <circle
            cx="16" cy="16" r={radius}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-1000 ease-out`}
          />
        </svg>
        <span className="absolute text-[9px] font-mono font-black text-text-primary">{Math.round(score)}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[8px] uppercase tracking-[0.2em] text-text-secondary font-black leading-none mb-0.5">{label}</span>
        <span className={`text-[10px] font-mono font-black ${colorClass}`}>{score === 100 ? 'OPTIMAL' : score > 70 ? 'HIGH' : 'DEGRADED'}</span>
      </div>
    </div>
  );
}

export default function SystemStatusBar({ pipelineStatus: initialStatus, tradingValidity, mode, riskMode, lastSuccessTs, dataTrustScore, tradingReadinessScore, invalidReasons }: Props) {
  const { isRunning } = usePipelineHeartbeat();
  
  const currentPipelineStatus = isRunning ? 'RUNNING' : initialStatus;
  const isInvalid = tradingValidity === 'NO';

  const formattedDate = new Date(lastSuccessTs).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div className="sticky top-0 z-50 flex flex-col w-full">
      {/* Global Health Bar pulsing red if invalid */}
      {isInvalid && (
        <div className="h-1 w-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
      )}
      
      {/* Mock Data Warning Banner */}
      {isInvalid && invalidReasons?.includes('Mock data in use') && (
        <div className="bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] py-1 px-4 flex items-center justify-center gap-3">
          <span className="animate-bounce">⚠</span>
          <span>Operational Integrity Compromised: Mock Data in Use — Execution Disabled</span>
          <span className="animate-bounce">⚠</span>
        </div>
      )}

      <div className={`bg-bg-card/90 backdrop-blur-xl border-b border-border-theme px-4 md:px-6 py-2.5 shadow-xl transition-all duration-500 ${isInvalid ? 'border-red-500/50' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 mr-2">
              <div className={`w-2 h-2 rounded-full ${currentPipelineStatus === 'SUCCESS' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : currentPipelineStatus === 'RUNNING' ? 'bg-blue-500 animate-ping' : 'bg-red-500 animate-pulse'}`}></div>
              <span className="text-[11px] font-black uppercase tracking-wider text-text-primary">SteadyAlpha <span className="text-text-muted font-light">OS v0.6.1</span></span>
            </div>

            <div className="h-6 w-[1px] bg-border-theme/50 mx-1"></div>

            <div className="flex items-center gap-2">
              <Badge label="System" value={currentPipelineStatus} tooltip={isRunning ? "Market Data Refresh in progress..." : "Last run completed"} />
              <Badge label="Validity" value={tradingValidity} />
              <Badge label="Mode" value={mode} />
              <Badge label="Risk" value={riskMode} />
            </div>
            
            <div className="h-6 w-[1px] bg-border-theme/50 mx-1"></div>

            <div className="flex items-center gap-3">
              {dataTrustScore !== undefined && (
                <RadialGauge score={dataTrustScore} label="Trust" colorClass="text-blue-400" />
              )}
              {tradingReadinessScore !== undefined && (
                <RadialGauge score={tradingReadinessScore} label="Readiness" colorClass="text-purple-400" />
              )}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden lg:flex flex-col items-end">
              <div className="text-[9px] uppercase tracking-[0.15em] font-black text-text-muted opacity-50">
                {isRunning ? 'Syncing Pipeline...' : 'Cluster Synchronized'}
              </div>
              <div className="text-[10px] font-mono text-text-secondary">
                {formattedDate}
              </div>
            </div>
            
            {/* Sync heartbeat indicator */}
            <div className="flex items-center gap-1">
               <div className="flex gap-[2px]">
                 {[1,2,3].map(i => (
                   <div key={i} className={`w-1 h-3 rounded-full transition-all duration-300 ${isRunning ? 'bg-blue-500/50 animate-pulse' : 'bg-green-500/30'}`} style={{ animationDelay: `${i*100}ms` }}></div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
