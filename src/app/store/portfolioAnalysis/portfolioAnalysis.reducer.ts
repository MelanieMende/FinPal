import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PortfolioAnalysisRequest, PortfolioAnalysisResult, PortfolioAnalysisProgress } from '../../utils/portfolioAnalysis';

interface AnalysisState {
  open: boolean;
  progress: PortfolioAnalysisProgress | null;
  startedAt: number;
  result: PortfolioAnalysisResult | null;
  resultSnapshot: string;
  error: string | null;
  requestId: string | null;
  provider: 'chatgpt' | 'api';
  model: string;
}
const initialState: AnalysisState = {
  open: false, progress: null, startedAt: 0, result: null, resultSnapshot: '', error: null,
  requestId: null, provider: 'chatgpt', model: '',
};

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
    const report = await window.API.analyzePortfolio(request);
    return { report, snapshot };
  } catch (error) {
    return rejectWithValue(error instanceof Error ? error.message : 'Die KI-Anfrage ist fehlgeschlagen.');
  } finally { unsubscribe?.(); }
}, { condition: (_args, { getState }) => !getState().portfolioAnalysis.progress });

const slice = createSlice({
  name: 'portfolioAnalysis', initialState,
  reducers: {
    setAnalysisOpen(state, action: PayloadAction<boolean>) { state.open = action.payload; },
    clearAnalysisResult(state) { state.result = null; state.resultSnapshot = ''; state.error = null; },
    analysisProgressReceived(state, action: PayloadAction<{ progress: PortfolioAnalysisProgress; requestId: string }>) {
      if (state.requestId === action.payload.requestId) state.progress = action.payload.progress;
    },
  },
  extraReducers: builder => builder
    .addCase(analyzePortfolio.pending, (state, action) => {
      state.startedAt = Date.now();
      state.progress = { stage: 'preparing', lastActivityAt: state.startedAt };
      state.requestId = action.meta.requestId;
      state.provider = action.meta.arg.request.provider;
      state.model = action.meta.arg.request.model ?? '';
      state.result = null; state.resultSnapshot = ''; state.error = null;
    })
    .addCase(analyzePortfolio.fulfilled, (state, action) => {
      state.progress = null; state.requestId = null;
      state.result = action.payload.report; state.resultSnapshot = action.payload.snapshot;
    })
    .addCase(analyzePortfolio.rejected, (state, action) => {
      state.progress = null; state.requestId = null;
      state.error = action.payload ?? action.error.message ?? 'Die KI-Anfrage ist fehlgeschlagen.';
    }),
});
export const { setAnalysisOpen, clearAnalysisResult, analysisProgressReceived } = slice.actions;
export default slice.reducer;
