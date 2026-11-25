/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDeterministicOnlineResearchProvider } from './deterministicOnlineResearch';
import type { AnalysisPosition } from './portfolioAnalysis';

const position = { id: 7, name: 'Example AG', symbol: 'EXA.DE', isin: 'DE000EXAMPLE', type: 'Stock', shares: 4,
  price: 10, currency: 'EUR', costBasis: 20, dividendsEarned: 0, realizedGainLoss: 0 } as AnalysisPosition;

it('performs a deterministic identifier search, validates links and reuses its 24-hour cache', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-online-research-'));
  const file = path.join(dir, 'cache.json');
  const search = jest.fn().mockResolvedValue({ news: [
    { title: 'Quarterly update', publisher: 'Issuer News', link: 'https://example.com/update', providerPublishTime: new Date('2026-10-18T10:00:00Z') },
    { title: 'Unsafe result', publisher: 'Bad', link: 'javascript:alert(1)' },
  ] });
  try {
    const provider = createDeterministicOnlineResearchProvider({ search }, { cacheFile: file, now: () => Date.parse('2026-10-19T10:00:00Z') });
    const first = await provider(position);
    const second = await provider(position);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('EXA.DE DE000EXAMPLE Example AG', expect.objectContaining({ newsCount: 5, enableFuzzyQuery: false }));
    expect(first.cacheStatus).toBe('fresh');
    expect(second).toEqual({ ...first, cacheStatus: 'reused' });
    expect(first.sources).toContainEqual(expect.objectContaining({ title: expect.stringContaining('Quarterly update'), url: 'https://example.com/update' }));
    expect(first.sources.some(source => source.url.startsWith('javascript:'))).toBe(false);
    expect(first.text).toContain('nicht semantisch als Tatsachen oder Empfehlungen interpretiert');
    expect(fs.existsSync(file)).toBe(true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

it('keeps deterministic source links and reports the gap when the online search fails', async () => {
  const search = jest.fn().mockRejectedValue(new Error('offline'));
  const provider = createDeterministicOnlineResearchProvider({ search });
  const result = await provider(position);
  expect(result.searchStatus).toBe('failed');
  expect(result.newsCount).toBe(0);
  expect(result.sources).toContainEqual(expect.objectContaining({ url: 'https://finance.yahoo.com/quote/EXA.DE/history/' }));
  expect(result.text).toContain('Nachrichtensuche ist fehlgeschlagen');
  await provider(position);
  expect(search).toHaveBeenCalledTimes(4);
});

it('retries by name when the full search fails and uses the successful response', async () => {
  const search = jest.fn().mockRejectedValueOnce(new Error('provider failure')).mockResolvedValueOnce({ news: [
    { title: 'News', link: 'https://example.com/news' },
  ] });
  const result = await createDeterministicOnlineResearchProvider({ search })(position);
  expect(search.mock.calls.map(call => call[0])).toEqual(['EXA.DE DE000EXAMPLE Example AG', 'Example AG']);
  expect(result).toMatchObject({ searchStatus: 'completed', newsCount: 1 });
});

it('reports a failed name fallback without claiming that the first search failed', async () => {
  const search = jest.fn().mockResolvedValueOnce({ news: [] }).mockRejectedValueOnce(new Error('provider failure'));
  const result = await createDeterministicOnlineResearchProvider({ search })(position);
  expect(result).toMatchObject({ searchStatus: 'failed', failureReason: 'provider', failureStage: 'fallback' });
  expect(result.text).toContain('erste Suche lieferte keine nutzbaren Nachrichten');
});

it('uses independently validated news when Yahoo rejects an unrelated response schema field', async () => {
  const error = Object.assign(new Error('Failed Yahoo Schema validation'), { name: 'FailedYahooValidationError', result: { news: [
    { title: 'Nachricht', link: 'https://example.com/news', providerPublishTime: 1795600000 },
    { title: 'Unsicher', link: 'javascript:alert(1)' }, null,
  ] } });
  const result = await createDeterministicOnlineResearchProvider({ search: jest.fn().mockRejectedValue(error) })(position);
  expect(result).toMatchObject({ searchStatus: 'completed', newsCount: 1 });
  expect(result.sources).toContainEqual(expect.objectContaining({ url: 'https://example.com/news', title: expect.stringContaining('2026-11-25') }));
  expect(result.sources.some(source => source.url.startsWith('javascript:'))).toBe(false);
});

it('does not report a successful empty search when all returned news is malformed', async () => {
  const result = await createDeterministicOnlineResearchProvider({ search: jest.fn().mockResolvedValue({ news: [{ title: 'Invalid', link: 'javascript:alert(1)' }] }) })(position);
  expect(result).toMatchObject({ searchStatus: 'failed', failureReason: 'provider' });
});

it('retries by name when the full identifier query yields no usable news', async () => {
  const search = jest.fn().mockResolvedValueOnce({ news: [] }).mockResolvedValueOnce({ news: [
    { title: 'News', publisher: 'Publisher', link: 'https://example.com/news' },
  ] });
  const result = await createDeterministicOnlineResearchProvider({ search })(position);
  expect(search.mock.calls.map(call => call[0])).toEqual(['EXA.DE DE000EXAMPLE Example AG', 'Example AG']);
  expect(result.newsCount).toBe(1);
  expect(result.sources).toContainEqual(expect.objectContaining({ url: 'https://example.com/news' }));
  expect(result.text).toContain('und "Example AG"');
});
