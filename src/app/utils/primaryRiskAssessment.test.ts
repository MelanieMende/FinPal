import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnalysisPosition } from './portfolioAnalysis';
import { PrimaryRiskAssessmentCache, riskAssessmentSchema, riskForModel, validateRiskAssessment } from './primaryRiskAssessment';
import { riskChecksFor, riskChecksForPosition, riskMetricsForPosition } from './assetRiskPolicy';
import type { RiskDocumentSet } from './primaryRiskResearch';

const position = { id: 7, name: "McDonald's", isin: 'US5801351017', symbol: 'MCD', type: 'Stock' } as AnalysisPosition;
const excerpt = 'Net income was $8 billion in 2025. Operating margin was 45 percent in 2025. Cash and cash equivalents were $3 billion at year end. Debt obligations due in 2026 were $1 billion. Management concluded there is no substantial doubt about going concern. There are no material legal proceedings.';
const document = { source: { title: 'SEC 10-K', url: 'https://www.sec.gov/Archives/edgar/data/63908/1/report.htm' },
  excerpt, hash: 'hash-1', fetchedAt: Date.now(), period: '2025-12-31' };
const set: RiskDocumentSet = { documents: [document], discoveryChecked: true, gaps: [] };
const assessment = {
  checks: [
    { flag: 'loss-making', finding: 'no-risk', reason: 'Positive net income.', documentIndex: 0, quote: 'Net income was $8 billion in 2025.' },
    { flag: 'low-margin', finding: 'no-risk', reason: 'Positive margin.', documentIndex: 0, quote: 'Operating margin was 45 percent in 2025.' },
    { flag: 'financing', finding: 'risk', reason: 'Debt comes due.', documentIndex: 0, quote: 'Debt obligations due in 2026 were $1 billion.' },
    { flag: 'going-concern', finding: 'no-risk', reason: 'Explicit statement.', documentIndex: 0, quote: 'no substantial doubt about going concern' },
    { flag: 'regulatory', finding: 'no-risk', reason: 'Explicit statement.', documentIndex: 0, quote: 'There are no material legal proceedings.' },
  ],
  metrics: [
    { name: 'net-income', value: 8, unit: 'USD billion', period: '2025', documentIndex: 0, quote: 'Net income was $8 billion in 2025.' },
    { name: 'operating-margin', value: 45, unit: 'percent', period: '2025', documentIndex: 0, quote: 'Operating margin was 45 percent in 2025.' },
    { name: 'cash', value: 3, unit: 'USD billion', period: '2025-12-31', documentIndex: 0, quote: 'Cash and cash equivalents were $3 billion at year end.' },
    { name: 'debt-maturities', value: 1, unit: 'USD billion', period: '2026', documentIndex: 0, quote: 'Debt obligations due in 2026 were $1 billion.' },
  ],
};

it('requires document text for every claimed finding and periodized metric', () => {
  const record = validateRiskAssessment(position, set, assessment);
  expect(record.status).toBe('assessed');
  expect(riskForModel(record).materialRisks).toEqual(['financing']);
  const fabricated = validateRiskAssessment(position, set, { ...assessment, checks: assessment.checks.map(check =>
    check.flag === 'financing' ? { ...check, quote: 'Fictional evidence of debt.' } : check) });
  expect(fabricated.status).toBe('unknown');
  expect(riskForModel(fabricated).materialRisks).toEqual([]);
  expect(fabricated.gaps).toContain('financing: Kein überprüfbarer Befund mit Textstelle.');
  const wrongNumber = validateRiskAssessment(position, set, { ...assessment, metrics: assessment.metrics.map(metric =>
    metric.name === 'cash' ? { ...metric, value: 9 } : metric) });
  expect(wrongNumber.status).toBe('unknown');
  expect(wrongNumber.gaps).toContain('cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
});

it('persists a completed assessment and invalidates it when the primary document changes', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-risk-'));
  try {
    const file = path.join(folder, 'assessments.json');
    new PrimaryRiskAssessmentCache(file).set(validateRiskAssessment(position, set, assessment));
    const restored = new PrimaryRiskAssessmentCache(file);
    expect(restored.get(position, set)?.status).toBe('assessed');
    expect(restored.get(position, { ...set, documents: [{ ...document, hash: 'hash-2' }] })).toBeNull();
    expect(restored.get(position, { ...set, gaps: ['SEC-Abgleich fehlgeschlagen.'], discoveryChecked: false })?.status).toBe('unknown');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('uses a separate checklist for every asset type', () => {
  for (const type of ['Stock', 'ETF', 'Fund', 'Bond', 'Crypto', 'Commodity', 'RealEstate', 'CashEquivalent'] as const) {
    const checks = riskChecksFor(type);
    expect(checks.length).toBeGreaterThanOrEqual(5);
    expect(new Set(checks).size).toBe(checks.length);
    expect(checks).toContain('regulatory');
  }
  expect(riskChecksFor('ETF')).toContain('costs');
  expect(riskChecksFor('Bond')).toContain('seniority');
  expect(riskChecksFor('Crypto')).toContain('custody');
  expect(riskChecksFor('RealEstate')).toContain('valuation');
  expect(riskChecksFor('Stock')).toContain('going-concern');
  expect(riskChecksFor('ETF')).not.toContain('going-concern');
});

it('requires relevant exact document quotes for each ETF check and reuses the saved result', () => {
  const etf = { id: 8, name: 'iShares Technology ETF', isin: 'IE00B3WJKG14', symbol: 'QDVE', type: 'ETF' } as AnalysisPosition;
  const text = 'ISIN IE00B3WJKG14. The objective is to track the index. Ongoing charges are 0.15 percent. Sector holdings are concentrated in technology. Units may be redeemed daily. Securities lending creates counterparty risk. Currency exposure is USD without a hedge. No material legal proceedings are reported.';
  const etfSet: RiskDocumentSet = { documents: [{ ...document, excerpt: text, hash: 'etf-hash', period: '2026-09-30' }], discoveryChecked: true, gaps: [] };
  const quotes: Record<string, string> = {
    identity: 'ISIN IE00B3WJKG14.', strategy: 'The objective is to track the index.',
    costs: 'Ongoing charges are 0.15 percent.', concentration: 'Sector holdings are concentrated in technology.',
    liquidity: 'Units may be redeemed daily.', structure: 'Securities lending creates counterparty risk.',
    currency: 'Currency exposure is USD without a hedge.', regulatory: 'No material legal proceedings are reported.',
  };
  const checks = riskChecksFor('ETF').map(flag => ({ flag, finding: 'risk', reason: 'Documented exposure.', documentIndex: 0, quote: quotes[flag] }));
  const record = validateRiskAssessment(etf, etfSet, { checks, metrics: [] });
  expect(record.status).toBe('assessed');
  expect(riskForModel(record).materialRisks).toContain('structure');
  const unrelated = validateRiskAssessment(etf, etfSet, { checks: checks.map(check => check.flag === 'costs'
    ? { ...check, quote: quotes.identity } : check), metrics: [] });
  expect(unrelated.status).toBe('unknown');
  expect(unrelated.gaps).toContain('costs: Kein überprüfbarer Befund mit Textstelle.');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-etf-risk-'));
  try {
    const file = path.join(folder, 'cache.json');
    new PrimaryRiskAssessmentCache(file).set(record);
    expect(new PrimaryRiskAssessmentCache(file).get(etf, etfSet)?.status).toBe('assessed');
    expect(new PrimaryRiskAssessmentCache(file).get({ ...etf, type: 'Fund' }, etfSet)).toBeNull();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('uses insurance capital and underwriting evidence for Munich Re instead of an operating margin', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  expect(riskChecksForPosition(insurer)).toEqual(['loss-making', 'underwriting', 'solvency', 'financing', 'going-concern', 'regulatory']);
  expect(riskMetricsForPosition(insurer)).toEqual(['net-income', 'combined-ratio', 'solvency-ratio', 'cash']);
  expect(riskAssessmentSchema(insurer).properties.checks.items.properties.flag.enum).not.toContain('low-margin');
  const report = 'Munich Re. Net result was 3925 EUR million in H1 2026. Combined ratio was 68.9 percent in H1 2026. Solvency ratio was 304 percent at 30 June 2026. Cash and cash equivalents were 5819 EUR million at 30 June 2026. The auditor found no material uncertainty about going concern. No material regulatory proceedings were reported.';
  const insurerSet: RiskDocumentSet = { documents: [{ ...document, excerpt: report, hash: 'munich-report', period: '2026-06-30' }], discoveryChecked: true, gaps: [] };
  const quotes: Record<string, string> = {
    'loss-making': 'Net result was 3925 EUR million in H1 2026.', underwriting: 'Combined ratio was 68.9 percent in H1 2026.',
    solvency: 'Solvency ratio was 304 percent at 30 June 2026.', financing: 'Cash and cash equivalents were 5819 EUR million at 30 June 2026.',
    'going-concern': 'no material uncertainty about going concern.', regulatory: 'No material regulatory proceedings were reported.',
  };
  const checks = riskChecksForPosition(insurer).map(flag => ({ flag, finding: 'no-risk', reason: 'Reported finding.', documentIndex: 0, quote: quotes[flag] }));
  const metrics = [
    { name: 'net-income', value: 3925, unit: 'EUR million', period: 'H1 2026', documentIndex: 0, quote: quotes['loss-making'] },
    { name: 'combined-ratio', value: 68.9, unit: 'percent', period: 'H1 2026', documentIndex: 0, quote: quotes.underwriting },
    { name: 'solvency-ratio', value: 304, unit: 'percent', period: '2026-06-30', documentIndex: 0, quote: quotes.solvency },
    { name: 'cash', value: 5819, unit: 'EUR million', period: '2026-06-30', documentIndex: 0, quote: quotes.financing },
  ];
  const record = validateRiskAssessment(insurer, insurerSet, { checks, metrics });
  expect(record.status).toBe('assessed');
  expect(riskForModel(record).rationale).toContain('Combined Ratio');
  const incomplete = validateRiskAssessment(insurer, insurerSet, { checks, metrics: metrics.filter(metric => metric.name !== 'solvency-ratio') });
  expect(incomplete.status).toBe('unknown');
  expect(incomplete.gaps).toContain('solvency-ratio: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
});

it('shows the missing source once instead of repeating every empty check', () => {
  const empty = validateRiskAssessment(position, { documents: [], discoveryChecked: false,
    gaps: ['Kein lesbares aktuelles Primärdokument verfügbar.'] }, null);
  const summary = riskForModel(empty);
  expect(summary.status).toBe('unknown');
  expect(summary.rationale).toContain('Kein lesbares aktuelles Primärdokument');
  expect(summary.rationale).not.toContain('loss-making:');
  expect(summary.rationale).not.toContain('Gewinn oder Verlust: offen');
});
