// ─── Types ──────────────────────────────────────────────────────────────────
export type SourceType = 'REAL' | 'MOCK' | 'FALLBACK' | 'HISTORY' | 'CONFIG' | 'DERIVED' | 'MISSING' | 'CACHED' | 'SCRAPED';
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

// ─── Metadata ───────────────────────────────────────────────────────────────
const DATASET_META: Record<string, { label: string; usedIn: string; scope: string }> = {
  nifty_ohlcv:     { label: 'Nifty 50 OHLCV',            usedIn: 'Regime',     scope: '^NSEI' },
  india_vix:       { label: 'India VIX',                  usedIn: 'Regime',     scope: '^INDIAVIX' },
  fii_flows:       { label: 'FII Cash Flows',             usedIn: 'Flows',      scope: 'NSE FII net' },
  dii_flows:       { label: 'DII Cash Flows',             usedIn: 'Flows',      scope: 'NSE DII net' },
  pcr_oi:          { label: 'PCR OI',                     usedIn: 'Flows',      scope: 'NIFTY options chain' },
  options_chain:   { label: 'Options Chain',              usedIn: 'Flows',      scope: 'NIFTY OI' },
  sector_indices:  { label: 'Sector Indices',             usedIn: 'Flows',      scope: 'IT/BANK/PHARMA' },
  universe_ohlcv:  { label: 'Universe OHLCV (F&O 200)',  usedIn: 'Leadership', scope: 'F&O 200' },
  equity_curve:    { label: 'Account Equity / Drawdown', usedIn: 'Risk',       scope: 'paper_trades' },
  delivery:        { label: 'Delivery Volume',            usedIn: 'Leadership', scope: 'NSE delivery %' },
};

// ─── Source Registry ─────────────────────────────────────────────────────────
export function buildSourceRegistry(run: any, provenance: any[]): DatasetRow[] {
  const ts = run?.timestamp ?? null;
  
  // provenance can be an array from Supabase or a dictionary if from summary.meta
  const provMap = Array.isArray(provenance) 
    ? Object.fromEntries(provenance.map((p: any) => [p.dataset_key, p]))
    : (provenance || {});

  return Object.keys(DATASET_META).map(key => {
    const meta = DATASET_META[key];
    const prov = provMap[key];

    if (!prov) {
      return {
        key, label: meta.label, provider: '—', scope: meta.scope,
        sourceType: 'MISSING', freshness: 'MISSING', tradingValid: false,
        criticality: 'important_noncritical',
        recordCount: null, marketDate: null, fetchedAt: null, usedIn: meta.usedIn,
        note: 'Not attempted in this run'
      };
    }

    const st = (prov.source_type || 'MISSING').toUpperCase() as SourceType;
    const tv = !!prov.trading_valid;

    return {
      key, label: meta.label, provider: prov.provider || '—', scope: meta.scope,
      sourceType: st,
      freshness: (prov.freshness || 'MISSING').toUpperCase() as Freshness,
      tradingValid: tv,
      criticality: (prov.criticality || 'important_noncritical').toLowerCase() as Criticality,
      recordCount: prov.record_count,
      marketDate: prov.market_date,
      fetchedAt: ts,
      usedIn: meta.usedIn,
      note: prov.warning || (prov.error ? `ERR: ${prov.error}` : `${st}: ${prov.provider} loaded`)
    };
  });
}

// ─── Run Validity ─────────────────────────────────────────────────────────────
export function computeRunValidity(registry: DatasetRow[]): { validity: RunValidity; reasons: string[] } {
  const criticalIssues = registry.filter(d =>
    (d.criticality === 'critical_for_decision' || d.criticality === 'critical_for_risk') &&
    !d.tradingValid
  );
  
  const reasons = criticalIssues.map(d => `Trading invalid: ${d.label} is ${d.sourceType.toLowerCase()}${d.freshness === 'STALE' ? ' (stale)' : ''}`);
  
  if (criticalIssues.length > 0) return { validity: 'NO', reasons };
  
  const degradedCount = registry.filter(d => d.sourceType !== 'REAL' && d.sourceType !== 'HISTORY' && d.sourceType !== 'CONFIG' && d.sourceType !== 'SCRAPED').length;
  return { validity: degradedCount > 0 ? 'PARTIAL' : 'YES', reasons };
}

// ─── Engine Status ────────────────────────────────────────────────────────────
export function resolveEngineStatus(deps: DatasetRow[], hasOutput: boolean): EngineStatus {
  if (!hasOutput) return 'WAITING';
  
  const anyFailed = deps.some(d => d.sourceType === 'MISSING' && (d.criticality.includes('critical')));
  if (anyFailed) return 'FAILED';
  
  const anyMock = deps.some(d => d.sourceType === 'MOCK');
  if (anyMock) return 'SIMULATED';
  
  const anyFallback = deps.some(d => !d.tradingValid || ['FALLBACK', 'CACHED', 'SCRAPED'].includes(d.sourceType));
  if (anyFallback) return 'DEGRADED';
  
  return 'READY';
}

// ─── Engines ─────────────────────────────────────────────────────────────────
export function buildEngines(run: any, summary: any, sourceRegistry: DatasetRow[]): EngineRow[] {
  const regime = summary?.regime ?? {};
  const flows = summary?.flows ?? {};
  const leadership = summary?.leadership ?? {};
  const risk = summary?.risk ?? {};
  const advisor = summary?.advisor ?? {};

  const safe = (v: any) => v === null || v === undefined ? '—' : String(v);

  const getDeps = (keys: string[]) => sourceRegistry.filter(s => keys.includes(s.key));
  const depSummary = (deps: DatasetRow[]) => deps.map(d => {
    const icon = d.tradingValid ? '✓' : '✗';
    return `${icon} ${d.sourceType}: ${d.label} (${d.provider})`;
  });

  return [
    {
      engine: 'REGIME',
      status: resolveEngineStatus(getDeps(['nifty_ohlcv', 'india_vix']), !!regime?.state),
      validity: getDeps(['nifty_ohlcv', 'india_vix']).every(d => d.tradingValid) ? 'YES' : 'NO',
      primaryOutput: [
        `State: ${safe(regime?.state)}`,
        `Trend Score: ${regime?.trend_score?.toFixed ? regime.trend_score.toFixed(3) : '—'}`,
        `VIX: ${safe(regime?.vix_value)}`,
        `Breadth: ${regime?.breadth_pct ? (regime.breadth_pct * 100).toFixed(0) + '%' : '—'}`,
        `Hysteresis: ${regime?.transition_reason === 'stable' ? 'CONFIRMED' : 'WAITING'}`,
      ],
      dependencySummary: depSummary(getDeps(['nifty_ohlcv', 'india_vix', 'regime_history'])),
      downstreamImpact: [
        `Regime vote → ${regime?.state === 'BULLISH' ? 'LONG bias' : regime?.state === 'BEARISH' ? 'SHORT bias' : 'neutral/blocked'}`,
        `Confidence: ${regime?.is_shock ? 'SHOCK detected' : 'Standard trend derivation'}`,
      ],
      warnings: getDeps(['nifty_ohlcv', 'india_vix']).filter(d => !d.tradingValid).map(d => `${d.label} is ${d.sourceType}`),
      rawMetrics: regime,
    },
    {
      engine: 'FLOWS',
      status: resolveEngineStatus(getDeps(['fii_flows', 'pcr_oi']), flows?.flows_score !== undefined),
      validity: getDeps(['fii_flows', 'pcr_oi']).every(d => d.tradingValid) ? 'YES' : 'NO',
      primaryOutput: [
        `Bias: ${flowScoreToBias(flows?.flows_score)}`,
        `Flow Score: ${flows?.flows_score?.toFixed ? flows.flows_score.toFixed(3) : '—'}`,
        `FII Z: ${flows?.fii_5d_z?.toFixed ? flows.fii_5d_z.toFixed(2) : '—'}`,
        `PCR: ${flows?.pcr_smooth?.toFixed ? flows.pcr_smooth.toFixed(2) : '—'}`,
      ],
      dependencySummary: depSummary(getDeps(['fii_flows', 'dii_flows', 'pcr_oi', 'sector_indices'])),
      downstreamImpact: ['Flow vote contribution to Advisor score'],
      warnings: getDeps(['fii_flows', 'pcr_oi']).filter(d => !d.tradingValid).map(d => `${d.label} is ${d.sourceType}`),
      rawMetrics: flows,
    },
    {
      engine: 'LEADERSHIP',
      status: resolveEngineStatus(getDeps(['universe_ohlcv']), leadership?.leaders_count !== undefined),
      validity: getDeps(['universe_ohlcv']).every(d => d.tradingValid) ? 'YES' : 'NO',
      primaryOutput: [
        `Universe: ${safe(leadership?.universe_size)} stocks`,
        `Leaders: ${safe(leadership?.leaders_count)}`,
        `Avg Score: ${leadership?.avg_score?.toFixed ? leadership.avg_score.toFixed(2) : '—'}`,
      ],
      dependencySummary: depSummary(getDeps(['universe_ohlcv', 'delivery'])),
      downstreamImpact: ['Leadership score influences decision confidence'],
      warnings: getDeps(['universe_ohlcv']).filter(d => !d.tradingValid).map(d => `${d.label} is ${d.sourceType}`),
      rawMetrics: leadership,
    },
    {
      engine: 'RISK',
      status: resolveEngineStatus(getDeps(['equity_curve']), !!risk?.status),
      validity: getDeps(['equity_curve']).every(d => d.tradingValid) ? 'YES' : 'NO',
      primaryOutput: [
        `Mode: ${safe(risk?.status)}`,
        `Portfolio Risk: ${risk?.portfolio_risk?.portfolio_risk_pct ?? '—'}%`,
        `Circuit Breaker: ${risk?.circuit_breaker?.active ? 'TRIPPED' : 'SAFE'}`,
        `Drawdown Limit: ${risk?.limits?.daily_drawdown_limit_pct ?? '—'}%`,
      ],
      dependencySummary: depSummary(getDeps(['equity_curve'])),
      downstreamImpact: ['Risk gate can force HALT on Advisor'],
      warnings: getDeps(['equity_curve']).filter(d => !d.tradingValid).map(d => `${d.label} is ${d.sourceType}`),
      rawMetrics: risk,
    },
    {
      engine: 'DECISION',
      status: resolveEngineStatus(sourceRegistry.filter(s => s.criticality.includes('critical')), !!advisor?.action),
      validity: sourceRegistry.filter(s => s.criticality.includes('critical')).every(d => d.tradingValid) ? 'YES' : 'NO',
      primaryOutput: [
        `Action: ${safe(advisor?.action)}`,
        `Confidence: ${advisor?.confidence !== undefined ? (advisor.confidence * 100).toFixed(0) + '%' : '—'}`,
        `Conflict: ${advisor?.conflict_detected ? 'YES' : 'NO'}`,
      ],
      dependencySummary: ['Summary of all engine votes'],
      downstreamImpact: ['Execution eligibility for Paper/Live'],
      warnings: advisor?.conflict_detected ? ['Directional conflict detected'] : [],
      rawMetrics: advisor,
    },
  ];
}

function flowScoreToBias(score: number): string {
    if (score > 0.2) return 'BULLISH';
    if (score < -0.2) return 'BEARISH';
    return 'NEUTRAL';
}

// ─── Decision Trace ───────────────────────────────────────────────────────────
export function buildTrace(engines: EngineRow[], summary: any): TraceRow[] {
  const regime = summary?.regime ?? {};
  const flows = summary?.flows ?? {};
  const leadership = summary?.leadership ?? {};
  const risk = summary?.risk ?? {};
  const advisor = summary?.advisor ?? {};
  return [
    { engine: 'Regime', status: engines[0].status, validity: engines[0].validity,
      gateOrVote: regime?.state === 'BULLISH' ? 'PASS' : 'FAIL',
      confImpact: Number((advisor?.components?.regime?.score ?? 0).toFixed(3)),
      note: `State: ${regime?.state ?? '—'}` },
    { engine: 'Flows', status: engines[1].status, validity: engines[1].validity,
      gateOrVote: flows?.flows_score > 0.1 ? 'PASS' : 'FAIL',
      confImpact: Number((advisor?.components?.flows?.score ?? 0).toFixed(3)),
      note: `Score: ${flows?.flows_score?.toFixed(3) ?? '—'}` },
    { engine: 'Leadership', status: engines[2].status, validity: engines[2].validity,
      gateOrVote: leadership?.leaders_count > 0 ? 'PASS' : 'FAIL',
      confImpact: Number((advisor?.components?.leadership?.score ?? 0).toFixed(3)),
      note: `${leadership?.leaders_count ?? 0} leaders found` },
    { engine: 'Risk', status: engines[3].status, validity: engines[3].validity,
      gateOrVote: risk?.status === 'HALTED' ? 'FAIL' : 'PASS',
      confImpact: 0,
      note: `Status: ${risk?.status ?? '—'}` },
  ];
}

// ─── Validation Checks ────────────────────────────────────────────────────────
export function buildValidation(summary: any, validity: RunValidity): Check[] {
  const advisor = summary?.advisor ?? {};
  const risk = summary?.risk ?? {};
  return [
    { label: 'Run Valid for Trading', result: validity === 'YES' ? 'PASS' : validity === 'PARTIAL' ? 'WARN' : 'FAIL',
      note: validity === 'NO' ? 'Critical feeds missing or mock' : undefined },
    { label: 'Risk Circuit Breaker', result: risk?.circuit_breaker?.active ? 'FAIL' : 'PASS', note: risk?.circuit_breaker?.active ? 'TRIPPED' : 'CLEAN' },
    { label: 'Confidence in 0–100 range', result: advisor?.confidence >= 0 && advisor?.confidence <= 1 ? 'PASS' : 'WARN',
      note: advisor?.confidence !== undefined ? `${(advisor.confidence * 100).toFixed(0)}%` : 'Missing' },
  ];
}
