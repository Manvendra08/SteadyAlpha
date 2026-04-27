import React from 'react';
import { supabase } from '../../lib/supabase';
import Link from 'next/link';
import DiagnosticsClient from './DiagnosticsClient';

export const revalidate = 0;

export default async function DiagnosticsPage() {
  const { data: latestRun } = await supabase
    .from('runs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  let summary: any = null;
  if (latestRun?.id) {
    const { data } = await supabase
      .from('signals_summary')
      .select('*')
      .eq('run_id', latestRun.id)
      .single();
    summary = data;
  }

  if (!latestRun && !summary) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/" className="text-blue-400 text-sm mb-6 inline-block">← Back to Console</Link>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-red-400">
            No pipeline run data found. Run <code className="font-mono">python -m pipeline.main</code> first.
          </div>
        </div>
      </main>
    );
  }

  return <DiagnosticsClient run={latestRun} summary={summary} />;
}
