import { buildAnalysisPositions, validateAnalysisRequest, type PortfolioAnalysisRequest } from './portfolioAnalysis';

it('includes only held assets and keeps realized gains separate from their current market value', () => {
  const positions = buildAnalysisPositions([
    { ID: 1, name: 'Asset', type: 'Stock', symbol: 'A', isin: 'ISIN', current_shares: 2, price: 500, current_invest: 100, current_sum_in_out: 120, dividends_earned: 10 },
    { ID: 2, current_shares: 0 }, { ID: 3, is_watched: true },
    { ID: 4, name: 'Missing quote', current_shares: 1, price: NaN },
  ] as Asset[]);
  expect(positions.map(p => p.id)).toEqual([1, 4]);
  expect(positions[0]).toMatchObject({ realizedGainLoss: 30, costBasis: 100, price: 500, currency: 'unknown' });
  expect(positions[1]).toMatchObject({ price: null, costBasis: null, realizedGainLoss: null });
});

it('rejects a missing risk profile, duplicate assets and invalid amounts before transmitting data', () => {
  const request: PortfolioAnalysisRequest = {
    provider: 'chatgpt', model: 'account-model', priceUpdatedAt: null,
    profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 },
    positions: buildAnalysisPositions([{ ID: 1, name: 'Asset', current_shares: 1 }] as Asset[]),
  };
  expect(() => validateAnalysisRequest(request)).not.toThrow();
  expect(() => validateAnalysisRequest({ ...request, profile: { ...request.profile, risk: '' as any } })).toThrow(/Anlageziel/);
  expect(() => validateAnalysisRequest({ ...request, positions: [...request.positions, ...request.positions] })).toThrow(/Portfolio-Daten/);
  expect(() => validateAnalysisRequest({ ...request, profile: { ...request.profile, buyBudget: -1 } })).toThrow();
});
