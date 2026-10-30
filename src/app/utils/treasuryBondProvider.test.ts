import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createYahooMarketForecastProvider, type YahooForecastClient } from './marketForecastProvider';
import { validReturnForecast } from './portfolioForecastOptimization';
import type { AnalysisPosition } from './portfolioAnalysis';

const day = 86400000;
const now = Date.parse('2026-10-30T12:00:00Z');
const quoteDate = '2026-10-29T16:00:00Z';
const quote: NonNullable<AnalysisPosition['quote']> = { source: 'boerse-frankfurt', exchange: 'XFRA', originalPrice: 62,
  originalCurrency: 'USD', tradedInPercent: true, valuationCurrency: 'EUR', quoteAsOf: quoteDate,
  fetchedAt: quoteDate, convertedAt: quoteDate, fxRateToEUR: .9, fxSource: 'test', fxAsOf: quoteDate, fxFetchedAt: quoteDate };
const position: AnalysisPosition = { id: 88, name: 'US Treasury 2040', type: 'Bond', isin: 'US912810SQ22', symbol: 'A281P1',
  price: 55.8, currency: 'EUR', shares: 1000, quote, costBasis: 600, dividendsEarned: 0, realizedGainLoss: 0,
  bondHolding: { nominal: 1000, currency: 'USD', purchaseAccruedInterestEUR: 0, source: 'user-confirmed',
    transactions: [{ id: 1, date: '2026-01-01', nominal: 1000, accruedInterestEUR: 0 }] } };
const curve = Array.from({ length: 400 }, (_, index) => {
  const date = new Date(Date.parse('2026-10-29T00:00:00Z') - (399 - index) * day);
  return { date, ten: 4 + .12 * Math.sin(index / 12), twenty: 4.4 + .16 * Math.cos(index / 17),
    fx: .9 + .02 * Math.sin(index / 9) };
}).filter(row => ![0, 6].includes(row.date.getUTCDay()));
const xml = (year: number) => `<feed>${curve.filter(row => row.date.getUTCFullYear() === year).map(row =>
  `<entry><content><m:properties><d:NEW_DATE>${row.date.toISOString()}</d:NEW_DATE><d:BC_10YEAR>${row.ten}</d:BC_10YEAR><d:BC_20YEAR>${row.twenty}</d:BC_20YEAR></m:properties></content></entry>`).join('')}</feed>`;
const requestFetch = jest.fn(async (url: string): Promise<Partial<Response>> => ({ ok: true, url, headers: { get: (): string | null => null } as unknown as Headers,
  text: async () => xml(Number(new URL(url).searchParams.get('field_tdr_date_value'))) })) as unknown as typeof fetch;
const client: YahooForecastClient = { quoteSummary: jest.fn(), chart: jest.fn(async () => ({ quotes: curve.map(row =>
  ({ date: row.date, close: row.fx })) })) };

it('creates and reuses the exact Treasury issue forecast with coupon and EUR risk evidence', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-treasury-'));
  let clock = now;
  try {
    const config = { cacheFile: path.join(directory, 'forecasts.json'), now: () => clock, requestFetch };
    const first = (await createYahooMarketForecastProvider(client, config)(position))!;
    expect(requestFetch).toHaveBeenCalledTimes(2);
    expect(client.chart).toHaveBeenCalledTimes(1);
    expect(first).not.toBeNull();
    expect(first.model).toMatchObject({ kind: 'bond-curve-v1', maturityDate: '2040-08-15', couponPercent: 1.125 });
    expect(first.targetDate).toBe(new Date(Date.parse(quoteDate) + 365 * day).toISOString());
    expect(first.expectedTotalReturnPercent).toEqual(expect.any(Number));
    expect(first.riskHistory?.currency).toBe('EUR');
    expect(validReturnForecast(first, clock)).toBe(true);
    expect(await createYahooMarketForecastProvider(client, config)(position)).toMatchObject({ dataStatus: 'fresh-cache' });
    expect(requestFetch).toHaveBeenCalledTimes(2);
    clock += 25 * 3600000;
    jest.mocked(client.chart).mockRejectedValueOnce(new Error('offline'));
    expect(await createYahooMarketForecastProvider(client, config)(position)).toMatchObject({ dataStatus: 'stale-fallback' });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('rejects unverified denomination, mismatched issue, and non-Frankfurt or stale percent quotes', async () => {
  const provider = createYahooMarketForecastProvider(client, { now: () => now, requestFetch });
  expect(await provider({ ...position, isin: 'US912810OTHER' })).toBeNull();
  expect(await provider({ ...position, bondHolding: undefined })).toBeNull();
  expect(await provider({ ...position, quote: { ...quote, source: 'other' } })).toBeNull();
  expect(await provider({ ...position, quote: { ...quote, quoteAsOf: '2026-10-10T12:00:00Z' } })).toBeNull();
});
