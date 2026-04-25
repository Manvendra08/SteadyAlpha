import React from 'react';

export interface OpenPaperTradeRow {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    qty: number;
    entryPrice: number;
    slippageBps: number;
    entryAt: string;
    simulationVersion: string;
}

interface OpenPaperTradesTableProps {
    trades: OpenPaperTradeRow[];
}

export default function OpenPaperTradesTable({ trades }: OpenPaperTradesTableProps) {
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
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Open Paper Trades</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ color: '#a0aec0', textAlign: 'left' }}>
                            <th style={{ padding: '8px 6px' }}>Symbol</th>
                            <th style={{ padding: '8px 6px' }}>Dir</th>
                            <th style={{ padding: '8px 6px' }}>Qty</th>
                            <th style={{ padding: '8px 6px' }}>Entry Price</th>
                            <th style={{ padding: '8px 6px' }}>Slippage (bps)</th>
                            <th style={{ padding: '8px 6px' }}>Entry At</th>
                            <th style={{ padding: '8px 6px' }}>Sim Ver</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.map((t) => (
                            <tr key={t.id} style={{ borderTop: '1px solid #2d3748' }}>
                                <td style={{ padding: '8px 6px' }}>{t.symbol}</td>
                                <td style={{ padding: '8px 6px' }}>{t.direction}</td>
                                <td style={{ padding: '8px 6px' }}>{t.qty}</td>
                                <td style={{ padding: '8px 6px' }}>{t.entryPrice.toFixed(2)}</td>
                                <td style={{ padding: '8px 6px' }}>{t.slippageBps}</td>
                                <td style={{ padding: '8px 6px' }}>{new Date(t.entryAt).toLocaleString()}</td>
                                <td style={{ padding: '8px 6px' }}>{t.simulationVersion}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

