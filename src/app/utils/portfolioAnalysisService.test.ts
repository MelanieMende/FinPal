/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { PortfolioAnalysisService, candidateResearchFunding, readAnalysisStream, validateAnalysisResult } from './portfolioAnalysisService';
import { ANALYSIS_TIMEOUT_MS, buildAnalysisPositions, type PortfolioAnalysisRequest } from './portfolioAnalysis';
import type { ChatGptAuth } from './chatGptAuth';
import { tradeDecisionFixture } from '../../testing/fixtures/tradeDecision';
import { buildInvestorContext, newInvestorFacts, seedInvestorFacts } from './investorFacts';
import { buildRobustForecastAllocation as buildForecastAllocation } from './robustForecastModel';
import { returnForecastFixture, returnForecastInputFixture } from '../../testing/fixtures/returnForecast';
import { robustReturnForecastFixture } from '../../testing/fixtures/robustForecast';
import { createCandidateMarketQuoteProvider } from './candidateMarketQuote';
import { etfReturnForecastFixture } from '../../testing/fixtures/etfHistory';
import { riskChecksFor } from './assetRiskPolicy';
import { PrimaryRiskResearch, type RiskDocumentSet } from './primaryRiskResearch';

jest.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn((value: string) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`)),
  decryptString: jest.fn((value: Buffer) => Buffer.from(value.toString().slice(10), 'base64').toString()),
} }));

const request: PortfolioAnalysisRequest = {
  provider: 'api', profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 100 }, priceUpdatedAt: null,
  positions: buildAnalysisPositions([{ ID: 1, name: 'Asset', current_shares: 2, price: 50, currencySymbol: '€' }] as Asset[]),
};
const noCandidateRequest = { ...request, profile: { ...request.profile, buyBudget: 0 } };
const newAsset = { name: 'New ETF', isin: 'IE00B4L5Y983', symbol: 'IWDA', type: 'ETF', action: 'Prüfen', rationale: 'Diversifikation [0]', risk: 'Marktrisiko', sourceIndexes: [0] };
const report = { summary: 'Portfolio prüfen', warnings: ['Kurszeitpunkt fehlt'], recommendations: [{ assetId: 1, action: 'Halten', rationale: 'Begründung [0]', risk: 'Marktrisiko', sourceIndexes: [0], tradeCheck: { costs: '100 EUR Marktwert; 1 EUR Gebuehr entspricht 1 %.', taxes: 'Steuerdaten fehlen; keine Erstattung bestaetigt.', conclusion: 'Halten.' } }], newAssetRecommendations: [newAsset] };
const research = { status: 'completed', output: [
  { type: 'web_search_call', status: 'completed' },
  { type: 'message', content: [{ type: 'output_text', text: 'Recherche', annotations: [{ type: 'url_citation', title: 'Emittent', url: 'https://example.com/report' }] }] },
] };
const structured = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(report) }] }] };
const apiResponsesWithUnavailableDocuments = (...responses: Response[]) => {
  const queue = [...responses];
  return jest.fn(async (url: RequestInfo | URL, _options?: RequestInit) => String(url).includes('/v1/responses')
    ? queue.shift() ?? new Response('', { status: 500 })
    : new Response('', { status: 404 }));
};

it('assesses a new ETF from its exact issuer document and saves the candidate review', async () => {
  const isin = 'IE00ZZZZZZZ1';
  const url = `https://www.ishares.com/example/${isin}`;
  const candidate = { ...newAsset, name: 'iShares Example ETF', isin, symbol: 'EXAMPLE' };
  const answer = { ...report, newAssetRecommendations: [candidate] };
  const html = `ISIN ${isin}. As of 2026-09-30. Investment objective tracks an index. Ongoing charges are 0.15 percent. Sector holdings are concentrated. Units may be redeemed daily. Securities lending creates counterparty risk. Currency exposure is USD. No material legal proceedings are reported.`;
  const quotes: Record<string, string> = {
    identity: `ISIN ${isin}.`, strategy: 'Investment objective tracks an index.', costs: 'Ongoing charges are 0.15 percent.',
    concentration: 'Sector holdings are concentrated.', liquidity: 'Units may be redeemed daily.',
    structure: 'Securities lending creates counterparty risk.', currency: 'Currency exposure is USD.',
    regulatory: 'No material legal proceedings are reported.',
  };
  const riskAnswer = { checks: riskChecksFor('ETF').map(flag => ({ flag, finding: 'risk', reason: 'Documented exposure.', documentIndex: 0, quote: quotes[flag] })), metrics: [] as unknown[] };
  const researched = { ...research, output: [{ type: 'web_search_call', status: 'completed' },
    { type: 'message', content: [{ type: 'output_text', text: 'Official product document', annotations: [{ type: 'url_citation', title: candidate.name, url }] }] }] };
  const fetcher = jest.fn(async (target: string, options?: RequestInit) => {
    if (target === url) return new Response(html, { headers: { 'content-type': 'text/html' } });
    const body = JSON.parse(String(options?.body ?? '{}'));
    if (body.text?.format?.name === 'primary_risk_assessment') {
      const input = JSON.parse(body.input[0].content);
      if (input.security.type === 'ETF' && !input.invalidChecks)
        return structuredResponse({ ...riskAnswer, checks: riskAnswer.checks.map(check => check.flag === 'identity' ? { ...check, quote: 'Text not in document.' } : check) });
      return structuredResponse(riskAnswer);
    }
    if (body.tools) return new Response(JSON.stringify(researched));
    return structuredResponse(answer);
  });
  const service = new PortfolioAnalysisService(dir, fetcher as unknown as typeof fetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze({ ...request, reasoningEffort: 'high' });
  const apiCalls = fetcher.mock.calls.filter(([target]) => target === 'https://api.openai.com/v1/responses');
  expect(apiCalls.length).toBeGreaterThan(1);
  expect(apiCalls.every(([, options]) => JSON.parse((options as RequestInit).body as string).reasoning.effort === 'high')).toBe(true);
  expect(result.fundamentalRisks?.find(item => item.key === `new:${isin}`)).toMatchObject({ status: 'assessed', structuralRisks: expect.arrayContaining(['structure']) });
  expect(apiCalls.map(([, options]) => JSON.parse((options as RequestInit).body as string))
    .some(body => body.text?.format?.name === 'primary_risk_assessment' && JSON.parse(body.input[0].content).invalidChecks?.includes('identity'))).toBe(true);
  expect(fetcher.mock.calls.filter(([target]) => target === url)).toHaveLength(1);
  expect(fs.existsSync(path.join(dir, 'portfolio-primary-risk-assessments.json'))).toBe(true);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()?.report.fundamentalRisks?.find(item => item.key === `new:${isin}`)?.status).toBe('assessed');
});

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-ai-test-')); jest.clearAllMocks(); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

it('stores the FinancialFilings key encrypted separately and removes it', () => {
  const service = new PortfolioAnalysisService(dir, jest.fn());
  service.saveFilingsKey('filings-secret-test');
  const keyFile = path.join(dir, 'portfolio-filings-key.bin');
  expect(service.status().hasFilingsKey).toBe(true);
  expect(fs.readFileSync(keyFile, 'utf8')).not.toContain('filings-secret-test');
  expect(safeStorage.encryptString).toHaveBeenCalledWith('filings-secret-test');
  service.forgetFilingsKey();
  expect(service.status().hasFilingsKey).toBe(false);
});

function seedSavedAnalysis(input: PortfolioAnalysisRequest) {
  const savedReport: import('./portfolioAnalysis').PortfolioAnalysisResult = {
    mode: 'ai', summary: 'Gespeicherte Analyse', infos: [], warnings: [], sources: [],
    generatedAt: new Date().toISOString(), priceUpdatedAt: input.priceUpdatedAt, model: 'test-model',
    recommendations: input.positions.map(position => ({ assetId: position.id, action: 'Halten', rationale: 'Gespeichert', risk: 'Offen', sourceIndexes: [] as number[] })),
    newAssetRecommendations: [], fundamentalRisks: [],
    allocationPlan: buildForecastAllocation(input, input.positions.map(position => robustReturnForecastFixture(String(position.id)))),
  };
  fs.writeFileSync(path.join(dir, 'portfolio-ai-last-analysis.json'), JSON.stringify({ version: 1, request: input, report: savedReport, snapshot: '' }));
  return savedReport;
}

it('restores older analyses without exposing the removed cash comparison', () => {
  const saved = seedSavedAnalysis(request);
  const robust = saved.allocationPlan!.optimization!.robust!;
  (robust as typeof robust & { cashOnlyComparison?: unknown }).cashOnlyComparison = { legacy: true };
  fs.writeFileSync(path.join(dir, 'portfolio-ai-last-analysis.json'), JSON.stringify({ version: 1, request, report: saved, snapshot: '' }));
  const restored = new PortfolioAnalysisService(dir, jest.fn()).getLastResult();
  expect(restored?.report.allocationPlan?.optimization?.robust).toBeDefined();
  expect(restored?.report.allocationPlan?.optimization?.robust).not.toHaveProperty('cashOnlyComparison');
});


it('shows cached reports after a local analysis without attributing them to a different ISIN', async () => {
  const position = { ...request.positions[0], type: 'Stock' as const, isin: 'CA03880B1040', symbol: 'ABR' };
  const source = { title: 'Report', url: 'https://example.com/report.pdf' };
  const fetchedAt = Date.now() - 3 * 86400000;
  fs.writeFileSync(path.join(dir, 'portfolio-primary-risk-documents.json'), JSON.stringify({ version: 3, documents: [
    { source, excerpt: 'Report', hash: 'hash', fetchedAt, period: null },
  ] }));
  fs.writeFileSync(path.join(dir, 'portfolio-primary-risk-assessments.json'), JSON.stringify({ version: 1, records: [
    { key: String(position.id), isin: position.isin, fingerprint: 'old', checkedAt: fetchedAt, checks: [], sources: [source] },
  ] }));
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  seedSavedAnalysis({ ...request, positions: [position] });
  const [status] = await service.getPrimaryDocumentStatus([position]);
  expect(status).toMatchObject({ sources: [source], loadedAt: new Date(fetchedAt).toISOString(), needsRefresh: true });
  expect((await service.getPrimaryDocumentStatus([{ ...position, isin: 'CA0000000000' }]))[0].sources).toEqual([]);
});

it('does not request forecasts for a concretely blocked holding and still analyzes another holding', async () => {
  const blockedReason = 'Die unklare Fortführung verhindert eine belastbare Entscheidung über dieses Asset.';
  const positions = [{ ...request.positions[0], type: 'Stock' as const, name: 'Blocked', isin: 'US0000000001' },
    { ...request.positions[0], id: 2, type: 'Stock' as const, name: 'Available', isin: 'US0000000002' }];
  const documents: RiskDocumentSet = { documents: [{ source: { title: 'Report', url: 'https://example.com/report' }, excerpt: 'Net income and liquidity.', hash: 'hash', fetchedAt: Date.now(), period: '2026-09-30' }], gaps: [], discoveryChecked: true };
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  const provider = jest.fn(async (position: { id: number }) => robustReturnForecastFixture(String(position.id), { referencePrice: 50, targetPrice: 60 }));
  const fetcher = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    const body = JSON.parse(options?.body as string);
    if (body.tools) return new Response(JSON.stringify(research));
    if (body.text?.format?.name === 'primary_risk_assessment') {
      const security = JSON.parse(body.input[0].content).security;
      return structuredResponse({ checks: riskChecksFor('Stock').map(flag => ({ flag, finding: 'unknown', reason: 'Angabe nicht belegt.', documentIndex: null as null, quote: '' })), metrics: [],
        decisionBlocker: security.name === 'Blocked' ? { flag: 'going-concern', reason: blockedReason } : null });
    }
    return structuredResponse({ ...report, newAssetRecommendations: [], recommendations: [
      { ...report.recommendations[0], action: 'Kaufen', rationale: 'Modellvorschlag [0]', plannedAmountEUR: 20 },
      { ...report.recommendations[0], assetId: 2 },
    ] });
  });
  try {
    const service = new PortfolioAnalysisService(dir, fetcher, undefined, provider);
    service.saveKey('sk-testOnlyNotARealKey');
    const result = await service.analyze({ ...request, profile: { ...request.profile, buyBudget: 0 }, positions });
    expect(provider.mock.calls.map(([position]) => position.id)).toEqual([2]);
    expect(result.fundamentalRisks?.find(risk => risk.key === '1')?.decisionBlocker?.reason).toBe(blockedReason);
    expect(result.recommendations.find(rec => rec.assetId === 1)).toMatchObject({ action: 'Prüfen', executionBlocker: 'independent' });
    expect(result.allocationPlan?.positions.find(position => position.key === '1')).toMatchObject({ action: 'Prüfen', amountEUR: null });
    const refreshed = await service.refreshPrimaryRisk(positions[0]);
    expect(refreshed.recommendations.find(rec => rec.assetId === 1)).toMatchObject({ action: 'Prüfen', executionBlocker: 'independent', rationale: expect.stringContaining(blockedReason) });
    expect(refreshed.allocationPlan?.optimization?.forecasts.some(forecast => forecast.key === '1')).toBe(false);
    await expect(service.refreshMarketForecast({ ...request, profile: { ...request.profile, buyBudget: 0 }, positions }, 1)).rejects.toThrow(/Datenblocker/);
    expect(provider.mock.calls.map(([position]) => position.id)).toEqual([2]);
  } finally { collect.mockRestore(); }
});

it('rechecks invalid risk evidence for a holding during the full analysis', async () => {
  const position = { ...request.positions[0], type: 'Stock' as const, isin: 'US0000001234', name: 'Example' };
  const source = { title: 'Report', url: 'https://example.com/report' };
  const documents: RiskDocumentSet = { documents: [{ source, excerpt: 'Cash and debt obligations may strain liquidity.', hash: 'hash', fetchedAt: Date.now(), period: '2026-09-30' }], gaps: [], discoveryChecked: true };
  const checks = riskChecksFor('Stock').map(flag => ({ flag, finding: 'unknown', reason: 'Offen.', documentIndex: null as number | null, quote: '' }));
  const fetcher = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body));
    if (body.tools) return new Response(JSON.stringify(research));
    if (body.text?.format?.name === 'primary_risk_assessment') {
      const correction = !!JSON.parse(body.input[0].content).invalidChecks;
      return structuredResponse({ checks: checks.map(check => check.flag === 'financing' ? { ...check, finding: 'risk', documentIndex: 0,
        quote: correction ? 'Cash and debt obligations may strain liquidity.' : 'A fabricated debt quote.' } : check), metrics: [], decisionBlocker: null });
    }
    return structuredResponse({ ...report, newAssetRecommendations: [] });
  });
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  try {
    const service = new PortfolioAnalysisService(dir, fetcher, undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
    service.saveKey('sk-testOnlyNotARealKey');
    const result = await service.analyze({ ...request, profile: { ...request.profile, buyBudget: 0 }, positions: [position] });
    expect(result.fundamentalRisks?.find(risk => risk.key === '1')?.materialRisks).toContain('financing');
    expect(fetcher.mock.calls.some(([, options]) => {
      const body = JSON.parse(String(options?.body));
      return body.text?.format?.name === 'primary_risk_assessment' && JSON.parse(body.input[0].content).invalidChecks?.includes('financing');
    })).toBe(true);
  } finally { collect.mockRestore(); }
});

it('refreshes only the selected asset research and keeps the existing analysis recommendation', async () => {
  const oldResearch = { assetId: 1, query: 'Asset', fetchedAt: Date.now() - 60_000, searchStatus: 'completed' as const, newsCount: 1,
    text: 'Vorherige Recherche', sources: [{ title: 'Alte Quelle', url: 'https://example.com/old' }] };
  const newResearch = { ...oldResearch, fetchedAt: Date.now(), text: 'Aktuelle Recherche',
    sources: [{ title: 'Neue Quelle', url: 'https://example.com/new' }] };
  const onlineProvider = jest.fn().mockResolvedValueOnce(oldResearch).mockResolvedValueOnce(newResearch);
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('1', { targetPrice: 60 })), undefined, onlineProvider);
  seedSavedAnalysis(request);
  const original = await service.refreshOnlineResearch(request.positions[0]);
  const previousResearchTime = service.getResearchStatus(request.positions)[0].fetchedAt;

  const refreshed = await service.refreshOnlineResearch({
    id: 1, name: request.positions[0].name, isin: request.positions[0].isin,
    symbol: request.positions[0].symbol, type: request.positions[0].type,
  });

  expect(onlineProvider).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 1 }), { forceRefresh: true });
  expect(refreshed.recommendations[0].rationale).toBe(original.recommendations[0].rationale);
  expect(refreshed.recommendations[0].sourceIndexes).toEqual(original.recommendations[0].sourceIndexes);
  expect(refreshed.sources).toContainEqual(newResearch.sources[0]);
  expect(service.getResearchStatus(request.positions)[0].fetchedAt).not.toBe(previousResearchTime);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()?.report.sources).toContainEqual(newResearch.sources[0]);
});

it('refreshes research for a newly held asset absent from the saved analysis', async () => {
  const addedAsset = { id: 2, name: 'New holding', symbol: 'NEW', isin: 'EXAMPLE', type: 'Stock' as const };
  const onlineProvider = jest.fn().mockImplementation(async (asset) => ({ assetId: asset.id, query: asset.name,
    fetchedAt: Date.now(), searchStatus: 'completed', newsCount: 1, text: 'Recherche',
    sources: [{ title: 'Neue Quelle', url: 'https://example.com/new-holding' }] }));
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('1')), undefined, onlineProvider);
  const original = seedSavedAnalysis(request);
  const refreshed = await service.refreshOnlineResearch(addedAsset);
  expect(onlineProvider).toHaveBeenLastCalledWith(addedAsset, { forceRefresh: true });
  expect(refreshed.recommendations).toEqual(original.recommendations);
  expect(service.getResearchStatus([addedAsset])[0].fetchedAt).not.toBeNull();
  expect(service.getResearchStatus([addedAsset])[0]).toMatchObject({ text: 'Recherche', sources: [{ title: 'Neue Quelle', url: 'https://example.com/new-holding' }] });
  expect(service.getLastResult()?.report.sources).toContainEqual({ title: 'Neue Quelle', url: 'https://example.com/new-holding' });
});

it('refreshes with current search identifiers and exposes the matching cached result', async () => {
  const onlineProvider = jest.fn().mockImplementation(async asset => ({ assetId: asset.id, query: asset.name,
    fetchedAt: Date.now(), searchStatus: 'completed', newsCount: 1, text: `Recherche für ${asset.symbol}`,
    sources: [{ title: 'Neue Quelle', url: 'https://example.com/new' }] }));
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('1')), undefined, onlineProvider);
  seedSavedAnalysis(request);
  const current = { id: 1, name: 'Aktueller Name', isin: request.positions[0].isin, symbol: 'NEW', type: 'Stock' as const };
  await service.refreshOnlineResearch(current);
  expect(onlineProvider).toHaveBeenLastCalledWith(current, { forceRefresh: true });
  expect(service.getResearchStatus([current])[0]).toMatchObject({ text: 'Recherche für NEW', sources: [{ title: 'Neue Quelle', url: 'https://example.com/new' }] });
});

it('saves a completed search with no sources and reports the empty result after restart', async () => {
  const onlineProvider = jest.fn().mockResolvedValue({ assetId: 1, query: 'Asset', fetchedAt: Date.now(), searchStatus: 'completed', newsCount: 0,
    text: 'Keine Nachrichtentreffer.', sources: [] });
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('1')), undefined, onlineProvider);
  seedSavedAnalysis(request);
  await service.refreshOnlineResearch(request.positions[0]);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getResearchStatus(request.positions)[0])
    .toMatchObject({ text: 'Keine Nachrichtentreffer.', sources: [], fetchedAt: expect.any(String) });
});

it('loads primary documents for a new holding without changing the saved portfolio analysis', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'New holding', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  const original = seedSavedAnalysis(request);
  const source = { title: 'Issuer report', url: 'https://example.com/report' };
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValueOnce({ documents: [{ source, excerpt: 'Report', hash: 'hash', fetchedAt: Date.now(), period: null }], discoveryChecked: true, gaps: [] })
    .mockResolvedValueOnce({ documents: [], discoveryChecked: false, gaps: ['Keine Primärquelle zugeordnet.'] });
  try {
    const updated = await service.refreshPrimaryRisk(added, undefined, undefined, true);
    expect(updated.recommendations).toEqual(original.recommendations);
    expect(updated.allocationPlan).toEqual(original.allocationPlan);
    expect(updated.fundamentalRisks?.find(risk => risk.key === '2')).toMatchObject({ primaryDocuments: [source], primaryDocumentsChanged: true });
    expect(service.getLastResult()?.report.fundamentalRisks?.find(risk => risk.key === '2')).toMatchObject({ primaryDocuments: [source], primaryDocumentIdentity: { type: 'Stock', isin: 'EXAMPLE' } });
    const failed = await service.refreshPrimaryRisk(added, undefined, undefined, true);
    expect(failed.fundamentalRisks?.find(risk => risk.key === '2')).toMatchObject({ primaryDocuments: [source], primaryDocumentGaps: ['Keine Primärquelle zugeordnet.'] });
  } finally { collect.mockRestore(); }
});

it('records an empty primary document search without claiming reports were loaded', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'New holding', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  seedSavedAnalysis(request);
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue({ documents: [], discoveryChecked: false, gaps: ['Keine Primärquelle zugeordnet.'] });
  try {
    const updated = await service.refreshPrimaryRisk(added, undefined, undefined, true);
    expect(updated.fundamentalRisks?.find(risk => risk.key === '2')).toMatchObject({ primaryDocuments: [], primaryDocumentGaps: ['Keine Primärquelle zugeordnet.'] });
    expect(updated.fundamentalRisks?.find(risk => risk.key === '2')?.primaryDocumentsChanged).not.toBe(true);
    expect(service.getLastResult()?.report.fundamentalRisks?.find(risk => risk.key === '2')?.primaryDocumentGaps).toEqual(['Keine Primärquelle zugeordnet.']);
  } finally { collect.mockRestore(); }
});

it('checks the newly loaded document list during an individual refresh and keeps documents if the check fails', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'New holding', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  seedSavedAnalysis(request);
  const source = { title: 'New report', url: 'https://example.com/new-report' };
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue({ documents: [{ source, excerpt: 'Report', hash: 'hash', fetchedAt: Date.now(), period: null }], discoveryChecked: true, gaps: [] });
  const status = jest.spyOn(PrimaryRiskResearch.prototype, 'publicationStatus').mockReturnValue({ freshnessSupported: true, freshnessCheckedAt: null, freshnessCheckSucceeded: null, freshnessDue: true, newerReportAvailable: false, publicationCheckVerified: false });
  const check = jest.spyOn(PrimaryRiskResearch.prototype, 'checkPublicationFreshness').mockRejectedValue(new Error('SEC unavailable'));
  try {
    const updated = await service.refreshPrimaryRisk(added, undefined, undefined, true);
    expect(check).toHaveBeenCalledWith(added, [source]);
    expect(updated.fundamentalRisks?.find(risk => risk.key === '2')?.primaryDocuments).toEqual([source]);
  } finally { collect.mockRestore(); status.mockRestore(); check.mockRestore(); }
});

it('assesses a new holding using its loaded documents and persists the result without altering the saved portfolio', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'New holding', type: 'Stock', isin: 'US0000001234', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const source = { title: 'Issuer report', url: 'https://example.com/report' };
  const documents: RiskDocumentSet = { documents: [{ source, excerpt: 'Net loss and liquidity are discussed.', hash: 'hash', fetchedAt: Date.now(), period: null }], discoveryChecked: true, gaps: [] };
  const answer = { checks: riskChecksFor('Stock').map(flag => ({ flag, finding: 'unknown', reason: 'Keine ausreichende Textstelle.', documentIndex: null as number | null, quote: '' })), metrics: [] as unknown[] };
  const fetcher = jest.fn().mockResolvedValue(structuredResponse(answer));
  const service = new PortfolioAnalysisService(dir, fetcher, undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  service.saveKey('sk-testOnlyNotARealKey');
  const original = seedSavedAnalysis(request);
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  const cachedStatus = jest.spyOn(PrimaryRiskResearch.prototype, 'cachedStatus').mockReturnValue({ loadedAt: new Date().toISOString(), freshnessCheckedAt: new Date().toISOString(), needsRefresh: false });
  const reuse = jest.spyOn(PrimaryRiskResearch.prototype, 'reuseCached').mockReturnValue(documents);
  try {
    await service.refreshPrimaryRisk(added, undefined, undefined, true);
    collect.mockClear();
    const refreshed = await service.refreshPrimaryRisk(added);
    expect(collect).not.toHaveBeenCalled();
    expect(reuse).toHaveBeenCalled();
    expect(refreshed.recommendations).toEqual(original.recommendations);
    expect(refreshed.allocationPlan).toEqual(original.allocationPlan);
    const risk = refreshed.fundamentalRisks?.find(item => item.key === '2');
    expect(risk).toMatchObject({ primaryDocuments: [source], primaryDocumentIdentity: { type: 'Stock', isin: 'US0000001234' }, primaryDocumentsCheckedAt: expect.any(String) });
    expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()?.report.fundamentalRisks?.find(item => item.key === '2')).toMatchObject({ primaryDocumentIdentity: { type: 'Stock', isin: 'US0000001234' }, primaryDocumentsCheckedAt: expect.any(String) });
    expect((await service.getPrimaryDocumentStatus([added]))[0].loadedAt).not.toBeNull();
  } finally { collect.mockRestore(); cachedStatus.mockRestore(); reuse.mockRestore(); }
});

it('rechecks a missing net income after a documented loss and retains the first risk findings', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'Example', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const source = { title: 'Report', url: 'https://example.com/report' };
  const excerpt = 'Nine months ended September 2026, in USD millions. Net loss was (123).';
  const documents: RiskDocumentSet = { documents: [{ source, excerpt, hash: 'hash', fetchedAt: Date.now(), period: '2026-09-30' }], discoveryChecked: true, gaps: [] };
  const checks = riskChecksFor('Stock').map(flag => flag === 'loss-making'
    ? { flag, finding: 'risk', reason: 'Verlust belegt.', documentIndex: 0, quote: 'Net loss was (123).' }
    : { flag, finding: 'unknown', reason: 'Offen.', documentIndex: null as number | null, quote: '' });
  const fetcher = jest.fn().mockResolvedValueOnce(structuredResponse({ checks, metrics: [], decisionBlocker: null }))
    .mockResolvedValueOnce(structuredResponse({ checks, metrics: [{ name: 'net-income', value: -123, unit: 'Mio. USD', period: 'Neun Monate bis September 2026', documentIndex: 0, quote: 'Net loss was (123).' }], decisionBlocker: null }));
  const service = new PortfolioAnalysisService(dir, fetcher, undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  service.saveKey('sk-testOnlyNotARealKey');
  seedSavedAnalysis(request);
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  try {
    const updated = await service.refreshPrimaryRisk(added);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const record = JSON.parse(fs.readFileSync(path.join(dir, 'portfolio-primary-risk-assessments.json'), 'utf8')).records.find((item: { key: string }) => item.key === '2');
    expect(record.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'net-income', value: -123 })]));
    expect(record.checks).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'loss-making', finding: 'risk' })]));
    expect(updated.fundamentalRisks?.find(item => item.key === '2')?.primaryDocumentGaps).not.toEqual(expect.arrayContaining([expect.stringMatching(/^net-income:/)]));
  } finally { collect.mockRestore(); }
});

it('rechecks an invalid financing quote without turning missing continuity evidence into a finding', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'Example', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const source = { title: 'Report', url: 'https://example.com/report' };
  const documents: RiskDocumentSet = { documents: [{ source, excerpt: 'Cash and debt obligations may strain liquidity.', hash: 'hash', fetchedAt: Date.now(), period: null }], discoveryChecked: true, gaps: [] };
  const base = riskChecksFor('Stock').map(flag => ({ flag, finding: 'unknown', reason: 'Offen.', documentIndex: null as number | null, quote: '' }));
  const invalid = base.map(check => check.flag === 'financing' ? { ...check, finding: 'risk', documentIndex: 0, quote: 'A fabricated debt quote.' } : check);
  const corrected = base.map(check => check.flag === 'financing' ? { ...check, finding: 'risk', reason: 'Finanzierungsrisiko.', documentIndex: 0, quote: 'Cash and debt obligations may strain liquidity.' } : check);
  const fetcher = jest.fn().mockResolvedValueOnce(structuredResponse({ checks: invalid, metrics: [], decisionBlocker: null }))
    .mockResolvedValueOnce(structuredResponse({ checks: corrected, metrics: [], decisionBlocker: null }));
  const service = new PortfolioAnalysisService(dir, fetcher, undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  service.saveKey('sk-testOnlyNotARealKey');
  seedSavedAnalysis(request);
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  try {
    await service.refreshPrimaryRisk(added);
    const record = JSON.parse(fs.readFileSync(path.join(dir, 'portfolio-primary-risk-assessments.json'), 'utf8')).records.find((item: { key: string }) => item.key === '2');
    expect(record.checks).toEqual(expect.arrayContaining([expect.objectContaining({ flag: 'financing', finding: 'risk' }), expect.objectContaining({ flag: 'going-concern', finding: 'unknown' })]));
    expect(record.gaps).not.toEqual(expect.arrayContaining([expect.stringMatching(/^financing:/)]));
  } finally { collect.mockRestore(); }
});

it('rechecks a missing debt maturity when the document contains a dated principal amount', async () => {
  const added = buildAnalysisPositions([{ ID: 2, name: 'Example', type: 'Stock', isin: 'EXAMPLE', symbol: 'NEW', current_shares: 1, price: 20 }] as Asset[])[0];
  const source = { title: 'Report', url: 'https://example.com/report' };
  const excerpt = 'As of September 30, 2026 the note has a principal amount of $2.2 billion, maturing in March 2034.';
  const documents: RiskDocumentSet = { documents: [{ source, excerpt, hash: 'hash', fetchedAt: Date.now(), period: '2026-09-30' }], discoveryChecked: true, gaps: [] };
  const checks = riskChecksFor('Stock').map(flag => ({ flag, finding: 'unknown', reason: 'Offen.', documentIndex: null as number | null, quote: '' }));
  const fetcher = jest.fn().mockResolvedValueOnce(structuredResponse({ checks, metrics: [], decisionBlocker: null }))
    .mockResolvedValueOnce(structuredResponse({ checks, metrics: [{ name: 'debt-maturities', value: 2.2, unit: 'Mrd. USD', period: 'Stand 2026-09-30; Fälligkeit März 2034', documentIndex: 0, quote: excerpt }], decisionBlocker: null }));
  const service = new PortfolioAnalysisService(dir, fetcher, undefined, jest.fn().mockResolvedValue(robustReturnForecastFixture('1')));
  service.saveKey('sk-testOnlyNotARealKey');
  seedSavedAnalysis(request);
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  try {
    await service.refreshPrimaryRisk(added);
    const record = JSON.parse(fs.readFileSync(path.join(dir, 'portfolio-primary-risk-assessments.json'), 'utf8')).records.find((item: { key: string }) => item.key === '2');
    expect(record.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'debt-maturities', value: 2.2, period: expect.stringContaining('2034') })]));
    expect(record.gaps).not.toEqual(expect.arrayContaining([expect.stringMatching(/^debt-maturities:/)]));
  } finally { collect.mockRestore(); }
});

it('does not replace cached research or the saved report when a refresh search fails', async () => {
  const oldResearch = { assetId: 1, query: 'Asset', fetchedAt: Date.now() - 60_000, searchStatus: 'completed' as const, newsCount: 1,
    text: 'Vorherige Recherche', sources: [{ title: 'Alte Quelle', url: 'https://example.com/old' }] };
  const failedResearch = { ...oldResearch, fetchedAt: Date.now(), searchStatus: 'failed' as const,
    sources: [{ title: 'Ungeprüfte Quelle', url: 'https://example.com/failed' }] };
  const onlineProvider = jest.fn().mockResolvedValueOnce(oldResearch).mockResolvedValueOnce(failedResearch);
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('1', { targetPrice: 60 })), undefined, onlineProvider);
  seedSavedAnalysis(request);
  const original = await service.refreshOnlineResearch(request.positions[0]);
  const previousResearchTime = service.getResearchStatus(request.positions)[0].fetchedAt;

  await expect(service.refreshOnlineResearch({
    id: 1, name: request.positions[0].name, isin: request.positions[0].isin,
    symbol: request.positions[0].symbol, type: request.positions[0].type,
  })).rejects.toThrow('konnte nicht erfolgreich abgeschlossen werden');

  expect(service.getResearchStatus(request.positions)[0].fetchedAt).toBe(previousResearchTime);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()?.report.sources).toEqual(original.sources);
});

it('reuses deterministic held-asset discovery and runs one cached sourced search for new ideas', async () => {
  const onlineProvider = jest.fn().mockResolvedValue({ assetId: 1, query: 'Asset', fetchedAt: Date.now(), searchStatus: 'completed', newsCount: 1,
    text: 'Deterministische Suche für Asset 1', sources: [{ title: 'Aktuelle Meldung', url: 'https://example.com/report' }] });
  const noIdeas = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(noIdeas));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined,
    undefined, undefined, onlineProvider);
  service.saveKey('sk-testOnlyNotARealKey');
  const progress: import('./portfolioAnalysis').PortfolioAnalysisProgress[] = [];
  const result = await service.analyze(request, event => progress.push(event));
  expect(result.mode).toBe('ai');
  expect(onlineProvider).toHaveBeenCalledTimes(1);
  expect(progress.findIndex(event => event.stage === 'research')).toBeLessThan(progress.findIndex(event => event.stage === 'preparing'));
  expect(progress).toEqual(expect.arrayContaining([
    expect.objectContaining({ activeAssetId: 1, logDetail: expect.stringContaining('Online-Suche neu ausgeführt'), researchCompleted: 1, researchTotal: 1 }),
    expect.objectContaining({ logDetail: 'Online-Recherche wurde ausgeführt', researchCompleted: 1, researchTotal: 1 }),
  ]));
  expect(mockedFetch).toHaveBeenCalled();
  const bodies = mockedFetch.mock.calls.map(([, options]) => JSON.parse(options?.body as string));
  expect(bodies.filter(body => body.tools)).toHaveLength(1);
  const firstAnalysis = bodies.findIndex(body => !body.tools);
  const ideaSearch = bodies.findIndex(body => body.tools);
  expect(firstAnalysis).toBeLessThan(ideaSearch);
  expect(JSON.parse(bodies[ideaSearch].input[0].content)).toMatchObject({ securities: [], heldSecurities: [expect.objectContaining({ id: 1 })] });
  expect(bodies[ideaSearch].instructions).toContain('Recherchiere zusätzlich bis zu fünf konkrete');
  expect(JSON.parse(bodies[firstAnalysis].input[0].content).research).toContain('Deterministische Suche');
  expect(service.getResearchStatus(request.positions)[0].fetchedAt).not.toBeNull();
  const reusedProgress: import('./portfolioAnalysis').PortfolioAnalysisProgress[] = [];
  await service.analyze(request, event => reusedProgress.push(event));
  expect(reusedProgress).toEqual(expect.arrayContaining([
    expect.objectContaining({ activeAssetId: 1, logDetail: expect.stringContaining('Gespeicherte Recherche'), researchCompleted: 1, researchTotal: 1 }),
    expect.objectContaining({ logDetail: 'Online-Recherche wurde ausgeführt', researchCompleted: 1, researchTotal: 1 }),
  ]));
  expect(onlineProvider).toHaveBeenCalledTimes(1);
  expect(mockedFetch.mock.calls.map(([, options]) => JSON.parse(options?.body as string)).filter(body => body.tools)).toHaveLength(1);
});

it('does not search for new ideas when held analysis has no free cash or usable sales', async () => {
  const noCash = { ...request, profile: { ...request.profile, buyBudget: 0 } };
  const onlineProvider = jest.fn().mockResolvedValue({ assetId: 1, query: 'Asset', fetchedAt: Date.now(), searchStatus: 'completed', newsCount: 0,
    text: 'Recherche', sources: [{ title: 'Quelle', url: 'https://example.com/report' }] });
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse({ ...report, newAssetRecommendations: [] }));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, undefined, undefined, onlineProvider);
  service.saveKey('sk-testOnlyNotARealKey');
  const events: import('./portfolioAnalysis').PortfolioAnalysisProgress[] = [];
  const result = await service.analyze(noCash, event => events.push(event));
  expect(result.newAssetRecommendations).toEqual([]);
  expect(mockedFetch.mock.calls.some(([, options]) => !!options?.body && !!JSON.parse(options?.body as string).tools)).toBe(false);
  expect(events.some(event => event.logDetail?.includes('Keine Recherche neuer Kaufideen'))).toBe(true);
});

it('funds idea research only with unreserved cash or supported non-blocked sales', () => {
  const noCash = { ...request, profile: { ...request.profile, buyBudget: 0 } };
  const sale = { assetId: 1, action: 'Verkaufen' as const, rationale: 'Verkauf', risk: 'Risiko', sourceIndexes: [0], plannedAmountEUR: 50, executionBlocker: null as null };
  expect(candidateResearchFunding(noCash, [sale])).toMatchObject({ eligibleSales: 50, candidateBudget: 49 });
  expect(candidateResearchFunding(noCash, [{ ...sale, action: 'Prüfen', executionBlocker: 'independent' }]).candidateBudget).toBe(0);
  expect(candidateResearchFunding(noCash, [{ ...sale, plannedAmountEUR: null }]).candidateBudget).toBe(0);
  expect(candidateResearchFunding(noCash, [{ ...sale, plannedAmountEUR: 200 }]).candidateBudget).toBe(0);
  expect(candidateResearchFunding(noCash, [{ ...sale, orderRecommendation: { type: 'stop', validity: 'day', execution: 'manual-trade-republic', priceInstruction: 'Abstand prüfen', rationale: 'Schutz' } }]).candidateBudget).toBe(0);
  expect(candidateResearchFunding(request, []).candidateBudget).toBe(100);
});

it('reuses a persisted primary-document risk review without another AI risk request', async () => {
  const stockRequest = { ...request, positions: request.positions.map(position => ({ ...position,
    name: "McDonald's", isin: 'US5801351017', symbol: 'MCD', type: 'Stock' as const })) };
  const onlineProvider = jest.fn().mockResolvedValue({ assetId: 1, query: 'MCD', fetchedAt: Date.now(),
    searchStatus: 'completed', newsCount: 0, text: 'Suchdaten', sources: [{ title: 'Suchquelle', url: 'https://example.com/report' }] });
  const riskAnswer = { checks: ['loss-making', 'low-margin', 'financing', 'going-concern', 'regulatory'].map(flag => ({
    flag, finding: 'unknown', reason: 'Auszug genügt nicht.', documentIndex: null as number | null, quote: '',
  })), metrics: [] as unknown[] };
  const mockedFetch = jest.fn(async (url: string, options?: RequestInit) => {
    if (url.includes('/submissions/')) return new Response(JSON.stringify({ filings: { recent: { form: ['10-Q'],
      accessionNumber: ['0000063908-26-000073'], primaryDocument: ['mcd-20260630.htm'], reportDate: ['2026-06-30'] } } }));
    if (url.includes('/Archives/')) return new Response('<html>Net income and cash and cash equivalents were reported.</html>',
      { headers: { 'content-type': 'text/html' } });
    const body = JSON.parse(String(options?.body));
    if (body.tools) return new Response(JSON.stringify(research));
    return structuredResponse(body.text?.format?.name === 'primary_risk_assessment' ? riskAnswer : report);
  });
  const first = new PortfolioAnalysisService(dir, mockedFetch as unknown as typeof fetch, undefined, undefined, undefined, onlineProvider);
  first.saveKey('sk-testOnlyNotARealKey');
  await first.analyze(stockRequest);
  const second = new PortfolioAnalysisService(dir, mockedFetch as unknown as typeof fetch, undefined, undefined, undefined, onlineProvider);
  expect((await second.getPrimaryDocumentStatus(stockRequest.positions))[0]).toMatchObject({ assetId: 1, needsRefresh: false,
    loadedAt: expect.any(String) });
  expect((await second.getPrimaryDocumentStatus([{ ...stockRequest.positions[0], isin: 'US0000000000' }]))[0].needsRefresh).toBe(true);
  const progress = jest.fn();
  await second.analyze(stockRequest, progress);
  const riskCalls = mockedFetch.mock.calls.filter(([url, options]) => !url.includes('/submissions/') && !url.includes('/Archives/') &&
    JSON.parse(String(options?.body)).text?.format?.name === 'primary_risk_assessment');
  expect(riskCalls).toHaveLength(1);
  expect(onlineProvider).toHaveBeenCalledTimes(1);
  expect(progress.mock.calls.some(([value]) => value.stage === 'risk-review' && value.reusedRiskAssetIds?.includes(1))).toBe(true);
  expect(progress.mock.calls.some(([value]) => value.activeRiskStep === 'reuse')).toBe(true);
  expect(second.getLastResult()?.report.fundamentalRisks?.[0].status).toBe('unknown');
  const documentCalls = mockedFetch.mock.calls.filter(([url]) => url.includes('/Archives/')).length;
  const refreshed = await second.refreshPrimaryRisk(stockRequest.positions[0]);
  expect(mockedFetch.mock.calls.filter(([url]) => url.includes('/Archives/'))).toHaveLength(documentCalls);
  expect(mockedFetch.mock.calls.filter(([url, options]) => !url.includes('/submissions/') && !url.includes('/Archives/') &&
    JSON.parse(String(options?.body)).text?.format?.name === 'primary_risk_assessment')).toHaveLength(2);
  expect(second.getLastResult()?.report.fundamentalRisks).toEqual(refreshed.fundamentalRisks);
  const status = (await second.getPrimaryDocumentStatus(stockRequest.positions))[0];
  expect(status).toMatchObject({ freshnessCheckSucceeded: true, freshnessCheckedAt: expect.any(String), freshnessDue: false });
  const submissionCalls = () => mockedFetch.mock.calls.filter(([url]) => url.includes('/submissions/')).length;
  const beforeDueCheck = submissionCalls();
  await second.getPrimaryDocumentStatus(stockRequest.positions);
  expect(submissionCalls()).toBe(beforeDueCheck);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(status.freshnessCheckedAt!) + 86400000);
  try {
    const restarted = new PortfolioAnalysisService(dir, mockedFetch as unknown as typeof fetch, undefined, undefined, undefined, onlineProvider);
    expect((await restarted.getPrimaryDocumentStatus(stockRequest.positions))[0].freshnessDue).toBe(true);
    expect(submissionCalls()).toBe(beforeDueCheck);
    await restarted.analyze(stockRequest);
    expect(submissionCalls()).toBeGreaterThan(beforeDueCheck);
    expect((await restarted.getPrimaryDocumentStatus(stockRequest.positions))[0]).toMatchObject({ freshnessDue: false, freshnessCheckSucceeded: true, freshnessCheckedAt: new Date(Date.now()).toISOString() });
    expect(mockedFetch.mock.calls.filter(([url]) => url.includes('/Archives/'))).toHaveLength(documentCalls);
  } finally { clock.mockRestore(); }
});

it('uses current confirmed investor context when refreshing asset risks', async () => {
  const asset = { ID: 31, name: 'Bitcoin', type: 'Crypto', current_shares: 1, price: 50000, currencySymbol: '€',
    isin: 'BTC', symbol: 'BTC', brokerProduct: { kind: 'direct-crypto', source: 'trade-republic', instrumentId: 'BTC', instrumentType: 'crypto' } } as Asset;
  const position = buildAnalysisPositions([asset]);
  const facts = seedInvestorFacts(newInvestorFacts(), [asset]);
  facts.taxResidencies = [{ country: 'DE', validFrom: '2020-01-01', confirmedAt: new Date().toISOString() }];
  const currentContext = buildInvestorContext(facts, [asset], []);
  const oldContext = buildInvestorContext(seedInvestorFacts(newInvestorFacts(), [asset]), [asset], []);
  const localRequest: PortfolioAnalysisRequest = { ...request, positions: position, investorContext: oldContext };
  const service = new PortfolioAnalysisService(dir, jest.fn(), undefined,
    jest.fn().mockResolvedValue(robustReturnForecastFixture('31', { targetPrice: 60000 })));
  seedSavedAnalysis(localRequest);
  const providerPolicy = 'Trade Republic Bank GmbH is a credit institution licensed in Germany and a crypto-asset services provider under Regulation (EU) 2023/1114 on Markets in Crypto-Assets (MiCAR).';
  const documents: RiskDocumentSet = { documents: [{ source: { title: 'Trade Republic Crypto Execution Policy',
    url: 'https://assets.traderepublic.com/assets/files/EN_ExecutionPolicy.pdf' }, excerpt: providerPolicy,
    hash: 'trade-republic-policy', fetchedAt: Date.now(), period: null, identity: 'trade-republic-casp', excerptVersion: 2 }],
    gaps: [], discoveryChecked: false };
  const collect = jest.spyOn(PrimaryRiskResearch.prototype, 'collect').mockResolvedValue(documents);
  try {
    const refreshed = await service.refreshPrimaryRisk({ id: 31, name: 'Bitcoin', type: 'Crypto', isin: 'BTC', symbol: 'BTC' }, currentContext);
    expect(refreshed.fundamentalRisks?.find(risk => risk.key === '31')?.rationale)
      .toContain('Regulatorische Risiken: offen');
    expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()?.report.fundamentalRisks?.find(risk => risk.key === '31')
      ?.rationale).toContain('Regulatorische Risiken: offen');
    expect(collect).toHaveBeenCalledTimes(1);
  } finally { collect.mockRestore(); }
});

it('loads a local ETF history model for a new review candidate and passes the joint calculation back without exposing daily arrays', async () => {
  const f = etfReturnForecastFixture('0');
  const candidate = { ...newAsset, name: 'Small-cap ETF USD (Acc)', isin: 'IE00BF4RFH31', symbol: 'WSML' };
  const answer = { ...report, newAssetRecommendations: [candidate] };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(answer));
  const quotes = createCandidateMarketQuoteProvider({ requestFetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({
    isin: candidate.isin, lastPrice: f.referencePrice, currency: { originalValue: 'EUR' }, mic: 'XETR', tradedInPercent: false,
    timestampLastPrice: new Date(Date.now() - 60000).toISOString(),
  }))) });
  const provider = jest.fn(async position => position.id === 0 ? f : robustReturnForecastFixture(String(position.id), { targetPrice: 40 }));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, provider, quotes);
  service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze({ ...request, priceUpdatedAt: new Date().toISOString(), positions: request.positions.map(position => ({ ...position, currency: 'EUR' })) });
  expect(provider.mock.calls.find(([position]) => position.id === 0)?.[0]).toMatchObject({ isin: candidate.isin, symbol: 'IUSN.DE', type: 'ETF', currency: 'EUR', shares: 0 });
  const correctionCall = mockedFetch.mock.calls.find(([, options]) => { const input = JSON.parse(options?.body as string).input; return input.length > 1 && JSON.parse(input.at(-1).content).correction?.candidateMarketForecasts?.length; });
  if (typeof correctionCall?.[1]?.body !== 'string') throw new Error('Expected a candidate forecast correction request');
  const correction = JSON.parse(JSON.parse(correctionCall[1].body).input.at(-1).content).correction;
  expect(correction.candidateMarketForecasts[0]).toMatchObject({ key: 'new:IE00BF4RFH31', model: { kind: 'etf-history-v1' } });
  expect(correction.candidateMarketForecasts[0].riskHistory).toBeUndefined();
  expect(correction.allocationPlan.optimization.inputs.some((input: { key: string }) => input.key === 'new:IE00BF4RFH31')).toBe(true);
  expect(result.allocationPlan!.optimization!.forecasts.find(item => item.key === 'new:IE00BF4RFH31')?.riskHistory).toBeDefined();
  expect(result.newAssetRecommendations?.[0].action).toBe('Prüfen');
  expect(result.newAssetRecommendations?.[0].plannedAmountEUR ?? null).toBeNull();
  expect(service.getLastResult()?.report.allocationPlan).toEqual(result.allocationPlan);
  expect(provider.mock.calls.filter(([position]) => position.id === 0)).toHaveLength(1);
});

it('includes IS3N local history in the joint candidate budget optimization', async () => {
  const f = etfReturnForecastFixture('0');
  const candidate = { ...newAsset, name: 'iShares Core MSCI EM IMI UCITS ETF USD (Acc)',
    isin: 'IE00BKM4GZ66', symbol: 'IS3N', action: 'Prüfen' as const };
  const answer = { ...report, newAssetRecommendations: [candidate] };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(answer));
  const quotes = createCandidateMarketQuoteProvider({ requestFetch: jest.fn().mockResolvedValue(new Response(JSON.stringify({
    isin: candidate.isin, lastPrice: f.referencePrice, currency: { originalValue: 'EUR' }, mic: 'XETR', tradedInPercent: false,
    timestampLastPrice: new Date(Date.now() - 60000).toISOString(),
  }))) });
  const provider = jest.fn(async position => position.id === 0 ? f : robustReturnForecastFixture(String(position.id), { targetPrice: 40 }));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, provider, quotes);
  service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze({ ...request, priceUpdatedAt: new Date().toISOString(),
    profile: { ...request.profile, buyBudget: 267.84 }, positions: request.positions.map(position => ({ ...position, currency: 'EUR' })) });
  expect(provider.mock.calls.find(([position]) => position.id === 0)?.[0]).toMatchObject({
    isin: candidate.isin, symbol: 'IS3N.DE', price: f.referencePrice, type: 'ETF', currency: 'EUR', shares: 0,
  });
  const correctionCall = mockedFetch.mock.calls.find(([, options]) => { const input = JSON.parse(options?.body as string).input; return input.length > 1 && JSON.parse(input.at(-1).content).correction?.candidateMarketForecasts?.length; });
  if (typeof correctionCall?.[1]?.body !== 'string') throw new Error('Expected a candidate forecast correction request');
  const correction = JSON.parse(JSON.parse(correctionCall[1].body).input.at(-1).content).correction;
  expect(correction.candidateMarketForecasts[0]).toMatchObject({ key: 'new:IE00BKM4GZ66', model: { kind: 'etf-history-v1' } });
  expect(correction.allocationPlan.optimization.inputs.some((input: { key: string }) => input.key === 'new:IE00BKM4GZ66')).toBe(true);
  expect(result.allocationPlan!.optimization!.forecasts.some(item => item.key === 'new:IE00BKM4GZ66')).toBe(true);
});

it('reassesses new candidates with locally fetched EUR quotes and persists them without forcing a purchase', async () => {
  const now = Date.now();
  const candidate = { ...newAsset, name: 'iShares MSCI World Small Cap UCITS ETF USD (Acc)', isin: 'IE00BF4RFH31', symbol: 'WSML',
    rationale: 'EUR-Kurs fehlt [0]' };
  const first = { ...report, newAssetRecommendations: [candidate] };
  const corrected = { ...report, newAssetRecommendations: [{ ...candidate, rationale: 'EUR-Kurs vorhanden [1]; Prognosebasis fehlt.', sourceIndexes: [0, 1] }] };
  const quoteFetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ isin: candidate.isin, lastPrice: 9.103,
    currency: { originalValue: 'EUR' }, mic: 'XETR', tradedInPercent: false, timestampLastPrice: new Date(now - 60000).toISOString() })));
  let analyses = 0;
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(++analyses < 3 ? first : corrected));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, undefined,
    createCandidateMarketQuoteProvider({ requestFetch: quoteFetch }));
  service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  const body = mockedFetch.mock.calls.map(([, options]) => JSON.parse(options?.body as string))
    .find(item => item.input.length > 1 && JSON.parse(item.input.at(-1).content).correction?.candidateMarketQuotes?.length);
  const correction = JSON.parse(body.input.at(-1).content).correction;
  expect(correction.candidateMarketQuotes).toMatchObject([{ key: 'new:IE00BF4RFH31', quote: { price: 9.103, symbol: 'IUSN.DE', exchange: 'XETR' } }]);
  expect(correction.sources[1].url).toContain(candidate.isin);
  expect(body.text.format.schema.properties.newAssetRecommendations.items.properties.sourceIndexes.items.maximum).toBe(1);
  expect(result.newAssetRecommendations?.[0]).toMatchObject({ action: 'Prüfen', symbol: 'WSML', marketQuote: { price: 9.103, currency: 'EUR', symbol: 'IUSN.DE' } });
  expect(result.newAssetRecommendations?.[0].plannedAmountEUR ?? null).toBeNull();
  expect(service.getLastResult()?.report.newAssetRecommendations?.[0]?.marketQuote).toEqual(result.newAssetRecommendations?.[0]?.marketQuote);
  expect(quoteFetch).toHaveBeenCalledTimes(1);
  expect(request.positions[0].symbol).toBe('');
});

it('continues the remaining analysis when candidate quotes cannot be fetched and ignores model-supplied quotes', async () => {
  const injected = { ...report, newAssetRecommendations: [{ ...newAsset, marketQuote: { price: 123, currency: 'EUR' } }] };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(injected));
  const provider = jest.fn().mockRejectedValue(new Error('Unavailable'));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, undefined, provider);
  service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(result.recommendations).toHaveLength(1);
  expect(result.newAssetRecommendations?.[0].marketQuote).toBeNull();
  expect(result.infos).toEqual(expect.arrayContaining([expect.stringContaining('EUR-Kursabruf geprüft')]));
  expect(mockedFetch).toHaveBeenCalledTimes(4);
});

it('uses stored investor facts in analysis while keeping acquisition lots out of web research', async () => {
  const assets = [{ ID: 1, current_shares: 2, price: 50 }] as Asset[];
  const facts = seedInvestorFacts(newInvestorFacts(), assets);
  facts.taxResidencies = [{ country: 'CH', validFrom: '2020-01-01', confirmedAt: '2026-10-09T10:00:00Z' }];
  facts.assets[1] = { ...facts.assets[1], historyCoverage: 'complete', confirmedAt: '2026-10-09T10:00:00Z',
    targetWeight: { percent: 50, minPercent: 40, maxPercent: 60 } };
  const investorContext = buildInvestorContext(facts, assets, [
    { ID: 71, asset_ID: 1, date: '2025-06-12', type: 'Buy', amount: 2, price_per_share: 30 },
  ] as Transaction[]);
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const decisionDetails = { reserveEUR: 30, plannedWithdrawalsEUR: 20, lossCapacityEUR: 100, notes: 'Private cash planning', confirmedAt: new Date().toISOString() };
  await service.analyze({ ...request, investorContext, profile: { ...request.profile, decisionDetails } });
  const apiCalls = mockedFetch.mock.calls.filter(([url]) => url.includes('/v1/responses'));
  const researchBody = JSON.parse(apiCalls[0][1]!.body as string);
  const analysisBody = JSON.parse(apiCalls[1][1]!.body as string);
  const publicInput = JSON.parse(researchBody.input[0].content);
  expect(publicInput.taxJurisdiction).toBe('CH');
  expect(researchBody.input[0].content).not.toContain('remainingLots');
  expect(researchBody.input[0].content).not.toContain('2025-06-12');
  expect(publicInput.profile).toBeUndefined();
  expect(researchBody.input[0].content).not.toContain('Private cash planning');
  const input = JSON.parse(analysisBody.input[0].content);
  expect(input.portfolio.investorContext).toEqual(investorContext);
  expect(input.portfolio.profile.decisionDetails).toEqual(decisionDetails);
  expect(analysisBody.instructions).toContain('Verlusttragfähigkeit');
  expect(input.tradeEconomics[0]).toMatchObject({ taxResidence: 'CH', custody: { provider: 'Trade Republic' },
    acquisitionHistory: { coverage: 'complete', remainingLots: [{ transactionId: 71 }] } });
  expect(analysisBody.instructions).toContain('Bekannte Angaben niemals pauschal als unbekannt');
  expect(analysisBody.instructions).toContain('Eine unbestätigte Historie allein verlangt weder die Aktion Prüfen');
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'portfolio-ai-last-analysis.json'), 'utf8')).request.investorContext).toEqual(investorContext);
});

it('accepts zero allocations from the schema without retrying or failing the entire analysis', async () => {
  const zeroReport = { ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: 0 }],
    newAssetRecommendations: [{ ...newAsset, plannedAmountEUR: 0 }],
  };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(zeroReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(mockedFetch).toHaveBeenCalledTimes(4);
  expect(result.recommendations[0].plannedAmountEUR).toBeNull();
  expect(result.newAssetRecommendations?.[0].plannedAmountEUR).toBeNull();
  expect(result.fundingCheck!.status).toBe('no-trades');
  expect(service.getLastResult()?.report).toEqual(result);
  expect(zeroReport.recommendations[0].plannedAmountEUR).toBe(0);
});

it('requires a sourced hold-versus-reduce decision for new sales while restoring older reports', () => {
  const sources = [{ title: 'Source', url: 'https://example.com' }];
  const sell = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Verkaufen', plannedAmountEUR: 50 }] };
  expect(() => validateAnalysisResult(sell, request, sources)).not.toThrow();
  expect(() => validateAnalysisResult(sell, request, sources, true)).toThrow(/Halten oder jetzt reduzieren/);
  const complete = { ...sell, recommendations: [{ ...sell.recommendations[0], tradeDecision: tradeDecisionFixture }] };
  expect(validateAnalysisResult(complete, request, sources, true).recommendations[0].tradeDecision).toEqual(tradeDecisionFixture);
  const invalid = { ...complete, recommendations: [{ ...complete.recommendations[0], tradeDecision: {
    ...tradeDecisionFixture, scenarios: tradeDecisionFixture.scenarios.map(s => ({ ...s, sourceIndexes: [5] })),
  } }] };
  expect(() => validateAnalysisResult(invalid, request, sources, true)).toThrow(/Verkaufsabwägung/);
});

it('researches sourced outlooks and requests a profile-aware timing decision without exposing holdings to web research', async () => {
  const saleRequest = { ...request, priceUpdatedAt: new Date(Date.now()).toISOString(), positions: [{ ...request.positions[0], shares: 20 }], profile: { ...request.profile, buyBudget: 1000 } };
  const amount = buildForecastAllocation(saleRequest, [returnForecastFixture()]).positions[0].amountEUR;
  const sellReport = { ...report, optimizationInputs: [returnForecastInputFixture()], newAssetRecommendations: [] as typeof report.newAssetRecommendations, recommendations: [{ ...report.recommendations[0],
    action: 'Prüfen', plannedAmountEUR: amount, tradeDecision: tradeDecisionFixture,
  }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(sellReport)).mockResolvedValueOnce(structuredResponse(sellReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(saleRequest);
  expect(result.recommendations[0].tradeDecision).toEqual(tradeDecisionFixture);
  expect(service.getLastResult()?.report.recommendations[0].tradeDecision).toEqual(tradeDecisionFixture);
  const researchBody = JSON.parse(mockedFetch.mock.calls[0][1]!.body as string);
  const analysisBody = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
  expect(researchBody.instructions).toContain('Veröffentlichungsdatum, Zeithorizont');
  expect(researchBody.input[0].content).not.toContain('shares');
  expect(analysisBody.instructions).toContain('Konzentration allein ist kein Beleg');
  expect(analysisBody.instructions).toContain('hohem Risiko und langem Horizont');
  expect(analysisBody.instructions).not.toContain('Keine garantierten Renditen, Kursprognosen');
  const schema = analysisBody.text.format.schema.properties.recommendations.items;
  expect(schema.required).toContain('tradeDecision');
  expect(schema.properties.tradeDecision.properties.scenarios.minItems).toBe(3);
  expect(JSON.parse(analysisBody.input[0].content).decisionContext).toMatchObject({ heldValueEUR: 1000,
    totalValueEUR: 2000, positions: [{ assetId: 1, shareIncludingCashPercent: 50 }],
  });
  expect(result.allocationPlan!.positions[0].amountEUR).toBe(amount);
  expect(analysisBody.instructions).not.toContain('beispielhaften EUR-Betrag');
  expect(analysisBody.instructions).toContain('12-Monats-Erwartungen');
  expect(result.allocationPlan!.method).toBe('forecast-mean-variance-v1');
  expect(result.allocationPlan!.optimization!.status).toBe('converged');
});

it('does not accept a legacy source link as a completed corporate risk review', async () => {
  const r = { ...request, profile: { ...request.profile, buyBudget: 1000 }, priceUpdatedAt: new Date().toISOString() };
  const f = robustReturnForecastFixture('1', { targetPrice: 100 });
  const first = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations,
    fundamentalRisks: [{ key: '1', status: 'assessed', materialRisks: ['loss-making'], rationale: 'Cited synthetic loss.', sourceIndexes: [0] }],
    recommendations: [{ ...report.recommendations[0], action: 'Kaufen', plannedAmountEUR: 99 }] };
  const correction = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations, fundamentalRisks: [] as typeof first.fundamentalRisks, recommendations: [{ ...report.recommendations[0], action: 'Halten', plannedAmountEUR: null as number | null }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(first)).mockResolvedValueOnce(structuredResponse(correction));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, jest.fn().mockResolvedValue(f)); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(r);
  expect(result.fundamentalRisks![0]).toMatchObject({ status: 'unknown', materialRisks: [] });
  expect(result.allocationPlan!.warnings.join(' ')).toContain('Risikoprüfung');
  expect(result.allocationPlan!.optimization!.robust!.decisionStatus).toBe('no-trades');
  expect(result.recommendations[0]).toMatchObject({ action: 'Halten', plannedAmountEUR: null });
  expect(result.fundingCheck!.status).toBe('no-trades');
  expect(service.getLastResult()!.report.allocationPlan!.optimization!.robust!.decisionStatus).toBe('no-trades');
  for (const call of mockedFetch.mock.calls.slice(1)) {
    const body = JSON.parse(call[1].body);
    expect(body.input.map((input: { content: string }) => input.content).join(' ')).not.toContain('riskHistory');
  }
});

it('does not spend a correction request to override missing primary document evidence', async () => {
  const request = noCandidateRequest;
  const r = { ...request, profile: { ...request.profile, buyBudget: 1000 }, priceUpdatedAt: new Date().toISOString(),
    positions: request.positions.map(position => ({ ...position, type: 'Stock' as const, currency: 'EUR' })) };
  const forecast = robustReturnForecastFixture('1', { referencePrice: 50, targetPrice: 100 });
  const unknown = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations, fundamentalRisks: [
    { key: '1', status: 'unknown', materialRisks: [] as string[], rationale: 'Nicht ausgewertet.', sourceIndexes: [] as number[] },
  ] };
  const assessed = { ...unknown, fundamentalRisks: [
    { key: '1', status: 'assessed', materialRisks: [] as string[], rationale: 'Aktueller Bericht geprüft; kein bindendes Merkmal belegt.', sourceIndexes: [0] },
  ] };
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(unknown));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, jest.fn().mockResolvedValue(forecast));
  service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(r);
  expect(mockedFetch.mock.calls.filter(([, options]) => !JSON.parse(options?.body as string).tools)).toHaveLength(2);
  expect(result.fundamentalRisks).toContainEqual(expect.objectContaining({ key: '1', status: 'unknown', materialRisks: [] }));
  expect(result.allocationPlan!.warnings.join(' ')).toContain('Risikoprüfung');
});

it('uses structured market forecasts in the local optimizer without requiring AI-generated optimization inputs', async () => {
  const currentTime = new Date().toISOString();
  const forecastRequest = { ...request, priceUpdatedAt: currentTime, refreshMarketForecasts: true, positions: [{ ...request.positions[0],
    name: 'Munich Re', symbol: 'MUV2.DE', isin: 'DE0008430026', type: 'Stock' as const, currency: 'EUR',
  }] };
  const forecast = returnForecastFixture('1', { publisher: 'Yahoo Finance analyst consensus', referencePriceAsOf: currentTime });
  const expectedPlan = buildForecastAllocation(forecastRequest, [forecast]);
  const expectedPosition = expectedPlan.positions[0];
  const optimizedReport = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations,
    recommendations: [{ ...report.recommendations[0], action: expectedPosition.action, plannedAmountEUR: expectedPosition.amountEUR,
      ...(expectedPosition.action === 'Verkaufen' ? { tradeDecision: tradeDecisionFixture } : {}) }],
  };
  const marketProvider = jest.fn().mockResolvedValue(forecast);
  const mockedFetch = apiResponsesWithUnavailableDocuments(new Response(JSON.stringify(research)),
    structuredResponse(optimizedReport), structuredResponse(optimizedReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, marketProvider); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(forecastRequest);
  const analysisInput = JSON.parse(JSON.parse(mockedFetch.mock.calls.filter(([url]) => String(url).includes('/v1/responses'))[1][1]!.body as string).input[0].content);
  expect(marketProvider).toHaveBeenCalledWith(forecastRequest.positions[0], { forceRefresh: true });
  expect(analysisInput.marketForecasts).toEqual([forecast]);
  expect(analysisInput.portfolio.refreshMarketForecasts).toBeUndefined();
  expect(result.allocationPlan!.optimization).toMatchObject({ status: 'converged', forecasts: [forecast] });
  expect(result.sources).toEqual(expect.arrayContaining(forecast.forecastSources));
});

it('refreshes all persisted forecasts and allocation without calling the AI analysis', async () => {
  const currentTime = new Date().toISOString();
  const forecastRequest = { ...request, priceUpdatedAt: currentTime, positions: [{ ...request.positions[0],
    name: 'Munich Re', symbol: 'MUV2.DE', isin: 'DE0008430026', type: 'Stock' as const, currency: 'EUR',
  }] };
  const initialForecast = returnForecastFixture('1', { targetPrice: 70, referencePriceAsOf: currentTime });
  const initialPosition = buildForecastAllocation(forecastRequest, [initialForecast]).positions[0];
  const optimizedReport = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations,
    recommendations: [{ ...report.recommendations[0], action: initialPosition.action, plannedAmountEUR: initialPosition.amountEUR,
      ...(initialPosition.action === 'Verkaufen' ? { tradeDecision: tradeDecisionFixture } : {}) }],
  };
  const refreshedForecast = returnForecastFixture('1', { targetPrice: 80, referencePriceAsOf: currentTime,
    forecastSources: [{ title: 'Refreshed forecast', url: 'https://example.com/refreshed' }] });
  const marketProvider = jest.fn().mockResolvedValueOnce(initialForecast);
  const mockedFetch = apiResponsesWithUnavailableDocuments(new Response(JSON.stringify(research)),
    structuredResponse(optimizedReport), structuredResponse(optimizedReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch, undefined, marketProvider); service.saveKey('sk-testOnlyNotARealKey');
  const initial = await service.analyze(forecastRequest, undefined, 'saved-snapshot');
  const recommendation = initial.recommendations[0];
  marketProvider.mockResolvedValueOnce(refreshedForecast);
  mockedFetch.mockClear();
  const refreshed = await service.refreshMarketForecast(forecastRequest, undefined, 'refreshed-snapshot');
  expect(marketProvider).toHaveBeenLastCalledWith(forecastRequest.positions[0], { forceRefresh: true });
  expect(mockedFetch).not.toHaveBeenCalled();
  expect(refreshed.refreshedAssetIds).toEqual([1]);
  expect(refreshed.unavailableAssetIds).toEqual([]);
  expect(refreshed.report.recommendations[0]).toEqual(recommendation);
  expect(refreshed.report.allocationPlan?.optimization?.forecasts[0].targetPrice).toBe(80);
  expect(refreshed.report.sources).toContainEqual(refreshedForecast.forecastSources[0]);
  expect(service.getLastResult()?.snapshot).toBe('refreshed-snapshot');
});

it('ignores irrelevant hold and review allocations while retaining valid buy amounts', () => {
  const input = { ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: 100 }],
    newAssetRecommendations: [{ ...newAsset, action: 'Prüfen', plannedAmountEUR: 40 }],
  };
  const result = validateAnalysisResult(input, request, [{ title: 'Source', url: 'https://example.com' }], true);
  expect(result.recommendations[0].plannedAmountEUR).toBeNull();
  expect(result.newAssetRecommendations?.[0].plannedAmountEUR).toBeNull();
  expect(result.warnings.join(' ')).toContain('ignoriert');
  expect(input.recommendations[0].plannedAmountEUR).toBe(100);
});

it.each([-1, '10 EUR', Infinity, 1e9 + 1])('continues rejecting invalid allocation %s with an actionable correction', amount => {
  expect(() => validateAnalysisResult({ ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: amount }] }, request,
    [{ title: 'Source', url: 'https://example.com' }], true)).toThrow(/plannedAmountEUR muss null/);
});

it('rejects new-asset trade amounts without robust evidence and persists the unchanged funding check', async () => {
  const fundingRequest = { ...request, positions: request.positions.map(position => ({ ...position, type: 'CashEquivalent' as const })),
    priceUpdatedAt: new Date(Date.now()).toISOString(), profile: { ...request.profile, buyBudget: 1000 } };
  const forecasts = [returnForecastFixture('1', { targetPrice: 100 }),
    returnForecastFixture('new:IE00B4L5Y983', { targetPrice: 400, referencePrice: 100, annualVolatilityPercent: 20 })];
  const localPlan = buildForecastAllocation(fundingRequest, forecasts, [{ ...newAsset, type: 'ETF', action: 'Kaufen' }]);
  const amount = localPlan.positions[1].amountEUR;
  const overBudget = { ...report, optimizationInputs: [returnForecastInputFixture('1', { targetPrice: 100 }),
    returnForecastInputFixture('new:IE00B4L5Y983', { targetPrice: 400, referencePrice: 100, annualVolatilityPercent: 20 })],
    newAssetRecommendations: [{ ...newAsset, action: 'Kaufen', plannedAmountEUR: 1000 }] };
  const corrected = { ...overBudget,
    recommendations: [{ ...report.recommendations[0], action: localPlan.positions[0].action, plannedAmountEUR: localPlan.positions[0].amountEUR }],
    newAssetRecommendations: [{ ...overBudget.newAssetRecommendations[0], action: 'Prüfen', plannedAmountEUR: amount }] };
  const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  let analyses = 0;
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : answer(++analyses < 3 ? overBudget : corrected));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(fundingRequest);
  expect(amount).toBeNull();
  expect(result.fundingCheck).toMatchObject({ cashEUR: 1000, buyAmountEUR: 0, feeScenarioEUR: 0,
    balanceBeforeSpreadAndTaxEUR: 1000, status: 'no-trades' });
  expect(mockedFetch).toHaveBeenCalledTimes(5);
  const correction = mockedFetch.mock.calls.map(([, options]) => JSON.parse(options?.body as string))
    .find(body => body.input.length > 1 && JSON.parse(body.input[1].content).correction?.allocationPlan.positions.length > 1);
  expect(correction.input[1].content).toContain('Modellszenario mit offener Entscheidung');
  expect(JSON.parse(correction.input[1].content).correction.allocationPlan.positions[1]).toMatchObject({ amountEUR: amount });
  expect(correction.instructions).toContain('ohne investorContext: 1 EUR je regulärer Trade-Republic-Order');
  expect(correction.instructions).toContain('gespeicherte Ordergebühr je Kauf- oder Verkaufsvorschlag');
  expect(correction.text.format.schema.properties.newAssetRecommendations.items.required).toContain('plannedAmountEUR');
  expect(service.getLastResult()?.report.fundingCheck).toEqual(result.fundingCheck);
  const resultFile = path.join(dir, 'portfolio-ai-last-analysis.json');
  const legacySaved = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  legacySaved.report.fundingCheck = { ...result.fundingCheck, feeScenarioEUR: 2,
    balanceBeforeSpreadAndTaxEUR: -1, shortfallEUR: 1, status: 'insufficient', warnings: ['Gebührenszenario: 2 EUR je Kauf-/Verkaufsvorschlag'] };
  fs.writeFileSync(resultFile, JSON.stringify(legacySaved));
  const restored = service.getLastResult();
  expect(restored?.report.fundingCheck).toEqual(result.fundingCheck);
  expect(restored?.report.generatedAt).toBe(result.generatedAt);
  expect(restored?.report.allocationPlan).toEqual(result.allocationPlan);
  legacySaved.report.allocationPlan = { ...result.allocationPlan, positions: 'corrupt' };
  fs.writeFileSync(resultFile, JSON.stringify(legacySaved));
  expect(service.getLastResult()?.report.allocationPlan).toBeUndefined();
  expect(service.getLastResult()?.report.recommendations).toEqual(result.recommendations);
});

it('reuses full-portfolio research for the selected asset, preserves the portfolio report and restores the merged sources', async () => {
  const request = noCandidateRequest;
  const fullRequest = { ...request, positions: [...request.positions, { ...request.positions[0], id: 2, name: 'Other asset' }] };
  const fullReport = { ...report, recommendations: [...report.recommendations, { ...report.recommendations[0], assetId: 2 }] };
  const response = (value: unknown) => new Response(JSON.stringify(value));
  const refreshed = { ...report, summary: 'Single asset summary', warnings: ['Single asset warning'], newAssetRecommendations: [] as typeof report.newAssetRecommendations,
    recommendations: [{ ...report.recommendations[0], rationale: 'Fresh recommendation [0]', tradeDecision: tradeDecisionFixture }],
  };
  const structuredResponse = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  const mockedFetch = jest.fn().mockResolvedValueOnce(response(research)).mockResolvedValueOnce(response(structuredResponse(fullReport)))
    .mockResolvedValueOnce(response(structuredResponse(refreshed)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const originalSnapshot = JSON.stringify({ transactionIds: [10] });
  const original = await service.analyze(fullRequest, undefined, originalSnapshot);
  const result = await service.analyze({ ...fullRequest, targetAssetId: 1 }, undefined, JSON.stringify({ transactionIds: [10, 11] }));
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const body = JSON.parse(mockedFetch.mock.calls[2][1].body);
  expect(body.tools).toBeUndefined();
  const input = JSON.parse(body.input[0].content);
  expect(input.portfolio.positions.map((p: { id: number }) => p.id)).toEqual([1]);
  expect(input.contextPortfolio).toEqual(fullRequest.positions.map(position => ({
    id: position.id, name: position.name, isin: position.isin, symbol: position.symbol, type: position.type,
    currency: position.currency, marketValueEUR: 100,
  })));
  expect(JSON.stringify(input.contextPortfolio)).not.toContain('costBasis');
  expect(body.instructions).not.toContain('Ergänze newAssetRecommendations mit bis zu fünf');
  expect(body.text.format.schema.properties.recommendations.items.properties.assetId.enum).toEqual([1]);
  expect(body.text.format.schema.properties.newAssetRecommendations.maxItems).toBe(0);
  expect(result.summary).toBe(original.summary);
  expect(result.warnings).toEqual(original.warnings);
  expect(result.generatedAt).toBe(original.generatedAt);
  expect(result.newAssetRecommendations).toEqual(original.newAssetRecommendations);
  expect(result.recommendations[1]).toEqual(original.recommendations[1]);
  expect(original.recommendations[0].executionBaseline).toEqual({ shares: 2, transactionIds: [10] });
  expect(result.recommendations[0].executionBaseline).toEqual({ shares: 2, transactionIds: [10, 11] });
  expect(result.recommendations[0]?.tradeDecision?.holdCase).toContain('[1]');
  expect(result.recommendations[0].tradeDecision?.scenarios[0]?.sourceIndexes).toEqual([1]);
  expect(result.recommendations[0].tradeDecision?.scenarios[2]?.implication).toContain('[1]');
  expect(result.recommendations[0]).toMatchObject({ rationale: 'Fresh recommendation [1]', sourceIndexes: [1], warnings: expect.arrayContaining(['Single asset warning']), updatedAt: expect.any(String) });
  expect(result.sources[1].url).toBe('https://example.com/report');
  expect(new PortfolioAnalysisService(dir, mockedFetch).getLastResult()).toEqual({ report: result, snapshot: originalSnapshot, provider: 'api' });
  mockedFetch.mockRejectedValueOnce(new TypeError('offline'));
  await expect(service.analyze({ ...fullRequest, targetAssetId: 1 })).rejects.toThrow(/erreichbar/);
  expect(service.getLastResult()?.report).toEqual(result);
});

it('reuses recent single-asset research while re-evaluating live holdings and profile, then researches again after expiry', async () => {
  const request = noCandidateRequest;
  const singleReport = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations };
  const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)))
    .mockResolvedValueOnce(answer(singleReport))
    .mockResolvedValueOnce(answer(singleReport)).mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(answer(singleReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze(request);
  await service.analyze({ ...request, targetAssetId: 1 });
  const updated = { ...request, targetAssetId: 1, positions: [{ ...request.positions[0], shares: 3, price: 60 }], profile: { ...request.profile, goal: 'income' as const } };
  await service.analyze(updated);
  expect(mockedFetch).toHaveBeenCalledTimes(4);
  expect(JSON.parse(mockedFetch.mock.calls[2][1].body).tools).toBeUndefined();
  const analysisInput = JSON.parse(JSON.parse(mockedFetch.mock.calls[3][1].body).input[0].content);
  expect(analysisInput.portfolio.positions[0]).toMatchObject({ shares: 3, price: 60 });
  expect(analysisInput.portfolio.profile.goal).toBe('income');
  expect(analysisInput.tradeEconomics[0].marketValueEUR).toBe(180);
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
  try { await service.analyze(updated); } finally { now.mockRestore(); }
  expect(mockedFetch).toHaveBeenCalledTimes(6);
});

it('rejects unknown targets and single analysis without a saved portfolio before contacting the provider', async () => {
  const mockedFetch = jest.fn();
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  await expect(service.analyze({ ...request, targetAssetId: 99 })).rejects.toThrow(/nicht mehr gehalten/);
  await expect(service.analyze({ ...request, targetAssetId: 1 })).rejects.toThrow(/zuerst eine Portfolio/);
  expect(mockedFetch).not.toHaveBeenCalled();
});

it('encrypts the API key and researches sources before generating a structured report', async () => {
  const mockedFetch = jest.fn(async (_url: RequestInfo | URL, options?: RequestInit) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  const key = 'sk-testOnlyNotARealKey';
  service.saveKey(key);
  expect(fs.readFileSync(path.join(dir, 'portfolio-ai-key.bin'), 'utf8')).not.toContain(key);
  const result = await service.analyze(request);
  expect(result.sources).toEqual([{ title: 'Emittent', url: 'https://example.com/report' }]);
  const researchBody = JSON.parse(mockedFetch.mock.calls[0][1]!.body as string);
  const analysisBody = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
  expect(researchBody).toMatchObject({ store: false, tool_choice: 'required', tools: [{ type: 'web_search' }] });
  expect(researchBody.input[0].content).not.toContain('shares');
  expect(JSON.parse(researchBody.input[0].content).profile).toBeUndefined();
  const candidateResearchBody = JSON.parse(mockedFetch.mock.calls[2][1]?.body as string);
  expect(JSON.parse(candidateResearchBody.input[0].content).profile).toEqual(request.profile);
  expect(candidateResearchBody.instructions).toContain('noch nicht gehaltene Assets');
  expect(result.newAssetRecommendations).toEqual([newAsset]);
  expect(service.getLastResult()?.report.newAssetRecommendations).toEqual([newAsset]);
  expect(analysisBody.text.format).toMatchObject({ type: 'json_schema', strict: true });
  expect(analysisBody.text.format.schema.required).toContain('newAssetRecommendations');
  expect(analysisBody.text.format.schema.properties.newAssetRecommendations.maxItems).toBe(5);
  expect(analysisBody.instructions).toContain('EUR-Preise sind bereits umgerechnet');
  expect(analysisBody.instructions).toContain('Kurswährungsanteile sind keine Währungsrisiko-Allokation');
  const recSchema = analysisBody.text.format.schema.properties.recommendations;
  expect(recSchema).toMatchObject({ minItems: 1, maxItems: 1 });
  expect(recSchema.items.properties.assetId.enum).toEqual([1]);
  expect(recSchema.items.properties.sourceIndexes.items).toMatchObject({ minimum: 0, maximum: 0 });
  service.forgetKey(); expect(service.status().hasApiKey).toBe(false);
});

it('does not produce recommendations when current research has no usable sources', async () => {
  const mockedFetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: 'No sources' }] }] })));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow(/Webquellen/);
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});

it('rejects unknown assets, fabricated citations and trading advice without a quote', () => {
  const sources = [{ title: 'Source', url: 'https://example.com/report' }];
  expect(() => validateAnalysisResult({ ...report, recommendations: [{ ...report.recommendations[0], assetId: 2 }] }, request, sources)).toThrow();
  expect(() => validateAnalysisResult({ ...report, recommendations: [{ ...report.recommendations[0], sourceIndexes: [9] }] }, request, sources)).toThrow();
  expect(() => validateAnalysisResult({ ...report, recommendations: [{ ...report.recommendations[0], action: 'Kaufen' }] }, { ...request, positions: [{ ...request.positions[0], price: null }] }, sources)).toThrow();
});

it('requires the direct cost and tax check in new analyses while accepting older saved reports', () => {
  const legacy = { ...report, recommendations: [{ ...report.recommendations[0], tradeCheck: undefined as typeof report.recommendations[0]['tradeCheck'] | undefined }] };
  const sources = [{ title: 'Source', url: 'https://example.com/report' }];
  expect(() => validateAnalysisResult(legacy, request, sources)).not.toThrow();
  expect(() => validateAnalysisResult(legacy, request, sources, true)).toThrow(/Kosten- und Steuerprüfung/);
});

it('validates Trade Republic order types and keeps stop variants manual', () => {
  const sources = [{ title: 'Source', url: 'https://example.com/report' }];
  const buy = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Kaufen' as const, plannedAmountEUR: 50,
    orderRecommendation: { type: 'limit' as const, validity: 'day' as const, execution: 'finpal-preview' as const,
      priceInstruction: 'Limit erst aus einem frischen handelbaren Ask ableiten.', rationale: 'Preisgrenze für die Umschichtung.' } }] };
  expect(() => validateAnalysisResult(buy, request, sources)).not.toThrow();
  expect(() => validateAnalysisResult({ ...buy, recommendations: [{ ...buy.recommendations[0],
    orderRecommendation: { ...buy.recommendations[0].orderRecommendation, type: 'trailing-stop' as const,
      execution: 'manual-trade-republic' as const, priceInstruction: 'Nachlaufabstand in der Live-Ordermaske prüfen.' } }] }, request, sources)).not.toThrow();
  expect(() => validateAnalysisResult({ ...buy, recommendations: [{ ...buy.recommendations[0],
    orderRecommendation: { ...buy.recommendations[0].orderRecommendation, type: 'trailing-stop' as const } }] }, request, sources)).toThrow(/Orderart/);
  expect(() => validateAnalysisResult({ ...buy, recommendations: [{ ...buy.recommendations[0],
    orderRecommendation: { ...buy.recommendations[0].orderRecommendation, type: 'stop' as const, execution: 'finpal-preview' as const } }] }, request, sources)).toThrow(/Orderart/);
});

it('corrects a sale of a tiny Arbor position whose value is consumed by the fee scenario', async () => {
  const arborRequest = { ...request, positions: [{ ...request.positions[0], name: 'Arbor', shares: 21.645021, price: 0.043, costBasis: 50.99999851 }] };
  const sell = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Verkaufen' }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(sell)).mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(arborRequest);
  expect(result.recommendations[0].action).toBe('Halten');
  const analysisBody = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
  expect(JSON.parse(analysisBody.input[0].content).tradeEconomics[0].marketValueEUR).toBeCloseTo(0.930735903);
  expect(analysisBody.text.format.schema.properties.recommendations.items.required).toContain('tradeCheck');
  const correction = JSON.parse(JSON.parse(mockedFetch.mock.calls[2][1].body).input[1].content).correction;
  expect(correction.reason).toContain('1-EUR-Gebührenszenario');
  expect(JSON.parse(mockedFetch.mock.calls[0][1].body).instructions).toContain('Verlustverrechnung nach § 20 EStG');
});

it('handles authentication failures without exposing server error bodies or falling back to another provider', async () => {
  const mockedFetch = jest.fn().mockResolvedValue(new Response('sensitive error', { status: 401 }));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow(/API-Schlüssel wurde abgelehnt/);
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});

function sse(body: unknown): Response { return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: body })}\n\n`); }

it('uses the selected ChatGPT model and the supported streaming parameters without an API key', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(sse(research)).mockResolvedValueOnce(sse(structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const service = new PortfolioAnalysisService(dir, mockedFetch, auth);
  const result = await service.analyze({ ...request, provider: 'chatgpt', model: 'account-model' });
  expect(result.model).toBe('account-model');
  for (const [, options] of mockedFetch.mock.calls) {
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({ stream: true, store: false, model: 'account-model' });
    expect(body).not.toHaveProperty('max_output_tokens');
    expect(Array.isArray(body.input)).toBe(true);
  }
});

it('rejects interrupted streams and reports ChatGPT quota failures received after streaming starts', async () => {
  await expect(readAnalysisStream(new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n'))).rejects.toThrow(/vollständige Antwort/);
  await expect(readAnalysisStream(new Response('data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'))).rejects.toThrow(/ChatGPT-Nutzungslimit/);
});

it('rejects secure-storage unavailability instead of writing the key in plain text', () => {
  jest.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);
  expect(() => new PortfolioAnalysisService(dir, jest.fn()).saveKey('sk-testOnlyNotARealKey')).toThrow(/sichere/);
  expect(fs.readdirSync(dir)).toEqual([]);
});

function itemStream(body: typeof research | typeof structured): Response {
  return new Response([
    ...body.output.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item })),
    { type: 'response.completed', response: { status: 'completed', output: [] } },
  ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
}

it('retains research citations and structured text from finished stream items', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(itemStream(research)).mockResolvedValueOnce(itemStream(structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const result = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' });
  expect(result.summary).toBe(report.summary);
  expect(result.recommendations).toEqual(report.recommendations.map(rec => ({ ...rec, executionBaseline: { shares: 2 } })));
  expect(result.sources).toEqual([{ title: 'Emittent', url: 'https://example.com/report' }]);
});

it('does not duplicate items present in both item events and the completed response', async () => {
  const events = research.output.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item }));
  const data = [...events, { type: 'response.completed', response: research }].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
  expect(await readAnalysisStream(new Response(data))).toEqual(research);
});

it('reads completed content parts with UTF-8 and CRLF boundaries split across chunks', async () => {
  const part = { type: 'output_text', text: 'Prüfen €', annotations: [{ type: 'url_citation', url: 'https://example.com/report' }] };
  const data = [
    { type: 'response.content_part.done', output_index: 0, content_index: 0, part },
    { type: 'response.completed', response: { status: 'completed' } },
  ].map(event => 'data: ' + JSON.stringify(event)).join('\r\n\r\n');
  const bytes = new TextEncoder().encode(data);
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  const result = await readAnalysisStream(new Response(stream));
  expect(result.output).toEqual([{ type: 'message', content: [part] }]);
});

it('never treats finished items as a successfully completed response after interruption', async () => {
  const data = 'data: ' + JSON.stringify({ type: 'response.output_item.done', output_index: 0, item: structured.output[0] }) + '\n\n';
  await expect(readAnalysisStream(new Response(data))).rejects.toThrow(/vollständige Antwort/);
  await expect(readAnalysisStream(new Response(data + 'data: {"type":"response.incomplete","response":{}}\n\n'))).rejects.toThrow(/unterbrochen/);
});

it('reports which step returned an empty response and does not proceed with missing research', async () => {
  const empty = { status: 'completed', output: [] as never[] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(empty)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow(/Webrecherche.*Antworttext/);
  expect(mockedFetch).toHaveBeenCalledTimes(1);
  mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(empty)));
  await expect(service.analyze(request)).rejects.toThrow(/Portfolio-Analyse.*Antworttext/);
});

it('preserves refusals received as finished streamed items', async () => {
  const refused = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Declined' }] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(itemStream(research)).mockResolvedValueOnce(itemStream(refused as unknown as typeof structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  await expect(new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' })).rejects.toThrow(/nicht beantworten/);
});


it('emits the actual analysis stages in order without portfolio content', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const progress = jest.fn();
  await service.analyze(request, progress);
  expect(progress.mock.calls.map(([update]) => update.stage)).toEqual(['preparing', 'ai-research', 'ai-research', 'risk-review', 'risk-review', 'risk-review', 'risk-review', 'risk-review', 'analysis', 'validating', 'validating', 'ai-research', 'ai-research']);
  for (const [update] of progress.mock.calls) {
    if (update.logDetail) {
      expect(Object.keys(update).sort()).toEqual(['lastActivityAt', 'logDetail', 'stage',
        ...(update.activeAssetId === undefined ? [] : ['activeAssetId']),
        ...(update.researchTotal === undefined ? [] : ['researchCompleted', 'researchTotal'])].sort());
      expect(update.lastActivityAt).toEqual(expect.any(Number));
      continue;
    }
    expect(Object.keys(update).sort()).toEqual(update.stage === 'ai-research'
      ? ['lastActivityAt', 'researchCompleted', 'researchTotal', 'stage']
      : update.stage === 'risk-review'
        ? ['completedRiskAssetIds', 'lastActivityAt', 'researchCompleted', 'researchTotal', 'reusedRiskAssetIds', 'stage',
          ...(update.activeAssetId === undefined ? [] : ['activeAssetId', 'activeRiskStep']),
          ...(update.activeCandidateName === undefined ? [] : ['activeCandidateName', 'activeRiskStep'])].sort()
        : ['lastActivityAt', 'stage']);
    expect(update.lastActivityAt).toEqual(expect.any(Number));
  }
});

it('passes market closure context to the model and replaces the blanket weekend warning', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T08:50:03Z'));
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  try {
    const result = await service.analyze({ ...request, priceUpdatedAt: '2026-10-05T08:42:00Z', positions: [{ ...request.positions[0], symbol: 'MDLZ', type: 'Stock', quote: {
      originalPrice: 58.19, originalCurrency: 'USD', valuationCurrency: 'EUR', source: 'yahoo-finance',
      quoteAsOf: '2026-10-02T20:00:01Z', fetchedAt: '2026-10-05T08:42:05Z', convertedAt: '2026-10-05T08:42:05Z',
      fxRateToEUR: 50 / 58.19, fxSource: 'FX', fxAsOf: '2026-10-05T00:00:00Z', fxFetchedAt: '2026-10-05T08:42:00Z',
    } }] });
    const body = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
    expect(JSON.parse(body.input[0].content).quoteFreshness).toEqual([expect.objectContaining({ assetId: 1, status: 'market-closed' })]);
    expect(body.instructions).toContain('nicht allein wegen mehr als 48 Kalenderstunden veraltet');
    expect(result.infos?.join(' ')).toContain('Letzter Schlusskurs');
    expect(result.warnings.join(' ')).not.toContain('Letzter Schlusskurs');
    expect(result.warnings.join(' ')).not.toContain('älter als 48 Stunden');
  } finally { now.mockRestore(); }
});

it('rejects new ideas with missing identity, missing sources, invalid actions or existing holdings', () => {
  const sources = [{ title: 'Source', url: 'https://example.com/report' }];
  for (const invalid of [
    { ...newAsset, isin: '', symbol: '' },
    { ...newAsset, sourceIndexes: [] },
    { ...newAsset, sourceIndexes: [99] },
    { ...newAsset, action: 'Verkaufen' },
    { ...newAsset, name: ' asset ' },
  ]) expect(() => validateAnalysisResult({ ...report, newAssetRecommendations: [invalid] }, request, sources)).toThrow();
  expect(() => validateAnalysisResult({ ...report, newAssetRecommendations: [newAsset, { ...newAsset, name: 'Other name' }] }, request, sources)).toThrow(/mehrfach/);
  expect(() => validateAnalysisResult(report, { ...request, positions: [{ ...request.positions[0], isin: newAsset.isin.toLowerCase() }] }, sources)).toThrow(/bereits im Portfolio/);
  expect(validateAnalysisResult({ ...report, newAssetRecommendations: undefined }, request, sources).newAssetRecommendations).toEqual([]);
});

it('passes Arbor filing discovery hints to research before analyzing the position', async () => {
  const request = noCandidateRequest;
  const mockedFetch = apiResponsesWithUnavailableDocuments(new Response(JSON.stringify(research)), new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze({ ...request, positions: [{ ...request.positions[0], name: 'Arbor Metals', isin: 'CA03880B1040', symbol: 'CA03880B1040.SG' }] });
  const researchBody = JSON.parse(mockedFetch.mock.calls[0][1]!.body as string);
  const researchInput = JSON.parse(researchBody.input[0].content);
  expect(researchInput.securities[0]).toMatchObject({ id: 1, discoveryHints: { issuer: 'Arbor Metals Corp.' } });
  expect(researchInput.securities[0].discoveryHints.sourceUrls).toContain('https://www.sedarplus.ca/');
  expect(researchInput.securities[0]).not.toHaveProperty('shares');
  expect(mockedFetch.mock.calls.filter(([url]) => String(url).includes('/v1/responses'))).toHaveLength(2);
});

it('researches the exact Treasury bond and retains its valuation evidence without forcing an action', async () => {
  const bondRequest: PortfolioAnalysisRequest = { ...request, positions: [{ ...request.positions[0],
    name: 'US Treasury', type: 'Bond', isin: 'US912810SQ22', symbol: 'A281P1', price: 46.555034558108765,
    quote: { originalPrice: 57.95, originalCurrency: 'USD', valuationCurrency: 'EUR', source: 'boerse-frankfurt',
      quoteAsOf: '2026-10-12T10:21:13.000Z', fetchedAt: '2026-10-12T10:40:43.499Z', exchange: 'XFRA', tradedInPercent: true,
      unitFactor: 0.9, fxRateToEUR: 0.8926284068278931, fxSource: 'ExchangeRate-API', fxAsOf: '2026-10-12T00:02:32.000Z',
      fxFetchedAt: '2026-10-12T10:39:55.718Z', convertedAt: '2026-10-12T10:40:43.499Z' },
    bondHolding: { nominal: 180, currency: 'USD', source: 'user-confirmed', purchaseAccruedInterestEUR: -0.17,
      transactions: [{ id: 112, date: '2025-11-03', nominal: 180, accruedInterestEUR: -0.17 }] },
  }] };
  const mockedFetch = apiResponsesWithUnavailableDocuments(new Response(JSON.stringify(research)), new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(bondRequest);
  const apiCalls = mockedFetch.mock.calls.filter(([url]) => String(url).includes('/v1/responses'));
  const researchBody = JSON.parse(apiCalls[0][1]!.body as string);
  const security = JSON.parse(researchBody.input[0].content).securities[0];
  expect(security.discoveryHints.issuer).toContain('912810SQ2');
  expect(security.discoveryHints.sourceUrls).toContain('https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=US912810SQ22');
  expect(security.discoveryHints.sourceUrls.some((url: string) => url.includes('boerse-stuttgart.de'))).toBe(true);
  expect(security).not.toHaveProperty('bondHolding');
  expect(security).not.toHaveProperty('price');
  expect(security).not.toHaveProperty('shares');
  expect(researchBody.instructions).toContain('nicht zu einem scheinbar aktuellen Datensatz kombinieren');
  expect(researchBody.instructions).toContain('Absicherungsziel und verbleibende Risiken');
  const analysisBody = JSON.parse(apiCalls[1][1]!.body as string);
  const position = JSON.parse(analysisBody.input[0].content).portfolio.positions[0];
  expect(position.quote).toEqual(bondRequest.positions[0].quote);
  expect(position.bondHolding.nominal).toBe(180);
  expect(analysisBody.instructions).toContain('allein erzwingen kein Prüfen');
  expect(analysisBody.instructions).toContain('widersprüchlichen Bestandseinheiten weiterhin Prüfen');
  expect(analysisBody.instructions).toContain('nicht automatisch fehlende Webbelege');
  expect(result.warnings).not.toContain('Die wirtschaftliche Währungsrisiko-Allokation ist nicht hinterlegt. Kurswährungen bilden insbesondere bei Fonds und ETFs keine belastbare Risiko-Allokation ab.');
  expect(result.infos?.some(info => info.includes('Lokale Währungsangaben'))).toBe(true);
  expect(result.recommendations[0].action).toBe('Halten');
});

it('runs one targeted forecast recovery, merges citations and caches the completed research', async () => {
  const request = noCandidateRequest;
  const first = { ...research, output: [research.output[0], { type: 'message', content: [{ type: 'output_text',
    text: 'Kursziel gefunden; Volatilität fehlt.\nFORECAST_GAPS: [1, 99]',
    annotations: [{ type: 'url_citation', title: 'Emittent', url: 'https://example.com/report' }] }] }] };
  const recovery = { ...research, output: [research.output[0], { type: 'message', content: [{ type: 'output_text',
    text: 'Belegte Risikodaten; Kursziel weiterhin ungeklärt.\nFORECAST_GAPS: [1]',
    annotations: [{ type: 'url_citation', title: 'Risikodaten', url: 'https://example.com/risk' }] }] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(first)))
    .mockResolvedValueOnce(new Response(JSON.stringify(recovery)))
    .mockResolvedValueOnce(new Response(JSON.stringify(structured)))
    .mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const recoveryBody = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
  const recoveryInput = JSON.parse(recoveryBody.input[0].content);
  expect(recoveryInput.securities.map((s: { id: number }) => s.id)).toEqual([1]);
  expect(recoveryInput).not.toHaveProperty('profile');
  expect(recoveryInput.securities[0]).not.toHaveProperty('shares');
  expect(recoveryInput.forecastRequirements.minimumVolatilityLookbackDays).toBe(180);
  const analysisBody = JSON.parse(mockedFetch.mock.calls[2][1].body);
  const input = JSON.parse(analysisBody.input[0].content);
  expect(input.research).toContain('Belegte Risikodaten');
  expect(input.allocationPlan.optimization.reviewedUnavailableKeys).toEqual(['1']);
  expect(analysisBody.instructions).toContain('nicht allein deshalb Prüfen wählen');
  expect(input.sources).toEqual([{ index: 0, title: 'Emittent', url: 'https://example.com/report' },
    { index: 1, title: 'Risikodaten', url: 'https://example.com/risk' }]);
  expect(result.allocationPlan?.status).toBe('blocked');
  expect(result.allocationPlan?.optimization?.expectedGainEUR).toBeNull();
  expect(result.allocationPlan!.positions[0]).toMatchObject({ action: 'Halten', amountEUR: null });
  expect(result.infos?.some(info => info.includes('Geprüft:'))).toBe(true);
  expect(service.getLastResult()?.report.allocationPlan?.optimization?.reviewedUnavailableKeys).toEqual(['1']);
  const cachedResult = await service.analyze(request);
  expect(cachedResult.allocationPlan?.optimization?.reviewedUnavailableKeys).toEqual(['1']);
  expect(mockedFetch).toHaveBeenCalledTimes(4);
});

it('reuses successful primary research despite uncited forecast recovery without marking the gap reviewed', async () => {
  const request = noCandidateRequest;
  const first = { ...research, output: [research.output[0], { type: 'message', content: [{ type: 'output_text',
    text: 'Recherche\nFORECAST_GAPS: [1]', annotations: [{ type: 'url_citation', title: 'Emittent', url: 'https://example.com/report' }] }] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(first)))
    .mockResolvedValueOnce(structuredResponse({ ignored: 'Unbelegte Prognose' }))
    .mockResolvedValueOnce(new Response(JSON.stringify(structured)))
    .mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(result.allocationPlan?.status).toBe('blocked');
  expect(result.sources).toHaveLength(1);
  const input = JSON.parse(JSON.parse(mockedFetch.mock.calls[2][1].body).input[0].content);
  expect(input.research).not.toContain('Unbelegte Prognose');
  expect(result.allocationPlan?.optimization?.reviewedUnavailableKeys).toEqual([]);
  const retried = await service.analyze(request);
  expect(mockedFetch).toHaveBeenCalledTimes(4);
  expect(retried.allocationPlan?.status).toBe('blocked');
  const retriedInput = JSON.parse(JSON.parse(mockedFetch.mock.calls[3][1].body).input[0].content);
  expect(retriedInput.research).toContain('keine zusätzlichen belegten Daten');
  expect(retried.allocationPlan?.optimization?.reviewedUnavailableKeys).toEqual([]);
});

it('reports activity when stream bytes arrive', async () => {
  const activity = jest.fn();
  await readAnalysisStream(sse(research), activity);
  expect(activity).toHaveBeenCalledTimes(1);
});

function structuredResponse(value: unknown): Response {
  return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
}

it.each([
  { label: 'unknown asset', rec: { ...report.recommendations[0], assetId: 99 }, reason: /Asset-ID/ },
  { label: 'out-of-range source', rec: { ...report.recommendations[0], sourceIndexes: [1] }, reason: /Quellenverweis/ },
  { label: 'unsupported action', rec: { ...report.recommendations[0], action: 'BUY' }, reason: /Aktion/ },
  { label: 'unsubstantiated trade', rec: { ...report.recommendations[0], action: 'Kaufen', sourceIndexes: [] as number[] }, reason: /belegte Quelle/ },
  { label: 'empty rationale', rec: { ...report.recommendations[0], rationale: '   ' }, reason: /Begründung/ },
  { label: 'null recommendation', rec: null, reason: /Format/ },
])('explains why it rejects a $label', ({ rec, reason }) => {
  expect(() => validateAnalysisResult({ ...report, recommendations: [rec] }, request, [{ title: 'Source', url: 'https://example.com/report' }])).toThrow(reason);
});

it('rejects duplicate assets, missing recommendations and advice without prices with specific reasons', () => {
  const sources = [{ title: 'Source', url: 'https://example.com/report' }];
  const twoPositions = { ...request, positions: [...request.positions, { ...request.positions[0], id: 7 }] };
  expect(() => validateAnalysisResult({ ...report, recommendations: [report.recommendations[0], report.recommendations[0]] }, twoPositions, sources)).toThrow(/mehrfach/);
  expect(() => validateAnalysisResult({ ...report, recommendations: [] as typeof report.recommendations }, request, sources)).toThrow(/genau eine/);
  expect(() => validateAnalysisResult(report, { ...request, positions: [{ ...request.positions[0], price: null }] }, sources)).toThrow(/nur die Aktion Prüfen/);
});

it('automatically corrects an invalid recommendation once using the existing research', async () => {
  const request = noCandidateRequest;
  const invalid = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Kaufen', sourceIndexes: [] as number[] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(invalid)).mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const progress = jest.fn();
  const result = await service.analyze(request, progress);
  expect(result.recommendations).toEqual(report.recommendations.map(rec => ({ ...rec, executionBaseline: { shares: 2 } })));
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const retryBody = JSON.parse(mockedFetch.mock.calls[2][1].body);
  expect(retryBody).not.toHaveProperty('tools');
  expect(JSON.parse(retryBody.input[0].content).research).toBe('Recherche');
  const correction = JSON.parse(retryBody.input[1].content).correction;
  expect(correction.reason).toMatch(/belegte Quelle/);
  expect(correction.rejectedAnalysis).toEqual(invalid);
  expect(retryBody.text.format).toEqual(JSON.parse(mockedFetch.mock.calls[1][1].body).text.format);
  expect(progress.mock.calls.map(([update]) => update.stage)).toEqual(['preparing', 'ai-research', 'ai-research', 'risk-review', 'risk-review', 'risk-review', 'risk-review', 'risk-review', 'analysis', 'validating', 'correcting', 'validating', 'validating', 'validating']);
  expect(report.warnings).toEqual(['Kurszeitpunkt fehlt']);
});

it('stops after one correction and reports the remaining defect without exposing the response', async () => {
  const invalid = { ...report, summary: 'private portfolio details', recommendations: [{ ...report.recommendations[0], sourceIndexes: [999] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(invalid)).mockResolvedValueOnce(structuredResponse(invalid));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow(/Empfehlung 1: Ein Quellenverweis/);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  mockedFetch.mockResolvedValueOnce(structuredResponse(report));
  await expect(service.analyze(request)).resolves.toMatchObject({ summary: report.summary });
});

it('never retries a refusal as a correction', async () => {
  const refused = { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(new Response(JSON.stringify(refused)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow(/nicht beantworten/);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
});


it('loads the last successful analysis from disk in a new service instance without another AI call', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  expect(service.getLastResult()).toBeNull();
  const result = await service.analyze(request, undefined, 'original-snapshot');
  const reopened = new PortfolioAnalysisService(dir, jest.fn());
  expect(reopened.getLastResult()).toEqual({ report: result, snapshot: 'original-snapshot', provider: 'api' });
  const file = fs.readFileSync(path.join(dir, 'portfolio-ai-last-analysis.json'), 'utf8');
  expect(file).not.toContain('sk-testOnlyNotARealKey');
  expect(fs.existsSync(path.join(dir, 'portfolio-ai-last-analysis.json.tmp'))).toBe(false);
  reopened.forgetLastResult();
  expect(reopened.getLastResult()).toBeNull();
});

it('preserves the saved report when the next analysis fails', async () => {
  const request = noCandidateRequest;
  const invalid = { ...report, recommendations: [] as typeof report.recommendations };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(structuredResponse(report))
    .mockResolvedValueOnce(structuredResponse(invalid)).mockResolvedValueOnce(structuredResponse(invalid));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze(request, undefined, 'first-snapshot');
  const saved = service.getLastResult();
  await expect(service.analyze(request, undefined, 'failed-snapshot')).rejects.toThrow(/genau eine/);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()).toEqual(saved);
});

it('researches every position in bounded concurrent groups and merges their citations', async () => {
  const request = noCandidateRequest;
  const positions = Array.from({ length: 19 }, (_, index) => ({ ...request.positions[0], id: index + 1, name: 'Asset ' + (index + 1) }));
  let active = 0;
  let peak = 0;
  const researchRequests: any[] = [];
  const mockedFetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    if (!body.tools) return structuredResponse({ ...report, newAssetRecommendations: [], recommendations: positions.map(p => ({ ...report.recommendations[0], assetId: p.id })) });
    const input = JSON.parse(body.input[0].content);
    researchRequests.push(input);
    active++;
    peak = Math.max(active, peak);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'web_search_call', status: 'completed' },
      { type: 'message', content: [{ type: 'output_text', text: 'Group ' + input.securities[0].id,
        annotations: [{ type: 'url_citation', title: 'Group source', url: 'https://example.com/' + input.securities[0].id }] }] },
    ] }));
  });
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const progress = jest.fn();
  const result = await service.analyze({ ...request, positions }, progress);
  expect(peak).toBe(3);
  expect(researchRequests.map(input => input.securities.length)).toEqual([6, 6, 6, 1]);
  expect(researchRequests.flatMap(input => input.securities.map((s: any) => s.id))).toEqual(positions.map(p => p.id));
  expect(researchRequests.filter(input => input.profile)).toHaveLength(0);
  expect(researchRequests[0].heldSecurities).toBeUndefined();
  expect(result.sources.map(source => source.url)).toEqual(['https://example.com/1', 'https://example.com/7', 'https://example.com/13', 'https://example.com/19']);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'ai-research', researchCompleted: 4, researchTotal: 4 }));
});

it('reuses completed research after a failure and profile changes, expires it after 24 hours and clears it on deletion', async () => {
  const request = noCandidateRequest;
  let analysisFails = true;
  const mockedFetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    if (body.tools) return new Response(JSON.stringify(research));
    if (analysisFails) throw new Error('Analysis unavailable');
    return structuredResponse(report);
  });
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow('Analysis unavailable');
  analysisFails = false;
  await service.analyze({ ...request, positions: [{ ...request.positions[0], price: 55 }] });
  const researchCalls = () => mockedFetch.mock.calls.filter(([, options]) => JSON.parse(options?.body as string).tools).length;
  expect(researchCalls()).toBe(1);
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
  try {
    await service.analyze(request);
    expect(researchCalls()).toBe(2);
    await service.analyze({ ...request, profile: { ...request.profile, risk: 'high' } });
    expect(researchCalls()).toBe(2);
    service.forgetLastResult();
    await service.analyze({ ...request, profile: { ...request.profile, risk: 'high' } });
    expect(researchCalls()).toBe(3);
  } finally { now.mockRestore(); }
});

it('persists successful research across restarts and midnight, expires after 24 hours and forgets it on deletion', async () => {
  const request = noCandidateRequest;
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T08:00:00Z'));
  const mockedFetch = jest.fn(async (_url, options) => JSON.parse(options?.body as string).tools
    ? new Response(JSON.stringify(research)) : structuredResponse(report));
  const researchCalls = () => mockedFetch.mock.calls.filter(([, options]) => JSON.parse(options?.body as string).tools).length;
  try {
    const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
    await service.analyze(request);
    clock.mockReturnValue(Date.parse('2026-10-12T21:59:59Z'));
    const restarted = new PortfolioAnalysisService(dir, mockedFetch);
    await restarted.analyze({ ...request, positions: [{ ...request.positions[0], price: 55 }] });
    expect(researchCalls()).toBe(1);
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    const input = JSON.parse(JSON.parse(mockedFetch.mock.calls[2][1].body).input[0].content);
    expect(input.portfolio.positions[0].price).toBe(55);
    expect(input.researchFetchedAt).toEqual(['2026-10-12T08:00:00.000Z']);
    clock.mockReturnValue(Date.parse('2026-10-12T22:00:00Z'));
    await new PortfolioAnalysisService(dir, mockedFetch).analyze(request);
    expect(researchCalls()).toBe(1);
    clock.mockReturnValue(Date.parse('2026-10-13T08:00:00Z'));
    const nextRestart = new PortfolioAnalysisService(dir, mockedFetch);
    await nextRestart.analyze(request);
    expect(researchCalls()).toBe(2);
    nextRestart.forgetLastResult();
    await new PortfolioAnalysisService(dir, mockedFetch).analyze(request);
    expect(researchCalls()).toBe(3);
  } finally { clock.mockRestore(); }
});

it('reports the actual per-asset cache and researches only a newly added asset', async () => {
  const request = noCandidateRequest;
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-14T10:00:00Z'));
  const extra = { ...request.positions[0], id: 2, name: 'New holding', symbol: 'NEW' };
  const both = { ...request, positions: [...request.positions, extra] };
  const calls: any[] = [];
  const mockedFetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    calls.push(body);
    if (body.tools) return new Response(JSON.stringify(research));
    const input = JSON.parse(body.input[0].content);
    return structuredResponse({ ...report, recommendations: input.portfolio.positions.map((position: { id: number }) => ({ ...report.recommendations[0], assetId: position.id })) });
  });
  try {
    const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
    expect(service.getResearchStatus(both.positions).map(status => status.fetchedAt)).toEqual([null, null]);
    await service.analyze(request);
    expect(service.getResearchStatus(both.positions).map(({ assetId, fetchedAt, expiresAt }) => ({ assetId, fetchedAt, expiresAt }))).toEqual([
      { assetId: 1, fetchedAt: '2026-10-14T10:00:00.000Z', expiresAt: '2026-10-15T10:00:00.000Z' },
      { assetId: 2, fetchedAt: null, expiresAt: null },
    ]);
    await service.analyze(both);
    expect(calls.filter(body => body.tools).map(body => JSON.parse(body.input[0].content).securities.map((security: { id: number }) => security.id))).toEqual([[1], [2]]);
    expect(new PortfolioAnalysisService(dir, mockedFetch).getResearchStatus(both.positions).every(status => !!status.fetchedAt)).toBe(true);
    clock.mockReturnValue(Date.parse('2026-10-15T10:00:00Z'));
    expect(service.getResearchStatus(both.positions).every(status => status.fetchedAt === null)).toBe(true);
  } finally { clock.mockRestore(); }
});

it('retains completed research on disk when the subsequent analysis fails', async () => {
  const request = noCandidateRequest;
  const failedFetch = jest.fn(async (_url, options) => {
    if (JSON.parse(options?.body as string).tools) return new Response(JSON.stringify(research));
    throw new Error('Analysis unavailable');
  });
  const service = new PortfolioAnalysisService(dir, failedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow('Analysis unavailable');
  const retryFetch = jest.fn(async (_url, _options) => structuredResponse(report));
  await new PortfolioAnalysisService(dir, retryFetch).analyze(request);
  expect(retryFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(retryFetch.mock.calls[0][1].body).tools).toBeUndefined();
});

it('allows work beyond four minutes and reports the research timeout without leaving the service busy', async () => {
  jest.useFakeTimers();
  const mockedFetch = jest.fn((_url, options) => new Promise<Response>((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  try {
    const pending = service.analyze(request);
    const failure = expect(pending).rejects.toThrow(/zehn Minuten.*Webrecherche/);
    await jest.advanceTimersByTimeAsync(240000);
    expect(mockedFetch.mock.calls[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS - 240000);
    await failure;
    mockedFetch.mockImplementation(async (_url, options) => JSON.parse(options?.body as string).tools ? new Response(JSON.stringify(research)) : structuredResponse(report));
    await expect(service.analyze(request)).resolves.toMatchObject({ summary: report.summary });
  } finally { jest.useRealTimers(); }
});

it('ignores corrupt or invalid cached analyses without failing startup', () => {
  const file = path.join(dir, 'portfolio-ai-last-analysis.json');
  const service = new PortfolioAnalysisService(dir, jest.fn());
  fs.writeFileSync(file, '{broken');
  expect(service.getLastResult()).toBeNull();
  const saved = { version: 1, request, snapshot: 'snapshot', report: { ...report, sources: [{ title: 'Source', url: 'javascript:alert(1)' }], generatedAt: new Date().toISOString(), model: 'model', priceUpdatedAt: null as string | null } };
  fs.writeFileSync(file, JSON.stringify(saved));
  expect(service.getLastResult()).toBeNull();
  saved.report.sources[0].url = 'https://example.com/report';
  saved.report.recommendations = [{ ...report.recommendations[0], sourceIndexes: [999] }];
  fs.writeFileSync(file, JSON.stringify(saved));
  expect(service.getLastResult()?.report.recommendations[0]).toMatchObject({ sourceIndexes: [], warnings: [expect.stringContaining('Quellenverweise')] });
});


function failedStream(event: unknown): Response { return new Response('data: ' + JSON.stringify(event) + '\n\n'); }

it.each([
  { event: { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }, reason: /Antwortlimit/ },
  { event: { type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }, reason: /Inhaltsfilter/ },
  { event: { type: 'response.failed', response: { error: { code: 'server_error', message: 'private details' } } }, reason: /Serverfehler/ },
  { event: { type: 'response.failed', response: { error: { type: 'server_error', message: 'private details' } } }, reason: /Serverfehler/ },
  { event: { type: 'error', error: { code: 'rate_limit_exceeded', message: 'private details' } }, reason: /Anfragelimit/ },
  { event: { type: 'error', code: 'context_length_exceeded', message: 'private details' }, reason: /Kontextlimit/ },
  { event: { type: 'response.failed', response: { error: { code: 'unrecognized', message: 'private details' } } }, reason: /keinen bekannten Fehlergrund/ },
])('explains stream failures without exposing raw server messages: $reason', async ({ event, reason }) => {
  const error = await readAnalysisStream(failedStream(event)).catch(error => error);
  expect(error.message).toMatch(reason);
  expect(error.message).not.toContain('private details');
  expect(error.message).not.toContain('unrecognized');
});

it('retries a transient analysis stream failure once without repeating successful research', async () => {
  const request = noCandidateRequest;
  const mockedFetch = jest.fn().mockResolvedValueOnce(sse(research))
    .mockResolvedValueOnce(failedStream({ type: 'response.failed', response: { error: { code: 'server_error' } } }))
    .mockResolvedValueOnce(sse(structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const progress = jest.fn();
  const result = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }, progress);
  expect(result.summary).toBe(report.summary);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  expect(mockedFetch.mock.calls.filter(([, options]) => JSON.parse(options?.body as string).tools)).toHaveLength(1);
  expect(JSON.parse(mockedFetch.mock.calls[2][1].body)).toEqual(JSON.parse(mockedFetch.mock.calls[1][1].body));
  expect(progress.mock.calls.map(([update]) => update.stage)).toContain('retrying');
});

it('retries a stream interruption without a supplied reason once', async () => {
  const request = noCandidateRequest;
  const mockedFetch = jest.fn()
    .mockResolvedValueOnce(failedStream({ type: 'response.incomplete', response: {} }))
    .mockResolvedValueOnce(sse(research))
    .mockResolvedValueOnce(sse(structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const progress = jest.fn();
  const result = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }, progress);
  expect(result.summary).toBe(report.summary);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(mockedFetch.mock.calls[1][1].body).instructions).toContain('Antworte kompakt und vollständig');
  expect(progress.mock.calls.map(([update]) => update.stage)).toContain('retrying');
});

it('reports a repeated unexplained interruption without promising another retry', async () => {
  const mockedFetch = jest.fn().mockImplementation(async () => failedStream({ type: 'response.incomplete', response: {} }));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  await expect(new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }))
    .rejects.toThrow(/auch nach einer automatischen Wiederholung/);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
});

it('requests a compact complete report once when the API reaches the output limit', async () => {
  const request = noCandidateRequest;
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: structured.output })))
    .mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).resolves.toMatchObject({ summary: report.summary });
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const original = JSON.parse(mockedFetch.mock.calls[1][1]?.body as string);
  const retry = JSON.parse(mockedFetch.mock.calls[2][1].body);
  expect(retry.instructions).toContain('Antworte kompakt und vollständig');
  expect(retry.input).toEqual(original.input);
  expect(retry.text).toEqual(original.text);
});

it('stops after one transient retry and identifies the step that failed', async () => {
  const mockedFetch = jest.fn().mockImplementation(() => Promise.resolve(failedStream({ type: 'response.failed', response: { error: { code: 'server_error' } } })));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const service = new PortfolioAnalysisService(dir, mockedFetch, auth);
  await expect(service.analyze({ ...request, provider: 'chatgpt', model: 'account-model' })).rejects.toThrow(/Webrecherche:.*Serverfehler/);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  expect(service.getLastResult()).toBeNull();
});

it.each(['subscription_sharing_usage_limit_exceeded', 'content_filter'])('does not retry a terminal stream failure: %s', async code => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(failedStream({ type: 'response.failed', response: { error: { code } } }));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  await expect(new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' })).rejects.toThrow();
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});

it('rejects malformed stream events without exposing their contents', async () => {
  await expect(readAnalysisStream(new Response('data: private portfolio data not JSON\n\n'))).rejects.toThrow(/ungültiges Stream-Ereignis/);
});


it.each(['stream', 'http'])('distinguishes unavailable usage from exhausted usage and retries once: %s', async transport => {
  const failure = { error: { code: 'subscription_sharing_usage_unavailable', message: 'private details' } };
  const mockedFetch = jest.fn().mockImplementation(() => Promise.resolve(transport === 'http'
    ? new Response(JSON.stringify(failure), { status: 503 })
    : failedStream({ type: 'response.failed', response: failure })));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const error = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }).catch(error => error);
  expect(error.message).toMatch(/Webrecherche:.*nicht prüfen/);
  expect(error.message).toContain('Das bedeutet nicht');
  expect(error.message).not.toContain('private details');
  expect(mockedFetch).toHaveBeenCalledTimes(2);
});

it('reports an HTTP app usage limit without assuming the whole plan is exhausted or retrying', async () => {
  const mockedFetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'private details' } }), { status: 429 }));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const error = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }).catch(error => error);
  expect(error.message).toContain('ChatGPT-Nutzungslimit für FinPal');
  expect(error.message).toContain('trotzdem noch');
  expect(error.message).not.toContain('private details');
  expect(mockedFetch).toHaveBeenCalledTimes(1);
});


it('retains separate infos through validation and accepts older reports without infos', () => {
  const sources = [{ title: 'Source', url: 'https://example.com' }];
  const result = validateAnalysisResult({ ...report, infos: ['Regulärer Schlusskurs'] }, request, sources);
  expect(result.infos).toEqual(['Regulärer Schlusskurs']);
  expect(result.warnings).toEqual(report.warnings);
  expect(validateAnalysisResult(report, request, sources).infos).toEqual([]);
});

it.each([
  'Bitcoin stellt 27,50 % der Anlagen beziehungsweise 23,27 % einschließlich Cash und damit die größte Einzelrisikokonzentration dar; das lokale Modell weist 43,35 % annualisierte Volatilität und ein sehr breites historisches Bootstrap-Band aus [82].',
  'Die exakte wirtschaftliche Währungsrisiko-Allokation des Portfolios ist nicht quantifizierbar. Handels-, Fonds- und Berichtswährungen sind keine exakten Nettoexpositionen; für die Anleihe ist jedoch ein direktes USD-Nominalrisiko bestätigt.',
  'Spreads und tatsächliche Ausführungskurse müssen unmittelbar vor jeder Order geprüft werden. Die gespeicherte 1-EUR-Pauschale ist kein aktuelles Geld-/Brief-Angebot [13].',
  'QDVE ist ein konzentrierter US-Technologie-Sektor-ETF und kein breiter S&P-500-Fonds; Halbleiter, Hardware und Software dominieren, bei hohem Bewertungsniveau [28][33].',
])('moves descriptive risk notes to infos while retaining actionable warnings: %s', note => {
  const actionable = note + ' Die festgelegte Konzentrationsgrenze ist überschritten; Position reduzieren.';
  const executionWarning = 'Für die konkrete Kauforder fehlen aktuelle Geld-/Brief-Kurse; die Ausführung ist noch nicht prüfbar.';
  const sectorWarning = 'QDVE wurde als breiter S&P-500-Baustein eingeplant; die festgelegte Technologie-Sektorgrenze ist überschritten.';
  const result = validateAnalysisResult({ ...report, infos: [note], warnings: [note, actionable, 'Kurszeitpunkt fehlt', executionWarning, sectorWarning],
    recommendations: report.recommendations.map(rec => ({ ...rec, warnings: [note, actionable] })),
  }, request, [{ title: 'Source', url: 'https://example.com' }]);
  expect(result.infos).toEqual([note]);
  expect(result.warnings).toEqual([actionable, 'Kurszeitpunkt fehlt', executionWarning, sectorWarning]);
  expect(result.recommendations[0].infos).toEqual([note]);
  expect(result.recommendations[0].warnings).toEqual([actionable]);
  fs.writeFileSync(path.join(dir, 'portfolio-ai-last-analysis.json'), JSON.stringify({ version: 1, request, snapshot: 'legacy', report: {
    ...result, infos: [], warnings: [note, actionable], sources: [{ title: 'Source', url: 'https://example.com' }],
    generatedAt: '2026-10-15T10:00:00Z', priceUpdatedAt: null, model: 'test',
    recommendations: result.recommendations.map(rec => ({ ...rec, infos: [] as string[], warnings: [note, actionable] })),
  } }));
  const restored = new PortfolioAnalysisService(dir, jest.fn()).getLastResult();
  expect(restored?.report.infos).toEqual([note]);
  expect(restored?.report.warnings).toEqual([actionable]);
  expect(restored?.report.recommendations[0].infos).toEqual([note]);
  expect(restored?.report.recommendations[0].warnings).toEqual([actionable]);
});

it.each(['not an array', [42], [''], Array(101).fill('Info')])('rejects malformed infos %j', infos => {
  expect(() => validateAnalysisResult({ ...report, infos }, request, [{ title: 'Source', url: 'https://example.com' }])).toThrow('Die Infos haben ein ungültiges Format.');
});


it.each([true, false])('keeps ELTIF NAV evidence and broker age separate through analysis and restore (NAV evidenced: %s)', async evidenced => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T08:00:00Z'));
  const eltifRequest: PortfolioAnalysisRequest = { ...request, priceUpdatedAt: '2026-10-08T08:00:00Z', positions: [{ ...request.positions[0], id: 32, price: 109.395, type: 'Fund' as const, name: 'Apollo ELTIF', isin: 'LU3170240538', quote: { originalPrice: 109.395, originalCurrency: 'EUR', valuationCurrency: 'EUR' as const, source: 'trade-republic', quoteAsOf: '2026-09-10T15:21:10Z', fetchedAt: '2026-10-08T07:00:00Z', convertedAt: null, fxRateToEUR: 1, fxSource: null, fxAsOf: null, fxFetchedAt: null } }] };
  const navEvidence: import('./eltifValuation').NavEvidence = { isin: 'LU3170240538', value: evidenced ? 110 : null, currency: evidenced ? 'USD' : null, valuationDate: evidenced ? '2026-08-31' : null, publicationCycle: evidenced ? 'Monthly' : null, nextPublicationDue: evidenced ? '2026-10-15' : null, sourceIndexes: evidenced ? [0] : [] };
  const existingNavWarning = 'Apollo: Offizieller NAV, Bewertungsstichtag und Veröffentlichungszyklus der exakten Anteilsklasse sind nicht belegt.';
  const answer = { ...report, warnings: evidenced ? [] as string[] : [existingNavWarning], newAssetRecommendations: [] as typeof report.newAssetRecommendations, recommendations: [{ ...report.recommendations[0], assetId: 32, navEvidence }] };
  const mockedFetch = apiResponsesWithUnavailableDocuments(new Response(JSON.stringify(research)), new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  try {
    const result = await service.analyze(eltifRequest);
    const input = JSON.parse(mockedFetch.mock.calls.filter(([url]) => String(url).includes('/v1/responses'))[1][1]!.body as string);
    expect(JSON.parse(input.input[0].content).quoteFreshness[0]).toMatchObject({ status: 'nav-unverified', brokerTickStatus: 'old' });
    expect((result.infos ?? []).join(' ')).toContain('Broker-Tick');
    expect(result.warnings.join(' ')).not.toContain('Assets 32:');
    expect(result.warnings.some(message => message.includes('NAV-Aktualit\u00e4t ungekl\u00e4rt'))).toBe(false);
    if (!evidenced) expect(result.warnings.filter(message => /NAV|Bewertungsstichtag|Veröffentlichungszyklus/.test(message))).toEqual([existingNavWarning]);
    expect(service.getLastResult()?.report.recommendations[0].navEvidence).toEqual(navEvidence);
  } finally { now.mockRestore(); }
});

it('rejects NAV evidence from another share class or fabricated source index', () => {
  const eltifRequest = { ...request, positions: [{ ...request.positions[0], type: 'Fund' as const, name: 'Apollo ELTIF', isin: 'LU3170240538' }] };
  const evidence = { isin: 'OTHER', value: 110, currency: 'USD', valuationDate: '2026-09-30', publicationCycle: 'Monthly', nextPublicationDue: '2026-10-31', sourceIndexes: [0] };
  const response = (navEvidence: typeof evidence) => ({ ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations, recommendations: [{ ...report.recommendations[0], navEvidence }] });
  const sources = [{ title: 'Source', url: 'https://example.com' }];
  expect(() => validateAnalysisResult(response(evidence), eltifRequest, sources)).toThrow(/NAV-Nachweise/);
  expect(() => validateAnalysisResult(response({ ...evidence, isin: 'LU3170240538', sourceIndexes: [99] }), eltifRequest, sources)).toThrow(/NAV-Nachweise/);
});
