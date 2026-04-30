
import React from 'react';
import { supabase } from '../../lib/supabase';
import PublicationClient from './PublicationClient';

export const revalidate = 0;

export default async function PublicationPage() {
  // Fetch latest run
  const { data: latestRun } = await supabase
    .from('runs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (!latestRun) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-[var(--text-muted)] font-black uppercase tracking-widest">
        No runs found in database.
      </div>
    );
  }

  // Fetch signals summary for this run
  const { data: summary } = await supabase
    .from('signals_summary')
    .select('*')
    .eq('run_id', latestRun.id)
    .single();

  // Fetch provenance registry
  const { data: provenance } = await supabase
    .from('run_provenance')
    .select('*')
    .eq('run_id', latestRun.id);

  return <PublicationClient run={latestRun} summary={summary || {}} provenance={provenance || []} />;
}
