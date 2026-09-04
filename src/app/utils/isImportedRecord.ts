import type { TradeRepublicRecord } from './tradeRepublicSync';

export function isImportedRecord(
    record: TradeRepublicRecord,
    assetID: number | undefined,
    transactions: Transaction[],
    dividends: Dividend[],
) {
    if (!assetID) return false;

    if (record.type === 'Dividend') {
        return dividends.some(dividend =>
            dividend.date === record.date &&
            dividend.asset_ID === assetID &&
            Math.abs(dividend.income - record.totalAmount) < 0.01
        );
    }

    return transactions.some(transaction => {
        const sameTransaction = transaction.date.slice(0, 10) === record.date &&
            transaction.asset_ID === assetID &&
            transaction.type.toLowerCase() === record.type.toLowerCase();
        if (!sameTransaction) return false;

        const shareTolerance = Math.max(0.000001, record.shares * 0.00001);
        const sameShares = Math.abs(Math.abs(transaction.amount) - record.shares) <= shareTolerance;
        const sameTotal = Math.abs(Math.abs(transaction.in_out) - record.totalAmount) < 0.05;
        return sameShares || sameTotal;
    });
}
