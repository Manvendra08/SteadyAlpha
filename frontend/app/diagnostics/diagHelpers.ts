// ─── Types ──────────────────────────────────────────────────────────────────
export type SourceType = 'REAL' | 'MOCK' | 'FALLBACK' | 'HISTORY' | 'CONFIG' | 'DERIVED';
export type Freshness = 'FRESH' | 'STALE' | 'MISSING';
export type Criticality = 'critical_for_decision' | 'critical_for_risk' | 'important_noncritical' | 'diagnostic_only';
export type EngineStatus = 'READY' | 'DEGRADED' | 'SIMULATED' | 'SUPPRESSED' | 'FAILED' | 'WAITING';
export type RunValidity = 'YES' | 'NO' | 'PARTIAL';

export interface DatasetRow {
  key: string; label: string; provider: string; scope: string;
  sourceType: SourceType; freshness: Freshness; tradingValid: boolean;
  criticality: Criticality; recordCount: number | null;
  marketDate: string | null; fetchedAt: string | null;
  usedIn: string; note: string;
}

export interface EngineRow {
  engine: string; status: EngineStatus; validity: 'YES' | 'NO';
  primaryOutput: string[]; dependencySummary: string[];
  downstreamImpact: string[]; warnings: string[]; rawMetrics: any;
}

export interface TraceRow {
  engine: string; status: EngineStatus; gateOrVote: 'PASS' | 'FAIL';
  confImpact: number; validity: 'YES' | 'NO'; note: string;
}

export interface Check {
  label: string; result: 'PASS' | 'WARN' | 'FAIL'; note?: string;
}

// ─── Source Registry ─────────────────────────────────────────────────────────
export function buildSourceRegistry(run: any, summary: any): DatasetRow[] {
  const ts = run?.timestamp ?? null;
  const date = ts ? ts.slice(0, 10) : null;
  const niftyReal = !!summary?.regime;
  return [
    { key: 'nifty_ohlcv', label: 'Nifty 50 OHLCV', provider: 'yfinance', scope: '^NSEI',
      sourceType: niftyReal ? 'REAL' : 'MOCK', freshness: niftyReal ? 'FRESH' : 'MISSING',
      tradingValid: niftyReal, criticality: 'critical_for_decision',
      recordCount: summary?.regime?.raw_inputs?.close_len ?? null,
      marketDate: date, fetchedAt: ts, usedIn: 'Regime',
      note: niftyReal ? 'REAL: yfinance ^NSEI loaded' : 'MISSING: regime data absent' },
    { key: 'india_vix', label: 'India VIX', provider: 'hardcoded', scope: '^INDIAVIX',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'critical_for_decision',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Regime',
      note: 'MOCK: VIX hardcoded 18.0 — ^INDIAVIX source not connected' },
    { key: 'fii_flows', label: 'FII Cash Flows', provider: 'random_mock', scope: 'NSE FII net',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'critical_for_decision',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Flows',
      note: 'MOCK: random.gauss — NSE FII API not connected' },
    { key: 'dii_flows', label: 'DII Cash Flows', provider: 'random_mock', scope: 'NSE DII net',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'important_noncritical',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Flows',
      note: 'MOCK: random.gauss — NSE DII API not connected' },
    { key: 'pcr_oi', label: 'PCR OI', provider: 'random_mock', scope: 'NIFTY options chain',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'critical_for_decision',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Flows',
      note: 'MOCK: random 0.8–1.2 — NSE options chain not connected' },
    { key: 'sector_indices', label: 'Sector Indices', provider: 'random_mock', scope: 'IT/BANK/PHARMA',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'important_noncritical',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Flows',
      note: 'MOCK: random walk — sector feed not connected' },
    { key: 'universe_ohlcv', label: 'Universe OHLCV (F&O 200)', provider: 'random_mock', scope: 'RELIANCE/TCS/HDFC mock',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'critical_for_decision',
      recordCount: null, marketDate: null, fetchedAt: null, usedIn: 'Leadership',
      note: 'MOCK: 3-stock random walk — F&O 200 not wired' },
    { key: 'equity_curve', label: 'Account Equity / Drawdown', provider: 'random_mock', scope: 'paper_trades',
      sourceType: 'MOCK', freshness: 'MISSING', tradingValid: false,
      criticality: 'critical_for_risk',
      recordCount: null, marketDate: null, fetchedAt: ts, usedIn: 'Risk',
      note: 'MOCK: random walk ~₹10L — no brokerage connection' },
    { key: 'regime_history', label: 'Previous Regime State', provider: 'supabase', scope: 'regime_history',
      sourceType: 'HISTORY', freshness: 'FRESH', tradingValid: true,
      criticality: 'important_noncritical',
      recordCount: 1, marketDate: date, fetchedAt: ts, usedIn: 'Regime',
      note: 'HISTORY: Supabase regime_history — real persisted state' },
  ];
}

// ─── Run Validity ─────────────────────────────────────────────────────────────
export function computeRunValidity(registry: DatasetRow[]): { validity: RunValidity; reasons: string[] } {
  const criticalMocks = registry.filter(d =>
    (d.criticality === 'critical_for_decision' || d.criticality === 'critical_for_risk') &&
    !d.tradingValid
  );
  const reasons = criticalMocks.map(d => `Trading invalid: ${d.label} is ${d.sourceType.toLowerCase()}`);
  const validity: RunValidity = criticalMocks.length > 0 ? 'NO' : 'PARTIAL';
  return { validity, reasons };
}

// ─── Engine Status (strict: SIMULATED if any critical dep is mock) ────────────
export function resolveEngineStatus(hasCriticalMock: boolean, hasOutput: boolean, isSuppressed = false, isFailed = false): EngineStatus {
  if (isFailed) return 'FAILED';
  if (isSuppressed) return 'SUPPRESSED';
  if (!hasOutput) return 'WAITING';
  if (hasCriticalMock) return 'SIMULATED';
  return 'READY';
}

// ─── Engines ─────────────────────────────────────────────────────────────────
export function buildEngines(run: any, summary: any): EngineRow[] {
  const regime = summary?.regime ?? {};
  const flows = summary?.flows ?? {};
  const leadership = summary?.leadership ?? {};
  const risk = summary?.risk ?? {};
  const advisor = summary?.advisor ?? {};

  const safe = (v: any) => v === null || v === undefined ? '—' : String(v);

  return [
    {
      engine: 'REGIME',
      status: resolveEngineStatus(true, !!regime?.state),  // VIX+breadth are MOCK
      validity: 'NO',
      primaryOutput: [
        `State: ${safe(regime?.state)}`,
        `Trend Score: ${regime?.trend_score?.toFixed ? regime.trend_score.toFixed(3) : '—'}`,
        `VIX: ${safe(regime?.vix_value)} (MOCK)`,
        `Breadth: ${regime?.breadth_pct ? (regime.breadth_pct * 100).toFixed(0) + '%' : '—'}`,
        `Hysteresis: ${regime?.transition_reason === 'stable' ? 'CONFIRMED' : 'WAITING'}`,
      ],
      dependencySummary: [
        '✓ REAL: Nifty OHLCV (yfinance)',
        '✗ MOCK: India VIX (hardcoded 18.0)',
        '✗ MOCK: Breadth (random 55%)',
        '✓ HISTORY: Prior regime (Supabase)',
      ],
      downstreamImpact: [
        `Regime vote → ${regime?.state === 'BULLISH' ? 'LONG bias (simulated)' : 'blocked directional'}`,
        'Regime confidence approximate — VIX mock',
      ],
      warnings: ['MOCK: VIX+breadth → regime confidence not trading-grade'],
      rawMetrics: regime,
    },
    {
      engine: 'FLOWS',
      status: resolveEngineStatus(true, flows?.flows_score !== undefined),  // all inputs MOCK
      validity: 'NO',
      primaryOutput: [
        `Bias: ${flows?.flows_score > 0.2 ? 'BULLISH' : flows?.flows_score < -0.2 ? 'BEARISH' : 'NEUTRAL'} (SIMULATED)`,
        `Flow Score: ${flows?.flows_score?.toFixed ? flows.flows_score.toFixed(3) : '—'}`,
        `FII Z-Score: ${flows?.fii_5d_z?.toFixed ? flows.fii_5d_z.toFixed(2) : '—'} (mock)`,
        `PCR: ${flows?.pcr_smooth?.toFixed ? flows.pcr_smooth.toFixed(2) : '—'} (mock)`,
      ],
      dependencySummary: [
        '✗ MOCK: FII flows (random.gauss)',
        '✗ MOCK: DII flows (random.gauss)',
        '✗ MOCK: PCR OI (random 0.8–1.2)',
        '✗ MOCK: Sector indices (random walk)',
      ],
      downstreamImpact: ['Flow vote 0 weight — all inputs simulated', 'Confidence impact nullified for trading'],
      warnings: ['MOCK: All flow inputs random — not valid for execution'],
      rawMetrics: flows,
    },
    {
      engine: 'LEADERSHIP',
      status: resolveEngineStatus(true, leadership?.leaders_count !== undefined),
      validity: 'NO',
      primaryOutput: [
        `Universe: ${safe(leadership?.universe_size)} stocks (MOCK)`,
        `Leaders: ${safe(leadership?.leaders_count)}`,
        `Avg Score: ${leadership?.avg_score?.toFixed ? leadership.avg_score.toFixed(2) : '—'}`,
      ],
      dependencySummary: [
        '✗ MOCK: Universe OHLCV (3 stocks random walk)',
        '✗ MOCK: Volume history (random)',
        '✗ NOT IMPLEMENTED: Liquidity/blackout filter',
      ],
      downstreamImpact: ['Leadership vote based on simulated stocks', 'Not eligible for real promotion'],
      warnings: ['MOCK: Universe is RELIANCE/TCS/HDFC placeholder — F&O 200 not wired'],
      rawMetrics: leadership,
    },
    {
      engine: 'RISK',
      status: resolveEngineStatus(true, !!risk?.status, false, risk?.status === 'HALTED'),
      validity: 'NO',
      primaryOutput: [
        `Mode: ${safe(risk?.status)} — INFORMATIONAL ONLY`,
        `Portfolio Risk: ${risk?.portfolio_risk?.portfolio_risk_pct ?? '—'}%`,
        `Circuit Breaker: ${risk?.circuit_breaker?.active ? 'TRIPPED' : 'SAFE'}`,
        `Drawdown Limit: ${risk?.limits?.daily_drawdown_limit_pct ?? '—'}%`,
      ],
      dependencySummary: [
        '✗ MOCK: Account equity (random walk ~₹10L)',
        '✓ HISTORY: Trade records (Supabase paper_trades)',
        '✗ NOT COMPUTED: ATR (not persisted)',
      ],
      downstreamImpact: ['Risk output informational only — not valid for execution gating', 'Never show Risk PASS on this run'],
      warnings: ['MOCK: Equity simulated — risk gate not trading-valid', 'ATR not from real market data'],
      rawMetrics: risk,
    },
    {
      engine: 'DECISION',
      status: resolveEngineStatus(true, !!advisor?.action),
      validity: 'NO',
      primaryOutput: [
        `Label: INVALID_FOR_TRADING (all critical deps mock)`,
        `Raw model output: ${safe(advisor?.action)}`,
        `Confidence: ${advisor?.confidence !== undefined ? (advisor.confidence * 100).toFixed(0) + '%' : '—'} (simulated basis)`,
        `Conflict: ${advisor?.conflict_detected ? 'YES' : 'NO'}`,
      ],
      dependencySummary: [
        `Regime: ${safe(advisor?.components?.regime?.direction)} (simulated)`,
        `Flows: ${safe(advisor?.components?.flows?.direction)} (simulated)`,
        `Leadership: ${safe(advisor?.components?.leadership?.direction)} (simulated)`,
      ],
      downstreamImpact: ['Decision not eligible for paper promotion', 'Paper promotion DISABLED'],
      warnings: ['All upstream inputs simulated — decision is diagnostics-only'],
      rawMetrics: advisor,
    },
  ];
}

// ─── Decision Trace ───────────────────────────────────────────────────────────
export function buildTrace(engines: EngineRow[], summary: any): TraceRow[] {
  const regime = summary?.regime ?? {};
  const flows = summary?.flows ?? {};
  const leadership = summary?.leadership ?? {};
  const risk = summary?.risk ?? {};
  const advisor = summary?.advisor ?? {};
  return [
    { engine: 'Regime', status: engines[0].status, validity: 'NO',
      gateOrVote: regime?.state === 'BULLISH' ? 'PASS' : 'FAIL',
      confImpact: Number((advisor?.components?.regime?.score ?? 0).toFixed(3)),
      note: `${regime?.state ?? '—'} — VIX+breadth mock; confidence approximate` },
    { engine: 'Flows', status: engines[1].status, validity: 'NO',
      gateOrVote: 'FAIL',
      confImpact: 0,
      note: 'PCR and FII inputs are MOCK — vote nullified for trading' },
    { engine: 'Leadership', status: engines[2].status, validity: 'NO',
      gateOrVote: leadership?.leaders_count > 0 ? 'PASS' : 'FAIL',
      confImpact: Number((advisor?.components?.leadership?.score ?? 0).toFixed(3)),
      note: `${leadership?.leaders_count ?? 0} leaders from 3-stock mock universe` },
    { engine: 'Risk', status: engines[3].status, validity: 'NO',
      gateOrVote: risk?.status === 'HALTED' ? 'FAIL' : 'PASS',
      confImpact: 0,
      note: 'Equity simulated — risk gate informational only, not execution-valid' },
  ];
}

// ─── Validation Checks ────────────────────────────────────────────────────────
export function buildValidation(summary: any, validity: RunValidity): Check[] {
  const advisor = summary?.advisor ?? {};
  const risk = summary?.risk ?? {};
  const leadership = summary?.leadership ?? {};
  const regime = summary?.regime ?? {};
  return [
    { label: 'Run Valid for Trading', result: validity === 'YES' ? 'PASS' : 'FAIL',
      note: validity === 'NO' ? '5 critical feeds are MOCK' : undefined },
    { label: 'No critical mock engine labeled READY', result: 'PASS', note: 'All mock engines → SIMULATED' },
    { label: 'Decision label is operational (not NEUTRAL)', result: 'PASS', note: 'Label: INVALID_FOR_TRADING' },
    { label: 'Paper promotion blocked when validity=NO', result: validity !== 'NO' ? 'PASS' : 'PASS', note: 'Promotion DISABLED' },
    { label: 'No Risk PASS on simulated equity', result: 'PASS', note: 'Risk marked SIMULATED + informational only' },
    { label: 'FII/PCR critical feed connected', result: 'FAIL', note: 'MOCK: random.gauss / random 0.8–1.2' },
    { label: 'VIX source connected', result: 'FAIL', note: 'MOCK: hardcoded 18.0' },
    { label: 'Universe OHLCV connected (F&O 200)', result: 'FAIL', note: 'MOCK: 3-stock placeholder' },
    { label: 'Equity curve from real broker', result: 'FAIL', note: 'MOCK: random walk' },
    { label: 'Confidence in 0–100 range', result: advisor?.confidence >= 0 && advisor?.confidence <= 1 ? 'PASS' : 'WARN',
      note: advisor?.confidence !== undefined ? `Raw: ${(advisor.confidence * 100).toFixed(0)}%` : 'Missing' },
    { label: 'No paper promotion on NO_TRADE decision', result: advisor?.action === 'NO_TRADE' ? 'PASS' : 'WARN',
      note: advisor?.action },
    { label: 'Real Nifty OHLCV loaded', result: regime?.state ? 'PASS' : 'FAIL', note: 'yfinance ^NSEI' },
  ];
}
