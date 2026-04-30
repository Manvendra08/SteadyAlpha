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
    };
  });
}

function buildValidationChecks(summary: any, vm: Partial<DashboardViewModel>): DashboardViewModel['diagnostics']['validationChecks'] {
  const checks: DashboardViewModel['diagnostics']['validationChecks'] = [];
  
  // 1. Critical coverage check
  const sourceReg = summary?.meta?.source_registry ?? [];
  const criticalLoaded = sourceReg.filter((s: any) => s.scope === 'CRITICAL_FOR_DECISION' && (s.status === 'loaded' || s.status === 'cached')).length || 0;
  const criticalTotal = sourceReg.filter((s: any) => s.scope === 'CRITICAL_FOR_DECISION').length || 0;
  
  checks.push({
    label: 'Critical Dataset Coverage',
    result: criticalLoaded === criticalTotal && criticalTotal > 0 ? 'PASS' : criticalLoaded > 0 ? 'WARN' : 'FAIL',
    note: `${criticalLoaded}/${criticalTotal} critical feeds live`,
  });

  // 2. Risk Circuit Breaker
  const isHalted = summary?.risk?.status === 'HALTED';
  checks.push({
    label: 'Risk Circuit Breaker',
    result: isHalted ? 'FAIL' : 'PASS',
    note: isHalted ? 'HALTED' : 'CLEAN',
  });

  // 3. Advisor Confidence
  const advisorConfidence = summary?.advisor?.confidence ?? 0;
  checks.push({
    label: 'Advisor Confidence Gate',
    result: advisorConfidence > 0.7 ? 'PASS' : advisorConfidence > 0.4 ? 'WARN' : 'FAIL',
    note: `${Math.round(advisorConfidence * 100)}% confidence`,
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
  const tradingValidSources = sourceRegistry.filter(s => s.sourceType === 'REAL' || s.sourceType === 'HISTORY').length;
  
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
    adx: summary?.regime?.raw_inputs?.adx ?? 0,
    vix: summary?.regime?.vix_value ?? 0,
    vixPercentile: 50,
    breadthPct: summary?.regime?.breadth_pct ?? 0,
    hysteresisState: summary?.regime?.transition_reason === 'stable' ? 'CONFIRMED' : 'WAITING',
    engineStatus: regimeReady ? (vixIsMock || breadthIsMock ? 'SIMULATED' : 'READY') : 'FAILED',
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
    dii5dNet: null,
    pcrOi: summary?.flows?.pcr_smooth ?? null,
    maxPain: null,
    spotVsMaxPainPct: null,
    sectorAlignment: 'UNKNOWN',
    freshness: flowsAreMock ? 'FALLBACK' : 'FRESH',
    biasDrivers: summary?.flows
      ? [`FII Z: ${summary.flows.fii_5d_z?.toFixed(2) ?? '—'}`, `PCR: ${summary.flows.pcr_smooth?.toFixed(2) ?? '—'}`]
      : [],
    engineStatus: summary?.flows ? (flowsAreMock ? 'SIMULATED' : 'READY') : 'FAILED',
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
    status: leadCount > 0 ? 'READY' : universeSize > 0 ? 'SUPPRESSED' : 'DATA_MISSING',
    universeCoverage: universeSize > 0 ? universeSize / 200 : null,
    qualifiedLeaderCount: leadCount,
    qualifiedLaggardCount: laggardCount,
    leaders: leadersList,
    laggards: laggardsList,
    statusReason: leadCount > 0 ? 'Leaders found' : 'No qualified leaders after liquidity filter',
    engineStatus: leadCount > 0 ? (uniIsMock ? 'SIMULATED' : 'READY') : universeSize > 0 ? 'SUPPRESSED' : 'FAILED',
    dependency: `Universe: ${uniProv?.sourceType ?? 'MISSING'} (${uniProv?.provider ?? '—'})`,
    impact: leadCount > 0
      ? `${leadCount} leaders / ${laggardCount} laggards identified`
      : 'Leadership vote suppressed — no qualifying setups',
    warning: uniIsMock ? 'Universe data is mocked' : null,
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
    label: decisionLabelRaw as any,
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
        pipelineStatus={vm.pipelineStatus}
        tradingValidity={vm.tradingValidity}
        mode={vm.operatingMode}
        riskMode={vm.riskMode}
        lastSuccessTs={vm.lastSuccessTs}
        dataTrustScore={vm.dataTrustScore}
        tradingReadinessScore={vm.tradingReadinessScore}
        invalidReasons={vm.invalidReasons}
      />

      <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Title row */}
        <div className="flex items-center justify-between border-b border-border-theme pb-2 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-text-primary tracking-tighter uppercase">Console</h1>
            <span className="h-4 w-[1px] bg-border-theme hidden sm:block"></span>
            <span className="text-text-muted text-xs hidden sm:block font-mono">Stage 2 — Paper Execution</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/diagnostics" className="text-xs text-blue-400 hover:text-blue-300 transition-colors font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Engine Diagnostics</span>
              <span className="text-[10px]">↗</span>
            </Link>
          </div>
        </div>

        {/* Decision panel */}
        <DecisionPanel {...vm.decision} />

        {/* Engine cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RegimeCard {...vm.regime} />
          <FlowsCard {...vm.flows} />
          <LeadershipCard {...vm.leadership} />
          <RiskCard {...vm.risk} />
        </div>

        {/* State changes */}
        <ChangesPanel {...vm.changes} />

        {/* Paper actions */}
        <div className="relative">
          <div className="absolute -top-4 -right-2 opacity-10 pointer-events-none select-none hidden md:block">
             <img src="/logo-dark.png" alt="" className="h-24 w-auto grayscale" />
          </div>
          <PaperActionsTable
            actions={vm.paperActions}
            operatingMode={vm.operatingMode}
            emptyReason={vm.paperActionEmptyReason}
            decisionLabel={vm.decision.label}
            riskMode={vm.riskMode}
          />
        </div>

        {/* Paper Trades */}
        <div className="grid grid-cols-1 gap-5 mt-5">
          <OpenPaperTradesTable trades={openTrades} />
          <ClosedPaperTradesTable trades={closedTrades} />
        </div>

        {/* Segmented Performance */}
        <SegmentedPerformance trades={closedTrades} />

        {/* Diagnostics drawer */}
        <DiagnosticsDrawer diagnostics={vm.diagnostics} />

        {/* Raw data evidence drawer */}
        <RawDataEvidenceDrawer previews={vm.diagnostics.rawDataPreviews} />

        {/* Brand Banner */}
        <div className="w-full bg-bg-card border border-border-theme rounded-2xl overflow-hidden shadow-xl mt-4">
          <img src="/banner.png" alt="SteadyAlpha Systematic Market Intelligence" className="w-full h-auto object-cover max-h-[160px] opacity-90 hover:opacity-100 transition-opacity" />
        </div>

      </div>
    </main>
  );
}
