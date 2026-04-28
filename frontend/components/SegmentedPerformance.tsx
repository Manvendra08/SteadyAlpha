'use client';
import React from 'react';

export interface Trade {
  pnl: number;
  regimeAtEntry: string;
}

interface Props {
  trades: Trade[];
}

export default function SegmentedPerformance({ trades }: Props) {
  const statsByRegime: Record<string, { wins: number; total: number; pnl: number }> = {};

  trades.forEach(t => {
    const regime = t.regimeAtEntry?.toUpperCase() || 'UNKNOWN';
    if (!statsByRegime[regime]) {
      statsByRegime[regime] = { wins: 0, total: 0, pnl: 0 };
    }
    statsByRegime[regime].total++;
    if (t.pnl > 0) statsByRegime[regime].wins++;
    statsByRegime[regime].pnl += t.pnl;
  });

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl overflow-hidden mt-5">
      <div className="px-4 py-3 border-b border-border-theme flex items-center justify-between bg-white/5">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Performance by Regime</h2>
        <span className="text-[10px] text-text-muted bg-bg-elevated px-2 py-0.5 rounded border border-border-theme">
          {trades.length} TRADES
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {Object.keys(statsByRegime).length === 0 ? (
          <div className="text-text-muted text-sm col-span-full">No closed trades yet.</div>
        ) : null}
        {Object.entries(statsByRegime).map(([regime, stats]) => {
          const winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
          return (
            <div key={regime} className="bg-bg-elevated border border-border-theme p-4 rounded-lg">
              <div className="text-text-primary text-sm font-bold mb-3 tracking-wide">{regime}</div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-text-muted text-xs uppercase tracking-wider">Win Rate</span>
                <span className={`text-sm font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {winRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-text-muted text-xs uppercase tracking-wider">Net PnL</span>
                <span className={`text-sm font-mono font-bold ${stats.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.pnl > 0 ? '+' : ''}₹{stats.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="text-right text-[10px] text-text-muted font-mono opacity-60">
                {stats.total} {stats.total === 1 ? 'trade' : 'trades'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
