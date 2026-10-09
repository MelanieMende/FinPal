import { validTradeDecision, buildTradeDecisionContext } from './tradeDecision';
import { tradeDecisionFixture } from '../../testing/fixtures/tradeDecision';
import type { PortfolioAnalysisRequest } from './portfolioAnalysis';

it('accepts distinct sourced scenarios and distinguishes a published forecast from conditional assumptions', () => {
  expect(validTradeDecision(tradeDecisionFixture, 1)).toBe(true);
});
it.each([
  { ...tradeDecisionFixture, amountRationale: '' },
  { ...tradeDecisionFixture, profileFit: '' },
  { ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.slice(1) },
  { ...tradeDecisionFixture, scenarios: [tradeDecisionFixture.scenarios[0], tradeDecisionFixture.scenarios[0], tradeDecisionFixture.scenarios[2]] },
  { ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.map(s => ({ ...s, sourceIndexes: [1] })) },
  { ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.map(s => ({ ...s, sourceIndexes: [] as number[] })) },
  { ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.map(s => ({ ...s, asOf: null as string | null })) },
  { ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.map(s => ({ ...s, asOf: '2026-02-30' })) },
])('rejects incomplete or ungrounded decisions %#', value => {
  expect(validTradeDecision(value, 1)).toBe(false);
});
it('provides reproducible holdings weights with and without cash and flags missing EUR valuations', () => {
  const request = { profile: { buyBudget: 100 }, positions: [
    { id: 1, currency: 'EUR', shares: 2, price: 50 },
    { id: 2, currency: 'EUR', shares: 1, price: 300 },
    { id: 3, currency: 'unknown', shares: 1, price: null },
  ] } as PortfolioAnalysisRequest;
  expect(buildTradeDecisionContext(request)).toMatchObject({ heldValueEUR: 400, totalValueEUR: 500,
    incompleteValuation: true, positions: [
      { assetId: 1, shareOfHoldingsPercent: 25, shareIncludingCashPercent: 20 },
      { assetId: 2, shareOfHoldingsPercent: 75, shareIncludingCashPercent: 60 },
      { assetId: 3, shareOfHoldingsPercent: null, shareIncludingCashPercent: null },
    ],
  });
});
