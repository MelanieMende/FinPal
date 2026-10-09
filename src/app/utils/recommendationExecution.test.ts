import { getRecommendationExecution } from './recommendationExecution';
import type { AssetRecommendation, PortfolioAnalysisResult } from './portfolioAnalysis';

const rec: AssetRecommendation = { assetId: 1, action: 'Verkaufen', plannedAmountEUR: 50,
  rationale: '', risk: '', sourceIndexes: [], executionBaseline: { shares: 10, transactionIds: [1] } };
const report = { generatedAt: '2026-10-09T10:00:00Z' } as PortfolioAnalysisResult;
const assets = [{ ID: 1, current_shares: 9 }] as Asset[];
const sell = { ID: 2, asset_ID: 1, type: 'Sell', date: '2026-10-09', amount: 1, price_per_share: 50,
  fee: 1, in_out: 49 } as Transaction;
const check = (trades: Transaction[], recommendation = rec, snapshot = '', holdings = assets) =>
  getRecommendationExecution(recommendation, report, snapshot, holdings, trades);

it('matches the recorded gross 50 EUR sale even if net proceeds are 49 EUR', () => {
  expect(check([sell])).toEqual({ status: 'done', amountEUR: 50, remainingEUR: 0 });
});
it('ignores existing trades, other assets, opposite actions and old imported transactions', () => {
  expect(check([
    { ...sell, ID: 1 }, { ...sell, ID: 3, asset_ID: 2 }, { ...sell, ID: 4, type: 'Buy' },
    { ...sell, ID: 5, date: '2026-10-08' },
  ])).toEqual({ status: 'open', amountEUR: 0, remainingEUR: 50 });
});
it('aggregates partial fills once, and reopens if a recorded sale is removed', () => {
  const first = { ...sell, amount: 0.4 };
  expect(check([first, first])).toEqual({ status: 'partial', amountEUR: 20, remainingEUR: 30 });
  expect(check([first, { ...sell, ID: 3, amount: 0.6 }]).status).toBe('done');
  expect(check([]).status).toBe('open');
});
it('recognizes buys by the matching asset ID', () => {
  expect(check([{ ...sell, type: 'Buy' }], { ...rec, action: 'Kaufen' }).status).toBe('done');
});
it('does not turn hold/review recommendations or unknown target amounts into Done', () => {
  expect(check([sell], { ...rec, action: 'Halten' }).status).toBe('open');
  expect(check([sell], { ...rec, plannedAmountEUR: 0 }).status).toBe('partial');
  expect(check([sell], { ...rec, plannedAmountEUR: undefined }).remainingEUR).toBeNull();
});
it('uses changed holdings to recognize a same-day sale in an older saved analysis', () => {
  const legacy: AssetRecommendation = { ...rec, executionBaseline: undefined };
  const snapshot = JSON.stringify({ positions: [{ id: 1, shares: 10 }] });
  expect(check([sell], legacy, snapshot).status).toBe('done');
  expect(check([sell], legacy, snapshot, [{ ID: 1, current_shares: 10 }] as Asset[]).status).toBe('open');
  expect(check([sell], legacy, snapshot, [{ ID: 1, current_shares: 9.5 }] as Asset[]).amountEUR).toBe(25);
  expect(check([sell], legacy).status).toBe('open');
});
it('requires later executions for a refreshed single recommendation', () => {
  expect(check([sell], { ...rec, updatedAt: '2026-10-10T10:00:00Z' }).status).toBe('open');
  expect(check([{ ...sell, date: '2026-10-09T09:00:00Z' }]).status).toBe('open');
});
it('rejects invalid trade amounts and handles a fully sold asset with zero shares', () => {
  expect(check([{ ...sell, amount: NaN }, { ...sell, price_per_share: Infinity }]).status).toBe('open');
  expect(check([sell], rec, '', [{ ID: 1, current_shares: 0 }] as Asset[]).status).toBe('done');
});

it('recognizes the legacy fractional S&P 500 sale without rounding it below its 50 EUR target', () => {
  const legacy: AssetRecommendation = { ...rec, executionBaseline: undefined };
  const snapshot = JSON.stringify({ positions: [{ id: 1, shares: 5.879129 }] });
  const trade = { ...sell, amount: 1.018122, price_per_share: 49.11002807129205 };
  expect(check([trade], legacy, snapshot, [{ ID: 1, current_shares: 4.861007 }] as Asset[]))
    .toEqual({ status: 'done', amountEUR: 50, remainingEUR: 0 });
});

it('compares date-only trades with the Berlin calendar day around midnight', () => {
  const lateReport = { ...report, generatedAt: '2026-10-08T23:30:00Z' };
  const legacy: AssetRecommendation = { ...rec, executionBaseline: undefined };
  // 01:30 Berlin on October 9; the October 8 trade predates the recommendation.
  expect(getRecommendationExecution(legacy, lateReport, '', assets, [{ ...sell, date: '2026-10-08' }]).status).toBe('open');
});

it('does not reuse later share reductions as evidence for older same-day sales', () => {
  const legacy: AssetRecommendation = { ...rec, executionBaseline: undefined, plannedAmountEUR: 100 };
  const snapshot = JSON.stringify({ positions: [{ id: 1, shares: 10 }] });
  expect(check([sell, { ...sell, ID: 3, date: '2026-10-10' }], legacy, snapshot))
    .toEqual({ status: 'partial', amountEUR: 50, remainingEUR: 50 });
});
