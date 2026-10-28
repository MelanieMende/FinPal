import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import type { AnalysisPosition } from './portfolioAnalysis';
import { PrimaryRiskAssessmentCache, riskAssessmentSchema, riskFingerprint, riskForModel, validateRiskAssessment } from './primaryRiskAssessment';
import { riskChecksFor, riskChecksForPosition, riskMetricsForPosition } from './assetRiskPolicy';
import { riskExcerpt, type RiskDocumentSet } from './primaryRiskResearch';

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

it('uses McDonalds filed debt schedule and keeps a conditional regulatory risk distinct from a current event', () => {
  const quarter = { ...document, source: { title: 'SEC 10-Q 2026-06-30',
    url: 'https://www.sec.gov/Archives/edgar/data/63908/000006390826000073/mcd-20260630.htm' }, period: '2026-06-30',
  excerpt: 'Net income was $2,362 million. Operating margin was 46.2 percent. Cash and cash equivalents were $822 million. Our operations may also be impacted by regulations affecting capital flows, financial markets or financial institutions, which can limit our ability to manage and deploy our liquidity or increase our funding costs. Any such events could have a material adverse effect on our business.' };
  const annual = { ...document, source: { title: 'SEC 10-K 2025-12-31',
    url: 'https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm' },
  excerpt: 'Available cash and borrowing capacity should meet foreseeable requirements. Aggregate maturities for 2025 debt balances, before fair value adjustments and deferred debt costs, are as follows (in millions): 2026–$0; 2027–$3,201; 2028–$5,166; 2029–$3,637; 2030–$3,011; Thereafter–$25,130.' };
  const filing: RiskDocumentSet = { documents: [quarter, annual], discoveryChecked: true, gaps: [] };
  const answer = { checks: [
    { flag: 'loss-making', finding: 'no-risk', reason: 'Positive Q2 earnings.', documentIndex: 0, quote: 'Net income was $2,362 million.' },
    { flag: 'low-margin', finding: 'no-risk', reason: 'High H1 margin.', documentIndex: 0, quote: 'Operating margin was 46.2 percent.' },
    { flag: 'financing', finding: 'no-risk', reason: 'Management sees adequate funding.', documentIndex: 1, quote: 'Available cash and borrowing capacity should meet foreseeable requirements.' },
    { flag: 'going-concern', finding: 'unknown', reason: 'Keine ausdrückliche unternehmensbezogene Aussage.', documentIndex: null, quote: '' },
    { flag: 'regulatory', finding: 'risk', reason: 'Mögliche künftige Kapitalflussregeln können Kosten erhöhen.', documentIndex: 0,
      quote: 'Our operations may also be impacted by regulations affecting capital flows, financial markets or financial institutions' },
  ], metrics: [
    { name: 'net-income', value: 2362, unit: 'Mio. USD', period: 'Q2 2026', documentIndex: 0, quote: 'Net income was $2,362 million.' },
    { name: 'operating-margin', value: 46.2, unit: '%', period: 'H1 2026', documentIndex: 0, quote: 'Operating margin was 46.2 percent.' },
    { name: 'cash', value: 822, unit: 'Mio. USD', period: '2026-06-30', documentIndex: 0, quote: 'Cash and cash equivalents were $822 million.' },
  ] };
  const reviewed = validateRiskAssessment(position, filing, answer);
  expect(reviewed.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
  expect(reviewed.checks.find(check => check.flag === 'going-concern')?.finding).toBe('unknown');
  expect(reviewed.metrics.find(metric => metric.name === 'debt-maturities')).toMatchObject({ value: 3201, unit: 'Mio. USD', period: 'Stand 2025-12-31; Fälligkeit 2027' });
  expect(reviewed.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/^going-concern:/)]));
  expect(riskForModel(reviewed)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const conditionalUnknown = validateRiskAssessment(position, filing, { ...answer, checks: answer.checks.map(check =>
    check.flag === 'regulatory' ? { ...check, finding: 'unknown', documentIndex: null, quote: '',
      reason: 'Es verbleibt eine regulatorische Exposition gegenüber Beschränkungen von Kapitalflüssen und möglichen höheren Finanzierungskosten.' } : check) });
  expect(conditionalUnknown.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'unknown', documentIndex: 0 });
  expect(conditionalUnknown.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/^regulatory:/)]));
  expect(riskForModel(conditionalUnknown)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const unsupportedUnknown = validateRiskAssessment(position, filing, { ...answer, checks: answer.checks.map(check =>
    check.flag === 'regulatory' ? { ...check, finding: 'unknown', documentIndex: null, quote: '',
      reason: 'Ein aktueller konkreter Verstoß kann noch nicht beurteilt werden.' } : check) });
  expect(riskForModel(unsupportedUnknown).decisionReadiness).toBeUndefined();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-mcd-upgrade-'));
  try {
    const oldFingerprint = createHash('sha256').update(JSON.stringify({ policy: 'asset-type-primary-review-v5',
      isin: position.isin, type: position.type, documents: filing.documents.map(doc => [doc.source.url, doc.hash, 0])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })).digest('hex');
    const legacy = { ...reviewed, fingerprint: oldFingerprint, metrics: reviewed.metrics.filter(metric => metric.name !== 'debt-maturities'),
      checks: reviewed.checks.map(check => check.flag === 'regulatory' ? { ...check, finding: 'risk' as const, documentIndex: 0,
        quote: answer.checks[4].quote } : check), gaps: [...reviewed.gaps, 'debt-maturities: missing'] };
    const file = path.join(folder, 'assessment.json');
    new PrimaryRiskAssessmentCache(file).set(legacy);
    const migrated = new PrimaryRiskAssessmentCache(file).get(position, filing);
    expect(migrated?.fingerprint).toBe(riskFingerprint(position, filing));
    expect(migrated?.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
    expect(migrated?.metrics.find(metric => metric.name === 'debt-maturities')?.value).toBe(3201);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  expect(riskForModel({ ...reviewed, gaps: [...reviewed.gaps, 'cash: missing'] }).decisionReadiness).toBeUndefined();
  const noSchedule = validateRiskAssessment(position, { ...filing, documents: [quarter, { ...annual, excerpt: 'Available cash and borrowing capacity should meet foreseeable requirements.' }] }, answer);
  expect(noSchedule.gaps).toEqual(expect.arrayContaining([expect.stringMatching(/^debt-maturities:/)]));
  expect(riskForModel(noSchedule).decisionReadiness).toBeUndefined();
  const currentEvent = validateRiskAssessment(position, { ...filing, documents: [{ ...quarter, excerpt: quarter.excerpt + ' A regulator imposed a material sanction.' }, annual] },
    { ...answer, checks: answer.checks.map(check => check.flag === 'regulatory' ? { ...check, quote: 'A regulator imposed a material sanction.', reason: 'A current material regulatory sanction.' } : check) });
  expect(currentEvent.checks.find(check => check.flag === 'regulatory')?.finding).toBe('risk');
  expect(riskForModel(currentEvent).decisionReadiness).toBeUndefined();
});

it('uses Novo Nordisks current borrowing classification and explicit liquidity outlook', () => {
  const novo = { ...position, id: 52, name: 'Novo Nordisk', isin: 'DK0062498333', symbol: 'NOVO-B.CO' };
  const quarter = { ...document, period: '2026-06-30', source: { title: 'SEC 6-K financial report 2026-06-30',
    url: 'https://www.sec.gov/Archives/edgar/data/353278/000035327826000023/caq22026.htm' },
  excerpt: 'Net profit 20,989 DKK million. Operating margin 34.5%. Borrowings, non-current (121,794) (118,941) Borrowings, current (18,333) (12,017) Add-back of lease liabilities 8,622 8,572 Cash at bank 44,482 26,464.' };
  const annual = { ...document, period: '2025-12-31', source: { title: 'SEC 20-F 2025-12-31',
    url: 'https://www.sec.gov/Archives/edgar/data/353278/000035327826000012/nvo-20251231.htm' },
  excerpt: 'Novo Nordisk believes its financial resources are sufficient to meet its requirements for at least the next 12 months.' };
  const documents: RiskDocumentSet = { documents: [quarter, annual], discoveryChecked: true, gaps: [] };
  const answer = { checks: [
    { flag: 'loss-making', finding: 'no-risk', reason: 'Positive result.', documentIndex: 0, quote: 'Net profit 20,989 DKK million.' },
    { flag: 'low-margin', finding: 'no-risk', reason: 'Positive margin.', documentIndex: 0, quote: 'Operating margin 34.5%.' },
    { flag: 'financing', finding: 'unknown', reason: 'Cash and borrowings need review.', documentIndex: null, quote: '' },
    { flag: 'going-concern', finding: 'unknown', reason: 'Keine ausdrückliche Beurteilung.', documentIndex: null, quote: '' },
    { flag: 'regulatory', finding: 'unknown', reason: 'Regulatorische Exposition bleibt; bedingte Warnungen belegen keinen eingetretenen Schaden.', documentIndex: null, quote: '' },
  ], metrics: [
    { name: 'net-income', value: 20989, unit: 'Mio. DKK', period: 'Q2 2026', documentIndex: 0, quote: 'Net profit 20,989 DKK million.' },
    { name: 'operating-margin', value: 34.5, unit: '%', period: 'Q2 2026', documentIndex: 0, quote: 'Operating margin 34.5%.' },
    { name: 'cash', value: 44482, unit: 'Mio. DKK', period: '2026-06-30', documentIndex: 0, quote: 'Cash at bank 44,482' },
  ] };
  const reviewed = validateRiskAssessment(novo, documents, answer);
  expect(reviewed.checks.find(check => check.flag === 'financing')).toMatchObject({ finding: 'no-risk', documentIndex: 1 });
  expect(reviewed.metrics.find(metric => metric.name === 'debt-maturities')).toMatchObject({ value: 18333, unit: 'Mio. DKK', period: 'Stichtag 2026-06-30; kurzfristige Kreditverbindlichkeiten' });
  expect(reviewed.gaps).not.toEqual(expect.arrayContaining([expect.stringMatching(/^debt-maturities:|^financing:/)]));
  expect(riskForModel(reviewed).decisionReadiness).toBe('reviewed-uncertainty');
  expect(riskForModel({ ...reviewed, gaps: [...reviewed.gaps, 'cash: missing'] }).decisionReadiness).toBeUndefined();
  expect(riskForModel({ ...reviewed, checks: reviewed.checks.map(check => check.flag === 'regulatory'
    ? { ...check, finding: 'risk' as const } : check) }).decisionReadiness).toBeUndefined();
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-novo-upgrade-'));
  try {
    const file = path.join(folder, 'assessment.json');
    const legacy = { ...reviewed, checks: reviewed.checks.map(check => check.flag === 'financing'
      ? { ...check, finding: 'unknown' as const, documentIndex: null, quote: '' } : check),
      metrics: reviewed.metrics.filter(metric => metric.name !== 'debt-maturities'),
      gaps: [...reviewed.gaps, 'financing: offen', 'debt-maturities: offen',
        'Primärdokument konnte nicht aktuell geladen werden: https://www.sec.gov/Archives/edgar/data/353278/000117184326006813/f6k_102626.htm'] };
    new PrimaryRiskAssessmentCache(file).set(legacy);
    const refreshed = new PrimaryRiskAssessmentCache(file).get(novo, documents);
    expect(refreshed?.checks.find(check => check.flag === 'financing')?.finding).toBe('no-risk');
    expect(refreshed?.metrics.find(metric => metric.name === 'debt-maturities')?.value).toBe(18333);
    expect(refreshed?.gaps).toEqual(reviewed.gaps);
    expect(riskForModel(refreshed!).decisionReadiness).toBe('reviewed-uncertainty');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  const noOutlook = validateRiskAssessment(novo, { ...documents, documents: [quarter, { ...annual, excerpt: 'Financial risks are disclosed.' }] }, answer);
  expect(noOutlook.checks.find(check => check.flag === 'financing')?.finding).toBe('unknown');
});

it('reads parenthesized losses as negative figures in filing evidence', () => {
  const arbor = { ...position, id: 19, name: 'Arbor Metals', isin: 'CA03880B1040' };
  const filing: RiskDocumentSet = { documents: [{ ...document, period: '2026-04-30',
    excerpt: 'ARBOR METALS CORP. April 30, 2026. Net income (loss) for the six months (420,586). Cash 716,380.' }],
    discoveryChecked: true, gaps: [] };
  const response = { checks: [] as unknown[], metrics: [{ name: 'net-income', value: -420586, unit: 'CAD', period: '2025-11-01/2026-04-30',
    documentIndex: 0, quote: 'Net income (loss) for the six months (420,586).' }] };
  expect(validateRiskAssessment(arbor, filing, response).metrics).toContainEqual(expect.objectContaining({ name: 'net-income', value: -420586 }));
  expect(validateRiskAssessment(arbor, filing, { ...response, metrics: [{ ...response.metrics[0], value: 420586 }] }).metrics).toEqual([]);
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

it('records QDVE sector concentration and secondary-market access from its current issuer documents', () => {
  const etf = { id: 64, name: 'S&P 500 Information Technology', isin: 'IE00B3WJKG14', symbol: 'QDVE.DE', type: 'ETF' } as AnalysisPosition;
  const product = { ...document, period: '2026-10-23', source: { title: 'iShares QDVE',
    url: 'https://www.ishares.com/de/privatanleger/de/produkte/280510/ishares-sp-500-information-technology-sector-ucits-etf' },
  excerpt: 'ISIN IE00B3WJKG14. Das Anlagerisiko ist auf bestimmte Sektoren, Länder, Währungen oder Unternehmen konzentriert. Portfolioallokation. Halbleiter 40,07. Anzahl der Positionen 75.' };
  const kid = { ...document, period: '2026-09-03', source: { title: 'iShares KID',
    url: 'https://www.ishares.com/ch/professionals/en/literature/kiid/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en.pdf?siteEntryPassthrough=true&switchLocale=y' },
  excerpt: 'ISIN: IE00B3WJKG14. The Manager is authorised in Ireland and regulated by the Central Bank of Ireland. The Fund tracks the S&P 500 Capped 35/20 Information Technology Index. Management fees and other administrative or operating costs 0.15% of the value of your investment per year. Transaction costs 0.00%. Performance fees There is no performance fee for this product. The Fund may also engage in short-term secured lending of its investments to certain eligible third parties. The investment manager may use financial derivative instruments. Investors who are not authorised participants can generally only buy or sell the shares on the secondary market (e.g. via a broker on a stock exchange) at the then prevailing market price. The prevailing market price at which the shares trade on the secondary market may deviate from the value of the Shares.' };
  const sourceSet: RiskDocumentSet = { documents: [product, kid], discoveryChecked: true, gaps: [] };
  const response = { checks: riskChecksFor('ETF').map(flag => ({ flag, finding: 'unknown', reason: 'Kein überprüfbarer Befund mit Textstelle.', documentIndex: null as number | null, quote: '' })), metrics: [] as unknown[] };
  const record = validateRiskAssessment(etf, sourceSet, response);
  expect(record.checks.find(check => check.flag === 'concentration')).toMatchObject({ finding: 'risk', documentIndex: 0 });
  expect(record.checks.find(check => check.flag === 'costs')).toMatchObject({ finding: 'no-risk', documentIndex: 1 });
  expect(record.checks.find(check => check.flag === 'liquidity')).toMatchObject({ finding: 'risk', documentIndex: 1 });
  expect(record.checks.find(check => check.flag === 'structure')).toMatchObject({ finding: 'risk', documentIndex: 1 });
  expect(record.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'no-risk', documentIndex: 1 });
  expect(record.gaps.some(gap => /^(?:costs|concentration|liquidity|structure|regulatory):/.test(gap))).toBe(false);
  const invalidQuotes = validateRiskAssessment(etf, sourceSet, { checks: riskChecksFor('ETF').map(flag => ({
    flag, finding: 'no-risk', reason: 'Unbelegte Aussage.', documentIndex: 0, quote: 'Diese Textstelle existiert nicht.',
  })), metrics: [] });
  expect(invalidQuotes.checks.find(check => check.flag === 'costs')?.finding).toBe('no-risk');
  expect(invalidQuotes.checks.find(check => check.flag === 'concentration')?.finding).toBe('risk');
  expect(invalidQuotes.checks.find(check => check.flag === 'liquidity')?.finding).toBe('risk');
  expect(invalidQuotes.checks.find(check => check.flag === 'structure')?.finding).toBe('risk');
  expect(invalidQuotes.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
  const kidOnly = validateRiskAssessment(etf, { ...sourceSet, documents: [kid] }, response);
  expect(kidOnly.checks.find(check => check.flag === 'concentration')).toMatchObject({ finding: 'risk', documentIndex: 0 });
  expect(kidOnly.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'no-risk', documentIndex: 0 });
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-qdve-upgrade-'));
  try {
    const file = path.join(folder, 'assessment.json');
    new PrimaryRiskAssessmentCache(file).set({ ...record, checks: record.checks.map(check => ['costs', 'concentration', 'liquidity', 'structure', 'regulatory'].includes(check.flag)
      ? { ...check, finding: 'unknown' as const, documentIndex: null, quote: '' } : check),
    gaps: [...record.gaps, 'costs: offen', 'concentration: offen', 'liquidity: offen', 'structure: offen', 'regulatory: offen',
      'Primärdokument konnte nicht aktuell geladen werden: https://www.ishares.com/ch/professionals/en/literature/kiid/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en.pdf'] });
    const refreshed = new PrimaryRiskAssessmentCache(file).get(etf, sourceSet);
    expect(refreshed?.checks.find(check => check.flag === 'concentration')?.finding).toBe('risk');
    expect(refreshed?.checks.find(check => check.flag === 'costs')?.finding).toBe('no-risk');
    expect(refreshed?.checks.find(check => check.flag === 'liquidity')?.finding).toBe('risk');
    expect(refreshed?.checks.find(check => check.flag === 'structure')?.finding).toBe('risk');
    expect(refreshed?.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
    expect(refreshed?.gaps).toEqual(record.gaps);
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  expect(validateRiskAssessment({ ...etf, isin: 'IE00OTHER' }, sourceSet, response).checks.find(check => check.flag === 'concentration')?.finding).toBe('unknown');
});

it('uses insurance capital and underwriting evidence for Munich Re instead of an operating margin', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  expect(riskChecksForPosition(insurer)).toEqual(['loss-making', 'underwriting', 'solvency', 'financing', 'going-concern', 'regulatory']);
  expect(riskMetricsForPosition(insurer)).toEqual(['net-income', 'combined-ratio', 'solvency-ratio', 'cash']);
  expect(riskAssessmentSchema(insurer).properties.checks.items.properties.flag.enum).not.toContain('low-margin');
  const report = 'Munich Re. Net result was 3.925 EUR million in H1 2026. Combined ratio was 68.9 percent in H1 2026. Solvency ratio was 304 percent at 30 June 2026. Cash and cash equivalents were 5.819 EUR million at 30 June 2026. The auditor found no material uncertainty about going concern. No material regulatory proceedings were reported.';
  const insurerSet: RiskDocumentSet = { documents: [{ ...document, excerpt: report, hash: 'munich-report', period: '2026-06-30' }], discoveryChecked: true, gaps: [] };
  const quotes: Record<string, string> = {
    'loss-making': 'Net result was 3.925 EUR million in H1 2026.', underwriting: 'Combined ratio was 68.9 percent in H1 2026.',
    solvency: 'Solvency ratio was 304 percent at 30 June 2026.', financing: 'Cash and cash equivalents were 5.819 EUR million at 30 June 2026.',
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
  expect(record.metrics.map(metric => metric.name)).toContain('net-income');
  expect(record.metrics.map(metric => metric.name)).toContain('cash');
  expect(riskForModel(record).rationale).toContain('Combined Ratio');
  const incomplete = validateRiskAssessment(insurer, insurerSet, { checks, metrics: metrics.filter(metric => metric.name !== 'solvency-ratio') });
  expect(incomplete.status).toBe('unknown');
  expect(incomplete.gaps).toContain('solvency-ratio: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
});

it('reads Munich Re cash from the dated consolidated balance-sheet row when the AI omits it', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const official = { ...document, source: { title: 'Munich Re Half-Year Financial Report 2026',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf' },
  period: '2026-06-30', excerpt: riskExcerpt('Munich Re. Consolidated balance sheet as at 30 June 2026. €m. H. Cash and cash equivalents 5,819 5,502 317 5.8', 'Stock', true) };
  const sourceSet: RiskDocumentSet = { documents: [official], discoveryChecked: true, gaps: [] };
  const record = validateRiskAssessment(insurer, sourceSet, { checks: [], metrics: [] });
  expect(record.metrics).toContainEqual(expect.objectContaining({ name: 'cash', value: 5819, unit: 'Mio. EUR', period: '2026-06-30', documentIndex: 0 }));
  expect(record.gaps).not.toContain('cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
  expect(record.status).toBe('unknown');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-munich-cash-'));
  try {
    const file = path.join(folder, 'risk.json');
    new PrimaryRiskAssessmentCache(file).set({ ...record, metrics: [],
      gaps: [...record.gaps, 'cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.'] });
    const migrated = new PrimaryRiskAssessmentCache(file).get(insurer, sourceSet);
    expect(migrated?.metrics.find(metric => metric.name === 'cash')?.value).toBe(5819);
    expect(new PrimaryRiskAssessmentCache(file).get(insurer, sourceSet)?.gaps).not.toContain('cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  const changed = validateRiskAssessment(insurer, { ...sourceSet, documents: [{ ...official,
    excerpt: official.excerpt.replace('5,819', '5,920') }] }, { checks: [], metrics: [] });
  expect(changed.metrics.find(metric => metric.name === 'cash')?.value).toBe(5920);
  const wrongDocument = validateRiskAssessment(insurer, { ...sourceSet, documents: [{ ...official,
    source: { ...official.source, url: 'https://example.com/report.pdf' } }] }, { checks: [], metrics: [] });
  expect(wrongDocument.metrics).toHaveLength(0);
});

it('keeps complete combined-ratio segment names', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const quote = 'Combined ratio was 67.9 percent for Schaden-Unfall-Rückversicherung.';
  const record = validateRiskAssessment(insurer, { documents: [{ ...document, excerpt: quote }], discoveryChecked: true, gaps: [] }, {
    checks: [], metrics: [{ name: 'combined-ratio', value: 67.9, unit: '%; Segment Schaden-Unfall-Rückversicherung',
      period: 'H1 2026', documentIndex: 0, quote }],
  });
  expect(record.metrics[0].unit).toBe('%; Segment Schaden-Unfall-Rückversicherung');
  expect(riskForModel(record).rationale).toContain('Schaden-Unfall-Rückversicherung');
});

it('rechecks Munich Re when the annual legal-risk excerpt is upgraded', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const annual = { ...document, source: { title: 'Annual Report',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf' } };
  const oldSet: RiskDocumentSet = { documents: [annual], discoveryChecked: true, gaps: [] };
  const newSet: RiskDocumentSet = { ...oldSet, documents: [{ ...annual, excerptVersion: 1 }] };
  expect(riskFingerprint(insurer, newSet)).not.toBe(riskFingerprint(insurer, oldSet));
  expect(riskFingerprint(position, newSet)).toBe(riskFingerprint(position, oldSet));
});

it('does not label disclosed 2025 proceedings as a proven material regulatory risk', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const quote = 'Munich Re companies are involved in court, regulatory and arbitration proceedings in various countries.';
  const annual = { ...document, period: '2025-12-31', source: { title: 'Annual Report 2025',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf' },
  excerpt: `Legal risks. ${quote} The outcome of those proceedings is neither certain nor predictable. However, we believe that none of these proceedings will have a significant negative effect on the financial position of Munich Re.` };
  const sourceSet: RiskDocumentSet = { documents: [annual], discoveryChecked: true, gaps: [] };
  const answer = { checks: [{ flag: 'regulatory', finding: 'risk', reason: 'Ongoing proceedings.', documentIndex: 0, quote }], metrics: [] as unknown[] };
  const reviewed = validateRiskAssessment(insurer, sourceSet, answer);
  expect(reviewed.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'unknown', documentIndex: 0, quote });
  expect(riskForModel(reviewed).materialRisks).not.toContain('regulatory');
  expect(riskForModel(reviewed).rationale).toContain('fehlt eine Aktualisierung für 2026');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-munich-legal-'));
  try {
    const file = path.join(folder, 'risk.json');
    const legacy = { ...reviewed, checks: reviewed.checks.map(check => check.flag === 'regulatory'
      ? { ...check, finding: 'risk' as const } : check), gaps: reviewed.gaps.filter(gap => !gap.startsWith('regulatory:')) };
    new PrimaryRiskAssessmentCache(file).set(legacy);
    const migrated = new PrimaryRiskAssessmentCache(file).get(insurer, sourceSet);
    expect(migrated?.checks.find(check => check.flag === 'regulatory')?.finding).toBe('unknown');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
  const current = validateRiskAssessment(insurer, { ...sourceSet, documents: [{ ...annual, period: '2026-06-30' }] }, answer);
  expect(current.checks.find(check => check.flag === 'regulatory')?.finding).toBe('risk');
  const halfYear = { ...annual, period: '2026-06-30', source: { title: 'Half-Year Financial Report 2026',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf' },
  excerpt: 'The statements relating to opportunities and risks as presented in the Munich Re Group Annual Report 2025 apply unchanged.', excerptVersion: 1 };
  const updatedSet: RiskDocumentSet = { ...sourceSet, documents: [annual, halfYear] };
  const updated = validateRiskAssessment(insurer, updatedSet, answer);
  expect(updated.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
  expect(updated.gaps.some(gap => gap.startsWith('regulatory:'))).toBe(false);
  expect(riskForModel(updated).rationale).toContain('erklärt die damaligen Risikoaussagen für unverändert gültig');
  const updatedFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-munich-legal-update-'));
  try {
    const file = path.join(updatedFolder, 'risk.json');
    new PrimaryRiskAssessmentCache(file).set({ ...updated, checks: updated.checks.map(check => check.flag === 'regulatory'
      ? { ...check, finding: 'unknown' as const, reason: '2025: Laufende Gerichts-, Aufsichts- und Schiedsverfahren; Munich Re erwartet keine erhebliche negative Wirkung. In den geprüften Auszügen fehlt eine Aktualisierung für 2026.' } : check),
      gaps: [...updated.gaps, 'regulatory: Bisher nicht aktualisiert.'] });
    expect(new PrimaryRiskAssessmentCache(file).get(insurer, updatedSet)?.checks.find(check => check.flag === 'regulatory')?.finding).toBe('no-risk');
  } finally { fs.rmSync(updatedFolder, { recursive: true, force: true }); }
});

it('closes Munich Re financing only with liquidity, maturities, current cash and carried-forward risks', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const annual = { ...document, period: '2025-12-31', source: { title: 'Annual Report 2025',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf' },
  excerpt: riskExcerpt('Munich Re. Our objective in managing liquidity risk is to ensure that we are in a position to meet our payment obligations at all times. The use of quantitative risk criteria also ensures that sufficient liquidity is available even under adverse scenarios. The overview below shows the liquidity requirements arising from our financial liabilities, divided into maturity bands.', 'Stock', true) };
  const halfYear = { ...document, period: '2026-06-30', source: { title: 'Half-Year Financial Report 2026',
    url: 'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf' },
  excerpt: riskExcerpt('Munich Re. The statements relating to opportunities and risks as presented in the Munich Re Group Annual Report 2025 apply unchanged. Consolidated balance sheet as at 30 June 2026. €m. H. Cash and cash equivalents 5,819 5,502 317.', 'Stock', true) };
  const sourceSet: RiskDocumentSet = { documents: [annual, halfYear], discoveryChecked: true, gaps: [] };
  const result = validateRiskAssessment(insurer, sourceSet, { checks: [
    { flag: 'financing', finding: 'unknown', reason: 'To be checked.', documentIndex: null, quote: '' },
    { flag: 'going-concern', finding: 'no-risk', reason: 'Generic auditor responsibility.', documentIndex: 0,
      quote: 'The use of quantitative risk criteria also ensures that sufficient liquidity is available even under adverse scenarios.' },
  ], metrics: [] });
  expect(result.checks.find(check => check.flag === 'financing')).toMatchObject({ finding: 'no-risk', documentIndex: 0 });
  expect(result.checks.find(check => check.flag === 'going-concern')).toMatchObject({ finding: 'unknown', documentIndex: null });
  expect(result.metrics.find(metric => metric.name === 'cash')?.value).toBe(5819);
  expect(result.gaps.some(gap => gap.startsWith('financing:'))).toBe(false);
  expect(result.gaps.some(gap => gap.startsWith('going-concern:'))).toBe(true);
  const withoutMaturity = validateRiskAssessment(insurer, { ...sourceSet, documents: [
    { ...annual, excerpt: annual.excerpt.replaceAll('The overview below shows the liquidity requirements arising from our financial liabilities, divided into maturity bands.', '') }, halfYear,
  ] }, { checks: [{ flag: 'financing', finding: 'unknown', reason: 'To be checked.', documentIndex: null, quote: '' }], metrics: [] });
  expect(withoutMaturity.checks.find(check => check.flag === 'financing')?.finding).toBe('unknown');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-munich-upgrade-'));
  try {
    const file = path.join(folder, 'assessments.json');
    const priorSet: RiskDocumentSet = { ...sourceSet, documents: [
      { ...annual, excerptVersion: 1, excerpt: 'Munich Re. Liquidity risk.' }, { ...halfYear, excerptVersion: 1 },
    ] };
    new PrimaryRiskAssessmentCache(file).set(validateRiskAssessment(insurer, priorSet, null));
    const expandedSet: RiskDocumentSet = { ...sourceSet, documents: [
      { ...annual, excerptVersion: 2 }, { ...halfYear, excerptVersion: 2 },
    ] };
    const migrated = new PrimaryRiskAssessmentCache(file).get(insurer, expandedSet);
    expect(migrated?.checks.find(check => check.flag === 'financing')?.finding).toBe('no-risk');
    expect(migrated?.fingerprint).toBe(riskFingerprint(insurer, expandedSet));
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('reuses reviewed but open evidence until the source changes', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-open-risk-'));
  try {
    const file = path.join(folder, 'assessments.json');
    const reviewed = validateRiskAssessment(position, set, { checks: assessment.checks.map(check =>
      check.flag === 'going-concern' ? { ...check, finding: 'unknown', reason: 'Reviewed, no statement.', documentIndex: null, quote: '' } : check),
    metrics: assessment.metrics }, Date.now() - 2 * 24 * 60 * 60 * 1000);
    new PrimaryRiskAssessmentCache(file).set(reviewed);
    const cache = new PrimaryRiskAssessmentCache(file);
    expect(cache.get(position, set)?.checks.find(check => check.flag === 'going-concern')?.finding).toBe('unknown');
    expect(cache.get(position, { ...set, documents: [{ ...document, hash: 'changed' }] })).toBeNull();
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('marks only reviewed Munich Re residual uncertainty as decision-ready', () => {
  const checks = riskChecksForPosition({ ...position, isin: 'DE0008430026' } as AnalysisPosition).map(flag => ({
    flag, finding: flag === 'going-concern' ? 'unknown' as const : 'no-risk' as const,
    reason: flag === 'going-concern' ? 'Verfügbare Primärberichte geprüft: ausdrückliche Aussage fehlt.' : 'Belegt.',
    documentIndex: flag === 'going-concern' ? null as number | null : 0,
    quote: flag === 'going-concern' ? '' : 'Documented company result.',
  }));
  const record = { key: '11', isin: 'DE0008430026', fingerprint: 'same', checkedAt: Date.now(), status: 'unknown' as const,
    checks, metrics: ['net-income', 'combined-ratio', 'solvency-ratio', 'cash'].map(name => ({
      name, value: 1, unit: 'Mio. EUR', period: '2026-06-30', documentIndex: 0, quote: 'Documented.' })),
    gaps: ['going-concern: geprüft'], sources: [
      { title: 'Annual', url: 'https://www.munichre.com/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf' },
      { title: 'Half-Year', url: 'https://www.munichre.com/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf' },
    ] };
  expect(riskForModel(record).decisionReadiness).toBe('reviewed-uncertainty');
  expect(riskForModel({ ...record, checks: checks.map(check => check.flag === 'financing'
    ? { ...check, finding: 'unknown' as const, reason: 'Verfügbare Primärberichte geprüft: Daten fehlen.' } : check),
    gaps: ['financing: geprüft', 'going-concern: geprüft'] }).decisionReadiness).toBeUndefined();
  expect(riskForModel({ ...record, gaps: [...record.gaps, 'cash: fehlt'] }).decisionReadiness).toBeUndefined();
  expect(riskForModel({ ...record, checks: checks.map(check => check.flag === 'financing'
    ? { ...check, finding: 'risk' as const } : check) }).decisionReadiness).toBeUndefined();
});

it('keeps Mondelez legal uncertainty visible without blocking solely on a reviewed continuity gap', () => {
  const mondelez = { ...position, id: 17, name: 'Mondelez', isin: 'US6092071058', symbol: 'MDLZ' };
  const quarter = { ...document, period: '2026-06-30', source: { title: 'SEC 10-Q 2026-06-30',
    url: 'https://www.sec.gov/Archives/edgar/data/1103982/000162828026050179/mdlz-20260630.htm' },
    excerpt: 'Net earnings attributable to Mondelez International $ 1,548. Operating income margin was 20.8 percent. Cash and cash equivalents $ 1,716. Current portion of long-term debt maturities $ 2,663. The ultimate outcome of these legal proceedings and regulatory and governmental matters, individually and in the aggregate, will not materially harm our financial position, results of operations or cash flows. However, unfavorable resolutions could involve substantial fines.' };
  const annual = { ...document, period: '2025-12-31', source: { title: 'SEC 10-K 2025-12-31',
    url: 'https://www.sec.gov/Archives/edgar/data/1103982/000162828026012345/mdlz-20251231.htm' } };
  const documents: RiskDocumentSet = { documents: [quarter, annual], discoveryChecked: true, gaps: [] };
  const answer = { checks: [
    { flag: 'loss-making', finding: 'no-risk', reason: 'Positive earnings.', documentIndex: 0, quote: 'Net earnings attributable to Mondelez International $ 1,548.' },
    { flag: 'low-margin', finding: 'no-risk', reason: 'Positive margin.', documentIndex: 0, quote: 'Operating income margin was 20.8 percent.' },
    { flag: 'financing', finding: 'no-risk', reason: 'Debt service covered.', documentIndex: 0, quote: 'Cash and cash equivalents $ 1,716.' },
    { flag: 'going-concern', finding: 'unknown', reason: 'Primärberichte geprüft; ausdrückliche Aussage fehlt.', documentIndex: null, quote: '' },
    { flag: 'regulatory', finding: 'risk', reason: 'Verfahren mit möglicher Sanktion; Management erwartet derzeit keine wesentliche Beeinträchtigung.', documentIndex: 0,
      quote: 'regulatory and governmental matters' },
  ], metrics: [
    { name: 'net-income', value: 1548, unit: 'Mio. USD', period: 'Q2 2026', documentIndex: 0, quote: 'Net earnings attributable to Mondelez International $ 1,548.' },
    { name: 'operating-margin', value: 20.8, unit: '%', period: 'Q2 2026', documentIndex: 0, quote: 'Operating income margin was 20.8 percent.' },
    { name: 'cash', value: 1716, unit: 'Mio. USD', period: '2026-06-30', documentIndex: 0, quote: 'Cash and cash equivalents $ 1,716.' },
    { name: 'debt-maturities', value: 2663, unit: 'Mio. USD', period: '2026-06-30', documentIndex: 0, quote: 'Current portion of long-term debt maturities $ 2,663.' },
  ] };
  const reviewed = validateRiskAssessment(mondelez, documents, answer);
  expect(reviewed.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'no-risk', documentIndex: 0 });
  expect(reviewed.checks.find(check => check.flag === 'regulatory')?.reason).toContain('Sanktionen bleiben möglich');
  expect(reviewed.status).toBe('unknown');
  expect(riskForModel(reviewed)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const noCurrentConclusion = validateRiskAssessment(mondelez, { ...documents, documents: [{ ...quarter,
    excerpt: quarter.excerpt.replace('will not materially harm our financial position, results of operations or cash flows', 'may harm our financial position') }, annual] }, answer);
  expect(noCurrentConclusion.checks.find(check => check.flag === 'regulatory')?.finding).toBe('risk');
  expect(riskForModel(noCurrentConclusion).decisionReadiness).toBeUndefined();
  expect(riskForModel({ ...reviewed, gaps: [...reviewed.gaps, 'cash: missing'] }).decisionReadiness).toBeUndefined();
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

it('keeps every Munich Re review field readable when reasons are long', () => {
  const insurer = { ...position, id: 11, name: 'Munich Re', isin: 'DE0008430026', symbol: 'MUV2.DE' };
  const record = validateRiskAssessment(insurer, { documents: [document], discoveryChecked: true, gaps: [] }, null);
  const long = { ...record, checks: record.checks.map(check => ({ ...check, reason: 'Lange dokumentierte Begründung. '.repeat(25) })),
    gaps: [...record.gaps, 'cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.'] };
  const summary = riskForModel(long).rationale;
  expect(summary).toContain('Regulatorische Risiken: offen');
  expect(summary).toContain('cash: Keine periodisierte Zahl mit überprüfbarer Textstelle.');
  expect(summary).not.toMatch(/\| cash: K$/);
  expect(summary.length).toBeLessThanOrEqual(3000);
});
