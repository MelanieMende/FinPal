/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { PortfolioAnalysisService, readAnalysisStream, validateAnalysisResult } from './portfolioAnalysisService';
import { buildAnalysisPositions, type PortfolioAnalysisRequest } from './portfolioAnalysis';
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
const report = { summary: 'Portfolio prüfen', warnings: ['Kurszeitpunkt fehlt'], recommendations: [{ assetId: 1, action: 'Halten', rationale: 'Begründung [0]', risk: 'Marktrisiko', sourceIndexes: [0] }] };
const research = { status: 'completed', output: [
  { type: 'web_search_call', status: 'completed' },
  { type: 'message', content: [{ type: 'output_text', text: 'Recherche', annotations: [{ type: 'url_citation', title: 'Emittent', url: 'https://example.com/report' }] }] },
] };
const structured = { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(report) }] }] };
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-ai-test-')); jest.clearAllMocks(); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

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
  expect(analysisBody.text.format).toMatchObject({ type: 'json_schema', strict: true });
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
  expect(result.recommendations).toEqual(report.recommendations);
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
  expect(result.recommendations).toEqual(report.recommendations);
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
  mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(structuredResponse(report));
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
    .mockResolvedValueOnce(new Response(JSON.stringify(research))).mockResolvedValueOnce(structuredResponse(invalid)).mockResolvedValueOnce(structuredResponse(invalid));
  const service = new PortfolioAnalysisService(dir, mockedFetch); service.saveKey('sk-testOnlyNotARealKey');
  await service.analyze(request, undefined, 'first-snapshot');
  const saved = service.getLastResult();
  await expect(service.analyze(request, undefined, 'failed-snapshot')).rejects.toThrow(/genau eine/);
  expect(new PortfolioAnalysisService(dir, jest.fn()).getLastResult()).toEqual(saved);
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
