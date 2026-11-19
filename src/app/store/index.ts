import { configureStore } from '@reduxjs/toolkit'
import rootReducer from './reducers';
import { ANALYSIS_LOG_KEY, restoreAnalysisLog, restorePortfolioAnalysis, type AnalysisLog } from './portfolioAnalysis/portfolioAnalysis.reducer';

export function setupStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState
  })
  try {
    const value = localStorage.getItem(ANALYSIS_LOG_KEY);
    if (value && value.length <= 2_000_000) {
      const saved = JSON.parse(value) as AnalysisLog;
      if (saved && typeof saved.title === 'string' && Number.isFinite(saved.startedAt) && Array.isArray(saved.entries)
        && saved.entries.length <= 1001 && saved.entries.every(entry => entry && Number.isFinite(entry.at) && entry.at >= 0 && entry.at <= 8640000000000000
          && (entry.message === undefined || typeof entry.message === 'string') && (entry.progress === undefined || entry.progress && typeof entry.progress.stage === 'string'))
        && saved.assetNames && typeof saved.assetNames === 'object' && ['running', 'completed', 'failed', 'interrupted'].includes(saved.status)) {
        if (saved.status === 'running') {
          saved.status = 'interrupted';
          saved.entries.push({ at: Date.now(), message: 'Die Anwendung wurde während des Laufs geschlossen oder neu geladen; der Ausgang ist nicht bekannt.' });
        }
        store.dispatch(restoreAnalysisLog(saved));
      }
    }
  } catch { /* Damaged or unavailable local storage must not prevent startup. */ }
  let lastLog = store.getState().portfolioAnalysis.log;
  if (lastLog?.status === 'interrupted') try { localStorage.setItem(ANALYSIS_LOG_KEY, JSON.stringify(lastLog)); } catch { /* Storage is optional. */ }
  store.subscribe(() => {
    const log = store.getState().portfolioAnalysis.log;
    if (log === lastLog) return;
    lastLog = log;
    try { if (log) localStorage.setItem(ANALYSIS_LOG_KEY, JSON.stringify(log)); } catch { /* Analysis continues without local log persistence. */ }
  });
  void store.dispatch(restorePortfolioAnalysis());
  return store;
}

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']
