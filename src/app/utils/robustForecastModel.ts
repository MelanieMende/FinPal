import type { AnalysisSource, AssetRecommendation, NewAssetRecommendation, PortfolioAnalysisRequest, PortfolioAnalysisResult } from './portfolioAnalysis';
import { allocationCandidateKey, type PortfolioAllocation } from './portfolioAllocation';
import { buildForecastAllocation, validReturnForecast, type ReturnForecast, type ForecastRiskModel } from './portfolioForecastOptimization';
import { validCandidateMarketQuote } from './candidateMarketQuote';
import { protectedCashEUR } from './decisionProfile';
import { allRiskCheckNames, riskCheckLabels } from './assetRiskPolicy';

export interface FundamentalRiskAssessment {
  key: string;
  status: 'assessed' | 'unknown';
  decisionReadiness?: 'reviewed-uncertainty';
  materialRisks: string[];
  rationale: string;
  sources: AnalysisSource[];
}
export interface RobustModelDetails {
  version: 2 | 3;
  decisionStatus: 'stable-scenario' | 'review-required' | 'no-trades';
  covarianceStatus: 'measured-eur' | 'unavailable';
  observations: number;
  covarianceShrinkage: number | null;
  estimates: { key: string; rawReturnPercent: number; adjustedReturnPercent: number; effectiveReturnPercent?: number; uncertaintyPercent: number; coverage: number | null }[];
  stressChecks: { name: string; utilityImprovementEUR: number }[];
  baseUtilityImprovementEUR?: number;
  reviewReasons: string[];
  scenarioTrades: { key: string; action: 'Kaufen' | 'Verkaufen'; amountEUR: number; targetPercent: number | null }[];
  concentration?: { beforeLargestPercent: number; scenarioLargestPercent: number };
  cashOnlyComparison?: {
    availableCashEUR: number;
    decisionStatus: 'stable-scenario' | 'review-required' | 'no-trades' | 'unavailable';
    feesEUR: number;
    remainingCashEUR: number;
    scenarioTrades: RobustModelDetails['scenarioTrades'];
    stressChecks: RobustModelDetails['stressChecks'];
    baseUtilityImprovementEUR?: number;
    reviewReasons: string[];
  };
}

// Model assumptions, not fitted forecast accuracy or confidence intervals. Applied to BOTH methods.
export const ROBUST_SIGNAL_WEIGHT = .25;
export const ANALYST_COVERAGE_PRIOR = 10;
const riskLabels: Record<string, string> = { ...riskCheckLabels, 'loss-making': 'Verlustlage', 'low-margin': 'schwache Marge', financing: 'Finanzierungsrisiko', 'going-concern': 'Fortführungsrisiko', regulatory: 'Regulierungsrisiko' };

/** Dates are intersected BEFORE returns, so every column covers the exact same intervals. */
export function estimateEuroCovariance(forecasts: ReturnForecast[]) {
  if (!forecasts.length || forecasts.some(f => !f.riskHistory || f.riskHistory.currency !== 'EUR')) return null;
  const series = forecasts.map(f => new Map(f.riskHistory!.closes.map(row => [row.date, row.price])));
  const dates = [...series[0].keys()].filter(date => series.every(values => values.has(date))).sort().slice(-366);
  if (dates.length < 181 || Date.now() - Date.parse(dates[dates.length - 1]) > 7 * 86400000
    || Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]) < 180 * 86400000) return null;
  const rows = dates.slice(1).map((date, i) => series.map(values => Math.log(values.get(date)! / values.get(dates[i])!)));
  if (rows.some(row => row.some(value => !Number.isFinite(value)))) return null;
  const n = rows.length, p = forecasts.length;
  const means = forecasts.map((_f, i) => rows.reduce((sum, row) => sum + row[i], 0) / n);
  const centered = rows.map(row => row.map((value, i) => value - means[i]));
  const sample = forecasts.map((_f, i) => forecasts.map((_g, j) => centered.reduce((sum, row) => sum + row[i] * row[j], 0) / (n - 1)));
  // Estimate off-diagonal sampling noise; shrink toward the sample diagonal (PSD convex combination).
  let noise = 0, energy = 0;
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) if (i !== j) {
    const averageProduct = sample[i][j] * (n - 1) / n;
    noise += centered.reduce((sum, row) => sum + (row[i] * row[j] - averageProduct) ** 2, 0) / (n * (n - 1));
    energy += sample[i][j] ** 2;
  }
  const shrinkage = energy > 0 ? Math.min(1, noise / energy) : 1;
  const annualization = n * 365.25 * 86400000 / (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0]));
  const covariance = sample.map((row, i) => row.map((value, j) => value * annualization * (i === j ? 1 : 1 - shrinkage)));
  if (covariance.some((row, i) => !(row[i] > 0))) return null;
  return { keys: forecasts.map(f => f.key), covariance, observations: n, shrinkage };
}

export function conservativeForecast(f: ReturnForecast, current: number) {
  const evidence = f.uncertainty;
  const raw = evidence?.method === 'historical-bootstrap' && f.scenarioReturns
    ? (f.referencePrice * (1 + f.scenarioReturns.median / 100) / current - 1) : f.targetPrice / current - 1;
  const count = evidence?.method === 'analyst-consensus' ? evidence.analystCount : undefined;
  const years = evidence?.method === 'historical-bootstrap' ? evidence.historyYears : undefined;
  const coverage = count ?? years ?? null;
  // Analyst count is a coverage proxy, NOT a count of statistically independent opinions.
  const coverageWeight = count ? count / (count + ANALYST_COVERAGE_PRIOR) : evidence?.method === 'historical-bootstrap' ? 1 : .5;
  const weight = ROBUST_SIGNAL_WEIGHT * coverageWeight;
  const dispersion = evidence?.method === 'analyst-consensus' && evidence.targetLowPrice && evidence.targetHighPrice
    ? (evidence.targetHighPrice - evidence.targetLowPrice) / (2 * current)
    : evidence?.method === 'historical-bootstrap' && f.scenarioReturns ? (f.scenarioReturns.p90 - f.scenarioReturns.p10) / 200 : null;
  const sigma = f.annualVolatilityPercent / 100;
  const uncertainty = weight * Math.max(dispersion ?? sigma, sigma / Math.sqrt(Math.max(1, coverage ?? 1)));
  const adjusted = raw * weight;
  // Uncertainty reduces confidence in the signal without becoming a second,
  // linear hurdle that every portfolio change must clear.
  const confidence = Math.abs(adjusted) / (Math.abs(adjusted) + uncertainty || 1);
  return { key: f.key, rawReturnPercent: raw * 100, adjustedReturnPercent: adjusted * 100,
    effectiveReturnPercent: adjusted * confidence * 100,
    uncertaintyPercent: uncertainty * 100, coverage, complete: !!evidence && coverage !== null && dispersion !== null };
}

/** Fundamentals are explicit, cited decision gates. They are never turned into invented numeric premiums. */
export function readFundamentalRisks(value: unknown, sources: AnalysisSource[]): FundamentalRiskAssessment[] {
  if (!Array.isArray(value) || value.length > 105) return [];
  const flags: string[] = allRiskCheckNames;
  const read = value.filter(v => v && typeof v.key === 'string' && v.key.length < 500 && ['assessed', 'unknown'].includes(v.status)
    && typeof v.rationale === 'string' && v.rationale.length > 0 && v.rationale.length <= 3000
    && Array.isArray(v.materialRisks) && v.materialRisks.length <= 8 && v.materialRisks.every((flag: unknown) => typeof flag === 'string' && flags.includes(flag))
    && Array.isArray(v.sourceIndexes) && v.sourceIndexes.length <= 30 && v.sourceIndexes.every((i: unknown) => Number.isInteger(i) && Number(i) >= 0 && Number(i) < sources.length)
    && (v.status === 'unknown' || v.sourceIndexes.length > 0));
  return read.filter(v => read.filter(other => other.key === v.key).length === 1).map(v => ({ key: v.key, status: v.status,
    ...(v.decisionReadiness === 'reviewed-uncertainty' && v.sourceIndexes.length > 0 && v.materialRisks.length === 0
      ? { decisionReadiness: 'reviewed-uncertainty' as const } : {}),
    materialRisks: v.materialRisks, rationale: v.rationale, sources: v.sourceIndexes.map((i: number) => sources[i]) }));
}

export function buildRobustForecastAllocation(request: PortfolioAnalysisRequest, forecasts: ReturnForecast[] = [], candidates: NewAssetRecommendation[] = [],
  previous?: PortfolioAnalysisResult, decisions?: AssetRecommendation[], reviewedUnavailableKeys: string[] = [], fundamentals: FundamentalRiskAssessment[] = [],
  variant: 'full' | 'cash-only' = 'full'): PortfolioAllocation {
  const supplied = new Map<string, ReturnForecast>();
  if (request.targetAssetId !== undefined) for (const f of previous?.allocationPlan?.optimization?.forecasts ?? []) if (validReturnForecast(f)) supplied.set(f.key, f);
  for (const f of forecasts) if (validReturnForecast(f)) supplied.set(f.key, f);
  const allowedKeys = new Set([...request.positions.map(p => String(p.id)), ...candidates.map(allocationCandidateKey),
    ...(request.targetAssetId === undefined ? [] : previous?.newAssetRecommendations?.map(allocationCandidateKey) ?? [])]);
  for (const key of supplied.keys()) if (!allowedKeys.has(key)) supplied.delete(key);
  // Research review must not prevent an independently sourced ETF scenario from being calculated.
  const modelCandidates = candidates.map(candidate => candidate.type === 'ETF'
    && supplied.get(allocationCandidateKey(candidate))?.model?.kind === 'etf-history-v1'
    && supplied.get(allocationCandidateKey(candidate))?.currency === 'EUR'
    && validCandidateMarketQuote(candidate.marketQuote, candidate.isin.trim().toUpperCase())
    ? { ...candidate, action: 'Kaufen' as const } : candidate);
  const currentCandidateQuote = (f: ReturnForecast) => {
    const candidate = candidates.find(item => allocationCandidateKey(item) === f.key);
    return f.model?.kind === 'etf-history-v1' && f.currency === 'EUR' && candidate
      && validCandidateMarketQuote(candidate.marketQuote, candidate.isin.trim().toUpperCase()) ? candidate.marketQuote : null;
  };
  const estimates = [...supplied.values()].flatMap(f => {
    const position = request.positions.find(p => String(p.id) === f.key);
    const price = position?.quote?.originalPrice ?? position?.price ?? currentCandidateQuote(f)?.price ?? f.referencePrice;
    if (position && ((position.quote?.originalCurrency ?? position.currency) !== f.currency || price <= 0
      || position.quote?.tradedInPercent || position.quote?.unitFactor && position.quote.unitFactor !== 1)) return [];
    return [conservativeForecast(f, price)];
  });
  const adjusted = [...supplied.values()].map((f): ReturnForecast => {
    const estimate = estimates.find(e => e.key === f.key);
    const quote = currentCandidateQuote(f);
    return !estimate ? f : { ...f, uncertainty: undefined, model: undefined, targetPrice: (request.positions.find(p => String(p.id) === f.key)?.quote?.originalPrice
      ?? request.positions.find(p => String(p.id) === f.key)?.price ?? quote?.price ?? f.referencePrice) * (1 + estimate.effectiveReturnPercent! / 100),
      referencePrice: quote?.price ?? f.referencePrice, referencePriceAsOf: quote?.quoteAsOf ?? f.referencePriceAsOf };
  });
  const measured = estimateEuroCovariance([...supplied.values()]);
  const riskModel: ForecastRiskModel | undefined = measured ? { keys: measured.keys, covariance: measured.covariance,
    uncertainty: measured.keys.map(key => (estimates.find(e => e.key === key)?.uncertaintyPercent ?? 0) / 100) } : undefined;
  // All previous forecasts are already in adjusted; do not merge unadjusted old views back into the calculation.
  const context = previous ? { ...previous, allocationPlan: previous.allocationPlan && { ...previous.allocationPlan,
    optimization: previous.allocationPlan.optimization && { ...previous.allocationPlan.optimization, forecasts: adjusted } } } : undefined;
  const plan = buildForecastAllocation(request, adjusted, modelCandidates, context, undefined, reviewedUnavailableKeys, riskModel, variant === 'cash-only');
  const details: RobustModelDetails = { version: 3, decisionStatus: 'no-trades', covarianceStatus: measured ? 'measured-eur' : 'unavailable',
    observations: measured?.observations ?? 0, covarianceShrinkage: measured?.shrinkage ?? null, estimates, stressChecks: [], reviewReasons: [], scenarioTrades: [] };
  plan.optimization!.robust = details;
  if (variant === 'full' && request.targetAssetId === undefined) {
    const cashPlan = buildRobustForecastAllocation(request, forecasts, candidates, previous, undefined, reviewedUnavailableKeys, fundamentals, 'cash-only');
    const cashDetails = cashPlan.optimization!.robust!;
    details.cashOnlyComparison = {
      availableCashEUR: Math.max(0, Math.round((request.profile.buyBudget - protectedCashEUR(request.profile)) * 100) / 100),
      decisionStatus: cashPlan.status === 'blocked' ? 'unavailable' : cashDetails.decisionStatus,
      feesEUR: cashDetails.scenarioTrades.length ? cashDetails.scenarioTrades.reduce((sum, trade) => sum + (cashPlan.positions.find(p => p.key === trade.key)?.feeEUR ?? 0), 0) : 0,
      remainingCashEUR: cashDetails.scenarioTrades.length
        ? Math.max(0, Math.round((request.profile.buyBudget - cashDetails.scenarioTrades.reduce((sum, trade) => sum + trade.amountEUR, 0)
          - cashDetails.scenarioTrades.reduce((sum, trade) => sum + (cashPlan.positions.find(p => p.key === trade.key)?.feeEUR ?? 0), 0)) * 100) / 100)
        : request.profile.buyBudget,
      scenarioTrades: cashDetails.scenarioTrades,
      stressChecks: cashDetails.stressChecks,
      baseUtilityImprovementEUR: cashDetails.baseUtilityImprovementEUR,
      reviewReasons: cashPlan.status === 'blocked' ? cashPlan.warnings.slice(-1) : cashDetails.reviewReasons,
    };
  }
  // Keep published/raw targets in the report; adjusted estimates are displayed separately.
  plan.optimization!.forecasts = [...supplied.values()].filter(f => plan.positions.some(p => p.key === f.key));
  if (!measured) {
    plan.optimization!.expectedReturnPercent = null; plan.optimization!.expectedGainEUR = null; plan.optimization!.riskProxyPercent = null;
  }
  plan.assumptions = plan.assumptions.filter(text => !text.includes('gemeinsame Korrelation +1'));
  plan.assumptions = plan.assumptions.map(text => text.startsWith('12-Monats-Ziel:')
    ? '12-Monats-Ziel: konfidenzgewichtetes Renditesignal minus λ/2 × EUR-Portfoliovarianz. Bestätigte strategische Zielbandbreiten sind harte Grenzen. Keine automatische Fortschreibung auf die langfristige Anlagedauer.'
    : text.startsWith('Kursziele müssen')
      ? 'Kursziele müssen zur Originalwährung und Preiseinheit passen. Für das Renditesignal werden konstante Wechselkurse unterstellt; gemessene EUR-Kovarianzen enthalten historische FX-Bewegungen. Zukünftige Wechselkurse werden nicht prognostiziert. Zieltermine: 330–400 Tage, keine Extrapolation anderer Horizonte.'
      : text);
  plan.assumptions.push('Robustes Modell v3: Aktien- und Bootstrap-Signale erhalten denselben Grundfaktor 0,25. Analystenabdeckung gewichtet zusätzlich mit n/(n+10). Dies sind konservative, nicht empirisch kalibrierte Modellannahmen; keine Trefferwahrscheinlichkeiten.');
  plan.assumptions.push('Unsicherheit gewichtet das bereits geschrumpfte Signal graduell mit |Signal|/(|Signal| + Unsicherheitsproxy). Sie wird nicht nochmals als lineare Handelsstrafe abgezogen. Die vollständige Unsicherheit bleibt in den Stressprüfungen erhalten. Analystenspannen und Bootstrap-Bänder sind unterschiedliche Szenariodaten, keine vergleichbaren Konfidenzintervalle.');
  if ([...supplied.values()].some(f => f.model?.kind === 'etf-history-v1')) {
    plan.assumptions.push('ETF-Historienmodelle verwenden bereinigte Kurse als historischen Renditeproxy mit Ausschüttungs-/Splitbereinigung. Keine veröffentlichte Kursprognose und keine kalibrierten Zukunftswahrscheinlichkeiten; historische Renditen werden einmal zu 75 % gegen null geschrumpft. Künftige Ausschüttungen nicht zusätzlich addieren. Neue ETFs werden anhand ihres belegten EUR-Börsenkurses mit Beständen, Liquidität, Gebühren und Risiken gemeinsam modelliert; auch ein Nullbetrag ist ein berechnetes Ergebnis.');
    plan.assumptions = plan.assumptions.map(text => text.startsWith('Cashrendite =')
      ? 'Cashrendite = 0 als Vergleichsannahme. ETF-Modelle enthalten historische Ausschüttungsbereinigung als Renditeproxy, keine separate künftige Ausschüttungsprognose. Andere Dividenden, Zinsen, Steuern und Spreads fehlen; kein vollständiges Total-Return-Optimum.' : text);
    plan.warnings = plan.warnings.map(text => text.startsWith('Steuern, Spreads, Ausschüttungen')
      ? 'Steuern, Spreads, separate künftige Ausschüttungen und unbekannte externe Vermögenswerte sind nicht im Optimierungsziel enthalten. Historische ETF-Ausschüttungsbereinigung ist ein Renditeproxy.' : text);
  }
  plan.assumptions.push(measured ? `Kovarianz aus ${measured.observations} gemeinsamen EUR-Renditeintervallen; datengestützte Schrumpfung der Nebendiagonalen (${(measured.shrinkage * 100).toFixed(1)} %). Keine fest angenommene Korrelation.`
    : 'Gemeinsame EUR-Kurshistorie fehlt: keine belastbare Kovarianz und keine bestätigte Umschichtung; eine Zahlenrechnung bleibt ausschließlich ein Szenario.');
  if (plan.status !== 'calculated') return plan;
  const trades = plan.positions.filter(p => p.amountEUR !== null && (p.action === 'Kaufen' || p.action === 'Verkaufen'));
  details.concentration = { beforeLargestPercent: Math.max(0, ...plan.positions.map(p => p.currentWeightPercent ?? 0)),
    scenarioLargestPercent: Math.max(0, ...plan.positions.map(p => p.projectedWeightPercent ?? 0)) };
  details.scenarioTrades = trades.map(p => ({ key: p.key, action: p.action as 'Kaufen' | 'Verkaufen', amountEUR: p.amountEUR!, targetPercent: p.targetWeight?.percent ?? null }));
  if (!trades.length) return plan;
  if (decisions) for (const candidate of candidates.filter(item => item.action === 'Prüfen')) {
    if (trades.some(trade => trade.key === allocationCandidateKey(candidate) && trade.action === 'Kaufen')) {
      details.reviewReasons.push(`${candidate.name}: Die Analyse stellt den modellierten Kauf zurück; die abhängige Umschichtung bleibt zur Prüfung offen.`);
    }
  }
  if (!measured) details.reviewReasons.push('Gemeinsame aktuelle EUR-Kurshistorien für gemessene Kovarianzen fehlen.');
  for (const trade of trades) {
    if (!estimates.find(e => e.key === trade.key)?.complete) details.reviewReasons.push(`${trade.name}: Prognoseabdeckung oder Prognosespanne ist nicht ausreichend belegt.`);
    if (trade.action === 'Kaufen') {
      const assessment = fundamentals.find(f => f.key === trade.key);
      if (!assessment) details.reviewReasons.push(`${trade.name}: In dieser Analyse fehlt eine belegte Prüfung wesentlicher Unternehmens- beziehungsweise Produktrisiken. Vorhandene Suchlinks allein sind keine inhaltliche Prüfung.`);
      else if (assessment.status !== 'assessed' && assessment.decisionReadiness !== 'reviewed-uncertainty') details.reviewReasons.push(`${trade.name}: Die Risikoprüfung ist noch nicht abgeschlossen. ${assessment.materialRisks.length ? `Bereits belegte Risiken: ${assessment.materialRisks.map(risk => riskLabels[risk] ?? risk).join(', ')}. ` : ''}${assessment.rationale}`);
      else if (assessment.materialRisks.length) details.reviewReasons.push(`${trade.name}: Belegte wesentliche Risiken (${assessment.materialRisks.map(risk => riskLabels[risk] ?? risk).join(', ')}): ${assessment.rationale}`);
    }
  }
  for (const trade of trades.filter(item => item.action === 'Kaufen')) {
    const assessment = fundamentals.find(item => item.key === trade.key);
    if (assessment?.decisionReadiness === 'reviewed-uncertainty' && !assessment.materialRisks.length)
      plan.warnings.push(`${trade.name}: Primärberichte geprüft; verbleibende Unsicherheit ist in der Risikokachel dokumentiert.`);
  }
  if (plan.projectedCashEUR <= .01) details.reviewReasons.push('Die Umschichtung lässt keinen finanziellen Puffer für unbekannte Spreads oder Verkaufssteuern.');
  if (measured) {
    const total = plan.totalValueEUR;
    const before = measured.keys.map(key => (plan.positions.find(p => p.key === key)?.currentValueEUR ?? 0) / total);
    const after = measured.keys.map(key => {
      const p = plan.positions.find(p => p.key === key);
      return ((p?.currentValueEUR ?? 0) + (p?.action === 'Kaufen' ? 1 : p?.action === 'Verkaufen' ? -1 : 0) * (p?.amountEUR ?? 0)) / total;
    });
    const mu = measured.keys.map(key => (estimates.find(e => e.key === key)?.effectiveReturnPercent ?? 0) / 100);
    const u = riskModel!.uncertainty;
    const lambda = plan.optimization!.riskAversion;
    const utility = (weights: number[], returns: number[], covariance: number[][], riskAversion: number) => weights.reduce((sum, weight, i) => sum + weight * returns[i]
      - riskAversion / 2 * weight * covariance[i].reduce((s, value, j) => s + value * weights[j], 0), 0);
    const positiveCorrelation = measured.covariance.map((row, i) => row.map((_value, j) => Math.sqrt(measured.covariance[i][i] * measured.covariance[j][j])));
    details.baseUtilityImprovementEUR = total * (utility(after, mu, measured.covariance, lambda)
      - utility(before, mu, measured.covariance, lambda)) - plan.feesEUR;
    if (details.baseUtilityImprovementEUR <= 0)
      details.reviewReasons.push('Die Umschichtung verbessert den Modellnutzen im Basisszenario nach Gebühren nicht gegenüber dem unveränderten Bestand.');
    const scenarios = [
      { name: 'Schwächere Prognosen', returns: mu.map((value, i) => value - Math.sign(after[i] - before[i]) * u[i]), matrix: measured.covariance, lambda },
      { name: 'Doppelte Risikoaversion', returns: mu, matrix: measured.covariance, lambda: lambda * 2 },
      { name: 'Viertel der Prognoserendite', returns: mu.map(value => value * .25), matrix: measured.covariance, lambda },
      { name: 'Gleichlauf-Stress (+1)', returns: mu, matrix: positiveCorrelation, lambda },
    ];
    for (const trade of trades.filter(p => p.action === 'Kaufen')) scenarios.push({ name: `Kursziel verfehlt: ${trade.name}`,
      returns: mu.map((value, i) => measured.keys[i] === trade.key ? Math.min(0, value) : value), matrix: measured.covariance, lambda });
    details.stressChecks = scenarios.map(s => ({ name: s.name, utilityImprovementEUR: total * (utility(after, s.returns, s.matrix, s.lambda) - utility(before, s.returns, s.matrix, s.lambda)) - plan.feesEUR }));
    for (const check of details.stressChecks.filter(s => s.utilityImprovementEUR <= 0)) {
      const amount = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(check.utilityImprovementEUR);
      plan.warnings.push(`Stresshinweis: Im Szenario „${check.name}“ beträgt der relative Modellnutzen gegenüber dem unveränderten Bestand nach Gebühren ${amount} EUR. Das ist eine risikogewichtete Modellgröße, kein prognostizierter Geldverlust.`);
    }
  }
  details.decisionStatus = details.reviewReasons.length ? 'review-required' : 'stable-scenario';
  details.reviewReasons = [...new Set(details.reviewReasons)].slice(0, 180);
  if (details.reviewReasons.length) {
    plan.warnings.push(...details.reviewReasons);
    for (const trade of trades) {
      trade.action = 'Prüfen'; trade.amountEUR = null; trade.targetValueEUR = trade.currentValueEUR;
      trade.projectedWeightPercent = trade.currentWeightPercent;
      trade.reason = 'Modellszenario, Entscheidung offen: ' + details.reviewReasons.filter(reason => reason.startsWith(trade.name + ':') || !plan.positions.some(p => reason.startsWith(p.name + ':'))).slice(0, 4).join(' ') + ' Abhängige Käufe und Verkäufe werden gemeinsam zurückgestellt; die vollständigen Gründe stehen in der Entscheidungsprüfung.';
    }
    plan.feesEUR = 0; plan.projectedCashEUR = request.profile.buyBudget;
    plan.cashTargetPercent = 100 * request.profile.buyBudget / plan.totalValueEUR;
    plan.optimization!.expectedReturnPercent = null; plan.optimization!.expectedGainEUR = null; plan.optimization!.riskProxyPercent = null;
  } else if (decisions) {
    const accepted = buildForecastAllocation(request, adjusted, modelCandidates, context, decisions, reviewedUnavailableKeys, riskModel, variant === 'cash-only');
    accepted.optimization!.forecasts = plan.optimization!.forecasts;
    accepted.optimization!.robust = { ...details, decisionStatus: accepted.positions.some(p => p.amountEUR !== null) ? 'stable-scenario' : 'no-trades' };
    accepted.assumptions = plan.assumptions;
    accepted.warnings = [...new Set([...accepted.warnings,
      ...plan.warnings.filter(warning => warning.startsWith('Stresshinweis:')
        || warning.includes('verbleibende Unsicherheit ist in der Risikokachel'))])];
    return accepted;
  }
  return plan;
}

export const robustAnalysisInstructions = ' Verwende das robuste Modell v3. Rohkursziele sind keine erwarteten sicheren Renditen. Liefere fundamentalRisks je Asset beziehungsweise neuem Kandidaten: key, status assessed oder unknown, materialRisks aus den für den Asset-Typ passenden Prüffeldern und nullbasierte sourceIndexes sowie rationale. Die fünf Unternehmensmerkmale loss-making, low-margin, financing, going-concern und regulatory gelten nur für Aktien; Fonds, ETFs, Anleihen und andere Produkte verwenden ihre eigene Prüfliste. assessed benötigt Belege; fehlende Angaben unknown lassen. Auch bei status unknown bereits belegte Risiken in materialRisks nennen und in rationale präzise die verbleibenden ungeprüften Merkmale angeben. Fehlende inhaltliche Auswertung vorhandener Primärquellen ist nicht gleichbedeutend mit öffentlich fehlenden Unternehmensdaten. low-margin nur bei belegtem erheblichem Margenproblem markieren, keine freie Zahlenschätzung. Belegte Verluste, Finanzierungsprobleme oder sonstige wesentliche Risiken dürfen nicht durch ein hohes Kursziel überstimmt werden. optimization.robust.decisionStatus review-required bedeutet Modellszenario mit offener Entscheidung: keine Kauf-/Verkaufsempfehlung und keinen plannedAmountEUR ausgeben. Abhängige Verkäufe dürfen einen zurückgestellten Kauf nicht finanzieren. Auch ein stable-scenario ist keine Ausführungsfreigabe; qualifizierte Gegenargumente, Steuern, Spread, Horizontabweichung und Konzentration können Halten/Prüfen rechtfertigen. Nenne Rohsignal, bereinigtes Signal und Unsicherheitsproxy getrennt. Wenn die größte Einzelposition im Szenario steigt, darf der Wechsel nicht pauschal als Konzentrationsabbau bezeichnet werden. Bestätige eine Modellaktion niemals allein, um einem berechneten Betrag zu entsprechen. Erkläre den Prüfstatus anhand der konkreten reviewReasons: Ein nicht positiver Basisvergleich nach Gebühren erfordert Prüfung. Einzelne nicht positive Stressvergleiche sind Warnhinweise und allein kein Sperrgrund. Negative Modellnutzenwerte sind keine prognostizierten Geldverluste und keine Veränderung gegenüber dem Basisszenario. Die größte Positionsquote allein löst keinen automatischen Prüfstatus aus; es gibt keine feste Konzentrationssperrgrenze. Trenne zusätzliche Konzentrationshinweise von den tatsächlichen Auslösern. Keine festen Kategoriequoten einführen.';
