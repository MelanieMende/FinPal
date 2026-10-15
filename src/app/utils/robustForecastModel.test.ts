import { buildRobustForecastAllocation, conservativeForecast, estimateEuroCovariance, readFundamentalRisks } from './robustForecastModel';
import { validPortfolioAllocation, allocationMismatch } from './portfolioAllocation';
import { readReturnForecasts, validReturnForecast } from './portfolioForecastOptimization';
import type { PortfolioAnalysisRequest } from './portfolioAnalysis';
import { robustReturnForecastFixture } from '../../testing/fixtures/robustForecast';
import { returnForecastFixture, returnForecastInputFixture } from '../../testing/fixtures/returnForecast';
import { etfReturnForecastFixture } from '../../testing/fixtures/etfHistory';

const request = (): PortfolioAnalysisRequest => ({ provider: 'api', priceUpdatedAt: new Date().toISOString(),
  profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 267.54 },
  positions: [{ id: 31, name: 'Bitcoin', type: 'Crypto', isin: '', symbol: 'BTC', shares: .005432, price: 74456.65, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: 0 },
    { id: 33, name: 'JinkoSolar', type: 'Stock', isin: '', symbol: 'JKS', shares: 2, price: 8.61, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: 0 }],
});

it('includes a reviewed ETF with a local forecast in joint optimization without bypassing the risk gates', () => {
  const r = request(); r.positions = [{ ...r.positions[1], id: 1, price: 50, shares: 20 }]; r.profile.buyBudget = 1000;
  const f = etfReturnForecastFixture('new:IE00BF4RFH31');
  const candidate = { name: 'Small-cap ETF', isin: 'IE00BF4RFH31', symbol: 'WSML', type: 'ETF' as const, action: 'Prüfen' as const,
    rationale: 'Candidate', risk: 'Risk', sourceIndexes: [0], marketQuote: { isin: 'IE00BF4RFH31', symbol: 'IUSN.DE', price: f.referencePrice,
      currency: 'EUR' as const, exchange: 'XETR', quoteAsOf: new Date(Date.now() - 60000).toISOString(), fetchedAt: new Date().toISOString(), kind: 'last-trade' as const,
      source: { title: 'Exchange quote', url: 'https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=IE00BF4RFH31' } } };
  const plan = buildRobustForecastAllocation(r, [robustReturnForecastFixture('1', { targetPrice: 40 }), f], [candidate]);
  expect(plan.optimization!.inputs.some(input => input.key === f.key)).toBe(true);
  expect(plan.optimization!.unresolvedKeys).not.toContain(f.key);
  expect(plan.optimization!.forecasts.find(item => item.key === f.key)?.model).toEqual(f.model);
  expect(plan.optimization!.robust!.covarianceStatus).toBe('measured-eur');
  expect(plan.positions.find(p => p.key === f.key)).toBeDefined();
  expect(plan.optimization!.robust!.estimates.find(e => e.key === f.key)?.adjustedReturnPercent).toBeCloseTo(f.scenarioReturns!.median * .25);
  expect(validPortfolioAllocation(plan)).toBe(true);
  const moved = buildRobustForecastAllocation(r, [f], [{ ...candidate, marketQuote: { ...candidate.marketQuote, price: f.referencePrice * 1.1 } }]);
  expect(moved.optimization!.robust!.estimates.find(e => e.key === f.key)?.adjustedReturnPercent)
    .toBeCloseTo(((1 + f.scenarioReturns!.median / 100) / 1.1 - 1) * 25);
  // An unverified new symbol must not enter merely because an AI supplied it.
  const unverified = buildRobustForecastAllocation(r, [f], [{ ...candidate, marketQuote: null }]);
  expect(unverified.positions.some(p => p.key === f.key)).toBe(false);
  const injected = readReturnForecasts([{ ...returnForecastInputFixture(), model: f.model, scenarioReturns: f.scenarioReturns, uncertainty: f.uncertainty }], f.forecastSources);
  expect(injected[0].model).toBeUndefined();
});

it('uses the same base shrinkage for analyst and bootstrap signals without shrinking crypto twice', () => {
  const crypto = robustReturnForecastFixture('1', { targetPrice: 52.5, scenarioReturns: { p10: -20, median: 20, p90: 60 }, uncertainty: { method: 'historical-bootstrap', historyYears: 5 } });
  const stock = robustReturnForecastFixture('2', { uncertainty: { method: 'analyst-consensus', analystCount: 10000, targetLowPrice: 55, targetHighPrice: 65 } });
  expect(conservativeForecast(crypto, 50).adjustedReturnPercent).toBeCloseTo(5, 8);
  expect(conservativeForecast(stock, 50).adjustedReturnPercent).toBeCloseTo(5, 2);
  const seven = conservativeForecast({ ...stock, uncertainty: { ...stock.uncertainty!, analystCount: 7 } }, 50);
  expect(seven.adjustedReturnPercent).toBeLessThan(conservativeForecast(stock, 50).adjustedReturnPercent);
  expect(conservativeForecast({ ...stock, uncertainty: { ...stock.uncertainty!, targetLowPrice: 20, targetHighPrice: 100 } }, 50).uncertaintyPercent).toBeGreaterThan(conservativeForecast(stock, 50).uncertaintyPercent);
});

it('estimates symmetric PSD covariance from aligned EUR intervals and preserves negative correlation', () => {
  const first = robustReturnForecastFixture();
  const second = robustReturnForecastFixture('2', { riskHistory: { ...first.riskHistory!, closes: first.riskHistory!.closes.map(row => ({ ...row, price: 2500 / row.price })) } });
  const model = estimateEuroCovariance([first, second])!;
  expect(model.observations).toBe(365);
  expect(model.covariance[0][1]).toBeLessThan(0);
  expect(model.covariance[0][1]).toBe(model.covariance[1][0]);
  for (const weights of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const variance = weights.reduce((sum, value, i) => sum + value * model.covariance[i].reduce((s, v, j) => s + v * weights[j], 0), 0);
    expect(variance).toBeGreaterThanOrEqual(-1e-12);
  }
  expect(estimateEuroCovariance([first, { ...second, riskHistory: undefined }])).toBeNull();
  expect(estimateEuroCovariance([{ ...first, riskHistory: { ...first.riskHistory!, closes: first.riskHistory!.closes.slice(-180) } }])).toBeNull();
});

it('does not recommend the original concentrated Bitcoin-to-Jinko switch from a seven-analyst signal', () => {
  const bitcoin = robustReturnForecastFixture('31', { referencePrice: 74184.09, targetPrice: 75600.29, annualVolatilityPercent: 43.35,
    uncertainty: { method: 'historical-bootstrap', historyYears: 5 }, scenarioReturns: { p10: -45.88, median: 7.636, p90: 103.23 } });
  const jinko = robustReturnForecastFixture('33', { referencePrice: 8.61, targetPrice: 20.01571, annualVolatilityPercent: 60.78,
    uncertainty: { method: 'analyst-consensus', analystCount: 7, targetLowPrice: 4, targetHighPrice: 35 } });
  const plan = buildRobustForecastAllocation(request(), [bitcoin, jinko], [], undefined, undefined, [], [
    { key: '33', status: 'assessed', materialRisks: ['loss-making', 'low-margin'], rationale: 'Synthetic evidence of losses and weak margin.', sources: jinko.forecastSources },
  ]);
  expect(plan.positions.find(p => p.key === '33')!.action).not.toBe('Kaufen');
  expect(plan.positions.find(p => p.key === '31')!.action).not.toBe('Verkaufen');
  expect(plan.optimization!.robust!.estimates.find(e => e.key === '33')!.adjustedReturnPercent).toBeCloseTo(132.4705 * .25 * 7 / 17, 4);
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('makes cited corporate risks binding for proposed buys and preserves the linked trade review after AI holds', () => {
  const r = request(); r.profile.buyBudget = 1000;
  const bitcoin = robustReturnForecastFixture('31', { referencePrice: 74456.65, targetPrice: 60000, annualVolatilityPercent: 10 });
  const jinko = robustReturnForecastFixture('33', { referencePrice: 8.61, targetPrice: 100, annualVolatilityPercent: 10,
    uncertainty: { method: 'analyst-consensus', analystCount: 30, targetLowPrice: 99, targetHighPrice: 101 } });
  const risks = [{ key: '33', status: 'assessed' as const, materialRisks: ['loss-making'], rationale: 'Documented synthetic loss.', sources: jinko.forecastSources }];
  const plan = buildRobustForecastAllocation(r, [bitcoin, jinko], [], undefined, undefined, [], risks);
  expect(plan.optimization!.robust!.reviewReasons.join(' ')).toContain('Verlustlage');
  expect(plan.optimization!.robust!.decisionStatus).toBe('review-required');
  expect(plan.positions.every(p => p.amountEUR === null)).toBe(true);
  expect(plan.optimization!.expectedReturnPercent).toBeNull();
  const holds = r.positions.map(p => ({ assetId: p.id, action: 'Halten' as const, rationale: 'Review', risk: 'Review', sourceIndexes: [] as number[] }));
  const corrected = buildRobustForecastAllocation(r, [bitcoin, jinko], [], undefined, holds, [], risks);
  expect(corrected.optimization!.robust!.decisionStatus).toBe('review-required');
  expect(allocationMismatch(corrected, holds)).toBeNull();
  expect(allocationMismatch(corrected, [{ ...holds[1], action: 'Kaufen', plannedAmountEUR: 100 }])).toContain('offener Entscheidung');
});

it('rejects a concentrated purchase when its attractive target fails even with clean fundamentals', () => {
  const r = request(); r.positions = [r.positions[1]]; r.profile.buyBudget = 1000;
  const f = robustReturnForecastFixture('33', { referencePrice: 8.61, targetPrice: 100, annualVolatilityPercent: 10,
    uncertainty: { method: 'analyst-consensus', analystCount: 50, targetLowPrice: 99, targetHighPrice: 101 } });
  const plan = buildRobustForecastAllocation(r, [f], [], undefined, undefined, [], [{ key: '33', status: 'assessed', materialRisks: [], rationale: 'Synthetic assessment.', sources: f.forecastSources }]);
  expect(plan.optimization!.robust!.stressChecks.some(check => check.name.includes('Kursziel verfehlt') && check.utilityImprovementEUR < 0)).toBe(true);
  expect(plan.optimization!.robust!.decisionStatus).toBe('review-required');
  expect(plan.positions[0].amountEUR).toBeNull();
  expect(plan.optimization!.robust!.concentration!.scenarioLargestPercent).toBeGreaterThan(plan.optimization!.robust!.concentration!.beforeLargestPercent);
});

it('allows a cost-effective sale stable under stress instead of blanket-blocking all trades', () => {
  const r = request(); r.positions = [{ ...r.positions[1], id: 1, price: 50, shares: 20 }]; r.profile.buyBudget = 1000;
  const plan = buildRobustForecastAllocation(r, [robustReturnForecastFixture('1', { targetPrice: 40 })]);
  expect(plan.optimization!.robust!.decisionStatus).toBe('stable-scenario');
  expect(plan.positions[0]).toMatchObject({ action: 'Verkaufen', amountEUR: 1000 });
  expect(plan.optimization!.robust!.stressChecks.every(check => check.utilityImprovementEUR > 0)).toBe(true);
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('does not fabricate correlations or accept AI-supplied historical evidence', () => {
  const source = { title: 'Source', url: 'https://example.com/report' };
  const f = robustReturnForecastFixture();
  const read = readReturnForecasts([{ ...returnForecastInputFixture(), riskHistory: f.riskHistory, uncertainty: f.uncertainty }], [source]);
  expect(read[0].riskHistory).toBeUndefined(); expect(read[0].uncertainty).toBeUndefined();
  expect(validReturnForecast({ ...f, riskHistory: { ...f.riskHistory!, closes: [...f.riskHistory!.closes].reverse() } })).toBe(false);
  expect(readFundamentalRisks([{ key: '1', status: 'assessed', materialRisks: ['loss-making'], rationale: 'No evidence', sourceIndexes: [99] }], [source])).toEqual([]);
  const r = request(); r.positions = [{ ...r.positions[1], id: 1, price: 50, shares: 20 }];
  const plan = buildRobustForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 40 })]);
  expect(plan.optimization!.robust!.covarianceStatus).toBe('unavailable');
  expect(plan.positions[0].amountEUR).toBeNull();
});
