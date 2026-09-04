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

    it('recognizes the Tesla sell by shares even when the imported price or total differs', () => {
        const pendingRecord = {
            date: '2024-12-04',
            type: 'Sell',
            isin: 'US88160R1014',
            assetName: 'Tesla',
            shares: 0.308928,
            pricePerShare: 325.19,
            totalAmount: 100.46,
            fee: 1,
            tax: 0.26,
        } as TradeRepublicRecord;
        const savedTransaction = {
            ID: 1,
            date: '2024-12-04',
            type: 'Sell',
            asset_ID: 14,
            amount: 0.308928,
            price_per_share: 333.35,
            fee: 1,
            solidarity_surcharge: 0.26,
            in_out: 101.72,
        } as Transaction;

        expect(isImportedRecord(pendingRecord, 14, [savedTransaction], [])).toBe(true);
    });
});
