export interface QuoteMetadata {
  originalPrice: number;
  unitFactor?: number;
  exchange?: string;
  tradedInPercent?: boolean;
  bondUnits?: { brokerQuantity: number; recordedQuantity: number; source: 'trade-republic'; fetchedAt: string };
  originalCurrency: string;
  valuationCurrency: 'EUR' | 'unknown';
  source: string;
  quoteAsOf: string | null;
  fetchedAt: string;
  convertedAt: string | null;
  fxRateToEUR: number | null;
  fxSource: string | null;
  fxAsOf: string | null;
  fxFetchedAt: string | null;
  error?: string;
}

export interface EuroExchangeRates {
  rates: Record<string, number>;
  source: string;
  asOf: string;
  fetchedAt: string;
}

// Cache the price together with its provenance, never metadata on its own.
function cacheKey(asset: Asset): string {
  return 'finpal.quote.v1.' + JSON.stringify([asset.ID, asset.isin, asset.symbol, asset.name, asset.current_shares]);
}

export function saveQuote(asset: Asset, price: number | null, quote: QuoteMetadata): void {
  try { localStorage.setItem(cacheKey(asset), JSON.stringify({ price, quote })); }
  catch { /* A full browser cache must not prevent a price update. */ }
}

export function clearCachedQuote(asset: Asset): void {
  try { localStorage.removeItem(cacheKey(asset)); }
  catch { /* Continue updating the visible state if storage is unavailable. */ }
}

export function restoreQuote(asset: Asset): void {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey(asset)) || 'null');
    if (cached && (cached.price === null || (Number.isFinite(cached.price) && cached.price > 0))
      && validQuote(cached.quote)) {
      asset.price = cached.price ?? undefined;
      asset.quote = cached.quote;
    }
  } catch { /* Ignore malformed or unavailable caches. */ }
}

export function quoteTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = new Date(typeof value === 'number' ? value * 1000 : value as string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function validQuote(quote: QuoteMetadata): boolean {
  return !!quote && Number.isFinite(quote.originalPrice) && quote.originalPrice > 0
    && typeof quote.originalCurrency === 'string' && /^(?:[A-Z]{3}|GBp|GBX|ZAc|ILA|unknown)$/.test(quote.originalCurrency)
    && ['EUR', 'unknown'].includes(quote.valuationCurrency)
    && typeof quote.source === 'string' && quote.source.length <= 100
    && (quote.error === undefined || (typeof quote.error === 'string' && quote.error.length <= 500))
    && (quote.unitFactor === undefined || (Number.isFinite(quote.unitFactor) && quote.unitFactor > 0))
    && (quote.exchange === undefined || (typeof quote.exchange === 'string' && quote.exchange.length <= 100))
    && (quote.tradedInPercent === undefined || typeof quote.tradedInPercent === 'boolean')
    && (quote.bondUnits === undefined || (!!quote.bondUnits
      && Number.isFinite(quote.bondUnits.brokerQuantity) && quote.bondUnits.brokerQuantity > 0
      && Number.isFinite(quote.bondUnits.recordedQuantity) && quote.bondUnits.recordedQuantity > 0
      && quote.bondUnits.source === 'trade-republic'
      && typeof quote.bondUnits.fetchedAt === 'string' && Number.isFinite(Date.parse(quote.bondUnits.fetchedAt))))
    && [quote.fetchedAt, quote.quoteAsOf, quote.convertedAt, quote.fxAsOf, quote.fxFetchedAt]
      .every(t => t === null || (typeof t === 'string' && Number.isFinite(Date.parse(t))))
    && typeof quote.fetchedAt === 'string'
    && (quote.fxSource === null || (typeof quote.fxSource === 'string' && quote.fxSource.length <= 100))
    && (quote.fxRateToEUR === null || (Number.isFinite(quote.fxRateToEUR) && quote.fxRateToEUR > 0))
    && (quote.valuationCurrency !== 'EUR' || (quote.fxRateToEUR > 0
      && (quote.originalCurrency === 'EUR' || (!!quote.fxSource && !!quote.fxAsOf && !!quote.fxFetchedAt && !!quote.convertedAt))));
}
