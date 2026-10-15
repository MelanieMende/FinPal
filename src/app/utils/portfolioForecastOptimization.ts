import type { AnalysisSource, AssetRecommendation, NewAssetRecommendation, PortfolioAnalysisRequest, PortfolioAnalysisResult } from './portfolioAnalysis';
import { allocationCandidateKey, buildPortfolioAllocation, type PortfolioAllocation } from './portfolioAllocation';
import { isEltif } from './eltifValuation';

export interface ReturnForecast {
  key: string;
  publisher: string;
  publishedAt: string;
  targetDate: string;
  horizonMonths: 12;
  targetPrice: number;
  currency: string;
  referencePrice: number;
  referencePriceAsOf: string;
  annualVolatilityPercent: number;
  volatilityAsOf: string;
  volatilityLookbackDays: number;
  dataStatus?: 'live' | 'fresh-cache' | 'stale-fallback';
  dataAgeHours?: number;
  scenarioReturns?: { p10: number; median: number; p90: number };
  model?: { kind: 'etf-history-v1'; observations: number; historyYears: number; tradingDaysPerYear: 252; blockLength: 20; paths: 2000; returnBasis: 'adjusted-close' };
  uncertainty?: { method: 'analyst-consensus' | 'historical-bootstrap'; analystCount?: number; targetLowPrice?: number; targetHighPrice?: number; historyYears?: number };
  riskHistory?: { currency: 'EUR'; closes: { date: string; price: number }[]; sources: AnalysisSource[] };
  assumptions: string;
  forecastSources: AnalysisSource[];
  volatilitySources: AnalysisSource[];
}
export interface ForecastOptimizationDetails {
  asOf: string;
  horizonMonths: 12;
  status: 'missing-inputs' | 'converged' | 'not-converged';
  riskAversion: number;
  iterations: number;
  forecasts: ReturnForecast[];
  inputs: { key: string; expectedReturnPercent: number; annualVolatilityPercent: number }[];
  expectedReturnPercent: number | null;
  riskProxyPercent: number | null;
  expectedGainEUR: number | null;
  modeledValuePercent?: number;
  unresolvedKeys?: string[];
  reviewedUnavailableKeys?: string[];
  robust?: import('./robustForecastModel').RobustModelDetails;
}

export interface ForecastRiskModel { keys: string[]; covariance: number[][]; uncertainty: number[]; }

const day = 86400000;
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const validSources = (v: unknown): v is AnalysisSource[] => Array.isArray(v) && v.length > 0 && v.length <= 30 && v.every(s => {
  if (!s || typeof s.title !== 'string' || typeof s.url !== 'string') return false;
  try { const u = new URL(s.url); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
});
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) ? Date.parse(v) : NaN;

export function validReturnForecast(v: ReturnForecast, now = Date.now()): boolean {
  if (!v || typeof v !== 'object') return false;
  const published = date(v.publishedAt), target = date(v.targetDate), volatility = date(v.volatilityAsOf);
  return typeof v.key === 'string' && v.key.length > 0 && v.key.length < 500
    && typeof v.publisher === 'string' && v.publisher.trim().length > 0 && v.publisher.length < 1000
    && v.horizonMonths === 12 && positive(v.targetPrice) && v.targetPrice <= 1e12 && positive(v.referencePrice) && v.referencePrice <= 1e12
    && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency)
    && positive(v.annualVolatilityPercent) && v.annualVolatilityPercent <= 500
    && (v.dataStatus === undefined || ['live', 'fresh-cache', 'stale-fallback'].includes(v.dataStatus))
    && (v.dataAgeHours === undefined || Number.isFinite(v.dataAgeHours) && v.dataAgeHours >= 0 && v.dataAgeHours <= 24 * 90)
    && (v.scenarioReturns === undefined || [v.scenarioReturns.p10, v.scenarioReturns.median, v.scenarioReturns.p90].every(Number.isFinite)
      && v.scenarioReturns.p10 <= v.scenarioReturns.median && v.scenarioReturns.median <= v.scenarioReturns.p90
      && v.scenarioReturns.p10 > -100 && v.scenarioReturns.p90 <= 100000)
    && (v.uncertainty === undefined || !!v.uncertainty && ['analyst-consensus', 'historical-bootstrap'].includes(v.uncertainty.method)
      && (v.uncertainty.analystCount === undefined || Number.isInteger(v.uncertainty.analystCount) && v.uncertainty.analystCount > 0 && v.uncertainty.analystCount <= 10000)
      && (v.uncertainty.historyYears === undefined || positive(v.uncertainty.historyYears) && v.uncertainty.historyYears <= 100)
      && (v.uncertainty.targetLowPrice === undefined || positive(v.uncertainty.targetLowPrice) && v.uncertainty.targetLowPrice <= v.targetPrice)
      && (v.uncertainty.targetHighPrice === undefined || positive(v.uncertainty.targetHighPrice) && v.uncertainty.targetHighPrice >= v.targetPrice))
    && (v.model === undefined || !!v.model && v.model.kind === 'etf-history-v1'
      && Number.isInteger(v.model.observations) && v.model.observations >= 1261 && v.model.observations <= 4000
      && Number.isFinite(v.model.historyYears) && v.model.historyYears >= 5 && v.model.historyYears <= 15
      && v.model.tradingDaysPerYear === 252 && v.model.blockLength === 20 && v.model.paths === 2000
      && v.model.returnBasis === 'adjusted-close' && v.uncertainty?.method === 'historical-bootstrap'
      && v.uncertainty.historyYears === v.model.historyYears && !!v.scenarioReturns)
    && (v.riskHistory === undefined || !!v.riskHistory && v.riskHistory.currency === 'EUR' && validSources(v.riskHistory.sources)
      && Array.isArray(v.riskHistory.closes) && v.riskHistory.closes.length >= 181 && v.riskHistory.closes.length <= 2000
      && v.riskHistory.closes.every((row, i, rows) => row && positive(row.price) && Number.isFinite(date(row.date))
        && date(row.date) <= now && (!i || row.date > rows[i - 1].date)))
    && Number.isInteger(v.volatilityLookbackDays) && v.volatilityLookbackDays >= 180 && v.volatilityLookbackDays <= 3650
    && [published, volatility].every(t => Number.isFinite(t) && t <= now && now - t <= 90 * day)
    && Number.isFinite(target) && target - now >= 330 * day && target - now <= 400 * day
    && Number.isFinite(date(v.referencePriceAsOf)) && date(v.referencePriceAsOf) <= now
    && typeof v.assumptions === 'string' && v.assumptions.trim().length > 0 && v.assumptions.length < 5000
    && validSources(v.forecastSources) && validSources(v.volatilitySources);
}

export function validForecastOptimizationDetails(v: ForecastOptimizationDetails): boolean {
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  return !!v && Number.isFinite(date(v.asOf)) && v.horizonMonths === 12
    && ['missing-inputs', 'converged', 'not-converged'].includes(v.status)
    && finite(v.riskAversion) && v.riskAversion > 0 && Number.isInteger(v.iterations) && v.iterations >= 0 && v.iterations <= 10000
    && Array.isArray(v.forecasts) && v.forecasts.length <= 105 && v.forecasts.every(f => validReturnForecast(f, date(v.asOf)))
    && new Set(v.forecasts.map(f => f.key)).size === v.forecasts.length
    && Array.isArray(v.inputs) && v.inputs.length <= 105 && v.inputs.every(i => i && typeof i.key === 'string'
      && finite(i.expectedReturnPercent) && finite(i.annualVolatilityPercent) && i.annualVolatilityPercent > 0)
    && (v.modeledValuePercent === undefined || finite(v.modeledValuePercent) && v.modeledValuePercent >= 0 && v.modeledValuePercent <= 100 + 1e-8)
    && (v.unresolvedKeys === undefined || Array.isArray(v.unresolvedKeys) && v.unresolvedKeys.length <= 105
      && v.unresolvedKeys.every(key => typeof key === 'string' && key.length > 0))
    && (v.reviewedUnavailableKeys === undefined || Array.isArray(v.reviewedUnavailableKeys) && v.reviewedUnavailableKeys.length <= 105
      && v.reviewedUnavailableKeys.every(key => typeof key === 'string' && v.unresolvedKeys?.includes(key)))
    && (v.robust === undefined || !!v.robust && v.robust.version === 2 && ['stable-scenario', 'review-required', 'no-trades'].includes(v.robust.decisionStatus)
      && ['measured-eur', 'unavailable'].includes(v.robust.covarianceStatus) && Number.isInteger(v.robust.observations) && v.robust.observations >= 0 && v.robust.observations <= 2000
      && (v.robust.covarianceShrinkage === null || finite(v.robust.covarianceShrinkage) && v.robust.covarianceShrinkage >= 0 && v.robust.covarianceShrinkage <= 1)
      && Array.isArray(v.robust.estimates) && v.robust.estimates.length <= 105 && v.robust.estimates.every(e => e && typeof e.key === 'string'
        && [e.rawReturnPercent, e.adjustedReturnPercent, e.uncertaintyPercent].every(finite) && e.uncertaintyPercent >= 0 && (e.coverage === null || finite(e.coverage) && e.coverage > 0))
      && Array.isArray(v.robust.stressChecks) && v.robust.stressChecks.length <= 110 && v.robust.stressChecks.every(s => s && typeof s.name === 'string' && finite(s.utilityImprovementEUR))
      && Array.isArray(v.robust.reviewReasons) && v.robust.reviewReasons.length <= 200 && v.robust.reviewReasons.every(s => typeof s === 'string' && s.length < 5000)
      && Array.isArray(v.robust.scenarioTrades) && v.robust.scenarioTrades.length <= 105 && v.robust.scenarioTrades.every(t => t && typeof t.key === 'string'
        && ['Kaufen', 'Verkaufen'].includes(t.action) && finite(t.amountEUR) && t.amountEUR > 0 && (t.targetPercent === null || finite(t.targetPercent) && t.targetPercent >= 0 && t.targetPercent <= 100.000001))
      && (v.robust.concentration === undefined || !!v.robust.concentration && [v.robust.concentration.beforeLargestPercent, v.robust.concentration.scenarioLargestPercent].every(n => finite(n) && n >= 0 && n <= 100.000001)))
    && [v.expectedReturnPercent, v.riskProxyPercent, v.expectedGainEUR].every(n => n === null || finite(n));
}

/** Resolve only provider citations, never model-supplied URLs. Invalid or stale inputs stay unavailable. */
export function readReturnForecasts(value: unknown, sources: AnalysisSource[]): ReturnForecast[] {
  if (!Array.isArray(value) || value.length > 105) return [];
  const resolve = (indices: unknown): AnalysisSource[] => Array.isArray(indices) && indices.length <= 30
    && indices.every(i => Number.isInteger(i) && i >= 0 && i < sources.length) ? indices.map(i => sources[i]) : [];
  const forecasts = value.map(v => v && typeof v === 'object' ? { ...v,
    riskHistory: undefined, uncertainty: undefined, model: undefined, // Numerical model evidence comes only from the local provider.
    forecastSources: resolve(v.forecastSourceIndexes), volatilitySources: resolve(v.volatilitySourceIndexes),
  } : null).filter(v => validReturnForecast(v));
  const counts = new Map<string, number>();
  for (const v of forecasts) counts.set(v.key, (counts.get(v.key) ?? 0) + 1);
  return forecasts.filter(v => counts.get(v.key) === 1);
}

export function forecastInputSchema(sourceCount: number) {
  const indexes = { type: 'array', minItems: 1, maxItems: 30, items: { type: 'integer', minimum: 0, maximum: sourceCount - 1 } };
  return { type: 'array', maxItems: 105, items: { type: 'object', additionalProperties: false, properties: {
    key: { type: 'string' }, publisher: { type: 'string' }, publishedAt: { type: 'string' }, targetDate: { type: 'string' },
    horizonMonths: { type: 'integer', enum: [12] }, targetPrice: { type: 'number', exclusiveMinimum: 0 },
    currency: { type: 'string' }, referencePrice: { type: 'number', exclusiveMinimum: 0 }, referencePriceAsOf: { type: 'string' },
    annualVolatilityPercent: { type: 'number', exclusiveMinimum: 0, maximum: 500 }, volatilityAsOf: { type: 'string' },
    volatilityLookbackDays: { type: 'integer', minimum: 180, maximum: 3650 }, assumptions: { type: 'string' },
    forecastSourceIndexes: indexes, volatilitySourceIndexes: indexes,
  }, required: ['key', 'publisher', 'publishedAt', 'targetDate', 'horizonMonths', 'targetPrice', 'currency', 'referencePrice',
    'referencePriceAsOf', 'annualVolatilityPercent', 'volatilityAsOf', 'volatilityLookbackDays', 'assumptions', 'forecastSourceIndexes', 'volatilitySourceIndexes'] } };
}

export const forecastResearchInstructions = ' Für eine mathematische 12-Monats-Optimierung suche pro Asset veröffentlichte erwartete Kursziele (nicht bloß Bull-Case oder historische Höchstkurse), mit Urheber, Veröffentlichungsdatum, explizitem Zieltermin, Kurswährung und Preiseinheit. Zusätzlich eine belegte annualisierte historische Volatilität mit Datenstichtag und mindestens 180 Tagen Beobachtungsfenster suchen. Keine erwarteten Renditen, Risikozahlen, Wahrscheinlichkeiten oder Korrelationen erfinden. Fehlen veröffentlichte numerische Erwartungen oder Risikodaten, explizit fehlend lassen. Unterschiedliche Horizonte nicht interpolieren oder extrapolieren. Prognosen sind keine sicheren Preise. Für neue Kandidaten aktuellen Referenzkurs mit Währung und Kursdatum belegen.';
export const forecastAnalysisInstructions = ' Die lokale Berechnung verwendet jetzt 12-Monats-Erwartungen und Risiko, keine festen Kategorie-Zielgewichte. marketForecasts sind von FinPal bereits validierte Eingaben: bei Aktien aus strukturiertem Analystenkonsens und historischen Tageskursen, bei Kryptowährungen aus einer transparenten lokalen Bootstrap-Modellprognose mit starker Schrumpfung gegen 0 %. Übernimm sie unverändert, kennzeichne die unterschiedliche Methodik und erfinde keine Ersatzwerte. Liefere zusätzliche optimizationInputs nur aus der Recherche: key ist die gehaltene Asset-ID als String, für neue Kandidaten new: plus ISIN (sonst Ticker, sonst Name), getrimmt und großgeschrieben. publishedAt/targetDate sowie Volatilitätsstichtag und Beobachtungsfenster müssen belegt sein. targetPrice muss ein veröffentlichtes erwartetes 12-Monats-Kursziel in derselben Währung und Preiseinheit wie der aktuelle Originalkurs sein; keine Umrechnung ohne Daten, keine optimistischen Szenarioziele als Erwartungswert. annualVolatilityPercent ist belegte annualisierte historische Volatilität in Prozent, keine eigene Risikoeinstufung. forecastSourceIndexes/volatilitySourceIndexes verweisen auf die jeweiligen Belege. Fehlt eine benötigte Zahl, dieses Asset in optimizationInputs weglassen und die konkrete Lücke erklären. Die Zahlen werden aus Quellen extrahiert, nicht von dir geschätzt. Prognose- und Risikodaten werden lokal geprüft. Positionen ohne vollständige Eingaben werden unverändert eingefroren und erhalten keinen Handelsbetrag; vollständig belegte Positionen dürfen gemeinsam als strenges Teilportfolio optimiert werden. Ohne mindestens eine vollständig belegte Position bleibt der gesamte Plan blockiert. Quellen und Eingaben bei correction beibehalten; eine fehlende Grundlage niemals passend zur gewünschten Aktion erfinden. correction.allocationPlan enthält die anschließend lokal optimierten Gewichte/Beträge, an die Aktionen und Begründungen anzupassen sind. Halten/Prüfen darf einen Trade nur wegen konkret belegter Markt-, Steuer-, Kosten- oder Handelshindernisse zurückstellen, nicht weil die erste Antwort noch keinen Plan hatte.';

/** Euclidean projection onto personal bounds and the available investment budget. */
function project(v: number[], lower: number[], upper: number[], budget: number, center?: number[], penalty?: number[]): number[] {
  const at = (shift: number) => v.map((n, i) => {
    const delta = n - shift - (center?.[i] ?? 0);
    const soft = Math.sign(delta) * Math.max(0, Math.abs(delta) - (penalty?.[i] ?? 0));
    return Math.max(lower[i], Math.min(upper[i], (center?.[i] ?? 0) + soft));
  });
  const first = at(0);
  if (first.reduce((s, n) => s + n, 0) <= budget) return first;
  let lo = 0, hi = Math.max(1, ...v.map((n, i) => n - lower[i] + (penalty?.[i] ?? 0)));
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (at(mid).reduce((s, n) => s + n, 0) > budget) lo = mid; else hi = mid;
  }
  return at(hi);
}

export function buildForecastAllocation(request: PortfolioAnalysisRequest, forecasts: ReturnForecast[] = [], candidates: NewAssetRecommendation[] = [],
  previous?: PortfolioAnalysisResult, decisions?: AssetRecommendation[], reviewedUnavailableKeys: string[] = [], riskModel?: ForecastRiskModel): PortfolioAllocation {
  const plan = calculateForecastAllocation(request, forecasts, candidates, previous, decisions, riskModel);
  const reviewed = new Set([...previous?.allocationPlan?.optimization?.reviewedUnavailableKeys ?? [], ...reviewedUnavailableKeys]);
  const optimization = plan.optimization!;
  const onlyMissingForecasts = plan.status === 'blocked' && plan.warnings.some(w => w.startsWith('Für die ausgewählte Optimierung'));
  optimization.reviewedUnavailableKeys = (optimization.unresolvedKeys ?? []).filter(key => (plan.status !== 'blocked' || onlyMissingForecasts) && reviewed.has(key)
    && !optimization.forecasts.some(f => f.key === key)
    && plan.positions.some(p => p.key === key && p.currentValueEUR !== null));
  for (const position of plan.positions) {
    if (!optimization.reviewedUnavailableKeys.includes(position.key)) continue;
    // Actual valuation, fee, constraint and numerical failures remain blocking.
    if (plan.status === 'blocked' && !onlyMissingForecasts) continue;
    position.action = 'Halten'; position.amountEUR = null;
    position.reason = 'Geprüft: Nach gezielter Nachrecherche sind keine vollständigen belegten 12-Monats-Prognose- und Volatilitätsdaten verfügbar. Die qualitative Analyse wird fortgesetzt; für diese Position wird kein optimierter Handelsbetrag berechnet.';
    plan.warnings = plan.warnings.filter(w => !w.startsWith(position.name + ': Mindestens eine erforderliche Optimierungseingabe fehlt.'));
  }
  return plan;
}

function calculateForecastAllocation(request: PortfolioAnalysisRequest, forecasts: ReturnForecast[] = [], candidates: NewAssetRecommendation[] = [],
  previous?: PortfolioAnalysisResult, decisions?: AssetRecommendation[], riskModel?: ForecastRiskModel): PortfolioAllocation {
  const base = buildPortfolioAllocation(request, candidates, previous);
  const level = request.profile.goal === 'preservation' || request.profile.horizonYears < 5 ? 'low' : request.profile.risk;
  const lambda = { low: 10, medium: 5, high: 2 }[level];
  const info: ForecastOptimizationDetails = { asOf: new Date(Date.now()).toISOString(), horizonMonths: 12, status: 'missing-inputs', riskAversion: lambda,
    iterations: 0, forecasts: [], inputs: [], expectedReturnPercent: null, riskProxyPercent: null, expectedGainEUR: null };
  const plan: PortfolioAllocation = { ...base, method: 'forecast-mean-variance-v1', optimization: info,
    assumptions: [
      '12-Monats-Ziel: erwartete Preisrendite minus λ/2 × Risikoproxy². Keine automatische Fortschreibung auf die langfristige Anlagedauer.',
      `Risikoaversion λ = ${lambda}; Profilannahme, keine aus Marktdaten geschätzte Kennzahl.`,
      'Risiko: veröffentlichte annualisierte historische Volatilitäten oder lokal aus belegten adjustierten Tageskursen berechnete Volatilität; gemeinsame Korrelation +1 als konservative Modellannahme. Keine empirische Korrelationsmatrix und kein berechneter Diversifikationsvorteil.',
      'Cashrendite = 0 als vorsichtige Vergleichsannahme. Dividenden, Zinsen, Steuern und Spreads fehlen in der Preisrendite; kein Total-Return-Optimum.',
      'Kursziele müssen zum Originalkurs passen. Für die EUR-Bewertung werden konstante Wechselkurse unterstellt; künftige FX-Renditen und FX-Volatilität sind nicht modelliert. Zieltermine müssen 330–400 Tage in der Zukunft liegen; keine Extrapolation anderer Horizonte.',
      'Long-only, ohne Kredit und Leerverkäufe. Keine festen Kategoriequoten, Positionsobergrenzen oder Mindest-Cashquote. Bestätigte persönliche Bandbreiten bleiben verbindlich; Cash ergibt sich aus der Optimierung und den verfügbaren Mitteln nach Gebühren.',
      'Numerische kontinuierliche Optimierung mit konservativer Reserve aller möglichen Ordergebühren. Tatsächliche EUR-Beträge werden danach mit Gebühren und Cent-Rundung berechnet; kein garantiert globales Optimum für diskrete Orders.',
      'ELTIFs und Cash Equivalents werden ohne bestätigte kurzfristige Handelbarkeit nicht umgeschichtet. Positionen mit fehlenden vollständigen Prognose- oder Risikodaten werden in einer Teilportfolio-Optimierung unverändert eingefroren; ohne mindestens eine vollständig belegte Position bleibt die Optimierung blockiert.',
    ], warnings: ['Veröffentlichte Kursziele und historische Volatilität können falsch oder überholt sein. Das Ergebnis ist nur unter den angegebenen Annahmen optimal.'] };
  const block = (reason: string): PortfolioAllocation => {
    plan.status = 'blocked'; plan.warnings.push(reason); plan.feesEUR = 0; plan.projectedCashEUR = request.profile.buyBudget;
    info.expectedReturnPercent = null; info.expectedGainEUR = null; info.riskProxyPercent = null;
    plan.cashTargetPercent = 0;
    for (const p of plan.positions) {
      p.action = 'Prüfen'; p.amountEUR = null; p.targetWeight = null; p.targetValueEUR = null; p.projectedWeightPercent = p.currentWeightPercent;
      p.source = 'forecast-optimization'; p.reason = reason;
    }
    return plan;
  };
  if (base.status === 'blocked') return block(base.warnings[0]);
  const included = (request.targetAssetId === undefined ? candidates : previous?.newAssetRecommendations ?? []).filter(p => p.action === 'Kaufen');
  const inputs = [...request.positions, ...included];
  const merged = new Map<string, ReturnForecast>();
  if (request.targetAssetId !== undefined) for (const f of previous?.allocationPlan?.optimization?.forecasts ?? []) {
    if (validReturnForecast(f)) merged.set(f.key, f);
  }
  for (const f of forecasts) if (validReturnForecast(f)) merged.set(f.key, f);
  info.forecasts = [...merged.values()].filter(f => base.positions.some(p => p.key === f.key));
  for (const f of info.forecasts.filter(item => item.dataStatus === 'stale-fallback')) {
    const name = base.positions.find(position => position.key === f.key)?.name ?? f.key;
    plan.warnings.push(`${name}: Der Forecast-Anbieter war nicht erreichbar oder lieferte unvollständige Daten. Verwendet wird der letzte gültige Cache (${(f.dataAgeHours ?? 0).toFixed(1)} Stunden alt).`);
  }
  const mu: number[] = [], sigma: number[] = [], unresolvedReasons: Array<string | null> = [];
  const unresolved = (index: number, reason: string) => {
    unresolvedReasons[index] = reason;
    mu[index] = 0; sigma[index] = 0;
    plan.warnings.push(`${base.positions[index].name}: ${reason} Die Position bleibt unverändert und ist nicht Teil der berechneten Umschichtung.`);
  };
  for (const [i, p] of base.positions.entries()) {
    const f = merged.get(p.key), asset = inputs[i];
    if (!f) {
      unresolved(i, asset.type === 'Bond'
        ? 'Eine belegte 12-Monats-Gesamtrendite einschließlich Kupon fehlt; ein reines Kursziel würde nicht ausreichen.'
        : 'Mindestens eine erforderliche Optimierungseingabe fehlt. Benötigt werden sowohl eine veröffentlichte 12-Monats-Erwartung als auch eine belegte annualisierte historische Volatilität.');
      continue;
    }
    const held = i < request.positions.length ? request.positions[i] : null;
    const current = held ? held.quote?.originalPrice ?? held.price : f.referencePrice;
    const currency = held ? held.quote?.originalCurrency ?? held.currency : f.currency;
    const asOf = held ? held.quote?.quoteAsOf ?? request.priceUpdatedAt : f.referencePriceAsOf;
    if (!positive(current) || currency !== f.currency || !asOf || !Number.isFinite(Date.parse(asOf))
      || Date.parse(asOf) > Date.now() || Date.now() - Date.parse(asOf) > 7 * day || held?.quote?.tradedInPercent
      || held?.quote?.unitFactor && held.quote.unitFactor !== 1) {
      unresolved(i, 'Ein vergleichbarer aktueller Kurs mit Währung, Preiseinheit und Kurszeitpunkt fehlt; aus dem unpassenden Kursziel wird keine Rendite abgeleitet.');
      continue;
    }
    if (asset.type === 'Bond') {
      unresolved(i, 'Die vorhandene Prognose enthält keine belegte 12-Monats-Gesamtrendite einschließlich Kupon.');
      continue;
    }
    if (!Number.isFinite(f.targetPrice / current - 1) || f.targetPrice / current > 1001) {
      unresolved(i, 'Kursziel und Preiseinheit ergeben keine numerisch belastbare Kursrendite.');
      continue;
    }
    unresolvedReasons[i] = null;
    mu[i] = f.targetPrice / current - 1; sigma[i] = f.annualVolatilityPercent / 100;
    info.inputs.push({ key: p.key, expectedReturnPercent: mu[i] * 100, annualVolatilityPercent: f.annualVolatilityPercent });
  }
  info.unresolvedKeys = base.positions.filter((_position, index) => !!unresolvedReasons[index]).map(position => position.key);
  if (!info.inputs.length || request.targetAssetId !== undefined
    && unresolvedReasons[base.positions.findIndex(position => position.assetId === request.targetAssetId)]) {
    return block('Für die ausgewählte Optimierung ist keine Position mit vollständig belegter und vergleichbarer 12-Monats-Erwartung und Volatilität verfügbar.');
  }
  if (info.unresolvedKeys.length) plan.assumptions.push('Strenge Teilportfolio-Optimierung: Positionen ohne vollständige und vergleichbare Eingaben werden zu ihrem aktuellen Wert eingefroren. Für sie werden weder Rendite noch Risiko geschätzt und keine Umschichtung berechnet.');
  const total = base.totalValueEUR;
  const current = base.positions.map(p => p.currentValueEUR! / total);
  const frozen = inputs.map((p, i) => isEltif(p) || p.type === 'CashEquivalent'
    || !!unresolvedReasons[i]
    || request.targetAssetId !== undefined && base.positions[i].assetId !== request.targetAssetId);
  const feeReserve = base.positions.reduce((sum, p, i) => sum + (!frozen[i]
    || request.targetAssetId !== undefined && p.amountEUR !== null ? p.feeEUR ?? 0 : 0), 0) / total;
  if (base.positions.some((p, i) => !frozen[i] && p.feeEUR === null)) return block('Ordergebühren fehlen; eine kostenbereinigte Optimierung ist nicht möglich.');
  if (feeReserve >= 1) return block('Die Gebührenreserve würde den gesamten Portfoliowert aufzehren.');
  const net = 1 - feeReserve;
  const targets = base.positions.map(p => request.investorContext?.assets.find(f => f.assetId === p.assetId && f.confirmedAt)?.targetWeight ?? null);
  const lower = targets.map((t, i) => frozen[i] ? request.targetAssetId !== undefined && base.positions[i].assetId !== request.targetAssetId
    ? (base.positions[i].currentValueEUR! + (base.positions[i].action === 'Kaufen' ? 1 : base.positions[i].action === 'Verkaufen' ? -1 : 0) * (base.positions[i].amountEUR ?? 0)) / total
    : current[i] : (t?.minPercent ?? 0) / 100 * net);
  const upper = inputs.map((_p, i) => frozen[i] ? lower[i] : (targets[i]?.maxPercent ?? 100) / 100 * net);
  const fixedMinimum = lower.reduce((s, n) => s + n, 0);
  if (fixedMinimum > net + 1e-10) return block('Bestätigte Mindestgewichte oder bestehende Einzelanalyse-Szenarien sind mit der Gebührenreserve nicht finanzierbar.');
  const budget = net;
  const covariance = base.positions.map((p, i) => base.positions.map((q, j) => riskModel
    ? riskModel.covariance[riskModel.keys.indexOf(p.key)]?.[riskModel.keys.indexOf(q.key)] ?? 0 : sigma[i] * sigma[j]));
  const uncertainty = base.positions.map(p => riskModel?.uncertainty[riskModel.keys.indexOf(p.key)] ?? 0);
  const gradientRisk = (x: number[]) => covariance.map(row => row.reduce((sum, n, i) => sum + n * x[i], 0));
  const variance = (x: number[]) => { const product = gradientRisk(x); return Math.max(0, x.reduce((sum, n, i) => sum + n * product[i], 0)); };
  const risk = (x: number[]) => Math.sqrt(variance(x));
  const utility = (x: number[], fees: number) => x.reduce((sum, n, i) => sum + n * mu[i] - uncertainty[i] * Math.abs(n - current[i]), 0) - fees / total - lambda / 2 * variance(x);
  let x = project(current, lower, upper, budget);
  const step = 1 / Math.max(1e-8, lambda * Math.max(...covariance.map(row => row.reduce((sum, value) => sum + Math.abs(value), 0))));
  for (let iteration = 0; iteration < 10000; iteration++) {
    const r = gradientRisk(x);
    const next = project(x.map((n, i) => n + step * (mu[i] - lambda * r[i])), lower, upper, budget, current, uncertainty.map(value => step * value));
    info.iterations = iteration + 1;
    const change = Math.max(0, ...x.map((n, i) => Math.abs(n - next[i])));
    x = next;
    if (change < 1e-10) { info.status = 'converged'; break; }
  }
  if (info.status !== 'converged') { info.status = 'not-converged'; return block('Der numerische Optimierer hat keine ausreichende Konvergenz erreicht; kein optimierter Handelsbetrag.'); }
  const optimizedTargets = new Map(base.positions.map((p, i) => [p.key, {
    percent: x[i] / net * 100, minPercent: x[i] / net * 100, maxPercent: x[i] / net * 100,
  }]));
  const executionDecisions = request.positions.map((p, i) => unresolvedReasons[i]
    ? { assetId: p.id, action: 'Prüfen' as const, rationale: '', risk: '', sourceIndexes: [] }
    : frozen[i] && request.targetAssetId === undefined
    ? { assetId: p.id, action: 'Halten' as const, rationale: '', risk: '', sourceIndexes: [] }
    : decisions?.find(r => r.assetId === p.id)).filter((p): p is AssetRecommendation => !!p);
  const executed = buildPortfolioAllocation(request, candidates, previous, executionDecisions, optimizedTargets);
  const after = executed.positions.map(p => (p.currentValueEUR! + (p.action === 'Kaufen' ? 1 : p.action === 'Verkaufen' ? -1 : 0) * (p.amountEUR ?? 0)) / total);
  const improvement = utility(after, executed.feesEUR) - utility(current, 0);
  // Fixed fees and the execution engine's minimum trade sizes can erase the continuous gain.
  if (improvement <= 1e-9 && targets.every(t => !t) && request.targetAssetId === undefined) {
    executed.feesEUR = 0; executed.projectedCashEUR = request.profile.buyBudget;
    executed.positions.forEach(p => { p.action = 'Halten'; p.amountEUR = null; p.projectedWeightPercent = p.currentWeightPercent; });
    after.splice(0, after.length, ...current);
  }
  info.expectedReturnPercent = (after.reduce((s, n, i) => s + n * mu[i], 0) - executed.feesEUR / total) * 100;
  info.riskProxyPercent = risk(after) * 100;
  info.expectedGainEUR = total * info.expectedReturnPercent / 100;
  if (info.unresolvedKeys.length) info.modeledValuePercent = after.reduce((sum, weight, index) => sum + (unresolvedReasons[index] ? 0 : weight), 0) * 100;
  executed.positions.forEach((p, i) => {
    p.source = targets[i] ? 'user-confirmed' : 'forecast-optimization';
    if (unresolvedReasons[i]) {
      p.source = 'forecast-optimization';
      p.action = 'Prüfen'; p.amountEUR = null; p.targetValueEUR = p.currentValueEUR;
      p.projectedWeightPercent = p.targetWeight?.percent ?? p.currentWeightPercent;
      p.reason = `${unresolvedReasons[i]} Position in der Teilportfolio-Optimierung unverändert eingefroren.`;
      return;
    }
    if (targets[i]) p.targetWeight = { percent: p.targetWeight!.percent, minPercent: targets[i]!.minPercent, maxPercent: targets[i]!.maxPercent };
    p.reason = p.amountEUR ? 'Aus numerisch optimiertem 12-Monats-Zielgewicht und aktuellem Marktwert; gemeinsame Liquidität und Ordergebühren berücksichtigt.'
      : p.action === 'Prüfen' ? p.reason : frozen[i] ? 'Bestehende Position oder Einzelanalyse-Szenario bleibt unverändert.'
      : decisions?.some(r => r.assetId === p.assetId && !['Kaufen', 'Verkaufen'].includes(r.action)) ? 'Die Analyse stellt die optimierte Umschichtung begründet zurück.'
      : 'Keine Verbesserung nach Ordergebühren beziehungsweise unterhalb der wirtschaftlichen Mindestgröße.';
  });
  const tolerance = 1 / Math.max(1, total - executed.feesEUR); // one cent expressed in percentage points
  if (executed.positions.some((p, i) => targets[i] && p.projectedWeightPercent !== null
    && (p.projectedWeightPercent < targets[i]!.minPercent - tolerance || p.projectedWeightPercent > targets[i]!.maxPercent + tolerance))) {
    return block('Die bestätigten Bandbreiten sind nach Gebühren, Mindestbeträgen und Rundung nicht erreichbar. Keine umsetzbare optimierte Umschichtung.');
  }
  return { ...executed, method: plan.method, optimization: info, assumptions: plan.assumptions,
    warnings: [...plan.warnings, 'Steuern, Spreads, Ausschüttungen und unbekannte externe Vermögenswerte sind nicht im Optimierungsziel enthalten.'],
  };
}
