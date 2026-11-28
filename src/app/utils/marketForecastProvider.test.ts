import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { annualizedHistoricalVolatility, createYahooMarketForecastProvider, cryptoHistoricalForecast, type YahooForecastClient } from './marketForecastProvider';
import { validReturnForecast } from './portfolioForecastOptimization';
import type { AnalysisPosition } from './portfolioAnalysis';
import { etfHistoryFixture } from '../../testing/fixtures/etfHistory';

it('retrieves ETF scenarios on every request and reports offline failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-etf-model-'));
  let clock = now;
  const client: YahooForecastClient = { quoteSummary: jest.fn(), chart: jest.fn().mockResolvedValue({ quotes: etfHistoryFixture(now), meta: { currency: 'EUR' } }) };
  const position: AnalysisPosition = { id: 19, name: 'ETF USD (Acc)', type: 'ETF', symbol: 'IUSN.DE', isin: 'IE00BF4RFH31', price: 9.1, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const config = { cacheFile: path.join(directory, 'cache.json'), now: () => clock };
  try {
    const provider = createYahooMarketForecastProvider(client, config);
    const first = (await provider(position))!;
    expect(first.model).toMatchObject({ kind: 'etf-history-v1', tradingDaysPerYear: 252, paths: 2000 });
    expect(first.riskHistory!.currency).toBe('EUR');
    expect(validReturnForecast(first, clock)).toBe(true);
    expect(client.quoteSummary).not.toHaveBeenCalled();
    clock += 23 * 3600000;
    expect((await createYahooMarketForecastProvider(client, config)(position))?.dataStatus).toBe('live');
    expect(client.chart).toHaveBeenCalledTimes(2);
    clock += 2 * 3600000;
    jest.mocked(client.chart).mockRejectedValue(new Error('offline'));
    expect(await provider(position)).toBeNull();
    expect(await provider(position, { forceRefresh: true })).toBeNull();
    clock += 8 * day;
    expect(await provider(position)).toBeNull();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('rejects short, stale, unadjusted or currency-mismatched ETF histories instead of inventing inputs', async () => {
  const rows = etfHistoryFixture(now);
  const position: AnalysisPosition = { id: 19, name: 'ETF', type: 'ETF', symbol: 'IUSN.DE', isin: '', price: 9.1, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  for (const chart of [
    { quotes: rows.slice(-900), meta: { currency: 'EUR' } },
    { quotes: rows.map(row => ({ ...row, adjclose: null as number | null })), meta: { currency: 'EUR' } },
    { quotes: rows, meta: { currency: 'USD' } },
    { quotes: rows.filter(row => row.date.getTime() < now - 10 * day), meta: { currency: 'EUR' } },
  ]) {
    const client: YahooForecastClient = { quoteSummary: jest.fn(), chart: jest.fn().mockResolvedValue(chart) };
    expect(await createYahooMarketForecastProvider(client, () => now)(position)).toBeNull();
  }
});

it('requires actual dated FX data for a non-EUR ETF risk series', async () => {
  const rows = etfHistoryFixture(now);
  const client: YahooForecastClient = { quoteSummary: jest.fn(), chart: jest.fn(async symbol => symbol === 'USDEUR=X'
    ? { quotes: rows.slice(-300).map(row => ({ date: row.date, close: .9 })) }
    : { quotes: rows, meta: { currency: 'USD' } }) };
  const position: AnalysisPosition = { id: 1, name: 'ETF', type: 'ETF', symbol: 'TEST.L', isin: '', price: 100, currency: 'USD', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const forecast = (await createYahooMarketForecastProvider(client, () => now)(position))!;
  expect(forecast.currency).toBe('USD');
  expect(forecast.riskHistory!.closes[forecast.riskHistory!.closes.length - 1].price).toBeCloseTo(rows[rows.length - 1].adjclose * .9);
  jest.mocked(client.chart).mockImplementation(async symbol => { if (symbol === 'USDEUR=X') throw new Error('FX missing'); return { quotes: rows, meta: { currency: 'USD' } }; });
  expect(await createYahooMarketForecastProvider(client, () => now)(position)).toBeNull();
});

const day = 86400000;
const now = Date.parse('2026-10-13T12:00:00Z');
const history = Array.from({ length: 253 }, (_, index) => ({
  date: new Date(now - (365 - Math.round(index * 365 / 252)) * day),
  close: 500 * Math.exp(index * 0.0003 + Math.sin(index / 7) * 0.012),
  adjClose: 500 * Math.exp(index * 0.0003 + Math.sin(index / 7) * 0.012),
}));
const cryptoHistory = Array.from({ length: 5 * 365 + 1 }, (_, index) => ({
  date: new Date(now - (5 * 365 - index) * day),
  close: 20000 * Math.exp(index * 0.00025 + Math.sin(index / 19) * 0.035),
  adjClose: 20000 * Math.exp(index * 0.00025 + Math.sin(index / 19) * 0.035),
}));

it('calculates annualized sample volatility from at least 180 daily adjusted closes', () => {
  const result = annualizedHistoricalVolatility(history)!;
  expect(result.returnObservations).toBe(252);
  expect(result.volatilityLookbackDays).toBe(365);
  expect(result.annualVolatilityPercent).toBeGreaterThan(0);
  expect(annualizedHistoricalVolatility(history.slice(-180))).toBeNull();
});

it('builds a deterministic shrunk 12-month crypto forecast and scenario band from at least three years of daily prices', async () => {
  const completedHistory = cryptoHistory.filter(row => row.date.getTime() < Date.UTC(2026, 9, 13));
  const model = cryptoHistoricalForecast(completedHistory)!;
  expect(model.bootstrapPaths).toBe(2000);
  expect(model.volatilityLookbackDays).toBe(365);
  expect(model.scenarioReturns.p10).toBeLessThanOrEqual(model.scenarioReturns.median);
  expect(model.scenarioReturns.median).toBeLessThanOrEqual(model.scenarioReturns.p90);
  expect(model.targetPrice / model.referencePrice - 1).toBeCloseTo(Math.max(-.5, Math.min(1, model.scenarioReturns.median * .25 / 100)), 10);
  expect(cryptoHistoricalForecast(cryptoHistory.slice(-1095))).toBeNull();

  const client: YahooForecastClient = {
    quoteSummary: jest.fn(),
    chart: jest.fn().mockResolvedValue({ quotes: cryptoHistory.map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  const provider = createYahooMarketForecastProvider(client, () => now);
  const position: AnalysisPosition = { id: 31, name: 'Bitcoin', symbol: 'BTC', isin: '', type: 'Crypto',
    shares: .01, price: model.referencePrice, currency: 'EUR', costBasis: 200, dividendsEarned: 0, realizedGainLoss: 0 };
  const forecast = await provider(position);
  expect(client.chart).toHaveBeenCalledWith('BTC-EUR', expect.objectContaining({ interval: '1d' }));
  expect(client.quoteSummary).not.toHaveBeenCalled();
  expect(forecast).toMatchObject({ key: '31', publisher: 'FinPal crypto history model', currency: 'EUR', scenarioReturns: model.scenarioReturns });
  expect(forecast?.assumptions).toContain('75 % gegen 0 % geschrumpft');
  expect(validReturnForecast(forecast! as never, now)).toBe(true);
  expect((await provider(position))?.dataStatus).toBe('live');
  expect(client.chart).toHaveBeenCalledTimes(2);
});

it('does not reuse a crypto forecast when offline', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-crypto-forecast-cache-'));
  const cacheFile = path.join(directory, 'forecast.json');
  let clock = now;
  const client: YahooForecastClient = {
    quoteSummary: jest.fn(),
    chart: jest.fn().mockResolvedValue({ quotes: cryptoHistory.map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  const position: AnalysisPosition = { id: 31, name: 'Bitcoin', symbol: 'BTC', isin: '', type: 'Crypto',
    shares: .01, price: 32000, currency: 'EUR', costBasis: 200, dividendsEarned: 0, realizedGainLoss: 0 };
  try {
    const firstProvider = createYahooMarketForecastProvider(client, { cacheFile, now: () => clock });
    const live = await firstProvider(position);
    expect(live).toMatchObject({ dataStatus: 'live', publisher: 'FinPal crypto history model' });

    clock += 25 * 60 * 60 * 1000;
    const offlineClient: YahooForecastClient = {
      quoteSummary: jest.fn(),
      chart: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const restartedProvider = createYahooMarketForecastProvider(offlineClient, { cacheFile, now: () => clock });
    expect(await restartedProvider(position)).toBeNull();
    expect(await restartedProvider(position, { forceRefresh: true })).toBeNull();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('combines a sourced analyst consensus and calculated volatility into a valid optimizer input', async () => {
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 18 },
      price: { currency: 'EUR', regularMarketPrice: 560, regularMarketTime: new Date(now - day) } }),
    chart: jest.fn().mockResolvedValue({ quotes: history.map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  const provider = createYahooMarketForecastProvider(client, () => now);
  const forecast = await provider({ id: 11, name: 'Munich Re', symbol: 'MUV2.DE', isin: 'DE0008430026', type: 'Stock', shares: 1,
    price: 560, currency: 'EUR', costBasis: 500, dividendsEarned: 0, realizedGainLoss: 0 });
  expect(forecast).toMatchObject({ key: '11', targetPrice: 620, currency: 'EUR', referencePrice: 560, publisher: 'Yahoo Finance analyst consensus' });
  expect(forecast?.assumptions).toContain('252 daily logarithmic returns');
  expect(forecast?.forecastSources[0].url).toContain('MUV2.DE/analysis');
  expect(validReturnForecast(forecast! as never, now)).toBe(true);
});

it('preserves analyst coverage and dispersion and converts historical prices with same-date FX', async () => {
  const quotes = history.map(row => ({ ...row, adjclose: row.adjClose }));
  const fxQuotes = history.map((row, index) => ({ date: row.date, close: .8 + index * .0001 }));
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, targetLowPrice: 500, targetHighPrice: 750, currentPrice: 560, numberOfAnalystOpinions: 7 }, price: { currency: 'USD', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn(async symbol => symbol === 'USDEUR=X' ? { quotes: fxQuotes } : { quotes, meta: { currency: 'USD' } }),
  };
  const position: AnalysisPosition = { id: 1, name: 'Synthetic USD asset', symbol: 'TEST', isin: '', type: 'Stock', shares: 1, price: 500, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const forecast = (await createYahooMarketForecastProvider(client, () => now)(position))!;
  expect(forecast.uncertainty).toEqual({ method: 'analyst-consensus', analystCount: 7, targetLowPrice: 500, targetHighPrice: 750 });
  expect(forecast.riskHistory!.currency).toBe('EUR');
  expect(forecast.riskHistory!.closes[0].price).toBeCloseTo(history[0].adjClose * .8, 10);
  expect(forecast.riskHistory!.sources.some(source => source.url.includes('USDEUR'))).toBe(true);
  expect(validReturnForecast(forecast, now)).toBe(true);
  jest.mocked(client.chart).mockImplementation(async symbol => { if (symbol === 'USDEUR=X') throw new Error('FX unavailable'); return { quotes, meta: { currency: 'USD' } }; });
  const missingFX = (await createYahooMarketForecastProvider(client, () => now)(position))!;
  expect(missingFX.riskHistory).toBeUndefined();
  expect(missingFX.uncertainty!.analystCount).toBe(7);
});

it('provides a short EUR history for any stock using same-day exchange rates', async () => {
  const recent = history.slice(-110);
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 7 },
      price: { currency: 'USD', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn(async symbol => symbol === 'USDEUR=X'
      ? { quotes: recent.map(row => ({ date: row.date, close: .9 })) }
      : { quotes: recent.map(row => ({ ...row, adjclose: row.adjClose })), meta: { currency: 'USD' } }),
  };
  const forecast = await createYahooMarketForecastProvider(client, () => now)({ id: 34, name: 'New company', symbol: 'NEW',
    isin: 'US0000000001', type: 'Stock', shares: 1, price: 560, currency: 'USD', costBasis: null, dividendsEarned: 0, realizedGainLoss: null });
  expect(forecast?.volatilityHistory?.kind).toBe('short-listing');
  expect(forecast?.riskHistory?.closes.length).toBeGreaterThanOrEqual(61);
  expect(validReturnForecast(forecast!, now)).toBe(true);
});

it('rejects incomplete consensus data or too little price history', async () => {
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 0 },
      price: { currency: 'EUR', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn().mockResolvedValue({ quotes: history.slice(-100).map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  expect(await createYahooMarketForecastProvider(client, () => now)({ id: 11, name: 'Munich Re', symbol: 'MUV2.DE', isin: '', type: 'Stock',
    shares: 1, price: 560, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: null })).toBeNull();
});

it('retrieves stock forecasts each time and reports offline failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-forecast-cache-'));
  const cacheFile = path.join(directory, 'forecast.json');
  let clock = now;
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 18 },
      price: { currency: 'EUR', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn().mockResolvedValue({ quotes: history.map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  const position: AnalysisPosition = { id: 11, name: 'Munich Re', symbol: 'MUV2.DE', isin: 'DE0008430026', type: 'Stock',
    shares: 1, price: 560, currency: 'EUR', costBasis: 500, dividendsEarned: 0, realizedGainLoss: 0 };
  try {
    const firstProvider = createYahooMarketForecastProvider(client, { cacheFile, now: () => clock });
    expect((await firstProvider(position))?.dataStatus).toBe('live');
    expect((await firstProvider(position))?.dataStatus).toBe('live');
    expect(client.quoteSummary).toHaveBeenCalledTimes(2);
    expect(client.chart).toHaveBeenCalledTimes(2);

    clock += 25 * 60 * 60 * 1000;
    const offlineClient: YahooForecastClient = {
      quoteSummary: jest.fn().mockRejectedValue(new Error('offline')),
      chart: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const restartedProvider = createYahooMarketForecastProvider(offlineClient, { cacheFile, now: () => clock });
    expect(await restartedProvider(position)).toBeNull();
    expect(await restartedProvider(position, { forceRefresh: true })).toBeNull();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('retrieves fresh stock data when a manual refresh is requested', async () => {
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 18 },
      price: { currency: 'EUR', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn().mockResolvedValue({ quotes: history.map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  const provider = createYahooMarketForecastProvider(client, () => now);
  const position: AnalysisPosition = { id: 11, name: 'Munich Re', symbol: 'MUV2.DE', isin: '', type: 'Stock',
    shares: 1, price: 560, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  await provider(position);
  await provider(position, { forceRefresh: true });
  expect(client.quoteSummary).toHaveBeenCalledTimes(2);
  expect(client.chart).toHaveBeenCalledTimes(2);
});

it('uses an explicitly labelled stock history scenario when analyst targets are missing and prefers a valid consensus', async () => {
  const rows = etfHistoryFixture(now);
  const position: AnalysisPosition = { id: 12, name: 'Stock', type: 'Stock', symbol: 'TEST.DE', isin: '', price: 9, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const client: YahooForecastClient = { quoteSummary: jest.fn().mockResolvedValue({}), chart: jest.fn().mockResolvedValue({ quotes: rows, meta: { currency: 'EUR' } }) };
  const provider = createYahooMarketForecastProvider(client, () => now);
  const forecast = await provider(position);
  expect(forecast?.model?.kind).toBe('stock-history-v1');
  expect(forecast?.uncertainty?.method).toBe('historical-bootstrap');
  expect(validReturnForecast(forecast!, now)).toBe(true);
  jest.mocked(client.quoteSummary).mockResolvedValue({ financialData: { targetMeanPrice: 12, currentPrice: 9, numberOfAnalystOpinions: 2 }, price: { currency: 'EUR', regularMarketTime: new Date(now - day) } });
  expect((await provider(position, { forceRefresh: true }))?.uncertainty?.method).toBe('analyst-consensus');
});

it('does not create a stock scenario from insufficient or unadjusted history', async () => {
  const position: AnalysisPosition = { id: 12, name: 'Stock', type: 'Stock', symbol: 'TEST.DE', isin: '', price: 9, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  for (const quotes of [etfHistoryFixture(now).slice(-40), etfHistoryFixture(now).map(row => ({ ...row, adjclose: null as number | null }))]) {
    const client: YahooForecastClient = { quoteSummary: jest.fn().mockResolvedValue({}), chart: jest.fn().mockResolvedValue({ quotes, meta: { currency: 'EUR' } }) };
    expect(await createYahooMarketForecastProvider(client, () => now)(position)).toBeNull();
  }
});



it('supports a sufficiently long short stock history and marks its increased uncertainty', async () => {
  const position: AnalysisPosition = { id: 12, name: 'Stock', type: 'Stock', symbol: 'TEST.DE', isin: '', price: 9, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const client: YahooForecastClient = { quoteSummary: jest.fn().mockResolvedValue({}), chart: jest.fn().mockResolvedValue({ quotes: etfHistoryFixture(now).slice(-100), meta: { currency: 'EUR' } }) };
  const forecast = await createYahooMarketForecastProvider(client, () => now)(position);
  expect(forecast?.volatilityHistory?.kind).toBe('short-listing');
  expect(validReturnForecast(forecast!, now)).toBe(true);
});


it('does not reuse a previous stock scenario when offline', async () => {
  const position: AnalysisPosition = { id: 12, name: 'Stock', type: 'Stock', symbol: 'TEST.DE', isin: '', price: 9, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const client: YahooForecastClient = { quoteSummary: jest.fn().mockResolvedValue({}), chart: jest.fn().mockResolvedValue({ quotes: etfHistoryFixture(now), meta: { currency: 'EUR' } }) };
  const provider = createYahooMarketForecastProvider(client, () => now);
  expect((await provider(position))?.model?.kind).toBe('stock-history-v1');
  jest.mocked(client.chart).mockRejectedValue(new Error('offline'));
  expect((await provider(position, { forceRefresh: true }))).toBeNull();
  expect(await provider(position)).toBeNull();
});


it('uses an unambiguous ISIN search result for an alternative listing with same-day EUR conversion', async () => {
  const rows = etfHistoryFixture(now);
  const position: AnalysisPosition = { id: 12, name: 'Stock', type: 'Stock', symbol: 'TEST.SG', isin: 'CA03880B1040', price: 9, currency: 'EUR', shares: 1, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
  const search = jest.fn().mockResolvedValue({ quotes: [{ symbol: 'TEST.SG', shortname: 'Example Corp.', quoteType: 'EQUITY' }, { symbol: 'TEST.V', longname: 'Example Corp.', quoteType: 'EQUITY' }] });
  const client: YahooForecastClient = { quoteSummary: jest.fn().mockResolvedValue({}), search, chart: jest.fn(async symbol => symbol === 'TEST.SG'
    ? { quotes: rows.slice(-1), meta: { currency: 'EUR' } }
    : symbol === 'CADEUR=X' ? { quotes: rows.slice(-300).map(row => ({ date: row.date, close: .65 })) }
    : { quotes: rows, meta: { currency: 'CAD' } }) };
  const provider = createYahooMarketForecastProvider(client, () => now);
  const forecast = await provider(position);
  expect(forecast?.model?.kind).toBe('stock-history-v1');
  expect(forecast?.currency).toBe('EUR');
  expect(forecast?.referencePrice).toBeCloseTo(rows[rows.length - 1].close * .65);
  expect(forecast?.forecastSources[0].url).toContain('TEST.V');
  expect(search).toHaveBeenCalledWith(position.isin, expect.anything());
  search.mockResolvedValue({ quotes: [{ symbol: 'TEST.SG', shortname: 'Example Corp.', quoteType: 'EQUITY' }, { symbol: 'OTHER.V', shortname: 'Different Corp.', quoteType: 'EQUITY' }] });
  expect(await provider(position)).toBeNull();
});
