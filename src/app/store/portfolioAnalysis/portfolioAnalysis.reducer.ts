import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PortfolioAnalysisRequest, PortfolioAnalysisResult, PortfolioAnalysisProgress, SavedPortfolioAnalysis } from '../../utils/portfolioAnalysis';

interface AnalysisState {
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
  { state: { portfolioAnalysis: AnalysisState }; rejectValue: string }
>('portfolioAnalysis/analyze', async ({ request, snapshot }, { dispatch, requestId, rejectWithValue }) => {
  let unsubscribe: (() => void) | undefined;
  try {
    // The request and listener belong to the app store, independent of route mounts.
    unsubscribe = window.API.onPortfolioAnalysisProgress?.(progress => {
      dispatch(analysisProgressReceived({ progress, requestId }));
    });
    const report = await window.API.analyzePortfolio(request, snapshot);
    return { report, snapshot };
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
      state.restoreBlocked = true;
      state.startedAt = Date.now();
      state.progress = { stage: 'preparing', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.provider = action.meta.arg.request.provider;
      state.model = action.meta.arg.request.model ?? '';
      state.result = null; state.resultSnapshot = ''; state.error = null;
    })
    .addCase(analyzePortfolio.fulfilled, (state, action) => {
      state.restoreBlocked = true;
      state.progress = null; state.requestId = null;
      state.lastResult = action.payload.report;
      state.result = action.payload.report; state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(analyzePortfolio.rejected, (state, action) => {
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die KI-Anfrage ist fehlgeschlagen.';
    }),
});
export const { setAnalysisOpen, clearAnalysisResult, analysisProgressReceived } = slice.actions;
export default slice.reducer;
