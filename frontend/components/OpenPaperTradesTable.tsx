'use client';
import React from 'react';

export interface OpenPaperTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  entryAt: string;
  simulationVersion: string;
}

interface OpenPaperTradesTableProps {
  trades: OpenPaperTradeRow[];
}

export default function OpenPaperTradesTable({ trades }: OpenPaperTradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="bg-bg-card border border-border-theme rounded-xl p-6 flex items-center gap-3">
        <span className="text-text-muted text-lg">📁</span>
        <div>
          <div className="text-text-muted text-sm">No open paper trades</div>
          <div className="text-[10px] text-text-muted opacity-60 mt-0.5">
            When signals are promoted, active trades will appear here
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-theme flex items-center justify-between bg-white/5">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Active Exposure</h2>
        <span className="text-[10px] text-green-400 font-bold bg-green-400/10 px-2 py-0.5 rounded border border-green-400/20">
          {trades.length} OPEN
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-border-theme text-text-muted uppercase tracking-widest text-[10px]">
            <tr>
              {['Symbol', 'Direction', 'Qty', 'Entry Price', 'Entry Time', 'Version'].map(h => (
                <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme text-text-secondary">
            {trades.map((t) => (
              <tr key={t.id} className="hover:bg-bg-elevated/50 transition-colors">
                <td className="px-4 py-2.5 font-mono font-semibold text-text-primary">{t.symbol}</td>
                <td className={`px-4 py-2.5 font-bold ${t.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                  {t.direction}
                </td>
                <td className="px-4 py-2.5 font-mono">{t.qty}</td>
                <td className="px-4 py-2.5 font-mono text-text-primary">₹{t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2.5 text-text-muted">{new Date(t.entryAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-text-muted font-mono opacity-50">{t.simulationVersion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

