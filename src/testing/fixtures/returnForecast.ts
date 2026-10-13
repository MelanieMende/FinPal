import type { ReturnForecast } from '../../app/utils/portfolioForecastOptimization';

/** Synthetic values for numerical tests, never a market forecast. */
export function returnForecastFixture(key = '1', overrides: Partial<ReturnForecast> = {}): ReturnForecast {
  const now = Date.now();
  return { key, publisher: 'Synthetic test publisher', publishedAt: new Date(now - 86400000).toISOString(),
    targetDate: new Date(now + 365 * 86400000).toISOString(), horizonMonths: 12,
    targetPrice: 60, currency: 'EUR', referencePrice: 50, referencePriceAsOf: new Date(now).toISOString(),
    annualVolatilityPercent: 50, volatilityAsOf: new Date(now - 86400000).toISOString(), volatilityLookbackDays: 365,
    assumptions: 'Synthetic 12-month price expectation and historical annualized volatility.',
    forecastSources: [{ title: 'Synthetic source', url: 'https://example.com/report' }],
    volatilitySources: [{ title: 'Synthetic source', url: 'https://example.com/report' }], ...overrides };
}

export function returnForecastInputFixture(key = '1', overrides: Partial<ReturnForecast> = {}) {
  const { forecastSources: _forecastSources, volatilitySources: _volatilitySources, ...values } = returnForecastFixture(key, overrides);
  return { ...values, forecastSourceIndexes: [0], volatilitySourceIndexes: [0] };
}
