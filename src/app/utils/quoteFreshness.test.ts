import { assessQuoteFreshness, quoteFreshnessWarnings } from './quoteFreshness';
import { buildAnalysisPositions } from './portfolioAnalysis';
import type { QuoteMetadata } from './quoteMetadata';

const position = buildAnalysisPositions([{ ID: 6, name: 'Mondelez', symbol: 'MDLZ', type: 'Stock', current_shares: 1, price: 50, currencySymbol: '€' }] as Asset[])[0];
const quote: QuoteMetadata = {
  originalPrice: 58.19, originalCurrency: 'USD', valuationCurrency: 'EUR' as const,
  source: 'yahoo-finance', quoteAsOf: '2026-10-02T20:00:01.000Z', fetchedAt: '2026-10-05T08:42:05.980Z',
  convertedAt: null, fxRateToEUR: 0.89, fxSource: 'FX', fxAsOf: '2026-10-05T00:00:00Z', fxFetchedAt: '2026-10-05T08:42:00Z',
};

it.each(['2026-10-03T12:00:00Z', '2026-10-04T12:00:00Z', '2026-10-05T08:50:03Z', '2026-10-05T13:29:59Z'])(
  'recognizes the Friday closing quote during the weekend or before US opening (%s)', now => {
    const result = assessQuoteFreshness({ ...position, quote }, Date.parse(now));
    expect(result).toMatchObject({ status: 'market-closed', marketBasis: 'inferred' });
    expect(quoteFreshnessWarnings([result]).join(' ')).toContain('Letzter Schlusskurs');
    expect(quoteFreshnessWarnings([result]).join(' ')).not.toContain('älter als 48 Stunden');
  },
);

it('warns again when the next regular trading session has started', () => {
  expect(assessQuoteFreshness({ ...position, quote }, Date.parse('2026-10-05T13:30:00Z')).status).toBe('stale');
});

it('uses New York daylight saving time when Europe and the US change on different dates', () => {
  const previousClose = { ...quote, quoteAsOf: '2026-03-06T21:00:00Z' };
  expect(assessQuoteFreshness({ ...position, quote: previousClose }, Date.parse('2026-03-09T13:29:59Z')).status).toBe('market-closed');
  expect(assessQuoteFreshness({ ...position, quote: previousClose }, Date.parse('2026-03-09T13:30:00Z')).status).toBe('stale');
});

it.each(['NMS', 'NasdaqGS', 'NYSE'])('uses an explicit US exchange independently of trading currency and ticker suffix (%s)', exchange => {
  expect(assessQuoteFreshness({ ...position, symbol: 'ANY.TICKER', quote: { ...quote, originalCurrency: 'EUR', exchange } }, Date.parse('2026-10-05T08:50:03Z')))
    .toMatchObject({ status: 'market-closed', marketBasis: 'exchange' });
});

it('does not excuse older quotes, crypto, other exchanges or unconfirmed markets', () => {
  const now = Date.parse('2026-10-05T08:50:03Z');
  for (const candidate of [
    { ...position, quote: { ...quote, quoteAsOf: '2026-10-01T20:00:00Z' } },
    { ...position, type: 'Crypto' as const, quote },
    { ...position, quote: { ...quote, exchange: 'XETR' } },
    { ...position, symbol: 'MDLZ.SG', quote },
    { ...position, quote: { ...quote, source: 'trade-republic' } },
    { ...position, quote: { ...quote, originalCurrency: 'CAD' } },
    { ...position, quote: { ...quote, quoteAsOf: '2026-10-02T19:00:00Z' } },
  ]) expect(assessQuoteFreshness(candidate, now).status).toBe('stale');
});

it('preserves unknown timestamps and warns about stale prices even after a fresh fetch', () => {
  const now = Date.parse('2026-10-05T14:00:00Z');
  expect(assessQuoteFreshness(position, now).status).toBe('unknown');
  expect(assessQuoteFreshness({ ...position, quote: { ...quote, quoteAsOf: null } }, now).status).toBe('unknown');
  const stale = assessQuoteFreshness({ ...position, quote }, now);
  expect(stale.status).toBe('stale');
  expect(quoteFreshnessWarnings([stale])[0]).toContain('Assets 6: Börsenkurs älter als 48 Stunden');
});


it('separates an old ELTIF broker tick from unknown NAV freshness without suppressing ordinary fund warnings', () => {
  const now = Date.parse('2026-10-08T08:00:00Z');
  const eltif = { ...position, id: 32, type: 'Fund' as const, name: 'Apollo', isin: 'LU3170240538', quote: { ...quote, source: 'trade-republic', quoteAsOf: '2026-09-10T15:21:10Z', fetchedAt: '2026-10-08T07:00:00Z' } };
  const result = assessQuoteFreshness(eltif, now);
  expect(result).toMatchObject({ assetId: 32, status: 'nav-unverified', brokerTickStatus: 'old', quoteAsOf: '2026-09-10T15:21:10Z' });
  expect(result.brokerTickAgeHours).toBeGreaterThan(48);
  expect(quoteFreshnessWarnings([result])).toEqual([]);
  expect(assessQuoteFreshness({ ...eltif, isin: 'OTHER', name: 'Ordinary Fund' }, now).status).toBe('stale');
  expect(assessQuoteFreshness({ ...eltif, quote: { ...eltif.quote, quoteAsOf: null } }, now)).toMatchObject({ status: 'nav-unverified', brokerTickStatus: 'unknown' });
});
