import { createAsyncThunk, createSlice, type PayloadAction, type ThunkDispatch, type UnknownAction } from '@reduxjs/toolkit';
import { loadPricesAndDividends } from '../assets/assets.reducer';
import { buildAnalysisPositions } from '../../utils/portfolioAnalysis';
import { MARKET_PRICE_UPDATED_AT_KEY } from '../../utils/syncTimestamps';
import { resolveAcquisitionHistory } from '../../utils/investorFacts';
import type { PortfolioAnalysisRequest, PortfolioAnalysisResult, PortfolioAnalysisProgress, SavedPortfolioAnalysis } from '../../utils/portfolioAnalysis';

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
}
const initialState: AnalysisState = {
  open: false, progress: null, startedAt: 0, result: null, lastResult: null, resultSnapshot: '', error: null,
  requestId: null, provider: 'chatgpt', model: '', restoreBlocked: false,
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
      preferTradeRepublicPrice: false, includeDividends: false,
    })).unwrap();
    const refreshedRequest = { ...request,
      positions: buildAnalysisPositions(getState().assets),
      priceUpdatedAt: localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY) ?? request.priceUpdatedAt,
    };
    if (request.investorContext) refreshedRequest.investorContext = {
      ...request.investorContext,
      assets: request.investorContext.assets.map(facts => {
        const asset = getState().assets.find(a => a.ID === facts.assetId);
        return asset ? { ...facts, acquisitionHistory: resolveAcquisitionHistory(asset, getState().transactions, facts, request.investorContext.depotHistories) } : facts;
      }),
    };
    // Preserve the form's string values for the UI change detector.
    let profileSnapshot: unknown = request.profile;
    try { profileSnapshot = JSON.parse(snapshot).profile ?? profileSnapshot; } catch { /* Legacy caller without a JSON snapshot. */ }
    const refreshedSnapshot = JSON.stringify({ positions: refreshedRequest.positions, profile: profileSnapshot, priceUpdatedAt: refreshedRequest.priceUpdatedAt,
      ...(refreshedRequest.investorContext ? { investorContext: refreshedRequest.investorContext } : {}), transactionIds });
    dispatch(analysisProgressReceived({ progress: { stage: 'preparing', lastActivityAt: Date.now() }, requestId }));
    const report = await window.API.analyzePortfolio(refreshedRequest, refreshedSnapshot);
    return { report, snapshot: refreshedSnapshot };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die KI-Anfrage ist fehlgeschlagen.');
  } finally { unsubscribe?.(); }
}, { condition: (_args, { getState }) => !getState().portfolioAnalysis.progress });

const slice = createSlice({
  name: 'portfolioAnalysis', initialState,
  reducers: {
    setAnalysisOpen(state, action: PayloadAction<boolean>) { state.open = action.payload; },
    clearAnalysisResult(state) { state.restoreBlocked = true; state.result = null; state.lastResult = null; state.resultSnapshot = ''; state.error = null; },
    analysisProgressReceived(state, action: PayloadAction<{ progress: PortfolioAnalysisProgress; requestId: string }>) {
      if (state.requestId === action.payload.requestId) state.progress = action.payload.progress;
    },
  },
  extraReducers: builder => builder
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
      state.progress = { stage: 'prices', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.provider = action.meta.arg.request.provider;
      state.model = action.meta.arg.request.model ?? '';
      // Retain the last snapshot for asset execution indicators while a new report is pending.
      if (action.meta.arg.request.targetAssetId === undefined) state.result = null;
      state.error = null;
    })
    .addCase(analyzePortfolio.fulfilled, (state, action) => {
      state.targetAssetId = null;
      state.restoreBlocked = true;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload.report;
      state.result = action.payload.report;
      if (action.meta.arg.request.targetAssetId === undefined) state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(analyzePortfolio.rejected, (state, action) => {
      state.targetAssetId = null;
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die KI-Anfrage ist fehlgeschlagen.';
    }),
});
export const { setAnalysisOpen, clearAnalysisResult, analysisProgressReceived } = slice.actions;
export default slice.reducer;
