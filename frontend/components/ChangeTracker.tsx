import React from 'react';

interface Change {
  field: string;
  previous: string;
  current: string;
}

interface ChangeTrackerProps {
  changes: Change[];
  lastRunTs: string;
}

export default function ChangeTracker({ changes, lastRunTs }: ChangeTrackerProps) {
  return (
    <div style={{
      padding: '16px 20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: '1px solid #2d3748',
      color: '#e2e8f0',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0' }}>
          Changes Since Last Run
        </div>
        <div style={{ fontSize: '11px', color: '#718096' }}>
          {new Date(lastRunTs).toLocaleString()}
        </div>
      </div>

      {changes.length === 0 ? (
        <div style={{ fontSize: '14px', color: '#718096' }}>No changes detected.</div>
      ) : (
        changes.map((c, i) => (
          <div key={i} style={{
            display: 'flex', gap: '12px', fontSize: '13px',
            padding: '4px 0', borderBottom: '1px solid #2d3748',
          }}>
            <span style={{ color: '#a0aec0', minWidth: '120px' }}>{c.field}</span>
            <span style={{ color: '#fc8181', textDecoration: 'line-through' }}>{c.previous}</span>
            <span style={{ color: '#68d391' }}>→ {c.current}</span>
          </div>
        ))
      )}
    </div>
  );
}
