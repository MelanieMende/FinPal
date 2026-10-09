import { act, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import TradeRepublicTradeDialog from './TradeRepublicTradeDialog';
import type { TradePreview } from '../../../../utils/tradeRepublicTrading';
const asset = {ID: 1, name: 'Apple', isin: 'US0378331005', type: 'Stock'} as Asset;
const connected = {state: 'connected' as const, requiresCode: false, accounts: [{securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1', currency: 'EUR' as const}]};
const preview: TradePreview = {id: 'preview', draft: {isin: asset.isin, assetType: 'Stock' as const, side: 'buy' as const, quantity: 2, limit: 100, exchange: 'TIB', accountNumber: 'SEC1'}, expiresAt: new Date(Date.now() + 30000).toISOString(), price: 99, quoteAsOf: new Date().toISOString(), feesEUR: 1, limitValueEUR: 200, cashEUR: 1000, availableShares: 2, blockers: [], diagnostics: '{}'};
beforeEach(() => { preview.expiresAt = new Date(Date.now() + 30000).toISOString(); window.API = {sendToDB: jest.fn(), getTradeRepublicTradingStatus: jest.fn().mockResolvedValue(connected), previewTradeRepublicOrder: jest.fn().mockResolvedValue(preview), submitTradeRepublicOrder: jest.fn().mockResolvedValue({clientProcessId: 'process', previewId: 'preview', isin: asset.isin, side: 'buy', quantity: 2, accountNumber: 'SEC1', status: 'submitted', orderId: 'ORDER1', createdAt: new Date().toISOString()})}; });
async function openPreview(assets: Asset[] = [asset]) {
  render(<TradeRepublicTradeDialog assets={assets}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Trade Republic handeln'})); });
  fireEvent.change(screen.getByLabelText('Eingabe'), {target: {value: 'shares'}});
  fireEvent.change(screen.getByLabelText('Ganze Anteile'), {target: {value: '2'}});
  fireEvent.change(screen.getByLabelText('Limit je Anteil (EUR)'), {target: {value: '100,00'}});
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Ordervorschau laden'})); });
}
it('uses the broker preview, requires explicit confirmation and never books a local trade', async () => {
  await openPreview();
  expect(window.API.previewTradeRepublicOrder).toHaveBeenCalledWith(preview.draft);
  expect(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})).toBeDisabled();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})); });
  expect(window.API.submitTradeRepublicOrder).toHaveBeenCalledWith('preview', true);
  expect(screen.getByText(/Die Ausführung ist noch nicht bestätigt/)).toBeInTheDocument();
  expect(window.API.sendToDB).not.toHaveBeenCalled();
});
it('invalidates the preview and confirmation when order inputs change', async () => {
  await openPreview(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Aktion'), {target: {value: 'sell'}});
  expect(screen.queryByRole('button', {name: 'Kostenpflichtig kaufen'})).not.toBeInTheDocument();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
});
it('blocks submission for unknown broker data and excludes bonds and ELTIFs', async () => {
  jest.mocked(window.API.previewTradeRepublicOrder).mockResolvedValue({...preview, blockers: ['Gebühren fehlen']});
  await openPreview([asset, {...asset, ID: 2, name: 'Treasury', type: 'Bond'}, {...asset, ID: 3, name: 'Apollo ELTIF', type: 'Fund'}]);
  expect(screen.queryByRole('option', {name: /Treasury|Apollo ELTIF/})).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})).toBeDisabled();
});
it('does not submit on reconnect or merely opening the dialog', async () => {
  window.API.getTradeRepublicTradingStatus = jest.fn().mockResolvedValue({state: 'disconnected', requiresCode: false, accounts: []});
  window.API.connectTradeRepublicTrading = jest.fn().mockResolvedValue({state: 'confirmation-required', requiresCode: false, accounts: []});
  render(<TradeRepublicTradeDialog assets={[asset, {...asset, ID: 2, type: 'Bond'}, {...asset, ID: 3, type: 'Fund'}]}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Trade Republic handeln'})); });
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Mit Trade Republic verbinden'})); });
  expect(screen.getByRole('button', {name: 'Anmeldung bestätigt'})).toBeInTheDocument();
  expect(window.API.previewTradeRepublicOrder).not.toHaveBeenCalled();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
});

it.each(['buy', 'sell'])('defaults to a native EUR amount for %s and invalidates edits', async side => {
  const amountDraft = {isin: asset.isin, assetType: 'Stock' as const, side: side as 'buy' | 'sell', method: 'amount' as const, amountEUR: 50.25, exchange: 'TIB', accountNumber: 'SEC1'};
  jest.mocked(window.API.previewTradeRepublicOrder).mockResolvedValue({...preview, draft: amountDraft, estimatedShares: 0.507575, limitValueEUR: 50.25});
  render(<TradeRepublicTradeDialog assets={[asset]}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Trade Republic handeln'})); });
  expect(screen.queryByLabelText('Ganze Anteile')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Ausführung')).toHaveValue('best-price');
  expect(screen.queryByLabelText('Handelsplatz')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Aktion'), {target: {value: side}});
  fireEvent.change(screen.getByLabelText('Betrag (EUR)'), {target: {value: '50,25'}});
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Ordervorschau laden'})); });
  expect(window.API.previewTradeRepublicOrder).toHaveBeenCalledWith(amountDraft);
  expect(screen.getByText(/Ausführung zum Marktpreis, ohne Preislimit/)).toBeInTheDocument();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Betrag (EUR)'), {target: {value: '60'}});
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});

it('makes direct venue selection optional and invalidates the confirmed best-price preview', async () => {
  await openPreview(); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Ausführung'), {target: {value: 'direct'}});
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Handelsplatz')).toHaveValue('LSX');
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Ordervorschau laden'})); });
  expect(window.API.previewTradeRepublicOrder).toHaveBeenLastCalledWith({...preview.draft, exchange: 'LSX'});
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
});

it('toggles explicit confirmation by clicking its label and enables only the final button', async () => {
  await openPreview();
  const checkbox = screen.getByRole('checkbox');
  expect(checkbox).toBeEnabled();
  fireEvent.click(checkbox.closest('label')!);
  expect(checkbox).toBeChecked();
  expect(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})).toBeEnabled();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
  fireEvent.click(checkbox.closest('label')!);
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})).toBeDisabled();
});
it('explains expiration and re-enables confirmation only after a fresh preview and new consent', async () => {
  jest.useFakeTimers();
  try {
    await openPreview();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText(/Vorschau noch 30 Sekunden/)).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(31000); });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByText(/Bestätigung gesperrt: Die Vorschau ist abgelaufen/)).toBeInTheDocument();
    jest.mocked(window.API.previewTradeRepublicOrder).mockResolvedValue({...preview, id: 'fresh', expiresAt: new Date(Date.now() + 30000).toISOString()});
    await act(async () => { fireEvent.click(screen.getByRole('button', {name: 'Vorschau erneuern'})); });
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('button', {name: 'Kostenpflichtig kaufen'})).toBeDisabled();
    expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
it('rejects consent if the preview expires between timer ticks', async () => {
  jest.useFakeTimers();
  try {
    await openPreview();
    jest.setSystemTime(Date.parse(preview.expiresAt));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});
it('explains broker blockers beside the disabled confirmation', async () => {
  jest.mocked(window.API.previewTradeRepublicOrder).mockResolvedValue({...preview, blockers: ['Gebühren fehlen']});
  await openPreview();
  expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(/Zuerst die oben angezeigten Brokerhinweise beheben/);
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
});

it.each([false, true])('disconnects with forgetSession=%s and invalidates the order confirmation', async forgetSession => {
  window.API.disconnectTradeRepublicTrading = jest.fn().mockResolvedValue(true);
  await openPreview(); fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => { fireEvent.click(screen.getByRole('button', {name: forgetSession ? 'Sitzung l\u00f6schen' : 'Verbindung trennen'})); });
  if (forgetSession) expect(window.API.disconnectTradeRepublicTrading).toHaveBeenCalledWith(true);
  else expect(window.API.disconnectTradeRepublicTrading).toHaveBeenCalledWith();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(window.API.submitTradeRepublicOrder).not.toHaveBeenCalled();
});
