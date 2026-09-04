import { parsePytrJsonLines } from './tradeRepublicSync';

jest.mock('electron', () => ({ safeStorage: {} }));

describe('parsePytrJsonLines', () => {
  it('maps supported pytr rows to FinPal transactions', () => {
    const input = [
      JSON.stringify({ Date: '2026-08-20', Type: 'Buy', Value: -101, Note: 'ACME order', ISIN: 'US0378331005', Shares: 2, Fees: 1, Taxes: 0 }),
      JSON.stringify({ Date: '2026-08-21T12:00:00', Type: 'Dividend', Value: 4.5, Note: 'ACME dividend', ISIN: 'US0378331005', Shares: null, Fees: null, Taxes: 0.5 }),
    ].join('\n');

    const result = parsePytrJsonLines(input);

    expect(result.skipped).toBe(0);
    expect(result.records).toEqual([
      expect.objectContaining({ type: 'Buy', totalAmount: 101, shares: 2, pricePerShare: 50, fee: 1 }),
      expect.objectContaining({ type: 'Dividend', totalAmount: 4.5, tax: 0.5, pricePerShare: 0 }),
    ]);
  });

  it('skips cash movements, malformed data and transactions without an ISIN', () => {
    const input = [
      JSON.stringify({ Date: '2026-08-20', Type: 'Deposit', Value: 100 }),
      '{broken',
      JSON.stringify({ Date: '2026-08-20', Type: 'Buy', Value: -10, Shares: 1 }),
    ].join('\n');

    expect(parsePytrJsonLines(input)).toEqual({ records: [], skipped: 3 });
  });

  it('reconstructs the gross Tesla sell price from net value, fees and taxes', () => {
    const input = JSON.stringify({
      Date: '2024-12-04', Type: 'Sell', Value: 101.72, Note: 'Tesla',
      ISIN: 'US88160R1014', Shares: 0.308928, Fees: 1, Taxes: 0.26,
    });

    const result = parsePytrJsonLines(input);

    expect(result.records[0].pricePerShare).toBeCloseTo(333.35, 2);
  });
});
