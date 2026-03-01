# FinPal AI Coding Instructions

This project is an **Electron‑based finance dashboard** built with React, Redux Toolkit, TypeScript, Tailwind and Vite.  AI agents should understand the application structure, common coding patterns and developer workflows before contributing.

---
## 🔧 High‑Level Architecture

1. **Process split**
   * `src/main.ts` – Electron main process, handles configuration, database access and external HTTP calls.  `ipcMain` handlers respond to renderer requests.
   * `src/preload.ts` – exposes a thin `window.API` bridge using `contextBridge`.  All renderer code calls `window.API.*`.
   * `src/renderer.ts` – entry point for the renderer; simply imports the React `app` module.
   * `src/app` – the React/Redux application.

2. **State management**
   * Redux Toolkit slices live under `src/app/store/<feature>`.  A `reducers.ts` file combines them.
   * Asynchronous work is implemented with `createAsyncThunk` inside the slice file (see `assets.reducer.ts` for examples).  Thunks dispatch `setX` actions and call `window.API` for side‑effects.
   * Typed hooks (`useAppSelector`/`useAppDispatch`) are defined in `src/app/hooks.ts` and used throughout.

3. **Data persistence**
   * SQLite is the only persistence layer.  SQL scripts are plain text exported from `src/sql/*.ts`.  RootRoute imports them to create tables/views (see `RootRoute.tsx` initialization chain).
   * All DB operations are raw SQL strings sent via `window.API.sendToDB` and handled in `main.ts` with `sqlite3`.
   * When adding a table/view, create a new SQL file and call `sendToDB` during app start (RootRoute).

4. **External services**
   * Yahoo Finance and DivvyDiary APIs are invoked from the renderer by thunks.  They go through `ipcMain` handlers (`yahoo-finance-api-message`, `divvy-diary-api-message`) and return results back to `loadPricesAndDividends` in `assets.reducer.ts`.
   * Currency conversion uses the `easy-currencies` library inside the thunk.

5. **Styling & UI**
   * Tailwind CSS classes are used directly in JSX.  Blueprint Active for components.
   * Routes/components are split under `src/app/routes` and `src/app/components`.
   * Routes often import reducers and dispatch actions directly (see `RootRoute.tsx`).

6. **Types**
   * Global extensions are in `src/types.d.ts` (especially `window.API` signatures).
   * Feature‑specific interfaces appear adjacent to reducers or in `src/app/store/State.d.ts`.

---
## 🧪 Testing conventions

* Jest + `ts-jest` with `jsdom` environment.  Tests run via `npx jest` (there isn’t a dedicated npm script).
* `setupTests.ts` defines a fake `window.API` object.  Any new method added to preload must be added to `types.d.ts` and mocked here.
* Custom render helper in `src/testing/test-utils.tsx` wraps components with Redux store and adds project‑specific queries.
* Component tests live alongside components (`Foo.test.tsx`) and often use `redux-mock-store` or `preloadedState`.

## 📦 Project workflows

1. **Environment setup**
   ```bash
   npm install   # or yarn
   ```
2. **Run in development**
   ```bash
   npm run start   # electron-forge with Vite
   ```
3. **Build/pack**
   ```bash
   npm run package
   npm run make     # create installers
   ```
4. **Linting**
   ```bash
   npm run lint     # ESLint with TS rules
   ```
5. **Tests**
   ```bash
   npx jest --watch   # or npx jest <path>
   ```

> ⚠️ tests rely on `window.API` mocks; importing the real API from main/preload will break them.

## 🧭 Key patterns & conventions

* **Feature folders**: each domain (`assets`, `transactions`, etc.) has its own slice, selectors, components and tests.
* **Redux slices**: defined with `createSlice`; updates return new arrays using `.map`.  Async thunks dispatch other actions rather than returning payloads.
* **DB integration**: raw SQL strings exported from `src/sql/*.ts`.  RootRoute imports and executes them on startup to create tables, views and initialize `ID` counters.
* **IPC bridge**: `window.API` methods (`sendToDB`, `sendToYahooFinanceAPI`, etc.) are the only way renderer talks to main.  Always use them from thunks or components.
* **Thunks do side‑effects**: conversions with `easy-currencies`, external HTTP via `window.API` – look at `assets.reducer.ts` for the pattern.
* **Routing**: `RootRoute.tsx` chooses one of four tabbed routes and contains helper helpers (`sendToDB`, `setTheme`, etc.) used by tests.
* **Type declarations**: add new global types in `src/types.d.ts` instead of scattering `any`.
* **Styling**: Tailwind utility classes plus Blueprint components; most JSX uses `className` strings directly.
* **SQL errors**: helper `sendToDB` logs `SQLITE_ERROR` strings; check console when debugging.

## 🔗 Integration points

* **SQLite**: via `sqlite3` in main process. `ipcMain.on('async-db-message')` executes queries and replies with results.
* **Config file**: JSON stored in `app.getPath('userData')/config.json`; main process reads/writes it.  Changes are propagated via ipc handlers (`save-theme`, etc.).
* **External APIs**: main process handlers forward to `yahoo-finance2` or `fetch`/`node-fetch` for DivvyDiary.

## 📝 Adding a new feature

1. Add SQL file under `src/sql` for tables/views.
2. Import it in `RootRoute.tsx` and call `sendToDB` during `fetchConfig` initialization.
3. Create a Redux slice in `src/app/store/<feature>` with types, reducer and thunks.
4. Add new route/component under `src/app/routes` and update `RootRoute` navigation.
5. Write tests using `test-utils` and mock `window.API` as needed.

---

> 📣 **Feedback welcome** – if any section looks unclear or missing details go ahead and ask for clarification.