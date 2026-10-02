import { configureStore } from '@reduxjs/toolkit'
import rootReducer from './reducers';
import { restorePortfolioAnalysis } from './portfolioAnalysis/portfolioAnalysis.reducer';

export function setupStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState
  })
  void store.dispatch(restorePortfolioAnalysis());
  return store;
}

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']