import React from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

function GateBadge({ name, status }: { name: string; status: 'PASS' | 'FAIL' }) {
  return (
    <div className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border text-xs font-semibold ${
      status === 'PASS'
        ? 'bg-green-400/10 border-green-400/30 text-green-400'
        : 'bg-red-400/10 border-red-400/30 text-red-400'
    }`}>
      <span className="text-[10px] opacity-70 font-normal whitespace-nowrap">{name}</span>
      <span>{status}</span>
    </div>
  );
}

export default function DecisionPanel({
  label, confidencePct, regimeGate, flowGate, leadershipGate, riskGate, reasons, conflicts,
}: DashboardViewModel['decision']) {
  // Spec #2: operational color mapping — NO_TRADE is amber, not red
  const labelColor =
    label === 'LONG_BIAS' ? 'text-green-400' :
    label === 'SHORT_BIAS' ? 'text-red-400' :
    label === 'PAPER_ELIGIBLE' ? 'text-blue-400' :
    label === 'NO_TRADE' ? 'text-amber-400' :
    label === 'WATCHLIST' ? 'text-sky-400' :
    'text-text-muted';

  // Spec #2: grey out if confidence low
  const confLow = confidencePct < 40;
  const allGatesFail = regimeGate === 'FAIL' && flowGate === 'FAIL' && leadershipGate === 'FAIL' && riskGate === 'FAIL';

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-2">Decision Engine</div>
          <div className={`text-2xl font-bold tracking-tight ${allGatesFail || confLow ? 'opacity-50' : ''} ${labelColor}`}>
            {label}
          </div>
          <div className={`text-sm mt-1 ${confLow ? 'text-text-muted' : 'text-text-secondary'}`}>
            Confidence: <span className="font-mono font-semibold">{confidencePct}%</span>
            {confLow && <span className="ml-2 text-[10px] text-amber-400">below threshold</span>}
          </div>
        </div>

        {/* Gate row */}
        <div className="flex gap-2">
          <GateBadge name="Regime" status={regimeGate} />
          <GateBadge name="Flow" status={flowGate} />
          <GateBadge name="Leadership" status={leadershipGate} />
          <GateBadge name="Risk" status={riskGate} />
        </div>
      </div>

      {/* Reasons block — max 3 */}
      {reasons.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5 font-semibold">Reasons</div>
          <ul className="space-y-1">
            {reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="text-text-muted mt-0.5">·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conflict block — only when conflicts exist */}
      {conflicts.length > 0 && (
        <div className="p-3 bg-amber-400/5 border border-amber-400/25 rounded-lg">
          <div className="text-xs text-amber-400 font-semibold mb-1.5 flex items-center gap-1.5">
            <span>⚠</span> Engine Conflicts Detected
          </div>
          <ul className="space-y-0.5">
            {conflicts.map((c, i) => (
              <li key={i} className="text-xs text-amber-400/80">· {c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
