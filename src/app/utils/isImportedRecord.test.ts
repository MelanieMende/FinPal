import { isImportedRecord } from './isImportedRecord';
import type { TradeRepublicRecord } from './tradeRepublicSync';

describe('isImportedRecord', () => {
    it('recognizes a pending dividend after an existing dividend is saved with the same date', () => {
        const pendingRecord = {
            date: '2024-12-01',
            type: 'Dividend',
            isin: 'DE0000000001',
            assetName: 'Asset',
            shares: 0,
            pricePerShare: 0,
            totalAmount: 12.34,
            fee: 0,
            tax: 0,
        } as TradeRepublicRecord;
        const savedDividend = {
            ID: 1,
            date: '2024-12-01',
            asset_ID: 14,
            asset_name: 'Asset',
            income: 12.34,
        };

        expect(isImportedRecord(pendingRecord, 14, [], [savedDividend])).toBe(true);
    });
});
