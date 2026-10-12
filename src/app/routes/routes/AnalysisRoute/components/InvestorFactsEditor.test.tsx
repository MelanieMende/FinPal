import { act, fireEvent, screen, within } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import PortfolioAnalysis from './PortfolioAnalysis';
import { investorFactsStorageKey, readInvestorFacts, saveInvestorFacts } from '../../../../utils/investorFacts';

const assets = [{ ID: 31, name: 'Bitcoin', type: 'Crypto', symbol: 'BTC', isin: '', current_shares: 1, price: 100, currencySymbol: '€' }] as Asset[];
const transactions = [{ ID: 1, asset_ID: 31, date: '2025-01-01', type: 'Buy', amount: 1, price_per_share: 80 }] as Transaction[];
beforeEach(() => {
  localStorage.clear();
  window.API = { sendToDB: jest.fn(), sendToYahooFinanceAPI: jest.fn().mockResolvedValue(null),
    getPortfolioAIStatus: jest.fn().mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true,
      model: 'model', chatGpt: { connected: true, activeClientId: 'client', accounts: [] } }),
    getPortfolioChatGptModels: jest.fn().mockResolvedValue([{ slug: 'model', displayName: 'Model' }]),
    analyzePortfolio: jest.fn().mockResolvedValue({ summary: 'Summary', warnings: [], recommendations: [], sources: [], generatedAt: '2026-10-09T10:00:00Z', model: 'model', priceUpdatedAt: null }),
  };
});

it('applies one saved depot ownership to recognized products and keeps manual exceptions after remount', async () => {
  const knownAssets = [{ ...assets[0], isin: 'BTC', brokerProduct: { kind: 'direct-crypto', source: 'trade-republic', instrumentId: 'BTC', instrumentType: 'crypto' } },
    { ...assets[0], ID: 32, name: 'Bitcoin ETP', isin: 'ETP', brokerProduct: { kind: 'security', source: 'trade-republic', instrumentId: 'ETP', instrumentType: 'etp' } }] as Asset[];
  const first = render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets: knownAssets, transactions } });
  await act(async () => {});
  const btc = () => within(screen.getByTestId('investor-facts-31'));
  const etp = () => within(screen.getByTestId('investor-facts-32'));
  expect(btc().getByLabelText('Steuerlicher Kontext (eigene Angabe)')).toHaveValue('auto');
  fireEvent.change(screen.getByLabelText('Vermögenszuordnung für Trade Republic'), { target: { value: 'private' } });
  fireEvent.click(screen.getByRole('button', { name: 'Vermögenszuordnung für Trade Republic speichern' }));
  expect(btc().getByText(/Steuerlicher Kontext: Direkt gehaltene Kryptowerte im Privatvermögen/)).toBeInTheDocument();
  expect(etp().getByText(/Steuerlicher Kontext: Wertpapier im Privatvermögen/)).toBeInTheDocument();
  expect(within(btc().getByLabelText('Offene Angaben für Bitcoin')).queryByText('Steuerlicher Kontext')).not.toBeInTheDocument();
  fireEvent.change(btc().getByLabelText('Steuerlicher Kontext (eigene Angabe)'), { target: { value: 'unknown' } });
  fireEvent.click(btc().getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vermögenszuordnung für Trade Republic speichern' }));
  expect(btc().getByText(/Steuerlicher Kontext: Ungeklärt/)).toBeInTheDocument();
  expect(etp().getByText(/Steuerlicher Kontext: Wertpapier im Privatvermögen/)).toBeInTheDocument();
  first.unmount();
  render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { store: first.store });
  await act(async () => {});
  expect(screen.getByLabelText('Vermögenszuordnung für Trade Republic')).toHaveValue('private');
  expect(btc().getByLabelText('Steuerlicher Kontext (eigene Angabe)')).toHaveValue('unknown');
  expect(etp().getByLabelText('Steuerlicher Kontext (eigene Angabe)')).toHaveValue('auto');
  fireEvent.change(btc().getByLabelText('Steuerlicher Kontext (eigene Angabe)'), { target: { value: 'auto' } });
  fireEvent.click(btc().getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  // Refreshed broker data must reach the analysis even when the local category still says Crypto.
  window.API.getTradeRepublicQuotes = jest.fn().mockResolvedValue({ quotes: [
    { name: 'Bitcoin', isin: 'BTC', instrumentType: 'etp', quantity: 1, price: 100, averageBuyIn: 80, netValue: 100 },
    { name: 'Bitcoin ETP', isin: 'ETP', instrumentType: 'etp', quantity: 1, price: 100, averageBuyIn: 80, netValue: 100 },
  ] });
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'high' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const context = jest.mocked(window.API.analyzePortfolio).mock.calls[0][0].investorContext!;
  expect(context.assets[0].resolvedTaxContext).toMatchObject({ context: 'security', source: 'depot-and-product', product: { instrumentType: 'etp' } });
});

it('highlights missing saved asset facts in collapsed headings and clears the badge after shared and individual confirmations', async () => {
  const allAssets = [...assets, { ...assets[0], ID: 32, name: 'ETF', type: 'ETF' as const }];
  const allTrades = [transactions[0], { ...transactions[0], ID: 2, asset_ID: 32 }].map(t => ({ ...t, depot: 'Trade Republic' }));
  const facts = readInvestorFacts('', allAssets);
  facts.assets[32] = { ...facts.assets[32], taxContext: 'security', historyCoverage: 'complete', confirmedAt: '2026-10-09T10:00:00Z' };
  saveInvestorFacts('', facts);
  render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets: allAssets, transactions: allTrades } });
  await act(async () => {});
  const btc = () => within(screen.getByTestId('investor-facts-31'));
  const heading = () => screen.getByTestId('investor-facts-31').querySelector('summary')!;
  expect(heading()).toHaveTextContent('3 Angaben offen');
  expect(screen.getByTestId('investor-facts-31')).toHaveClass('border-amber-400/40');
  expect(screen.getByText('1 Asset mit offenen Angaben')).toBeInTheDocument();
  expect(screen.getByTestId('investor-facts-32').querySelector('summary')).toHaveTextContent('Asset-Angaben erfasst');
  const missing = within(btc().getByLabelText('Offene Angaben für Bitcoin'));
  expect(missing.getByText('Transaktionshistorie je Depot bestätigen')).toBeInTheDocument();
  expect(missing.getByText('Steuerlicher Kontext')).toBeInTheDocument();
  expect(missing.queryByText(/Zielgewicht|Spread/)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Transaktionshistorie für Trade Republic'), { target: { value: 'complete' } });
  fireEvent.click(screen.getByRole('button', { name: 'Historie für Trade Republic speichern' }));
  expect(heading()).toHaveTextContent('2 Angaben offen');
  fireEvent.change(btc().getByLabelText('Sonderaktivitäten'), { target: { value: 'none' } });
  fireEvent.change(btc().getByLabelText('Steuerlicher Kontext (eigene Angabe)'), { target: { value: 'private-direct-crypto' } });
  expect(heading()).toHaveTextContent('2 Angaben offen'); // Unsaved drafts must not appear complete.
  fireEvent.click(btc().getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  expect(heading()).toHaveTextContent('Asset-Angaben erfasst');
  expect(btc().queryByLabelText('Offene Angaben für Bitcoin')).not.toBeInTheDocument();
  expect(screen.queryByText('1 Asset mit offenen Angaben')).not.toBeInTheDocument();
});

it('confirms history once per depot, keeps asset exceptions, restores inheritance and sends resolved coverage after remount', async () => {
  const allAssets = [...assets, { ...assets[0], ID: 32, name: 'ETF' }];
  const allTrades = [transactions[0], { ...transactions[0], ID: 2, asset_ID: 32 }].map(t => ({ ...t, depot: 'Trade Republic' }));
  const first = render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets: allAssets, transactions: allTrades } });
  await act(async () => {});
  const depot = within(screen.getByTestId('depot-history-trade republic'));
  fireEvent.change(depot.getByLabelText('Transaktionshistorie für Trade Republic'), { target: { value: 'complete' } });
  fireEvent.click(depot.getByRole('button', { name: 'Historie für Trade Republic speichern' }));
  const btc = () => within(screen.getByTestId('investor-facts-31'));
  const etf = () => within(screen.getByTestId('investor-facts-32'));
  expect(btc().getByLabelText('Transaktionshistorie')).toHaveValue('inherit');
  expect(btc().getByText(/Vollständigkeit: Vollständig.*Depotbestätigung/)).toBeInTheDocument();
  expect(etf().getByText(/Vollständigkeit: Vollständig.*Depotbestätigung/)).toBeInTheDocument();
  fireEvent.change(btc().getByLabelText('Transaktionshistorie'), { target: { value: 'incomplete' } });
  fireEvent.click(btc().getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  expect(btc().getByText(/Vollständigkeit: Unvollständig/)).toBeInTheDocument();
  expect(etf().getByText(/Vollständigkeit: Vollständig/)).toBeInTheDocument();
  // Saving the shared confirmation again must not overwrite an explicit exception.
  fireEvent.click(screen.getByRole('button', { name: 'Historie für Trade Republic speichern' }));
  expect(btc().getByLabelText('Transaktionshistorie')).toHaveValue('incomplete');
  fireEvent.change(btc().getByLabelText('Transaktionshistorie'), { target: { value: 'inherit' } });
  fireEvent.click(btc().getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  first.unmount();
  await act(async () => { render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { store: first.store }); });
  expect(screen.getByLabelText('Transaktionshistorie für Trade Republic')).toHaveValue('complete');
  expect(btc().getByLabelText('Transaktionshistorie')).toHaveValue('inherit');
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'high' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const context = jest.mocked(window.API.analyzePortfolio).mock.calls[0][0].investorContext!;
  expect(context.assets).toHaveLength(2);
  context.assets.forEach(asset => expect(asset.acquisitionHistory).toMatchObject({ coverage: 'complete', coverageSource: 'depot' }));
});

it('allows normal analysis without a history confirmation', async () => {
  render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets, transactions } });
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'high' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  expect(window.API.analyzePortfolio).toHaveBeenCalledTimes(1);
  expect(jest.mocked(window.API.analyzePortfolio).mock.calls[0][0].investorContext?.assets[0].acquisitionHistory.coverage).toBe('unknown');
});

it('names only the assets needing review after a depot confirmation conflicts with their holdings', async () => {
  render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: {
    assets, transactions: [{ ...transactions[0], depot: 'Trade Republic', amount: 0.5 }],
  } });
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Transaktionshistorie für Trade Republic'), { target: { value: 'complete' } });
  fireEvent.click(screen.getByRole('button', { name: 'Historie für Trade Republic speichern' }));
  expect(screen.getByLabelText('Historienprüfung')).toHaveTextContent('Bitcoin');
  expect(screen.getByLabelText('Historienprüfung')).toHaveTextContent('Bestand');
});

it('persists confirmed residence, custody, history and target weights across route remounts and sends them to the AI', async () => {
  const first = render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets, transactions } });
  await act(async () => {});
  const editor = within(screen.getByTestId('durable-analysis-facts'));
  fireEvent.change(editor.getByLabelText('Steuerland (Ländercode)'), { target: { value: 'de' } });
  fireEvent.change(editor.getByLabelText('Gültig ab'), { target: { value: '2020-01-01' } });
  fireEvent.click(editor.getByRole('button', { name: 'Steuerwohnsitz speichern' }));
  const btc = within(screen.getByTestId('investor-facts-31'));
  expect(btc.getByLabelText('Verwahranbieter / Wallet')).toHaveValue('Trade Republic');
  expect(btc.getByText(/Erster Kauf: 2025-01-01/)).toBeInTheDocument();
  fireEvent.change(btc.getByLabelText('Transaktionshistorie'), { target: { value: 'complete' } });
  fireEvent.change(btc.getByLabelText('Sonderaktivitäten'), { target: { value: 'none' } });
  fireEvent.change(btc.getByLabelText('Steuerlicher Kontext (eigene Angabe)'), { target: { value: 'private-direct-crypto' } });
  fireEvent.change(btc.getByLabelText('Zielgewicht (%)'), { target: { value: '40' } });
  fireEvent.change(btc.getByLabelText('Untergrenze (%)'), { target: { value: '30' } });
  fireEvent.change(btc.getByLabelText('Obergrenze (%)'), { target: { value: '50' } });
  fireEvent.click(btc.getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  first.unmount();
  await act(async () => { render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { store: first.store }); });
  const restored = within(screen.getByTestId('investor-facts-31'));
  expect(restored.getByLabelText('Zielgewicht (%)')).toHaveValue('40');
  expect(restored.getByLabelText('Transaktionshistorie')).toHaveValue('complete');
  expect(screen.getByText(/DE · gültig ab 2020-01-01/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Anlageziel'), { target: { value: 'growth' } });
  fireEvent.change(screen.getByLabelText('Risikobereitschaft'), { target: { value: 'high' } });
  fireEvent.change(screen.getByLabelText('Anlagedauer (Jahre)'), { target: { value: '10' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
  const request = jest.mocked(window.API.analyzePortfolio).mock.calls[0][0];
  expect(request.investorContext).toMatchObject({ taxResidencies: [{ country: 'DE', validFrom: '2020-01-01' }],
    assets: [{ assetId: 31, custody: { provider: 'Trade Republic' }, targetWeight: { percent: 40, minPercent: 30, maxPercent: 50 },
      historyCoverage: 'complete', specialActivities: 'none', taxContext: 'private-direct-crypto',
      acquisitionHistory: { reconcilesWithHolding: true, remainingLots: [{ purchaseDate: '2025-01-01', quantity: 1 }] } }],
  });
});

it('keeps changed custody and fee uncertainty, rejects incomplete target ranges and isolates database settings', async () => {
  const first = render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets, transactions } });
  await act(async () => {});
  const btc = within(screen.getByTestId('investor-facts-31'));
  fireEvent.change(btc.getByLabelText('Verwahranbieter / Wallet'), { target: { value: 'Another broker' } });
  expect(btc.getByLabelText('Gebühr je regulärer Order (EUR)')).toHaveValue('');
  fireEvent.change(btc.getByLabelText('Zielgewicht (%)'), { target: { value: '40' } });
  fireEvent.click(btc.getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  expect(btc.getByRole('alert')).toHaveTextContent(/Untergrenze/);
  expect(readInvestorFacts('', assets).assets[31].custody.provider).toBe('Trade Republic');
  fireEvent.change(btc.getByLabelText('Zielgewicht (%)'), { target: { value: '' } });
  fireEvent.click(btc.getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
  expect(readInvestorFacts('', assets).assets[31].custody).toMatchObject({ provider: 'Another broker', orderFeeEUR: null });
  expect(localStorage.getItem(investorFactsStorageKey('other-db'))).toBeNull();
  first.unmount();
  expect(readInvestorFacts('other-db', assets).assets[31].custody.provider).toBe('Trade Republic');
});

it('reports storage failures without confirming a change or starting an analysis', async () => {
  render(<PortfolioAnalysis standalone priceUpdatedAt={null} />, { preloadedState: { assets, transactions } });
  await act(async () => {});
  const stored = localStorage.getItem(investorFactsStorageKey(''));
  const failSave = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  try {
    const btc = within(screen.getByTestId('investor-facts-31'));
    fireEvent.change(btc.getByLabelText('Verwahranbieter / Wallet'), { target: { value: 'Another broker' } });
    fireEvent.click(btc.getByRole('button', { name: 'Angaben für Bitcoin speichern' }));
    expect(screen.getByTestId('durable-analysis-facts')).toHaveTextContent('konnten nicht gespeichert werden');
    expect(screen.queryByText('Angaben dauerhaft gespeichert. Sie werden bei der nächsten Analyse berücksichtigt.')).not.toBeInTheDocument();
    expect(localStorage.getItem(investorFactsStorageKey(''))).toBe(stored);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse starten' })); });
    expect(window.API.analyzePortfolio).not.toHaveBeenCalled();
  } finally { failSave.mockRestore(); }
});
