import React, { PropsWithChildren } from 'react'
import { render, queries, within, RenderOptions } from '@testing-library/react'
import * as customQueries from './custom-queries'
import { Provider } from 'react-redux'

import type { AppStore, RootState } from '../app/store'
import { setupStore } from '../app/store'

const allQueries = {
  ...queries,
  ...customQueries,
}

const customScreen = within(document.body, allQueries)
const customWithin = (element: any) => within(element, allQueries)

// This type interface extends the default options for render from RTL, as well
// as allows the user to specify other things such as initialState, store.
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: Partial<RootState>
  store?: AppStore
}

const customRender = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    // Automatically create a store instance if no store was passed in
    store = setupStore(preloadedState),
    ...renderOptions
  }: ExtendedRenderOptions = {}
) => {
  function Wrapper({ children }: PropsWithChildren<{}>): JSX.Element {
    return <Provider store={store}>{children}</Provider>
  }
  return { store, ...render(ui, { wrapper: Wrapper, queries: allQueries, ...renderOptions }) }
}

export * from '@testing-library/react'
export {customScreen as screen, customWithin as within, customRender as render}