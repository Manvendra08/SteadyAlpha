'use client';
import React, { useState } from 'react';
import { DashboardViewModel } from '../types/DashboardViewModel';

type Preview = DashboardViewModel['diagnostics']['rawDataPreviews'][number];

function PreviewCard({ preview }: { preview: Preview }) {
  const [expanded, setExpanded] = useState(false);
  const freshColor =
    preview.fetchedAt ? 'text-green-400' : 'text-amber-400';

  return (
    <div className="border border-border-theme rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2 bg-bg-elevated cursor-pointer hover:bg-bg-elevated/70 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${freshColor} flex-shrink-0 bg-current`} />
          <span className="text-xs font-semibold text-text-secondary">{preview.label}</span>
          <span className="text-[10px] text-text-muted">{preview.provider}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          {preview.recordCount !== null && <span>{preview.recordCount} rows</span>}
          {preview.usedInRun && (
            <span className="text-green-400 font-semibold">✓ used</span>
          )}
          <span>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 py-2 bg-bg-card space-y-2">
          <div className="flex gap-4 text-[10px] text-text-muted">
            {preview.fetchedAt && (
              <span>Fetched: <span className="text-text-secondary">{new Date(preview.fetchedAt).toLocaleTimeString()}</span></span>
            )}
            {preview.marketDate && (
              <span>Market date: <span className="text-text-secondary">{preview.marketDate}</span></span>
            )}
          </div>

          {preview.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-border-theme text-text-muted">
                    {Object.keys(preview.rows[0]).map(k => (
                      <th key={k} className="text-left px-2 py-1 font-semibold uppercase tracking-wider whitespace-nowrap">{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-theme">
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="font-mono text-text-secondary">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap">
                          {v === null || v === undefined ? '—' : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows.length > 5 && (
                <div className="text-[10px] text-text-muted mt-1 italic">
                  +{preview.rows.length - 5} more rows (showing 5)
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] text-text-muted italic">No rows available for preview</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RawDataEvidenceDrawer({
  previews,
}: {
  previews: DashboardViewModel['diagnostics']['rawDataPreviews'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-border-theme pt-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-text-muted text-xs font-semibold uppercase tracking-widest hover:text-text-secondary transition-colors"
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>Raw Data Evidence</span>
        <span className="text-[10px] text-text-muted normal-case tracking-normal font-normal ml-1">
          ({previews.length} dataset{previews.length !== 1 ? 's' : ''})
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {previews.length === 0 ? (
            <div className="text-xs text-text-muted italic bg-bg-elevated rounded-lg px-4 py-3 border border-border-theme">
              No raw data previews available — pipeline not connected to real feeds
            </div>
          ) : (
            previews.map((p, i) => <PreviewCard key={i} preview={p} />)
          )}
        </div>
      )}
    </div>
  );
}
