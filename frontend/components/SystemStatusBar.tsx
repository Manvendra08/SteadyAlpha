import React from 'react';
import { DashboardViewModel, EngineStatus } from '../types/DashboardViewModel';

type Props = {
  status: DashboardViewModel['systemStatus'];
  mode: DashboardViewModel['operatingMode'];
  freshness: DashboardViewModel['dataFreshness'];
  riskMode: DashboardViewModel['riskMode'];
  lastSuccessTs: string;
  degradedReason?: string | null;
};

function statusChip(s: string) {
  switch (s) {
    case 'HEALTHY': case 'ACTIVE': case 'FRESH': return 'text-green-400 border-green-400/40 bg-green-400/10';
    case 'DEGRADED': case 'REDUCED': case 'FALLBACK': case 'STALE': case 'PAPER': return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
    case 'FAILED': case 'HALTED': case 'MISSING': return 'text-red-400 border-red-400/40 bg-red-400/10';
    case 'SIGNAL_ONLY': return 'text-text-muted border-border-theme bg-bg-elevated';
    case 'ASSISTED_LIVE': return 'text-blue-400 border-blue-400/40 bg-blue-400/10';
    case 'LIVE_AUTO': return 'text-orange-400 border-orange-400/40 bg-orange-400/10';
    default: return 'text-text-muted border-border-theme bg-bg-elevated';
  }
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${statusChip(value)}`}>
      <span className="opacity-60 font-normal">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function SystemStatusBar({ status, mode, freshness, riskMode, lastSuccessTs, degradedReason }: Props) {
  const formattedDate = new Date(lastSuccessTs).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <div className="bg-bg-card border-b border-border-theme px-4 md:px-6 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label="System" value={status} />
          <Badge label="Mode" value={mode} />
          <Badge label="Data" value={freshness} />
          <Badge label="Risk" value={riskMode} />
          {degradedReason && status === 'DEGRADED' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-amber-400/30 bg-amber-400/5 text-xs text-amber-300">
              <span className="opacity-70">⚠</span>
              <span>{degradedReason}</span>
            </div>
          )}
        </div>
        <div className="text-text-muted text-xs whitespace-nowrap">
          Last run: <span className="text-text-secondary">{formattedDate}</span>
        </div>
      </div>
    </div>
  );
}
