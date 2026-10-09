import { validQuote, type QuoteMetadata } from './quoteMetadata';

export const DEFAULT_ANALYSIS_MODEL = 'gpt-5.4-mini';
export const ANALYSIS_TIMEOUT_MS = 10 * 60 * 1000;
export const RESEARCH_BATCH_SIZE = 6;
export const RESEARCH_CONCURRENCY = 3;
export const RESEARCH_CACHE_TTL_MS = 30 * 60 * 1000;

export interface InvestmentProfile {
  goal: 'growth' | 'income' | 'preservation';
  risk: 'low' | 'medium' | 'high';
  horizonYears: number;
  buyBudget: number;
}

export interface AnalysisPosition {
  id: number;
  name: string;
  symbol: string;
  isin: string;
  type: Asset['type'];
  shares: number;
  price: number | null;
  currency: string;
  quote?: QuoteMetadata;
  bondHolding?: import('./bondHoldings').BondHolding;
  currencyExposure?: 'unknown';
  costBasis: number | null;
  dividendsEarned: number;
  realizedGainLoss: number | null;
}

export interface PortfolioAnalysisRequest {
  targetAssetId?: number;
  provider: 'chatgpt' | 'api';
  model?: string;
  positions: AnalysisPosition[];
  profile: InvestmentProfile;
  priceUpdatedAt: string | null;
}

export interface AnalysisSource { title: string; url: string; }
export interface AssetRecommendation {
  executionBaseline?: { shares: number; transactionIds?: number[] };
  plannedAmountEUR?: number | null;
  updatedAt?: string;
  model?: string;
  navEvidence?: import('./eltifValuation').NavEvidence | null;
  infos?: string[];
  warnings?: string[];
  assetId: number;
  action: 'Kaufen' | 'Halten' | 'Verkaufen' | 'Prüfen';
  rationale: string;
  risk: string;
  sourceIndexes: number[];
  tradeCheck?: { costs: string; taxes: string; conclusion: string };
}
export interface PortfolioAnalysisResult {
  fundingCheck?: import('./portfolioFunding').FundingCheck;
  summary: string;
  infos?: string[];
  warnings: string[];
  recommendations: AssetRecommendation[];
  newAssetRecommendations?: NewAssetRecommendation[];
  sources: AnalysisSource[];
  generatedAt: string;
  priceUpdatedAt: string | null;
  model: string;
}

export interface NewAssetRecommendation {
  plannedAmountEUR?: number | null;
  name: string;
  isin: string;
  symbol: string;
  type: Asset['type'];
  action: 'Kaufen' | 'Prüfen';
  rationale: string;
  risk: string;
  sourceIndexes: number[];
}

const finiteOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;

// Send only currently held positions, without transactions or personal comments.
export function buildAnalysisPositions(assets: Asset[]): AnalysisPosition[] {
  return assets.filter(asset => asset.current_shares > 0).map(asset => {
    const invest = finiteOrNull(asset.current_invest);
    const flow = finiteOrNull(asset.current_sum_in_out);
    const dividends = finiteOrNull(asset.dividends_earned) ?? 0;
    const price = finiteOrNull(asset.price);
    return {
      id: asset.ID, name: asset.name || '', symbol: asset.symbol || '', isin: asset.isin || '',
      type: asset.type || 'Stock', shares: asset.current_shares,
      price: asset.quote?.valuationCurrency === 'unknown' ? null : price !== null && price > 0 ? price : null,
      // Do not assume that every unlabelled quote is in EUR.
      currency: asset.quote?.valuationCurrency || (asset.currencySymbol === '€' ? 'EUR' : asset.currencySymbol || 'unknown'),
      quote: asset.quote, ...(asset.bondHolding ? { bondHolding: asset.bondHolding } : {}), currencyExposure: 'unknown', costBasis: invest === null ? null : Math.abs(invest),
      dividendsEarned: dividends, realizedGainLoss: flow === null || invest === null ? null : flow - invest + dividends,
    };
  });
}

export function validateAnalysisRequest(request: PortfolioAnalysisRequest): void {
  if (!request || !['chatgpt', 'api'].includes(request.provider)) throw new Error('Bitte einen KI-Zugang auswählen.');
  const p = request?.profile;
  if (!p || !['growth', 'income', 'preservation'].includes(p.goal) || !['low', 'medium', 'high'].includes(p.risk)
    || !Number.isFinite(p.horizonYears) || p.horizonYears <= 0 || p.horizonYears > 100
    || !Number.isFinite(p.buyBudget) || p.buyBudget < 0 || p.buyBudget > 1e9) {
    throw new Error('Bitte Anlageziel, Risiko, Anlagedauer und Kaufbudget vollständig angeben.');
  }
  if (!Array.isArray(request.positions) || !request.positions.length) throw new Error('Es sind keine gehaltenen Assets vorhanden.');
  if (request.positions.length > 100) throw new Error('Eine Analyse unterstützt maximal 100 gehaltene Assets.');
  const ids = new Set<number>();
  for (const position of request.positions) {
    if (!Number.isInteger(position.id) || ids.has(position.id)
      || !Number.isFinite(position.shares) || position.shares <= 0
      || !['Stock', 'ETF', 'Fund', 'Bond', 'Crypto', 'Commodity', 'RealEstate', 'CashEquivalent'].includes(position.type)
      || ![position.name, position.symbol, position.isin, position.currency].every(s => typeof s === 'string' && s.length <= 300)
      || ![position.price, position.costBasis, position.realizedGainLoss].every(n => n === null || Number.isFinite(n))
      || (position.price !== null && position.price <= 0) || (position.costBasis !== null && position.costBasis < 0)
      || !Number.isFinite(position.dividendsEarned)) throw new Error('Die Portfolio-Daten sind ungültig.');
    ids.add(position.id);
    const holding = position.bondHolding;
    if (holding && (position.type !== 'Bond' || holding.source !== 'user-confirmed'
      || !Number.isFinite(holding.nominal) || holding.nominal <= 0 || !/^[A-Z]{3}$/.test(holding.currency)
      || !Number.isFinite(holding.purchaseAccruedInterestEUR)
      || (holding.brokerQuantity !== undefined && (!Number.isFinite(holding.brokerQuantity) || holding.brokerQuantity <= 0))
      || (holding.quantityConflict !== undefined && typeof holding.quantityConflict !== 'boolean')
      || !Array.isArray(holding.transactions) || !holding.transactions.length || holding.transactions.length > 1000
      || holding.transactions.some(t => !Number.isInteger(t.id) || typeof t.date !== 'string' || !Number.isFinite(Date.parse(t.date))
        || !Number.isFinite(t.nominal) || !Number.isFinite(t.accruedInterestEUR))
      || Math.abs(holding.transactions.reduce((sum, t) => sum + t.nominal, 0) - holding.nominal) > 1e-8)) {
      throw new Error('Die bestätigten Anleihedaten sind ungültig.');
    }
    if (position.quote && (!validQuote(position.quote) || position.currency !== position.quote.valuationCurrency
      || (position.quote.valuationCurrency === 'unknown' && position.price !== null)
      || (position.price !== null && position.quote.valuationCurrency === 'EUR'
        && Math.abs(position.price - position.quote.originalPrice * position.quote.fxRateToEUR * (position.quote.unitFactor ?? 1)) > Math.max(1e-8, position.price * 1e-8)))) {
      throw new Error('Die Kurs- oder Wechselkursdaten sind ungültig.');
    }
  }
  if (request.targetAssetId !== undefined && (!Number.isInteger(request.targetAssetId) || !ids.has(request.targetAssetId))) {
    throw new Error('Das ausgewählte Asset wird nicht mehr gehalten.');
  }
  if (request.priceUpdatedAt !== null && (!request.priceUpdatedAt || !Number.isFinite(Date.parse(request.priceUpdatedAt)))) {
    throw new Error('Der Zeitpunkt der Kursaktualisierung ist ungültig.');
  }
}

export interface PortfolioAnalysisProgress {
  stage: 'prices' | 'preparing' | 'research' | 'analysis' | 'validating' | 'correcting' | 'retrying';
  lastActivityAt: number;
  researchCompleted?: number;
  researchTotal?: number;
}

export interface SavedPortfolioAnalysis {
  report: PortfolioAnalysisResult;
  snapshot: string;
  provider: PortfolioAnalysisRequest['provider'];
}
