import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalysisPosition, AnalysisSource } from './portfolioAnalysis';
import { knownResearchSources } from './portfolioResearch';

export interface RiskDocument {
  source: AnalysisSource;
  excerpt: string;
  hash: string;
  fetchedAt: number;
  period: string | null;
  identity?: string;
  excerptVersion?: number;
}
export interface RiskDocumentSet {
  documents: RiskDocument[];
  discoveryChecked: boolean;
  gaps: string[];
}

const DAY = 24 * 60 * 60 * 1000;
const MAX_BYTES = 16_000_000;
const MAX_DOCUMENTS = 4;
const TREASURY_BOND_ISIN = 'US912810SQ22';
const TREASURY_OFFERING_2020 = 'https://www.treasurydirect.gov/instit/annceresult/press/preanre/2020/A_20201015_1.pdf';
const treasuryAuctionUrl = (url: string) => /^https:\/\/www\.treasurydirect\.gov\/instit\/annceresult\/press\/preanre\/2020\/(?:R_20200819_3|A_20201015_1)\.pdf$/i.test(url);
const treasuryGeneralUrl = (url: string) => [
  'https://www.treasurydirect.gov/research-center/history-of-marketable-securities/',
  'https://www.treasurydirect.gov/marketable-securities/',
  'https://www.treasurydirect.gov/marketable-securities/selling-marketable-securities/',
].includes(url);
const RHEINMETALL_ANNUAL_2025 = 'https://ir.rheinmetall.com/media/document/214a8f96-a9e5-4296-9a89-e2b65122d258/assets/Rheinmetall-Annual-Report-2025.pdf';
const munichAnnualLegalReport = (url: string) => url.includes('/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf');
const munichHalfYearRiskUpdateReport = (url: string) => url.includes('/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf');
const munichRiskExcerptReport = (url: string) => munichAnnualLegalReport(url) || munichHalfYearRiskUpdateReport(url);
const LUFTHANSA_REPORT_INDEX = 'https://investor-relations.lufthansagroup.com/en/financial-reports-publications/financial-reports.html';
const lufthansaReportPeriod = (url: string): string | null => {
  const interim = /\/LH-QR-(20\d{2})-([1-3])-e\.pdf$/i.exec(url);
  if (interim) return `${interim[1]}-${['03-31', '06-30', '09-30'][Number(interim[2]) - 1]}`;
  const annual = /\/LH-AR-(20\d{2})-e\.pdf$/i.exec(url);
  return annual ? `${annual[1]}-12-31` : null;
};
const SEC_CIK_BY_ISIN: Record<string, string> = {
  US0530151036: '0000008670',
  US5801351017: '0000063908',
  US6092071058: '0001103982',
  US47759T1007: '0001481513',
  DK0062498333: '0000353278',
  US6701002056: '0000353278',
};
const ISSUER_HOST_BY_ISIN: Record<string, string> = {
  DE0007030009: 'ir.rheinmetall.com',
  DE0008232125: 'investor-relations.lufthansagroup.com',
  DE0008430026: 'www.munichre.com',
  US47759T1007: 'ir.jinkosolar.com',
  CA03880B1040: 'arbormetalscorp.com',
};
const KNOWN_STOCK_REPORT_PERIOD = (isin: string, url: string): string | null => {
  if (isin === 'DE0007030009') {
    if (url === 'https://ir.rheinmetall.com/media/document/1bbcaadf-0e67-45bc-80df-bba822823824/assets/DE0007030009-Q2-2026-EQ-E-00.pdf') return '2026-06-30';
    if (url === RHEINMETALL_ANNUAL_2025) return '2025-12-31';
    return null;
  }
  if (isin === 'CA03880B1040') {
    if (url.endsWith('/46989_rns_2026-06-10_705e6e40-5c45-419b-96c0-21acf3219846.pdf')
      || url.endsWith('/46989_rns_2026-06-10_e4ebb3a3-86bd-496c-bbec-8c980d358494.pdf')) return '2026-04-30';
    if (url.endsWith('/46989_rns_2026-02-21_ac4032f4-a922-4eef-aac8-50a80bea9e26.pdf')) return '2025-10-31';
    return null;
  }
  if (isin === 'DE0008232125') return lufthansaReportPeriod(url);
  if (isin !== 'DE0008430026') return null;
  if (url.includes('/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf') ||
    url.includes('/2026-half-year-financial-report/MunichRe-Media-release-Q2-2026_en.pdf')) return '2026-06-30';
  if (url.includes('/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf') ||
    url.includes('/SFCR-Munich-Re-Group-2025.pdf')) return '2025-12-31';
  return null;
};
const PRODUCT_HOSTS = ['ishares.com', 'blackrock.com', 'vanguard.co.uk', 'vanguard.com',
  'amundietf.com', 'amundi.com', 'etf.dws.com', 'invesco.com', 'wisdomtree.eu',
  'apollo.com', 'treasurydirect.gov'];
const officialProductHost = (host: string) => PRODUCT_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
const keywordGroups = [
  /Borrowings, current/ig,
  /Novo Nordisk believes its financial resources are sufficient to meet its requirements for at least the next 12 months/ig,
  /Aggregate maturities for 2025 debt balances/ig,
  /operations may also be impacted by regulations affecting capital flows/ig,
  /There were no material changes to the disclosure made in the Company's Annual Report/ig,
  /opportunities and risk report|net profit\/loss attributable to shareholders|liquid funds/ig,
  /ultimate outcome of these legal proceedings and regulatory and governmental matters/ig,
  /operating income margin|operating margin|EBIT margin/ig,
  /net (?:income|loss|earnings)(?: attributable to [^\n.]{1,80})?|net profit\/loss/ig,
  /operating (?:income|loss)|gross (?:profit|margin)/ig,
  /cash and cash equivalents|restricted cash|liquidity|current liabilities/ig,
  /short.term borrowings|long.term debt|credit facilit|maturit|debt obligations/ig,
  /going concern|substantial doubt/ig,
  /legal proceedings|regulator|tariff|trade restriction|anti.dump|forced labor/ig,
];
const mondelezKeywords = [
  /Current portion of long-term debt/ig,
  /ultimate outcome of these legal proceedings and regulatory and governmental matters/ig,
  /unfavorable resolutions could involve substantial fines/ig,
];
const rheinmetallKeywords = [
  /Earnings after taxes/ig,
  /Earnings attributable to Rheinmetall AG shareholders/ig,
  /Operating result margin/ig,
  /Cash and cash equivalents/ig,
  /Net financial debt|Net liquidity/ig,
  /Financial liabilities|upcoming maturities/ig,
  /There are no existential risks/ig,
  /The opportunities and risks relating to the expected development of the Rheinmetall Group/ig,
  /F126 frigate|regulatory constraints|export control/ig,
];
const insuranceKeywords = [
  /Legal risks\s+As part of the normal course of business/ig,
  /statements relating to opportunities and risks\s+as presented in the Munich Re Group Annual Report 2025\s+apply unchanged/ig,
  /Our objective in managing liquidity risk is to ensure that we\s+are in a position to meet our payment obligations at all\s+times/ig,
  /quantitative risk criteria also ensures that sufficient liquidity\s+is available even under adverse scenarios/ig,
  /The overview below shows the liquidity requirements\s+arising from our financial liabilities, divided into maturity\s+bands/ig,
  /net result|consolidated result|konzernergebnis/ig,
  /combined ratio|total technical result|underwriting result|versicherungstechnisch/ig,
  /solvency ratio|solvency capital requirement|eligible own funds|solvenzquote/ig,
  /cash and cash equivalents|liquidity risk|liquidit|subordinated liabilities|maturit/ig,
  /going concern|material uncertainty|fortführ/ig,
  /BaFin|supervisory authority|regulat|legal proceedings|litigation|sanction/ig,
];
const productKeywords = [
  /ISIN|CUSIP|share class|Anteilsklasse|issuer|emittent|fund name|product name/ig,
  /objective|strategy|index|benchmark|replication|investment policy|anlageziel|anlagepolitik/ig,
  /ongoing charge|total expense|TER|management fee|costs|kosten|gebühr/ig,
  /net asset value|NAV|valuation date|bewertungsstichtag|redemption|rückgabe|liquidity|liquidität/ig,
  /maturity|coupon|senior|subordinat|collateral|credit risk|fälligkeit|kupon|rang/ig,
  /concentration|holdings|sector|derivative|securities lending|hedg|currency|währung/ig,
  /custody|custodian|counterparty|protocol|governance|regulator|risk factor|risiken/ig,
];
const treasuryBondKeywords = [
  /912810SQ2/ig,
  /Interest Rate\s+1-1\/8%/ig,
  /Interest Payment Dates\s+February 15 and August 15/ig,
  /Maturity Date\s+August 15,? 2040/ig,
  /direct obligations of the U\.S\. government/ig,
  /backed by the full faith and credit of the United States government/ig,
  /sell it before it matures|sell a Treasury marketable security/ig,
  /bank, broker, or dealer/ig,
];
const qdveKeywords = [
  /IE00B3WJKG14/ig,
  /Das Anlagerisiko ist auf bestimmte Sektoren|Investment risk is concentrated in specific sectors/ig,
  /The Manager is authorised in Ireland and regulated by the Central Bank of Ireland/ig,
  /S&P 500 Capped 35\/20 Information Technology Index/ig,
  /0\.15% of the value of your investment per year|Gesamtkostenquote/ig,
  /Transaction costs\s+0\.00%/ig,
  /Performance fees\s+There is no performance fee/ig,
  /Anteilsklassenvermögen Per|Anzahl der Positionen Per|Portfolioallokation|Number of Holdings as of/ig,
  /short-term secured lending of its investments|Wertpapierleihe Überblick/ig,
  /financial derivative instruments|Product Structure|Produktstruktur/ig,
  /shares on the secondary market[\s\S]{0,160}?prevailing market price|Sekundärmarkt/ig,
  /prevailing market price[\s\S]{0,140}?may deviate from the value of the Shares/ig,
  /Be aware of currency risk|Währungsrisiko|Share Class Currency|Währung der Reihe/ig,
];
const vgwdKeywords = [
  /IE00B8GKDB10/ig,
  /Product:\s*Vanguard FTSE All-World High Dividend Yield UCITS ETF/ig,
  /short term secured lending of its investments/ig,
  /The Fund may use derivatives/ig,
  /0\.29% of the value of your investment p\.a\./ig,
  /0\.04% of the value of your investment per year/ig,
  /There is no performance fee for this Fund/ig,
  /Top 10 approximately equals\s+[\d.]+% of net assets/ig,
  /Number of stocks\s+[\d,]+/ig,
  /Weighted exposure\s*Financials|Market allocation\s*United States/ig,
  /The Fund is authorised in Ireland|regulated by the Central Bank/ig,
  /ETF Shares in the Fund can be bought or sold on a daily basis/ig,
  /Liquidity risk\. Lower liquidity|Counterparty risk\. The insolvency/ig,
];
const allowedDocumentUrl = (value: string, curated: Set<string>, issuerHost?: string, cik?: string | null) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      ((!!cik && url.hostname === 'www.sec.gov' && url.pathname.startsWith(`/Archives/edgar/data/${Number(cik)}/`)) ||
        (issuerHost === 'arbormetalscorp.com' && url.hostname === 'cdn.financialreports.eu'
          && url.pathname.startsWith('/financialreports/media/filings/46989/') && curated.has(url.toString())) ||
        (!!issuerHost && url.hostname === issuerHost && (curated.has(url.toString()) ||
          [...curated].some(known => url.toString().startsWith(`${known}/_jcr_content/renditions/`)))));
  } catch { return false; }
};
const decodeEntities = (value: string) => value.replace(/&(?:nbsp|amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (match, decimal, hex) => {
  if (decimal || hex) {
    const code = parseInt(decimal || hex, hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  }
  return ({ '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[match.toLowerCase()] ?? ' ';
});
export function riskExcerpt(html: string, type: AnalysisPosition['type'] = 'Stock', insurance = false, isin = ''): string {
  const plain = decodeEntities(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(?:p|div|tr|table|h[1-6]|li)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  const found: string[] = [];
  const qdve = type === 'ETF' && isin === 'IE00B3WJKG14';
  const vgwd = type === 'ETF' && isin === 'IE00B8GKDB10';
  const rheinmetall = type === 'Stock' && isin === 'DE0007030009';
  const mondelez = type === 'Stock' && isin === 'US6092071058';
  const treasuryBond = type === 'Bond' && isin === TREASURY_BOND_ISIN;
  for (const pattern of insurance ? insuranceKeywords : type === 'Stock'
    ? rheinmetall ? [...rheinmetallKeywords, ...keywordGroups]
      : mondelez ? [...mondelezKeywords, ...keywordGroups] : keywordGroups
    : qdve ? [...qdveKeywords, ...productKeywords] : vgwd ? [...vgwdKeywords, ...productKeywords]
      : treasuryBond ? [...treasuryBondKeywords, ...productKeywords] : productKeywords) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let count = 0;
    while ((match = pattern.exec(plain)) && count < (qdve || vgwd || rheinmetall || treasuryBond ? 1 : type === 'Stock' ? 5 : 4)) {
      const start = Math.max(0, match.index - 160);
      const end = Math.min(plain.length, match.index + 430);
      const fragment = plain.slice(start, end).trim();
      if (found.some(item => item === fragment)) continue;
      found.push(fragment);
      count++;
      pattern.lastIndex = end;
    }
  }
  return found.join('\n[…]\n').slice(0, insurance ? 24000 : 18000);
}
function productDocumentPeriod(text: string, now: number): string | null {
  const dates: number[] = [];
  const pattern = /(?:as of|as at|dated|date of production|stand|stichtag|daten per)\s*[:]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi;
  for (const match of text.matchAll(pattern)) {
    const value = match[1];
    const eu = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
    const parsed = Date.parse(eu ? `${eu[3]}-${eu[2].padStart(2, '0')}-${eu[1].padStart(2, '0')}`
      : /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : `${value} UTC`);
    if (Number.isFinite(parsed) && parsed <= now + DAY && parsed > now - 3 * 365 * DAY) dates.push(parsed);
  }
  const germanMonths: Record<string, string> = { jan: '01', feb: '02', 'mär': '03', mrz: '03', apr: '04', mai: '05', jun: '06', jul: '07',
    aug: '08', sep: '09', sept: '09', okt: '10', nov: '11', dez: '12' };
  for (const match of text.matchAll(/\b(?:per|zum|stand)\s+(\d{1,2})\.(Jan|Feb|Mär|Mrz|Apr|Mai|Jun|Jul|Aug|Sept?|Okt|Nov|Dez)\.?(20\d{2})/gi)) {
    const date = Date.parse(`${match[3]}-${germanMonths[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`);
    if (Number.isFinite(date) && date <= now + DAY && date > now - 3 * 365 * DAY) dates.push(date);
  }
  return dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;
}

type SecSubmission = { filings?: { recent?: { form?: string[]; accessionNumber?: string[]; primaryDocument?: string[]; reportDate?: string[] } } };
function secUrls(cik: string, value: SecSubmission): { url: string; title: string; period: string | null }[] {
  const recent = value.filings?.recent;
  if (!recent?.form || !recent.accessionNumber || !recent.primaryDocument) return [];
  const selected: { url: string; title: string; period: string | null }[] = [];
  const counts = new Map<string, number>();
  if (cik === '0000353278') {
    const financial = recent.form.findIndex((form, index) => form === '6-K'
      && /^caq[1-4]20\d{2}\.htm$/i.test(recent.primaryDocument?.[index] ?? '')
      && /^\d{4}-\d{2}-\d{2}$/.test(recent.reportDate?.[index] ?? '')
      && /^\d{18}$/.test(recent.accessionNumber?.[index]?.replace(/-/g, '') ?? ''));
    if (financial >= 0) {
      const accession = recent.accessionNumber[financial].replace(/-/g, '');
      selected.push({ url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${recent.primaryDocument[financial]}`,
        title: `SEC 6-K financial report ${recent.reportDate?.[financial]}`, period: recent.reportDate?.[financial] ?? null });
      counts.set('6-K', 1);
    }
  }
  for (let index = 0; index < recent.form.length && selected.length < 3; index++) {
    const form = recent.form[index];
    // Novo Nordisk files frequent 6-K notices (for example weekly buyback updates).
    // Its periodized financial 6-K was selected above; keep those notices out of the mandatory risk-document set.
    if (cik === '0000353278' && form === '6-K') continue;
    if (!['10-K', '10-Q', '20-F', '6-K'].includes(form) || (counts.get(form) ?? 0) >= (form === '6-K' ? 2 : 1)) continue;
    const accession = recent.accessionNumber[index]?.replace(/-/g, '');
    const document = recent.primaryDocument[index];
    if (!/^\d{18}$/.test(accession ?? '') || !/^[A-Za-z0-9._-]+\.(?:htm|html|pdf)$/i.test(document ?? '')) continue;
    if (selected.some(filing => filing.url.endsWith(`/${accession}/${document}`))) continue;
    counts.set(form, (counts.get(form) ?? 0) + 1);
    selected.push({ url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${document}`,
      title: `SEC ${form} ${recent.reportDate?.[index] ?? ''}`.trim(), period: recent.reportDate?.[index] ?? null });
  }
  return selected;
}

export class PrimaryRiskResearch {
  private readonly cache = new Map<string, RiskDocument>();
  private readonly submissions = new Map<string, { fetchedAt: number; filings: ReturnType<typeof secUrls> }>();
  private readonly cikCache = new Map<string, { fetchedAt: number; cik: string | null }>();
  private tickerDirectory?: Promise<Array<{ cik_str: number; ticker: string; title: string }>>;
  constructor(private readonly file: string, private readonly requestFetch: typeof fetch = fetch, private readonly now = Date.now) {
    try {
      if (fs.statSync(file).size > 20_000_000) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if ([1, 2].includes(saved.version) && Array.isArray(saved.documents)) for (const doc of saved.documents.slice(-120)) {
        if (doc && typeof doc.source?.url === 'string' && typeof doc.excerpt === 'string' && typeof doc.hash === 'string'
          && Number.isFinite(doc.fetchedAt) && typeof doc.source?.title === 'string') this.cache.set(doc.source.url,
            doc.source.title.trim() ? doc : { ...doc, source: { ...doc.source,
              title: doc.source.url.split('/').filter(Boolean).pop() || 'Primärbericht' } });
      }
      if (saved.version === 2 && Array.isArray(saved.submissions)) for (const entry of saved.submissions) {
        if (entry && typeof entry.cik === 'string' && Number.isFinite(entry.fetchedAt) && Array.isArray(entry.filings))
          this.submissions.set(entry.cik, { fetchedAt: entry.fetchedAt, filings: entry.filings });
      }
      if (saved.version === 2 && Array.isArray(saved.identifiers)) for (const entry of saved.identifiers) {
        if (entry && typeof entry.isin === 'string' && Number.isFinite(entry.fetchedAt) &&
          (entry.cik === null || /^\d{10}$/.test(entry.cik))) this.cikCache.set(entry.isin, { fetchedAt: entry.fetchedAt, cik: entry.cik });
      }
    } catch { /* Missing or damaged cache is rebuilt from primary sources. */ }
  }
  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 2, documents: [...this.cache.values()].slice(-120),
        submissions: [...this.submissions].map(([cik, value]) => ({ cik, ...value })),
        identifiers: [...this.cikCache].map(([isin, value]) => ({ isin, ...value })) }), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
  private async resolveCik(position: AnalysisPosition, signal?: AbortSignal): Promise<string | null> {
    const known = SEC_CIK_BY_ISIN[position.isin.trim().toUpperCase()];
    if (known) return known;
    if (position.type !== 'Stock' || !position.isin.trim().toUpperCase().startsWith('US')) return null;
    const isin = position.isin.trim().toUpperCase();
    const stored = this.cikCache.get(isin);
    if (stored && this.now() - stored.fetchedAt < DAY) return stored.cik;
    if (stored) this.tickerDirectory = undefined;
    const ticker = position.symbol.trim().toUpperCase().replace(/^[A-Z]+:/, '').split('.')[0];
    if (!/^[A-Z]{1,6}$/.test(ticker)) return null;
    try {
      this.tickerDirectory ??= this.requestFetch('https://www.sec.gov/files/company_tickers.json', {
        headers: { 'User-Agent': 'FinPal Desktop/1.0 (portfolio research)' },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      }).then(async response => {
        if (!response.ok) throw new Error('SEC ticker directory unavailable');
        const value = await response.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
        return Object.values(value).filter(item => Number.isInteger(item.cik_str) && typeof item.ticker === 'string' && typeof item.title === 'string');
      });
      const matches = (await this.tickerDirectory).filter(item => item.ticker.toUpperCase() === ticker);
      const words = position.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
        .filter(word => word.length >= 4 && !['corporation', 'company', 'holding', 'holdings', 'limited', 'group', 'stock'].includes(word));
      const match = matches.length === 1 && words.length > 0 && words.slice(0, 2)
        .every(word => matches[0].title.toLowerCase().includes(word)) ? matches[0] : null;
      const cik = match ? String(match.cik_str).padStart(10, '0') : null;
      this.cikCache.set(isin, { fetchedAt: this.now(), cik });
      try { this.save(); } catch { /* The lookup remains available during this run. */ }
      return cik;
    } catch {
      this.tickerDirectory = undefined;
      if (signal?.aborted) throw signal.reason;
      return null;
    }
  }
  async collect(position: AnalysisPosition, signal?: AbortSignal, sourceHints: AnalysisSource[] = [], forceRefresh = false): Promise<RiskDocumentSet> {
    const curated = new Set(knownResearchSources(position).map(value => new URL(value).toString()));
    const issuerHost = ISSUER_HOST_BY_ISIN[position.isin.trim().toUpperCase()];
    const cik = await this.resolveCik(position, signal);
    const candidates = [...curated].filter(url => allowedDocumentUrl(url, curated, issuerHost, cik) &&
      (/\.(?:htm|html|pdf)(?:$|\?|\/)/i.test(url) ||
        (position.isin.trim().toUpperCase() === 'US47759T1007' && url.includes('/news-release-details/jinkosolar-announces-'))));
    if (position.isin.trim().toUpperCase() === 'DE0008232125') {
      try {
        const response = await this.requestFetch(LUFTHANSA_REPORT_INDEX, { headers: { 'User-Agent': 'FinPal Desktop/1.0 (portfolio research)' },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
        if (!response.ok || Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Report index unavailable');
        const html = await response.text();
        if (html.length > 2_000_000) throw new Error('Report index too large');
        const discovered = [...html.matchAll(/href=["']([^"']+\/LH-(?:QR-20\d{2}-[1-3]|AR-20\d{2})-e\.pdf(?:\?[^"']*)?)["']/gi)]
          .map(match => new URL(decodeEntities(match[1]), LUFTHANSA_REPORT_INDEX).toString().split('?')[0])
          .filter(url => new URL(url).hostname === 'investor-relations.lufthansagroup.com'
            && new URL(url).pathname.startsWith('/fileadmin/downloads/en/financial-reports/')
            && !!lufthansaReportPeriod(url) && Date.parse(lufthansaReportPeriod(url)!) <= this.now());
        const newest = (pattern: RegExp) => discovered.filter(url => pattern.test(url))
          .sort((a, b) => lufthansaReportPeriod(b)!.localeCompare(lufthansaReportPeriod(a)!))[0];
        for (const url of [newest(/\/LH-AR-/), newest(/\/LH-QR-/)].filter((value): value is string => !!value)) {
          curated.add(url);
          candidates.unshift(url);
        }
      } catch { if (signal?.aborted) throw signal.reason; }
    }
    if (position.type !== 'Stock') candidates.push(...[...curated].filter(url => officialProductHost(new URL(url).hostname)));
    const curatedPaths = new Set([...curated].map(value => {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    }));
    const identityHint = position.name.toLowerCase().split(/\W+/).find(word => word.length >= 5);
    if (position.type !== 'Stock' && position.isin.trim()) for (const hint of sourceHints
      .filter(hint => hint.url.toUpperCase().includes(position.isin.trim().toUpperCase()) ||
        (!!identityHint && hint.title.toLowerCase().includes(identityHint)) ||
        (!!position.symbol.trim() && hint.url.toLowerCase().includes(position.symbol.trim().toLowerCase())))
      .slice(0, 30)) {
      try {
        const url = new URL(hint.url);
        if (url.protocol === 'https:' && !url.username && !url.password && officialProductHost(url.hostname)
          && !curatedPaths.has(`${url.origin}${url.pathname}`)) candidates.push(url.toString());
      } catch { /* Invalid discovery link. */ }
    }
    const gaps: string[] = [];
    let discoveryChecked = false;
    const filingDetails = new Map<string, { title: string; period: string | null }>();
    if (cik) {
      try {
        let filings = this.submissions.get(cik)?.filings;
        if (cik === '0000353278' && filings) filings = filings.filter(filing =>
          /\/caq[1-4]20\d{2}\.htm$/i.test(filing.url) || /\/nvo-20\d{6}\.htm$/i.test(filing.url));
        if (forceRefresh || !filings?.length || this.now() - this.submissions.get(cik)!.fetchedAt >= DAY) {
          const response = await this.requestFetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
            headers: { 'User-Agent': 'FinPal Desktop/1.0 (portfolio research)' },
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          filings = secUrls(cik, await response.json());
          this.submissions.set(cik, { filings, fetchedAt: this.now() });
          try { this.save(); } catch { /* This run can still use the retrieved directory. */ }
        }
        if (!filings.length) throw new Error('No current SEC financial filing');
        filings.forEach(filing => filingDetails.set(filing.url, { title: filing.title, period: filing.period }));
        candidates.unshift(...filings.map(filing => filing.url));
        discoveryChecked = true;
      } catch {
        if (signal?.aborted) throw signal.reason;
        gaps.push('Aktuelle SEC-Einreichungen konnten nicht abgeglichen werden.');
      }
    } else gaps.push('Für dieses Instrument ist noch keine verlässlich zugeordnete Primärquellenkennung hinterlegt.');
    const documents: RiskDocument[] = [];
    for (const url of [...new Set(candidates)].filter(item => (allowedDocumentUrl(item, curated, issuerHost, cik)
      || (position.type !== 'Stock' && officialProductHost(new URL(item).hostname)))
      && !(position.type === 'Bond' && position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN
        && item.endsWith('/R_20200819_3.pdf') && !forceRefresh
        && this.cache.has(TREASURY_OFFERING_2020)
        && this.now() - this.cache.get(TREASURY_OFFERING_2020)!.fetchedAt < DAY))
      .slice(0, position.type === 'Bond' && position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN ? 5 : MAX_DOCUMENTS)) {
      const stored = this.cache.get(url);
      if (!forceRefresh && stored && this.now() - stored.fetchedAt < DAY &&
        (position.type !== 'Stock' || stored.excerptVersion === (['US5801351017', 'DK0062498333', 'US6701002056', 'DE0007030009', 'US6092071058'].includes(position.isin.trim().toUpperCase()) ? 3 : 2)) &&
        (position.isin.trim().toUpperCase() !== 'IE00B3WJKG14' || stored.excerptVersion === 3) &&
        (position.isin.trim().toUpperCase() !== 'IE00B8GKDB10' || stored.excerptVersion === 2) &&
        (position.type === 'Stock' || stored.identity === position.isin.trim().toUpperCase())) { documents.push(stored); continue; }
      try {
        const annualRheinmetall = position.isin.trim().toUpperCase() === 'DE0007030009' && url === RHEINMETALL_ANNUAL_2025;
        const documentTimeout = annualRheinmetall ? 30000 : 12000;
        const maxDocumentBytes = annualRheinmetall ? 40_000_000 : MAX_BYTES;
        const response = await this.requestFetch(url, { headers: { 'User-Agent': 'FinPal Desktop/1.0 (portfolio research)' },
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(documentTimeout)]) : AbortSignal.timeout(documentTimeout) });
        const finalUrl = response.url || url;
        if (!response.ok || !(allowedDocumentUrl(finalUrl, curated, issuerHost, cik)
          || (position.type !== 'Stock' && officialProductHost(new URL(finalUrl).hostname)))) throw new Error('Document unavailable');
        const length = Number(response.headers.get('content-length'));
        if (length > maxDocumentBytes) throw new Error('Document too large');
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > maxDocumentBytes) throw new Error('Document too large');
        const contentType = response.headers.get('content-type') ?? '';
        let plain: string;
        if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
          const { PDFParse } = require('pdf-parse');
          const parser = new PDFParse({ data });
          try { plain = (await parser.getText()).text; } finally { await parser.destroy(); }
        } else plain = data.toString('utf8');
        const treasuryGeneral = position.type === 'Bond' && position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN
          && treasuryGeneralUrl(url) && documents.some(document => treasuryAuctionUrl(document.source.url));
        if (treasuryGeneral && !/Treasury marketable securit(?:y|ies)|Treasury Bonds/i.test(plain)) throw new Error('Treasury context not confirmed');
        if (position.type !== 'Stock' && !treasuryGeneral && !plain.toUpperCase().includes(position.isin.trim().toUpperCase())
          && !(position.type === 'Bond' && plain.includes(position.isin.trim().slice(2, -1)))) throw new Error('Instrument identity not confirmed');
        if (position.isin.trim().toUpperCase() === 'DE0008430026' && !/Munich Re|Münchener Rückversicherungs/i.test(plain))
          throw new Error('Issuer identity not confirmed');
        if (position.isin.trim().toUpperCase() === 'DE0008232125' && !/Lufthansa Group|Deutsche Lufthansa AG/i.test(plain))
          throw new Error('Issuer identity not confirmed');
        if (position.isin.trim().toUpperCase() === 'DE0007030009' && !/Rheinmetall AG|Rheinmetall Group/i.test(plain))
          throw new Error('Issuer identity not confirmed');
        if (position.isin.trim().toUpperCase() === 'CA03880B1040' && !/ARBOR METALS CORP\.?/i.test(plain))
          throw new Error('Issuer identity not confirmed');
        if (position.isin.trim().toUpperCase() === 'CA03880B1040'
          && !(KNOWN_STOCK_REPORT_PERIOD(position.isin.trim().toUpperCase(), url) === '2026-04-30'
            ? /April\s+30,?\s+2026/i.test(plain) : /October\s+31,?\s+2025/i.test(plain)))
          throw new Error('Report period not confirmed');
        const excerpt = riskExcerpt(plain, position.type, position.isin.trim().toUpperCase() === 'DE0008430026', position.isin.trim().toUpperCase());
        if (!excerpt) throw new Error('No risk evidence');
        if (position.type !== 'Stock' && !treasuryGeneral && !excerpt.toUpperCase().includes(position.isin.trim().toUpperCase())
          && !(position.type === 'Bond' && excerpt.includes(position.isin.trim().slice(2, -1))))
          throw new Error('Instrument identity absent from risk excerpt');
        const period = filingDetails.get(url)?.period ?? KNOWN_STOCK_REPORT_PERIOD(position.isin.trim().toUpperCase(), url)
          ?? (position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN && treasuryAuctionUrl(url)
            ? url.includes('/R_20200819_3.pdf') ? '2020-08-19' : '2020-10-15' : null)
          ?? (position.type === 'Stock' ? null : productDocumentPeriod(plain, this.now()));
        const documentTitle = filingDetails.get(url)?.title
          || (position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN && treasuryGeneralUrl(url)
            ? url.includes('/research-center/') ? 'TreasuryDirect: Staatsanleihen als direkte US-Verpflichtungen'
              : url.includes('/selling-marketable-securities/') ? 'TreasuryDirect: Verkauf vor Fälligkeit'
                : 'TreasuryDirect: Marktgängige US-Staatsanleihen'
            : decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname));
        const document: RiskDocument = { source: { title: documentTitle, url }, excerpt,
          hash: createHash('sha256').update(data).digest('hex'), fetchedAt: this.now(), period,
          ...(position.type === 'Stock' ? { excerptVersion: ['US5801351017', 'DK0062498333', 'US6701002056', 'DE0007030009', 'US6092071058'].includes(position.isin.trim().toUpperCase()) ? 3 : 2 } : {}),
          ...(position.isin.trim().toUpperCase() === 'IE00B3WJKG14' ? { excerptVersion: 3 } : {}),
          ...(position.isin.trim().toUpperCase() === 'IE00B8GKDB10' ? { excerptVersion: 2 } : {}),
          ...(position.type !== 'Stock' ? { identity: position.isin.trim().toUpperCase() } : {}) };
        this.cache.set(url, document);
        documents.push(document);
        try { this.save(); } catch { /* Keep the successful fetch for this run. */ }
      } catch {
        if (signal?.aborted) throw signal.reason;
        if (stored && (position.type === 'Stock' || stored.identity === position.isin.trim().toUpperCase())) documents.push(stored);
        gaps.push(`Primärdokument konnte nicht aktuell geladen werden: ${url}`);
      }
    }
    if (!cik && documents.length && (issuerHost && position.type === 'Stock'
      || ['ETF', 'Fund', 'Bond', 'Commodity', 'CashEquivalent', 'RealEstate'].includes(position.type))) {
      discoveryChecked = true;
      const index = gaps.findIndex(gap => gap.includes('Primärquellenkennung'));
      if (index >= 0) gaps.splice(index, 1);
    }
    if (position.type === 'Bond' && position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN
      && documents.some(document => treasuryAuctionUrl(document.source.url))) {
      for (let index = gaps.length - 1; index >= 0; index--) {
        const failedUrl = gaps[index].replace(/^Primärdokument konnte nicht aktuell geladen werden: /, '');
        if (treasuryAuctionUrl(failedUrl)) gaps.splice(index, 1);
      }
    }
    if (!cik && documents.length && !documents.some(document => document.period &&
      this.now() - Date.parse(document.period) < 400 * DAY)
      && !(position.type === 'Bond' && position.isin.trim().toUpperCase() === TREASURY_BOND_ISIN
        && documents.some(document => treasuryAuctionUrl(document.source.url))))
      gaps.push('Kein datiertes aktuelles Primärdokument zur exakten Instrumentkennung gefunden.');
    if (!documents.length) gaps.push('Kein lesbares aktuelles Primärdokument für die Risikoprüfung verfügbar.');
    return { documents, discoveryChecked, gaps };
  }
}
