import React from 'react';

interface RiskCardProps {
  baseRiskPct: number;
  drawdownLimitPct: number;
  currentDrawdown: number;
  circuitBreakerActive: boolean;
}

export default function RiskCard({ baseRiskPct, drawdownLimitPct, currentDrawdown, circuitBreakerActive }: RiskCardProps) {
  const drawdownColor = currentDrawdown > drawdownLimitPct * 0.7 ? '#e53e3e' : '#38a169';

  return (
    <div style={{
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: circuitBreakerActive ? '2px solid #e53e3e' : '1px solid #2d3748',
      color: '#e2e8f0',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '8px' }}>
        Risk State
      </div>

      {circuitBreakerActive && (
        <div style={{
          padding: '6px 10px', backgroundColor: '#742a2a', borderRadius: '6px',
          fontSize: '13px', color: '#feb2b2', marginBottom: '12px',
        }}>
          🛑 CIRCUIT BREAKER ACTIVE
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>Base Risk</div>
          <div style={{ fontSize: '18px' }}>{baseRiskPct}%</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>DD Limit</div>
          <div style={{ fontSize: '18px' }}>{drawdownLimitPct}%</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>Current DD</div>
          <div style={{ fontSize: '18px', color: drawdownColor }}>{currentDrawdown.toFixed(1)}%</div>
        </div>
      </div>
    </div>
  );
}
