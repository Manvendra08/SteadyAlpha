import React from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

export default function ChangesPanel({ material, items, asOfTs }: DashboardViewModel['changes']) {
  return (
    <div className="bg-bg-card border border-border-theme rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">State Changes</h2>
        <span className="text-[10px] text-text-muted opacity-60">
          Since {new Date(asOfTs).toLocaleTimeString()}
        </span>
      </div>

      {!material || items.length === 0 ? (
        <div className="text-sm text-text-muted italic opacity-70">No material changes since last run</div>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
              <span className="text-text-muted mt-0.5">→</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
