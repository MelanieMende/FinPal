import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { annualizedHistoricalVolatility, createYahooMarketForecastProvider, cryptoHistoricalForecast, type YahooForecastClient } from './marketForecastProvider';
import { validReturnForecast } from './portfolioForecastOptimization';
import type { AnalysisPosition } from './portfolioAnalysis';

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
  expect((await provider(position))?.dataStatus).toBe('fresh-cache');
  expect(client.chart).toHaveBeenCalledTimes(1);
});

it('persists the crypto model and uses it as a bounded stale fallback after a restart', async () => {
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
    const fallback = await restartedProvider(position);
    expect(fallback).toMatchObject({ dataStatus: 'stale-fallback', dataAgeHours: 25,
      scenarioReturns: live?.scenarioReturns });
    expect(fallback?.assumptions).toContain('Letzter gültiger Cache nach Abruffehler');
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

it('rejects incomplete consensus data or too little price history', async () => {
  const client: YahooForecastClient = {
    quoteSummary: jest.fn().mockResolvedValue({ financialData: { targetMeanPrice: 620, currentPrice: 560, numberOfAnalystOpinions: 0 },
      price: { currency: 'EUR', regularMarketTime: new Date(now - day) } }),
    chart: jest.fn().mockResolvedValue({ quotes: history.slice(-100).map(row => ({ ...row, adjclose: row.adjClose })) }),
  };
  expect(await createYahooMarketForecastProvider(client, () => now)({ id: 11, name: 'Munich Re', symbol: 'MUV2.DE', isin: '', type: 'Stock',
    shares: 1, price: 560, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: null })).toBeNull();
});

it('persists fresh forecasts, reuses them within the TTL and marks a stale fallback after provider failure', async () => {
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
    expect((await firstProvider(position))?.dataStatus).toBe('fresh-cache');
    expect(client.quoteSummary).toHaveBeenCalledTimes(1);
    expect(client.chart).toHaveBeenCalledTimes(1);

    clock += 25 * 60 * 60 * 1000;
    const offlineClient: YahooForecastClient = {
      quoteSummary: jest.fn().mockRejectedValue(new Error('offline')),
      chart: jest.fn().mockRejectedValue(new Error('offline')),
    };
    const restartedProvider = createYahooMarketForecastProvider(offlineClient, { cacheFile, now: () => clock });
    const fallback = await restartedProvider(position);
    expect(fallback).toMatchObject({ dataStatus: 'stale-fallback', dataAgeHours: 25, targetPrice: 620 });
    expect(fallback?.assumptions).toContain('last valid cached data');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

it('bypasses a valid cache when a manual refresh is requested', async () => {
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
