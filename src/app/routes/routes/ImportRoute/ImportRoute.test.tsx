import React from 'react';
import { fireEvent, render, screen, waitFor } from '../../../../testing/test-utils';
import ImportRoute from './ImportRoute';
import * as assetsReducer from '../../../store/assets/assets.reducer';

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

    afterEach(() => {
        jest.restoreAllMocks();
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

    it('finishes Trade Republic sync without waiting for the background asset refresh', async () => {
        const backgroundRefresh = new Promise(() => undefined);
        const syncTradeRepublic = jest.fn().mockResolvedValue({
            records: [pendingRecord],
            cashRecords: [],
            unsupportedRecords: [],
            skipped: 0,
            quotes: [{
                name: 'Unbekanntes Asset', isin: pendingRecord.isin, quantity: 1,
                price: 10, averageBuyIn: 10, netValue: 10,
            }],
            lastSyncAt: '2026-10-01T10:30:00.000Z',
        });
        jest.spyOn(assetsReducer, 'loadPricesAndDividends').mockReturnValue((() => backgroundRefresh) as any);
        window.API = {
            sendToDB: jest.fn(),
            getTradeRepublicStatus: jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true }),
            syncTradeRepublic,
        };

        render(<ImportRoute />, {
            preloadedState: {
                assets: [],
                import: { pendingRecords: [], isLoading: false, error: null },
                transactions: [],
                dividends: [],
            },
        });

        const syncButton = screen.getByRole('button', { name: /Jetzt synchronisieren/i });
        expect(screen.queryByRole('checkbox', { name: /Vertragsunterlagen beim Sync suchen/ })).not.toBeInTheDocument();
        fireEvent.click(syncButton);

        await waitFor(() => expect(syncButton).not.toBeDisabled());
        expect(syncTradeRepublic.mock.calls[0][0]).not.toHaveProperty('downloadBitcoinContractDocuments');
        expect(screen.getByText(/1 Transaktion\(en\) geladen/)).toBeInTheDocument();
        expect(screen.getByTestId('trade-republic-last-sync')).toHaveTextContent('01.10.26');
    });

    it('shows the saved Trade Republic sync time after reopening Import', async () => {
        window.API = {
            sendToDB: jest.fn(),
            getTradeRepublicStatus: jest.fn().mockResolvedValue({
                runnerAvailable: true, hasSavedCredentials: true, lastSyncAt: '2026-10-01T10:30:00.000Z',
            }),
        };
        render(<ImportRoute />);
        await waitFor(() => expect(screen.getByTestId('trade-republic-last-sync')).toHaveTextContent('01.10.26'));
    });

    it('imports broker cash automatically while leaving a matching manual deposit untouched', async () => {
        const cash = [{ date: '2025-04-23', type: 'Deposit', amount: 100 }];
        const sendToDB = jest.fn(async (sql: string) => {
            if (sql.startsWith('SELECT date, type, amount FROM cash')) return cash;
            if (sql.startsWith('SELECT * FROM cash')) return cash;
            return [];
        });
        window.API = {
            sendToDB,
            getTradeRepublicStatus: jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true }),
            syncTradeRepublic: jest.fn().mockResolvedValue({
                records: [], cashRecords: [
                    { date: '2025-04-23', type: 'Deposit', amount: 100 },
                    { date: '2025-10-30', type: 'Tax Refund', amount: 13.68 },
                ], unsupportedRecords: [], skipped: 0, quotes: [], lastSyncAt: '2026-10-01T10:30:00.000Z',
            }),
        };
        render(<ImportRoute />);

        fireEvent.click(screen.getByRole('button', { name: /Jetzt synchronisieren/i }));

        await waitFor(() => expect(screen.getByText(/1 Cash-Umsätze automatisch importiert, 1 bereits vorhanden/)).toBeInTheDocument());
        expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining("'Trade Republic: Steuererstattung'"));
        expect(sendToDB).not.toHaveBeenCalledWith(expect.stringContaining("'2025-04-23', 'Deposit', 100.00"));
    });

    it('shows unsupported bookings for review and keeps them across reopening the tab', async () => {
        const unsupportedRecord = {
            date: '2026-11-01', type: 'Card Cashback', description: 'Saveback', amount: 12.34,
            reason: 'Buchungstyp wird noch nicht unterstützt.',
        };
        window.API = {
            sendToDB: jest.fn(),
            getTradeRepublicStatus: jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true }),
            syncTradeRepublic: jest.fn().mockResolvedValue({
                records: [], cashRecords: [], unsupportedRecords: [unsupportedRecord], skipped: 1, quotes: [],
                lastSyncAt: '2026-11-12T10:30:00.000Z',
            }),
        };
        const view = render(<ImportRoute />);

        fireEvent.click(screen.getByRole('button', { name: /Jetzt synchronisieren/i }));
        await waitFor(() => expect(screen.getByText(/nicht unterstützte Buchung prüfen/)).toBeInTheDocument());
        fireEvent.click(screen.getByText(/nicht unterstützte Buchung prüfen/));
        expect(screen.getByText('Card Cashback')).toBeInTheDocument();
        expect(screen.getByText('Saveback')).toBeInTheDocument();
        expect(screen.getByText('Buchungstyp wird noch nicht unterstützt.')).toBeInTheDocument();

        view.unmount();
        render(<ImportRoute />);
        expect(screen.getByText(/nicht unterstützte Buchung prüfen/)).toBeInTheDocument();
    });

    it('records an IPO subscription as reserved cash without inventing shares', async () => {
        const sendToDB = jest.fn().mockResolvedValue([]);
        window.API = { sendToDB, getTradeRepublicStatus: jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true }) };
        render(<ImportRoute />, { preloadedState: {
            assets: [{ ID: 7, type: 'IPO', name: 'Anthropic', symbol: 'ANTH', isin: 'US03703U1079' } as Asset],
            import: { pendingRecords: [{
                date: '2026-11-11', type: 'IPO', assetName: 'Anthropic', isin: 'US03703U1079', shares: 0,
                pricePerShare: 0, fee: 0, tax: 0, totalAmount: 201,
            }], isLoading: false, error: null },
            transactions: [], dividends: [],
        } });

        await waitFor(() => expect(screen.getAllByRole('button', { name: 'Importieren' }).length).toBeGreaterThan(0));
        const importButtons = screen.getAllByRole('button', { name: 'Importieren' });
        fireEvent.click(importButtons[importButtons.length - 1]);

        await waitFor(() => expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining("UPDATE assets SET type = 'IPO', reserved_amount = 201")));
        expect(sendToDB).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO transactions'));
    });

    it('turns an IPO reservation into a stock when allocated shares arrive', async () => {
        const sendToDB = jest.fn().mockResolvedValue([]);
        window.API = { sendToDB, getTradeRepublicStatus: jest.fn().mockResolvedValue({ runnerAvailable: true, hasSavedCredentials: true }) };
        render(<ImportRoute />, { preloadedState: {
            assets: [{ ID: 7, type: 'IPO', name: 'Anthropic', symbol: 'ANTH', isin: 'US03703U1079', reserved_amount: 201 } as Asset],
            import: { pendingRecords: [{
                date: '2026-12-01', type: 'Buy', assetName: 'Anthropic', isin: 'US03703U1079', shares: 3,
                pricePerShare: 67, fee: 0, tax: 0, totalAmount: 201,
            }], isLoading: false, error: null },
            transactions: [], dividends: [],
        } });

        await waitFor(() => expect(screen.getAllByRole('button', { name: 'Importieren' }).length).toBeGreaterThan(0));
        const importButtons = screen.getAllByRole('button', { name: 'Importieren' });
        fireEvent.click(importButtons[importButtons.length - 1]);

        await waitFor(() => expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO transactions')));
        expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining("UPDATE assets SET type = 'Stock', reserved_amount = 0"));
    });
});
