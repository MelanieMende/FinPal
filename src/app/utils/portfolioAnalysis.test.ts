import { buildAnalysisPositions, validateAnalysisRequest, type PortfolioAnalysisRequest } from './portfolioAnalysis';

it('accepts a fund as a separate asset class without converting it to a stock or ETF', () => {
  const positions = buildAnalysisPositions([{ ID: 32, name: 'Apollo Global Private Markets ELTIF – A2 UNH', isin: 'LU3170240538', type: 'Fund', current_shares: 0.1, price: 109, currencySymbol: '€' }] as Asset[]);
  expect(positions[0].type).toBe('Fund');
  expect(() => validateAnalysisRequest({ provider: 'api', priceUpdatedAt: null, positions,
    profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 },
  })).not.toThrow();
});

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

it('uses confirmed bond nominal currency without inferring exposure from listing currency or ISIN', () => {
  const holding = { nominal: 180, currency: 'USD', source: 'user-confirmed' as const, purchaseAccruedInterestEUR: -0.17,
    transactions: [{ id: 112, date: '2025-11-03', nominal: 180, accruedInterestEUR: -0.17 }] };
  const positions = buildAnalysisPositions([
    { ID: 30, name: 'Treasury', type: 'Bond', isin: 'US912810SQ22', current_shares: 2, price: 46.55, currencySymbol: '€', bondHolding: holding },
    { ID: 31, name: 'ETF USD', type: 'ETF', isin: 'US0000000000', current_shares: 1, price: 50, currencySymbol: 'USD' },
    { ID: 32, name: 'Stock', type: 'Stock', current_shares: 1, price: 50, currencySymbol: 'USD' },
    { ID: 33, name: 'Bond without confirmation', type: 'Bond', current_shares: 1, price: 50, currencySymbol: 'USD' },
  ] as Asset[]);
  expect(positions[0].currencyExposure).toEqual({ kind: 'direct-nominal', currency: 'USD', source: 'user-confirmed' });
  expect(positions.slice(1).map(p => p.currencyExposure)).toEqual(['unknown', 'unknown', 'unknown']);
  const request: PortfolioAnalysisRequest = { provider: 'api', priceUpdatedAt: null, positions,
    profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 } };
  expect(() => validateAnalysisRequest(request)).not.toThrow();
  expect(() => validateAnalysisRequest({ ...request, positions: [{ ...positions[0],
    currencyExposure: { kind: 'direct-nominal', currency: 'EUR', source: 'user-confirmed' } }] })).toThrow(/Nominalwährung/);
  expect(() => validateAnalysisRequest({ ...request, positions: [{ ...positions[1],
    currencyExposure: positions[0].currencyExposure }] })).toThrow(/Nominalwährung/);
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
