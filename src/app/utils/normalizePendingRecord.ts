export function normalizePendingRecord<T extends {
    type: 'Buy' | 'Sell' | 'Dividend';
    shares: number;
    pricePerShare: number;
    totalAmount: number;
    fee: number;
    tax: number;
}>(record: T): T {
    const isImpossibleBuy = record.type === 'Buy' &&
        record.shares > 0 &&
        record.pricePerShare <= 0 &&
        record.totalAmount <= record.fee + record.tax;

    if (!isImpossibleBuy) return record;

    return {
        ...record,
        type: 'Sell',
        pricePerShare: (record.totalAmount + record.fee + record.tax) / record.shares,
    };
}
