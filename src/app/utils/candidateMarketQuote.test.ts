/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCandidateMarketQuoteProvider } from './candidateMarketQuote';
import type { NewAssetRecommendation } from './portfolioAnalysis';

const isin = 'IE00BF4RFH31';
const candidate: NewAssetRecommendation = { name: 'iShares MSCI World Small Cap UCITS ETF USD (Acc)', isin, symbol: 'WSML', type: 'ETF', action: 'Prüfen', rationale: 'Test', risk: 'Test', sourceIndexes: [0] };
const time = Date.parse('2026-10-14T12:00:00Z');
const raw = { isin, lastPrice: 9.103, currency: { originalValue: 'EUR' }, timestampLastPrice: '2026-10-14T11:43:18Z', mic: 'XETR', tradedInPercent: false };
const response = (value: unknown) => new Response(JSON.stringify(value));

it('resolves an ISIN to its actual EUR trading venue despite a USD share class and London symbol', async () => {
  const requestFetch = jest.fn().mockResolvedValue(response(raw));
  const quote = await createCandidateMarketQuoteProvider({ requestFetch, now: () => time })(candidate);
  expect(quote).toMatchObject({ isin, price: 9.103, currency: 'EUR', exchange: 'XETR', symbol: 'IUSN.DE', quoteAsOf: raw.timestampLastPrice, kind: 'last-trade' });
  expect(requestFetch.mock.calls[0][0]).toBe('https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=' + isin);
  expect(candidate.symbol).toBe('WSML');
});

it('links QDVE to its confirmed Xetra history series for candidate forecasting', async () => {
  const qdve = { ...candidate, name: 'iShares S&P 500 Information Technology Sector UCITS ETF USD (Acc)',
    isin: 'IE00B3WJKG14', symbol: 'QDVE' };
  const requestFetch = jest.fn().mockResolvedValue(response({ ...raw, isin: qdve.isin, lastPrice: 46.146, mic: 'XETR' }));
  const quote = await createCandidateMarketQuoteProvider({ requestFetch, now: () => time })(qdve);
  expect(quote).toMatchObject({ isin: qdve.isin, price: 46.146, currency: 'EUR', exchange: 'XETR', symbol: 'QDVE.DE' });
});

it('links the MSCI EM IMI candidate to IS3N.DE and refreshes a cached quote that predates the mapping', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-is3n-candidate-'));
  const cacheFile = path.join(dir, 'quotes.json');
  const is3n = { ...candidate, name: 'iShares Core MSCI EM IMI UCITS ETF USD (Acc)', isin: 'IE00BKM4GZ66', symbol: 'IS3N' };
  const oldQuote = { isin: is3n.isin, price: 46.146, currency: 'EUR', exchange: 'XETR', quoteAsOf: raw.timestampLastPrice,
    fetchedAt: new Date(time - 3600000).toISOString(), kind: 'last-trade',
    source: { title: 'Deutsche Börse: EUR-Börsenkurs ' + is3n.isin,
      url: 'https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=' + is3n.isin } };
  fs.writeFileSync(cacheFile, JSON.stringify({ version: 1, quotes: [oldQuote] }));
  const requestFetch = jest.fn().mockResolvedValue(response({ ...raw, isin: is3n.isin, lastPrice: 46.146, mic: 'XETR' }));
  try {
    const quote = await createCandidateMarketQuoteProvider({ cacheFile, requestFetch, now: () => time })(is3n);
    expect(quote).toMatchObject({ isin: is3n.isin, price: 46.146, exchange: 'XETR', symbol: 'IS3N.DE' });
    expect(requestFetch).toHaveBeenCalledTimes(1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it.each([
  { isin: 'IE00B4L5Y983' }, { currency: { originalValue: 'USD' } }, { tradedInPercent: true },
  { lastPrice: 0 }, { timestampLastPrice: undefined }, { timestampLastPrice: '2026-10-15T00:00:00Z' },
  { timestampLastPrice: '2026-10-01T00:00:00Z' }, { mic: undefined },
])('rejects conflicting, stale or incomplete evidence %j', async invalid => {
  const requestFetch = jest.fn().mockResolvedValue(response({ ...raw, ...invalid }));
  await expect(createCandidateMarketQuoteProvider({ requestFetch, now: () => time })(candidate)).resolves.toBeNull();
});

it('reuses successful quotes across restarts for a rolling 24 hours, retaining the market timestamp', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-candidate-quotes-'));
  try {
    let now = time;
    const requestFetch = jest.fn().mockImplementation(async () => response(raw));
    const config = { requestFetch, now: () => now, cacheFile: path.join(dir, 'quotes.json') };
    const first = await createCandidateMarketQuoteProvider(config)(candidate);
    now += 23 * 3600000;
    const restarted = createCandidateMarketQuoteProvider(config);
    expect(await restarted(candidate)).toEqual(first);
    expect(requestFetch).toHaveBeenCalledTimes(1);
    now += 3600000;
    expect((await restarted(candidate))?.fetchedAt).toBe(new Date(now).toISOString());
    expect(requestFetch).toHaveBeenCalledTimes(2);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it('does not cache failures or guess an instrument from a ticker without an ISIN', async () => {
  const requestFetch = jest.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce(response(raw));
  const provider = createCandidateMarketQuoteProvider({ requestFetch, now: () => time });
  expect(await provider({ ...candidate, isin: '' })).toBeNull();
  expect(requestFetch).not.toHaveBeenCalled();
  expect(await provider(candidate)).toBeNull();
  expect(await provider(candidate)).not.toBeNull();
});

it('supports other ISINs and EUR venues without inventing a Yahoo ticker', async () => {
  const requestFetch = jest.fn().mockResolvedValue(response({ ...raw, isin: 'IE00B4L5Y983', mic: 'XFRA' }));
  const quote = await createCandidateMarketQuoteProvider({ requestFetch, now: () => time })({ ...candidate, isin: 'IE00B4L5Y983' });
  expect(quote).toMatchObject({ isin: 'IE00B4L5Y983', exchange: 'XFRA', currency: 'EUR' });
  expect(quote?.symbol).toBeUndefined();
});
