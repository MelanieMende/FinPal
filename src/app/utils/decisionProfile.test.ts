import { parseDecisionDetails, protectedCashEUR } from './decisionProfile';
import { validateAnalysisRequest, type PortfolioAnalysisRequest } from './portfolioAnalysis';
import { buildRobustForecastAllocation } from './robustForecastModel';
import { buildForecastAllocation } from './portfolioForecastOptimization';
import { buildPortfolioAllocation } from './portfolioAllocation';
import { checkPortfolioFunding } from './portfolioFunding';
import { robustReturnForecastFixture } from '../../testing/fixtures/robustForecast';

const request = (): PortfolioAnalysisRequest => ({ provider: 'api', priceUpdatedAt: new Date().toISOString(),
  profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 1000,
    decisionDetails: { reserveEUR: 300, plannedWithdrawalsEUR: 200, externalAssetsEUR: 50000, confirmedAt: new Date().toISOString() } },
  positions: [{ id: 1, name: 'Synthetic', symbol: 'TEST', isin: '', type: 'Stock', shares: 20, price: 50, currency: 'EUR', costBasis: null, realizedGainLoss: null, dividendsEarned: 0 }],
});

it('keeps reserved cash in portfolio wealth but excludes it from purchases and fees in every allocation mode', () => {
  const r = request();
  const forecast = robustReturnForecastFixture('1', { targetPrice: 200 });
  for (const plan of [buildPortfolioAllocation(r), buildForecastAllocation(r, [forecast]), buildRobustForecastAllocation(r, [forecast])]) {
    expect(plan.totalValueEUR).toBe(2000); // Neither subtract reserve nor add unvalued external wealth.
    expect(plan.projectedCashEUR).toBeGreaterThanOrEqual(500);
    const buys = plan.positions.filter(p => p.action === 'Kaufen').reduce((sum, p) => sum + (p.amountEUR ?? 0), 0);
    expect(buys + plan.feesEUR).toBeLessThanOrEqual(500);
  }
  expect(protectedCashEUR(r.profile)).toBe(500);
});

it('prevents confirmed targets and existing dependent trades from spending the protected cash', () => {
  const r = request();
  const plan = buildPortfolioAllocation(r, [], undefined, undefined, new Map([['1', { percent: 100, minPercent: 100, maxPercent: 100 }]]));
  expect(plan.projectedCashEUR).toBeGreaterThanOrEqual(500);
  expect(plan.positions[0].amountEUR! + plan.feesEUR).toBeLessThanOrEqual(500);
  const single = { ...r, targetAssetId: 1, positions: [{ ...r.positions[0], type: 'CashEquivalent' as const }, { ...r.positions[0], id: 2 }] };
  const locked = buildPortfolioAllocation(single, [], { recommendations: [{ assetId: 2, action: 'Kaufen', plannedAmountEUR: 800, rationale: '', risk: '', sourceIndexes: [] }] });
  expect(locked.status).toBe('blocked');
  expect(locked.positions.every(p => p.amountEUR === null)).toBe(true);
  expect(locked.feesEUR).toBe(0);
  r.profile.decisionDetails!.reserveEUR = 5000;
  const blocked = buildForecastAllocation(r, [robustReturnForecastFixture('1')]);
  expect(blocked.status).toBe('blocked');
  expect(blocked.positions.every(p => p.amountEUR === null)).toBe(true);
});

it('checks funding after reserve and fees even when total cash would cover the purchase', () => {
  const result = checkPortfolioFunding(request(), { recommendations: [{ assetId: 1, action: 'Kaufen', plannedAmountEUR: 500, rationale: '', risk: '', sourceIndexes: [] }] });
  expect(result).toMatchObject({ status: 'insufficient', cashEUR: 1000, shortfallEUR: 1, balanceBeforeSpreadAndTaxEUR: -1 });
  expect(result.warnings.join(' ')).toContain('500.00 EUR');
});

it('distinguishes blank from explicit zero, allows a monthly deficit, and rejects invalid personal details at the request boundary', () => {
  expect(parseDecisionDetails({ reserveEUR: '', confirmedAt: new Date().toISOString() })).toBeUndefined();
  const r = request();
  r.profile.decisionDetails = parseDecisionDetails({ reserveEUR: '0', monthlySurplusEUR: '-100,50', confirmedAt: new Date().toISOString() });
  expect(r.profile.decisionDetails).toMatchObject({ reserveEUR: 0, monthlySurplusEUR: -100.5 });
  expect(r.profile.decisionDetails?.lossCapacityEUR).toBeUndefined();
  expect(() => validateAnalysisRequest(r)).not.toThrow();
  for (const details of [{ reserveEUR: -1 }, { plannedWithdrawalsEUR: NaN }, { tolerableDrawdownPercent: 101 }, { confirmedAt: '' }, { notes: 'x'.repeat(3001) }]) {
    const invalid = { ...r, profile: { ...r.profile, decisionDetails: { ...r.profile.decisionDetails!, ...details } } };
    expect(() => validateAnalysisRequest(invalid)).toThrow('ergänzenden persönlichen Angaben');
  }
});

it('accepts a total loss capacity of 100 percent without treating it as EUR or personal drawdown tolerance', () => {
  const r = request();
  r.profile.decisionDetails = parseDecisionDetails({ lossCapacityPercent: '100', lossCapacityUnit: 'percent', confirmedAt: new Date().toISOString() });
  expect(() => validateAnalysisRequest(r)).not.toThrow();
  expect(r.profile.decisionDetails).toMatchObject({ lossCapacityPercent: 100 });
  expect(r.profile.decisionDetails?.lossCapacityEUR).toBeUndefined();
  expect(r.profile.decisionDetails?.tolerableDrawdownPercent).toBeUndefined();
  for (const lossCapacityPercent of [-1, 100.01, Infinity, NaN]) {
    expect(() => validateAnalysisRequest({ ...r, profile: { ...r.profile, decisionDetails: { ...r.profile.decisionDetails!, lossCapacityPercent } } })).toThrow();
  }
  expect(() => validateAnalysisRequest({ ...r, profile: { ...r.profile, decisionDetails: { ...r.profile.decisionDetails!, lossCapacityEUR: 100 } } })).toThrow();
  expect(parseDecisionDetails({ lossCapacityUnit: 'percent', confirmedAt: new Date().toISOString() })).toBeUndefined();
  expect(() => validateAnalysisRequest({ ...r, profile: { ...r.profile, decisionDetails: { lossCapacityEUR: 400, confirmedAt: new Date().toISOString() } } })).not.toThrow();
});
