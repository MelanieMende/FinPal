import { isEltif } from './eltifValuation';
import type { AnalysisPosition } from './portfolioAnalysis';

const MAX_AGE_MS = 48 * 60 * 60 * 1000;
const usExchanges = new Set(['NYQ', 'NMS', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'XNYS', 'XNAS', 'NYSE', 'NASDAQ', 'NASDAQGS', 'NASDAQGM', 'NASDAQCM', 'NYSEARCA', 'NYSEAMERICAN']);
const newYorkClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function marketDate(timestamp: number) {
  const parts = Object.fromEntries(newYorkClock.formatToParts(timestamp).map(p => [p.type, p.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return { day, weekday: new Date(day).getUTCDay(), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export interface QuoteFreshness {
  assetId: number;
  status: 'recent' | 'market-closed' | 'stale' | 'unknown' | 'nav-unverified';
  brokerTickStatus?: 'recent' | 'old' | 'unknown';
  brokerTickAgeHours?: number;
  quoteAsOf: string | null;
  fetchedAt: string | null;
  marketBasis?: 'exchange' | 'inferred';
}

export function assessQuoteFreshness(position: AnalysisPosition, now = Date.now()): QuoteFreshness {
  const quote = position.quote;
  const result: QuoteFreshness = { assetId: position.id, status: 'unknown', quoteAsOf: quote?.quoteAsOf ?? null, fetchedAt: quote?.fetchedAt ?? null };
  const timestamp = Date.parse(result.quoteAsOf ?? '');
  if (isEltif(position)) {
    const valid = Number.isFinite(timestamp) && timestamp <= now;
    return { ...result, status: 'nav-unverified', brokerTickStatus: valid ? now - timestamp > MAX_AGE_MS ? 'old' : 'recent' : 'unknown',
      ...(valid ? { brokerTickAgeHours: Math.floor((now - timestamp) / 3600000) } : {}),
    };
  }
  if (!Number.isFinite(timestamp) || timestamp > now) return result;
  const exchange = quote?.exchange?.replace(/[\s-]/g, '').toUpperCase();
  const isEquity = ['Stock', 'ETF', 'Fund'].includes(position.type);
  const knownUSMarket = isEquity && exchange && usExchanges.has(exchange);
  // Legacy Yahoo snapshots lack exchange metadata. This narrowly identifies regular
  // US closing quotes; neither ISIN country nor currency alone establishes a market.
  const inferredUSMarket = isEquity && !exchange && quote?.source === 'yahoo-finance'
    && quote.originalCurrency === 'USD' && /^[A-Z][A-Z0-9-]*$/.test(position.symbol);
  if (knownUSMarket || inferredUSMarket) {
    const current = marketDate(now);
    const last = marketDate(timestamp);
    const beforeOpen = current.minute < 9 * 60 + 30;
    const weekend = current.weekday === 0 || current.weekday === 6;
    if (weekend || beforeOpen) {
      let expectedDay = current.day - 86400000;
      while ([0, 6].includes(new Date(expectedDay).getUTCDay())) expectedDay -= 86400000;
      // No holiday-calendar assumption: only excuse the immediately preceding
      // weekday's closing quote. Older quotes keep their stale-data warning.
      if (last.day === expectedDay && last.minute >= 16 * 60 && last.minute <= 16 * 60 + 5) {
        return { ...result, status: 'market-closed', marketBasis: knownUSMarket ? 'exchange' : 'inferred' };
      }
    }
  }
  return { ...result, status: now - timestamp > MAX_AGE_MS ? 'stale' : 'recent' };
}

export function quoteFreshnessWarnings(freshness: QuoteFreshness[]): string[] {
  const warnings: string[] = [];
  const stale = freshness.filter(q => q.status === 'stale');
  if (stale.length) warnings.push('Assets ' + stale.map(q => q.assetId).join(', ') + ': Börsenkurs älter als 48 Stunden; keine bestätigte Erklärung durch eine reguläre Handelspause.');
  const closed = freshness.filter(q => q.status === 'market-closed');
  if (closed.length) warnings.push('Assets ' + closed.map(q => q.assetId).join(', ') + ': Letzter Schlusskurs – regulärer US-Markt noch geschlossen. Der ältere Kurs ist durch die Handelspause erklärbar.'
    + (closed.some(q => q.marketBasis === 'inferred') ? ' Bei Kursen ohne Handelsplatzangabe ist die Zuordnung zum US-Regelhandel aus Quelle, Ticker und Kurszeit abgeleitet.' : ''));
  return warnings;
}
