'use client';
import React, { useEffect, useState } from 'react';
import SystemStatusBar from './SystemStatusBar';
import RegimeCard from './RegimeCard';
import FlowsCard from './FlowsCard';
import LeadershipCard from './LeadershipCard';
import RiskCard from './RiskCard';
import DecisionPanel from './DecisionPanel';
import ChangesPanel from './ChangesPanel';
import PaperActionsTable from './PaperActionsTable';
import OpenPaperTradesTable from './OpenPaperTradesTable';
import ClosedPaperTradesTable from './ClosedPaperTradesTable';
import SegmentedPerformance from './SegmentedPerformance';
import DiagnosticsDrawer from './DiagnosticsDrawer';
import RawDataEvidenceDrawer from './RawDataEvidenceDrawer';
import { supabase } from '../lib/supabase';
import { DashboardViewModel } from '../types/DashboardViewModel';

interface DashboardClientProps {
  initialVm: DashboardViewModel;
  initialOpenTrades: any[];
  initialClosedTrades: any[];
}

export default function DashboardClient({ initialVm, initialOpenTrades, initialClosedTrades }: DashboardClientProps) {
  const [vm, setVm] = useState<DashboardViewModel>(initialVm);
  const [openTrades, setOpenTrades] = useState(initialOpenTrades);
  const [closedTrades, setClosedTrades] = useState(initialClosedTrades);
  const [lastPoll, setLastPoll] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchLatestData = async () => {
    setIsSyncing(true);
    try {
      const { data: latestRun } = await supabase
        .from('runs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!latestRun || latestRun.id === vm.diagnostics.runId) {
        setIsSyncing(false);
        setLastPoll(new Date());
        return;
      }

      // If there's a new run, we would ideally re-map everything here.
      // For now, to ensure the user sees the update, we'll trigger a window reload 
      // if a new run is detected, which is the most reliable way to refresh all server-side derived state.
      // In a full SPA refactor we would re-run the mappers.
      console.log('New pipeline run detected! Refreshing...');
      window.location.reload();
    } catch (err) {
      console.error('Polling error:', err);
    } finally {
      setIsSyncing(false);
      setLastPoll(new Date());
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(fetchLatestData, 30000); // 30s polling
    return () => clearInterval(interval);
  }, [vm.diagnostics.runId]);

  return (
    <div className="relative">
      <div className={`fixed top-2 right-4 z-50 transition-opacity duration-500 ${isSyncing ? 'opacity-100' : 'opacity-0'}`}>
        <div className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-lg flex items-center gap-2">
          <span className="animate-pulse">●</span> SYNCING
        </div>
      </div>
      
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
        <div className="flex items-center justify-between border-b border-border-theme pb-2 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-text-primary tracking-tighter uppercase">Console</h1>
            <span className="h-4 w-[1px] bg-border-theme hidden sm:block"></span>
            <div className="flex flex-col">
               <span className="text-text-muted text-[10px] hidden sm:block font-mono uppercase tracking-widest">Stage 2 — Paper Execution</span>
               <span className="text-[9px] text-text-muted/50 font-mono" suppressHydrationWarning>
                  Last Sync: {mounted ? lastPoll.toLocaleTimeString() : '—'}
               </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => window.location.reload()} className="text-[10px] bg-bg-elevated hover:bg-border-theme border border-border-theme px-2 py-1 rounded text-text-muted font-bold transition-colors">
                FORCE REFRESH
             </button>
          </div>
        </div>

        <DecisionPanel {...vm.decision} />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RegimeCard {...vm.regime} />
          <FlowsCard {...vm.flows} />
          <LeadershipCard {...vm.leadership} />
          <RiskCard {...vm.risk} />
        </div>

        <ChangesPanel {...vm.changes} />

        <PaperActionsTable
          actions={vm.paperActions}
          operatingMode={vm.operatingMode}
          emptyReason={vm.paperActionEmptyReason}
          decisionLabel={vm.decision.label}
          riskMode={vm.riskMode}
        />

        <div className="grid grid-cols-1 gap-5 mt-5">
          <OpenPaperTradesTable trades={openTrades} />
          <ClosedPaperTradesTable trades={closedTrades} />
        </div>

        <SegmentedPerformance trades={closedTrades} />
        <DiagnosticsDrawer diagnostics={vm.diagnostics} />
        <RawDataEvidenceDrawer previews={vm.diagnostics.rawDataPreviews} />
      </div>
    </div>
  );
}
