import React from 'react';

interface AdvisorCardProps {
  recommendation: 'LONG' | 'SHORT' | 'NO_TRADE';
  confidence: number;
  reasoning: string[];
}

const recColors: Record<string, string> = {
  LONG: '#38a169',
  SHORT: '#e53e3e',
  NO_TRADE: '#d69e2e',
};

export default function AdvisorCard({ recommendation, confidence, reasoning }: AdvisorCardProps) {
  const color = recColors[recommendation] || '#718096';

  return (
    <div style={{
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: `2px solid ${color}`,
      color: '#e2e8f0',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '8px' }}>
        AI Advisor
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color }}>
        {recommendation}
      </div>
      <div style={{ marginTop: '8px' }}>
        <div style={{
          height: '6px', backgroundColor: '#2d3748', borderRadius: '3px',
          overflow: 'hidden', marginBottom: '4px',
        }}>
          <div style={{
            height: '100%', width: `${confidence}%`,
            backgroundColor: color, borderRadius: '3px',
          }} />
        </div>
        <div style={{ fontSize: '12px', color: '#a0aec0' }}>
          Confidence: {confidence}%
        </div>
      </div>
      <div style={{ marginTop: '12px' }}>
        {reasoning.map((r, i) => (
          <div key={i} style={{ fontSize: '13px', color: '#cbd5e0', padding: '2px 0' }}>
            • {r}
          </div>
        ))}
      </div>
    </div>
  );
}
