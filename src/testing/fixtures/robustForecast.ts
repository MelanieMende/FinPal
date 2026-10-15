import type { ReturnForecast } from '../../app/utils/portfolioForecastOptimization';
import { returnForecastFixture } from './returnForecast';

/** Synthetic EUR series; no real portfolio or broker data. */
export function robustReturnForecastFixture(key = '1', overrides: Partial<ReturnForecast> = {}): ReturnForecast {
  const base = returnForecastFixture(key, overrides);
  const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86400000;
  return { ...base,
    uncertainty: { method: 'analyst-consensus', analystCount: 20, targetLowPrice: base.targetPrice * .9, targetHighPrice: base.targetPrice * 1.1 },
    riskHistory: { currency: 'EUR', sources: base.volatilitySources,
      closes: Array.from({ length: 366 }, (_, i) => ({ date: new Date(end - (365 - i) * 86400000).toISOString().slice(0, 10), price: 50 * Math.exp(.0002 * i + .02 * Math.sin(i * .7)) })) },
    ...overrides,
  };
}
