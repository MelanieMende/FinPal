import { checkPortfolioFunding } from './portfolioFunding';
import type { PortfolioAnalysisRequest, AssetRecommendation } from './portfolioAnalysis';

const request: PortfolioAnalysisRequest = { provider: 'api', priceUpdatedAt: null,
  profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 10 },
  positions: [{ id: 1, name: 'Seller', isin: '', symbol: '', type: 'Stock', shares: 2, price: 50,
    currency: 'EUR', costBasis: 60, dividendsEarned: 5, realizedGainLoss: 15 }],
};
const rec = (assetId: number, action: AssetRecommendation['action'], amount: number | null): AssetRecommendation => ({
  assetId, action, plannedAmountEUR: amount, rationale: 'Scenario', risk: 'Risk', sourceIndexes: [],
});
const buy = (amount: number | null) => ({ name: 'New', isin: '', symbol: 'NEW', type: 'ETF' as const,
  action: 'Kaufen' as const, plannedAmountEUR: amount, rationale: 'Scenario', risk: 'Risk', sourceIndexes: [0] });

it('funds purchases from cash and partial gross sales, subtracting fees on both sides without adding gains or dividends', () => {
  const result = checkPortfolioFunding(request, { recommendations: [rec(1, 'Verkaufen', 50)], newAssetRecommendations: [buy(54)] });
  expect(result).toMatchObject({ cashEUR: 10, saleProceedsEUR: 50, buyAmountEUR: 54, feeScenarioEUR: 4,
    balanceBeforeSpreadAndTaxEUR: 2, shortfallEUR: 0, status: 'conditional' });
  expect(result.warnings.join(' ')).toContain('Verkaufssteuern');
  expect(result.warnings.join(' ')).toContain('Gutschrift');
});

it('counts all existing and new purchases together rather than assigning the same budget to each', () => {
  const result = checkPortfolioFunding({ ...request, profile: { ...request.profile, buyBudget: 100 } }, {
    recommendations: [rec(1, 'Kaufen', 60)], newAssetRecommendations: [buy(60)],
  });
  expect(result).toMatchObject({ buyAmountEUR: 120, feeScenarioEUR: 4, balanceBeforeSpreadAndTaxEUR: -24, shortfallEUR: 24, status: 'insufficient' });
});

it('does not count sales beyond the held value or quotes in unknown currencies as available funding', () => {
  expect(checkPortfolioFunding(request, { recommendations: [rec(1, 'Verkaufen', 101)] })).toMatchObject({ status: 'unknown', saleProceedsEUR: 0 });
  expect(checkPortfolioFunding({ ...request, positions: [{ ...request.positions[0], currency: 'USD' }] }, {
    recommendations: [rec(1, 'Verkaufen', 50)],
  })).toMatchObject({ status: 'unknown', saleProceedsEUR: 0 });
});

it('marks missing amounts in old or incomplete recommendations as unconfirmed rather than zero-cost funded', () => {
  expect(checkPortfolioFunding(request, { recommendations: [rec(1, 'Verkaufen', null)], newAssetRecommendations: [buy(null)] }))
    .toMatchObject({ status: 'unknown', feeScenarioEUR: 4 });
});

it('balances currency in cents and does not reserve fees for hold or review recommendations', () => {
  expect(checkPortfolioFunding({ ...request, profile: { ...request.profile, buyBudget: 2.3 } }, {
    recommendations: [rec(1, 'Halten', null)], newAssetRecommendations: [buy(0.3)],
  })).toMatchObject({ status: 'conditional', balanceBeforeSpreadAndTaxEUR: 0 });
  expect(checkPortfolioFunding(request, { recommendations: [rec(1, 'Prüfen', null)] }))
    .toMatchObject({ status: 'no-trades', feeScenarioEUR: 0, balanceBeforeSpreadAndTaxEUR: 10 });
});
