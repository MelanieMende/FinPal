import { parsePytrJsonLines, parsePytrPortfolioCsv } from './tradeRepublicSync';

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

  it('uses the cash-flow sign to recognize the Nikola row as a sell', () => {
    const input = JSON.stringify({
      Date: '2025-03-17', Type: 'Buy', Value: 0.95, Note: 'Nikola',
      ISIN: 'US6541103031', Shares: 0.532481, Fees: 1, Taxes: 0,
    });

    const result = parsePytrJsonLines(input);

    expect(result.records[0]).toEqual(expect.objectContaining({ type: 'Sell' }));
    expect(result.records[0].pricePerShare).toBeCloseTo(3.66, 2);
  });
});

describe('parsePytrPortfolioCsv', () => {
  it('maps the Trade Republic portfolio export to current quotes', () => {
    const input = [
      'Name;ISIN;quantity;price;avgCost;netValue',
      'Bitcoin;BTC;0.008129;74650.0185;68482.88;606.83',
      'Apple;US0378331005;2;210.25;150.5;420.5',
    ].join('\n');

    expect(parsePytrPortfolioCsv(input)).toEqual([
      { name: 'Bitcoin', isin: 'BTC', quantity: 0.008129, price: 74650.0185, averageBuyIn: 68482.88, netValue: 606.83 },
      { name: 'Apple', isin: 'US0378331005', quantity: 2, price: 210.25, averageBuyIn: 150.5, netValue: 420.5 },
    ]);
  });

  it('ignores malformed portfolio output and positions without a price', () => {
    expect(parsePytrPortfolioCsv('unexpected;columns\nvalue;row')).toEqual([]);
    expect(parsePytrPortfolioCsv('Name;ISIN;quantity;price;avgCost;netValue\nBitcoin;BTC;0.1;0;50;0')).toEqual([]);
  });
});
