import { buildInvestorContext, deriveAcquisitionHistory, newInvestorFacts, readInvestorFacts, saveInvestorFacts,
  seedInvestorFacts, validInvestorContext, validAssetInvestorFacts, investorFactsStorageKey } from './investorFacts';
import { buildTradeEconomics } from './tradeEconomics';
import { buildAnalysisPositions, validateAnalysisRequest, type PortfolioAnalysisRequest } from './portfolioAnalysis';

const asset = { ID: 1, name: 'Bitcoin', type: 'Crypto', symbol: 'BTC', isin: '', currencySymbol: '€', current_shares: 2, price: 100 } as Asset;
const trades = [
  { ID: 1, asset_ID: 1, date: '2025-01-01', type: 'Buy', amount: 2, price_per_share: 50 },
  { ID: 2, asset_ID: 1, date: '2025-02-01', type: 'Buy', amount: 1, price_per_share: 60 },
  { ID: 3, asset_ID: 1, date: '2025-03-01', type: 'Sell', amount: 1, price_per_share: 70 },
] as Transaction[];
beforeEach(() => localStorage.clear());

it('seeds confirmed Trade Republic custody for current assets and preserves per-asset changes', () => {
  const facts = readInvestorFacts('db-one', [asset]);
  expect(facts.assets[1].custody).toMatchObject({ provider: 'Trade Republic', source: 'user-confirmed', orderFeeEUR: 1 });
  facts.assets[1].custody = { kind: 'self-custody', provider: 'Own wallet', source: 'user-confirmed', orderFeeEUR: null, confirmedAt: '2026-10-09T10:00:00Z' };
  facts.assets[1].targetWeight = { percent: 40, minPercent: 30, maxPercent: 50 };
  facts.assets[1].confirmedAt = '2026-10-09T10:00:00Z';
  saveInvestorFacts('db-one', facts);
  expect(readInvestorFacts('db-one', [asset]).assets[1]).toEqual(facts.assets[1]);
  expect(readInvestorFacts('db-two', [asset]).assets[1].custody.provider).toBe('Trade Republic');
  facts.defaultCustody = { ...facts.defaultCustody, provider: 'Another broker', orderFeeEUR: 3 };
  const next = seedInvestorFacts(facts, [asset, { ...asset, ID: 2 }]);
  expect(next.assets[1].custody.provider).toBe('Own wallet');
  expect(next.assets[2].custody).toMatchObject({ provider: 'Another broker', source: 'default', orderFeeEUR: 3 });
});
it('recovers from corrupt storage and rejects invalid persisted targets and dates', () => {
  localStorage.setItem(investorFactsStorageKey('db'), '{broken');
  expect(readInvestorFacts('db', [asset]).assets[1].custody.provider).toBe('Trade Republic');
  const facts = readInvestorFacts('db', [asset]);
  facts.assets[1].targetWeight = { percent: 10, minPercent: 30, maxPercent: 20 };
  facts.taxResidencies = [{ country: 'DE', validFrom: '2026-02-30', confirmedAt: 'invalid' }];
  saveInvestorFacts('db', facts);
  const restored = readInvestorFacts('db', [asset]);
  expect(restored.assets[1].targetWeight).toBeNull();
  expect(restored.taxResidencies).toEqual([]);
});
it('derives remaining FIFO purchase dates and quantities without asserting a tax basis', () => {
  const history = deriveAcquisitionHistory(asset, trades.slice().reverse(), 'unknown');
  expect(history).toMatchObject({ coverage: 'unknown', firstPurchaseDate: '2025-01-01', lastPurchaseDate: '2025-02-01',
    reconcilesWithHolding: true, remainingLots: [
      { transactionId: 1, purchaseDate: '2025-01-01', quantity: 1, unitPrice: 50 },
      { transactionId: 2, purchaseDate: '2025-02-01', quantity: 1, unitPrice: 60 },
    ], allocationMethod: 'illustrative-FIFO-not-confirmed-tax-basis',
  });
  expect(deriveAcquisitionHistory(asset, [...trades, trades[0]], 'complete').remainingLots).toEqual(history.remainingLots);
});
it('orders same-day transactions by ID and exposes missing transfers and invalid data', () => {
  const sameDay = trades.map(t => ({ ...t, date: '2025-01-01' }));
  expect(deriveAcquisitionHistory(asset, sameDay.slice().reverse(), 'complete').reconcilesWithHolding).toBe(true);
  expect(deriveAcquisitionHistory(asset, [trades[2]], 'complete')).toMatchObject({ reconcilesWithHolding: false, unmatchedSoldQuantity: 1 });
  expect(deriveAcquisitionHistory(asset, [{ ...trades[0], date: undefined }, { ...trades[1], amount: NaN }] as Transaction[], 'complete').invalidTransactionCount).toBe(2);
  expect(deriveAcquisitionHistory({ ...asset, current_shares: 5 }, trades, 'complete').reconcilesWithHolding).toBe(false);
});
it('passes confirmed facts and acquisitions to analysis and keeps future tax residency inactive', () => {
  const facts = readInvestorFacts('db', [asset]);
  facts.taxResidencies = [{ country: 'DE', validFrom: '2020-01-01', confirmedAt: '2026-10-09T10:00:00Z' },
    { country: 'CH', validFrom: '2099-01-01', confirmedAt: '2026-10-09T10:00:00Z' }];
  facts.assets[1].historyCoverage = 'complete';
  facts.assets[1].confirmedAt = '2026-10-09T10:00:00Z';
  facts.assets[1].specialActivities = 'none';
  facts.assets[1].taxContext = 'private-direct-crypto';
  const context = buildInvestorContext(facts, [asset], trades);
  expect(validInvestorContext(context)).toBe(true);
  const position = buildAnalysisPositions([asset])[0];
  expect(buildTradeEconomics(position, context)).toMatchObject({ taxResidence: 'DE', taxResidenceValidFrom: '2020-01-01',
    custody: { provider: 'Trade Republic' }, acquisitionHistory: { coverage: 'complete', reconcilesWithHolding: true },
    taxContext: 'private-direct-crypto', taxCostBasis: 'unknown', taxSavingsEUR: null,
  });
  const request: PortfolioAnalysisRequest = { provider: 'api', profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 0 },
    positions: [position], priceUpdatedAt: null, investorContext: context };
  expect(() => validateAnalysisRequest(request)).not.toThrow();
  context.assets[0].targetWeight = { percent: 500, minPercent: 0, maxPercent: 100 };
  expect(() => validateAnalysisRequest(request)).toThrow(/dauerhaften Analyseangaben/);
});
it('does not apply Trade Republic order costs to a different custodian with unknown fees', () => {
  const facts = readInvestorFacts('db', [asset]);
  facts.assets[1].custody = { ...facts.assets[1].custody, provider: 'Other broker', orderFeeEUR: null };
  const context = buildInvestorContext(facts, [asset], trades);
  expect(buildTradeEconomics(buildAnalysisPositions([asset])[0], context).feeScenarios).toEqual([]);
  expect(validAssetInvestorFacts({ ...facts.assets[1], targetWeight: { percent: NaN, minPercent: 0, maxPercent: 100 } })).toBe(false);
  expect(newInvestorFacts().taxResidencies).toEqual([]);
});
