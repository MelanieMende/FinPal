import { normalizeLegacyTradeRepublicQuote, parsePytrJsonLines, parsePytrPortfolioCsv } from './tradeRepublicSync';

jest.mock('electron', () => ({ safeStorage: {} }));

describe('parsePytrJsonLines', () => {
  it('maps supported pytr rows to FinPal transactions', () => {
    const input = [
      JSON.stringify({ Date: '2026-08-20', Type: 'Buy', Value: -101, Note: 'ACME order', ISIN: 'US0378331005', Shares: 2, Fees: 1, Taxes: 0 }),
      JSON.stringify({ Date: '2026-08-21T12:00:00', Type: 'Dividend', Value: 4.5, Note: 'ACME dividend', ISIN: 'US0378331005', Shares: null, Fees: null, Taxes: 0.5 }),
    ].join('\n');

    const result = parsePytrJsonLines(input);

    expect(result.skipped).toBe(0);
    expect(result.cashRecords).toEqual([]);
    expect(result.records).toEqual([
      expect.objectContaining({ type: 'Buy', totalAmount: 101, shares: 2, pricePerShare: 50, fee: 1 }),
      expect.objectContaining({ type: 'Dividend', totalAmount: 4.5, tax: 0.5, pricePerShare: 0 }),
    ]);
  });

  it('keeps supported cash movements and skips malformed transactions', () => {
    const input = [
      JSON.stringify({ Date: '2026-08-20', Type: 'Deposit', Value: 100 }),
      '{broken',
      JSON.stringify({ Date: '2026-08-20', Type: 'Buy', Value: -10, Shares: 1 }),
    ].join('\n');

    expect(parsePytrJsonLines(input)).toEqual({ records: [], cashRecords: [{ date: '2026-08-20', type: 'Deposit', amount: 100 }], skipped: 2 });
  });

  it('recognizes credits, interest and tax refunds without an ISIN', () => {
    const input = [
      { Date: '2026-08-17', Type: 'Deposit', Value: 0.87 },
      { Date: '2026-10-01', Type: 'Interest', Value: 0.03 },
      { Date: '2025-10-30', Type: 'Tax Refund', Value: 13.68 },
      { Date: '2026-03-09', Type: 'Taxes', Value: 0 },
    ].map(row => JSON.stringify(row)).join('\n');

    expect(parsePytrJsonLines(input)).toEqual({
      records: [],
      cashRecords: [
        { date: '2026-08-17', type: 'Deposit', amount: 0.87 },
        { date: '2026-10-01', type: 'Interest', amount: 0.03 },
        { date: '2025-10-30', type: 'Tax Refund', amount: 13.68 },
      ],
      skipped: 1,
    });
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
  it('preserves the exact broker price timestamp and exchange without using the sync date', () => {
    const input = 'Name;ISIN;quantity;price;avgCost;netValue;quoteAsOf;exchange\nUS Treasury;US912810SQ22;180;0.5784;0.5595;104.11;2026-10-02T17:00:11+02:00;LSX';
    expect(parsePytrPortfolioCsv(input)[0]).toMatchObject({ quoteAsOf: '2026-10-02T15:00:11.000Z', exchange: 'LSX' });
  });

  it.each(['', 'not-a-date', '2026-10-02', '2099-01-01T00:00:00Z'])('does not invent or accept an invalid price time (%s)', timestamp => {
    const input = 'Name;ISIN;quantity;price;avgCost;netValue;quoteAsOf\nApollo;LU3170240538;0.1;109.395;100;10.94;' + timestamp;
    expect(parsePytrPortfolioCsv(input)[0].quoteAsOf).toBeUndefined();
  });
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

  it('keeps dot-separated values with three decimal places as decimals', () => {
    const input = [
      'Name;ISIN;quantity;price;avgCost;netValue',
      'Lufthansa;DE0008232125;4.844961;7.752;10.5202;37.56',
      'US Treasury;US912810SQ22;180;0.602;0.5595;108.36',
      'Arbor Metals;CA03880B1040;21.645021;0.048;2.3562;1.04',
    ].join('\n');

    expect(parsePytrPortfolioCsv(input)).toEqual([
      { name: 'Lufthansa', isin: 'DE0008232125', quantity: 4.844961, price: 7.752, averageBuyIn: 10.5202, netValue: 37.56 },
      { name: 'US Treasury', isin: 'US912810SQ22', quantity: 180, price: 0.602, averageBuyIn: 0.5595, netValue: 108.36 },
      { name: 'Arbor Metals', isin: 'CA03880B1040', quantity: 21.645021, price: 0.048, averageBuyIn: 2.3562, netValue: 1.04 },
    ]);
  });

  it('repairs prices and average buy-ins from caches written by the old parser', () => {
    expect(normalizeLegacyTradeRepublicQuote({
      name: 'Lufthansa', isin: 'DE0008232125', quantity: 4.844961,
      price: 7752, averageBuyIn: 10.5202, netValue: 37.56,
    })).toEqual(expect.objectContaining({ price: 7.752, averageBuyIn: 10.5202 }));

    expect(normalizeLegacyTradeRepublicQuote({
      name: 'Münchener Rück', isin: 'DE0008430026', quantity: 0.173671,
      price: 505.6, averageBuyIn: 581558, netValue: 87.81,
    })).toEqual(expect.objectContaining({ price: 505.6, averageBuyIn: 581.558 }));
  });

  it('ignores malformed portfolio output and positions without a price', () => {
    expect(parsePytrPortfolioCsv('unexpected;columns\nvalue;row')).toEqual([]);
    expect(parsePytrPortfolioCsv('Name;ISIN;quantity;price;avgCost;netValue\nBitcoin;BTC;0.1;0;50;0')).toEqual([]);
  });
});
