import type { AnalysisPosition } from './portfolioAnalysis';

export const tradeCheckResearchInstructions = ' Prüfe zusätzlich die aktuellen Kosten für manuelle Käufe und Verkäufe bei Trade Republic anhand des offiziellen Preisverzeichnisses beziehungsweise der Support-Seite https://support.traderepublic.com/de-de/784-Is-there-commission-for-order-execution . Berücksichtige Spreads, Fremdkosten und mögliche getrennte Orders für ganze Stücke und Bruchstücke; keine tatsächliche Orderkostenbestätigung behaupten. Prüfe für das ausdrücklich bedingte Szenario einer deutschen Privatperson die geltende Verlustverrechnung nach § 20 EStG anhand https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/II-Einkommen-2-24b/8-Die-einzelnen-Einkunftsarten-13-24b/e-Kapitalvermoegen-20/Paragraf-20/paragraf-20.html . Aktienverluste, andere Kapitalerträge und gegebenenfalls anders besteuerte Assets trennen. Nenne Quelle und Stand; Steuerwohnsitz, persönliche Verlusttöpfe, Freistellungsauftrag, steuerliche FIFO-Anschaffungskosten und andere Depots sind nicht bekannt. Keine persönliche Steuerersparnis oder Erstattung erfinden.';

export function buildTradeEconomics(position: AnalysisPosition) {
  const marketValueEUR = position.currency === 'EUR' && position.price !== null
    ? position.shares * position.price : null;
  // These are explicit scenarios, not an order quote or proof of the custody broker.
  const feeScenarios = [1, 2].map(feeEUR => ({
    feeEUR,
    feePercent: marketValueEUR !== null && marketValueEUR > 0 ? 100 * feeEUR / marketValueEUR : null,
    netProceedsBeforeSpreadAndTaxEUR: marketValueEUR === null ? null : marketValueEUR - feeEUR,
    accountingGainLossEUR: marketValueEUR === null || position.costBasis === null ? null : marketValueEUR - feeEUR - position.costBasis,
  }));
  return { assetId: position.id, marketValueEUR, feeScenarios,
    feeBasis: 'Szenarien mit 1 EUR für eine Order bzw. 2 EUR für zwei Orders; tatsächliche Gebühren und Broker nicht bestätigt, Spread und weitere Kosten unbekannt.',
    taxResidence: 'unknown', taxCostBasis: 'unknown', lossPots: 'unknown', taxSavingsEUR: null as number | null,
    accountingBasis: 'costBasis ist die FinPal-Restkostenbasis, keine bestätigte steuerliche FIFO-Anschaffungskostenbasis. realizedGainLoss enthält Dividenden und ist kein Aktien-Verlusttopf.',
  };
}
