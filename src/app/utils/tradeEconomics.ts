import type { AnalysisPosition } from './portfolioAnalysis';
import type { InvestorContext } from './investorFacts';

export const tradeCheckResearchInstructions = ' Prüfe zusätzlich die aktuellen Kosten für manuelle Käufe und Verkäufe bei Trade Republic anhand des offiziellen Preisverzeichnisses beziehungsweise der Support-Seite https://support.traderepublic.com/de-de/784-Is-there-commission-for-order-execution . Berücksichtige Spreads, Fremdkosten und mögliche getrennte Orders für ganze Stücke und Bruchstücke; keine tatsächliche Orderkostenbestätigung behaupten. Prüfe für das ausdrücklich bedingte Szenario einer deutschen Privatperson die geltende Verlustverrechnung nach § 20 EStG anhand https://esth.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/II-Einkommen-2-24b/8-Die-einzelnen-Einkunftsarten-13-24b/e-Kapitalvermoegen-20/Paragraf-20/paragraf-20.html . Aktienverluste, andere Kapitalerträge und gegebenenfalls anders besteuerte Assets trennen. Nenne Quelle und Stand; Wenn taxJurisdiction bekannt ist, recherchiere vorrangig dessen geltende Behandlung anhand aktueller amtlicher Primärquellen, insbesondere für direkt gehaltene Kryptowerte; das deutsche Szenario nur bei DE oder ausdrücklich als bedingtes Beispiel bei unbekanntem Steuerland verwenden. Persönliche Verlusttöpfe, Freistellungsauftrag, bestätigte steuerliche FIFO-Anschaffungskosten und andere Depots sind ohne explizite Angaben unbekannt. Keine persönliche Steuerersparnis oder Erstattung erfinden.';

export function buildTradeEconomics(position: AnalysisPosition, investorContext?: InvestorContext) {
  const facts = investorContext?.assets.find(a => a.assetId === position.id);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
  const taxResidence = investorContext?.taxResidencies.filter(v => v.validFrom <= today)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom)).slice(-1)[0] ?? null;
  const marketValueEUR = position.currency === 'EUR' && position.price !== null
    ? position.shares * position.price : null;
  // These are explicit scenarios, not an order quote or proof of the custody broker.
  const orderFeeEUR = facts ? facts.custody.orderFeeEUR : investorContext ? null : 1;
  const feeScenarios = (orderFeeEUR === null ? [] : [orderFeeEUR, orderFeeEUR * 2]).map(feeEUR => ({
    feeEUR,
    feePercent: marketValueEUR !== null && marketValueEUR > 0 ? 100 * feeEUR / marketValueEUR : null,
    netProceedsBeforeSpreadAndTaxEUR: marketValueEUR === null ? null : marketValueEUR - feeEUR,
    accountingGainLossEUR: marketValueEUR === null || position.costBasis === null ? null : marketValueEUR - feeEUR - position.costBasis,
  }));
  return { assetId: position.id, marketValueEUR, feeScenarios,
    feeBasis: facts ? orderFeeEUR === null ? 'Ordergebühr unbekannt; keine Trade-Republic-Pauschale für einen anderen oder ungeklärten Anbieter unterstellen.'
      : `Gespeicherte Ordergebühr: ${orderFeeEUR} EUR je Order bei ${facts.custody.provider}; Szenario für eine bzw. zwei separate Orders, kein aktuelles Orderangebot. Spread und weitere Kosten unbekannt.`
      : 'Szenarien mit 1 EUR für eine Order bzw. 2 EUR für zwei Orders; tatsächliche Gebühren und Broker nicht bestätigt, Spread und weitere Kosten unbekannt.',
    taxResidence: taxResidence?.country ?? 'unknown', taxResidenceValidFrom: taxResidence?.validFrom ?? null,
    custody: facts?.custody ?? null, acquisitionHistory: facts?.acquisitionHistory ?? null,
    taxContext: facts?.taxContext ?? 'unknown', specialActivities: facts?.specialActivities ?? 'unknown', targetWeight: facts?.targetWeight ?? null,
    taxCostBasis: 'unknown', lossPots: 'unknown', taxSavingsEUR: null as number | null,
    accountingBasis: 'costBasis ist die FinPal-Restkostenbasis, keine bestätigte steuerliche FIFO-Anschaffungskostenbasis. realizedGainLoss enthält Dividenden und ist kein Aktien-Verlusttopf.',
  };
}
