import { getImportTransactionValues } from './getImportTransactionValues';

describe('getImportTransactionValues', () => {
    it('does not count bond fees twice for a buy', () => {
        const values = getImportTransactionValues({
            type: 'Buy', shares: 100, pricePerShare: 1, fee: 1, tax: 0, totalAmount: 101,
        }, true);

        expect(values).toEqual({ shares: 1, pricePerShare: 100 });
        expect(-(values.shares * values.pricePerShare) - 1).toBe(-101);
    });

    it('reconstructs the bond value before fees and taxes for a sell', () => {
        const values = getImportTransactionValues({
            type: 'Sell', shares: 100, pricePerShare: 1, fee: 1, tax: 2, totalAmount: 97,
        }, true);

        expect(values).toEqual({ shares: 1, pricePerShare: 100 });
        expect(values.shares * values.pricePerShare - 1 - 2).toBe(97);
    });

    it('keeps regular transaction values unchanged', () => {
        expect(getImportTransactionValues({
            type: 'Buy', shares: 2, pricePerShare: 50, fee: 1, tax: 0, totalAmount: 101,
        }, false)).toEqual({ shares: 2, pricePerShare: 50 });
    });
});
