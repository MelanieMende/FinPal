export const DEFAULT_ANALYSIS_MODEL = 'gpt-5.4-mini';

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
  costBasis: number | null;
  dividendsEarned: number;
  realizedGainLoss: number | null;
}

export interface PortfolioAnalysisRequest {
  provider: 'chatgpt' | 'api';
  model?: string;
  positions: AnalysisPosition[];
  profile: InvestmentProfile;
  priceUpdatedAt: string | null;
}

export interface AnalysisSource { title: string; url: string; }
export interface AssetRecommendation {
  assetId: number;
  action: 'Kaufen' | 'Halten' | 'Verkaufen' | 'Prüfen';
  rationale: string;
  risk: string;
  sourceIndexes: number[];
}
export interface PortfolioAnalysisResult {
  summary: string;
  warnings: string[];
  recommendations: AssetRecommendation[];
  sources: AnalysisSource[];
  generatedAt: string;
  priceUpdatedAt: string | null;
  model: string;
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
      price: price !== null && price > 0 ? price : null,
      // Do not assume that every unlabelled quote is in EUR.
      currency: asset.currencySymbol || 'unknown', costBasis: invest === null ? null : Math.abs(invest),
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
      || !['Stock', 'ETF', 'Bond', 'Crypto', 'Commodity', 'RealEstate', 'CashEquivalent'].includes(position.type)
      || ![position.name, position.symbol, position.isin, position.currency].every(s => typeof s === 'string' && s.length <= 300)
      || ![position.price, position.costBasis, position.realizedGainLoss].every(n => n === null || Number.isFinite(n))
      || (position.price !== null && position.price <= 0) || (position.costBasis !== null && position.costBasis < 0)
      || !Number.isFinite(position.dividendsEarned)) throw new Error('Die Portfolio-Daten sind ungültig.');
    ids.add(position.id);
  }
  if (request.priceUpdatedAt !== null && (!request.priceUpdatedAt || !Number.isFinite(Date.parse(request.priceUpdatedAt)))) {
    throw new Error('Der Zeitpunkt der Kursaktualisierung ist ungültig.');
  }
}

export interface PortfolioAnalysisProgress {
  stage: 'preparing' | 'research' | 'analysis' | 'validating' | 'correcting' | 'retrying';
  lastActivityAt: number;
}

export interface SavedPortfolioAnalysis {
  report: PortfolioAnalysisResult;
  snapshot: string;
  provider: PortfolioAnalysisRequest['provider'];
}
