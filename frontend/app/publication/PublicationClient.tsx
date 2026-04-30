
'use client';
import React, { useState } from 'react';

export default function PublicationClient({ run, summary, provenance }: { run: any; summary: any; provenance: any[] }) {
  const [activeTab, setActiveTab] = useState('summary');

  const tabs = [
    { id: 'summary', label: 'Overview' },
    { id: 'provenance', label: 'Provenance' },
    { id: 'regime', label: 'Regime' },
    { id: 'flows', label: 'Flows' },
    { id: 'leadership', label: 'Leadership' },
    { id: 'risk', label: 'Risk' },
    { id: 'advisor', label: 'Advisor' },
    { id: 'previews', label: 'Raw Previews' },
  ];

  const renderContent = () => {
    if (activeTab === 'summary') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">Run Metadata</h3>
            <div className="space-y-3">
              <div className="flex justify-between border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--text-muted)]">Run ID</span>
                <span className="text-sm font-mono text-[var(--text-primary)]">{run.id}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--text-muted)]">Timestamp</span>
                <span className="text-sm text-[var(--text-primary)]">{new Date(run.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border)] pb-2">
                <span className="text-sm text-[var(--text-muted)]">Status</span>
                <span className={`text-sm font-bold ${run.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>{run.status.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[var(--text-muted)]">Validity</span>
                <span className={`text-sm font-bold ${run.meta?.validity === 'YES' ? 'text-green-500' : 'text-amber-500'}`}>{run.meta?.validity}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-4">Advisor Verdict</h3>
            <div className="flex items-center justify-center h-full">
              <div className={`text-4xl font-black ${
                summary?.advisor?.action === 'LONG' ? 'text-green-500' : 
                summary?.advisor?.action === 'SHORT' ? 'text-red-500' : 
                'text-amber-500'
              }`}>
                {summary?.advisor?.action || 'NO_SIGNAL'}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'provenance') {
      return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Dataset</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Provider</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Source</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Valid</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Freshness</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-[var(--text-muted)]">Records</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {provenance.map((p: any, i: number) => (
                <tr key={i} className="hover:bg-[var(--bg-elevated)]/30 transition-colors">
                  <td className="px-6 py-4 font-bold text-[var(--text-primary)]">{p.dataset_key}</td>
                  <td className="px-6 py-4 text-[var(--text-secondary)]">{p.provider}</td>
                  <td className="px-6 py-4 text-[var(--text-secondary)]">{p.source_type}</td>
                  <td className="px-6 py-4 font-bold">
                    <span className={p.trading_valid ? 'text-green-500' : 'text-red-500'}>
                      {p.trading_valid ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[var(--text-secondary)]">{p.freshness}</td>
                  <td className="px-6 py-4 font-mono text-[var(--text-secondary)]">{p.record_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const rawData = summary?.[activeTab];
    if (activeTab === 'previews') {
      const previews = summary?.meta?.raw_data_previews || [];
      return (
        <div className="space-y-8">
          {previews.map((p: any, i: number) => (
            <div key={i} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
              <div className="px-6 py-4 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex justify-between items-center">
                <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text-primary)]">{p.label}</h3>
                <div className="flex gap-4">
                   <span className="text-[10px] font-bold text-[var(--text-muted)]">PROVIDER: {p.provider}</span>
                   <span className="text-[10px] font-bold text-[var(--text-muted)]">MARKET DATE: {p.marketDate}</span>
                </div>
              </div>
              <div className="p-0 overflow-x-auto">
                {p.rows && p.rows.length > 0 ? (
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-[var(--bg-elevated)]/50">
                        {Object.keys(p.rows[0]).map(h => (
                          <th key={h} className="px-4 py-2 font-bold uppercase tracking-tighter text-[var(--text-muted)] border-b border-[var(--border)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {p.rows.map((row: any, j: number) => (
                        <tr key={j} className="hover:bg-[var(--bg-elevated)]/30 transition-colors">
                          {Object.values(row).map((val: any, k: number) => (
                            <td key={k} className="px-4 py-2 font-mono text-[var(--text-secondary)]">
                              {typeof val === 'number' ? val.toFixed(2) : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-10 text-center text-[var(--text-muted)] italic font-medium">No rows available in preview.</div>
                )}
              </div>
            </div>
          ))}
          {previews.length === 0 && (
            <div className="text-center p-20 bg-[var(--bg-card)] rounded-2xl border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] font-black uppercase tracking-[0.3em]">
              No raw data previews generated for this run.
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 bg-[var(--bg-elevated)] border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-primary)]">{activeTab} JSON Payload</h3>
          <button 
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
              alert('Copied to clipboard');
            }}
            className="text-[10px] font-black uppercase tracking-widest bg-[var(--bg-primary)] hover:bg-[var(--border)] px-3 py-1 rounded-md border border-[var(--border)] transition-colors"
          >
            Copy JSON
          </button>
        </div>
        <pre className="p-8 text-xs font-mono text-green-400 bg-black/90 overflow-auto max-h-[60vh] leading-relaxed">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] py-10">
      <div className="max-w-6xl mx-auto px-6 space-y-10">
        
        {/* Header Block */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tighter text-[var(--text-primary)] flex items-center gap-3">
            <span className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-black text-lg">H</span>
            Data Hub: Evidence & Provenance
          </h1>
          <p className="text-[var(--text-muted)] text-sm font-medium">
            Publishing full telemetry and raw source data for Run <span className="font-mono bg-[var(--bg-elevated)] px-2 py-0.5 rounded text-[var(--text-primary)]">{run.id}</span>
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-200 border-2 ${
                activeTab === t.id 
                ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' 
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-transparent hover:border-[var(--border)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Dynamic Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {renderContent()}
        </div>

        {/* Bottom Alert */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex gap-4 items-start">
           <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">ℹ</div>
           <div>
             <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-1">Audit Mode Active</h4>
             <p className="text-xs text-blue-300/80 leading-relaxed font-medium">
               This view provides unredacted access to the internal engine states and raw data previews. 
               Use this for debugging data provenance issues or verifying signal consistency across sources.
             </p>
           </div>
        </div>

      </div>
    </main>
  );
}
