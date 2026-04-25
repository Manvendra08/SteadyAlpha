import React from 'react';

interface Leader {
  symbol: string;
  z_score: number;
  rank: number;
}

interface LeadershipCardProps {
  leaders: Leader[];
  laggards: Leader[];
}

export default function LeadershipCard({ leaders, laggards }: LeadershipCardProps) {
  return (
    <div style={{
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: '1px solid #2d3748',
      color: '#e2e8f0',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '12px' }}>
        Leadership (RS Slope)
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: '#68d391', marginBottom: '6px' }}>▲ LEADERS</div>
        {leaders.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#718096' }}>No data yet</div>
        ) : (
          leaders.slice(0, 5).map((l) => (
            <div key={l.symbol} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '13px', padding: '2px 0',
            }}>
              <span>{l.rank}. {l.symbol}</span>
              <span style={{ color: '#68d391' }}>Z: {l.z_score.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>

      <div>
        <div style={{ fontSize: '11px', color: '#fc8181', marginBottom: '6px' }}>▼ LAGGARDS</div>
        {laggards.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#718096' }}>No data yet</div>
        ) : (
          laggards.slice(0, 5).map((l) => (
            <div key={l.symbol} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: '13px', padding: '2px 0',
            }}>
              <span>{l.rank}. {l.symbol}</span>
              <span style={{ color: '#fc8181' }}>Z: {l.z_score.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
