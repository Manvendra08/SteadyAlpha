import React from 'react';

export interface PaperOrderRow {
    id: string;
    symbol: string;
    direction: 'LONG' | 'SHORT';
    status: 'pending' | 'rejected' | 'filled' | 'cancelled';
    sourceSignalKey: string;
    confidenceAtEntry: number;
    requestedQty: number;
    sizingBasisLabel: string;
    rejectionReason?: string;
}

interface PaperOrdersTableProps {
    orders: PaperOrderRow[];
}

export default function PaperOrdersTable({ orders }: PaperOrdersTableProps) {
    return (
        <div style={{
            padding: '20px',
            borderRadius: '12px',
            backgroundColor: '#1a202c',
            border: '1px solid #2d3748',
            color: '#e2e8f0',
            marginBottom: '20px',
        }}>
            <h3 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>Paper Orders</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ color: '#a0aec0', textAlign: 'left' }}>
                            <th style={{ padding: '8px 6px' }}>Symbol</th>
                            <th style={{ padding: '8px 6px' }}>Dir</th>
                            <th style={{ padding: '8px 6px' }}>Status</th>
                            <th style={{ padding: '8px 6px' }}>Signal</th>
                            <th style={{ padding: '8px 6px' }}>Conf</th>
                            <th style={{ padding: '8px 6px' }}>Qty</th>
                            <th style={{ padding: '8px 6px' }}>Sizing Basis</th>
                            <th style={{ padding: '8px 6px' }}>Rejection Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((o) => (
                            <tr key={o.id} style={{ borderTop: '1px solid #2d3748' }}>
                                <td style={{ padding: '8px 6px' }}>{o.symbol}</td>
                                <td style={{ padding: '8px 6px' }}>{o.direction}</td>
                                <td style={{ padding: '8px 6px' }}>{o.status}</td>
                                <td style={{ padding: '8px 6px' }}>{o.sourceSignalKey}</td>
                                <td style={{ padding: '8px 6px' }}>{o.confidenceAtEntry.toFixed(0)}%</td>
                                <td style={{ padding: '8px 6px' }}>{o.requestedQty}</td>
                                <td style={{ padding: '8px 6px' }}>{o.sizingBasisLabel}</td>
                                <td style={{ padding: '8px 6px', color: '#fc8181' }}>{o.rejectionReason ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

