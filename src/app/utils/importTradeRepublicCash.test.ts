import { importTradeRepublicCash } from './importTradeRepublicCash';
import type { TradeRepublicCashRecord } from './tradeRepublicSync';

describe('importTradeRepublicCash', () => {
  it('skips manual deposits and imports credits, interest and refunds only once', async () => {
    const cash = [{ date: '2023-01-30', type: 'Deposit', amount: 200 }];
    const sendToDB = jest.fn(async (sql: string) => {
      if (sql.startsWith('SELECT')) return cash.slice();
      const match = sql.match(/VALUES \('([^']+)', '(Deposit|Interest)', ([\d.]+), 0, '([^']+)'\)/);
      if (!match) throw new Error(`Unexpected SQL: ${sql}`);
      cash.push({ date: match[1], type: match[2], amount: Number(match[3]) });
      return [];
    });
    const records: TradeRepublicCashRecord[] = [
      { date: '2023-01-30', type: 'Deposit', amount: 200 },
      { date: '2026-08-17', type: 'Deposit', amount: 0.87 },
      { date: '2026-10-01', type: 'Interest', amount: 0.03 },
      { date: '2025-10-30', type: 'Tax Refund', amount: 13.68 },
    ];

    expect(await importTradeRepublicCash(records, sendToDB)).toEqual({ imported: 3, existing: 1 });
    expect(cash).toContainEqual({ date: '2026-10-01', type: 'Interest', amount: 0.03 });
    expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining("'Trade Republic: Steuererstattung'"));
    expect(await importTradeRepublicCash(records, sendToDB)).toEqual({ imported: 0, existing: 4 });
  });

  it('preserves two distinct identical cash movements from the broker', async () => {
    const sendToDB = jest.fn(async (_sql: string): Promise<unknown[]> => []);
    const sameDay: TradeRepublicCashRecord = { date: '2026-10-01', type: 'Interest', amount: 0.03 };

    expect(await importTradeRepublicCash([sameDay, sameDay], sendToDB)).toEqual({ imported: 2, existing: 0 });
  });

  it('does not confuse interest with a deposit on the same day for the same amount', async () => {
    const sendToDB = jest.fn(async (sql: string): Promise<unknown[]> => sql.startsWith('SELECT')
      ? [{ date: '2026-10-01', type: 'Deposit', amount: 10 }]
      : []);
    expect(await importTradeRepublicCash([
      { date: '2026-10-01', type: 'Interest', amount: 10 },
    ], sendToDB)).toEqual({ imported: 1, existing: 0 });
  });
});
