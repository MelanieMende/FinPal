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
function mcdDebtMaturities(position: AnalysisPosition, documents: RiskDocument[]): RiskMetric | null {
  if (position.type !== 'Stock' || position.isin.trim().toUpperCase() !== 'US5801351017') return null;
  for (const [documentIndex, document] of documents.entries()) {
    if (document.period !== '2025-12-31'
      || !/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20251231\.htm$/i.test(document.source.url)) continue;
    const match = /Aggregate maturities for 2025 debt balances[\s\S]{0,200}?2027\s*[-–—]\s*\$?\s*([\d,]+)/i.exec(document.excerpt);
    if (!match || !validQuote(match[0], document)) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isSafeInteger(value) || value <= 0 || !quoteContainsValue(match[0], value)) continue;
    return { name: 'debt-maturities', value, unit: 'Mio. USD', period: 'Stand 2025-12-31; Fälligkeit 2027', documentIndex, quote: match[0] };
  }
  return null;
}
const mondelezQuarter = (document: RiskDocument) => !!document.period
  && /^\d{4}-\d{2}-\d{2}$/.test(document.period) && Number.isFinite(Date.parse(document.period))
  && new RegExp(`^https://www\\.sec\\.gov/Archives/edgar/data/1103982/\\d{18}/mdlz-${document.period.replace(/-/g, '')}\\.htm$`, 'i').test(document.source.url)
  && /SEC 10-Q/i.test(document.source.title);
const latestMondelezQuarterIndex = (documents: RiskDocument[]) => documents.map((document, index) => ({ document, index }))
  .filter(({ document }) => mondelezQuarter(document))
  .sort((a, b) => b.document.period!.localeCompare(a.document.period!))[0]?.index ?? -1;
function mondelezCurrentDebt(position: AnalysisPosition, documents: RiskDocument[]): RiskMetric | null {
  if (position.type !== 'Stock' || position.isin.trim().toUpperCase() !== 'US6092071058') return null;
  const documentIndex = latestMondelezQuarterIndex(documents);
  const document = documents[documentIndex];
  if (document) {
    const match = /Current portion of long-term debt\s+\$?\s*([\d,]+)/i.exec(document.excerpt);
    if (!match || !validQuote(match[0], document)) return null;
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isSafeInteger(value) || value <= 0 || !quoteContainsValue(match[0], value)) return null;
    return { name: 'debt-maturities', value, unit: 'Mio. USD',
      period: `Stichtag ${document.period}; kurzfristig fälliger Anteil langfristiger Schulden`, documentIndex, quote: match[0] };
  }
  return null;
}
const isNovoNordisk = (position: Pick<AnalysisPosition, 'isin' | 'type'>) => position.type === 'Stock'
  && ['DK0062498333', 'US6701002056'].includes(position.isin.trim().toUpperCase());
const novoFinancialReport = (document: RiskDocument) => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/353278\/\d{18}\/caq[1-4]20\d{2}\.htm$/i.test(document.source.url)
  && !!document.period;
const novoAnnualReport = (document: RiskDocument) => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/353278\/\d{18}\/nvo-20\d{6}\.htm$/i.test(document.source.url)
  && !!document.period;
function novoCurrentBorrowings(position: AnalysisPosition, documents: RiskDocument[]): RiskMetric | null {
  if (!isNovoNordisk(position)) return null;
  for (const [documentIndex, document] of documents.entries()) {
    if (!novoFinancialReport(document)) continue;
    const match = /Borrowings,\s*current\s+\(?\s*([\d,]+)\s*\)?/i.exec(document.excerpt);
    if (!match || !validQuote(match[0], document)) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isSafeInteger(value) || value <= 0) continue;
    return { name: 'debt-maturities', value, unit: 'Mio. DKK',
      period: `Stichtag ${document.period}; kurzfristige Kreditverbindlichkeiten`, documentIndex, quote: match[0] };
  }
  return null;
}
function qualifyNovoFinancing(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (!isNovoNordisk(position) || check.flag !== 'financing' || check.finding !== 'unknown') return check;
  const annualIndex = documents.findIndex(document => novoAnnualReport(document)
    && /Novo Nordisk believes its financial resources are sufficient to meet its requirements for at least the next 12 months/i.test(document.excerpt));
  const borrowings = novoCurrentBorrowings(position, documents);
  const current = borrowings && documents[borrowings.documentIndex];
  const cashMatch = current && /Borrowings,\s*current\s+\(?\s*[\d,]+\s*\)?[\s\S]{0,200}?Cash at bank\s+([\d,]+)/i.exec(current.excerpt);
  const cash = cashMatch ? Number(cashMatch[1].replace(/,/g, '')) : 0;
  if (annualIndex < 0 || !borrowings || !Number.isSafeInteger(cash) || cash <= borrowings.value) return check;
  const quote = /Novo Nordisk believes its financial resources are sufficient to meet its requirements for at least the next 12 months/i.exec(documents[annualIndex].excerpt)?.[0] ?? '';
  if (!validQuote(quote, documents[annualIndex])) return check;
  return { ...check, finding: 'no-risk', documentIndex: annualIndex, quote,
    reason: `Stand ${current!.period}: ${cash} Mio. DKK Zahlungsmittel und ${borrowings.value} Mio. DKK kurzfristige Kreditverbindlichkeiten. Im Jahresbericht 2025 beurteilt Novo Nordisk seine Finanzmittel für mindestens zwölf Monate als ausreichend. Dies belegt keinen akuten Finanzierungsengpass, garantiert aber keine künftige Refinanzierung.` };
}
function qualifyQdveProductRisks(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (position.type !== 'ETF' || position.isin.trim().toUpperCase() !== 'IE00B3WJKG14') return check;
  const kidIndex = documents.findIndex(document => document.period
    && /^https:\/\/www\.ishares\.com\/ch\/professionals\/en\/literature\/kiid\/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en\.pdf/i.test(document.source.url)
    && document.excerpt.includes('IE00B3WJKG14'));
  const kid = documents[kidIndex];
  if (check.flag === 'costs' && check.finding === 'unknown' && kid) {
    const charge = /0\.15%\s+of the value of your investment per year/i.exec(kid.excerpt)?.[0] ?? '';
    if (/Transaction costs\s+0\.00%/i.test(kid.excerpt) && /Performance fees\s+There is no performance fee/i.test(kid.excerpt)
      && validQuote(charge, kid)) return { ...check, finding: 'no-risk', documentIndex: kidIndex, quote: charge,
        reason: `Das KID vom ${kid.period} weist 0,15 % jährliche Verwaltungs- und Betriebskosten, geschätzte interne Transaktionskosten von 0,00 % und keine Erfolgsgebühr aus. Brokergebühren und aktuelle Börsenspannen sind darin nicht enthalten.` };
  }
  if (check.flag === 'concentration' && check.finding !== 'risk') {
    const productIndex = documents.findIndex(document => document.period
      && /^https:\/\/www\.ishares\.com\/de\/privatanleger\/de\/produkte\/280510\//i.test(document.source.url)
      && document.excerpt.includes('IE00B3WJKG14')
      && /Das Anlagerisiko ist auf bestimmte Sektoren, Länder, Währungen oder Unternehmen konzentriert/i.test(document.excerpt));
    const documentIndex = productIndex >= 0 ? productIndex : kid && /S&P 500 Capped 35\/20 Information Technology Index/i.test(kid.excerpt)
      ? kidIndex : -1;
    if (documentIndex < 0) return check;
    const document = documents[documentIndex];
    const quote = productIndex >= 0
      ? /Das Anlagerisiko ist auf bestimmte Sektoren, Länder, Währungen oder Unternehmen konzentriert/i.exec(document.excerpt)?.[0] ?? ''
      : /S&P 500 Capped 35\/20 Information Technology Index/i.exec(document.excerpt)?.[0] ?? '';
    if (!validQuote(quote, document)) return check;
    const sector = /Halbleiter\s+([\d,]+)\s*%?/i.exec(document.excerpt);
    return { ...check, finding: 'risk', documentIndex, quote,
      reason: `Stand ${document.period}: Die exakte Anteilsklasse ist auf den US-Informationstechnologiesektor konzentriert${sector ? `; Halbleiter machen ${sector[1]} % der ausgewiesenen Sektorallokation aus` : ''}. ${productIndex >= 0 ? 'Die Produktseite nennt diese Konzentration ausdrücklich als Risiko.' : 'Das KID belegt die sektorbezogene Indexzusammensetzung; eine aktuelle Gewichtung einzelner Unternehmen folgt daraus nicht.'} Das ist bei der Positionsgröße zu berücksichtigen.` };
  }
  if (check.flag === 'liquidity' && check.finding !== 'risk' && kid) {
    const quote = /prevailing market price[\s\S]{0,140}?may deviate from the value of the Shares/i.exec(kid.excerpt)?.[0] ?? '';
    if (/shares on the secondary market[\s\S]{0,160}?prevailing market price/i.test(kid.excerpt)
      && validQuote(quote, kid)) return { ...check, finding: 'risk', documentIndex: kidIndex, quote,
        reason: 'Das KID belegt den Sekundärmarkthandel für Privatanleger und weist ausdrücklich darauf hin, dass der Börsenpreis vom Anteilswert abweichen kann. Aktuelle Spreads und Handelsvolumen müssen vor einer Order separat geprüft werden.' };
  }
  if (check.flag === 'structure' && check.finding === 'unknown' && kid) {
    const quote = /short-term secured lending of its investments to certain eligible third parties/i.exec(kid.excerpt)?.[0] ?? '';
    if (/financial derivative instruments/i.test(kid.excerpt) && validQuote(quote, kid))
      return { ...check, finding: 'risk', documentIndex: kidIndex, quote,
        reason: 'Das KID erlaubt besicherte Wertpapierleihe und Finanzderivate auch für Anlagezwecke. Dies begründet potenzielle Gegenparteirisiken; die tatsächliche aktuelle Nutzung dieser Möglichkeiten ist damit nicht belegt.' };
  }
  if (check.flag === 'regulatory' && check.finding === 'unknown') {
    const quote = /The Manager is authorised in Ireland and regulated by the Central Bank of Ireland/i.exec(kid?.excerpt ?? '')?.[0] ?? '';
    if (validQuote(quote, kid)) return { ...check, finding: 'no-risk', documentIndex: kidIndex, quote,
      reason: `Das KID vom ${kid.period} belegt die irische Zulassung und Aufsicht über die Verwaltungsgesellschaft der exakten Anteilsklasse. Es belegt keinen aktuellen aufsichtsrechtlichen Produktmangel; künftige regulatorische Änderungen oder nicht genannte Verfahren werden damit nicht ausgeschlossen.` };
  }
  return check;
}
function qualifyVgwdProductRisks(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (position.type !== 'ETF' || position.isin.trim().toUpperCase() !== 'IE00B8GKDB10' || check.finding !== 'unknown') return check;
  const kidIndex = documents.findIndex(document => document.period
    && /^https:\/\/fund-docs\.vanguard\.com\/ie00b8gkdb10_priipskid_en\.pdf$/i.test(document.source.url)
    && document.excerpt.includes('IE00B8GKDB10'));
  const kid = documents[kidIndex];
  if (check.flag === 'identity' && kid) {
    const quote = /Vanguard FTSE All-World High Dividend Yield UCITS ETF/i.exec(kid.excerpt)?.[0] ?? '';
    if (validQuote(quote, kid) && /\(USD\) Distributing Shares/i.test(kid.excerpt))
      return { ...check, finding: 'no-risk', documentIndex: kidIndex, quote,
        reason: `Das KID vom ${kid.period} benennt den Vanguard FTSE All-World High Dividend Yield UCITS ETF, die ausschüttende USD-Anteilsklasse und die exakte ISIN IE00B8GKDB10. Ein Identitätswiderspruch ist in diesen Primärdaten nicht erkennbar; VGWD.DE ist die EUR-Börsennotierung derselben Anteilsklasse.` };
  }
  if (check.flag === 'costs' && kid) {
    const ongoing = /0\.29% of the value of your investment p\.a\./i.exec(kid.excerpt)?.[0] ?? '';
    const transactions = /0\.04% of the value of your investment per year/i.exec(kid.excerpt)?.[0] ?? '';
    if (validQuote(ongoing, kid) && validQuote(transactions, kid)
      && /There is no performance fee for this Fund/i.test(kid.excerpt))
      return { ...check, finding: 'no-risk', documentIndex: kidIndex, quote: ongoing,
        reason: `Das KID vom ${kid.period} weist 0,29 % laufende Verwaltungs- und Betriebskosten sowie geschätzte interne Transaktionskosten von 0,04 % pro Jahr aus; eine Erfolgsgebühr fällt nicht an. Brokergebühren und Börsenspannen sind nicht enthalten.` };
  }
  if (check.flag === 'concentration') {
    const factsheetIndex = documents.findIndex(document => document.period
      && /^https:\/\/fund-docs\.vanguard\.com\/FTSE_All-World_High_Dividend_Yield_UCITS_ETF_USD_Distributing_9506_NETH_INT_EN\.pdf$/i.test(document.source.url)
      && document.excerpt.includes('IE00B8GKDB10'));
    const factsheet = documents[factsheetIndex];
    const topTen = factsheet && /Top 10 approximately equals\s+([\d.]+)% of net assets/i.exec(factsheet.excerpt);
    const holdings = factsheet && /Number of stocks\s+([\d,]+)/i.exec(factsheet.excerpt);
    const topTenPercent = topTen ? Number(topTen[1]) : NaN;
    const holdingCount = holdings ? Number(holdings[1].replace(/,/g, '')) : NaN;
    if (factsheet && topTen && holdings && validQuote(topTen[0], factsheet)
      && Number.isFinite(topTenPercent) && topTenPercent <= 20 && holdingCount >= 1000)
      return { ...check, finding: 'no-risk', documentIndex: factsheetIndex, quote: topTen[0],
        reason: `Stand ${factsheet.period}: ${holdingCount} Aktien; die zehn größten Positionen machen zusammen ${topTenPercent} % des Fondsvermögens aus. Eine starke Konzentration auf einzelne Unternehmen ist damit nicht belegt. Dividendenstil sowie Länder- und Sektorgewichte bleiben eigenständige Expositionen.` };
  }
  if (check.flag === 'structure' && kid) {
    const quote = /The Fund may engage in short\s+term secured lending of its investments/i.exec(kid.excerpt)?.[0] ?? '';
    if (validQuote(quote, kid) && /The Fund may use derivatives/i.test(kid.excerpt))
      return { ...check, finding: 'risk', documentIndex: kidIndex, quote,
        reason: 'Das KID erlaubt dem physisch anlegenden Fonds besicherte Wertpapierleihe und den Einsatz von Derivaten. Daraus können Gegenpartei- und Derivaterisiken entstehen. Eine tatsächliche aktuelle Nutzung oder ein eingetretener Verlust ist damit nicht belegt.' };
  }
  if (check.flag === 'regulatory' && kid) {
    const quote = /The Fund is authorised in Ireland and has been registered for sale in other EEA Member States/i.exec(kid.excerpt)?.[0] ?? '';
    if (validQuote(quote, kid) && /regulated by the Central Bank/i.test(kid.excerpt))
      return { ...check, finding: 'no-risk', documentIndex: kidIndex, quote,
        reason: `Das KID vom ${kid.period} belegt die Zulassung des Fonds in Irland, die Registrierung für den Vertrieb in weiteren EWR-Staaten und die Aufsicht der Central Bank of Ireland über die Verwaltungsgesellschaft. Das schließt künftige regulatorische Änderungen oder nicht genannte Verfahren nicht aus.` };
  }
  return check;
}
function qualifyCheck(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  let qualified = qualifyMunichFinancingAndContinuity(position, check, documents);
  qualified = qualifyMunichLegalRisk(position, qualified, documents);
  qualified = qualifyMondelezLegalRisk(position, qualified, documents);
  qualified = qualifyMcdRegulatoryRisk(position, qualified, documents);
  qualified = qualifyMcdContinuity(position, qualified, documents);
  qualified = qualifyNovoFinancing(position, qualified, documents);
  qualified = qualifyQdveProductRisks(position, qualified, documents);
  return qualifyVgwdProductRisks(position, qualified, documents);
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
    || check.flag !== 'regulatory' || (check.finding !== 'risk' && check.finding !== 'unknown')
    || /(?:eingetretene|verhängte|bereits gezahlte)\s+(?:wesentliche\s+)?(?:Sanktion|Strafe|Geldbuße)|actual material (?:fine|penalty|loss)/i.test(check.reason)) return check;
  const documentIndex = latestMondelezQuarterIndex(documents);
  const document = documents[documentIndex];
  if (!document || !/ultimate outcome of these legal proceedings and regulatory and governmental matters/i.test(document.excerpt)
    || !/unfavorable resolutions could involve substantial fines/i.test(document.excerpt)) return check;
  const quote = /legal proceedings and regulatory and governmental matters, individually and in the aggregate, will not materially harm our financial position, results of operations or cash flows/i.exec(document.excerpt)?.[0] ?? '';
  if (!validQuote(quote, document)) return check;
  return { ...check, finding: 'no-risk', documentIndex, quote,
    reason: `Stand ${document.period}: Laufende Gerichts- und Behördenverfahren bestehen. Das Management erwartet derzeit weder einzeln noch zusammen eine wesentliche Belastung von Finanzlage, Ergebnis oder Cashflow. Ungünstige Entscheidungen und erhebliche Sanktionen bleiben möglich.` };
}
const mcdConditionalRegulatoryReason = 'Der aktuelle 10-Q beschreibt mögliche Einschränkungen von Kapitalflüssen und höhere Finanzierungskosten. Ein konkreter eingetretener Schaden ist durch diese bedingte Risikowarnung nicht belegt; die regulatorische Exposition bleibt offen.';
const mcdContinuityOpen = 'Aktuellen 10-Q und Jahresbericht geprüft: Eine ausdrückliche unternehmensbezogene Aussage zu wesentlichen Fortführungsunsicherheiten ist in den verfügbaren Auszügen nicht belegt. Das bleibt eine offene Restunsicherheit.';
function qualifyMcdContinuity(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (position.type !== 'Stock' || position.isin.trim().toUpperCase() !== 'US5801351017'
    || check.flag !== 'going-concern' || check.finding !== 'unknown') return check;
  const quarter = documents.some(document => document.period === '2026-06-30'
    && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20260630\.htm$/i.test(document.source.url));
  const annual = documents.some(document => document.period === '2025-12-31'
    && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20251231\.htm$/i.test(document.source.url));
  if (!quarter || !annual) return check;
  if (documents.some(document => /(?:there is substantial doubt|material uncertainty exists|going.concern qualification|doubt about our ability to continue)/i.test(document.excerpt))) return check;
  if (check.reason === mcdContinuityOpen && check.documentIndex === null && !check.quote) return check;
  if (!/Kein überprüfbarer Befund mit Textstelle|(?:keine|fehlt).*(?:ausdrückliche|Beurteilung|Aussage)|(?:no|missing) (?:explicit|specific) (?:going.concern|statement)/i.test(check.reason)) return check;
  return { ...check, reason: mcdContinuityOpen, documentIndex: null, quote: '' };
}
function qualifyMcdRegulatoryRisk(position: AnalysisPosition, check: RiskCheck, documents: RiskDocument[]): RiskCheck {
  if (position.type !== 'Stock' || position.isin.trim().toUpperCase() !== 'US5801351017'
    || check.flag !== 'regulatory' || (check.finding !== 'risk' && check.finding !== 'unknown')) return check;
  const conditionalRisk = check.finding === 'risk' && /may also be impacted by regulations affecting capital flows/i.test(check.quote);
  const actualDamageClaim = /eingetretener Schaden/i.test(check.reason)
    && !/(?:kein|keinen|nicht|ohne)[^.!?]{0,65}eingetretener Schaden/i.test(check.reason)
    && !/eingetretener Schaden[^.!?]{0,65}(?:nicht belegt|nicht nachgewiesen)/i.test(check.reason);
  const conditionalUnknown = check.finding === 'unknown'
    && /(?:Kapitalfl[uü]ss|capital flows)/i.test(check.reason)
    && /(?:Exposition|möglich|potenziell|könn|may|could)/i.test(check.reason)
    && !actualDamageClaim && !/(?:konkreter Verstoß|verhängte Sanktion|material sanction|actual violation)/i.test(check.reason);
  if (!conditionalRisk && !conditionalUnknown) return check;
  const documentIndex = documents.findIndex(document => document.period === '2026-06-30'
    && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20260630\.htm$/i.test(document.source.url)
    && /Our operations may also be impacted by regulations affecting capital flows/i.test(document.excerpt)
    && /Any such events could have a material adverse effect/i.test(document.excerpt));
  if (documentIndex < 0 || !documents.some(document => document.period === '2025-12-31'
    && /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20251231\.htm$/i.test(document.source.url))) return check;
  const quote = /Our operations may also be impacted by regulations affecting capital flows, financial markets or financial institutions/i.exec(documents[documentIndex].excerpt)?.[0] ?? '';
  if (!validQuote(quote, documents[documentIndex])) return check;
  if (conditionalUnknown) {
    if (check.reason === mcdConditionalRegulatoryReason && check.documentIndex === documentIndex && check.quote === quote) return check;
    return { ...check, finding: 'unknown', documentIndex, quote, reason: mcdConditionalRegulatoryReason };
  }
  return { ...check, finding: 'no-risk', documentIndex, quote,
    reason: 'Der aktuelle 10-Q beschreibt Einschränkungen von Kapitalflüssen als mögliches künftiges Risiko mit potenziell wesentlichen Folgen. Die zitierte bedingte Aussage belegt keinen bereits eingetretenen wesentlichen regulatorischen Schaden; die Exposition bleibt bestehen.' };
}
export function riskFingerprint(position: AnalysisPosition, set: RiskDocumentSet): string {
  return createHash('sha256').update(JSON.stringify({ policy: RISK_POLICY, isin: position.isin.trim().toUpperCase(),
    type: position.type, ...(position.isin.trim().toUpperCase() === 'US5801351017' ? { mcdReviewVersion: 2 } : {}),
    ...(position.type === 'Bond' && position.isin.trim().toUpperCase() === 'US912810SQ22'
      ? { treasuryContextVersion: 1, nominalCurrency: position.bondHolding?.source === 'user-confirmed' ? position.bondHolding.currency : null } : {}),
    documents: set.documents.map(doc => [doc.source.url, doc.hash,
      isInsuranceStock(position) ? doc.excerptVersion ?? 0 : 0]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })).digest('hex');
}
function legacyMcdFingerprint(position: AnalysisPosition, set: RiskDocumentSet): string {
  return createHash('sha256').update(JSON.stringify({ policy: RISK_POLICY, isin: position.isin.trim().toUpperCase(),
    type: position.type, documents: set.documents.map(doc => [doc.source.url, doc.hash, 0])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) })).digest('hex');
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
      const fallback = qualifyCheck(position,
        { flag, finding: 'unknown', reason: 'Kein überprüfbarer Befund mit Textstelle.', documentIndex: null, quote: '' }, set.documents);
      if (fallback.finding === 'unknown') gaps.push(`${flag}: ${fallback.reason}`);
      return fallback;
    }
    const qualified = qualifyCheck(position, check, set.documents);
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
  if (!metrics.some(metric => metric.name === 'debt-maturities')) {
    const maturities = mcdDebtMaturities(position, set.documents) ?? mondelezCurrentDebt(position, set.documents)
      ?? novoCurrentBorrowings(position, set.documents);
    if (maturities) metrics.push(maturities);
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
  const reviewedMcdUncertainty = record.isin === 'US5801351017' && record.status === 'unknown'
    && materialRisks.length === 0 && record.checks.length === 5
    && record.checks.every(check => (check.finding === 'no-risk' && check.documentIndex !== null && check.quote.trim().length >= 12)
      || (check.flag === 'going-concern' && check.finding === 'unknown' && check.documentIndex === null
        && check.reason === mcdContinuityOpen)
      || (check.flag === 'regulatory' && check.finding === 'unknown' && check.documentIndex !== null
        && check.quote.trim().length >= 12 && check.reason === mcdConditionalRegulatoryReason))
    && record.gaps.some(gap => gap.startsWith('going-concern:'))
    && record.gaps.every(gap => /^(?:going-concern|regulatory):/.test(gap))
    && record.gaps.some(gap => gap.startsWith('regulatory:')) === record.checks.some(check => check.flag === 'regulatory' && check.finding === 'unknown')
    && ['net-income', 'operating-margin', 'cash', 'debt-maturities'].every(name => record.metrics.some(metric => metric.name === name))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20260630\.htm$/i.test(source.url) && /10-Q/.test(source.title))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/63908\/\d{18}\/mcd-20251231\.htm$/i.test(source.url) && /10-K/.test(source.title));
  const reviewedNovoUncertainty = ['DK0062498333', 'US6701002056'].includes(record.isin) && record.status === 'unknown'
    && materialRisks.length === 0 && record.checks.length === 5
    && record.checks.every(check => (check.finding === 'no-risk' && check.documentIndex !== null && check.quote.trim().length >= 12)
      || (check.flag === 'going-concern' && check.finding === 'unknown' && check.documentIndex === null
        && /(?:keine|fehlt).*(?:ausdrücklich|Beurteilung|Aussage)/i.test(check.reason))
      || (check.flag === 'regulatory' && check.finding === 'unknown' && check.documentIndex === null
        && /(?:Exposition|regulatorisch)/i.test(check.reason)
        && /(?:bedingte|kein.*eingetreten.*Schaden|keine.*konkrete.*Beeinträchtigung)/i.test(check.reason)))
    && record.gaps.some(gap => gap.startsWith('going-concern:'))
    && record.gaps.some(gap => gap.startsWith('regulatory:'))
    && record.gaps.every(gap => /^(?:going-concern|regulatory):/.test(gap))
    && ['net-income', 'operating-margin', 'cash', 'debt-maturities'].every(name => record.metrics.some(metric => metric.name === name))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/353278\/\d{18}\/caq[1-4]20\d{2}\.htm$/i.test(source.url) && /6-K/.test(source.title))
    && record.sources.some(source => /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/353278\/\d{18}\/nvo-20\d{6}\.htm$/i.test(source.url) && /20-F/.test(source.title));
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
    ...(reviewedMunichUncertainty || reviewedMondelezUncertainty || reviewedMcdUncertainty || reviewedNovoUncertainty ? { decisionReadiness: 'reviewed-uncertainty' as const } : {}),
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
      const oldEvidenceStillVerifiable = record.checks.every(check => check.finding === 'unknown' || check.documentIndex !== null
        && validQuote(check.quote, set.documents[check.documentIndex]))
        && record.metrics.every(metric => validQuote(metric.quote, set.documents[metric.documentIndex]));
      const canMigrate = ((isInsuranceStock(position)
        && (record.fingerprint === priorFingerprint(1) || record.fingerprint === priorFingerprint(0)))
        || (position.isin.trim().toUpperCase() === 'US5801351017' && record.fingerprint === legacyMcdFingerprint(position, set)))
        && oldEvidenceStillVerifiable;
      if (!canMigrate) return null;
      record = { ...record, fingerprint };
      this.set(record);
    }
    if (isNovoNordisk(position) && !set.gaps.length) {
      const gaps = record.gaps.filter(gap => !/^Primärdokument konnte nicht aktuell geladen werden: https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/353278\/\d{18}\/f6k_[^/]+\.htm$/i.test(gap));
      if (gaps.length !== record.gaps.length) {
        record = { ...record, gaps, status: gaps.length ? 'unknown' : 'assessed' };
        this.set(record);
      }
    }
    if (position.type === 'ETF' && position.isin.trim().toUpperCase() === 'IE00B3WJKG14' && !set.gaps.length
      && set.documents.some(document => /\/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en\.pdf\?siteEntryPassthrough=true/.test(document.source.url))) {
      const gaps = record.gaps.filter(gap => !/^Primärdokument konnte nicht aktuell geladen werden: https:\/\/www\.ishares\.com\/ch\/professionals\/en\/literature\/kiid\/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en\.pdf$/.test(gap));
      if (gaps.length !== record.gaps.length) {
        record = { ...record, gaps, status: gaps.length ? 'unknown' : 'assessed' };
        this.set(record);
      }
    }
    const qualifiedChecks = record.checks.map(check => qualifyCheck(position, check, set.documents));
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
    if (!record.metrics.some(metric => metric.name === 'debt-maturities')) {
      const maturities = mcdDebtMaturities(position, set.documents) ?? mondelezCurrentDebt(position, set.documents)
        ?? novoCurrentBorrowings(position, set.documents);
      if (maturities) {
        const gaps = record.gaps.filter(gap => !gap.startsWith('debt-maturities:'));
        record = { ...record, metrics: [...record.metrics, maturities], gaps, status: gaps.length ? 'unknown' : 'assessed' };
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
