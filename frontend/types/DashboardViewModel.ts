export type EngineStatus = 'READY' | 'DEGRADED' | 'SIMULATED' | 'SUPPRESSED' | 'WAITING' | 'FAILED';

export type DashboardViewModel = {
  pipelineStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RUNNING';
  tradingValidity: 'YES' | 'PARTIAL' | 'NO';
  operatingMode: 'SIGNAL_ONLY' | 'PAPER' | 'ASSISTED_LIVE' | 'LIVE_AUTO';
  lastSuccessTs: string;
  dataTrustScore?: number;
  tradingReadinessScore?: number;
  invalidReasons?: string[];
  riskMode: 'ACTIVE' | 'REDUCED' | 'HALTED';

  regime: {
    state: 'TREND_UP' | 'TREND_DOWN' | 'RANGE_BOUND' | 'TRANSITION' | 'HIGH_VIX' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidencePct: number;
    trendScore: number;
    adx: number;
    vix: number;
    vixPercentile: number;
    breadthPct: number;
    hysteresisState: 'CONFIRMED' | 'WAITING';
    engineStatus: EngineStatus;
    validityStatus: 'VALID' | 'DEGRADED' | 'INVALID';
    directionalVote: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WEAK' | 'BLOCKED';
    dependency: string;
    impact: string;
    warning?: string | null;
  };

  flows: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    fii5dNet: number | null;
    fiiNetDaily?: number | null;
    dii5dNet: number | null;
    diiNetDaily?: number | null;
    pcrOi: number | null;
    maxPain: number | null;
    spotVsMaxPainPct: number | null;
    sectorAlignment: 'ALIGNED' | 'CONFLICTED' | 'NEUTRAL' | 'UNKNOWN';
    freshness: 'FRESH' | 'STALE' | 'FALLBACK' | 'MISSING';
    biasDrivers: string[];
    engineStatus: EngineStatus;
    validityStatus: 'VALID' | 'DEGRADED' | 'INVALID';
    directionalVote: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WEAK' | 'BLOCKED';
    dependency: string;
    impact: string;
    warning?: string | null;
  };

  leadership: {
    status: 'READY' | 'WAITING_FOR_BATCH' | 'COVERAGE_TOO_LOW' | 'SUPPRESSED' | 'DATA_MISSING';
    universeCoverage: number | null;
    qualifiedLeaderCount: number;
    qualifiedLaggardCount: number;
    leaders: { symbol: string; score: number; sector?: string }[];
    laggards: { symbol: string; score: number; sector?: string }[];
    statusReason: string;
    engineStatus: EngineStatus;
    validityStatus: 'VALID' | 'DEGRADED' | 'INVALID';
    directionalVote: 'LONG' | 'SHORT' | 'NEUTRAL' | 'WEAK' | 'BLOCKED';
    dependency: string;
    impact: string;
    warning?: string | null;
    thresholds?: {
      minCoveragePct: number;
      minLeadersForVote: number;
    };
  };

  risk: {
    mode: 'ACTIVE' | 'REDUCED' | 'HALTED';
    baseRiskPct: number;
    drawdownPct: number;
    drawdownLimitPct: number;
    positionSize?: number | null;
    triggerReason?: string | null;
    consecutiveLossDays?: number | null;
    engineStatus: EngineStatus;
    validityStatus: 'VALID' | 'DEGRADED' | 'INVALID';
    directionalVote: 'PASS_EXECUTION' | 'CAUTION' | 'BLOCKED';
    dependency: string;
    impact: string;
    warning?: string | null;
  };

  decision: {
    label: 'NO_TRADE' | 'WATCHLIST' | 'LONG_BIAS' | 'SHORT_BIAS' | 'PAPER_ELIGIBLE' | 'INVALID_FOR_TRADING' | 'WATCHLIST_LONG' | 'WATCHLIST_SHORT' | 'LONG_BIAS_LOW_CONF' | 'SHORT_BIAS_LOW_CONF';
    topLineSummary?: string;
    confidencePct: number;
    directionalConfidence: number;
    actionConfidence: number;
    validityStatus: {
      regime: string;
      flows: string;
      leadership: string;
      risk: string;
    };
    directionalVotes: {
      regime: string;
      flows: string;
      leadership: string;
      risk: string;
    };
    reasons: string[];
    conflicts: string[];
    drivers: string[];
    boosters: string[];
    drags: string[];
    gates: string[];
    confidenceCalibration?: {
      contributions: {
        regime: number;
        flows: number;
        leadership: number;
        bonus: number;
        penalty: number;
      };
      watchlistFloorMet: boolean;
      promotionThresholdMet: boolean;
    };
  };

  changes: {
    material: boolean;
    items: string[];
    asOfTs: string;
  };

  paperActions: {
    symbol: string;
    setupType: string;
    direction: 'LONG' | 'SHORT';
    decision: 'OPENED' | 'REJECTED' | 'SKIPPED' | 'CLOSED' | 'PENDING';
    confidencePct: number | null;
    qty: number | null;
    riskGate: 'PASS' | 'FAIL' | 'N/A';
    source: 'DECISION_ENGINE' | 'MANUAL' | 'BROKER_RETRY';
    reason: string;
    ts: string;
    rawId: string;
  }[];

  paperActionEmptyReason?: string | null;

  diagnostics: {
    runId: string;
    durationMs: number;
    pipelineVersion: string;
    triggerType?: string | null;
    sourceRegistry: {
      datasetKey: string;
      datasetLabel: string;
      provider: string;
      scope: string;
      sourceType: 'REAL' | 'FALLBACK' | 'SCRAPED' | 'CACHED' | 'MOCK' | 'HISTORY' | 'CONFIG' | 'DERIVED' | 'MISSING';
      marketDate: string | null;
      fetchedAt: string | null;
      freshness: 'FRESH' | 'STALE' | 'N/A' | 'MISSING';
      recordCount: number | null;
      usedIn: string;
      status: 'loaded' | 'fallback' | 'failed' | 'cached' | 'skipped';
      note: string | null;
      tradingValid: boolean;
      criticality: string;
    }[];
    validationChecks: {
      label: string;
      result: 'PASS' | 'FAIL' | 'WARN';
      note?: string | null;
    }[];
    consistencyChecks: {
      label: string;
      result: 'PASS' | 'FAIL' | 'WARN';
      note?: string | null;
    }[];
    engineWarnings: string[];
    rawDataPreviews: {
      label: string;
      provider: string;
      fetchedAt: string | null;
      marketDate: string | null;
      recordCount: number | null;
      rows: Record<string, unknown>[];
      usedInRun: boolean;
    }[];
  };
};
