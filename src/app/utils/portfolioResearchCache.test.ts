/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PortfolioResearchCache, RESEARCH_CACHE_TTL_MS, RESEARCH_POLICY } from './portfolioResearchCache';
import { buildResearchSecurities } from './portfolioResearch';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-research-test-'));
  file = path.join(dir, 'cache.json');
});
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });
const research = { text: 'Source-backed research', sources: [{ title: 'Issuer', url: 'https://example.com/report' }], fetchedAt: 0 };

it.each([
  ['2026-03-29T21:59:59Z', '2026-03-29T22:00:00Z'],
  ['2026-10-25T22:59:59Z', '2026-10-25T23:00:00Z'],
])('reuses data across German midnight and expires after exactly 24 hours: %s', (before, after) => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(before));
  const cache = new PortfolioResearchCache(file);
  cache.set('key', { ...research, fetchedAt: Date.now() });
  expect(new PortfolioResearchCache(file).get('key')).toBeDefined();
  clock.mockReturnValue(Date.parse(after));
  expect(cache.get('key')).toBeDefined();
  expect(new PortfolioResearchCache(file).get('key')).toBeDefined();
  clock.mockReturnValue(Date.parse(before) + RESEARCH_CACHE_TTL_MS - 1);
  expect(cache.get('key')).toBeDefined();
  clock.mockReturnValue(Date.parse(before) + RESEARCH_CACHE_TTL_MS);
  expect(cache.get('key')).toBeUndefined();
  expect(new PortfolioResearchCache(file).get('key')).toBeUndefined();
});

it('finds successful asset research across groups and scopes without mixing instruments', () => {
  const securities = buildResearchSecurities([{ id: 12, name: 'Arbor Metals', isin: 'CA03880B1040', symbol: 'CA03880B1040.SG', type: 'Stock' }]);
  const cache = new PortfolioResearchCache(file);
  const value = { ...research, fetchedAt: Date.now() };
  cache.set(JSON.stringify({ researchPolicy: RESEARCH_POLICY, scope: 'portfolio', securities }), value);
  expect(new PortfolioResearchCache(file).findForSecurity(securities[0])).toEqual(value);
  expect(cache.findForSecurity({ ...securities[0], isin: 'OTHER' })).toBeUndefined();
  expect(cache.findForSecurity({ ...securities[0], symbol: 'OTHER' })).toBeUndefined();
});

it('can select deterministic results independently of a more recent AI research entry', () => {
  const securities = buildResearchSecurities([{ id: 1, name: 'Example', isin: 'US0000001234', symbol: 'EXM', type: 'Stock' }]);
  const cache = new PortfolioResearchCache(file);
  const discovery = { ...research, text: 'Manuell aktualisierte Onlinesuche', fetchedAt: Date.now() - 1000 };
  const ai = { ...research, text: 'Separater KI-Befund', fetchedAt: Date.now() };
  cache.set(JSON.stringify({ researchPolicy: RESEARCH_POLICY, provider: 'deterministic-online', scope: 'asset', securities }), discovery);
  cache.set(JSON.stringify({ researchPolicy: RESEARCH_POLICY, provider: 'api', scope: 'asset', securities }), ai);
  expect(cache.findForSecurity(securities[0], true)).toEqual(ai);
  expect(cache.findForSecurity(securities[0], true, 'deterministic-online')).toEqual(discovery);
});

it('restores a successful deterministic search with no results without accepting empty AI research', () => {
  const securities = buildResearchSecurities([{ id: 1, name: 'Example', isin: '', symbol: '', type: 'Stock' }]);
  const cache = new PortfolioResearchCache(file);
  const empty = { text: 'Keine Treffer gefunden.', sources: [] as { title: string; url: string }[], fetchedAt: Date.now() };
  cache.set(JSON.stringify({ researchPolicy: RESEARCH_POLICY, provider: 'deterministic-online', scope: 'asset', securities }), empty);
  cache.set(JSON.stringify({ researchPolicy: RESEARCH_POLICY, provider: 'api', scope: 'asset', securities }), empty);
  const restarted = new PortfolioResearchCache(file);
  expect(restarted.findForSecurity(securities[0], true, 'deterministic-online')).toEqual(empty);
  expect(restarted.findForSecurity(securities[0])).toBeUndefined();
});

it.each(['{broken', JSON.stringify({ version: 999, entries: [] })])('ignores damaged or unsupported files', contents => {
  fs.writeFileSync(file, contents);
  expect(() => new PortfolioResearchCache(file)).not.toThrow();
  expect(new PortfolioResearchCache(file).get('key')).toBeUndefined();
});

it('discards stale, future and unsafe-source records while restoring a valid entry', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  jest.spyOn(Date, 'now').mockReturnValue(now);
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: [
    ['valid', { ...research, fetchedAt: now }],
    ['old', { ...research, fetchedAt: now - 86400000 }],
    ['future', { ...research, fetchedAt: now + 60000 }],
    ['unsafe', { ...research, fetchedAt: now, sources: [{ title: 'Bad', url: 'javascript:alert(1)' }] }],
    ['empty', { ...research, fetchedAt: now, sources: [] }],
  ] }));
  const cache = new PortfolioResearchCache(file);
  expect(cache.get('valid')).toEqual({ ...research, fetchedAt: now });
  for (const key of ['old', 'future', 'unsafe', 'empty']) expect(cache.get(key)).toBeUndefined();
});
