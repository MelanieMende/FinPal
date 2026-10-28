/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnalysisPosition } from './portfolioAnalysis';
import { PrimaryRiskResearch, riskExcerpt } from './primaryRiskResearch';
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

it('resolves ADP by its verified ISIN even when the stored listing symbol is not NASDAQ ADP', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-adp-filings-'));
  const now = Date.parse('2026-10-27T10:00:00Z');
  const fetcher = jest.fn(async (url: string) => url.includes('/submissions/')
    ? new Response(JSON.stringify({ filings: { recent: {
      form: ['10-K', '10-Q'],
      accessionNumber: ['0000008670-26-000030', '0000008670-26-000019'],
      primaryDocument: ['adp-20260630.htm', 'adp-20260331.htm'],
      reportDate: ['2026-06-30', '2026-03-31'],
    } } }))
    : new Response('<html>AUTOMATIC DATA PROCESSING, INC. Net earnings $4,413.5 million. Cash and cash equivalents $4,230.1 million.</html>',
      { headers: { 'content-type': 'text/html' } }));
  try {
    const position = { id: 65, name: 'ADP', isin: 'US0530151036', symbol: 'ADP.DE', type: 'Stock' } as AnalysisPosition;
    const result = await new PrimaryRiskResearch(path.join(folder, 'documents.json'), fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(result.discoveryChecked).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.documents[0]).toMatchObject({ period: '2026-06-30', source: { title: 'SEC 10-K 2026-06-30',
      url: 'https://www.sec.gov/Archives/edgar/data/8670/000000867026000030/adp-20260630.htm' } });
    expect(fetcher.mock.calls.some(([url]) => url === 'https://data.sec.gov/submissions/CIK0000008670.json')).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => url.includes('company_tickers.json'))).toBe(false);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('maps Novo Nordisk B shares and ADRs to the issuer and selects the financial 6-K ahead of newer notices', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-novo-filings-'));
  const now = Date.parse('2026-10-27T10:00:00Z');
  const fetcher = jest.fn(async (url: string) => url.includes('/submissions/')
    ? new Response(JSON.stringify({ filings: { recent: {
      form: ['6-K', '6-K', '20-F'],
      accessionNumber: ['0001171843-26-005925', '0000353278-26-000023', '0000353278-26-000012'],
      primaryDocument: ['f6k_090726.htm', 'caq22026.htm', 'nvo-20251231.htm'],
      reportDate: ['2026-09-07', '2026-06-30', '2025-12-31'],
    } } }))
    : url.includes('f6k_090726.htm') ? new Response('', { status: 403 })
    : new Response('<html>Novo Nordisk A/S. Net profit was DKK 69,546 million. Cash and cash equivalents were DKK 20,000 million.</html>',
      { headers: { 'content-type': 'text/html' } }));
  try {
    for (const isin of ['DK0062498333', 'US6701002056']) {
      const position = { id: 51, name: 'Novo Nordisk', isin, symbol: isin.startsWith('DK') ? 'NOVO-B.CO' : 'NVO', type: 'Stock' } as AnalysisPosition;
      const result = await new PrimaryRiskResearch(path.join(folder, `${isin}.json`), fetcher as unknown as typeof fetch, () => now).collect(position);
      expect(result.discoveryChecked).toBe(true);
      expect(result.gaps).toEqual([]);
      expect(result.documents[0]).toMatchObject({ period: '2026-06-30', source: { title: 'SEC 6-K financial report 2026-06-30' } });
      expect(result.documents.map(document => document.source.title)).toContain('SEC 20-F 2025-12-31');
      expect(result.documents[0].source.url).toBe('https://www.sec.gov/Archives/edgar/data/353278/000035327826000023/caq22026.htm');
      if (isin === 'DK0062498333') {
        const file = path.join(folder, `${isin}.json`);
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        saved.submissions[0].filings.push({ title: 'SEC 6-K 2026-09-07', period: '2026-09-07',
          url: 'https://www.sec.gov/Archives/edgar/data/353278/000117184326005925/f6k_090726.htm' });
        fs.writeFileSync(file, JSON.stringify(saved));
        const reused = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
        expect(reused.gaps).toEqual([]);
        expect(reused.documents).toHaveLength(2);
      }
    }
    expect(fetcher.mock.calls.some(([url]) => url.includes('f6k_090726.htm'))).toBe(false);
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

it('loads the dated QDVE KID and current issuer facts for the exact share class', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-qdve-documents-'));
  const now = Date.parse('2026-10-27T10:00:00Z');
  const position = { id: 64, name: 'S&P 500 Information Technology', isin: 'IE00B3WJKG14', symbol: 'QDVE.DE', type: 'ETF' } as AnalysisPosition;
  const product = '<html>ISIN IE00B3WJKG14. Anteilsklassenvermögen Per 23.Okt.2026 USD 19.506.058.168. Das Anlagerisiko ist auf bestimmte Sektoren, Länder, Währungen oder Unternehmen konzentriert. Anzahl der Positionen Per 23.Okt.2026 75. Portfolioallokation Halbleiter 40,07%. Produktstruktur Physisch. Deutsche Börse AG QDVE EUR.</html>';
  const kid = 'Key Information Document. iShares S&P 500 Information Technology Sector UCITS ETF USD Accu ISIN: IE00B3WJKG14. The Manager is authorised in Ireland and regulated by the Central Bank of Ireland. The Fund tracks the S&P 500 Capped 35/20 Information Technology Index. This document is dated 03 September 2026. Management fees and other administrative or operating costs 0.15% of the value of your investment per year. Transaction costs 0.00%. Performance fees There is no performance fee for this product. The Fund may also engage in short-term secured lending of its investments to certain eligible third parties. The manager may use financial derivative instruments. Investors buy the shares on the secondary market at the then prevailing market price. The prevailing market price at which the shares trade on the secondary market may deviate from the value of the Shares. Be aware of currency risk.';
  const fetcher = jest.fn(async (url: string) => new Response(url.includes('/literature/kiid/') ? kid : product,
    { headers: { 'content-type': url.includes('/literature/kiid/') ? 'application/pdf' : 'text/html' } }));
  try {
    const file = path.join(folder, 'documents.json');
    const oldKid = 'https://www.ishares.com/ch/professionals/en/literature/kiid/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en.pdf';
    const result = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position, undefined,
      [{ title: 'Old iShares KID', url: oldKid }]);
    expect(result.gaps).toEqual([]);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.map(doc => doc.period)).toEqual(['2026-10-23', '2026-09-03']);
    expect(result.documents[0].excerpt).toContain('Halbleiter 40,07%');
    expect(result.documents[0].excerpt).toContain('Das Anlagerisiko ist auf bestimmte Sektoren');
    expect(result.documents[1].excerpt).toContain('Transaction costs 0.00%');
    expect(result.documents[1].excerpt).toContain('0.15% of the value of your investment per year');
    expect(result.documents[1].excerpt).toContain('short-term secured lending');
    expect(result.documents[1].excerpt).toContain('may deviate from the value of the Shares');
    expect(result.documents[1].excerpt).toContain('regulated by the Central Bank of Ireland');
    expect(result.documents[1].source.url).toContain('siteEntryPassthrough=true');
    expect(result.documents.every(doc => doc.identity === position.isin && doc.excerptVersion === 3)).toBe(true);
    expect(fetcher.mock.calls.some(([url]) => url === oldKid)).toBe(false);
    const old = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete old.documents[0].excerptVersion;
    fs.writeFileSync(file, JSON.stringify(old));
    const calls = fetcher.mock.calls.length;
    await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(fetcher.mock.calls.length).toBe(calls + 1);
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
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const oldAnnual = saved.documents.find((doc: { source: { url: string } }) => doc.source.url.includes('Group-Annual-Report-2025'));
    delete oldAnnual.excerptVersion;
    fs.writeFileSync(file, JSON.stringify(saved));
    const upgraded = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(upgraded.documents.find(doc => doc.source.url.includes('Group-Annual-Report-2025'))?.excerptVersion).toBe(2);
    const wrongFetcher = jest.fn(async () => new Response(report.replaceAll('Munich Re', 'Other Company'), { headers: { 'content-type': 'application/pdf' } }));
    const wrong = await new PrimaryRiskResearch(path.join(folder, 'wrong.json'), wrongFetcher as unknown as typeof fetch, () => now).collect(position);
    expect(wrong.discoveryChecked).toBe(false);
    expect(wrong.documents).toHaveLength(0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('loads Lufthansa interim and annual reports for its verified German ISIN', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-lufthansa-documents-'));
  const now = Date.parse('2026-10-26T10:00:00Z');
  const position = { id: 18, name: 'Lufthansa', isin: 'DE0008232125', symbol: 'LHA.DE', type: 'Stock' } as AnalysisPosition;
  const report = 'Lufthansa Group 2nd Interim Report January - June 2026. Net profit/loss attributable to shareholders of Deutsche Lufthansa AG -542 EUR million. EBIT margin -0.7 percent. Cash and cash equivalents 1,799 EUR million. Opportunities and risk report.';
  const fetcher = jest.fn(async (url: string) => url.includes('financial-reports.html')
    ? new Response('<a href="/fileadmin/downloads/en/financial-reports/interims-reports/LH-QR-2026-2-e.pdf">Q2</a><a href="/fileadmin/downloads/en/financial-reports/annual-reports/LH-AR-2025-e.pdf">Annual</a>')
    : new Response(report, { headers: { 'content-type': 'application/pdf' } }));
  try {
    const file = path.join(folder, 'documents.json');
    const first = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(first.discoveryChecked).toBe(true);
    expect(first.gaps).toEqual([]);
    expect(first.documents.map(doc => doc.period)).toEqual(['2026-06-30', '2025-12-31']);
    expect(first.documents[0].excerpt).toContain('Net profit/loss attributable to shareholders');
    expect(first.documents[0].excerpt).toContain('EBIT margin');
    expect(first.documents.map(doc => doc.source.url)).toEqual(knownResearchSources(position));
    const again = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(again.documents).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(4);
    const wrong = await new PrimaryRiskResearch(path.join(folder, 'wrong.json'),
      jest.fn(async (url: string) => url.includes('financial-reports.html') ? new Response('')
        : new Response(report.replaceAll('Lufthansa', 'Other Airline'), { headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch,
      () => now).collect(position);
    expect(wrong.discoveryChecked).toBe(false);
    expect(wrong.documents).toHaveLength(0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('prefers a newly published Lufthansa interim report from the issuer index', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-lufthansa-new-report-'));
  const now = Date.parse('2026-11-04T10:00:00Z');
  const position = { id: 18, name: 'Lufthansa', isin: 'DE0008232125', symbol: 'LHA.DE', type: 'Stock' } as AnalysisPosition;
  const report = 'Lufthansa Group. Net profit/loss -100 EUR million. EBIT margin -0.2 percent.';
  const fetcher = jest.fn(async (url: string) => url.includes('financial-reports.html')
    ? new Response('<a href="/fileadmin/downloads/en/financial-reports/interims-reports/LH-QR-2026-3-e.pdf">Q3</a>')
    : new Response(report, { headers: { 'content-type': 'application/pdf' } }));
  try {
    const result = await new PrimaryRiskResearch(path.join(folder, 'documents.json'), fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(result.documents[0].period).toBe('2026-09-30');
    expect(result.documents[0].source.url).toContain('LH-QR-2026-3-e.pdf');
    expect(result.discoveryChecked).toBe(true);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('loads only verified Arbor Metals filing copies for its Canadian ISIN', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-arbor-documents-'));
  const now = Date.parse('2026-10-26T10:00:00Z');
  const position = { id: 19, name: 'Arbor Metals', isin: 'CA03880B1040', symbol: 'CA03880B1040.SG', type: 'Stock' } as AnalysisPosition;
  const fetcher = jest.fn(async (url: string) => new Response(`ARBOR METALS CORP. ${url.includes('2026-02-21') ? 'October 31, 2025' : 'April 30, 2026'}. Net income (loss) (420,586) CAD. Cash and cash equivalents 716,380 CAD. Material uncertainty may cast significant doubt upon the Company ability to continue as a going concern.`,
    { headers: { 'content-type': 'application/pdf' } }));
  try {
    const file = path.join(folder, 'documents.json');
    const result = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(result.discoveryChecked).toBe(true);
    expect(result.gaps).toEqual([]);
    expect(result.documents.map(doc => doc.period)).toEqual(['2026-04-30', '2026-04-30', '2025-10-31']);
    expect(result.documents[0].excerpt).toContain('Material uncertainty');
    expect(result.documents.map(doc => doc.source.url)).toEqual(knownResearchSources(position).filter(url => url.includes('cdn.financialreports.eu')));
    const again = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(again.documents).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const wrong = await new PrimaryRiskResearch(path.join(folder, 'wrong.json'),
      jest.fn(async () => new Response('OTHER METALS CORP. April 30, 2026. October 31, 2025. Cash 1,000.',
        { headers: { 'content-type': 'application/pdf' } })) as unknown as typeof fetch, () => now).collect(position);
    expect(wrong.discoveryChecked).toBe(false);
    expect(wrong.documents).toHaveLength(0);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('prioritizes Munich Re disclosures about actual legal and regulatory proceedings', () => {
  const legal = 'Legal risks As part of the normal course of business, Munich Re companies are involved in court, regulatory and arbitration proceedings in various countries. The outcome of those proceedings is neither certain nor predictable. However, we believe that none will have a significant negative effect on Munich Re.';
  const text = `Munich Re Group Annual Report 2025. ${'Regulatory supervision is monitored. '.repeat(200)} ${legal}`;
  const excerpt = riskExcerpt(text, 'Stock', true);
  expect(excerpt).toContain('involved in court, regulatory and arbitration proceedings');
  expect(excerpt).toContain('none will have a significant negative effect');
  const halfYear = riskExcerpt('Munich Re Half-Year Financial Report 2026. The statements relating to opportunities and risks as presented in the Munich Re Group Annual Report 2025 apply unchanged. Munich Re continues to enjoy a very solid capital base.', 'Stock', true);
  expect(halfYear).toContain('apply unchanged');
  const liquidity = riskExcerpt('Munich Re. Our objective in managing liquidity risk is to ensure that we are in a position to meet our payment obligations at all times. The use of quantitative risk criteria also ensures that sufficient liquidity is available even under adverse scenarios. The overview below shows the liquidity requirements arising from our financial liabilities, divided into maturity bands.', 'Stock', true);
  expect(liquidity).toContain('adverse scenarios');
  expect(liquidity).toContain('maturity bands');
});

it('extracts issuer net earnings and reported operating margin from SEC filings', () => {
  const filing = `<html><body><h2>Condensed Consolidated Statements of Earnings</h2>
    <p>For the Six Months Ended June 30, 2026</p>
    <table><tr><td>Net revenues</td><td>$</td><td>19,435</td></tr>
    <tr><td>Operating income</td><td>$</td><td>2,754</td></tr>
    <tr><td>Net earnings attributable to Mondelēz International</td><td>$</td><td>2,108</td></tr></table>
    <p>Operating income margin increased from 10.1% in the first six months of 2025 to 14.2% in the first six months of 2026.</p></body></html>`;
  const excerpt = riskExcerpt(filing);
  expect(excerpt).toContain('Net earnings attributable to Mondelēz International');
  expect(excerpt).toContain('2,108');
  expect(excerpt).toContain('Operating income margin increased');
  expect(excerpt).toContain('14.2%');
});

it('prioritizes a current SEC filing conclusion about material legal impact', () => {
  const filing = `<html><p>${'Regulatory matters are described. '.repeat(80)}</p><p>At present we believe that the ultimate outcome of these legal proceedings and regulatory and governmental matters, individually and in the aggregate, will not materially harm our financial position, results of operations or cash flows. However, legal proceedings and regulatory and governmental matters are subject to inherent uncertainties, and unfavorable resolutions could involve substantial fines.</p></html>`;
  const excerpt = riskExcerpt(filing);
  expect(excerpt).toContain('will not materially harm our financial position');
  expect(excerpt).toContain('unfavorable resolutions could involve substantial fines');
});

it('retains McDonalds maturity schedule and conditional capital-flow wording in filing excerpts', () => {
  const filing = `<html><p>${'Ordinary filing text. '.repeat(1200)}</p>
    <p>Aggregate maturities for 2025 debt balances, before fair value adjustments and deferred debt costs, are as follows (in millions): 2026–$0; 2027–$3,201; 2028–$5,166.</p>
    <p>Our operations may also be impacted by regulations affecting capital flows, financial markets or financial institutions, which can limit our ability to manage and deploy our liquidity or increase our funding costs. Any such events could have a material adverse effect on our business.</p></html>`;
  const excerpt = riskExcerpt(filing);
  expect(excerpt).toContain('2027–$3,201');
  expect(excerpt).toContain('may also be impacted by regulations affecting capital flows');
  expect(excerpt).toContain('Any such events could have a material adverse effect');
});

it('retains Novo Nordisks current borrowings and twelve-month funding statement', () => {
  const filing = `<html><p>${'Other report text. '.repeat(1200)}</p>
    <p>DKK million 30 Jun 2026 31 Dec 2025 Borrowings, non-current (121,794) (118,941) Borrowings, current (18,333) (12,017) Add-back of lease liabilities 8,622 8,572 Cash at bank 44,482 26,464.</p>
    <p>Novo Nordisk believes its financial resources are sufficient to meet its requirements for at least the next 12 months.</p></html>`;
  const excerpt = riskExcerpt(filing);
  expect(excerpt).toContain('Borrowings, current (18,333)');
  expect(excerpt).toContain('Cash at bank 44,482');
  expect(excerpt).toContain('financial resources are sufficient');
});

it('rebuilds cached stock excerpts created before the earnings and margin extraction update', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-stock-excerpt-'));
  const now = Date.parse('2026-10-26T10:00:00Z');
  const position = { id: 17, name: 'Mondelez', isin: 'US6092071058', symbol: 'MDLZ', type: 'Stock' } as AnalysisPosition;
  const fetcher = jest.fn(async (url: string) => url.includes('/submissions/')
    ? new Response(JSON.stringify({ filings: { recent: { form: ['10-Q'], accessionNumber: ['0001628280-26-050179'],
      primaryDocument: ['mdlz-20260630.htm'], reportDate: ['2026-06-30'] } } }))
    : new Response('<html>Net earnings attributable to Mondelez International $ 2,108. Operating income margin 14.2%.</html>'));
  try {
    const file = path.join(folder, 'documents.json');
    const research = new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now);
    const first = await research.collect(position);
    expect(first.documents[0].excerptVersion).toBe(2);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete saved.documents[0].excerptVersion;
    saved.documents[0].excerpt = 'Old excerpt';
    fs.writeFileSync(file, JSON.stringify(saved));
    const second = await new PrimaryRiskResearch(file, fetcher as unknown as typeof fetch, () => now).collect(position);
    expect(second.documents[0].excerpt).toContain('Net earnings attributable');
    expect(second.documents[0].excerptVersion).toBe(2);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});
