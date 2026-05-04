import React from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

function EngineStatusBox({ name, validity, vote }: { name: string; validity: string; vote: string }) {
  const isInvalid = validity === 'INVALID' || validity === 'FAILED';
  const isNeutral = vote === 'NEUTRAL' || vote === 'WEAK' || vote === 'NO_QUALIFIERS';
  const isLong = vote === 'LONG' || vote === 'PASS_EXECUTION';
  const isShort = vote === 'SHORT' || vote === 'BLOCKED';

  return (
    <div className={`flex flex-col gap-1 p-3 rounded-xl border transition-all duration-300 ${
      isInvalid ? 'bg-red-400/5 border-red-400/20 text-red-400' : 
      isLong ? 'bg-green-400/5 border-green-400/20 text-green-400' :
      isShort ? 'bg-amber-400/5 border-amber-400/20 text-amber-400' :
      'bg-bg-subtle border-border-theme/50 text-text-muted'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">{name}</span>
        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-md border ${
          validity === 'VALID' ? 'border-green-400/30 text-green-400' : 'border-amber-400/30 text-amber-400'
        }`}>{validity}</span>
      </div>
      <div className="text-xs font-black tracking-tight mt-1">
        {vote.replace(/_/g, ' ')}
      </div>
    </div>
  );
}

export default function DecisionPanel({
  label, topLineSummary, confidencePct, directionalConfidence, actionConfidence, 
  validityStatus, directionalVotes, reasons, conflicts,
  drivers, boosters, drags, gates, confidenceCalibration,
}: DashboardViewModel['decision']) {
  const isInvalid = label === 'INVALID_FOR_TRADING';
  const isLong = label.includes('LONG') || label.includes('PAPER_ELIGIBLE');
  const isShort = label.includes('SHORT');
  
  const labelColor =
    isLong ? 'text-green-400' :
    isShort ? 'text-red-400' :
    label === 'NO_TRADE' ? 'text-amber-400' :
    isInvalid ? 'text-red-500' :
    'text-text-muted';

  return (
    <div className={`relative overflow-hidden bg-bg-card border-2 rounded-3xl p-8 shadow-2xl transition-all duration-500 ${isInvalid ? 'border-red-500/30' : 'border-border-theme'}`}>
      {/* Background Glow */}
      <div className={`absolute -top-24 -right-24 w-64 h-64 blur-[120px] rounded-full opacity-20 pointer-events-none ${labelColor.replace('text', 'bg')}`}></div>
      
      <div className="relative z-10 flex flex-col lg:flex-row gap-8">
        {/* Decision Hero */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-text-muted text-[10px] font-black uppercase tracking-[0.3em] mb-4 opacity-60">Master Decision Engine</div>
          
          <div className={`text-5xl lg:text-6xl font-black tracking-tighter mb-2 ${labelColor}`}>
            {label.replace(/_/g, ' ')}
          </div>
          
          {topLineSummary && (
            <div className="text-sm text-text-secondary font-medium mb-6 opacity-80 max-w-xl leading-relaxed">
              {topLineSummary}
            </div>
          )}

          <div className="flex flex-wrap gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Directional Conf.</span>
              <div className="flex items-baseline gap-2">
                 <span className={`text-2xl font-mono font-black ${directionalConfidence < 22 ? 'text-amber-400' : 'text-text-primary'}`}>{directionalConfidence}%</span>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-1">Action Conf.</span>
              <div className="flex items-baseline gap-2">
                 <span className={`text-2xl font-mono font-black ${actionConfidence < 38 ? 'text-amber-400' : 'text-text-primary'}`}>{actionConfidence}%</span>
              </div>
            </div>
            {isInvalid && (
              <div className="px-4 py-2 bg-red-600/20 text-red-500 border border-red-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center">
                Simulation Only
              </div>
            )}
          </div>

          {/* Confidence Calibration Trace (Spec 5.0) */}
          {confidenceCalibration && (
            <div className="mt-6 flex flex-wrap gap-4 p-4 bg-bg-elevated/40 rounded-2xl border border-border-theme/30 backdrop-blur-sm">
               <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">Regime Contrib</span>
                  <span className="text-xs font-mono font-bold text-text-primary">+{Math.round(confidenceCalibration.contributions.regime * 100)}%</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">Flows Contrib</span>
                  <span className="text-xs font-mono font-bold text-text-primary">+{Math.round(confidenceCalibration.contributions.flows * 100)}%</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">Leadership Contrib</span>
                  <span className="text-xs font-mono font-bold text-text-primary">+{Math.round(confidenceCalibration.contributions.leadership * 100)}%</span>
               </div>
               <div className="flex flex-col">
                  <span className="text-[8px] font-black uppercase tracking-widest text-text-muted mb-1">Bonus/Drag</span>
                  <span className={`text-xs font-mono font-bold ${confidenceCalibration.contributions.bonus - confidenceCalibration.contributions.penalty >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Math.round((confidenceCalibration.contributions.bonus - confidenceCalibration.contributions.penalty) * 100)}%
                  </span>
               </div>
            </div>
          )}
        </div>

        {/* Engine Validity & Votes (Final Tuning Spec) */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          <div className="text-[10px] text-text-muted font-black uppercase tracking-[0.2em] mb-1">Engine Diagnostics</div>
          <EngineStatusBox name="Regime" validity={validityStatus.regime} vote={directionalVotes.regime} />
          <EngineStatusBox name="Flows" validity={validityStatus.flows} vote={directionalVotes.flows} />
          <EngineStatusBox name="Leadership" validity={validityStatus.leadership} vote={directionalVotes.leadership} />
          <EngineStatusBox name="Risk" validity={validityStatus.risk} vote={directionalVotes.risk} />
        </div>
      </div>

      {/* Evidence & Logic (Relaxation Spec v1.0) */}
      <div className="mt-8 pt-8 border-t border-border-theme/50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mb-3 text-green-400/70">Direction Drivers</div>
          <div className="space-y-2">
            {drivers.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-text-secondary font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400"></div>
                {d}
              </div>
            ))}
            {drivers.length === 0 && <div className="text-[11px] text-text-faint italic">No primary drivers</div>}
          </div>
        </div>

        <div>
          <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mb-3 text-blue-400/70">Confidence Boosters</div>
          <div className="space-y-2">
            {boosters.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-text-secondary font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                {b}
              </div>
            ))}
            {boosters.length === 0 && <div className="text-[11px] text-text-faint italic">No boosters found</div>}
          </div>
        </div>

        <div>
          <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mb-3 text-amber-400/70">Confidence Drags</div>
          <div className="space-y-2">
            {drags.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-text-secondary font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                {d}
              </div>
            ))}
            {drags.length === 0 && <div className="text-[11px] text-text-faint italic">No significant drags</div>}
          </div>
        </div>

        <div>
          <div className="text-[9px] text-text-muted font-black uppercase tracking-[0.2em] mb-3 opacity-60">Execution Gates</div>
          <div className="space-y-2">
            {gates.map((g, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-text-secondary font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-text-faint"></div>
                {g}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
