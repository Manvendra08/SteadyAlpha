'use client';
import React from 'react';

export interface ClosedPaperTradeRow {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  entryAt: string;
  exitAt: string;
  exitReason: string;
}

interface ClosedPaperTradesTableProps {
  trades: ClosedPaperTradeRow[];
}

export default function ClosedPaperTradesTable({ trades }: ClosedPaperTradesTableProps) {
  if (trades.length === 0) {
    return (
      <div className="bg-bg-card border border-border-theme rounded-xl p-6 flex items-center gap-3">
        <span className="text-text-muted text-lg">🗄️</span>
        <div>
          <div className="text-text-muted text-sm">No closed paper trades</div>
          <div className="text-[10px] text-text-muted opacity-60 mt-0.5">
            History will appear here once active trades hit exit conditions
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-theme rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-theme flex items-center justify-between bg-white/5">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Trade History</h2>
        <span className="text-[10px] text-blue-400 font-bold bg-blue-400/10 px-2 py-0.5 rounded border border-blue-400/20">
          {trades.length} CLOSED
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="border-b border-border-theme text-text-muted uppercase tracking-widest text-[10px]">
            <tr>
              {['Symbol', 'Dir', 'Qty', 'Entry', 'Exit', 'PnL', 'Entry Time', 'Exit Time', 'Reason'].map(h => (
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
                <td className="px-4 py-2.5 font-mono">₹{t.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2.5 font-mono">₹{t.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={`px-4 py-2.5 font-mono font-bold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.pnl > 0 ? '+' : ''}₹{t.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2.5 text-text-muted">{new Date(t.entryAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-text-muted">{new Date(t.exitAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-text-muted">{t.exitReason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

