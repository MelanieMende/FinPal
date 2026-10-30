import { treasuryBondScenario, type TreasuryCurveDay } from './treasuryBondForecast';

const day = 86400000;
const asOf = '2026-10-29';
const end = Date.parse(`${asOf}T00:00:00Z`);
const rows: TreasuryCurveDay[] = Array.from({ length: 390 }, (_, index) => {
  const date = new Date(end - (389 - index) * day).toISOString().slice(0, 10);
  return { date, tenYear: 4 + .2 * Math.sin(index / 19), twentyYear: 4.4 + .15 * Math.cos(index / 23),
    usdEur: .9 + .02 * Math.sin(index / 11) };
}).filter(row => ![0, 6].includes(new Date(`${row.date}T00:00:00Z`).getUTCDay()));

it('models the clean-to-dirty entry, coupon total return and reproducible EUR risk scenarios', () => {
  const first = treasuryBondScenario(62, asOf, rows)!;
  expect(first).not.toBeNull();
  expect(first.referenceDirty).toBeGreaterThan(62);
  expect(first.targetClean).toBeGreaterThan(0);
  expect(first.expectedTotalReturnPercent).toBeGreaterThan(-100);
  expect(first.annualVolatilityPercent).toBeGreaterThan(0);
  expect(first.riskHistory.length).toBeGreaterThan(180);
  expect(first.scenarioReturns.p10).toBeLessThanOrEqual(first.scenarioReturns.median);
  expect(first.scenarioReturns.median).toBeLessThanOrEqual(first.scenarioReturns.p90);
  expect(treasuryBondScenario(62, asOf, rows)).toEqual(first);
});

it('does not extrapolate short or stale rate and FX histories', () => {
  expect(treasuryBondScenario(62, asOf, rows.slice(-100))).toBeNull();
  expect(treasuryBondScenario(62, asOf, rows.slice(0, -10))).toBeNull();
  expect(treasuryBondScenario(62, asOf, rows.map(row => ({ ...row, usdEur: NaN })))).toBeNull();
  expect(treasuryBondScenario(0, asOf, rows)).toBeNull();
});
