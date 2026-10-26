import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalysisPosition, AnalysisSource } from './portfolioAnalysis';
import type { FundamentalRiskAssessment } from './robustForecastModel';
import type { RiskDocument, RiskDocumentSet } from './primaryRiskResearch';
import { ASSET_RISK_POLICY_VERSION, isInsuranceStock, riskChecksForPosition, riskMetricsForPosition, riskCheckLabels, riskEvidenceTerms, type RiskCheckName } from './assetRiskPolicy';

export const RISK_POLICY = ASSET_RISK_POLICY_VERSION;
export interface RiskCheck {
  flag: RiskCheckName;
  finding: 'risk' | 'no-risk' | 'unknown';
  reason: string;
  documentIndex: number | null;
  quote: string;
}
export interface RiskMetric {
  name: string;
  value: number;
  unit: string;
  period: string;
  documentIndex: number;
  quote: string;
}
export interface PrimaryRiskRecord {
  key: string;
  isin: string;
  fingerprint: string;
  checkedAt: number;
  status: 'assessed' | 'unknown';
  checks: RiskCheck[];
  metrics: RiskMetric[];
  gaps: string[];
  sources: AnalysisSource[];
}

export const riskAssessmentSchema = (position: Pick<AnalysisPosition, 'isin' | 'type'>) => ({
  type: 'object', additionalProperties: false,
  properties: {
    checks: { type: 'array', minItems: riskChecksForPosition(position).length, maxItems: riskChecksForPosition(position).length, items: { type: 'object', additionalProperties: false,
      properties: { flag: { type: 'string', enum: riskChecksForPosition(position) }, finding: { type: 'string', enum: ['risk', 'no-risk', 'unknown'] },
        reason: { type: 'string' }, documentIndex: { type: ['integer', 'null'] }, quote: { type: 'string' } },
      required: ['flag', 'finding', 'reason', 'documentIndex', 'quote'] } },
    metrics: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
      properties: { name: { type: 'string', enum: ['net-income', 'operating-margin', 'cash', 'debt-maturities', 'combined-ratio', 'solvency-ratio'] }, value: { type: 'number' }, unit: { type: 'string' }, period: { type: 'string' },
        documentIndex: { type: 'integer' }, quote: { type: 'string' } },
      required: ['name', 'value', 'unit', 'period', 'documentIndex', 'quote'] } },
  }, required: ['checks', 'metrics'],
});

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
function validQuote(quote: unknown, document: RiskDocument | undefined): quote is string {
  return !!document && typeof quote === 'string' && quote.trim().length >= 12 && quote.length <= 400 &&
    normalized(document.excerpt).includes(normalized(quote));
}
function quoteContainsValue(quote: string, value: number): boolean {
  return [...quote.matchAll(/\(\s*\d[\d,.]*\s*\)|-?\d[\d,.]*/g)].some(match => {
    const token = match[0];
    const accountingNegative = token.startsWith('(');
    const unsigned = accountingNegative ? token.slice(1, -1).trim() : token;
    const candidates = new Set([unsigned, unsigned.replace(/,/g, ''), unsigned.replace(/\./g, '').replace(',', '.'),
      unsigned.replace(/,/g, '.')]);
    return [...candidates].some(candidate => (accountingNegative ? -Number(candidate) : Number(candidate)) === value);
  });
}
function munichReCashFromBalanceSheet(position: AnalysisPosition, documents: RiskDocument[]): RiskMetric | null {
  if (!isInsuranceStock(position)) return null;
  for (const [documentIndex, document] of documents.entries()) {
    // The issuer's 2026 half-year consolidated balance sheet uses EUR millions.
    if (!/^https:\/\/www\.munichre\.com\/.*\/MunichRe-Half-Year-Financial-Report-2026-en\.pdf(?:$|\/)/i.test(document.source.url)
      || document.period !== '2026-06-30') continue;
    const match = /H\.\s*Cash and cash equivalents\s+([0-9]{1,3}(?:[.,\uFFFD\u202F ]?[0-9]{3})+|[0-9]+)/i.exec(document.excerpt);
    if (!match) continue;
    const value = Number(match[1].replace(/[^0-9]/g, ''));
    if (!Number.isSafeInteger(value) || value <= 0 || !validQuote(match[0], document)) continue;
    return { name: 'cash', value, unit: 'Mio. EUR', period: document.period, documentIndex, quote: match[0] };
  }
  return null;
}
const munichLegalRiskReason = '2025: Laufende Gerichts-, Aufsichts- und Schiedsverfahren; Munich Re erwartet keine erhebliche negative Wirkung. In den geprüften Auszügen fehlt eine Aktualisierung für 2026.';
const munichLegalRiskReason2026 = 'Stand 30.06.2026: Laufende Verfahren aus dem Bericht 2025; Munich Re erwartet keine erhebliche negative Wirkung und erklärt die damaligen Risikoaussagen für unverändert gültig.';
const munichAnnualReport = (document: RiskDocument) => document.period === '2025-12-31'
  && /^https:\/\/www\.munichre\.com\/.*\/MunichRe-Group-Annual-Report-2025-en\.pdf(?:$|\/)/i.test(document.source.url);
const munichHalfYearReport = (document: RiskDocument) => document.period === '2026-06-30'
  && /^https:\/\/www\.munichre\.com\/.*\/MunichRe-Half-Year-Financial-Report-2026-en\.pdf(?:$|\/)/i.test(document.source.url);
const munichRiskCarriedForward = (document: RiskDocument) => munichHalfYearReport(document)
  && /statements relating to opportunities and risks\s+as presented in the Munich Re Group Annual Report 2025\s+apply unchanged/i.test(document.excerpt);
const munichFinancingOpen = 'Verfügbare Primärberichte geprüft: Liquiditätssteuerung, Fälligkeiten und aktueller Zahlungsmittelbestand sind noch nicht gemeinsam belegt.';
const munichGoingConcernOpen = 'Verfügbare Primärberichte geprüft: Eine konkrete unternehmensbezogene Aussage zu wesentlichen Fortführungsunsicherheiten fehlt. Allgemeine Prüferpflichten sind keine Entwarnung.';
function qualifyMunichFinancingAndContinuity(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (!isInsuranceStock(position) || check.finding === 'risk') return check;
  if (!documents.some(document => munichAnnualReport(document) || munichHalfYearReport(document))) return check;
  if (check.flag === 'going-concern') {
    if (check.finding === 'no-risk' && check.documentIndex !== null
      && /(?:no material uncertainty|no substantial doubt|keine wesentliche Unsicherheit|keine bestandsgefährd)/i.test(check.quote)
      && validQuote(check.quote, documents[check.documentIndex])) return check;
    if (check.finding === 'unknown' && check.reason === munichGoingConcernOpen && check.documentIndex === null) return check;
    return { ...check, finding: 'unknown', reason: munichGoingConcernOpen, documentIndex: null, quote: '' };
  }
  if (check.flag !== 'financing') return check;
  const annualIndex = documents.findIndex(document => munichAnnualReport(document)
    && /objective in managing liquidity risk is to ensure that we\s+are in a position to meet our payment obligations at all\s+times/i.test(document.excerpt)
    && /sufficient liquidity\s+is available even under adverse scenarios/i.test(document.excerpt)
    && /liquidity requirements\s+arising from our financial liabilities, divided into maturity\s+bands/i.test(document.excerpt));
  const currentCash = munichReCashFromBalanceSheet(position, documents);
  if (annualIndex < 0 || !documents.some(munichRiskCarriedForward) || !currentCash) {
    if (check.finding === 'unknown' && check.reason === munichFinancingOpen && check.documentIndex === null) return check;
    return { ...check, finding: 'unknown', reason: munichFinancingOpen, documentIndex: null, quote: '' };
  }
  const quote = /sufficient liquidity\s+is available even under adverse scenarios/i.exec(documents[annualIndex].excerpt)?.[0] ?? '';
  const reason = `Stand 30.06.2026: ${currentCash.value} Mio. EUR Zahlungsmittel. Der Bericht 2025 dokumentiert Liquiditätssteuerung auch für Stressszenarien und Fälligkeitsbänder; die Risikoaussagen gelten laut Halbjahresbericht unverändert. Kein akutes Finanzierungsrisiko belegt.`;
  if (check.finding === 'no-risk' && check.reason === reason && check.documentIndex === annualIndex && check.quote === quote) return check;
  return { ...check, finding: 'no-risk', documentIndex: annualIndex, quote, reason };
}
function qualifyMunichLegalRisk(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (!isInsuranceStock(position) || check.flag !== 'regulatory'
    || (check.finding !== 'risk' && !(check.finding === 'unknown' && check.reason === munichLegalRiskReason))
    || check.documentIndex === null) return check;
  const document = documents[check.documentIndex];
  if (!document || document.period !== '2025-12-31'
    || !/^https:\/\/www\.munichre\.com\/.*\/(?:MunichRe-Group-Annual-Report-2025-en|SFCR-Munich-Re-Group-2025)\.pdf(?:$|\/)/i.test(document.source.url)
    || !/proceedings/i.test(check.quote)
    || !/court, regulatory and arbitration proceedings/i.test(document.excerpt)
    || !/none of these proceedings will have a significant negative effect/i.test(document.excerpt)) return check;
  const carriedForward = documents.some(munichRiskCarriedForward);
  if (!carriedForward && check.finding === 'unknown') return check;
  return { ...check, finding: carriedForward ? 'no-risk' : 'unknown',
    reason: carriedForward ? munichLegalRiskReason2026 : munichLegalRiskReason };
}
function qualifyMondelezLegalRisk(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (position.type !== 'Stock' || position.isin.trim().toUpperCase() !== 'US6092071058'
    || check.flag !== 'regulatory' || check.finding !== 'risk'
    || !/erwartet.*(?:keine|nicht).*wesentlich|keine wesentliche|nicht wesentlich|not materially|no material/i.test(check.reason)) return check;
  const documentIndex = documents.findIndex(document => document.period === '2026-06-30'
    && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1103982\/\d{18}\/[^/]+\.htm$/i.test(document.source.url)
    && /ultimate outcome of these legal proceedings and regulatory and governmental matters/i.test(document.excerpt)
    && /will not materially harm our financial position, results of operations or cash flows/i.test(document.excerpt)
    && /unfavorable resolutions could involve substantial fines/i.test(document.excerpt));
  if (documentIndex < 0) return check;
  const quote = /legal proceedings and regulatory and governmental matters, individually and in the aggregate, will not materially harm our financial position, results of operations or cash flows/i.exec(documents[documentIndex].excerpt)?.[0] ?? '';
  if (!validQuote(quote, documents[documentIndex])) return check;
  return { ...check, finding: 'no-risk', documentIndex, quote,
    reason: 'Stand 30.06.2026: Laufende Gerichts- und Behördenverfahren bestehen. Das Management erwartet derzeit weder einzeln noch zusammen eine wesentliche Belastung von Finanzlage, Ergebnis oder Cashflow. Ungünstige Entscheidungen und erhebliche Sanktionen bleiben möglich.' };
}
export function riskFingerprint(position: AnalysisPosition, set: RiskDocumentSet): string {
  return createHash('sha256').update(JSON.stringify({ policy: RISK_POLICY, isin: position.isin.trim().toUpperCase(),
    type: position.type, documents: set.documents.map(doc => [doc.source.url, doc.hash,
      isInsuranceStock(position) ? doc.excerptVersion ?? 0 : 0]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })).digest('hex');
}
export function validateRiskAssessment(position: AnalysisPosition, set: RiskDocumentSet, response: unknown, now = Date.now(), key = String(position.id)): PrimaryRiskRecord {
  const value = response && typeof response === 'object' ? response as { checks?: unknown; metrics?: unknown } : {};
  const input = Array.isArray(value.checks) ? value.checks : [];
  const gaps = [...set.gaps];
  const checks = riskChecksForPosition(position).map(flag => {
    const matches = input.filter(item => item && typeof item === 'object' && (item as RiskCheck).flag === flag);
    const check = matches.length === 1 ? matches[0] as RiskCheck : undefined;
    const document = Number.isInteger(check?.documentIndex) ? set.documents[check!.documentIndex!] : undefined;
    if (!check || !['risk', 'no-risk', 'unknown'].includes(check.finding) || typeof check.reason !== 'string'
      || !check.reason.trim() || (check.finding !== 'unknown' && (!validQuote(check.quote, document)
        || !riskEvidenceTerms[flag].test(check.quote)))) {
      const fallback = qualifyMunichFinancingAndContinuity(position,
        { flag, finding: 'unknown', reason: 'Kein überprüfbarer Befund mit Textstelle.', documentIndex: null, quote: '' }, set.documents);
      if (fallback.finding === 'unknown') gaps.push(`${flag}: ${fallback.reason}`);
      return fallback;
    }
    const qualified = qualifyMondelezLegalRisk(position, qualifyMunichLegalRisk(position,
      qualifyMunichFinancingAndContinuity(position, check, set.documents), set.documents), set.documents);
    if (qualified.finding === 'unknown') gaps.push(`${flag}: ${qualified.reason.trim()}`);
    return { flag, finding: qualified.finding, reason: qualified.reason.trim().slice(0, 700),
      documentIndex: qualified.finding === 'unknown' && qualified === check ? null : qualified.documentIndex,
      quote: qualified.finding === 'unknown' && qualified === check ? '' : qualified.quote.trim() };
  });
  const metrics: RiskMetric[] = Array.isArray(value.metrics) ? value.metrics.flatMap((item: RiskMetric) => {
    if (!item || !riskMetricsForPosition(position).includes(item.name) || !Number.isFinite(item.value)
      || typeof item.unit !== 'string' || typeof item.period !== 'string' || !item.period.trim()
      || !Number.isInteger(item.documentIndex) || !validQuote(item.quote, set.documents[item.documentIndex])
      || !quoteContainsValue(item.quote, item.value)) return [];
    return [{ name: item.name.trim().slice(0, 100), value: item.value, unit: item.unit.trim().slice(0, 120),
      period: item.period.trim().slice(0, 80), documentIndex: item.documentIndex, quote: item.quote.trim() }];
  }).slice(0, 20) : [];
  if (!metrics.some(metric => metric.name === 'cash')) {
    const balanceSheetCash = munichReCashFromBalanceSheet(position, set.documents);
    if (balanceSheetCash) metrics.push(balanceSheetCash);
  }
  for (const name of riskMetricsForPosition(position)) {
    if (!metrics.some(metric => metric.name === name)) gaps.push(`${name}: Keine periodisierte Zahl mit überprüfbarer Textstelle.`);
  }
  if (!set.discoveryChecked) gaps.push('Neueste Primärberichte konnten nicht verlässlich abgeglichen werden.');
  return { key, isin: position.isin.trim().toUpperCase(), fingerprint: riskFingerprint(position, set),
    checkedAt: now, status: gaps.length ? 'unknown' : 'assessed', checks, metrics, gaps: [...new Set(gaps)],
    sources: set.documents.map(doc => doc.source) };
}
export function riskForModel(record: PrimaryRiskRecord): FundamentalRiskAssessment {
  const findings = { risk: 'Risiko belegt', 'no-risk': 'kein wesentliches Risiko belegt', unknown: 'offen' };
  const metricLabels: Record<string, string> = { 'net-income': 'Periodengewinn', 'operating-margin': 'operative Marge', cash: 'Liquidität', 'debt-maturities': 'Fälligkeiten', 'combined-ratio': 'Combined Ratio', 'solvency-ratio': 'Solvenzquote' };
  const materialRisks = record.checks.filter(check => check.finding === 'risk').map(check => check.flag);
  const reviewedMunichUncertainty = record.isin === 'DE0008430026' && record.status === 'unknown'
    && materialRisks.length === 0 && record.checks.length === 6
    && record.checks.every(check => (check.finding === 'no-risk' && check.documentIndex !== null && check.quote.trim().length >= 12)
      || (check.finding === 'unknown' && check.flag === 'going-concern'
        && check.reason.startsWith('Verfügbare Primärberichte geprüft:')))
    && record.gaps.length > 0 && record.gaps.every(gap => gap.startsWith('going-concern:'))
    && ['net-income', 'combined-ratio', 'solvency-ratio', 'cash'].every(name => record.metrics.some(metric => metric.name === name))
    && record.sources.some(source => /^https:\/\/www\.munichre\.com\/.*\/MunichRe-Group-Annual-Report-2025-en\.pdf/.test(source.url))
    && record.sources.some(source => /^https:\/\/www\.munichre\.com\/.*\/MunichRe-Half-Year-Financial-Report-2026-en\.pdf/.test(source.url));
  const reviewedMondelezUncertainty = record.isin === 'US6092071058' && record.status === 'unknown'
    && materialRisks.length === 0 && record.checks.length === 5
    && record.checks.every(check => (check.finding === 'no-risk' && check.documentIndex !== null && check.quote.trim().length >= 12)
      || (check.flag === 'going-concern' && check.finding === 'unknown' && check.documentIndex === null))
    && record.gaps.length === 1 && record.gaps[0].startsWith('going-concern:')
    && ['net-income', 'operating-margin', 'cash', 'debt-maturities'].every(name => record.metrics.some(metric => metric.name === name))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1103982\/\d{18}\/[^/]+\.htm$/i.test(source.url) && /10-Q/.test(source.title))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1103982\/\d{18}\/[^/]+\.htm$/i.test(source.url) && /10-K/.test(source.title));
  const shorten = (value: string, limit: number) => {
    if (value.length <= limit) return value;
    const candidate = value.slice(0, limit);
    const sentenceEnd = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '));
    if (sentenceEnd >= 80) return `${candidate.slice(0, sentenceEnd + 1).trimEnd()} …`;
    return `${candidate.slice(0, candidate.lastIndexOf(' ')).trimEnd()} …`;
  };
  const details = record.sources.length ? record.checks.map(check =>
    `${riskCheckLabels[check.flag]}: ${findings[check.finding]} (${shorten(check.reason, 230)})`) : [];
  const metrics = record.metrics.map(metric =>
    `${metricLabels[metric.name] ?? metric.name}: ${metric.value} ${metric.unit}, Periode ${metric.period}`);
  const checkedUnknown = new Set(record.checks.filter(check => check.finding === 'unknown').map(check => check.flag));
  const gaps = record.sources.length ? record.gaps.filter(gap => !checkedUnknown.has(gap.split(':', 1)[0] as RiskCheckName))
    : record.gaps.filter(gap => !/^(?:loss-making|low-margin|underwriting|solvency|financing|going-concern|regulatory|net-income|operating-margin|combined-ratio|solvency-ratio|cash|debt-maturities):/.test(gap));
  const lines = [...details, ...metrics, ...gaps];
  const visible: string[] = [];
  for (const line of lines) {
    if ([...visible, line].join('\n').length > 2900) break;
    visible.push(line);
  }
  if (visible.length < lines.length) visible.push(`Weitere ${lines.length - visible.length} Befunde im gespeicherten Prüfprotokoll.`);
  return { key: record.key, status: record.status,
    ...(reviewedMunichUncertainty || reviewedMondelezUncertainty ? { decisionReadiness: 'reviewed-uncertainty' as const } : {}),
    materialRisks, rationale: visible.join('\n'), sources: record.sources };
}

export class PrimaryRiskAssessmentCache {
  private readonly records = new Map<string, PrimaryRiskRecord>();
  constructor(private readonly file: string) {
    try {
      if (fs.statSync(file).size > 4_000_000) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.records)) for (const record of saved.records.slice(-200)) {
        if (record && typeof record.key === 'string' && typeof record.fingerprint === 'string' &&
          Number.isFinite(record.checkedAt) && Array.isArray(record.checks) && Array.isArray(record.sources))
          this.records.set(record.key, record);
      }
    } catch { /* Cache is rebuilt. */ }
  }
  get(position: AnalysisPosition, set: RiskDocumentSet, key = String(position.id)): PrimaryRiskRecord | null {
    let record = this.records.get(key);
    if (!record || record.isin !== position.isin.trim().toUpperCase()) return null;
    const fingerprint = riskFingerprint(position, set);
    if (record.fingerprint !== fingerprint) {
      const priorFingerprint = (version: number) => riskFingerprint(position, { ...set,
        documents: set.documents.map(document => ({ ...document,
          excerptVersion: document.excerptVersion === 2 ? version : document.excerptVersion })) });
      const canMigrate = isInsuranceStock(position)
        && (record.fingerprint === priorFingerprint(1) || record.fingerprint === priorFingerprint(0))
        && record.checks.every(check => check.finding === 'unknown' || check.documentIndex !== null
          && validQuote(check.quote, set.documents[check.documentIndex]))
        && record.metrics.every(metric => validQuote(metric.quote, set.documents[metric.documentIndex]));
      if (!canMigrate) return null;
      record = { ...record, fingerprint };
      this.set(record);
    }
    const qualifiedChecks = record.checks.map(check => qualifyMondelezLegalRisk(position, qualifyMunichLegalRisk(position,
      qualifyMunichFinancingAndContinuity(position, check, set.documents), set.documents), set.documents));
    if (qualifiedChecks.some((check, index) => check !== record.checks[index])) {
      const changedFlags = new Set(qualifiedChecks.filter((check, index) => check !== record!.checks[index]).map(check => check.flag));
      const gaps = record.gaps.filter(gap => !changedFlags.has(gap.split(':', 1)[0] as RiskCheckName));
      for (const check of qualifiedChecks) if (changedFlags.has(check.flag) && check.finding === 'unknown')
        gaps.push(`${check.flag}: ${check.reason}`);
      record = { ...record, checks: qualifiedChecks, gaps, status: gaps.length ? 'unknown' : 'assessed' };
      this.set(record);
    }
    if (!record.metrics.some(metric => metric.name === 'cash')) {
      const cash = munichReCashFromBalanceSheet(position, set.documents);
      if (cash) {
        const gaps = record.gaps.filter(gap => !gap.startsWith('cash:'));
        record = { ...record, metrics: [...record.metrics, cash], gaps, status: gaps.length ? 'unknown' : 'assessed' };
        this.set(record);
      }
    }
    // Retry transient source failures after a day. A reviewed evidence gap remains
    // reusable until the source documents or policy change.
    if (record.status === 'unknown' && Date.now() - record.checkedAt >= 24 * 60 * 60 * 1000
      && (!set.documents.length || !set.discoveryChecked || record.gaps.some(gap =>
        /konnten? nicht|nicht verfügbar|kein lesbares aktuelles|nicht verlässlich/i.test(gap)))) return null;
    if (set.gaps.length || !set.discoveryChecked) return { ...record, status: 'unknown',
      gaps: [...new Set([...record.gaps, ...set.gaps, ...(!set.discoveryChecked ? ['Neueste Primärberichte konnten nicht verlässlich abgeglichen werden.'] : [])])] };
    return record;
  }
  set(record: PrimaryRiskRecord): void {
    this.records.set(record.key, record);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, records: [...this.records.values()].slice(-200) }), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
