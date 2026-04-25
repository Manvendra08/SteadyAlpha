import React from 'react';

interface RegimeCardProps {
  state: string;
  score: number;
  changed: boolean;
}

const stateColors: Record<string, string> = {
  bullish: '#38a169',
  bearish: '#e53e3e',
  range: '#d69e2e',
  volatile: '#805ad5',
};

export default function RegimeCard({ state, score, changed }: RegimeCardProps) {
  const color = stateColors[state] || '#718096';

  return (
    <div style={{
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: `2px solid ${color}`,
      color: '#e2e8f0',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '8px' }}>
        Market Regime
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color }}>
        {state.toUpperCase()}
      </div>
      <div style={{ marginTop: '12px', fontSize: '14px', color: '#a0aec0' }}>
        Score: {score.toFixed(2)}
      </div>
      {changed && (
        <div style={{
          marginTop: '8px',
          padding: '4px 8px',
          backgroundColor: '#744210',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#fefcbf',
          display: 'inline-block',
        }}>
          ⚡ CHANGED
        </div>
      )}
    </div>
  );
}
