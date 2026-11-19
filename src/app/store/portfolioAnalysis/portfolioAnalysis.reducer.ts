import { createAsyncThunk, createSlice, type PayloadAction, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { analysisPriceRefreshProgress, loadPricesAndDividends } from '../assets/assets.reducer';
import { buildAnalysisPositions, DEFAULT_ANALYSIS_MODEL } from '../../utils/portfolioAnalysis';
import { MARKET_PRICE_UPDATED_AT_KEY } from '../../utils/syncTimestamps';
import { resolveAcquisitionHistory, resolveTaxContext } from '../../utils/investorFacts';
import type { PortfolioAnalysisRequest, PortfolioAnalysisResult, PortfolioAnalysisProgress, SavedPortfolioAnalysis, ResearchAsset } from '../../utils/portfolioAnalysis';
import type { InvestorContext } from '../../utils/investorFacts';

export interface AnalysisLogEntry { at: number; progress?: PortfolioAnalysisProgress; assetName?: string; message?: string }
export interface AnalysisLog { startedAt: number; status: 'running' | 'completed' | 'failed' | 'interrupted'; title: string; entries: AnalysisLogEntry[]; assetNames: Record<number, string>; }
export const ANALYSIS_LOG_KEY = 'finpal.portfolioAnalysis.lastLog.v1';
function appendLogProgress(state: AnalysisState, progress: PortfolioAnalysisProgress) {
  const log = state.log;
  if (!log || log.status !== 'running') return;
  const { lastActivityAt: _time, completedRiskAssetIds: _completed, reusedRiskAssetIds: _reused, ...details } = progress;
  const last = log.entries[log.entries.length - 1]?.progress;
  if (last) {
    const { lastActivityAt: _lastTime, completedRiskAssetIds: _lastCompleted, reusedRiskAssetIds: _lastReused, ...lastDetails } = last;
    if (JSON.stringify(details) === JSON.stringify(lastDetails)) return;
  }
  log.entries.push({ at: progress.lastActivityAt, progress, ...(progress.activeAssetId !== undefined ? { assetName: log.assetNames[progress.activeAssetId] } : {}) });
  if (log.entries.length > 1000) log.entries.splice(1, log.entries.length - 1000);
}
function startLog(state: AnalysisState, request: PortfolioAnalysisRequest, local: boolean) {
  const assetNames = Object.fromEntries(request.positions.map(p => [p.id, p.name]));
  const scope = request.targetAssetId === undefined ? 'Gesamtportfolio' : assetNames[request.targetAssetId] ?? `Asset ${request.targetAssetId}`;
  state.log = { startedAt: state.startedAt, status: 'running', title: `${local ? 'Lokale Analyse' : 'KI-Analyse'} · ${scope}`,
    assetNames, entries: [{ at: state.startedAt, message: local ? 'Lokale Analyse gestartet.' : `KI-Analyse gestartet · ${request.provider === 'api' ? 'OpenAI API' : 'ChatGPT'} · ${request.provider === 'api' ? DEFAULT_ANALYSIS_MODEL : request.model || 'Kein Modell'} · Reasoning: ${request.reasoningEffort ?? 'low'}.` }] };
  appendLogProgress(state, state.progress!);
}
function finishLog(state: AnalysisState, status: 'completed' | 'failed', message: string) {
  if (!state.log || state.log.status !== 'running') return;
  state.log.status = status;
  state.log.entries.push({ at: Date.now(), message });
}

interface AnalysisState {
  targetAssetId?: number | null;
  open: boolean;
  progress: PortfolioAnalysisProgress | null;
  startedAt: number;
  result: PortfolioAnalysisResult | null;
  lastResult: PortfolioAnalysisResult | null;
  resultSnapshot: string;
  error: string | null;
  requestId: string | null;
  provider: 'chatgpt' | 'api';
  model: string;
  restoreBlocked: boolean;
  log: AnalysisLog | null;
}
const initialState: AnalysisState = {
  open: false, progress: null, startedAt: 0, result: null, lastResult: null, resultSnapshot: '', error: null,
  requestId: null, provider: 'chatgpt', model: '', restoreBlocked: false, log: null,
};

export const restorePortfolioAnalysis = createAsyncThunk<SavedPortfolioAnalysis | null>(
  'portfolioAnalysis/restore', async () => window.API.getLastPortfolioAnalysis?.() ?? null,
);

export const analyzePortfolio = createAsyncThunk<
  { report: PortfolioAnalysisResult; snapshot: string },
  { request: PortfolioAnalysisRequest; snapshot: string },
  { state: { portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }; dispatch: ThunkDispatch<{ portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }, unknown, UnknownAction>; rejectValue: string }
>('portfolioAnalysis/analyze', async ({ request, snapshot }, { dispatch, getState, requestId, rejectWithValue }) => {
  let unsubscribe: (() => void) | undefined;
  const transactionIds = getState().transactions.map(transaction => transaction.ID);
  try {
    // The request and listener belong to the app store, independent of route mounts.
    unsubscribe = window.API.onPortfolioAnalysisProgress?.(progress => {
      dispatch(analysisProgressReceived({ progress, requestId }));
    });
    await dispatch(loadPricesAndDividends({
      assetIDs: request.positions.map(position => position.id),
      preferTradeRepublicPrice: false, includeDividends: false, analysisPriceRefresh: true,
    })).unwrap();
    const refreshedRequest = { ...request,
      positions: buildAnalysisPositions(getState().assets),
      priceUpdatedAt: localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY) ?? request.priceUpdatedAt,
    };
    const investorContext = request.investorContext;
    if (investorContext) refreshedRequest.investorContext = {
      ...investorContext,
      assets: investorContext.assets.map(facts => {
        const asset = getState().assets.find(a => a.ID === facts.assetId);
        return asset ? { ...facts, resolvedTaxContext: resolveTaxContext(asset, facts, investorContext.depotTaxContexts), acquisitionHistory: resolveAcquisitionHistory(asset, getState().transactions, facts, investorContext.depotHistories) } : facts;
      }),
    };
    // Preserve the form's string values for the UI change detector.
    let profileSnapshot: unknown = request.profile;
    try { profileSnapshot = JSON.parse(snapshot).profile ?? profileSnapshot; } catch { /* Legacy caller without a JSON snapshot. */ }
    const refreshedSnapshot = JSON.stringify({ positions: refreshedRequest.positions, profile: profileSnapshot, priceUpdatedAt: refreshedRequest.priceUpdatedAt,
      ...(refreshedRequest.investorContext ? { investorContext: refreshedRequest.investorContext } : {}), transactionIds });
    const analyze = window.API.analyzePortfolio;
    if (!analyze) throw new Error('Bitte FinPal neu starten, um die KI-Analyse zu laden.');
    const report = await analyze(refreshedRequest, refreshedSnapshot);
    return { report, snapshot: refreshedSnapshot };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die KI-Anfrage ist fehlgeschlagen.');
  } finally { unsubscribe?.(); }
}, { condition: (_args, { getState }) => !getState().portfolioAnalysis.progress });

export const analyzePortfolioLocally = createAsyncThunk<
  { report: PortfolioAnalysisResult; snapshot: string },
  { request: PortfolioAnalysisRequest; snapshot: string },
  { state: { portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }; dispatch: ThunkDispatch<{ portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }, unknown, UnknownAction>; rejectValue: string }
>('portfolioAnalysis/analyzeLocal', async ({ request, snapshot }, { dispatch, getState, requestId, rejectWithValue }) => {
  let unsubscribe: (() => void) | undefined;
  const transactionIds = getState().transactions.map(transaction => transaction.ID);
  try {
    unsubscribe = window.API.onPortfolioAnalysisProgress?.(progress => {
      dispatch(analysisProgressReceived({ progress, requestId }));
    });
    await dispatch(loadPricesAndDividends({ assetIDs: request.positions.map(position => position.id), preferTradeRepublicPrice: false, includeDividends: false })).unwrap();
    const refreshedRequest = { ...request, positions: buildAnalysisPositions(getState().assets),
      priceUpdatedAt: localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY) ?? request.priceUpdatedAt };
    if (request.investorContext) refreshedRequest.investorContext = {
      ...request.investorContext,
      assets: request.investorContext.assets.map(facts => {
        const asset = getState().assets.find(a => a.ID === facts.assetId);
        return asset ? { ...facts, resolvedTaxContext: resolveTaxContext(asset, facts, request.investorContext!.depotTaxContexts), acquisitionHistory: resolveAcquisitionHistory(asset, getState().transactions, facts, request.investorContext!.depotHistories) } : facts;
      }),
    };
    let profileSnapshot: unknown = request.profile;
    try { profileSnapshot = JSON.parse(snapshot).profile ?? profileSnapshot; } catch { /* Legacy caller. */ }
    const refreshedSnapshot = JSON.stringify({ positions: refreshedRequest.positions, profile: profileSnapshot, priceUpdatedAt: refreshedRequest.priceUpdatedAt,
      ...(refreshedRequest.investorContext ? { investorContext: refreshedRequest.investorContext } : {}), transactionIds });
    dispatch(analysisProgressReceived({ progress: { stage: 'forecast', lastActivityAt: Date.now() }, requestId }));
    if (!window.API.analyzePortfolioLocally) throw new Error('Bitte FinPal neu starten, um die lokale Analyse zu laden.');
    const report = await window.API.analyzePortfolioLocally(refreshedRequest, refreshedSnapshot);
    return { report, snapshot: refreshedSnapshot };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die lokale Analyse ist fehlgeschlagen.');
  } finally { unsubscribe?.(); }
}, { condition: (_args, { getState }) => !getState().portfolioAnalysis.progress });

export const refreshPortfolioForecast = createAsyncThunk<
  { report: PortfolioAnalysisResult; snapshot: string; refreshedAssetIds: number[]; unavailableAssetIds: number[] },
  { request: PortfolioAnalysisRequest; snapshot: string; assetId?: number },
  { state: { portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }; dispatch: ThunkDispatch<{ portfolioAnalysis: AnalysisState; assets: Asset[]; transactions: Transaction[] }, unknown, UnknownAction>; rejectValue: string }
>('portfolioAnalysis/refreshForecast', async ({ request, snapshot, assetId }, { dispatch, getState, requestId, rejectWithValue }) => {
  const transactionIds = getState().transactions.map(transaction => transaction.ID);
  try {
    await dispatch(loadPricesAndDividends({ assetIDs: assetId === undefined ? request.positions.map(position => position.id) : [assetId], preferTradeRepublicPrice: false, includeDividends: false })).unwrap();
    const refreshedRequest = { ...request, positions: buildAnalysisPositions(getState().assets),
      priceUpdatedAt: localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY) ?? request.priceUpdatedAt };
    delete refreshedRequest.targetAssetId;
    delete refreshedRequest.refreshMarketForecasts;
    if (request.investorContext) refreshedRequest.investorContext = {
      ...request.investorContext,
      assets: request.investorContext.assets.map(facts => {
        const asset = getState().assets.find(a => a.ID === facts.assetId);
        return asset ? { ...facts, resolvedTaxContext: resolveTaxContext(asset, facts, request.investorContext!.depotTaxContexts), acquisitionHistory: resolveAcquisitionHistory(asset, getState().transactions, facts, request.investorContext!.depotHistories) } : facts;
      }),
    };
    let profileSnapshot: unknown = request.profile;
    try { profileSnapshot = JSON.parse(snapshot).profile ?? profileSnapshot; } catch { /* Legacy caller without a JSON snapshot. */ }
    const refreshedSnapshot = JSON.stringify({ positions: refreshedRequest.positions, profile: profileSnapshot, priceUpdatedAt: refreshedRequest.priceUpdatedAt,
      ...(refreshedRequest.investorContext ? { investorContext: refreshedRequest.investorContext } : {}), transactionIds });
    dispatch(analysisProgressReceived({ progress: { stage: 'forecast', lastActivityAt: Date.now() }, requestId }));
    if (!window.API.refreshPortfolioForecast) throw new Error('Bitte FinPal neu starten, um Forecasts einzeln zu aktualisieren.');
    const refreshed = await window.API.refreshPortfolioForecast(refreshedRequest, assetId, refreshedSnapshot);
    return { ...refreshed, snapshot: refreshedSnapshot };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Der Forecast konnte nicht aktualisiert werden.');
  }
}, { condition: (_args, { getState }) => !getState().portfolioAnalysis.progress });

export const refreshPortfolioPrimaryRisk = createAsyncThunk<
  PortfolioAnalysisResult,
  { asset: ResearchAsset; investorContext: InvestorContext; documentsOnly?: boolean; reasoningEffort?: import('../../utils/portfolioAnalysis').ReasoningEffort },
  { state: { portfolioAnalysis: AnalysisState }; dispatch: ThunkDispatch<{ portfolioAnalysis: AnalysisState }, unknown, UnknownAction>; rejectValue: string }
>('portfolioAnalysis/refreshPrimaryRisk', async ({ asset, investorContext, documentsOnly, reasoningEffort }, { dispatch, requestId, rejectWithValue }) => {
  let unsubscribe: (() => void) | undefined;
  try {
    if (!window.API.refreshPortfolioPrimaryRisk) throw new Error('Bitte FinPal neu starten, um Unternehmens- und Produktrisiken einzeln zu aktualisieren.');
    unsubscribe = window.API.onPortfolioAnalysisProgress?.(progress => {
      dispatch(analysisProgressReceived({ progress, requestId }));
    });
    return await window.API.refreshPortfolioPrimaryRisk(asset, investorContext, documentsOnly, reasoningEffort);
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die Risikoprüfung konnte nicht aktualisiert werden.');
  } finally { unsubscribe?.(); }
}, { condition: (_asset, { getState }) => !getState().portfolioAnalysis.progress });

export const refreshPortfolioResearch = createAsyncThunk<
  PortfolioAnalysisResult,
  ResearchAsset,
  { state: { portfolioAnalysis: AnalysisState }; dispatch: ThunkDispatch<{ portfolioAnalysis: AnalysisState }, unknown, UnknownAction>; rejectValue: string }
>('portfolioAnalysis/refreshResearch', async (asset, { dispatch, requestId, rejectWithValue }) => {
  let unsubscribe: (() => void) | undefined;
  try {
    if (!window.API.refreshPortfolioResearch) throw new Error('Bitte FinPal neu starten, um Online-Recherche einzeln zu aktualisieren.');
    unsubscribe = window.API.onPortfolioAnalysisProgress?.(progress => {
      dispatch(analysisProgressReceived({ progress, requestId }));
    });
    return await window.API.refreshPortfolioResearch(asset);
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die Online-Recherche konnte nicht aktualisiert werden.');
  } finally { unsubscribe?.(); }
}, { condition: (_asset, { getState }) => !getState().portfolioAnalysis.progress });

const slice = createSlice({
  name: 'portfolioAnalysis', initialState,
  reducers: {
    setAnalysisOpen(state, action: PayloadAction<boolean>) { state.open = action.payload; },
    restoreAnalysisLog(state, action: PayloadAction<AnalysisLog>) { if (!state.log) state.log = action.payload; },
    clearAnalysisResult(state) { state.restoreBlocked = true; state.result = null; state.lastResult = null; state.resultSnapshot = ''; state.error = null; },
    analysisProgressReceived(state, action: PayloadAction<{ progress: PortfolioAnalysisProgress; requestId: string }>) {
      if (state.requestId === action.payload.requestId) { state.progress = action.payload.progress; appendLogProgress(state, action.payload.progress); }
    },
  },
  extraReducers: builder => builder
    .addCase(analysisPriceRefreshProgress, (state, action) => {
      if (state.progress?.stage !== 'prices') return;
      state.progress = { ...state.progress, activeAssetId: action.payload.assetId,
        researchCompleted: action.payload.completed, researchTotal: action.payload.total, lastActivityAt: action.payload.at };
      appendLogProgress(state, state.progress);
    })
    .addCase(restorePortfolioAnalysis.fulfilled, (state, action) => {
      if (state.restoreBlocked || !action.payload) return;
      state.result = action.payload.report; state.lastResult = action.payload.report;
      state.resultSnapshot = action.payload.snapshot;
      state.provider = action.payload.provider; state.model = action.payload.report.model;
      state.open = true;
    })
    .addCase(analyzePortfolio.pending, (state, action) => {
      state.targetAssetId = action.meta.arg.request.targetAssetId ?? null;
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'preparing', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      startLog(state, action.meta.arg.request, false);
      state.provider = action.meta.arg.request.provider;
      state.model = action.meta.arg.request.model ?? '';
      // Keep the previous report and its cards visible until the replacement is complete.
      state.error = null;
    })
    .addCase(analyzePortfolio.fulfilled, (state, action) => {
      finishLog(state, 'completed', 'Analyse abgeschlossen und Ergebnis gespeichert.');
      state.targetAssetId = null;
      state.restoreBlocked = true;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload.report;
      state.result = action.payload.report;
      if (action.meta.arg.request.targetAssetId === undefined) state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(analyzePortfolio.rejected, (state, action) => {
      finishLog(state, 'failed', `Analyse fehlgeschlagen: ${action.payload ?? action.error.message ?? 'Unbekannter Fehler'}`);
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die KI-Anfrage ist fehlgeschlagen.';
    })
    .addCase(analyzePortfolioLocally.pending, (state, action) => {
      state.targetAssetId = null;
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'prices', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      startLog(state, action.meta.arg.request, true);
      state.error = null;
    })
    .addCase(analyzePortfolioLocally.fulfilled, (state, action) => {
      finishLog(state, 'completed', 'Lokale Analyse abgeschlossen und Ergebnis gespeichert.');
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload.report;
      state.result = action.payload.report;
      state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(analyzePortfolioLocally.rejected, (state, action) => {
      finishLog(state, 'failed', `Lokale Analyse fehlgeschlagen: ${action.payload ?? action.error.message ?? 'Unbekannter Fehler'}`);
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die lokale Analyse ist fehlgeschlagen.';
    })
    .addCase(refreshPortfolioForecast.pending, (state, action) => {
      state.targetAssetId = action.meta.arg.assetId ?? null;
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'prices', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.error = null;
    })
    .addCase(refreshPortfolioForecast.fulfilled, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload.report;
      state.result = action.payload.report;
      state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(refreshPortfolioForecast.rejected, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Der Forecast konnte nicht aktualisiert werden.';
    })
    .addCase(refreshPortfolioPrimaryRisk.pending, (state, action) => {
      state.targetAssetId = action.meta.arg.asset.id;
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'risk-review', activeAssetId: action.meta.arg.asset.id, activeRiskStep: 'documents', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.error = null;
    })
    .addCase(refreshPortfolioPrimaryRisk.fulfilled, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload;
      state.result = action.payload;
    })
    .addCase(refreshPortfolioPrimaryRisk.rejected, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die Risikoprüfung konnte nicht aktualisiert werden.';
    })
    .addCase(refreshPortfolioResearch.pending, (state, action) => {
      state.targetAssetId = action.meta.arg.id;
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'research', activeAssetId: action.meta.arg.id, researchCompleted: 0, researchTotal: 1, lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.error = null;
    })
    .addCase(refreshPortfolioResearch.fulfilled, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload;
      state.result = action.payload;
    })
    .addCase(refreshPortfolioResearch.rejected, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die Online-Recherche konnte nicht aktualisiert werden.';
    }),
});
export const { setAnalysisOpen, clearAnalysisResult, analysisProgressReceived, restoreAnalysisLog } = slice.actions;
export default slice.reducer;
