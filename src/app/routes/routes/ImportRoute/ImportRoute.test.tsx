import React from 'react';
import { fireEvent, render, screen, waitFor } from '../../../../testing/test-utils';
import ImportRoute from './ImportRoute';

describe('ImportRoute asset mapping', () => {
    const pendingRecord = {
        date: '2026-09-15',
        type: 'Buy' as const,
        assetName: 'Unbekanntes Asset',
        isin: 'DE0000000001',
        shares: 1,
        pricePerShare: 10,
        fee: 0,
        tax: 0,
        totalAmount: 10,
    };

    beforeEach(() => {
        localStorage.clear();
    });

    it('sorts assets alphabetically and allows clearing a selection', async () => {
        render(<ImportRoute />, {
            preloadedState: {
                assets: [
                    { ID: 2, type: 'Stock', name: 'Zebra', symbol: 'ZBR', isin: 'US0000000002' },
                    { ID: 1, type: 'Stock', name: 'Alpha', symbol: 'ALP', isin: 'US0000000001' },
                ],
                import: { pendingRecords: [pendingRecord], isLoading: false, error: null },
                transactions: [],
                dividends: [],
            },
        });

        const select = screen.getByRole('combobox', { name: /Asset-Zuordnung/i });
        const optionLabels = Array.from((select as HTMLSelectElement).options).map(option => option.text);
        expect(optionLabels).toEqual(['No asset selected', 'Alpha', 'Zebra']);

        fireEvent.change(select, { target: { value: '2' } });
        await waitFor(() => expect(screen.queryByText('Create')).not.toBeInTheDocument());

        fireEvent.change(select, { target: { value: '' } });
        expect((select as HTMLSelectElement).value).toBe('');
        expect(screen.getByText('Create')).toBeInTheDocument();
    });
});
