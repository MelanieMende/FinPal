import { buildTradeEconomics } from './tradeEconomics';
import { buildAnalysisPositions } from './portfolioAnalysis';

it('calculates fee burden for the Arbor rest position without treating the loss as a tax refund', () => {
  const position = buildAnalysisPositions([{ ID: 12, name: 'Arbor', current_shares: 21.645021, price: 0.043,
    current_invest: -50.99999851, currencySymbol: '€', type: 'Stock', dividends_earned: 0 }] as Asset[])[0];
  const result = buildTradeEconomics(position);
  expect(result.marketValueEUR).toBeCloseTo(0.930735903);
  expect(result.feeScenarios[0].netProceedsBeforeSpreadAndTaxEUR).toBeCloseTo(-0.069264097);
  expect(result.feeScenarios[0].feePercent).toBeGreaterThan(100);
  expect(result.feeScenarios[1].netProceedsBeforeSpreadAndTaxEUR).toBeCloseTo(-1.069264097);
  expect(result.taxCostBasis).toBe('unknown');
  expect(result.taxSavingsEUR).toBeNull();
});

it('does not calculate EUR proceeds or an accounting loss from unknown currency or cost basis', () => {
  const position = buildAnalysisPositions([{ ID: 1, name: 'Asset', current_shares: 2, price: 50 }] as Asset[])[0];
  expect(buildTradeEconomics(position).marketValueEUR).toBeNull();
  expect(buildTradeEconomics({ ...position, currency: 'EUR' }).feeScenarios[0]).toMatchObject({
    netProceedsBeforeSpreadAndTaxEUR: 99, accountingGainLossEUR: null,
  });
});
