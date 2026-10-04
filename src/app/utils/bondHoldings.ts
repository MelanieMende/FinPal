export interface BondHolding {
  nominal: number;
  currency: string;
  purchaseAccruedInterestEUR: number;
  source: 'user-confirmed';
  transactions: { id: number; date: string; nominal: number; accruedInterestEUR: number }[];
  brokerQuantity?: number;
  quantityConflict?: boolean;
}

export const bondDetailsSql = `CREATE TABLE IF NOT EXISTS bond_transaction_details (
  transaction_ID INTEGER PRIMARY KEY,
  asset_ID INTEGER NOT NULL,
  isin TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  recorded_amount REAL NOT NULL,
  recorded_price REAL NOT NULL,
  nominal REAL NOT NULL CHECK(nominal > 0),
  currency TEXT NOT NULL,
  accrued_interest_eur REAL NOT NULL,
  source TEXT NOT NULL
)`;

export async function readBondHolding(asset: Asset): Promise<BondHolding | undefined> {
  if (!Number.isInteger(asset.ID)) return undefined;
  const rows = await window.API.sendToDB(`SELECT t.ID, t.date, t.type, a.isin,
    d.nominal, d.currency, d.accrued_interest_eur, d.source
    FROM transactions t JOIN assets a ON a.ID = t.asset_ID
    LEFT JOIN bond_transaction_details d ON d.transaction_ID = t.ID AND d.asset_ID = t.asset_ID
      AND d.isin = a.isin AND d.transaction_date = t.date AND d.transaction_type = t.type
      AND d.recorded_amount = t.amount AND d.recorded_price = t.price_per_share
    WHERE t.asset_ID = ${asset.ID} ORDER BY t.date, t.ID`);
  return summarizeBondHolding(rows, asset.isin);
}

export function summarizeBondHolding(rows: any, isin: string): BondHolding | undefined {
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    row.isin !== isin || !['Buy', 'Sell'].includes(row.type) || row.source !== 'user-confirmed'
    || !Number.isFinite(row.nominal) || row.nominal <= 0
    || !Number.isFinite(row.accrued_interest_eur) || !/^[A-Z]{3}$/.test(row.currency)
    || !Number.isInteger(row.ID) || typeof row.date !== 'string')) return undefined;
  if (rows.some(row => row.currency !== rows[0].currency)) return undefined;
  const nominal = rows.reduce((sum, row) => sum + (row.type === 'Buy' ? row.nominal : -row.nominal), 0);
  if (nominal <= 0) return undefined;
  return { nominal, currency: rows[0].currency, source: 'user-confirmed',
    purchaseAccruedInterestEUR: rows.filter(row => row.type === 'Buy').reduce((sum, row) => sum + row.accrued_interest_eur, 0),
    transactions: rows.map(row => ({ id: row.ID, date: row.date, nominal: row.type === 'Buy' ? row.nominal : -row.nominal, accruedInterestEUR: row.accrued_interest_eur })),
  };
}
