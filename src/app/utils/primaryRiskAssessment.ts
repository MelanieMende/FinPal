import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { AnalysisPosition, AnalysisSource } from './portfolioAnalysis';
import type { FundamentalRiskAssessment } from './robustForecastModel';
import type { RiskDocument, RiskDocumentSet } from './primaryRiskResearch';
import { ASSET_RISK_POLICY_VERSION, riskChecksForPosition, riskMetricsForPosition, riskCheckLabels, riskEvidenceTerms, type RiskCheckName } from './assetRiskPolicy';

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
  return [...quote.matchAll(/-?\d[\d,.]*/g)].some(match => {
    const token = match[0];
    const decimal = token.includes(',') && !token.includes('.') ? token.replace(',', '.') : token.replace(/,/g, '');
    return Number(decimal) === value;
  });
}
export function riskFingerprint(position: AnalysisPosition, set: RiskDocumentSet): string {
  return createHash('sha256').update(JSON.stringify({ policy: RISK_POLICY, isin: position.isin.trim().toUpperCase(),
    type: position.type, documents: set.documents.map(doc => [doc.source.url, doc.hash]).sort((a, b) => a[0].localeCompare(b[0])) })).digest('hex');
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
      gaps.push(`${flag}: Kein überprüfbarer Befund mit Textstelle.`);
      return { flag, finding: 'unknown' as const, reason: 'Kein überprüfbarer Befund mit Textstelle.', documentIndex: null, quote: '' };
    }
    if (check.finding === 'unknown') gaps.push(`${flag}: ${check.reason.trim()}`);
    return { flag, finding: check.finding, reason: check.reason.trim().slice(0, 700),
      documentIndex: check.finding === 'unknown' ? null : check.documentIndex, quote: check.finding === 'unknown' ? '' : check.quote.trim() };
  });
  const metrics: RiskMetric[] = Array.isArray(value.metrics) ? value.metrics.flatMap((item: RiskMetric) => {
    if (!item || !riskMetricsForPosition(position).includes(item.name) || !Number.isFinite(item.value)
      || typeof item.unit !== 'string' || typeof item.period !== 'string' || !item.period.trim()
      || !Number.isInteger(item.documentIndex) || !validQuote(item.quote, set.documents[item.documentIndex])
      || !quoteContainsValue(item.quote, item.value)) return [];
    return [{ name: item.name.trim().slice(0, 100), value: item.value, unit: item.unit.trim().slice(0, 30),
      period: item.period.trim().slice(0, 80), documentIndex: item.documentIndex, quote: item.quote.trim() }];
  }).slice(0, 20) : [];
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
  const details = record.sources.length ? record.checks.map(check => `${riskCheckLabels[check.flag]}: ${findings[check.finding]} (${check.reason})`).join('; ') : '';
  const metrics = record.metrics.map(metric => `${metricLabels[metric.name] ?? metric.name}: ${metric.value} ${metric.unit}, Periode ${metric.period}`).join('; ');
  const gaps = record.sources.length ? record.gaps : record.gaps.filter(gap => !/^(?:loss-making|low-margin|underwriting|solvency|financing|going-concern|regulatory|net-income|operating-margin|combined-ratio|solvency-ratio|cash|debt-maturities):/.test(gap));
  return { key: record.key, status: record.status, materialRisks, rationale: [details, metrics, ...gaps].filter(Boolean).join(' | ').slice(0, 2900), sources: record.sources };
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
    const record = this.records.get(key);
    if (!record || record.isin !== position.isin.trim().toUpperCase() || record.fingerprint !== riskFingerprint(position, set)) return null;
    // A failed source check needs another attempt after a day. Completed assessments
    // remain reusable while the document hashes and policy are unchanged.
    if (record.status === 'unknown' && Date.now() - record.checkedAt >= 24 * 60 * 60 * 1000) return null;
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
