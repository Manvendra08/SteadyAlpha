import React from 'react';

interface Trade {
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
    <div style={{ backgroundColor: '#1a202c', padding: '20px', borderRadius: '12px', border: '1px solid #2d3748', marginTop: '20px', color: '#e2e8f0' }}>
      <h2 style={{ fontSize: '18px', marginBottom: '16px', color: '#a0aec0', textTransform: 'uppercase' }}>Performance by Regime</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {Object.keys(statsByRegime).length === 0 ? <div style={{color: '#718096'}}>No closed trades yet.</div> : null}
        {Object.entries(statsByRegime).map(([regime, stats]) => {
          const winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
          return (
            <div key={regime} style={{ backgroundColor: '#2d3748', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>{regime}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#a0aec0', fontSize: '12px' }}>Win Rate:</span>
                <span style={{ fontSize: '14px', color: winRate >= 50 ? '#68d391' : '#fc8181' }}>{winRate.toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#a0aec0', fontSize: '12px' }}>Net PnL:</span>
                <span style={{ fontSize: '14px', color: stats.pnl >= 0 ? '#68d391' : '#fc8181' }}>₹{stats.pnl.toFixed(0)}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#718096', marginTop: '8px', textAlign: 'right' }}>
                {stats.total} trades
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
