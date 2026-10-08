import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import { setupStore } from '../../../../store';
import { setCashInternal } from '../../../../store/cash/cash.reducer';
import { setTransactionsInternal } from '../../../../store/transactions/transactions.reducer';
import { setDividendsInternal } from '../../../../store/dividends/dividends.reducer';
import { analyzePortfolio } from '../../../../store/portfolioAnalysis/portfolioAnalysis.reducer';
import AssetList from '../../AssetsRoute/components/AssetList/AssetList';
import { buildAnalysisPositions } from '../../../../utils/portfolioAnalysis';
import PortfolioAnalysis, { ANALYSIS_PROFILE_KEY, ANALYSIS_MODEL_KEY } from './PortfolioAnalysis';
import AnalysisRoute from '../AnalysisRoute';
import { MARKET_PRICE_UPDATED_AT_KEY, MARKET_PRICE_UPDATED_EVENT } from '../../../../utils/syncTimestamps';

const assets = [
  { ID: 1, name: 'Stock Asset', type: 'Stock', current_shares: 2, price: 50 },
  { ID: 2, name: 'Crypto Asset', type: 'Crypto', current_shares: 1, price: 75 },
  { ID: 3, name: 'Sold Asset', current_shares: 0 },
] as Asset[];
const chatGpt = { connected: true, activeClientId: 'test-client', accounts: [{ clientId: 'test-client', label: 'Test account', connected: true }] };
beforeEach(() => {
  localStorage.clear();
  window.API = {
    sendToDB: jest.fn(),
    sendToYahooFinanceAPI: jest.fn().mockResolvedValue(null),
    getPortfolioAIStatus: jest.fn().mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true, model: 'api-model', chatGpt }),
    getPortfolioChatGptModels: jest.fn().mockResolvedValue([{ slug: 'account-model', displayName: 'Available model' }]),
    analyzePortfolio: jest.fn().mockResolvedValue({ summary: 'Diversifikation prüfen', warnings: ['Risiken berücksichtigen'], sources: [{ title: 'Report', url: 'https://example.com/report' }], generatedAt: '2026-10-02T10:00:00Z', priceUpdatedAt: null, model: 'account-model', recommendations: [
      { assetId: 1, action: 'Halten', rationale: 'Begründung', risk: 'Risiko', sourceIndexes: [0], tradeCheck: {
        costs: '100 EUR Marktwert, 1 EUR Gebühren entsprechen 1 %.', taxes: 'Verlusttöpfe unbekannt.', conclusion: 'Kein Verkauf zur Bereinigung.',
      } },
      { assetId: 2, action: 'Prüfen', rationale: 'Mehr Daten nötig', risk: 'Volatilität', sourceIndexes: [] },
    ] }),
  };
});

async function open() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Portfolio analysieren' })); });
}

it('displays sourced new assets outside the local asset list and keeps them after a route remount', async () => {
  const response = await window.API.analyzePortfolio({} as never);
  jest.mocked(window.API.analyzePortfolio).mockClear();
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response, newAssetRecommendations: [{
    name: 'New ETF', isin: 'IE00B4L5Y983', symbol: 'IWDA', type: 'ETF', action: 'Kaufen',
    rationale: 'Breitere Diversifikation', risk: 'Marktrisiko', sourceIndexes: [0],
  }] });
  const { store, unmount } = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const check = () => {
    const section = within(screen.getByRole('region', { name: 'Neue Kaufideen' }));
    expect(section.getByText('New ETF')).toBeInTheDocument();
    expect(section.getByText(/IE00B4L5Y983/)).toHaveTextContent('IWDA');
    expect(section.getByText('Kaufen')).toBeInTheDocument();
    expect(section.getByText('Risiken: Marktrisiko')).toBeInTheDocument();
    expect(section.getByRole('link', { name: '[0] Report' })).toHaveAttribute('href', 'https://example.com/report');
  };
  check(); unmount();
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={null} />, { store }); });
  check();
  expect(store.getState().assets).toEqual(assets);
});

it('opens the analysis form directly in its route and updates the displayed price time', async () => {
  localStorage.setItem(MARKET_PRICE_UPDATED_AT_KEY, '2026-10-01T10:30:00.000Z');
  await act(async () => { render(<AnalysisRoute />, { preloadedState: { assets } }); });
  expect(screen.getByLabelText('Anlageziel')).toBeInTheDocument();
  expect(screen.getByText(/Marktpreise zuletzt aktualisiert/)).toHaveTextContent('01.10.26');
  act(() => window.dispatchEvent(new CustomEvent(MARKET_PRICE_UPDATED_EVENT, { detail: '2026-10-02T10:30:00.000Z' })));
  expect(screen.getByText(/Marktpreise zuletzt aktualisiert/)).toHaveTextContent('02.10.26');
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
});
function fillProfile() {
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'medium' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
}

it('displays the shared financing check and its unresolved deductions', async () => {
  const response = await window.API.analyzePortfolio({} as never);
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response, fundingCheck: {
    status: 'conditional', cashEUR: 10, saleProceedsEUR: 50, buyAmountEUR: 54, feeScenarioEUR: 4,
    balanceBeforeSpreadAndTaxEUR: 2, shortfallEUR: 0, warnings: ['Verkaufssteuern und Spreads noch offen.'],
  } });
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const section = within(screen.getByRole('region', { name: 'Finanzierungsprüfung' }));
  expect(section.getByText('50,00 €')).toBeInTheDocument();
  expect(section.getByText('54,00 €')).toBeInTheDocument();
  expect(section.getByText('4,00 €')).toBeInTheDocument();
  expect(section.getByText('2,00 €')).toBeInTheDocument();
  expect(section.getByText('Verkaufssteuern und Spreads noch offen.')).toBeInTheDocument();
});

it('starts a single asset refresh, keeps existing results visible and preserves them on failure', async () => {
  const { store } = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const original = store.getState().portfolioAnalysis.result;
  let reject: (error: Error) => void;
  jest.mocked(window.API.analyzePortfolio).mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Asset 1 neu analysieren' })); });
  expect(window.API.analyzePortfolio).toHaveBeenLastCalledWith(expect.objectContaining({ targetAssetId: 1, positions: expect.arrayContaining([expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })]) }), expect.any(String));
  expect(screen.getByText('Begründung')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Asset 2 neu analysieren' })).toBeDisabled();
  await act(async () => { reject(new Error('Einzelanalyse fehlgeschlagen')); });
  expect(screen.getByRole('alert')).toHaveTextContent('Einzelanalyse fehlgeschlagen');
  expect(store.getState().portfolioAnalysis.result).toEqual(original);
  expect(screen.getByRole('button', { name: 'Asset 1 neu analysieren' })).toBeEnabled();
});

it('uses live total liquidity instead of a saved budget and marks results stale when liquidity changes', async () => {
  localStorage.setItem(ANALYSIS_PROFILE_KEY, JSON.stringify({ goal: 'growth', risk: 'medium', horizonYears: '10', buyBudget: '999' }));
  const cash = [
    { ID: 1, date: '2026-10-04', type: 'Deposit', amount: 200, fee: 2 },
    { ID: 2, date: '2026-10-04', type: 'Withdrawal', amount: 50, fee: 1 },
    { ID: 3, date: '2026-10-04', type: 'Interest', amount: 5 },
  ];
  const { store } = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: {
    assets, cash,
    transactions: [{ in_out: -80 }, { in_out: 20 }] as Transaction[],
    dividends: [{ income: 8.5 }] as Dividend[],
  } });
  await open();
  const budget = screen.getByLabelText('Zusätzliches Kaufbudget (EUR)');
  expect(budget).toHaveValue('100,50');
  expect(budget).toHaveAttribute('readonly');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(window.API.analyzePortfolio).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ buyBudget: 100.5 }),
  }), expect.any(String));
  expect(screen.queryByText(/haben sich seit dieser Analyse/)).not.toBeInTheDocument();
  act(() => { store.dispatch(setCashInternal([...cash, { ID: 4, date: '2026-10-04', type: 'Deposit', amount: 50 }])); });
  expect(budget).toHaveValue('150,50');
  expect(screen.getByRole('status')).toHaveTextContent('haben sich seit dieser Analyse geändert');
  act(() => { store.dispatch(setTransactionsInternal([])); });
  expect(budget).toHaveValue('210,50');
  act(() => { store.dispatch(setDividendsInternal([])); });
  expect(budget).toHaveValue('202,00');
});

it('does not transmit data until started and analyzes all held positions using the ChatGPT subscription', async () => {
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Anlagedauer'));
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(window.API.analyzePortfolio).toHaveBeenCalledWith(expect.objectContaining({
    provider: 'chatgpt', model: 'account-model', profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 },
    positions: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })],
  }), expect.any(String));
  expect(screen.getByText('Diversifikation prüfen')).toBeInTheDocument();
  const tradeCheck = within(screen.getByLabelText('Kosten- und Steuerprüfung'));
  expect(tradeCheck.getByText(/100 EUR Marktwert/)).toBeInTheDocument();
  expect(tradeCheck.getByText(/Verlusttöpfe unbekannt/)).toBeInTheDocument();
  expect(tradeCheck.getByText(/Kein Verkauf zur Bereinigung/)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: '[0] Report' })[0]).toHaveAttribute('href', 'https://example.com/report');
  expect(localStorage.getItem(ANALYSIS_PROFILE_KEY)).toContain('growth');
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '5' } });
  expect(screen.getByRole('status')).toHaveTextContent('haben sich seit dieser Analyse geändert');
});

it('reports a quota failure and restores the analysis button', async () => {
  jest.mocked(window.API.analyzePortfolio).mockRejectedValue(new Error('ChatGPT-Kontingent ausgeschöpft'));
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } }); await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(screen.getByRole('alert')).toHaveTextContent('ChatGPT-Kontingent ausgeschöpft');
  expect(screen.getByRole('button', { name: 'Analyse starten' })).not.toBeDisabled();
});

it('offers ChatGPT browser sign-in without asking for an API key', async () => {
  jest.mocked(window.API.getPortfolioAIStatus).mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true, model: 'api-model', chatGpt: { connected: false, accounts: [] } });
  window.API.signInPortfolioChatGpt = jest.fn().mockResolvedValue(chatGpt);
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } }); await open();
  expect(screen.queryByLabelText('OpenAI-API-Schlüssel')).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continue with ChatGPT' })); });
  expect(window.API.signInPortfolioChatGpt).toHaveBeenCalled();
});


it('shows real progress, elapsed time and waiting time until the request finishes', async () => {
  let progressCallback: (progress: import('../../../../utils/portfolioAnalysis').PortfolioAnalysisProgress) => void;
  const unsubscribe = jest.fn();
  window.API.onPortfolioAnalysisProgress = jest.fn(callback => { progressCallback = callback; return unsubscribe; });
  let rejectAnalysis: (error: Error) => void;
  jest.mocked(window.API.analyzePortfolio).mockImplementation(() => new Promise((_resolve, reject) => { rejectAnalysis = reject; }));
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  jest.useFakeTimers();
  try {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
    expect(screen.getByRole('status')).toHaveTextContent('KI-Verbindung wird vorbereitet');
    act(() => progressCallback({ stage: 'research', lastActivityAt: Date.now() }));
    expect(screen.getByRole('status')).toHaveTextContent('Aktuelle Quellen werden recherchiert');
    act(() => jest.advanceTimersByTime(65000));
    expect(screen.getByText(/Laufzeit:/)).toHaveTextContent('Laufzeit: 1:05');
    expect(screen.getByText(/Laufzeit:/)).toHaveTextContent('Letzte Rückmeldung vor 65 s');
    act(() => progressCallback({ stage: 'analysis', lastActivityAt: Date.now() }));
    expect(screen.getByRole('status')).toHaveTextContent('Portfolio und Empfehlungen werden analysiert');
    expect(screen.getByText(/Laufzeit:/)).toHaveTextContent('Letzte Rückmeldung vor 0 s');
    fireEvent.click(screen.getByRole('button', { name: 'Analyse schließen' }));
    expect(screen.getByRole('status')).toHaveTextContent('Portfolio und Empfehlungen werden analysiert');
    await act(async () => rejectAnalysis(new Error('Zeitlimit erreicht')));
    expect(screen.queryByLabelText('Laufende Analyse')).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});


it.each(['success', 'failure'] as const)('keeps progress and a %s outcome across route unmounts', async outcome => {
  const savedReport = await window.API.analyzePortfolio({} as import('../../../../utils/portfolioAnalysis').PortfolioAnalysisRequest);
  jest.mocked(window.API.analyzePortfolio).mockClear();
  let progressCallback: (progress: import('../../../../utils/portfolioAnalysis').PortfolioAnalysisProgress) => void;
  const unsubscribe = jest.fn();
  window.API.onPortfolioAnalysisProgress = jest.fn(callback => { progressCallback = callback; return unsubscribe; });
  let resolveAnalysis: (report: typeof savedReport) => void;
  let rejectAnalysis: (error: Error) => void;
  jest.mocked(window.API.analyzePortfolio).mockImplementation(() => new Promise((resolve, reject) => {
    resolveAnalysis = resolve; rejectAnalysis = reject;
  }));
  const first = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const startedAt = first.store.getState().portfolioAnalysis.startedAt;
  first.unmount();
  expect(unsubscribe).not.toHaveBeenCalled();
  act(() => progressCallback({ stage: 'analysis', lastActivityAt: Date.now() }));
  const second = render(<PortfolioAnalysis priceUpdatedAt={null} />, { store: first.store });
  expect(screen.getByRole('status')).toHaveTextContent('Portfolio und Empfehlungen werden analysiert');
  expect(screen.getByRole('button', { name: 'Analyse starten' })).toBeDisabled();
  expect(first.store.getState().portfolioAnalysis.startedAt).toBe(startedAt);
  expect(window.API.analyzePortfolio).toHaveBeenCalledTimes(1);
  second.unmount();
  await act(async () => {
    if (outcome === 'success') resolveAnalysis(savedReport);
    else rejectAnalysis(new Error('Zeitlimit erreicht'));
  });
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={null} />, { store: first.store }); });
  expect(screen.queryByLabelText('Laufende Analyse')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Analyse starten' })).not.toBeDisabled();
  if (outcome === 'success') {
    expect(screen.getByText(savedReport.summary)).toBeInTheDocument();
    expect(screen.queryByText(/haben sich seit dieser Analyse/)).not.toBeInTheDocument();
  } else expect(screen.getByRole('alert')).toHaveTextContent('Zeitlimit erreicht');
});


it.each(['tab change', 'app restart'] as const)('remembers an explicitly selected model after a %s before an analysis is started', async mode => {
  const available = [
    { slug: 'account-model', displayName: 'Available model' },
    { slug: 'chosen-model', displayName: 'Chosen model' },
  ];
  jest.mocked(window.API.getPortfolioChatGptModels).mockResolvedValue(available);
  const first = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  fireEvent.change(screen.getByLabelText('ChatGPT-Modell'), { target: { value: 'chosen-model' } });
  expect(localStorage.getItem(ANALYSIS_MODEL_KEY)).toBe('chosen-model');
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  first.unmount();
  const second = render(<PortfolioAnalysis priceUpdatedAt={null} />, mode === 'tab change' ? { store: first.store } : { preloadedState: { assets } });
  if (mode === 'app restart') await open();
  await waitFor(() => expect(screen.getByLabelText('ChatGPT-Modell')).toHaveValue('chosen-model'));
  fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(window.API.analyzePortfolio).toHaveBeenCalledWith(expect.objectContaining({ model: 'chosen-model' }), expect.any(String));
  second.unmount();
});

it('keeps the saved preference when it is temporarily unavailable and restores it when it returns', async () => {
  localStorage.setItem(ANALYSIS_MODEL_KEY, 'chosen-model');
  const first = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  expect(screen.getByLabelText('ChatGPT-Modell')).toHaveValue('account-model');
  expect(localStorage.getItem(ANALYSIS_MODEL_KEY)).toBe('chosen-model');
  first.unmount();
  jest.mocked(window.API.getPortfolioChatGptModels).mockResolvedValue([
    { slug: 'account-model', displayName: 'Available model' },
    { slug: 'chosen-model', displayName: 'Chosen model' },
  ]);
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={null} />, { store: first.store }); });
  expect(screen.getByLabelText('ChatGPT-Modell')).toHaveValue('chosen-model');
});


it('restores the report and asset indicators on app startup without starting a new analysis', async () => {
  const savedReport = await window.API.analyzePortfolio({} as import('../../../../utils/portfolioAnalysis').PortfolioAnalysisRequest);
  jest.mocked(window.API.analyzePortfolio).mockClear();
  const profile = { goal: 'growth', risk: 'medium', horizonYears: '10', buyBudget: '0' };
  localStorage.setItem(ANALYSIS_PROFILE_KEY, JSON.stringify(profile));
  const snapshot = JSON.stringify({ positions: buildAnalysisPositions(assets), profile, priceUpdatedAt: null });
  window.API.getLastPortfolioAnalysis = jest.fn().mockResolvedValue({ report: savedReport, snapshot, provider: 'chatgpt' });
  await act(async () => { render(<><PortfolioAnalysis priceUpdatedAt={null} /><AssetList /></>, { preloadedState: { assets } }); });
  expect(screen.getByText(savedReport.summary)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'KI-Empfehlung: Halten' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Laufende Analyse')).not.toBeInTheDocument();
  expect(screen.queryByText(/haben sich seit dieser Analyse/)).not.toBeInTheDocument();
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  expect(screen.getByLabelText('ChatGPT-Modell')).toHaveValue('account-model');
});


it('does not replace a newly started analysis with a delayed startup restore', async () => {
  const savedReport = await window.API.analyzePortfolio({} as import('../../../../utils/portfolioAnalysis').PortfolioAnalysisRequest);
  let restore: (value: import('../../../../utils/portfolioAnalysis').SavedPortfolioAnalysis) => void;
  window.API.getLastPortfolioAnalysis = jest.fn(() => new Promise(resolve => { restore = resolve; }));
  const store = setupStore({ assets });
  const request: import('../../../../utils/portfolioAnalysis').PortfolioAnalysisRequest = { provider: 'chatgpt', model: 'account-model', positions: buildAnalysisPositions(assets), profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 }, priceUpdatedAt: null };
  store.dispatch(analyzePortfolio.pending('new-request', { request, snapshot: 'new-snapshot' }));
  await act(async () => restore({ report: savedReport, snapshot: 'old-snapshot', provider: 'chatgpt' }));
  expect(store.getState().portfolioAnalysis.requestId).toBe('new-request');
  expect(store.getState().portfolioAnalysis.result).toBeNull();
  expect(store.getState().portfolioAnalysis.progress?.stage).toBe('prices');
});


it.each(['tab change', 'app restart'] as const)('saves the investment horizon immediately and restores it after a %s without starting an analysis', async mode => {
  const first = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '7.5' } });
  expect(JSON.parse(localStorage.getItem(ANALYSIS_PROFILE_KEY)!)).toEqual({ goal: '', risk: '', horizonYears: '7.5', buyBudget: '0' });
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  first.unmount();
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={null} />, mode === 'tab change' ? { store: first.store } : { preloadedState: { assets } }); });
  if (mode === 'app restart') await open();
  expect(screen.getByLabelText('Anlagedauer (Jahre)')).toHaveValue(7.5);
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
});

it('persists a cleared investment horizon instead of restoring the previous value', async () => {
  localStorage.setItem(ANALYSIS_PROFILE_KEY, JSON.stringify({ goal: 'growth', risk: 'medium', horizonYears: '10', buyBudget: '500' }));
  const first = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '' } });
  first.unmount();
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={null} />, { store: first.store }); });
  expect(screen.getByLabelText('Anlagedauer (Jahre)')).toHaveValue(null);
  expect(screen.getByLabelText('Anlageziel')).toHaveValue('growth');
  expect(screen.getByLabelText('Risikobereitschaft')).toHaveValue('medium');
  expect(screen.getByLabelText('Zusätzliches Kaufbudget (EUR)')).toHaveValue('0,00');
});


it('opens ChatGPT usage management through the external browser bridge', async () => {
  window.API.openPortfolioAnalysisSource = jest.fn().mockResolvedValue(undefined);
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  fireEvent.click(screen.getByRole('link', { name: 'ChatGPT-Nutzung verwalten' }));
  expect(window.API.openPortfolioAnalysisSource).toHaveBeenCalledWith('https://chatgpt.com/settings/usage');
});


it('separates informational messages from actionable warnings, including the saved quote note', async () => {
  const response = await window.API.analyzePortfolio({} as never);
  const quoteNote = 'Die Kurse aller Positionen besitzen einen quoteAsOf-Zeitpunkt; ein fehlender Kurszeitpunkt liegt nicht vor. Die US-Schlusskurse mit Status market-closed werden nicht allein wegen Börsenschluss oder Vorbörse beanstandet.';
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response,
    infos: ['Regulärer Schlusskurs'], warnings: [quoteNote, 'Bei einer Position fehlt quoteAsOf.'],
    recommendations: response.recommendations.map(rec => ({ ...rec, infos: ['Einzelanalyse abgeschlossen'], warnings: ['Kursdaten prüfen'] })),
  });
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const infos = screen.getAllByRole('region', { name: 'Infos' });
  const warnings = screen.getAllByRole('region', { name: 'Warnungen' });
  expect(infos[0]).toHaveClass('bg-sky-500/10');
  expect(within(infos[0]).getByText(quoteNote)).toBeInTheDocument();
  expect(within(infos[0]).getByText('Regulärer Schlusskurs')).toBeInTheDocument();
  expect(within(infos[0]).queryByText('Bei einer Position fehlt quoteAsOf.')).not.toBeInTheDocument();
  expect(warnings[0]).toHaveClass('bg-amber-500/10');
  expect(within(warnings[0]).getByText('Bei einer Position fehlt quoteAsOf.')).toBeInTheDocument();
  expect(within(warnings[0]).queryByText(quoteNote)).not.toBeInTheDocument();
  expect(within(infos[1]).getByText('Einzelanalyse abgeschlossen')).toBeInTheDocument();
  expect(within(warnings[1]).getByText('Kursdaten prüfen')).toBeInTheDocument();
});

it('omits empty info and warning sections', async () => {
  const response = await window.API.analyzePortfolio({} as never);
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response, infos: [], warnings: [] });
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(screen.getByRole('region', { name: 'Analyseergebnis' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Infos' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Warnungen' })).not.toBeInTheDocument();
});


it('waits for quotes and sends the refreshed holdings and snapshot to the analysis', async () => {
  const response = await window.API.analyzePortfolio({} as never);
  jest.mocked(window.API.analyzePortfolio).mockClear();
  let resolveQuote: (quote: unknown) => void;
  jest.mocked(window.API.sendToYahooFinanceAPI).mockImplementationOnce(() => new Promise(resolve => { resolveQuote = resolve; }));
  const held = [{ ...assets[0], symbol: 'STOCK', is_watched: false }];
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response, recommendations: [response.recommendations[0]] });
  const { store, unmount } = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets: held } });
  await open(); fillProfile();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(screen.getByRole('status')).toHaveTextContent('Kurse werden aktualisiert');
  expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  await act(async () => { resolveQuote({ source: 'yahoo-finance', price: { regularMarketPrice: 60, currency: 'EUR', regularMarketTime: '2026-10-08T08:05:52Z' } }); });
  expect(window.API.analyzePortfolio).toHaveBeenCalledTimes(1);
  const [request, snapshot] = jest.mocked(window.API.analyzePortfolio).mock.calls[0];
  expect(request.positions[0]).toMatchObject({ id: 1, price: 60, quote: { source: 'yahoo-finance', quoteAsOf: '2026-10-08T08:05:52.000Z' } });
  expect(JSON.parse(snapshot)).toEqual({ positions: request.positions, profile: { ...request.profile, horizonYears: '10', buyBudget: '0' }, priceUpdatedAt: request.priceUpdatedAt });
  expect(store.getState().portfolioAnalysis.resultSnapshot).toBe(snapshot);
  expect(request.priceUpdatedAt).toBe(localStorage.getItem(MARKET_PRICE_UPDATED_AT_KEY));
  unmount();
  await act(async () => { render(<PortfolioAnalysis priceUpdatedAt={request.priceUpdatedAt} />, { store }); });
  expect(screen.queryByText(/haben sich seit dieser Analyse/)).not.toBeInTheDocument();
});


it.each([true, false])('shows separate ELTIF broker price and NAV status (NAV evidenced: %s)', async evidenced => {
  const response = await window.API.analyzePortfolio({} as never);
  jest.mocked(window.API.analyzePortfolio).mockClear();
  const evidence = { isin: 'LU3170240538', value: 110, currency: 'USD', valuationDate: '2026-09-30', publicationCycle: 'Monthly', nextPublicationDue: '2026-10-31', sourceIndexes: [0] };
  jest.mocked(window.API.analyzePortfolio).mockResolvedValue({ ...response, recommendations: [{ ...response.recommendations[0], assetId: 32, sourceIndexes: [], navEvidence: evidenced ? evidence : null }] });
  const asset: Asset = { ...assets[0], ID: 32, type: 'Fund' as const, name: 'Apollo ELTIF', isin: 'LU3170240538', price: 109.395, quote: { originalPrice: 109.395, originalCurrency: 'EUR', valuationCurrency: 'EUR' as const, source: 'trade-republic', quoteAsOf: '2026-09-10T15:21:10Z', fetchedAt: '2026-10-05T10:22:22Z', convertedAt: null, fxRateToEUR: 1, fxSource: null, fxAsOf: null, fxFetchedAt: null } };
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T08:00:00Z'));
  try {
    const { store } = render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets: [asset] } });
    await open(); fillProfile();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
    const section = within(screen.getByRole('region', { name: 'Brokerpreis und NAV' }));
    expect(section.getByText('109.395 EUR je Anteil')).toBeInTheDocument();
    expect(section.getByText(/Brokerkursalter:/)).toHaveTextContent('Kein Nachweis eines veralteten NAV');
    expect(section.getByText(/NAV-Aktualit\u00e4t:/)).toHaveTextContent(evidenced ? 'Innerhalb des belegten Bewertungszyklus' : 'Ungekl\u00e4rt');
    expect(section.getByText(/Offizieller NAV:/)).toHaveTextContent(evidenced ? '110 USD' : 'nicht belegt');
    expect(store.getState().assets[0].price).toBe(109.395);
    if (evidenced) expect(screen.getAllByRole('link', { name: '[0] Report' })).toHaveLength(2);
  } finally { clock.mockRestore(); }
});
