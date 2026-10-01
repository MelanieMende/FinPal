import type { TradeRepublicCashRecord } from './tradeRepublicSync';

type ExistingCash = Pick<CashTransaction, 'date' | 'type' | 'amount'>;

const commentByType: Record<TradeRepublicCashRecord['type'], string> = {
  Deposit: 'Trade Republic: Gutschrift',
  Interest: 'Trade Republic: Zinsen',
  'Tax Refund': 'Trade Republic: Steuererstattung',
};

const cashKey = (date: string, amount: number) => `${date}|${Math.round(amount * 100)}`;

export async function importTradeRepublicCash(
  records: TradeRepublicCashRecord[],
  sendToDB: (sql: string) => Promise<unknown>,
): Promise<{ imported: number; existing: number }> {
  if (!records.length) return { imported: 0, existing: 0 };

  const result = await sendToDB('SELECT date, type, amount FROM cash');
  if (!Array.isArray(result)) throw new Error(`Cash-Umsätze konnten nicht geladen werden: ${String(result)}`);
  const existingCounts = new Map<string, number>();
  for (const row of result as ExistingCash[]) {
    if (row.type !== 'Deposit') continue;
    const key = cashKey(row.date.slice(0, 10), Number(row.amount));
    existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
  }

  const seenCounts = new Map<string, number>();
  let imported = 0;
  let existing = 0;
  for (const record of records) {
    const cents = Math.round(record.amount * 100);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || cents <= 0) continue;
    const key = cashKey(record.date, record.amount);
    const occurrence = (seenCounts.get(key) ?? 0) + 1;
    seenCounts.set(key, occurrence);
    if (occurrence <= (existingCounts.get(key) ?? 0)) {
      existing += 1;
      continue;
    }

    const amount = (cents / 100).toFixed(2);
    const comment = commentByType[record.type];
    const insertResult = await sendToDB(
      `INSERT INTO cash (date, type, amount, fee, comment) VALUES ('${record.date}', 'Deposit', ${amount}, 0, '${comment}')`,
    );
    if (typeof insertResult === 'string') throw new Error(`Cash-Umsatz konnte nicht importiert werden: ${insertResult}`);
    imported += 1;
  }
  return { imported, existing };
}
