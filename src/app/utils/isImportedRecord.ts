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

    return transactions.some(transaction =>
        transaction.date === record.date &&
        transaction.asset_ID === assetID &&
        transaction.type === record.type &&
        Math.abs(Math.abs(transaction.in_out) - record.totalAmount) < 0.05
    );
}
