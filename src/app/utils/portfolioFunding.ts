import type { PortfolioAnalysisRequest, PortfolioAnalysisResult } from './portfolioAnalysis';

export interface FundingCheck {
  status: 'no-trades' | 'unknown' | 'insufficient' | 'conditional';
  cashEUR: number;
  saleProceedsEUR: number;
  buyAmountEUR: number;
  feeScenarioEUR: number;
  balanceBeforeSpreadAndTaxEUR: number;
  shortfallEUR: number;
  warnings: string[];
}

const cents = (amount: number) => Math.round(amount * 100);

// EUR allocations are scenarios, not executable orders or confirmed net proceeds.
export function checkPortfolioFunding(request: PortfolioAnalysisRequest,
  report: Pick<PortfolioAnalysisResult, 'recommendations' | 'newAssetRecommendations'>): FundingCheck {
  let buys = 0, sales = 0, orders = 0, fees = 0, unknown = false;
  const addOrderFee = (assetId?: number) => {
    const context = request.investorContext;
    const custody = assetId === undefined ? context?.defaultCustody : context?.assets.find(a => a.assetId === assetId)?.custody;
    const fee = context ? custody?.orderFeeEUR : 1;
    if (typeof fee !== 'number' || !Number.isFinite(fee) || fee < 0) {
      unknown = true;
      warnings.push(assetId === undefined ? 'Orderkosten für eine neue Kaufidee fehlen.' : `Asset ${assetId}: Orderkosten des gespeicherten Verwahranbieters fehlen.`);
    } else fees += cents(fee);
  };
  const warnings: string[] = [];
  for (const rec of report.recommendations) {
    if (rec.action !== 'Kaufen' && rec.action !== 'Verkaufen') continue;
    orders++;
    addOrderFee(rec.assetId);
    const amount = rec.plannedAmountEUR;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) { unknown = true; continue; }
    if (rec.action === 'Kaufen') { buys += cents(amount); continue; }
    const position = request.positions.find(position => position.id === rec.assetId);
    const marketValue = position?.currency === 'EUR' && position.price !== null ? position.shares * position.price : null;
    if (marketValue === null || !Number.isFinite(marketValue) || cents(amount) > cents(marketValue)) {
      unknown = true;
      warnings.push(`Asset ${rec.assetId}: Verkaufserlös ist nicht durch den aktuellen EUR-Bestand gedeckt.`);
      continue;
    }
    sales += cents(amount);
  }
  for (const rec of report.newAssetRecommendations ?? []) {
    if (rec.action !== 'Kaufen') continue;
    orders++;
    addOrderFee();
    if (typeof rec.plannedAmountEUR !== 'number' || !Number.isFinite(rec.plannedAmountEUR) || rec.plannedAmountEUR <= 0) unknown = true;
    else buys += cents(rec.plannedAmountEUR);
  }
  const cash = cents(request.profile.buyBudget);
  // One regular order per recommendation; use the respective provider fee when available.
  const balance = cash + sales - buys - fees;
  if (unknown) warnings.push('Mindestens ein Kauf-/Verkaufsbetrag, eine Ordergebühr oder eine EUR-Verkaufsbewertung fehlt. Eine vollständige Finanzierung ist nicht bestätigt.');
  if (orders) warnings.push(request.investorContext
    ? 'Gebührenszenario: gespeicherte Gebühr des jeweiligen Anbieters für eine reguläre Order pro Kauf-/Verkaufsvorschlag. Für neue Kaufideen gilt der gespeicherte Standardanbieter. Fehlende Gebühren bleiben ungeklärt. Zusätzliche separate Orders, Spreads, Drittkosten und Verkaufssteuern sind nicht enthalten.'
    : 'Gebührenszenario: 1 EUR Fremdkostenpauschale je regulärer Trade-Republic-Order; pro Kauf-/Verkaufsvorschlag wird eine Order angenommen, auch bei Bruchstücken. Sparplanausführungen sind ausgenommen. Zusätzliche separate Orders, Spreads, Drittkosten und Verkaufssteuern sind nicht enthalten. Der Restbetrag ist kein bestätigtes Nettokaufbudget.');
  if (sales > 0) warnings.push('Verkaufserlöse werden erst nach ausgeführtem Verkauf und Gutschrift verfügbar. Abhängige Käufe erst danach und nach Prüfung der tatsächlichen Abzüge ausführen. Steuerliche Verlustverrechnung wird nicht als zusätzlicher Erlös angerechnet.');
  return { status: !orders ? 'no-trades' : unknown ? 'unknown' : balance < 0 ? 'insufficient' : 'conditional',
    cashEUR: cash / 100, saleProceedsEUR: sales / 100, buyAmountEUR: buys / 100,
    feeScenarioEUR: fees / 100, balanceBeforeSpreadAndTaxEUR: balance / 100,
    shortfallEUR: Math.max(0, -balance) / 100, warnings,
  };
}
