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
import OpenPaperTradesTable from '../components/OpenPaperTradesTable';
import ClosedPaperTradesTable from '../components/ClosedPaperTradesTable';
import SegmentedPerformance from '../components/SegmentedPerformance';
import DiagnosticsDrawer from '../components/DiagnosticsDrawer';
import RawDataEvidenceDrawer from '../components/RawDataEvidenceDrawer';
import { supabase } from '../lib/supabase';
import { DashboardViewModel } from '../types/DashboardViewModel';
import DashboardClient from '../components/DashboardClient';

export const revalidate = 0;

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildDegradedReason(summary: any, status: string, readinessScore: number): string | null {
  if (status === 'FAILED') return 'Pipeline execution failed';
  if (readinessScore < 100) {
    return 'This run used real index data but simulated options, leadership, and risk inputs. Eligible for diagnostics only.';
  }
  if (status === 'DEGRADED') return 'One or more data feeds degraded';
  return null;
}

// Maps DB dataset_key → human-readable label and which engine it feeds
const DATASET_META: Record<string, { label: string; usedIn: string; scope: string }> = {
  nifty_ohlcv:     { label: 'Nifty 50 OHLCV',            usedIn: 'Regime',     scope: 'Index' },
  india_vix:       { label: 'India VIX',                  usedIn: 'Regime',     scope: 'Volatility' },
  fii_flows:       { label: 'FII Cash Flows',             usedIn: 'Flows',      scope: 'Institutional' },
  dii_flows:       { label: 'DII Cash Flows',             usedIn: 'Flows',      scope: 'Institutional' },
  pcr_oi:          { label: 'PCR OI',                     usedIn: 'Flows',      scope: 'Options' },
  options_chain:   { label: 'Options Chain',              usedIn: 'Flows',      scope: 'Derivatives' },
  sector_indices:  { label: 'Sector Indices',             usedIn: 'Flows',      scope: 'Breadth' },
  universe_ohlcv:  { label: 'Universe OHLCV',             usedIn: 'Leadership', scope: 'F&O 200' },
  equity_curve:    { label: 'Account Equity',             usedIn: 'Risk',       scope: 'Portfolio' },
  delivery:        { label: 'Delivery Volume',            usedIn: 'Leadership', scope: 'Equity' },
};

function provenanceToStatus(sourceType: string, tradingValid: boolean): 'loaded' | 'fallback' | 'failed' | 'cached' | 'skipped' {
  if (sourceType === 'MISSING') return 'failed';
  if (sourceType === 'CACHED')  return 'cached';
  if (sourceType === 'MOCK')    return 'fallback';
  if (!tradingValid)            return 'fallback';
  return 'loaded';
}

function buildSourceRegistry(
  run: any,
  provenance: any[],
): DashboardViewModel['diagnostics']['sourceRegistry'] {
  const ts = run?.timestamp ?? null;

  // Build a map of DB provenance rows keyed by dataset_key
  const provMap = Object.fromEntries(
    (provenance ?? []).map((p: any) => [p.dataset_key, p])
  );

  // Datasets to show (ordered)
  const keys = Object.keys(DATASET_META);

  return keys.map(key => {
    const meta = DATASET_META[key];
    const prov = provMap[key];

    if (!prov) {
      // No provenance row written — dataset was never attempted
      return {
        datasetKey:   key,
        datasetLabel: meta.label,
        provider:     '—',
        scope:        meta.scope,
        sourceType:   'MISSING' as const,
        marketDate:   null,
        fetchedAt:    null,
        freshness:    'MISSING' as const,
        recordCount:  null,
        usedIn:       meta.usedIn,
        status:       'failed' as const,
        note:         'Not attempted in this run',
        tradingValid: false,
        criticality: 'informational',
      };
    }

    const sourceType = prov.source_type as DashboardViewModel['diagnostics']['sourceRegistry'][number]['sourceType'];
    const freshness  = prov.freshness  as DashboardViewModel['diagnostics']['sourceRegistry'][number]['freshness'];
    const status     = provenanceToStatus(prov.source_type, prov.trading_valid);

    // Build note: prefer warning from DB, fall back to error
    const note = prov.warning ?? (prov.error ? `ERR: ${prov.error}` : null);

    return {
      datasetKey:   key,
      datasetLabel: meta.label,
      provider:     prov.provider ?? '—',
      scope:        meta.scope,
      sourceType,
      marketDate:   prov.market_date ?? null,
      fetchedAt:    ts,
      freshness,
      recordCount:  prov.record_count ?? null,
      usedIn:       meta.usedIn,
      status,
      note,
      tradingValid: prov.trading_valid ?? false,
      criticality: prov.criticality ?? 'informational',
    };
  });
}

function buildValidationChecks(summary: any, vm: DashboardViewModel, sourceRegistry: DashboardViewModel['diagnostics']['sourceRegistry']): DashboardViewModel['diagnostics']['validationChecks'] {
  const checks: DashboardViewModel['diagnostics']['validationChecks'] = [];
  
  // 1. Run Valid for Trading
  const tradingValid = vm.tradingValidity === 'YES';
  checks.push({
    label: 'Run Valid for Trading',
    result: tradingValid ? 'PASS' : 'FAIL',
    note: tradingValid ? 'Full operational integrity' : 'Execution disabled',
  });

  // 2. Risk Circuit Breaker
  const isHalted = summary?.risk?.status === 'HALTED' || vm.risk.mode === 'HALTED';
  checks.push({
    label: 'Risk circuit breaker state valid',
    result: isHalted ? 'FAIL' : 'PASS',
    note: isHalted ? 'Circuit breaker active' : 'Gate open',
  });

  // 3. Confidence range
  const conf = vm.decision.confidencePct;
  checks.push({
    label: 'Confidence in 0–100 range',
    result: (conf >= 0 && conf <= 100) ? 'PASS' : 'FAIL',
    note: `${conf}% calculated`,
  });

  // 4. Decision label operational
  const action = summary?.advisor?.action || 'NO_TRADE';
  const isOperational = ['NO_TRADE', 'WATCHLIST_LONG', 'WATCHLIST_SHORT', 'PAPER_ELIGIBLE_LONG', 'PAPER_ELIGIBLE_SHORT'].some(s => action.startsWith(s.split('_')[0]));
  checks.push({
    label: 'Decision label is operational',
    result: isOperational ? 'PASS' : 'WARN',
    note: action,
  });

  // 5. Watchlist Floor Check
  const dirConf = summary?.advisor?.directional_confidence ?? 0;
  const isWatchlist = action.includes('WATCHLIST');
  checks.push({
    label: 'Watchlist floor alignment',
    result: isWatchlist ? (dirConf >= 0.05 ? 'PASS' : 'FAIL') : 'PASS',
    note: `DirConf: ${Math.round(dirConf * 100)}% (floor: 5%)`,
  });

  // 6. Paper Threshold Check
  const actConf = summary?.advisor?.action_confidence ?? 0;
  const isPaperEligible = action.includes('PAPER_ELIGIBLE');
  checks.push({
    label: 'Paper promotion alignment',
    result: !isPaperEligible && actConf >= 0.18 ? 'WARN' : 'PASS',
    note: `ActConf: ${Math.round(actConf * 100)}% (threshold: 18%)`,
  });

  // 7. Critical datasets
  const criticalMissing = sourceRegistry.filter(s => s.criticality === 'CRITICAL_FOR_DECISION' && !s.tradingValid).length;
  checks.push({
    label: 'All critical datasets trading-valid',
    result: criticalMissing === 0 ? 'PASS' : 'FAIL',
    note: `${criticalMissing} critical feeds failed`,
  });

  return checks;
}

function buildConsistencyChecks(summary: any, vm: DashboardViewModel, sourceRegistry: DashboardViewModel['diagnostics']['sourceRegistry']): DashboardViewModel['diagnostics']['consistencyChecks'] {
  const checks: DashboardViewModel['diagnostics']['consistencyChecks'] = [];

  // 1. No VALID engine has missing critical dependency
  const engines = [
    { name: 'Regime', status: vm.regime.validityStatus, dep: 'nifty_ohlcv' },
    { name: 'Flows', status: vm.flows.validityStatus, dep: 'fii_flows' },
    { name: 'Leadership', status: vm.leadership.validityStatus, dep: 'universe_ohlcv' },
  ];
  const engineDepFail = engines.find(e => e.status === 'VALID' && sourceRegistry.find(s => s.datasetKey === e.dep && !s.tradingValid));
  checks.push({
    label: 'Engine dependency consistency',
    result: engineDepFail ? 'FAIL' : 'PASS',
    note: engineDepFail ? `${engineDepFail.name} valid despite dependency fail` : 'All valid engines have dependencies',
  });

  // 2. Paper promotion disabled unless final action is eligible
  const isEligible = summary?.advisor?.action?.includes('PAPER_ELIGIBLE');
  const canPromote = summary?.advisor?.confidence_calibration?.promotion_threshold_met;
  checks.push({
    label: 'Paper promotion eligibility',
    result: isEligible === canPromote ? 'PASS' : 'FAIL',
    note: isEligible ? 'Eligible for promotion' : 'Promotion locked',
  });

  // 3. Directional vote semantics
  const regVote = vm.regime.directionalVote;
  const isAligned = ['LONG', 'SHORT', 'NEUTRAL', 'WEAK'].includes(regVote);
  checks.push({
    label: 'Directional vote semantics',
    result: isAligned ? 'PASS' : 'FAIL',
    note: `Term: ${regVote}`,
  });

  // 4. Decision label matches action thresholds
  const calib = summary?.advisor?.confidence_calibration;
  const labelMatches = (summary?.advisor?.action?.includes('WATCHLIST') && calib?.watchlist_floor_met) || 
                       (summary?.advisor?.action?.includes('PAPER_ELIGIBLE') && calib?.promotion_threshold_met) ||
                       (summary?.advisor?.action === 'NO_TRADE');
  checks.push({
    label: 'Decision label vs Thresholds',
    result: labelMatches ? 'PASS' : 'FAIL',
    note: 'Action aligned with confidence floors',
  });

  // 5. No mock-only warnings on real-data run
  const hasMocks = sourceRegistry.some(s => s.sourceType === 'MOCK');
  const mockWarnings = vm.diagnostics.engineWarnings.filter(w => w.toLowerCase().includes('mock'));
  checks.push({
    label: 'Mock-warning consistency',
    result: (hasMocks || mockWarnings.length === 0) ? 'PASS' : 'FAIL',
    note: hasMocks ? 'Mocks present' : 'No mock contamination detected',
  });

  return checks;
}

function buildEngineWarnings(summary: any): string[] {
  const warnings: string[] = [];
  
  // Collect warnings from engine results
  if (summary?.regime?.warning) warnings.push(`Regime: ${summary.regime.warning}`);
  if (summary?.flows?.warning) warnings.push(`Flows: ${summary.flows.warning}`);
  if (summary?.leadership?.warning) warnings.push(`Leadership: ${summary.leadership.warning}`);
  if (summary?.risk?.warning) warnings.push(`Risk: ${summary.risk.warning}`);
  
  // Legacy/System warnings
  if (summary?.advisor?.conflict_detected) warnings.push('Advisor: Direction conflict detected');
  if (summary?.risk?.circuit_breaker?.active) warnings.push('Risk: Circuit breaker tripped');
  
  // Source-level warnings
  const sourceReg = summary?.meta?.source_registry ?? [];
  sourceReg.forEach((s: any) => {
    if (s.status === 'fallback' || s.status === 'cached') {
      warnings.push(`${s.datasetLabel}: Using ${s.sourceType} data`);
    }
    if (s.status === 'failed') {
      warnings.push(`${s.datasetLabel}: FETCH FAILED (MISSING)`);
    }
  });

  if (warnings.length === 0) warnings.push('System operational — no active warnings');
  
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
  let rawProvenance: any[] = [];
  if (runId) {
    const [summaryRes, provRes] = await Promise.all([
      supabase.from('signals_summary').select('*').eq('run_id', runId).single(),
      supabase.from('run_provenance').select('*').eq('run_id', runId),
    ]);
    summary = summaryRes.data;
    rawProvenance = provRes.data ?? [];
  } else {
    // Return empty state if no run found
    return (
      <main className="min-h-screen bg-bg-primary text-text-secondary flex flex-col items-center justify-center p-8 text-center">
        <img src="/logo.png" alt="SteadyAlpha" className="h-16 w-auto mb-6 opacity-20" />
        <h1 className="text-2xl font-bold text-text-primary mb-2">Initial Setup Required</h1>
        <p className="text-text-muted max-w-md mb-8">
          The dashboard is connected to Supabase, but no pipeline runs were found. 
          Please execute the data pipeline to generate your first market signal.
        </p>
        <div className="bg-bg-card border border-border-theme rounded-xl p-6 mb-8 max-w-lg w-full text-left font-mono text-sm">
          <p className="text-blue-400 mb-2"># Run this in your terminal:</p>
          <code className="text-text-primary">python pipeline/main.py</code>
        </div>
        <Link href="/diagnostics" className="text-blue-400 hover:underline">Check Engine Connectivity →</Link>
      </main>
    );
  }

  const { data: rawOrders } = await supabase
    .from('paper_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  const { data: rawOpenTrades } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('status', 'open')
    .order('entry_at', { ascending: false });

  const { data: rawClosedTrades } = await supabase
    .from('paper_trades')
    .select('*')
    .eq('status', 'closed')
    .order('exit_at', { ascending: false })
    .limit(20);

  const openTrades = (rawOpenTrades ?? []).map((t: any) => ({
    id: t.id?.toString() ?? '',
    symbol: t.symbol,
    direction: t.direction,
    qty: t.qty,
    entryPrice: t.entry_price,
    entryAt: t.entry_at,
    simulationVersion: t.simulation_version,
  }));

  const closedTrades = (rawClosedTrades ?? []).map((t: any) => ({
    id: t.id?.toString() ?? '',
    symbol: t.symbol,
    direction: t.direction,
    qty: t.qty,
    entryPrice: t.entry_price,
    exitPrice: t.exit_price,
    pnl: t.pnl ?? 0,
    entryAt: t.entry_at,
    exitAt: t.exit_at,
    exitReason: t.exit_reason,
    regimeAtEntry: t.regime_at_entry ?? 'UNKNOWN',
  }));

  const sourceRegistry = buildSourceRegistry(latestRun, rawProvenance);
  const totalSources = sourceRegistry.length;
  const freshSources = sourceRegistry.filter(s => s.freshness === 'FRESH').length;
  const tradingValidSources = sourceRegistry.filter(s => s.sourceType === 'REAL' || s.sourceType === 'HISTORY' || s.sourceType === 'SCRAPED').length;
  
  const dataTrustScore = totalSources > 0 ? (freshSources / totalSources) * 100 : 0;
  const tradingReadinessScore = totalSources > 0 ? (tradingValidSources / totalSources) * 100 : 0;

  // ── derive top-level ─────────────────────────────────────────────────────
  const pipelineStatus: DashboardViewModel['pipelineStatus'] =
    latestRun?.status === 'completed' ? 'SUCCESS' :
    latestRun?.status === 'failed' ? 'FAILED' : 'PARTIAL';
    
  let tradingValidity: DashboardViewModel['tradingValidity'] = 'YES';
  let invalidReasons: string[] = [];
  
  if (tradingReadinessScore < 100 || latestRun?.status === 'failed') {
    tradingValidity = 'NO';
    const reason = buildDegradedReason(summary, pipelineStatus, tradingReadinessScore);
    if (reason) invalidReasons.push(reason);
  }

  const riskMode: DashboardViewModel['riskMode'] =
    summary?.risk?.status === 'HALTED' ? 'HALTED' :
    summary?.risk?.status === 'REDUCED' ? 'REDUCED' : 'ACTIVE';

  // ── helpers for dynamic status ───────────────────────────────────────────
  const getProv = (k: string) => sourceRegistry.find(s => s.datasetKey === k);
  const isMock = (k: string) => getProv(k)?.sourceType === 'MOCK' || !getProv(k);
  const isFallback = (k: string) => getProv(k)?.sourceType !== 'REAL' && getProv(k)?.sourceType !== 'HISTORY';

  // ── regime ───────────────────────────────────────────────────────────────
  const regimeState = summary?.regime?.state?.toUpperCase() ?? 'RANGE_BOUND';
  const regimeReady = !!summary?.regime;
  const vixProv = getProv('india_vix');
  const vixIsMock = vixProv?.sourceType === 'MOCK';
  const breadthIsMock = getProv('universe_ohlcv')?.sourceType === 'MOCK';

  const regime: DashboardViewModel['regime'] = {
    state: regimeState,
    confidencePct: Math.round((summary?.regime?.trend_score ?? 0) * 100),
    trendScore: summary?.regime?.trend_score ?? 0,
    adx: summary?.regime?.adx ?? 0,
    vix: summary?.regime?.vix_value ?? 0,
    vixPercentile: 50,
    breadthPct: summary?.regime?.breadth_pct ?? 0,
    hysteresisState: summary?.regime?.transition_reason === 'stable' ? 'CONFIRMED' : 'WAITING',
    engineStatus: regimeReady ? (vixIsMock || breadthIsMock ? 'SIMULATED' : 'READY') : 'FAILED',
    validityStatus: (summary?.advisor?.validity_status?.regime || (regimeReady ? 'VALID' : 'INVALID')) as any,
    directionalVote: (summary?.advisor?.directional_votes?.regime || 'NEUTRAL') as any,
    dependency: `Nifty OHLCV: ${getProv('nifty_ohlcv')?.sourceType ?? 'MISSING'}; VIX: ${vixProv?.sourceType ?? 'MISSING'}`,
    impact: regimeState === 'BULLISH' || regimeState === 'TREND_UP'
      ? 'Regime vote contributed LONG bias'
      : regimeState === 'BEARISH' || regimeState === 'TREND_DOWN'
      ? 'Regime vote contributed SHORT bias'
      : 'Blocked directional setup — range-bound or transition',
    warning: vixIsMock ? 'VIX is mocked — regime confidence approximate' : null,
  };

  // ── flows ────────────────────────────────────────────────────────────────
  const flowScore = summary?.flows?.flows_score ?? 0;
  const flowBias: DashboardViewModel['flows']['bias'] = flowScore > 0.2 ? 'BULLISH' : flowScore < -0.2 ? 'BEARISH' : 'NEUTRAL';
  const flowsProv = [getProv('fii_flows'), getProv('pcr_oi')];
  const flowsAreMock = flowsProv.some(p => p?.sourceType === 'MOCK');

  const flows: DashboardViewModel['flows'] = {
    bias: flowBias,
    fii5dNet: summary?.flows?.fii_5d_z ?? null,
    fiiNetDaily: summary?.flows?.fii_net_daily ?? null,
    dii5dNet: summary?.flows?.dii_5d_z ?? null,
    diiNetDaily: summary?.flows?.dii_net_daily ?? null,
    pcrOi: summary?.flows?.pcr_latest ?? summary?.flows?.pcr_smooth ?? 0.5,
    maxPain: summary?.flows?.max_pain ?? null,
    spotVsMaxPainPct: summary?.flows?.spot_vs_max_pain_pct ?? null,
    sectorAlignment: 'UNKNOWN',
    freshness: flowsAreMock ? 'FALLBACK' : 'FRESH',
    biasDrivers: summary?.flows
      ? [`FII Z: ${summary.flows.fii_5d_z?.toFixed(2) ?? '—'}`, `PCR: ${(summary.flows.pcr_latest ?? summary.flows.pcr_smooth)?.toFixed(2) ?? '—'}`, `MaxPain: ${summary.flows.max_pain ?? '—'}`]
      : [],
    engineStatus: summary?.flows ? (flowsAreMock ? 'SIMULATED' : 'READY') : 'FAILED',
    validityStatus: (summary?.advisor?.validity_status?.flows || (summary?.flows ? 'VALID' : 'INVALID')) as any,
    directionalVote: (summary?.advisor?.directional_votes?.flows || 'NEUTRAL') as any,
    dependency: `FII: ${getProv('fii_flows')?.sourceType ?? 'MISSING'}; PCR: ${getProv('pcr_oi')?.sourceType ?? 'MISSING'}`,
    impact: `Flow vote ${flowBias === 'NEUTRAL' ? 'neutral' : `${flowBias.toLowerCase()}`}${flowsAreMock ? ' — vote weakened by mock data' : ''}`,
    warning: flowsAreMock ? 'Flow inputs contain random mocks' : null,
  };

  // ── leadership ───────────────────────────────────────────────────────────
  const leadCount = summary?.leadership?.leaders_count ?? 0;
  const laggardCount = summary?.leadership?.laggards_count ?? 0;
  const universeSize = summary?.leadership?.universe_size ?? 0;
  const uniProv = getProv('universe_ohlcv');
  const uniIsMock = uniProv?.sourceType === 'MOCK';

  // Transform nested dict details into sorted arrays
  const rawLeaders = summary?.leadership?.details?.leaders ?? {};
  const rawLaggards = summary?.leadership?.details?.laggards ?? {};
  
  const leadersList = Object.entries(rawLeaders).map(([symbol, data]: [string, any]) => ({
    symbol,
    score: data.composite_score ?? 0,
    sector: data.sector
  })).sort((a, b) => b.score - a.score);

  const laggardsList = Object.entries(rawLaggards).map(([symbol, data]: [string, any]) => ({
    symbol,
    score: data.composite_score ?? 0,
    sector: data.sector
  })).sort((a, b) => a.score - b.score);

  const leadership: DashboardViewModel['leadership'] = {
    status: leadCount > 0 ? 'READY' : universeSize > 0 ? 'COVERAGE_TOO_LOW' : 'DATA_MISSING',
    universeCoverage: universeSize > 0 ? universeSize / 200 : null,
    qualifiedLeaderCount: leadCount,
    qualifiedLaggardCount: laggardCount,
    leaders: leadersList,
    laggards: laggardsList,
    statusReason: leadCount > 0 ? 'Leaders found' : 'No qualified leaders after liquidity filter',
    engineStatus: leadCount > 0 ? (uniIsMock ? 'SIMULATED' : 'READY') : universeSize > 0 ? 'DEGRADED' : 'FAILED',
    validityStatus: (summary?.advisor?.validity_status?.leadership || (universeSize > 0 ? 'VALID' : 'INVALID')) as any,
    directionalVote: (summary?.advisor?.directional_votes?.leadership || 'NEUTRAL') as any,
    dependency: `Universe: ${uniProv?.sourceType ?? 'MISSING'} (${uniProv?.provider ?? '—'})`,
    impact: leadCount > 0
      ? `${leadCount} leaders / ${laggardCount} laggards identified`
      : 'Leadership neutral — no qualifying setups',
    warning: uniIsMock ? 'Universe data is mocked' : null,
    thresholds: summary?.leadership?.thresholds ? {
      minCoveragePct: summary.leadership.thresholds.min_coverage_pct,
      minLeadersForVote: summary.leadership.thresholds.min_leaders_for_vote
    } : {
      minCoveragePct: 0.5,
      minLeadersForVote: 1
    },
  };

  // ── risk ─────────────────────────────────────────────────────────────────
  const riskReady = !!summary?.risk;
  const circuitBreaker = summary?.risk?.circuit_breaker?.active ?? false;
  const eqProv = getProv('equity_curve');
  const eqIsMock = eqProv?.sourceType === 'MOCK';

  const risk: DashboardViewModel['risk'] = {
    mode: riskMode,
    baseRiskPct: summary?.risk?.portfolio_risk?.portfolio_risk_pct ?? 0,
    drawdownPct: 0,
    drawdownLimitPct: summary?.risk?.limits?.daily_drawdown_limit_pct ?? 0,
    positionSize: null,
    triggerReason: circuitBreaker ? 'Circuit breaker active' : null,
    consecutiveLossDays: null,
    engineStatus: riskReady ? (circuitBreaker ? 'FAILED' : (eqIsMock ? 'SIMULATED' : 'READY')) : 'FAILED',
    validityStatus: (summary?.advisor?.validity_status?.risk || (riskReady ? 'VALID' : 'INVALID')) as any,
    directionalVote: (summary?.advisor?.directional_votes?.risk || 'PASS_EXECUTION') as any,
    dependency: `Equity: ${eqProv?.sourceType ?? 'MISSING'} (${eqProv?.provider ?? '—'})`,
    impact: circuitBreaker ? 'Circuit breaker TRIPPED — advisor forced HALT' : 'Risk gate PASS — position sizing active',
    warning: eqIsMock ? 'Equity data is mocked' : null,
  };

  // ── decision ─────────────────────────────────────────────────────────────
  // Spec #2: no NEUTRAL — map to operational labels
  const rawAction = summary?.advisor?.action;
  let decisionLabelRaw = rawAction === 'LONG' ? 'LONG_BIAS' :
    rawAction === 'SHORT' ? 'SHORT_BIAS' :
    rawAction === 'PAPER_ELIGIBLE' ? 'PAPER_ELIGIBLE' :
    rawAction === 'WATCHLIST' ? 'WATCHLIST' :
    'NO_TRADE';
    
  if (tradingValidity !== 'YES') {
    decisionLabelRaw = 'INVALID_FOR_TRADING';
  }

  const decision: DashboardViewModel['decision'] = {
    label: (summary?.advisor?.action || 'NO_TRADE') as any,
    topLineSummary: summary?.advisor?.top_line_summary,
    confidencePct: Math.round((summary?.advisor?.confidence ?? 0) * 100),
    directionalConfidence: Math.round((summary?.advisor?.directional_confidence ?? 0) * 100),
    actionConfidence: Math.round((summary?.advisor?.action_confidence ?? 0) * 100),
    validityStatus: summary?.advisor?.validity_status || {
      regime: 'VALID',
      flows: 'VALID',
      leadership: 'VALID',
      risk: 'VALID'
    },
    directionalVotes: summary?.advisor?.directional_votes || {
      regime: 'NEUTRAL',
      flows: 'NEUTRAL',
      leadership: 'NEUTRAL',
      risk: 'PASS_EXECUTION'
    },
    reasons: summary?.advisor?.reasoning || [],
    conflicts: summary?.advisor?.conflict_detected ? ['Signal conflict between engines detected'] : [],
    drivers: summary?.advisor?.reason_buckets?.drivers || [],
    boosters: summary?.advisor?.reason_buckets?.boosters || [],
    drags: summary?.advisor?.reason_buckets?.drags || [],
    gates: summary?.advisor?.reason_buckets?.gates || [],
    confidenceCalibration: summary?.advisor?.confidence_calibration ? {
      contributions: {
        regime: summary.advisor.confidence_calibration.contributions?.regime ?? 0,
        flows: summary.advisor.confidence_calibration.contributions?.flows ?? 0,
        leadership: summary.advisor.confidence_calibration.contributions?.leadership ?? 0,
        bonus: summary.advisor.confidence_calibration.contributions?.bonus ?? 0,
        penalty: summary.advisor.confidence_calibration.contributions?.penalty ?? 0,
      },
      watchlistFloorMet: summary.advisor.confidence_calibration.watchlist_floor_met ?? false,
      promotionThresholdMet: summary.advisor.confidence_calibration.promotion_threshold_met ?? false,
    } : undefined,
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
  // Create a base VM for the builders
  const baseVm: any = {
    tradingValidity,
    regime,
    flows,
    leadership,
    risk,
    decision,
    diagnostics: { engineWarnings: buildEngineWarnings(summary) }
  };
  
  const validationChecks = buildValidationChecks(summary, baseVm as DashboardViewModel, sourceRegistry);
  const consistencyChecks = buildConsistencyChecks(summary, baseVm as DashboardViewModel, sourceRegistry);
  const engineWarnings = baseVm.diagnostics.engineWarnings;

  const diagnostics: DashboardViewModel['diagnostics'] = {
    runId: runId ?? 'unknown',
    durationMs: latestRun?.duration_ms ?? 0,
    pipelineVersion: 'v0.6.1',
    triggerType: latestRun?.trigger_type ?? 'SCHEDULED',
    sourceRegistry,
    validationChecks,
    consistencyChecks,
    engineWarnings,
    rawDataPreviews: summary?.meta?.raw_data_previews ?? [],
  };

  // ── vm ────────────────────────────────────────────────────────────────────
  // ── changes ──────────────────────────────────────────────────────────────
  // Fetch previous run to detect deltas
  const { data: prevRuns } = await supabase
    .from('runs')
    .select('signals_summary')
    .order('timestamp', { ascending: false })
    .limit(2);

  const prevSummary = prevRuns && prevRuns.length > 1 ? prevRuns[1].signals_summary : null;
  const changeItems: string[] = [];
  
  if (prevSummary) {
    if (summary?.regime?.state !== prevSummary?.regime?.state) {
      changeItems.push(`Regime shift: ${prevSummary?.regime?.state} → ${summary?.regime?.state}`);
    }
    if (summary?.flows?.flows_score !== prevSummary?.flows?.flows_score) {
      const delta = (summary?.flows?.flows_score ?? 0) - (prevSummary?.flows?.flows_score ?? 0);
      if (Math.abs(delta) > 0.2) {
        changeItems.push(`Flows sentiment ${delta > 0 ? 'strengthened' : 'weakened'} significantly`);
      }
    }
  }

  const changes: DashboardViewModel['changes'] = {
    material: changeItems.length > 0,
    items: changeItems.length > 0 ? changeItems : ['No material signal shifts detected since last run'],
    asOfTs: latestRun?.timestamp ?? new Date().toISOString(),
  };

  const vm: DashboardViewModel = {
    pipelineStatus,
    tradingValidity,
    operatingMode: 'PAPER',
    lastSuccessTs: latestRun?.timestamp ?? new Date().toISOString(),
    dataTrustScore,
    tradingReadinessScore,
    invalidReasons,
    riskMode,
    regime,
    flows,
    leadership,
    risk,
    decision,
    changes,
    paperActions,
    paperActionEmptyReason: null,
    diagnostics,
  };

  return (
    <DashboardClient 
      initialVm={vm} 
      initialOpenTrades={openTrades} 
      initialClosedTrades={closedTrades} 
    />
  );
}
