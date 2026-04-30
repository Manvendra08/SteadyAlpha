import React from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import DiagnosticsClient from './DiagnosticsClient';

export const revalidate = 0;

export default async function DiagnosticsPage() {
  const { data: latestRun, error: runError } = await supabase
    .from('runs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (runError) {
    console.error('Supabase fetch error [runs]:', runError);
  }

  let summary: any = null;
  let provenance: any[] = [];
  
  if (latestRun?.id) {
    // 1. Fetch Signals Summary
    const { data: sumData, error: summaryError } = await supabase
      .from('signals_summary')
      .select('*')
      .eq('run_id', latestRun.id)
      .maybeSingle();
    summary = sumData;
    
    // 2. Fetch Provenance Registry
    const { data: provData, error: provError } = await supabase
      .from('run_provenance')
      .select('*')
      .eq('run_id', latestRun.id);
    provenance = provData || [];

    if (summaryError) console.error('Supabase fetch error [signals_summary]:', summaryError);
    if (provError) console.error('Supabase fetch error [run_provenance]:', provError);
  }

  if (!latestRun) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-400 text-sm mb-6 inline-block">← Back to Console</Link>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-400">
            <h2 className="font-bold text-lg mb-2">No pipeline run data found</h2>
            <p className="text-sm mb-4">The dashboard could not retrieve the latest run from Supabase.</p>
            {runError && (
              <pre className="bg-black/40 p-3 rounded text-[10px] mb-4 overflow-auto">
                {JSON.stringify(runError, null, 2)}
              </pre>
            )}
            <p className="text-xs">
              Possible causes:<br/>
              1. The <code className="font-mono">runs</code> table is empty. Run <code className="font-mono">python pipeline/main.py</code> to generate data.<br/>
              2. Supabase environment variables are missing or incorrect.<br/>
              3. Database connection failure.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return <DiagnosticsClient run={latestRun} summary={summary} provenance={provenance} />;
}
