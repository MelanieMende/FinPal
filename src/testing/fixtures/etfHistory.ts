import { etfHistoricalForecast } from '../../app/utils/etfHistoricalForecast';
import type { ReturnForecast } from '../../app/utils/portfolioForecastOptimization';
import { returnForecastFixture } from './returnForecast';

/** Synthetic weekday data, never a real security return series. */
export function etfHistoryFixture(now = Date.now()) {
  const end = new Date(now); end.setUTCHours(0, 0, 0, 0); end.setUTCDate(end.getUTCDate() - 1);
  const rows: Array<{ date: Date; close: number; adjclose: number }> = [];
  for (let back = 6 * 366; back >= 0; back--) {
    const date = new Date(end.getTime() - back * 86400000);
    if (![0, 6].includes(date.getUTCDay())) {
      const index = rows.length, price = 50 * Math.exp(index * .0002 + Math.sin(index / 17) * .025 + Math.sin(index / 3) * .003);
      rows.push({ date, close: price, adjclose: price });
    }
  }
  return rows;
}

export function etfReturnForecastFixture(key = '1'): ReturnForecast {
  const rows = etfHistoryFixture(), model = etfHistoricalForecast(rows)!;
  const base = returnForecastFixture(key);
  return { ...base, targetPrice: model.targetPrice, referencePrice: model.referencePrice, referencePriceAsOf: new Date(model.referenceTime).toISOString(),
    annualVolatilityPercent: model.annualVolatilityPercent, volatilityAsOf: model.volatilityAsOf, volatilityLookbackDays: model.volatilityLookbackDays,
    scenarioReturns: model.scenarioReturns, uncertainty: { method: 'historical-bootstrap', historyYears: model.historyYears },
    model: { kind: 'etf-history-v1', observations: model.observations, historyYears: model.historyYears, paths: 2000, tradingDaysPerYear: 252, blockLength: 20, returnBasis: 'adjusted-close' },
    publisher: 'Synthetic ETF history model', riskHistory: { currency: 'EUR', sources: base.volatilitySources,
      closes: rows.slice(-366).map(row => ({ date: row.date.toISOString().slice(0, 10), price: row.adjclose })) } };
}
