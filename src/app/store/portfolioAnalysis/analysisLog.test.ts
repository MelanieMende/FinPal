import reducer, { analyzePortfolio, analysisProgressReceived } from './portfolioAnalysis.reducer';
import type { PortfolioAnalysisRequest } from '../../utils/portfolioAnalysis';

const request: PortfolioAnalysisRequest = {
  provider: 'api', reasoningEffort: 'high', priceUpdatedAt: null,
  profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 },
  positions: [{ id: 1, name: 'Testwert', symbol: 'TEST', isin: '', type: 'Stock', shares: 1, price: 10, currency: 'EUR', costBasis: null, dividendsEarned: 0, realizedGainLoss: 0 }],
};

it('records distinct progress, ignores heartbeats and records failures without discarding the log', () => {
  let state = reducer(undefined, analyzePortfolio.pending('run', { request, snapshot: '' }));
  state = reducer(state, analysisProgressReceived({ requestId: 'run', progress: { stage: 'risk-review', activeAssetId: 1, activeRiskStep: 'download', lastActivityAt: 100 } }));
  state = reducer(state, analysisProgressReceived({ requestId: 'run', progress: { stage: 'risk-review', activeAssetId: 1, activeRiskStep: 'download', lastActivityAt: 101 } }));
  state = reducer(state, analysisProgressReceived({ requestId: 'old', progress: { stage: 'analysis', lastActivityAt: 102 } }));
  expect(state.log?.entries.filter(entry => entry.progress?.activeRiskStep === 'download')).toHaveLength(1);
  expect(state.log?.entries.find(entry => entry.progress?.activeRiskStep === 'download')?.assetName).toBe('Testwert');
  state = reducer(state, analyzePortfolio.rejected(null, 'run', { request, snapshot: '' }, 'Abruf fehlgeschlagen'));
  expect(state.log?.status).toBe('failed');
  expect(state.log?.entries[state.log.entries.length - 1].message).toContain('Abruf fehlgeschlagen');
});
