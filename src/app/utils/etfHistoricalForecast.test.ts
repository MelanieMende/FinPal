import { etfHistoricalForecast } from './etfHistoricalForecast';
import { etfHistoryFixture } from '../../testing/fixtures/etfHistory';

it('uses trading-day history and produces reproducible 12-month scenarios with one common shrinkage', () => {
  const rows = etfHistoryFixture();
  const f = etfHistoricalForecast(rows)!;
  expect(f).not.toBeNull();
  expect(f).toEqual(etfHistoricalForecast([...rows].reverse()));
  expect(f.historyYears).toBeGreaterThan(5);
  expect(f.observations).toBe(rows.length);
  expect(f.scenarioReturns.p10).toBeLessThan(f.scenarioReturns.median);
  expect(f.scenarioReturns.median).toBeLessThan(f.scenarioReturns.p90);
  expect(f.targetPrice / f.referencePrice - 1).toBeCloseTo(f.scenarioReturns.median * .25 / 100);
  expect(f.volatilityLookbackDays).toBeGreaterThan(330);
  expect(f.volatilityLookbackDays).toBeLessThan(370);
});

it('requires five years of adjusted trading-day prices and rejects gaps, missing adjustments and conflicting duplicates', () => {
  const rows = etfHistoryFixture();
  expect(etfHistoricalForecast(rows.slice(-1260))).toBeNull();
  expect(etfHistoricalForecast(rows.filter((_, i) => i < 300 || i > 330))).toBeNull();
  expect(etfHistoricalForecast(rows.map((row, i) => i === 30 ? { ...row, adjclose: null } : row))).toBeNull();
  expect(etfHistoricalForecast([...rows, { ...rows[20], adjclose: 1 }])).toBeNull();
  expect(etfHistoricalForecast(rows.map(row => ({ ...row, adjclose: 10 })))).toBeNull();
  expect(etfHistoricalForecast([...rows, { date: new Date(rows[0].date.getTime() - 86400000), close: null, adjclose: null }])).toEqual(etfHistoricalForecast(rows));
});

it('uses adjusted returns instead of interpreting a split as a crash, while retaining an actual reference close', () => {
  const rows = etfHistoryFixture();
  const split = rows.map((row, i) => ({ ...row, close: row.close * (i < 500 ? 2 : 1) }));
  const f = etfHistoricalForecast(split)!;
  const base = etfHistoricalForecast(rows)!;
  expect(f.scenarioReturns).toEqual(base.scenarioReturns);
  expect(f.annualVolatilityPercent).toBe(base.annualVolatilityPercent);
  expect(f.referencePrice).toBe(split[split.length - 1].close);
});
