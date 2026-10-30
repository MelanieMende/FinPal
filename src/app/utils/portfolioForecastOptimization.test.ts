import { buildForecastAllocation, readReturnForecasts, validReturnForecast } from './portfolioForecastOptimization';
import { validPortfolioAllocation, allocationMismatch } from './portfolioAllocation';
import type { PortfolioAnalysisRequest, PortfolioAnalysisResult } from './portfolioAnalysis';
import type { InvestorContext } from './investorFacts';
import { returnForecastFixture, returnForecastInputFixture } from '../../testing/fixtures/returnForecast';

const request = (): PortfolioAnalysisRequest => ({ provider: 'api', priceUpdatedAt: new Date(Date.now()).toISOString(),
  profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 1000 },
  positions: [{ id: 1, name: 'Synthetic Stock', type: 'Stock', isin: '', symbol: 'TEST', shares: 20, price: 50,
    currency: 'EUR', costBasis: 500, dividendsEarned: 0, realizedGainLoss: 0 }],
});

it('continues the evidenced sleeve and accepts holding a reviewed unavailable position', () => {
  const r = request();
  r.positions.push({ ...r.positions[0], id: 12, name: 'Arbor Metals' });
  const plan = buildForecastAllocation(r, [returnForecastFixture('1')], [], undefined, undefined, ['12']);
  expect(plan.status).toBe('calculated');
  expect(plan.optimization.reviewedUnavailableKeys).toEqual(['12']);
  expect(plan.positions[1]).toMatchObject({ action: 'Halten', amountEUR: null, currentValueEUR: 1000 });
  expect(plan.positions[1].reason).toContain('Geprüft:');
  expect(plan.warnings.join(' ')).not.toContain('Arbor Metals:');
  expect(allocationMismatch(plan, [{ assetId: 12, action: 'Halten', rationale: 'Test', risk: 'Test', sourceIndexes: [] }])).toBeNull();
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('uses the verified bond total return rather than clean-price appreciation as optimizer input', () => {
  const r = request();
  const asOf = new Date(Date.now() - 86400000).toISOString();
  r.positions[0] = { ...r.positions[0], type: 'Bond', isin: 'US912810SQ22', currency: 'EUR', price: 55.8,
    bondHolding: { nominal: 1000, currency: 'USD', purchaseAccruedInterestEUR: 0, source: 'user-confirmed',
      transactions: [{ id: 1, date: asOf, nominal: 1000, accruedInterestEUR: 0 }] },
    quote: { source: 'boerse-frankfurt', exchange: 'XFRA', tradedInPercent: true, originalPrice: 62,
      originalCurrency: 'USD', valuationCurrency: 'EUR', quoteAsOf: asOf, fetchedAt: asOf,
      convertedAt: asOf, fxRateToEUR: .9, fxSource: 'test', fxAsOf: asOf, fxFetchedAt: asOf } };
  const forecast = returnForecastFixture('1', { publisher: 'FinPal Treasury-Zinskurven-Szenario',
    currency: 'USD', referencePrice: 62, referencePriceAsOf: asOf, targetPrice: 63,
    expectedTotalReturnPercent: 3.5, scenarioReturns: { p10: -10, median: 4, p90: 16 },
    uncertainty: { method: 'bond-curve-scenario', historyYears: 1 },
    model: { kind: 'bond-curve-v1', observations: 260, couponPercent: 1.125,
      maturityDate: '2040-08-15', priceBasis: 'clean', referenceDirty: 62.2 } });
  const plan = buildForecastAllocation(r, [forecast]);
  expect(plan.optimization.inputs[0].expectedReturnPercent).toBeCloseTo(3.5);
  expect(plan.optimization.inputs[0].expectedReturnPercent).not.toBeCloseTo((63 / 62 - 1) * 100);
  expect(plan.optimization.unresolvedKeys).toEqual([]);
  const movedQuote = buildForecastAllocation({ ...r, positions: [{ ...r.positions[0], quote: { ...r.positions[0].quote!, originalPrice: 61 } }] }, [forecast]);
  expect(movedQuote.optimization.inputs).toEqual([]);
  expect(movedQuote.positions[0].action).toBe('Prüfen');
});

it('finishes forecast review without fabricating an optimum when no forecast is available', () => {
  const plan = buildForecastAllocation(request(), [], [], undefined, undefined, ['1']);
  expect(plan.status).toBe('blocked'); // Only the mathematical optimization is unavailable.
  expect(plan.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null, targetWeight: null });
  expect(plan.optimization.expectedReturnPercent).toBeNull();
  expect(plan.optimization.reviewedUnavailableKeys).toEqual(['1']);
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('does not waive valuation or currency failures as completed forecast review', () => {
  const r = request(); r.positions[0].price = null;
  const plan = buildForecastAllocation(r, [], [], undefined, undefined, ['1']);
  expect(plan.positions[0].action).toBe('Prüfen');
  expect(plan.optimization.reviewedUnavailableKeys).toEqual([]);
  const mismatched = buildForecastAllocation(request(), [returnForecastFixture('1', { currency: 'USD' })], [], undefined, undefined, ['1']);
  expect(mismatched.positions[0].action).toBe('Prüfen');
  expect(mismatched.optimization.reviewedUnavailableKeys).toEqual([]);
});

it('matches the analytic one-asset mean-variance optimum and computes the exact sale after fees', () => {
  const plan = buildForecastAllocation(request(), [returnForecastFixture()]);
  // mu=.2, sigma=.5, lambda=5: w*=mu/(lambda*sigma^2)=.16 of initial wealth.
  expect(plan.status).toBe('calculated');
  expect(plan.positions[0].targetWeight.percent).toBeCloseTo(.16 / .9995 * 100, 7);
  expect(plan.positions[0]).toMatchObject({ action: 'Verkaufen', amountEUR: 680, targetValueEUR: 320 });
  expect(plan).toMatchObject({ feesEUR: 1, projectedCashEUR: 1679 });
  expect(plan.optimization).toMatchObject({ status: 'converged', riskAversion: 5 });
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('keeps the cash constraint feasible under a large uncertainty penalty and very small covariance', () => {
  const r = request(); r.profile.buyBudget = 0;
  const plan = buildForecastAllocation(r, [returnForecastFixture()], [], undefined, undefined, [], {
    keys: ['1'], covariance: [[1e-8]], uncertainty: [1],
  });
  expect(plan.status).toBe('calculated');
  expect(plan.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null });
  expect(plan.positions[0].targetWeight.percent).toBeLessThanOrEqual(100.000001);
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('changes the optimum when the current price changes against the same published target', () => {
  const r = request();
  const first = buildForecastAllocation(r, [returnForecastFixture()]);
  const second = buildForecastAllocation({ ...r, positions: [{ ...r.positions[0], price: 55 }] }, [returnForecastFixture()]);
  expect(second.optimization.inputs[0].expectedReturnPercent).toBeCloseTo((60 / 55 - 1) * 100);
  expect(second.positions[0].targetWeight.percent).toBeLessThan(first.positions[0].targetWeight.percent);
  expect(second.positions[0].amountEUR).toBeGreaterThan(first.positions[0].amountEUR);
});

it('finds the analytic two-asset optimum under the shared-risk model', () => {
  const r = request(); r.profile.buyBudget = 0;
  r.positions.push({ ...r.positions[0], id: 2, name: 'Lower expected return' });
  const plan = buildForecastAllocation(r, [returnForecastFixture(), returnForecastFixture('2', { targetPrice: 55 })]);
  expect(plan.status).toBe('calculated');
  expect(plan.positions[0].targetValueEUR).toBeCloseTo(320, 2);
  expect(plan.positions[1].targetValueEUR).toBeCloseTo(0, 2);
  expect(plan.projectedCashEUR).toBe(1678);
});

it('responds to forecast strength, historical risk and risk appetite', () => {
  const r = request();
  const ordinary = buildForecastAllocation(r, [returnForecastFixture()]);
  const stronger = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 70 })]);
  const riskier = buildForecastAllocation(r, [returnForecastFixture('1', { annualVolatilityPercent: 70 })]);
  const tolerant = buildForecastAllocation({ ...r, profile: { ...r.profile, risk: 'high' } }, [returnForecastFixture()]);
  expect(stronger.positions[0].targetWeight.percent).toBeGreaterThan(ordinary.positions[0].targetWeight.percent);
  expect(riskier.positions[0].targetWeight.percent).toBeLessThan(ordinary.positions[0].targetWeight.percent);
  expect(tolerant.positions[0].targetWeight.percent).toBeGreaterThan(ordinary.positions[0].targetWeight.percent);
});

it('chooses cash over a negative expected price return and does not invent appreciation', () => {
  const plan = buildForecastAllocation(request(), [returnForecastFixture('1', { targetPrice: 40 })]);
  expect(plan.positions[0]).toMatchObject({ action: 'Verkaufen', amountEUR: 1000, targetWeight: { percent: 0 } });
  expect(plan.optimization.expectedGainEUR).toBe(-1);
  expect(plan.projectedCashEUR).toBe(1999);
});

it('blocks unsupported, missing, stale, wrong-horizon or currency-mismatched forecasts', () => {
  const r = request();
  const cases = [[], [returnForecastFixture('1', { currency: 'USD' })],
    [returnForecastFixture('1', { targetDate: new Date(Date.now() + 90 * 86400000).toISOString() })],
    [returnForecastFixture('1', { publishedAt: '2020-01-01' })],
    [returnForecastFixture('1', { volatilitySources: [] })]];
  for (const forecasts of cases) {
    const plan = buildForecastAllocation(r, forecasts);
    expect(plan.status).toBe('blocked');
    expect(plan.positions[0]).toMatchObject({ action: 'Prüfen', amountEUR: null, targetWeight: null });
    expect(validPortfolioAllocation(plan)).toBe(true);
  }
  expect(buildForecastAllocation({ ...r, priceUpdatedAt: null }, [returnForecastFixture()]).status).toBe('blocked');
});

it('strictly optimizes the evidenced sleeve while freezing positions with missing forecasts', () => {
  const r = request();
  r.positions.push({ ...r.positions[0], id: 2, name: 'Unsupported holding', symbol: 'NONE' });
  const plan = buildForecastAllocation(r, [returnForecastFixture('1')]);
  expect(plan.status).toBe('calculated');
  expect(plan.optimization).toMatchObject({ status: 'converged', unresolvedKeys: ['2'] });
  expect(plan.optimization.modeledValuePercent).toBeGreaterThan(0);
  expect(plan.optimization.expectedReturnPercent).not.toBeNull();
  expect(plan.positions[1]).toMatchObject({ action: 'Prüfen', amountEUR: null, targetValueEUR: 1000 });
  expect(plan.positions[1].projectedWeightPercent).toBeCloseTo(plan.positions[1].targetWeight.percent, 8);
  expect(plan.positions[1].reason).toContain('unverändert eingefroren');
  expect(plan.warnings.join(' ')).toContain('Unsupported holding');
  expect(validPortfolioAllocation(plan)).toBe(true);
});

it('respects confirmed weight bands as hard constraints instead of maximizing a bullish forecast without limits', () => {
  const r = request();
  r.investorContext = { assets: [{ assetId: 1, confirmedAt: '2026-10-12T10:00:00Z',
    targetWeight: { percent: 30, minPercent: 25, maxPercent: 35 }, custody: { orderFeeEUR: 1 } }],
    defaultCustody: { orderFeeEUR: 1 } } as InvestorContext;
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 100 })]);
  expect(plan.positions[0].targetWeight).toEqual({ percent: 35, minPercent: 25, maxPercent: 35 });
  expect(plan.positions[0].projectedWeightPercent).toBeCloseTo(35, 2);
  expect(plan.positions[0].source).toBe('user-confirmed');
});

it('does not churn a small holding when fixed order fees erase the expected improvement', () => {
  const r = request(); r.profile.buyBudget = 0; r.positions[0].shares = .04;
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 40 })]);
  expect(plan.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null });
  expect(plan.feesEUR).toBe(0);
});

it('does not present an implementable optimum when costs prevent reaching confirmed constraints', () => {
  const r = request(); r.profile.buyBudget = 0; r.positions[0].shares = .04;
  r.investorContext = { assets: [{ assetId: 1, confirmedAt: '2026-10-12T10:00:00Z',
    targetWeight: { percent: 25, minPercent: 20, maxPercent: 30 }, custody: { orderFeeEUR: 1 } }],
    defaultCustody: { orderFeeEUR: 1 } } as InvestorContext;
  const plan = buildForecastAllocation(r, [returnForecastFixture()]);
  expect(plan.status).toBe('blocked');
  expect(plan.optimization.expectedGainEUR).toBeNull();
  expect(plan.positions[0].amountEUR).toBeNull();
  expect(plan.warnings.join(' ')).toContain('Bandbreiten');
});

it('freezes illiquid holdings and never treats an ELTIF redemption as immediately available cash', () => {
  const r = request(); r.positions[0] = { ...r.positions[0], type: 'Fund', name: 'Synthetic ELTIF' };
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 40 })]);
  expect(plan.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null, projectedWeightPercent: 50 });
  expect(plan.projectedCashEUR).toBe(1000);
});

it('optimizes sourced new candidates within available funds without a fixed crypto or cash quota', () => {
  const r = request();
  r.profile.buyBudget = 3000;
  const candidate = { name: 'Synthetic Crypto', isin: '', symbol: 'XYZ', type: 'Crypto' as const, action: 'Kaufen' as const,
    rationale: 'Test', risk: 'Test', sourceIndexes: [0] };
  const plan = buildForecastAllocation(r, [returnForecastFixture(), returnForecastFixture('new:XYZ', { targetPrice: 150, annualVolatilityPercent: 30 })], [candidate]);
  expect(plan.status).toBe('calculated');
  expect(plan.positions[1].targetWeight.percent).toBeCloseTo(100, 6);
  expect(plan.projectedCashEUR).toBeGreaterThanOrEqual(0);
  expect(plan.positions[1].amountEUR).toBeGreaterThan(0);
  expect(plan.positions[1].amountEUR).toBeGreaterThan(3000);
  expect(plan.projectedCashEUR).toBeLessThan(1);
});

it.each(['Stock', 'Crypto', 'ETF'] as const)('derives the same uncapped optimum for %s from return and risk', type => {
  const r = request(); r.positions[0].type = type; r.profile.risk = 'high';
  const plan = buildForecastAllocation(r, [returnForecastFixture()]);
  // mu=.2, sigma=.5, lambda=2 gives 40% before fees, independent of asset category.
  expect(plan.status).toBe('calculated');
  expect(plan.positions[0].targetWeight.percent).toBeCloseTo(.4 / .9995 * 100, 7);
  expect(plan.positions[0].amountEUR).toBe(200);
  expect(plan.assumptions.join(' ')).toContain('Keine festen Kategoriequoten');
  expect(plan.assumptions.join(' ')).not.toContain('Krypto zusammen höchstens');
});

it('keeps other scenarios locked during a single-asset optimization and retains stable source URLs', () => {
  const r = request();
  r.positions.push({ ...r.positions[0], id: 2, name: 'Other Stock' });
  const full = buildForecastAllocation(r, [returnForecastFixture('1'), returnForecastFixture('2')]);
  const previous = { allocationPlan: full, recommendations: full.positions.map(p => ({ assetId: p.assetId, action: p.action,
    plannedAmountEUR: p.amountEUR, sourceIndexes: [0], rationale: 'Test', risk: 'Test' })), newAssetRecommendations: [] } as PortfolioAnalysisResult;
  const single = buildForecastAllocation({ ...r, targetAssetId: 1 }, [returnForecastFixture('1', { targetPrice: 70 })], [], previous);
  expect(single.status).toBe('calculated');
  expect(single.positions[1]).toMatchObject({ action: full.positions[1].action, amountEUR: full.positions[1].amountEUR });
  expect(single.optimization.forecasts.find(f => f.key === '2').forecastSources[0].url).toBe('https://example.com/report');
});

it('rejects duplicate keys and invalid source references rather than accepting model-supplied provenance', () => {
  const source = { title: 'Provider citation', url: 'https://example.com/provider' };
  const input = returnForecastInputFixture();
  expect(readReturnForecasts([input], [source])[0].forecastSources).toEqual([source]);
  expect(readReturnForecasts([input, input], [source])).toEqual([]);
  expect(readReturnForecasts([{ ...input, volatilitySourceIndexes: [9] }], [source])).toEqual([]);
  expect(validReturnForecast(returnForecastFixture('1', { annualVolatilityPercent: NaN }))).toBe(false);
});
