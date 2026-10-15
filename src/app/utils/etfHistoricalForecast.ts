/** A local scenario generator, not a published analyst target or calibrated prediction. */
export function etfHistoricalForecast(rows: Array<{ date: Date | string | number; close: number | null; adjclose?: number | null }>) {
  const day = 86400000;
  const instant = (date: Date | string | number) => date instanceof Date ? date.getTime() : typeof date === 'number' ? (date < 1e12 ? date * 1000 : date) : Date.parse(date);
  // Do not silently replace missing adjusted prices with unadjusted prices across distributions/splits.
  // Yahoo can emit empty bars for exchange holidays; these are not missing adjustment data for a trade.
  const sorted = rows.filter(row => !(row.close == null && row.adjclose == null))
    .map(row => ({ time: instant(row.date), price: row.adjclose, rawPrice: row.close }))
    .sort((a, b) => a.time - b.time);
  if (sorted.some(row => !Number.isFinite(row.time) || typeof row.price !== 'number' || !(row.price > 0) || !Number.isFinite(row.price)
    || typeof row.rawPrice !== 'number' || !(row.rawPrice > 0) || !Number.isFinite(row.rawPrice))) return null;
  const prices = sorted.filter((row, i) => !i || row.time !== sorted[i - 1].time);
  if (sorted.some((row, i) => i && row.time === sorted[i - 1].time && row.price !== sorted[i - 1].price)) return null;
  if (prices.length < 1261) return null;
  const last = prices[prices.length - 1];
  const historyYears = (last.time - prices[0].time) / (365.25 * day);
  if (historyYears < 5 || prices.length / historyYears < 200 || prices.length / historyYears > 280
    || prices.some((row, i) => i && row.time - prices[i - 1].time > 14 * day)) return null;
  const returns = prices.slice(1).map((row, i) => Math.log(row.price! / prices[i].price!));
  if (returns.some(value => !Number.isFinite(value))) return null;
  const recent = returns.slice(-252);
  const mean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const variance = recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (recent.length - 1);
  const annualVolatilityPercent = Math.sqrt(variance * 252) * 100;
  if (!(annualVolatilityPercent > 0) || annualVolatilityPercent > 500) return null;
  let seed = (returns.length * 2654435761) >>> 0;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 0x100000000; };
  const paths: number[] = [];
  for (let path = 0; path < 2000; path++) {
    let sum = 0, sampled = 0;
    while (sampled < 252) {
      const start = Math.floor(random() * (returns.length - 20 + 1));
      for (let offset = 0; offset < 20 && sampled < 252; offset++, sampled++) sum += returns[start + offset];
    }
    paths.push(Math.expm1(sum) * 100);
  }
  paths.sort((a, b) => a - b);
  const percentile = (p: number) => {
    const index = (paths.length - 1) * p, lower = Math.floor(index);
    return paths[lower] + (paths[Math.ceil(index)] - paths[lower]) * (index - lower);
  };
  const scenarioReturns = { p10: percentile(.1), median: percentile(.5), p90: percentile(.9) };
  // Match the shared conservative signal weight; the robust layer uses the raw median once.
  const expectedReturnPercent = scenarioReturns.median * .25;
  if (![...Object.values(scenarioReturns), expectedReturnPercent].every(Number.isFinite)
    || scenarioReturns.p10 <= -100 || scenarioReturns.p90 > 100000 || expectedReturnPercent <= -100) return null;
  return { referencePrice: last.rawPrice!, referenceTime: last.time, targetPrice: last.rawPrice! * (1 + expectedReturnPercent / 100),
    expectedReturnPercent, scenarioReturns, annualVolatilityPercent, volatilityAsOf: new Date(last.time).toISOString(),
    volatilityLookbackDays: Math.floor((last.time - prices[prices.length - 253].time) / day),
    historyYears, observations: prices.length };
}
