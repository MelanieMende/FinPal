export const INVESTOR_FACTS_KEY = 'finpal.analysis.investorFacts.v1';
export type HistoryCoverage = 'unknown' | 'complete' | 'incomplete';
export interface CustodyFact {
  kind: 'broker' | 'self-custody' | 'mixed' | 'unknown';
  provider: string;
  source: 'user-confirmed' | 'default';
  confirmedAt: string | null;
  orderFeeEUR: number | null;
}
export interface AssetInvestorFacts {
  custody: CustodyFact;
  historyCoverage: HistoryCoverage;
  specialActivities: 'unknown' | 'none' | 'staking' | 'lending' | 'mixed';
  taxContext: 'unknown' | 'private-direct-crypto' | 'security' | 'business';
  targetWeight: { percent: number; minPercent: number; maxPercent: number } | null;
  confirmedAt: string | null;
}
export interface InvestorFacts {
  version: 1;
  initialAssetsSeeded: boolean;
  defaultCustody: CustodyFact;
  taxResidencies: { country: string; validFrom: string; confirmedAt: string }[];
  assets: Record<string, AssetInvestorFacts>;
}
export interface AcquisitionHistory {
  assetId: number;
  source: 'recorded-transactions';
  coverage: HistoryCoverage;
  transactionCount: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  reconcilesWithHolding: boolean;
  unmatchedSoldQuantity: number;
  invalidTransactionCount: number;
  remainingLots: { transactionId: number; purchaseDate: string; quantity: number; unitPrice: number }[];
  allocationMethod: 'illustrative-FIFO-not-confirmed-tax-basis';
}
export interface InvestorContext {
  defaultCustody: CustodyFact;
  taxResidencies: InvestorFacts['taxResidencies'];
  assets: (AssetInvestorFacts & { assetId: number; acquisitionHistory: AcquisitionHistory })[];
  spread: { status: 'requires-current-order-quote' };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const validFactDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const validTime = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
export function validCustody(v: CustodyFact): boolean {
  return !!v && ['broker', 'self-custody', 'mixed', 'unknown'].includes(v.kind)
    && typeof v.provider === 'string' && v.provider.length <= 200 && (v.kind === 'unknown' || !!v.provider.trim())
    && ['user-confirmed', 'default'].includes(v.source) && (v.source === 'user-confirmed' ? validTime(v.confirmedAt) : v.confirmedAt === null || validTime(v.confirmedAt))
    && (v.orderFeeEUR === null || (finite(v.orderFeeEUR) && v.orderFeeEUR >= 0 && v.orderFeeEUR <= 10000));
}
export function validAssetInvestorFacts(v: AssetInvestorFacts): boolean {
  return !!v && validCustody(v.custody) && ['unknown', 'complete', 'incomplete'].includes(v.historyCoverage)
    && ['unknown', 'none', 'staking', 'lending', 'mixed'].includes(v.specialActivities)
    && ['unknown', 'private-direct-crypto', 'security', 'business'].includes(v.taxContext)
    && (v.confirmedAt === null || validTime(v.confirmedAt))
    && ((v.historyCoverage === 'unknown' && v.specialActivities === 'unknown' && v.taxContext === 'unknown' && v.targetWeight === null) || validTime(v.confirmedAt))
    && (v.targetWeight === null || (!!v.targetWeight
      && [v.targetWeight.percent, v.targetWeight.minPercent, v.targetWeight.maxPercent].every(n => finite(n) && n >= 0 && n <= 100)
      && v.targetWeight.minPercent <= v.targetWeight.percent && v.targetWeight.percent <= v.targetWeight.maxPercent));
}
const emptyAssetFacts = (custody: CustodyFact): AssetInvestorFacts => ({ custody: { ...custody }, historyCoverage: 'unknown',
  specialActivities: 'unknown', taxContext: 'unknown', targetWeight: null, confirmedAt: null });
export function newInvestorFacts(): InvestorFacts {
  // The user explicitly confirmed Trade Republic for all current assets in this session.
  return { version: 1, initialAssetsSeeded: false, defaultCustody: { kind: 'broker', provider: 'Trade Republic',
    source: 'default', confirmedAt: null, orderFeeEUR: 1 }, taxResidencies: [], assets: {} };
}
export function investorFactsStorageKey(database: string) {
  return `${INVESTOR_FACTS_KEY}:${encodeURIComponent(database || 'default')}`;
}
export function seedInvestorFacts(facts: InvestorFacts, assets: Asset[]): InvestorFacts {
  const result = { ...facts, assets: { ...facts.assets } };
  for (const asset of assets) {
    if (result.assets[asset.ID]) continue;
    const custody = { ...facts.defaultCustody };
    if (!facts.initialAssetsSeeded) { custody.source = 'user-confirmed'; custody.confirmedAt = new Date().toISOString(); }
    result.assets[asset.ID] = emptyAssetFacts(custody);
  }
  if (assets.length) result.initialAssetsSeeded = true;
  return result;
}
export function readInvestorFacts(database: string, assets: Asset[]): InvestorFacts {
  const defaults = newInvestorFacts();
  try {
    const saved = JSON.parse(localStorage.getItem(investorFactsStorageKey(database)) || 'null');
    if (saved?.version === 1) {
      if (validCustody(saved.defaultCustody)) defaults.defaultCustody = saved.defaultCustody;
      defaults.initialAssetsSeeded = saved.initialAssetsSeeded === true;
      if (Array.isArray(saved.taxResidencies)) defaults.taxResidencies = saved.taxResidencies.filter((v: InvestorFacts['taxResidencies'][number]) =>
        v && typeof v.country === 'string' && /^[A-Z]{2}$/.test(v.country) && validFactDate(v.validFrom) && validTime(v.confirmedAt)).slice(0, 50).sort((a: InvestorFacts['taxResidencies'][number], b: InvestorFacts['taxResidencies'][number]) => a.validFrom.localeCompare(b.validFrom));
      if (saved.assets && typeof saved.assets === 'object') for (const [id, value] of Object.entries(saved.assets)) {
        if (/^\d+$/.test(id) && validAssetInvestorFacts(value as AssetInvestorFacts)) defaults.assets[id] = value as AssetInvestorFacts;
      }
    }
  } catch { /* Invalid saved settings are replaced by valid defaults. */ }
  return seedInvestorFacts(defaults, assets);
}
export function saveInvestorFacts(database: string, facts: InvestorFacts) {
  localStorage.setItem(investorFactsStorageKey(database), JSON.stringify(facts));
}

export function deriveAcquisitionHistory(asset: Asset, transactions: Transaction[], coverage: HistoryCoverage): AcquisitionHistory {
  const trades = transactions.filter(t => t.asset_ID === asset.ID).slice().sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')) || a.ID - b.ID);
  const lots: AcquisitionHistory['remainingLots'] = [];
  const dates: string[] = [];
  const seen = new Set<number>();
  let unmatchedSoldQuantity = 0, invalidTransactionCount = 0, netQuantity = 0;
  for (const trade of trades) {
    if (seen.has(trade.ID)) continue;
    seen.add(trade.ID);
    if (!Number.isInteger(trade.ID) || !['Buy', 'Sell'].includes(trade.type) || !finite(trade.amount) || trade.amount <= 0
      || !finite(trade.price_per_share) || trade.price_per_share < 0 || !validTime(trade.date)) {
      invalidTransactionCount++; continue;
    }
    if (trade.type === 'Buy') {
      dates.push(trade.date);
      lots.push({ transactionId: trade.ID, purchaseDate: trade.date, quantity: trade.amount, unitPrice: trade.price_per_share });
      netQuantity += trade.amount;
    } else {
      netQuantity -= trade.amount;
      let quantity = trade.amount;
      for (const lot of lots) {
        const used = Math.min(quantity, lot.quantity);
        lot.quantity -= used; quantity -= used;
        if (quantity <= 1e-10) break;
      }
      unmatchedSoldQuantity += Math.max(0, quantity);
    }
  }
  return { assetId: asset.ID, source: 'recorded-transactions', coverage, transactionCount: seen.size,
    firstPurchaseDate: dates[0] ?? null, lastPurchaseDate: dates[dates.length - 1] ?? null,
    reconcilesWithHolding: invalidTransactionCount === 0 && unmatchedSoldQuantity < 1e-8
      && Math.abs(netQuantity - asset.current_shares) <= Math.max(1e-8, Math.abs(asset.current_shares) * 1e-8),
    unmatchedSoldQuantity, invalidTransactionCount, remainingLots: lots.filter(l => l.quantity > 1e-10),
    allocationMethod: 'illustrative-FIFO-not-confirmed-tax-basis' };
}
export function buildInvestorContext(facts: InvestorFacts, assets: Asset[], transactions: Transaction[]): InvestorContext {
  const seeded = seedInvestorFacts(facts, assets);
  return { defaultCustody: facts.defaultCustody, taxResidencies: facts.taxResidencies, spread: { status: 'requires-current-order-quote' },
    assets: assets.filter(a => a.current_shares > 0).map(asset => {
      const assetFacts = seeded.assets[asset.ID];
      return { ...assetFacts, assetId: asset.ID,
        acquisitionHistory: deriveAcquisitionHistory(asset, transactions, assetFacts.historyCoverage) };
    }),
  };
}

export function validInvestorContext(value: InvestorContext): boolean {
  return !!value && validCustody(value.defaultCustody) && Array.isArray(value.taxResidencies) && value.taxResidencies.length <= 50
    && value.taxResidencies.every(v => v && typeof v.country === 'string' && /^[A-Z]{2}$/.test(v.country) && validFactDate(v.validFrom) && validTime(v.confirmedAt))
    && value.spread?.status === 'requires-current-order-quote' && Array.isArray(value.assets) && value.assets.length <= 100
    && new Set(value.assets.map(a => a?.assetId)).size === value.assets.length
    && value.assets.every(a => {
      const h = a?.acquisitionHistory;
      return a && Number.isInteger(a.assetId) && validAssetInvestorFacts(a) && h && h.assetId === a.assetId
        && h.source === 'recorded-transactions' && h.coverage === a.historyCoverage && Number.isInteger(h.transactionCount) && h.transactionCount >= 0
        && [h.firstPurchaseDate, h.lastPurchaseDate].every(d => d === null || validTime(d))
        && typeof h.reconcilesWithHolding === 'boolean' && finite(h.unmatchedSoldQuantity) && h.unmatchedSoldQuantity >= 0
        && Number.isInteger(h.invalidTransactionCount) && h.invalidTransactionCount >= 0
        && h.allocationMethod === 'illustrative-FIFO-not-confirmed-tax-basis'
        && Array.isArray(h.remainingLots) && h.remainingLots.length <= 3000 && h.remainingLots.every(l => l && Number.isInteger(l.transactionId)
          && validTime(l.purchaseDate) && finite(l.quantity) && l.quantity > 0 && finite(l.unitPrice) && l.unitPrice >= 0);
    });
}

export const investorFactsAnalysisInstructions = ' investorContext enthält dauerhaft gespeicherte Angaben mit Herkunft und Bestätigungszeit sowie aus erfassten Transaktionen abgeleitete Anschaffungsdaten. Nutze bestätigte Verwahranbieter, Steuerwohnsitze mit Gültigkeitsbeginn, Historienvollständigkeit, steuerlichen Kontext, Sonderaktivitäten und Zielgewichte. Bekannte Angaben niemals pauschal als unbekannt ausgeben; nenne nur konkrete verbleibende Lücken. custody.source default ist eine unbestätigte Voreinstellung, user-confirmed eine Nutzerangabe. Bekannter Anbieter bedeutet keine Kenntnis seiner internen Wallet-Architektur. Steuerwohnsitze gelten ab validFrom; frühere oder andere Zeiträume nicht unterstellen. Anschaffungsdaten sind bekannte Transaktionsdaten, auch wenn die Vollständigkeit noch unbestätigt ist. remainingLots sind eine illustrative FIFO-Zuordnung, keine bestätigte steuerliche Kostenbasis: bei unvollständiger Historie, Mengenabweichungen, Überträgen, mehreren Verwahrorten, Sonderaktivitäten oder ungeklärter rechtlicher Methode keine exakte Steuer oder Steuerfreiheit behaupten. taxContext ist eine Nutzerangabe, keine geprüfte rechtliche Einordnung. Geltende Behandlung anhand aktueller Primärquellen des bekannten Steuerlands und dieser Fakten prüfen; keine persönlichen Steuersätze, Verlusttöpfe oder Steuerersparnisse erfinden. targetWeight bezieht sich auf das bekannte Gesamtvermögen einschließlich Cash; bestätigte Zielquote und Bandbreite gegenüber einer generischen Konzentrationsregel priorisieren, Überschreitungen beziffern und begründen. Fehlendes externes Vermögen oder unvollständige Bewertung als konkrete Einschränkung nennen. Spread bleibt je Order aktuell zu prüfen; gespeicherter Anbieter, Kurs und Fremdkostenpauschale ersetzen kein aktuelles handelbares Geld-/Brief-Angebot. Bei anderem Anbieter dessen bekannte orderFeeEUR nutzen oder Orderkosten als ungeklärt kennzeichnen; nicht automatisch Trade-Republic-Kosten unterstellen.';
