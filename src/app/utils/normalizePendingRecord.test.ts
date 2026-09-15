import { normalizePendingRecord } from './normalizePendingRecord';

describe('normalizePendingRecord', () => {
    it('repairs the cached Nikola transaction that cannot be a buy', () => {
        const record = normalizePendingRecord({
            type: 'Buy' as const,
            shares: 0.532481,
            pricePerShare: 0,
            totalAmount: 0.95,
            fee: 1,
            tax: 0,
        });

        expect(record.type).toBe('Sell');
        expect(record.pricePerShare).toBeCloseTo(3.66, 2);
    });
});
