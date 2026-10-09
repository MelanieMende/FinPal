/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { PortfolioAnalysisService, readAnalysisStream, validateAnalysisResult } from './portfolioAnalysisService';
import { ANALYSIS_TIMEOUT_MS, RESEARCH_CACHE_TTL_MS, buildAnalysisPositions, type PortfolioAnalysisRequest } from './portfolioAnalysis';
import type { ChatGptAuth } from './chatGptAuth';

jest.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn((value: string) => Buffer.from(`encrypted:${Buffer.from(value).toString('base64')}`)),
  decryptString: jest.fn((value: Buffer) => Buffer.from(value.toString().slice(10), 'base64').toString()),
} }));

const request: PortfolioAnalysisRequest = {
  provider: 'api', profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 100 }, priceUpdatedAt: null,
  positions: buildAnalysisPositions([{ ID: 1, name: 'Asset', current_shares: 2, price: 50, currencySymbol: '€' }] as Asset[]),
};
const newAsset = { name: 'New ETF', isin: 'IE00B4L5Y983', symbol: 'IWDA', type: 'ETF', action: 'Kaufen', rationale: 'Diversifikation [0]', risk: 'Marktrisiko', sourceIndexes: [0] };
const report = { summary: 'Portfolio prüfen', warnings: ['Kurszeitpunkt fehlt'], recommendations: [{ assetId: 1, action: 'Halten', rationale: 'Begründung [0]', risk: 'Marktrisiko', sourceIndexes: [0], tradeCheck: { costs: '100 EUR Marktwert; 1 EUR Gebuehr entspricht 1 %.', taxes: 'Steuerdaten fehlen; keine Erstattung bestaetigt.', conclusion: 'Halten.' } }], newAssetRecommendations: [newAsset] };
const research = { status: 'completed', output: [
  { type: 'web_search_call', status: 'completed' },
  { type: 'message', content: [{ type: 'output_text', text: 'Recherche', annotations: [{ type: 'url_citation', title: 'Emittent', url: 'https://example.com/report' }] }] },
] };
const structured = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(report) }] }] };
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-ai-test-')); jest.clearAllMocks(); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

it('accepts zero allocations from the schema without retrying or failing the entire analysis', async () => {
  const zeroReport = { ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: 0 }],
    newAssetRecommendations: [{ ...newAsset, plannedAmountEUR: 0 }],
  };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(zeroReport) }] }] })));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(mockedFetch).toHaveBeenCalledTimes(2);
  expect(result.recommendations[0].plannedAmountEUR).toBeNull();
  expect(result.newAssetRecommendations[0].plannedAmountEUR).toBeNull();
  expect(result.fundingCheck.status).toBe('unknown');
  expect(service.getLastResult()?.report).toEqual(result);
  expect(zeroReport.recommendations[0].plannedAmountEUR).toBe(0);
});

it('ignores irrelevant hold and review allocations while retaining valid buy amounts', () => {
  const input = { ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: 100 }],
    newAssetRecommendations: [{ ...newAsset, action: 'Prüfen', plannedAmountEUR: 40 }],
  };
  const result = validateAnalysisResult(input, request, [{ title: 'Source', url: 'https://example.com' }], true);
  expect(result.recommendations[0].plannedAmountEUR).toBeNull();
  expect(result.newAssetRecommendations[0].plannedAmountEUR).toBeNull();
  expect(result.warnings.join(' ')).toContain('ignoriert');
  expect(input.recommendations[0].plannedAmountEUR).toBe(100);
});

it.each([-1, '10 EUR', Infinity, 1e9 + 1])('continues rejecting invalid allocation %s with an actionable correction', amount => {
  expect(() => validateAnalysisResult({ ...report, recommendations: [{ ...report.recommendations[0], plannedAmountEUR: amount }] }, request,
    [{ title: 'Source', url: 'https://example.com' }], true)).toThrow(/plannedAmountEUR muss null/);
});

it('corrects an unfunded combined plan and persists a locally calculated financing check', async () => {
  const overBudget = { ...report, newAssetRecommendations: [{ ...newAsset, plannedAmountEUR: 100 }] };
  const corrected = { ...overBudget, newAssetRecommendations: [{ ...newAsset, plannedAmountEUR: 98 }] };
  const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(answer(overBudget)).mockResolvedValueOnce(answer(corrected));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(request);
  expect(result.fundingCheck).toMatchObject({ cashEUR: 100, buyAmountEUR: 98, feeScenarioEUR: 2,
    balanceBeforeSpreadAndTaxEUR: 0, status: 'conditional' });
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const correction = JSON.parse(mockedFetch.mock.calls[2][1].body);
  expect(correction.input[1].content).toContain('2.00 EUR');
  expect(correction.text.format.schema.properties.newAssetRecommendations.items.required).toContain('plannedAmountEUR');
  expect(service.getLastResult()?.report.fundingCheck).toEqual(result.fundingCheck);
});

it('refreshes only the selected asset with fresh research, preserves the portfolio report and restores the merged sources', async () => {
  const fullRequest = { ...request, positions: [...request.positions, { ...request.positions[0], id: 2, name: 'Other asset' }] };
  const fullReport = { ...report, recommendations: [...report.recommendations, { ...report.recommendations[0], assetId: 2 }] };
  const response = (value: unknown) => new Response(JSON.stringify(value));
  const refreshed = { ...report, summary: 'Single asset summary', warnings: ['Single asset warning'], newAssetRecommendations: [] as typeof report.newAssetRecommendations,
    recommendations: [{ ...report.recommendations[0], rationale: 'Fresh recommendation [0]' }],
  };
  const freshResearch = { ...research, output: [research.output[0], { type: 'message', content: [{ type: 'output_text', text: 'Fresh research',
    annotations: [{ type: 'url_citation', title: 'Fresh source', url: 'https://example.com/fresh' }] }] }] };
  const structuredResponse = (value: unknown) => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  const mockedFetch = jest.fn().mockResolvedValueOnce(response(research)).mockResolvedValueOnce(response(structuredResponse(fullReport)))
    .mockResolvedValueOnce(response(freshResearch)).mockResolvedValueOnce(response(structuredResponse(refreshed)));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const originalSnapshot = JSON.stringify({ transactionIds: [10] });
  const original = await service.analyze(fullRequest, undefined, originalSnapshot);
  const result = await service.analyze({ ...fullRequest, targetAssetId: 1 }, undefined, JSON.stringify({ transactionIds: [10, 11] }));
  expect(mockedFetch).toHaveBeenCalledTimes(4);
  const researchBody = JSON.parse(mockedFetch.mock.calls[2][1].body);
  expect(JSON.parse(researchBody.input[0].content).securities.map((s: { id: number }) => s.id)).toEqual([1]);
  expect(researchBody.instructions).not.toContain('Recherchiere zusätzlich bis zu fünf');
  const body = JSON.parse(mockedFetch.mock.calls[3][1].body);
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
  expect(result.recommendations[0]).toMatchObject({ rationale: 'Fresh recommendation [1]', sourceIndexes: [1], warnings: expect.arrayContaining(['Single asset warning']), updatedAt: expect.any(String) });
  expect(result.sources[1].url).toBe('https://example.com/fresh');
  expect(new PortfolioAnalysisService(dir, mockedFetch).getLastResult()).toEqual({ report: result, snapshot: originalSnapshot, provider: 'api' });
  mockedFetch.mockRejectedValueOnce(new TypeError('offline'));
  await expect(service.analyze({ ...fullRequest, targetAssetId: 1 })).rejects.toThrow(/erreichbar/);
  expect(service.getLastResult()?.report).toEqual(result);
});

it('reuses recent single-asset research while re-evaluating live holdings and profile, then researches again after expiry', async () => {
  const singleReport = { ...report, newAssetRecommendations: [] as typeof report.newAssetRecommendations };
  const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)))
    .mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(answer(singleReport))
    .mockResolvedValueOnce(answer(singleReport)).mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(answer(singleReport));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze(request);
  await service.analyze({ ...request, targetAssetId: 1 });
  const updated = { ...request, targetAssetId: 1, positions: [{ ...request.positions[0], shares: 3, price: 60 }], profile: { ...request.profile, goal: 'income' as const } };
  await service.analyze(updated);
  expect(mockedFetch).toHaveBeenCalledTimes(5);
  const researchInput = JSON.parse(JSON.parse(mockedFetch.mock.calls[2][1].body).input[0].content);
  expect(researchInput).not.toHaveProperty('profile');
  expect(researchInput).not.toHaveProperty('heldSecurities');
  const analysisInput = JSON.parse(JSON.parse(mockedFetch.mock.calls[4][1].body).input[0].content);
  expect(analysisInput.portfolio.positions[0]).toMatchObject({ shares: 3, price: 60 });
  expect(analysisInput.portfolio.profile.goal).toBe('income');
  expect(analysisInput.tradeEconomics[0].marketValueEUR).toBe(180);
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + RESEARCH_CACHE_TTL_MS + 1);
  try { await service.analyze(updated); } finally { now.mockRestore(); }
  expect(mockedFetch).toHaveBeenCalledTimes(7);
});

it('rejects unknown targets and single analysis without a saved portfolio before contacting the provider', async () => {
  const mockedFetch = jest.fn();
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  await expect(service.analyze({ ...request, targetAssetId: 99 })).rejects.toThrow(/nicht mehr gehalten/);
  await expect(service.analyze({ ...request, targetAssetId: 1 })).rejects.toThrow(/zuerst eine Portfolio/);
  expect(mockedFetch).not.toHaveBeenCalled();
});

it('encrypts the API key and researches sources before generating a structured report', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  const key = 'sk-testOnlyNotARealKey';
  service.saveKey(key);
  expect(fs.readFileSync(path.join(dir, 'portfolio-ai-key.bin'), 'utf8')).not.toContain(key);
  const result = await service.analyze(request);
  expect(result.sources).toEqual([{ title: 'Emittent', url: 'https://example.com/report' }]);
  const researchBody = JSON.parse(mockedFetch.mock.calls[0][1].body);
  const analysisBody = JSON.parse(mockedFetch.mock.calls[1][1].body);
  expect(researchBody).toMatchObject({ store: false, tool_choice: 'required', tools: [{ type: 'web_search' }] });
  expect(researchBody.input[0].content).not.toContain('shares');
  expect(JSON.parse(researchBody.input[0].content).profile).toEqual(request.profile);
  expect(researchBody.instructions).toContain('noch nicht gehaltene Assets');
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

it('corrects a sale of a tiny Arbor position whose value is consumed by the fee scenario', async () => {
  const arborRequest = { ...request, positions: [{ ...request.positions[0], name: 'Arbor', shares: 21.645021, price: 0.043, costBasis: 50.99999851 }] };
  const sell = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Verkaufen' }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(structuredResponse(sell)).mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  const result = await service.analyze(arborRequest);
  expect(result.recommendations[0].action).toBe('Halten');
  const analysisBody = JSON.parse(mockedFetch.mock.calls[1][1].body);
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
    const body = JSON.parse(options.body);
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
  expect(progress.mock.calls.map(([update]) => update.stage)).toEqual(['preparing', 'research', 'analysis', 'validating']);
  for (const [update] of progress.mock.calls) {
    expect(Object.keys(update).sort()).toEqual(['lastActivityAt', 'stage']);
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
    const body = JSON.parse(mockedFetch.mock.calls[1][1].body);
    expect(JSON.parse(body.input[0].content).quoteFreshness).toEqual([expect.objectContaining({ assetId: 1, status: 'market-closed' })]);
    expect(body.instructions).toContain('nicht allein wegen mehr als 48 Kalenderstunden veraltet');
    expect(result.warnings.join(' ')).toContain('Letzter Schlusskurs');
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
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify(structured)));
  const service = new PortfolioAnalysisService(dir, mockedFetch);
  service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze({ ...request, positions: [{ ...request.positions[0], name: 'Arbor Metals', isin: 'CA03880B1040', symbol: 'CA03880B1040.SG' }] });
  const researchBody = JSON.parse(mockedFetch.mock.calls[0][1].body);
  const researchInput = JSON.parse(researchBody.input[0].content);
  expect(researchInput.securities[0]).toMatchObject({ id: 1, discoveryHints: { issuer: 'Arbor Metals Corp.' } });
  expect(researchInput.securities[0].discoveryHints.sourceUrls).toContain('https://www.sedarplus.ca/');
  expect(researchInput.securities[0]).not.toHaveProperty('shares');
  expect(mockedFetch).toHaveBeenCalledTimes(2);
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
  expect(progress.mock.calls.map(([update]) => update.stage)).toEqual(['preparing', 'research', 'analysis', 'validating', 'correcting', 'validating']);
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
  const positions = Array.from({ length: 19 }, (_, index) => ({ ...request.positions[0], id: index + 1, name: 'Asset ' + (index + 1) }));
  let active = 0;
  let peak = 0;
  const researchRequests: any[] = [];
  const mockedFetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
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
  expect(researchRequests.filter(input => input.profile)).toHaveLength(1);
  expect(researchRequests[0].heldSecurities).toHaveLength(19);
  expect(result.sources.map(source => source.url)).toEqual(['https://example.com/1', 'https://example.com/7', 'https://example.com/13', 'https://example.com/19']);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'research', researchCompleted: 4, researchTotal: 4 }));
});

it('reuses completed research after a failure, expires it and invalidates it when the profile changes', async () => {
  let analysisFails = true;
  const mockedFetch = jest.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.tools) return new Response(JSON.stringify(research));
    if (analysisFails) throw new Error('Analysis unavailable');
    return structuredResponse(report);
  });
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).rejects.toThrow('Analysis unavailable');
  analysisFails = false;
  await service.analyze({ ...request, positions: [{ ...request.positions[0], price: 55 }] });
  const researchCalls = () => mockedFetch.mock.calls.filter(([, options]) => JSON.parse(options.body).tools).length;
  expect(researchCalls()).toBe(1);
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + RESEARCH_CACHE_TTL_MS + 1);
  try {
    await service.analyze(request);
    expect(researchCalls()).toBe(2);
    await service.analyze({ ...request, profile: { ...request.profile, risk: 'high' } });
    expect(researchCalls()).toBe(3);
    service.forgetLastResult();
    await service.analyze({ ...request, profile: { ...request.profile, risk: 'high' } });
    expect(researchCalls()).toBe(4);
  } finally { now.mockRestore(); }
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
    mockedFetch.mockImplementation(async (_url, options) => JSON.parse(options.body).tools ? new Response(JSON.stringify(research)) : structuredResponse(report));
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
  expect(service.getLastResult()).toBeNull();
});


function failedStream(event: unknown): Response { return new Response('data: ' + JSON.stringify(event) + '\n\n'); }

it.each([
  { event: { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }, reason: /Antwortlimit/ },
  { event: { type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } }, reason: /Inhaltsfilter/ },
  { event: { type: 'response.failed', response: { error: { code: 'server_error', message: 'private details' } } }, reason: /Serverfehler/ },
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
  const mockedFetch = jest.fn().mockResolvedValueOnce(sse(research))
    .mockResolvedValueOnce(failedStream({ type: 'response.failed', response: { error: { code: 'server_error' } } }))
    .mockResolvedValueOnce(sse(structured));
  const auth = { models: jest.fn().mockResolvedValue([{ slug: 'account-model' }]), accessToken: jest.fn().mockResolvedValue('test-oauth-token') } as unknown as ChatGptAuth;
  const progress = jest.fn();
  const result = await new PortfolioAnalysisService(dir, mockedFetch, auth).analyze({ ...request, provider: 'chatgpt', model: 'account-model' }, progress);
  expect(result.summary).toBe(report.summary);
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  expect(JSON.parse(mockedFetch.mock.calls[2][1].body)).toEqual(JSON.parse(mockedFetch.mock.calls[1][1].body));
  expect(progress.mock.calls.map(([update]) => update.stage)).toContain('retrying');
});

it('requests a compact complete report once when the API reaches the output limit', async () => {
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: structured.output })))
    .mockResolvedValueOnce(structuredResponse(report));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await expect(service.analyze(request)).resolves.toMatchObject({ summary: report.summary });
  expect(mockedFetch).toHaveBeenCalledTimes(3);
  const original = JSON.parse(mockedFetch.mock.calls[1][1].body);
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

it.each(['not an array', [42], [''], Array(101).fill('Info')])('rejects malformed infos %j', infos => {
  expect(() => validateAnalysisResult({ ...report, infos }, request, [{ title: 'Source', url: 'https://example.com' }])).toThrow('Die Infos haben ein ungültiges Format.');
});


it.each([true, false])('keeps ELTIF NAV evidence and broker age separate through analysis and restore (NAV evidenced: %s)', async evidenced => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T08:00:00Z'));
  const eltifRequest: PortfolioAnalysisRequest = { ...request, priceUpdatedAt: '2026-10-08T08:00:00Z', positions: [{ ...request.positions[0], id: 32, price: 109.395, type: 'Fund' as const, name: 'Apollo ELTIF', isin: 'LU3170240538', quote: { originalPrice: 109.395, originalCurrency: 'EUR', valuationCurrency: 'EUR' as const, source: 'trade-republic', quoteAsOf: '2026-09-10T15:21:10Z', fetchedAt: '2026-10-08T07:00:00Z', convertedAt: null, fxRateToEUR: 1, fxSource: null, fxAsOf: null, fxFetchedAt: null } }] };
  const navEvidence: import('./eltifValuation').NavEvidence = { isin: 'LU3170240538', value: evidenced ? 110 : null, currency: evidenced ? 'USD' : null, valuationDate: evidenced ? '2026-08-31' : null, publicationCycle: evidenced ? 'Monthly' : null, nextPublicationDue: evidenced ? '2026-10-15' : null, sourceIndexes: evidenced ? [0] : [] };
  const answer = { ...report, warnings: [] as string[], newAssetRecommendations: [] as typeof report.newAssetRecommendations, recommendations: [{ ...report.recommendations[0], assetId: 32, navEvidence }] };
  const mockedFetch = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(answer) }] }] })));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  try {
    const result = await service.analyze(eltifRequest);
    const input = JSON.parse(mockedFetch.mock.calls[1][1].body);
    expect(JSON.parse(input.input[0].content).quoteFreshness[0]).toMatchObject({ status: 'nav-unverified', brokerTickStatus: 'old' });
    expect(result.infos.join(' ')).toContain('Broker-Tick');
    expect(result.warnings.join(' ')).not.toContain('Assets 32:');
    expect(result.warnings.some(message => message.includes('NAV-Aktualit\u00e4t ungekl\u00e4rt'))).toBe(!evidenced);
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
