import { act, fireEvent, screen } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import DividendForecastStatus from './DividendForecastStatus';
import { setAssets } from '../../../../store/assets/assets.reducer';
const asset = { ID: 1, name: 'Stock', symbol: 'STOCK', isin: 'US5801351017', type: 'Stock', current_shares: 1 } as Asset;
it('shows a provider failure and clears it after a successful retry', async () => {
  window.API = { sendToDB: jest.fn(), sendToDivvyDiaryAPI: jest.fn().mockRejectedValue(new Error('DivvyDiary requires an API key')) };
  const { store } = render(<DividendForecastStatus />, { preloadedState: { assets: [asset] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('DivvyDiary requires an API key');
  expect(screen.getByRole('alert')).toHaveTextContent('Bereits geladene Zahlungen bleiben sichtbar');
  jest.mocked(window.API.sendToDivvyDiaryAPI).mockResolvedValue({ currency: 'EUR', dividends: [] });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dividenden aktualisieren' })); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(store.getState().assets[0].dividendForecastError).toBeUndefined();
});


it('saves a key from the password field, clears it and immediately loads dividends', async () => {
  window.API = {
    sendToDB: jest.fn(),
    getDivvyDiaryStatus: jest.fn().mockResolvedValueOnce({ hasApiKey: false, secureStorageAvailable: true }).mockResolvedValue({ hasApiKey: true, secureStorageAvailable: true }),
    saveDivvyDiaryKey: jest.fn().mockResolvedValue(true),
    forgetDivvyDiaryKey: jest.fn().mockResolvedValue(true),
    sendToDivvyDiaryAPI: jest.fn().mockResolvedValue({ currency: 'EUR', dividends: [] }),
  };
  render(<DividendForecastStatus />, { preloadedState: { assets: [asset] } });
  const input = await screen.findByLabelText('DivvyDiary-API-Schl\u00fcssel');
  await screen.findByRole('button', { name: 'Schl\u00fcssel speichern und laden' });
  expect(window.API.sendToDivvyDiaryAPI).not.toHaveBeenCalled();
  expect(input).toHaveAttribute('type', 'password');
  await act(async () => { fireEvent.change(input, { target: { value: 'test-api-key' } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Schl\u00fcssel speichern und laden' })); });
  expect(window.API.saveDivvyDiaryKey).toHaveBeenCalledWith('test-api-key');
  expect(input).toHaveValue('');
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledWith({ isin: asset.isin });
  expect(screen.getByText('API-Schl\u00fcssel gespeichert.')).toBeInTheDocument();
  jest.mocked(window.API.getDivvyDiaryStatus).mockResolvedValue({ hasApiKey: false, secureStorageAvailable: true });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Schl\u00fcssel entfernen' })); });
  expect(window.API.forgetDivvyDiaryKey).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Dividenden aktualisieren' })).toBeDisabled();
});

it('disables key entry if OS encryption is unavailable', async () => {
  window.API = { sendToDB: jest.fn(), getDivvyDiaryStatus: jest.fn().mockResolvedValue({ hasApiKey: false, secureStorageAvailable: false }), sendToDivvyDiaryAPI: jest.fn() };
  render(<DividendForecastStatus />, { preloadedState: { assets: [asset] } });
  await screen.findByText(/Sichere Schl\u00fcsselspeicherung/);
  expect(screen.getByLabelText('DivvyDiary-API-Schl\u00fcssel')).toBeDisabled();
  expect(window.API.sendToDivvyDiaryAPI).not.toHaveBeenCalled();
});

it('ignores old errors from positions that are no longer queried', async () => {
  const inactive = { ...asset, ID: 2, name: 'Sold stock', current_shares: 0, current_shares_before_ex_date: 0, dividendForecastError: 'Old error' };
  const crypto: Asset = { ...asset, ID: 3, type: 'Crypto', dividendForecastError: 'Unsupported' };
  window.API = { sendToDB: jest.fn(), sendToDivvyDiaryAPI: jest.fn().mockResolvedValue({ currency: 'EUR', dividends: [] }) };
  const { store } = render(<DividendForecastStatus />, { preloadedState: { assets: [asset, inactive, crypto] } });
  await screen.findByRole('button', { name: 'Dividenden aktualisieren' });
  await act(async () => {});
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledTimes(1);
  expect(store.getState().assets.every(a => !a.dividendForecastError)).toBe(true);
});

it('identifies partial failures by asset and clears them on a successful retry', async () => {
  const second = { ...asset, ID: 2, name: 'Second stock', isin: 'US0378331005' };
  window.API = { sendToDB: jest.fn(), sendToDivvyDiaryAPI: jest.fn().mockImplementation(({ isin }) => isin === second.isin ? Promise.reject(new Error('HTTP 404')) : Promise.resolve({ currency: 'EUR', dividends: [] })) };
  render(<DividendForecastStatus />, { preloadedState: { assets: [asset, second] } });
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Dividendendaten konnten teilweise nicht aktualisiert werden.');
  expect(alert).toHaveTextContent('Second stock: HTTP 404');
  jest.mocked(window.API.sendToDivvyDiaryAPI).mockResolvedValue({ currency: 'EUR', dividends: [] });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dividenden aktualisieren' })); });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each([false, true])('does not reload or show a spinner on returning to the tab (failure: %s)', async (fails) => {
  window.API = {
    sendToDB: jest.fn(),
    getDivvyDiaryStatus: jest.fn().mockResolvedValue({ hasApiKey: true, secureStorageAvailable: true }),
    sendToDivvyDiaryAPI: fails ? jest.fn().mockRejectedValue(new Error('Provider unavailable')) : jest.fn().mockResolvedValue({ currency: 'EUR', dividends: [] }),
  };
  const first = render(<DividendForecastStatus />, { preloadedState: { assets: [asset] } });
  await act(async () => {});
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledTimes(1);
  first.unmount();
  render(<DividendForecastStatus />, { store: first.store });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => {});
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledTimes(1);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Dividenden aktualisieren' })); });
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledTimes(2);
});

it('loads only newly added positions automatically', async () => {
  window.API = { sendToDB: jest.fn(), getDivvyDiaryStatus: jest.fn().mockResolvedValue({ hasApiKey: true, secureStorageAvailable: true }), sendToDivvyDiaryAPI: jest.fn().mockResolvedValue({ currency: 'EUR', dividends: [] }) };
  const { store } = render(<DividendForecastStatus />, { preloadedState: { assets: [asset] } });
  await act(async () => {});
  await act(async () => { store.dispatch(setAssets([...store.getState().assets, { ...asset, ID: 2, isin: 'US0378331005' }])); });
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenCalledTimes(2);
  expect(window.API.sendToDivvyDiaryAPI).toHaveBeenLastCalledWith({ isin: 'US0378331005' });
});
