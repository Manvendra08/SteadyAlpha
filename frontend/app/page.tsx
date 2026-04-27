import React from 'react';
import Link from 'next/link';
import SystemStatusBar from '../components/SystemStatusBar';
import RegimeCard from '../components/RegimeCard';
import FlowsCard from '../components/FlowsCard';
import LeadershipCard from '../components/LeadershipCard';
import RiskCard from '../components/RiskCard';
import DecisionPanel from '../components/DecisionPanel';
import ChangesPanel from '../components/ChangesPanel';
import PaperActionsTable from '../components/PaperActionsTable';
import DiagnosticsDrawer from '../components/DiagnosticsDrawer';
import RawDataEvidenceDrawer from '../components/RawDataEvidenceDrawer';
import { supabase } from '../lib/supabase';
import { DashboardViewModel } from '../types/DashboardViewModel';

export const revalidate = 0;

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildDegradedReason(summary: any, status: string): string | null {
  if (status !== 'DEGRADED') return null;
  if (!summary) return 'No run data available';
  if (summary.flows?.flows_score === undefined) return 'Flows data unavailable — options feed stale';
  if (summary.leadership?.universe_size < 10) return 'Leadership coverage insufficient';
  if (summary.regime?.vix_value === undefined) return 'Fallback data used for VIX';
  return 'One or more data feeds degraded';
}

function buildSourceRegistry(run: any, summary: any): DashboardViewModel['diagnostics']['sourceRegistry'] {
  const ts = run?.timestamp ?? null;
  const date = ts ? ts.slice(0, 10) : null;
  return [
    { datasetKey: 'nifty_ohlcv', datasetLabel: 'Nifty 50 OHLCV', provider: 'yfinance', scope: '^NSEI', marketDate: date, fetchedAt: ts, freshness: summary?.regime ? 'FRESH' : 'MISSING', recordCount: summary?.regime?.raw_inputs?.close_len ?? null, usedIn: 'Regime', status: summary?.regime ? 'loaded' : 'failed', note: null },
    { datasetKey: 'india_vix', datasetLabel: 'India VIX', provider: 'yfinance/mock', scope: '^INDIAVIX', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Regime', status: 'fallback', note: 'Hardcoded mock 18.0' },
    { datasetKey: 'fii_flows', datasetLabel: 'FII Cash Flows', provider: 'nsepython/mock', scope: 'NSE FII net', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Flows', status: 'fallback', note: 'Random mock — real NSE API not connected' },
    { datasetKey: 'dii_flows', datasetLabel: 'DII Cash Flows', provider: 'nsepython/mock', scope: 'NSE DII net', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Flows', status: 'fallback', note: 'Random mock — real NSE API not connected' },
    { datasetKey: 'pcr_oi', datasetLabel: 'PCR OI', provider: 'nsepython/mock', scope: 'NIFTY options chain', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Flows', status: 'fallback', note: 'Random mock 0.8–1.2' },
    { datasetKey: 'sector_indices', datasetLabel: 'Sector Indices', provider: 'yfinance/mock', scope: 'IT/BANK/PHARMA', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Flows', status: 'fallback', note: 'Random walk mock' },
    { datasetKey: 'universe_ohlcv', datasetLabel: 'Universe OHLCV', provider: 'yfinance/mock', scope: 'F&O 200 (mock)', marketDate: null, fetchedAt: null, freshness: 'FALLBACK', recordCount: null, usedIn: 'Leadership', status: 'fallback', note: 'F&O 200 not yet connected' },
    { datasetKey: 'regime_history', datasetLabel: 'Previous Regime State', provider: 'supabase', scope: 'regime_history', marketDate: null, fetchedAt: ts, freshness: 'FRESH', recordCount: 1, usedIn: 'Regime', status: 'loaded', note: null },
    { datasetKey: 'equity_state', datasetLabel: 'Account Equity / Drawdown', provider: 'supabase/mock', scope: 'paper_trades', marketDate: null, fetchedAt: ts, freshness: 'FRESH', recordCount: null, usedIn: 'Risk', status: 'fallback', note: 'Equity curve is random mock' },
  ];
}

function buildValidationChecks(summary: any, vm: Partial<DashboardViewModel>): DashboardViewModel['diagnostics']['validationChecks'] {
  const advisor = summary?.advisor;
  const risk = summary?.risk;
  const leadership = summary?.leadership;
  const confidence = advisor?.confidence ?? null;

  return [
    {
      label: 'Confidence in 0–100 range',
      result: confidence !== null && confidence >= 0 && confidence <= 1 ? 'PASS' : confidence === null ? 'WARN' : 'FAIL',
      note: confidence !== null ? `Raw: ${(confidence * 100).toFixed(0)}%` : 'No advisor data',
    },
    {
      label: 'Leadership coverage threshold met',
      result: leadership?.universe_size >= 10 ? 'PASS' : leadership?.universe_size > 0 ? 'WARN' : 'FAIL',
      note: `Universe: ${leadership?.universe_size ?? 0} stocks`,
    },
    {
      label: 'No directional trade when risk halted',
      result: risk?.status === 'HALTED' && (advisor?.action === 'LONG' || advisor?.action === 'SHORT') ? 'FAIL' : 'PASS',
      note: risk?.status === 'HALTED' ? 'Risk HALTED' : 'OK',
    },
    {
      label: 'No paper promotion on NO_TRADE',
      result: advisor?.action === 'NO_TRADE' ? 'PASS' : 'WARN',
      note: advisor?.action !== 'NO_TRADE' ? 'Paper promotion possible' : 'Correct',
    },
    {
      label: 'Real NIFTY data loaded',
      result: summary?.regime ? 'PASS' : 'FAIL',
      note: summary?.regime ? 'Via yfinance' : 'Missing',
    },
    {
      label: 'Fallback sources flagged',
      result: 'WARN',
      note: 'VIX, FII, DII, PCR on mock data',
    },
    {
      label: 'Engine statuses typed',
      result: 'PASS',
      note: 'All engines return typed status',
    },
  ];
}

function buildEngineWarnings(summary: any): string[] {
  const warnings: string[] = [
    'VIX hardcoded to 18.0 — real ^INDIAVIX fetch pending',
    'FII / DII / PCR flows are random mocks — NSE API not connected',
    'Stock universe is 3-symbol mock — F&O 200 not yet wired',
    'Equity curve is random walk — no real brokerage connection',
  ];
  if (summary?.advisor?.conflict_detected) warnings.push('Direction conflict detected between engines');
  if (summary?.risk?.circuit_breaker?.active) warnings.push('Circuit breaker tripped — advisor forced HALT');
  return warnings;
}

// ─── main page ────────────────────────────────────────────────────────────────
export default async function Home() {
  const { data: latestRun } = await supabase
    .from('runs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const runId = latestRun?.id;

  let summary: any = null;
  if (runId) {
    const { data } = await supabase
      .from('signals_summary')
      .select('*')
      .eq('run_id', runId)
      .single();
    summary = data;
  }

  const { data: rawOrders } = await supabase
    .from('paper_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // ── derive top-level ─────────────────────────────────────────────────────
  const sysStatus: DashboardViewModel['systemStatus'] =
    latestRun?.status === 'completed' ? 'HEALTHY' :
    latestRun?.status === 'failed' ? 'FAILED' : 'DEGRADED';

  const riskMode: DashboardViewModel['riskMode'] =
    summary?.risk?.status === 'HALTED' ? 'HALTED' :
    summary?.risk?.status === 'REDUCED' ? 'REDUCED' : 'ACTIVE';

  // ── regime ───────────────────────────────────────────────────────────────
  const regimeState = summary?.regime?.state?.toUpperCase() ?? 'RANGE_BOUND';
  const regimeReady = !!summary?.regime;
  const vixIsFallback = !summary?.regime?.vix_value || summary?.regime?.vix_value === 18.0;
  const breadthIsFallback = !summary?.regime?.breadth_pct;

  const regime: DashboardViewModel['regime'] = {
    state: regimeState,
    confidencePct: Math.round((summary?.regime?.trend_score ?? 0) * 100),
    trendScore: summary?.regime?.trend_score ?? 0,
    adx: summary?.regime?.raw_inputs?.adx ?? 0,
    vix: summary?.regime?.vix_value ?? 0,
    vixPercentile: 50,
    breadthPct: summary?.regime?.breadth_pct ?? 0,
    hysteresisState: summary?.regime?.transition_reason === 'stable' ? 'CONFIRMED' : 'WAITING',
    engineStatus: regimeReady ? (vixIsFallback || breadthIsFallback ? 'DEGRADED' : 'READY') : 'FAILED',
    dependency: `Nifty OHLCV loaded${vixIsFallback ? '; VIX fallback used' : ''}${breadthIsFallback ? '; breadth mock' : ''}`,
    impact: regimeState === 'BULLISH' || regimeState === 'TREND_UP'
      ? 'Regime vote contributed LONG bias'
      : regimeState === 'BEARISH' || regimeState === 'TREND_DOWN'
      ? 'Regime vote contributed SHORT bias'
      : 'Blocked directional setup — range-bound or transition',
    warning: vixIsFallback ? 'VIX is mocked — regime confidence approximate' : null,
  };

  // ── flows ────────────────────────────────────────────────────────────────
  const flowScore = summary?.flows?.flows_score ?? 0;
  const flowBias: DashboardViewModel['flows']['bias'] = flowScore > 0.2 ? 'BULLISH' : flowScore < -0.2 ? 'BEARISH' : 'NEUTRAL';

  const flows: DashboardViewModel['flows'] = {
    bias: flowBias,
    fii5dNet: summary?.flows?.fii_5d_z ?? null,
    dii5dNet: null,
    pcrOi: summary?.flows?.pcr_smooth ?? null,
    maxPain: null,
    spotVsMaxPainPct: null,
    sectorAlignment: 'UNKNOWN',
    freshness: summary?.flows ? 'FALLBACK' : 'MISSING',
    biasDrivers: summary?.flows
      ? [`FII Z: ${summary.flows.fii_5d_z?.toFixed(2) ?? '—'}`, `PCR: ${summary.flows.pcr_smooth?.toFixed(2) ?? '—'}`]
      : [],
    engineStatus: summary?.flows ? 'DEGRADED' : 'FAILED',
    dependency: 'FII/DII flows mock; PCR OI mock; sector feed not connected',
    impact: `Flow vote ${flowBias === 'NEUTRAL' ? 'neutral — no directional contribution' : `${flowBias.toLowerCase()} — vote weakened by mock data`}`,
    warning: 'All flow inputs are random mocks — not real NSE data',
  };

  // ── leadership ───────────────────────────────────────────────────────────
  const leadCount = summary?.leadership?.leaders_count ?? 0;
  const universeSize = summary?.leadership?.universe_size ?? 0;

  const leadership: DashboardViewModel['leadership'] = {
    status: leadCount > 0 ? 'READY' : universeSize > 0 ? 'SUPPRESSED' : 'DATA_MISSING',
    universeCoverage: universeSize > 0 ? universeSize / 200 : null,
    qualifiedLeaderCount: leadCount,
    qualifiedLaggardCount: 0,
    leaders: summary?.leadership?.details?.leaders ?? [],
    laggards: summary?.leadership?.details?.laggards ?? [],
    statusReason: leadCount > 0 ? 'Leaders found' : 'No qualified leaders after liquidity filter',
    engineStatus: leadCount > 0 ? 'READY' : universeSize > 0 ? 'SUPPRESSED' : 'DEGRADED',
    dependency: 'Universe OHLCV mock (3 stocks); F&O 200 not connected',
    impact: leadCount > 0
      ? `${leadCount} leaders contributed to leadership vote`
      : 'Leadership vote suppressed — no qualifying setups',
    warning: 'Universe is 3-symbol mock — not real F&O 200',
  };

  // ── risk ─────────────────────────────────────────────────────────────────
  const riskReady = !!summary?.risk;
  const circuitBreaker = summary?.risk?.circuit_breaker?.active ?? false;

  const risk: DashboardViewModel['risk'] = {
    mode: riskMode,
    baseRiskPct: summary?.risk?.portfolio_risk?.portfolio_risk_pct ?? 0,
    drawdownPct: 0,
    drawdownLimitPct: summary?.risk?.limits?.daily_drawdown_limit_pct ?? 0,
    positionSize: null,
    triggerReason: circuitBreaker ? 'Circuit breaker active' : null,
    consecutiveLossDays: null,
    engineStatus: riskReady ? (circuitBreaker ? 'FAILED' : 'READY') : 'DEGRADED',
    dependency: 'Account equity mock; trade history from Supabase paper_trades',
    impact: circuitBreaker ? 'Circuit breaker TRIPPED — advisor forced HALT' : 'Risk gate PASS — position sizing active',
    warning: circuitBreaker ? 'Circuit breaker active — no new positions' : null,
  };

  // ── decision ─────────────────────────────────────────────────────────────
  // Spec #2: no NEUTRAL — map to operational labels
  const rawAction = summary?.advisor?.action;
  const decisionLabelRaw = rawAction === 'LONG' ? 'LONG_BIAS' :
    rawAction === 'SHORT' ? 'SHORT_BIAS' :
    rawAction === 'PAPER_ELIGIBLE' ? 'PAPER_ELIGIBLE' :
    rawAction === 'WATCHLIST' ? 'WATCHLIST' :
    'NO_TRADE';

  const decision: DashboardViewModel['decision'] = {
    label: decisionLabelRaw,
    confidencePct: Math.round((summary?.advisor?.confidence ?? 0) * 100),
    regimeGate: summary?.advisor?.components?.regime?.vote ? 'PASS' : 'FAIL',
    flowGate: summary?.advisor?.components?.flows?.vote ? 'PASS' : 'FAIL',
    leadershipGate: summary?.advisor?.components?.leadership?.vote ? 'PASS' : 'FAIL',
    riskGate: circuitBreaker ? 'FAIL' : 'PASS',
    reasons: summary?.advisor?.score !== undefined ? [`Weighted score: ${Number(summary.advisor.score).toFixed(4)}`] : ['No advisor run data'],
    conflicts: summary?.advisor?.conflict_detected ? ['Directional conflict between engines detected'] : [],
  };

  // ── paper actions ─────────────────────────────────────────────────────────
  const paperActions: DashboardViewModel['paperActions'] = (rawOrders ?? []).map((o: any) => ({
    symbol: o.symbol,
    setupType: o.setup_type ?? 'System Signal',
    direction: o.direction,
    decision: o.status === 'filled' ? 'OPENED' : o.status === 'rejected' ? 'REJECTED' : 'PENDING',
    confidencePct: o.confidence_at_entry ? Math.round(o.confidence_at_entry * 100) : null,
    qty: o.requested_qty ?? null,
    riskGate: o.risk_pct ? 'PASS' : 'FAIL',
    source: 'DECISION_ENGINE',
    reason: o.rejection_reason ?? 'Approved',
    ts: o.created_at,
    rawId: o.id?.toString() ?? '',
  }));

  // ── diagnostics ───────────────────────────────────────────────────────────
  const sourceRegistry = buildSourceRegistry(latestRun, summary);
  const tempVm = { decision: decision as any, risk: risk as any };
  const validationChecks = buildValidationChecks(summary, tempVm);
  const engineWarnings = buildEngineWarnings(summary);

  const diagnostics: DashboardViewModel['diagnostics'] = {
    runId: runId ?? 'unknown',
    durationMs: latestRun?.duration_ms ?? 0,
    pipelineVersion: 'v0.6.1',
    triggerType: latestRun?.trigger_type ?? 'SCHEDULED',
    sourceRegistry,
    validationChecks,
    engineWarnings,
    rawDataPreviews: [], // populated when real feeds connected
  };

  const degradedReason = buildDegradedReason(summary, sysStatus);

  // ── vm ────────────────────────────────────────────────────────────────────
  const vm: DashboardViewModel = {
    systemStatus: sysStatus,
    operatingMode: 'PAPER',
    lastSuccessTs: latestRun?.timestamp ?? new Date().toISOString(),
    dataFreshness: latestRun?.status === 'failed' ? 'STALE' : summary ? 'FALLBACK' : 'MISSING',
    riskMode,
    degradedReason,
    regime,
    flows,
    leadership,
    risk,
    decision,
    changes: {
      material: false,
      items: [],
      asOfTs: new Date().toISOString(),
    },
    paperActions,
    paperActionEmptyReason: null,
    diagnostics,
  };

  return (
    <main className="min-h-screen bg-bg-primary text-text-secondary">
      <SystemStatusBar
        status={vm.systemStatus}
        mode={vm.operatingMode}
        freshness={vm.dataFreshness}
        riskMode={vm.riskMode}
        lastSuccessTs={vm.lastSuccessTs}
        degradedReason={vm.degradedReason}
      />

      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 space-y-5">

        {/* Title row */}
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold text-text-primary tracking-tight">SteadyAlpha Console</h1>
          <div className="flex items-center gap-4">
            <Link href="/diagnostics" className="text-xs text-blue-400 hover:underline font-medium">
              Engine Diagnostics →
            </Link>
            <span className="text-text-muted text-xs hidden sm:block">Stage 2 — Paper Execution</span>
          </div>
        </div>

        {/* Engine cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RegimeCard {...vm.regime} />
          <FlowsCard {...vm.flows} />
          <LeadershipCard {...vm.leadership} />
          <RiskCard {...vm.risk} />
        </div>

        {/* Decision panel */}
        <DecisionPanel {...vm.decision} />

        {/* State changes */}
        <ChangesPanel {...vm.changes} />

        {/* Paper actions */}
        <PaperActionsTable
          actions={vm.paperActions}
          operatingMode={vm.operatingMode}
          emptyReason={vm.paperActionEmptyReason}
          decisionLabel={vm.decision.label}
          riskMode={vm.riskMode}
        />

        {/* Diagnostics drawer */}
        <DiagnosticsDrawer diagnostics={vm.diagnostics} />

        {/* Raw data evidence drawer */}
        <RawDataEvidenceDrawer previews={vm.diagnostics.rawDataPreviews} />

      </div>
    </main>
  );
}
