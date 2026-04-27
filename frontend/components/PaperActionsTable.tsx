'use client';
import React, { useState } from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

type Props = {
  actions: DashboardViewModel['paperActions'];
  operatingMode: DashboardViewModel['operatingMode'];
  emptyReason?: string | null;
  decisionLabel?: string;
  riskMode?: string;
};

function decisionColor(d: string) {
  switch (d) {
    case 'OPENED': return 'text-green-400';
    case 'REJECTED': return 'text-red-400';
    case 'CLOSED': return 'text-blue-400';
    case 'SKIPPED': return 'text-text-muted';
    case 'PENDING': return 'text-amber-400';
    default: return 'text-text-secondary';
  }
}

// Spec #8: cause-aware empty state
function resolveEmptyReason(
  operatingMode: string,
  decisionLabel?: string,
  riskMode?: string,
  overrideReason?: string | null,
): string {
  if (overrideReason) return overrideReason;
  if (operatingMode !== 'PAPER' && operatingMode !== 'LIVE_AUTO') return 'No paper actions — paper mode inactive';
  if (riskMode === 'HALTED') return 'No paper actions — risk gate blocked promotion';
  if (decisionLabel === 'NO_TRADE') return 'No paper actions — final decision was NO_TRADE';
  if (decisionLabel === 'WATCHLIST') return 'No paper actions — decision is WATCHLIST (observe only)';
  return 'No paper actions — no setups qualified this run';
}

export default function PaperActionsTable({ actions, operatingMode, emptyReason, decisionLabel, riskMode }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (actions.length === 0) {
    const reason = resolveEmptyReason(operatingMode, decisionLabel, riskMode, emptyReason);
    return (
      <div className="bg-bg-card border border-border-theme rounded-xl p-6 flex items-center gap-3">
        <span className="text-text-muted text-lg">📭</span>
        <div>
          <div className="text-text-muted text-sm">{reason}</div>
          <div className="text-[10px] text-text-muted opacity-60 mt-0.5">
            Paper orders appear here when promotion conditions are met
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-theme flex items-center justify-between">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Paper Actions</h2>
        <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded border border-border-theme">
          {actions.length} order{actions.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-border-theme text-text-muted uppercase tracking-widest text-[10px]">
            <tr>
              {['Symbol','Setup','Dir','Action','Conf','Qty','Risk','Source','Reason','Time'].map(h => (
                <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme text-text-secondary">
            {actions.map((act) => (
              <React.Fragment key={act.rawId}>
                <tr
                  className="hover:bg-bg-elevated/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === act.rawId ? null : act.rawId)}
                >
                  <td className="px-4 py-2.5 font-mono font-semibold text-text-primary">{act.symbol}</td>
                  <td className="px-4 py-2.5 max-w-[120px] truncate" title={act.setupType}>{act.setupType}</td>
                  <td className={`px-4 py-2.5 font-bold ${act.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                    {act.direction}
                  </td>
                  <td className={`px-4 py-2.5 font-semibold ${decisionColor(act.decision)}`}>{act.decision}</td>
                  <td className="px-4 py-2.5 font-mono">{act.confidencePct !== null ? `${act.confidencePct}%` : '—'}</td>
                  <td className="px-4 py-2.5 font-mono">{act.qty !== null ? act.qty : '—'}</td>
                  <td className={`px-4 py-2.5 font-semibold ${act.riskGate === 'PASS' ? 'text-green-400' : act.riskGate === 'FAIL' ? 'text-red-400' : 'text-text-muted'}`}>
                    {act.riskGate}
                  </td>
                  <td className="px-4 py-2.5 text-text-muted">{act.source}</td>
                  <td className="px-4 py-2.5 max-w-[180px] truncate text-text-muted" title={act.reason}>{act.reason}</td>
                  <td className="px-4 py-2.5 text-text-muted whitespace-nowrap">{new Date(act.ts).toLocaleTimeString()}</td>
                </tr>
                {expandedId === act.rawId && (
                  <tr className="bg-bg-elevated/50">
                    <td colSpan={10} className="px-4 py-2 text-[10px] text-text-muted font-mono border-t border-border-theme">
                      ID: <span className="text-text-secondary select-all">{act.rawId}</span>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
