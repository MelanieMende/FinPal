import { allocationCandidateKey, allocationMismatch, buildPortfolioAllocation, validPortfolioAllocation } from './portfolioAllocation';
import type { AnalysisPosition, AssetRecommendation, NewAssetRecommendation, PortfolioAnalysisRequest } from './portfolioAnalysis';
import type { InvestorContext } from './investorFacts';
import { checkPortfolioFunding } from './portfolioFunding';

const pos = (id: number, type: Asset['type'], value: number): AnalysisPosition => ({ id, type, name: `Asset ${id}`, isin: '', symbol: `A${id}`,
  shares: 1, price: value, currency: 'EUR', costBasis: value, dividendsEarned: 0, realizedGainLoss: 0 });
const req = (positions: AnalysisPosition[], cash = 0): PortfolioAnalysisRequest => ({ provider: 'api', priceUpdatedAt: null, positions,
  profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: cash } });
const rec = (assetId: number, action: AssetRecommendation['action'], plannedAmountEUR: number | null): AssetRecommendation => ({
  assetId, action, plannedAmountEUR, rationale: 'Reason', risk: 'Risk', sourceIndexes: [0],
});
function withFacts(request: PortfolioAnalysisRequest, targets: Record<number, { percent: number; minPercent: number; maxPercent: number }>, fee: number | null = 1) {
  return { ...request, investorContext: { assets: request.positions.map(p => ({ assetId: p.id, confirmedAt: '2026-10-12T10:00:00Z',
    targetWeight: targets[p.id] ?? null, custody: { orderFeeEUR: fee } })), defaultCustody: { orderFeeEUR: fee } } as InvestorContext };
}

it('derives crypto targets from the profile and computes a fee-adjusted amount rather than a sample 200 EUR', () => {
  const request = req([pos(1, 'Crypto', 1000)], 1000);
  const plan = buildPortfolioAllocation(request);
  expect(plan.positions[0]).toMatchObject({ currentWeightPercent: 50, targetWeight: { percent: 10 },
    action: 'Verkaufen', amountEUR: 800.1, projectedWeightPercent: 10 });
  expect(plan).toMatchObject({ status: 'calculated', cashTargetPercent: 90, projectedCashEUR: 1799.1, feesEUR: 1 });
  expect(plan.positions[0].currentValueEUR).toBe(1000);
  expect(request.positions[0].price).toBe(1000);
});

it('honors confirmed targets above the generic crypto limit and does not silently normalize conflicting targets', () => {
  const request = withFacts(req([pos(1, 'Crypto', 1000)], 1000), { 1: { percent: 40, minPercent: 35, maxPercent: 45 } });
  const plan = buildPortfolioAllocation(request);
  expect(plan.positions[0]).toMatchObject({ source: 'user-confirmed', targetWeight: { percent: 40 }, action: 'Verkaufen', amountEUR: 200.4 });
  const conflicting = withFacts(req([pos(1, 'Crypto', 1000), pos(2, 'Stock', 1000)]), {
    1: { percent: 70, minPercent: 65, maxPercent: 75 }, 2: { percent: 50, minPercent: 45, maxPercent: 55 },
  });
  expect(buildPortfolioAllocation(conflicting)).toMatchObject({ status: 'blocked', positions: [
    { action: 'Prüfen', amountEUR: null, targetWeight: { percent: 70 } }, { action: 'Prüfen', amountEUR: null, targetWeight: { percent: 50 } },
  ] });
});

it('avoids selling within the confirmed band and uses fresh cash to dilute concentration', () => {
  const request = withFacts(req([pos(1, 'Crypto', 1000)], 1500), { 1: { percent: 40, minPercent: 35, maxPercent: 45 } });
  const plan = buildPortfolioAllocation(request);
  expect(plan.positions[0]).toMatchObject({ currentWeightPercent: 40, action: 'Halten', amountEUR: null });
  expect(plan.feesEUR).toBe(0);
});

it.each(['missing', 'foreign'] as const)('blocks the entire denominator for %s EUR valuation', mode => {
  const invalid = { ...pos(2, 'Bond', 500), ...(mode === 'missing' ? { price: null } : { currency: 'USD' }) };
  const plan = buildPortfolioAllocation(req([pos(1, 'Crypto', 1000), invalid]));
  expect(plan.status).toBe('blocked');
  expect(plan.positions.every(p => p.amountEUR === null && p.projectedWeightPercent === null)).toBe(true);
  expect(plan.positions.every(p => p.currentWeightPercent === null)).toBe(true);
});

it('reduces risk for short horizons, preserves cash equivalents, and does not label ELTIF as a liquid ETF', () => {
  const request = req([pos(1, 'Crypto', 1000), { ...pos(2, 'Fund', 1000), name: 'Apollo ELTIF' }, pos(3, 'CashEquivalent', 500)], 1000);
  request.profile.horizonYears = 2;
  const plan = buildPortfolioAllocation(request);
  expect(plan.positions[0].targetWeight!.percent).toBe(0);
  expect(plan.positions[1].targetWeight!.percent).toBe(0);
  expect(plan.positions[2]).toMatchObject({ source: 'cash-holding', action: 'Halten' });
  expect(plan.warnings.join(' ')).toContain('ELTIF');
});

it('does not invent amounts with unknown fees or trade small positions when fees exceed the cost limit', () => {
  const unknown = buildPortfolioAllocation(withFacts(req([pos(1, 'Crypto', 1000)]), {}, null));
  expect(unknown.positions[0]).toMatchObject({ action: 'Prüfen', amountEUR: null });
  const tiny = buildPortfolioAllocation(req([pos(1, 'Crypto', 10)]));
  expect(tiny.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null });
  expect(tiny.feesEUR).toBe(0);
});

it('calculates new purchases together with sales, reserves cash, and exposes the same numbers to funding validation', () => {
  const request = req([pos(1, 'Crypto', 10000)]);
  const candidates: NewAssetRecommendation[] = [
    { name: 'Fund A', isin: '', symbol: 'AAA', type: 'ETF', action: 'Kaufen', rationale: '', risk: '', sourceIndexes: [0] },
    { name: 'Fund B', isin: '', symbol: 'BBB', type: 'ETF', action: 'Kaufen', rationale: '', risk: '', sourceIndexes: [0] },
  ];
  const plan = buildPortfolioAllocation(request, candidates);
  expect(plan.positions[1].targetWeight!.percent).toBe(25);
  expect(plan.positions[2].targetWeight!.percent).toBe(25);
  expect(plan.positions[1].key).toBe(allocationCandidateKey(candidates[0]));
  const recommendations = [rec(1, 'Verkaufen', plan.positions[0].amountEUR)];
  const newAssetRecommendations = candidates.map((p, i) => ({ ...p, plannedAmountEUR: plan.positions[i + 1].amountEUR }));
  const funding = checkPortfolioFunding(request, { recommendations, newAssetRecommendations });
  expect(funding.status).toBe('conditional');
  expect(funding.balanceBeforeSpreadAndTaxEUR).toBe(plan.projectedCashEUR);
  expect(plan.projectedCashEUR).toBeGreaterThanOrEqual(plan.totalValueEUR * plan.cashTargetPercent / 100 - plan.feesEUR);
  expect(allocationMismatch(plan, recommendations, newAssetRecommendations)).toBeNull();
  expect(allocationMismatch(plan, [rec(1, 'Verkaufen', 200)], newAssetRecommendations)).toContain('lokal berechneten Betrag');
});

it('shrinks purchases rather than assuming all modeled sales will be executed in a single-asset analysis', () => {
  const request = withFacts(req([pos(1, 'ETF', 1000), pos(2, 'Crypto', 9000)], 500), {
    1: { percent: 50, minPercent: 45, maxPercent: 55 }, 2: { percent: 10, minPercent: 8, maxPercent: 12 },
  });
  request.targetAssetId = 1;
  const plan = buildPortfolioAllocation(request, [], { recommendations: [rec(2, 'Halten', null)] });
  expect(plan.positions[1].action).toBe('Halten');
  expect(plan.positions[0].amountEUR).toBeNull(); // Cash is below the agreed cash target.
  expect(plan.projectedCashEUR).toBe(500);
});

it('keeps individual stock and category caps and produces stable, nonnegative cash across profiles', () => {
  for (const risk of ['low', 'medium', 'high'] as const) for (const goal of ['growth', 'income', 'preservation'] as const) {
    const request = req([pos(1, 'Stock', 7300), pos(2, 'ETF', 1000), pos(3, 'Bond', 200), pos(4, 'Crypto', 900)], 1000);
    request.profile = { ...request.profile, risk, goal };
    const plan = buildPortfolioAllocation(request);
    expect(validPortfolioAllocation(plan)).toBe(true);
    expect(plan).toEqual(buildPortfolioAllocation(request));
    expect(plan.projectedCashEUR).toBeGreaterThanOrEqual(0);
    expect(plan.positions[0].targetWeight!.percent).toBeLessThanOrEqual(15);
    expect(plan.positions.reduce((sum, p) => sum + p.targetWeight!.percent, plan.cashTargetPercent)).toBeCloseTo(100);
    const net = plan.totalValueEUR - plan.feesEUR;
    expect(plan.positions.reduce((sum, p) => sum + p.projectedWeightPercent! * net / 100, plan.projectedCashEUR)).toBeCloseTo(net, 2);
  }
});

it('resizes buys to actual cash when the analysis defers a modeled sale, including one fee only', () => {
  const request = withFacts(req([pos(1, 'ETF', 1000), pos(2, 'Stock', 8000), pos(3, 'Crypto', 1000)], 1000), {
    1: { percent: 60, minPercent: 55, maxPercent: 65 }, 2: { percent: 30, minPercent: 25, maxPercent: 35 },
    3: { percent: 10, minPercent: 8, maxPercent: 12 },
  });
  const decisions = [rec(1, 'Kaufen', 999), rec(2, 'Halten', null), rec(3, 'Halten', null)];
  const plan = buildPortfolioAllocation(request, [], undefined, decisions);
  expect(plan.positions[0]).toMatchObject({ action: 'Kaufen', amountEUR: 999 });
  expect(plan.positions[0].reason).toContain('gekürzt');
  expect(plan.positions[1]).toMatchObject({ action: 'Halten', amountEUR: null });
  expect(plan).toMatchObject({ projectedCashEUR: 0, feesEUR: 1 });
  expect(allocationMismatch(plan, decisions)).toBeNull();
  expect(checkPortfolioFunding(request, { recommendations: decisions })).toMatchObject({ status: 'conditional', saleProceedsEUR: 0 });
});

it('reserves unchanged buy commitments during a single-asset update and blocks unknown existing fees', () => {
  const request = withFacts(req([pos(1, 'ETF', 1000), pos(2, 'Crypto', 1000)], 10000), {
    1: { percent: 70, minPercent: 65, maxPercent: 75 }, 2: { percent: 10, minPercent: 8, maxPercent: 12 },
  });
  request.targetAssetId = 1;
  const locked = { recommendations: [rec(2, 'Kaufen', 1500)] };
  const plan = buildPortfolioAllocation(request, [], locked);
  expect(plan.positions[0].amountEUR).toBe(6098.4);
  expect(plan.positions[1].amountEUR).toBe(1500);
  expect(plan.projectedCashEUR).toBe(2399.6);
  request.investorContext!.assets[1].custody.orderFeeEUR = null;
  expect(buildPortfolioAllocation(request, [], locked).status).toBe('blocked');
});

it('rejects malformed persisted allocation metadata while accepting valid blocked plans', () => {
  const plan = buildPortfolioAllocation(req([pos(1, 'Crypto', 1000)]));
  expect(validPortfolioAllocation({ ...plan, positions: null } as never)).toBe(false);
  expect(validPortfolioAllocation({ ...plan, cashTargetPercent: NaN })).toBe(false);
  expect(validPortfolioAllocation(buildPortfolioAllocation({ ...req([pos(1, 'Crypto', 1000)]), positions: [{ ...pos(1, 'Crypto', 1000), price: null }] }))).toBe(true);
});
