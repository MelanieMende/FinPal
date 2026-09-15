type ImportTransactionRecord = {
    type: 'Buy' | 'Sell' | 'Dividend';
    shares: number;
    pricePerShare: number;
    fee: number;
    tax: number;
    totalAmount: number;
};

export function getImportTransactionValues(record: ImportTransactionRecord, isBond: boolean) {
    if (!isBond) {
        return { shares: record.shares, pricePerShare: record.pricePerShare };
    }

    const pricePerShare = record.type === 'Sell'
        ? record.totalAmount + record.fee + record.tax
        : Math.max(0, record.totalAmount - record.fee - record.tax);

    return { shares: 1, pricePerShare };
}
