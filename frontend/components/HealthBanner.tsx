import React from 'react';

// Mocked for foundation phase - will be connected to Supabase
const mockHealthData = {
  status: 'healthy',
  last_success_at: new Date().toISOString(),
  message: 'Pipeline is operational'
};

export default function HealthBanner() {
  const { status, last_success_at, message } = mockHealthData;
  const isHealthy = status === 'healthy';

  return (
    <div style={{
      padding: '12px',
      backgroundColor: isHealthy ? '#e6fffa' : '#fff5f5',
      borderBottom: `1px solid ${isHealthy ? '#38b2ac' : '#e53e3e'}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div>
        <strong style={{ color: isHealthy ? '#285e61' : '#9b2c2c' }}>
          System Status: {status.toUpperCase()}
        </strong>
        <span style={{ marginLeft: '12px', color: '#4a5568', fontSize: '14px' }}>
          {message}
        </span>
      </div>
      <div style={{ color: '#718096', fontSize: '12px' }}>
        Last Success: {new Date(last_success_at).toLocaleString()}
      </div>
    </div>
  );
}
