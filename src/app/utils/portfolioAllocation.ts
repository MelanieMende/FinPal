import type { AssetRecommendation, NewAssetRecommendation, PortfolioAnalysisRequest } from './portfolioAnalysis';
import { isEltif } from './eltifValuation';
import { validForecastOptimizationDetails } from './portfolioForecastOptimization';

type Bucket = 'funds' | 'stocks' | 'bonds' | 'crypto' | 'alternatives';
type Target = { percent: number; minPercent: number; maxPercent: number };
export interface AllocationPosition {
  key: string;
  assetId?: number;
  name: string;
  source: 'user-confirmed' | 'profile-model' | 'cash-holding' | 'forecast-optimization';
  currentValueEUR: number | null;
  currentWeightPercent: number | null;
  targetWeight: Target | null;
  targetValueEUR: number | null;
  action: 'Kaufen' | 'Verkaufen' | 'Halten' | 'Prüfen';
  amountEUR: number | null;
  projectedWeightPercent: number | null;
  feeEUR: number | null;
  reason: string;
}
export interface PortfolioAllocation {
  version: 1;
  status: 'calculated' | 'blocked';
  method: 'profile-buckets-v1' | 'forecast-mean-variance-v1';
  optimization?: import('./portfolioForecastOptimization').ForecastOptimizationDetails;
  totalValueEUR: number;
  cashTargetPercent: number;
  projectedCashEUR: number;
  feesEUR: number;
  assumptions: string[];
  warnings: string[];
  positions: AllocationPosition[];
  targetAssetId?: number;
}

const cents = (n: number) => Math.round(n * 100);
export const allocationCandidateKey = (p: Pick<NewAssetRecommendation, 'isin' | 'symbol' | 'name'>) =>
  'new:' + (p.isin.trim() || p.symbol.trim() || p.name.trim()).toUpperCase();
const bucketOf = (p: { type: Asset['type']; name: string; isin: string }): Bucket | null => {
  if (p.type === 'CashEquivalent') return null;
  if (p.type === 'Crypto') return 'crypto';
  if (p.type === 'Bond') return 'bonds';
  if (p.type === 'Stock') return 'stocks';
  if (p.type === 'ETF' || p.type === 'Fund' && !isEltif(p)) return 'funds';
  return 'alternatives';
};

// Policy assumptions, not estimated returns, volatilities or correlations.
function policy(request: PortfolioAnalysisRequest) {
  const { risk, goal, horizonYears: years } = request.profile;
  const level = years < 5 || goal === 'preservation' ? 'low' : risk;
  const weights: Record<Bucket, number> = years < 3
    ? { funds: 5, stocks: 0, bonds: 15, crypto: 0, alternatives: 0 }
    : level === 'low' ? { funds: 30, stocks: 5, bonds: 45, crypto: 0, alternatives: 0 }
    : level === 'medium' ? { funds: 45, stocks: 15, bonds: 25, crypto: 5, alternatives: 5 }
    : { funds: 50, stocks: 25, bonds: 10, crypto: 10, alternatives: 5 };
  if (goal === 'income') { weights.bonds += weights.crypto; weights.crypto = 0; }
  return { weights, stockCap: level === 'high' ? 15 : level === 'medium' ? 10 : 5 };
}

/** A reproducible allocation policy over known holdings plus sourced new buy ideas.
 * Missing categories remain cash; they are never redistributed to e.g. a sole crypto holding.
 * Targets refer to known positions + Total Liquidity. No future prices or tax savings enter it.
 */
export function buildPortfolioAllocation(request: PortfolioAnalysisRequest, candidates: NewAssetRecommendation[] = [],
  locked?: { recommendations: AssetRecommendation[]; newAssetRecommendations?: NewAssetRecommendation[] },
  decisions?: AssetRecommendation[], optimizedTargets?: Map<string, Target>): PortfolioAllocation {
  const { weights, stockCap } = policy(request);
  const warnings: string[] = [];
  const policyCash = 100 - Object.values(weights).reduce((sum, n) => sum + n, 0);
  const values = request.positions.map(p => p.currency === 'EUR' && p.price !== null
    && Number.isFinite(p.price * p.shares) && p.price > 0 ? cents(p.price * p.shares) : null);
  const total = values.reduce<number>((sum, n) => sum + (n ?? 0), cents(request.profile.buyBudget));
  const positions: AllocationPosition[] = request.positions.map((p, index): AllocationPosition => {
    const facts = request.investorContext?.assets.find(f => f.assetId === p.id);
    const confirmed = optimizedTargets?.get(String(p.id)) ?? (facts?.confirmedAt ? facts.targetWeight : null);
    const fee = request.investorContext ? facts?.custody.orderFeeEUR ?? null : 1;
    const value = values[index];
    const weight = value !== null && total > 0 ? value / total * 100 : null;
    const cash = p.type === 'CashEquivalent';
    return { key: String(p.id), assetId: p.id, name: p.name,
      source: confirmed ? 'user-confirmed' : cash ? 'cash-holding' : 'profile-model',
      currentValueEUR: value === null ? null : value / 100, currentWeightPercent: weight,
      targetWeight: confirmed ? { ...confirmed } : cash && weight !== null
        ? { percent: weight, minPercent: weight, maxPercent: weight } : null,
      targetValueEUR: null, action: 'Halten', amountEUR: null, projectedWeightPercent: weight,
      feeEUR: fee, reason: cash && !confirmed ? 'Cash Equivalent bleibt ohne eigene Zielvorgabe bestehen.' : '',
    };
  });
  const included = (request.targetAssetId === undefined ? candidates : locked?.newAssetRecommendations ?? []).filter(p => p.action === 'Kaufen');
  const lockedTrades = new Map<string, AssetRecommendation | NewAssetRecommendation>();
  if (request.targetAssetId !== undefined && locked) {
    for (const rec of locked.recommendations) if (rec.assetId !== request.targetAssetId) lockedTrades.set(String(rec.assetId), rec);
    for (const rec of included) lockedTrades.set(allocationCandidateKey(rec), rec);
  }
  for (const candidate of included) positions.push({ key: allocationCandidateKey(candidate), name: candidate.name,
    source: 'profile-model', currentValueEUR: 0, currentWeightPercent: 0, targetWeight: optimizedTargets?.get(allocationCandidateKey(candidate)) ?? null,
    targetValueEUR: null, action: 'Halten', amountEUR: null, projectedWeightPercent: 0,
    feeEUR: request.investorContext ? request.investorContext.defaultCustody.orderFeeEUR : 1, reason: '',
  });
  const inputs = [...request.positions, ...included];
  const fixed = positions.reduce((sum, p) => sum + (p.targetWeight?.percent ?? 0), 0);
  const assumptions = [
    'Bezugsgröße: erfasste EUR-Positionen plus Total Liquidity; externes Vermögen und eine gesonderte Notfallreserve sind nicht erfasst.',
    'Profilmodell, keine Renditeprognose: Modellannahmen statt geschätzter Volatilitäten, Korrelationen oder optimaler zukünftiger Rendite.',
    'Unter 3 Jahren: überwiegend Cash. Unter 5 Jahren oder bei Kapitalerhalt: defensives Modell. Sonst gilt das gewählte Risikoprofil. Bei Einkommensziel geht das Krypto-Modellbudget an Anleihen; eine Ausschüttung einzelner Produkte ist damit nicht bestätigt.',
    `Modellbudgets: Fonds/ETFs ${weights.funds} %, Einzelaktien ${weights.stocks} %, Anleihen ${weights.bonds} %, Krypto ${weights.crypto} %, alternative Anlagen einschließlich ELTIF ${weights.alternatives} %, Cash mindestens ${policyCash} %.`,
    `Innerhalb einer Kategorie gleiche Zielanteile; Einzelaktien höchstens ${stockCap} % je Position. Fehlende Kategorien und ungenutzte Anteile verbleiben als Cash.`,
    'Eigene bestätigte Zielgewichte und Bandbreiten haben Vorrang. Automatische Ziele erhalten eine Bandbreite von ±20 % des Ziels, mindestens ±1 Prozentpunkt; bei Ziel 0 gilt 0.',
    'Trades nur außerhalb der Bandbreite bis zum Ziel; mindestens 1 EUR und höchstens 1 % bekannte Ordergebühr. Käufe werden bei Geldmangel proportional gekürzt. Gebühren verringern den Bewertungsnenner.',
    'Geld wird zuerst aus vorhandenem Cash oberhalb des Ziel-Cashs eingesetzt. Verkäufe sind Bruttobeträge; abhängige Käufe erst nach handelbarem Verkauf und Gutschrift. Spread und persönliche Steuern sind nicht berechnet.',
  ];
  const invalidLocked = [...lockedTrades].some(([key, rec]) => {
    if (rec.action !== 'Kaufen' && rec.action !== 'Verkaufen') return false;
    const position = positions.find(p => p.key === key);
    const value = position?.currentValueEUR;
    return !(typeof rec.plannedAmountEUR === 'number' && Number.isFinite(rec.plannedAmountEUR) && rec.plannedAmountEUR > 0)
      || position?.feeEUR == null
      || rec.action === 'Verkaufen' && (value == null || cents(rec.plannedAmountEUR) > cents(value));
  });
  const blocked = values.some(v => v === null) || total <= 0 || fixed > 100 + 1e-8 || invalidLocked;
  if (blocked) {
    warnings.push(invalidLocked ? 'Bestehende Empfehlungen enthalten ungeklärte oder nicht mehr gedeckte Beträge. Bitte eine neue Gesamtanalyse erstellen.'
      : fixed > 100 + 1e-8 ? 'Bestätigte Zielgewichte einschließlich bestehender Cash Equivalents überschreiten 100 %. Bitte Ziele prüfen.'
      : 'Für vollständige Zielgewichte und Beträge fehlen gültige EUR-Bewertungen. Keine Berechnung auf Basis einer Teilsumme.');
    for (const p of positions) {
      p.action = 'Prüfen'; p.reason = warnings[0]; p.projectedWeightPercent = null;
      if (values.some(v => v === null) || total <= 0) {
        p.currentWeightPercent = null;
        if (p.source === 'cash-holding') p.targetWeight = null;
      }
    }
    return { version: 1, status: 'blocked', method: 'profile-buckets-v1', targetAssetId: request.targetAssetId, totalValueEUR: total / 100,
      cashTargetPercent: 0, projectedCashEUR: request.profile.buyBudget, feesEUR: 0, assumptions, warnings, positions };
  }
  const desired = positions.map(() => 0);
  for (const bucket of Object.keys(weights) as Bucket[]) {
    const indices = inputs.map((p, i) => bucketOf(p) === bucket ? i : -1).filter(i => i >= 0);
    const automatic = indices.filter(i => !positions[i].targetWeight);
    const confirmed = indices.reduce((sum, i) => sum + (positions[i].targetWeight?.percent ?? 0), 0);
    const each = automatic.length ? Math.max(0, weights[bucket] - confirmed) / automatic.length : 0;
    for (const i of automatic) desired[i] = bucket === 'stocks' ? Math.min(stockCap, each) : each;
  }
  const requested = desired.reduce((sum, n) => sum + n, 0);
  // Explicit targets can consume the model reserve, but are never silently normalized.
  const available = Math.max(0, 100 - fixed - Math.min(policyCash, 100 - fixed));
  const scale = requested > available && requested > 0 ? available / requested : 1;
  if (scale < 1) warnings.push('Automatische Zielgewichte wurden reduziert, damit bestätigte eigene Ziele und die Cashreserve gemeinsam passen.');
  if (fixed > 100 - policyCash) warnings.push('Eigene Zielvorgaben lassen weniger Cash als die Modellreserve zu; eigene Vorgaben haben Vorrang.');
  positions.forEach((p, i) => {
    if (!p.targetWeight) {
      const percent = desired[i] * scale;
      const band = percent > 0 ? Math.max(1, percent * 0.2) : 0;
      p.targetWeight = { percent, minPercent: Math.max(0, percent - band), maxPercent: Math.min(100, percent + band) };
    }
  });
  const cashTargetPercent = Math.max(0, 100 - positions.reduce((sum, p) => sum + p.targetWeight!.percent, 0));
  if (inputs.some(p => p.type === 'ETF' || p.type === 'Fund')) warnings.push('Fonds-/ETF-Expositionen, Überschneidungen, Hebel und individuelle Risikobeiträge sind nicht durchgerechnet; Kategorien sind Modellannahmen.');
  if (inputs.some(isEltif)) warnings.push('ELTIF-Verkäufe und davon abhängige Käufe sind durch Rückgabefristen, Handelbarkeit und NAV eingeschränkt.');
  warnings.push('Persönliche Steuern und aktuelle Spreads können Beträge und Finanzierbarkeit verändern; kein ausführbares Orderangebot.');

  // Band membership is tested once against the current portfolio, avoiding churn from fees.
  const modelDirections = positions.map(p => lockedTrades.has(p.key)
    ? lockedTrades.get(p.key)!.action === 'Kaufen' ? 1 : lockedTrades.get(p.key)!.action === 'Verkaufen' ? -1 : 0
    : request.targetAssetId !== undefined && p.assetId !== request.targetAssetId ? 0
    : p.source === 'cash-holding' ? 0
    : p.currentWeightPercent! > p.targetWeight!.maxPercent + 1e-8 ? -1
    : p.currentWeightPercent! < p.targetWeight!.minPercent - 1e-8 ? 1 : 0);
  const directions = modelDirections.map((direction, i) => {
    const decision = decisions?.find(rec => rec.assetId === positions[i].assetId);
    return !lockedTrades.has(positions[i].key) && decision && !['Kaufen', 'Verkaufen'].includes(decision.action) ? 0 : direction;
  });
  const minimum = (p: AllocationPosition) => Math.max(100, cents(p.feeEUR ?? 0) * 100);
  const active = positions.map((p, i) => directions[i] !== 0 && p.feeEUR !== null);
  let amounts = positions.map(() => 0);
  // Removing trades below the cost threshold can only shrink the active set.
  for (let pass = 0; pass <= positions.length; pass++) {
    const fees = positions.reduce((sum, p, i) => sum + (active[i] ? cents(p.feeEUR!) : 0), 0);
    const netTotal = Math.max(0, total - fees);
    amounts = positions.map((p, i) => active[i] ? lockedTrades.has(p.key) ? cents(lockedTrades.get(p.key)!.plannedAmountEUR!)
      : Math.max(0, Math.round(directions[i] * (netTotal * p.targetWeight!.percent / 100 - cents(p.currentValueEUR!)))) : 0);
    const sales = amounts.reduce((sum, n, i) => sum + (directions[i] < 0 ? n : 0), 0);
    const lockedBuys = amounts.reduce((sum, n, i) => sum + (directions[i] > 0 && lockedTrades.has(positions[i].key) ? n : 0), 0);
    const buys = amounts.reduce((sum, n, i) => sum + (directions[i] > 0 && !lockedTrades.has(positions[i].key) ? n : 0), 0);
    const reserve = Math.ceil(netTotal * cashTargetPercent / 100);
    const budget = Math.max(0, cents(request.profile.buyBudget) + sales - fees - reserve - lockedBuys);
    if (buys > budget) amounts = amounts.map((n, i) => directions[i] > 0 && !lockedTrades.has(positions[i].key) ? Math.floor(n * budget / buys) : n);
    let removed = false;
    active.forEach((yes, i) => { if (yes && !lockedTrades.has(positions[i].key) && amounts[i] < minimum(positions[i])) { active[i] = false; removed = true; } });
    if (!removed) break;
  }
  const fees = positions.reduce((sum, p, i) => sum + (active[i] ? cents(p.feeEUR!) : 0), 0);
  const netTotal = total - fees;
  let cash = cents(request.profile.buyBudget) - fees;
  positions.forEach((p, i) => {
    const amount = active[i] ? amounts[i] : 0;
    const value = cents(p.currentValueEUR!);
    p.targetValueEUR = Math.round(netTotal * p.targetWeight!.percent / 100) / 100;
    p.action = amount ? directions[i] > 0 ? 'Kaufen' : 'Verkaufen' : directions[i] && p.feeEUR === null ? 'Prüfen' : 'Halten';
    p.amountEUR = amount ? amount / 100 : null;
    p.projectedWeightPercent = netTotal > 0 ? (value + directions[i] * amount) / netTotal * 100 : null;
    cash -= directions[i] * amount;
    p.reason = lockedTrades.has(p.key) ? 'Bestehendes Empfehlungsszenario aus der Gesamtanalyse unverändert übernommen.'
      : amount ? 'Aus Zielwert minus aktuellem Positionswert, mit gemeinsamen Gebühren und Cashgrenze berechnet.'
      : modelDirections[i] && !directions[i] ? 'Die Analyse stellt die Modellumschichtung zurück; Begründung siehe Empfehlung.'
      : p.reason || (p.feeEUR === null && directions[i] ? 'Ordergebühr fehlt; Betrag bleibt ungeklärt.'
        : directions[i] ? 'Keine wirtschaftliche Umschichtung innerhalb der Gebühren- und Cashgrenzen.' : 'Innerhalb der Zielbandbreite.');
    if (amount && directions[i] > 0 && value + amount < cents(p.targetValueEUR) - 1) p.reason += ' Kauf wegen verfügbarer Mittel gekürzt; Ziel noch nicht vollständig erreicht.';
  });
  return { version: 1, status: 'calculated', method: 'profile-buckets-v1', targetAssetId: request.targetAssetId, totalValueEUR: total / 100,
    cashTargetPercent, projectedCashEUR: cash / 100, feesEUR: fees / 100, assumptions, warnings, positions };
}

/** Return a correction instead of changing AI amounts behind a contradictory explanation. */
export function allocationMismatch(plan: PortfolioAllocation, recommendations: AssetRecommendation[], candidates: NewAssetRecommendation[] = []): string | null {
  for (const rec of [...recommendations, ...candidates]) {
    const key = 'assetId' in rec ? String(rec.assetId) : allocationCandidateKey(rec);
    const target = plan.positions.find(p => p.key === key);
    if (plan.optimization?.robust?.decisionStatus === 'review-required') {
      if (rec.action === 'Kaufen' || rec.action === 'Verkaufen') return `${key}: Modellszenario mit offener Entscheidung. Halten oder Prüfen und plannedAmountEUR null wählen; keine abhängige Umschichtung bestätigen. Gründe: ${plan.optimization.robust.reviewReasons.join(' ')}`;
      continue;
    }
    if (plan.status === 'calculated' && target?.action === 'Prüfen' && rec.action !== 'Prüfen') return `${key}: Die Position ist wegen fehlender Optimierungseingaben unverändert eingefroren. Prüfen wählen und die konkrete Datenlücke nennen.`;
    if (rec.action !== 'Kaufen' && rec.action !== 'Verkaufen') continue;
    if (!target || target.action !== rec.action || target.amountEUR === null) return `${key}: Kein berechneter ${rec.action === 'Kaufen' ? 'Kauf' : 'Verkauf'} möglich. Halten oder Prüfen wählen und den konkreten Modell-/Datengrund nennen.`;
    if (typeof rec.plannedAmountEUR !== 'number' || cents(rec.plannedAmountEUR) !== cents(target.amountEUR)) return `${key}: plannedAmountEUR muss dem lokal berechneten Betrag ${target.amountEUR.toFixed(2)} EUR entsprechen. Begründung, amountRationale und Kostenprüfung an Ziel und Gewichtung vorher/nachher anpassen.`;
  }
  return null;
}

// A saved report may predate this feature; malformed optional metadata is discarded.
export function validPortfolioAllocation(plan: PortfolioAllocation): boolean {
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const nullable = (n: unknown) => n === null || finite(n);
  const percentage = (n: unknown) => finite(n) && n >= 0 && n <= 100 + 1e-8;
  return !!plan && plan.version === 1 && ['profile-buckets-v1', 'forecast-mean-variance-v1'].includes(plan.method)
    && (plan.method !== 'forecast-mean-variance-v1' || validForecastOptimizationDetails(plan.optimization!))
    && ['calculated', 'blocked'].includes(plan.status)
    && [plan.totalValueEUR, plan.projectedCashEUR, plan.feesEUR].every(n => finite(n) && n >= 0)
    && percentage(plan.cashTargetPercent)
    && (plan.targetAssetId === undefined || Number.isInteger(plan.targetAssetId))
    && [plan.assumptions, plan.warnings].every(list => Array.isArray(list) && list.length < 200 && list.every(s => typeof s === 'string' && s.length < 5000))
    && Array.isArray(plan.positions) && plan.positions.length <= 105
    && new Set(plan.positions.map(p => p?.key)).size === plan.positions.length
    && plan.positions.every(p => !!p && typeof p.key === 'string' && typeof p.name === 'string' && typeof p.reason === 'string'
      && (p.assetId === undefined || Number.isInteger(p.assetId))
      && ['user-confirmed', 'profile-model', 'cash-holding', 'forecast-optimization'].includes(p.source)
      && ['Kaufen', 'Verkaufen', 'Halten', 'Prüfen'].includes(p.action)
      && [p.currentValueEUR, p.targetValueEUR, p.amountEUR, p.feeEUR].every(n => nullable(n) && (n === null || n >= 0))
      && [p.currentWeightPercent, p.projectedWeightPercent].every(n => n === null || percentage(n))
      && (p.targetWeight === null || !!p.targetWeight
        && [p.targetWeight.percent, p.targetWeight.minPercent, p.targetWeight.maxPercent].every(percentage)
        && p.targetWeight.minPercent <= p.targetWeight.percent && p.targetWeight.percent <= p.targetWeight.maxPercent));
}

export const portfolioAllocationInstructions = ' allocationPlan ist ein lokal berechnetes Profilmodell mit transparenten Modellannahmen, keine Renditeoptimierung und keine Marktprognose. Eigene bestätigte Zielgewichte haben Vorrang. Nenne berechnete Zielgewichtung und Bandbreite, nicht pauschal optimale zukünftige Rendite. Für Kaufen/Verkaufen sind Richtung und plannedAmountEUR aus allocationPlan verbindlich; keine beispielhaften oder frei erfundenen Beträge. Halten oder Prüfen bleibt bei belegten Kosten-, Steuer-, Produkt- oder Markthindernissen möglich; den konkreten Grund gegenüber dem Modell nennen. Bei blockierter Bewertung oder widersprüchlichen Zielen keine Umschichtungsbeträge erfinden. Neue belegte Kaufideen dürfen vorgeschlagen werden; ihre gemeinsamen Modellbeträge werden lokal berechnet und gegebenenfalls mit correction.allocationPlan zurückgegeben. Dann Beträge, Empfehlungen, Kostenprüfung und Erklärungen anhand dieses Plans gemeinsam korrigieren. Zielwerte und projectedWeightPercent gelten bei Umsetzung aller Modelltrades, Gebühren berücksichtigt; bei verschobenen Trades sind dies keine Gewichte des tatsächlichen empfohlenen Teilplans. Cashanteile für fehlende Kategorien sind reserviert und kein frei zusätzliches Kaufbudget. Unbekannte Steuern oder Spreads niemals als bereits berücksichtigt darstellen.';
