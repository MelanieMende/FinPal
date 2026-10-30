/** A dated Treasury curve is a rate scenario, not a quote for this CUSIP. Prices below are model marks. */
export interface TreasuryCurveDay { date: string; tenYear: number; twentyYear: number; usdEur: number }
export interface TreasuryBondScenario {
  referenceDirty: number;
  targetClean: number;
  expectedTotalReturnPercent: number;
  annualVolatilityPercent: number;
  volatilityLookbackDays: number;
  volatilityAsOf: string;
  scenarioReturns: { p10: number; median: number; p90: number };
  riskHistory: { date: string; price: number }[];
  historyYears: number;
}
const DAY = 86400000;
const COUPON = 1.125;
const MATURITY = Date.UTC(2040, 7, 15);
const instant = (date: string) => Date.parse(`${date}T00:00:00Z`);
const couponDates = (start: number, end: number) => {
  const dates: number[] = [];
  for (let year = new Date(start).getUTCFullYear() - 1; year <= new Date(end).getUTCFullYear() + 1; year++)
    for (const month of [1, 7]) {
      const date = Date.UTC(year, month, 15);
      if (date <= MATURITY) dates.push(date);
    }
  return dates.sort((a, b) => a - b);
};
const accrual = (date: number) => {
  const dates = couponDates(date - 366 * DAY, date + 366 * DAY);
  const priorDates = dates.filter(item => item <= date);
  const previous = priorDates[priorDates.length - 1];
  const next = dates.find(item => item > date);
  return previous === undefined || next === undefined ? 0 : COUPON / 2 * (date - previous) / (next - previous);
};
const dirtyPrice = (date: number, annualYield: number) => {
  if (date >= MATURITY || annualYield <= -1.9) return NaN;
  return couponDates(date, MATURITY).filter(payment => payment > date).reduce((sum, payment) => {
    const years = (payment - date) / (365.25 * DAY);
    return sum + (COUPON / 2 + (payment === MATURITY ? 100 : 0)) / (1 + annualYield / 2) ** (2 * years);
  }, 0);
};
const curveYield = (remainingYears: number, row: TreasuryCurveDay) => {
  const weight = Math.max(0, Math.min(1, (remainingYears - 10) / 10));
  return (row.tenYear * (1 - weight) + row.twentyYear * weight) / 100;
};
const quantile = (values: number[], probability: number) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const point = (sorted.length - 1) * probability, lower = Math.floor(point);
  return sorted[lower] + (sorted[Math.ceil(point)] - sorted[lower]) * (point - lower);
};
export function treasuryBondScenario(cleanPercent: number, quoteDate: string, rows: TreasuryCurveDay[]): TreasuryBondScenario | null {
  const asOf = instant(quoteDate);
  if (!(cleanPercent > 0 && cleanPercent < 200) || !Number.isFinite(asOf) || asOf >= MATURITY) return null;
  const valid = rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(instant(row.date))
    && row.tenYear > 0 && row.twentyYear > 0 && row.tenYear < 30 && row.twentyYear < 30
    && row.usdEur > 0 && row.usdEur < 10 && instant(row.date) <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const history = [...new Map(valid.map(row => [row.date, row])).values()].slice(-400);
  if (history.length < 181 || asOf - instant(history[history.length - 1].date) > 7 * DAY
    || instant(history[history.length - 1].date) - instant(history[0].date) < 180 * DAY) return null;
  const currentDirty = cleanPercent + accrual(asOf);
  let low = -0.5, high = 1.5;
  for (let step = 0; step < 100; step++) {
    const mid = (low + high) / 2;
    if (dirtyPrice(asOf, mid) > currentDirty) low = mid; else high = mid;
  }
  const issueYield = (low + high) / 2;
  if (Math.abs(dirtyPrice(asOf, issueYield) - currentDirty) > .001) return null;
  const latest = history[history.length - 1];
  const spread = issueYield - curveYield((MATURITY - asOf) / (365.25 * DAY), latest);
  const targetDate = asOf + 365 * DAY;
  if (targetDate >= MATURITY) return null;
  const targetYield = curveYield((MATURITY - targetDate) / (365.25 * DAY), latest) + spread;
  const coupons = couponDates(asOf, targetDate).filter(date => date > asOf && date <= targetDate).length * COUPON / 2;
  const baseDirty = dirtyPrice(targetDate, targetYield);
  const baseReturn = (baseDirty + coupons) / currentDirty - 1;
  if (!Number.isFinite(baseReturn) || baseReturn <= -1 || baseReturn > 10) return null;
  const marks = history.map(row => {
    const date = instant(row.date);
    return { date: row.date, dirty: dirtyPrice(date, curveYield((MATURITY - date) / (365.25 * DAY), row) + spread), fx: row.usdEur };
  });
  const riskHistory = [{ date: marks[0].date, price: 100 }];
  const daily: { rate: number; fx: number }[] = [];
  for (let index = 1; index < marks.length; index++) {
    const previous = marks[index - 1], current = marks[index];
    const payment = couponDates(instant(previous.date), instant(current.date))
      .filter(date => date > instant(previous.date) && date <= instant(current.date)).length * COUPON / 2;
    const factor = (current.dirty + payment) / previous.dirty * current.fx / previous.fx;
    if (!(factor > 0) || !Number.isFinite(factor)) return null;
    riskHistory.push({ date: current.date, price: riskHistory[riskHistory.length - 1].price * factor });
    daily.push({ rate: (history[index].tenYear - history[index - 1].tenYear
      + history[index].twentyYear - history[index - 1].twentyYear) / 200,
    fx: Math.log(current.fx / previous.fx) });
  }
  const changes = riskHistory.slice(1).map((row, index) => Math.log(row.price / riskHistory[index].price));
  const recent = changes.slice(-252);
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const variance = recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (recent.length - 1);
  const annualVolatilityPercent = Math.sqrt(variance * 252) * 100;
  if (!(annualVolatilityPercent > 0 && annualVolatilityPercent < 500)) return null;
  let seed = (history.length * 2654435761 + Math.round(cleanPercent * 10000)) >>> 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
  const outcomes: number[] = [];
  for (let path = 0; path < 2000; path++) {
    let rateChange = 0, fxChange = 0, sampled = 0;
    while (sampled < 252) {
      const start = Math.floor(random() * Math.max(1, daily.length - 20));
      for (let offset = 0; offset < 20 && sampled < 252; offset++, sampled++) {
        rateChange += daily[start + offset].rate;
        fxChange += daily[start + offset].fx;
      }
    }
    const futureDirty = dirtyPrice(targetDate, Math.max(-.5, targetYield + rateChange));
    outcomes.push(((futureDirty + coupons) / currentDirty * Math.exp(fxChange) - 1) * 100);
  }
  const scenarioReturns = { p10: quantile(outcomes, .1), median: quantile(outcomes, .5), p90: quantile(outcomes, .9) };
  if (!(scenarioReturns.p10 > -100 && scenarioReturns.p90 < 100000)) return null;
  return { referenceDirty: currentDirty, targetClean: baseDirty - accrual(targetDate),
    expectedTotalReturnPercent: baseReturn * 100, annualVolatilityPercent,
    volatilityAsOf: `${latest.date}T00:00:00Z`, volatilityLookbackDays: Math.floor((instant(latest.date) - instant(history[0].date)) / DAY),
    scenarioReturns, riskHistory, historyYears: (instant(latest.date) - instant(history[0].date)) / (365.25 * DAY) };
}
