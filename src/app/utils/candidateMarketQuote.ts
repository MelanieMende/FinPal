import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisPosition, AnalysisSource, NewAssetRecommendation } from './portfolioAnalysis';

export interface CandidateMarketQuote {
  isin: string;
  symbol?: string;
  price: number;
  currency: 'EUR';
  exchange: string;
  quoteAsOf: string;
  fetchedAt: string;
  kind: 'last-trade';
  source: AnalysisSource;
}
export type CandidateMarketQuoteProvider = (candidate: NewAssetRecommendation, signal?: AbortSignal) => Promise<CandidateMarketQuote | null>;

/** Only a locally confirmed listing may select the new candidate's historical price series. */
export function candidateForecastPosition(candidate: NewAssetRecommendation, quote: CandidateMarketQuote | null | undefined): AnalysisPosition | null {
  if (candidate.type !== 'ETF' || !validCandidateMarketQuote(quote, candidate.isin.trim().toUpperCase()) || !quote.symbol) return null;
  return { id: 0, name: candidate.name, isin: quote.isin, symbol: quote.symbol, type: 'ETF', shares: 0, price: quote.price,
    currency: quote.currency, costBasis: null, dividendsEarned: 0, realizedGainLoss: null };
}
const day = 86400000;
const endpoint = 'https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=';
// This listing is confirmed by the exchange, not inferred from the share-class currency/name.
const listings: Record<string, { symbol: string; exchange: string }> = {
  IE00BF4RFH31: { symbol: 'IUSN.DE', exchange: 'XETR' },
};

export function validCandidateMarketQuote(value: unknown, isin: string, now = Date.now()): value is CandidateMarketQuote {
  const q = value as CandidateMarketQuote;
  return !!q && q.isin === isin && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)
    && q.currency === 'EUR' && q.kind === 'last-trade'
    && typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0
    && typeof q.exchange === 'string' && /^[A-Z0-9]{4}$/.test(q.exchange)
    && (q.symbol === undefined || q.symbol === listings[isin]?.symbol && q.exchange === listings[isin]?.exchange)
    && Number.isFinite(Date.parse(q.quoteAsOf)) && Date.parse(q.quoteAsOf) <= now
    && now - Date.parse(q.quoteAsOf) <= 7 * day
    && Number.isFinite(Date.parse(q.fetchedAt)) && Date.parse(q.fetchedAt) <= now
    && Date.parse(q.quoteAsOf) <= Date.parse(q.fetchedAt)
    && !!q.source && typeof q.source.title === 'string' && q.source.url === endpoint + isin;
}

/** ISIN lookup validates the actual exchange currency; no guessed ticker or synthetic FX quote. */
export function createCandidateMarketQuoteProvider(config: { cacheFile?: string; requestFetch?: typeof fetch; now?: () => number } = {}): CandidateMarketQuoteProvider {
  const cache = new Map<string, CandidateMarketQuote>();
  const now = config.now ?? Date.now;
  const requestFetch = config.requestFetch ?? fetch;
  if (config.cacheFile) try {
    if (fs.statSync(config.cacheFile).size <= 500_000) {
      const saved = JSON.parse(fs.readFileSync(config.cacheFile, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.quotes)) for (const q of saved.quotes.slice(-200)) {
        if (validCandidateMarketQuote(q, q?.isin, now()) && now() - Date.parse(q.fetchedAt) < day) cache.set(q.isin, q);
      }
    }
  } catch { /* An absent or damaged cache must not block analysis. */ }
  return async (candidate, signal) => {
    const isin = candidate.isin.trim().toUpperCase();
    if (!['Stock', 'ETF', 'Fund', 'Commodity', 'RealEstate'].includes(candidate.type)
      || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) || signal?.aborted) return null;
    const cached = cache.get(isin);
    if (cached && validCandidateMarketQuote(cached, isin, now()) && now() - Date.parse(cached.fetchedAt) < day) return cached;
    try {
      const response = await requestFetch(endpoint + isin, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
      if (!response.ok) return null;
      const raw = await response.json();
      if (raw.isin !== isin || raw.currency?.originalValue !== 'EUR' || raw.tradedInPercent !== false) return null;
      const quote: CandidateMarketQuote = { isin, price: raw.lastPrice, currency: 'EUR', exchange: raw.mic,
        ...(listings[isin]?.exchange === raw.mic ? { symbol: listings[isin].symbol } : {}),
        quoteAsOf: raw.timestampLastPrice, fetchedAt: new Date(now()).toISOString(), kind: 'last-trade',
        source: { title: 'Deutsche Börse: EUR-Börsenkurs ' + isin, url: endpoint + isin } };
      if (!validCandidateMarketQuote(quote, isin, now())) return null;
      cache.delete(isin);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(isin, quote);
      if (config.cacheFile) try {
        fs.mkdirSync(path.dirname(config.cacheFile), { recursive: true });
        const temporary = config.cacheFile + '.tmp';
        fs.writeFileSync(temporary, JSON.stringify({ version: 1, quotes: [...cache.values()] }), { mode: 0o600 });
        fs.renameSync(temporary, config.cacheFile);
      } catch { /* A valid current quote remains usable if cache persistence fails. */ }
      return quote;
    } catch { return null; }
  };
}
