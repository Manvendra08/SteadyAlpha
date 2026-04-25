import React from 'react';
import HealthBanner from '../components/HealthBanner';
import RegimeCard from '../components/RegimeCard';
import FlowsCard from '../components/FlowsCard';
import LeadershipCard from '../components/LeadershipCard';
import RiskCard from '../components/RiskCard';
import AdvisorCard from '../components/AdvisorCard';
import ChangeTracker from '../components/ChangeTracker';

// Mock signal data — will be replaced by Supabase subscription
const mockSignals = {
  regime: { state: 'range', score: 0.6, changed: false },
  flows: { bias: 'bullish', fiiNet: 1200, diiNet: -400, pcrValue: 1.15, pcrPercentile: 75 },
  leaders: [],
  laggards: [],
  risk: { baseRiskPct: 0.75, drawdownLimitPct: 6.0, currentDrawdown: 1.2, circuitBreakerActive: false },
  advisor: {
    recommendation: 'NO_TRADE' as const,
    confidence: 45,
    reasoning: [
      'Regime in RANGE — no directional conviction',
      'Flows are bullish but regime not confirmed',
      'Waiting for 2-day hysteresis gate',
    ],
  },
  changes: [
    { field: 'Flows Bias', previous: 'neutral', current: 'bullish' },
    { field: 'PCR %ile', previous: '52nd', current: '75th' },
  ],
  lastRunTs: new Date().toISOString(),
};

export default function Home() {
  const s = mockSignals;

  return (
    <main style={{
      fontFamily: "'Inter', system-ui, sans-serif",
      margin: 0, padding: 0,
      backgroundColor: '#0d1117',
      minHeight: '100vh',
    }}>
      <HealthBanner />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: '24px',
        }}>
          <h1 style={{ color: '#e2e8f0', fontSize: '24px', margin: 0 }}>
            SteadyAlpha Console
          </h1>
          <span style={{ color: '#718096', fontSize: '13px' }}>
            Stage 1 — Signal Engine & Dashboard
          </span>
        </div>

        {/* Signal Cards Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '20px',
        }}>
          <RegimeCard {...s.regime} />
          <FlowsCard {...s.flows} />
          <LeadershipCard leaders={s.leaders} laggards={s.laggards} />
          <RiskCard {...s.risk} />
        </div>

        {/* Advisor — full width */}
        <div style={{ marginBottom: '20px' }}>
          <AdvisorCard {...s.advisor} />
        </div>

        {/* Change Tracker */}
        <ChangeTracker changes={s.changes} lastRunTs={s.lastRunTs} />
      </div>
    </main>
  );
}
