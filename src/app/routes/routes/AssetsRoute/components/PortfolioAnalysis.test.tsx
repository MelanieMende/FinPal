import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import { setupStore } from '../../../../store';
import { analyzePortfolio } from '../../../../store/portfolioAnalysis/portfolioAnalysis.reducer';
import AssetList from './AssetList/AssetList';
import { buildAnalysisPositions } from '../../../../utils/portfolioAnalysis';
import PortfolioAnalysis, { ANALYSIS_PROFILE_KEY, ANALYSIS_MODEL_KEY } from './PortfolioAnalysis';

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
    getPortfolioAIStatus: jest.fn().mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true, model: 'api-model', chatGpt }),
    getPortfolioChatGptModels: jest.fn().mockResolvedValue([{ slug: 'account-model', displayName: 'Available model' }]),
    analyzePortfolio: jest.fn().mockResolvedValue({ summary: 'Diversifikation prüfen', warnings: ['Risiken berücksichtigen'], sources: [{ title: 'Report', url: 'https://example.com/report' }], generatedAt: '2026-10-02T10:00:00Z', priceUpdatedAt: null, model: 'account-model', recommendations: [
      { assetId: 1, action: 'Halten', rationale: 'Begründung', risk: 'Risiko', sourceIndexes: [0] },
      { assetId: 2, action: 'Prüfen', rationale: 'Mehr Daten nötig', risk: 'Volatilität', sourceIndexes: [] },
    ] }),
  };
});

async function open() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Portfolio analysieren' })); });
}
function fillProfile() {
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'medium' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Zusätzliches Kaufbudget (EUR)'), { target: { value: '100,50' } });
}

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
    provider: 'chatgpt', model: 'account-model', profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 100.5 },
    positions: [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 2 })],
  }), expect.any(String));
  expect(screen.getByText('Diversifikation prüfen')).toBeInTheDocument();
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
  const profile = { goal: 'growth', risk: 'medium', horizonYears: '10', buyBudget: '100,50' };
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
  expect(store.getState().portfolioAnalysis.progress?.stage).toBe('preparing');
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
  expect(screen.getByLabelText('Zusätzliches Kaufbudget (EUR)')).toHaveValue('500');
});


it('opens ChatGPT usage management through the external browser bridge', async () => {
  window.API.openPortfolioAnalysisSource = jest.fn().mockResolvedValue(undefined);
  render(<PortfolioAnalysis priceUpdatedAt={null} />, { preloadedState: { assets } });
  await open();
  fireEvent.click(screen.getByRole('link', { name: 'ChatGPT-Nutzung verwalten' }));
  expect(window.API.openPortfolioAnalysisSource).toHaveBeenCalledWith('https://chatgpt.com/settings/usage');
});
