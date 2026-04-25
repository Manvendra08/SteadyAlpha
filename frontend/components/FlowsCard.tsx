import React from 'react';

interface FlowsCardProps {
  bias: string;
  fiiNet: number;
  diiNet: number;
  pcrValue: number;
  pcrPercentile: number;
}

export default function FlowsCard({ bias, fiiNet, diiNet, pcrValue, pcrPercentile }: FlowsCardProps) {
  const biasColor = bias === 'bullish' ? '#38a169' : bias === 'bearish' ? '#e53e3e' : '#d69e2e';

  return (
    <div style={{
      padding: '20px',
      borderRadius: '12px',
      backgroundColor: '#1a202c',
      border: '1px solid #2d3748',
      color: '#e2e8f0',
    }}>
      <div style={{ fontSize: '12px', textTransform: 'uppercase', color: '#a0aec0', marginBottom: '8px' }}>
        Market Flows
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: biasColor }}>
        {bias.toUpperCase()}
      </div>
      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>FII Net</div>
          <div style={{ fontSize: '16px', color: fiiNet >= 0 ? '#68d391' : '#fc8181' }}>
            ₹{fiiNet.toFixed(0)} Cr
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>DII Net</div>
          <div style={{ fontSize: '16px', color: diiNet >= 0 ? '#68d391' : '#fc8181' }}>
            ₹{diiNet.toFixed(0)} Cr
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>PCR</div>
          <div style={{ fontSize: '16px' }}>{pcrValue.toFixed(2)}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#718096' }}>PCR %ile</div>
          <div style={{ fontSize: '16px' }}>{pcrPercentile.toFixed(0)}th</div>
        </div>
      </div>
    </div>
  );
}
