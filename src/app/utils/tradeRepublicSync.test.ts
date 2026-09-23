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
