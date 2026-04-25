import React from 'react';
import HealthBanner from '../components/HealthBanner';

export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0 }}>
      <HealthBanner />
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ color: '#2d3748' }}>SteadyAlpha Console</h1>
        <h2 style={{ color: '#4a5568', fontWeight: 'normal', marginTop: '8px' }}>
          Stage 0: Foundation
        </h2>
        
        <div style={{ 
          marginTop: '40px', 
          padding: '24px', 
          backgroundColor: '#f7fafc', 
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <h3 style={{ marginTop: 0, color: '#2d3748' }}>Operational Honesty</h3>
          <p style={{ color: '#4a5568', lineHeight: 1.6 }}>
            This console is currently in Stage 0. The objective is to ensure the pipeline 
            infrastructure, health tracking, and deterministic replay capabilities are 
            reliable before introducing signal logic.
          </p>
        </div>
      </div>
    </main>
  );
}
