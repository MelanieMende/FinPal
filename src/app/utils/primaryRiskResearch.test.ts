/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnalysisPosition } from './portfolioAnalysis';
import { PrimaryRiskResearch } from './primaryRiskResearch';
import { knownResearchSources } from './portfolioResearch';

jest.mock('pdf-parse', () => ({ PDFParse: class {
  constructor(private readonly options: { data: Buffer }) {}
  async getText() { return { text: Buffer.from(this.options.data).toString('utf8') }; }
  async destroy() { /* No native resources in this fixture. */ }
} }));

it('checks current SEC filings, reuses downloaded documents for 24 hours and detects changed contents', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-documents-'));
  let now = Date.parse('2026-10-21T10:00:00Z');
  let text = '<html><body>Net income was $8 billion. Cash and cash equivalents were $3 billion. Debt maturities were $1 billion.</body></html>';
  const fetcher = jest.fn(async (url: string) => url.includes('/submissions/')
    ? new Response(JSON.stringify({ filings: { recent: { form: ['10-Q'], accessionNumber: ['0000063908-26-000073'],
      primaryDocument: ['mcd-20260630.htm'], reportDate: ['2026-06-30'] } } }))
    : new Response(text, { headers: { 'content-type': 'text/html' } }));
  const position = { id: 1, name: "McDonald's", isin: 'US5801351017', symbol: 'MCD', type: 'Stock' } as AnalysisPosition;
  try {
    const file = path.join(folder, 'documents.json');
    const research = new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now);
    const first = await research.collect(position);
    expect(first.discoveryChecked).toBe(true);
    expect(first.documents[0].period).toBe('2026-06-30');
    expect(first.documents[0].excerpt).toContain('Net income');
    const documentsFetched = fetcher.mock.calls.filter(([url]) => !url.includes('/submissions/')).length;
    const submissionChecks = fetcher.mock.calls.filter(([url]) => url.includes('/submissions/')).length;
    const second = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(second.documents.map(document => document.hash)).toEqual(first.documents.map(document => document.hash));
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('/submissions/'))).toHaveLength(documentsFetched);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/submissions/'))).toHaveLength(submissionChecks);
    text = text.replace('$8 billion', '$7 billion');
    const forced = await research.collect(position, undefined, [], true);
    expect(forced.documents[0].hash).not.toBe(first.documents[0].hash);
    expect(fetcher.mock.calls.filter(([url]) => !url.includes('/submissions/')).length).toBeGreaterThan(documentsFetched);
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/submissions/'))).toHaveLength(submissionChecks + 1);
    now += 25 * 60 * 60 * 1000;
    text = text.replace('$7 billion', '$6 billion');
    const changed = await research.collect(position);
    expect(changed.documents[0].hash).not.toBe(first.documents[0].hash);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('accepts only issuer-hosted product documents for the exact ISIN and keeps them for 24 hours', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-product-documents-'));
  const now = Date.parse('2026-10-22T10:00:00Z');
  const position = { id: 8, name: 'iShares Example ETF', isin: 'IE00ZZZZZZZ1', symbol: 'EXAMPLE', type: 'ETF' } as AnalysisPosition;
  const html = `<html>ISIN ${position.isin}. As of 2026-09-30. Investment objective tracks an index. Ongoing charges 0.15 percent. Securities lending and currency risk.</html>`;
  const fetcher = jest.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } }));
  try {
    const file = path.join(folder, 'documents.json');
    const hint = { title: 'iShares Example ETF', url: `https://www.ishares.com/example/${position.isin}` };
    const first = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position, undefined, [hint]);
    expect(first.discoveryChecked).toBe(true);
    expect(first.gaps).toEqual([]);
    expect(first.documents[0]).toMatchObject({ period: '2026-09-30' });
    expect(first.documents[0].excerpt).toContain('Ongoing charges');
    const calls = fetcher.mock.calls.length;
    const second = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position, undefined, [hint]);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(second.documents[0].hash).toBe(first.documents[0].hash);
    const wrongFetcher = jest.fn(async () => new Response(html.replaceAll(position.isin, 'IE00B4L5Y983')));
    const wrong = await new PrimaryRiskResearch(path.join(folder, 'wrong.json'), wrongFetcher as unknown as typeof fetch, () => now).collect(position, undefined, [hint]);
    expect(wrong.discoveryChecked).toBe(false);
    expect(wrong.documents).toHaveLength(0);
    expect(wrong.gaps.length).toBeGreaterThan(0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('loads Munich Re issuer reports for its German ISIN and reuses their dated excerpts', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-munich-documents-'));
  const now = Date.parse('2026-10-22T10:00:00Z');
  const position = { id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE', type: 'Stock' } as AnalysisPosition;
  const report = 'Munich Re Half-Year Financial Report 2026. Net result was 3925 EUR million. Combined ratio was 68.9 percent. Solvency ratio was 304 percent. Cash and cash equivalents were 5819 EUR million. Going concern and regulatory supervision are described.';
  const fetcher = jest.fn(async (url: string) => new Response(report, { headers: { 'content-type': 'application/pdf' } }));
  try {
    const file = path.join(folder, 'documents.json');
    const first = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(first.discoveryChecked).toBe(true);
    expect(first.gaps).toEqual([]);
    expect(first.documents).toHaveLength(4);
    expect(first.documents[0].period).toBe('2026-06-30');
    expect(first.documents[0].excerpt).toContain('Combined ratio');
    expect(first.documents.map(doc => doc.source.url)).toEqual(knownResearchSources(position));
    const second = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(second.documents.map(doc => doc.hash)).toEqual(first.documents.map(doc => doc.hash));
    const wrongFetcher = jest.fn(async () => new Response(report.replaceAll('Munich Re', 'Other Company'), { headers: { 'content-type': 'application/pdf' } }));
    const wrong = await new PrimaryRiskResearch(path.join(folder, 'wrong.json'), wrongFetcher as unknown as typeof fetch, () => now).collect(position);
    expect(wrong.discoveryChecked).toBe(false);
    expect(wrong.documents).toHaveLength(0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
