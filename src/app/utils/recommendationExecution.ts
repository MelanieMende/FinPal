import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type { AnalysisPosition, AssetRecommendation, PortfolioAnalysisResult } from './portfolioAnalysis';

export interface RecommendationExecution {
  status: 'open' | 'partial' | 'done';
  amountEUR: number;
  remainingEUR: number | null;
}
const dayFormatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const calendarDay = (value: string) => value.length === 10 ? value : dayFormatter.format(new Date(value));

// Use recorded gross trade values, never quote changes or net proceeds after fees/tax.
export function getRecommendationExecution(rec: AssetRecommendation, report: PortfolioAnalysisResult,
  snapshot: string, assets: Asset[], transactions: Transaction[]): RecommendationExecution {
  const target = rec.plannedAmountEUR;
  const knownTarget = typeof target === 'number' && Number.isFinite(target) && target > 0;
  const open: RecommendationExecution = { status: 'open', amountEUR: 0, remainingEUR: knownTarget ? target : null };
  if (rec.action !== 'Kaufen' && rec.action !== 'Verkaufen') return open;
  const since = rec.updatedAt ?? report.generatedAt;
  if (!Number.isFinite(Date.parse(since))) return open;
  let baseline = rec.executionBaseline;
  if (!baseline && !rec.updatedAt) {
    try {
      const saved = JSON.parse(snapshot);
      const position = saved.positions?.find((p: AnalysisPosition) => p.id === rec.assetId);
      if (position) baseline = { shares: position.shares, transactionIds: saved.transactionIds };
    } catch { /* No reliable legacy holdings baseline. */ }
  }
  const priorIds = Array.isArray(baseline?.transactionIds) ? new Set(baseline.transactionIds) : null;
  const asset = assets.find(asset => asset.ID === rec.assetId);
  const direction = rec.action === 'Kaufen' ? 1 : -1;
  let changedShares = baseline && asset ? direction * (asset.current_shares - baseline.shares) : 0;
  let amountEUR = 0;
  const seen = new Set<number>();
  for (const trade of transactions.slice().sort((a, b) => b.date.localeCompare(a.date) || b.ID - a.ID)) {
    if (trade.asset_ID !== rec.assetId || trade.type !== (direction === 1 ? 'Buy' : 'Sell')
      || seen.has(trade.ID) || (priorIds?.has(trade.ID))
      || !Number.isFinite(trade.amount) || trade.amount <= 0
      || !Number.isFinite(trade.price_per_share) || trade.price_per_share <= 0
      || !Number.isFinite(Date.parse(trade.date))) continue;
    seen.add(trade.ID);
    // Date-only transactions cannot be ordered within the analysis day. For legacy
    // reports, require a corroborating holdings change and cap same-day quantities.
    const day = calendarDay(trade.date);
    const analysisDay = calendarDay(since);
    if (day < analysisDay) continue;
    if (day === analysisDay && trade.date.length > 10 && Date.parse(trade.date) <= Date.parse(since)) continue;
    let quantity = trade.amount;
    if (!priorIds && day === analysisDay && trade.date.length === 10) {
      quantity = Math.min(quantity, Math.max(0, changedShares));
    }
    if (!priorIds) changedShares -= quantity;
    amountEUR += quantity * trade.price_per_share;
  }
  amountEUR = Math.round(amountEUR * 100) / 100;
  const done = knownTarget && Math.round(amountEUR * 100) >= Math.round(target * 100);
  return { status: done ? 'done' : amountEUR > 0 ? 'partial' : 'open', amountEUR,
    remainingEUR: knownTarget ? Math.max(0, Math.round((target - amountEUR) * 100) / 100) : null };
}

export const selectRecommendationExecutions = createSelector(
  [(state: RootState) => state.portfolioAnalysis.lastResult ?? state.portfolioAnalysis.result,
    (state: RootState) => state.portfolioAnalysis.resultSnapshot,
    (state: RootState) => state.assets, (state: RootState) => state.transactions],
  (report, snapshot, assets, transactions): Record<number, RecommendationExecution> =>
    Object.fromEntries((report?.recommendations ?? []).map(rec => [rec.assetId,
      getRecommendationExecution(rec, report!, snapshot, assets, transactions)])),
);
