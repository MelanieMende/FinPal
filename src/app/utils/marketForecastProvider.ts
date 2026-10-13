import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisPosition } from './portfolioAnalysis';
import type { ReturnForecast } from './portfolioForecastOptimization';

type YahooSummary = {
  financialData?: { targetMeanPrice?: number; currentPrice?: number; numberOfAnalystOpinions?: number };
  price?: { currency?: string; regularMarketPrice?: number; regularMarketTime?: Date | string | number };
};
type YahooHistoryRow = { date: Date | string | number; close: number; adjClose?: number };
type YahooChartResult = {
  quotes: Array<{ date: Date | string | number; close: number | null; adjclose?: number | null }>;
  meta?: { currentTradingPeriod?: { regular?: { start?: Date | string | number; end?: Date | string | number } } };
};
export interface YahooForecastClient {
  quoteSummary(symbol: string, options: { modules: ('financialData' | 'price')[] }): Promise<YahooSummary>;
  chart(symbol: string, options: { period1: Date; period2: Date; interval: '1d'; events: 'history'; return: 'array' }): Promise<YahooChartResult>;
}
export interface MarketForecastOptions { forceRefresh?: boolean }
export type MarketForecastProvider = (position: AnalysisPosition, options?: MarketForecastOptions) => Promise<ReturnForecast | null>;

type ConsensusCache = { targetPrice: number; analystCount: number; referencePrice: number; currency: string; referenceTime: number; fetchedAt: number; targetDate: string };
type VolatilityCache = NonNullable<ReturnType<typeof annualizedHistoricalVolatility>> & { fetchedAt: number; refreshAfter: number };
type CacheEntry = { consensus?: ConsensusCache; volatility?: VolatilityCache };
type ProviderConfig = { cacheFile?: string; now?: () => number };

const day = 86400000;
export const MARKET_FORECAST_CONSENSUS_TTL_MS = day;
export const MARKET_FORECAST_FALLBACK_MAX_AGE_MS = 7 * day;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const instant = (value: Date | string | number | undefined) => {
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value < 1e12 ? value * 1000 : value : Date.parse(value ?? '');
  return Number.isFinite(time) ? time : NaN;
};
const validConsensus = (value: ConsensusCache | undefined, now: number) => !!value && positive(value.targetPrice) && positive(value.analystCount)
  && positive(value.referencePrice) && /^[A-Z]{3}$/.test(value.currency) && Number.isFinite(value.referenceTime) && value.referenceTime <= now
  && Number.isFinite(value.fetchedAt) && value.fetchedAt <= now && now - value.fetchedAt <= MARKET_FORECAST_FALLBACK_MAX_AGE_MS
  && Number.isFinite(Date.parse(value.targetDate));
const validVolatility = (value: VolatilityCache | undefined, now: number) => !!value && positive(value.annualVolatilityPercent)
  && Number.isInteger(value.volatilityLookbackDays) && value.volatilityLookbackDays >= 180 && Number.isFinite(Date.parse(value.volatilityAsOf))
  && Number.isFinite(value.fetchedAt) && value.fetchedAt <= now && now - value.fetchedAt <= MARKET_FORECAST_FALLBACK_MAX_AGE_MS
  && Number.isFinite(value.refreshAfter);

class MarketForecastCache {
  private readonly entries = new Map<string, CacheEntry>();
  constructor(private readonly file?: string) {
    if (!file) return;
    try {
      if (fs.statSync(file).size > 5_000_000) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.entries)) return;
      for (const item of saved.entries.slice(-200)) {
        if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !item[1] || typeof item[1] !== 'object') continue;
        this.entries.set(item[0], item[1]);
      }
    } catch { /* Missing or damaged cache must not prevent analysis. */ }
  }
  get(symbol: string): CacheEntry { return this.entries.get(symbol) ?? {}; }
  set(symbol: string, value: CacheEntry): void {
    this.entries.delete(symbol);
    if (this.entries.size >= 200) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(symbol, value);
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries: [...this.entries] }), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}

export function annualizedHistoricalVolatility(rows: YahooHistoryRow[]) {
  const prices = rows.map(row => ({ time: instant(row.date), price: positive(row.adjClose) ? row.adjClose : row.close }))
    .filter(row => Number.isFinite(row.time) && positive(row.price)).sort((a, b) => a.time - b.time).slice(-253);
  if (prices.length < 181) return null;
  const returns = prices.slice(1).map((row, index) => Math.log(row.price / prices[index].price));
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const annualVolatilityPercent = Math.sqrt(variance) * Math.sqrt(252) * 100;
  const lastPrice = prices[prices.length - 1];
  const volatilityLookbackDays = Math.floor((lastPrice.time - prices[0].time) / day);
  if (!positive(annualVolatilityPercent) || volatilityLookbackDays < 180) return null;
  return { annualVolatilityPercent, volatilityAsOf: new Date(lastPrice.time).toISOString(), volatilityLookbackDays,
    observations: prices.length, returnObservations: returns.length };
}

function nextPotentialMarketClose(now: number, regularEnd: number): number {
  let next = Number.isFinite(regularEnd) ? regularEnd + 30 * 60000 : now + 12 * 60 * 60000;
  if (next > now) return next;
  do {
    next += day;
    const weekday = new Date(next).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return next;
  } while (true);
}

/** Builds a complete forecast and persistently reuses consensus and volatility until their respective refresh times. */
export function createYahooMarketForecastProvider(client: YahooForecastClient, config: ProviderConfig | (() => number) = {}): MarketForecastProvider {
  const now = typeof config === 'function' ? config : config.now ?? Date.now;
  const cache = new MarketForecastCache(typeof config === 'function' ? undefined : config.cacheFile);
  return async (position, options = {}) => {
    const symbol = position.symbol.trim().toUpperCase();
    if (position.type !== 'Stock' || !symbol) return null;
    const fetchedAt = now();
    const cached = cache.get(symbol);
    let consensus = validConsensus(cached.consensus, fetchedAt) ? cached.consensus : undefined;
    let volatility = validVolatility(cached.volatility, fetchedAt) ? cached.volatility : undefined;
    let refreshed = false;
    let fallback = false;

    const consensusDue = options.forceRefresh || !consensus || fetchedAt - consensus.fetchedAt >= MARKET_FORECAST_CONSENSUS_TTL_MS;
    if (consensusDue) {
      try {
        const summary = await client.quoteSummary(symbol, { modules: ['financialData', 'price'] });
        const targetPrice = summary.financialData?.targetMeanPrice;
        const analystCount = summary.financialData?.numberOfAnalystOpinions;
        const referencePrice = summary.financialData?.currentPrice ?? summary.price?.regularMarketPrice;
        const currency = summary.price?.currency;
        const referenceTime = instant(summary.price?.regularMarketTime);
        if (!positive(targetPrice) || !positive(analystCount) || !positive(referencePrice) || !currency || !/^[A-Z]{3}$/.test(currency)
          || !Number.isFinite(referenceTime) || referenceTime > fetchedAt || fetchedAt - referenceTime > 7 * day) throw new Error('Incomplete consensus');
        consensus = { targetPrice, analystCount, referencePrice, currency, referenceTime, fetchedAt,
          targetDate: new Date(fetchedAt + 365 * day).toISOString() };
        refreshed = true;
      } catch { fallback = true; }
    }

    const volatilityDue = options.forceRefresh || !volatility || fetchedAt >= volatility.refreshAfter;
    if (volatilityDue) {
      try {
        const chart = await client.chart(symbol, { period1: new Date(fetchedAt - 400 * day), period2: new Date(fetchedAt), interval: '1d', events: 'history', return: 'array' });
        const regularStart = instant(chart.meta?.currentTradingPeriod?.regular?.start);
        const regularEnd = instant(chart.meta?.currentTradingPeriod?.regular?.end);
        const completedQuotes = Number.isFinite(regularStart) && Number.isFinite(regularEnd) && fetchedAt < regularEnd
          ? chart.quotes.filter(quote => instant(quote.date) < regularStart) : chart.quotes;
        const calculated = annualizedHistoricalVolatility(completedQuotes.map(quote => ({
          date: quote.date, close: quote.close ?? NaN, adjClose: quote.adjclose ?? undefined,
        })));
        if (!calculated) throw new Error('Incomplete price history');
        volatility = { ...calculated, fetchedAt, refreshAfter: nextPotentialMarketClose(fetchedAt, regularEnd) };
        refreshed = true;
      } catch { fallback = true; }
    }

    if (!validConsensus(consensus, fetchedAt) || !validVolatility(volatility, fetchedAt)) return null;
    if (refreshed) {
      try { cache.set(symbol, { consensus, volatility }); }
      catch { /* A cache write failure must not discard valid data fetched for this analysis. */ }
    }
    const ageHours = Math.max(fetchedAt - consensus.fetchedAt, fetchedAt - volatility.fetchedAt) / 3600000;
    const dataStatus: NonNullable<ReturnForecast['dataStatus']> = fallback ? 'stale-fallback' : refreshed ? 'live' : 'fresh-cache';
    const encoded = encodeURIComponent(symbol);
    const statusText = dataStatus === 'stale-fallback'
      ? `Yahoo Finance was unavailable or incomplete; the last valid cached data is being used (${ageHours.toFixed(1)} hours old).`
      : dataStatus === 'fresh-cache' ? `Reused valid local cache (${ageHours.toFixed(1)} hours old).` : 'Market data refreshed from Yahoo Finance.';
    return {
      key: String(position.id), publisher: 'Yahoo Finance analyst consensus', publishedAt: new Date(consensus.fetchedAt).toISOString(),
      targetDate: consensus.targetDate, horizonMonths: 12, targetPrice: consensus.targetPrice, currency: consensus.currency,
      referencePrice: consensus.referencePrice, referencePriceAsOf: new Date(consensus.referenceTime).toISOString(),
      annualVolatilityPercent: volatility.annualVolatilityPercent, volatilityAsOf: volatility.volatilityAsOf,
      volatilityLookbackDays: volatility.volatilityLookbackDays, dataStatus, dataAgeHours: ageHours,
      assumptions: `Yahoo Finance targetMeanPrice consensus snapshot from ${consensus.analystCount} analyst opinions. Historical volatility calculated locally from ${volatility.returnObservations} daily logarithmic returns of adjusted closing prices and annualized with sqrt(252); observation window ${volatility.volatilityLookbackDays} calendar days. ${statusText}`,
      forecastSources: [{ title: `Yahoo Finance analyst consensus for ${symbol}`, url: `https://finance.yahoo.com/quote/${encoded}/analysis/` }],
      volatilitySources: [{ title: `Yahoo Finance adjusted price history for ${symbol}`, url: `https://finance.yahoo.com/quote/${encoded}/history/` }],
    };
  };
}
