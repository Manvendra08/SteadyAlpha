import React from 'react';

export interface ClosedPaperTradeRow {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    qty: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    entryAt: string;
    exitAt: string;
    exitReason: string;
}

interface ClosedPaperTradesTableProps {
    trades: ClosedPaperTradeRow[];
}

export default function ClosedPaperTradesTable({ trades }: ClosedPaperTradesTableProps) {
    return (
        <div
            style={{
                padding: '20px',
                borderRadius: '12px',
                backgroundColor: '#1a202c',
                border: '1px solid #2d3748',
                color: '#e2e8f0',
                marginBottom: '20px',
            }}
        >
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Closed Paper Trades</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ color: '#a0aec0', textAlign: 'left' }}>
                            <th style={{ padding: '8px 6px' }}>Symbol</th>
                            <th style={{ padding: '8px 6px' }}>Dir</th>
                            <th style={{ padding: '8px 6px' }}>Qty</th>
                            <th style={{ padding: '8px 6px' }}>Entry</th>
                            <th style={{ padding: '8px 6px' }}>Exit</th>
                            <th style={{ padding: '8px 6px' }}>PnL</th>
                            <th style={{ padding: '8px 6px' }}>Entry At</th>
                            <th style={{ padding: '8px 6px' }}>Exit At</th>
                            <th style={{ padding: '8px 6px' }}>Exit Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.map((t) => (
                            <tr key={t.id} style={{ borderTop: '1px solid #2d3748' }}>
                                <td style={{ padding: '8px 6px' }}>{t.symbol}</td>
                                <td style={{ padding: '8px 6px' }}>{t.direction}</td>
                                <td style={{ padding: '8px 6px' }}>{t.qty}</td>
                                <td style={{ padding: '8px 6px' }}>{t.entryPrice.toFixed(2)}</td>
                                <td style={{ padding: '8px 6px' }}>{t.exitPrice.toFixed(2)}</td>
                                <td style={{ padding: '8px 6px', color: t.pnl >= 0 ? '#68d391' : '#fc8181' }}>
                                    {t.pnl.toFixed(2)}
                                </td>
                                <td style={{ padding: '8px 6px' }}>{new Date(t.entryAt).toLocaleString()}</td>
                                <td style={{ padding: '8px 6px' }}>{new Date(t.exitAt).toLocaleString()}</td>
                                <td style={{ padding: '8px 6px' }}>{t.exitReason}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

